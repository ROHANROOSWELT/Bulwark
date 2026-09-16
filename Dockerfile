# ── BULWARK Production Container (Node 22 LTS Alpine) ──
FROM node:22-alpine AS builder

WORKDIR /app

# Enable corepack and modern pnpm
RUN corepack enable && corepack prepare pnpm@11.3.0 --activate

# Copy monorepo manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/core/package.json ./packages/core/
COPY packages/cli/package.json ./packages/cli/
COPY packages/agent/package.json ./packages/agent/
COPY packages/web/package.json ./packages/web/

# Install dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source code and config
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY public/ ./public/

# Build all monorepo packages
RUN pnpm build

# ── Runtime Stage ──
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV BULWARK_WEB_PORT=4567
ENV HOST=0.0.0.0

# Install pnpm in runner
RUN corepack enable && corepack prepare pnpm@11.3.0 --activate

# Copy built workspace and node_modules from builder
COPY --from=builder /app /app

# Expose web server and verifier port
EXPOSE 4567

# Create persistent state directory
RUN mkdir -p /app/.bulwark && chown -R node:node /app/.bulwark
VOLUME ["/app/.bulwark"]

USER node

# Start persistent dashboard and API server
CMD ["node", "packages/web/dist/server.js"]
