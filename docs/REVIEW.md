# GNOME Extensions review checklist

Reference: https://gjs.guide/extensions/review-guidelines/review-guidelines.html

This is a maintainer checklist, not GNOME approval.

- Runtime objects and subscriptions are created by `enable()` or by helpers called from it.
- `disable()` removes pending GLib sources, cancels reads/monitors, removes menus, disconnects signals and destroys actors. Async callbacks use cancellation/generation guards.
- No Gtk, Gdk or Adw is imported into Shell; GdkPixbuf is used for image decoding.
- Runtime JavaScript is readable, unminified and checked by ESLint. Maintainers must understand and explain it; generated code is not exempt from review.
- No subprocess, telemetry, network service or privileged operation is used by the extension.
- Only user session mode is used. The screen lock does not need the widget.
- Metadata declares stable GNOME 46, the real source URL and gettext domain. The portal assigns its own version; no internal `version` field is shipped.
- GPL-3.0-or-later text is included in the ZIP. The widget source supplied by the maintainer is covered by the maintainer's publication authorization; no external bridge implementation is distributed. See `NOTICE.md`.
- Icons come from the installed theme. The public screenshot uses an original SVG background and explicitly simulated data.
- The ZIP contains runtime JS, stylesheet, metadata, compiled translations and license. Development dependencies, scripts, tests, backups and promotional media stay out of it.
- The optional bridge is absent by default and does not prevent ordinary Bluetooth operation. Hardware commands are not issued.
- Event, cleanup, empty-state, bridge monitoring, stale expiry and virtual-pointer tests are included. Real device autonomy and additional Shell versions are not claimed.

## Remaining external steps

GNOME Extensions requires an authenticated account and a review of the uploaded ZIP. A GitHub release is not an extension-store approval. Do not add an installation badge until the real listing exists.
