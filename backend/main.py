"""Motion Studio 后端 —— FastAPI + SQLite 项目管理服务

REST: /api/projects*（工程 CRUD、导入导出）、/api/actions（动作预设）
MCP : /mcp（Streamable HTTP，见 mcp_server.py）
静态: 托管 frontend/dist
"""
import contextlib
import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from urllib.parse import quote

from db import ProjectModel, SessionLocal
from actions import ACTION_CATALOG, apply_action_to_project
from mcp_server import mcp as mcp_instance

# ---------------------------------------------------------------- 默认工程模板
DEFAULT_PROJECT = {
    "name": "示例项目",
    "frameCount": 6,
    "frameDuration": 1,
    "canvas": {"width": 960, "height": 540, "background": "#0f172a"},
    "elements": [
        {
            "id": "el-card",
            "type": "rect",
            "name": "标题卡片",
            "width": 240,
            "height": 96,
            "text": {"content": "Motion Studio", "fontSize": 26, "color": "#ffffff", "bold": True},
            "keyframes": [
                {"frame": 0, "x": 480, "y": 270, "scale": 0.2, "rotate": 0, "rotate_x": 0, "rotate_y": 180, "skew_x": 0, "skew_y": 0, "blur": 6, "opacity": 0, "color": "#6366f1", "easing": "easeInOut"},
                {"frame": 2, "x": 480, "y": 210, "scale": 1, "rotate": 0, "rotate_x": 0, "rotate_y": 0, "skew_x": 0, "skew_y": 0, "blur": 0, "opacity": 1, "color": "#8b5cf6", "easing": "easeInOut"},
                {"frame": 5, "x": 480, "y": 210, "scale": 1, "rotate": 0, "rotate_x": 0, "rotate_y": 0, "skew_x": 0, "skew_y": 0, "blur": 0, "opacity": 1, "color": "#38bdf8", "easing": "easeInOut"},
            ],
        },
        {
            "id": "el-ball",
            "type": "circle",
            "name": "弹跳小球",
            "width": 90,
            "height": 90,
            "text": None,
            "keyframes": [
                {"frame": 0, "x": 120, "y": 110, "scale": 1, "rotate": 0, "rotate_x": 0, "rotate_y": 0, "skew_x": 0, "skew_y": 0, "blur": 0, "opacity": 1, "color": "#f472b6", "easing": "backOut"},
                {"frame": 3, "x": 830, "y": 430, "scale": 1.5, "rotate": 180, "rotate_x": 0, "rotate_y": 0, "skew_x": 0, "skew_y": 0, "blur": 0, "opacity": 1, "color": "#fbbf24", "easing": "easeInOut"},
                {"frame": 5, "x": 120, "y": 110, "scale": 1, "rotate": 360, "rotate_x": 0, "rotate_y": 0, "skew_x": 0, "skew_y": 0, "blur": 0, "opacity": 1, "color": "#f472b6", "easing": "easeInOut"},
            ],
        },
        {
            "id": "el-star",
            "type": "star",
            "name": "旋转星星",
            "width": 110,
            "height": 110,
            "text": None,
            "keyframes": [
                {"frame": 1, "x": 820, "y": 130, "scale": 0.1, "rotate": 0, "rotate_x": 0, "rotate_y": 0, "skew_x": 0, "skew_y": 0, "blur": 0, "opacity": 0, "color": "#fbbf24", "easing": "anticipate"},
                {"frame": 2, "x": 780, "y": 160, "scale": 1, "rotate": 90, "rotate_x": 0, "rotate_y": 0, "skew_x": 0, "skew_y": 0, "blur": 0, "opacity": 1, "color": "#fbbf24", "easing": "easeInOut"},
                {"frame": 4, "x": 200, "y": 420, "scale": 1, "rotate": 270, "rotate_x": 0, "rotate_y": 0, "skew_x": 0, "skew_y": 0, "blur": 0, "opacity": 1, "color": "#34d399", "easing": "easeInOut"},
            ],
        },
        {
            "id": "el-slogan",
            "type": "text",
            "name": "副标题文字",
            "width": 320,
            "height": 56,
            "text": {"content": "让创意动起来 ✦", "fontSize": 28, "color": "#e2e8f0", "bold": False},
            "keyframes": [
                {"frame": 3, "x": 480, "y": 380, "scale": 0.8, "rotate": 0, "rotate_x": 0, "rotate_y": 0, "skew_x": 0, "skew_y": 0, "blur": 10, "opacity": 0, "color": "#e2e8f0", "text": "让创意动起来 ✦", "easing": "circOut"},
                {"frame": 4, "x": 480, "y": 390, "scale": 1, "rotate": 0, "rotate_x": 0, "rotate_y": 0, "skew_x": 0, "skew_y": 0, "blur": 0, "opacity": 1, "color": "#e2e8f0", "text": "每一帧都能换文字 ✦", "easing": "easeInOut"},
            ],
        },
    ],
}


