# Motion Studio · 动效工坊

一个前后端分离的**关键帧动效编辑器**：在浏览器里摆放形状与文字元素，按帧编排它们的位置、缩放、旋转、颜色、模糊等变化，一键播放预览，并支持工程管理、导入导出，以及 **MCP 智能体接口** —— 让 AI 也能直接创建和编排动效。

## 功能特性

### 编辑器

- **元素系统**：矩形、圆形、三角形、星形、独立文字元素
- **文字绑定**：文字可与形状元素绑定，跟随元素一起移动/旋转/缩放
- **逐帧文字**：每个关键帧可设定独立的文字内容（阶梯式切换，适合做字幕/台词）
- **关键帧时间轴**：以「帧」为单位（默认 1 秒/帧，可调 0.25 / 0.5 / 1 / 2 秒），支持增删帧、逐帧步进
- **逐帧动效属性**：位置、缩放、2D 旋转、**3D 旋转 X/Y**（翻转）、**倾斜 X/Y**、透明度、**颜色渐变**（hex 插值）、**高斯模糊**
- **7 种缓动**：线性 / 缓入 / 缓出 / 缓入缓出 / 圆形缓出 / 回弹 / 预备
- **动作预设**：13 种一键动效（淡入淡出、缩放、弹跳、滑入、旋转、3D 翻转、脉冲、漂浮、抖动、旋转一周、颜色闪变），自动生成关键帧
- **画布直接拖拽**：拖动元素自动在当前帧记录关键帧
- **图层管理**、**撤销重做**（⌘Z / ⌘⇧Z）、**自动保存**（0.9s 防抖）
- **快捷键**：空格播放、方向键逐帧步进

### 工程管理

- 新建 / 重命名 / 删除 / 切换工程
- 导出为 `.motion.json` 文件，从文件导入为新工程

### 智能体接口（MCP + REST）

