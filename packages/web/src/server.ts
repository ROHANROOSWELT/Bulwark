/**
 * @bulwark/web server
 * Pure Node.js HTTP server (zero framework).
 * Serves zero-scroll operations dashboard, public /verify PoAA validator, and JSON APIs.
 * Source of truth: docs/BUILD.md §4 P11.
 */

import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BulwarkGuardian,
  verifyPoaaBundle,
  computeDeskReputation,
  PositionSnapshot,
  PoaaBundle,
  CHAINS,
} from "@bulwark/core";

export const SERVER_VERSION = "0.1.0";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, "../public");

export interface WebServerOptions {
  guardian?: BulwarkGuardian;
  port?: number;
  host?: string;
  watchlist?: string[];
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
  const watchlist = options.watchlist ?? ["0x0000000000000000000000000000000000000001"];

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
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end(body);
  };

  // CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
        if (pathname === "/overview" || pathname === "/index.html" || pathname === "/dashboard" || pathname === "/console") {
          serveFile(path.join(PUBLIC_DIR, "index.html"), "text/html");
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

        // Fetch watchlist snapshots
        const watchlistSnapshots: PositionSnapshot[] = [];
        for (const addr of watchlist) {
          try {
            const snap = await guardian.scanPosition(addr);
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

      // 2. POST /api/tick
      if (method === "POST" && pathname === "/api/tick") {
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
        const grantId = grantActionMatch[1]!;
        const action = grantActionMatch[2]!;

        switch (action) {
          case "approve": {
            const approved = await guardian.approveGrant(grantId);
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
  const targetPort = port ?? parseInt(process.env.BULWARK_WEB_PORT || "4567", 10);
  const server = createWebServer();

  return new Promise((resolve, reject) => {
    server.listen(targetPort, host, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : targetPort;
      console.log(`[POLICY INVARIANT] Bulwark Web Dashboard listening on http://${host}:${actualPort}`);
      console.log(`[POLICY INVARIANT] Public PoAA Verifier ready at http://${host}:${actualPort}/verify`);
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
