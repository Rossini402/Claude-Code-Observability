// 简易 hash → 调色板：未知 agent / source 也能稳定出色
// 完整规则见 docs/03-ui-spec.md §4.4
import { AGENT_COLORS, AGENT_PALETTE, SOURCE_PALETTE } from '@agent-obs/shared';

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function agentColor(name: string): string {
  if (name in AGENT_COLORS) {
    return AGENT_COLORS[name as keyof typeof AGENT_COLORS];
  }
  const idx = hash(name) % AGENT_PALETTE.length;
  return AGENT_PALETTE[idx] ?? '#64748b';
}

export function sourceColor(name: string): string {
  const idx = hash(name) % SOURCE_PALETTE.length;
  return SOURCE_PALETTE[idx] ?? '#94a3b8';
}
