#!/usr/bin/env bash
set -e

# Configure git to treat /workspace as a safe repository
git config --global --add safe.directory /workspace 2>/dev/null || true

# Forward commands or drop into interactive shell
if [ "$#" -eq 0 ]; then
    exec /bin/bash
else
    exec "$@"
fi
