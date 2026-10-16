# Cello development

Read README.md, CONTRIBUTING.md and docs/REVIEW.md before changing runtime behavior.

- Preserve the stable extension UUID and local preferences.
- Use `npm ci`, `npm run translations`, `npm run lint`, `npm run test:bluez`, and the isolated desktop smoke test for relevant changes. Never evaluate test instrumentation in the user's running Shell.
- Keep the extension passive toward Bluetooth hardware; use cached data and events, with no periodic polling loop or forced connections.
- Clean up sources, signals, objects and async operations on disable.
- Keep publication claims tied to actual evidence. Only GNOME Shell 46 is qualified. Synthetic devices and activity counts are not hardware autonomy measurements.
- Keep private screenshots, logs, backups, addresses and workstation data out of Git. Public media must use the project's original background and clearly identify simulated readings.
- Run `tools/package.sh` before release and verify the archive. Publish only the verified artifact, with the GPL license and compiled translations included.
