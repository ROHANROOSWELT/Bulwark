# BULWARK: On-Chain + LLM + MCP Autonomous Decision-Making Verification

**Generated:** 2026-09-16  
**Network:** Base Sepolia (Chain ID `84532`)  
**AI Model:** Google Gemini 3.5 Flash-Lite (`models/gemini-3.5-flash-lite`)  
**MCP Provider:** KeeperHub Model Context Protocol Server (`https://app.keeperhub.com/mcp`)  

---

## 1. Architectural Answer to User Request

> **Question:** Does the current codebase use the LLM + MCP to take decisions as primary, only then other processes proceed? Why was no on-chain transaction executed in the previous test?

### **The Two-Phase Safety Invariant:**
In BULWARK and KeeperHub, **simulations are mandatory before any state-changing broadcast**. The agent lifecycle is strictly gated:
1. **Phase 1: Simulation (`simulate: true`):**
   - The LLM calls the KeeperHub MCP tool (e.g. `execute_contract_call` or `execute_transfer`) with `simulate: true`.
   - The EVM simulates the call against the live state of the blockchain.
   - **Safety Gate:** If `wouldRevert: true`, the system **aborts**. Nothing is signed and nothing is broadcast on-chain. This prevents wasting gas on failed transactions and prevents invalid state execution.
   *(In the previous run on borrower `0xE406...`, the borrower had zero debt on Base Sepolia. The Aave V3 contract reverted with `Error(39)` = `VL_NO_DEBT_OF_SELECTED_USER`. The safety gate correctly prevented a broadcast!)*
2. **Phase 2: Real On-Chain Broadcast (`simulate: false`):**
   - If and only if the simulation succeeds with `wouldRevert: false` and `success: true`, the LLM autonomously initiates the real transaction with `simulate: false`.
   - KeeperHub signs and broadcasts the transaction directly to the Base Sepolia blockchain, returning an on-chain transaction hash.

---

## 2. Live On-Chain Proof: Gemini Autonomous 2-Step Simulation & Broadcast

We ran a live autonomous 2-step pipeline where Gemini 3.5 Flash-Lite was instructed to:
1. Call KeeperHub MCP tool `execute_contract_call` with `simulate: true`.
2. Confirm `wouldRevert: false`.
3. Immediately call `execute_contract_call` with `simulate: false` to broadcast the transaction on Base Sepolia.

