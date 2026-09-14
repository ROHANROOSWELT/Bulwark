/**
 * BULWARK RescueGrants Desk Client
 */

let allGrants = [];
let activeStatusFilter = "all";

async function loadGrantsData() {
  const data = await fetchDeskState();
  if (!data || !data.grants) return;

  allGrants = data.grants;
  renderGrantsMetrics(allGrants);
  renderGrantsTable(allGrants);
}

function renderGrantsMetrics(grants) {
  let armedCount = 0;
  let proposedCount = 0;
  let totalCap = 0;

  grants.forEach((g) => {
    const status = g.state.status.toLowerCase();
    if (status === "armed") armedCount++;
    if (status === "proposed") proposedCount++;
    totalCap += g.authority.capitalCapUsd || 0;
  });

  document.getElementById("totalGrantsVal").textContent = grants.length;
  document.getElementById("armedGrantsVal").textContent = armedCount;
  document.getElementById("proposedGrantsVal").textContent = proposedCount;
  document.getElementById("totalCapitalAuthorizedVal").textContent = `$${totalCap.toFixed(2)}`;
}

function renderGrantsTable(grants) {
  const tbody = document.getElementById("grantsTableBody");
  const filterText = (document.getElementById("filterGrantsInput")?.value || "").toLowerCase();

  const filtered = grants.filter((g) => {
    const matchesStatus = activeStatusFilter === "all" || g.state.status.toLowerCase() === activeStatusFilter;
    const matchesText =
      !filterText ||
      g.grantId.toLowerCase().includes(filterText) ||
      (g.parties?.owner && g.parties.owner.toLowerCase().includes(filterText)) ||
      (g.grantHash && g.grantHash.toLowerCase().includes(filterText));
    return matchesStatus && matchesText;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">
          ${grants.length === 0 ? "No RescueGrants on record." : "No grants match current filters."}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map((g) => {
      const owner = g.parties?.owner || "Unknown";
      const ownerShort = `${owner.slice(0, 8)}...${owner.slice(-6)}`;
      const explorerUrl = `https://sepolia.etherscan.io/address/${owner}`;
      const status = g.state.status.toLowerCase();
      const statusClass = `status-${status}`;
      const isProposed = status === "proposed";
      const isArmed = status === "armed";
      const canRevoke = !["revoked", "invalidated", "settled"].includes(status);

      return `
        <tr>
          <td>
            <div style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-cyan); cursor: pointer;" onclick="inspectGrant('${g.grantId}')" title="Click to inspect EIP-712 payload">
              ${g.grantId} &boxbox;
            </div>
            <span style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">${g.grantHash.slice(0, 14)}...</span>
          </td>
          <td>
            <a href="${explorerUrl}" target="_blank" rel="noopener" style="color: var(--text-primary); font-family: var(--font-mono); text-decoration: underline;">
              ${ownerShort} &nearr;
            </a>
          </td>
          <td>
            <span class="chip chip-chain">USDC</span>
          </td>
          <td style="font-family: var(--font-mono);">
            <strong>$${g.authority.capitalCapUsd.toFixed(2)}</strong>
            <span style="color: var(--text-muted); font-size: 11px;">(Per-Action: $${g.authority.perActionCapUsd.toFixed(2)})</span>
          </td>
          <td style="font-family: var(--font-mono); font-size: 11px;">
            Trigger: <span style="color: var(--accent-rose);">&lt; ${g.conditions.hfTriggerBelow.toFixed(2)}</span><br>
            Recovery: <span style="color: var(--accent-emerald);">&ge; ${g.conditions.recoveryHf.toFixed(2)}</span>
          </td>
          <td>
            <span class="status-badge ${statusClass}">${g.state.status}</span>
          </td>
          <td style="text-align: right;">
            <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center; flex-wrap: wrap;">
              ${isProposed ? `<button onclick="approveGrantAction('${g.grantId}')" class="btn-sm btn-approve">Approve (Arm)</button>` : ""}
              ${isArmed ? `<button onclick="dryRunGrantAction('${g.grantId}')" class="btn-sm btn-dry">Dry Run</button>` : ""}
              ${isArmed ? `<button onclick="executeGrantAction('${g.grantId}')" class="btn-sm btn-execute">Execute</button>` : ""}
              ${canRevoke ? `<button onclick="revokeGrantAction('${g.grantId}')" class="btn-sm btn-revoke">Revoke</button>` : ""}
              <button onclick="inspectGrant('${g.grantId}')" class="btn-sm btn-secondary" title="View EIP-712 typed data">Inspect</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

// ── Grant Actions ──────────────────────────────────────────────────────────
async function approveGrantAction(id) {
  try {
    const res = await fetch(`/api/grants/${encodeURIComponent(id)}/approve`, { method: "POST" });
    if (!res.ok) throw new Error("Approval failed");
    showToast(`Grant ${id} armed successfully. Ready for KeeperHub dispatch.`, "success");
    await loadGrantsData();
  } catch (err) {
    showToast(`Error approving grant: ${err.message}`, "error");
  }
}

async function dryRunGrantAction(id) {
  try {
    const res = await fetch(`/api/grants/${encodeURIComponent(id)}/dry`, { method: "POST" });
    const json = await res.json();
    if (json.wouldRevert) {
      showToast(`Simulation reverted: ${json.revertReason || "Flashloan condition not met"}`, "error");
    } else {
      showToast(`Simulation passed! Estimated Gas: ${json.gasEstimate || "180,000"}`, "success");
    }
    await loadGrantsData();
  } catch (err) {
    showToast(`Error simulating grant: ${err.message}`, "error");
  }
}

async function executeGrantAction(id) {
  try {
    showToast(`Submitting execution to KeeperHub network for grant ${id}...`, "info");
    const res = await fetch(`/api/grants/${encodeURIComponent(id)}/execute`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Execution failed");
    showToast(`Execution completed! TxHash: ${json.execution.txHash.slice(0, 10)}...`, "success");
    await loadGrantsData();
  } catch (err) {
    showToast(`Error executing grant: ${err.message}`, "error");
  }
}

async function revokeGrantAction(id) {
  if (!confirm(`Are you sure you want to revoke authority for grant ${id}?`)) return;
  try {
    const res = await fetch(`/api/grants/${encodeURIComponent(id)}/revoke`, { method: "POST" });
    if (!res.ok) throw new Error("Revocation failed");
    showToast(`Grant ${id} has been revoked.`, "info");
    await loadGrantsData();
  } catch (err) {
    showToast(`Error revoking grant: ${err.message}`, "error");
  }
}

function inspectGrant(id) {
  const grant = allGrants.find((g) => g.grantId === id);
  if (!grant) return;

  const modal = document.getElementById("inspectGrantModal");
  const title = document.getElementById("inspectModalTitle");
  const textarea = document.getElementById("inspectPayloadText");

  title.textContent = `Grant Invariant Payload: ${id}`;
  textarea.value = JSON.stringify(grant, null, 2);
  modal.style.display = "flex";
}

// ── Setup Listeners ────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  loadGrantsData();
  setInterval(loadGrantsData, 4000);

  // Filter Tabs
  document.querySelectorAll(".filter-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".filter-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeStatusFilter = tab.getAttribute("data-status");
      renderGrantsTable(allGrants);
    });
  });

  // Search Input
  const filterInput = document.getElementById("filterGrantsInput");
  if (filterInput) {
    filterInput.addEventListener("input", () => renderGrantsTable(allGrants));
  }

  // Inspect Modal Controls
  const closeInspectBtn = document.getElementById("closeInspectModalBtn");
  const inspectModal = document.getElementById("inspectGrantModal");
  const copyJsonBtn = document.getElementById("copyInspectJsonBtn");

  if (closeInspectBtn && inspectModal) {
    closeInspectBtn.addEventListener("click", () => (inspectModal.style.display = "none"));
    inspectModal.addEventListener("click", (e) => {
      if (e.target === inspectModal) inspectModal.style.display = "none";
    });
  }

  if (copyJsonBtn) {
    copyJsonBtn.addEventListener("click", () => {
      const text = document.getElementById("inspectPayloadText")?.value;
      if (text) {
        navigator.clipboard.writeText(text);
        showToast("Grant JSON copied to clipboard!", "success");
      }
    });
  }

  // Propose Modal Controls
  const openProposeBtn = document.getElementById("openProposeModalBtn");
  const closeProposeBtn = document.getElementById("closeProposeModalBtn");
  const cancelProposeBtn = document.getElementById("cancelProposeBtn");
  const proposeModal = document.getElementById("proposeGrantModal");
  const proposeForm = document.getElementById("proposeGrantForm");
  const propOwnerInput = document.getElementById("propOwnerInput");
  const propUseWalletBtn = document.getElementById("propUseWalletBtn");

  if (openProposeBtn && proposeModal) {
    openProposeBtn.addEventListener("click", () => {
      if (connectedWallet && connectedWallet.address && propOwnerInput && !propOwnerInput.value) {
        propOwnerInput.value = connectedWallet.address;
      }
      proposeModal.style.display = "flex";
    });
  }

  if (closeProposeBtn && proposeModal) {
    closeProposeBtn.addEventListener("click", () => (proposeModal.style.display = "none"));
  }
  if (cancelProposeBtn && proposeModal) {
    cancelProposeBtn.addEventListener("click", () => (proposeModal.style.display = "none"));
  }
  if (proposeModal) {
    proposeModal.addEventListener("click", (e) => {
      if (e.target === proposeModal) proposeModal.style.display = "none";
    });
  }

  if (propUseWalletBtn && propOwnerInput) {
    propUseWalletBtn.addEventListener("click", () => {
      if (connectedWallet && connectedWallet.address) {
        propOwnerInput.value = connectedWallet.address;
      } else {
        showToast("No wallet connected. Please connect wallet first.", "error");
      }
    });
  }

  // Propose Form Submission
  if (proposeForm) {
    proposeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const owner = propOwnerInput.value.trim();
      const capitalCapUsd = parseFloat(document.getElementById("propCapitalCapInput").value);
      const perActionCapUsd = parseFloat(document.getElementById("propPerActionInput").value);
      const expiresInHours = parseInt(document.getElementById("propExpiresInput").value, 10);

      const submitBtn = document.getElementById("submitProposeBtn");
      submitBtn.disabled = true;
      submitBtn.textContent = "Proposing...";

      try {
        const res = await fetch("/api/grants/propose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner,
            capitalCapUsd,
            perActionCapUsd,
            expiresInHours,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to propose grant");
        }

        const grant = await res.json();
        showToast(`RescueGrant ${grant.grantId} proposed successfully!`, "success");
        proposeModal.style.display = "none";
        await loadGrantsData();
      } catch (err) {
        console.error("Propose error:", err);
        showToast(`Error proposing grant: ${err.message}`, "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Propose RescueGrant";
      }
    });
  }

  // Pre-fill owner from query param ?owner=0x...
  const urlParams = new URLSearchParams(window.location.search);
  const ownerParam = urlParams.get("owner");
  if (ownerParam && propOwnerInput && proposeModal) {
    propOwnerInput.value = ownerParam;
    proposeModal.style.display = "flex";
  }
});
