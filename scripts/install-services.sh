#!/bin/bash
set -e

AGENTS_DIR="/Users/rohanchetia04/Library/LaunchAgents"
PROJECT_DIR="/Users/rohanchetia04/Downloads/My new newspaper"

mkdir -p "$AGENTS_DIR"
mkdir -p "$PROJECT_DIR/logs"

cp "$PROJECT_DIR/scripts/launchd/com.gbi.newspaper.server.plist" "$AGENTS_DIR/"
cp "$PROJECT_DIR/scripts/launchd/com.gbi.newspaper.tunnel.plist" "$AGENTS_DIR/"

launchctl unload "$AGENTS_DIR/com.gbi.newspaper.server.plist" 2>/dev/null || true
launchctl unload "$AGENTS_DIR/com.gbi.newspaper.tunnel.plist" 2>/dev/null || true

launchctl load -w "$AGENTS_DIR/com.gbi.newspaper.server.plist"
launchctl load -w "$AGENTS_DIR/com.gbi.newspaper.tunnel.plist"

echo "macOS LaunchAgents installed and started."
