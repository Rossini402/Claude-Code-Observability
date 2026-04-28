'use client';

import { useNow } from '@/hooks/useNow';
import { useSwimlaneLayout } from '@/hooks/useSwimlaneLayout';
import type { AgentEvent, PairedEvent } from '@agent-obs/shared';
import { useEffect, useRef, useState } from 'react';
import { SwimlaneRow } from './SwimlaneRow';

/**
 * 主泳道视图。直接消费 pairedList（已合并 Pre/Post），按 agent 分行展示色块。
 *
 * 时间轴：固定 5 分钟滚动窗口，右边缘 = now（live tick / paused 时取 frozenAt）。
 * 容器宽度通过 ResizeObserver 测量时间轴 header 的 flex-1 区域；行内的 flex-1
 * 与 header 共享 px-6 + 左 140px 布局，宽度自动对齐。
 *
 * v1 不做：横向滚动 / 拖拽时间轴 / 跳转任意时间 / 块点击交互
 */
export function SwimlaneView({
  items,
  paused,
  frozenAt,
}: {
  items: ReadonlyArray<PairedEvent | AgentEvent>;
  paused: boolean;
  frozenAt: number | null;
}) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // 暂停时停 useNow tick；frozenAt 接管 now，时间轴冻结
  const liveNow = useNow(1000, !paused);
  const now = paused && frozenAt !== null ? frozenAt : liveNow;

  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = e.contentRect.width;
        setWidth((prev) => (prev === w ? prev : w));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { rows } = useSwimlaneLayout(items, now, width);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex shrink-0 items-center border-b border-slate-800/60 bg-slate-950/40 px-6 py-1">
        <div className="w-[140px] shrink-0 text-[10px] uppercase tracking-wide text-slate-500">
          Agent
        </div>
        <div
          ref={timelineRef}
          className="flex flex-1 justify-between font-mono text-[10px] text-slate-500 tabular-nums"
        >
          <span>-5m</span>
          <span>-2.5m</span>
          <span>now{paused ? ' (paused)' : ''}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {rows.map((r) => (
          <SwimlaneRow
            key={r.agent_name}
            agentName={r.agent_name}
            blocks={r.blocks}
            isMain={r.agent_name === 'main'}
          />
        ))}
      </div>
    </div>
  );
}
