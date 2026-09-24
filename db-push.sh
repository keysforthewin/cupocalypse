#!/usr/bin/env bash
# Overwrite the production scores database with local data/scores.sqlite.
set -euo pipefail
cd "$(dirname "$0")"
target="$(grep -E '^DEPLOY_TARGET=' .env | cut -d= -f2-)"
[ -n "$target" ] || { echo "Set DEPLOY_TARGET=user@host:/path in .env"; exit 1; }
host="${target%%:*}"; dir="${target#*:}"
[ -f data/scores.sqlite ] || { echo "No local data/scores.sqlite"; exit 1; }

echo "This REPLACES the production leaderboards at $target with your local database."
read -r -p "Type 'push' to continue: " answer
[ "$answer" = "push" ] || { echo "Aborted."; exit 1; }

rm -f data/scores.push.tmp
node -e 'const {DatabaseSync}=require("node:sqlite");new DatabaseSync("data/scores.sqlite").prepare("VACUUM INTO ?").run("data/scores.push.tmp")'
ssh "$host" "cd '$dir' && docker compose --profile deploy stop deploy \
  && rm -f data/scores.sqlite data/scores.sqlite-wal data/scores.sqlite-shm \
  && cat > data/scores.sqlite \
  && docker compose --profile deploy start deploy" < data/scores.push.tmp
rm -f data/scores.push.tmp
echo "Pushed local scores to production."
