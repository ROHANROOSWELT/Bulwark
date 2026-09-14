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

  const feasiblePlans = quote.plans.filter((p) => p.isFeasible);
  if (feasiblePlans.length <= 1) {
    return quote;
  }

  const systemPrompt =
    "You are an underwriter agent for BULWARK Aave rescue desk.\n" +
    "You are provided a live position snapshot and a list of deterministically computed FEASIBLE plans.\n" +
    "Select the best plan for the position owner and provide a concise justification.\n" +
    "You MUST respond ONLY with valid JSON: { \"choice\": \"<planId>\", \"narrative\": \"<concise narrative>\" }.\n" +
    "You CANNOT modify amounts, assets, or limits. Any choice not in the provided feasible plan list will be rejected.";

  const userContent = JSON.stringify({
    healthFactor: quote.snapshot.healthFactor,
    totalCollateralUsd: quote.snapshot.totalCollateralUsd,
    totalDebtUsd: quote.snapshot.totalDebtUsd,
    feasiblePlans: feasiblePlans.map((p) => ({
      planId: p.planId,
      type: p.type,
      amountUsd: p.amountUsd,
      projectedHf: p.projectedHf,
      premiumUsd: p.premiumUsd,
    })),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const url = `${config.llmBaseUrl.replace(/\/$/, "")}/chat/completions`;
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
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return quote;

    const parsed = JSON.parse(content) as LlmTriageResponse;
    const chosenPlan = feasiblePlans.find((p) => p.planId === parsed.choice);

    if (chosenPlan) {
      return {
        ...quote,
        selectedPlan: chosenPlan,
        selectionMode: "AGENT_SELECT",
        agentNarrative: parsed.narrative ? `[AGENT OUTPUT] ${parsed.narrative}` : undefined,
      };
    }
  } catch {
    // Degrade gracefully to deterministic mode
  } finally {
    clearTimeout(timer);
  }

  return quote;
}
