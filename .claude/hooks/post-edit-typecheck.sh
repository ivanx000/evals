#!/usr/bin/env bash
# Post-tool-use: run tsc --noEmit and eslint after any .ts file edit.
# Outputs additionalContext JSON so Claude sees errors in its context.

set -uo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_ROOT"

# Parse file_path from stdin JSON
INPUT=$(cat)
FILE_PATH=$(python3 -c "
import sys, json
try:
    data = json.loads(sys.argv[1])
    print(data.get('tool_input', {}).get('file_path', ''))
except Exception:
    print('')
" "$INPUT" 2>/dev/null || echo "")

# Only act on .ts files (not .d.ts)
if [[ "$FILE_PATH" != *.ts ]] || [[ "$FILE_PATH" == *.d.ts ]]; then
  exit 0
fi

MESSAGES=()

# ── TypeScript ─────────────────────────────────────────────────────────────────
TSC_OUT=$(npx tsc --noEmit 2>&1) || true
TSC_ERRORS=$(printf '%s' "$TSC_OUT" | grep -c "error TS" 2>/dev/null || echo "0")

if [ "$TSC_ERRORS" -gt 0 ]; then
  ERROR_LINES=$(printf '%s' "$TSC_OUT" | grep "error TS" | head -10)
  MESSAGES+=("❌ TypeScript: $TSC_ERRORS error(s) found — fix before proceeding.\n$ERROR_LINES")
else
  MESSAGES+=("✅ TypeScript: no errors")
fi

# ── ESLint ────────────────────────────────────────────────────────────────────
if [ -f "$PROJECT_ROOT/.eslintrc.json" ] || [ -f "$PROJECT_ROOT/eslint.config.js" ]; then
  ESLINT_OUT=$(npx eslint "$FILE_PATH" --format compact 2>&1) || true
  if [ -n "$ESLINT_OUT" ]; then
    MESSAGES+=("⚠️  ESLint issues in $FILE_PATH:\n$ESLINT_OUT")
  else
    MESSAGES+=("✅ ESLint: no issues")
  fi
fi

# ── Output as additionalContext JSON ──────────────────────────────────────────
COMBINED=$(printf '%s\n' "${MESSAGES[@]}")
python3 -c "
import sys, json
msg = sys.argv[1]
print(json.dumps({'additionalContext': msg}))
" "$COMBINED"

exit 0
