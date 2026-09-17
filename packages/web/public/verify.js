/**
 * Public PoAA Verifier Frontend
 */

const verifyBtn = document.getElementById("verifyBtn");
const bundleText = document.getElementById("bundleText");
const fileInput = document.getElementById("fileInput");
const verdictBanner = document.getElementById("verdictBanner");
const checksList = document.getElementById("checksList");
const checksContainer = document.getElementById("checksContainer");

const loadLiveProofBtn = document.getElementById("loadLiveProofBtn");

if (loadLiveProofBtn) {
  loadLiveProofBtn.addEventListener("click", async () => {
    try {
      loadLiveProofBtn.disabled = true;
      loadLiveProofBtn.textContent = "Loading Proof...";
      const res = await fetch("/api/proof/bundle/latest");
      if (!res.ok) throw new Error("Could not load latest proof bundle");
      const bundle = await res.json();
      bundleText.value = JSON.stringify(bundle, null, 2);
      const fileNameDisplay = document.getElementById("fileNameDisplay");
      if (fileNameDisplay) fileNameDisplay.textContent = "live_onchain_proof.json";
      verifyBtn.click();
    } catch (err) {
      alert("Error loading proof: " + err.message);
    } finally {
      loadLiveProofBtn.disabled = false;
      loadLiveProofBtn.textContent = "Load Live On-Chain Rescue Proof";
    }
  });
}

if (fileInput) {
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fileNameDisplay = document.getElementById("fileNameDisplay");
    if (fileNameDisplay) fileNameDisplay.textContent = file.name;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (bundleText) bundleText.value = event.target.result;
    };
    reader.readAsText(file);
  });
}

if (verifyBtn && bundleText) {
  verifyBtn.addEventListener("click", async () => {
  const rawText = bundleText.value.trim();
  if (!rawText) {
    alert("Please paste a PoAA JSON bundle or select a file.");
    return;
  }

  let bundle;
  try {
    bundle = JSON.parse(rawText);
  } catch (err) {
    alert("Invalid JSON format: " + err.message);
    return;
  }

  try {
    verifyBtn.disabled = true;
    verifyBtn.textContent = "Verifying 11-Check Chain...";

    const res = await fetch("/api/proof/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundle }),
    });

    if (!res.ok) {
      const errJson = await res.json();
      throw new Error(errJson.error || "Verification request failed");
    }

    const report = await res.json();
    renderReport(report);
  } catch (err) {
    alert("Verification failed: " + err.message);
  } finally {
    verifyBtn.disabled = false;
    verifyBtn.textContent = "Verify 11/11 Checks";
  }
  });
}

function renderReport(report) {
  verdictBanner.style.display = "block";
  checksList.style.display = "block";

  const isProven = report.verdict === "PROVEN";
  verdictBanner.className = `verdict-banner ${isProven ? "verdict-proven" : "verdict-broken"}`;
  verdictBanner.textContent = isProven
    ? `VERDICT: PROVEN (11/11 Invariant Checks Verified)`
    : `VERDICT: ${report.verdict}`;

  const verdictChip = document.getElementById("verdictChip");
  if (verdictChip) {
    verdictChip.textContent = isProven ? "11/11 PROVEN" : report.verdict;
    verdictChip.className = `chip ${isProven ? "chip-policy" : "chip-critical"}`;
  }

  const statScoreVal = document.getElementById("statScoreVal");
  if (statScoreVal) {
    const passedCount = report.checks ? report.checks.filter(c => c.passed).length : 0;
    statScoreVal.textContent = `${passedCount} / 11`;
  }

  checksContainer.innerHTML = report.checks.map((c) => {
    const provClass = getProvenanceClass(c.provenance);
    return `
      <div class="check-item">
        <div style="display: flex; flex-direction: column; gap: 4px; max-width: 75%;">
          <div style="font-weight: 700; font-size: 13px;">
            Check #${c.checkNumber}: ${c.name}
          </div>
          <div style="color: var(--text-secondary); font-size: 11px; font-family: var(--font-mono); word-break: break-all;">
            Evidence: ${c.evidence}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="chip ${provClass}">${c.provenance}</span>
          <span class="${c.passed ? "check-pass" : "check-fail"}" style="font-size: 14px;">
            ${c.passed ? "PASS" : "FAIL"}
          </span>
        </div>
      </div>
    `;
  }).join("");
}

function getProvenanceClass(prov) {
  switch (prov) {
    case "KEEPERHUB FACT": return "chip-keeperhub";
    case "CHAIN FACT": return "chip-chain";
    case "APPLICATION STATE": return "chip-policy";
    case "AGENT OUTPUT": return "chip-agent";
    case "BOOKKEEPING": return "chip-compiler";
    default: return "chip-compiler";
  }
}

// Automatically load live proof on page load so the page is immediately populated and verified
window.addEventListener("DOMContentLoaded", () => {
  if (loadLiveProofBtn && (!bundleText.value || bundleText.value.trim() === "")) {
    loadLiveProofBtn.click();
  }
});
