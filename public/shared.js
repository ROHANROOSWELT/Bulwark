/**
 * BULWARK Multi-Page Shared Utilities & Web3 Client
 * Manages global header, navigation state, desk KPIs, toasts, and Web3 wallet connections.
 */

// ── EIP-6963 Multi-Provider Discovery Map ───────────────────────────────────
const eip6963Providers = new Map();

if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (event) => {
    if (event.detail && event.detail.info && event.detail.provider) {
      eip6963Providers.set(event.detail.info.rdns, event.detail);
      if (typeof detectInstalledWallets === "function") {
        detectInstalledWallets();
      }
    }
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

// ── Web3 Wallet State & Metadata ──────────────────────────────────────────
const WALLET_METADATA = {
  metamask: {
    name: "MetaMask",
    avatar: "MM",
    downloadUrl: "https://metamask.io/download/",
    check: () => {
      if (typeof window === "undefined") return false;
      if (eip6963Providers.has("io.metamask")) return true;
      if (!window.ethereum) return false;
      if (window.ethereum.providers) {
        return window.ethereum.providers.some((p) => p.isMetaMask && !p.isOKExWallet && !p.isRabby);
      }
      return !!window.ethereum.isMetaMask && !window.ethereum.isOKExWallet && !window.ethereum.isRabby;
    },
    getProvider: () => {
      if (typeof window === "undefined") return null;
      if (eip6963Providers.has("io.metamask")) {
        return eip6963Providers.get("io.metamask").provider;
      }
      if (!window.ethereum) return null;
      if (window.ethereum.providers) {
        return window.ethereum.providers.find((p) => p.isMetaMask && !p.isOKExWallet && !p.isRabby) || null;
      }
      return (window.ethereum.isMetaMask && !window.ethereum.isOKExWallet && !window.ethereum.isRabby) ? window.ethereum : null;
    },
  },
  okx: {
    name: "OKX Wallet",
    avatar: "OKX",
    downloadUrl: "https://www.okx.com/web3",
    check: () => {
      if (typeof window === "undefined") return false;
      if (eip6963Providers.has("com.okex.wallet")) return true;
      if (window.okxwallet) return true;
      if (window.ethereum?.isOKExWallet) return true;
      if (window.ethereum?.providers) {
        return window.ethereum.providers.some((p) => p.isOKExWallet);
      }
      return false;
    },
    getProvider: () => {
      if (typeof window === "undefined") return null;
      if (eip6963Providers.has("com.okex.wallet")) {
        return eip6963Providers.get("com.okex.wallet").provider;
      }
      if (window.okxwallet) return window.okxwallet;
      if (window.ethereum?.providers) {
        return window.ethereum.providers.find((p) => p.isOKExWallet) || null;
      }
      return window.ethereum?.isOKExWallet ? window.ethereum : null;
    },
  },
  coinbase: {
    name: "Coinbase Wallet",
    avatar: "CB",
    downloadUrl: "https://www.coinbase.com/wallet",
    check: () => {
      if (typeof window === "undefined") return false;
      if (eip6963Providers.has("com.coinbase.wallet")) return true;
      if (window.coinbaseWalletExtension) return true;
      if (window.ethereum?.isCoinbaseWallet) return true;
      if (window.ethereum?.providers) {
        return window.ethereum.providers.some((p) => p.isCoinbaseWallet);
      }
      return false;
    },
    getProvider: () => {
      if (typeof window === "undefined") return null;
      if (eip6963Providers.has("com.coinbase.wallet")) {
        return eip6963Providers.get("com.coinbase.wallet").provider;
      }
      if (window.coinbaseWalletExtension) return window.coinbaseWalletExtension;
      if (window.ethereum?.providers) {
        return window.ethereum.providers.find((p) => p.isCoinbaseWallet) || null;
      }
      return window.ethereum?.isCoinbaseWallet ? window.ethereum : null;
    },
  },
  rabby: {
    name: "Rabby Wallet",
    avatar: "RB",
    downloadUrl: "https://rabby.io/",
    check: () => {
      if (typeof window === "undefined") return false;
      if (eip6963Providers.has("io.rabby")) return true;
      if (window.rabby) return true;
      if (window.ethereum?.isRabby) return true;
      if (window.ethereum?.providers) {
        return window.ethereum.providers.some((p) => p.isRabby);
      }
      return false;
    },
    getProvider: () => {
      if (typeof window === "undefined") return null;
      if (eip6963Providers.has("io.rabby")) {
        return eip6963Providers.get("io.rabby").provider;
      }
      if (window.rabby) return window.rabby;
      if (window.ethereum?.providers) {
        return window.ethereum.providers.find((p) => p.isRabby) || null;
      }
      return window.ethereum?.isRabby ? window.ethereum : null;
    },
  },
  injected: {
    name: "Browser Injected",
    avatar: "W3",
    check: () => typeof window !== "undefined" && !!window.ethereum,
    getProvider: () => (typeof window !== "undefined" ? window.ethereum || null : null),
  },
};

let connectedWallet = {
  type: null,
  address: null,
  chainId: null,
  provider: null,
  balanceEth: null,
};

// ── BULWARK Dual-Access Authentication & Security Gateway ─────────────────────
window.bulwarkAuth = {
  authenticated: false,
  mode: null, // "wallet" | "private_key"
  address: null,
};

function initBulwarkAuth() {
  // Proactively purge any legacy stored private key from browser localStorage
  try {
    localStorage.removeItem("bulwark_auth_key");
  } catch (e) {}

  const savedMode = localStorage.getItem("bulwark_auth_mode");
  const savedAddress = localStorage.getItem("bulwark_auth_address");

  if (savedMode === "private_key" && savedAddress) {
    window.bulwarkAuth = {
      authenticated: true,
      mode: "private_key",
      address: savedAddress,
    };
  } else if (savedMode === "wallet" && savedAddress) {
    window.bulwarkAuth = {
      authenticated: true,
      mode: "wallet",
      address: savedAddress,
    };
  } else {
    window.bulwarkAuth = {
      authenticated: false,
      mode: null,
      address: null,
    };
  }
  applyAuthStateUI();
}

function applyAuthStateUI() {
  const isAuthed = !!(window.bulwarkAuth && window.bulwarkAuth.authenticated);
  const mode = window.bulwarkAuth?.mode;
  const address = window.bulwarkAuth?.address;
  const shortAddr = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";

  // 1. Body class: Dim and disable UI if not authenticated
  if (isAuthed) {
    document.body.classList.remove("bulwark-locked");
  } else {
    document.body.classList.add("bulwark-locked");
  }

  // 2. Banner management
  let banner = document.getElementById("lockedGatewayBanner");
  if (!isAuthed) {
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "lockedGatewayBanner";
      banner.className = "locked-gateway-banner";
      banner.innerHTML = `
        <div class="locked-gateway-content">
          <div class="locked-gateway-info">
            <div class="locked-gateway-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <div>
              <div class="locked-gateway-title">BULWARK Application Locked &bull; Authentication Required</div>
              <div class="locked-gateway-desc">Connect your Web3 wallet for interactive self-custody or supply a 24/7 autonomous guardian key to unlock backstop operations and agent execution.</div>
            </div>
          </div>
          <div style="display:flex; gap:10px; align-items:center;">
            <button class="btn-primary" id="bannerUnlockBtn" type="button" style="padding: 9px 20px; font-weight:700; cursor:pointer;">
              Unlock BULWARK &rarr;
            </button>
          </div>
        </div>
      `;
      const header = document.querySelector("header.app-header");
      if (header && header.nextSibling) {
        header.parentNode.insertBefore(banner, header.nextSibling);
      } else {
        document.body.prepend(banner);
      }
      const unlockBtn = banner.querySelector("#bannerUnlockBtn");
      if (unlockBtn) {
        unlockBtn.addEventListener("click", () => openAccessGatewayModal());
      }
    } else {
      banner.style.display = "block";
    }
  } else if (banner) {
    banner.style.display = "none";
  }

  // 3. Key Chip in Header
  const keyChip = document.getElementById("keyChip");
  if (keyChip) {
    if (!isAuthed) {
      keyChip.className = "chip chip-unavailable";
      keyChip.textContent = "INACTIVE • AUTH REQUIRED";
      keyChip.title = "Application locked. Click logo or Connect Wallet to authenticate.";
    } else if (mode === "wallet") {
      keyChip.className = "chip chip-keeperhub";
      keyChip.textContent = `WALLET: ${shortAddr}`;
      keyChip.title = `Connected Web3 Wallet: ${address} (Interactive Mode - signs per tx)`;
    } else if (mode === "private_key") {
      keyChip.className = "chip chip-keeperhub";
      keyChip.textContent = `24/7 GUARDIAN: ${shortAddr}`;
      keyChip.title = `24/7 Autonomous Guardian Active: ${address} (Zero manual signatures required)`;
    }
  }

  // 4. Update Header Connect Wallet Button
  const btn = document.getElementById("connectWalletBtn");
  const label = document.getElementById("walletBtnLabel");
  const icon = document.getElementById("walletBtnIcon");
  if (btn) {
    if (isAuthed) {
      btn.className = "btn-wallet connected";
      if (label) label.textContent = shortAddr;
      if (icon) {
        icon.textContent = mode === "private_key" ? "⚡" : (WALLET_METADATA[connectedWallet?.type]?.avatar || "👛");
      }
    } else {
      btn.className = "btn-wallet";
      if (label) label.textContent = "Connect Wallet";
      if (icon) {
        icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="4"></rect><path d="M16 12h.01"></path><path d="M2 10h20"></path></svg>`;
      }
    }
  }

  // 5. Dispatch event for page listeners
  window.dispatchEvent(new CustomEvent("bulwarkAuthChanged", { detail: window.bulwarkAuth }));
}
window.initBulwarkAuth = initBulwarkAuth;
window.applyAuthStateUI = applyAuthStateUI;

function getWalletProvider(type) {
  const meta = WALLET_METADATA[type];
  if (!meta) return null;
  return meta.getProvider ? meta.getProvider() : null;
}

function detectInstalledWallets() {
  for (const [key, meta] of Object.entries(WALLET_METADATA)) {
    const badge = document.getElementById(`badge-${key}`);
    if (!badge) continue;

    if (meta.check && meta.check()) {
      badge.textContent = "Detected";
      badge.className = "wallet-badge detected";
    } else {
      badge.textContent = key === "injected" ? "Available" : "Not Installed";
      badge.className = "wallet-badge";
    }
  }
}

async function connectWallet(type) {
  showWalletError(null);
  const meta = WALLET_METADATA[type];
  if (!meta) return;

  const provider = getWalletProvider(type);
  if (!provider) {
    if (meta.downloadUrl) {
      showWalletError(`${meta.name} extension not detected. <a href="${meta.downloadUrl}" target="_blank" rel="noopener" style="color:var(--accent); font-weight:700; text-decoration:underline;">Click here to install ${meta.name} &rarr;</a>`);
    } else {
      showWalletError("No EIP-1193 compatible Web3 provider found in this browser.");
    }
    return;
  }

  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    if (!accounts || accounts.length === 0) {
      showWalletError("No Ethereum account authorized. Please unlock your wallet and approve the connection request.");
      return;
    }

    const chainIdHex = await provider.request({ method: "eth_chainId" });
    const chainId = parseInt(chainIdHex, 16);

    let balanceEth = null;
    try {
      const balanceHex = await provider.request({ method: "eth_getBalance", params: [accounts[0], "latest"] });
      balanceEth = (parseInt(balanceHex, 16) / 1e18).toFixed(4);
    } catch {}

    connectedWallet = {
      type,
      address: accounts[0],
      chainId,
      provider,
      balanceEth,
    };

    localStorage.setItem("bulwark_wallet_type", type);
    localStorage.setItem("bulwark_auth_mode", "wallet");
    localStorage.setItem("bulwark_auth_address", accounts[0]);
    localStorage.removeItem("bulwark_auth_key");

    window.bulwarkAuth = {
      authenticated: true,
      mode: "wallet",
      address: accounts[0],
    };

    listenToProviderEvents(provider);
    updateWalletUI();
    applyAuthStateUI();
    showToast(`Connected ${meta.name} (${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)})`, "success");
    const modal = document.getElementById("walletModal");
    if (modal) {
      setTimeout(() => { modal.style.display = "none"; }, 350);
    }
  } catch (err) {
    console.error("Wallet connection failed:", err);
    if (err.code === 4001) {
      showWalletError("Connection rejected by user in wallet prompt.");
    } else {
      showWalletError(err.message || "Failed to connect to wallet.");
    }
  }
}

async function switchToActiveNetwork() {
  if (!connectedWallet.provider) return;
  const targetChain = window.BULWARK_ACTIVE_CHAIN_ID === 11155111 ? 11155111 : 84532;
  const hexChainId = targetChain === 11155111 ? "0xaa36a7" : "0x14a34";
  try {
    await connectedWallet.provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexChainId }],
    });
  } catch (switchError) {
    if (switchError.code === 4902) {
      try {
        if (targetChain === 84532) {
          await connectedWallet.provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0x14a34",
                chainName: "Base Sepolia",
                nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
                rpcUrls: ["https://sepolia.base.org"],
                blockExplorerUrls: ["https://sepolia.basescan.org"],
              },
            ],
          });
        } else {
          await connectedWallet.provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0xaa36a7",
                chainName: "Ethereum Sepolia",
                nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
                rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
                blockExplorerUrls: ["https://sepolia.etherscan.io"],
              },
            ],
          });
        }
      } catch (addError) {
        showWalletError("Failed to add network to wallet.");
      }
    } else {
      showWalletError(switchError.message || "Failed to switch network.");
    }
  }
}

function disconnectAuth() {
  localStorage.removeItem("bulwark_auth_mode");
  localStorage.removeItem("bulwark_auth_address");
  localStorage.removeItem("bulwark_auth_key");
  localStorage.removeItem("bulwark_wallet_type");

  window.bulwarkAuth = {
    authenticated: false,
    mode: null,
    address: null,
  };

  connectedWallet = {
    type: null,
    address: null,
    chainId: null,
    provider: null,
  };

  updateWalletUI();
  applyAuthStateUI();

  const modal = document.getElementById("walletModal");
  if (modal && modal.style.display === "flex") {
    switchGatewayTab("wallet");
  }

  showToast("Disconnected. Authentication required to access BULWARK.", "info");
}
window.disconnectAuth = disconnectAuth;

function disconnectWallet() {
  disconnectAuth();
}

function updateWalletUI() {
  const btn = document.getElementById("connectWalletBtn");
  const label = document.getElementById("walletBtnLabel");
  const icon = document.getElementById("walletBtnIcon");

  const connectedSection = document.getElementById("walletConnectedSection");
  const avatarEl = document.getElementById("walletAvatar");
  const nameEl = document.getElementById("connectedWalletName");
  const chainTagEl = document.getElementById("connectedChainTag");
  const addressEl = document.getElementById("connectedAddressFull");
  const switchBtn = document.getElementById("switchNetworkBtn");

  if (!btn) return;

  if (connectedWallet.address) {
    const meta = WALLET_METADATA[connectedWallet.type] || WALLET_METADATA.injected;
    const shortAddr = `${connectedWallet.address.slice(0, 6)}...${connectedWallet.address.slice(-4)}`;

    btn.className = "btn-wallet connected";
    if (label) label.textContent = shortAddr;
    if (icon) icon.textContent = meta.avatar;

    if (connectedSection) {
      connectedSection.style.display = "flex";
      if (avatarEl) avatarEl.textContent = meta.avatar;
      if (nameEl) nameEl.textContent = meta.name;
      if (addressEl) addressEl.textContent = connectedWallet.address;

      const activeChain = window.BULWARK_ACTIVE_CHAIN_ID || 84532;
      const isBaseSepolia = connectedWallet.chainId === 84532;
      const isEthSepolia = connectedWallet.chainId === 11155111;
      const isSupported = isBaseSepolia || isEthSepolia;

      if (chainTagEl) {
        if (isBaseSepolia) {
          chainTagEl.className = "chip chip-chain";
          chainTagEl.textContent = "Base Sepolia 84532";
        } else if (isEthSepolia) {
          chainTagEl.className = "chip chip-chain";
          chainTagEl.textContent = "Sepolia 11155111";
        } else {
          chainTagEl.className = "chip chip-unavailable";
          chainTagEl.textContent = `Chain ${connectedWallet.chainId || "Unknown"} (Unsupported Network)`;
        }
      }
      if (switchBtn) switchBtn.style.display = isSupported ? "none" : "block";
    }

    document.querySelectorAll(".wallet-option").forEach((opt) => {
      if (opt.getAttribute("data-wallet") === connectedWallet.type) {
        opt.classList.add("active");
        const b = opt.querySelector(".wallet-badge");
        if (b) {
          b.textContent = "Connected";
          b.className = "wallet-badge active";
        }
      } else {
        opt.classList.remove("active");
      }
    });
  } else {
    btn.className = "btn-wallet";
    if (label) label.textContent = "Connect Wallet";
    if (icon) {
      icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="4"></rect><path d="M16 12h.01"></path><path d="M2 10h20"></path></svg>`;
    }

    if (connectedSection) connectedSection.style.display = "none";
    document.querySelectorAll(".wallet-option").forEach((opt) => {
      opt.classList.remove("active");
    });
    detectInstalledWallets();
  }
}

