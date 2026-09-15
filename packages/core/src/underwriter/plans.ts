/**
 * Bulwark Underwriter: Counterfactual Ladder, Plan Evaluation, and Premium Curve.
 * Pure deterministic mathematics based on verified chain facts.
 * Source of truth: docs/BUILD.md §4 P6 and docs/ORIGINALITY_UPGRADE.md §7.
 */

import { PositionSnapshot } from "../aave/reader.js";

export interface RescuePlan {
  planId: string;
  type: "repay" | "add-collateral" | "flash-deleverage";
  targetHf: number;
  amountUsd: number;
  projectedHf: number;
  isFeasible: boolean;
  isPartialMitigation?: boolean;
  infeasibilityReason?: string;
  premiumUsd: number;
  flashLoanParams?: {
    flashLoanAmountUsd: number;
    withdrawnCollateralUsd: number;
    estimatedSlippageBps: number;
  };
  provenance: {
    math: "DETERMINISTIC";
    premium: "BOOKKEEPING";
  };
}

export interface LadderRung {
  candidateRepayUsd: number;
  projectedHf: number;
  liquidationRiskDeltaPct: number; // reduction in liquidation risk
  premiumUsd: number;
}

export interface UnderwriterQuote {
  snapshot: PositionSnapshot;
  costToSafetyUsd: number;
  plans: RescuePlan[];
  selectedPlan: RescuePlan;
  ladder: LadderRung[];
  selectionMode: "DETERMINISTIC_CHEAPEST" | "AGENT_SELECT";
  agentNarrative?: string;
}

/**
 * Calculates Bulwark Premium Curve:
 * premium = base + urgency * capital * (rateBps / 10000)
 * urgency = clamp(1 / (HF - 1), 0, 10)
 */
export function calculateBulwarkPremium(
  liveHf: number,
  capitalUsd: number,
  baseUsd = 0.5,
  rateBps = 200
): number {
  if (capitalUsd <= 0) return 0;
  const distance = Math.max(0.001, liveHf - 1.0);
  const rawUrgency = 1.0 / distance;
  const urgency = Math.min(10.0, Math.max(0.0, rawUrgency));
  const variable = urgency * capitalUsd * (rateBps / 10000);
  return Math.round((baseUsd + variable) * 100) / 100;
}

/**
 * Calculates projected Health Factor after a debt repay amount.
 * HF = (Collateral * LT) / (Debt - Repay)
 */
export function calculateProjectedHf(
  collateralUsd: number,
  ltFraction: number,
  debtUsd: number,
  repayUsd: number
): number {
  const effectiveRepay = Math.min(debtUsd, Math.max(0, repayUsd));
  const remainingDebt = debtUsd - effectiveRepay;
  if (remainingDebt <= 0.0001) {
    return 999.0; // Debt fully extinguished
  }
  const collateralCoverage = collateralUsd * ltFraction;
  return collateralCoverage / remainingDebt;
}

/**
 * Generates the Counterfactual Ladder for an owner position.
 */
export function generateCounterfactualLadder(
  snapshot: PositionSnapshot,
  bandCapUsd: number,
  costToSafetyUsd: number
): LadderRung[] {
  const candidates = [
    0,
    bandCapUsd * 0.25,
    bandCapUsd * 0.5,
    bandCapUsd * 0.75,
    bandCapUsd,
    costToSafetyUsd,
  ];

  // Deduplicate and sort candidate amounts
  const uniqueCandidates = Array.from(new Set(candidates.map((c) => Math.round(c * 100) / 100))).sort((a, b) => a - b);

  const ltFraction = snapshot.currentLiquidationThresholdBps / 10000;
  const baselineHf = snapshot.healthFactor;

  return uniqueCandidates.map((amount) => {
    const projectedHf = calculateProjectedHf(
      snapshot.totalCollateralUsd,
      ltFraction,
      snapshot.totalDebtUsd,
      amount
    );

    // Delta: positive improvement in HF margin
    const liquidationRiskDeltaPct = baselineHf > 0 ? ((projectedHf - baselineHf) / baselineHf) * 100 : 0;
    const premiumUsd = calculateBulwarkPremium(baselineHf, amount);

    return {
      candidateRepayUsd: amount,
      projectedHf: Math.round(projectedHf * 100) / 100,
      liquidationRiskDeltaPct: Math.round(liquidationRiskDeltaPct * 10) / 10,
      premiumUsd,
    };
  });
}

