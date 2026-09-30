import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

const securityHeadersPlugin = (): Plugin => {
  let apiOrigin = ""
  return {
    name: "security-headers",
    apply: "build",
    configResolved(config) {
      const apiUrl: unknown = config.env.VITE_API_URL
      if (typeof apiUrl !== "string" || apiUrl === "") throw new Error("VITE_API_URL is not set")
      apiOrigin = new URL(apiUrl).origin
    },
    generateBundle() {
      const contentSecurityPolicy = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        `connect-src 'self' ${apiOrigin}`,
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ].join("; ")
      // Cloudflare Workers static assets read this file from the assets directory root.
      this.emitFile({
        type: "asset",
        fileName: "_headers",
        source: [
          "/*",
          `  Content-Security-Policy: ${contentSecurityPolicy}`,
          "  Strict-Transport-Security: max-age=31536000",
          "  X-Content-Type-Options: nosniff",
          "  X-Frame-Options: DENY",
          "  Referrer-Policy: strict-origin-when-cross-origin",
          "  Permissions-Policy: camera=(), microphone=(), geolocation=()",
          "",
        ].join("\n"),
      })
    },
  }
}

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    securityHeadersPlugin(),
  ],
})
