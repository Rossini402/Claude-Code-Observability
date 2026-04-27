# 03 — UI 规范

> 本文档定义 Dashboard 的所有视觉和交互细节。Claude Code 实现时严格按这里描述构建。

---

## 1. 整体布局

整个 Dashboard 是单页应用，路径就是 `/`，没有路由。布局如下：

```
┌──────────────────────────────────────────────────────────────────┐
│  Header (高 56px)                                                │
│  ┌──────────────────────────────────────┐  ┌───────┐  ┌──────┐ │
│  │ 🤖 Agent Observability               │  │ ●Live │  │ ⚙ Theme│ │
│  └──────────────────────────────────────┘  └───────┘  └──────┘ │
├──────────────────────────────────────────────────────────────────┤
│  FilterPanel (高 64px, sticky top)                              │
│  Source: [todo-app ▾]  Agent: [all ▾]  Type: [PostToolUse ▾]   │
│  Search: [______________]              [清空过滤] [暂停]        │
├────────────────────────────────────────┬─────────────────────────┤
│                                        │                         │
│   SwimlaneView (主视图，约占 65% 宽)   │  EventStream            │
│                                        │  (副视图，约 35% 宽)    │
│   main          ▓▓ ▓ ▓                 │                         │
│   pm-agent         ▓▓▓▓▓               │  最近 50 条事件        │
│   backend-agent       ▓▓ ▓▓▓▓▓▓        │  按时间倒序，自动滚动  │
│   frontend-agent      ▓▓▓ ▓▓▓▓         │                         │
│   test-agent              ▓▓ ▓▓        │                         │
│   reviewer-agent                ▓▓▓    │                         │
│                                        │                         │
│   ←─────────── 时间 ──────────→        │                         │
│                                        │                         │
└────────────────────────────────────────┴─────────────────────────┘
```

桌面优先（≥ 1280px）。窄屏（< 1024px）下 EventStream 折叠为底部抽屉，v1 简单处理：
直接 `display:none`，不做响应式排序。

---

## 2. 组件树

```
app/page.tsx
└── <DashboardPage>
    ├── <Header>
    │   ├── 标题
    │   ├── <ConnectionStatus>      // 显示 WebSocket 连接状态
    │   └── 主题切换按钮
    │
    ├── <FilterPanel>
    │   ├── <Select source_app>
    │   ├── <Select agent_name>
    │   ├── <Select event_type>
    │   ├── <Input search>
    │   ├── <Button 清空>
    │   └── <Button 暂停/继续>
    │
    └── <main flex-row>
        ├── <SwimlaneView>          // 主视图
        │   ├── <SwimlaneRow agent="main">
        │   │   └── <EventBlock> × N
        │   ├── <SwimlaneRow agent="pm-agent">
        │   ├── ... (动态)
        │   └── <TimeAxis>
        │
        └── <EventStream>           // 副视图
            └── <EventRow> × 50
                └── <AgentBadge>
                └── <EventTypeIcon>
                └── 摘要文本
                └── 时间

<EventDetailModal>                  // 点击 EventBlock/EventRow 时打开
```

---

## 3. 数据 Hook：`useEventStream`

整个页面的数据源。所有组件订阅它的输出。

```typescript
// apps/client/src/hooks/useEventStream.ts

interface EventStreamState {
  events: AgentEvent[];           // 当前持有的事件（最多 MAX_EVENTS_DISPLAY 条）
  status: 'connecting' | 'open' | 'closed' | 'paused';
  paused: boolean;
}

interface EventStreamActions {
  pause(): void;     // 暂停接收，但保留连接（用户慢慢看时用）
  resume(): void;
  clear(): void;     // 清空当前显示（不影响 server）
}

export function useEventStream(): EventStreamState & EventStreamActions {
  // 1. 启动时 fetch GET /events/recent，填充 events
  // 2. 建 WebSocket 到 /stream
  // 3. onmessage type=event：events.push(data)，超过上限砍最早的
  // 4. paused 状态下消息进缓冲队列，resume 时一次性合并
  // 5. onclose：指数退避重连，重连成功重新 fetch /events/recent
  // 6. 30s 没收到任何消息（包括 ping）→ 主动 close 触发重连
}
```

实现要点：
- `events` 用 `useState<AgentEvent[]>`，新事件 `[...prev, ev].slice(-MAX)`
- 但**事件量大时性能会差**——每次新事件触发整个数组重渲染。优化：**用 immer + 节流**，
  WebSocket 消息进入一个 buffer（ref），用 `setInterval(100ms)` 批量 flush 到 state。
  这样即便每秒来 50 个事件也只触发 10 次渲染。

---

## 4. SwimlaneView（主视图，最重要）

这是整个 Dashboard 的灵魂，必须做对。

### 4.1 视觉效果

```
        ┌─────────────────────────────────────────────────────┐
        │  时间轴 →                                            │
agent ──┤  ▓▓ ▓ ▓                                              │
        │     ▓▓▓▓▓                                           │
        │        ▓▓ ▓▓▓▓▓▓                                    │
        └─────────────────────────────────────────────────────┘
```