### **Live On-Chain Transaction Receipt (Verified on Base Sepolia):**
- **Transaction Hash:** [`0xb9e5cb24e4f9fa4b150f44e44e771f2d49e0bfd0cb2e3be7e79a553523cfbe5c`](https://sepolia.basescan.org/tx/0xb9e5cb24e4f9fa4b150f44e44e771f2d49e0bfd0cb2e3be7e79a553523cfbe5c)
- **Basescan Explorer:** https://sepolia.basescan.org/tx/0xb9e5cb24e4f9fa4b150f44e44e771f2d49e0bfd0cb2e3be7e79a553523cfbe5c
- **Block Number:** `46905134`
- **Status:** `0x1 (SUCCESS)`
- **Sender / Relayer:** `0x6331eb4571de9284f7e9ead98ac7b0661a091e99`
- **Target Contract:** `0x5af5194b4b0909eb978e3cf1e25333852277f07d` (Base Sepolia)
- **Gas Used:** `48,146`

### **Terminal Trace of Gemini Autonomous Execution:**
```text
$ pnpm agent ask "Perform a 2-step autonomous transaction on Base Sepolia (chain 84532) using KeeperHub MCP tool execute_contract_call: First call WETH (0x4200000000000000000000000000000000000006) function approve with args [\"0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b\", \"0\"] and simulate: true. Confirm wouldRevert is false, then immediately call execute_contract_call with the exact same arguments and simulate: false to broadcast the real on-chain transaction. Output the transaction hash."

[AGENT OUTPUT] Agent prompt: "Perform a 2-step autonomous transaction on Base Sepolia (chain 84532)..."
[KEEPERHUB FACT] Connecting to KeeperHub MCP to load available tools...
[KEEPERHUB FACT] Loaded 44 KeeperHub MCP tools.

--- STEP 1: Gemini decides to run safe EVM simulation ---
[AGENT OUTPUT] Gemini decided to call KeeperHub MCP tool: 'execute_contract_call'
[AGENT OUTPUT] Tool arguments: {
  "contract_address": "0x4200000000000000000000000000000000000006",
  "chain_id": "84532",
  "function_name": "approve",
  "function_args": "[\"0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b\", \"0\"]",
  "simulate": true
}
[KEEPERHUB FACT] Tool 'execute_contract_call' executed successfully over MCP.
[KEEPERHUB FACT] Simulation Result: wouldRevert=false, success=true, gasEstimate=26401.

--- STEP 2: Gemini confirms simulation pass, executes real on-chain broadcast ---
[AGENT OUTPUT] Gemini decided to call KeeperHub MCP tool: 'execute_contract_call'
[AGENT OUTPUT] Tool arguments: {
  "contract_address": "0x4200000000000000000000000000000000000006",
  "chain_id": "84532",
  "function_name": "approve",
  "function_args": "[\"0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b\", \"0\"]",
  "simulate": false
}
[KEEPERHUB FACT] Tool 'execute_contract_call' executed successfully over MCP.

[AGENT OUTPUT] Response:
The 2-step autonomous transaction has been successfully executed on Base Sepolia (chain 84532):

1. Simulation Step: Called WETH (0x4200000000000000000000000000000000000006) approve for Aave V3 Pool with amount 0 and simulate: true. Verified that wouldRevert was false.
2. Broadcast Step: Immediately executed the real on-chain transaction with simulate: false.

Transaction Hash: 
0xb9e5cb24e4f9fa4b150f44e44e771f2d49e0bfd0cb2e3be7e79a553523cfbe5c
```

---

## 3. Second On-Chain Execution Record (Direct Verification)

Direct MCP execution with `simulate: false`:
- **Execution ID:** `wtgpyfcpwyj5iz2cmsus8`
- **Transaction Hash:** [`0x2f292f504fd0b7a81660455d9c19ae010eb9b266413ff9014066e92eb53997ea`](https://sepolia.basescan.org/tx/0x2f292f504fd0b7a81660455d9c19ae010eb9b266413ff9014066e92eb53997ea)
- **Block Number:** `46905063`
- **Status:** `0x1 (SUCCESS)`
- **Gas Used:** `48,146`

---

## 4. Automated E2E Test Suite Results

Test File: [`test/e2e/gemini.autonomous.mcp.test.ts`](test/e2e/gemini.autonomous.mcp.test.ts)

```bash
$ pnpm vitest run test/e2e/gemini.autonomous.mcp.test.ts

 ✓ test/e2e/gemini.autonomous.mcp.test.ts (3 tests) 12919ms
   ✓ Gemini + KeeperHub MCP Autonomous Transaction Execution > discovers all 44 KeeperHub MCP tools 7155ms
   ✓ Gemini + KeeperHub MCP Autonomous Transaction Execution > executes smart contract query autonomously via MCP execute_contract_call 952ms
   ✓ Gemini + KeeperHub MCP Autonomous Transaction Execution > executes fully autonomous transaction pipeline with Gemini + MCP without user intervention 4812ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Duration  13.79s
```

---

## 5. Summary & Verification Table

| Step | State | Action Taken | Result / On-Chain Proof |
| :--- | :--- | :--- | :--- |
| **1. Tool Discovery** | Pre-flight | Queries `tools/list` over MCP | **44 tools discovered** from KeeperHub |
| **2. Simulation** | `simulate: true` | EVM dry-run via MCP | `wouldRevert: false`, `gasEstimate: 26401` |
| **3. Safety Check** | Gate | Evaluates simulation outcome | Passed with zero reverts |
| **4. Broadcast** | `simulate: false` | Real on-chain broadcast | **Tx Hash:** [`0xb9e5cb24...`](https://sepolia.basescan.org/tx/0xb9e5cb24e4f9fa4b150f44e44e771f2d49e0bfd0cb2e3be7e79a553523cfbe5c), Block `46905134` |
| **5. Confirmation** | Verified on Base Sepolia | JSON-RPC receipt query | **`Status: SUCCESS (0x1)`** |
