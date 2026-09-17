/**
 * @bulwark/web server
 * Pure Node.js HTTP server (zero framework).
 * Serves zero-scroll operations dashboard, public /verify PoAA validator, and JSON APIs.
 * Source of truth: docs/BUILD.md §4 P11.
 */

import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import * as child_process from "node:child_process";
import { createECDH } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  BulwarkGuardian,
  verifyPoaaBundle,
  computeDeskReputation,
  PositionSnapshot,
  PoaaBundle,
  CHAINS,
  keccak256,
} from "@bulwark/core";

export const SERVER_VERSION = "0.1.0";

export function deriveAddressFromPrivateKey(privKeyHex: string): string {
  const clean = privKeyHex.replace(/^0x/, "").trim();
  if (clean.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error("Invalid private key: must be exactly 64 hexadecimal characters.");
  }
  const ecdh = createECDH("secp256k1");
  ecdh.setPrivateKey(Buffer.from(clean, "hex"));
  const uncompressedPubKey = ecdh.getPublicKey().subarray(1); // 64 bytes (X and Y)
  const hash = keccak256(uncompressedPubKey);
  return "0x" + hash.slice(-40).toLowerCase();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, "../public");

export interface WebServerOptions {
  guardian?: BulwarkGuardian;
  port?: number;
  host?: string;
  watchlist?: string[];
  operatorKey?: string;
}

let defaultGuardian: BulwarkGuardian | null = null;
export function getDefaultGuardian(): BulwarkGuardian {
  if (!defaultGuardian) {
    defaultGuardian = new BulwarkGuardian();
  }
  return defaultGuardian;
}