每行（SwimlaneRow）：
- 左侧固定 140px 宽：彩色圆点 + agent 名字 + 状态标签（idle/running/done）
- 右侧弹性宽度：横向时间轴，每个事件是一个色块（EventBlock）
- 行高 48px，事件块高 32px、上下 8px 内边距

### 4.2 时间轴坐标系

**核心问题**：怎么把"事件时间戳"映射到"屏幕 X 坐标"？

**v1 用最简单的方案**：**滚动窗口模式**。

- 显示窗口默认 5 分钟（300 秒）
- 屏幕宽度（容器宽）映射到这 5 分钟
- 新事件出现在**最右侧**，老事件向左滚动
- 用户可以拖拽时间轴左右浏览历史

```typescript
const WINDOW_MS = 5 * 60 * 1000;
const containerWidth = 1000; // 通过 ResizeObserver 拿
const now = Date.now();
const left = ((event.timestamp - (now - WINDOW_MS)) / WINDOW_MS) * containerWidth;
// 如果 left < 0 或 > containerWidth，不渲染
```

**进阶**（不在 v1 范围）：缩放（鼠标滚轮）、跳转到指定时间。

### 4.3 EventBlock 视觉规则

| 事件类型 | 显示规则 |
|---------|---------|
| `PreToolUse` | 浅色块，高度 32px，内文 = tool_name |
| `PostToolUse` | 实色块（颜色更深），内文 = tool_name + 耗时（如 `Bash 1.2s`） |
| `PostToolUseFailure` | 红色边框 + 红色背景 |
| `SubagentStart` | 三角形左指 ▶ + agent 名 |
| `SubagentStop` | 三角形右指 ◀ + agent 名 |
| `UserPromptSubmit` | 紫色块，竖直贯穿整行（高 48px），表示一个对话回合开始 |
| `Stop` | 灰色块 + ⏹ 图标 |
| `Notification` | 浅黄色块 + 🔔 图标 |
| `PermissionRequest` | 橙色块 + 🔐 图标 |
| `PreCompact` | 蓝色块 + 📦 图标 |
| `SessionStart` / `SessionEnd` | 整列分割线（贯穿所有 swimlane 的竖线） |

### 4.4 颜色系统

**双色编码**：每个 EventBlock 的颜色由两部分决定：

1. **Agent 主色**：决定块的背景色（agent_name 哈希到调色板）
2. **Source app 色条**：块的左边缘 3px 竖条（source_app 哈希到调色板）

调色板（在 `useColors.ts` 里定义）：

```typescript
const AGENT_PALETTE = [
  '#8b5cf6', // violet
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#14b8a6', // teal
  '#6366f1', // indigo
  '#84cc16', // lime
  '#f97316', // orange
];

const SOURCE_PALETTE = [
  '#fbbf24', '#34d399', '#60a5fa', '#a78bfa',
  '#f472b6', '#fb923c', '#22d3ee', '#a3e635',
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function agentColor(name: string): string {
  // 已知 agent 用固定映射，未知 agent 用哈希
  const KNOWN = {
    'main':            '#64748b',  // slate（突出主 agent 是中性的）
    'pm-agent':        '#8b5cf6',
    'backend-agent':   '#3b82f6',
    'frontend-agent':  '#10b981',
    'test-agent':      '#f59e0b',
    'reviewer-agent':  '#ec4899',
  };
  return KNOWN[name] ?? AGENT_PALETTE[hash(name) % AGENT_PALETTE.length];
}
```

### 4.5 Swimlane 顺序

固定优先 + 哈希顺序：

1. `main` 永远在第一行
2. 接下来按 KNOWN_AGENTS 的顺序（pm-agent, backend-agent, ...）
3. 未知 agent 按字典序追加在后面
4. 当前**没有任何事件**的 agent 行**不显示**（避免空行污染视图）

### 4.6 状态指示

每个 SwimlaneRow 左侧的圆点状态：

- **灰色**：从未活跃（其实不显示这一行）
- **绿色脉冲**：最近 5 秒内有事件（认为"running"）
- **蓝色**：最近一个事件是 `SubagentStop` 或 `Stop`（认为"done"）
- **黄色**：最近一个事件是 `PostToolUseFailure` 或 `PermissionRequest`（认为"warn"）

---

## 5. EventStream（副视图）

简单的列表，每行一个事件，按时间倒序。

### 5.1 EventRow 布局

```
┌──────────────────────────────────────────────────────────┐
│  10:23:45  [todo-app] [backend-agent] 🔧 PreToolUse Bash │
│            > npm test                                    │
└──────────────────────────────────────────────────────────┘
```

- 时间（11px 灰色）
- `<AgentBadge>`（彩色 pill）
- 事件类型 emoji + 名字
- 摘要文本（payload 的关键字段截断到 80 字符）

### 5.2 摘要规则

`lib/format.ts` 的 `summarizeEvent(ev: AgentEvent): string`：

