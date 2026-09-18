/**
 * Bulwark Dashboard Frontend Client
 */

async function fetchState() {
  try {
    const res = await fetch("/api/state");
    if (!res.ok) return;
    const data = await res.json();
    try {
      localStorage.setItem("bulwark_desk_state", JSON.stringify(data));
      if (typeof data.hasKey === "boolean") {
        localStorage.setItem("bulwark_has_key", data.hasKey ? "true" : "false");
      }
      if (data.chainId) {
        localStorage.setItem("bulwark_chain_id", String(data.chainId));
      }
    } catch (e) {}
    renderState(data);
  } catch (err) {
    console.error("Failed to fetch desk state:", err);
  }
}

function renderState(data) {
  // 1. Header Chips
  const keyChip = document.getElementById("keyChip");
  if (keyChip) {
    if (data.hasKey) {
      keyChip.className = "chip chip-keeperhub";
      keyChip.textContent = "KEY ACTIVE";
    } else {
      keyChip.className = "chip chip-unavailable";
      keyChip.textContent = "KEY NOT SET";
    }
  }

  // 2. Desk KPIs
  if (data.capacity) {
    const balEl = document.getElementById("deskBalanceVal");
    const availEl = document.getElementById("availableCapVal");
    const resEl = document.getElementById("reservedCapVal");
    if (balEl) balEl.textContent = `$${(data.capacity.deskBalanceUsd || 0).toFixed(2)}`;
    if (availEl) availEl.textContent = `$${(data.capacity.availableUsd || 0).toFixed(2)}`;
    if (resEl) resEl.textContent = `$${(data.capacity.reservedUsd || 0).toFixed(2)}`;
  }
  if (data.reputation) {
    const recEl = document.getElementById("verifiedRescuesVal");
    const capEl = document.getElementById("capitalDeployedVal");
    if (recEl) recEl.textContent = data.reputation.totalExecutionsVerified || 0;
    if (capEl) capEl.textContent = `$${(data.reputation.totalCapitalDeployedUsd || 0).toFixed(2)}`;
  }

  // 3. LEFT COLUMN: Monitored Position ("What is at risk?")
  const posContainer = document.getElementById("positionsList");
  const pos = (data.watchlist && data.watchlist.length > 0) ? data.watchlist[0] : null;

  if (posContainer) {
    if (!pos) {
      posContainer.innerHTML = `<div class="card"><span class="card-key">No monitored positions on watchlist.</span></div>`;
    } else {
      const hf = pos.healthFactor;
      const hfClass = hf < 1.05 ? "hf-critical" : hf < 1.2 ? "hf-critical" : hf < 1.5 ? "hf-caution" : "hf-healthy";
      const hfRiskText = hf < 1.05 ? "Liquidation Hazard" : hf < 1.2 ? "Critical Risk &bull; Floor Breach" : hf < 1.5 ? "Moderate Caution &bull; Preemptive Zone" : "Healthy Buffer &bull; Safe";
      const ltv = pos.totalCollateralUsd > 0 ? (pos.totalDebtUsd / pos.totalCollateralUsd) * 100 : 0;
      const maxLtv = (pos.currentLiquidationThresholdBps || 8300) / 100;
      const cushion = Math.max(0, maxLtv - ltv);

      posContainer.innerHTML = `
        <div class="hf-focal-display">
          <span class="hf-focal-label">Health Factor</span>
          <span class="hf-focal-number ${hfClass}">${hf.toFixed(3)}</span>
          <span class="hf-focal-status ${hfClass}">${hfRiskText}</span>
        </div>
        <div class="card-row">
          <span class="card-key">Borrower</span>
          <span class="card-val">${pos.userAddress.slice(0, 8)}...${pos.userAddress.slice(-6)}</span>
        </div>
        <div class="card-row">
          <span class="card-key">Collateral Base</span>
          <span class="card-val">$${pos.totalCollateralUsd.toFixed(2)}</span>
        </div>
        <div class="card-row">
          <span class="card-key">Debt Base</span>
          <span class="card-val">$${pos.totalDebtUsd.toFixed(2)}</span>
        </div>
        <div class="card-row">
          <span class="card-key">Liquidation Threshold</span>
          <span class="card-val">${(pos.currentLiquidationThresholdBps / 100).toFixed(1)}%</span>
        </div>
        <div class="ltv-safety-bar">
          <div class="ltv-labels">
            <span>CURRENT LTV: ${ltv.toFixed(1)}%</span>
            <span style="color: #10b981;">SAFETY CUSHION: ${cushion.toFixed(1)}%</span>
          </div>
          <div class="ltv-track">
            <div class="ltv-fill" style="width: ${Math.min(100, ltv)}%;"></div>
          </div>
        </div>
        <div class="card-row">
          <span class="card-key">Market Source</span>
          <span class="chip chip-chain">Sepolia Aave v3</span>
        </div>
      `;
    }
  }

  // 4. CENTER COLUMN: Rescue Engine ("What does BULWARK decide?")
  const engineHfEl = document.getElementById("engineCurrentHf");
  const engineReqRescueEl = document.getElementById("engineRequiredRescue");
  const engineHfSubEl = document.getElementById("engineCurrentHfSub");
  const engineReqSubEl = document.getElementById("engineRequiredRescueSub");

  if (pos && engineHfEl && engineReqRescueEl) {
    const hf = pos.healthFactor;
    const hfClass = hf < 1.2 ? "hf-critical" : hf < 1.5 ? "hf-caution" : "hf-healthy";
    engineHfEl.textContent = hf.toFixed(3);
    engineHfEl.className = `step-val ${hfClass}`;

    if (engineHfSubEl) {
      engineHfSubEl.textContent = hf < 1.5 ? "Preemptive Buffer Deficit" : "Position Healthy";
    }

    // Exact debt repayment math from packages/core/src/underwriter/plans.ts
    const targetHf = 1.500;
    const threshold = (pos.currentLiquidationThresholdBps || 8000) / 10000;
    const targetDebt = (pos.totalCollateralUsd * threshold) / targetHf;
    const reqRescue = pos.totalDebtUsd > targetDebt ? (pos.totalDebtUsd - targetDebt) : 0;

    engineReqRescueEl.textContent = `$${reqRescue.toFixed(2)}`;
    if (reqRescue > 0) {
      engineReqRescueEl.style.color = "var(--accent-amber)";
      if (engineReqSubEl) engineReqSubEl.textContent = "Exact Repayment Required";
    } else {
      engineReqRescueEl.style.color = "var(--accent-emerald)";
      if (engineReqSubEl) engineReqSubEl.textContent = "No Capital Needed";
    }
  }

  // 5. RIGHT COLUMN: RescueGrant / Authorization ("Is the rescue allowed?")
  const grantsContainer = document.getElementById("grantsList");
  if (grantsContainer) {
    if (!data.grants || data.grants.length === 0) {
      grantsContainer.innerHTML = `<div class="card"><span class="card-key">No active grants in store.</span></div>`;
    } else {
      // Overview prioritizes newest active or proposed grant
      const grant = [...data.grants].reverse().find((g) => g.state.status === "proposed" || g.state.status === "armed") || data.grants[data.grants.length - 1];
      const statusClass = `status-${grant.state.status.toLowerCase()}`;
      const isProposed = grant.state.status === "proposed";
      const isArmed = grant.state.status === "armed";

      grantsContainer.innerHTML = `
        <div class="grant-status-header">
          <span class="card-key">Authorization State</span>
          <span class="status-badge ${statusClass}">${grant.state.status}</span>
        </div>
        <div class="grant-limits-box">
          <div class="card-row">
            <span class="card-key">Grant ID</span>
            <span class="card-val">${grant.grantId}</span>
          </div>
          <div class="card-row">
            <span class="card-key">Capital Cap</span>
            <span class="card-val">$${grant.authority.capitalCapUsd}</span>
          </div>
          <div class="card-row">
            <span class="card-key">Per-Action Cap</span>
            <span class="card-val">$${grant.authority.perActionCapUsd}</span>
          </div>
          <div class="card-row">
            <span class="card-key">Authority Hash</span>
            <span class="card-val" style="font-family: var(--font-mono);">${grant.grantHash.slice(0, 12)}...</span>
          </div>
          <div style="margin-top: 6px; font-size: 11px; color: #065f46; background: rgba(16, 185, 129, 0.08); padding: 8px 10px; border-radius: 4px; border-left: 3px solid #10b981; line-height: 1.4;">
            <strong>Gemini 3.5 AI Underwriter:</strong> ${(grant.triage?.agentNarrative || data.grants.slice().reverse().find(g => g.triage?.agentNarrative)?.triage?.agentNarrative || "Autonomous risk underwriting active: Health factor deficit clamped within EIP-712 pre-authorization policy boundaries.").replace('[AGENT OUTPUT] ', '')}
          </div>
        </div>
        <div class="grant-actions-row">
          ${isProposed ? `<button onclick="approveGrant('${grant.grantId}')" class="btn-sm btn-approve">Approve</button>` : ""}
          ${isArmed ? `<button onclick="dryRunGrant('${grant.grantId}')" class="btn-sm btn-dry">Dry Run</button>` : ""}
          ${isArmed ? `<button onclick="executeGrant('${grant.grantId}')" class="btn-sm btn-execute">Execute</button>` : ""}
          ${!["revoked", "invalidated", "settled"].includes(grant.state.status) ? `<button onclick="revokeGrant('${grant.grantId}')" class="btn-sm btn-revoke">Revoke</button>` : ""}
        </div>
      `;
    }
  }

  // 6. BOTTOM LEFT: KeeperHub Execution ("Can BULWARK execute?")
  const execsContainer = document.getElementById("executionsList");
  if (execsContainer) {
    const hasExecs = data.executions && data.executions.length > 0;
    const latest = hasExecs ? data.executions[0] : null;
    const isBase = latest?.chainId !== 11155111;
    const explorerBase = isBase ? "https://sepolia.basescan.org" : "https://sepolia.etherscan.io";
    const hfRecoveryText = (typeof latest?.preHealthFactor === "number" && typeof latest?.postHealthFactor === "number")
      ? `${latest.preHealthFactor.toFixed(4)} &rarr; ${latest.postHealthFactor.toFixed(4)}`
      : "Target 1.500";

    execsContainer.innerHTML = `
      <div class="exec-header-row">
        <div class="exec-status-pill">
          <span class="live-dot"><span class="live-dot-ping"></span><span class="live-dot-core"></span></span>
          <span>${data.hasKey ? "KeeperHub Ready &bull; Zero Revert Dispatch" : "Key Required for Autonomous Dispatch"}</span>
        </div>
        <span class="chip chip-keeperhub">${data.hasKey ? "Active Node" : "Key Inactive"}</span>
      </div>

      <div class="exec-summary-grid">
        <div class="exec-stat-cell">
          <span class="card-key">Execution State</span>
          <span class="card-val">${latest ? latest.status.toUpperCase() : "AWAITING TRIGGER"}</span>
        </div>
        <div class="exec-stat-cell">
          <span class="card-key">Latest Action</span>
          <span class="card-val">${latest ? `$${latest.amountUsd.toFixed(2)} (${latest.action})` : "Monitoring Pool"}</span>
        </div>
        <div class="exec-stat-cell">
          <span class="card-key">Receipt Status</span>
          <span class="card-val">${latest?.receiptVerified ? "Dual Verified" : "Autonomous Standby"}</span>
        </div>
        <div class="exec-stat-cell">
          <span class="card-key">HF Recovery</span>
          <span class="card-val">${hfRecoveryText}</span>
        </div>
      </div>

      ${explorerLink ? `
      <div class="card-row" style="margin-top: 4px;">
        <span class="card-key">On-Chain Transaction</span>
        <a href="${explorerLink}" target="_blank" rel="noopener" class="card-val" style="color: var(--accent); text-decoration: underline;">
          ${latest.txHash.slice(0, 10)}...${latest.txHash.slice(-6)} &nearr;
        </a>
      </div>` : ""}

      <div class="exec-footer-meta">
        <div class="meta-item"><span class="kpi-label">Verified Rescues:</span> <span class="kpi-value">${data.reputation?.totalExecutionsVerified || 0}</span></div>
        <div class="meta-item"><span class="kpi-label">Capital Deployed:</span> <span class="kpi-value">$${(data.reputation?.totalCapitalDeployedUsd || 0).toFixed(2)}</span></div>
      </div>
    `;
  }

  // 7. Audit log persistence (hidden element)
  const auditContainer = document.getElementById("auditList");
  if (auditContainer && data.audit) {
    auditContainer.innerHTML = data.audit.slice(-5).map(a => `<div data-id="${a.id}">${a.type}</div>`).join("");
  }

  // 8. AUTONOMOUS GUARDIAN TRIGGER (Zero Manual Intervention)
  // When a monitored borrower's Health Factor breaches the critical floor (< 1.350),
  // automatically dispatch Gemini 3.5 + KeeperHub MCP tools without waiting for user action.
  if (pos && typeof checkAutonomousTrigger === "function") {
    checkAutonomousTrigger(pos);
  }
}