export async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  options: WebServerOptions = {}
): Promise<void> {
  const guardian = options.guardian ?? getDefaultGuardian();
  const watchlist = options.watchlist ?? ["0xE406f471E711A2C8012e95c4B09fa9F1C9ae8123"];

  const checkOperatorAuth = (): boolean => {
    const configuredKey = options.operatorKey ?? process.env.BULWARK_OPERATOR_KEY;
    if (configuredKey) {
      const authHeader = req.headers.authorization;
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;
      const headerKey =
        (req.headers["x-bulwark-operator-key"] as string | undefined) ||
        (req.headers["x-operator-key"] as string | undefined) ||
        bearerToken;
      return headerKey === configuredKey;
    }
    // On public cloud / production without an operator key configured, refuse mutating calls
    if (process.env.VERCEL || process.env.NODE_ENV === "production") {
      return false;
    }
    // In local development / test mode without BULWARK_OPERATOR_KEY, allow execution
    return true;
  };

  let rawUrl = req.url || "/";
  if ((!rawUrl || rawUrl === "/") && req.headers["x-matched-path"]) {
    const matched = req.headers["x-matched-path"] as string;
    if (!matched.includes("[") && !matched.includes("]")) {
      rawUrl = matched;
    }
  }
  const url = new URL(rawUrl, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;
  const method = req.method || "GET";

  // Helper to send JSON responses (BigInt-safe)
  const sendJson = (status: number, data: unknown) => {
    if (res.headersSent) return;
    let body: string;
    try {
      body = JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v));
    } catch (err: any) {
      body = JSON.stringify({ error: `Serialization error: ${err.message}` });
      status = 500;
    }
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": req.headers.origin || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-bulwark-operator-key, x-operator-key",
    });
    res.end(body);
  };

  // CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": req.headers.origin || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-bulwark-operator-key, x-operator-key",
    });
    res.end();
    return;
  }

  // Helper to parse JSON body
  const readBody = async <T>(): Promise<T> => {
    if ((req as any).body) {
      return typeof (req as any).body === "string"
        ? JSON.parse((req as any).body)
        : ((req as any).body as T);
    }
    return new Promise<T>((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 2 * 1024 * 1024) {
          reject(new Error("Request body exceeds 2MB limit"));
        }
      });
      req.on("end", () => {
        try {
          resolve(body ? (JSON.parse(body) as T) : ({} as T));
        } catch (e: any) {
          reject(new Error(`Invalid JSON: ${e.message}`));
        }
      });
      req.on("error", reject);
    });
  };

  // Helper to serve static files
  const serveFile = (filePath: string, contentType: string) => {
      try {
        if (!fs.existsSync(filePath)) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not Found");
          return;
        }
        if (method === "HEAD") {
          const stat = fs.statSync(filePath);
          res.writeHead(200, {
            "Content-Type": contentType,
            "Content-Length": stat.size,
          });
          res.end();
          return;
        }
        const stream = fs.createReadStream(filePath);
        res.writeHead(200, { "Content-Type": contentType });
        stream.pipe(res);
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(`Server Error: ${err.message}`);
      }
    };

    try {
      // ── Static Routes ──────────────────────────────────────────────────────
      if (method === "GET" || method === "HEAD") {
        if (pathname === "/" || pathname === "/landing" || pathname === "/landing.html" || pathname === "/home") {
          serveFile(path.join(PUBLIC_DIR, "landing.html"), "text/html");
          return;
        }
        if (pathname === "/overview" || pathname === "/overview.html" || pathname === "/dashboard" || pathname === "/console") {
          serveFile(path.join(PUBLIC_DIR, "overview.html"), "text/html");
          return;
        }
        if (pathname === "/index.html") {
          serveFile(path.join(PUBLIC_DIR, "landing.html"), "text/html");
          return;
        }
        if (pathname === "/positions" || pathname === "/positions.html") {
          serveFile(path.join(PUBLIC_DIR, "positions.html"), "text/html");
          return;
        }
        if (pathname === "/grants" || pathname === "/grants.html") {
          serveFile(path.join(PUBLIC_DIR, "grants.html"), "text/html");
          return;
        }
        if (pathname === "/executions" || pathname === "/executions.html") {
          serveFile(path.join(PUBLIC_DIR, "executions.html"), "text/html");
          return;
        }
        if (pathname === "/audit" || pathname === "/audit.html") {
          serveFile(path.join(PUBLIC_DIR, "audit.html"), "text/html");
          return;
        }
        if (pathname === "/verify" || pathname === "/verify.html") {
          serveFile(path.join(PUBLIC_DIR, "verify.html"), "text/html");
          return;
        }
        if (pathname === "/settings" || pathname === "/settings.html" || pathname === "/diagnostics") {
          serveFile(path.join(PUBLIC_DIR, "settings.html"), "text/html");
          return;
        }
        if (pathname === "/docs" || pathname === "/docs.html" || pathname === "/documentation") {
          serveFile(path.join(PUBLIC_DIR, "docs.html"), "text/html");
          return;
        }

        // Generic static files (.css, .js, .json, .svg, .png, .ico)
        const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, "");
        const targetPath = path.join(PUBLIC_DIR, safePath);
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
          const ext = path.extname(targetPath).toLowerCase();
          const mimeTypes: Record<string, string> = {
            ".css": "text/css",
            ".js": "application/javascript",
            ".json": "application/json",
            ".html": "text/html",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".ico": "image/x-icon",
          };
          const contentType = mimeTypes[ext] || "application/octet-stream";
          serveFile(targetPath, contentType);
          return;
        }
      }

      // ── API Routes ─────────────────────────────────────────────────────────
      // 0. GET /api or /api/health
      if (method === "GET" && (pathname === "/api" || pathname === "/api/" || pathname === "/api/health")) {
        await guardian.init();
        sendJson(200, {
          name: "BULWARK Protocol API",
          status: "operational",
          version: SERVER_VERSION,
          chainId: guardian.config.chainId,
          hasKey: guardian.client.hasKey(),
          frontend: guardian.config.frontendUrl,
          backend: guardian.config.backendUrl,
          endpoints: [
            "GET  /api/state",
            "GET  /api/doctor",
            "POST /api/scan",
            "POST /api/tick",
            "POST /api/grants/propose",
            "POST /api/grants/:id/approve",
            "POST /api/grants/:id/dry",
            "POST /api/grants/:id/execute",
            "POST /api/grants/:id/revoke",
            "POST /api/proof/verify",
            "GET  /api/audit/export"
          ]
        });
        return;
      }

      // 1. GET /api/state
      if (method === "GET" && pathname === "/api/state") {
        await guardian.init();
        const grants = await guardian.store.getGrants();
        const executions = await guardian.store.getExecutions();
        const audit = await guardian.store.getAuditLogs();
        const capacity = await guardian.store.getCapacity();
        const reputation = computeDeskReputation(grants, executions, audit);

        // Fetch watchlist snapshots (check active debt on Base Sepolia or Sepolia)
        const watchlistSnapshots: PositionSnapshot[] = [];
        for (const addr of watchlist) {
          try {
            let snap = await guardian.scanPosition(addr, 84532);
            if (!snap || snap.totalDebtBase === 0n) {
              snap = await guardian.scanPosition(addr);
            }
            watchlistSnapshots.push(snap);
          } catch {}
        }

        // Return clean state — SECRETS NEVER REACH THE BROWSER!
        sendJson(200, {
          chainId: guardian.config.chainId,
          hasKey: guardian.client.hasKey(),
          capacity,
          reputation,
          grants,
          executions,
          audit,
          watchlist: watchlistSnapshots,
        });
        return;
      }

      // 1c. POST /api/auth/verify-key (Verifies 24/7 Autonomous Guardian Private Key)
      if (method === "POST" && pathname === "/api/auth/verify-key") {
        const body = await readBody<{ privateKey?: string }>().catch(() => ({ privateKey: undefined }));
        const rawKey = (body && "privateKey" in body && typeof body.privateKey === "string") ? body.privateKey.trim() : "";
        try {
          const address = deriveAddressFromPrivateKey(rawKey);
          sendJson(200, {
            success: true,
            address,
            mode: "private_key",
            message: "24/7 Autonomous Guardian credentials verified."
          });
        } catch (err: any) {
          sendJson(400, {
            error: err.message || "Invalid private key format"
          });
        }
        return;
      }

      // 1b. POST /api/agent/ask or GET /api/agent/stream (Live Gemini + MCP streaming)
      if (
        (method === "POST" && pathname === "/api/agent/ask") ||
        (method === "GET" && (pathname === "/api/agent/stream" || pathname === "/api/agent/ask"))
      ) {
        let prompt = "Scan borrower on Aave V3 Base Sepolia and formulate rescue strategy";
        if (method === "POST") {
          const body: { prompt?: string } = await readBody<{ prompt?: string }>().catch(() => ({ prompt: undefined }));
          if (body?.prompt && typeof body.prompt === "string" && body.prompt.trim().length > 0) {
            prompt = body.prompt.trim();
          }
        } else {
          const qPrompt = url.searchParams.get("prompt");
          if (qPrompt && qPrompt.trim().length > 0) {
            prompt = qPrompt.trim();
          }
        }

        const isSse = req.headers.accept?.includes("text/event-stream") || pathname === "/api/agent/stream";
        const possibleAgentPaths: string[] = [
          path.resolve(__dirname, "../../agent/dist/index.js"),
          path.resolve(process.cwd(), "packages/agent/dist/index.js"),
        ];
        const agentScript: string = possibleAgentPaths.find((p) => fs.existsSync(p)) || possibleAgentPaths[0]!;

        if (isSse) {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "X-Accel-Buffering": "no",
          });

          const sendEvent = (event: { type: string; text: string; data?: any }) => {
            if (!res.writableEnded) {
              res.write(`data: ${JSON.stringify(event)}\n\n`);
            }
          };

          sendEvent({ type: "start", text: `[AGENT PROMPT] ${prompt}` });

          const child: any = child_process.spawn(
            process.execPath,
            ["--env-file-if-exists=.env", agentScript, "ask", prompt],
            {
              cwd: process.cwd(),
              env: { ...process.env },
            }
          );

          if (child.stdout) {
            child.stdout.on("data", (chunk: Buffer) => {
              const lines = chunk.toString("utf-8").split("\n");
              for (let line of lines) {
                line = line.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1FA70}-\u{1FAFF}\u{FE0F}]/gu, "").trim();
                if (line.length > 0) {
                  let eventType = "log";
                  if (line.includes("Gemini decided to call KeeperHub MCP tool") || line.includes("[GEMINI]")) {
                    eventType = "gemini";
                  } else if (line.includes("Loaded") && line.includes("MCP tools")) {
                    eventType = "discovery";
                  } else if (line.includes("[POLICY]") || line.includes("[POLICY INVARIANT]")) {
                    eventType = "policy";
                  } else if (line.includes("[KEEPERHUB FACT]") || line.includes("[KEEPERHUB MCP]")) {
                    eventType = "fact";
                  } else if (line.includes("[AGENT OUTPUT] Response:")) {
                    eventType = "response_header";
                  }
                  sendEvent({ type: eventType, text: line });
                }
              }
            });
          }

          if (child.stderr) {
            child.stderr.on("data", (chunk: Buffer) => {
              const lines = chunk.toString("utf-8").split("\n");
              for (let line of lines) {
                line = line.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1FA70}-\u{1FAFF}\u{FE0F}]/gu, "").trim();
                if (line.length > 0) {
                  sendEvent({ type: "stderr", text: line });
                }
              }
            });
          }

          child.on("close", (code: number) => {
            sendEvent({ type: "done", text: `Agent execution finished (exit code ${code})`, data: { code } });
            res.end();
          });

          child.on("error", (err: Error) => {
            sendEvent({ type: "error", text: `Failed to spawn agent process: ${err.message}` });
            res.end();
          });

          req.on("close", () => {
            try { child.kill(); } catch {}
          });
          return;
        } else {
          // Standard JSON API response
          const logs: string[] = [];
          const child: any = child_process.spawn(
            process.execPath,
            ["--env-file-if-exists=.env", agentScript, "ask", prompt],
            {
              cwd: process.cwd(),
              env: { ...process.env },
            }
          );

          if (child.stdout) {
            child.stdout.on("data", (chunk: Buffer) => {
              const lines = chunk.toString("utf-8").split("\n");
              for (const line of lines) {
                if (line.trim().length > 0) logs.push(line);
              }
            });
          }

          if (child.stderr) {
            child.stderr.on("data", (chunk: Buffer) => {
              const lines = chunk.toString("utf-8").split("\n");
              for (const line of lines) {
                if (line.trim().length > 0) logs.push(line);
              }
            });
          }

          child.on("close", (code: number) => {
            sendJson(200, { success: code === 0, code, prompt, logs });
          });

          child.on("error", (err: Error) => {
            sendJson(500, { error: err.message, logs });
          });
          return;
        }
      }

      // 2. POST /api/tick
      if (method === "POST" && pathname === "/api/tick") {
        if (!checkOperatorAuth()) {
          sendJson(401, { error: "Unauthorized: Operator authorization required for mutating operations" });
          return;
        }
        const result = await guardian.tick(watchlist);
        sendJson(200, result);
        return;
      }

      // 3. POST /api/proof/verify
      if (method === "POST" && pathname === "/api/proof/verify") {
        const body = await readBody<{ bundle?: PoaaBundle }>();
        const bundle = body.bundle || (body as unknown as PoaaBundle);
        if (!bundle || !bundle.bundleVersion) {
          sendJson(400, { error: "Missing or invalid PoaaBundle" });
          return;
        }
        const report = verifyPoaaBundle(bundle);
        sendJson(200, report);
        return;
      }

      // GET /api/proof/bundle/latest
      if (method === "GET" && pathname === "/api/proof/bundle/latest") {
        try {
          const possiblePaths = [
            path.join(process.cwd(), ".bulwark", "poaa_latest.json"),
            path.join(process.cwd(), "fixtures", "poaa_latest.json"),
            path.join(PUBLIC_DIR, "poaa_latest.json"),
            path.join(process.cwd(), "public", "poaa_latest.json"),
          ];
          for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
              const content = JSON.parse(fs.readFileSync(p, "utf-8"));
              sendJson(200, content);
              return;
            }
          }
          sendJson(404, { error: "No latest PoAA bundle found" });
        } catch (e: any) {
          sendJson(500, { error: e?.message || "Failed to load bundle" });
        }
        return;
      }

      // 4. POST /api/scan
      if (method === "POST" && pathname === "/api/scan") {
        const body = await readBody<{ address?: string; chainId?: number }>();
        if (!body.address || !body.address.startsWith("0x") || body.address.length !== 42) {
          sendJson(400, { error: "Invalid Ethereum address format (must be 0x followed by 40 hex characters)" });
          return;
        }
        await guardian.init();
        try {
          let chainId = body.chainId;
          if (!chainId) {
            try {
              const baseSnap = await guardian.scanPosition(body.address, 84532);
              if (baseSnap.totalDebtBase > 0n) {
                sendJson(200, baseSnap);
                return;
              }
            } catch {}
          }
          const snapshot = await guardian.scanPosition(body.address, chainId);
          sendJson(200, snapshot);
        } catch (scanErr: any) {
          sendJson(500, { error: scanErr.message || "Failed to scan position" });
        }
        return;
      }

      // 5. POST /api/grants/propose
      if (method === "POST" && pathname === "/api/grants/propose") {
        if (!checkOperatorAuth()) {
          sendJson(401, { error: "Unauthorized: Operator authorization required for mutating operations" });
          return;
        }
        const body = await readBody<{
          owner?: string;
          chainId?: number;
          capitalCapUsd?: number;
          perActionCapUsd?: number;
          expiresInHours?: number;
          hfTriggerBelow?: number;
        }>();
        if (!body.owner || !body.owner.startsWith("0x")) {
          sendJson(400, { error: "Missing or invalid borrower/owner address" });
          return;
        }
        await guardian.init();
        try {
          let targetChain = body.chainId;
          if (!targetChain) {
            try {
              const baseSnap = await guardian.scanPosition(body.owner, 84532);
              if (baseSnap.totalDebtBase > 0n) {
                targetChain = 84532;
              }
            } catch {}
          }
          const grant = await guardian.proposeRescueGrant(body.owner, targetChain, {
            capitalCapUsd: body.capitalCapUsd ? Number(body.capitalCapUsd) : undefined,
            perActionCapUsd: body.perActionCapUsd ? Number(body.perActionCapUsd) : undefined,
            expiresInHours: body.expiresInHours ? Number(body.expiresInHours) : undefined,
            hfTriggerBelow: body.hfTriggerBelow ? Number(body.hfTriggerBelow) : 1.35,
          });
          sendJson(200, grant);
        } catch (propErr: any) {
          sendJson(500, { error: propErr.message || "Failed to propose grant" });
        }
        return;
      }

      // 6. GET /api/doctor
      if (method === "GET" && pathname === "/api/doctor") {
        await guardian.init();
        let rpcPing: { success: boolean; blockNumber?: number; error?: string } = { success: false };
        try {
          const blockNumber = await guardian.reader.getPublicBlockNumber(guardian.config.chainId);
          rpcPing = { success: true, blockNumber };
        } catch (e: any) {
          rpcPing = { success: false, error: e.message };
        }

        let spendCap: any = null;
        if (guardian.client.hasKey()) {
          try {
            spendCap = await guardian.client.getSpendCap();
          } catch (e: any) {
            spendCap = { error: e.message };
          }
        }

        const grants = await guardian.store.getGrants();
        const executions = await guardian.store.getExecutions();
        const audit = await guardian.store.getAuditLogs();
        const capacity = await guardian.store.getCapacity();

        const key = guardian.config.keeperhubApiKey;
        const maskedKey = key && key.length > 8 ? `${key.slice(0, 4)}...${key.slice(-4)}` : null;

        sendJson(200, {
          status: "operational",
          version: SERVER_VERSION,
          chainId: guardian.config.chainId,
          chains: CHAINS,
          rpcPing,
          apiKey: {
            present: guardian.client.hasKey(),
            masked: maskedKey,
          },
          spendCap,
          store: {
            grantsCount: grants.length,
            executionsCount: executions.length,
            auditCount: audit.length,
            deskBalanceUsd: capacity.deskBalanceUsd,
            availableUsd: capacity.availableUsd,
            reservedUsd: capacity.reservedUsd,
          },
        });
        return;
      }

      // 7. GET /api/audit/export
      if (method === "GET" && pathname === "/api/audit/export") {
        await guardian.init();
        const audit = await guardian.store.getAuditLogs();
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Content-Disposition": 'attachment; filename="bulwark-audit-export.json"',
        });
        res.end(JSON.stringify(audit, null, 2));
        return;
      }

      // 8. POST /api/grants/:id/(approve|revoke|dry|execute)
      const grantActionMatch = pathname.match(/^\/api\/grants\/([a-zA-Z0-9_-]+)\/(approve|revoke|dry|execute)$/);
      if (method === "POST" && grantActionMatch) {
        if (!checkOperatorAuth()) {
          sendJson(401, { error: "Unauthorized: Operator authorization required for mutating operations" });
          return;
        }
        const grantId = grantActionMatch[1]!;
        const action = grantActionMatch[2]!;

        switch (action) {
          case "approve": {
            const body = await readBody<{ approvedBy?: string; signature?: string; nonce?: number }>().catch(() => ({}));
            const approved = await guardian.approveGrant(grantId, body);
            sendJson(200, approved);
            return;
          }
          case "revoke": {
            const revoked = await guardian.revokeGrant(grantId);
            sendJson(200, revoked);
            return;
          }
          case "dry": {
            const sim = await guardian.dryRunGrant(grantId);
            sendJson(200, sim);
            return;
          }
          case "execute": {
            const execRes = await guardian.executeGrant(grantId);
            sendJson(200, execRes);
            return;
          }
        }
      }

      // Route Not Found
      sendJson(404, { error: `Route not found: ${method} ${pathname}` });
    } catch (err: any) {
      sendJson(500, { error: err.message || "Internal server error" });
    }
}

