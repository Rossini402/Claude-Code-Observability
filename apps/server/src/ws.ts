// apps/server/src/ws.ts
// WebSocket 广播层：负责把新事件实时推给所有连接的 dashboard。
// 协议见 docs/02-event-schema.md §5。

import type { Server } from 'node:http';
import type { AgentEvent, WsMessage } from '@agent-obs/shared';
import { WebSocket, WebSocketServer } from 'ws';

/** 心跳间隔（毫秒）。client 30s 没收到任何消息就视为断线。 */
const PING_INTERVAL_MS = 30_000;

/** 模块级单例 WebSocketServer，由 attachWebSocket 初始化后供 broadcast 复用。 */
let wss: WebSocketServer | null = null;

/** 心跳定时器，避免重复启动。 */
let pingTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 把 WebSocketServer 挂到已有的 http.Server 上，共用同一个端口。
 * 路径固定为 /stream（见 docs/02 §5）。
 */
export function attachWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: '/stream' });

  wss.on('connection', (socket) => {
    // 新连接立即下发 hello 消息，让 client 知道连上了。
    sendTo(socket, { type: 'hello', data: { server_time: Date.now() } });
  });

  // 启动 30s 心跳广播；保留定时器引用便于潜在的清理。
  if (!pingTimer) {
    pingTimer = setInterval(() => {
      broadcastMessage({ type: 'ping', data: { ts: Date.now() } });
    }, PING_INTERVAL_MS);
  }
}

/**
 * 把一条新事件广播给所有连接的 client。
 * 由 http 层在 POST /events 落库成功后调用。
 */
export function broadcast(event: AgentEvent): void {
  broadcastMessage({ type: 'event', data: event });
}

// ---------------- 内部 helpers ----------------

/** 序列化并向所有 OPEN 状态的 client 发送一条 WsMessage。 */
function broadcastMessage(message: WsMessage): void {
  if (!wss) return;
  const payload = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

/** 单点发送：仅在 socket 处于 OPEN 时发，避免抛错。 */
function sendTo(socket: WebSocket, message: WsMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}
