#!/usr/bin/env bash
# CrosTem verification gate (used by higinio verify/finish).
# TypeScript + Vite: typecheck + unit tests + build.
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