function showWalletError(msg) {
  const errEl = document.getElementById("walletErrorMsg");
  if (!errEl) return;
  if (msg) {
    errEl.innerHTML = msg;
    errEl.style.display = "block";
  } else {
    errEl.textContent = "";
    errEl.style.display = "none";
  }
}

function listenToProviderEvents(provider) {
  if (!provider || !provider.on) return;

  provider.on("accountsChanged", (accounts) => {
    if (!accounts || accounts.length === 0) {
      disconnectAuth();
    } else {
      connectedWallet.address = accounts[0];
      window.bulwarkAuth = {
        authenticated: true,
        mode: "wallet",
        address: accounts[0],
      };
      localStorage.setItem("bulwark_auth_address", accounts[0]);
      updateWalletUI();
      applyAuthStateUI();
      // Notify page listeners
      window.dispatchEvent(new CustomEvent("walletAccountChanged", { detail: { address: accounts[0] } }));
    }
  });

  provider.on("chainChanged", (chainIdHex) => {
    connectedWallet.chainId = parseInt(chainIdHex, 16);
    updateWalletUI();
    window.dispatchEvent(new CustomEvent("walletChainChanged", { detail: { chainId: connectedWallet.chainId } }));
  });
}

async function autoReconnectWallet() {
  const savedMode = localStorage.getItem("bulwark_auth_mode");
  if (savedMode === "private_key") {
    initBulwarkAuth();
    return;
  }
  const savedType = localStorage.getItem("bulwark_wallet_type");
  if (!savedType) return;

  const provider = getWalletProvider(savedType);
  if (!provider) return;

  try {
    const accounts = await provider.request({ method: "eth_accounts" });
    if (accounts && accounts.length > 0) {
      const chainIdHex = await provider.request({ method: "eth_chainId" });
      connectedWallet = {
        type: savedType,
        address: accounts[0],
        chainId: parseInt(chainIdHex, 16),
        provider,
      };
      window.bulwarkAuth = {
        authenticated: true,
        mode: "wallet",
        address: accounts[0],
      };
      listenToProviderEvents(provider);
      updateWalletUI();
      applyAuthStateUI();
    }
  } catch (err) {
    console.warn("Silent auto-reconnect failed:", err);
  }
}

