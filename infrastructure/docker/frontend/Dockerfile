# -----------------------------------------------------------------------------
# Dockerfile — Frontend Web Client (@judge/frontend)
# Multi-stage production build using Vite and Nginx Alpine
# -----------------------------------------------------------------------------

# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.18.0 --activate

# Copy monorepo dependency manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/frontend/package.json ./apps/frontend/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code and build
COPY tsconfig.json ./
COPY packages/shared/ ./packages/shared/
COPY apps/frontend/ ./apps/frontend/

RUN pnpm --filter @judge/shared build && pnpm --filter @judge/frontend build

# Stage 2: Production Nginx web server
FROM nginx:1.27-alpine

# Copy custom Nginx configuration
COPY infrastructure/docker/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static frontend assets
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
