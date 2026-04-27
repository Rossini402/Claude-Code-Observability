'use client';

export type ViewMode = 'merged' | 'expanded';

/**
 * 段控件：合并 / 展开切换
 */
export function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded border border-slate-800 text-xs">
      <Segment active={value === 'merged'} onClick={() => onChange('merged')}>
        合并
      </Segment>
      <Segment
        active={value === 'expanded'}
        onClick={() => onChange('expanded')}
      >
        展开
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
