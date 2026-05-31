import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "3000-firebase-ai-chatbot-1780037291743.cluster-fdkw7vjj7bgguspe3fbbc25tra.cloudworkstations.dev",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