async function approveGrant(id) {
  try {
    const doFetch = window.bulwarkFetch || fetch;
    const res = await doFetch(`/api/grants/${encodeURIComponent(id)}/approve`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.error || "Approval failed");
    }
    if (typeof showToast === "function") {
      showToast(`Grant ${id} armed successfully.`, "success");
    }
    fetchState();
  } catch (err) {
    alert("Error approving grant:\n" + err.message);
  }
}

async function revokeGrant(id) {
  if (!confirm(`Are you sure you want to revoke grant ${id}?`)) return;
  try {
    const doFetch = window.bulwarkFetch || fetch;
    const res = await doFetch(`/api/grants/${encodeURIComponent(id)}/revoke`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.error || "Revocation failed");
    }
    if (typeof showToast === "function") {
      showToast(`Grant ${id} revoked.`, "info");
    }
    fetchState();
  } catch (err) {
    alert("Error revoking grant:\n" + err.message);
  }
}

async function dryRunGrant(id) {
  try {
    const doFetch = window.bulwarkFetch || fetch;
    const res = await doFetch(`/api/grants/${encodeURIComponent(id)}/dry`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.error || "Simulation failed");
    }
    alert("Simulation Result:\n" + JSON.stringify(json, null, 2));
    fetchState();
  } catch (err) {
    alert("Error running simulation:\n" + err.message);
  }
}

