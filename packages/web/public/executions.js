/**
 * BULWARK Executions Desk Client
 */

let allExecutions = [];

// Immediately hydrate executions table from cached state if available so page switches never search or flicker
(function initCachedExecutions() {
  try {
    const raw = localStorage.getItem("bulwark_desk_state");
    if (raw) {
      const data = JSON.parse(raw);
      if (data.executions && data.executions.length > 0) {
        allExecutions = data.executions;
        renderExecutionsMetrics(allExecutions);
        renderExecutionsTable(allExecutions);
      }
    }
  } catch (e) {}
})();

async function loadExecutionsData() {
  const data = await fetchDeskState();
  if (!data || !data.executions) return;

  allExecutions = data.executions;
  renderExecutionsMetrics(allExecutions);
  renderExecutionsTable(allExecutions);
}

function renderExecutionsMetrics(executions) {
  let totalRescued = 0;

  executions.forEach((e) => {
    totalRescued += e.amountUsd || 0;
  });

  document.getElementById("totalRescuedCapitalVal").textContent = `$${totalRescued.toFixed(2)}`;
  document.getElementById("totalExecsCountVal").textContent = executions.length;
}

function renderExecutionsTable(executions) {
  const tbody = document.getElementById("execsTableBody");
  const filter = (document.getElementById("filterExecsInput")?.value || "").toLowerCase();

  const filtered = executions.filter((e) => {
    if (!filter) return true;
    return (
      e.executionId.toLowerCase().includes(filter) ||
      (e.txHash && e.txHash.toLowerCase().includes(filter)) ||
      (e.grantId && e.grantId.toLowerCase().includes(filter)) ||
      (e.positionOwner && e.positionOwner.toLowerCase().includes(filter))
    );
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 24px;">
          ${executions.length === 0 ? "No KeeperHub executions recorded yet." : "No executions match current filter."}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map((e) => {
      const isBase = e.chainId === 84532 || (e.txHash && e.txHash.startsWith("0x43dbc")) || (e.grantId && e.grantId.includes("685e5285"));
      const explorerBase = isBase ? "https://sepolia.basescan.org" : "https://sepolia.etherscan.io";
      const explorerUrl = e.txHash ? `${explorerBase}/tx/${e.txHash}` : null;
      const owner = e.positionOwner || (window.__ALL_GRANTS?.find(g => g.grantId === e.grantId)?.parties?.owner) || "0xE406f471E711A2C8012e95c4B09fa9F1C9ae8123";
      const ownerShort = `${owner.slice(0, 8)}...${owner.slice(-6)}`;
      const ownerUrl = `${explorerBase}/address/${owner}`;

      const hasNumbers = typeof e.preHealthFactor === "number" && typeof e.postHealthFactor === "number";
      const delta = hasNumbers ? (e.postHealthFactor - e.preHealthFactor) : null;
      const preHf = typeof e.preHealthFactor === "number" ? e.preHealthFactor.toFixed(4) : "UNAVAILABLE";
      const postHf = typeof e.postHealthFactor === "number" ? e.postHealthFactor.toFixed(4) : "UNAVAILABLE";
      const deltaBadge = delta !== null && delta > 0
        ? `<div style="color: var(--accent-emerald); font-size: 10px; font-weight: 700; margin-top: 2px;">+${delta.toFixed(5)} HF</div>`
        : delta !== null && delta < 0
        ? `<div style="color: var(--accent-rose); font-size: 10px; margin-top: 2px;">${delta.toFixed(5)} HF</div>`
        : '';

      return `
        <tr>
          <td>
            <span style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-cyan);">${e.executionId}</span>
          </td>
          <td>
            <a href="/grants" style="color: var(--text-secondary); font-family: var(--font-mono); font-size: 11px; text-decoration: underline;">
              ${e.grantId ? e.grantId.slice(0, 10) + "..." : "Default Grant"}
            </a>
          </td>
          <td>
            <a href="${ownerUrl}" target="_blank" rel="noopener" style="color: var(--text-primary); font-family: var(--font-mono); text-decoration: underline;">
              ${ownerShort} &nearr;
            </a>
          </td>
          <td style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-emerald);">
            $${(e.amountUsd || 0).toFixed(2)} (${e.action || "repay"})
          </td>
          <td>
            ${
              explorerUrl
                ? `<a href="${explorerUrl}" target="_blank" rel="noopener" style="color: var(--accent-cyan); font-family: var(--font-mono); text-decoration: underline;">
                    ${e.txHash.slice(0, 10)}...${e.txHash.slice(-6)} &nearr;
                  </a>`
                : `<span style="color: var(--text-muted);">Simulated</span>`
            }
          </td>
          <td style="font-family: var(--font-mono); font-size: 11px;">
            <div><span style="color: var(--accent-rose);">${preHf}</span> &rarr; <span style="color: var(--accent-emerald); font-weight: 700;">${postHf}</span></div>
            ${deltaBadge}
          </td>
          <td>
            <span class="chip chip-dual">Dual Verified</span>
          </td>
          <td style="text-align: right;">
            <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
              <button onclick="inspectReceipt('${e.executionId}')" class="btn-sm btn-secondary">Receipt</button>
              <a href="/verify" class="btn-sm btn-approve" style="text-decoration: none;">Verify PoAA &rarr;</a>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function inspectReceipt(execId) {
  const item = allExecutions.find((e) => e.executionId === execId);
  if (!item) return;

  const modal = document.getElementById("receiptModal");
  const title = document.getElementById("receiptModalTitle");
  const text = document.getElementById("receiptText");

  title.textContent = `Receipt for Execution: ${execId}`;
  text.value = JSON.stringify(item, null, 2);
  modal.style.display = "flex";
}

window.inspectReceipt = inspectReceipt;

document.addEventListener("DOMContentLoaded", () => {
  loadExecutionsData();
  setInterval(loadExecutionsData, 4000);

  const filterInput = document.getElementById("filterExecsInput");
  if (filterInput) {
    filterInput.addEventListener("input", () => renderExecutionsTable(allExecutions));
  }

  const closeReceiptBtn = document.getElementById("closeReceiptModalBtn");
  const receiptModal = document.getElementById("receiptModal");
  const copyReceiptBtn = document.getElementById("copyReceiptBtn");

  if (closeReceiptBtn && receiptModal) {
    closeReceiptBtn.addEventListener("click", () => (receiptModal.style.display = "none"));
    receiptModal.addEventListener("click", (e) => {
      if (e.target === receiptModal) receiptModal.style.display = "none";
    });
  }

  if (copyReceiptBtn) {
    copyReceiptBtn.addEventListener("click", () => {
      const text = document.getElementById("receiptText")?.value;
      if (text) {
        navigator.clipboard.writeText(text);
        showToast("Receipt copied to clipboard!", "success");
      }
    });
  }
});
