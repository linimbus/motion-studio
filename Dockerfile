# syntax=docker/dockerfile:1
# =====================================================================
# Motion Studio 动效工坊 —— 多阶段构建
#   阶段 1: Node 构建 React 前端 (frontend/ → dist)
#   阶段 2: Python 运行时，FastAPI 服务 + 托管前端 + MCP (/mcp)
# 构建:  docker build -t motion-studio:latest .
# 运行:  docker run -d -p 8000:8000 -v motion-studio-data:/data motion-studio:latest
# =====================================================================

# ---------------- 阶段 1：前端构建 ----------------
FROM node:20-alpine AS frontend-builder
# 国内网络可去掉注释或用 --build-arg 覆盖
ARG NPM_REGISTRY=https://registry.npmmirror.com

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN if [ -f package-lock.json ]; then \
      npm ci --registry=$NPM_REGISTRY --no-audit --no-fund; \
    else \
      npm install --registry=$NPM_REGISTRY --no-audit --no-fund; \
    fi
COPY frontend/ ./
RUN npm run build

# ---------------- 阶段 2：运行时 ----------------
FROM python:3.12-slim
# 国内网络可去掉注释或用 --build-arg 覆盖
ARG PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    # 数据库落在挂载卷内，容器重建不丢数据
    MOTION_DB_PATH=/data/motion_studio.db \
    # 容器场景放开 MCP Host 校验（如需收紧可改为具体 host 列表，如 "example.com:*,localhost:*"）
    MCP_ALLOWED_HOSTS=*

WORKDIR /app

# 先装依赖（利用层缓存）
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -i $PIP_INDEX_URL -r /app/backend/requirements.txt

# 拷贝后端代码与前端构建产物（保持 main.py 中 frontend/dist 的相对路径结构）
COPY backend/ /app/backend/
COPY --from=frontend-builder /build/dist /app/frontend/dist

# 数据卷挂载点
RUN mkdir -p /data
VOLUME /data

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=8s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/projects', timeout=4).status == 200 else 1)"

WORKDIR /app/backend
CMD ["python", "main.py"]
