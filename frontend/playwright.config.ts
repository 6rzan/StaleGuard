import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 8001; // 8000 is the developer's own backend; never share it with the suite
const BASE_URL = `http://127.0.0.1:${PORT}`;
// Set once in the main process; workers re-read this file and inherit the same value.
process.env.E2E_DATABASE ??= join(tmpdir(), `staleguard-e2e-${Date.now()}.db`);

// `npm run test:e2e` builds the frontend first: the backend serves frontend/dist.
// The @live spec runs only with LIVE_E2E=1 and talks to a backend on port 8000:
//   LIVE_E2E=1 npx playwright test e2e/live.spec.ts
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `uv run uvicorn app.main:app --host 127.0.0.1 --port ${PORT}`,
    cwd: "../backend",
    url: `${BASE_URL}/api/health`,
    // A server left on 8001 could be in live mode or hold old data; always start our own.
    reuseExistingServer: false,
    timeout: 60_000,
    env: { MOCK_MODE: "true", DATABASE_PATH: process.env.E2E_DATABASE },
  },
});
