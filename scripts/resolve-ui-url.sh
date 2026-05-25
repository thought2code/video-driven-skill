#!/usr/bin/env bash
# Print the web UI URL from a .env file (stdout). Used by install/run scripts.
# VDS_DOMAIN set → https://<domain>/ ; otherwise http://localhost/

set -euo pipefail

env_file="${1:-.env}"
domain=""

if [[ -f "$env_file" ]]; then
  line="$(grep -E '^[[:space:]]*VDS_DOMAIN=' "$env_file" | tail -n1 || true)"
  if [[ -n "$line" ]]; then
    domain="${line#*=}"
    domain="${domain//$'\r'/}"
    domain="${domain#"${domain%%[![:space:]]*}"}"
    domain="${domain%"${domain##*[![:space:]]}"}"
    domain="${domain#\"}"
    domain="${domain%\"}"
    domain="${domain#\'}"
    domain="${domain%\'}"
  fi
fi

if [[ -n "$domain" ]]; then
  printf 'https://%s/\n' "$domain"
else
  printf 'http://localhost/\n'
fi
