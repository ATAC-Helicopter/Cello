// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const DEVICE = 'org.bluez.Device1';
const BATTERY = 'org.bluez.Battery1';
const OBJECTS = 'org.freedesktop.DBus.ObjectManager';
const PROPERTIES = 'org.freedesktop.DBus.Properties';

// Read BlueZ's local cache and listen for changes. No discovery, connections,
// GATT reads, HID writes, or periodic Bluetooth requests are performed here.
export class BatterySource {
    constructor(onChanged, connection = Gio.DBus.system) {
        this._onChanged = onChanged;
        this._objects = {};
        this._subscriptions = [];
        this._generation = 0;
        this._pending = null;
        this._cancellable = new Gio.Cancellable();
        this._bus = connection;
        this._subscriptions.push(this._bus.signal_subscribe('org.bluez', OBJECTS,
            'InterfacesAdded', '/', null, Gio.DBusSignalFlags.NONE,
            (_bus, _sender, _path, _interface, _signal, parameters) => {
                const [path, interfaces] = parameters.deep_unpack();
                this._change(['add', path, interfaces]);
            }));
        this._subscriptions.push(this._bus.signal_subscribe('org.bluez', OBJECTS,
            'InterfacesRemoved', '/', null, Gio.DBusSignalFlags.NONE,
            (_bus, _sender, _path, _interface, _signal, parameters) => {
                const [path, interfaces] = parameters.deep_unpack();
                this._change(['remove', path, interfaces]);
            }));
        this._subscriptions.push(this._bus.signal_subscribe('org.bluez', PROPERTIES,
            'PropertiesChanged', null, null, Gio.DBusSignalFlags.NONE,
            (_bus, _sender, path, _interface, _signal, parameters) => {
                const [iface, changed, invalidated] = parameters.deep_unpack();
                if (iface === DEVICE || iface === BATTERY)
                    this._change(['properties', path, iface, changed, invalidated]);
            }));
        this._watch = Gio.bus_watch_name_on_connection(this._bus, 'org.bluez',
            Gio.BusNameWatcherFlags.NONE, () => this.refresh(), () => {
                this._generation++;
                this._pending = null;
                this._objects = {};
                this._onChanged(this._objects);
            });
    }

    _change(change) {
        if (this._pending)
            this._pending.push(change);
        else if (this._apply(change))
            this._onChanged(this._objects);
    }

    _apply([kind, path, data, changed, invalidated]) {
        if (kind === 'add') {
            const relevant = Object.fromEntries(Object.entries(data)
                .filter(([iface]) => iface === DEVICE || iface === BATTERY));
            if (!Object.keys(relevant).length)
                return false;
            this._objects[path] = {...this._objects[path], ...relevant};
        } else if (kind === 'remove') {
            if (!this._objects[path])
                return false;
            for (const iface of data)
                delete this._objects[path][iface];
            if (!Object.keys(this._objects[path]).length)
                delete this._objects[path];
        } else {
            const properties = this._objects[path]?.[data];
            if (!properties)
                return false;
            Object.assign(properties, changed);
            for (const property of invalidated)
                delete properties[property];
        }
        return true;
    }

    refresh() {
        if (this._cancellable.is_cancelled() || this._pending)
            return;
        const generation = ++this._generation;
        this._pending = [];
        this._bus.call('org.bluez', '/', OBJECTS, 'GetManagedObjects', null,
            new GLib.VariantType('(a{oa{sa{sv}}})'), Gio.DBusCallFlags.NO_AUTO_START,
            3000, this._cancellable, (bus, result) => {
                let snapshot = {};
                try {
                    snapshot = bus.call_finish(result).deep_unpack()[0];
                } catch (_error) {
                    // Bluetooth may be disabled or unavailable. No retry loop.
                }
                if (this._cancellable.is_cancelled() || generation !== this._generation)
                    return;
                const pending = this._pending;
                this._pending = null;
                this._objects = {};
                for (const [path, interfaces] of Object.entries(snapshot))
                    this._apply(['add', path, interfaces]);
                for (const change of pending)
                    this._apply(change);
                this._onChanged(this._objects);
            });
    }

    destroy() {
        this._cancellable.cancel();
        Gio.bus_unwatch_name(this._watch);
        for (const subscription of this._subscriptions)
            this._bus.signal_unsubscribe(subscription);
        this._subscriptions = [];
        this._pending = null;
        this._objects = {};
        this._onChanged = null;
    }
}
