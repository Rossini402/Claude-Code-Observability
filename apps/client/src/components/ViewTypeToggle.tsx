'use client';

export type ViewType = 'list' | 'swimlane';

/**
 * 顶层视图切换：列表 / 泳道
 * 与 ViewModeToggle（合并/展开）正交：列表视图内才显示 ViewModeToggle，
 * 泳道视图下隐藏。
 */
export function ViewTypeToggle({
  value,
  onChange,
}: {
  value: ViewType;
  onChange: (type: ViewType) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded border border-slate-800 text-xs">
      <Segment active={value === 'list'} onClick={() => onChange('list')}>
        列表
      </Segment>
      <Segment active={value === 'swimlane'} onClick={() => onChange('swimlane')}>
        泳道
      </Segment>
    </div>
  );
}

function Segment({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'bg-slate-800 px-3 py-1 text-emerald-300'
          : 'px-3 py-1 text-slate-400 transition-colors hover:bg-slate-800/50'
      }
    >
      {children}
    </button>
  );
}
