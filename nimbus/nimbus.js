const registryPath = '../applets.json';

const root = document.getElementById('nimbus-root');
const tray = document.querySelector('.tray');
const trayToggle = document.querySelector('.tray-toggle');
const trayMenu = document.getElementById('nimbus-tray-menu');
const messageLog = document.getElementById('message-log');
const composerForm = document.getElementById('composer-form');
const composerInput = document.getElementById('composer-input');
const mentionSuggestions = document.getElementById('mention-suggestions');
const appletHost = document.getElementById('applet-host');
const appletTitle = document.getElementById('applet-title');
const appletFrameWrapper = document.getElementById('applet-frame-wrapper');
const appletClose = document.getElementById('applet-close');

let registryEntries = [];
let activeMention = null;

function appendMessage(role, content) {
  if (!messageLog) return;
  const bubble = document.createElement('div');
  bubble.className = 'message';
  bubble.dataset.role = role;
  bubble.textContent = content;
  messageLog.appendChild(bubble);
  messageLog.scrollTop = messageLog.scrollHeight;
}

function autoResizeComposer() {
  if (!composerInput) return;
  composerInput.style.height = 'auto';
  composerInput.style.height = `${composerInput.scrollHeight}px`;
}

async function loadRegistry() {
  try {
    const response = await fetch(registryPath);
    if (!response.ok) {
      throw new Error(`Failed to load applet registry: ${response.status}`);
    }
    const registry = await response.json();
    registryEntries = Object.values(registry).map((entry) => ({
      slug: entry.slug ?? entry.name ?? 'applet',
      name: entry.name ?? entry.slug ?? 'Applet',
      description: entry.description ?? '',
      entry: entry.entry ?? '',
    }));
  } catch (error) {
    console.error(error);
    registryEntries = [];
  }
}

function findActiveMention(value, cursorPosition) {
  const uptoCursor = value.slice(0, cursorPosition);
  const atIndex = uptoCursor.lastIndexOf('@');
  if (atIndex === -1) return null;
  const beforeChar = atIndex === 0 ? ' ' : uptoCursor.charAt(atIndex - 1);
  if (!/\s/.test(beforeChar)) return null;
  const query = uptoCursor.slice(atIndex + 1);
  if (/[^\w-]/.test(query)) return null;
  return {
    query,
    start: atIndex,
    end: cursorPosition,
  };
}

function hideMentionSuggestions() {
  mentionSuggestions?.setAttribute('hidden', 'hidden');
  mentionSuggestions.innerHTML = '';
  activeMention = null;
}

function showMentionSuggestions(matches) {
  if (!mentionSuggestions) return;
  if (!matches.length) {
    hideMentionSuggestions();
    return;
  }

  mentionSuggestions.innerHTML = '';
  for (const entry of matches.slice(0, 6)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mention-option';
    button.dataset.slug = entry.slug;
    button.dataset.entry = entry.entry;
    button.textContent = entry.name;

    if (entry.slug && entry.slug !== entry.name) {
      const hint = document.createElement('small');
      hint.textContent = `@${entry.slug}`;
      button.appendChild(document.createElement('br'));
      button.appendChild(hint);
    }

    button.addEventListener('click', () => {
      selectMention(entry);
    });

    mentionSuggestions.appendChild(button);
  }

  mentionSuggestions.removeAttribute('hidden');
}

function updateMentionSuggestions() {
  if (!composerInput) return;
  const cursor = composerInput.selectionStart ?? composerInput.value.length;
  const mention = findActiveMention(composerInput.value, cursor);
  if (!mention || !registryEntries.length) {
    hideMentionSuggestions();
    return;
  }
  activeMention = mention;
  const queryLower = mention.query.toLowerCase();
  const matches = registryEntries.filter((entry) => {
    if (!queryLower) return true;
    return (
      entry.name?.toLowerCase().includes(queryLower) ||
      entry.slug?.toLowerCase().includes(queryLower)
    );
  });
  showMentionSuggestions(matches);
}

function insertMention(entry) {
  if (!composerInput || !activeMention) return;
  const value = composerInput.value;
  const before = value.slice(0, activeMention.start);
  const after = value.slice(activeMention.end);
  const slug = entry.slug ?? entry.name ?? 'applet';
  const mentionText = `@${slug}`;
  const afterStripped = after.replace(/^\s+/, '');
  const separator = ' ';
  const nextValue = afterStripped.length
    ? `${before}${mentionText}${separator}${afterStripped}`
    : `${before}${mentionText}${separator}`;
  composerInput.value = nextValue;
  const caretPosition = (afterStripped.length
    ? before.length + mentionText.length + separator.length
    : composerInput.value.length);
  composerInput.setSelectionRange(caretPosition, caretPosition);
  composerInput.focus();
  autoResizeComposer();
  hideMentionSuggestions();
}

