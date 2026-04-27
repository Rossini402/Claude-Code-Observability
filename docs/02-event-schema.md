# 02 — 数据契约（Event Schema）

> 这是整个系统的数据契约。Server、Client、Hook 脚本三方都必须严格遵守。
> 所有类型定义在 `packages/shared/src/`，client 和 server 都从这里 import。

---

## 1. 事件信封（Envelope）

照抄 disler 项目的设计——**外层稳定、内层灵活**。

```typescript
// packages/shared/src/events.ts

/** Hook 事件类型，对应 Claude Code 的 13 种 hook 事件 */
export type HookEventType =
  | 'SessionStart'
  | 'SessionEnd'
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'PermissionRequest'
  | 'Notification'
  | 'Stop'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'PreCompact';

/** 客户端发到 server 的事件信封（hook 脚本构造） */
export interface IncomingEvent {
  /** 项目标识，hook 脚本通过 --source-app 参数传入 */
  source_app: string;

  /** Claude Code 提供的 session ID，关联同一次运行的所有事件 */
  session_id: string;

  /** Hook 事件类型 */
  hook_event_type: HookEventType;

  /** 原始 hook payload，由 Claude Code 通过 stdin 提供 */
  payload: Record<string, unknown>;

  /** 客户端时间戳（毫秒），缺失时 server 用 Date.now() 兜底 */
  timestamp?: number;
}

/** Server 持久化 + 广播的事件（多了 server 派生字段） */
export interface AgentEvent extends IncomingEvent {
  /** 自增主键 */
  id: number;

  /** Server 推断出的 agent 名，详见 §4 */
  agent_name: string;

  /** Server 落库时间（毫秒） */
  created_at: number;
}
```

### 字段语义详解

| 字段 | 来源 | 用途 |
|------|------|------|
| `source_app` | hook 命令的 `--source-app` 参数 | 区分被观测的不同项目 |
| `session_id` | Claude Code 提供（payload 里也有，hook 脚本可冗余传） | 同一次 Claude Code 运行 |
| `hook_event_type` | hook 命令的 `--event-type` 参数 | UI 区分事件类型 |
| `payload` | Claude Code 通过 stdin 输入的整个 JSON | 保留完整原始信息 |
| `agent_name` | server 端 `inferAgent(payload)` 推断 | UI 泳道分组 |
| `id` / `created_at` | server 自动生成 | 排序、去重 |

---

## 2. SQLite Schema

```sql
-- apps/server/src/db.ts 启动时执行（IF NOT EXISTS）

CREATE TABLE IF NOT EXISTS events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_app      TEXT    NOT NULL,
  session_id      TEXT    NOT NULL,
  agent_name      TEXT    NOT NULL,
  hook_event_type TEXT    NOT NULL,
  tool_name       TEXT,                    -- 从 payload.tool_name 提取，便于查询
  payload         TEXT    NOT NULL,        -- JSON.stringify(payload)
  timestamp       INTEGER NOT NULL,        -- 客户端时间戳
  created_at      INTEGER NOT NULL         -- server 落库时间
);

CREATE INDEX IF NOT EXISTS idx_session     ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_source_app  ON events(source_app);
CREATE INDEX IF NOT EXISTS idx_agent_name  ON events(agent_name);
CREATE INDEX IF NOT EXISTS idx_event_type  ON events(hook_event_type);
CREATE INDEX IF NOT EXISTS idx_created_at  ON events(created_at);
```

### WAL 模式（关键）

启动时执行：

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
```

理由：hook 写入和 dashboard 读取并发，WAL 模式下读不阻塞写，写不阻塞读。
SQLite 单线程写没问题，因为我们的写频率上限就是 hook 触发频率（量级很小）。

### 容量管理

`apps/server/src/db.ts` 每 100 次插入触发一次清理：

```typescript
// 伪代码
if (insertCount % 100 === 0) {
  db.exec(`
    DELETE FROM events WHERE id IN (
      SELECT id FROM events
      ORDER BY id ASC
      LIMIT MAX(0, (SELECT COUNT(*) FROM events) - ${MAX_EVENTS_KEPT})
    )
  `);
}
```

---

## 3. HTTP API

### `POST /events`

**Hook 脚本调用**。

请求体：`IncomingEvent`（JSON）。

```bash
curl -X POST http://localhost:4000/events \
  -H 'Content-Type: application/json' \
  -d '{
    "source_app": "my-todo-app",
    "session_id": "sess-abc-123",
    "hook_event_type": "PreToolUse",
    "payload": {
      "session_id": "sess-abc-123",
      "tool_name": "Bash",
      "tool_input": { "command": "npm test" }
    }
  }'
