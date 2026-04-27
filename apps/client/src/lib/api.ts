// 与 server HTTP 接口交互的封装（暂时只用到 /events/recent）
import type { RecentEventsResponse } from '@agent-obs/shared';

/**
 * 拉历史事件，启动初始化和重连后都会调用
 * @param httpBase NEXT_PUBLIC_SERVER_HTTP
 * @param limit  默认 200（step 5a 不做无限滚动）
 */
export async function fetchRecent(
  httpBase: string,
  limit = 200,
): Promise<RecentEventsResponse> {
  const res = await fetch(`${httpBase}/events/recent?limit=${limit}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`GET /events/recent failed: ${res.status}`);
  }
  return (await res.json()) as RecentEventsResponse;
}
