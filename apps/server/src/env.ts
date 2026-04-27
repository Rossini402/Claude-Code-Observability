/**
 * Server 环境变量读取
 * 默认值见 docs/01-architecture.md §4
 */
import path from 'node:path';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 读取数字环境变量，缺失或非法时回落到默认值
 */
function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 读取日志级别环境变量，限定为四个合法值
 */
function readLogLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL;
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return 'info';
}

/**
 * 解析 DB_PATH 为绝对路径，相对路径基于 process.cwd()
 */
function readDbPath(): string {
  const raw = process.env.DB_PATH ?? './data/events.db';
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

export const env = {
  PORT: readNumber('PORT', 4000),
  DB_PATH: readDbPath(),
  MAX_EVENTS_KEPT: readNumber('MAX_EVENTS_KEPT', 10000),
  LOG_LEVEL: readLogLevel(),
} as const;
