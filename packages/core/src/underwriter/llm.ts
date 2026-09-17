/**
 * Optional Underwriter Agent LLM Triage.
 * OpenAI-compatible chat completion.
 * HARD RULE: LLM output is strictly labeled "AGENT OUTPUT".
 * The LLM CAN ONLY SELECT among feasible plans produced deterministically.
 * It CANNOT alter sizing, assets, recipients, or limits.
 * In case of timeout, invalid JSON, or missing API key, degrades to deterministic mode.
 */

import { UnderwriterQuote, RescuePlan } from "./plans.js";
import { BulwarkConfig } from "../config.js";

export interface LlmTriageResponse {
  choice: string;
  narrative: string;
  proposedAmountUsd?: number;
}

// ── In-memory triage cache (2 min TTL) to preserve Google AI Studio free tier quota (500 req/day) ──
const triageCache = new Map<string, { quote: UnderwriterQuote; expiresAt: number }>();
let dailyCount = 0;
let currentDate = new Date().toISOString().slice(0, 10);
const DAILY_MAX = 480;

export function getLlmQuotaStatus() {
  return {
    dailyRequestsUsed: dailyCount,
    dailyBudget: DAILY_MAX,
    cachedEntries: triageCache.size,
  };
}

export async function triageWithLlm(
  quote: UnderwriterQuote,
  config: BulwarkConfig,
  fetchFn: typeof fetch = globalThis.fetch
): Promise<UnderwriterQuote> {
  // If no LLM endpoint or key configured, return deterministic quote
  if (!config.llmApiKey || !config.llmBaseUrl) {
    return quote;
  }

  const candidatePlans = quote.plans.filter((p) => p.isFeasible || p.isPartialMitigation);
  if (candidatePlans.length <= 1) {
    return quote;
  }

  // Quota & Reset check
  const today = new Date().toISOString().slice(0, 10);
  if (today !== currentDate) {
    currentDate = today;
    dailyCount = 0;
  }

  if (dailyCount >= DAILY_MAX) {
    console.warn(`[POLICY INVARIANT] Gemini daily quota budget reached (${dailyCount}/${DAILY_MAX}). Using deterministic underwriter fallback.`);
    return quote;
  }

  const isDefaultFetch = fetchFn === globalThis.fetch;

  // Cache lookup (only for default fetch in production/runtime)
  const cacheKey = `${quote.snapshot?.userAddress || "anon"}_${quote.snapshot?.healthFactor?.toFixed(3) || "0"}_${quote.snapshot?.totalDebtUsd?.toFixed(0) || "0"}`;
  if (isDefaultFetch) {
    const cached = triageCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.quote;
    }
  }

  // The deterministic engine gives us the closed-form reference (e.g. $4.98 to target HF 2.0).
  // Gemini acts as autonomous underwriter: it evaluates the position risk, reviews the
  // reference calculation, selects the plan, and proposes a repayment amount.
  // Policy Compiler will then clamp whatever Gemini proposes to the human-approved grant limit.
  const referenceAmount = quote.costToSafetyUsd > 0 ? quote.costToSafetyUsd : quote.selectedPlan.amountUsd;

  const systemPrompt =
    "You are an autonomous underwriter agent for the BULWARK Aave rescue desk.\n" +
    "You are provided a live Aave V3 position snapshot, a closed-form reference repayment calculation, and a list of valid candidate rescue plans.\n" +
    "Your role: evaluate the position risk, select the best rescue plan, and propose a repayment amount in USD (proposedAmountUsd).\n" +
    "The closed-form reference calculation is the mathematically exact amount to reach target HF — use it as your primary reference unless you have strong risk reasoning to deviate.\n" +
    "You MUST respond ONLY with valid JSON: { \"choice\": \"<planId>\", \"proposedAmountUsd\": <number>, \"narrative\": \"<concise justification of your amount and plan selection>\" }.\n" +
    "Any choice not in the provided candidate plan list will be rejected by policy.";

  const userContent = JSON.stringify({
    healthFactor: quote.snapshot.healthFactor,
    totalCollateralUsd: quote.snapshot.totalCollateralUsd,
    totalDebtUsd: quote.snapshot.totalDebtUsd,
    referenceCalculatedRepayUsd: Math.round(referenceAmount * 100) / 100,
    referenceTargetHf: config.policyHfTarget || 2.0,
    candidatePlans: candidatePlans.map((p) => ({
      planId: p.planId,
      type: p.type,
      amountUsd: p.amountUsd,
      projectedHf: p.projectedHf,
      isFeasible: p.isFeasible,
      isPartialMitigation: p.isPartialMitigation,
      premiumUsd: p.premiumUsd,
    })),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const isGoogleAiStudioNative =
      config.llmBaseUrl.includes("generativelanguage.googleapis.com") &&
      !config.llmBaseUrl.includes("/openai");

    let content: string | undefined;

    if (isGoogleAiStudioNative) {
      // ── Official Google AI Studio REST API (v1beta / models/{model}:generateContent) ──
      const model = config.llmModel.startsWith("gemini") ? config.llmModel : "gemini-3.5-flash-lite";
      const url = `${config.llmBaseUrl.replace(/\/+$/, "")}/models/${model}:generateContent`;

      const res = await fetchFn(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": config.llmApiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userContent }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        return quote; // Fallback to deterministic
      }

      const data = (await res.json()) as any;
      content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    } else {
      // ── Standard OpenAI-compatible format (OpenAI, OpenRouter, Groq, or Gemini /openai) ──
      const url = `${config.llmBaseUrl.replace(/\/+$/, "")}/chat/completions`;
      const res = await fetchFn(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.llmApiKey}`,
        },
        body: JSON.stringify({
          model: config.llmModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          temperature: 0.1,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        return quote; // Fallback to deterministic
      }

      const data = (await res.json()) as any;
      content = data?.choices?.[0]?.message?.content;
    }
    if (!content) return quote;

    const parsed = JSON.parse(content) as LlmTriageResponse;
    const chosenPlan = candidatePlans.find((p) => p.planId === parsed.choice);

    if (chosenPlan) {
      if (isDefaultFetch) {
        dailyCount++;
      }
      // Extract Gemini's autonomous proposedAmountUsd decision
      let proposedAmountUsd: number | undefined = undefined;
      if (
        typeof parsed.proposedAmountUsd === "number" &&
        !isNaN(parsed.proposedAmountUsd) &&
        parsed.proposedAmountUsd > 0
      ) {
        proposedAmountUsd = Math.round(parsed.proposedAmountUsd * 100) / 100;
      }
      const resultQuote: UnderwriterQuote = {
        ...quote,
        selectedPlan: chosenPlan,
        selectionMode: "AGENT_SELECT",
        agentNarrative: parsed.narrative ? `[AGENT OUTPUT] ${parsed.narrative}` : undefined,
        proposedAmountUsd,
      };
      if (isDefaultFetch) {
        triageCache.set(cacheKey, { quote: resultQuote, expiresAt: Date.now() + 120_000 });
      }
      return resultQuote;
    }
  } catch {
    // Degrade gracefully to deterministic mode
  } finally {
    clearTimeout(timer);
  }

  return quote;
}
