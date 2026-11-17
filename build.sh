#!/usr/bin/env bash
# =====================================================================
# Motion Studio 一键构建 & 运行脚本
#
# 用法:
#   ./build.sh            # 构建镜像并启动（默认动作）
#   ./build.sh build      # 仅构建镜像
#   ./build.sh run        # 启动容器（镜像不存在时自动构建）
#   ./build.sh stop       # 停止并移除容器
#   ./build.sh restart    # 重启容器
#   ./build.sh logs       # 查看容器日志
#   ./build.sh status     # 查看容器状态
#   ./build.sh clean      # 停止容器并删除镜像（数据卷保留）
#
# 可配置环境变量:
#   IMAGE=motion-studio   镜像名
#   TAG=latest            镜像标签
#   PORT=8000             宿主机端口
#   NPM_REGISTRY=...      npm 镜像源（默认国内源，海外设为 https://registry.npmjs.org）
#   PIP_INDEX_URL=...     pip 镜像源（默认阿里云源，海外设为 https://pypi.org/simple）
# =====================================================================
set -euo pipefail

IMAGE="${IMAGE:-motion-studio}"
TAG="${TAG:-latest}"
PORT="${PORT:-8000}"
CONTAINER="motion-studio"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"
PIP_INDEX_URL="${PIP_INDEX_URL:-https://mirrors.aliyun.com/pypi/simple}"

cd "$(dirname "$0")"

info()  { printf "\033[36m[INFO]\033[0m %s\n" "$*"; }
ok()    { printf "\033[32m[ OK ]\033[0m %s\n" "$*"; }
warn()  { printf "\033[33m[WARN]\033[0m %s\n" "$*"; }
die()   { printf "\033[31m[FAIL]\033[0m %s\n" "$*" >&2; exit 1; }

require_docker() {
  command -v docker >/dev/null 2>&1 || die "未找到 docker 命令，请先安装 Docker: https://docs.docker.com/get-docker/"
  docker info >/dev/null 2>&1 || die "Docker 守护进程未运行，请先启动 Docker Desktop"
}

image_exists()   { docker image inspect "$IMAGE:$TAG" >/dev/null 2>&1; }
container_up()   { [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || echo false)" = "true" ]; }

do_build() {
  info "构建镜像 $IMAGE:$TAG（前端 React + 后端 FastAPI 多阶段构建）…"
  docker build \
    --build-arg NPM_REGISTRY="$NPM_REGISTRY" \
    --build-arg PIP_INDEX_URL="$PIP_INDEX_URL" \
    -t "$IMAGE:$TAG" .
  ok "镜像构建完成: $IMAGE:$TAG"
}

do_run() {
  if container_up; then
    warn "容器 $CONTAINER 已在运行，先停止旧实例…"
    do_stop
  fi
  if ! image_exists; then
    warn "镜像不存在，先自动构建…"
    do_build
  fi
  info "启动容器（端口 $PORT → 8000，数据卷 motion-studio-data 持久化数据库）…"
  docker run -d \
    --name "$CONTAINER" \
    -p "$PORT:8000" \
    -e MOTION_DB_PATH=/data/motion_studio.db \
    -e MCP_ALLOWED_HOSTS='*' \
    -v motion-studio-data:/data \
    --restart unless-stopped \
    "$IMAGE:$TAG" >/dev/null

  # 等待健康检查通过（最多 30 秒）
  info "等待服务就绪…"
  for i in $(seq 1 30); do
    if [ "$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo starting)" = "healthy" ]; then
      break
    fi
    sleep 1
  done

  ok "服务已启动 🎉"
  echo ""
  echo "  ┌──────────────────────────────────────────────"
  echo "  │ 网页编辑器 : http://localhost:$PORT/"
  echo "  │ MCP 接口   : http://localhost:$PORT/mcp"
  echo "  │ REST API   : http://localhost:$PORT/api/projects"
  echo "  │ 数据持久化 : 卷 motion-studio-data → /data/motion_studio.db"
  echo "  └──────────────────────────────────────────────"
  echo ""
}

do_stop() {
  if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    docker rm -f "$CONTAINER" >/dev/null
    ok "容器 $CONTAINER 已停止并移除"
  else
    warn "容器 $CONTAINER 不存在，无需停止"
  fi
}

do_logs()    { container_up || die "容器未运行"; docker logs -f --tail 100 "$CONTAINER"; }
do_status()  { docker ps -a --filter "name=^${CONTAINER}$" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"; }
do_clean()   { do_stop; docker image rm -f "$IMAGE:$TAG" >/dev/null 2>&1 && ok "镜像 $IMAGE:$TAG 已删除" || warn "镜像不存在"; info "数据卷 motion-studio-data 已保留（如需彻底删除: docker volume rm motion-studio-data）"; }

case "${1:-build-and-run}" in
  build)         require_docker; do_build ;;
  run|start)     require_docker; do_run ;;
  stop)          require_docker; do_stop ;;
  restart)       require_docker; do_stop; do_run ;;
  logs)          require_docker; do_logs ;;
  status)        require_docker; do_status ;;
  clean)         require_docker; do_clean ;;
  build-and-run) require_docker; do_build; do_run ;;
  *)
    sed -n '2,20p' "$0"; exit 1 ;;
esac
