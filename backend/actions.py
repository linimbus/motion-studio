"""动作预设系统：生成关键帧的核心逻辑（与前端 src/lib/actions.ts 保持一致）

每个关键帧支持的属性（v2 新增 rotate_x / rotate_y / skew_x / skew_y / blur）：
  frame, x, y, scale, rotate, rotate_x, rotate_y, skew_x, skew_y, blur,
  opacity, color, easing
easing 记录在「到达关键帧」上，即它控制进入该帧那一段过渡的缓动。
"""
from __future__ import annotations

import math
from typing import Any, Optional

# ------------------------------------------------------------------ 缓动（与前端一致）
def _ease(name: str, t: float) -> float:
    t = min(1.0, max(0.0, t))
    if name == "easeIn":
        return t * t
    if name == "easeOut":
        return -(t * (t - 2))
    if name == "easeInOut":
        return 2 * t * t if t < 0.5 else -2 * t * t + 4 * t - 1
    if name == "circOut":
        return math.sqrt(1 - (t - 1) * (t - 1))
    if name == "backOut":
        s = 1.70158
        return (t - 1) * (t - 1) * ((s + 1) * (t - 1) + s) + 1
    if name == "anticipate":
        t *= 2
        if t < 1:
            return 0.5 * t * t * t
        t -= 2
        return 0.5 * (t * t * t + 2)
    return t  # linear


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = (hex_color or "#888888").lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        n = int(h[:6], 16)
    except ValueError:
        n = 0x888888
    return (n >> 16) & 255, (n >> 8) & 255, n & 255


def _lerp_color(a: str, b: str, t: float) -> str:
    ca, cb = _hex_to_rgb(a), _hex_to_rgb(b)
    return "#{:02x}{:02x}{:02x}".format(
        round(ca[0] + (cb[0] - ca[0]) * t),
        round(ca[1] + (cb[1] - ca[1]) * t),
        round(ca[2] + (cb[2] - ca[2]) * t),
    )


KF_DEFAULTS = {
    "x": 0, "y": 0, "scale": 1, "rotate": 0,
    "rotate_x": 0, "rotate_y": 0, "skew_x": 0, "skew_y": 0, "blur": 0,
    "opacity": 1, "color": "#6366f1",
}


def _fill(kf: dict) -> dict:
    # 保留 KF_DEFAULTS 之外的字段（如 v3 的 per-frame text 覆盖），避免应用动作时丢失
    return {**KF_DEFAULTS, **kf}


def _sampled_from(kf: dict, frame: float) -> dict:
    """以某关键帧为基准的采样结果：剔除 text（文字覆盖由前端阶梯逻辑单独处理，
    避免动作预设把继承文字固化到新关键帧上）"""
    d = _fill(kf)
    d["frame"] = frame
    d.pop("text", None)
    return d


def sample_element(el: dict, frame: float) -> dict:
    """在任意浮点帧时刻对元素属性插值采样（不含 text）"""
    kfs = sorted(el.get("keyframes") or [], key=lambda k: k.get("frame", 0))
    if not kfs:
        return {**KF_DEFAULTS, "frame": frame, "easing": "easeInOut"}
    if frame <= kfs[0].get("frame", 0):
        return _sampled_from(kfs[0], frame)
    if frame >= kfs[-1].get("frame", 0):
        return _sampled_from(kfs[-1], frame)
    for i in range(len(kfs) - 1):
        if kfs[i].get("frame", 0) <= frame < kfs[i + 1].get("frame", 0):
            a, b = _fill(kfs[i]), _fill(kfs[i + 1])
            raw = (frame - a["frame"]) / max(1e-6, b["frame"] - a["frame"])
            t = _ease(b.get("easing", "linear"), raw)
            out = {"frame": frame, "easing": b.get("easing", "linear")}
            for k, dv in KF_DEFAULTS.items():
                if k == "color":
                    out[k] = _lerp_color(a[k], b[k], t)
                else:
                    out[k] = a[k] + (b[k] - a[k]) * t
            return out
    return _sampled_from(kfs[-1], frame)


