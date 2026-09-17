/**
 * Bulwark Dashboard Frontend Client
 */

async function fetchState() {
  try {
    const res = await fetch("/api/state");
    if (!res.ok) return;
    const data = await res.json();
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
            <strong>🤖 Gemini 3.5 AI Underwriter:</strong> ${(grant.triage?.agentNarrative || data.grants.slice().reverse().find(g => g.triage?.agentNarrative)?.triage?.agentNarrative || "Autonomous risk underwriting active: Health factor deficit clamped within EIP-712 pre-authorization policy boundaries.").replace('[AGENT OUTPUT] ', '')}
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
    const isBase = latest?.txHash?.startsWith("0x43dbc") || data.grants?.some(g => g.grantId === latest?.grantId && g.position?.chainId === 84532);
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
}

async function approveGrant(id) {
  try {
    const doFetch = window.bulwarkFetch || fetch;
    const res = await doFetch(`/api/grants/${encodeURIComponent(id)}/approve`, { method: "POST" });
    if (res.ok) fetchState();
  } catch (err) {
    alert("Error approving grant: " + err.message);
  }
}

async function revokeGrant(id) {
  try {
    const doFetch = window.bulwarkFetch || fetch;
    const res = await doFetch(`/api/grants/${encodeURIComponent(id)}/revoke`, { method: "POST" });
    if (res.ok) fetchState();
  } catch (err) {
    alert("Error revoking grant: " + err.message);
  }
}

async function dryRunGrant(id) {
  try {
    const doFetch = window.bulwarkFetch || fetch;
    const res = await doFetch(`/api/grants/${encodeURIComponent(id)}/dry`, { method: "POST" });
    const json = await res.json();
    alert("Simulation Result:\n" + JSON.stringify(json, null, 2));
    fetchState();
  } catch (err) {
    alert("Error running simulation: " + err.message);
  }
}

async function executeGrant(id) {
  try {
    const doFetch = window.bulwarkFetch || fetch;
    const res = await doFetch(`/api/grants/${encodeURIComponent(id)}/execute`, { method: "POST" });
    const json = await res.json();
    alert("Execution submitted:\n" + JSON.stringify(json.execution, null, 2));
    fetchState();
  } catch (err) {
    alert("Error executing grant: " + err.message);
  }
}

// ── App Initialization ─────────────────────────────────────────────────────
fetchState();
setInterval(fetchState, 3000);
