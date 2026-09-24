#!/usr/bin/env bash
# Copy the production scores database (SQLite) into local data/scores.sqlite.
set -euo pipefail
cd "$(dirname "$0")"
target="$(grep -E '^DEPLOY_TARGET=' .env | cut -d= -f2-)"
[ -n "$target" ] || { echo "Set DEPLOY_TARGET=user@host:/path in .env"; exit 1; }
host="${target%%:*}"; dir="${target#*:}"

mkdir -p data
# VACUUM INTO produces a consistent single-file snapshot of the live WAL database.
js='const {DatabaseSync}=require("node:sqlite");new DatabaseSync("data/scores.sqlite").prepare("VACUUM INTO ?").run("/tmp/scores.sqlite");process.stdout.write(require("fs").readFileSync("/tmp/scores.sqlite"))'
ssh "$host" "cd '$dir' && docker compose --profile deploy exec -T deploy node -e '$js'" \
  > data/scores.sqlite.tmp
rm -f data/scores.sqlite data/scores.sqlite-wal data/scores.sqlite-shm
mv data/scores.sqlite.tmp data/scores.sqlite
echo "Pulled production scores into data/scores.sqlite (restart the dev server to pick it up)."
