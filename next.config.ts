import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "3000-firebase-ai-chatbot-1780037291743.cluster-fdkw7vjj7bgguspe3fbbc25tra.cloudworkstations.dev",
  ],
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
