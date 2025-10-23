# Nimbus Buddy Notes

Nimbus is the desktop buddy that replaces the old dashboard canvas. Treat it as a
permanent resident on the screen, not as an applet. Every interaction that launches
applets or manipulates Nimbus should respect the following guardrails:

- **Isolated applets:** Never pull applet scripts or styles directly into Nimbus.
  Everything runs through sandboxed iframes, launched on demand.
- **Skin system:** Visual customisations must be implemented via data attributes,
  CSS variables, and assets within `./assets`. Adding a new skin should not require
  JavaScript rewrites; aim for configuration-driven swaps.
- **UX tone:** Keep Nimbus subtle, friendly, and low-contrast. Avoid loud gradients,
  glassmorphism clones, or nostalgic purple palettes. Nimbus should feel at home on
  modern desktops without screaming for attention.
- **Draggability/minimise:** The shell should be draggable across the viewport and able
  to collapse into a compact badge. Persist state as needed (localStorage is acceptable
  once we define a policy) but ensure Nimbus always restores gracefully.
- **Accessibility:** Buttons must remain keyboard-focusable, menu items require ARIA
  states, and error states should include readable text.

When expanding this folder, document any non-trivial design decisions here and keep the
YAML summary aligned. Avoid reusing the "Cirrus" label in UI copy; the buddy's canonical
name is **Nimbus**.
