#!/usr/bin/env bash
# Copyright (C) 2026 Sacha Gennari
# SPDX-License-Identifier: GPL-3.0-or-later
# CrosTem verification gate (used by higinio verify/finish).
# TypeScript + Vite: typecheck + unit tests + build.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d node_modules ]; then
  echo "Instalando dependencias (node_modules ausente)…"
  npm ci
fi

npm run typecheck
npm run lint
npm test
npm run build

echo "verify OK: typecheck, lint, tests y build correctos"