- **MCP**：14 个工具（工程 / 元素 / 文字 / 关键帧 / 动作 / 导出），Streamable HTTP 协议，可供 Claude、WorkBuddy 等 AI 客户端直接调用
- **REST**：完整项目 CRUD + 动作目录与应用接口

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vite 5 + React 18 + TypeScript 5 + [Motion v12](https://motion.dev/)（播放用 `animate()` 驱动，UI 微动效用 `motion/react`） |
| 后端 | Python FastAPI + SQLAlchemy 2 + SQLite |
| 智能体 | [MCP](https://modelcontextprotocol.io/)（mcp SDK 1.x，FastMCP，Streamable HTTP） |
| 部署 | Docker 多阶段构建（node:20-alpine → python:3.12-slim） |

## 快速开始

### 方式一：本地运行

```bash
# 1. 构建前端
cd frontend
npm install --cache /tmp/npm-cache   # npm 缓存目录有权限问题时用 --cache 指定
npm run build

# 2. 启动后端（自动托管 frontend/dist 静态资源）
cd ../backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
```

打开 http://127.0.0.1:8000 即可使用（首次会自动创建带演示动效的「示例项目」）。

**前端开发模式**（热更新）：

```bash
cd frontend
npm run dev    # 5173 端口，/api 已代理到 8000
```

### 方式二：Docker 一键部署

```bash
./build.sh              # 构建镜像并启动（等价于下方两条命令）
# 或手动：
docker compose up -d --build
```

`build.sh` 支持的子命令：

```bash
./build.sh              # 构建并启动（默认）
./build.sh build        # 仅构建镜像
./build.sh stop         # 停止容器
./build.sh restart      # 重启
./build.sh logs         # 查看日志
./build.sh status       # 查看状态
./build.sh clean        # 停止并删除容器/镜像/数据卷
PORT=9000 ./build.sh    # 换端口启动
```

容器特性：

- 数据库持久化到 Docker 卷 `motion-studio-data`（容器重建数据不丢）
- 内置健康检查（`/api/projects`）
- 默认走国内镜像源（npmmirror / tuna），海外构建用 `--build-arg` 覆盖
- 镜像构建参数：`NPM_REGISTRY`、`PIP_INDEX_URL`、`PORT`

## 配置项（环境变量）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `MOTION_DB_PATH` | `backend/motion_studio.db` | SQLite 数据库路径（容器内挂 `/data`） |
| `MCP_ALLOWED_HOSTS` | （仅 localhost） | MCP DNS 重绑定防护白名单；`*` 关闭校验（容器场景）；否则填逗号分隔的 host 列表 |

> IPv6 / 局域网部署示例：
> `MCP_ALLOWED_HOSTS="[2409:8a56::1]:*,2409:8a56::1" uvicorn main:app --host "2409:8a56::1" --port 8000`

## REST API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects` | 工程列表 |
| POST | `/api/projects` | 新建工程（可传完整工程 JSON） |
| GET | `/api/projects/{id}` | 工程详情 |
| PUT | `/api/projects/{id}` | 保存工程 |
| DELETE | `/api/projects/{id}` | 删除工程 |
| GET | `/api/projects/{id}/export` | 导出为 `.motion.json` 下载 |
| POST | `/api/projects/import` | 导入工程 JSON 为新工程 |
| GET | `/api/actions` | 13 种动作预设目录 |
| POST | `/api/projects/{id}/actions/apply` | 对元素应用动作，服务端生成关键帧 |

动作应用示例：

```bash
curl -X POST http://127.0.0.1:8000/api/projects/1/actions/apply \
  -H 'Content-Type: application/json' \
  -d '{"elementId":"el-ball","action":"shake","startFrame":0,"duration":3}'
```

## MCP 接口

端点：`http://<host>:8000/mcp`（Streamable HTTP，JSON-RPC over SSE）

**14 个工具**：

| 分类 | 工具 |
|---|---|
| 工程 | `list_projects` / `get_project` / `create_project` / `delete_project` / `set_project_meta` / `export_project` |
| 元素 | `list_elements` / `add_element` / `remove_element` / `set_element_text` |
| 关键帧 | `set_keyframe` / `delete_keyframe` |
| 动作 | `list_actions` / `apply_action` |

典型调用流程：`create_project` → `add_element` → `apply_action` / `set_keyframe` → `export_project`。

`set_keyframe` 支持 `x/y/scale/rotate/rotate_x/rotate_y/skew_x/skew_y/blur/opacity/color/easing/text`，其中 `text` 为该帧的文字内容覆盖。

在支持 MCP 的客户端（如 WorkBuddy）中注册：

```json
{
  "mcpServers": {
    "motion-studio": {
      "url": "http://127.0.0.1:8000/mcp"
    }
  }
}
```

> 注意：网页端打开的工程有自动保存，MCP 修改同一工程后需在网页中重新打开该工程，避免互相覆盖。

## 项目结构

```
motion-studio/
├── Dockerfile              # 多阶段构建（前端编译 + Python 运行时）
├── docker-compose.yml      # 声明式部署
├── build.sh                # 一键构建/运行/管理脚本
├── backend/
│   ├── main.py             # FastAPI 入口：REST 接口 + MCP 挂载 + 静态托管
│   ├── db.py               # SQLAlchemy 模型与会话
│   ├── actions.py          # 13 种动作预设 + 关键帧插值采样
│   ├── mcp_server.py       # FastMCP 服务（14 个工具）
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.tsx         # 编辑器主布局 + 播放控制
    │   ├── store.tsx       # 状态管理（含撤销重做历史栈）
    │   ├── types.ts        # 工程/元素/关键帧类型定义
    │   ├── api.ts          # 后端 API 客户端
    │   ├── lib/
    │   │   ├── anim.ts     # 帧插值采样（含颜色插值、逐帧文字阶梯）
    │   │   └── actions.ts  # 前端动作预设（与后端逻辑对齐）
    │   └── components/
    │       ├── Stage.tsx   # 画布（拖拽编辑 + 3D/模糊渲染）
    │       ├── Timeline.tsx# 关键帧时间轴
    │       ├── LeftPanel.tsx # 元素库与图层
    │       ├── RightPanel.tsx# 属性编辑 + 动作预设
    │       └── TopBar.tsx  # 工程管理/播放控制/导入导出
    └── vite.config.ts      # dev 代理 /api → 8000
```

## 数据格式（.motion.json）

```jsonc
{
  "name": "示例项目",
  "frameCount": 5,          // 总帧数
  "frameDuration": 1,       // 每帧时长（秒）
  "canvas": { "width": 960, "height": 540, "background": "#0f172a" },
  "elements": [
    {
      "id": "el-ball",
      "type": "circle",     // rect | circle | triangle | star | text
      "name": "小球",
      "x": 480, "y": 270, "width": 80, "height": 80,
      "color": "#f59e0b",
      "text": {             // 可选：文字绑定 / 文字元素的内容
        "content": "默认文字", "fontSize": 24, "bold": false, "color": "#ffffff"
      },
      "keyframes": [
        {
          "frame": 0,
          "x": 200, "y": 400, "scale": 1, "rotate": 0,
          "rotateX": 0, "rotateY": 0,     // 3D 旋转（可选）
          "skewX": 0, "skewY": 0,         // 倾斜（可选）
          "blur": 0,                      // 高斯模糊（可选）
          "opacity": 1, "color": "#f59e0b",
          "easing": "easeOut",            // 进入该帧的过渡缓动
          "text": "该帧文字覆盖"           // 逐帧文字（可选，缺省继承默认）
        }
      ]
    }
  ]
}
```

## 开发说明

- **插值算法**：位置/缩放/旋转等数值线性插值，颜色做 hex → RGB 插值，文字采用阶梯式切换；缓动函数前后端共用同一套定义（`backend/actions.py` ↔ `frontend/src/lib/anim.ts`）
- **兼容性**：关键帧的 v2/v3 扩展字段（3D 旋转、倾斜、模糊、逐帧文字）均为可选字段，旧工程数据直接兼容，无需迁移
- **播放实现**：使用 Motion 的 `animate(0, N-1, {duration, repeat})` 驱动浮点帧播放头，采样函数对任意浮点帧取值

## License

MIT
