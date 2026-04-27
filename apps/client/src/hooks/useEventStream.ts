'use client';

import { useEffect, useRef, useState } from 'react';
import type { AgentEvent, WsMessage } from '@agent-obs/shared';
import { fetchRecent } from '@/lib/api';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

const HTTP_BASE = process.env.NEXT_PUBLIC_SERVER_HTTP ?? 'http://localhost:4000';
const WS_URL = process.env.NEXT_PUBLIC_SERVER_WS ?? 'ws://localhost:4000/stream';
const MAX_DISPLAY = Number(process.env.NEXT_PUBLIC_MAX_EVENTS_DISPLAY ?? 500);
const INITIAL_FETCH_LIMIT = 200;

/** 重连退避：1s, 2s, 4s, 8s, 封顶 10s */
function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 10000);
}

/**
 * 合并新一批事件到当前列表：去重（按 id），按 id 降序，截到 MAX_DISPLAY
 * 用作初始 fetch 和重连后 refetch 的合并函数，确保不漏事件、不重复
 */
function mergeEvents(current: AgentEvent[], incoming: AgentEvent[]): AgentEvent[] {
  const map = new Map<number, AgentEvent>();
  for (const e of incoming) map.set(e.id, e);
  for (const e of current) map.set(e.id, e);
  const merged = Array.from(map.values()).sort((a, b) => b.id - a.id);
  return merged.length > MAX_DISPLAY ? merged.slice(0, MAX_DISPLAY) : merged;
}

/**
 * Dashboard 事件源：
 * 1. mount 时拉历史
 * 2. WebSocket 实时推送
 * 3. 断线指数退避重连，重连成功后再拉一次历史防止漏事件
 */
export function useEventStream(): {
  events: AgentEvent[];
  status: ConnectionStatus;
} {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  // 用 ref 保留可变状态，effect 内使用而不触发 re-render
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    const refetch = async () => {
      try {
        const data = await fetchRecent(HTTP_BASE, INITIAL_FETCH_LIMIT);
        if (cancelledRef.current) return;
        setEvents((prev) => mergeEvents(prev, data.events));
      } catch (err) {
        console.warn('[useEventStream] fetchRecent failed:', err);
      }
    };

    const handleMessage = (raw: string) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(raw) as WsMessage;
      } catch (err) {
        console.warn('[useEventStream] bad ws json:', err);
        return;
      }

      if (msg.type === 'event') {
        setEvents((prev) => {
          // 服务端是 id 自增的，理论上不会重复；防御性检查
          if (prev.some((e) => e.id === msg.data.id)) return prev;
          const next = [msg.data, ...prev];
          return next.length > MAX_DISPLAY ? next.slice(0, MAX_DISPLAY) : next;
        });
      } else if (msg.type === 'hello') {
        console.log('[useEventStream] hello:', msg.data);
      } else if (msg.type === 'ping') {
        console.log('[useEventStream] ping:', msg.data);
      }
    };

    const connect = () => {
      if (cancelledRef.current) return;
      setStatus('connecting');

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        if (cancelledRef.current) {
          ws.close();
          return;
        }
        attemptRef.current = 0;
        setStatus('open');
        // 重连成功后重新拉历史，弥补断线期间漏掉的事件
        void refetch();
      });

      ws.addEventListener('message', (e) => {
        handleMessage(typeof e.data === 'string' ? e.data : '');
      });

      ws.addEventListener('error', (e) => {
        console.warn('[useEventStream] ws error:', e);
      });

      ws.addEventListener('close', () => {
        wsRef.current = null;
        if (cancelledRef.current) return;
        setStatus('closed');
        const delay = backoffMs(attemptRef.current);
        attemptRef.current += 1;
        console.log(
          `[useEventStream] ws closed; reconnect in ${delay}ms (attempt #${attemptRef.current})`,
        );
        reconnectTimerRef.current = setTimeout(connect, delay);
      });
    };

    // 启动：先拉历史，再连 WebSocket
    void refetch();
    connect();

    return () => {
      cancelledRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      const ws = wsRef.current;
      if (ws) {
        wsRef.current = null;
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return { events, status };
}
