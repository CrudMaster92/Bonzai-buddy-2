# Nimbus Buddy Dashboard

Nimbus Buddy is a playful desktop companion that doubles as the launcher for every
self-contained applet in this repository. Instead of a traditional dashboard view,
users interact with Nimbus directly: dragging it around the screen, toggling the menu,
and launching applets from an automatically generated list sourced from `applets.json`.

## Repository Layout

```
root/
├── nimbus/            # Core buddy shell that renders the launcher UI
│   ├── index.html
│   ├── nimbus.js
│   ├── nimbus.css
│   ├── agents.md
│   ├── agents.yaml
│   └── assets/
├── applets/           # Folder where sandboxed applets live
│   ├── agents.md
│   └── agents.yaml
├── applets.json       # Registry that Nimbus reads to populate the menu
└── README.md
```

## Getting Started

1. Open `nimbus/index.html` in a browser to preview the buddy scaffold.
2. Populate `applets.json` with entries that point to individual applet folders.
3. Create a new folder under `applets/` for each mini-app, including `agents.*` files and
   an `applet.json` descriptor.

## Skins and Customisation

Nimbus supports cosmetic skins via the `data-skin` attribute on the root element and
CSS variables defined in `nimbus.css`. Add artwork or animation frames to
`nimbus/assets/` and reference them through the relevant skin rules. Updating the skin
should not require JavaScript changes.

## Contributing

- Keep Nimbus lightweight and dependency-free.
- Maintain strict separation between Nimbus and applet code.
- Document new behaviours in the relevant `agents.md` file so future contributors have
  clear guardrails to follow.
