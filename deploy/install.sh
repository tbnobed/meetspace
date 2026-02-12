#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# MeetSpace Manager — Ubuntu Server Deployment Script
# ============================================================
# This script installs Docker, builds, and starts MeetSpace.
# Run as root or with sudo on a fresh Ubuntu 22.04+ server.
#
# Usage:
#   chmod +x deploy/install.sh
#   sudo ./deploy/install.sh
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "============================================"
echo " MeetSpace Manager — Deployment"
echo "============================================"
echo ""

# ── 1. Check for root ────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  echo "ERROR: Please run this script as root (sudo ./deploy/install.sh)"
  exit 1
fi

# ── 2. Install Docker if not present ─────────────────────────
if ! command -v docker &> /dev/null; then
  echo "[1/6] Installing Docker..."
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg lsb-release

  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  systemctl enable docker
  systemctl start docker
  echo "[1/6] Docker installed successfully."
else
  echo "[1/6] Docker already installed — skipping."
fi

# ── 3. Verify Docker Compose ─────────────────────────────────
if ! docker compose version &> /dev/null; then
  echo "ERROR: docker compose plugin not found. Install it manually:"
  echo "  apt-get install docker-compose-plugin"
  exit 1
fi
echo "[2/6] Docker Compose available."

# ── 4. Install Nginx if not present ──────────────────────────
if ! command -v nginx &> /dev/null; then
  echo "[3/6] Installing Nginx..."
  apt-get install -y -qq nginx
  systemctl enable nginx
  echo "[3/6] Nginx installed."
else
  echo "[3/6] Nginx already installed — skipping."
fi

# ── 5. Install Certbot for SSL ───────────────────────────────
if ! command -v certbot &> /dev/null; then
  echo "[4/6] Installing Certbot for SSL certificates..."
  apt-get install -y -qq certbot python3-certbot-nginx
  echo "[4/6] Certbot installed."
else
  echo "[4/6] Certbot already installed — skipping."
fi

# ── 6. Check .env file ───────────────────────────────────────
ENV_FILE="$SCRIPT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo ""
  echo "WARNING: No .env file found at $ENV_FILE"
  echo "Creating one from .env.example — you MUST edit it before starting."
  cp "$SCRIPT_DIR/.env.example" "$ENV_FILE"
  echo ""
  echo "  Edit the file:  nano $ENV_FILE"
  echo "  Then re-run:    sudo ./deploy/install.sh"
  echo ""
  exit 1
fi
echo "[5/6] Environment file found."

# ── 7. Build and start ───────────────────────────────────────
echo "[6/6] Building and starting MeetSpace..."
cd "$PROJECT_DIR"
docker compose -f deploy/docker-compose.yml --env-file deploy/.env build
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d

echo ""
echo "============================================"
echo " MeetSpace Manager is running!"
echo "============================================"
echo ""
echo " App:      http://localhost:5000"
echo " Database: PostgreSQL on localhost:5432 (internal only)"
echo ""
echo " Next steps:"
echo ""
echo " 1. Set up SSL with Nginx:"
echo "    - Edit deploy/nginx.conf and replace 'meetspace.yourcompany.com'"
echo "      with your actual domain name."
echo "    - Copy the config:"
echo "        sudo cp deploy/nginx.conf /etc/nginx/sites-available/meetspace"
echo "        sudo ln -sf /etc/nginx/sites-available/meetspace /etc/nginx/sites-enabled/meetspace"
echo "        sudo rm -f /etc/nginx/sites-enabled/default"
echo "    - Get an SSL certificate:"
echo "        sudo certbot --nginx -d meetspace.yourcompany.com"
echo "    - Reload Nginx:"
echo "        sudo systemctl reload nginx"
echo ""
echo " 2. Log in with your admin account:"
echo "    Username: admin"
echo "    Password: (whatever you set in .env as ADMIN_PASSWORD)"
echo ""
echo " Useful commands:"
echo "   View logs:     docker compose -f deploy/docker-compose.yml logs -f"
echo "   Stop:          docker compose -f deploy/docker-compose.yml down"
echo "   Restart:       docker compose -f deploy/docker-compose.yml restart"
echo "   Rebuild:       docker compose -f deploy/docker-compose.yml up -d --build"
echo "   DB backup:     docker compose -f deploy/docker-compose.yml exec db pg_dump -U meetspace meetspace > backup.sql"
echo ""
