#!/usr/bin/env bash
# Release @inso_web/els-client to npmjs.com
# Usage: ./scripts/release.sh 0.1.1
set -euo pipefail

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>   (e.g. 0.1.1)"
  exit 1
fi

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: version must be semver X.Y.Z"
  exit 1
fi

TAG="sdk/js/v${VERSION}"

# Проверки
if ! git diff --quiet HEAD; then
  echo "ERROR: рабочая директория грязная — закоммить или stash сначала"
  exit 1
fi

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "ERROR: тег $TAG уже существует"
  exit 1
fi

echo "→ Создаю тег $TAG"
git tag -a "$TAG" -m "@inso_web/els-client v${VERSION}"

echo "→ Пушу тег в origin"
git push origin "$TAG"

echo
echo "✓ Тег запушен. Pipeline стартует автоматически:"
echo "  https://gitlab.dev.insoweb.ru/flow-parser-mvp/backend/els/-/pipelines"
echo
echo "После успешного pipeline пакет будет доступен:"
echo "  https://www.npmjs.com/package/@inso_web/els-client"
echo "  npm i @inso_web/els-client@${VERSION}"