```

响应：

- 成功：`200 OK` + `{ "ok": true, "id": 42 }`
- 字段缺失：`400 Bad Request` + `{ "error": "missing source_app" }`
- 内部错误：**仍返回 `200 OK`**（不阻塞 Claude Code），错误写入 server 日志

> 性能要求：P99 < 50ms。Hook 脚本 timeout 设为 5s，但实际不应该超过 100ms。

### `GET /events/recent?limit=500&source_app=&agent_name=&event_type=`

**Client 启动时拉历史**。

Query 参数（全部可选）：

- `limit` — 默认 500，最大 5000
- `source_app` — 精确匹配
- `agent_name` — 精确匹配
- `event_type` — 精确匹配
- `before_id` — 分页用，返回 `id < before_id` 的事件

响应：

```json
{
  "events": [ /* AgentEvent[]，按 id 降序 */ ],
  "has_more": true
}
```

### `GET /events/filter-options`

**Client 用来填充过滤面板下拉框**。

响应：

```json
{
  "source_apps": ["my-todo-app", "blog"],
  "agent_names": ["main", "pm-agent", "backend-agent"],
  "event_types": ["PreToolUse", "PostToolUse", "SubagentStart", ...]
}
```

实现：`SELECT DISTINCT` 三列，但限定时间窗口（最近 24h）防止历史数据污染下拉框。

### `GET /healthz`

返回 `200 OK` + `{ ok: true, uptime_ms: 12345 }`。给启动脚本探活用。

---

## 4. Agent 名称推断规则（`inferAgent`）

> **这是整个系统最关键的业务逻辑**。Agent 名错了，整个泳道图就乱了。

```typescript
// apps/server/src/infer-agent.ts

import type { IncomingEvent } from '@agent-obs/shared';

export function inferAgent(event: IncomingEvent): string {
  const { hook_event_type, payload } = event;
  const p = payload as Record<string, any>;

  // 规则 1：SubagentStart / SubagentStop 的 payload 里直接带 agent 类型
  // payload 字段名 Claude Code 会传 subagent_type 或 agent_type
  if (hook_event_type === 'SubagentStart' || hook_event_type === 'SubagentStop') {
    return p.subagent_type ?? p.agent_type ?? 'subagent-unknown';
  }

  // 规则 2：主 Agent 调用 Task 工具去启动 sub-agent，
  //         此时 PreToolUse 事件的 tool_input.subagent_type 标明目标
  if (hook_event_type === 'PreToolUse' && p.tool_name === 'Task') {
    const target = p.tool_input?.subagent_type;
    // 这条事件本身是「main 在调度某个 agent」，所以归属 main
    // 但我们把 target 信息塞回 payload 让 UI 能显示「main → backend-agent」
    return 'main';
  }

  // 规则 3：SessionStart 的 payload 里有 agent_type 字段（v2 hook 引入）
  //         如果是 sub-agent 的 session，能直接拿到
  if (hook_event_type === 'SessionStart' && p.agent_type) {
    return p.agent_type;
  }

  // 规则 4：其他所有事件，依靠 session_id 关联
  //         同一个 session_id 的事件归属同一个 agent
  //         这要求 server 维护一个 session_id → agent_name 的映射缓存
  //         详见 §5
  const cached = lookupSessionAgent(event.session_id);
  if (cached) return cached;

  // 规则 5：兜底
  return 'main';
}
```

### Session → Agent 缓存

`apps/server/src/infer-agent.ts` 维护一个内存 Map：

```typescript
const sessionAgentMap = new Map<string, string>();

// 每次 SubagentStart/SessionStart 时更新
export function recordSessionAgent(sessionId: string, agentName: string) {
  sessionAgentMap.set(sessionId, agentName);
}

export function lookupSessionAgent(sessionId: string): string | null {
  return sessionAgentMap.get(sessionId) ?? null;
}
```

启动时从 DB 重建这个 Map：

```sql
SELECT session_id, agent_name FROM events
WHERE hook_event_type IN ('SubagentStart', 'SessionStart')
GROUP BY session_id;
```

### 常见 Agent 名称

`packages/shared/src/agents.ts` 定义已知 Agent 列表（用于 UI 颜色映射）：

```typescript
export const KNOWN_AGENTS = [
  'main',
  'pm-agent',
  'backend-agent',
  'frontend-agent',
  'test-agent',
  'reviewer-agent',
  // 内置 sub-agent
  'general-purpose',
  'explore',
  'plan',
] as const;
```

未知 agent 名也能正常工作——`useColors.ts` 用哈希函数兜底。

---

## 5. WebSocket 协议

**路径**：`ws://localhost:4000/stream`

