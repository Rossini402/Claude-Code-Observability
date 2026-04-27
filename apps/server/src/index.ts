// apps/server/src/index.ts
// 入口：启动 HTTP（Express）+ WebSocket（ws），共用同一端口。
// 启动顺序见 docs/01-architecture.md §3。

import http from 'node:http';
import { env } from './env.js';
import { loadSessionAgents } from './db.js';
import { createApp } from './http.js';
import { attachWebSocket } from './ws.js';
import { rebuildSessionMap } from './infer-agent.js';

// 1. 从 DB 重建 session_id → agent_name 的内存映射。
//    db.ts 在 import 阶段会自动建表，即使 events.db 不存在也不会抛错。
const rows = loadSessionAgents();
rebuildSessionMap(rows);

// 2. 创建 http.Server 并挂载 Express 应用。
const app = createApp();
const server = http.createServer(app);

// 3. 把 WebSocket 挂到同一个 server 上（路径 /stream）。
attachWebSocket(server);

// 4. 监听端口；启动横幅打印关键地址，便于一眼确认服务就绪。
server.listen(env.PORT, () => {
  const httpUrl = `http://localhost:${env.PORT}`;
  const wsUrl = `ws://localhost:${env.PORT}/stream`;
  console.log('[agent-obs/server] 启动成功');
  console.log(`  HTTP      : ${httpUrl}`);
  console.log(`  WebSocket : ${wsUrl}`);
  console.log(`  DB        : ${env.DB_PATH}`);
  console.log(`  会话缓存恢复: ${rows.length} 条`);
});
