import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:4000";

// Extra hosts allowed to load dev assets (e.g. testing from a phone on the LAN). Comma-separated.
const ALLOWED_DEV_ORIGINS = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const config: NextConfig = {
  allowedDevOrigins: ALLOWED_DEV_ORIGINS,
  // Web and API share one origin: /api/v1/* is proxied to Express (nginx does this in production).
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${API_URL}/api/v1/:path*` }];
  },
  poweredByHeader: false,
};

export default config;
