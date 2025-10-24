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

## Chat-forward shell

Nimbus now presents as a chat workspace with a message timeline, composer, and tray
settings. When extending or refactoring the UI, keep the following rules in mind:

- **Conversation state lives in Nimbus.** Messages flow through `nimbus.js`; new code
  must preserve the `data-role` structure so author/system/app messages can be styled.
- **Tray menu controls API credentials.** The tray toggle reveals inputs for ChatGPT
  API configuration. Future changes should reuse the existing settings panel rather
  than scattering inputs across the shell.
- **Inline applet mentions.** Typing `@` inside the composer opens the applet search
  list. Filtering, keyboard navigation, and launching are all handled in
  `setupMentionHandling`. Do not bypass this hook when adding new composer features.
- **Applet execution stays sandboxed.** Selecting a suggestion loads the applet inside
  the dedicated iframe host. The mention list simply resolves the target applet ID;
  do not inject applet markup into the chat stream.
- **Iframe host etiquette.** The right-side host swaps between loaded applets and the
  empty state. Ensure new behaviours keep the iframe URL and title attributes synced
  with the selected applet metadata.

When expanding this folder, document any non-trivial design decisions here and keep the
YAML summary aligned. Avoid reusing the "Cirrus" label in UI copy; the buddy's canonical
name is **Nimbus**.

## Desktop shell bridge

Nimbus now expects to run inside the Electron tray wrapper under `/desktop`. All network
traffic for the OpenAI Responses and Models APIs flows through the preload bridge
(`window.desktopAPI`). The renderer no longer reads or stores the raw API key. When
working in this folder:

- Treat `nimbus.js` as the authoritative client for talking to the preload bridge. Do
  not reintroduce direct `fetch` calls for OpenAI endpoints; instead, add IPC hooks in
  the desktop shell if extra behaviour is required.
- Settings panels should assume the key can only be masked or replaced. Avoid adding new
  UI that attempts to reveal the stored key inside the page.
- Registry reads now come through the bridge when the desktop shell is present. Keep the
  fallback `fetch` logic intact for browser previews.
