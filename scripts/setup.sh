#!/usr/bin/env bash
set -euo pipefail
wenyuan_root="$(cd "$(dirname "$0")/.." && pwd)"
for wenyuan_artifact in backend/.venv frontend/node_modules frontend/.next .uv-cache; do
  wenyuan_path="$wenyuan_root/$wenyuan_artifact"
  if [[ -L "$wenyuan_path" && ! -e "$wenyuan_path" ]]; then unlink -- "$wenyuan_path"; fi
done
cd "$wenyuan_root/backend"
export UV_CACHE_DIR="${UV_CACHE_DIR:-$wenyuan_root/.uv-cache}"
uv sync --locked
cd "$wenyuan_root/frontend"
pnpm install --frozen-lockfile
