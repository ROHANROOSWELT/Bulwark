import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs";
import * as path from "node:path";

// Automatically load local .env if present
const localEnv = path.resolve(process.cwd(), ".env");
if (fs.existsSync(localEnv) && typeof (process as any).loadEnvFile === "function") {
  try {
    (process as any).loadEnvFile(localEnv);
  } catch {}
}

export default defineConfig({
  resolve: {
    alias: {
      "@bulwark/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "@bulwark/agent": fileURLToPath(new URL("./packages/agent/src/index.ts", import.meta.url)),
      "@bulwark/cli": fileURLToPath(new URL("./packages/cli/src/index.ts", import.meta.url)),
      "@bulwark/web": fileURLToPath(new URL("./packages/web/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    env: {
      // Tests that require a live KeeperHub key read it from the process env
      // or a local .env; without a key they MUST report as skipped, never pass.
      BULWARK_TEST_DIR: "test",
    },
  },
});
