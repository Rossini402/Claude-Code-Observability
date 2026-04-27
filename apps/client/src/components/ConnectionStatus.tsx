'use client';

import type { ConnectionStatus as Status } from '@/hooks/useEventStream';

const TEXT: Record<Status, string> = {
  connecting: '连接中',
  open: 'Live',
  closed: '已断开',
};

const DOT_CLASS: Record<Status, string> = {
  connecting: 'bg-amber-400',
  open: 'bg-emerald-400 animate-pulse',
  closed: 'bg-rose-500',
};

const TEXT_CLASS: Record<Status, string> = {
  connecting: 'text-amber-300',
  open: 'text-emerald-300',
  closed: 'text-rose-300',
};

export function ConnectionStatus({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-xs font-medium ${TEXT_CLASS[status]}`}
      title={`WebSocket ${status}`}
    >
      <span className={`h-2 w-2 rounded-full ${DOT_CLASS[status]}`} />
      {TEXT[status]}
    </span>
  );
}
