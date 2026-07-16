#!/usr/bin/env bash
# Gate de verificación de CrosTem (usado por higinio verify/finish).
# TypeScript + Vite: typecheck + tests unit + build.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d node_modules ]; then
  echo "Instalando dependencias (node_modules ausente)…"
  npm ci
fi

npm run typecheck
npm test
npm run build

echo "verify OK: typecheck, tests y build correctos"
