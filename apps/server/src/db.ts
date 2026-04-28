/**
 * SQLite 持久化层
 * Schema 与容量管理见 docs/02-event-schema.md §2
 */
import fs from 'node:fs';
import path from 'node:path';
import type {
  AgentEvent,
  FilterOptionsResponse,
  HookEventType,
  IncomingEvent,
  RecentEventsResponse,
} from '@agent-obs/shared';
import Database from 'better-sqlite3';
import { env } from './env.js';

// 确保 DB 文件父目录存在
fs.mkdirSync(path.dirname(env.DB_PATH), { recursive: true });

// 打开数据库（不导出 db handle）
const db = new Database(env.DB_PATH);

// WAL 模式：读不阻塞写、写不阻塞读
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// 建表与索引
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_app      TEXT    NOT NULL,
    session_id      TEXT    NOT NULL,
    agent_name      TEXT    NOT NULL,
    hook_event_type TEXT    NOT NULL,
    tool_name       TEXT,
    payload         TEXT    NOT NULL,
    timestamp       INTEGER NOT NULL,
    created_at      INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_session     ON events(session_id);
  CREATE INDEX IF NOT EXISTS idx_source_app  ON events(source_app);
  CREATE INDEX IF NOT EXISTS idx_agent_name  ON events(agent_name);
  CREATE INDEX IF NOT EXISTS idx_event_type  ON events(hook_event_type);
  CREATE INDEX IF NOT EXISTS idx_created_at  ON events(created_at);
`);

// ---------- prepared statements ----------

const insertStmt = db.prepare<
  [string, string, string, string, string | null, string, number, number]
>(`
  INSERT INTO events
    (source_app, session_id, agent_name, hook_event_type, tool_name, payload, timestamp, created_at)
  VALUES
    (?, ?, ?, ?, ?, ?, ?, ?)
`);

const cleanupStmt = db.prepare<[number]>(`
  DELETE FROM events WHERE id IN (
    SELECT id FROM events
    ORDER BY id ASC
    LIMIT MAX(0, (SELECT COUNT(*) FROM events) - ?)
  )
`);

const loadSessionAgentsStmt = db.prepare(`
  SELECT session_id, agent_name FROM events
  WHERE hook_event_type IN ('SubagentStart', 'SessionStart')
  GROUP BY session_id
