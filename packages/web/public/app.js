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
  if (data.hasKey) {
    keyChip.className = "chip chip-keeperhub";
    keyChip.textContent = "[KEEPERHUB FACT] KEY ACTIVE";
  } else {
    keyChip.className = "chip chip-unavailable";
    keyChip.textContent = "[UNAVAILABLE] KEY NOT SET";
  }

  // 2. Desk KPIs
  if (data.capacity) {
    document.getElementById("deskBalanceVal").textContent = `$${(data.capacity.deskBalanceUsd || 0).toFixed(2)}`;
    document.getElementById("availableCapVal").textContent = `$${(data.capacity.availableUsd || 0).toFixed(2)}`;
    document.getElementById("reservedCapVal").textContent = `$${(data.capacity.reservedUsd || 0).toFixed(2)}`;
  }
  if (data.reputation) {
    document.getElementById("verifiedRescuesVal").textContent = data.reputation.totalExecutionsVerified || 0;
    document.getElementById("capitalDeployedVal").textContent = `$${(data.reputation.totalCapitalDeployedUsd || 0).toFixed(2)}`;
  }

  // 3. Panel 1: Monitored Positions
  const posContainer = document.getElementById("positionsList");
  if (!data.watchlist || data.watchlist.length === 0) {
    posContainer.innerHTML = `<div class="card"><span class="card-key">No positions on watchlist.</span></div>`;
  } else {
    posContainer.innerHTML = data.watchlist.map((p) => {
      const hfClass = p.healthFactor < 1.2 ? "hf-critical" : p.healthFactor < 1.5 ? "hf-caution" : "hf-healthy";
      return `
        <div class="card">
          <div class="card-row">
            <span class="card-key">Borrower:</span>
            <span class="card-val">${p.userAddress.slice(0, 8)}...${p.userAddress.slice(-6)}</span>
          </div>
          <div class="card-row">
            <span class="card-key">Health Factor:</span>
            <span class="hf-badge ${hfClass}">${p.healthFactor.toFixed(3)}</span>
          </div>
          <div class="card-row">
            <span class="card-key">Collateral Base:</span>
            <span class="card-val">$${p.totalCollateralUsd.toFixed(2)}</span>
          </div>
          <div class="card-row">
            <span class="card-key">Debt Base:</span>
            <span class="card-val">$${p.totalDebtUsd.toFixed(2)}</span>
          </div>
          <div class="card-row">
            <span class="card-key">Liquidation Threshold:</span>
            <span class="card-val">${(p.currentLiquidationThresholdBps / 100).toFixed(1)}%</span>
          </div>
          <div class="card-row">
            <span class="card-key">Source:</span>
            <span class="chip chip-chain">[CHAIN READ]</span>
          </div>
        </div>
      `;
    }).join("");
  }

  // 4. Panel 2: RescueGrants
  const grantsContainer = document.getElementById("grantsList");
  if (!data.grants || data.grants.length === 0) {
    grantsContainer.innerHTML = `<div class="card"><span class="card-key">No active grants in store.</span></div>`;
  } else {
    grantsContainer.innerHTML = data.grants.map((g) => {
      const statusClass = `status-${g.state.status.toLowerCase()}`;
      const isProposed = g.state.status === "proposed";
      const isArmed = g.state.status === "armed";
      return `
        <div class="card">
          <div class="card-row">
            <span class="card-key">Grant ID:</span>
            <span class="card-val">${g.grantId}</span>
          </div>
          <div class="card-row">
            <span class="card-key">Status:</span>
            <span class="status-badge ${statusClass}">${g.state.status}</span>
          </div>
          <div class="card-row">
            <span class="card-key">Capital Cap:</span>
            <span class="card-val">$${g.authority.capitalCapUsd} (Per-Action: $${g.authority.perActionCapUsd})</span>
          </div>
          <div class="card-row">
            <span class="card-key">Grant Hash:</span>
            <span class="card-val">${g.grantHash.slice(0, 12)}...</span>
          </div>
          <div class="card-row" style="margin-top: 6px; gap: 6px; justify-content: flex-end;">
            ${isProposed ? `<button onclick="approveGrant('${g.grantId}')" class="btn-sm btn-approve">Approve</button>` : ""}
            ${isArmed ? `<button onclick="dryRunGrant('${g.grantId}')" class="btn-sm btn-dry">Dry Run</button>` : ""}
            ${isArmed ? `<button onclick="executeGrant('${g.grantId}')" class="btn-sm btn-execute">Execute</button>` : ""}
            ${!["revoked", "invalidated", "settled"].includes(g.state.status) ? `<button onclick="revokeGrant('${g.grantId}')" class="btn-sm btn-revoke">Revoke</button>` : ""}
          </div>
        </div>
      `;
    }).join("");
  }

  // 5. Panel 3: Executions
  const execsContainer = document.getElementById("executionsList");
  if (!data.executions || data.executions.length === 0) {
    execsContainer.innerHTML = `<div class="card"><span class="card-key">${data.hasKey ? "No executions recorded." : "[UNAVAILABLE] Key required for executions."}</span></div>`;
  } else {
    execsContainer.innerHTML = data.executions.map((e) => {
      const explorerLink = e.txHash ? `https://sepolia.etherscan.io/tx/${e.txHash}` : null;
      return `
        <div class="card">
          <div class="card-row">
            <span class="card-key">Exec ID:</span>
            <span class="card-val">${e.executionId}</span>
          </div>
          <div class="card-row">
            <span class="card-key">Status:</span>
            <span class="status-badge status-${e.status}">${e.status}</span>
          </div>
          <div class="card-row">
            <span class="card-key">Amount:</span>
            <span class="card-val">$${e.amountUsd.toFixed(2)} (${e.action})</span>
          </div>
          <div class="card-row">
            <span class="card-key">Receipts:</span>
            <span class="card-val">${e.receiptVerified ? "Dual Verified" : "Pending / Unavailable"}</span>
          </div>
          ${explorerLink ? `
          <div class="card-row">
            <span class="card-key">Transaction:</span>
            <a href="${explorerLink}" target="_blank" rel="noopener" class="card-val" style="color: var(--accent-cyan); text-decoration: underline;">
              ${e.txHash.slice(0, 10)}...${e.txHash.slice(-6)} &nearr;
            </a>
          </div>` : ""}
          <div class="card-row">
            <span class="card-key">HF Delta:</span>
            <span class="card-val">${e.preHealthFactor ? e.preHealthFactor.toFixed(3) : "N/A"} &rarr; ${e.postHealthFactor ? e.postHealthFactor.toFixed(3) : "N/A"}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  // 6. Panel 4: Audit Trail
  const auditContainer = document.getElementById("auditList");
  if (!data.audit || data.audit.length === 0) {
    auditContainer.innerHTML = `<div class="card"><span class="card-key">No audit records yet.</span></div>`;
  } else {
    auditContainer.innerHTML = data.audit.slice(-25).reverse().map((a) => {
      return `
        <div class="audit-entry">
          <div class="audit-meta">
            <span>${a.type}</span>
            <span class="chip chip-compiler">${a.provenance || "FACT"}</span>
          </div>
          <div style="color: var(--text-secondary);">${new Date(a.timestamp).toLocaleTimeString()} &middot; ${a.grantId || a.id}</div>
        </div>
      `;
    }).join("");
  }
}

async function approveGrant(id) {
  try {
    const res = await fetch(`/api/grants/${encodeURIComponent(id)}/approve`, { method: "POST" });
    if (res.ok) fetchState();
  } catch (err) {
    alert("Error approving grant: " + err.message);
  }
}

async function revokeGrant(id) {
  try {
    const res = await fetch(`/api/grants/${encodeURIComponent(id)}/revoke`, { method: "POST" });
    if (res.ok) fetchState();
  } catch (err) {
    alert("Error revoking grant: " + err.message);
  }
}

async function dryRunGrant(id) {
  try {
    const res = await fetch(`/api/grants/${encodeURIComponent(id)}/dry`, { method: "POST" });
    const json = await res.json();
    alert("Simulation Result:\n" + JSON.stringify(json, null, 2));
    fetchState();
  } catch (err) {
    alert("Error running simulation: " + err.message);
  }
}

async function executeGrant(id) {
  try {
    const res = await fetch(`/api/grants/${encodeURIComponent(id)}/execute`, { method: "POST" });
    const json = await res.json();
    alert("Execution submitted:\n" + JSON.stringify(json.execution, null, 2));
    fetchState();
  } catch (err) {
    alert("Error executing grant: " + err.message);
  }
}

document.getElementById("tickBtn").addEventListener("click", async () => {
  try {
    const res = await fetch("/api/tick", { method: "POST" });
    const json = await res.json();
    fetchState();
  } catch (err) {
    console.error("Tick failed:", err);
  }
});

// Initial load and periodic refresh
fetchState();
setInterval(fetchState, 3000);
