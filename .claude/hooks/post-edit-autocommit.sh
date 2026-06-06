#!/usr/bin/env bash
# Post-tool-use: auto-stage and commit local changes after file edits.
# Uses a 120-second cooldown to avoid a commit per file when Claude edits many files.
# NEVER runs git push — that is always manual.

set -uo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_ROOT"

COOLDOWN_FILE="/tmp/llm-eval-last-commit-ts"
COOLDOWN_SECS=120

# ── Cooldown check ─────────────────────────────────────────────────────────────
NOW=$(date +%s)
LAST=0
if [ -f "$COOLDOWN_FILE" ]; then
  LAST=$(cat "$COOLDOWN_FILE" 2>/dev/null || echo "0")
fi
ELAPSED=$(( NOW - LAST ))

if [ "$ELAPSED" -lt "$COOLDOWN_SECS" ]; then
  # Silently skip — still within cooldown window
  exit 0
fi

# ── Stage everything ───────────────────────────────────────────────────────────
git add -A 2>/dev/null || true

# Nothing staged? Skip.
if git diff --staged --quiet 2>/dev/null; then
  exit 0
fi

# ── Generate commit message from staged files ──────────────────────────────────
STAGED=$(git diff --staged --name-only 2>/dev/null)

# Determine conventional-commit type + scope from changed paths
TYPE="chore"
SCOPE=""

if printf '%s' "$STAGED" | grep -q "^src/graders/"; then
  TYPE="feat"; SCOPE="graders"
elif printf '%s' "$STAGED" | grep -q "^src/providers/"; then
  TYPE="feat"; SCOPE="providers"
elif printf '%s' "$STAGED" | grep -q "^src/cli"; then
  TYPE="feat"; SCOPE="cli"
elif printf '%s' "$STAGED" | grep -q "^src/runner"; then
  TYPE="feat"; SCOPE="runner"
elif printf '%s' "$STAGED" | grep -q "^src/reporter"; then
  TYPE="feat"; SCOPE="reporter"
elif printf '%s' "$STAGED" | grep -q "^src/"; then
  TYPE="feat"; SCOPE="core"
elif printf '%s' "$STAGED" | grep -q "^docs/"; then
  TYPE="docs"; SCOPE="docs"
elif printf '%s' "$STAGED" | grep -q -E "^tests?/|\.test\.|\.spec\."; then
  TYPE="test"; SCOPE="tests"
elif printf '%s' "$STAGED" | grep -q "package"; then
  TYPE="chore"; SCOPE="deps"
elif printf '%s' "$STAGED" | grep -q "\.md$"; then
  TYPE="docs"; SCOPE="readme"
elif printf '%s' "$STAGED" | grep -q "^\.claude/"; then
  TYPE="chore"; SCOPE="hooks"
fi

# Short list of changed files for the message body
SHORT=$(printf '%s' "$STAGED" | head -3 | xargs -I{} basename {} 2>/dev/null | tr '\n' ', ' | sed 's/,$//')
FILE_COUNT=$(printf '%s' "$STAGED" | wc -l | tr -d ' ')

if [ "$FILE_COUNT" -gt 3 ]; then
  SHORT="$SHORT and $((FILE_COUNT - 3)) more"
fi

if [ -n "$SCOPE" ]; then
  MSG="$TYPE($SCOPE): update $SHORT"
else
  MSG="$TYPE: update $SHORT"
fi

# ── Commit ─────────────────────────────────────────────────────────────────────
git commit -m "$MSG" --no-gpg-sign 2>/dev/null || git commit -m "$MSG" 2>/dev/null || true

# Record cooldown timestamp
echo "$NOW" > "$COOLDOWN_FILE"

# ── Notify Claude ──────────────────────────────────────────────────────────────
python3 -c "
import sys, json
msg = sys.argv[1]
print(json.dumps({'additionalContext': msg}))
" "✅ Auto-committed locally: \"$MSG\"\nFiles: $SHORT\nRun 'git push' when ready to publish."

exit 0
