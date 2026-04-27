/**
 * 已知 Agent 列表，用于 UI 颜色映射与泳道排序。
 * 详见 docs/02-event-schema.md §4 和 docs/03-ui-spec.md §4.5。
 */
export const KNOWN_AGENTS = [
  'main',
  'pm-agent',
  'backend-agent',
  'frontend-agent',
  'test-agent',
  'reviewer-agent',
  // Claude Code 内置 sub-agent
  'general-purpose',
  'explore',
  'plan',
] as const;

export type KnownAgent = (typeof KNOWN_AGENTS)[number];

/** 主色映射（已知 agent 用固定色，未知 agent 由 useColors.ts 哈希兜底） */
export const AGENT_COLORS: Readonly<Record<KnownAgent, string>> = {
  main: '#64748b', // slate
  'pm-agent': '#8b5cf6',
  'backend-agent': '#3b82f6',
  'frontend-agent': '#10b981',
  'test-agent': '#f59e0b',
  'reviewer-agent': '#ec4899',
  'general-purpose': '#14b8a6',
  explore: '#6366f1',
  plan: '#84cc16',
};

/** 颜色调色板（未知 agent 用） */
export const AGENT_PALETTE = [
  '#8b5cf6',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#14b8a6',
  '#6366f1',
  '#84cc16',
  '#f97316',
] as const;

export const SOURCE_PALETTE = [
  '#fbbf24',
  '#34d399',
  '#60a5fa',
  '#a78bfa',
  '#f472b6',
  '#fb923c',
  '#22d3ee',
  '#a3e635',
] as const;
