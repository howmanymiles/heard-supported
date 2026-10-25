import path from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  images: { unoptimized: true }, // no next/image optimisation, so sharp is never loaded
  outputFileTracingRoot: path.join(__dirname, '..'),
  transpilePackages: ['@hs/core', '@hs/engine'],
  serverExternalPackages: ['pg', '@azure/identity', '@azure/storage-blob'],
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: '25mb' } },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        { key: 'Cache-Control', value: 'no-store' },
      ],
    }];
  },
};
export default config;
