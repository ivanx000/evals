#!/usr/bin/env bash
# Post-tool-use: run the test suite after edits to src/ or tests/.
# If no test files exist yet, silently skips. Fails gracefully.

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

# Only trigger on src/ or tests/ edits
if [[ "$FILE_PATH" != */src/* ]] && [[ "$FILE_PATH" != */tests/* ]] && [[ "$FILE_PATH" != */test/* ]]; then
  exit 0
fi

# Skip if no test files exist
TEST_COUNT=$(find . -path ./node_modules -prune -o \
  \( -name "*.test.ts" -o -name "*.spec.ts" -o -name "*.test.js" -o -name "*.spec.js" \) \
  -print 2>/dev/null | wc -l | tr -d ' ')

if [ "$TEST_COUNT" -eq 0 ]; then
  exit 0
fi

# Run tests
TEST_OUT=$(npm test 2>&1) || TEST_FAILED=1

if [ "${TEST_FAILED:-0}" -eq 1 ]; then
  TRIMMED=$(printf '%s' "$TEST_OUT" | tail -30)
  python3 -c "
import sys, json
msg = sys.argv[1]
print(json.dumps({'additionalContext': msg}))
" "❌ Tests failed after editing $FILE_PATH — fix before proceeding.\n\n$TRIMMED"
else
  python3 -c "
import sys, json
print(json.dumps({'additionalContext': '✅ All tests passing'}))
"
fi

exit 0
