"""Motion Studio MCP 服务 —— 让 AI 智能体直接操作动效工程

传输协议：Streamable HTTP，挂载路径 /mcp
工具覆盖：工程管理、元素增删、关键帧编辑、动作预设应用、导出
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from db import ProjectModel, SessionLocal
from actions import ACTION_CATALOG, apply_action_to_project

# 服务绑定在动态 IPv6 地址上（地址会随网络变化），因此放行本机与局域网访问。
# 如需收紧安全策略，可通过环境变量 MCP_ALLOWED_HOSTS 指定逗号分隔的允许 Host。
import os

_extra = [h.strip() for h in os.environ.get("MCP_ALLOWED_HOSTS", "").split(",") if h.strip()]
# MCP_ALLOWED_HOSTS 含 "*" 时关闭 Host 校验（容器/网关部署场景，请自行评估安全风险）
_disable_protection = "*" in _extra

mcp = FastMCP(
    "motion-studio",
    instructions=(
        "Motion Studio 动效工坊：通过 MCP 工具创建和管理动效工程。"
        "典型流程：list_projects → create_project → add_element → apply_action / set_keyframe。"
        "时间轴以「帧」为单位，默认每帧 1 秒；动作预设(preset)会自动生成关键帧。"
        "注意：网页端正在编辑同一工程时会自动保存并可能覆盖外部修改，"
        "MCP 修改后请在网页中重新打开该工程查看。"
    ),
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=not _disable_protection,
        allowed_hosts=[
            "localhost:*", "127.0.0.1:*", "[::1]:*",
            "motion-studio.local:*",
            *_extra,
        ],
        allowed_origins=[
            "http://localhost:*", "http://127.0.0.1:*", "http://[::1]:*",
            "http://motion-studio.local:*",
        ],
    ),
)


# ------------------------------------------------------------------ DB 辅助
def _summary(row: ProjectModel) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _full(row: ProjectModel) -> dict:
    data = json.loads(row.data)
    data["id"] = row.id
    data["name"] = row.name
    return data


def _load(db, project_id: int) -> ProjectModel:
    row = db.get(ProjectModel, project_id)
    if not row:
        raise ValueError(f"工程 {project_id} 不存在")
    return row


def _save(db, row: ProjectModel, project: dict) -> None:
    data = {k: v for k, v in project.items() if k != "id"}
    row.name = str(project.get("name") or row.name)
    row.data = json.dumps(data, ensure_ascii=False)
    db.commit()


def _dump(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2, default=str)


# ------------------------------------------------------------------ 工程
@mcp.tool()
def list_projects() -> str:
    """列出所有动效工程（返回 id、名称、更新时间）"""
    with SessionLocal() as db:
        return _dump([_summary(r) for r in db.query(ProjectModel).order_by(ProjectModel.updated_at.desc()).all()])


@mcp.tool()
def get_project(project_id: int) -> str:
    """获取工程完整数据（画布、全部元素与关键帧）"""
    with SessionLocal() as db:
        return _dump(_full(_load(db, project_id)))


@mcp.tool()
def create_project(name: str = "未命名项目") -> str:
    """创建新动效工程（可指定名称），返回完整工程数据"""
    from main import DEFAULT_PROJECT

    data = json.loads(json.dumps(DEFAULT_PROJECT))
    data["name"] = name.strip() or "未命名项目"
    data["elements"] = []
    with SessionLocal() as db:
        row = ProjectModel(name=data["name"], data=json.dumps(data, ensure_ascii=False))
        db.add(row)
        db.commit()
        db.refresh(row)
        return _dump(_full(row))


@mcp.tool()
def delete_project(project_id: int) -> str:
    """删除指定工程（不可恢复）"""
    with SessionLocal() as db:
        row = _load(db, project_id)
        db.delete(row)
        db.commit()
    return f"工程 {project_id} 已删除"


@mcp.tool()
def set_project_meta(
    project_id: int,
    name: Optional[str] = None,
    frame_count: Optional[int] = None,
    frame_duration: Optional[float] = None,
    canvas_width: Optional[int] = None,
    canvas_height: Optional[int] = None,
    background: Optional[str] = None,
) -> str:
    """修改工程元信息：名称 / 总帧数(2-60) / 每帧秒数 / 画布宽高 / 背景色(#RRGGBB)"""
    with SessionLocal() as db:
        row = _load(db, project_id)
        p = json.loads(row.data)
        if name is not None:
            p["name"] = name.strip() or p.get("name", "未命名项目")
        if frame_count is not None:
            p["frameCount"] = max(2, min(60, int(frame_count)))
        if frame_duration is not None:
            p["frameDuration"] = float(frame_duration)
        p.setdefault("canvas", {})
        if canvas_width is not None:
            p["canvas"]["width"] = max(120, min(2000, int(canvas_width)))
        if canvas_height is not None:
            p["canvas"]["height"] = max(120, min(2000, int(canvas_height)))
        if background is not None:
            p["canvas"]["background"] = background
        _save(db, row, p)
        return _dump(_full(row))


@mcp.tool()
def export_project(project_id: int) -> str:
    """导出工程为 .motion.json 格式文本（可直接保存为文件，稍后可导入）"""
    with SessionLocal() as db:
        return _dump(json.loads(_load(db, project_id).data))


# ------------------------------------------------------------------ 元素
@mcp.tool()
def list_elements(project_id: int) -> str:
    """列出工程内全部元素：id、类型、名称、尺寸、关键帧数、绑定文字"""
    with SessionLocal() as db:
        p = json.loads(_load(db, project_id).data)
    out = []
    for e in p.get("elements", []):
        out.append({
            "id": e.get("id"), "type": e.get("type"), "name": e.get("name"),
            "width": e.get("width"), "height": e.get("height"),
            "keyframes": len(e.get("keyframes") or []),
            "text": (e.get("text") or {}).get("content"),
        })
    return _dump(out)


@mcp.tool()
def add_element(
    project_id: int,
    type: str,
    x: int = 480,
    y: int = 270,
    name: Optional[str] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
    color: str = "#6366f1",
    text_content: Optional[str] = None,
    text_font_size: int = 24,
) -> str:
    """向工程添加元素。type: rect|circle|triangle|star|text；(x,y) 为画布中心坐标；
    text_content 可选，文字将绑定到元素上。返回新元素 id。"""
    import uuid

    if type not in ("rect", "circle", "triangle", "star", "text"):
        raise ValueError("type 必须是 rect/circle/triangle/star/text")
    default_size = {
        "rect": (160, 100), "circle": (110, 110), "triangle": (120, 110),
        "star": (120, 120), "text": (240, 64),
    }[type]
    with SessionLocal() as db:
        row = _load(db, project_id)
        p = json.loads(row.data)
        el = {
            "id": f"el-{uuid.uuid4().hex[:10]}",
            "type": type,
            "name": name or f"元素 {len(p.get('elements', [])) + 1}",
            "width": int(width or default_size[0]),
            "height": int(height or default_size[1]),
            "text": (
                {"content": text_content, "fontSize": int(text_font_size), "color": "#ffffff", "bold": False}
                if (text_content or type == "text") else None
            ),
            "keyframes": [{
                "frame": 0, "x": int(x), "y": int(y), "scale": 1, "rotate": 0,
                "rotate_x": 0, "rotate_y": 0, "skew_x": 0, "skew_y": 0, "blur": 0,
                "opacity": 1, "color": color, "easing": "easeInOut",
            }],
        }
        if type == "text" and not text_content:
            el["text"] = {"content": "文字", "fontSize": 24, "color": "#e2e8f0", "bold": False}
        p.setdefault("elements", []).append(el)
        _save(db, row, p)
        return f"已添加元素 {el['name']} (id={el['id']})，可在网页中查看。"


@mcp.tool()
def remove_element(project_id: int, element_id: str) -> str:
    """从工程中删除指定元素"""
    with SessionLocal() as db:
        row = _load(db, project_id)
        p = json.loads(row.data)
        before = len(p.get("elements", []))
        p["elements"] = [e for e in p.get("elements", []) if e.get("id") != element_id]
        if len(p["elements"]) == before:
            raise ValueError(f"元素 {element_id} 不存在")
        _save(db, row, p)
        return f"元素 {element_id} 已删除"


@mcp.tool()
def set_element_text(
    project_id: int,
    element_id: str,
    content: Optional[str] = None,
    font_size: Optional[int] = None,
    color: Optional[str] = None,
    bold: Optional[bool] = None,
    unbind: bool = False,
) -> str:
    """设置元素绑定的文字（内容/字号/颜色/加粗）；unbind=True 解除文字绑定"""
    with SessionLocal() as db:
        row = _load(db, project_id)
        p = json.loads(row.data)
        el = next((e for e in p.get("elements", []) if e.get("id") == element_id), None)
        if not el:
            raise ValueError(f"元素 {element_id} 不存在")
        if unbind:
            el["text"] = None
        else:
            t = el.get("text") or {"content": "", "fontSize": 24, "color": "#ffffff", "bold": False}
            if content is not None:
                t["content"] = content
            if font_size is not None:
                t["fontSize"] = max(8, int(font_size))
            if color is not None:
                t["color"] = color
            if bold is not None:
                t["bold"] = bool(bold)
            el["text"] = t
        _save(db, row, p)
        return f"元素 {element_id} 文字已更新"


# ------------------------------------------------------------------ 关键帧
@mcp.tool()
def set_keyframe(
    project_id: int,
    element_id: str,
    frame: int,
    x: Optional[float] = None,
    y: Optional[float] = None,
    scale: Optional[float] = None,
    rotate: Optional[float] = None,
    rotate_x: Optional[float] = None,
    rotate_y: Optional[float] = None,
    skew_x: Optional[float] = None,
    skew_y: Optional[float] = None,
    blur: Optional[float] = None,
    opacity: Optional[float] = None,
    color: Optional[str] = None,
    easing: Optional[str] = None,
    text: Optional[str] = None,
) -> str:
    """在指定帧记录/更新元素关键帧（未提供的属性保持该帧现值或插值）。
    easing 控制进入该帧的过渡，可选: linear|easeIn|easeOut|easeInOut|circOut|backOut|anticipate；
    text 为该帧显示的文字内容（覆盖元素默认文字，未指定帧继承默认）"""
    from actions import sample_element

    if easing is not None and easing not in ("linear", "easeIn", "easeOut", "easeInOut", "circOut", "backOut", "anticipate"):
        raise ValueError("不支持的 easing")
    with SessionLocal() as db:
        row = _load(db, project_id)
        p = json.loads(row.data)
        el = next((e for e in p.get("elements", []) if e.get("id") == element_id), None)
        if not el:
            raise ValueError(f"元素 {element_id} 不存在")
        existing = next((k for k in el.get("keyframes") or [] if k.get("frame") == frame), None)
        base = dict(existing) if existing else sample_element(el, frame)
        patch = {
            "x": x, "y": y, "scale": scale, "rotate": rotate,
            "rotate_x": rotate_x, "rotate_y": rotate_y, "skew_x": skew_x, "skew_y": skew_y,
            "blur": blur, "opacity": opacity, "color": color, "text": text,
        }
        for k, v in patch.items():
            if v is not None:
                base[k] = v
        base["frame"] = frame
        base["easing"] = easing or base.get("easing", "easeInOut")
        kf_map = {k.get("frame", 0): k for k in (el.get("keyframes") or [])}
        kf_map[frame] = base
        el["keyframes"] = sorted(kf_map.values(), key=lambda k: k.get("frame", 0))
        _save(db, row, p)
        return f"已记录元素 {element_id} 第 {frame + 1} 帧关键帧"


@mcp.tool()
def delete_keyframe(project_id: int, element_id: str, frame: int) -> str:
    """删除元素在指定帧的关键帧（至少保留 1 个）"""
    with SessionLocal() as db:
        row = _load(db, project_id)
        p = json.loads(row.data)
        el = next((e for e in p.get("elements", []) if e.get("id") == element_id), None)
        if not el:
            raise ValueError(f"元素 {element_id} 不存在")
        kfs = el.get("keyframes") or []
        if len(kfs) <= 1:
            return "该元素只剩 1 个关键帧，不可删除"
        el["keyframes"] = [k for k in kfs if k.get("frame") != frame]
        _save(db, row, p)
        return f"已删除第 {frame + 1} 帧关键帧"


# ------------------------------------------------------------------ 动作预设
@mcp.tool()
def list_actions() -> str:
    """列出所有可用的动作预设（含参数说明）"""
    return _dump(ACTION_CATALOG)


@mcp.tool()
def apply_action(
    project_id: int,
    element_id: str,
    action: str,
    start_frame: int = 0,
    duration: int = 2,
    direction: str = "left",
    distance: Optional[int] = None,
    color: str = "#f472b6",
) -> str:
    """为元素应用动作预设，自动生成关键帧。
    action 见 list_actions（fadeIn/fadeOut/zoomIn/zoomOut/bounceIn/slideIn/rotateIn/flipIn/pulse/float/shake/spin/colorShift）；
    direction: slideIn 用 left|right|top|bottom，bounceIn 用 top|bottom|left|right，flipIn 用 x|y；
    distance 位移距离；color 为 colorShift 的闪变目标色。start_frame 为起始帧（0 起）。"""
    with SessionLocal() as db:
        row = _load(db, project_id)
        p = json.loads(row.data)
        try:
            p2 = apply_action_to_project(p, element_id, action, start_frame, duration, direction, distance, color)
        except ValueError as e:
            raise ValueError(str(e))
        _save(db, row, p2)
        el = next(e for e in p2["elements"] if e.get("id") == element_id)
        return (
            f"已为元素「{el.get('name')}」应用动作 {action}"
            f"（第 {start_frame + 1} 帧起，时长 {max(1, int(duration))} 帧），"
            f"当前共 {len(el.get('keyframes') or [])} 个关键帧。在网页中重新打开工程即可预览。"
        )
