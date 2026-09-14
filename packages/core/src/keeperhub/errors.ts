/**
 * Typed errors for the KeeperHub client.
 * Strictly guarantees that API keys and sensitive Bearer tokens are NEVER logged or leaked.
 */

export interface KeeperHubErrorEnvelope {
  error: string;
  detail?: string;
  hint?: string;
  docs?: string;
  request_id?: string;
  code?: string;
  failureKind?: string;
  wouldRevert?: boolean;
  revertReason?: string;
}

export function redactSensitive(text: string): string {
  if (!text) return text;
  return text.replace(/Bearer\s+kh_[A-Za-z0-9_\-\.]+/gi, "Bearer [REDACTED_KH_KEY]")
             .replace(/kh_[A-Za-z0-9_\-\.]{10,}/gi, "[REDACTED_KH_KEY]");
}

export class KeeperHubApiError extends Error {
  public readonly status: number;
  public readonly errorName: string;
  public readonly detail?: string;
  public readonly hint?: string;
  public readonly docs?: string;
  public readonly requestId?: string;
  public readonly retryAfter?: number;
  public readonly failureKind?: string;
  public readonly wouldRevert?: boolean;
  public readonly revertReason?: string;

  constructor(
    status: number,
    envelope: KeeperHubErrorEnvelope,
    retryAfter?: number
  ) {
    const safeDetail = envelope.detail ? redactSensitive(envelope.detail) : undefined;
    const msg = `KeeperHub API Error (${status}): ${envelope.error}${safeDetail ? ` - ${safeDetail}` : ""}`;
    super(redactSensitive(msg));
    this.name = "KeeperHubApiError";
    this.status = status;
    this.errorName = envelope.error;
    this.detail = safeDetail;
    this.hint = envelope.hint ? redactSensitive(envelope.hint) : undefined;
    this.docs = envelope.docs;
    this.requestId = envelope.request_id;
    this.retryAfter = retryAfter;
    this.failureKind = envelope.failureKind;
    this.wouldRevert = envelope.wouldRevert;
    this.revertReason = envelope.revertReason;
  }
}

export class KeeperHubSimulateForbiddenError extends Error {
  constructor(actionOrRoute: string) {
    super(
      `Refusing simulate:true on "${actionOrRoute}". ` +
      `VERIFIED SECURITY FOOTGUN: KeeperHub ignores simulate on protocol actions and /api/execute/node, ` +
      `resulting in real live broadcasting! Use contract-call, transfer, or check-and-execute instead.`
    );
    this.name = "KeeperHubSimulateForbiddenError";
  }
}
