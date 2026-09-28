#!/bin/sh
# Runs the `spacetime` CLI at exactly the pinned version (ADR 0006).
#
# Resolution order:
#   1. $SPACETIME_BIN, if set.
#   2. `spacetime` on PATH, if it reports the pinned version.
#   3. The CLI copied out of the pinned Docker image (Linux hosts), cached in
#      packages/server/.spacetime/<version>/. `generate` also needs the
#      `spacetimedb-standalone` binary beside the CLI, so both are copied.
#
# The CLI runs on the host because building a TypeScript module shells out
# to node, which the SpacetimeDB image does not ship.
set -eu

here=$(cd "$(dirname "$0")/.." && pwd)
version=$(node -e "process.stdout.write(require('$here/package.json').dependencies.spacetimedb)")
image="clockworklabs/spacetime:v$version"

if [ -n "${SPACETIME_BIN:-}" ]; then
  exec "$SPACETIME_BIN" "$@"
fi

if command -v spacetime >/dev/null 2>&1 &&
  spacetime --version 2>/dev/null | grep -q "tool version $version;"; then
  exec spacetime "$@"
fi

cached="$here/.spacetime/$version/spacetime"
if [ ! -x "$cached" ]; then
  if [ "$(uname -s)" != "Linux" ]; then
    echo "spacetime.sh: install the SpacetimeDB CLI $version (spacetime version install $version)" >&2
    echo "or set SPACETIME_BIN; the Docker image only carries a Linux binary." >&2
    exit 1
  fi
  echo "spacetime.sh: extracting CLI $version from $image" >&2
  dir=$(dirname "$cached")
  mkdir -p "$dir"
  cid=$(docker create "$image")
  docker cp "$cid:/opt/spacetime/spacetimedb-standalone" "$dir/spacetimedb-standalone" >/dev/null
  docker cp "$cid:/opt/spacetime/spacetimedb-cli" "$dir/spacetime.tmp" >/dev/null
  docker rm "$cid" >/dev/null
  mv "$dir/spacetime.tmp" "$cached"
fi
exec "$cached" "$@"
