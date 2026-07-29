import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IntelliBase AI",
    short_name: "IntelliBase",
    description: "AI Knowledge Base Built for Indonesian Businesses",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0A2E2E",
    icons: [
      {
        src: "/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
