# Applet Development Notes

Every applet operates as a sandboxed experience launched by Nimbus. Follow these
expectations when introducing a new applet:

- Place HTML, CSS, JS, and asset files entirely within the applet folder.
- Provide an `applet.json` file with metadata (`slug`, `name`, `description`, `entry`,
  `icon`, `version`, `lastUpdated`, `tags`, and optional `permissions`).
- Document intent, boundaries, and UX guidance in the applet's own agents files.
- Avoid relying on Nimbus internals; use window messaging if coordination is required.
- Keep bundle sizes reasonable and avoid heavyweight frameworks unless justified.

When bootstrapping a new applet, copy a starter template into the folder, update the
metadata, add yourself to the `author` field, and register the relative path in the
root `applets.json`.
