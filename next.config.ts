import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384, 512, 750, 1024],
    qualities: [75, 90, 100],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "hndskftqdudknsvdunjc.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  serverExternalPackages: [],
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  // Durcissement HTTP de base (hors CSP, laissée à part car elle nécessite des
  // tests sur les origines Supabase/3D/framer). Ces en-têtes sont sûrs par
  // défaut : anti-clickjacking, anti-MIME-sniffing, HSTS, politique de referrer.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
