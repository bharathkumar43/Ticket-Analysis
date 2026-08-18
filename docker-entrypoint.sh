#!/bin/sh
# Runs as root so it can fix ownership of the bind-mounted ./data volume — which Docker
# creates as root:root on the host if it doesn't already exist — before dropping to the
# unprivileged `app` user to actually run the server. Without this, the app can read
# data/ (falls back to defaults on ENOENT) but silently fails to WRITE config.json/the
# synced-ticket cache with a permission error.
set -e
mkdir -p /app/data
chown -R app:app /app/data
exec su-exec app "$@"
