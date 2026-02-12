#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# MeetSpace Manager — Update Script
# ============================================================
# Pulls latest code, rebuilds, and restarts the application.
#
# Usage:
#   sudo ./deploy/update.sh
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "============================================"
echo " MeetSpace Manager — Update"
echo "============================================"

cd "$PROJECT_DIR"

echo "[1/3] Pulling latest code..."
git pull

echo "[2/3] Rebuilding containers..."
docker compose -f deploy/docker-compose.yml --env-file deploy/.env build

echo "[3/3] Restarting services..."
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d

echo ""
echo "Update complete. View logs with:"
echo "  docker compose -f deploy/docker-compose.yml logs -f app"
echo ""