// ── Global Toast Notifications ─────────────────────────────────────────────
function showToast(message, type = "info") {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "toast-error" : type === "success" ? "toast-success" : ""}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s ease-out";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ── Desk State & KPIs Helper (Fast Shared Cache Across All Pages) ────────────
function getCachedDeskState() {
  try {
    const raw = localStorage.getItem("bulwark_desk_state");
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}
window.getCachedDeskState = getCachedDeskState;

function initPersistedHeaderAndKpis() {
  try {
    const cachedKey = localStorage.getItem("bulwark_has_key");
    const cachedChain = localStorage.getItem("bulwark_chain_id") || "84532";
    const cachedData = getCachedDeskState();

    const keyChip = document.getElementById("keyChip");
    if (keyChip) {
      if (!window.bulwarkAuth || !window.bulwarkAuth.authenticated) {
        keyChip.className = "chip chip-unavailable";
        keyChip.textContent = "INACTIVE • AUTH REQUIRED";
      } else if (window.bulwarkAuth.mode === "wallet") {
        const shortAddr = `${window.bulwarkAuth.address.slice(0, 6)}...${window.bulwarkAuth.address.slice(-4)}`;
        keyChip.className = "chip chip-keeperhub";
        keyChip.textContent = `WALLET: ${shortAddr}`;
      } else if (window.bulwarkAuth.mode === "private_key") {
        const shortAddr = `${window.bulwarkAuth.address.slice(0, 6)}...${window.bulwarkAuth.address.slice(-4)}`;
        keyChip.className = "chip chip-keeperhub";
        keyChip.textContent = `24/7 GUARDIAN: ${shortAddr}`;
      }
    }

    const chainChip = document.getElementById("chainChip");
    if (chainChip) {
      if (cachedChain === "11155111") {
        chainChip.className = "chip chip-chain";
        chainChip.textContent = "Sepolia 11155111";
      } else {
        chainChip.className = "chip chip-chain";
        chainChip.textContent = "Base Sepolia 84532";
      }
    }

    let backendChip = document.getElementById("backendChip");
    if (!backendChip) {
      backendChip = document.createElement("span");
      backendChip.id = "backendChip";
      const headerStatus = document.querySelector(".header-status");
      if (headerStatus && keyChip) {
        headerStatus.insertBefore(backendChip, keyChip);
      }
    }
    if (backendChip) {
      backendChip.className = "chip chip-policy";
      backendChip.title = "Backend hosted on Microsoft Azure VM (20.244.4.11)";
      backendChip.innerHTML = "Azure: 20.244.4.11";
    }

    if (cachedData) {
      renderDeskKpis(cachedData, false);
    }
  } catch (e) {}
}

// Run immediately to guarantee zero flicker across all page navigations
if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPersistedHeaderAndKpis);
  } else {
    initPersistedHeaderAndKpis();
  }
}