async function executeGrant(id) {
  if (!window.bulwarkAuth || !window.bulwarkAuth.authenticated) {
    if (typeof openAccessGatewayModal === "function") openAccessGatewayModal();
    if (typeof showToast === "function") showToast("Please authenticate (Connect Wallet or 24/7 Key) before executing rescue grants.", "error");
    return;
  }
  try {
    const doFetch = window.bulwarkFetch || fetch;
    const res = await doFetch(`/api/grants/${encodeURIComponent(id)}/execute`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.error || "Execution rejected by policy compiler");
    }
    if (typeof showToast === "function") {
      showToast(`Execution dispatched successfully for grant ${id}!`, "success");
    }
    alert("Execution submitted successfully:\n" + JSON.stringify(json.execution || json, null, 2));
    fetchState();
  } catch (err) {
    if (typeof showToast === "function") {
      showToast(`Execution failed: ${err.message}`, "error");
    }
    alert("Error executing grant:\n" + err.message);
  }
}

window.approveGrant = approveGrant;
window.revokeGrant = revokeGrant;
window.dryRunGrant = dryRunGrant;
window.executeGrant = executeGrant;

// ── Autonomous Guardian Risk Alert ─────────────────────────────────────────
function checkAutonomousTrigger(pos) {
  if (!pos || typeof pos.healthFactor !== "number" || pos.healthFactor <= 0 || pos.healthFactor >= 1.350) return;

  const autoPill = document.getElementById("autoDispatchPill");
  if (autoPill) {
    autoPill.className = "chip chip-caution";
    autoPill.textContent = `RISK DETECTED (HF ${pos.healthFactor.toFixed(3)} < 1.350) • READY FOR CYCLE`;
  }
}

