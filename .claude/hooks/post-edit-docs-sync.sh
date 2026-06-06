#!/usr/bin/env bash
# Post-tool-use: warn Claude when it edits files that have corresponding docs
# that may need updating. Outputs an additionalContext reminder.

set -uo pipefail

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

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

WARNING=""

case "$FILE_PATH" in
  */src/graders/*)
    WARNING="⚠️  You edited a grader. Before finishing, make sure:\n  • docs/graders.md reflects the change\n  • The Zod schema in src/types.ts is updated if you added/changed criteria fields"
    ;;
  */src/providers/*)
    WARNING="⚠️  You edited a provider. Before finishing, make sure:\n  • docs/providers.md is up to date (config options, supported models, cost table)"
    ;;
  */src/cli.ts)
    WARNING="⚠️  You edited the CLI entry point. Before finishing, make sure:\n  • docs/getting-started.md reflects any new, removed, or changed commands/flags\n  • README.md command table is still accurate"
    ;;
  */CLAUDE.md)
    # Self-contained — no reminder needed
    exit 0
    ;;
  *)
    # No relevant docs to sync
    exit 0
    ;;
esac

python3 -c "
import sys, json
msg = sys.argv[1]
print(json.dumps({'additionalContext': msg}))
" "$WARNING"

exit 0
