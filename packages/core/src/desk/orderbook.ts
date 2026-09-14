/**
 * Multi-Agent Rescuer Orderbook & Competitive Auction Engine.
 * Allows multiple underwriter agent desks to bid rescue capacity and terms.
 * Position owners deterministically rank and route execution to the optimal desk.
 * Source of truth: docs/WINNER.md and docs/ORIGINALITY_UPGRADE.md §3/§12.
 */

import { calculateBulwarkPremium } from "../underwriter/plans.js";
import { ExecutionReputation } from "./reputation.js";

export interface RescueOffer {
  rescuerId: string;
  rescuerAddress: string;
  availableCapacityUsd: number;
  perActionCapUsd: number;
  premiumBaseUsd: number;
  premiumRateBps: number;
  reactionTimeSec: number; // e.g. 5 seconds
  reputationScore: number; // 0 - 100
  grantId?: string;
}

export interface RankedOffer {
  rank: number;
  offer: RescueOffer;
  score: number;
  estimatedPremiumUsd: number;
  coverageRatio: number;
  isFullyFunded: boolean;
  rationale: string;
}

/**
 * Computes a standardized 0-100 reputation score from verified execution metrics.
 */
export function computeReputationScore(rep: ExecutionReputation): number {
  if (rep.totalExecutionsAttempted === 0) return 70; // baseline for neutral new desk
  const successRate = rep.totalExecutionsVerified / rep.totalExecutionsAttempted;
  const violationPenalty = (rep.totalPolicyViolations + rep.totalSimulationFailures) * 5;
  const rawScore = successRate * 100 - violationPenalty;
  return Math.min(100, Math.max(0, Math.round(rawScore)));
}

/**
 * Deterministically ranks competing rescuer offers against a target rescue capital need.
 */
export function rankRescueOffers(
  offers: RescueOffer[],
  targetRescueUsd: number,
  currentHf: number
): RankedOffer[] {
  if (offers.length === 0) return [];

  const evaluated = offers.map((offer) => {
    const estimatedPremiumUsd = calculateBulwarkPremium(
      currentHf,
      targetRescueUsd,
      offer.premiumBaseUsd,
      offer.premiumRateBps
    );

    const coverageRatio =
      targetRescueUsd > 0
        ? Math.min(1.0, offer.availableCapacityUsd / targetRescueUsd)
        : 1.0;

    const perActionSufficient = offer.perActionCapUsd >= targetRescueUsd;
    const isFullyFunded = coverageRatio >= 1.0 && perActionSufficient;

    // Multi-factor objective score:
    // 1. Capacity Coverage (40% weight): Desk must have the liquidity to execute
    // 2. Cost Efficiency (25% weight): Lower premium fee = higher score
    // 3. Reputation (20% weight): Historical execution success and policy compliance
    // 4. Reaction Speed (15% weight): Faster response gets priority in liquidation triage
    const coverageScore = coverageRatio * 100;
    const costScore = Math.max(0, 100 - (estimatedPremiumUsd / (targetRescueUsd || 1)) * 500);
    const repScore = Math.min(100, Math.max(0, offer.reputationScore));
    const speedScore = Math.max(0, 100 - (offer.reactionTimeSec / 30) * 100);

    const compositeScore =
      coverageScore * 0.4 +
      costScore * 0.25 +
      repScore * 0.2 +
      speedScore * 0.15;

    let rationale = `Coverage: ${(coverageRatio * 100).toFixed(0)}%, Est. Premium: $${estimatedPremiumUsd.toFixed(2)}, Rep: ${repScore}`;
    if (!isFullyFunded) {
      rationale += ` [PARTIAL: available $${offer.availableCapacityUsd.toFixed(2)} / needed $${targetRescueUsd.toFixed(2)}]`;
    }

    return {
      offer,
      score: Math.round(compositeScore * 100) / 100,
      estimatedPremiumUsd,
      coverageRatio: Math.round(coverageRatio * 100) / 100,
      isFullyFunded,
      rationale,
    };
  });

  // Sort order:
  // 1. Fully-funded offers rank ahead of partially-funded offers
  // 2. Higher composite score wins
  // 3. Lower estimated premium wins
  // 4. Higher available capacity wins
  evaluated.sort((a, b) => {
    if (a.isFullyFunded && !b.isFullyFunded) return -1;
    if (!a.isFullyFunded && b.isFullyFunded) return 1;
    if (b.score !== a.score) return b.score - a.score;
    if (a.estimatedPremiumUsd !== b.estimatedPremiumUsd)
      return a.estimatedPremiumUsd - b.estimatedPremiumUsd;
    return b.offer.availableCapacityUsd - a.offer.availableCapacityUsd;
  });

  return evaluated.map((item, idx) => ({
    rank: idx + 1,
    offer: item.offer,
    score: item.score,
    estimatedPremiumUsd: item.estimatedPremiumUsd,
    coverageRatio: item.coverageRatio,
    isFullyFunded: item.isFullyFunded,
    rationale: item.rationale,
  }));
}

/**
 * Selects the highest-ranked feasible rescuer offer from the orderbook.
 */
export function selectBestRescueOffer(
  offers: RescueOffer[],
  targetRescueUsd: number,
  currentHf: number
): RankedOffer | undefined {
  const ranked = rankRescueOffers(offers, targetRescueUsd, currentHf);
  // Prefer fully-funded offers first
  const fullyFunded = ranked.find((r) => r.isFullyFunded);
  if (fullyFunded) return fullyFunded;
  return ranked[0];
}
