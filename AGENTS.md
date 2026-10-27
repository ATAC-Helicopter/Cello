# Cello development

Read README.md, CONTRIBUTING.md and docs/REVIEW.md before changing runtime behavior.

- Preserve the stable extension UUID and local preferences.
- Use `npm ci`, `npm run translations`, `npm run lint`, `npm run test:bluez`, and the isolated desktop smoke test for relevant changes. Never evaluate test instrumentation in the user's running Shell.
- Keep the extension passive toward Bluetooth hardware; use cached data and events, with no periodic polling loop or forced connections.
- Clean up sources, signals, objects and async operations on disable.
- Keep publication claims tied to actual evidence. Only GNOME Shell 46 is qualified. Synthetic devices and activity counts are not hardware autonomy measurements.
- Keep private screenshots, logs, backups, addresses and workstation data out of Git. Public media must use the project's original background and clearly identify simulated readings.
- Run `tools/package.sh` before release and verify the archive. Publish only the verified artifact, with the GPL license and compiled translations included.

## Risk-based targeted tests (mandatory)
- Never run a full test suite, solution-wide build, repository-wide lint/typecheck, or repeated test cycles automatically for every edit. Conserve execution time and tokens.
- First assess changed files and realistic regression risk. For docs, copy, comments, formatting, and clearly non-behavioral changes, skip automated tests unless a specific gate requires them; inspect the diff.
- For code affecting behavior, choose only the smallest relevant existing tests/filters/packages/assemblies; run once at a meaningful checkpoint, not after every tiny change. Avoid redundant restores and installs.
- If no relevant automated test exists, perform a focused feasible check and report what remains unverified; do not run unrelated suites to claim coverage.
- Broaden testing only for significant shared/core refactors, security/privacy, migrations, releases, targeted failures suggesting wider impact, explicit requests, or mandatory CI/release gates. Explain the escalation.
- Treat generic existing “run tests/build before commit” wording as targeted, risk-based verification for changed code, except genuinely mandatory security/CI/release gates.
- Report checks performed, intentional skips, and residual risk. Never imply skipped tests passed.
