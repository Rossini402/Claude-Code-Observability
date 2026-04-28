'use client';

// Dashboard 主页（step 5b-4：列表 / 泳道 顶层视图切换）
// - 列表视图：合并 / 展开（5b-3 行为，未变）
// - 泳道视图：5b-4 新增，按 agent 分行的滚动窗口时间轴

import { ConnectionStatus } from '@/components/ConnectionStatus';
import { EventDetailModal } from '@/components/EventDetailModal';
import { EventRow } from '@/components/EventRow';
import { FilterPanel } from '@/components/FilterPanel';
import { PairedEventRow } from '@/components/PairedEventRow';
import { SwimlaneView } from '@/components/SwimlaneView';
import type { ViewMode } from '@/components/ViewModeToggle';
import type { ViewType } from '@/components/ViewTypeToggle';
import { useFilters } from '@/hooks/useFilters';
import { usePairedEvents } from '@/hooks/usePairedEvents';
import { usePauseable } from '@/hooks/usePauseable';
import type { AgentEvent, PairedEvent } from '@agent-obs/shared';
import { useMemo, useState } from 'react';

type ModalEvent = AgentEvent | PairedEvent;
type RenderItem = AgentEvent | PairedEvent;

export default function DashboardPage() {
  const { events, status, paused, togglePause, bufferedCount, frozenAt } = usePauseable();
  const { filters, setFilters, clearFilters, applyFilters } = useFilters();
  const [selectedEvent, setSelectedEvent] = useState<ModalEvent | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('merged');
  const [viewType, setViewType] = useState<ViewType>('list');

  // 候选项动态从当前 events 派生
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

  const filteredEvents = useMemo(() => applyFilters(events), [applyFilters, events]);

  // 始终算 paired list（useMemo 依赖 filteredEvents，view 切换时不重算）
  const pairedList = usePairedEvents(filteredEvents);

  const renderList: RenderItem[] = viewMode === 'merged' ? pairedList : filteredEvents;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950/80 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="text-xl" role="img" aria-label="agent">
            🤖
          </span>
          <h1 className="text-base font-semibold text-slate-100">Agent Observability</h1>
          <span className="ml-2 text-xs text-slate-500 tabular-nums">
            {filteredEvents.length} / {events.length} events
            {viewType === 'list' && viewMode === 'merged' ? ` · ${renderList.length} rows` : null}
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
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        viewType={viewType}
        onViewTypeChange={setViewType}
      />

      <main
        className={
          viewType === 'swimlane'
            ? 'min-h-0 flex-1 overflow-hidden'
            : 'min-h-0 flex-1 overflow-y-auto'
        }
      >
        {events.length === 0 ? (
          <EmptyState status={status} />
        ) : filteredEvents.length === 0 ? (
          <NoMatchState onClear={clearFilters} />
        ) : viewType === 'swimlane' ? (
          <SwimlaneView items={pairedList} paused={paused} frozenAt={frozenAt} />
        ) : (
          <ul className="divide-y divide-slate-800/60">
            {renderList.map((item) =>
              isPaired(item) ? (
                <PairedEventRow
                  key={`p-${item.pre_event.id}`}
                  pairedEvent={item}
                  onClick={setSelectedEvent}
                />
              ) : (
                <EventRow key={item.id} event={item} onClick={setSelectedEvent} />
              ),
            )}
          </ul>
        )}
      </main>

      <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  );
}

function isPaired(item: RenderItem): item is PairedEvent {
  return (item as PairedEvent).kind === 'paired';
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
          跑<code className="ml-1 rounded bg-slate-900 px-1.5 py-0.5 text-emerald-300">claude</code>
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
