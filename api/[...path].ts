import type { IncomingMessage, ServerResponse } from "node:http";
import http from "node:http";

const AZURE_BACKEND = process.env.AZURE_BACKEND_URL || "http://20.244.4.11";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const targetUrl = new URL(req.url || "/", AZURE_BACKEND);
  const options = {
    method: req.method,
    headers: {
      ...req.headers,
      host: targetUrl.host,
      "x-forwarded-host": req.headers.host || "",
      "x-forwarded-proto": "https",
    },
  };

  const proxyReq = http.request(targetUrl, options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Azure backend unreachable (${AZURE_BACKEND}): ${err.message}` }));
  });

  req.pipe(proxyReq);
}
