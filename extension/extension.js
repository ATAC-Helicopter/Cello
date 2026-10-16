// SPDX-License-Identifier: GPL-3.0-or-later
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Cairo from 'cairo';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import GdkPixbuf from 'gi://GdkPixbuf';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {BatterySource} from './batterySource.js';
import {Extension, gettext as _, ngettext} from 'resource:///org/gnome/shell/extensions/extension.js';

const STATE = '/run/keychron-battery/state.json';
const CONFIG = `${GLib.get_user_config_dir()}/keychron-batteries-widget.json`;
const VALID_POSITIONS = new Set(['top-right', 'top-left', 'bottom-right', 'bottom-left']);


function readJson(path, fallback) {
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        if (ok)
            return JSON.parse(new TextDecoder().decode(bytes));
    } catch (_error) {
    }
    return fallback;
}

function writeJson(path, obj) {
    try {
        GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o755);
        GLib.file_set_contents(path, JSON.stringify(obj));
    } catch (e) {
        console.warn(`Keychron widget: unable to write config: ${e.message}`);
    }
}

function scalar(v) {
    return v && typeof v.deep_unpack === 'function' ? v.deep_unpack() : v;
}

function finitePercentage(v) {
    const n = scalar(v);
    return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100
        ? Math.round(n) : null;
}

function clamp(x, a, b) {
    return Math.max(a, Math.min(b, x));
}

function rgba([r, g, b], a) {
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}

function mix(a, b, t) {
    return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
    ];
}

function levelColor(pct) {
    if (pct === null)
        return [150, 156, 168];
    if (pct <= 15)
        return [236, 102, 102];
    if (pct <= 30)
        return [241, 180, 85];
    return [48, 209, 88];
}

function typeFor(name) {
    const n = name.toLowerCase();
    if (/keychron|keyboard|tastiera/.test(n))
        return 'input-keyboard-symbolic';
    if (/dual|controller|gamepad|xbox|playstation|joy-con/.test(n))
        return 'input-gaming-symbolic';
    if (/head|urbanite|sennheiser|buds|airpods|audio|sony|jbl/.test(n))
        return 'audio-headphones-symbolic';
    if (/mouse|mx master|trackball/.test(n))
        return 'input-mouse-symbolic';
    return 'bluetooth-active-symbolic';
}

function keychronDevice(s) {
    if (!s || typeof s.mac !== 'string')
        return null;
    const connected = s.connected === true;
    const usb = connected && s.usb_connected === true;
    const stale = s.reading_stale === true || (Number.isFinite(s.updated_at) &&
        GLib.get_real_time() / 1000000 - s.updated_at > 180);
    const pct = connected && !usb && !stale
        ? finitePercentage(s.percentage) : null;
    let subtitle = _('Disconnected');
    if (connected && usb)
        subtitle = 'USB';
    else if (connected && stale)
        subtitle = _('Waiting for a reading');
    else if (connected && pct === null)
        subtitle = _('Reading…');
    else if (connected)
        subtitle = _('Estimated');
    return {
        name: String(s.device || 'Keychron K10 Pro'),
        address: s.mac.toUpperCase(),
        icon: 'input-keyboard-symbolic',
        pct,
        approx: true,
        display: usb ? 'USB' : (pct === null ? '—' : `~${pct}%`),
        subtitle,
    };
}

function bluezDevices(objects, bridgeAddress) {
    const result = [];
    for (const ifaces of Object.values(objects ?? {})) {
        const dev = ifaces['org.bluez.Device1'];
        if (!dev || scalar(dev.Connected) !== true)
            continue;
        const address = String(scalar(dev.Address) ?? '').toUpperCase();
        if (!address || address === bridgeAddress)
            continue;
        const name = String(scalar(dev.Alias) ?? scalar(dev.Name) ?? address);
        const battery = ifaces['org.bluez.Battery1'];
        const pct = battery ? finitePercentage(battery.Percentage) : null;
        result.push({
            name,
            address,
            icon: typeFor(name),
            pct,
            approx: false,
            display: pct === null ? '—' : `${pct}%`,
            subtitle: pct === null ? _('Unavailable') : 'Bluetooth',
        });
    }
    return result.sort((a, b) => (b.pct !== null) - (a.pct !== null)
        || a.name.localeCompare(b.name)).slice(0, 6);
}

