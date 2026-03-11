
import type { NextConfig } from 'next';

/**
 * Institutional Security & Optimization Policy.
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false, // Hides development overlays from UI
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
