/**
 * BULWARK Append-Only Audit Trail Client
 */

let allAuditLogs = [];
let activeCategoryFilter = "all";

// Immediately hydrate audit logs from cached state if available so page switches never search or flicker
(function initCachedAudit() {
  try {
    const raw = localStorage.getItem("bulwark_desk_state");
    if (raw) {
      const data = JSON.parse(raw);
      if (data.audit && data.audit.length > 0) {
        allAuditLogs = data.audit;
        renderAuditMetrics(allAuditLogs);
        renderAuditTimeline(allAuditLogs);
      }
    }
  } catch (e) {}
})();

async function loadAuditData() {
  const data = await fetchDeskState();
  if (!data || !data.audit) return;

  allAuditLogs = data.audit;
  renderAuditMetrics(allAuditLogs);
  renderAuditTimeline(allAuditLogs);
}

function renderAuditMetrics(logs) {
  let chainCount = 0;
  let policyCount = 0;
  let keeperhubCount = 0;

  logs.forEach((log) => {
    const type = (log.type || "").toUpperCase();
    const action = (log.action || "").toUpperCase();
    if (type.includes("CHAIN") || action.includes("SCAN")) chainCount++;
    else if (type.includes("POLICY") || action.includes("GRANT") || action.includes("APPROVE")) policyCount++;
    else if (type.includes("KEEPERHUB") || action.includes("EXECUTE") || action.includes("DISPATCH")) keeperhubCount++;
  });

  document.getElementById("totalAuditVal").textContent = logs.length;
  document.getElementById("scanEventsVal").textContent = chainCount;
  document.getElementById("policyEventsVal").textContent = policyCount;
  document.getElementById("keeperhubEventsVal").textContent = keeperhubCount;
}

function renderAuditTimeline(logs) {
  const container = document.getElementById("auditTimelineContainer");
  const filterText = (document.getElementById("filterAuditInput")?.value || "").toLowerCase();

  const filtered = logs.filter((entry) => {
    const str = JSON.stringify(entry).toLowerCase();
    const matchesText = !filterText || str.includes(filterText);

    if (!matchesText) return false;
    if (activeCategoryFilter === "all") return true;

    const action = (entry.action || "").toLowerCase();
    const provenance = (entry.provenance || entry.type || "").toLowerCase();

    if (activeCategoryFilter === "chain") {
      return provenance.includes("chain") || action.includes("scan");
    }
    if (activeCategoryFilter === "policy") {
      return provenance.includes("policy") || action.includes("grant") || action.includes("approve") || action.includes("revoke");
    }
    if (activeCategoryFilter === "keeperhub") {
      return provenance.includes("keeperhub") || action.includes("execute") || action.includes("settle");
    }
    if (activeCategoryFilter === "compiler") {
      return provenance.includes("compiler") || action.includes("workflow") || action.includes("poaa");
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 24px; color: var(--text-muted);">
        ${logs.length === 0 ? "No audit logs recorded." : "No audit entries match filter."}
      </div>
    `;
    return;
  }

  // Render in reverse chronological order
  container.innerHTML = [...filtered]
    .reverse()
    .map((log, idx) => {
      const actualIdx = filtered.length - idx;
      const seqStr = `#${String(actualIdx).padStart(4, "0")}`;
      const action = log.action || log.event || "SYSTEM_EVENT";
      const ts = log.timestamp ? new Date(log.timestamp).toISOString() : new Date().toISOString();

      let chipClass = "chip-compiler";
      let chipLabel = "Compiler";

      const actUpper = action.toUpperCase();
      if (actUpper.includes("SCAN") || actUpper.includes("CHAIN")) {
        chipClass = "chip-chain";
        chipLabel = "On-Chain";
      } else if (actUpper.includes("GRANT") || actUpper.includes("POLICY") || actUpper.includes("APPROVE")) {
        chipClass = "chip-policy";
        chipLabel = "Policy";
      } else if (actUpper.includes("EXECUTE") || actUpper.includes("KEEPERHUB") || actUpper.includes("DISPATCH")) {
        chipClass = "chip-keeperhub";
        chipLabel = "KeeperHub";
      }

      const entity = log.grantId || log.userAddress || log.executionId || "System Core";
      const logJson = JSON.stringify(log, null, 2);

      return `
        <div class="card" style="padding: 14px 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-cyan);">${seqStr}</span>
              <span class="chip ${chipClass}">${chipLabel}</span>
              <strong style="font-size: 13px; color: var(--text-primary);">${action}</strong>
            </div>
            <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">${ts}</span>
          </div>

          ${log.details?.quote?.agentNarrative ? `
            <div style="margin-top: 8px; margin-bottom: 8px; font-size: 11px; color: #38bdf8; background: rgba(56, 189, 248, 0.08); padding: 8px 10px; border-radius: 4px; border-left: 3px solid #38bdf8; line-height: 1.4;">
              <strong style="display: block; margin-bottom: 2px;">Gemini 3.5 AI Underwriter (${log.details.quote.selectionMode || 'AGENT_SELECT'}):</strong>
              ${log.details.quote.agentNarrative.replace('[AGENT OUTPUT] ', '')}
            </div>
          ` : ""}

          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text-secondary);">
            <span>Subject: <strong style="font-family: var(--font-mono); color: var(--text-primary);">${entity}</strong></span>
            <button onclick="toggleAuditPayload('payload-${actualIdx}')" class="btn-sm btn-secondary" style="font-size: 10px;">
              View Payload &darr;
            </button>
          </div>

          <div id="payload-${actualIdx}" style="display: none; margin-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.06); padding-top: 8px;">
            <pre style="background: #090d16; padding: 10px; border-radius: 4px; font-family: var(--font-mono); font-size: 11px; color: #a5f3fc; overflow-x: auto; max-height: 200px;">${logJson}</pre>
          </div>
        </div>
      `;
    })
    .join("");
}

function toggleAuditPayload(elemId) {
  const el = document.getElementById(elemId);
  if (!el) return;
  el.style.display = el.style.display === "none" ? "block" : "none";
}

document.addEventListener("DOMContentLoaded", () => {
  loadAuditData();
  setInterval(loadAuditData, 4000);

  // Category Filter Tabs
  document.querySelectorAll(".filter-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".filter-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeCategoryFilter = tab.getAttribute("data-category");
      renderAuditTimeline(allAuditLogs);
    });
  });

  // Search Filter
  const filterInput = document.getElementById("filterAuditInput");
  if (filterInput) {
    filterInput.addEventListener("input", () => renderAuditTimeline(allAuditLogs));
  }
});