function sampleWallpaperColor(pixbuf, mode, rect, monitor) {
    try {
        if (!pixbuf)
            return [28, 33, 44];
        const pixels = pixbuf.get_pixels();
        const rowstride = pixbuf.get_rowstride();
        const nChannels = pixbuf.get_n_channels();
        const width = pixbuf.get_width();
        const height = pixbuf.get_height();
        let left = 0, top = 0, right = width, bottom = height;
        if (rect && monitor) {
            const target = mode === 'spanned'
                ? {x: 0, y: 0, width: global.screen_width, height: global.screen_height} : monitor;
            const factor = mode === 'scaled'
                ? Math.min(target.width / width, target.height / height)
                : Math.max(target.width / width, target.height / height);
            const sx = mode === 'stretched' ? target.width / width : factor;
            const sy = mode === 'stretched' ? target.height / height : factor;
            const ox = target.x + (target.width - width * sx) / 2;
            const oy = target.y + (target.height - height * sy) / 2;
            // Tiled/centered/XML backgrounds use the representative image fallback.
            if (['zoom', 'scaled', 'stretched', 'spanned'].includes(mode)) {
                left = clamp(Math.floor((rect.x - ox) / sx), 0, width - 1);
                top = clamp(Math.floor((rect.y - oy) / sy), 0, height - 1);
                right = clamp(Math.ceil((rect.x + rect.width - ox) / sx), left + 1, width);
                bottom = clamp(Math.ceil((rect.y + rect.height - oy) / sy), top + 1, height);
            }
        }
        let r = 0, g = 0, b = 0, count = 0;
        for (let y = top; y < bottom; y++) {
            for (let x = left; x < right; x++) {
                const i = y * rowstride + x * nChannels;
                const pr = pixels[i], pg = pixels[i + 1], pb = pixels[i + 2];
                r += pr;
                g += pg;
                b += pb;
                count++;
            }
        }
        if (count === 0)
            return [28, 33, 44];
        const avg = [r / count, g / count, b / count];
        return avg;
    } catch (e) {
        console.debug(`Keychron widget: wallpaper color fallback: ${e.message}`);
        return [28, 33, 44];
    }
}

