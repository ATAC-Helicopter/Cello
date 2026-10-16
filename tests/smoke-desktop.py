#!/usr/bin/env python3
"""Exercise Cello inside a separate GNOME Shell and D-Bus session.
Never enables unsafe-mode or changes settings in the user's running Shell.
"""
import ast
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
UUID = 'keychron-batteries-widget@fglabs.local'


def command(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT).strip()


def evaluate(code):
    result = ast.literal_eval(command('gdbus', 'call', '--session', '--dest', 'org.gnome.Shell',
        '--object-path', '/org/gnome/Shell', '--method', 'org.gnome.Shell.Eval',
        'const cello=global.cello, pointer=global.pointer, C=global.C; ' + code)
        .replace('(true,', '(True,').replace('(false,', '(False,'))
    assert result[0], result
    return json.loads(result[1])


def screenshot(path):
    command('gdbus', 'call', '--session', '--dest', 'org.gnome.Shell.Screenshot',
        '--object-path', '/org/gnome/Shell/Screenshot',
        '--method', 'org.gnome.Shell.Screenshot.Screenshot', 'false', 'false', str(path))


if '--inside' not in sys.argv:
    with tempfile.TemporaryDirectory(prefix='cello-smoke-') as temporary:
        env = dict(os.environ, GSETTINGS_BACKEND='keyfile',
            XDG_DATA_HOME=f'{temporary}/data', XDG_CONFIG_HOME=f'{temporary}/config',
            CELLO_SMOKE_DIRECTORY=temporary, LANGUAGE='en', LC_ALL='C.UTF-8')
        subprocess.run(['dbus-run-session', '--', sys.executable, __file__, '--inside'],
            env=env, check=True)
    sys.exit(0)

folder = Path(os.environ['CELLO_SMOKE_DIRECTORY'])
destination = folder / 'data/gnome-shell/extensions' / UUID
shutil.copytree(ROOT / 'extension', destination)
# Test-only instrumentation in a temporary copy, on the isolated bus.
extension = destination / 'extension.js'
extension.write_text(extension.read_text().replace(
    "const STATE = '/run/keychron-battery/state.json';",
    f'const STATE = {json.dumps(str(folder / "state.json"))};').replace('    enable() {',
    '    enable() {\n        global.context.unsafe_mode = true;'))
(folder / 'config').mkdir()
command('gsettings', 'set', 'org.gnome.shell', 'enabled-extensions', f"['{UUID}']")
command('gsettings', 'set', 'org.gnome.shell', 'disable-user-extensions', 'false')
artifacts = ROOT / 'evidence'
artifacts.mkdir(exist_ok=True)
log = (artifacts / 'gnome-smoke.log').open('w')
process = subprocess.Popen(['gnome-shell', '--headless', '--wayland', '--no-x11',
    '--virtual-monitor', '1280x800'], stdout=log, stderr=subprocess.STDOUT)
