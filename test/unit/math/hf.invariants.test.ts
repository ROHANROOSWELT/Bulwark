import { describe, it, expect } from "vitest";
import {
  calculateExactRescueDebt,
  calculateProjectedHf,
  calculateBulwarkPremium,
} from "../../../packages/core/src/underwriter/plans.js";

describe("Health Factor Mathematics & Invariance Suite (200 Tests)", () => {
  // ── 1. Closed-Form Exact Targeting Invariants (100 Tests) ─────────────────
  for (let i = 1; i <= 100; i++) {
    // Generate varying realistic collateral and debt states
    const collateralUsd = 100 + i * 15; // $115 to $1600
    const ltBps = 7500 + (i % 15) * 100; // 0.75 to 0.89
    const debtUsd = Math.round((collateralUsd * (ltBps / 10000)) / (1.05 + (i % 20) * 0.01)); // HF around 1.05 - 1.24
    const targetHfNum = 1.30 + (i % 30) * 0.05; // Target HF from 1.30 to 2.75

    const totalCollateralBase = BigInt(Math.round(collateralUsd * 1e8));
    const totalDebtBase = BigInt(Math.round(debtUsd * 1e8));
    const targetHfWad = BigInt(Math.round(targetHfNum * 1e4)) * 100000000000000n;

    it(`hf-exact-targeting #${String(i).padStart(3, "0")}: C=$${collateralUsd}, D=$${debtUsd}, LT=${ltBps / 10000}, TargetHF=${targetHfNum.toFixed(2)}`, () => {
      const res = calculateExactRescueDebt(totalCollateralBase, totalDebtBase, ltBps, targetHfWad);

      expect(res.exactRepayBase).toBeGreaterThanOrEqual(0n);
      expect(res.exactRepayBase).toBeLessThanOrEqual(totalDebtBase);

      // Verify projected HF matches target within 1% integer division tolerance
      const remainingDebt = totalDebtBase - res.exactRepayBase;
      if (remainingDebt > 0n) {
        const achievedHfWad =
          ((totalCollateralBase * BigInt(ltBps)) / 10000n * 1000000000000000000n) / remainingDebt;
        const diffWad = achievedHfWad > targetHfWad ? achievedHfWad - targetHfWad : targetHfWad - achievedHfWad;
        const errorMargin = targetHfWad / 100n; // 1%
        expect(diffWad).toBeLessThanOrEqual(errorMargin);
      }
    });
  }

  // ── 2. Monotonicity & Premium Urgency Invariants (100 Tests) ──────────────
  for (let i = 1; i <= 100; i++) {
    const collateral = 200 + i * 5;
    const debt = 150 + i * 3;
    const lt = 0.8;
    const repay1 = i * 0.5;
    const repay2 = repay1 + 5.0;

    it(`hf-monotonicity #${String(i).padStart(3, "0")}: Repay $${repay1} vs $${repay2}`, () => {
      const hf1 = calculateProjectedHf(collateral, lt, debt, repay1);
      const hf2 = calculateProjectedHf(collateral, lt, debt, repay2);

      // Monotonicity theorem: strictly higher repay must yield >= HF
      expect(hf2).toBeGreaterThanOrEqual(hf1);

      // Premium urgency theorem: lower HF must yield higher or equal premium for same capital
      const premAt105 = calculateBulwarkPremium(1.05, 20.0);
      const premAt120 = calculateBulwarkPremium(1.20, 20.0);
      expect(premAt105).toBeGreaterThanOrEqual(premAt120);

      // Edge case: zero capital yields zero premium
      expect(calculateBulwarkPremium(1.10, 0)).toBe(0);
    });
  }
});
