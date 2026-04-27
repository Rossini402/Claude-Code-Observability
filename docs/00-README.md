# Agent Observability — 实施文档总览

本仓库用于构建一个 **Claude Code 多 Agent 协作可视化系统**：本地起一个事件总线，
接收 Claude Code 的 hook 事件，在浏览器实时显示每个 sub-agent 的活动。

## 设计来源

参考 [`disler/claude-code-hooks-multi-agent-observability`](https://github.com/disler/claude-code-hooks-multi-agent-observability)
的整体架构，但做了以下关键调整：

| 维度 | 参考项目 | 本项目 |
|------|----------|--------|
| Hook 脚本语言 | Python + uv | **Node.js**（统一运行时） |
| Server 运行时 | Bun | **Node + Express + ws** |
| Client 框架 | Vue 3 | **Next.js (App Router) + React** |
| 主视图 | 事件流 + Pulse Chart | **Agent 泳道图** + 事件流 + 过滤面板 |
| 双色编码 | source_app + session_id | source_app + **agent_name** |
| 附加功能 | TTS / chat 备份 / MCP | **不做**（v1 专注观测） |

## 三份文档怎么读

按顺序读：

1. **[01-architecture.md](./01-architecture.md)** — 目录结构、技术选型、数据流。
   *先建立全局图景。*

2. **[02-event-schema.md](./02-event-schema.md)** — 事件信封格式、SQLite schema、
   HTTP/WebSocket 协议、Agent 名称推断规则。
   *这是整个系统的数据契约，必须严格遵守。*

3. **[03-ui-spec.md](./03-ui-spec.md)** — Dashboard 的页面布局、组件树、
   每个组件的 Props/行为、颜色系统、交互细节。
   *客户端实现的唯一参考。*

## 实施顺序

建议 Claude Code 按以下顺序构建（每步可独立验证）：

1. **Monorepo 骨架**：`pnpm` workspaces，`apps/server` 和 `apps/client` 两个包。
2. **Server**：先写 `POST /events` + SQLite 落库 + WebSocket 广播。用 `curl` 测一发就能验。
3. **Hook 脚本**：写 `send-event.js`，能从 stdin 读 JSON 转发到 server。
4. **`.claude/settings.json`**：配置所有 12 种事件挂到 `send-event.js`。在一个测试项目跑 Claude Code 验证事件能进库。
5. **Client**：先做事件流页面（最简单），再做泳道图，最后做过滤面板。
6. **联调**：在测试项目里跑一段「需求 → PM Agent → Backend/Frontend Agent → Test Agent」的流水线，
   观察 dashboard 能否清晰显示每个 Agent 的轨迹。

## 验收标准

v1 完成时，能做到：

- [ ] 在测试项目跑 Claude Code，每次 tool 调用、每个 sub-agent 启停都能在 dashboard 实时看到
- [ ] Dashboard 主视图是泳道图，每行一个 Agent，块按时间顺序排列
- [ ] 块的颜色按 Agent 区分，hover 能看到完整 tool_input/tool_response
- [ ] 能按 source_app / agent_name / event_type 过滤
- [ ] 关掉浏览器再打开，能看到历史事件（最近 500 条）
- [ ] `pnpm dev` 一条命令启动整个系统

## 不在 v1 范围内的功能（明确标记，避免范围蔓延）

- 鉴权 / 多用户
- 远程部署 / HTTPS
- 事件的语义摘要（disler 用 LLM 生成 summary，我们 v1 直接显示原始字段）
- TTS / 声音通知
- 跨会话的 chat transcript 浏览器
- 持久化超过 30 天的事件（v1 用一张表，按 id 倒序保留最近 N 条即可）
