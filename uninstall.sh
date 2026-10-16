#!/usr/bin/env bash
set -euo pipefail
uuid='keychron-batteries-widget@fglabs.local'
gnome-extensions disable "$uuid" 2>/dev/null || true
rm -rf -- "$HOME/.local/share/gnome-shell/extensions/$uuid"
rm -f -- "${XDG_CONFIG_HOME:-$HOME/.config}/keychron-batteries-widget.json"
echo 'Cello rimosso. I backup delle versioni precedenti sono conservati.'