**握手**：无需鉴权，浏览器直连即可。

**消息格式**（server → client）：

```typescript
// 类型 1：单条新事件（最常见）
{
  type: 'event',
  data: AgentEvent
}

// 类型 2：连接建立后的初始 ping
{
  type: 'hello',
  data: { server_time: 1730000000000 }
}

// 类型 3：心跳（每 30s 一次，client 30s 没收到任何消息就认为断了）
{
  type: 'ping',
  data: { ts: 1730000000000 }
}
```

**Client → Server**：v1 不需要任何上行消息。

### 重连策略（client 实现）

```typescript
// apps/client/src/hooks/useEventStream.ts 伪代码

let attempt = 0;
function connect() {
  const ws = new WebSocket(url);
  ws.onopen = () => {
    attempt = 0;
    // 重连后重新拉一次历史，防止漏事件
    fetchRecent().then(setEvents);
  };
  ws.onclose = () => {
    const delay = Math.min(1000 * 2 ** attempt, 10000); // 指数退避，封顶 10s
    attempt++;
    setTimeout(connect, delay);
  };
}
```

---

## 6. Hook 脚本协议

`hooks/send-event.js` 是 client 端，由 Claude Code 调用。

**调用方式**（在被观测项目的 `.claude/settings.json` 里）：

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "node /absolute/path/to/hooks/send-event.js --source-app=my-app --event-type=PreToolUse"
      }]
    }]
  }
}
```

**`send-event.js` 行为**：

1. 解析命令行参数：`--source-app=X --event-type=Y --server=http://localhost:4000`（server 默认值）
2. 从 stdin 读 JSON（Claude Code 会把整个 hook payload 灌进 stdin）
3. 提取 `payload.session_id` 作为信封的 `session_id`
4. 构造 `IncomingEvent`，POST 到 `${server}/events`
5. **无论成功失败都 `process.exit(0)`**——绝不能阻塞 Claude Code
6. 错误时把日志写到 `~/.agent-obs/send-event.log`（追加模式）

**为什么用 `.js` 而不是 `.ts`**：被观测项目可能没有任何 TS 工具链，纯 Node 能直接 `node send-event.js` 跑。

**完整骨架**：

```javascript
#!/usr/bin/env node
// hooks/send-event.js
const fs = require('fs');
const path = require('path');
const os = require('os');

function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

function logError(msg) {
  try {
    const logDir = path.join(os.homedir(), '.agent-obs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, 'send-event.log'),
      `[${new Date().toISOString()}] ${msg}\n`
    );
  } catch {}
}

async function main() {
  const args = parseArgs(process.argv);
  const sourceApp = args['source-app'] || 'unknown';
  const eventType = args['event-type'] || 'unknown';
  const server = args.server || 'http://localhost:4000';

  // 读 stdin
  let stdinData = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) stdinData += chunk;

  let payload = {};
  try { payload = JSON.parse(stdinData || '{}'); }
  catch (e) { logError(`bad stdin JSON: ${e.message}`); }

  const envelope = {
    source_app: sourceApp,
    session_id: payload.session_id || 'unknown',
    hook_event_type: eventType,
    payload,
    timestamp: Date.now(),
  };

  try {
    const res = await fetch(`${server}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
      // 5s 超时
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) logError(`server returned ${res.status}`);
  } catch (e) {
    logError(`fetch failed: ${e.message}`);
  }

  process.exit(0);
}

main().catch(e => { logError(e.stack || e.message); process.exit(0); });
```

---

## 7. 测试事件 fixture

放在 `docs/test-event.json`，用于 `pnpm test:event` 命令快速验通：

```json
{
  "source_app": "smoke-test",
  "session_id": "smoke-001",
  "hook_event_type": "PreToolUse",
  "payload": {
    "session_id": "smoke-001",
    "tool_name": "Bash",
    "tool_input": { "command": "echo hello" }
  },
  "timestamp": 1730000000000
}
```

---

## 8. 字段命名约定

- 顶层信封字段：`snake_case`（和 Claude Code 原生 hook payload 风格一致）
- TypeScript 类型名：`PascalCase`
- 函数和变量：`camelCase`

之所以信封用 snake_case：方便 hook 脚本（`.js`）直接构造对象，避免命名风格切换。
