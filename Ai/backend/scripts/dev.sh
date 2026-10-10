#!/usr/bin/env bash
# Run Stooorna Ai API locally (from Ai/backend)
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONPATH=.
if [ -f ../.env ]; then
  set -a
  # shellcheck disable=SC1091
  source ../.env
  set +a
fi
exec uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
