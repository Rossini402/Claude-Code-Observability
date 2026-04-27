/**
 * Agent 名称推断
 * 5 条规则见 docs/02-event-schema.md §4
 */
import type { IncomingEvent } from '@agent-obs/shared';

/** session_id → agent_name 内存缓存 */
const sessionAgentMap = new Map<string, string>();

/**
 * 把 unknown 缩窄为字符串字段
 */
function readString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * 推断事件归属的 agent 名
 * 规则优先级（从上至下）：
 *   1. SubagentStart/SubagentStop → payload.subagent_type 或 agent_type
 *   2. PreToolUse + tool_name=Task → 'main'（dispatcher 本身归属 main）
 *   3. SessionStart 带 agent_type → 用 agent_type
 *   4. 其他事件 → 查 session_id 缓存
 *   5. 兜底 → 'main'
 */
export function inferAgent(event: IncomingEvent): string {
  const { hook_event_type, payload } = event;
  const p = payload as Record<string, unknown>;

  // 规则 1：sub-agent 生命周期事件
  if (hook_event_type === 'SubagentStart' || hook_event_type === 'SubagentStop') {
    return readString(p, 'subagent_type') ?? readString(p, 'agent_type') ?? 'subagent-unknown';
  }

  // 规则 2：主 Agent 通过 Task 工具调度 sub-agent
  // 此事件本身归属 main（调度方）
  if (hook_event_type === 'PreToolUse' && readString(p, 'tool_name') === 'Task') {
    return 'main';
  }

  // 规则 3：SessionStart 带 agent_type（v2 hook）
  if (hook_event_type === 'SessionStart') {
    const agentType = readString(p, 'agent_type');
    if (agentType) return agentType;
  }

  // 规则 4：通过 session_id 关联到已知 agent
  const cached = lookupSessionAgent(event.session_id);
  if (cached) return cached;

  // 规则 5：兜底归属主 Agent
  return 'main';
}

/**
 * 记录 session→agent 映射，由 http 层在收到 SubagentStart/SessionStart 时调用
 */
export function recordSessionAgent(sessionId: string, agentName: string): void {
  if (!sessionId) return;
  sessionAgentMap.set(sessionId, agentName);
}

/**
 * 查询 session 对应的 agent 名，无则返回 null
 */
export function lookupSessionAgent(sessionId: string): string | null {
  return sessionAgentMap.get(sessionId) ?? null;
}

/**
 * 启动时从 DB 重建 session→agent 映射
 * 适用：进程启动一次，数据量受 MAX_EVENTS_KEPT 约束
 */
export function rebuildSessionMap(
  rows: Array<{ session_id: string; agent_name: string }>,
): void {
  sessionAgentMap.clear();
  for (const row of rows) {
    if (row.session_id) {
      sessionAgentMap.set(row.session_id, row.agent_name);
    }
  }
}