/**
 * Exact closed-form Health Factor inversion using BigInt math.
 * Calculates the exact wei-level debt reduction required to achieve targetHfWad.
 *
 * targetHfWad = (totalCollateralBase * currentLiquidationThresholdBps / 10000) * 1e18 / targetDebtBase
 * => targetDebtBase = (totalCollateralBase * currentLiquidationThresholdBps * 1e18) / (10000 * targetHfWad)
 * => exactRepayBase = totalDebtBase - targetDebtBase
 */
export function calculateExactRescueDebt(
  totalCollateralBase: bigint,
  totalDebtBase: bigint,
  currentLiquidationThresholdBps: number,
  targetHfWad: bigint = 1500000000000000000n // 1.50 WAD default
): {
  exactRepayBase: bigint;
  targetDebtBase: bigint;
  targetHfWad: bigint;
  projectedHfWad: bigint;
} {
  if (targetHfWad <= 0n || currentLiquidationThresholdBps <= 0) {
    return { exactRepayBase: 0n, targetDebtBase: totalDebtBase, targetHfWad, projectedHfWad: 0n };
  }

  const collateralCoverage = (totalCollateralBase * BigInt(currentLiquidationThresholdBps)) / 10000n;
  const targetDebtBase = (collateralCoverage * 1000000000000000000n) / targetHfWad;

  if (totalDebtBase <= targetDebtBase) {
    // Already healthier than target
    return {
      exactRepayBase: 0n,
      targetDebtBase,
      targetHfWad,
      projectedHfWad:
        totalDebtBase > 0n
          ? (collateralCoverage * 1000000000000000000n) / totalDebtBase
          : 999000000000000000000n,
    };
  }

  const exactRepayBase = totalDebtBase - targetDebtBase;
  const remainingDebt = totalDebtBase - exactRepayBase;
  const projectedHfWad =
    remainingDebt > 0n
      ? (collateralCoverage * 1000000000000000000n) / remainingDebt
      : 999000000000000000000n;

  return {
    exactRepayBase,
    targetDebtBase,
    targetHfWad,
    projectedHfWad,
  };
}

/**
 * Deterministically computes counterfactual rescue plans and selects the optimal path.
 */
