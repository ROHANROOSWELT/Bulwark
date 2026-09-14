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

export function createWebServer(options: WebServerOptions = {}): http.Server {
  const guardian = options.guardian ?? new BulwarkGuardian();
  const watchlist = options.watchlist ?? ["0x0000000000000000000000000000000000000001"];

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
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
      });
      res.end(body);
    };

    // Helper to parse JSON body
    const readBody = async <T>(): Promise<T> => {
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
      if (method === "GET") {
        if (pathname === "/" || pathname === "/index.html") {
          serveFile(path.join(PUBLIC_DIR, "index.html"), "text/html");
          return;
        }
        if (pathname === "/verify" || pathname === "/verify.html") {
          serveFile(path.join(PUBLIC_DIR, "verify.html"), "text/html");
          return;
        }
        if (pathname === "/style.css") {
          serveFile(path.join(PUBLIC_DIR, "style.css"), "text/css");
          return;
        }
        if (pathname === "/app.js") {
          serveFile(path.join(PUBLIC_DIR, "app.js"), "application/javascript");
          return;
        }
        if (pathname === "/verify.js") {
          serveFile(path.join(PUBLIC_DIR, "verify.js"), "application/javascript");
          return;
        }
      }

      // ── API Routes ─────────────────────────────────────────────────────────

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

      // 4. POST /api/grants/:id/(approve|revoke|dry|execute)
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
  });

  return server;
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