`);

// ---------- 行 → AgentEvent ----------

interface EventRow {
  id: number;
  source_app: string;
  session_id: string;
  agent_name: string;
  hook_event_type: string;
  tool_name: string | null;
  payload: string;
  timestamp: number;
  created_at: number;
}

/**
 * SQLite 行转 AgentEvent，payload 反序列化
 */
function rowToEvent(row: EventRow): AgentEvent {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(row.payload) as Record<string, unknown>;
  } catch {
    // payload 损坏则视为空对象，避免整个查询挂掉
    parsed = {};
  }
  return {
    id: row.id,
    source_app: row.source_app,
    session_id: row.session_id,
    agent_name: row.agent_name,
    hook_event_type: row.hook_event_type as HookEventType,
    tool_name: row.tool_name,
    payload: parsed,
    timestamp: row.timestamp,
    created_at: row.created_at,
  };
}

// ---------- 容量管理 ----------

let insertCount = 0;

/**
 * 插入事件并返回完整 AgentEvent
 * 适用：单条 hook 写入，频率受 hook 触发上限约束
 */
export function insertEvent(event: IncomingEvent & { agent_name: string }): AgentEvent {
  const now = Date.now();
  const timestamp = typeof event.timestamp === 'number' ? event.timestamp : now;
  const created_at = now;

  // 从 payload 提取 tool_name（仅当其为字符串时）
  const rawToolName = (event.payload as Record<string, unknown>).tool_name;
  const tool_name = typeof rawToolName === 'string' ? rawToolName : null;

  const payloadJson = JSON.stringify(event.payload);

  const info = insertStmt.run(
    event.source_app,
    event.session_id,
    event.agent_name,
    event.hook_event_type,
    tool_name,
    payloadJson,
    timestamp,
    created_at,
  );

  // 每 100 次插入清理一次最早的超额行
  insertCount += 1;
  if (insertCount % 100 === 0) {
    try {
      cleanupStmt.run(env.MAX_EVENTS_KEPT);
    } catch (err) {
      console.error('[db] cleanup failed:', err);
    }
  }

  return {
    id: Number(info.lastInsertRowid),
    source_app: event.source_app,
    session_id: event.session_id,
    agent_name: event.agent_name,
    hook_event_type: event.hook_event_type,
    tool_name,
    payload: event.payload,
    timestamp,
    created_at,
  };
}

// ---------- 查询 ----------

interface QueryRecentParams {
  limit?: number;
  source_app?: string;
  agent_name?: string;
  event_type?: string;
  before_id?: number;
}

/**
 * 查询最近事件，按 id 降序
 * limit 默认 500，clamp 到 [1, 5000]
 */
export function queryRecent(q: QueryRecentParams): RecentEventsResponse {
  const rawLimit = typeof q.limit === 'number' ? q.limit : 500;
  const limit = Math.max(1, Math.min(5000, Math.floor(rawLimit)));

  const where: string[] = [];
  const params: Array<string | number> = [];

  if (q.source_app) {
    where.push('source_app = ?');
    params.push(q.source_app);
  }
  if (q.agent_name) {
    where.push('agent_name = ?');
    params.push(q.agent_name);
  }
  if (q.event_type) {
    where.push('hook_event_type = ?');
    params.push(q.event_type);
  }
  if (typeof q.before_id === 'number' && Number.isFinite(q.before_id)) {
    where.push('id < ?');
    params.push(q.before_id);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  // 多查一条用于判断 has_more
  const sql = `
    SELECT id, source_app, session_id, agent_name, hook_event_type,
           tool_name, payload, timestamp, created_at
    FROM events
    ${whereClause}
    ORDER BY id DESC
    LIMIT ?
  `;
  const stmt = db.prepare(sql);
  const rows = stmt.all(...params, limit + 1) as EventRow[];

  const has_more = rows.length > limit;
  const sliced = has_more ? rows.slice(0, limit) : rows;

  return {
    events: sliced.map(rowToEvent),
    has_more,
  };
}

/**
 * 查询过滤面板下拉选项（限定最近 24h，避免历史数据污染）
 */
export function queryFilterOptions(): FilterOptionsResponse {
  const since = Date.now() - 24 * 60 * 60 * 1000;

  const sourceAppRows = db
    .prepare(`SELECT DISTINCT source_app FROM events WHERE created_at >= ? ORDER BY source_app ASC`)
    .all(since) as Array<{ source_app: string }>;

  const agentNameRows = db
    .prepare(`SELECT DISTINCT agent_name FROM events WHERE created_at >= ? ORDER BY agent_name ASC`)
    .all(since) as Array<{ agent_name: string }>;

  const eventTypeRows = db
    .prepare(
      `SELECT DISTINCT hook_event_type FROM events WHERE created_at >= ? ORDER BY hook_event_type ASC`,
    )
    .all(since) as Array<{ hook_event_type: string }>;

  return {
    source_apps: sourceAppRows.map((r) => r.source_app),
    agent_names: agentNameRows.map((r) => r.agent_name),
    event_types: eventTypeRows.map((r) => r.hook_event_type as HookEventType),
  };
}

/**
 * 启动时加载 session→agent 映射，用于重建 infer-agent 缓存
 */
export function loadSessionAgents(): Array<{
  session_id: string;
  agent_name: string;
}> {
  const rows = loadSessionAgentsStmt.all() as Array<{
    session_id: string;
    agent_name: string;
  }>;
  return rows;
}
