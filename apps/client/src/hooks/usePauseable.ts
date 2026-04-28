'use client';

import type { AgentEvent } from '@agent-obs/shared';
import { useCallback, useMemo, useState } from 'react';
import { type ConnectionStatus, useEventStream } from './useEventStream';

/**
 * 包装 useEventStream，加暂停能力
 *
 * 实现思路：
 *   - useEventStream 内部持续维护 liveEvents（最新值）；本 hook 不修改它
 *   - paused=true 时：捕获 liveEvents 的当前快照 frozenEvents，UI 看快照
 *   - paused=false 切换瞬间：丢弃快照，UI 直接看 liveEvents（已包含暂停期间到达的）
 *   - bufferedCount = liveEvents 中 id 比快照最大 id 还大的事件数
 *
 * 这样不需要在 useEventStream 内部开新通道、不修改其他文件，
 * 行为上与「buffer + merge」语义等价：暂停时新事件累积，恢复时一次性可见。
 */
export function usePauseable(): {
  events: AgentEvent[];
  status: ConnectionStatus;
  paused: boolean;
  togglePause: () => void;
  bufferedCount: number;
  /** 暂停瞬间记录的时间戳，未暂停时为 null。SwimlaneView 用它冻结时间轴。 */
  frozenAt: number | null;
} {
  const { events: liveEvents, status } = useEventStream();
  const [paused, setPaused] = useState(false);
  const [frozenEvents, setFrozenEvents] = useState<AgentEvent[] | null>(null);
  const [frozenAt, setFrozenAt] = useState<number | null>(null);

  const togglePause = useCallback(() => {
    setPaused((prev) => {
      const willPause = !prev;
      if (willPause) {
        // 暂停瞬间：用闭包里的 liveEvents 快照视图，并记录冻结时刻
        setFrozenEvents(liveEvents);
        setFrozenAt(Date.now());
      } else {
        // 恢复瞬间：丢弃快照与冻结时间，UI 自然回到实时视图
        setFrozenEvents(null);
        setFrozenAt(null);
      }
      return willPause;
    });
  }, [liveEvents]);

  // 暂停时 UI 显示的是冻结快照
  const events = paused && frozenEvents !== null ? frozenEvents : liveEvents;

  const bufferedCount = useMemo(() => {
    if (!paused || frozenEvents === null) return 0;
    if (frozenEvents.length === 0) return liveEvents.length;
    // useEventStream 维护 events 按 id DESC，因此 [0] 就是最大 id
    const maxFrozenId = frozenEvents[0]?.id ?? Number.NEGATIVE_INFINITY;
    let count = 0;
    for (const e of liveEvents) {
      if (e.id > maxFrozenId) count += 1;
      else break; // DESC 顺序：碰到不大的就可以提前停
    }
    return count;
  }, [paused, frozenEvents, liveEvents]);

  return { events, status, paused, togglePause, bufferedCount, frozenAt };
}
