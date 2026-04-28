'use client';

import { KNOWN_AGENTS } from '@agent-obs/shared';
import type { AgentEvent, PairedEvent } from '@agent-obs/shared';
import { useMemo } from 'react';

/** 时间窗口固定 5 分钟（v1 不可调） */
const WINDOW_MS = 5 * 60 * 1000;

/** 单个色块最小宽度（保证瞬时事件可见） */
const MIN_BLOCK_PX = 6;

/**
 * 色块状态：
 * - success/failure：已完成的 paired 事件
 * - running：Pre 已发但 Post 未到（block 右沿延伸到 now）
 * - single：未配对的单条事件（无完成图标）
 */
export type BlockStatus = 'success' | 'failure' | 'running' | 'single';

export interface BlockLayout {
  /** 渲染 key；paired 用 pre.id，单条用 ev.id */
  key: string;
  item: PairedEvent | AgentEvent;
  agent_name: string;
  source_app: string;
  /** 像素，相对于时间轴容器左边 */
  left: number;
  width: number;
  status: BlockStatus;
  /** 块内显示文本：tool_name 或 subagent_type */
  label: string;
}

export interface AgentRow {
  agent_name: string;
  blocks: BlockLayout[];
  /** 当前窗口内是否有事件；用于 main 行渲染 "waiting…" 占位 */
  hasEvents: boolean;
}

export interface SwimlaneLayout {
  rows: AgentRow[];
  windowStart: number;
  windowEnd: number;
}

/**
 * 把 pairedList 投影成"按 agent 分组的色块布局"。
 *
 * 排序规则（详见 03-ui-spec.md §4.5）：
 *   1. main 永远第一行（即使无事件也显示，行内显示 "waiting for events…"）
 *   2. 其他已知 agent 按 KNOWN_AGENTS 顺序
 *   3. 未知 agent 字典序追加在后面
 *   4. 当前窗口内无事件的非 main agent 不显示
 *
 * 时间轴坐标系：
 *   left = (rep_time - windowStart) / WINDOW_MS * containerWidth
 *   width = (end_time - rep_time) / WINDOW_MS * containerWidth, 至少 MIN_BLOCK_PX
 *   超出窗口的事件直接不渲染
 *
 * @param items pairedList（已合并 Pre/Post、Subagent Start/Stop）
 * @param now 时间轴右边缘对应的时间戳；paused 时由 caller 传 frozenAt
 * @param containerWidth 时间轴容器像素宽（来自 ResizeObserver）；为 0 时跳过定位但仍返回 rows
 */
export function useSwimlaneLayout(
  items: ReadonlyArray<PairedEvent | AgentEvent>,
  now: number,
  containerWidth: number,
): SwimlaneLayout {
  return useMemo(() => computeLayout(items, now, containerWidth), [items, now, containerWidth]);
}

function computeLayout(
  items: ReadonlyArray<PairedEvent | AgentEvent>,
  now: number,
  containerWidth: number,
): SwimlaneLayout {
  const windowStart = now - WINDOW_MS;
  const byAgent = new Map<string, BlockLayout[]>();

  // main 永远存在
  byAgent.set('main', []);

  if (containerWidth > 0) {
    for (const item of items) {
      const layout = blockFor(item, now, windowStart, containerWidth);
      if (!layout) continue;
      let arr = byAgent.get(layout.agent_name);
      if (!arr) {
        arr = [];
        byAgent.set(layout.agent_name, arr);
      }
      arr.push(layout);
    }
  }

  const rows: AgentRow[] = [];
  const agentNames = Array.from(byAgent.keys()).sort(compareAgents);
  for (const name of agentNames) {
    const blocks = byAgent.get(name) ?? [];
    if (name === 'main' || blocks.length > 0) {
      rows.push({
        agent_name: name,
        blocks,
        hasEvents: blocks.length > 0,
      });
    }
  }

  return { rows, windowStart, windowEnd: now };
}

function blockFor(
  item: PairedEvent | AgentEvent,
  now: number,
  windowStart: number,
  containerWidth: number,
): BlockLayout | null {
  let rep: number;
  let end: number;
  let status: BlockStatus;
  let label: string;
  let agent_name: string;
  let source_app: string;
  let key: string;

  if (isPaired(item)) {
    rep = item.pre_event.timestamp;
    end = item.post_event ? item.post_event.timestamp : now;
    if (item.post_event === null) status = 'running';
    else if (item.status === 'failure') status = 'failure';
    else status = 'success';
    label =
      item.pair_type === 'subagent'
        ? (readString(item.pre_event.payload, 'subagent_type') ?? 'subagent')
        : (item.pre_event.tool_name ?? 'tool');
    agent_name = item.pre_event.agent_name;
    source_app = item.pre_event.source_app;
    key = `p-${item.pre_event.id}`;
  } else {
    rep = item.timestamp;
    end = item.timestamp;
    status = item.hook_event_type === 'PostToolUseFailure' ? 'failure' : 'single';
    label = item.tool_name ?? item.hook_event_type;
    agent_name = item.agent_name;
    source_app = item.source_app;
    key = `e-${item.id}`;
  }

  // 完全不在窗口内 → 跳过
  // 注：对运行中的 PairedEvent（post=null），end 强制取 now，永远满足 end>=windowStart，
  // 因此必须额外检查 rep < windowStart，否则 rep 在窗口外的 orphan running 块会从
  // windowStart 一路画到 now，霸占整条泳道。
  if (rep < windowStart) return null;
  if (end < windowStart) return null;
  if (rep > now) return null;

  const visibleStart = Math.max(rep, windowStart);
  const visibleEnd = Math.min(end, now);

  let left = ((visibleStart - windowStart) / WINDOW_MS) * containerWidth;
  let width = ((visibleEnd - visibleStart) / WINDOW_MS) * containerWidth;
  width = Math.max(MIN_BLOCK_PX, width);
  if (left < 0) left = 0;
  if (left + width > containerWidth) {
    width = Math.max(MIN_BLOCK_PX, containerWidth - left);
    if (left + width > containerWidth) {
      // 兜底：完全顶到右边
      left = Math.max(0, containerWidth - MIN_BLOCK_PX);
      width = MIN_BLOCK_PX;
    }
  }

  return {
    key,
    item,
    agent_name,
    source_app,
    left,
    width,
    status,
    label,
  };
}

function isPaired(item: PairedEvent | AgentEvent): item is PairedEvent {
  return (item as PairedEvent).kind === 'paired';
}

function readString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function knownIndex(name: string): number {
  const i = (KNOWN_AGENTS as readonly string[]).indexOf(name);
  return i === -1 ? Number.POSITIVE_INFINITY : i;
}

function compareAgents(a: string, b: string): number {
  if (a === b) return 0;
  if (a === 'main') return -1;
  if (b === 'main') return 1;
  const ai = knownIndex(a);
  const bi = knownIndex(b);
  if (ai !== bi) return ai - bi;
  return a.localeCompare(b);
}
