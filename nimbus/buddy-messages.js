// Edit this list to customise what Nimbus says while the chat is closed.
export const IDLE_CHAT_MESSAGES = [
  'Nimbus just saw a cloud that looks like you. Want to hear about it?',
  'If you need me, I am hovering nearby!',
  'Should we explore an applet together soon?',
  'Nimbus is stretching their wings. Need anything while I am here?'
];

export function cycleIdleChatMessage(index = 0) {
  if (!Array.isArray(IDLE_CHAT_MESSAGES) || IDLE_CHAT_MESSAGES.length === 0) {
    return { message: null, nextIndex: 0 };
  }

  const safeIndex = index % IDLE_CHAT_MESSAGES.length;
  const message = IDLE_CHAT_MESSAGES[safeIndex];
  const nextIndex = (safeIndex + 1) % IDLE_CHAT_MESSAGES.length;
  return { message, nextIndex };
}
