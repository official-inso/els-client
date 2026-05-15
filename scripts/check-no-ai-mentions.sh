#!/usr/bin/env bash
# Guard against AI / assistant attribution leaking into the public mirror.
# Exits non-zero when a forbidden pattern is found in a tracked file.

set -euo pipefail

PATTERNS=(
  '\bclaude\b'
  '\banthropic\b'
  '\bchatgpt\b'
  '\bopenai\b'
  '\bcopilot\b'
  'generated[[:space:]]+by[[:space:]]+ai'
  'co-authored-by:[[:space:]]*claude'
  'co-authored-by:[[:space:]]*anthropic'
  'co-authored-by:[[:space:]]*openai'
  'co-authored-by:[[:space:]]*github[[:space:]]+copilot'
  $'\xf0\x9f\xa4\x96'   # robot emoji
)

EXCLUDE=(
  ':!scripts/check-no-ai-mentions.sh'
  ':!scripts/mirror-to-github.sh'
)

failed=0
for pattern in "${PATTERNS[@]}"; do
  if git grep -InE -i -- "$pattern" "${EXCLUDE[@]}" >/tmp/els-ai-check.$$ 2>/dev/null; then
    if [ -s /tmp/els-ai-check.$$ ]; then
      echo "Forbidden mention matched pattern: $pattern"
      cat /tmp/els-ai-check.$$
      echo
      failed=1
    fi
  fi
  rm -f /tmp/els-ai-check.$$
done

if [ "$failed" -ne 0 ]; then
  echo "Repository hygiene check failed." >&2
  exit 1
fi

echo "OK: no forbidden mentions found."
