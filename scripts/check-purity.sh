#!/usr/bin/env bash
# The policy VM must be a pure function of its inputs. Any I/O import, ambient clock, or
# randomness is a build failure: it is both the testability argument and the security argument.
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)/packages/policy/src"
BANNED='from "(node:|fs|path|http|https|net|child_process|bun:sqlite)"|require\(|process\.env|Date\.now\(|Math\.random\('
FAILED=0

for file in "$SRC"/*.ts "$SRC"/**/*.ts; do
  [ -f "$file" ] || continue
  # strip block-comment bodies and line comments before scanning
  hits=$(sed -e 's|//.*$||' -e '/^[[:space:]]*\*/d' -e '/^[[:space:]]*\/\*/d' "$file" \
         | grep -nE "$BANNED" || true)
  if [ -n "$hits" ]; then
    echo "$file:"
    echo "$hits"
    FAILED=1
  fi
done

if [ "$FAILED" -ne 0 ]; then
  echo "FAIL: policy VM must contain no I/O, no ambient clock, no randomness"
  exit 1
fi
echo "OK: policy VM is pure"
