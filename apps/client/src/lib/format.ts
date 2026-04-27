// 时间、emoji、单事件摘要
// 摘要规则参考 docs/03-ui-spec.md §5.2，按 v1 简化版实现
import type { AgentEvent, HookEventType } from '@agent-obs/shared';

const EVENT_EMOJI: Record<HookEventType, string> = {
  SessionStart: '🟢',
  SessionEnd: '🔴',
  UserPromptSubmit: '💬',
  PreToolUse: '🔧',
  PostToolUse: '✅',
  PostToolUseFailure: '❌',
  PermissionRequest: '🔐',
  Notification: '🔔',
  Stop: '⏹',
  SubagentStart: '▶',
  SubagentStop: '◀',
  PreCompact: '📦',
};

export function eventTypeEmoji(type: HookEventType | string): string {
  return EVENT_EMOJI[type as HookEventType] ?? '·';
}

/** HH:MM:SS.mmm 本地时区 */
export function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * 取 payload 中最有信息量的一段做事件摘要
 * 失败兜底空串，UI 会照常显示其他字段（type / tool 等）
 */
export function summarizeEvent(ev: AgentEvent): string {
  const p = (ev.payload ?? {}) as Record<string, unknown>;

  switch (ev.hook_event_type) {
    case 'PreToolUse':
    case 'PostToolUse': {
      const input = p.tool_input as Record<string, unknown> | undefined;
      if (!input) return '';
      if (typeof input.command === 'string') return truncate(input.command, 140);
      if (typeof input.file_path === 'string') return String(input.file_path);
      if (typeof input.subagent_type === 'string') return `→ ${input.subagent_type}`;
      if (typeof input.url === 'string') return String(input.url);
      try {
        return truncate(JSON.stringify(input), 140);
      } catch {
        return '';
      }
    }
    case 'PostToolUseFailure': {
      const err = p.error;
      return typeof err === 'string' ? truncate(err, 140) : '';
    }
    case 'UserPromptSubmit': {
      const prompt = p.prompt;
      return typeof prompt === 'string' ? `"${truncate(prompt, 140)}"` : '';
    }
    case 'SubagentStart':
    case 'SubagentStop': {
      const sa = p.subagent_type ?? p.agent_type;
      return typeof sa === 'string' ? sa : '';
    }
    case 'Notification': {
      const m = p.message;
      return typeof m === 'string' ? truncate(m, 140) : '';
    }
    case 'PermissionRequest': {
      const tool = p.tool_name;
      return typeof tool === 'string' ? `tool=${tool}` : '';
    }
    case 'SessionStart':
    case 'SessionEnd':
    case 'Stop':
    case 'PreCompact':
    default:
      return '';
  }
}
