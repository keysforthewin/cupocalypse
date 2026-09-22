#!/bin/sh
set -eu
npm run build > artifacts/build.log 2>&1
npm test > artifacts/tests.log 2>&1
npm run validate > artifacts/balance.log 2>&1
SEED_PREFIX=holdout npm run validate > artifacts/holdout.log 2>&1
UPGRADED=1 npm run validate > artifacts/upgraded.log 2>&1
npx tsx scripts/progression.ts > artifacts/progression.log 2>&1
node scripts/calibration-report.mjs > artifacts/generation-budget.log