```typescript
switch (ev.hook_event_type) {
  case 'PreToolUse':
  case 'PostToolUse':
    return `${ev.payload.tool_name}: ${formatToolInput(ev.payload.tool_input)}`;
  case 'UserPromptSubmit':
    return `"${truncate(ev.payload.prompt, 80)}"`;
  case 'SubagentStart':
  case 'SubagentStop':
    return ev.payload.subagent_type ?? 'unknown';
  case 'Notification':
    return ev.payload.message ?? '';
  // ... 其他
  default:
    return '';
}

function formatToolInput(input: any): string {
  if (input?.command) return truncate(input.command, 80);
  if (input?.file_path) return input.file_path;
  if (input?.subagent_type) return `→ ${input.subagent_type}`;
  return JSON.stringify(input).slice(0, 80);
}
```

### 5.3 自动滚动

- 默认 `scrollTop = 0`（最新在最上方）
- 用户向下滚动后，**暂停自动滚动**，右下角浮一个"回到最新"按钮
- 点击按钮 / 滚回顶部 → 恢复自动滚动

---

## 6. FilterPanel

### 6.1 过滤项

| 字段 | 类型 | 数据源 |
|------|------|--------|
| Source App | 单选下拉 | `GET /events/filter-options` |
| Agent | 单选下拉 | 同上 |
| Event Type | 多选 checkbox（默认全选） | 静态枚举 |
| 搜索关键词 | 文本框 | 在 client 内对 payload JSON 字符串做包含匹配 |

**全部都是 client 端过滤**——server 已经把所有事件推过来了，再 fetch 一次反而慢。

### 6.2 暂停按钮

`paused = true` 时：
- WebSocket 消息进 buffer，不更新 events
- 按钮变红，显示"已暂停（缓冲 N 条）"
- 再点一下：合并 buffer 到 events

为什么需要这个：事件流快的时候用户没法看清，暂停一下方便观察。

---

## 7. EventDetailModal

点击 EventBlock 或 EventRow 触发。

```
┌─ 事件详情 ────────────────────────────────────────[ ✕ ]┐
│                                                        │
│  Source: todo-app    Agent: backend-agent              │
│  Time: 2025-04-27 10:23:45.123  Session: sess-abc-123 │
│  Event: PreToolUse                                     │
│                                                        │
│  ── Payload ──                                         │
│  ┌──────────────────────────────────────────────────┐ │
│  │ {                                                │ │
│  │   "tool_name": "Bash",                           │ │
│  │   "tool_input": { ... },                         │ │
│  │   ...                                            │ │
│  │ }                                                │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  [复制 JSON]  [查看同 session 全部事件]               │
└────────────────────────────────────────────────────────┘
```

JSON 用 `<pre>` + monospace 字体，不引入语法高亮库（v1 简化）。
"查看同 session 全部事件"按钮：把 session_id 设到过滤器，关闭 modal。

---

## 8. 主题

- 默认：dark mode（slate-900 背景，符合开发工具气质）
- 切换按钮：右上角，记住用户选择到 localStorage
- 用 Tailwind 的 `dark:` 前缀，class 切换在 `<html>` 上

主色调（dark）：

```
背景：bg-slate-950
卡片：bg-slate-900
边框：border-slate-800
文字主：text-slate-100
文字次：text-slate-400
强调：text-emerald-400
```

---

## 9. 性能要求

| 场景 | 要求 |
|------|------|
| WebSocket 收到新事件 → 屏幕更新 | < 100ms |
| 持有 500 事件时新事件渲染 | 不卡顿（60fps） |
| 启动时拉取历史 500 条 → 首屏渲染 | < 1s |
| 切换过滤条件 | < 50ms |

实现要点：
- `EventBlock` 必须 `React.memo` 包裹，比较 `id` 和 `agentColor`
- `SwimlaneView` 用 `useMemo` 按 agent 分组，依赖只有 `events.length` 不准——
  用一个自增的"events version" ref 触发 memo 失效
- `EventStream` 列表超过 100 行考虑虚拟滚动（v1 暂不上 react-window，
  靠 `slice(-50)` 控制行数足够）

---

## 10. 空状态

启动后还没收到任何事件时：

```
┌──────────────────────────────────────────┐
│                                          │
│           🤖                             │
│                                          │
│      Waiting for Claude Code events...   │
│                                          │
│   1. Make sure server is running         │
│   2. Configure .claude/settings.json     │
│      in your target project              │
│   3. Run `claude` and try a command      │
│                                          │
│   [Server status: connected ●]           │
│                                          │
└──────────────────────────────────────────┘
```

服务器连不上时，最后一行变红：`Server status: disconnected ○`。

---

## 11. 不在 v1 范围

这些以后再做，明确写出来避免实现时纠结：

- ❌ 横向缩放时间轴
- ❌ 跳转到任意时间点
- ❌ 事件搜索高亮
- ❌ JSON 语法高亮
- ❌ 多 session 对比视图
- ❌ 导出 CSV / 截图
- ❌ 移动端适配
- ❌ 多语言
- ❌ 用户设置持久化（除主题外）
