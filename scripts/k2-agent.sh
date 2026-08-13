#!/usr/bin/env bash
# Keep the Vite dev server up permanently, so typing `k2` in the browser always lands
# somewhere (ADR-0048's lab picker only exists under the dev server).
#
#   bash scripts/k2-agent.sh install     # start now + on every login
#   bash scripts/k2-agent.sh uninstall   # stop and remove, leaves nothing behind
#   bash scripts/k2-agent.sh status
#
# DEV SERVER ONLY. It binds 127.0.0.1 (Vite's default — no --host), so it is not reachable
# from the network, but it does serve the local exports/ folder to anything on this machine.
# It is not, and must never become, a way to reach these recordings from anywhere else:
# FOUNDATIONS §6 is about researchers' data not leaving the machine.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.tonydefazio.colonel-kernel-k2"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$ROOT/.k2-agent.log"

case "${1:-status}" in
  install)
    mkdir -p "$HOME/Library/LaunchAgents"
    # Run through a LOGIN shell: node lives under nvm, which launchd's bare environment
    # knows nothing about. Without -l this starts, fails to find node, and respawns forever.
    cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>cd "$ROOT" && exec npm run dev</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF
    launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$UID" "$PLIST"
    echo "installed — dev server will be up at http://localhost:5173/ after every login"
    echo "log: $LOG"
    ;;
  uninstall)
    launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "uninstalled — nothing left behind (log file $LOG can be deleted too)"
    ;;
  status)
    launchctl print "gui/$UID/$LABEL" >/dev/null 2>&1 &&
      echo "agent: loaded" || echo "agent: not loaded"
    curl -s -o /dev/null -w "server: HTTP %{http_code}\n" --max-time 3 http://localhost:5173/ ||
      echo "server: not responding"
    ;;
  *)
    echo "usage: $0 {install|uninstall|status}" >&2; exit 1 ;;
esac
