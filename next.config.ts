import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Classic dynamic server rendering. Cache Components stays off so that
  // board pages read the database on every request (see docs/PLAN.md).
  cacheComponents: false,
  logging: {
    // The admin entry link carries the token in its query string: keep that
    // request out of the dev console.
    incomingRequests: { ignore: [/\/admin\/enter(\?|$)/] },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
