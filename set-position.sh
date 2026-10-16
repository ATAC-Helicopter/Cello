#!/usr/bin/env bash
set -euo pipefail
case "${1:-}" in
  top-left|top-right|bottom-left|bottom-right) ;;
  *) echo 'Uso: ./set-position.sh top-left|top-right|bottom-left|bottom-right' >&2; exit 1 ;;
esac
python3 - "$1" <<'PYTHON'
import json
import os
import sys
from pathlib import Path
path = Path(os.environ.get('XDG_CONFIG_HOME', str(Path.home() / '.config'))) / 'keychron-batteries-widget.json'
path.parent.mkdir(parents=True, exist_ok=True)
try:
    config = json.loads(path.read_text())
    if not isinstance(config, dict):
        config = {}
except (OSError, ValueError):
    config = {}
config['position'] = sys.argv[1]
temporary = path.with_suffix('.json.tmp')
temporary.write_text(json.dumps(config) + '\n')
os.replace(temporary, path)
PYTHON
echo "Cello · Posizione: $1"
