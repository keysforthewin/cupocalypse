#!/usr/bin/env bash
# Build locally, rsync to DEPLOY_TARGET, rebuild + restart the container, verify.
set -euo pipefail
cd "$(dirname "$0")"

env_value() { grep -E "^$1=" .env 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '"' ; }
target="$(env_value DEPLOY_TARGET)"
url="$(env_value DEPLOY_URL)"
port="$(env_value PORT)"; port="${port:-3020}"
cache_version="${ASSET_CACHE_VERSION:-$(env_value ASSET_CACHE_VERSION || true)}"
[ -n "$target" ] || { echo "Set DEPLOY_TARGET=user@host:/path in .env"; exit 1; }
host="${target%%:*}"
dir="${target#*:}"

# Vite base path from DEPLOY_URL (https://example.com/cup -> /cup/).
rest="${url#*://}"
case "$rest" in */*) base="/${rest#*/}" ;; *) base="/" ;; esac
base="${base%/}/"

echo "==> Building (base $base)"
ASSET_CACHE_VERSION="${cache_version:-1}" BASE_PATH="$base" npm run build

echo "==> Syncing to $target"
ssh "$host" "mkdir -p '$dir/data'"
rsync -az --delete \
  --exclude '.git' --exclude 'node_modules' --exclude '.env' --exclude 'data' \
  dist server src/game package.json package-lock.json compose.yaml \
  Dockerfile.deploy Dockerfile.deploy.dockerignore \
  --relative "$host:$dir/"

echo "==> Restarting"
ssh "$host" "cd '$dir' && PORT=$port docker compose --profile deploy up -d --build deploy"

sleep 5
if ssh "$host" "curl -sf -o /dev/null http://127.0.0.1:$port/"; then
  echo "Deployed."
else
  echo "Service not responding on port $port. Recent logs:"
  ssh "$host" "cd '$dir' && docker compose --profile deploy logs --tail 50 deploy"
  exit 1
fi
