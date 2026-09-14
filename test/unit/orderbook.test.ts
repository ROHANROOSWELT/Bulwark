import { describe, it, expect } from "vitest";
import {
  rankRescueOffers,
  selectBestRescueOffer,
  computeReputationScore,
  RescueOffer,
} from "../../packages/core/src/desk/orderbook.js";
import { ExecutionReputation } from "../../packages/core/src/desk/reputation.js";

describe("Multi-Agent Rescuer Orderbook & Competitive Auction", () => {
  const sampleReputation: ExecutionReputation = {
    totalGrantsProposed: 10,
    totalGrantsApproved: 8,
    totalGrantsArmed: 8,
    totalExecutionsAttempted: 5,
    totalExecutionsVerified: 5,
    totalSimulationFailures: 0,
    totalPolicyViolations: 0,
    totalCapitalDeployedUsd: 150.0,
    averageLatencyMs: 1200,
    hfImprovements: { min: 0.15, max: 0.45, average: 0.3 },
    provenance: "BOOKKEEPING",
  };

  const sampleOffers: RescueOffer[] = [
    {
      rescuerId: "desk_alpha",
      rescuerAddress: "0x1111111111111111111111111111111111111111",
      availableCapacityUsd: 100.0,
      perActionCapUsd: 50.0,
      premiumBaseUsd: 0.5,
      premiumRateBps: 150, // 1.5%
      reactionTimeSec: 2,
      reputationScore: 95,
    },
    {
      rescuerId: "desk_expensive",
      rescuerAddress: "0x2222222222222222222222222222222222222222",
      availableCapacityUsd: 200.0,
      perActionCapUsd: 100.0,
      premiumBaseUsd: 2.0,
      premiumRateBps: 500, // 5% expensive
      reactionTimeSec: 10,
      reputationScore: 80,
    },
    {
      rescuerId: "desk_underfunded",
      rescuerAddress: "0x3333333333333333333333333333333333333333",
      availableCapacityUsd: 10.0, // Insufficient for $30 rescue
      perActionCapUsd: 10.0,
      premiumBaseUsd: 0.1,
      premiumRateBps: 50,
      reactionTimeSec: 1,
      reputationScore: 90,
    },
  ];

  it("computes reputation score reflecting success rate and penalizing violations", () => {
    const perfectScore = computeReputationScore(sampleReputation);
    expect(perfectScore).toBe(100);

    const flawedRep: ExecutionReputation = {
      ...sampleReputation,
      totalExecutionsAttempted: 10,
      totalExecutionsVerified: 7, // 70%
      totalPolicyViolations: 2,  // -10 pts
    };
    const flawedScore = computeReputationScore(flawedRep);
    expect(flawedScore).toBe(60); // 70 - 10 = 60
  });

  it("ranks offers prioritising fully-funded desks with competitive fees", () => {
    const targetRescueUsd = 30.0;
    const currentHf = 1.08;

    const ranked = rankRescueOffers(sampleOffers, targetRescueUsd, currentHf);

    expect(ranked).toHaveLength(3);
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked[0]?.offer.rescuerId).toBe("desk_alpha"); // Alpha is fully funded, fast, and competitive
    expect(ranked[0]?.isFullyFunded).toBe(true);

    // Underfunded desk should be flagged
    const underfunded = ranked.find((r) => r.offer.rescuerId === "desk_underfunded");
    expect(underfunded?.isFullyFunded).toBe(false);
    expect(underfunded?.coverageRatio).toBe(0.33); // 10 / 30
  });

  it("selects the optimal desk offer deterministically", () => {
    const targetRescueUsd = 25.0;
    const currentHf = 1.12;

    const best = selectBestRescueOffer(sampleOffers, targetRescueUsd, currentHf);
    expect(best).toBeDefined();
    expect(best?.offer.rescuerId).toBe("desk_alpha");
    expect(best?.isFullyFunded).toBe(true);
  });
});
