# GNOME Extensions submission material

Status: submitted on 2026-10-16; portal version 1 for GNOME Shell 46 is **Unreviewed**, as shown in the maintainer-provided portal screenshot. [Submission #11286](https://extensions.gnome.org/extension/11286/cello-desktop-batteries/). Not approved; the anonymous URL currently returns HTTP 404. The screenshot has been uploaded. The description should retain the complete product explanation below, including the simulated-readings disclosure.

| Field | Value |
| --- | --- |
| Name | Cello — Desktop Batteries |
| UUID | `keychron-batteries-widget@fglabs.local` |
| Source / issue tracker | https://github.com/ATAC-Helicopter/Cello |
| Supported Shell | 46 |
| License | GPL-3.0-or-later |
| Primary image | `docs/media/releases/v0.1.0-rc.1/01-overview.png` |
| Secondary images | `02-light.png`, `03-context-menu.png`, `06-six-devices.png` |

## Description to paste

Cello brings your Bluetooth device batteries to the GNOME desktop. See charge rings, clear percentages and device icons in a compact widget that adapts to your wallpaper. Choose automatic, light or dark appearance and place it in any desktop corner.

Cello listens to battery information already available in BlueZ. It does not scan, pair, connect or issue battery queries to your devices. Battery availability depends on what each device and BlueZ report. An existing Keychron battery bridge can optionally supply its estimated reading.

Tested on GNOME Shell 46. English and Italian are included. No account, telemetry or network service is used by the widget. Screenshots show the actual interface with explicitly simulated device readings.

## Submission files

Use the installable `.shell-extension.zip` and checksum from the GitHub release. The media/documentation kit is an attachment for maintainers and users, not the extension to upload to GNOME. Do not put tests, installers, screenshots or development tools into the extension ZIP.

Use the authenticated [upload page](https://extensions.gnome.org/upload/) and track review feedback in [issue #1](https://github.com/ATAC-Helicopter/Cello/issues/1). Do not invent a listing URL, review result or installation badge.