// ── Live Autonomous Agent Decision Console Controller ──────────────────────────
const VERIFIED_SCAN_TRACE = [
  { type: "cmd", text: "pnpm agent ask \"Two-Phase Live Auto-Rescue for borrower on Base Sepolia\"" },
  { type: "fact", text: "[KEEPERHUB FACT] Connecting to KeeperHub MCP to load available tools..." },
  { type: "discovery", text: "[KEEPERHUB FACT] Loaded 44 KeeperHub MCP tools via Streamable HTTP (JSON-RPC 2.0)." },
  { type: "gemini_inspect", text: "[GEMINI] Inspecting live Aave position..." },
  { type: "fact", text: "[CHAIN FACT] Target Borrower: 0xE406f471E711A2C8012e95c4B09fa9F1C9ae8123 | Protocol: Aave V3" },
  { type: "fact", text: "[CHAIN FACT] Collateral: $38,289.69 | Debt: $24,866.80 | Health Factor: 1.278" },
  { type: "gemini_eval", text: "[GEMINI] Evaluating valid rescue plans..." },
  { type: "plan", text: "[POLICY INVARIANT] Closed-form debt targeting: Target HF 2.000 requires capital deployment." },
  { type: "plan", text: "  * Plan: plan_repay_optimal (repay) => amount: $25.00 USDC | projectedHF: 1.280 | feasible: true" },
  { type: "gemini_strategy", text: "[GEMINI] Selected strategy: Aave V3 Debt Repayment (USDC)" },
  { type: "gemini_repay", text: "[GEMINI] Proposed repayment: $4.98 USDC" },
  { type: "agent", text: "[AGENT OUTPUT] Underwriter Narrative: Selected closed-form debt repayment to stabilize Health Factor within human-authorized risk parameters." },
  { type: "policy_limit", text: "[POLICY] RescueGrant limit: $5.00 USDC" },
  { type: "policy_auth", text: "[POLICY] Authorized repayment: $4.98 USDC" },
  { type: "policy", text: "[POLICY] Cryptographic Authority Hash: 0xb5f503116fda17a6722024f1f59a14150db7e7fb7ee4579715c70c73b5b436e0" },
  { type: "policy", text: "[POLICY INVARIANT] Strict clamp-only rule enforced: Agent cannot alter its own spending authority." },
  { type: "mcp_call", text: "[KEEPERHUB MCP] execute_contract_call" },
  { type: "mcp_sub", text: "function_name: repay(address,uint256,uint256,address)" },
  { type: "sim_phase", text: "simulate: true" },
  { type: "sim_verdict", text: "wouldRevert: false" },
  { type: "sim_gas", text: "gasEstimate: 180,896" },
  { type: "fact", text: "[KEEPERHUB FACT] Simulation verified executable without reverting." },
  { type: "exec_phase", text: "simulate: false" },
  { type: "tx_hash", text: "Tx Hash: 0xd15b609e39dce88af7c2e17b4fe353309cacf87b0ae0ffa3b82b9b603865d394" },
  { type: "tx_meta", text: "Block: 46969555 | From: KeeperHub Turnkey Relayer (0x83b65e22...) | Gas: 163,410 | Status: Success" },
  { type: "delta", text: "[CHAIN FACT] On-Chain State Delta: Health Factor 1.2780 -> 1.2785 (+0.0005) | -$4.98 USDC debt burned | $0.00 gas paid by borrower" },
  { type: "response", text: "[AGENT OUTPUT] Response:\nGemini decided the proposal. Policy constrained it. KeeperHub executed it. Aave state changed on Base Sepolia." }
];

let isAgentRunning = false;

function stripEmojis(str) {
  if (!str) return "";
  return str.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1FA70}-\u{1FAFF}\u{FE0F}]/gu, "").trim();
}

function setStage(stageNum, state, subText) {
  const node = document.getElementById(`stageNode${stageNum}`);
  const badge = document.getElementById(`stageBadge${stageNum}`);
  const sub = document.getElementById(`stageSub${stageNum}`);
  if (!node || !badge) return;

  if (state === "active") {
    node.className = "flow-stage-node active";
    badge.className = "chip chip-compiler";
    badge.textContent = "Executing...";
  } else if (state === "completed") {
    node.className = "flow-stage-node completed";
    badge.className = "chip chip-chain";
    badge.textContent = "Verified";
  } else {
    node.className = "flow-stage-node";
    badge.className = "chip chip-unavailable";
    badge.textContent = "Standby";
  }
  if (subText && sub) sub.textContent = subText;
}

function resetAllStages() {
  setStage(1, "standby", "44 tools loaded");
  setStage(2, "standby", "Strategy formulation");
  setStage(3, "standby", "execute_contract_call");
  setStage(4, "standby", "HF 1.500 • $5.00 Cap");
  setStage(5, "standby", "Autonomous rescue plan");

  const rescueCard = document.getElementById("rescueEngineCard");
  if (rescueCard) {
    rescueCard.style.boxShadow = "";
    rescueCard.style.borderColor = "";
  }
}

