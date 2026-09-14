import { describe, it, expect } from "vitest";
import {
  rankRescueOffers,
  selectBestRescueOffer,
  RescueOffer,
} from "../../../packages/core/src/desk/orderbook.js";

describe("Multi-Agent Rescuer Orderbook Auction Invariants (100 Tests)", () => {
  for (let i = 1; i <= 100; i++) {
    const targetRescueUsd = 10 + (i % 20) * 5; // $10 to $105
    const currentHf = 1.02 + (i % 15) * 0.01; // 1.02 to 1.16

    // Create 4 distinct competing rescuer offers
    const offers: RescueOffer[] = [
      {
        rescuerId: `desk_alpha_${i}`,
        rescuerAddress: "0x1111111111111111111111111111111111111111",
        availableCapacityUsd: targetRescueUsd + 20, // Fully funded
        perActionCapUsd: targetRescueUsd + 10,
        premiumBaseUsd: 0.5,
        premiumRateBps: 100, // 1% cheap
        reactionTimeSec: 2,
        reputationScore: 90,
      },
      {
        rescuerId: `desk_beta_${i}`,
        rescuerAddress: "0x2222222222222222222222222222222222222222",
        availableCapacityUsd: targetRescueUsd + 50,
        perActionCapUsd: targetRescueUsd + 30,
        premiumBaseUsd: 2.0,
        premiumRateBps: 400, // 4% expensive
        reactionTimeSec: 8,
        reputationScore: 85,
      },
      {
        rescuerId: `desk_underfunded_${i}`,
        rescuerAddress: "0x3333333333333333333333333333333333333333",
        availableCapacityUsd: Math.max(1, targetRescueUsd - 5), // Underfunded!
        perActionCapUsd: targetRescueUsd,
        premiumBaseUsd: 0.1,
        premiumRateBps: 50,
        reactionTimeSec: 1,
        reputationScore: 95,
      },
      {
        rescuerId: `desk_laggy_${i}`,
        rescuerAddress: "0x4444444444444444444444444444444444444444",
        availableCapacityUsd: targetRescueUsd + 100,
        perActionCapUsd: targetRescueUsd + 100,
        premiumBaseUsd: 1.0,
        premiumRateBps: 200,
        reactionTimeSec: 25, // 25s slow
        reputationScore: 70,
      },
    ];

    it(`auction-invariant #${String(i).padStart(3, "0")}: target=$${targetRescueUsd}, HF=${currentHf.toFixed(2)}`, () => {
      const ranked = rankRescueOffers(offers, targetRescueUsd, currentHf);

      expect(ranked).toHaveLength(4);
      expect(ranked[0]?.rank).toBe(1);

      // Alpha is fast, cheap, and fully funded => should win over expensive and laggy
      expect(ranked[0]?.offer.rescuerId).toBe(`desk_alpha_${i}`);
      expect(ranked[0]?.isFullyFunded).toBe(true);

      // Underfunded desk should never be marked as fully funded
      const underfunded = ranked.find((r) => r.offer.rescuerId === `desk_underfunded_${i}`);
      expect(underfunded?.isFullyFunded).toBe(false);

      // Orderbook determinism theorem: order of input offers does not change the winner
      const reversedOffers = [...offers].reverse();
      const bestFromReversed = selectBestRescueOffer(reversedOffers, targetRescueUsd, currentHf);
      expect(bestFromReversed?.offer.rescuerId).toBe(`desk_alpha_${i}`);
    });
  }
});