results = {}
try:
    for _ in range(60):
        try:
            assert evaluate(f'global.cello = Main.extensionManager.lookup("{UUID}").stateObj; '
                'Main.overview.hide(); !!global.cello._card') is True
            break
        except (AssertionError, subprocess.CalledProcessError):
            time.sleep(0.5)
    else:
        raise RuntimeError('Cello did not load; see evidence/gnome-smoke.log')
    time.sleep(2)
    # Use a virtual input device, exercising picking and the real button event.
    evaluate('import("gi://Clutter").then(({default:C}) => {global.C=C; '
        'global.pointer=C.get_default_backend().get_default_seat()'
        '.create_virtual_device(C.InputDeviceType.POINTER_DEVICE);}); "queued"')
    time.sleep(0.3)
    evaluate('let [x,y]=cello._card.get_position(); pointer.notify_absolute_motion(0,x+35,y+35); '
        'pointer.notify_button(0,3,C.ButtonState.PRESSED); '
        'pointer.notify_button(0,3,C.ButtonState.RELEASED); "clicked"')
    time.sleep(0.4)
    assert evaluate('cello._menu.isOpen') is True
    results['physical_right_click'] = True
    screenshot(artifacts / 'context-menu.png')
    # Click outside to dismiss.
    evaluate('pointer.notify_absolute_motion(0,900,500); '
        'pointer.notify_button(0,1,C.ButtonState.PRESSED); '
        'pointer.notify_button(0,1,C.ButtonState.RELEASED); "clicked"')
    time.sleep(0.3)
    assert evaluate('cello._menu.isOpen') is False
    results['outside_click_dismisses'] = True
    # Check menu action and selected position; temporary settings only.
    evaluate('cello._options.find(o=>o.value==="bottom-right").item.emit("activate",null); "moved"')
    time.sleep(0.3)
    assert evaluate('cello._config.position') == 'bottom-right'
    for position in ['top-left', 'top-right', 'bottom-left', 'bottom-right']:
        evaluate(f'cello._config.position="{position}"; cello._render(); "placed"')
        bounds = json.loads(evaluate('JSON.stringify([cello._card.x,cello._card.y,'
            'cello._card.width*cello._card.scale_x,cello._card.height*cello._card.scale_y])'))
        x, y, w, h = bounds
        assert 0 <= x < x+w <= 1280 and 0 <= y < y+h <= 800, bounds
    results['four_positions_fit'] = True
    evaluate('cello._config.position="top-left"; cello._render(); "placed"')
    time.sleep(0.3)
    screenshot(artifacts / 'cello-desktop.png')
    # Exercise six devices, wrapping and unknown battery, using marked synthetic data.
    evaluate('cello._bluez=Array.from({length:6},(_,i)=>({name:`Test device ${i+1}`, '
        'icon:"input-mouse-symbolic",pct:[0,15,30,60,null,95][i],'
        'display:["0%","15%","30%","60%","—","95%"][i],subtitle:"Test"})); '
        'cello._config.appearance="light"; cello._render(); "fixtures"')
    time.sleep(0.3)
    screenshot(artifacts / 'six-devices-light.png')
    results['six_devices_two_rows'] = evaluate('cello._card.get_children().length') == 4
    # Repeated refresh must not preserve stale fixed heights.
    before = evaluate('cello._card.height')
    evaluate('cello._render(); cello._render(); "refreshed"')
    assert before == evaluate('cello._card.height')
    results['stable_refresh_height'] = True
    # With unchanged data, preserve the actor tree rather than repainting tiles.
    evaluate('global.originalTile=cello._card.get_children()[1].get_first_child(); '
        'cello._render(); cello._render(); "unchanged"')
    assert evaluate('global.originalTile === cello._card.get_children()[1].get_first_child()') is True
    results['unchanged_data_preserves_actors'] = True
    evaluate('cello._bluez=[]; cello._render(); "single"')
    time.sleep(0.3)
    results['single_device_shrinks'] = float(evaluate('cello._card.height')) < float(before)
    assert evaluate('cello._bridgeState') is None
    assert evaluate('cello._card.get_children()[1].get_last_child().text') == 'No devices connected'
    results['missing_bridge_empty_state'] = True
    # Monitor a bridge file created after startup, including atomic replacements.
    state = {'mac':'00:11:22:33:44:55', 'device':'Test keyboard', 'connected':True,
        'percentage':83, 'updated_at':time.time()}
    state_path = folder / 'state.json'
    state_path.write_text(json.dumps(state))
    time.sleep(0.7)
    assert evaluate('cello._bridgeState.percentage') == 83
    state['percentage'] = 82
    replacement = folder / 'replacement.json'
    replacement.write_text(json.dumps(state))
    replacement.replace(state_path)
    time.sleep(0.7)
    assert evaluate('cello._bridgeState.percentage') == 82
    results['bridge_creation_and_atomic_update'] = True
    state['updated_at'] = time.time() - 179
    replacement.write_text(json.dumps(state))
    replacement.replace(state_path)
    time.sleep(4)
    assert evaluate('cello._card.get_children()[1].get_first_child().get_children()[1].text') == '—'
    results['bridge_one_shot_stale_expiry'] = True
    state_path.unlink()
    time.sleep(0.5)
    assert evaluate('cello._bridgeState') is None
    results['bridge_removal'] = True
    # Verify automatic contrast with actual wallpaper settings and GdkPixbuf.
    for color, light in [('#ffffff', True), ('#111111', False)]:
        wallpaper = folder / ('light.svg' if light else 'dark.svg')
        wallpaper.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800">'
            f'<rect width="1280" height="800" fill="{color}"/></svg>')
        uri = json.dumps(wallpaper.as_uri())
        evaluate(f'cello._config.appearance="auto"; '
            f'cello._wallpaperSettings.set_string("picture-uri",{uri}); '
            f'cello._wallpaperSettings.set_string("picture-uri-dark",{uri}); '
            'cello._updateTheme(); "wallpaper changed"')
        time.sleep(0.5)
        assert evaluate('cello._light') is light
    results['automatic_wallpaper_contrast'] = True
    evaluate('cello._config.appearance="dark"; cello._render(); "dark"')
    time.sleep(0.3)
    screenshot(artifacts / 'single-device-dark.png')
    # Marketing asset: real Shell rendering over an original SVG wallpaper.
    # All four readings are explicitly simulated, with no device identifiers.
    preview = json.dumps((ROOT / 'assets/preview-wallpaper.svg').as_uri())
    evaluate(f'cello._wallpaperSettings.set_string("picture-uri",{preview}); '
        f'cello._wallpaperSettings.set_string("picture-uri-dark",{preview}); '
        'cello._config.appearance="auto"; cello._config.position="top-right"; '
        'cello._bridgeState=null; '
        'cello._bluez=[{name:"Keyboard",icon:"input-keyboard-symbolic",pct:95,display:"95%",subtitle:"Bluetooth"},'
        '{name:"Mouse",icon:"input-mouse-symbolic",pct:72,display:"72%",subtitle:"Bluetooth"},'
        '{name:"Headphones",icon:"audio-headphones-symbolic",pct:48,display:"48%",subtitle:"Bluetooth"},'
        '{name:"Controller",icon:"input-gaming-symbolic",pct:20,display:"20%",subtitle:"Bluetooth"}]; '
        'cello._render(); "preview"')
    time.sleep(0.7)
    screenshot(artifacts / 'public-preview.png')
    evaluate('cello.disable(); cello.enable(); "cycled"')
    time.sleep(0.5)
    assert evaluate('!!cello._card') is True
    results['disable_enable'] = True
    time.sleep(4)
    # Count real requests/rebuilds across a period longer than the former 20s poll.
    evaluate('global.activity={snapshots:0,rebuilds:0,changes:[]}; global.initialRenderKey=cello._renderKey; '
        'global.oldRefresh=cello._source.refresh.bind(cello._source); '
        'cello._source.refresh=()=>{global.activity.snapshots++;global.oldRefresh();}; '
        'global.oldDestroy=cello._card.destroy_all_children.bind(cello._card); '
        'cello._card.destroy_all_children=()=>{global.activity.rebuilds++;global.activity.changes.push({before:global.initialRenderKey,after:cello._renderKey});global.initialRenderKey=cello._renderKey;global.oldDestroy();}; "counting"')
    time.sleep(22)
    activity = json.loads(evaluate('JSON.stringify(global.activity)'))
    assert activity['snapshots'] == 0, activity
    results['no_periodic_bluez_snapshot_22s'] = True
    results['no_rebuilds_when_unchanged_22s'] = activity['rebuilds'] == 0
    (artifacts / 'idle-activity.json').write_text(json.dumps({'seconds':22, **activity}, indent=2)+'\n')
    assert all(results.values()), results
    (artifacts / 'smoke-results.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps(results, indent=2))
finally:
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
    log.close()
