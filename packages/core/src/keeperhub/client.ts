/**
 * Pure TypeScript KeeperHub REST API Client.
 * Strict adherence to docs/RESEARCH_KEEPERHUB.md verified surfaces.
 * Zero external dependencies.
 */

import {
  ChainInfo,
  SpendCapInfo,
  ContractCallRequest,
  TransferRequest,
  CheckAndExecuteRequest,
  DirectExecutionStatusResponse,
  SimulationResult,
  WorkflowObject,
  WorkflowCreateRequest,
  WorkflowUpdateRequest,
  WorkflowExecutionSummary,
  WorkflowExecutionStatus,
  WorkflowNodeLog,
  MarketplaceWorkflowListing,
} from "./types.js";
import {
  KeeperHubApiError,
  KeeperHubErrorEnvelope,
  KeeperHubSimulateForbiddenError,
  redactSensitive,
} from "./errors.js";

export interface KeeperHubClientOptions {
  apiKey?: string;
  apiBase?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export class KeeperHubClient {
  private readonly apiKey?: string;
  private readonly apiBase: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: KeeperHubClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.apiBase = (options.apiBase ?? "https://app.keeperhub.com").replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  public hasKey(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 5);
  }

  private async request<T>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PATCH" | "DELETE";
      body?: unknown;
      headers?: Record<string, string>;
      idempotencyKey?: string;
      requiresAuth?: boolean;
    } = {}
  ): Promise<{ data: T; headers: Headers; status: number }> {
    const method = options.method ?? "GET";
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(options.headers ?? {}),
    };

    if (options.requiresAuth !== false && this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    let requestBody: string | undefined = undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      requestBody = JSON.stringify(options.body);
    }

    const url = `${this.apiBase}${path.startsWith("/") ? path : `/${path}`}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.fetchFn(url, {
        method,
        headers,
        body: requestBody,
        signal: controller.signal,
      });

      const responseHeaders = res.headers;
      const status = res.status;

      let json: unknown = undefined;
      const contentType = responseHeaders.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        json = await res.json();
      } else {
        const text = await res.text();
        try {
          json = JSON.parse(text);
        } catch {
          json = { error: text || res.statusText };
        }
      }

      if (!res.ok) {
        let retryAfter: number | undefined;
        const retryHeader = responseHeaders.get("retry-after");
        if (retryHeader) {
          const parsed = parseInt(retryHeader, 10);
          if (!isNaN(parsed)) retryAfter = parsed;
        }

        const envelope = (json && typeof json === "object" ? json : { error: res.statusText }) as KeeperHubErrorEnvelope;
        throw new KeeperHubApiError(status, envelope, retryAfter);
      }

      return { data: json as T, headers: responseHeaders, status };
    } catch (err: unknown) {
      if (err instanceof KeeperHubApiError || err instanceof KeeperHubSimulateForbiddenError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(redactSensitive(`KeeperHub request failed (${method} ${path}): ${message}`));
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Public & Metadata Endpoints ──────────────────────────────────────────

  /**
   * GET /api/chains (Public endpoint, 24 verified chains)
   */
  public async getChains(): Promise<ChainInfo[]> {
    const res = await this.request<ChainInfo[]>("/api/chains", {
      method: "GET",
      requiresAuth: false,
    });
    return res.data;
  }

  /**
   * GET /api/keys (Requires organization key)
   */
  public async getKeys(): Promise<Record<string, unknown>> {
    const res = await this.request<Record<string, unknown>>("/api/keys", {
      method: "GET",
      requiresAuth: true,
    });
    return res.data;
  }

  /**
   * GET /api/analytics/spend-cap (Daily native caps & remaining budget)
   */
  public async getSpendCap(): Promise<SpendCapInfo> {
    const res = await this.request<SpendCapInfo>("/api/analytics/spend-cap", {
      method: "GET",
      requiresAuth: true,
    });
    return res.data;
  }

  // ── Direct Execution Endpoints (Verified) ────────────────────────────────

  /**
   * POST /api/execute/contract-call
   * Supports view reads, write broadcasts, and simulate:true
   */
  public async executeContractCall(
    req: ContractCallRequest,
    idempotencyKey?: string
  ): Promise<DirectExecutionStatusResponse | SimulationResult | { result: string }> {
    const res = await this.request<DirectExecutionStatusResponse | SimulationResult | { result: string }>(
      "/api/execute/contract-call",
      {
        method: "POST",
        body: req,
        idempotencyKey,
        requiresAuth: true,
      }
    );
    return res.data;
  }

  /**
   * POST /api/execute/transfer
   * Supports native/token transfers and simulate:true
   */
  public async executeTransfer(
    req: TransferRequest,
    idempotencyKey?: string
  ): Promise<DirectExecutionStatusResponse | SimulationResult> {
    const res = await this.request<DirectExecutionStatusResponse | SimulationResult>(
      "/api/execute/transfer",
      {
        method: "POST",
        body: req,
        idempotencyKey,
        requiresAuth: true,
      }
    );
    return res.data;
  }

  /**
   * POST /api/execute/check-and-execute
   * Condition-gated write execution and simulate:true
   */
  public async executeCheckAndExecute(
    req: CheckAndExecuteRequest,
    idempotencyKey?: string
  ): Promise<DirectExecutionStatusResponse | SimulationResult> {
    const res = await this.request<DirectExecutionStatusResponse | SimulationResult>(
      "/api/execute/check-and-execute",
      {
        method: "POST",
        body: req,
        idempotencyKey,
        requiresAuth: true,
      }
    );
    return res.data;
  }

  /**
   * Refuses simulate:true on unsafe endpoints.
   * Guard for protocol actions and /api/execute/node where simulate is silently ignored.
   */
  public assertSimulationSafety(actionOrRoute: string, simulate?: boolean): void {
    if (simulate) {
      const lower = actionOrRoute.toLowerCase();
      const isAllowed =
        lower.includes("contract-call") ||
        lower.includes("transfer") ||
        lower.includes("check-and-execute");
      if (!isAllowed || lower.includes("protocol") || lower.includes("node")) {
        throw new KeeperHubSimulateForbiddenError(actionOrRoute);
      }
    }
  }

  /**
   * GET /api/execute/{id}/status
   * Direct execution status, including on-chain receipts and polling hint.
   */
  public async getExecutionStatus(
    executionId: string
  ): Promise<{ data: DirectExecutionStatusResponse; pollIntervalHintSeconds?: number }> {
    const res = await this.request<DirectExecutionStatusResponse>(
      `/api/execute/${encodeURIComponent(executionId)}/status`,
      {
        method: "GET",
        requiresAuth: true,
      }
    );

    let pollIntervalHintSeconds: number | undefined;
    const pollHint = res.headers.get("x-poll-interval-hint");
    if (pollHint !== null) {
      const parsed = parseInt(pollHint, 10);
      if (!isNaN(parsed)) pollIntervalHintSeconds = parsed;
    }

    return {
      data: res.data,
      pollIntervalHintSeconds,
    };
  }

  /**
   * Subscribes to real-time Server-Sent Events (SSE) for execution status.
   * If SSE is unavailable (404/non-200), gracefully falls back to polling getExecutionStatus.
   */
  public async subscribeExecutionStatus(
    executionId: string,
    onUpdate?: (status: DirectExecutionStatusResponse) => void,
    timeoutMs = 60000
  ): Promise<DirectExecutionStatusResponse> {
    const isTerminal = (s: string) =>
      ["completed", "success", "failed", "error", "system_error"].includes(s.toLowerCase());

    // 1. Try SSE endpoint first (/api/execute/{id}/events)
    try {
      const url = `${this.apiBase}/api/execute/${encodeURIComponent(executionId)}/events`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 10000));

      const res = await (this.fetchFn ?? fetch)(url, {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";

          for (const block of blocks) {
            const dataLine = block.split("\n").find((l) => l.startsWith("data:"));
            if (dataLine) {
              const dataStr = dataLine.replace(/^data:\s*/, "");
              try {
                const parsed = JSON.parse(dataStr) as DirectExecutionStatusResponse;
                if (onUpdate) onUpdate(parsed);
                if (isTerminal(parsed.status)) {
                  reader.cancel();
                  return parsed;
                }
              } catch {
                // Ignore non-JSON heartbeat lines
              }
            }
          }
        }
      }
    } catch {
      // SSE not supported or network error -> proceed to polling fallback
    }

    // 2. Resilient Polling Fallback
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const poll = await this.getExecutionStatus(executionId);
      if (onUpdate) onUpdate(poll.data);
      if (isTerminal(poll.data.status)) {
        return poll.data;
      }
      const waitTime = Math.max(1, poll.pollIntervalHintSeconds ?? 2) * 1000;
      await new Promise((r) => setTimeout(r, waitTime));
    }

    const finalPoll = await this.getExecutionStatus(executionId);
    return finalPoll.data;
  }

  // ── Workflow Endpoints (Verified) ────────────────────────────────────────

  /**
   * GET /api/workflows
   */
  public async listWorkflows(query?: {
    projectId?: string;
    tagId?: string;
    limit?: number;
    offset?: number;
  }): Promise<WorkflowObject[]> {
    const params = new URLSearchParams();
    if (query?.projectId) params.set("projectId", query.projectId);
    if (query?.tagId) params.set("tagId", query.tagId);
    if (query?.limit) params.set("limit", query.limit.toString());
    if (query?.offset) params.set("offset", query.offset.toString());
    const qs = params.toString();

    const res = await this.request<WorkflowObject[]>(`/api/workflows${qs ? `?${qs}` : ""}`, {
      method: "GET",
      requiresAuth: true,
    });
    return res.data;
  }

  /**
   * POST /api/workflows/create
   */
  public async createWorkflow(
    req: WorkflowCreateRequest,
    idempotencyKey?: string
  ): Promise<WorkflowObject> {
    const res = await this.request<WorkflowObject>("/api/workflows/create", {
      method: "POST",
      body: req,
      idempotencyKey,
      requiresAuth: true,
    });
    return res.data;
  }

  /**
   * GET /api/workflows/{id}
   */
  public async getWorkflow(id: string): Promise<WorkflowObject> {
    const res = await this.request<WorkflowObject>(`/api/workflows/${encodeURIComponent(id)}`, {
      method: "GET",
      requiresAuth: true,
    });
    return res.data;
  }

  /**
   * PATCH /api/workflows/{id}
   */
  public async updateWorkflow(
    id: string,
    req: WorkflowUpdateRequest
  ): Promise<WorkflowObject> {
    const res = await this.request<WorkflowObject>(`/api/workflows/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: req,
      requiresAuth: true,
    });
    return res.data;
  }

  /**
   * DELETE /api/workflows/{id}
   */
  public async deleteWorkflow(
    id: string,
    force = false
  ): Promise<{ success: boolean }> {
    const res = await this.request<{ success: boolean }>(
      `/api/workflows/${encodeURIComponent(id)}${force ? "?force=true" : ""}`,
      {
        method: "DELETE",
        requiresAuth: true,
      }
    );
    return res.data;
  }

  /**
   * POST /api/workflows/{id}/execute
   * Body must only contain input; sending executionId triggers 400.
   */
  public async executeWorkflow(
    id: string,
    input?: Record<string, unknown>,
    idempotencyKey?: string
  ): Promise<{ executionId: string; status: string }> {
    const res = await this.request<{ executionId: string; status: string }>(
      `/api/workflows/${encodeURIComponent(id)}/execute`,
      {
        method: "POST",
        body: input ? { input } : {},
        idempotencyKey,
        requiresAuth: true,
      }
    );
    return res.data;
  }

  /**
   * GET /api/workflows/{id}/executions
   */
  public async getWorkflowExecutions(id: string): Promise<WorkflowExecutionSummary[]> {
    const res = await this.request<WorkflowExecutionSummary[]>(
      `/api/workflows/${encodeURIComponent(id)}/executions`,
      {
        method: "GET",
        requiresAuth: true,
      }
    );
    return res.data;
  }

  /**
   * GET /api/workflows/executions/{id}/status
   */
  public async getWorkflowExecutionStatus(executionId: string): Promise<WorkflowExecutionStatus> {
    const res = await this.request<WorkflowExecutionStatus>(
      `/api/workflows/executions/${encodeURIComponent(executionId)}/status`,
      {
        method: "GET",
        requiresAuth: true,
      }
    );
    return res.data;
  }

  /**
   * GET /api/workflows/executions/{id}/wait
   */
  public async waitWorkflowExecution(
    executionId: string,
    timeoutMs = 25000
  ): Promise<WorkflowExecutionStatus> {
    const res = await this.request<WorkflowExecutionStatus>(
      `/api/workflows/executions/${encodeURIComponent(executionId)}/wait?timeoutMs=${timeoutMs}`,
      {
        method: "GET",
        requiresAuth: true,
      }
    );
    return res.data;
  }

  /**
   * GET /api/workflows/executions/{id}/logs
   */
  public async getWorkflowExecutionLogs(executionId: string): Promise<WorkflowNodeLog[]> {
    const res = await this.request<WorkflowNodeLog[]>(
      `/api/workflows/executions/${encodeURIComponent(executionId)}/logs`,
      {
        method: "GET",
        requiresAuth: true,
      }
    );
    return res.data;
  }

  /**
   * POST /api/executions/{id}/cancel
   */
  public async cancelExecution(executionId: string): Promise<{ success: boolean }> {
    const res = await this.request<{ success: boolean }>(
      `/api/executions/${encodeURIComponent(executionId)}/cancel`,
      {
        method: "POST",
        requiresAuth: true,
      }
    );
    return res.data;
  }

  // ── Marketplace Endpoints ────────────────────────────────────────────────

  /**
   * GET /api/mcp/workflows
   */
  public async listMarketplaceWorkflows(): Promise<MarketplaceWorkflowListing[]> {
    const res = await this.request<MarketplaceWorkflowListing[]>("/api/mcp/workflows", {
      method: "GET",
      requiresAuth: false,
    });
    return res.data;
  }

  /**
   * POST /api/mcp/workflows/{slug}/call
   */
  public async callMarketplaceWorkflow(
    slug: string,
    input?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const res = await this.request<Record<string, unknown>>(
      `/api/mcp/workflows/${encodeURIComponent(slug)}/call`,
      {
        method: "POST",
        body: input ? { input } : {},
        requiresAuth: true,
      }
    );
    return res.data;
  }
}