# ------------------------------------------------------------------ 动作目录
ACTION_CATALOG: list[dict[str, Any]] = [
    {"id": "fadeIn", "label": "淡入", "description": "透明度 0 → 1", "directions": [], "defaultDistance": None, "usesColor": False, "minDuration": 1},
    {"id": "fadeOut", "label": "淡出", "description": "透明度 1 → 0", "directions": [], "defaultDistance": None, "usesColor": False, "minDuration": 1},
    {"id": "zoomIn", "label": "放大入场", "description": "从 0 放大到 1 并淡入（回弹）", "directions": [], "defaultDistance": None, "usesColor": False, "minDuration": 1},
    {"id": "zoomOut", "label": "缩小入场", "description": "从 2 倍缩小到 1 并淡入", "directions": [], "defaultDistance": None, "usesColor": False, "minDuration": 1},
    {"id": "bounceIn", "label": "弹跳入场", "description": "从指定方向弹入并带回弹效果", "directions": ["top", "bottom", "left", "right"], "defaultDistance": 240, "usesColor": False, "minDuration": 1},
    {"id": "slideIn", "label": "滑入", "description": "从指定方向滑入并淡入", "directions": ["left", "right", "top", "bottom"], "defaultDistance": 240, "usesColor": False, "minDuration": 1},
    {"id": "rotateIn", "label": "旋转入场", "description": "旋转 360° 从 0 放大入场", "directions": [], "defaultDistance": None, "usesColor": False, "minDuration": 1},
    {"id": "flipIn", "label": "翻转入场", "description": "绕 X 或 Y 轴 3D 翻转入场", "directions": ["x", "y"], "defaultDistance": None, "usesColor": False, "minDuration": 1},
    {"id": "pulse", "label": "脉冲缩放", "description": "放大再回落的脉冲效果", "directions": [], "defaultDistance": None, "usesColor": False, "minDuration": 2},
    {"id": "float", "label": "上下漂浮", "description": "上浮再回落", "directions": [], "defaultDistance": 60, "usesColor": False, "minDuration": 2},
    {"id": "shake", "label": "抖动", "description": "带衰减的左右抖动", "directions": [], "defaultDistance": None, "usesColor": False, "minDuration": 1},
    {"id": "spin", "label": "旋转一周", "description": "原地旋转 360°", "directions": [], "defaultDistance": None, "usesColor": False, "minDuration": 1},
    {"id": "colorShift", "label": "颜色闪变", "description": "闪变到目标色再回来", "directions": [], "defaultDistance": None, "usesColor": True, "minDuration": 2},
]

_ACTION_IDS = {a["id"] for a in ACTION_CATALOG}


def _dir_offset(direction: str, distance: int) -> tuple[float, float]:
    return {
        "left": (-distance, 0), "right": (distance, 0),
        "top": (0, -distance), "bottom": (0, distance),
    }.get(direction, (-distance, 0))


