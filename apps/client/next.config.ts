import type { NextConfig } from 'next';

// Next.js 配置：启用严格模式；transpilePackages 让 workspace 内的 shared 源码（TS）被 Next 直接编译
const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@agent-obs/shared'],
};

export default nextConfig;
