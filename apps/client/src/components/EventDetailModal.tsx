'use client';

import { agentColor, sourceColor } from '@/lib/colors';
import { eventTypeEmoji, formatTime } from '@/lib/format';
import type { AgentEvent, PairedEvent } from '@agent-obs/shared';
import { useEffect, useState } from 'react';

/**
 * 事件详情弹窗（step 5b-3）
 *  - 单事件：原 step 5b-1 行为
 *  - PairedEvent：顶部多两个 Tab（Pre / Post），分别展示对应事件的 payload
 * 不做：JSON 高亮 / 拖拽 / 动画
 */
export type ModalEvent = AgentEvent | PairedEvent;

export function EventDetailModal({
  event,
  onClose,
}: {
  event: ModalEvent | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  // 仅 PairedEvent 用到；单事件时这个 state 无效但仍要无条件声明（hook 顺序）
  const [activeTab, setActiveTab] = useState<'pre' | 'post'>('pre');

  // Esc 关闭
  useEffect(() => {
    if (event === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [event, onClose]);

  // 锁 body 滚动，关闭时恢复
  useEffect(() => {
    if (event === null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [event]);

  // 切到另一事件 → 重置复制按钮文案 + tab 回 pre
  useEffect(() => {
    if (event === null) return;
    setCopied(false);
    setActiveTab('pre');
  }, [event]);

  if (event === null) return null;

  const paired = isPaired(event);
  const displayEvent: AgentEvent = paired
    ? activeTab === 'post' && event.post_event !== null
      ? event.post_event
      : event.pre_event
    : event;

  const payloadJson = JSON.stringify(displayEvent.payload, null, 2);
  const sessionShort =
    displayEvent.session_id.length > 12
      ? `${displayEvent.session_id.slice(0, 12)}…`
      : displayEvent.session_id;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(payloadJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.warn('[EventDetailModal] copy failed:', err);
    }
  };

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={paired ? `Paired ${event.pair_type} detail` : `Event ${event.id} detail`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm px-4 py-10"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-3xl max-h-[85vh] flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-900 shadow-2xl"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-slate-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xl" aria-hidden>
              {eventTypeEmoji(displayEvent.hook_event_type)}
            </span>
            <h2 className="text-base font-semibold text-slate-100">
              {displayEvent.hook_event_type}
            </h2>
            <span className="ml-2 font-mono text-xs text-slate-500">#{displayEvent.id}</span>
            {paired ? (
              <span className="ml-2 rounded border border-slate-700 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
                {event.pair_type === 'subagent' ? 'Subagent' : 'Tool'} pair
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
          >
            <span className="block h-5 w-5 text-center leading-5">✕</span>
          </button>
        </header>

        {/* Pre / Post Tabs（仅 paired 时） */}
        {paired ? (
          <nav className="flex shrink-0 border-b border-slate-800 px-5">
            <TabButton active={activeTab === 'pre'} onClick={() => setActiveTab('pre')}>
              <span className="mr-1">{eventTypeEmoji(event.pre_event.hook_event_type)}</span>
              Pre · {event.pre_event.hook_event_type}
            </TabButton>
            <TabButton
              active={activeTab === 'post'}
              disabled={event.post_event === null}
              onClick={() => {
                if (event.post_event !== null) setActiveTab('post');
              }}
            >
              {event.post_event !== null ? (
                <>
                  <span className="mr-1">{eventTypeEmoji(event.post_event.hook_event_type)}</span>
                  Post · {event.post_event.hook_event_type}
                </>
              ) : (
                <span className="text-slate-600">Post · 无（运行中/超时）</span>
              )}
            </TabButton>
          </nav>
        ) : null}

        {/* 元信息 */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800 px-5 py-3 text-[11px] font-mono">
          <Pill color={sourceColor(displayEvent.source_app)}>{displayEvent.source_app}</Pill>
          <Pill color={agentColor(displayEvent.agent_name)}>{displayEvent.agent_name}</Pill>
          <span className="tabular-nums text-slate-300">{formatTime(displayEvent.timestamp)}</span>
          <span className="text-slate-500">
            session:{' '}
            <span className="text-slate-300" title={displayEvent.session_id}>
              {sessionShort}
            </span>
          </span>
          {displayEvent.tool_name ? (
            <span className="text-slate-500">
              tool: <span className="text-emerald-300">{displayEvent.tool_name}</span>
            </span>
          ) : null}
          {paired && event.duration_ms !== null ? (
            <span className="text-slate-500">
              duration:{' '}
              <span className="text-slate-300">
                {event.duration_ms < 1000
                  ? `${event.duration_ms}ms`
                  : `${(event.duration_ms / 1000).toFixed(1)}s`}
              </span>
            </span>
          ) : null}
        </div>

        {/* Payload */}
        <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Payload
          </h3>
          <pre className="flex-1 overflow-y-auto whitespace-pre-wrap break-all rounded border border-slate-800 bg-slate-950 p-3 text-xs font-mono leading-relaxed text-slate-200">
            {payloadJson}
          </pre>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-700"
          >
            {copied ? '已复制 ✓' : '复制 JSON'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function TabButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const base = 'relative px-3 py-2 text-xs font-mono transition-colors';
  if (disabled) {
    return <span className={`${base} cursor-not-allowed text-slate-600`}>{children}</span>;
  }
  if (active) {
    return (
      <button type="button" onClick={onClick} className={`${base} text-emerald-300`}>
        {children}
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-emerald-400" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} text-slate-400 hover:text-slate-200`}
    >
      {children}
    </button>
  );
}

function isPaired(e: ModalEvent): e is PairedEvent {
  return (e as PairedEvent).kind === 'paired';
}

/**
 * 内联 pill —— 故意不复用 EventRow 里的版本，避免本步范围外修改
 */
function Pill({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium"
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
