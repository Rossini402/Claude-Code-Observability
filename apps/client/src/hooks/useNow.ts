'use client';

import { useEffect, useState } from 'react';

/**
 * 简易"当前时间"hook：每秒驱动一次重渲染，让运行中的 paired 事件能持续显示 elapsed
 *
 * 注意：每个调用方都会启一个独立 setInterval。本步只在 PairedEventRow 的 Running 子组件里用，
 * 完成态的 paired 行不调用，避免无意义的重渲染。
 * 后续若多组件需要共享同一 tick，再迁到 Context 单例。
 *
 * @param intervalMs tick 间隔（默认 1000ms）
 * @param enabled false 时停 tick；用于暂停场景下避免无意义重渲。
 *   重新启用瞬间会立即同步一次到 Date.now()，避免显示陈旧时间。
 */
export function useNow(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);

  return now;
}
