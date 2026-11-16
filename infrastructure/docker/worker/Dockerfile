# -----------------------------------------------------------------------------
# Dockerfile — Judge Worker Service (@judge/worker)
# Multi-stage production build with Docker CLI for sandbox orchestration
# -----------------------------------------------------------------------------

# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.18.0 --activate

# Copy monorepo dependency manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/judge-worker/package.json ./apps/judge-worker/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source code and build
COPY tsconfig.json ./
COPY packages/shared/ ./packages/shared/
COPY apps/judge-worker/ ./apps/judge-worker/

RUN pnpm --filter @judge/shared build && pnpm --filter @judge/worker build

# Stage 2: Production runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install Docker CLI so worker can launch sandbox containers via mounted socket
RUN apk add --no-cache docker-cli

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/judge-worker/dist ./apps/judge-worker/dist
COPY --from=builder /app/apps/judge-worker/package.json ./apps/judge-worker/package.json

WORKDIR /app/apps/judge-worker

CMD ["node", "dist/index.js"]