export function createWebServer(options: WebServerOptions = {}): http.Server {
  return http.createServer(async (req, res) => {
    await handleRequest(req, res, options);
  });
}

export function startWebServer(port?: number, host = "0.0.0.0"): Promise<{ server: http.Server; port: number }> {
  const targetPort = port ?? parseInt(process.env.PORT || process.env.BULWARK_WEB_PORT || "4567", 10);
  const server = createWebServer();

  return new Promise((resolve, reject) => {
    server.listen(targetPort, host, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : targetPort;
      console.log(`[POLICY INVARIANT] Bulwark Web Dashboard listening on http://${host}:${actualPort}`);
      console.log(`[POLICY INVARIANT] Public PoAA Verifier ready at http://${host}:${actualPort}/verify`);
      const guardian = getDefaultGuardian();
      const cfg = guardian.config;
      const aiStatus = cfg.llmApiKey ? `Active (Google AI Studio: ${cfg.llmModel})` : "Disabled (Deterministic Fallback)";
      console.log(`[AGENT OUTPUT] AI Underwriter: ${aiStatus}`);
      console.log(`[KEEPERHUB FACT] KeeperHub API Key: ${guardian.client.hasKey() ? "Active" : "Not Set"}`);
      console.log(`[CHAIN FACT] Network Chain ID: ${cfg.chainId}`);
      resolve({ server, port: actualPort });
    });
    server.on("error", reject);
  });
}

// Auto-start if executed directly
if (
  process.argv[1] &&
  (import.meta.url === fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith("/server.js") ||
    process.argv[1].endsWith("/server.ts"))
) {
  startWebServer();
}
