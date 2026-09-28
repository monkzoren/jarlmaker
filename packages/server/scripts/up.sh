#!/bin/sh
# Starts the pinned SpacetimeDB container and waits until it answers.
set -eu

here=$(cd "$(dirname "$0")/.." && pwd)
docker compose -f "$here/../../docker-compose.yml" up -d spacetimedb

tries=0
until curl -fsS -o /dev/null http://127.0.0.1:3000/v1/ping 2>/dev/null; do
  tries=$((tries + 1))
  if [ "$tries" -ge 60 ]; then
    echo "server:up: SpacetimeDB did not answer on 127.0.0.1:3000 within 60 s" >&2
    exit 1
  fi
  sleep 1
done
echo "server:up: SpacetimeDB is up on http://127.0.0.1:3000"
