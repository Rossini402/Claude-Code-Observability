// apps/server/src/http.ts
// Express 路由层：POST /events 落库 + 广播，GET /events/recent、/events/filter-options、/healthz。
// 协议见 docs/02-event-schema.md §3。

import express, { type Request, type Response } from 'express';
import {
  HOOK_EVENT_TYPES,
  type HookEventType,
  type IncomingEvent,
} from '@agent-obs/shared';
import { insertEvent, queryFilterOptions, queryRecent } from './db.js';
import { inferAgent, recordSessionAgent } from './infer-agent.js';
import { broadcast } from './ws.js';

/** 进程启动时刻，供 /healthz 计算 uptime。 */
const startedAt = Date.now();

/** HOOK_EVENT_TYPES 的 Set 形式，用于 O(1) 校验 hook_event_type 合法性。 */
const HOOK_EVENT_TYPE_SET = new Set<string>(HOOK_EVENT_TYPES);

/**
 * 创建并返回 Express 应用。
 * 由 index.ts 包到 http.Server 里，再挂 WebSocket。
 */
export function createApp(): express.Express {
  const app = express();

  // 全局 CORS：dashboard 在 :3000，server 在 :4000，浏览器需要跨域许可。
  // 手写实现，避免引入 cors 依赖。
  app.use((req: Request, res: Response, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // hook payload 偶尔会比较大（如长 stdout），放宽到 2mb。
  app.use(express.json({ limit: '2mb' }));

  // ---------------- /healthz ----------------
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, uptime_ms: Date.now() - startedAt });
  });

  // ---------------- POST /events ----------------
  app.post('/events', (req, res) => {
    try {
      const body = req.body as Record<string, unknown> | undefined;

      // 字段校验：任一不通过返回 400 + 明确错误信息。
      if (!body || typeof body !== 'object') {
        res.status(400).json({ error: 'invalid body' });
        return;
      }

      const sourceApp = body['source_app'];
      if (typeof sourceApp !== 'string' || sourceApp.length === 0) {
        res.status(400).json({ error: 'missing source_app' });
        return;
      }

      const sessionId = body['session_id'];
      if (typeof sessionId !== 'string' || sessionId.length === 0) {
        res.status(400).json({ error: 'missing session_id' });
        return;
      }

      const hookEventType = body['hook_event_type'];
      if (
        typeof hookEventType !== 'string' ||
        !HOOK_EVENT_TYPE_SET.has(hookEventType)
      ) {
        res.status(400).json({ error: 'invalid hook_event_type' });
        return;
      }

      const payload = body['payload'];
      if (
        payload === null ||
        typeof payload !== 'object' ||
        Array.isArray(payload)
      ) {
        res.status(400).json({ error: 'invalid payload' });
        return;
      }

      const tsRaw = body['timestamp'];
      const timestamp = typeof tsRaw === 'number' ? tsRaw : undefined;

      const incoming: IncomingEvent = {
        source_app: sourceApp,
        session_id: sessionId,
        hook_event_type: hookEventType as HookEventType,
        payload: payload as Record<string, unknown>,
        ...(timestamp !== undefined ? { timestamp } : {}),
      };

      // 推断 agent_name；inferAgent 内部会查 session 缓存。
      const agentName = inferAgent(incoming);

      // 关键顺序：SubagentStart / SessionStart 先写缓存，
      // 这样后续同一 session 的事件能命中 lookup。
      if (
        hookEventType === 'SubagentStart' ||
        hookEventType === 'SessionStart'
      ) {
        recordSessionAgent(sessionId, agentName);
      }

      const stored = insertEvent({ ...incoming, agent_name: agentName });

      broadcast(stored);

      res.json({ ok: true, id: stored.id });
    } catch (err) {
      // 内部异常按 docs/02 §3 要求：仍返回 200 ok:false，绝不阻塞 Claude Code。
      console.error('[POST /events] handler failed:', err);
      res.status(200).json({ ok: false });
    }
  });

  // ---------------- GET /events/recent ----------------
  app.get('/events/recent', (req, res) => {
    try {
      const q = req.query;

      const limitRaw = q['limit'];
      const beforeIdRaw = q['before_id'];
      const sourceAppRaw = q['source_app'];
      const agentNameRaw = q['agent_name'];
      const eventTypeRaw = q['event_type'];

      const query: Parameters<typeof queryRecent>[0] = {};

      if (typeof limitRaw === 'string' && limitRaw.length > 0) {
        const n = Number(limitRaw);
        if (Number.isFinite(n)) query.limit = n;
      }
      if (typeof beforeIdRaw === 'string' && beforeIdRaw.length > 0) {
        const n = Number(beforeIdRaw);
        if (Number.isFinite(n)) query.before_id = n;
      }
      if (typeof sourceAppRaw === 'string' && sourceAppRaw.length > 0) {
        query.source_app = sourceAppRaw;
      }
      if (typeof agentNameRaw === 'string' && agentNameRaw.length > 0) {
        query.agent_name = agentNameRaw;
      }
      if (typeof eventTypeRaw === 'string' && eventTypeRaw.length > 0) {
        query.event_type = eventTypeRaw;
      }

      const result = queryRecent(query);
      res.json(result);
    } catch (err) {
      console.error('[GET /events/recent] failed:', err);
      res.status(500).json({ error: 'internal error' });
    }
  });

  // ---------------- GET /events/filter-options ----------------
  app.get('/events/filter-options', (_req, res) => {
    try {
      const result = queryFilterOptions();
      res.json(result);
    } catch (err) {
      console.error('[GET /events/filter-options] failed:', err);
      res.status(500).json({ error: 'internal error' });
    }
  });

  return app;
}
