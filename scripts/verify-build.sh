#!/usr/bin/env bash
# verify-build.sh — Run before every merge to ensure nothing breaks.
# Exit on first failure so CI catches regressions immediately.
set -euo pipefail

echo "🔨 Building @nexigrate/shared..."
pnpm --filter @nexigrate/shared build

echo "🔨 Building @nexigrate/credits..."
pnpm --filter @nexigrate/credits build

echo "🔨 Building @nexigrate/ai-pipeline..."
pnpm --filter @nexigrate/ai-pipeline build

echo "🔨 Building @nexigrate/api..."
pnpm --filter @nexigrate/api build

echo "🔨 Building @nexigrate/web..."
pnpm --filter @nexigrate/web build

echo ""
echo "✅ All packages build successfully."

# Color audit — ensure no banned raw Tailwind colors leaked into the web app
BANNED=$(grep -r "bg-blue\|text-blue\|bg-indigo\|bg-violet\|bg-purple\|bg-pink\|bg-cyan\|bg-teal\|bg-white\|bg-gray\|text-gray\|bg-stone\|text-stone\|bg-amber\|text-amber" apps/web/src/ --include="*.tsx" --include="*.ts" -l 2>/dev/null || true)
if [ -n "$BANNED" ]; then
  echo ""
  echo "⚠️  WARNING: Banned raw Tailwind colors found in:"
  echo "$BANNED"
  echo "   Use brand tokens (paper/ink/ember/gold/muted/line) instead."
fi

echo ""
echo "🎉 Verify complete. Safe to merge."
