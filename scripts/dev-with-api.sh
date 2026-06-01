#!/usr/bin/env sh
# Serves static STAR XI + /api serverless routes locally.
# Requires FOOTBALL_DATA_TOKEN in .env.local for match-watch.
set -e
cd "$(dirname "$0")/.."
exec vercel dev --listen 4321
