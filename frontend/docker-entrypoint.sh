#!/bin/sh
set -e

if [ ! -x node_modules/.bin/vite ]; then
  npm ci
fi

exec "$@"
