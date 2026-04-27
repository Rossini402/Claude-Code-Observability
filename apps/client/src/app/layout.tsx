import type { Metadata } from 'next';
import './globals.css';

// 全局元数据
export const metadata: Metadata = {
  title: 'Agent Observability',
  description: 'Claude Code 多 Agent 协作可视化',
};

// 根布局：默认 dark 主题，slate 系背景
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen antialiased">{children}</body>
    </html>
  );
}
