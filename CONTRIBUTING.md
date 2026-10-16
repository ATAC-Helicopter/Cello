# Contributing

Cello targets GNOME Shell 46. Add another Shell version only after testing it; do not infer support from a syntax check.

Install development tools with `npm ci`, compile catalogs with `npm run translations`, then run:

```sh
npm run lint
bash -n install.sh uninstall.sh set-position.sh tools/package.sh
npm run test:bluez
npm run test:desktop
./tools/package.sh
```

Runtime dependencies are GNOME Shell, BlueZ and the GJS/Gio libraries supplied by the desktop. Node and npm are development-only dependencies. On Ubuntu 24.04 a test environment can use `gnome-shell gjs dbus-x11`.

The desktop smoke test creates an isolated D-Bus session and temporary settings/extension copy. Its unsafe-mode instrumentation must never be copied into the shipped code. Do not replace this test with commands evaluated in a user's active desktop.

The application must remain passive toward hardware: no discovery, pairing, connection attempts, GATT reads or HID writes. New behavior should use existing system cache/events, batch bursts and remove all sources, signals and objects on disable. Test event invalidation, optional dependencies and cancellation where relevant.

Report checks actually performed. Do not describe synthetic device fixtures as hardware measurements, claim zero power consumption or add unverified compatibility versions.

Changes should have a focused pull request with the behavior changed, validation and remaining limitations. Contributions are accepted under GPL-3.0-or-later. Preserve applicable attribution.
