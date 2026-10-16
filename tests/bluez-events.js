import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {BatterySource} from '../extension/batterySource.js';

// This fake daemon exists only on the private session bus made by the command
// below. It never accesses the machine's system BlueZ or Bluetooth hardware.
const bus = Gio.DBus.session;
const loop = new GLib.MainLoop(null, false);
const DEVICE = 'org.bluez.Device1';
const BATTERY = 'org.bluez.Battery1';
const path = '/org/bluez/hci0/dev_00_11_22_33_44_55';
let snapshots = 0;
let notifications = 0;
let current = {};
const daemon = Gio.DBusExportedObject.wrapJSObject(`<node>
<interface name="org.freedesktop.DBus.ObjectManager">
<method name="GetManagedObjects"><arg type="a{oa{sa{sv}}}" direction="out"/></method>
</interface></node>`, {
    GetManagedObjects() {
        snapshots++;
        return {[path]: {
            [DEVICE]: {Connected: new GLib.Variant('b', true), Alias: new GLib.Variant('s', 'Test mouse')},
            [BATTERY]: {Percentage: new GLib.Variant('y', 80)},
        }};
    },
});
daemon.export(bus, '/');
let owner = Gio.bus_own_name_on_connection(bus, 'org.bluez', Gio.BusNameOwnerFlags.NONE, null, null);
const source = new BatterySource(objects => {
    notifications++;
    current = objects;
}, bus);
const pause = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve();
    return GLib.SOURCE_REMOVE;
}));
function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}
async function run() {
    await pause(250);
    assert(snapshots === 1, `Expected one startup snapshot, got ${snapshots}`);
    assert(current[path][BATTERY].Percentage.deep_unpack() === 80, 'Missing initial cache');
    bus.emit_signal(null, path, 'org.freedesktop.DBus.Properties', 'PropertiesChanged',
        new GLib.Variant('(sa{sv}as)', [BATTERY, {Percentage: new GLib.Variant('y', 42)}, []]));
    await pause(80);
    assert(current[path][BATTERY].Percentage.deep_unpack() === 42, 'Battery event did not update cache');
    assert(snapshots === 1, 'Battery change caused a snapshot');
    bus.emit_signal(null, path, 'org.freedesktop.DBus.Properties', 'PropertiesChanged',
        new GLib.Variant('(sa{sv}as)', [BATTERY, {}, ['Percentage']]));
    await pause(80);
    assert(!('Percentage' in current[path][BATTERY]), 'Invalidated value stayed visible');
    bus.emit_signal(null, '/', 'org.freedesktop.DBus.ObjectManager', 'InterfacesRemoved',
        new GLib.Variant('(oas)', [path, [BATTERY]]));
    await pause(80);
    assert(!current[path][BATTERY], 'Removed battery stayed visible');
    bus.emit_signal(null, '/', 'org.freedesktop.DBus.ObjectManager', 'InterfacesAdded',
        new GLib.Variant('(oa{sa{sv}})', [path, {[BATTERY]: {Percentage: new GLib.Variant('y', 65)}}]));
    await pause(80);
    assert(current[path][BATTERY].Percentage.deep_unpack() === 65, 'Added battery not visible');
    Gio.bus_unown_name(owner);
    await pause(100);
    assert(Object.keys(current).length === 0, 'Daemon loss did not clear cache');
    owner = Gio.bus_own_name_on_connection(bus, 'org.bluez', Gio.BusNameOwnerFlags.NONE, null, null);
    await pause(150);
    assert(snapshots === 2, 'Daemon restart did not resynchronise once');
    source.refresh();
    source.refresh();
    await pause(100);
    assert(snapshots === 3, 'Parallel manual refresh was not coalesced');
    const before = notifications;
    source.destroy();
    bus.emit_signal(null, path, 'org.freedesktop.DBus.Properties', 'PropertiesChanged',
        new GLib.Variant('(sa{sv}as)', [BATTERY, {Percentage: new GLib.Variant('y', 99)}, []]));
    await pause(80);
    assert(notifications === before, 'Callback ran after destroy');
    print(JSON.stringify({total_snapshots: snapshots, notifications, daemon_restart: true, coalesced_refresh: true,
        property_update: true, invalidation: true, removal: true, addition: true, cleanup: true}));
}
let failed = null;
run().catch(error => { failed = error; }).finally(() => loop.quit());
loop.run();
Gio.bus_unown_name(owner);
daemon.unexport();
if (failed)
    throw failed;
