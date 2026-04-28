'use client';

import type { BlockLayout, BlockStatus } from '@/hooks/useSwimlaneLayout';
import { agentColor, sourceColor } from '@/lib/colors';
import React from 'react';

const STATUS_ICON: Record<BlockStatus, string> = {
  success: '✅',
  failure: '❌',
  running: '⏳',
  single: '',
};

/** 块宽度 ≥ 此值才显示文字 label，否则只渲染图标（防止 6px 块内挤文字） */
const MIN_LABEL_WIDTH = 32;

/**
 * 单个事件色块。绝对定位在 SwimlaneRow 的时间轴容器中。
 *
 * 视觉规则：
 *   - 背景：agentColor 半透明（success 更实，running 更淡）
 *   - 左边缘 3px 竖条：sourceColor
 *   - 边框：success 实线 / running 虚线 / failure 红色
 *   - 左上角图标：✅/❌/⏳；single 无图标
 */
export const EventBlock = React.memo(function EventBlock({
  layout,
}: {
  layout: BlockLayout;
}) {
  const bg = agentColor(layout.agent_name);
  const stripe = sourceColor(layout.source_app);
  const icon = STATUS_ICON[layout.status];
  const showLabel = layout.width >= MIN_LABEL_WIDTH;

  const isFailure = layout.status === 'failure';
  const isRunning = layout.status === 'running';

  const tooltip = `${layout.agent_name} · ${layout.source_app}\n${layout.label}`;

  return (
    <div
      title={tooltip}
      className="absolute top-2 h-8 overflow-hidden rounded-sm font-mono text-[10px] leading-7 text-slate-50"
      style={{
        left: `${layout.left}px`,
        width: `${layout.width}px`,
        backgroundColor: isFailure ? 'rgba(127, 29, 29, 0.55)' : `${bg}66`,
        border: isFailure
          ? '1px solid rgba(248, 113, 113, 0.85)'
          : isRunning
            ? `1px dashed ${bg}cc`
            : `1px solid ${bg}aa`,
        borderLeft: `3px solid ${stripe}`,
      }}
    >
      <span className="block truncate px-1">
        {icon ? <span className="mr-1">{icon}</span> : null}
        {showLabel ? layout.label : ''}
      </span>
    </div>
  );
});
