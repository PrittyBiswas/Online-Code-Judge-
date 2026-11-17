# -----------------------------------------------------------------------------
# Dockerfile — API Service (@judge/api)
# Multi-stage production build running as non-root user
# -----------------------------------------------------------------------------

# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.18.0 --activate

# Copy monorepo dependency manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source code and build
COPY tsconfig.json tsconfig.base.json ./
COPY drizzle/ ./drizzle/
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/

RUN pnpm --filter @judge/shared build && pnpm --filter @judge/api build

# Stage 2: Production runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Install curl for container healthcheck
RUN apk add --no-cache curl

# Run as unprivileged node user
USER node

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=node:node /app/drizzle ./drizzle

WORKDIR /app/apps/api

EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4000/health/live || exit 1

CMD ["node", "dist/server.js"]
