'use client';

import type { AgentEvent } from '@agent-obs/shared';
import { HOOK_EVENT_TYPES } from '@agent-obs/shared';
import { useCallback, useState } from 'react';

/**
 * Dashboard 过滤条件状态
 * - source_app / agent_name 用 'all' 表示不过滤；其他值精确匹配
 * - event_types 默认包含所有 12 种 hook 类型；用户在 UI 里勾选取消
 * - search 任意子串，按多字段拼接后做 includes，**大小写不敏感**
 */
export interface FilterState {
  source_app: string;
  agent_name: string;
  event_types: string[];
  search: string;
}

/** 默认过滤条件：全部放行 */
export const DEFAULT_FILTERS: FilterState = {
  source_app: 'all',
  agent_name: 'all',
  event_types: [...HOOK_EVENT_TYPES],
  search: '',
};

/** 搜索 payload 时只取前 N 字符做包含匹配，避免巨型 payload 拖慢 */
const SEARCH_PAYLOAD_CAP = 2000;

export function useFilters(): {
  filters: FilterState;
  setFilters: (next: FilterState) => void;
  clearFilters: () => void;
  applyFilters: (events: AgentEvent[]) => AgentEvent[];
} {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const applyFilters = useCallback(
    (events: AgentEvent[]): AgentEvent[] => {
      const eventTypeSet = new Set(filters.event_types);
      const search = filters.search.trim().toLowerCase();
      const filterSource = filters.source_app;
      const filterAgent = filters.agent_name;

      return events.filter((ev) => {
        if (filterSource !== 'all' && ev.source_app !== filterSource) return false;
        if (filterAgent !== 'all' && ev.agent_name !== filterAgent) return false;
        if (!eventTypeSet.has(ev.hook_event_type)) return false;

        if (search) {
          let payloadStr = '';
          try {
            payloadStr = JSON.stringify(ev.payload).slice(0, SEARCH_PAYLOAD_CAP);
          } catch {
            // payload 序列化失败就忽略，仅用其他字段搜
          }
          const haystack = `${ev.source_app} ${ev.agent_name} ${ev.hook_event_type} ${
            ev.tool_name ?? ''
          } ${payloadStr}`.toLowerCase();
          if (!haystack.includes(search)) return false;
        }

        return true;
      });
    },
    [filters],
  );

  return { filters, setFilters, clearFilters, applyFilters };
}
