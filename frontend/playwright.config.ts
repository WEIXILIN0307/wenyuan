import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const data = (process.env.WENYUAN_E2E_DATA ||= mkdtempSync(
  join(tmpdir(), "wenyuan-e2e-"),
));
process.env.WENYUAN_E2E_TOKEN ||= execFileSync(
  resolve("../backend/.venv/bin/python"),
  ["-m", "wenyuan.manage", "create-user", "--name", "browser-test"],
  {
    cwd: resolve("../backend"),
    env: { ...process.env, WENYUAN_DATA: data },
    encoding: "utf8",
  },
).trim();
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  fullyParallel: false,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:3107",
    viewport: { width: 1600, height: 1000 },
    headless: true,
    launchOptions: {
      executablePath: process.env.WENYUAN_CHROMIUM,
      args: ["--no-sandbox"],
    },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: ".venv/bin/python -m wenyuan.api",
      cwd: "../backend",
      url: "http://127.0.0.1:8107/health",
      env: {
        WENYUAN_DATA: data,
        WENYUAN_PORT: "8107",
        WENYUAN_WEB_ORIGINS: "http://127.0.0.1:3107",
        WENYUAN_MODEL_ORIGINS: "https://api.openai.com,http://127.0.0.1:9207",
      },
      reuseExistingServer: false,
    },
    {
      command: "pnpm dev --port 3107",
      url: "http://127.0.0.1:3107",
      env: { WENYUAN_BACKEND: "http://127.0.0.1:8107" },
      reuseExistingServer: false,
      timeout: 90000,
    },
    {
      command: ".venv/bin/python tests/fake_provider.py",
      cwd: "../backend",
      url: "http://127.0.0.1:9207",
      reuseExistingServer: false,
    },
  ],
});
