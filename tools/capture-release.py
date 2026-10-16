#!/usr/bin/env python3
"""Capture the released widget in an isolated Shell; never control the host Shell."""
import argparse
import ast
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from private_session import run_private_session

ROOT = Path(__file__).resolve().parents[1]
UUID = 'keychron-batteries-widget@fglabs.local'
TAG = 'v0.1.0-rc.1'
OUT = ROOT / 'docs/media/releases' / TAG


def command(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT).strip()


def call(service, path, method, *args):
    return command('gdbus', 'call', '--session', '--dest', service,
        '--object-path', path, '--method', method, *map(str, args))


def evaluate(code):
    result = ast.literal_eval(call('org.gnome.Shell', '/org/gnome/Shell',
        'org.gnome.Shell.Eval', 'const cello=global.cello, C=global.C, pointer=global.pointer; ' + code)
        .replace('(true,', '(True,').replace('(false,', '(False,'))
    if not result[0]:
        raise RuntimeError(result[1])
    return json.loads(result[1])


def wait_for(code, timeout=25):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        try:
            if evaluate(code):
                return
        except (RuntimeError, subprocess.CalledProcessError):
            pass
        time.sleep(0.2)
    raise RuntimeError(f'Timed out waiting for {code}')


def click(x, y, button=1):
    evaluate(f'pointer.notify_absolute_motion(0,{x},{y}); "moved"')
    time.sleep(0.15)
    evaluate(f'pointer.notify_button(0,{button},C.ButtonState.PRESSED); '
        f'pointer.notify_button(0,{button},C.ButtonState.RELEASED); "clicked"')
    time.sleep(0.35)


def screenshot(name, caption):
    time.sleep(0.4)
    filename = OUT / (name + '.png')
    call('org.gnome.Shell.Screenshot', '/org/gnome/Shell/Screenshot',
        'org.gnome.Shell.Screenshot.Screenshot', 'false', 'false', filename)
    data = filename.read_bytes()
    width = int.from_bytes(data[16:20], 'big')
    height = int.from_bytes(data[20:24], 'big')
    entries.append({'file': filename.name, 'caption': caption, 'language': args.language,
        'width': width, 'height': height, 'sha256': hashlib.sha256(data).hexdigest(),
        'readings': 'simulated', 'capture': 'GNOME Shell Screenshot D-Bus API'})


def set_scene(devices, appearance='dark'):
    evaluate('cello._menu.close(); cello._bridgeState=null; '
        f'cello._bluez={json.dumps(devices)}; '
        f'cello._config.appearance={json.dumps(appearance)}; '
        'cello._config.position="top-right"; cello._render(); "scene"')
    time.sleep(0.4)


def open_menu(submenu=None):
    x, y = json.loads(evaluate('JSON.stringify(cello._card.get_position())'))
    click(x + 35, y + 35, 3)
    wait_for('cello._menu.isOpen')
    if submenu:
        # Use the real submenu actor and actual pointer events.
        index = 1 if submenu == 'position' else 2
        bounds = json.loads(evaluate(f'JSON.stringify((()=>{{const a=cello._menu._getMenuItems()[{index}]; '
            'return [...a.get_transformed_position(),...a.get_transformed_size()];})())'))
        click(bounds[0] + bounds[2] / 2, bounds[1] + bounds[3] / 2)
        wait_for(f'cello._menu._getMenuItems()[{index}].menu.isOpen')


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--bundle', type=Path, default=ROOT / 'dist' / (UUID + '.shell-extension.zip'))
parser.add_argument('--language', choices=['en', 'it'], default='en')
parser.add_argument('--inside', action='store_true', help=argparse.SUPPRESS)
args = parser.parse_args()
if not args.inside:
    OUT.mkdir(parents=True, exist_ok=True)
    # Bind every public image to the exact runtime files at the released tag.
    with zipfile.ZipFile(args.bundle) as archive:
        for name in archive.namelist():
            if name.endswith('/'):
                continue
            expected = subprocess.check_output(['git', 'show', f'{TAG}:extension/{name}'], cwd=ROOT)
            if archive.read(name) != expected:
                raise ValueError(f'Bundle differs from released source: {name}')
    with tempfile.TemporaryDirectory(prefix='cello-capture-') as temporary:
        env = dict(os.environ, GSETTINGS_BACKEND='keyfile', XDG_DATA_HOME=f'{temporary}/data',
            XDG_CONFIG_HOME=f'{temporary}/config', CELLO_CAPTURE_DIRECTORY=temporary,
            LANGUAGE=args.language, LC_ALL='it_IT.UTF-8' if args.language == 'it' else 'C.UTF-8')
        run_private_session(['dbus-run-session', '--', sys.executable, __file__, '--inside',
            '--bundle', str(args.bundle.resolve()), '--language', args.language], env)
    sys.exit(0)

folder = Path(os.environ['CELLO_CAPTURE_DIRECTORY'])
destination = folder / 'data/gnome-shell/extensions' / UUID
destination.mkdir(parents=True)
with zipfile.ZipFile(args.bundle) as archive:
    for name in archive.namelist():
        target = (destination / name).resolve()
        if not target.is_relative_to(destination.resolve()):
            raise ValueError('Unsafe path in bundle')
    archive.extractall(destination)
