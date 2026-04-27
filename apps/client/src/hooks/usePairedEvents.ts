'use client';

import { useMemo } from 'react';
import type { AgentEvent, PairedEvent } from '@agent-obs/shared';

/**
 * 把事件流里的 (PreToolUse, PostToolUse) 和 (SubagentStart, SubagentStop) 合并成 PairedEvent
 *
 * 配对算法：
 *   - 同 session_id 才配
 *   - PreToolUse / PostToolUse(Failure) 用 payload.tool_use_id 配对
 *   - SubagentStart / SubagentStop 用 payload.subagent_type 配对（同 session 取最近一对）
 *   - 没 tool_use_id 的 Pre/Post 退化为单独事件，不参与配对
 *   - 找不到 Pre 的 Post 也单独显示（输出里是原始 AgentEvent）
 *   - 找不到 Post 的 Pre：配为 PairedEvent，post_event=null，status='running'；
 *     'running' vs 'timeout' 由 PairedEventRow 用 useNow 实时判断（避免本 hook 依赖时间导致频繁重算）
 *
 * 输出按"代表时间"DESC 排序：PairedEvent 用 pre.timestamp，AgentEvent 用自身 timestamp
 */
export function usePairedEvents(events: AgentEvent[]): (PairedEvent | AgentEvent)[] {
  return useMemo(() => pair(events), [events]);
}

function pair(events: AgentEvent[]): (PairedEvent | AgentEvent)[] {
  // events 进来通常是 id DESC（useEventStream 的约定）；配对要按时间正向走
  const asc = [...events].sort((a, b) => a.id - b.id);

  // key = `${session_id}|${type}:${marker}`，type 区分 tool_use / subagent
  const cache = new Map<string, AgentEvent>();
  const out: (PairedEvent | AgentEvent)[] = [];

  for (const ev of asc) {
    const p = ev.payload as Record<string, unknown>;

    if (ev.hook_event_type === 'PreToolUse') {
      const tu = readString(p, 'tool_use_id');
      if (tu) {
        cache.set(`${ev.session_id}|tu:${tu}`, ev);
      } else {
        // 没 tool_use_id 不能配对，作为单独事件输出
        out.push(ev);
      }
      continue;
    }

    if (
      ev.hook_event_type === 'PostToolUse' ||
      ev.hook_event_type === 'PostToolUseFailure'
    ) {
      const tu = readString(p, 'tool_use_id');
      if (tu) {
        const key = `${ev.session_id}|tu:${tu}`;
        const pre = cache.get(key);
        if (pre) {
          cache.delete(key);
          const status: PairedEvent['status'] = isFailureEvent(ev)
            ? 'failure'
            : 'success';
          out.push({
            kind: 'paired',
            pair_type: 'tool_use',
            pre_event: pre,
            post_event: ev,
            duration_ms: ev.timestamp - pre.timestamp,
            status,
          });
        } else {
          // Orphan Post：没有 Pre 可配。退化成原始事件渲染。
          // 注：⚠️ orphan 视觉标记需要 EventRow 改造，本步范围外（见副作用清单）
          out.push(ev);
        }
      } else {
        out.push(ev);
      }
      continue;
    }

    if (ev.hook_event_type === 'SubagentStart') {
      const sa = readString(p, 'subagent_type');
      if (sa) {
        cache.set(`${ev.session_id}|sa:${sa}`, ev);
      } else {
        out.push(ev);
      }
      continue;
    }

    if (ev.hook_event_type === 'SubagentStop') {
      const sa = readString(p, 'subagent_type');
      if (sa) {
        const key = `${ev.session_id}|sa:${sa}`;
        const pre = cache.get(key);
        if (pre) {
          cache.delete(key);
          out.push({
            kind: 'paired',
            pair_type: 'subagent',
            pre_event: pre,
            post_event: ev,
            duration_ms: ev.timestamp - pre.timestamp,
            status: 'success',
          });
        } else {
          out.push(ev);
        }
      } else {
        out.push(ev);
      }
      continue;
    }

    // 其他 9 种事件（SessionStart/End、UserPromptSubmit、Notification、Stop、PermissionRequest、PreCompact）原样输出
    out.push(ev);
  }

  // 还留在 cache 里的 Pre 全是"找不到 Post"的：emit 为 PairedEvent，post_event=null
  // status='running' 是占位；PairedEventRow 用 useNow 决定渲染 ⏳ 还是 ⚠️ timeout
  for (const pre of cache.values()) {
    out.push({
      kind: 'paired',
      pair_type:
        pre.hook_event_type === 'PreToolUse' ? 'tool_use' : 'subagent',
      pre_event: pre,
      post_event: null,
      duration_ms: null,
      status: 'running',
    });
  }

  // 按代表时间 DESC 排回最新在前
  out.sort((a, b) => repTime(b) - repTime(a));
  return out;
}

function repTime(item: PairedEvent | AgentEvent): number {
  return isPaired(item) ? item.pre_event.timestamp : item.timestamp;
}

function isPaired(item: PairedEvent | AgentEvent): item is PairedEvent {
  return (item as PairedEvent).kind === 'paired';
}

function readString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * 判定 PostToolUse 是否为失败：
 *   - hook_event_type === 'PostToolUseFailure'
 *   - payload.tool_response.is_error === true
 *   - payload.tool_response.error 存在且 truthy
 *   - payload.tool_response.status 含 error/fail 子串
 */
function isFailureEvent(ev: AgentEvent): boolean {
  if (ev.hook_event_type === 'PostToolUseFailure') return true;
  const p = ev.payload as Record<string, unknown>;
  const tr = p.tool_response;
  if (!tr || typeof tr !== 'object') return false;
  const trObj = tr as Record<string, unknown>;
  if (trObj.is_error === true) return true;
  if (trObj.error) return true;
  const status = trObj.status;
  if (typeof status === 'string' && /error|fail/i.test(status)) return true;
  return false;
}
