'use client';

// Dashboard 主页（step 5a 最小可见版）
// - 仅事件流：垂直滚动，最新在顶部
// - 顶栏：标题 + WebSocket 连接状态指示
// - 不做 swimlane / filter / detail modal / 暂停按钮 / 自动滚动控制

import { ConnectionStatus } from '@/components/ConnectionStatus';
import { EventRow } from '@/components/EventRow';
import { useEventStream } from '@/hooks/useEventStream';

export default function DashboardPage() {
  const { events, status } = useEventStream();

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950/80 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="text-xl" role="img" aria-label="agent">
            🤖
          </span>
          <h1 className="text-base font-semibold text-slate-100">
            Agent Observability
          </h1>
          <span className="ml-2 text-xs text-slate-500 tabular-nums">
            {events.length} events
          </span>
        </div>
        <ConnectionStatus status={status} />
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <EmptyState status={status} />
        ) : (
          <ul className="divide-y divide-slate-800/60">
            {events.map((ev) => (
              <EventRow key={ev.id} event={ev} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function EmptyState({ status }: { status: 'connecting' | 'open' | 'closed' }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-slate-400">
      <span className="text-5xl" role="img" aria-label="agent">
        🤖
      </span>
      <p className="text-base text-slate-200">Waiting for Claude Code events…</p>
      <ol className="text-sm leading-relaxed text-slate-500 list-decimal list-inside text-left">
        <li>
          确认 server 在跑：
          <code className="ml-1 rounded bg-slate-900 px-1.5 py-0.5 text-emerald-300">
            pnpm dev:server
          </code>
        </li>
        <li>
          在被观测项目里配好
          <code className="mx-1 rounded bg-slate-900 px-1.5 py-0.5 text-emerald-300">
            .claude/settings.json
          </code>
          的 hook
        </li>
        <li>
          跑
          <code className="ml-1 rounded bg-slate-900 px-1.5 py-0.5 text-emerald-300">
            claude
          </code>
          ，发一句指令
        </li>
      </ol>
      <p className="mt-2 text-xs text-slate-600">
        当前 WebSocket 状态：<span className="font-mono">{status}</span>
      </p>
    </div>
  );
}
