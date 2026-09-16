# BULWARK Azure Deployment Guide

This guide explains how to deploy BULWARK to **Microsoft Azure** so that it runs **identically to your local machine**: with a persistent Node.js runtime, long-running autonomous Guardian daemon, continuous Aave V3 health monitoring, persistent state storage, and active Gemini 3.5 + KeeperHub MCP connections.

---

## 1. Why Azure vs. Serverless (Vercel)?

| Feature | Serverless (Vercel Lambdas) | Azure (Container Apps / App Service / VM) |
|---|---|---|
| **Runtime Model** | Ephemeral, freezes when idle | **Persistent 24/7 Node.js process** (Identical to local) |
| **Autonomous Daemon (`bulwark-agent guard`)** | ❌ Execution times out after 10–60s | ✅ **Runs background tick loops continuously** |
| **Filesystem State (`.bulwark/`)** | ❌ Read-only or wiped on cold start | ✅ **Persistent volume mounts** for grants & audit trail |
| **Streamable MCP / SSE** | ❌ Drops long-lived connections | ✅ **Continuous streamable HTTP & SSE** to KeeperHub |
| **Google AI Studio Quota Cache** | ❌ In-memory cache reset across instances | ✅ **In-memory cache persists across ticks** |

---

## 2. Option 1: Azure Container Apps (Recommended)

Azure Container Apps is serverless containers: you pay only for CPU/memory used, it supports continuous background execution, and can be deployed with one CLI command.

### Step 1: Install Azure CLI & Login
```bash
az login
az upgrade
```

### Step 2: Create a Resource Group
```bash
az group create --name bulwark-rg --location eastus
```

### Step 3: Deploy Directly from Source (Using Dockerfile)
```bash
az containerapp up \
  --name bulwark-app \
  --resource-group bulwark-rg \
  --location eastus \
  --source . \
  --ingress external \
  --target-port 4567 \
  --env-vars \
    NODE_ENV=production \
    BULWARK_CHAIN_ID=84532 \
    KEEPERHUB_API_KEY="your_keeperhub_api_key" \
    GEMINI_API_KEY="your_gemini_api_key" \
    BULWARK_LLM_MODEL=gemini-3.5-flash-lite \
    BULWARK_POLICY_MAX_USD_PER_ACTION=25 \
    BULWARK_POLICY_HF_CRITICAL=1.35 \
    BULWARK_POLICY_HF_TARGET=2.0
```

Once finished, the Azure CLI outputs the public URL (e.g., `https://bulwark-app.eastus.azurecontainerapps.io`).

---

## 3. Option 2: Azure App Service (Linux Web App)

Azure App Service provides a fully managed platform with automatic SSL, custom domains, and zero-downtime restarts.

### Step 1: Create an App Service Plan (Linux)
```bash
az appservice plan create \
  --name bulwark-plan \
  --resource-group bulwark-rg \
  --sku B1 \
  --is-linux
```

### Step 2: Create Web App with Node 22 Runtime
```bash
az webapp create \
  --name bulwark-keeperhub \
  --plan bulwark-plan \
  --resource-group bulwark-rg \
  --runtime "NODE:22-lts"
```

### Step 3: Set Application Settings & Port
```bash
az webapp config appsettings set \
  --name bulwark-keeperhub \
  --resource-group bulwark-rg \
  --settings \
    PORT=4567 \
    WEBSITES_PORT=4567 \
    NODE_ENV=production \
    BULWARK_CHAIN_ID=84532 \
    KEEPERHUB_API_KEY="your_keeperhub_api_key" \
    GEMINI_API_KEY="your_gemini_api_key" \
    BULWARK_LLM_MODEL=gemini-3.5-flash-lite
```

### Step 4: Configure Startup Command
In Azure Portal: **Settings → Configuration → General Settings → Startup Command**:
```bash
node packages/web/dist/server.js
```

---

## 4. Option 3: Azure Linux VM (Exact Local Mirror)

If you prefer complete root access and zero abstraction (identical to your current Linux machine):

### Step 1: Create an Ubuntu 24.04 VM
```bash
az vm create \
  --resource-group bulwark-rg \
  --name bulwark-vm \
  --image Ubuntu2404 \
  --admin-username azureuser \
  --generate-ssh-keys \
  --size Standard_B1s
```

### Step 2: Open Ingress Port 4567 & 80
```bash
az vm open-port --resource-group bulwark-rg --name bulwark-vm --port 4567 --priority 1000
az vm open-port --resource-group bulwark-rg --name bulwark-vm --port 80 --priority 1010
```

### Step 3: SSH and Run with Docker Compose
```bash
ssh azureuser@<VM_PUBLIC_IP>

# Inside VM:
sudo apt-get update && sudo apt-get install -y docker.io docker-compose git
git clone https://github.com/ROHANROOSWELT/Bulwark.git
cd Bulwark

# Create production .env file:
cat <<EOF > .env
KEEPERHUB_API_KEY=your_keeperhub_key
GEMINI_API_KEY=your_gemini_key
BULWARK_CHAIN_ID=84532
BULWARK_LLM_MODEL=gemini-3.5-flash-lite
EOF

# Launch container in background:
sudo docker-compose up -d --build
```

---

## 5. Verification Checklist After Deployment

Once deployed to Azure:
1. Open `https://<your-azure-domain>/` in your browser. The BULWARK operations console should load with live health indicators.
2. Check `/api/health`: Verify `{"status": "operational", "hasKey": true}`.
3. Verify AI Underwriter status in server startup logs:
   `[AGENT OUTPUT] AI Underwriter: Active (Google AI Studio: gemini-3.5-flash-lite)`
4. Test PoAA Verification at `https://<your-azure-domain>/verify`.
