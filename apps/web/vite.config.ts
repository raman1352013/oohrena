// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// Never set ssr.external or resolve.external: the Worker has no runtime module resolution, so
// the build fails. Never add compression (compressPublicAssets, vite-plugin-compression):
// hosting already compresses at the edge.
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/**
 * Deployed API origin (e.g. https://oohrena-api.onrender.com), read at BUILD time.
 * When set, the web host forwards /api/* to it, so the browser talks to one origin and the
 * HttpOnly session cookie is first-party (vercel.app and onrender.com are different sites;
 * a SameSite=Lax cookie would not be sent cross-site). On Vercel this becomes a CDN rewrite.
 */
const apiOrigin = process.env["API_PROXY_ORIGIN"]?.replace(/\/$/, "");

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  nitro: {
    // @ts-expect-error routeRules is passed through to nitro; the wrapper's type omits it.
    routeRules: {
      ...(apiOrigin ? { "/api/**": { proxy: `${apiOrigin}/api/**` } } : {}),
      "/**": {
        headers: {
          "Content-Security-Policy":
            "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.tile.openstreetmap.org https://unpkg.com; connect-src 'self' https://* ws: wss:; frame-ancestors 'none';",
          "X-Frame-Options": "DENY",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "strict-origin-when-cross-origin",
          "Permissions-Policy": "camera=(self), geolocation=(self), microphone=()",
          "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
        },
      },
    },
  },
  vite: {
    server: {
      // Local dev: forward API calls to the Express server so the session cookie stays same-origin.
      proxy: {
        "/api": {
          target: process.env["API_PROXY_TARGET"] ?? "http://localhost:4000",
          changeOrigin: false,
        },
      },
    },
  },
});