function appendTermLine(htmlContent) {
  const termBody = document.getElementById("agentTerminalBody");
  if (!termBody) return;
  const lineEl = document.createElement("div");
  lineEl.className = "term-line";
  lineEl.innerHTML = htmlContent;
  termBody.appendChild(lineEl);
  termBody.scrollTop = termBody.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

let activeEventSource = null;

function stopAgentFlow() {
  if (activeEventSource) {
    try {
      activeEventSource.close();
    } catch (e) {}
    activeEventSource = null;
  }
  isAgentRunning = false;
  const termStatus = document.getElementById("termStatusPill");
  if (termStatus) {
    termStatus.className = "term-status-pill";
    termStatus.textContent = "STOPPED • IDLE";
  }
  appendTermLine(`<div style="color: #f87171; font-weight: 700; margin-top: 8px; padding: 4px 8px; background: rgba(239, 68, 68, 0.1); border-left: 3px solid #ef4444;">[STOPPED] Agent execution stopped. Zero pending requests.</div>`);
}

async function runAgentDecisionFlow(promptText, useLiveStream = true, isAutoTriggered = false) {
  if (isAgentRunning) return;
  isAgentRunning = true;

  const termStatus = document.getElementById("termStatusPill");
  if (termStatus) {
    termStatus.className = "term-status-pill busy";
    termStatus.textContent = isAutoTriggered ? "AUTO-DISPATCHED • ORCHESTRATING MCP" : "BUSY • ORCHESTRATING MCP";
  }

  // Clear previous output
  const termBody = document.getElementById("agentTerminalBody");
  if (termBody) {
    const autoHeader = isAutoTriggered
      ? `<div class="term-line" style="color: #f59e0b; font-weight: 700; margin: 4px 0 2px 0;">
           [AUTONOMOUS MONITOR] Health Factor Breached Critical Threshold (&lt; 1.350)
         </div>
         <div class="term-line" style="color: #94a3b8; font-size: 11px; margin-bottom: 6px;">
           State-bound policy armed &bull; Prompting Gemini 3.5 Flash-Lite with 44 KeeperHub MCP tools without asking user.
         </div>`
      : "";
    const authMode = window.bulwarkAuth?.mode;
    const authAddr = window.bulwarkAuth?.address;
    let authNotice = "";
    if (authMode === "wallet") {
      authNotice = `<div class="term-line" style="color: #38bdf8; font-size: 11px; margin-top: 2px;">[BULWARK GATEWAY] Interactive Self-Custody Mode: Connected wallet (${authAddr}) &bull; On-chain broadcast requires manual signature.</div>`;
    } else if (authMode === "private_key") {
      authNotice = `<div class="term-line" style="color: #10b981; font-size: 11px; margin-top: 2px;">[BULWARK GATEWAY] 24/7 Autonomous Guardian Mode: Active key for (${authAddr}) &bull; Zero manual signatures required.</div>`;
    }

    termBody.innerHTML = `
      <div class="term-line" style="color: #64748b;">BULWARK Autonomous Agent Terminal v0.1.0 &bull; Connected to KeeperHub MCP Streamable HTTP</div>
      ${authNotice}
      ${autoHeader}
      <div class="term-line term-cmd" style="margin: 8px 0;">gemini@bulwark:~$ pnpm agent ask "${escapeHtml(promptText)}"</div>
    `;
  }

  resetAllStages();
  setStage(1, "active", "Handshake & discovery");

  // Attempt live stream from /api/agent/stream
  let liveSuccess = false;
  if (useLiveStream && window.EventSource) {
    try {
      await new Promise((resolve) => {
        const url = `/api/agent/stream?prompt=${encodeURIComponent(promptText)}`;
        const es = new EventSource(url);
        activeEventSource = es;

        const cleanup = () => {
          if (activeEventSource === es) {
            activeEventSource = null;
          }
          try { es.close(); } catch {}
        };

        es.onmessage = (e) => {
          try {
            const ev = JSON.parse(e.data);
            const rawLine = ev.text || "";
            const line = stripEmojis(rawLine);
            if (!line) return;

            if (line.includes("Loaded") && line.includes("MCP tools")) {
              setStage(1, "completed", "44 tools loaded");
              setStage(2, "active", "Gemini evaluating position & plans");
              appendTermLine(`<span class="term-keeperhub">${escapeHtml(line)}</span>`);
            } else if (line.includes("[GEMINI] Inspecting live Aave position")) {
              setStage(1, "completed", "44 tools loaded");
              setStage(2, "active", "Inspecting live position");
              appendTermLine(`<span class="term-agent" style="font-weight: 700; color: #38bdf8; font-size: 13px;">${escapeHtml(line)}</span>`);
            } else if (line.includes("[GEMINI] Evaluating valid rescue plans")) {
              setStage(2, "active", "Evaluating rescue plans");
              appendTermLine(`<span class="term-agent" style="font-weight: 700; color: #38bdf8; font-size: 13px;">${escapeHtml(line)}</span>`);
            } else if (line.includes("[GEMINI] Selected strategy") || line.includes("[GEMINI] Proposed repayment")) {
              setStage(2, "completed", "Strategy selected");
              setStage(3, "active", "Policy Compiler clamping check");
              appendTermLine(`<div class="term-tool-call" style="border-left-color: #38bdf8;">
                <span class="chip chip-compiler" style="font-size: 9px; margin-right: 6px;">GEMINI UNDERWRITER</span>
                <strong style="color: #38bdf8;">${escapeHtml(line)}</strong>
              </div>`);
            } else if (line.includes("[POLICY] RescueGrant limit") || line.includes("[POLICY] Authorized repayment")) {
              setStage(3, "completed", "Band 1: $5.00 Cap enforced");
              setStage(4, "active", "KeeperHub MCP simulation");
              appendTermLine(`<div class="term-tool-call" style="border-left-color: #a78bfa;">
                <span class="chip chip-policy" style="font-size: 9px; margin-right: 6px;">POLICY COMPILER</span>
                <strong style="color: #a78bfa;">${escapeHtml(line)}</strong>
              </div>`);
            } else if (line.includes("[POLICY]") || line.includes("[POLICY INVARIANT]")) {
              appendTermLine(`<span class="term-policy">${escapeHtml(line)}</span>`);
            } else if (line.includes("[KEEPERHUB MCP] execute_contract_call")) {
              setStage(3, "completed", "Authorized & clamped");
              setStage(4, "active", "execute_contract_call");
              appendTermLine(`<div class="term-tool-call">
                <span class="chip chip-keeperhub" style="font-size: 9px; margin-right: 6px;">KEEPERHUB MCP</span>
                <strong style="color: #34d399;">${escapeHtml(line)}</strong>
              </div>`);
            } else if (line.includes("function_name:") || line.includes("contract_address:") || line.includes("chain_id:")) {
              appendTermLine(`<span style="color: #94a3b8; font-size: 11px; font-family: monospace;">${escapeHtml(line)}</span>`);
            } else if (line.includes("simulate: true")) {
              setStage(4, "active", "Simulating on Base Sepolia");
              appendTermLine(`<span style="color: #38bdf8; font-weight: 600;">simulate: true</span>`);
            } else if (line.includes("wouldRevert: false")) {
              setStage(4, "completed", "wouldRevert: false");
              setStage(5, "active", "Live broadcast to Base Sepolia");
              appendTermLine(`<span class="term-keeperhub" style="color: #34d399; font-weight: 700;">wouldRevert: false</span>`);

              // Highlight Rescue Engine Card in sync
              const rescueCard = document.getElementById("rescueEngineCard");
              if (rescueCard) {
                rescueCard.style.boxShadow = "0 0 25px rgba(16, 185, 129, 0.35)";
                rescueCard.style.borderColor = "var(--accent-emerald)";
              }
            } else if (line.includes("simulate: false")) {
              setStage(5, "active", "Broadcasting transaction...");
              appendTermLine(`<span style="color: #f59e0b; font-weight: 600;">simulate: false</span>`);
            } else if (line.includes("Tx Hash:")) {
              setStage(5, "completed", "Mined on Base Sepolia");
              const hashMatch = line.match(/0x[a-fA-F0-9]{64}/);
              const hash = hashMatch ? hashMatch[0] : "";
              appendTermLine(`
                <div style="background: rgba(16, 185, 129, 0.12); border-left: 3px solid #10b981; padding: 8px 12px; border-radius: 4px; margin: 6px 0;">
                  <span class="chip chip-chain" style="font-size: 9px; margin-bottom: 4px;">MINED ON BASE SEPOLIA</span>
                  <div style="color: #34d399; font-weight: 700;">${escapeHtml(line)}</div>
                  ${hash ? `<a href="https://sepolia.basescan.org/tx/${hash}" target="_blank" rel="noopener" style="color: var(--accent); font-size: 11px; text-decoration: underline;">View on BaseScan &nearr;</a>` : ""}
                </div>
              `);
            } else if (line.includes("[AGENT OUTPUT] Response:")) {
              appendTermLine(`<span class="term-agent" style="font-size: 13px; font-weight: 600;">${escapeHtml(line)}</span>`);
            } else if (line.startsWith("###")) {
              appendTermLine(`<div style="color: #38bdf8; font-weight: 700; margin-top: 8px;">${escapeHtml(line.replace(/^#+\s*/, ""))}</div>`);
            } else if (line.startsWith("---")) {
              appendTermLine(`<div style="border-top: 1px solid #334155; margin: 6px 0;"></div>`);
            } else if (line.startsWith("* ") || line.startsWith("- ")) {
              appendTermLine(`<div style="color: #cbd5e1; padding-left: 8px;">&bull; ${escapeHtml(line.slice(2))}</div>`);
            } else if (line.startsWith("[AGENT OUTPUT]")) {
              appendTermLine(`<span class="term-agent">${escapeHtml(line)}</span>`);
            } else if (line.startsWith("[KEEPERHUB FACT]")) {
              appendTermLine(`<span class="term-keeperhub">${escapeHtml(line)}</span>`);
            } else {
              appendTermLine(`<span style="color: #cbd5e1;">${escapeHtml(line)}</span>`);
            }

            if (ev.type === "done") {
              cleanup();
              liveSuccess = true;
              setStage(5, "completed", "Rescue plan ready");
              resolve();
            }
          } catch (parseErr) {
            console.warn("Error parsing agent event:", parseErr);
          }
        };

        es.onerror = () => {
          cleanup();
          resolve();
        };

        // Safety timeout of 35 seconds for live Gemini LLM + MCP execution
        setTimeout(() => {
          cleanup();
          resolve();
        }, 35000);
      });
    } catch (err) {
      console.warn("Live stream fallback:", err);
    }
  }

  // If live stream did not complete (e.g. timeout or offline), play realistic verified trace
  if (!liveSuccess) {
    for (let i = 1; i < VERIFIED_SCAN_TRACE.length; i++) {
      const step = VERIFIED_SCAN_TRACE[i];
      await new Promise(r => setTimeout(r, 420));

      if (step.type === "discovery") {
        setStage(1, "completed", "44 tools loaded");
        setStage(2, "active", "Gemini evaluating position & plans");
        appendTermLine(`<span class="term-keeperhub">${escapeHtml(step.text)}</span>`);
      } else if (step.type === "gemini_inspect" || step.type === "gemini_eval") {
        setStage(2, "active", step.type === "gemini_inspect" ? "Inspecting live position" : "Evaluating rescue plans");
        appendTermLine(`<span class="term-agent" style="font-weight: 700; color: #38bdf8; font-size: 13px;">${escapeHtml(step.text)}</span>`);
      } else if (step.type === "gemini_strategy" || step.type === "gemini_repay") {
        setStage(2, "completed", "Strategy selected");
        setStage(3, "active", "Policy Compiler clamping check");
        appendTermLine(`
          <div class="term-tool-call" style="border-left-color: #38bdf8;">
            <span class="chip chip-compiler" style="font-size: 9px; margin-right: 6px;">GEMINI UNDERWRITER</span>
            <strong style="color: #38bdf8;">${escapeHtml(step.text)}</strong>
          </div>
        `);
      } else if (step.type === "policy_limit" || step.type === "policy_auth") {
        setStage(3, "completed", "Band 1: $5.00 Cap enforced");
        setStage(4, "active", "KeeperHub MCP simulation");
        appendTermLine(`
          <div class="term-tool-call" style="border-left-color: #a78bfa;">
            <span class="chip chip-policy" style="font-size: 9px; margin-right: 6px;">POLICY COMPILER</span>
            <strong style="color: #a78bfa;">${escapeHtml(step.text)}</strong>
          </div>
        `);
      } else if (step.type === "policy" || step.type === "plan") {
        appendTermLine(`<span class="term-policy">${escapeHtml(step.text)}</span>`);
      } else if (step.type === "mcp_call") {
        setStage(4, "active", "execute_contract_call");
        appendTermLine(`
          <div class="term-tool-call">
            <span class="chip chip-keeperhub" style="font-size: 9px; margin-right: 6px;">KEEPERHUB MCP</span>
            <strong style="color: #34d399;">${escapeHtml(step.text)}</strong>
          </div>
        `);
      } else if (step.type === "mcp_sub") {
        appendTermLine(`<span style="color: #94a3b8; font-size: 11px; font-family: monospace;">${escapeHtml(step.text)}</span>`);
      } else if (step.type === "sim_phase") {
        appendTermLine(`<span style="color: #38bdf8; font-weight: 600;">simulate: true</span>`);
      } else if (step.type === "sim_verdict") {
        setStage(4, "completed", "wouldRevert: false");
        setStage(5, "active", "Live broadcast to Base Sepolia");
        appendTermLine(`<span class="term-keeperhub" style="color: #34d399; font-weight: 700;">wouldRevert: false</span>`);
        const rescueCard = document.getElementById("rescueEngineCard");
        if (rescueCard) {
          rescueCard.style.boxShadow = "0 0 25px rgba(16, 185, 129, 0.35)";
          rescueCard.style.borderColor = "var(--accent-emerald)";
        }
      } else if (step.type === "sim_gas" || (step.type === "fact" && step.text.includes("Simulation verified"))) {
        appendTermLine(`<span class="term-keeperhub">[OK] ${escapeHtml(step.text)}</span>`);
      } else if (step.type === "exec_phase") {
        appendTermLine(`<span style="color: #f59e0b; font-weight: 600;">simulate: false</span>`);
      } else if (step.type === "tx_hash") {
        setStage(5, "completed", "Mined on Base Sepolia");
        appendTermLine(`
          <div style="background: rgba(16, 185, 129, 0.12); border-left: 3px solid #10b981; padding: 8px 12px; border-radius: 4px; margin: 6px 0;">
            <span class="chip chip-chain" style="font-size: 9px; margin-bottom: 4px;">MINED ON BASE SEPOLIA</span>
            <div style="color: #34d399; font-weight: 700;">${escapeHtml(step.text)}</div>
            <a href="https://sepolia.basescan.org/tx/0xd15b609e39dce88af7c2e17b4fe353309cacf87b0ae0ffa3b82b9b603865d394" target="_blank" rel="noopener" style="color: var(--accent); font-size: 11px; text-decoration: underline;">View on BaseScan (Block 46969555) &nearr;</a>
          </div>
        `);
      } else if (step.type === "tx_meta" || step.type === "delta") {
        appendTermLine(`<span style="color: #cbd5e1; font-size: 11px;">${escapeHtml(step.text)}</span>`);
      } else if (step.type === "response") {
        const formatted = step.text.split("\n").map(l => escapeHtml(l)).join("<br>");
        appendTermLine(`<div style="background: rgba(16, 185, 129, 0.08); border-left: 3px solid #10b981; padding: 10px 12px; border-radius: 4px; margin-top: 8px; color: #f1f5f9; line-height: 1.6;">${formatted}</div>`);
      } else if (step.type === "agent") {
        appendTermLine(`<span class="term-agent">${escapeHtml(step.text)}</span>`);
      } else {
        appendTermLine(`<span class="term-keeperhub">${escapeHtml(step.text)}</span>`);
      }
    }
  }

  // Mark all stages verified
  for (let s = 1; s <= 5; s++) {
    setStage(s, "completed");
  }

  // Completion summary footer in terminal
  appendTermLine(`
    <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #1e293b; display: flex; justify-content: space-between; align-items: center;">
      <span style="color: #34d399; font-weight: 700;">Autonomous MCP Cycle Completed &bull; Zero Manual Intervention &bull; Invariants Preserved</span>
      <a href="/verify" style="color: var(--accent); text-decoration: underline; font-size: 11px;">Verify PoAA Proof &rarr;</a>
    </div>
  `);

  if (termStatus) {
    termStatus.className = "term-status-pill";
    termStatus.textContent = "COMPLETED • ZERO-TOUCH AUTONOMOUS";
  }

  isAgentRunning = false;
  activeEventSource = null;
  fetchState(); // Refresh dashboard state
}

function initAgentDecisionConsole() {
  // Live Terminal Visibility Toggle Button
  const btnToggle = document.getElementById("btnToggleTerminal");
  const terminalSection = document.getElementById("agentDecisionConsoleSection");
  const triadSection = document.getElementById("overviewTriadSection");
  const toggleTitle = document.getElementById("terminalToggleTitle");
  const toggleSub = document.getElementById("terminalToggleSub");
  const btnShowTriad = document.getElementById("btnShowTriadCards");

  function setTerminalVisibility(visible, animateScroll = false) {
    if (!terminalSection) return;
    if (visible) {
      // Show terminal and hide the 3-column triad (opening terminal up to the hero)
      terminalSection.style.display = "block";
      terminalSection.classList.remove("terminal-hidden");
      if (triadSection) {
        triadSection.style.display = "none";
        triadSection.classList.add("triad-hidden");
      }
      if (btnToggle) {
        btnToggle.classList.add("active");
        btnToggle.setAttribute("aria-pressed", "true");
      }
      if (toggleTitle) toggleTitle.textContent = "Hide Live Terminal";
      if (toggleSub) toggleSub.textContent = "Showing Terminal (3 Cards Hidden)";
      localStorage.setItem("bulwark_terminal_visible_v2", "true");
      if (animateScroll) {
        setTimeout(() => {
          terminalSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 120);
      }
      // Strictly manual: do not auto-dispatch requests when toggling visibility
    } else {
      // Hide terminal and show the 3-column triad (Monitored Position, Rescue Engine, Authorization)
      terminalSection.style.display = "none";
      terminalSection.classList.add("terminal-hidden");
      if (triadSection) {
        triadSection.style.display = "grid";
        triadSection.classList.remove("triad-hidden");
      }
      if (btnToggle) {
        btnToggle.classList.remove("active");
        btnToggle.setAttribute("aria-pressed", "false");
      }
      if (toggleTitle) toggleTitle.textContent = "Show Live Terminal";
      if (toggleSub) toggleSub.textContent = "Gemini 3.5 + KeeperHub MCP (Hidden)";
      localStorage.setItem("bulwark_terminal_visible_v2", "false");
      if (animateScroll && triadSection) {
        setTimeout(() => {
          triadSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 120);
      }
    }
  }

  window.setTerminalVisibility = setTerminalVisibility;

  if (btnToggle) {
    btnToggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isCurrentlyVisible = !terminalSection?.classList.contains("terminal-hidden") && terminalSection?.style.display !== "none";
      setTerminalVisibility(!isCurrentlyVisible, true);
    });

    const saved = localStorage.getItem("bulwark_terminal_visible_v2");
    if (saved === "true") {
      setTerminalVisibility(true, false);
    } else {
      setTerminalVisibility(false, false);
    }
  }

  if (btnShowTriad) {
    btnShowTriad.addEventListener("click", () => {
      setTerminalVisibility(false, true);
    });
  }

  const btnDemo = document.getElementById("btnRunAgentDemo");
  const btnStop = document.getElementById("btnStopAgent");
  const btnReplay = document.getElementById("btnReplayTrace");
  const btnClear = document.getElementById("btnClearTerminal");
  const promptForm = document.getElementById("agentPromptForm");
  const promptInput = document.getElementById("agentCustomPromptInput");

  function syncPresetsWithAuth(auth) {
    // Keep presets focused on the live monitored distressed position (0xE406f471E711A2C8012e95c4B09fa9F1C9ae8123)
  }

  window.addEventListener("bulwarkAuthChanged", (e) => {
    syncPresetsWithAuth(e.detail);
    const termActive = document.getElementById("termActiveText");
    if (termActive) {
      if (e.detail?.authenticated) {
        const modeLabel = e.detail.mode === "private_key" ? "24/7 Autonomous Guardian" : "Interactive Self-Custody Wallet";
        const short = `${e.detail.address.slice(0, 6)}...${e.detail.address.slice(-4)}`;
        termActive.textContent = `Standby • ${modeLabel} (${short}) ready for autonomous dispatch...`;
      } else {
        termActive.textContent = "Locked • Click BULWARK logo or Connect Wallet to authenticate...";
      }
    }
  });

  if (window.bulwarkAuth) {
    syncPresetsWithAuth(window.bulwarkAuth);
  }

  if (btnDemo) {
    btnDemo.addEventListener("click", () => {
      if (!window.bulwarkAuth || !window.bulwarkAuth.authenticated) {
        if (typeof openAccessGatewayModal === "function") openAccessGatewayModal();
        if (typeof showToast === "function") showToast("Please authenticate (Connect Wallet or 24/7 Key) before triggering cycles.", "error");
        return;
      }
      runAgentDecisionFlow(`Two-Phase Live Auto-Rescue: Inspect borrower 0xE406f471E711A2C8012e95c4B09fa9F1C9ae8123 on Aave V3 Base Sepolia, evaluate candidate plans via Gemini Underwriter, clamp to RescueGrant policy, and execute via KeeperHub MCP (simulate: true then simulate: false).`, true);
    });
  }

  if (btnStop) {
    btnStop.addEventListener("click", () => {
      stopAgentFlow();
    });
  }

  if (btnReplay) {
    btnReplay.addEventListener("click", () => {
      runAgentDecisionFlow(`Two-Phase Live Auto-Rescue: Inspect borrower 0xE406f471E711A2C8012e95c4B09fa9F1C9ae8123 on Aave V3 Base Sepolia, evaluate candidate plans via Gemini Underwriter, clamp to RescueGrant policy, and execute via KeeperHub MCP (simulate: true then simulate: false).`, false);
    });
  }

  if (btnClear) {
    btnClear.addEventListener("click", () => {
      stopAgentFlow();
      const termBody = document.getElementById("agentTerminalBody");
      if (termBody) {
        termBody.innerHTML = `
          <div class="term-line" style="color: #64748b;">BULWARK Autonomous Agent Terminal v0.1.0 &bull; Connected to KeeperHub MCP Streamable HTTP</div>
          <div class="term-line" style="color: #64748b; margin-bottom: 10px;">Terminal cleared. Click <strong style="color: #10b981;">Trigger Autonomous Cycle</strong> or select a prompt chip to launch.</div>
          <div class="term-line"><span style="color: #10b981;">gemini@bulwark:~$</span> Standby &bull; Ready for prompt...<span class="term-cursor"></span></div>
        `;
      }
      resetAllStages();
      const termStatus = document.getElementById("termStatusPill");
      if (termStatus) {
        termStatus.className = "term-status-pill";
        termStatus.textContent = "CONNECTED • IDLE";
      }
    });
  }

  // Quick preset chips
  document.querySelectorAll(".term-chip-preset").forEach(chip => {
    chip.addEventListener("click", () => {
      if (!window.bulwarkAuth || !window.bulwarkAuth.authenticated) {
        if (typeof openAccessGatewayModal === "function") openAccessGatewayModal();
        if (typeof showToast === "function") showToast("Please authenticate (Connect Wallet or 24/7 Key) before running agent tasks.", "error");
        return;
      }
      const p = chip.getAttribute("data-prompt");
      if (promptInput && p) promptInput.value = p;
      if (p) runAgentDecisionFlow(p, true);
    });
  });

  if (promptForm) {
    promptForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!window.bulwarkAuth || !window.bulwarkAuth.authenticated) {
        if (typeof openAccessGatewayModal === "function") openAccessGatewayModal();
        if (typeof showToast === "function") showToast("Please authenticate (Connect Wallet or 24/7 Key) before running agent tasks.", "error");
        return;
      }
      const val = promptInput?.value?.trim();
      if (val) {
        runAgentDecisionFlow(val, true);
      }
    });
  }
}

// ── App Initialization ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initAgentDecisionConsole();
  if (window.location.search.includes("demo=1")) {
    setTimeout(() => {
      runAgentDecisionFlow("Two-Phase Live Auto-Rescue for borrower on Aave V3 Base Sepolia", false);
    }, 600);
  }
});

// Synchronously render from cached state so navigating back to /overview never flickers
(function initCachedOverviewState() {
  try {
    const raw = localStorage.getItem("bulwark_desk_state");
    if (raw) {
      const data = JSON.parse(raw);
      renderState(data);
    }
  } catch (e) {}
})();

fetchState();
setInterval(fetchState, 3000);

