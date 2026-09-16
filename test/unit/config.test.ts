import { describe, it, expect } from "vitest";
import { loadConfig, getRpcUrlForChain } from "../../packages/core/src/config.js";
import { CHAINS } from "../../packages/core/src/chains.js";

describe("config loader", () => {
  it("loads sensible defaults without any env variables", () => {
    const config = loadConfig({});
    expect(config.chainId).toBe(11155111);
    expect(config.policyMaxUsdPerAction).toBe(25);
    expect(config.policyHfCritical).toBe(1.2);
    expect(config.policyHfTarget).toBe(2.0);
    expect(config.webPort).toBe(4567);
    expect(config.storeDir).toBe(".bulwark");
    expect(config.autoApprove).toBe(false);
    expect(config.keeperhubApiKey).toBeUndefined();
  });

  it("filters placeholder KEEPERHUB_API_KEY", () => {
    const config = loadConfig({ KEEPERHUB_API_KEY: "kh_replace_me" });
    expect(config.keeperhubApiKey).toBeUndefined();
  });

  it("parses valid custom values", () => {
    const config = loadConfig({
      KEEPERHUB_API_KEY: "kh_real_test_key_123",
      BULWARK_CHAIN_ID: "8453",
      BULWARK_POLICY_MAX_USD_PER_ACTION: "50",
      BULWARK_POLICY_HF_CRITICAL: "1.3",
      BULWARK_POLICY_HF_TARGET: "2.5",
      BULWARK_WEB_PORT: "8080",
      BULWARK_AUTO_APPROVE: "1",
    });

    expect(config.keeperhubApiKey).toBe("kh_real_test_key_123");
    expect(config.chainId).toBe(8453);
    expect(config.policyMaxUsdPerAction).toBe(50);
    expect(config.policyHfCritical).toBe(1.3);
    expect(config.policyHfTarget).toBe(2.5);
    expect(config.webPort).toBe(8080);
    expect(config.autoApprove).toBe(true);
  });

  it("throws on unsupported chain ID", () => {
    expect(() => loadConfig({ BULWARK_CHAIN_ID: "99999" })).toThrow(/Unsupported chain ID: 99999/);
  });

  it("throws on non-numeric chain ID", () => {
    expect(() => loadConfig({ BULWARK_CHAIN_ID: "abc" })).toThrow(/Invalid BULWARK_CHAIN_ID/);
  });

  it("throws on invalid critical HF or target HF <= critical", () => {
    expect(() => loadConfig({ BULWARK_POLICY_HF_CRITICAL: "0.9" })).toThrow(/must be > 1.0/);
    expect(() =>
      loadConfig({
        BULWARK_POLICY_HF_CRITICAL: "1.5",
        BULWARK_POLICY_HF_TARGET: "1.4",
      })
    ).toThrow(/must be > critical threshold/);
  });

  it("auto-detects Gemini API key and sets official Google AI Studio v1beta endpoint", () => {
    const configWithGeminiKey = loadConfig({ GEMINI_API_KEY: "AQ.TestGeminiKey123" });
    expect(configWithGeminiKey.llmApiKey).toBe("AQ.TestGeminiKey123");
    expect(configWithGeminiKey.llmBaseUrl).toBe("https://generativelanguage.googleapis.com/v1beta");
    expect(configWithGeminiKey.llmModel).toBe("gemini-3.5-flash-lite");

    const configWithBulwarkKey = loadConfig({ BULWARK_LLM_API_KEY: "AIzaSyTestKey456" });
    expect(configWithBulwarkKey.llmApiKey).toBe("AIzaSyTestKey456");
    expect(configWithBulwarkKey.llmBaseUrl).toBe("https://generativelanguage.googleapis.com/v1beta");
    expect(configWithBulwarkKey.llmModel).toBe("gemini-3.5-flash-lite");
  });
});