def build_action_keyframes(
    el: dict,
    action: str,
    start_frame: int = 0,
    duration: int = 2,
    direction: str = "left",
    distance: Optional[int] = None,
    color: str = "#f472b6",
) -> list[dict]:
    """返回需要 upsert 的关键帧列表（同帧覆盖、跨帧保留其他属性）"""
    if action not in _ACTION_IDS:
        raise ValueError(f"未知动作: {action}，可用动作见 ACTION_CATALOG")

    catalog = next(a for a in ACTION_CATALOG if a["id"] == action)
    duration = max(catalog["minDuration"], int(duration))
    end = start_frame + duration
    if distance is None:
        distance = catalog["defaultDistance"] or 240

    def base_kf(frame: int) -> dict:
        existing = next((k for k in el.get("keyframes") or [] if k.get("frame") == frame), None)
        if existing:
            return {**_fill(existing), "frame": frame, "easing": existing.get("easing", "easeInOut")}
        s = sample_element(el, frame)
        return {**s, "frame": frame, "easing": "easeInOut"}

    def b(frame: int, **patch) -> dict:
        return {**base_kf(frame), **patch}

    base = sample_element(el, start_frame)
    mid = start_frame + round(duration / 2)

    if action == "fadeIn":
        return [b(start_frame, opacity=0), b(end, opacity=1, easing="easeOut")]
    if action == "fadeOut":
        return [b(start_frame, opacity=1), b(end, opacity=0, easing="easeIn")]
    if action == "zoomIn":
        return [b(start_frame, scale=0, opacity=0), b(end, scale=1, opacity=1, easing="backOut")]
    if action == "zoomOut":
        return [b(start_frame, scale=2, opacity=0), b(end, scale=1, opacity=1, easing="easeOut")]
    if action == "bounceIn":
        dx, dy = _dir_offset(direction, distance)
        return [
            b(start_frame, x=base["x"] + dx, y=base["y"] + dy, scale=0.6, opacity=0),
            b(end, x=base["x"], y=base["y"], scale=1, opacity=1, easing="backOut"),
        ]
    if action == "slideIn":
        dx, dy = _dir_offset(direction, distance)
        return [
            b(start_frame, x=base["x"] + dx, y=base["y"] + dy, opacity=0),
            b(end, x=base["x"], y=base["y"], opacity=1, easing="easeOut"),
        ]
    if action == "rotateIn":
        return [
            b(start_frame, rotate=base["rotate"] - 360, scale=0, opacity=0),
            b(end, rotate=base["rotate"], scale=1, opacity=1, easing="circOut"),
        ]
    if action == "flipIn":
        if direction == "y":
            return [
                b(start_frame, rotate_y=(base["rotate_y"] or 0) - 180, opacity=0),
                b(end, rotate_y=0, opacity=1, easing="easeInOut"),
            ]
        return [
            b(start_frame, rotate_x=(base["rotate_x"] or 0) - 180, opacity=0),
            b(end, rotate_x=0, opacity=1, easing="easeInOut"),
        ]
    if action == "pulse":
        kfs = [b(start_frame, scale=base["scale"])]
        if mid not in (start_frame, end):
            kfs.append(b(mid, scale=base["scale"] * 1.35, easing="easeInOut"))
        kfs.append(b(end, scale=base["scale"], easing="easeInOut"))
        return kfs
    if action == "float":
        kfs = [b(start_frame, y=base["y"])]
        if mid not in (start_frame, end):
            kfs.append(b(mid, y=base["y"] - distance, easing="easeInOut"))
        kfs.append(b(end, y=base["y"], easing="easeInOut"))
        return kfs
    if action == "shake":
        n = end - start_frame
        kfs = []
        for i in range(n + 1):
            decay = 1 - i / max(1, n)
            off = 14 * (1 if i % 2 == 0 else -1) * decay
            kfs.append(b(start_frame + i, rotate=base["rotate"] + off,
                         skew_x=(base["skew_x"] or 0) + off * 0.6, easing="linear"))
        return kfs
    if action == "spin":
        return [b(start_frame, rotate=base["rotate"]),
                b(end, rotate=base["rotate"] + 360, easing="easeInOut")]
    if action == "colorShift":
        kfs = [b(start_frame, color=base["color"])]
        if mid not in (start_frame, end):
            kfs.append(b(mid, color=color, easing="easeInOut"))
        kfs.append(b(end, color=base["color"], easing="easeInOut"))
        return kfs
    raise ValueError(f"动作 {action} 未实现")


def apply_action_to_element(
    el: dict,
    action: str,
    start_frame: int = 0,
    duration: int = 2,
    direction: str = "left",
    distance: Optional[int] = None,
    color: str = "#f472b6",
) -> dict:
    """对元素应用动作预设，返回新元素（不修改原对象）"""
    new_kfs = build_action_keyframes(el, action, start_frame, duration, direction, distance, color)
    kf_map = {k.get("frame", 0): _fill(k) | {"frame": k.get("frame", 0), "easing": k.get("easing", "easeInOut")}
              for k in (el.get("keyframes") or [])}
    for k in new_kfs:
        kf_map[k["frame"]] = k
    merged = sorted(kf_map.values(), key=lambda k: k["frame"])
    return {**el, "keyframes": merged}


def apply_action_to_project(
    project: dict,
    element_id: str,
    action: str,
    start_frame: int = 0,
    duration: int = 2,
    direction: str = "left",
    distance: Optional[int] = None,
    color: str = "#f472b6",
) -> dict:
    """对工程内指定元素应用动作预设，返回新工程 dict（找到元素才修改）"""
    elements = project.get("elements") or []
    if element_id not in {e.get("id") for e in elements}:
        raise ValueError(f"元素不存在: {element_id}")
    return {
        **project,
        "elements": [
            apply_action_to_element(e, action, start_frame, duration, direction, distance, color)
            if e.get("id") == element_id else e
            for e in elements
        ],
    }