def _default_project(name: str) -> dict:
    p = json.loads(json.dumps(DEFAULT_PROJECT))
    p["name"] = name
    return p


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


def _validate_project(data: dict) -> None:
    if not isinstance(data, dict) or not isinstance(data.get("elements"), list):
        raise HTTPException(status_code=400, detail="非法的工程文件：缺少 elements 字段")
    if not isinstance(data.get("frameCount"), int) or data["frameCount"] < 1:
        raise HTTPException(status_code=400, detail="非法的工程文件：frameCount 不合法")


class ProjectCreate(BaseModel):
    name: str = "未命名项目"


class ProjectSave(BaseModel):
    name: str = "未命名项目"
    frameCount: int = 6
    frameDuration: float = 1
    canvas: dict = {}
    elements: list = []


class ActionApplyBody(BaseModel):
    elementId: str
    action: str
    startFrame: int = 0
    duration: int = 2
    direction: str = "left"
    distance: int | None = None
    color: str = "#f472b6"


# ---------------------------------------------------------------- 生命周期（MCP 会话管理）
@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    async with mcp_instance.session_manager.run():
        yield


app = FastAPI(title="Motion Studio API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------- 项目 CRUD
@app.get("/api/projects")
def list_projects():
    with SessionLocal() as db:
        rows = db.query(ProjectModel).order_by(ProjectModel.updated_at.desc()).all()
        return [_summary(r) for r in rows]


@app.post("/api/projects")
def create_project(body: ProjectCreate):
    data = _default_project(body.name.strip() or "未命名项目")
    with SessionLocal() as db:
        row = ProjectModel(name=data["name"], data=json.dumps(data, ensure_ascii=False))
        db.add(row)
        db.commit()
        db.refresh(row)
        return _full(row)


@app.get("/api/projects/{pid}")
def get_project(pid: int):
    with SessionLocal() as db:
        row = db.get(ProjectModel, pid)
        if not row:
            raise HTTPException(status_code=404, detail="工程不存在")
        return _full(row)


@app.put("/api/projects/{pid}")
def save_project(pid: int, body: ProjectSave):
    with SessionLocal() as db:
        row = db.get(ProjectModel, pid)
        if not row:
            raise HTTPException(status_code=404, detail="工程不存在")
        data = body.model_dump()
        data.pop("id", None)
        _validate_project(data)
        row.name = body.name.strip() or row.name
        row.data = json.dumps(data, ensure_ascii=False)
        db.commit()
        return {"ok": True, "updated_at": row.updated_at.isoformat() if row.updated_at else None}


@app.delete("/api/projects/{pid}")
def delete_project(pid: int):
    with SessionLocal() as db:
        row = db.get(ProjectModel, pid)
        if not row:
            raise HTTPException(status_code=404, detail="工程不存在")
        db.delete(row)
        db.commit()
        return {"ok": True}


# ---------------------------------------------------------------- 导入 / 导出
@app.post("/api/projects/import")
def import_project(body: dict):
    _validate_project(body)
    body.pop("id", None)
    with SessionLocal() as db:
        row = ProjectModel(
            name=str(body.get("name") or "导入的工程")[:200],
            data=json.dumps(body, ensure_ascii=False),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return _full(row)


@app.get("/api/projects/{pid}/export")
def export_project(pid: int):
    with SessionLocal() as db:
        row = db.get(ProjectModel, pid)
        if not row:
            raise HTTPException(status_code=404, detail="工程不存在")
        # RFC 5987：非 ASCII 文件名需用 filename* 编码传递
        filename = quote(f"{row.name}.motion.json")
        return JSONResponse(
            content=json.loads(row.data),
            headers={
                "Content-Disposition": f"attachment; filename=project.motion.json; filename*=UTF-8''{filename}"
            },
        )


# ---------------------------------------------------------------- 动作预设接口
@app.get("/api/actions")
def list_actions():
    """动作预设目录：前端与 MCP 均可消费"""
    return ACTION_CATALOG


@app.post("/api/projects/{pid}/actions/apply")
def apply_action_endpoint(pid: int, body: ActionApplyBody):
    """对工程内指定元素应用动作预设（服务端生成关键帧并保存）"""
    with SessionLocal() as db:
        row = db.get(ProjectModel, pid)
        if not row:
            raise HTTPException(status_code=404, detail="工程不存在")
        p = json.loads(row.data)
        try:
            p = apply_action_to_project(
                p, body.elementId, body.action,
                start_frame=body.startFrame, duration=body.duration,
                direction=body.direction, distance=body.distance, color=body.color,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        _validate_project(p)
        row.data = json.dumps(p, ensure_ascii=False)
        db.commit()
        db.refresh(row)
        return _full(row)


# ---------------------------------------------------------------- 托管前端静态资源 + MCP
DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    @app.get("/")
    def index():
        return FileResponse(DIST_DIR / "index.html")

# MCP（Streamable HTTP）挂载在 /mcp —— 挂在根路径，但前面已注册的 /api 与静态路由优先生效
app.mount("/", mcp_instance.streamable_http_app())

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
