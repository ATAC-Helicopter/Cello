#!/usr/bin/env python3
"""Build a deterministic documentation/media attachment, separate from the extension."""
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = '0.1.0-rc.1'
subprocess.run(['python3', str(ROOT / 'tools/check-release-docs.py')], cwd=ROOT, check=True)
files = [ROOT / name for name in ['README.md', 'CHANGELOG.md', 'LICENSE', 'NOTICE.md',
    'CONTRIBUTING.md', 'SECURITY.md', 'assets/preview-wallpaper.svg']]
files += [path for path in (ROOT / 'docs').rglob('*') if path.is_file()]
contents = {str(path.relative_to(ROOT)): path.read_bytes() for path in files}
manifest = {'release': 'v' + VERSION, 'type': 'documentation and public media; not an installable extension',
    'runtime_changed': False, 'gnome_extensions_status': 'submission pending',
    'files': {name: {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        for name, data in sorted(contents.items())}}
contents['MANIFEST.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
destination = ROOT / 'dist' / f'cello-{VERSION}-release-kit.zip'
destination.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, data in sorted(contents.items()):
        info = zipfile.ZipInfo(name, date_time=(1980,1,1,0,0,0))
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, data, compresslevel=9)
digest = hashlib.sha256(destination.read_bytes()).hexdigest()
destination.with_suffix('.zip.sha256').write_text(f'{digest}  {destination.name}\n')
print(json.dumps({'file': str(destination.relative_to(ROOT)), 'files': len(contents),
    'bytes': destination.stat().st_size, 'sha256': digest}, indent=2))
