# Nimbus Skin Library

Nimbus supports cosmetic skins that reshape the buddy's atmosphere without touching its
behaviour. Each skin is expressed through CSS variables scoped to the `data-skin`
attribute on the root shell element. Swapping skins is as simple as updating that
attribute — JavaScript only keeps track of the active choice so it can be restored
between sessions.

## Available skins

| Skin key | Description |
| --- | --- |
| `cumulus` | Airy palette with soft blues and daylight glow. This is the shipping default. |
| `aurora-drift` | Night-sky bloom with neon cheeks and turquoise audio controls for an after-hours vibe. |
| `sage-lantern` | Verdant lantern glow with leaf-like silhouette, warm amber cheeks, and mossy controls for a grounded feel. |
| `robot-overdrive` | Polished chrome shell with cyan circuitry, holo glow, and industrial shadows for a retro-futuristic companion. |
| `mist-harbor` | Fog-washed shoreline blues with sea-glass trim and gentle coral blush for a calm coastal companion. |
| `cubic-cadet` | Blocky ember chassis with squared edges, flexing arm panels, and sunny circuitry accents for a retro arcade cadet. |

Run-time helpers expose the available keys in case you want to wire a settings toggle:

```js
window.nimbusSkins.list(); // ["cumulus", "aurora-drift", "sage-lantern", "robot-overdrive", "mist-harbor", "cubic-cadet"]
window.nimbusSkins.current(); // returns the currently applied skin key
window.nimbusSkins.apply('mist-harbor'); // switches skin and persists the choice
```

You can also preview a skin by appending `?skin=aurora-drift` to the Nimbus URL.

## Building a new skin

1. **Define the visual vocabulary.** Pick a succinct key name (kebab-case) and describe
the tone in `docs/skins.md` so future contributors know what to expect.
2. **Add a CSS variable block.** Inside `nimbus/nimbus.css`, create a selector of the
form `.nimbus-shell[data-skin='your-key']` and override the skin variables.
   - Keep changes scoped to variables such as `--skin-buddy-body-bg`,
     `--skin-chat-toggle-bg`, and `--skin-voice-toggle-shadow`.
   - If you need bespoke artwork, store it under `nimbus/assets/` and reference it from
your CSS block only.
3. **Register the skin.** Extend the `AVAILABLE_SKINS` set in `nimbus/nimbus.js` so the
runtime exposes the new key and persists it.
4. **Document any quirks.** Update this page with a one-line description and link to any
additional notes or assets.

Skins should remain cosmetic. Avoid JavaScript rewrites, maintain accessibility (contrast,
focus states, ARIA labels), and leave the chat/app tray workflows untouched.

## Agent guardrails for skin authors

- Stay within the CSS variable system; avoid editing structural selectors outside your
skin block unless you are improving the base experience for every skin.
- Prefer calm, legible palettes. Nimbus is meant to be a gentle companion, not a rave.
- Reuse existing SVG assets when possible to minimise bundle size. When introducing new
artwork, include source credits or generation notes in `docs/skins.md`.
- Keep the buddy recognisable — proportions, eyes, and core silhouette should remain.
