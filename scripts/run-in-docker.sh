#!/usr/bin/env bash
# Start Docker Compose stack and open the UI in the default browser when ready.
# Usage: ./scripts/run-in-docker.sh [--cn] [--no-open]

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CN=0
NO_OPEN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cn) CN=1; shift ;;
    --no-open) NO_OPEN=1; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ ! -f .env ]] && [[ -f .env.example ]]; then
  cp .env.example .env
  echo "Created .env from .env.example — set AI_API_KEY before using AI features."
fi

URL="$("$(dirname "$0")/resolve-ui-url.sh" .env)"

COMPOSE=(docker compose)
if [[ "$CN" -eq 1 ]]; then
  COMPOSE+=( -f docker-compose.yml -f docker-compose.cn.yml )
fi

echo "Starting containers..."
"${COMPOSE[@]}" up -d --build

echo "Waiting for ${URL} ..."

if [[ "$URL" == https://* ]]; then
  deadline=$((SECONDS + 300))
else
  deadline=$((SECONDS + 180))
fi
ready=0
while [[ $SECONDS -lt $deadline ]]; do
  if curl -fsS -o /dev/null -m 3 "$URL" 2>/dev/null; then
    ready=1
    break
  fi
  sleep 2
done

if [[ "$ready" -ne 1 ]]; then
  echo "Timed out waiting for the UI at ${URL}." >&2
  if [[ "$URL" == https://* ]]; then
    echo "For HTTPS: confirm VDS_DOMAIN DNS, ports 80/443 open, and: docker compose logs -f frontend" >&2
  else
    echo "Check: docker compose logs -f" >&2
  fi
  exit 1
fi

echo "Ready: ${URL}"
if [[ "$NO_OPEN" -eq 0 ]]; then
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL"
  elif command -v open >/dev/null 2>&1; then
    open "$URL"
  else
    echo "Could not detect a browser opener; open ${URL} manually."
  fi
fi
