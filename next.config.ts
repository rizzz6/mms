import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ['192.168.1.26', 'localhost:3000', '192.168.1.26:3000'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'yywgquhzmqtjvbdteflh.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
