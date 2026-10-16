#!/usr/bin/env python3
"""Verify public screenshot provenance, dimensions, hashes and local doc links."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / 'docs/media/releases/v0.1.0-rc.1'
seen = set()
for language, count in [('en', 8), ('it', 2)]:
    manifest = json.loads((MEDIA / f'capture-manifest-{language}.json').read_text())
    assert manifest['runtime_commit'] == subprocess.check_output(
        ['git', 'rev-list', '-n', '1', manifest['release']], cwd=ROOT, text=True).strip()
    assert manifest['repository_runtime_modified'] is False
    assert len(manifest['images']) == count
    for item in manifest['images']:
        path = MEDIA / item['file']
        data = path.read_bytes()
        assert data[:8] == b'\x89PNG\r\n\x1a\n', path
        dimensions = [int.from_bytes(data[16:20], 'big'), int.from_bytes(data[20:24], 'big')]
        assert dimensions == [item['width'], item['height']] == [1280,800], path
        assert hashlib.sha256(data).hexdigest() == item['sha256'], path
        assert item['readings'] == 'simulated' and item['language'] == language
        assert item['file'] not in seen
        seen.add(item['file'])
    if language == 'en':
        archive_hash = manifest['archive_sha256']
    else:
        assert archive_hash == manifest['archive_sha256']
assert seen == {path.name for path in MEDIA.glob('*.png')}
for path in [ROOT / 'README.md', ROOT / 'CHANGELOG.md', *ROOT.glob('docs/**/*.md')]:
    for target in re.findall(r'!?\[[^\]]*\]\(([^)]+)\)', path.read_text()):
        target = target.split('#')[0].split(' "')[0]
        if not target or '://' in target or target.startswith('mailto:'):
            continue
        assert (path.parent / unquote(target)).exists(), (path, target)
print(f'Checked {len(seen)} public PNGs, EN/IT provenance manifests and local documentation links.')
