#!/bin/sh
set -e

if [ -z "${VDS_DOMAIN:-}" ]; then
  SITE=":80"
else
  SITE="$VDS_DOMAIN"
fi

sed "s|@SITE@|${SITE}|g" /etc/caddy/Caddyfile.template > /etc/caddy/Caddyfile

if [ -n "${ACME_EMAIL:-}" ]; then
  exec caddy run \
    --config /etc/caddy/email.caddy \
    --config /etc/caddy/Caddyfile \
    --adapter caddyfile
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
