import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  // Resolve the landing path at the routing layer so the bare domain issues a
  // real HTTP redirect to /dashboard. The previous `redirect('/dashboard')` in
  // app/page.tsx produced a 200 that redirected client-side, which aborted the
  // sidebar's in-flight RSC prefetches ("Failed to fetch RSC payload") and made
  // the first navigation a full reload instead of a soft transition. Kept
  // non-permanent so the root isn't browser-cached as a redirect forever.
  async redirects() {
    return [{ source: '/', destination: '/dashboard', permanent: false }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
