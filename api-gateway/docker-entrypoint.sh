#!/bin/sh
set -e

if [ ! -x node_modules/.bin/tsc ]; then
  npm ci
fi

exec "$@"