async function fetchDeskState() {
  try {
    const res = await fetch("/api/state");
    if (!res.ok) return getCachedDeskState();
    const data = await res.json();
    renderDeskKpis(data, true);
    return data;
  } catch (err) {
    console.error("Failed to fetch desk state:", err);
    return getCachedDeskState();
  }
}

function renderDeskKpis(data, shouldPersist = true) {
  if (!data) return;

  if (shouldPersist) {
    try {
      localStorage.setItem("bulwark_desk_state", JSON.stringify(data));
      if (typeof data.hasKey === "boolean") {
        localStorage.setItem("bulwark_has_key", data.hasKey ? "true" : "false");
      }
      if (data.chainId) {
        localStorage.setItem("bulwark_chain_id", String(data.chainId));
      }
    } catch (e) {}
  }

  if (data.chainId) {
    window.BULWARK_ACTIVE_CHAIN_ID = data.chainId;
  }

  // Header Chips
  const chainChip = document.getElementById("chainChip");
  if (chainChip && data.chainId) {
    if (data.chainId === 84532) {
      chainChip.className = "chip chip-chain";
      chainChip.textContent = "Base Sepolia 84532";
    } else if (data.chainId === 11155111) {
      chainChip.className = "chip chip-chain";
      chainChip.textContent = "Sepolia 11155111";
    } else {
      chainChip.className = "chip chip-chain";
      chainChip.textContent = `Chain ${data.chainId}`;
    }
  }

  const keyChip = document.getElementById("keyChip");
  if (keyChip) {
    if (!window.bulwarkAuth || !window.bulwarkAuth.authenticated) {
      keyChip.className = "chip chip-unavailable";
      keyChip.textContent = "INACTIVE • AUTH REQUIRED";
    } else if (window.bulwarkAuth.mode === "wallet") {
      const shortAddr = `${window.bulwarkAuth.address.slice(0, 6)}...${window.bulwarkAuth.address.slice(-4)}`;
      keyChip.className = "chip chip-keeperhub";
      keyChip.textContent = `WALLET: ${shortAddr}`;
    } else if (window.bulwarkAuth.mode === "private_key") {
      const shortAddr = `${window.bulwarkAuth.address.slice(0, 6)}...${window.bulwarkAuth.address.slice(-4)}`;
      keyChip.className = "chip chip-keeperhub";
      keyChip.textContent = `24/7 GUARDIAN: ${shortAddr}`;
    }
  }

  // Azure Backend Chip
  let backendChip = document.getElementById("backendChip");
  if (!backendChip) {
    backendChip = document.createElement("span");
    backendChip.id = "backendChip";
    const headerStatus = document.querySelector(".header-status");
    if (headerStatus && keyChip) {
      headerStatus.insertBefore(backendChip, keyChip);
    }
  }
  if (backendChip) {
    backendChip.className = "chip chip-policy";
    backendChip.title = "Backend hosted on Microsoft Azure VM (20.244.4.11)";
    backendChip.innerHTML = "Azure: 20.244.4.11";
  }

  // Desk KPI Top Bar
  if (data.capacity) {
    const balanceEl = document.getElementById("deskBalanceVal");
    const availEl = document.getElementById("availableCapVal");
    const resEl = document.getElementById("reservedCapVal");
    const landingCap = document.getElementById("landingDeskCap");
    if (balanceEl) balanceEl.textContent = `$${(data.capacity.deskBalanceUsd || 0).toFixed(2)}`;
    if (availEl) availEl.textContent = `$${(data.capacity.availableUsd || 0).toFixed(2)}`;
    if (resEl) resEl.textContent = `$${(data.capacity.reservedUsd || 0).toFixed(2)}`;
    if (landingCap) {
      const cap = data.capacity.availableUsd || data.capacity.deskBalanceUsd || 500000;
      landingCap.textContent = `$${cap.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  }
  if (data.reputation) {
    const rescuesEl = document.getElementById("verifiedRescuesVal");
    const capDepEl = document.getElementById("capitalDeployedVal");
    if (rescuesEl) rescuesEl.textContent = data.reputation.totalExecutionsVerified || 0;
    if (capDepEl) capDepEl.textContent = `$${(data.reputation.totalCapitalDeployedUsd || 0).toFixed(2)}`;
  }
}

// ── Active Navigation Highlighter ──────────────────────────────────────────
function highlightActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    const href = tab.getAttribute("href");
    const isOverview = href === "/overview" && (path === "/overview" || path === "/index.html" || path === "/dashboard" || path === "/console");
    if (href === path || isOverview) {
      tab.classList.add("active");
    } else if (href !== "/" && href !== "/overview" && path.startsWith(href)) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });
}

// ── Authenticated / Resilient Fetch Helper ──────────────────────────────────
async function bulwarkFetch(url, options = {}) {
  options.headers = options.headers || {};
  let opKey = localStorage.getItem("bulwark_operator_key") || "bulwark_sec_ops_2026_az";
  if (opKey) {
    if (options.headers instanceof Headers) {
      options.headers.set("x-operator-key", opKey);
    } else {
      options.headers["x-operator-key"] = opKey;
    }
  }
  let res = await fetch(url, options);
  if (res.status === 401 && (options.method === "POST" || options.method === "PUT" || options.method === "DELETE")) {
    const entered = window.prompt("Operator Authorization Required for mutating operation.\nEnter BULWARK Operator Key (stored securely in local session):", opKey);
    if (entered && entered.trim()) {
      localStorage.setItem("bulwark_operator_key", entered.trim());
      if (options.headers instanceof Headers) {
        options.headers.set("x-operator-key", entered.trim());
      } else {
        options.headers["x-operator-key"] = entered.trim();
      }
      res = await fetch(url, options);
    }
  }
  return res;
}
window.bulwarkFetch = bulwarkFetch;

// ── Global Tick Action ──────────────────────────────────────────────────────
async function triggerTick() {
  const btn = document.getElementById("tickBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Scanning...";
  }
  try {
    const res = await bulwarkFetch("/api/tick", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Tick failed");
    }
    const details = [
      `${data.scanned ?? 0} scanned`,
      `${data.proposed ?? 0} proposed`,
      `${data.executed ?? 0} executed`,
    ].join(", ");
    showToast(`Guardian tick complete (${details}).`, "success");
    await fetchDeskState();
  } catch (err) {
    console.error("Tick failed:", err);
    showToast("Guardian scan tick failed.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Trigger Tick";
    }
  }
}

// ── Inject Liquid Background Blobs ─────────────────────────────────────────
function injectLiquidCanvas() {
  if (document.querySelector(".liquid-canvas")) return;
  const canvas = document.createElement("div");
  canvas.className = "liquid-canvas";
  canvas.innerHTML = `
    <div class="blob blob-1"></div>
    <div class="blob blob-2"></div>
    <div class="blob blob-3"></div>
  `;
  document.body.prepend(canvas);
}

// ── BULWARK Access Gateway Modal (Dual-Mode: Web3 Wallet & 24/7 Guardian Key) ─
function ensureGatewayModalStructure(modalBackdrop) {
  if (!modalBackdrop) return;
  const modal = modalBackdrop.querySelector(".wallet-modal");
  if (!modal) return;

  // Title
  const titleH3 = modal.querySelector(".wallet-modal-title h3");
  const titleP = modal.querySelector(".wallet-modal-title p");
  if (titleH3) titleH3.textContent = "BULWARK Access Gateway";
  if (titleP) titleP.textContent = "Select authentication mode to access Autonomous Backstop & Settlement Engine.";

  // Mode Switcher Tabs
  let tabs = modal.querySelector("#gatewayModeTabs");
  if (!tabs) {
    tabs = document.createElement("div");
    tabs.id = "gatewayModeTabs";
    tabs.className = "gateway-mode-tabs";
    tabs.innerHTML = `
      <button class="gateway-tab active" data-mode="wallet" type="button" id="tabModeWallet">
        <span class="gateway-tab-title">Option 1: Connect Web3 Wallet</span>
        <span class="gateway-tab-sub">Interactive Self-Custody &bull; Sign each transaction</span>
      </button>
      <button class="gateway-tab" data-mode="private_key" type="button" id="tabModeKey">
        <span class="gateway-tab-title">Option 2: 24/7 Autonomous Key</span>
        <span class="gateway-tab-sub">Zero-Prompt Guardian &bull; 24/7 autonomous rescues</span>
      </button>
    `;
    const header = modal.querySelector(".wallet-modal-header");
    if (header && header.nextSibling) {
      modal.insertBefore(tabs, header.nextSibling);
    } else {
      modal.prepend(tabs);
    }

    const tabWallet = modal.querySelector("#tabModeWallet");
    const tabKey = modal.querySelector("#tabModeKey");
    if (tabWallet) tabWallet.addEventListener("click", () => switchGatewayTab("wallet"));
    if (tabKey) tabKey.addEventListener("click", () => switchGatewayTab("private_key"));
  }

  // Gateway Wallet Section wrapper
  let walletSection = modal.querySelector("#gatewayWalletSection");
  if (!walletSection) {
    walletSection = document.createElement("div");
    walletSection.id = "gatewayWalletSection";
    const connectedSection = modal.querySelector("#walletConnectedSection");
    const listSection = modal.querySelector("#walletListSection");
    if (connectedSection && listSection) {
      listSection.parentNode.insertBefore(walletSection, connectedSection);
      walletSection.appendChild(connectedSection);
      walletSection.appendChild(listSection);
    }
  }

  // Gateway Key Section
  let keySection = modal.querySelector("#gatewayKeySection");
  if (!keySection) {
    keySection = document.createElement("div");
    keySection.id = "gatewayKeySection";
    keySection.style.display = "none";
    modal.appendChild(keySection);
  }
}

function switchGatewayTab(mode) {
  const modal = document.getElementById("walletModal");
  if (!modal) return;

  const tabWallet = modal.querySelector("#tabModeWallet");
  const tabKey = modal.querySelector("#tabModeKey");
  const walletSection = modal.querySelector("#gatewayWalletSection");
  const keySection = modal.querySelector("#gatewayKeySection");

  if (mode === "wallet") {
    if (tabWallet) tabWallet.classList.add("active");
    if (tabKey) tabKey.classList.remove("active");
    if (walletSection) walletSection.style.display = "block";
    if (keySection) keySection.style.display = "none";
  } else {
    if (tabKey) tabKey.classList.add("active");
    if (tabWallet) tabWallet.classList.remove("active");
    if (walletSection) walletSection.style.display = "none";
    if (keySection) {
      keySection.style.display = "block";
      renderGatewayKeySection(keySection);
    }
  }
}

function renderGatewayKeySection(keySection) {
  const isKeyActive = !!(window.bulwarkAuth && window.bulwarkAuth.authenticated && window.bulwarkAuth.mode === "private_key");
  if (isKeyActive) {
    const address = window.bulwarkAuth.address;
    keySection.innerHTML = `
      <div class="wallet-connected-section" style="display: flex; margin-bottom: 0;">
        <div class="wallet-active-card">
          <div class="wallet-avatar" style="background: linear-gradient(135deg, #10b981, #047857); color: white; font-weight: bold; font-size: 11px;">24/7</div>
          <div class="wallet-details">
            <div class="wallet-name-row">
              <span class="connected-wallet-name">24/7 Autonomous Guardian Active</span>
              <span class="chip chip-chain">Base Sepolia 84532</span>
            </div>
            <span class="connected-address-full" style="font-family: var(--font-mono); font-size: 11px; word-break: break-all;">${address}</span>
            <div style="margin-top: 6px; font-size: 11px; color: var(--accent-emerald, #10b981); font-weight: 600;">
              ✓ Zero-Storage Protected &bull; Private key is NOT stored anywhere &bull; 24/7 background protection active
            </div>
          </div>
        </div>
        <div class="wallet-actions-row">
          <button id="disconnectKeyBtn" class="btn-danger" type="button">Disconnect 24/7 Guardian</button>
        </div>
      </div>
    `;
    const discBtn = keySection.querySelector("#disconnectKeyBtn");
    if (discBtn) {
      discBtn.addEventListener("click", () => {
        disconnectAuth();
      });
    }
  } else {
    keySection.innerHTML = `
      <div class="gateway-key-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <label style="font-size: 12px; font-weight: 700; color: var(--text-primary);" for="gatewayPrivateKeyInput">
            Ethereum Private Key (secp256k1)
          </label>
          <button type="button" id="btnUseDemoKey" class="btn-secondary" style="font-size: 11px; padding: 4px 8px; border-radius: 4px; cursor: pointer;">
            ⚡ Use Demo 24/7 Key (Testnet)
          </button>
        </div>
        <div style="margin-bottom: 10px;">
          <input type="password" id="gatewayPrivateKeyInput" class="gateway-key-input" placeholder="0x... or 64-character hex private key" autocomplete="off" spellcheck="false" />
        </div>
        <div style="font-size: 11px; color: var(--text-muted); line-height: 1.45; margin-bottom: 10px;">
          <strong style="color: var(--text-primary);">24/7 Autonomous Protection:</strong> Authorizes KeeperHub and Gemini 3.5 to formulate, clamp, and execute backstop debt repayments continuously without waiting for browser signatures.
        </div>
        <div style="font-size: 11px; color: #10b981; margin-bottom: 14px; background: rgba(16, 185, 129, 0.09); padding: 10px 14px; border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.25); line-height: 1.5;">
          <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; margin-bottom: 4px; color: #10b981;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
            <span>Guaranteed Zero-Storage Protection</span>
          </div>
          <div style="color: var(--text-secondary); font-size: 11px;">
            Your private key is <strong>100% protected and NEVER stored</strong> anywhere. It is processed exclusively in transient volatile memory to cryptographically derive your public account address and is immediately scrubbed. It is never written to disk, database, localStorage, cookies, or logs.
          </div>
        </div>
        <button type="button" id="btnSubmitPrivateKey" class="btn-primary" style="width: 100%; justify-content: center; padding: 11px 16px; font-weight: 700; cursor: pointer;">
          Authenticate 24/7 Autonomous Key &rarr;
        </button>
        <div id="gatewayKeyError" class="auth-error-msg" style="display: none; color: #dc2626; font-size: 11.5px; font-weight: 600; margin-top: 10px; padding: 8px 12px; background: #fee2e2; border-radius: 6px;"></div>
      </div>
    `;
    const demoBtn = keySection.querySelector("#btnUseDemoKey");
    const input = keySection.querySelector("#gatewayPrivateKeyInput");
    const submitBtn = keySection.querySelector("#btnSubmitPrivateKey");

    if (demoBtn && input) {
      demoBtn.addEventListener("click", () => {
        input.value = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
        submitPrivateKey();
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener("click", submitPrivateKey);
    }
  }
}

async function submitPrivateKey() {
  const input = document.getElementById("gatewayPrivateKeyInput");
  const errEl = document.getElementById("gatewayKeyError");
  const submitBtn = document.getElementById("btnSubmitPrivateKey");
  if (!input) return;

  const key = input.value.trim();
  // Immediately scrub raw key from DOM input element
  input.value = "";

  if (!key) {
    if (errEl) {
      errEl.textContent = "Please enter a valid 32-byte hex private key.";
      errEl.style.display = "block";
    }
    return;
  }

  if (errEl) errEl.style.display = "none";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Verifying on-chain key...";
  }

  try {
    const res = await fetch("/api/auth/verify-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ privateKey: key }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to verify private key");
    }

    window.bulwarkAuth = {
      authenticated: true,
      mode: "private_key",
      address: data.address,
    };
    localStorage.setItem("bulwark_auth_mode", "private_key");
    localStorage.setItem("bulwark_auth_address", data.address);
    // CRITICAL: NEVER store private key in localStorage
    try {
      localStorage.removeItem("bulwark_auth_key");
    } catch (e) {}

    applyAuthStateUI();
    showToast(`24/7 Autonomous Guardian Activated for ${data.address.slice(0, 6)}...${data.address.slice(-4)}`, "success");

    const modal = document.getElementById("walletModal");
    if (modal) modal.style.display = "none";
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || "Failed to verify private key";
      errEl.style.display = "block";
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Authenticate 24/7 Autonomous Key →";
    }
  }
}

function openAccessGatewayModal(preferredTab) {
  const modalBackdrop = document.getElementById("walletModal");
  if (!modalBackdrop) return;

  ensureGatewayModalStructure(modalBackdrop);
  detectInstalledWallets();
  showWalletError(null);

  const initialTab = preferredTab || (window.bulwarkAuth && window.bulwarkAuth.mode === "private_key" ? "private_key" : "wallet");
  switchGatewayTab(initialTab);
  modalBackdrop.style.display = "flex";
}
window.openAccessGatewayModal = openAccessGatewayModal;

// ── Setup Shared Handlers on Page Load ──────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  injectLiquidCanvas();
  highlightActiveNav();

  // Tick Button
  const tickBtn = document.getElementById("tickBtn");
  if (tickBtn) {
    tickBtn.addEventListener("click", triggerTick);
  }

  // Wallet Modal Handlers
  const modalBackdrop = document.getElementById("walletModal");
  const connectBtn = document.getElementById("connectWalletBtn");
  const closeBtn = document.getElementById("closeWalletModal");
  const disconnectBtn = document.getElementById("disconnectWalletBtn");
  const switchBtn = document.getElementById("switchNetworkBtn");
  const scanMyPosBtn = document.getElementById("scanConnectedPosBtn");

  if (connectBtn && modalBackdrop) {
    connectBtn.addEventListener("click", () => {
      openAccessGatewayModal();
    });
  }

  // Intercept Logo click to open Gateway Modal when unauthenticated
  document.querySelectorAll(".logo-link, .logo-area").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (!window.bulwarkAuth || !window.bulwarkAuth.authenticated) {
        e.preventDefault();
        e.stopPropagation();
        openAccessGatewayModal();
      }
    });
  });

  if (closeBtn && modalBackdrop) {
    closeBtn.addEventListener("click", () => {
      modalBackdrop.style.display = "none";
    });
  }

  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) {
        modalBackdrop.style.display = "none";
      }
    });
  }

  if (disconnectBtn) {
    disconnectBtn.addEventListener("click", disconnectWallet);
  }

  if (switchBtn) {
    switchBtn.addEventListener("click", switchToActiveNetwork);
  }

  if (scanMyPosBtn && modalBackdrop) {
    scanMyPosBtn.addEventListener("click", () => {
      const activeAddress = window.bulwarkAuth?.address || connectedWallet.address;
      if (activeAddress) {
        modalBackdrop.style.display = "none";
        // If on /positions, trigger local scan, else navigate
        if (window.location.pathname.startsWith("/positions")) {
          const scanInput = document.getElementById("scanAddressInput");
          if (scanInput) {
            scanInput.value = activeAddress;
            const runScanBtn = document.getElementById("runScanBtn");
            if (runScanBtn) runScanBtn.click();
          }
        } else {
          window.location.href = `/positions?scan=${activeAddress}`;
        }
      }
    });
  }

  document.querySelectorAll(".wallet-option").forEach((opt) => {
    opt.addEventListener("click", () => {
      const walletType = opt.getAttribute("data-wallet");
      connectWallet(walletType);
    });
  });

  initBulwarkAuth();
  detectInstalledWallets();
  autoReconnectWallet();
  fetchDeskState();
});
