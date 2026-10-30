#!/usr/bin/env bash
set -euo pipefail
wenyuan_root="$(cd "$(dirname "$0")/.." && pwd)"
export WENYUAN_DATA="${WENYUAN_DATA:-$wenyuan_root/.data}"
cd "$wenyuan_root/backend"
.venv/bin/python -m wenyuan.api &
wenyuan_api_pid=$!
wenyuan_web_pid=""
wenyuan_stop() {
  kill "$wenyuan_api_pid" 2>/dev/null || true
  if [[ -n "$wenyuan_web_pid" ]]; then kill "$wenyuan_web_pid" 2>/dev/null || true; fi
}
trap wenyuan_stop EXIT INT TERM
cd "$wenyuan_root/frontend"
pnpm dev &
wenyuan_web_pid=$!
wait -n "$wenyuan_api_pid" "$wenyuan_web_pid"
