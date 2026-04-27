# 01 — 架构与目录结构

## 1. 技术栈（最终决定，不再变更）

| 层 | 选型 | 版本约束 |
|---|------|---------|
| 包管理 | pnpm + workspaces | pnpm ≥ 9 |
| 运行时 | Node.js | ≥ 20.10（原生支持 `--watch`） |
| Server 框架 | Express 5 | — |
| WebSocket | `ws` | ^8 |
| 数据库 | SQLite via `better-sqlite3` | ^11 |
| 共享类型 | TypeScript | ^5.5 |
| Client 框架 | Next.js（App Router） | ^15 |
| UI | React 19 + Tailwind CSS | — |
| 图表 | 不引入图表库（v1 用纯 div + Tailwind 实现泳道） | — |
| Lint/Format | Biome | ^1.9（一个工具替代 ESLint + Prettier） |

**为什么不用 Bun**：保持单一运行时（Node），减少环境复杂度。Server 性能不是瓶颈。

**为什么不用图表库**：泳道图本质就是横向滚动的色块，用 CSS Grid + 绝对定位足够，
引 Recharts/Visx 反而过重。如果未来要做 pulse chart 再考虑。

---

## 2. 仓库目录结构

```
agent-obs/
├── package.json                  # workspace root，定义 scripts
├── pnpm-workspace.yaml           # workspaces 定义
├── biome.json                    # 共享 lint 配置
├── tsconfig.base.json            # 共享 TS 配置
├── .gitignore
├── .nvmrc                        # 锁 Node 版本
├── README.md                     # 用户向 README（怎么跑）
├── docs/                         # 本文档目录（开发参考）
│   ├── 00-README.md
│   ├── 01-architecture.md
│   ├── 02-event-schema.md
│   └── 03-ui-spec.md
│
├── packages/
│   └── shared/                   # 共享类型（client 和 server 都引用）
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts          # 导出所有类型
│           ├── events.ts         # AgentEvent, HookEventType, ...
│           └── agents.ts         # AGENT_NAMES, AGENT_COLORS
│
├── apps/
│   ├── server/                   # 事件总线
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts          # 启动 HTTP + WebSocket
│   │   │   ├── http.ts           # Express 路由
│   │   │   ├── ws.ts             # WebSocket 广播
│   │   │   ├── db.ts             # SQLite 初始化 + 查询
│   │   │   ├── infer-agent.ts    # 从 payload 推断 agent_name
│   │   │   └── env.ts            # 环境变量读取（PORT 等）
│   │   └── data/                 # SQLite 文件目录（gitignored）
│   │       └── events.db
│   │
│   └── client/                   # Next.js Dashboard
│       ├── package.json
│       ├── next.config.ts
│       ├── tsconfig.json
│       ├── tailwind.config.ts
│       ├── postcss.config.mjs
│       ├── public/
│       └── src/
│           ├── app/
│           │   ├── layout.tsx    # 根布局，Tailwind dark mode
│           │   ├── page.tsx      # Dashboard 主页（唯一页面）
│           │   └── globals.css
│           ├── components/
│           │   ├── SwimlaneView.tsx    # 主视图：Agent 泳道
│           │   ├── EventStream.tsx     # 副视图：事件流
│           │   ├── FilterPanel.tsx     # 顶部过滤面板
│           │   ├── EventDetailModal.tsx # 点击块弹出详情
│           │   ├── ConnectionStatus.tsx # 右上角连接指示
│           │   └── AgentBadge.tsx      # 复用：彩色 agent 名徽章
│           ├── hooks/
│           │   ├── useEventStream.ts   # WebSocket + 历史拉取
│           │   ├── useFilters.ts       # 过滤状态管理
│           │   └── useColors.ts        # 颜色哈希函数
│           ├── lib/
│           │   ├── api.ts              # fetch /events/recent
│           │   └── format.ts           # 时间、字段格式化
│           └── types.ts                # 重新导出 @agent-obs/shared
│
└── hooks/                        # Claude Code hook 脚本（拷贝到目标项目用）
    ├── send-event.js             # 通用事件发送器
    ├── settings.template.json    # .claude/settings.json 模板
    └── README.md                 # 如何在你的项目里启用 hooks
```

### 几个关键设计点

- **`packages/shared`** 是 client 和 server 共享类型的桥。事件 schema 改一处，两边都更新。
- **`hooks/`** 不在 `apps/` 下，因为它不是一个"app"，是给**其他项目**复制过去用的脚本。
- **`apps/server/data/`** 用 gitignore，但目录本身要有 `.gitkeep`。
- Hook 脚本必须用 `.js`（不用 TS），目标项目可能没有 TS 工具链，纯 Node 能跑最稳。

---

## 3. 数据流（端到端）

