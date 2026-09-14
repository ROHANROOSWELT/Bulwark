import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

describe("BULWARK CLI E2E Process Execution", () => {
  const cliPath = path.resolve("packages/cli/dist/index.js");

  it("executes CLI binary directly with --help", () => {
    const stdout = execFileSync("node", [cliPath, "--help"], { encoding: "utf-8" });
    expect(stdout).toContain("BULWARK CLI");
    expect(stdout).toContain("doctor");
    expect(stdout).toContain("positions scan");
    expect(stdout).toContain("grants propose");
    expect(stdout).toContain("workflow compile");
    expect(stdout).toContain("proof verify");
  });

  it("executes CLI binary with --version", () => {
    const stdout = execFileSync("node", [cliPath, "--version"], { encoding: "utf-8" });
    expect(stdout).toContain("bulwark v0.1.0");
  });

  it("executes CLI doctor command in isolated env", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bulwark-cli-e2e-"));
    try {
      const stdout = execFileSync("node", [cliPath, "doctor"], {
        encoding: "utf-8",
        env: {
          ...process.env,
          BULWARK_STORE_DIR: tmpDir,
          BULWARK_CHAIN_ID: "11155111",
        },
      });
      expect(stdout).toContain("=== BULWARK DOCTOR ===");
      expect(stdout).toContain("[CHAIN READ] Configured Chain ID: 11155111");
      expect(stdout).toContain("[POLICY INVARIANT] Store: OK");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("executes CLI keys check when no key is present", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bulwark-cli-e2e-"));
    try {
      const env = { ...process.env, BULWARK_STORE_DIR: tmpDir };
      delete env.KEEPERHUB_API_KEY;
      const stdout = execFileSync("node", [cliPath, "keys", "check"], {
        encoding: "utf-8",
        env,
      });
      expect(stdout).toContain("[UNAVAILABLE] KEEPERHUB_API_KEY is not set.");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