# These two changes exist only in the temporary capture copy.
extension = destination / 'extension.js'
extension.write_text(extension.read_text().replace("const STATE = '/run/keychron-battery/state.json';",
    f'const STATE = {json.dumps(str(folder / "state.json"))};').replace('    enable() {',
    '    enable() {\n        global.context.unsafe_mode = true;'))
(folder / 'config').mkdir()
command('gsettings', 'set', 'org.gnome.shell', 'enabled-extensions', f"['{UUID}']")
command('gsettings', 'set', 'org.gnome.shell', 'disable-user-extensions', 'false')
log = (folder / 'capture.log').open('w')
process = subprocess.Popen(['gnome-shell', '--headless', '--wayland', '--no-x11',
    '--virtual-monitor', '1280x800'], stdout=log, stderr=subprocess.STDOUT)
entries = []
try:
    wait_for(f'global.cello=Main.extensionManager.lookup("{UUID}").stateObj; !!global.cello._card')
    wait_for('!Main.layoutManager._startingUp')
    evaluate('Main.overview.hide(); "hide"')
    wait_for('!Main.overview.visible && global.window_group.visible && cello._card.mapped')
    evaluate('import("gi://Clutter").then(({default:C})=>{global.C=C;global.pointer='
        'C.get_default_backend().get_default_seat().create_virtual_device(C.InputDeviceType.POINTER_DEVICE);}); "pointer"')
    wait_for('!!global.pointer')
    expected_title = 'Batterie' if args.language == 'it' else 'Batteries'
    assert evaluate('cello._card.get_first_child().get_first_child().text') == expected_title
    # Stop live inputs before injecting demonstrative readings.
    evaluate('cello._source.destroy(); cello._source=null; cello._objects={}; "isolated"')
    dark_uri = json.dumps((ROOT / 'assets/preview-wallpaper.svg').as_uri())
    evaluate(f'cello._wallpaperSettings.set_string("picture-uri",{dark_uri}); '
        f'cello._wallpaperSettings.set_string("picture-uri-dark",{dark_uri}); "wallpaper"')
    wait_for('!!cello._wallpaperPixbuf')
    # Let the test-only unsafe-mode notification expire before public captures.
    time.sleep(12)
    devices = [
        {'name':'Keyboard','icon':'input-keyboard-symbolic','pct':95,'display':'95%','subtitle':'Bluetooth'},
        {'name':'Mouse','icon':'input-mouse-symbolic','pct':72,'display':'72%','subtitle':'Bluetooth'},
        {'name':'Headphones','icon':'audio-headphones-symbolic','pct':48,'display':'48%','subtitle':'Bluetooth'},
        {'name':'Controller','icon':'input-gaming-symbolic','pct':20,'display':'20%','subtitle':'Bluetooth'},
    ]
    if args.language == 'it':
        for device, name in zip(devices, ['Tastiera', 'Mouse', 'Cuffie', 'Controller']):
            device['name'] = name
        set_scene(devices)
        screenshot('09-italiano', 'Italian translation, dark appearance; simulated readings.')
        open_menu()
        screenshot('10-menu-italiano', 'Native context menu in Italian; simulated readings.')
    else:
        set_scene(devices)
        screenshot('01-overview', 'Four connected devices in dark appearance; simulated readings.')
        set_scene(devices, 'light')
        screenshot('02-light', 'Light appearance on the original project wallpaper; simulated readings.')
        set_scene(devices)
        open_menu()
        screenshot('03-context-menu', 'Context menu opened with a real virtual-pointer right-click; simulated readings.')
        evaluate('cello._menu.close(); "closed"')
        open_menu('position')
        screenshot('04-position-menu', 'Four desktop corner choices in the native menu; simulated readings.')
        evaluate('cello._menu.close(); "closed"')
        open_menu('appearance')
        screenshot('05-appearance-menu', 'Automatic, light and dark appearance choices; simulated readings.')
        extras = [
            {'name':'Trackpad','icon':'input-mouse-symbolic','pct':None,'display':'—','subtitle':'Unavailable'},
            {'name':'Speaker','icon':'audio-speakers-symbolic','pct':8,'display':'8%','subtitle':'Bluetooth'},
        ]
        set_scene(devices + extras)
        screenshot('06-six-devices', 'Six devices wrap into two rows; unknown and low charge examples are simulated.')
        set_scene([devices[0]])
        screenshot('07-compact', 'A single device uses a compact card; simulated reading.')
        set_scene([])
        screenshot('08-empty-state', 'Empty state without a bridge or connected devices; captured in an isolated session.')
    manifest = {'release':TAG, 'runtime_commit':command('git', 'rev-list', '-n', '1', TAG),
        'archive_sha256':hashlib.sha256(args.bundle.read_bytes()).hexdigest(),
        'captured_at':datetime.now(timezone.utc).isoformat(), 'shell':command('gnome-shell','--version'),
        'viewport':[1280,800], 'instrumentation':['temporary unsafe-mode for private-bus automation',
            'temporary bridge path', 'live source stopped; simulated devices injected'],
        'repository_runtime_modified':False, 'images':entries}
    (OUT / f'capture-manifest-{args.language}.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(f'Captured {len(entries)} {args.language} screenshots from {TAG}.')
finally:
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
    log.close()
