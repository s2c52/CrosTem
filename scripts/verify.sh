#!/usr/bin/env bash
# Gate de verificación de CrosTem (usado por higinio verify/finish).
# Fase actual (vanilla JS): sintaxis de todos los JS + manifest válido.
# Tras la migración F1 (TypeScript + Vite) pasará a: npm run build && npm test.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
while IFS= read -r -d '' f; do
  if ! node --check "$f" >/dev/null 2>&1; then
    echo "SYNTAX FAIL: $f"
    node --check "$f" || true
    fail=1
  fi
done < <(find . -name '*.js' \
  -not -path './node_modules/*' \
  -not -path './.worktrees/*' \
  -not -path './dist/*' \
  -print0)

python3 -c "import json; json.load(open('manifest.json'))" || { echo "manifest.json inválido"; fail=1; }

if [ "$fail" -eq 0 ]; then
  echo "verify OK: sintaxis JS y manifest.json correctos"
fi
exit "$fail"
