'use client';

import { useEffect, useState } from 'react';
import type { AgentEvent } from '@agent-obs/shared';
import { agentColor, sourceColor } from '@/lib/colors';
import { eventTypeEmoji, formatTime } from '@/lib/format';

/**
 * 事件详情弹窗（step 5b-1 最小版）
 * 不做：JSON 高亮 / "查看同 session"按钮 / 拖拽 / 动画
 */
export function EventDetailModal({
  event,
  onClose,
}: {
  event: AgentEvent | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  // Esc 关闭。仅在 modal 打开时挂监听。
  useEffect(() => {
    if (event === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [event, onClose]);

  // 锁 body 滚动，关闭时恢复原值（兼容主题切换等场景）
  useEffect(() => {
    if (event === null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [event]);

  // 切到另一个事件时，重置复制按钮文案
  useEffect(() => {
    if (event === null) return;
    setCopied(false);
  }, [event]);

  if (event === null) return null;

  const payloadJson = JSON.stringify(event.payload, null, 2);
  const sessionShort =
    event.session_id.length > 12
      ? `${event.session_id.slice(0, 12)}…`
      : event.session_id;

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
      // backdrop：点击关闭
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Event ${event.id} detail`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm px-4 py-10"
    >
      <div
        // 内容容器：阻止冒泡，避免点内容也关闭
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-3xl max-h-[85vh] flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-900 shadow-2xl"
      >
        {/* 顶栏：emoji + type + #id + 关闭 */}
        <header className="flex shrink-0 items-center justify-between border-b border-slate-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xl" aria-hidden>
              {eventTypeEmoji(event.hook_event_type)}
            </span>
            <h2 className="text-base font-semibold text-slate-100">
              {event.hook_event_type}
            </h2>
            <span className="ml-2 font-mono text-xs text-slate-500">
              #{event.id}
            </span>
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

        {/* 元信息：source / agent / 时间 / session / tool */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800 px-5 py-3 text-[11px] font-mono">
          <Pill color={sourceColor(event.source_app)}>{event.source_app}</Pill>
          <Pill color={agentColor(event.agent_name)}>{event.agent_name}</Pill>
          <span className="tabular-nums text-slate-300">
            {formatTime(event.timestamp)}
          </span>
          <span className="text-slate-500">
            session:{' '}
            <span
              className="text-slate-300"
              title={event.session_id}
            >
              {sessionShort}
            </span>
          </span>
          {event.tool_name ? (
            <span className="text-slate-500">
              tool: <span className="text-emerald-300">{event.tool_name}</span>
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

        {/* 底部：复制 */}
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
