import { defineConfig, devices } from "@playwright/test"

const apiPort = 3101
const webPort = 5174
const webUrl = `http://localhost:${webPort}`
const apiUrl = `http://localhost:${apiPort}`

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { baseURL: webUrl, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node src/main.ts",
      cwd: "../api",
      wait: { stdout: /Listening on/ },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        PORT: String(apiPort),
        CORS_ORIGIN: webUrl,
        DATABASE_PGLITE: "1",
        SEED_DEMO_PASSWORD: "demo-crm-1234",
        SEED_SELLER_PASSWORD: "seller-crm-1234",
      },
    },
    {
      command: `pnpm exec vite --port ${webPort} --strictPort`,
      url: webUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { VITE_API_URL: apiUrl },
    },
  ],
})
