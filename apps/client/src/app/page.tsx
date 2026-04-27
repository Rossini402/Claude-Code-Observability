'use client';

// Dashboard 主页（step 5b-2：事件流 + 详情弹窗 + 过滤面板 + 暂停）
// - 事件流：垂直滚动，最新在顶部，行点击打开详情
// - 顶栏：标题 + N/M events + WebSocket 连接状态
// - FilterPanel：source / agent / type / 搜索 / 清空 / 暂停
// - 不做 swimlane / 自动滚动控制

import { useMemo, useState } from 'react';
import type { AgentEvent } from '@agent-obs/shared';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { EventDetailModal } from '@/components/EventDetailModal';
import { EventRow } from '@/components/EventRow';
import { FilterPanel } from '@/components/FilterPanel';
import { useFilters } from '@/hooks/useFilters';
import { usePauseable } from '@/hooks/usePauseable';

export default function DashboardPage() {
  const { events, status, paused, togglePause, bufferedCount } = usePauseable();
  const { filters, setFilters, clearFilters, applyFilters } = useFilters();
  const [selectedEvent, setSelectedEvent] = useState<AgentEvent | null>(null);

  // 候选项动态从当前 events 派生（DESC 顺序，转 Set 去重，再按字典序排）
  const sourceApps = useMemo(
    () => Array.from(new Set(events.map((e) => e.source_app))).sort(),
    [events],
  );
  const agentNames = useMemo(
    () => Array.from(new Set(events.map((e) => e.agent_name))).sort(),
    [events],
  );
  const eventTypes = useMemo(
    () => Array.from(new Set(events.map((e) => e.hook_event_type))).sort(),
    [events],
  );

  const filteredEvents = useMemo(
    () => applyFilters(events),
    [applyFilters, events],
  );

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
            {filteredEvents.length} / {events.length} events
          </span>
        </div>
        <ConnectionStatus status={status} />
      </header>

      <FilterPanel
        sourceApps={sourceApps}
        agentNames={agentNames}
        eventTypes={eventTypes}
        value={filters}
        onChange={setFilters}
        onClear={clearFilters}
        paused={paused}
        onTogglePause={togglePause}
        bufferedCount={bufferedCount}
      />

      <main className="min-h-0 flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <EmptyState status={status} />
        ) : filteredEvents.length === 0 ? (
          <NoMatchState onClear={clearFilters} />
        ) : (
          <ul className="divide-y divide-slate-800/60">
            {filteredEvents.map((ev) => (
              <EventRow key={ev.id} event={ev} onClick={setSelectedEvent} />
            ))}
          </ul>
        )}
      </main>

      <EventDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
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

function NoMatchState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-slate-400">
      <span className="text-3xl" aria-hidden>
        🔎
      </span>
      <p className="text-sm">没有匹配当前过滤条件的事件</p>
      <button
        type="button"
        onClick={onClear}
        className="rounded border border-slate-800 bg-slate-800 px-3 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-700"
      >
        清空过滤
      </button>
    </div>
  );
}
