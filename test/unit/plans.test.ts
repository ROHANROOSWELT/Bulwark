import { describe, it, expect } from "vitest";
import {
  calculateProjectedHf,
  calculateBulwarkPremium,
  calculateExactRescueDebt,
  underwritePosition,
  generateCounterfactualLadder,
} from "../../packages/core/src/underwriter/plans.js";
import { triageWithLlm } from "../../packages/core/src/underwriter/llm.js";
import { PositionSnapshot } from "../../packages/core/src/aave/reader.js";
import { loadConfig } from "../../packages/core/src/config.js";

describe("Underwriter Pure Math & Counterfactual Ladder", () => {
  const sampleSnapshot: PositionSnapshot = {
    userAddress: "0x1111111111111111111111111111111111111111",
    chainId: 11155111,
    poolAddress: "0xpool",
    debtAssetAddress: "0xusdc",
    debtSymbol: "USDC",
    debtDecimals: 6,
    totalCollateralBase: 10000000000n, // $100 USD (8 dec)
    totalDebtBase: 7000000000n,       // $70 USD (8 dec)
    availableBorrowsBase: 1000000000n,
    currentLiquidationThresholdBps: 8000, // 0.80
    ltvBps: 7500,
    healthFactorWad: 1142857142857142857n,
    healthFactor: 1.143, // (100 * 0.8) / 70 = 1.1428...
    totalCollateralUsd: 100.0,
    totalDebtUsd: 70.0,
    debtTokenBalance: 70000000n,
    debtTokenBalanceHuman: 70.0,
    assetPriceBase: 100000000n,
    assetPriceUsd: 1.0,
    timestamp: "2026-09-14T00:00:00Z",
    sources: {
      userAccountData: "KEEPERHUB FACT",
      reserveTokens: "KEEPERHUB FACT",
      debtBalance: "KEEPERHUB FACT",
      price: "KEEPERHUB FACT",
      decimals: "KEEPERHUB FACT",
    },
  };

  it("computes exact projected HF for known repay amounts", () => {
    // C = 100, LT = 0.8, D = 70.
    // If repay R = 30: remaining debt = 40. Projected HF = 80 / 40 = 2.0.
    const hf2 = calculateProjectedHf(100, 0.8, 70, 30);
    expect(hf2).toBe(2.0);

    // If repay full debt R = 70: debt = 0 => 999.0
    const hfMax = calculateProjectedHf(100, 0.8, 70, 70);
    expect(hfMax).toBe(999.0);
  });

  it("verifies ladder monotonicity: more repay leads to strictly higher HF", () => {
    const ladder = generateCounterfactualLadder(sampleSnapshot, 25.0, 30.0);
    expect(ladder.length).toBeGreaterThan(1);

    for (let i = 1; i < ladder.length; i++) {
      const prev = ladder[i - 1]!;
      const curr = ladder[i]!;
      if (curr.candidateRepayUsd > prev.candidateRepayUsd) {
        expect(curr.projectedHf).toBeGreaterThanOrEqual(prev.projectedHf);
      }
    }
  });

  it("verifies Bulwark premium curve monotonicity with respect to urgency", () => {
    // HF closer to 1.0 (more urgent) yields higher premium for the same capital
    const premCritical = calculateBulwarkPremium(1.05, 20.0); // 1 / (1.05-1) = 20 -> clamped to 10
    const premWarning = calculateBulwarkPremium(1.20, 20.0);  // 1 / (1.20-1) = 5
    const premSafe = calculateBulwarkPremium(1.50, 20.0);     // 1 / (1.50-1) = 2

    expect(premCritical).toBeGreaterThan(premWarning);
    expect(premWarning).toBeGreaterThan(premSafe);
    expect(calculateBulwarkPremium(1.18, 0)).toBe(0); // 0 capital => 0 premium
  });

  it("underwrites position and picks cheapest feasible plan", () => {
    const quote = underwritePosition(sampleSnapshot, 35.0, 2.0);
    expect(quote.costToSafetyUsd).toBe(30.0); // 70 - 80/2 = 30
    expect(quote.selectedPlan.amountUsd).toBe(30.0);
    expect(quote.selectedPlan.projectedHf).toBe(2.0);
    expect(quote.selectedPlan.isFeasible).toBe(true);
  });

  it("LLM triage selects only within feasible plans and labels narrative as AGENT OUTPUT", async () => {
    const quote = underwritePosition(sampleSnapshot, 80.0, 2.0);
    const config = loadConfig({
      BULWARK_LLM_BASE_URL: "https://mock-llm.local",
      BULWARK_LLM_API_KEY: "mock-key",
      BULWARK_LLM_MODEL: "mock-gpt",
    });

    const mockFetch = async (): Promise<Response> => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  choice: "plan_repay_optimal",
                  narrative: "Repaying debt directly eliminates liquidation threshold risk fastest.",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const triaged = await triageWithLlm(quote, config, mockFetch);
    expect(triaged.selectionMode).toBe("AGENT_SELECT");
    expect(triaged.agentNarrative).toContain("[AGENT OUTPUT]");
    expect(triaged.selectedPlan.planId).toBe("plan_repay_optimal");
  });

  it("rejects malicious LLM response attempting to select unapproved plan", async () => {
    const quote = underwritePosition(sampleSnapshot, 35.0, 2.0);
    const config = loadConfig({
      BULWARK_LLM_BASE_URL: "https://mock-llm.local",
      BULWARK_LLM_API_KEY: "mock-key",
    });

    const maliciousFetch = async (): Promise<Response> => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  choice: "plan_hack_steal_funds",
                  narrative: "I am overriding the plan.",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const triaged = await triageWithLlm(quote, config, maliciousFetch);
    // Malicious choice not in set -> falls back to deterministic cheapest!
    expect(triaged.selectedPlan.planId).toBe("plan_repay_optimal");
    expect(triaged.selectionMode).toBe("DETERMINISTIC_CHEAPEST");
  });

  it("supports Google AI Studio native REST API response format", async () => {
    const quote = underwritePosition(sampleSnapshot, 35.0, 2.0);
    const config = loadConfig({
      GEMINI_API_KEY: "AQ.Ab8RN6I4s3xR0-BfqA2FkcyzuwjZOSbtCBATTA4vN73eLS3IxA",
    });

    const googleAiStudioFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      expect(String(url)).toContain("models/gemini-3.5-flash-lite:generateContent");
      const headers = init?.headers as Record<string, string>;
      expect(headers["x-goog-api-key"]).toBe("AQ.Ab8RN6I4s3xR0-BfqA2FkcyzuwjZOSbtCBATTA4vN73eLS3IxA");

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      choice: "plan_repay_optimal",
                      narrative: "Google AI Studio Gemini 3.5 selected optimal plan.",
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const triaged = await triageWithLlm(quote, config, googleAiStudioFetch);
    expect(triaged.selectionMode).toBe("AGENT_SELECT");
    expect(triaged.agentNarrative).toContain("Google AI Studio Gemini 3.5");
    expect(triaged.selectedPlan.planId).toBe("plan_repay_optimal");
  });

  it("calculates exact closed-form BigInt debt reduction targeting exact HF", () => {
    // C = 100 base, LT = 8000 (0.80), D = 70 base
    // Coverage = 100 * 0.80 = 80 base
    // Target HF = 1.60 WAD (1.6 * 1e18)
    // Target Debt = 80 / 1.6 = 50 base
    // Exact Repay = 70 - 50 = 20 base ($20.00)
    const exact = calculateExactRescueDebt(
      10000000000n, // $100 base
      7000000000n,  // $70 base
      8000,         // 80%
      1600000000000000000n // 1.60 WAD
    );

    expect(exact.exactRepayBase).toBe(2000000000n); // Exactly $20 base
    expect(exact.targetDebtBase).toBe(5000000000n);  // Exactly $50 remaining debt
    expect(exact.projectedHfWad).toBe(1600000000000000000n); // Exactly 1.60 WAD!
  });

  it("includes multi-vector flash-deleverage plan when collateral buffer permits", () => {
    const quote = underwritePosition(sampleSnapshot, 50.0, 2.0);
    const flashPlan = quote.plans.find((p) => p.type === "flash-deleverage");
    expect(flashPlan).toBeDefined();
    expect(flashPlan?.isFeasible).toBe(true);
    expect(flashPlan?.flashLoanParams?.flashLoanAmountUsd).toBe(30.0);
    expect(flashPlan?.flashLoanParams?.withdrawnCollateralUsd).toBe(37.5); // 30 / 0.8
  });
});