function launchApplet(entry) {
  if (!appletHost || !appletTitle || !appletFrameWrapper) return;
  appletTitle.textContent = entry.name ?? entry.slug ?? 'Applet';
  appletFrameWrapper.innerHTML = '';

  if (!entry.entry) {
    appendMessage('system', `${entry.name ?? entry.slug ?? 'Applet'} is not configured yet.`);
    appletHost.setAttribute('hidden', 'hidden');
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.src = entry.entry;
  iframe.title = `${entry.name ?? entry.slug} applet`;
  iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin');
  iframe.loading = 'lazy';
  appletFrameWrapper.appendChild(iframe);
  appletHost.removeAttribute('hidden');
}

function selectMention(entry) {
  insertMention(entry);
  appendMessage('system', `Launching ${entry.name ?? entry.slug}…`);
  launchApplet(entry);
}

function handleComposerInput() {
  autoResizeComposer();
  updateMentionSuggestions();
}

function handleComposerKeydown(event) {
  if (event.key === 'Escape' && !mentionSuggestions?.hasAttribute('hidden')) {
    hideMentionSuggestions();
  }
}

function sendMessage(event) {
  event.preventDefault();
  if (!composerInput) return;
  const text = composerInput.value.trim();
  if (!text) return;

  appendMessage('user', text);
  composerInput.value = '';
  autoResizeComposer();
  hideMentionSuggestions();

  window.requestAnimationFrame(() => {
    appendMessage(
      'assistant',
      'Nimbus will relay this to ChatGPT once your API key is set in the tray settings.'
    );
  });
}

function toggleTrayMenu() {
  if (!trayMenu || !trayToggle) return;
  const isHidden = trayMenu.hasAttribute('hidden');
  if (isHidden) {
    trayMenu.removeAttribute('hidden');
  } else {
    trayMenu.setAttribute('hidden', 'hidden');
  }
  trayToggle.setAttribute('aria-expanded', String(isHidden));
}

function handleTrayAction(action) {
  switch (action) {
    case 'chatgpt-settings':
      appendMessage('system', 'Open the tray to manage ChatGPT credentials and defaults.');
      break;
    case 'collapse':
      root?.classList.toggle('is-collapsed');
      break;
    default:
      console.info('Unhandled tray action', action);
  }
}

function bindEvents() {
  trayToggle?.addEventListener('click', () => {
    toggleTrayMenu();
  });

  document.addEventListener('pointerdown', (event) => {
    if (!trayMenu) return;
    if (event.target instanceof Node && tray?.contains(event.target)) return;
    trayMenu.setAttribute('hidden', 'hidden');
    trayToggle?.setAttribute('aria-expanded', 'false');
  });

  trayMenu?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    if (!action) return;
    handleTrayAction(action);
    trayMenu.setAttribute('hidden', 'hidden');
    trayToggle?.setAttribute('aria-expanded', 'false');
  });

  composerInput?.addEventListener('input', handleComposerInput);
  composerInput?.addEventListener('keydown', handleComposerKeydown);
  composerInput?.addEventListener('click', updateMentionSuggestions);
  composerInput?.addEventListener('focus', updateMentionSuggestions);

  composerForm?.addEventListener('submit', sendMessage);

  document.addEventListener('pointerdown', (event) => {
    if (!mentionSuggestions || mentionSuggestions.hasAttribute('hidden')) return;
    if (event.target instanceof Node && (mentionSuggestions.contains(event.target) || composerInput?.contains?.(event.target))) {
      return;
    }
    hideMentionSuggestions();
  });

  appletClose?.addEventListener('click', () => {
    appletHost?.setAttribute('hidden', 'hidden');
    appletFrameWrapper.innerHTML = '';
  });
}

function init() {
  autoResizeComposer();
  appendMessage(
    'assistant',
    'Hi! I\'m Nimbus. Ask anything or type @ to launch an applet alongside our ChatGPT conversation.'
  );
}

bindEvents();
loadRegistry().finally(() => {
  init();
});
