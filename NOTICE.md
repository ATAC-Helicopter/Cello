# Licensing and provenance

Cello is distributed under GPL-3.0-or-later. The full license is in `LICENSE` and is included in the extension bundle.

The project began from the desktop widget source supplied by the maintainer, then developed into Cello in this workspace. The original folder had no license or third-party attribution files. The maintainer authorized preparing and publishing the project. The desktop integration uses GNOME Shell APIs; icons are provided by the user's installed icon theme. No third-party extension, proprietary application code, Apple artwork or Keychron firmware is included.

The optional Keychron integration reads a local JSON snapshot. The external bridge, firmware, hardware-specific service and their dependencies are not shipped or installed by Cello. Their licenses and behavior are independent.

`assets/preview-wallpaper.svg` was created for this project and is distributed under the project license. The public preview is captured from the real widget with clearly marked simulated readings. Screenshots and backups from the private desktop are excluded from the repository.

Development tooling is installed through the locked npm dependencies. It is not included in the extension or loaded by GNOME Shell.
