# Security

Please use GitHub's private vulnerability reporting for security-sensitive reports. Include the affected release, GNOME Shell version and a minimal reproduction. Do not include device addresses, credentials or unrelated desktop data.

Cello has no network endpoint, accounts or telemetry. It reads battery information from the local BlueZ service and an optional local bridge snapshot. It does not issue hardware commands. A compromised desktop, BlueZ installation or external bridge is outside Cello's trust boundary.

Public support is initially limited to GNOME Shell 46 and the latest Cello release. No response-time guarantee is made.
