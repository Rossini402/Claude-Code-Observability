'use client';

import type { FilterState } from '@/hooks/useFilters';
import { type ViewMode, ViewModeToggle } from './ViewModeToggle';
import { type ViewType, ViewTypeToggle } from './ViewTypeToggle';

/**
 * 过滤面板（step 5b-2 + 5b-3 view mode toggle + 5b-4 view type toggle）
 * 不引外部 select / dropdown 库；多选用原生 <details>/<summary> 折叠
 *
 * 视图切换：
 *   - ViewTypeToggle（列表 / 泳道）始终显示
 *   - ViewModeToggle（合并 / 展开）仅在列表视图下显示
 */
export function FilterPanel({
  sourceApps,
  agentNames,
  eventTypes,
  value,
  onChange,
  onClear,
  paused,
  onTogglePause,
  bufferedCount,
  viewMode,
  onViewModeChange,
  viewType,
  onViewTypeChange,
}: {
  sourceApps: string[];
  agentNames: string[];
  eventTypes: string[];
  value: FilterState;
  onChange: (next: FilterState) => void;
  onClear: () => void;
  paused: boolean;
  onTogglePause: () => void;
  bufferedCount: number;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  viewType: ViewType;
  onViewTypeChange: (type: ViewType) => void;
}) {
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-900/50 px-6 py-2 backdrop-blur">
      <SelectField
        label="Source"
        value={value.source_app}
        options={sourceApps}
        onChange={(v) => onChange({ ...value, source_app: v })}
      />
      <SelectField
        label="Agent"
        value={value.agent_name}
        options={agentNames}
        onChange={(v) => onChange({ ...value, agent_name: v })}
      />
      <EventTypeMultiselect
        all={eventTypes}
        selected={value.event_types}
        onChange={(types) => onChange({ ...value, event_types: types })}
      />

      <input
        type="text"
        value={value.search}
        onChange={(e) => onChange({ ...value, search: e.target.value })}
        placeholder="搜索 payload / tool / prompt..."
        className="min-w-[260px] flex-1 rounded border border-slate-800 bg-slate-950 px-3 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:border-emerald-700 focus:outline-none"
      />

      <ViewTypeToggle value={viewType} onChange={onViewTypeChange} />
      {viewType === 'list' ? <ViewModeToggle value={viewMode} onChange={onViewModeChange} /> : null}

      <button
        type="button"
        onClick={onClear}
        className="rounded border border-slate-800 bg-slate-800 px-3 py-1 text-xs text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-700"
      >
        清空过滤
      </button>

      <button
        type="button"
        onClick={onTogglePause}
        className={
          paused
            ? 'rounded border border-red-800 bg-red-900/40 px-3 py-1 text-xs text-red-300 transition-colors hover:bg-red-900/60'
            : 'rounded border border-slate-800 bg-slate-800 px-3 py-1 text-xs text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-700'
        }
      >
        {paused ? `▶ 继续 (${bufferedCount} 条)` : '⏸ 暂停'}
      </button>
    </div>
  );
}

/** 原生 <select> + Tailwind 美化 */
function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="text-slate-500">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[200px] rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-200 focus:border-emerald-700 focus:outline-none"
      >
        <option value="all">All</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

/** 多选 checkbox 折叠面板：<details>/<summary> 实现，无外部 dropdown */
function EventTypeMultiselect({
  all,
  selected,
  onChange,
}: {
  all: string[];
  selected: string[];
  onChange: (types: string[]) => void;
}) {
  const selectedSet = new Set(selected);
  // 候选项可能少于 selected（events 没出现的类型不展示），summary 用候选项基准计算
  const presentChecked = all.filter((t) => selectedSet.has(t)).length;
  const allChecked = all.length > 0 && presentChecked === all.length;
  const noneChecked = presentChecked === 0;
  const summary = allChecked ? 'All' : noneChecked ? 'None' : `${presentChecked}/${all.length}`;

  const toggle = (type: string) => {
    if (selectedSet.has(type)) {
      onChange(selected.filter((t) => t !== type));
    } else {
      onChange([...selected, type]);
    }
  };

  // 全选 / 全不选：只针对当前候选项里的 type 操作，避免误改不在候选里的项
  const toggleAll = () => {
    if (allChecked) {
      onChange(selected.filter((t) => !selectedSet.has(t) || !all.includes(t)));
    } else {
      const merged = new Set(selected);
      for (const t of all) merged.add(t);
      onChange(Array.from(merged));
    }
  };

  return (
    <details className="relative text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded border border-slate-800 bg-slate-950 px-2 py-1 text-slate-200 hover:border-slate-600">
        <span className="text-slate-500">Type:</span>
        <span>{summary}</span>
        <span className="text-slate-500">▾</span>
      </summary>
      <div className="absolute left-0 top-full z-30 mt-1 max-h-72 w-56 overflow-y-auto rounded border border-slate-800 bg-slate-900 p-2 shadow-xl">
        <button
          type="button"
          onClick={toggleAll}
          className="mb-2 w-full rounded border border-slate-800 bg-slate-800 px-2 py-1 text-[11px] text-slate-300 transition-colors hover:bg-slate-700"
        >
          {allChecked ? '全不选' : '全选'}
        </button>
        {all.length === 0 ? (
          <p className="px-2 py-1 text-[11px] text-slate-500">暂无类型</p>
        ) : (
          all.map((t) => (
            <label
              key={t}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-slate-800"
            >
              <input
                type="checkbox"
                checked={selectedSet.has(t)}
                onChange={() => toggle(t)}
                className="accent-emerald-500"
              />
              <span className="text-slate-200">{t}</span>
            </label>
          ))
        )}
      </div>
    </details>
  );
}