export function underwritePosition(
  snapshot: PositionSnapshot,
  maxAllowedCapUsd: number,
  targetHf = 2.0,
  allowedActions?: ("repay" | "add-collateral" | "flash-deleverage")[]
): UnderwriterQuote {
  const ltFraction = snapshot.currentLiquidationThresholdBps / 10000;
  const C = snapshot.totalCollateralUsd;
  const D = snapshot.totalDebtUsd;

  // 1. Repay plan math: R = D - (C * LT) / targetHf
  let costToSafetyUsd = 0;
  if (targetHf > 0 && ltFraction > 0) {
    const requiredDebtForTarget = (C * ltFraction) / targetHf;
    costToSafetyUsd = Math.max(0, D - requiredDebtForTarget);
  }

  // 2. Build Repay Plan (Capital Injection)
  const repayAmountClamped = Math.min(costToSafetyUsd, maxAllowedCapUsd);
  const repayProjectedHf = calculateProjectedHf(C, ltFraction, D, repayAmountClamped);
  const repayReachesTarget = repayProjectedHf >= targetHf - 0.01;
  const repayWithinCap = costToSafetyUsd <= maxAllowedCapUsd;
  const repayFeasible = costToSafetyUsd > 0 && repayWithinCap && repayReachesTarget;
  const repayPartial = !repayFeasible && repayAmountClamped > 0 && repayProjectedHf > snapshot.healthFactor;

  const repayPlan: RescuePlan = {
    planId: "plan_repay_optimal",
    type: "repay",
    targetHf,
    amountUsd: Math.round(repayAmountClamped * 100) / 100,
    projectedHf: Math.round(repayProjectedHf * 100) / 100,
    isFeasible: repayFeasible,
    isPartialMitigation: repayPartial,
    infeasibilityReason: repayFeasible
      ? undefined
      : costToSafetyUsd > maxAllowedCapUsd
      ? `Required repay $${costToSafetyUsd.toFixed(2)} exceeds cap $${maxAllowedCapUsd.toFixed(2)} (partial projected HF ${repayProjectedHf.toFixed(2)} < target ${targetHf})`
      : `Projected HF ${repayProjectedHf.toFixed(2)} cannot reach target HF ${targetHf}`,
    premiumUsd: calculateBulwarkPremium(snapshot.healthFactor, repayAmountClamped),
    provenance: {
      math: "DETERMINISTIC",
      premium: "BOOKKEEPING",
    },
  };

  // 3. Build Collateral Top-up Plan: X = (D * targetHf / LT) - C
  let topUpAmount = 0;
  if (ltFraction > 0) {
    topUpAmount = Math.max(0, (D * targetHf) / ltFraction - C);
  }
  const topUpClamped = Math.min(topUpAmount, maxAllowedCapUsd);
  const topUpProjectedHf = D > 0 ? ((C + topUpClamped) * ltFraction) / D : 999.0;
  const topUpReachesTarget = topUpProjectedHf >= targetHf - 0.01;
  const topUpWithinCap = topUpAmount <= maxAllowedCapUsd;
  const topUpFeasible = topUpAmount > 0 && topUpWithinCap && topUpReachesTarget;
  const topUpPartial = !topUpFeasible && topUpClamped > 0 && topUpProjectedHf > snapshot.healthFactor;

  const topUpPlan: RescuePlan = {
    planId: "plan_topup_collateral",
    type: "add-collateral",
    targetHf,
    amountUsd: Math.round(topUpClamped * 100) / 100,
    projectedHf: Math.round(topUpProjectedHf * 100) / 100,
    isFeasible: topUpFeasible,
    isPartialMitigation: topUpPartial,
    infeasibilityReason: topUpFeasible
      ? undefined
      : topUpAmount > maxAllowedCapUsd
      ? `Required collateral $${topUpAmount.toFixed(2)} exceeds cap $${maxAllowedCapUsd.toFixed(2)} (partial projected HF ${topUpProjectedHf.toFixed(2)} < target ${targetHf})`
      : `Projected HF ${topUpProjectedHf.toFixed(2)} cannot reach target HF ${targetHf}`,
    premiumUsd: calculateBulwarkPremium(snapshot.healthFactor, topUpClamped),
    provenance: {
      math: "DETERMINISTIC",
      premium: "BOOKKEEPING",
    },
  };

  // 4. Multi-Vector Plan: Flash-Deleverage (Zero Desk Capital Required)
  // Borrow flashloan = costToSafetyUsd -> repay debt -> withdraw released collateral -> swap on DEX -> repay flashloan
  const flashFeasible = costToSafetyUsd > 0 && ltFraction > 0 && C * ltFraction > D;
  const releasedCollateralUsd = ltFraction > 0 ? costToSafetyUsd / ltFraction : 0;
  const flashPlan: RescuePlan = {
    planId: "plan_flash_deleverage",
    type: "flash-deleverage",
    targetHf,
    amountUsd: Math.round(costToSafetyUsd * 100) / 100,
    projectedHf: Math.round(calculateProjectedHf(C - releasedCollateralUsd, ltFraction, D - costToSafetyUsd, 0) * 100) / 100,
    isFeasible: flashFeasible,
    infeasibilityReason: flashFeasible ? undefined : "Insufficient collateral buffer to support self-deleveraging",
    premiumUsd: calculateBulwarkPremium(snapshot.healthFactor, costToSafetyUsd * 0.5), // Lower fee for non-capital-bearing routing
    flashLoanParams: {
      flashLoanAmountUsd: Math.round(costToSafetyUsd * 100) / 100,
      withdrawnCollateralUsd: Math.round(releasedCollateralUsd * 100) / 100,
      estimatedSlippageBps: 50, // 0.5%
    },
    provenance: {
      math: "DETERMINISTIC",
      premium: "BOOKKEEPING",
    },
  };

  const plans = [repayPlan, topUpPlan, flashPlan];
  const eligiblePlans = allowedActions ? plans.filter((p) => allowedActions.includes(p.type)) : plans;

  // Select cheapest feasible plan
  const feasiblePlans = eligiblePlans.filter((p) => p.isFeasible).sort((a, b) => a.amountUsd - b.amountUsd);
  const selectedPlan = feasiblePlans[0] ?? (eligiblePlans.find((p) => p.isPartialMitigation) ?? eligiblePlans[0] ?? repayPlan);

  // Generate Counterfactual Ladder
  const ladder = generateCounterfactualLadder(snapshot, maxAllowedCapUsd, costToSafetyUsd);

  return {
    snapshot,
    costToSafetyUsd: Math.round(costToSafetyUsd * 100) / 100,
    plans,
    selectedPlan,
    ladder,
    selectionMode: "DETERMINISTIC_CHEAPEST",
  };
}
