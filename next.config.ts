import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Identifies this build. The service worker is registered as /sw.js?v=<id>, so
// every deploy installs a fresh worker with its own app-shell cache, and open
// tabs can tell that a newer version is live (/api/version).
const buildId = isDev
  ? "dev"
  : (process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? Date.now().toString(36));

// Static CSP (no nonces) so pages keep their prerendered static shells. Inline
// scripts are Next's own bootstrap; user content is never rendered as HTML.
// connect/img/media allow R2 (presigned uploads, signed reads) and Ably (real-time).
// Plus the optional S3-compatible endpoint used for local development.
const R2 = ["https://*.r2.cloudflarestorage.com", process.env.R2_ENDPOINT ? new URL(process.env.R2_ENDPOINT).origin : ""]
  .filter(Boolean)
  .join(" ");
// Ably real-time endpoints and fallback hosts.
const ABLY = "https://*.ably.io wss://*.ably.io https://*.ably.net wss://*.ably.net https://*.ably-realtime.com wss://*.ably-realtime.com";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${R2}`,
  `media-src 'self' blob: ${R2}`,
  "font-src 'self'",
  `connect-src 'self' ${R2} ${ABLY}${isDev ? " ws:" : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  experimental: {
    // Soft navigations wait for the network to return instead of failing, and
    // useOffline() drives the offline banner.
    useOffline: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The service worker must always be revalidated so updates roll out.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }] },
      { source: "/offline.html", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default nextConfig;
