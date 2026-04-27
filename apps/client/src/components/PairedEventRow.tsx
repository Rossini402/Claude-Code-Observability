'use client';

import type { PairedEvent } from '@agent-obs/shared';
import { agentColor, sourceColor } from '@/lib/colors';
import { formatTime, summarizeEvent } from '@/lib/format';
import { useNow } from '@/hooks/useNow';

/** 60s 阈值：Pre 之后过这么久还没 Post，视觉切到 ⚠️ timeout */
const TIMEOUT_MS = 60_000;

/**
 * 合并事件行：Pre + Post 折成一条，显示 起始时间 / source / agent / 状态图标 / 工具名 / 摘要 / 耗时
 *
 * 实现：完成态和运行中拆成两个子组件，让 useNow 只在 running 行触发每秒重渲，
 * 否则一旦页面有 100 行 paired，每秒整页 100 次重渲。
 */
export function PairedEventRow({
  pairedEvent,
  onClick,
}: {
  pairedEvent: PairedEvent;
  onClick?: (pe: PairedEvent) => void;
}) {
  if (pairedEvent.post_event === null) {
    return <RunningPairedRow pairedEvent={pairedEvent} onClick={onClick} />;
  }
  return <FinishedPairedRow pairedEvent={pairedEvent} onClick={onClick} />;
}

// ---------------- finished ----------------

function FinishedPairedRow({
  pairedEvent,
  onClick,
}: {
  pairedEvent: PairedEvent;
  onClick?: (pe: PairedEvent) => void;
}) {
  const icon = pairedEvent.status === 'failure' ? '❌' : '✅';
  const durationLabel = formatDuration(pairedEvent.duration_ms);
  return (
    <RowShell pairedEvent={pairedEvent} icon={icon} onClick={onClick}>
      <span className="font-mono text-[11px] text-slate-500 shrink-0 tabular-nums">
        {durationLabel}
      </span>
    </RowShell>
  );
}

// ---------------- running / timeout ----------------

function RunningPairedRow({
  pairedEvent,
  onClick,
}: {
  pairedEvent: PairedEvent;
  onClick?: (pe: PairedEvent) => void;
}) {
  const now = useNow();
  const elapsed = Math.max(0, now - pairedEvent.pre_event.timestamp);
  const isTimeout = elapsed >= TIMEOUT_MS;

  const icon = isTimeout ? '⚠️' : '⏳';
  const label = isTimeout
    ? `>${Math.floor(elapsed / 1000)}s`
    : formatDuration(elapsed);
  const labelClass = isTimeout
    ? 'font-mono text-[11px] text-amber-300 shrink-0 tabular-nums'
    : 'font-mono text-[11px] text-slate-400 shrink-0 tabular-nums';

  return (
    <RowShell pairedEvent={pairedEvent} icon={icon} onClick={onClick}>
      <span className={labelClass}>{label}</span>
    </RowShell>
  );
}

// ---------------- shared shell ----------------

function RowShell({
  pairedEvent,
  icon,
  onClick,
  children,
}: {
  pairedEvent: PairedEvent;
  icon: string;
  onClick?: (pe: PairedEvent) => void;
  children: React.ReactNode;
}) {
  const pre = pairedEvent.pre_event;
  const summary = summarizeEvent(pre);
  const subjectName =
    pairedEvent.pair_type === 'subagent'
      ? readString(pre.payload, 'subagent_type') ?? ''
      : pre.tool_name ?? '';

  return (
    <li
      onClick={() => onClick?.(pairedEvent)}
      className="flex cursor-pointer items-center gap-3 px-6 py-2 text-sm transition-colors hover:bg-slate-900/60"
    >
      <time className="font-mono text-[11px] text-slate-500 tabular-nums w-[88px] shrink-0">
        {formatTime(pre.timestamp)}
      </time>

      <ColoredPill color={sourceColor(pre.source_app)}>
        {pre.source_app}
      </ColoredPill>

      <ColoredPill color={agentColor(pre.agent_name)}>
        {pre.agent_name}
      </ColoredPill>

      <span className="font-mono text-[11px] text-slate-300 w-[180px] shrink-0">
        <span className="mr-1">{icon}</span>
        {pairedEvent.pair_type === 'subagent' ? 'Subagent' : 'Tool'}
      </span>

      {subjectName ? (
        <span className="font-mono text-[11px] text-emerald-300 shrink-0">
          {subjectName}
        </span>
      ) : null}

      {summary ? (
        <span className="text-slate-400 truncate flex-1 font-mono text-[11px]">
          {summary}
        </span>
      ) : (
        <span className="flex-1" />
      )}

      {children}
    </li>
  );
}

function ColoredPill({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium font-mono shrink-0 max-w-[180px] truncate"
      style={{
        backgroundColor: `${color}1f`,
        color,
        border: `1px solid ${color}55`,
      }}
    >
      {children}
    </span>
  );
}

function readString(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * 耗时格式：
 *  - null → '—'
 *  - < 1000ms → '230ms'
 *  - >= 1s → '1.2s'
 */
function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
