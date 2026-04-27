/**
 * 成对事件视图（client 端配对，不落库）
 * 详见 step 5b-3 设计：把 PreToolUse + PostToolUse、SubagentStart + SubagentStop 合成一行
 */
import type { AgentEvent } from './events';

export interface PairedEvent {
  kind: 'paired';
  pair_type: 'tool_use' | 'subagent';
  pre_event: AgentEvent;
  post_event: AgentEvent | null;
  /** 完成态用 post.timestamp - pre.timestamp；运行中或孤儿 Pre 为 null */
  duration_ms: number | null;
  status: 'running' | 'success' | 'failure' | 'orphan' | 'timeout';
}
