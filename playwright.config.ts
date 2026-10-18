import { defineConfig, devices } from "@playwright/test";

// End-to-end tests on phone-sized screens (e2e/). Two seeded users (prisma/seed-dev.mts)
// talk to each other through a running app: locally the dev server you already
// have open (or one started here), in CI the one .github/workflows/e2e.yml starts.
const PORT = Number(process.env.E2E_PORT ?? 3000);

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  // The two users and their chat are shared, so tests run one at a time.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    // Signs Ada and Grace in once (e2e/.auth/); every test runs as Ada.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "pixel", use: { ...devices["Pixel 7"], storageState: "e2e/.auth/ada_l.json" }, dependencies: ["setup"] },
    { name: "iphone", use: { ...devices["iPhone 14"], storageState: "e2e/.auth/ada_l.json" }, dependencies: ["setup"] },
  ],
  webServer: {
    command: "pnpm dev",
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    // Many sign-ins and reloads in a few minutes (ignored by production builds).
    env: { E2E_NO_RATE_LIMITS: "1" },
  },
});
