#!/usr/bin/env bash
# Install and run Video Driven Skill from GHCR images (no git clone).
# Usage: ./scripts/install.sh [--dir ~/video-driven-skill] [--ref main] [--tag latest] [--no-open]
# Image tag: v1.0.0 (release) or latest (newest v* release). Images publish on v* Git tags only.

set -euo pipefail

REPO="thought2code/video-driven-skill"
REF="${VD_SKILL_REF:-main}"
INSTALL_DIR="${VD_SKILL_INSTALL_DIR:-$HOME/video-driven-skill}"
IMAGE_TAG="${VD_SKILL_IMAGE_TAG:-latest}"
NO_OPEN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) INSTALL_DIR="$2"; shift 2 ;;
    --ref) REF="$2"; shift 2 ;;
    --tag) IMAGE_TAG="$2"; shift 2 ;;
    --no-open) NO_OPEN=1; shift ;;
    -h|--help)
      cat <<'EOF'
Usage: install.sh [options]

  --dir PATH    Install directory (default: ~/video-driven-skill)
  --ref BRANCH  Git ref for compose/.env files (default: main)
  --tag TAG     GHCR image tag, e.g. v1.0.0 or latest (default: latest)
  --no-open     Do not open the browser when ready

Requires Docker. Web UI: http://localhost, or https://<VDS_DOMAIN> when set in .env.
Set AI_API_KEY in .env after first run if needed.
EOF
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed. See https://docs.docker.com/get-docker/" >&2
  exit 1
fi

RAW_BASE="https://raw.githubusercontent.com/${REPO}/${REF}"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo "Installing to ${INSTALL_DIR} (images: ${IMAGE_TAG}, ref: ${REF})"

curl -fsSL "${RAW_BASE}/docker-compose.release.yml" -o docker-compose.release.yml

if [[ ! -f .env ]]; then
  curl -fsSL "${RAW_BASE}/.env.example" -o .env
  echo "Created .env from .env.example — set AI_API_KEY before using AI features."
fi

export VD_SKILL_IMAGE_TAG="$IMAGE_TAG"

# curl | bash has no stable script path; download helper into the install dir.
curl -fsSL "${RAW_BASE}/scripts/resolve-ui-url.sh" -o resolve-ui-url.sh
chmod +x resolve-ui-url.sh
URL="$(./resolve-ui-url.sh .env)"
if [[ -z "$URL" ]]; then
  echo "Failed to resolve web UI URL from .env" >&2
  exit 1
fi

echo "Pulling images from GHCR..."
docker compose -f docker-compose.release.yml pull

echo "Starting containers..."
docker compose -f docker-compose.release.yml up -d

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
    echo "For HTTPS: confirm VDS_DOMAIN DNS, ports 80/443 open, and: docker compose -f docker-compose.release.yml logs -f frontend" >&2
  else
    echo "Check: docker compose -f docker-compose.release.yml logs -f" >&2
  fi
  exit 1
fi

echo "Ready: ${URL}"
echo "Data volume: video-driven-skill_app-data (docker volume inspect video-driven-skill_app-data)"
if [[ "$NO_OPEN" -eq 0 ]]; then
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL"
  elif command -v open >/dev/null 2>&1; then
    open "$URL"
  else
    echo "Could not detect a browser opener; open ${URL} manually."
  fi
fi
