import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [{ source: '/vpn-app.apk', destination: '/api/apk' }];
  },
};

export default nextConfig;
