#!/bin/bash

set -e

if [[ "$1" == "--migrate" ]]; then
    echo "Running database migrations..."
    bun run migrate up
else
    echo "Starting the application..."
    bun start
fi
