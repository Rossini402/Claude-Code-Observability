'use client';

import { agentColor, sourceColor } from '@/lib/colors';
import { eventTypeEmoji, formatTime, summarizeEvent } from '@/lib/format';
import type { AgentEvent } from '@agent-obs/shared';

/**
 * 事件流单行：时间 | source pill | agent pill | emoji + type | tool | summary
 * onClick 由父组件传入，触发详情弹窗
 */
export function EventRow({
  event,
  onClick,
}: {
  event: AgentEvent;
  onClick?: (event: AgentEvent) => void;
}) {
  const summary = summarizeEvent(event);

  return (
    <li
      onClick={() => onClick?.(event)}
      className="flex cursor-pointer items-center gap-3 px-6 py-2 text-sm transition-colors hover:bg-slate-900/60"
    >
      <time className="font-mono text-[11px] text-slate-500 tabular-nums w-[88px] shrink-0">
        {formatTime(event.timestamp)}
      </time>

      <ColoredPill color={sourceColor(event.source_app)}>{event.source_app}</ColoredPill>

      <ColoredPill color={agentColor(event.agent_name)}>{event.agent_name}</ColoredPill>

      <span className="font-mono text-[11px] text-slate-300 w-[180px] shrink-0">
        <span className="mr-1">{eventTypeEmoji(event.hook_event_type)}</span>
        {event.hook_event_type}
      </span>

      {event.tool_name ? (
        <span className="font-mono text-[11px] text-emerald-300 shrink-0">{event.tool_name}</span>
      ) : null}

      {summary ? (
        <span className="text-slate-400 truncate flex-1 font-mono text-[11px]">{summary}</span>
      ) : (
        <span className="flex-1" />
      )}
    </li>
  );
}

/** Source / Agent 通用彩色 pill。颜色由调色板算出，alpha 直接拼 hex 实现透明背景。 */
function ColoredPill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium font-mono shrink-0 max-w-[180px] truncate"
      style={{
        backgroundColor: `${color}1f`, // ~12% opacity
        color,
        border: `1px solid ${color}55`,
      }}
    >
      {children}
    </span>
  );
}