```
┌────────────────────────────────────────────────────────────────┐
│                    被观测项目（任意目录）                       │
│                                                                │
│   Claude Code 主进程                                           │
│        │                                                       │
│        │ 触发 hook (PreToolUse/SubagentStart/...)              │
│        ▼                                                       │
│   .claude/settings.json 里挂的命令：                            │
│   node /path/to/hooks/send-event.js \                          │
│        --source-app=my-project --event-type=PreToolUse         │
│        │                                                       │
│        │ Claude Code 把事件 JSON 通过 stdin 灌进去             │
│        ▼                                                       │
│   send-event.js：读 stdin → POST → exit 0                      │
└────────┬───────────────────────────────────────────────────────┘
         │ HTTP POST
         │ http://localhost:4000/events
         ▼
┌────────────────────────────────────────────────────────────────┐
│                    apps/server （永远在跑）                     │
│                                                                │
│   Express                                                      │
│   ├─ POST /events                                              │
│   │   1. 校验 envelope 字段                                    │
│   │   2. 调 inferAgent(payload) 算出 agent_name                │
│   │   3. INSERT 到 events 表                                   │
│   │   4. broadcast 给所有 WebSocket client                     │
│   │   5. 立即返回 {ok:true}（不阻塞 Claude Code）              │
│   │                                                            │
│   ├─ GET /events/recent?limit=500                              │
│   │   返回最近 N 条（client 启动时拉一次历史）                  │
│   │                                                            │
│   ├─ GET /events/filter-options                                │
│   │   返回当前 DB 里出现过的 source_app/agent_name/event_type   │
│   │                                                            │
│   └─ GET /healthz → 200 OK                                     │
│                                                                │
│   ws.WebSocketServer (路径 /stream)                            │
│   └─ 收到新事件 → JSON.stringify → send 给所有 client          │
└────────┬───────────────────────────────────────────────────────┘
         │ WebSocket /stream
         ▼
┌────────────────────────────────────────────────────────────────┐
│                  apps/client （Next.js，浏览器）                │
│                                                                │
│   useEventStream():                                            │
│   1. 启动时 fetch GET /events/recent → 填充初始 state          │
│   2. 建 WebSocket 连接                                         │
│   3. onmessage → setState(prev => [...prev, ev].slice(-N))     │
│                                                                │
│   渲染：                                                       │
│   ├─ FilterPanel：选 source_app / agent_name / event_type      │
│   ├─ SwimlaneView（主视图）：每个 agent 一行，块按时间排列     │
│   └─ EventStream（侧栏）：最近 50 条原始事件                   │
└────────────────────────────────────────────────────────────────┘
```

### 关键契约

1. **Hook 必须立即返回**。`send-event.js` POST 失败也要 `exit 0`，绝不能阻塞 Claude Code。
2. **POST /events 必须立即返回**。即便写库失败也别让 Claude Code 卡住（写错误日志即可）。
3. **WebSocket 断线时 client 自动重连**，重连后**重新拉一次** `/events/recent`，避免漏事件。

---

## 4. 环境变量

只用最少必要的几个，全部有默认值，开箱即跑。

### Server (`apps/server/.env`)

```bash
PORT=4000              # HTTP + WebSocket 共用端口
DB_PATH=./data/events.db
MAX_EVENTS_KEPT=10000  # 超过这个数，按 id 升序删除最早的
LOG_LEVEL=info         # debug | info | warn | error
```

### Client (`apps/client/.env.local`)

```bash
NEXT_PUBLIC_SERVER_HTTP=http://localhost:4000
NEXT_PUBLIC_SERVER_WS=ws://localhost:4000/stream
NEXT_PUBLIC_MAX_EVENTS_DISPLAY=500
```

注意 client 只用 `NEXT_PUBLIC_*` 前缀的变量，因为这些值要打包进浏览器 bundle。

---

## 5. 启动方式

根 `package.json` 提供这几个 script：

```json
{
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "dev:server": "pnpm --filter @agent-obs/server dev",
    "dev:client": "pnpm --filter @agent-obs/client dev",
    "build": "pnpm -r build",
    "lint": "biome check .",
    "format": "biome format --write .",
    "test:event": "curl -X POST http://localhost:4000/events -H 'Content-Type: application/json' -d @docs/test-event.json",
    "db:reset": "rm -f apps/server/data/events.db && echo 'DB reset'"
  }
}
```

`pnpm dev` 一条命令同时跑 server 和 client。

`apps/server/package.json` 的 dev 用 `node --watch --import tsx src/index.ts`。
`apps/client/package.json` 的 dev 用 `next dev --port 3000`。

---

## 6. 端口分配

- **3000** — Next.js client（用户在浏览器打开这里）
- **4000** — Server HTTP + WebSocket（hook 脚本和 client 都连这里）

之所以用 4000 而不是更常见的 8080：4000 是 disler 项目用的端口，
保留这个细节让你以后看它的代码时上下文一致。

---

## 7. .gitignore 要点

```
node_modules
.next
dist
*.log

# server 数据
apps/server/data/*.db
apps/server/data/*.db-journal
apps/server/data/*.db-wal
apps/server/data/*.db-shm
!apps/server/data/.gitkeep

# 环境变量
.env
.env.local
!.env.example
```
