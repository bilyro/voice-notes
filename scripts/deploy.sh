#!/usr/bin/env bash
# scripts/deploy.sh — run on the server: ./scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
compose() { docker compose -f docker-compose.prod.yml "$@"; }

git pull
pnpm install --frozen-lockfile
# turbo builds @vn/shared first (the web app imports its dist); a plain `pnpm --filter web build` fails on a fresh clone
VITE_API_URL=/api pnpm turbo build --filter=web
compose build api worker

# migrate BEFORE the new API starts: Better Auth checks the schema once at startup and keeps
# failing ("Database schema mismatch") until restarted if the tables appear later
compose up -d --wait postgres redis
compose run --rm api pnpm --filter @vn/api knex migrate:latest
compose run --rm api pnpm --filter @vn/api auth:migrate
compose up -d
compose ps
