#!/usr/bin/env bash
# Mirrors sdks/js/ from the monorepo to the standalone GitHub repository
# https://github.com/official-inso/els-client.
#
# Strategy: copy the working tree into a fresh worktree of the target repo,
# run the hygiene check, then push.
#
# Usage:
#   ./scripts/mirror-to-github.sh [--dry-run]
#
# Requires:
#   - git, rsync
#   - SSH access to git@github.com:official-inso/els-client.git
#   - this script run from sdks/js/

set -euo pipefail

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"

echo "==> Running hygiene check"
bash scripts/check-no-ai-mentions.sh

REMOTE="${ELS_MIRROR_REMOTE:-git@github.com:official-inso/els-client.git}"
WORKDIR="$(mktemp -d -t els-js-mirror-XXXX)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "==> Cloning $REMOTE into $WORKDIR"
git clone --depth=20 "$REMOTE" "$WORKDIR/els-client" || {
  # Empty remote? Initialize a fresh repo.
  rm -rf "$WORKDIR/els-client"
  mkdir -p "$WORKDIR/els-client"
  git -C "$WORKDIR/els-client" init -b main
  git -C "$WORKDIR/els-client" remote add origin "$REMOTE"
}

echo "==> Syncing files"
rsync -a --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude 'build/' \
  --exclude '.next/' \
  --exclude '.turbo/' \
  --exclude 'coverage/' \
  --exclude '*.tsbuildinfo' \
  --exclude '.DS_Store' \
  "$HERE/" "$WORKDIR/els-client/"

cd "$WORKDIR/els-client"

echo "==> Hygiene check on mirrored tree"
bash scripts/check-no-ai-mentions.sh

if [ -z "$(git status --porcelain)" ]; then
  echo "Nothing to mirror — working tree is up to date."
  exit 0
fi

# Version from package.json — using grep/sed to avoid requiring node in CI containers
VERSION="$(grep -E '"version"' package.json | head -1 | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
MSG="sync: mirror snapshot ($VERSION, $(date -u +%Y-%m-%dT%H:%M:%SZ))"

git add -A
git -c user.email='maintainers@official-inso.dev' -c user.name='inso-mirror' commit -m "$MSG"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry run complete. Diff:"
  git --no-pager log -1 --stat
  exit 0
fi

echo "==> Pushing to $REMOTE"
git push origin HEAD:main
echo "Done."
