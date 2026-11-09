#!/usr/bin/env bash
# infrastructure/scripts/reset-services.sh
# Tears down and restarts all Docker Compose services, wiping volumes.
# WARNING: This destroys all local data.

set -e
echo "🔥 Stopping and removing all services and volumes..."
docker compose down -v --remove-orphans

echo "🚀 Starting fresh services..."
docker compose up -d

echo "✅ Services reset complete."

