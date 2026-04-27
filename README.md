# Agent Observability

Claude Code 多 Agent 协作可视化系统。本地启动事件总线，接收 Claude Code 的 hook 事件，在浏览器实时显示每个 sub-agent 的活动。

完整设计文档见 [`docs/00-README.md`](./docs/00-README.md)。

## 快速开始

需要 Node.js ≥ 20.10 和 pnpm ≥ 9。

```bash
pnpm install
pnpm dev
```

`pnpm dev` 会同时启动：

- **Server**：`http://localhost:4000`（HTTP + WebSocket）
- **Client**：`http://localhost:3000`（Dashboard）

打开 <http://localhost:3000> 查看 Dashboard。

## 在被观测项目里启用 hooks

参见 [`hooks/README.md`](./hooks/README.md)。

## 仓库结构

```
agent-obs/
├── apps/
│   ├── server/        # 事件总线（Express + ws + SQLite）
│   └── client/        # Dashboard（Next.js + React + Tailwind）
├── packages/
│   └── shared/        # 共享类型（client 和 server 都引用）
├── hooks/             # Claude Code hook 脚本（拷贝到目标项目用）
└── docs/              # 设计与实施文档
```

## 常用 scripts

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 同时启动 server 和 client |
| `pnpm dev:server` | 单独启动 server |
| `pnpm dev:client` | 单独启动 client |
| `pnpm build` | 构建所有包 |
| `pnpm lint` | Biome 检查 |
| `pnpm format` | Biome 格式化 |
| `pnpm type-check` | 全仓 TypeScript 类型检查 |
| `pnpm db:reset` | 清空 SQLite 数据库 |
