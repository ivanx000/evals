#!/usr/bin/env bash
# Pre-tool-use: log every bash command Claude runs to .claude/logs/commands.log

set -uo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOG_FILE="$PROJECT_ROOT/.claude/logs/commands.log"

# Parse command from stdin JSON
INPUT=$(cat)
COMMAND=$(python3 -c "
import sys, json
try:
    data = json.loads(sys.argv[1])
    print(data.get('tool_input', {}).get('command', '').replace('\n', ' '))
except Exception:
    print('')
" "$INPUT" 2>/dev/null || echo "")

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Append to log
mkdir -p "$(dirname "$LOG_FILE")"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
printf '[%s] %s\n' "$TIMESTAMP" "$COMMAND" >> "$LOG_FILE"

exit 0
