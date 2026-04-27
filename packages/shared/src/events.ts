/**
 * Hook 事件类型，对应 Claude Code 的 hook 事件。
 * 详见 docs/02-event-schema.md §1。
 */
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

export const HOOK_EVENT_TYPES: readonly HookEventType[] = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'Notification',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
] as const;

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

  /** Server 推断出的 agent 名 */
  agent_name: string;

  /** Server 落库时间（毫秒） */
  created_at: number;

  /** payload 中提取的 tool_name（便于 UI 直接读取，可能为 null） */
  tool_name?: string | null;

  /** 必填的 timestamp（server 兜底为 created_at） */
  timestamp: number;
}

/** WebSocket server → client 消息格式 */
export type WsMessage =
  | { type: 'hello'; data: { server_time: number } }
  | { type: 'event'; data: AgentEvent }
  | { type: 'ping'; data: { ts: number } };

/** GET /events/recent 响应 */
export interface RecentEventsResponse {
  events: AgentEvent[];
  has_more: boolean;
}

/** GET /events/filter-options 响应 */
export interface FilterOptionsResponse {
  source_apps: string[];
  agent_names: string[];
  event_types: HookEventType[];
}
