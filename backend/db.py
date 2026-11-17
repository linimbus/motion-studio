"""数据库模型与会话 —— 供 REST 与 MCP 共用"""
import os
from pathlib import Path

from sqlalchemy import Column, DateTime, Integer, String, Text, create_engine, func
from sqlalchemy.orm import declarative_base, sessionmaker

BASE_DIR = Path(__file__).resolve().parent
# 容器部署时通过 MOTION_DB_PATH 指定挂载卷中的路径以持久化数据
DB_PATH = Path(os.environ.get("MOTION_DB_PATH") or (BASE_DIR / "motion_studio.db"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


class ProjectModel(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False, default="未命名项目")
    data = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
