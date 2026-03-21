
import type { NextConfig } from 'next';

/**
 * Institutional Security & Optimization Policy.
 */
const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  devIndicators: false, // Hides development overlays from UI
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    // Remote patterns for external images
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
    // Optimize images with proper quality and formats
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Allow only approved quality settings to avoid warnings
    qualities: [75, 85],
    // Use modern image formats for better compression (only these are configurable)
    // PNG/JPEG fallback is automatic for older browsers
    formats: ['image/webp', 'image/avif'],
    // Keep Next.js image optimization enabled (avoids direct public-asset fetch issues)
    unoptimized: false,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '30mb',
    },
  },
};

export default nextConfig;
