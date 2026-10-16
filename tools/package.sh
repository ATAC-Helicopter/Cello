#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
mkdir -p dist
npm run translations
extra_sources=(--extra-source=batterySource.js --extra-source=locale)
if [[ -f extension/LICENSE ]]; then
  extra_sources+=(--extra-source=LICENSE)
fi
gnome-extensions pack --force "${extra_sources[@]}" --out-dir=dist extension
python3 - <<'PY'
from pathlib import Path
import hashlib
import json
import zipfile
metadata = json.loads(Path('extension/metadata.json').read_text())
archive = Path('dist') / (metadata['uuid'] + '.shell-extension.zip')
# Normalize ordering, permissions and timestamps for deterministic release ZIPs.
with zipfile.ZipFile(archive) as bundle:
    contents = {name: bundle.read(name) for name in bundle.namelist() if not name.endswith('/')}
temporary = archive.with_suffix('.tmp')
with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
    for name, data in sorted(contents.items()):
        info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        bundle.writestr(info, data, compresslevel=9)
temporary.replace(archive)
with zipfile.ZipFile(archive) as bundle:
    names = sorted(name for name in bundle.namelist() if not name.endswith("/"))
    assert {'extension.js', 'batterySource.js', 'stylesheet.css', 'metadata.json'} <= set(names), names
    assert set(names) <= {'extension.js', 'batterySource.js', 'stylesheet.css', 'metadata.json', 'LICENSE', 'locale/it/LC_MESSAGES/cello.mo'}, names
    assert 'unsafe_mode' not in bundle.read('extension.js').decode()
    assert 'keychron-macos' not in bundle.read('extension.js').decode()
    assert 'version' not in metadata, 'GNOME Extensions assigns its own version'
    assert bundle.read('locale/it/LC_MESSAGES/cello.mo')
missing = []
if not metadata.get('url'):
    missing.append('Repository pubblico / URL per segnalazioni da definire')
if not Path('extension/LICENSE').exists():
    missing.append('Licenza GPL compatibile e attribuzioni da definire prima della distribuzione')
report = {'archive': str(archive), 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
    'files': names, 'qualification': 'GNOME Shell 46 only',
    'publication_status': 'ready for maintainer submission' if not missing else 'draft'
    , 'remaining': missing}
Path('dist/package-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(report, ensure_ascii=False, indent=2))
PY
