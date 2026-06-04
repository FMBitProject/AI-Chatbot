import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "3000-firebase-ai-chatbot-1780037291743.cluster-fdkw7vjj7bgguspe3fbbc25tra.cloudworkstations.dev",
  ],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  // Don't bundle pdf-parse — its entry point runs debug code when module.parent
  // is falsy (Turbopack doesn't set it), which tries to open a test PDF file.
  // Marking it external lets Node.js require() it at runtime with module.parent set correctly.
  serverExternalPackages: ["pdf-parse"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
