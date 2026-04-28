'use client';

import type { BlockLayout } from '@/hooks/useSwimlaneLayout';
import { agentColor } from '@/lib/colors';
import { EventBlock } from './EventBlock';

/**
 * 单条 agent 泳道：左 140px 名字列 + 右 弹性时间轴
 * 时间轴是 relative 容器，EventBlock 用 absolute left/width 定位。
 */
export function SwimlaneRow({
  agentName,
  blocks,
  isMain,
}: {
  agentName: string;
  blocks: BlockLayout[];
  isMain: boolean;
}) {
  const dot = agentColor(agentName);
  const empty = blocks.length === 0;

  return (
    <div className="flex items-stretch border-b border-slate-800/60 px-6">
      <div className="flex w-[140px] shrink-0 items-center gap-2 py-2">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: dot }}
          aria-hidden
        />
        <span className="truncate font-mono text-[12px] text-slate-200" title={agentName}>
          {agentName}
        </span>
      </div>
      <div className="relative h-12 flex-1">
        {empty && isMain ? (
          <span className="absolute inset-0 flex items-center text-[11px] italic text-slate-600">
            waiting for events…
          </span>
        ) : null}
        {blocks.map((b) => (
          <EventBlock key={b.key} layout={b} />
        ))}
      </div>
    </div>
  );
}