export default class Cello extends Extension {
    enable() {
        this._active = true;
        this._bluez = [];
        this._objects = {};
        this._bridgeState = null;
        this._renderKey = null;
        this._themeRevision = 0;
        this._stateReadGeneration = 0;
        this._wallpaperGeneration = 0;
        this._signals = [];
        this._cancellable = new Gio.Cancellable();
        this._config = this._loadConfig();
        this._baseColor = [28, 33, 44];
        this._card = new St.BoxLayout({
            style_class: 'cello-card', vertical: true,
            reactive: true, can_focus: true, track_hover: true,
            accessible_name: _('Cello · Batteries'),
        });
        // Desktop icon surfaces are windows, above the wallpaper group.
        // Keep Cello above those surfaces, below ordinary application windows.
        global.window_group.add_child(this._card);
        Main.layoutManager.trackChrome(this._card, {affectsInputRegion: true});
        this._card.connect('button-press-event', (_actor, event) => {
            if (event.get_button() !== 3)
                return Clutter.EVENT_PROPAGATE;
            this._menu.toggle();
            return Clutter.EVENT_STOP;
        });
        this._card.connect('key-press-event', (_actor, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Menu ||
                (event.get_key_symbol() === Clutter.KEY_F10 &&
                 event.get_state() & Clutter.ModifierType.SHIFT_MASK)) {
                this._menu.toggle();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this._buildMenu();
        this._connect(global.display, 'restacked', () => this._stack());
        this._connect(global.display, 'workareas-changed', () => this._queueRender());
        this._connect(Main.layoutManager, 'monitors-changed', () => this._queueRender());
        this._connect(Main.overview, 'showing', () => this._menu.close());
        this._wallpaperSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
        this._interfaceSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._connect(this._wallpaperSettings, 'changed', () => this._loadWallpaper());
        this._connect(this._interfaceSettings, 'changed::color-scheme', () => this._loadWallpaper());
        this._configMonitor = Gio.File.new_for_path(GLib.path_get_dirname(CONFIG))
            .monitor_directory(Gio.FileMonitorFlags.NONE, null);
        this._connect(this._configMonitor, 'changed', (_monitor, file) => {
            if (file.get_path() === CONFIG) {
                this._config = this._loadConfig();
                this._render();
            }
        });
        // Watching a missing file is supported; no runtime directory needs to
        // be created and no bridge/service is installed or started by Cello.
        this._stateMonitor = Gio.File.new_for_path(STATE).monitor_file(Gio.FileMonitorFlags.NONE, null);
        this._connect(this._stateMonitor, 'changed', () => this._queueStateRead());
        this._source = new BatterySource(objects => {
            this._objects = objects;
            this._syncDevices();
        });
        this._stack();
        this._loadWallpaper();
        this._readState();
        this._render();
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    disable() {
        this._active = false;
        for (const key of ['_renderSource', '_stateReadSource', '_staleSource']) {
            if (this[key])
                GLib.Source.remove(this[key]);
            this[key] = 0;
        }
        this._source?.destroy();
        this._source = null;
        this._stateMonitor?.cancel();
        this._stateMonitor = null;
        for (const [object, id] of this._signals ?? [])
            object.disconnect(id);
        this._signals = [];
        this._configMonitor?.cancel();
        this._configMonitor = null;
        this._cancellable?.cancel();
        this._cancellable = null;
        this._menuManager?.removeMenu(this._menu);
        this._menu?.destroy();
        this._menu = null;
        this._menuManager = null;
        this._card?.destroy();
        this._card = null;
        this._wallpaperSettings = null;
        this._interfaceSettings = null;
        this._bluez = [];
        this._objects = {};
        this._bridgeState = null;
        this._wallpaperPixbuf = null;
        this._wallpaperUri = null;
        this._options = [];
        this._config = null;
        this._renderKey = null;
        this._sampleKey = null;
    }

    _stack() {
        if (!this._card)
            return;
        const children = global.window_group.get_children();
        const desktop = children.filter(actor =>
            actor.meta_window?.get_window_type() === Meta.WindowType.DESKTOP);
        // Use compositor order, preserving ordinary windows and their effects.
        const anchor = desktop.at(-1) ?? children.find(actor =>
            actor !== this._card && !actor.meta_window);
        global.window_group.set_child_above_sibling(this._card, anchor ?? null);
        if (!anchor)
            global.window_group.set_child_below_sibling(this._card, null);
    }

    _loadConfig() {
        const data = readJson(CONFIG, {});
        return {
            position: VALID_POSITIONS.has(data?.position) ? data.position : 'top-left',
            appearance: ['auto', 'light', 'dark'].includes(data?.appearance) ? data.appearance : 'auto',
        };
    }

    _queueRender() {
        if (!this._active || this._renderSource)
            return;
        this._renderSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
            this._renderSource = 0;
            this._render();
            return GLib.SOURCE_REMOVE;
        });
    }

    _updateTheme() {
        this._themeRevision++;
        this._sampleKey = null;
        this._queueRender();
    }

    _loadWallpaper() {
        const dark = this._interfaceSettings.get_string('color-scheme') === 'prefer-dark';
        const uri = (dark && this._wallpaperSettings.get_string('picture-uri-dark')) ||
            this._wallpaperSettings.get_string('picture-uri');
        this._updateTheme();
        if (uri === this._wallpaperUri)
            return;
        this._wallpaperUri = uri;
        this._wallpaperPixbuf = null;
        const generation = ++this._wallpaperGeneration;
        const cancellable = this._cancellable;
        if (!uri)
            return;
        const file = uri.startsWith('file:') ? Gio.File.new_for_uri(uri) : Gio.File.new_for_path(uri);
        file.read_async(GLib.PRIORITY_LOW, cancellable, (source, result) => {
            let stream;
            try {
                stream = source.read_finish(result);
            } catch (_error) {
                return;
            }
            GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(stream, 128, 128, true,
                cancellable, (_source, decoded) => {
                    try {
                        const pixbuf = GdkPixbuf.Pixbuf.new_from_stream_finish(decoded);
                        if (!cancellable.is_cancelled() && generation === this._wallpaperGeneration) {
                            this._wallpaperPixbuf = pixbuf;
                            this._updateTheme();
                        }
                    } catch (_error) {
                        // XML slideshows/non-images retain the fallback tint.
                    } finally {
                        stream.close_async(GLib.PRIORITY_LOW, null, (input, closed) => {
                            try {
                                input.close_finish(closed);
                            } catch (_error) {
                                // A cancelled read may have closed the stream.
                            }
                        });
                    }
                });
        });
    }

    _queueStateRead() {
        if (!this._active || this._stateReadSource)
            return;
        this._stateReadSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
            this._stateReadSource = 0;
            this._readState();
            return GLib.SOURCE_REMOVE;
        });
    }

    _readState() {
        const cancellable = this._cancellable;
        const generation = ++this._stateReadGeneration;
        Gio.File.new_for_path(STATE).load_contents_async(cancellable, (file, result) => {
            let state = null;
            try {
                const [ok, bytes] = file.load_contents_finish(result);
                if (ok)
                    state = JSON.parse(new TextDecoder().decode(bytes));
            } catch (_error) {
                // The optional bridge may not be installed.
            }
            if (cancellable.is_cancelled() || generation !== this._stateReadGeneration)
                return;
            this._bridgeState = state;
            this._syncDevices();
            this._scheduleStale();
        });
    }

    _scheduleStale() {
        if (this._staleSource)
            GLib.Source.remove(this._staleSource);
        this._staleSource = 0;
        const state = this._bridgeState;
        if (!state?.connected || state.reading_stale || !Number.isFinite(state.updated_at))
            return;
        const remaining = state.updated_at + 181 - GLib.get_real_time() / 1000000;
        if (remaining <= 0)
            return;
        this._staleSource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, Math.ceil(remaining), () => {
            this._staleSource = 0;
            this._queueRender();
            return GLib.SOURCE_REMOVE;
        });
    }

    _syncDevices() {
        this._bluez = bluezDevices(this._objects, keychronDevice(this._bridgeState)?.address);
        this._queueRender();
    }

    _refresh() {
        this._source.refresh();
        this._queueStateRead();
    }

    _label(text, styleClass) {
        const label = new St.Label({text, style_class: styleClass,
            x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        return label;
    }

    _buildMenu() {
        this._menu = new PopupMenu.PopupMenu(this._card, 0.5, St.Side.TOP);
        this._menu.actor.add_style_class_name('cello-menu');
        Main.uiGroup.add_child(this._menu.actor);
        this._menu.actor.hide();
        this._menuManager = new PopupMenu.PopupMenuManager(this._card);
        this._menuManager.addMenu(this._menu);
        this._menu.addMenuItem(new PopupMenu.PopupMenuItem(_('Cello · Batteries'), {reactive: false}));
        const positions = new PopupMenu.PopupSubMenuMenuItem(_('Position'));
        const appearance = new PopupMenu.PopupSubMenuMenuItem(_('Appearance'));
        this._options = [];
        for (const [parent, key, entries] of [
            [positions, 'position', [['top-left', _('Top left')], ['top-right', _('Top right')],
                ['bottom-left', _('Bottom left')], ['bottom-right', _('Bottom right')]]],
            [appearance, 'appearance', [['auto', _('Automatic · from wallpaper')], ['light', _('Light')], ['dark', _('Dark')]]],
        ]) {
            for (const [value, label] of entries) {
                const item = parent.menu.addAction(label, () => {
                    this._config[key] = value;
                    writeJson(CONFIG, this._config);
                    this._menu.close();
                    this._render();
                });
                this._options.push({item, key, value});
            }
            this._menu.addMenuItem(parent);
        }
        this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._menu.addAction(_('Refresh batteries'), () => this._refresh());
        this._menu.connect('open-state-changed', (_menu, open) => {
            if (open) {
                for (const {item, key, value} of this._options)
                    item.setOrnament(this._config[key] === value
                        ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
            }
        });
    }

    _deviceTile(device, width) {
        const tile = new St.BoxLayout({vertical: true, style_class: 'cello-device',
            width, accessible_name: `${device.name}: ${device.display}, ${device.subtitle}`});
        const ring = new St.Widget({layout_manager: new Clutter.BinLayout(),
            style_class: 'cello-ring', x_align: Clutter.ActorAlign.CENTER});
        const drawing = new St.DrawingArea({x_expand: true, y_expand: true});
        drawing.connect('repaint', area => {
            const [w, h] = area.get_surface_size();
            const cr = area.get_context();
            const radius = Math.min(w, h) / 2 - 5;
            cr.setLineWidth(6);
            cr.setSourceRGBA(...(this._light ? [0, 0, 0, 0.09] : [1, 1, 1, 0.12]));
            cr.arc(w / 2, h / 2, radius, 0, 2 * Math.PI);
            cr.stroke();
            if (device.pct !== null && device.pct > 0) {
                const color = levelColor(device.pct).map(v => v / 255);
                cr.setSourceRGBA(...color, 1);
                cr.setLineCap(Cairo.LineCap.ROUND);
                cr.arc(w / 2, h / 2, radius, -Math.PI / 2,
                    -Math.PI / 2 + Math.PI * 2 * device.pct / 100);
                cr.stroke();
            }
            cr.$dispose();
        });
        ring.add_child(drawing);
        ring.add_child(new St.Icon({icon_name: device.icon, icon_size: 28,
            x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER}));
        tile.add_child(ring);
        tile.add_child(this._label(device.display, 'cello-percentage'));
        tile.add_child(this._label(device.name, 'cello-device-name'));
        tile.add_child(this._label(device.subtitle, 'cello-device-status'));
        return tile;
    }

    _render() {
        if (!this._active || !this._card)
            return;
        const monitor = Main.layoutManager.primaryIndex;
        if (monitor < 0)
            return;
        const work = Main.layoutManager.getWorkAreaForMonitor(monitor);
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const bridge = keychronDevice(this._bridgeState);
        const devices = [bridge, ...this._bluez].filter(Boolean).slice(0, 6);
        const renderKey = JSON.stringify([devices, this._config, work.x, work.y, work.width,
            work.height, scale, this._themeRevision]);
        if (renderKey === this._renderKey)
            return;
        this._renderKey = renderKey;
        const available = Math.max(1, work.width / scale - 48);
        const columns = Math.max(1, Math.min(Math.max(1, devices.length), 4, Math.floor((available - 24) / 108)));
        const width = Math.min(available, Math.max(236, columns * 108 + 32));
        const tileWidth = Math.floor((width - 32 - (columns - 1) * 8) / columns);
        this._card.set_style(`width: ${width}px;`);
        this._card.destroy_all_children();
        const header = new St.BoxLayout({style_class: 'cello-header'});
        const title = this._label(_('Batteries'), 'cello-title');
        title.x_align = Clutter.ActorAlign.START;
        title.x_expand = true;
        header.add_child(title);
        const menuButton = new St.Button({style_class: 'cello-menu-trigger',
            child: new St.Icon({icon_name: 'view-more-symbolic', icon_size: 18}),
            can_focus: true, track_hover: true, accessible_name: _('Cello options')});
        menuButton.connect('clicked', () => this._menu.toggle());
        header.add_child(menuButton);
        this._card.add_child(header);
        for (let offset = 0; offset < devices.length; offset += columns) {
            const row = new St.BoxLayout({style_class: 'cello-row', x_align: Clutter.ActorAlign.CENTER});
            devices.slice(offset, offset + columns).forEach(d => row.add_child(this._deviceTile(d, tileWidth)));
            this._card.add_child(row);
        }
        if (devices.length === 0) {
            const empty = new St.BoxLayout({vertical: true, style_class: 'cello-empty'});
            empty.add_child(new St.Icon({icon_name: 'bluetooth-active-symbolic', icon_size: 32,
                x_align: Clutter.ActorAlign.CENTER}));
            empty.add_child(this._label(_('No devices connected'), 'cello-device-name'));
            this._card.add_child(empty);
        }
        const footer = new St.BoxLayout({style_class: 'cello-footer'});
        const brand = this._label('CELLO', 'cello-brand');
        brand.x_align = Clutter.ActorAlign.START;
        brand.x_expand = true;
        brand.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        footer.add_child(brand);
        footer.add_child(this._label(ngettext('%d device', '%d devices', devices.length).format(devices.length), 'cello-count'));
        this._card.add_child(footer);
        // Theme CSS uses logical pixels; Clutter coordinates use stage pixels.
        this._card.set_size(-1, -1);
        const naturalWidth = this._card.get_preferred_width(-1)[1];
        const naturalHeight = this._card.get_preferred_height(naturalWidth)[1];
        const fit = Math.min(1, (work.width - 24 * scale) / naturalWidth,
            (work.height - 24 * scale) / naturalHeight);
        this._card.set_pivot_point(0, 0);
        this._card.set_scale(Math.max(0.1, fit), Math.max(0.1, fit));
        this._card.set_size(naturalWidth, naturalHeight);
        const margin = 24 * scale;
        const x = this._config.position.endsWith('right')
            ? work.x + work.width - naturalWidth * fit - margin : work.x + margin;
        const y = this._config.position.startsWith('bottom')
            ? work.y + work.height - naturalHeight * fit - margin : work.y + margin;
        this._card.set_position(Math.round(Math.max(work.x, x)), Math.round(Math.max(work.y, y)));
        const rect = {x: Math.max(work.x, x), y: Math.max(work.y, y),
            width: naturalWidth * fit, height: naturalHeight * fit};
        const screen = Main.layoutManager.primaryMonitor;
        const sampleKey = JSON.stringify([rect, screen.x, screen.y, screen.width, screen.height]);
        if (this._sampleKey !== sampleKey) {
            this._baseColor = sampleWallpaperColor(this._wallpaperPixbuf,
                this._wallpaperSettings.get_string('picture-options'), rect, screen);
            this._sampleKey = sampleKey;
        }
        const luminance = this._baseColor.reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
        this._light = this._config.appearance === 'light' ||
            (this._config.appearance === 'auto' && luminance > 155);
        const tint = mix(this._baseColor, this._light ? [255, 255, 255] : [18, 20, 25], 0.88);
        this._card.style_class = `cello-card ${this._light ? 'cello-light' : 'cello-dark'}`;
        this._card.set_style(`background-color: ${rgba(tint, 0.96)}; width: ${width}px;`);

    }
}
