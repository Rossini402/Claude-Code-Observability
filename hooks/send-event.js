#!/usr/bin/env node
// hooks/send-event.js
// Claude Code hook 通用事件发送器
// 协议见 docs/02-event-schema.md §6
//
// 用法：
//   node send-event.js --source-app=my-app --event-type=PreToolUse [--server=http://localhost:4000]
// stdin：
//   Claude Code 通过管道传入的 hook payload JSON
// 输出：
//   POST 到 ${server}/events
// 协议铁律：
//   无论成功失败都 exit 0，绝不阻塞 Claude Code
// 错误日志：
//   追加写入 ~/.agent-obs/send-event.log

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

/**
 * 解析 --key=value 形式的命令行参数
 */
function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

/**
 * 错误日志写入用户目录，失败不向上抛
 */
function logError(msg) {
  try {
    const logDir = path.join(os.homedir(), '.agent-obs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, 'send-event.log'),
      `[${new Date().toISOString()}] ${msg}\n`,
    );
  } catch (_) {
    // 日志失败也不允许影响 hook 主流程
  }
}

/**
 * 异步读取 stdin。
 * 终端模式（无管道输入）下立即返回空串，避免 CLI 调试时挂起。
 */
async function readStdin() {
  if (process.stdin.isTTY) return '';
  let data = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function main() {
  const args = parseArgs(process.argv);
  const sourceApp = args['source-app'] || 'unknown';
  const eventType = args['event-type'] || 'unknown';
  const server = args['server'] || 'http://localhost:4000';

  let stdinRaw = '';
  try {
    stdinRaw = await readStdin();
  } catch (err) {
    logError(`stdin read failed: ${err && err.message}`);
  }

  // 解析 stdin JSON；解析失败则用空对象兜底，envelope 仍能 POST 出去
  let payload = {};
  if (stdinRaw && stdinRaw.trim().length > 0) {
    try {
      const parsed = JSON.parse(stdinRaw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        payload = parsed;
      } else {
        logError(`stdin JSON not an object: ${stdinRaw.slice(0, 200)}`);
      }
    } catch (err) {
      logError(`bad stdin JSON: ${err && err.message}; raw=${stdinRaw.slice(0, 200)}`);
    }
  }

  // session_id 优先取 payload 内字段，缺失走 'unknown'（server 端仍能落库）
  const sessionId =
    typeof payload.session_id === 'string' && payload.session_id.length > 0
      ? payload.session_id
      : 'unknown';

  const envelope = {
    source_app: sourceApp,
    session_id: sessionId,
    hook_event_type: eventType,
    payload,
    timestamp: Date.now(),
  };

  try {
    const res = await fetch(`${server}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
      // 5s 超时上限，比 Claude Code 默认 hook timeout 还紧，确保不会卡死
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      logError(`server returned HTTP ${res.status} for ${eventType}`);
    }
  } catch (err) {
    // server 没起、网络断、超时全归这里
    logError(`fetch failed (${eventType}): ${err && err.message}`);
  }
}

// 顶层 try 兜底；finally 强制 exit 0
main()
  .catch((err) => {
    logError(`fatal: ${(err && err.stack) || err}`);
  })
  .finally(() => {
    process.exit(0);
  });
