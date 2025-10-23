const registryPath = '../applets.json';

const root = document.getElementById('nimbus-root');
const subtitle = document.querySelector('.shell-subtitle');
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

const settingsOverlay = document.getElementById('settings-overlay');
const settingsForm = document.getElementById('settings-form');
const settingsClose = document.getElementById('settings-close');
const settingsCancel = document.getElementById('settings-cancel');
const apiKeyInput = document.getElementById('settings-api-key');
const apiKeyToggle = document.getElementById('api-key-toggle');
const apiKeyHelp = document.getElementById('api-key-help');
const modelSelect = document.getElementById('settings-model');
const refreshModelsButton = document.getElementById('refresh-models');
const settingsFeedback = document.getElementById('settings-feedback');

const STORAGE_KEYS = {
  apiKey: 'nimbus.openai.apiKey',
  model: 'nimbus.openai.model',
  modelsCache: 'nimbus.openai.modelsCache',
};

const OPENAI_MODELS_ENDPOINT = 'https://api.openai.com/v1/models';
const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';
const SYSTEM_MESSAGE =
  "You are Nimbus, a friendly desktop companion. Keep answers concise and offer to launch applets when helpful.";
const MASKED_KEY_VALUE = '••••••••••••';

let registryEntries = [];
let activeMention = null;
let cachedApiKey = '';
let cachedModel = '';
let cachedModels = [];
let conversationLog = [];
let isFetchingModels = false;
let isAwaitingResponse = false;
let modelsFingerprint = '';

function appendMessage(role, content) {
  if (!messageLog) return;
  const bubble = document.createElement('div');
  bubble.className = 'message';
  bubble.dataset.role = role;
  bubble.textContent = content;
  messageLog.appendChild(bubble);
  messageLog.scrollTop = messageLog.scrollHeight;
  return bubble;
}

function autoResizeComposer() {
  if (!composerInput) return;
  composerInput.style.height = 'auto';
  composerInput.style.height = `${composerInput.scrollHeight}px`;
}

function readPersistedSettings() {
  try {
    cachedApiKey = window.localStorage.getItem(STORAGE_KEYS.apiKey) ?? '';
    cachedModel = window.localStorage.getItem(STORAGE_KEYS.model) ?? '';
    const storedModels = window.localStorage.getItem(STORAGE_KEYS.modelsCache);
    cachedModels = storedModels ? JSON.parse(storedModels) : [];
    modelsFingerprint = cachedApiKey;
  } catch (error) {
    console.warn('Unable to read settings from storage', error);
    cachedApiKey = '';
    cachedModel = '';
    cachedModels = [];
    modelsFingerprint = '';
  }
}

function persistSettings() {
  try {
    if (cachedApiKey) {
      window.localStorage.setItem(STORAGE_KEYS.apiKey, cachedApiKey);
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.apiKey);
    }

    if (cachedModel) {
      window.localStorage.setItem(STORAGE_KEYS.model, cachedModel);
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.model);
    }

    if (cachedModels.length) {
      window.localStorage.setItem(STORAGE_KEYS.modelsCache, JSON.stringify(cachedModels));
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.modelsCache);
    }
    modelsFingerprint = cachedApiKey;
  } catch (error) {
    console.warn('Unable to persist settings', error);
  }
}

function updateSubtitle() {
  if (!subtitle) return;
  if (!cachedApiKey) {
    subtitle.textContent = 'Add your OpenAI key from the taskbar settings to go online.';
    return;
  }

  if (!cachedModel) {
    subtitle.textContent = 'Select an OpenAI model in settings to start chatting.';
    return;
  }

  subtitle.textContent = `Connected to ${cachedModel}. You can start chatting.`;
}

function applyMaskedKey() {
  if (!apiKeyInput || !apiKeyToggle) return;
  apiKeyInput.type = 'password';
  apiKeyInput.value = MASKED_KEY_VALUE;
  apiKeyInput.dataset.state = 'masked';
  apiKeyToggle.disabled = false;
  apiKeyToggle.textContent = 'Show';
}

function resetApiKeyField() {
  if (!apiKeyInput || !apiKeyToggle) return;
  if (cachedApiKey) {
    applyMaskedKey();
    apiKeyHelp && (apiKeyHelp.textContent = 'A key is stored locally. Enter a new key to replace it.');
  } else {
    apiKeyInput.type = 'password';
    apiKeyInput.value = '';
    apiKeyInput.dataset.state = 'empty';
    apiKeyToggle.disabled = true;
    apiKeyToggle.textContent = 'Show';
    apiKeyHelp &&
      (apiKeyHelp.textContent = 'Only enter keys from accounts you trust. Nothing is sent until you save.');
  }
}

function populateModelOptions(models, selectedValue) {
  if (!modelSelect) return;
  modelSelect.innerHTML = '';
  if (!models.length) {
    const option = document.createElement('option');
    option.disabled = true;
    option.selected = true;
    option.value = '';
    option.textContent = 'No models loaded yet';
    modelSelect.appendChild(option);
    modelSelect.disabled = true;
    return;
  }

  for (const model of models) {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    if (selectedValue && model === selectedValue) {
      option.selected = true;
    }
    modelSelect.appendChild(option);
  }

  if (selectedValue && !models.includes(selectedValue)) {
    modelSelect.selectedIndex = 0;
    cachedModel = modelSelect.value;
  } else if (!selectedValue) {
    modelSelect.selectedIndex = 0;
    cachedModel = modelSelect.value;
  }

  modelSelect.disabled = false;
}

function syncSettingsForm() {
  resetApiKeyField();
  populateModelOptions(cachedModels, cachedModel);
  settingsFeedback && (settingsFeedback.textContent = '');
  if (refreshModelsButton) {
    refreshModelsButton.disabled = !resolveActiveApiKey();
  }
}

function openSettings() {
  readPersistedSettings();
  syncSettingsForm();
  settingsOverlay?.removeAttribute('hidden');
  window.setTimeout(() => {
    apiKeyInput?.focus();
  }, 50);
  if (cachedApiKey && !cachedModels.length) {
    refreshModels({ autopick: !cachedModel });
  }
}

function closeSettings() {
  settingsOverlay?.setAttribute('hidden', 'hidden');
  settingsFeedback && (settingsFeedback.textContent = '');
  trayToggle?.focus();
}

function resolveActiveApiKey() {
  if (!apiKeyInput) return cachedApiKey;
  if (apiKeyInput.dataset.state === 'masked') {
    return cachedApiKey;
  }
  const candidate = apiKeyInput.value.trim();
  return candidate || cachedApiKey;
}

function handleApiKeyToggle() {
  if (!apiKeyInput || !apiKeyToggle) return;
  const state = apiKeyInput.dataset.state;
  if (cachedApiKey && state === 'masked') {
    apiKeyInput.type = 'text';
    apiKeyInput.value = cachedApiKey;
    apiKeyInput.dataset.state = 'revealed';
    apiKeyToggle.textContent = 'Hide';
    return;
  }

  if (cachedApiKey && state === 'revealed' && apiKeyInput.value === cachedApiKey) {
    applyMaskedKey();
    return;
  }

  if (apiKeyInput.type === 'password') {
    apiKeyInput.type = 'text';
    apiKeyToggle.textContent = 'Hide';
  } else {
    apiKeyInput.type = 'password';
    apiKeyToggle.textContent = 'Show';
  }
}

function handleApiKeyInput() {
  if (!apiKeyInput || !apiKeyToggle) return;
  const rawValue = apiKeyInput.value;
  if (apiKeyInput.dataset.state === 'masked' && rawValue !== MASKED_KEY_VALUE) {
    apiKeyInput.dataset.state = rawValue ? 'editing' : 'empty';
  } else if (apiKeyInput.dataset.state === 'revealed' && rawValue !== cachedApiKey) {
    apiKeyInput.dataset.state = rawValue ? 'editing' : 'empty';
  } else if (apiKeyInput.dataset.state !== 'masked') {
    apiKeyInput.dataset.state = rawValue ? 'editing' : 'empty';
  }

  apiKeyToggle.disabled = !rawValue && !cachedApiKey;

  if (refreshModelsButton) {
    refreshModelsButton.disabled = !resolveActiveApiKey();
  }
}

function extractTextFromResponse(payload) {
  if (!payload || typeof payload !== 'object') return '';

  if (Array.isArray(payload.output)) {
    const chunks = [];
    for (const item of payload.output) {
      if (!item || typeof item !== 'object') continue;
      const contents = item.content ?? item.contents;
      if (!Array.isArray(contents)) continue;
      for (const block of contents) {
        if (block?.type === 'output_text' && typeof block.text === 'string') {
          chunks.push(block.text);
        } else if (block?.type === 'text' && typeof block.text === 'string') {
          chunks.push(block.text);
        }
      }
    }
    if (chunks.length) {
      return chunks.join('\n');
    }
  }

  if (Array.isArray(payload.choices)) {
    const choice = payload.choices[0];
    if (choice?.message?.content) return choice.message.content;
    if (choice?.text) return choice.text;
  }

  if (typeof payload.content === 'string') {
    return payload.content;
  }

  if (payload.result && typeof payload.result === 'string') {
    return payload.result;
  }

  return '';
}

async function refreshModels(options = {}) {
  if (isFetchingModels) return false;
  const { autopick = false } = options;
  const key = resolveActiveApiKey();
  if (!key) {
    settingsFeedback &&
      (settingsFeedback.textContent = 'Enter and save an API key before refreshing models.');
    return false;
  }

  if (refreshModelsButton) {
    refreshModelsButton.disabled = true;
    refreshModelsButton.textContent = 'Refreshing…';
  }

  isFetchingModels = true;
  let success = false;

  try {
    const response = await fetch(OPENAI_MODELS_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });

    if (!response.ok) {
      let detail = '';
      try {
        const errorPayload = await response.json();
        detail = errorPayload?.error?.message ?? '';
      } catch (parseError) {
        detail = '';
      }
      const error = new Error(detail || `OpenAI responded with ${response.status}`);
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    const list = data?.data ?? data?.models ?? [];
    const nextModels = list
      .map((entry) => entry?.id ?? entry)
      .filter((id) => typeof id === 'string' && /gpt/i.test(id))
      .sort((a, b) => a.localeCompare(b));

    const canPersist =
      !apiKeyInput ||
      apiKeyInput.dataset.state === 'masked' ||
      (apiKeyInput.dataset.state === 'revealed' && apiKeyInput.value === cachedApiKey);

    if (!nextModels.length) {
      settingsFeedback &&
        (settingsFeedback.textContent = 'No GPT-compatible models were returned for this key.');
      cachedModels = [];
      populateModelOptions([], '');
      cachedModel = '';
      updateSubtitle();
      if (canPersist) {
        persistSettings();
      }
    } else {
      cachedModels = nextModels;
      modelsFingerprint = key;
      populateModelOptions(nextModels, cachedModel);
      settingsFeedback &&
        (settingsFeedback.textContent = `Loaded ${nextModels.length} models.`);
      if (autopick && !cachedModel && modelSelect && !modelSelect.disabled) {
        modelSelect.selectedIndex = 0;
        cachedModel = modelSelect.value;
      }
      if (canPersist) {
        persistSettings();
      }
      updateSubtitle();
      success = true;
    }
  } catch (error) {
    console.error(error);
    let message = 'Unable to load models. Check your key permissions and network.';
    if (typeof error?.status === 'number') {
      if (error.status === 401 || error.status === 403) {
        message = 'OpenAI rejected this API key. Double-check it in settings and try again.';
      } else if (error.status >= 500) {
        message = 'OpenAI is unavailable right now. Try refreshing models again in a moment.';
      }
    }
    settingsFeedback && (settingsFeedback.textContent = message);
  } finally {
    isFetchingModels = false;
    if (refreshModelsButton) {
      refreshModelsButton.textContent = 'Refresh';
      refreshModelsButton.disabled = !resolveActiveApiKey();
    }
  }

  return success;
}

async function requestAssistantResponse() {
  const key = cachedApiKey;
  const model = cachedModel;
  if (!key || !model) {
    throw new Error('Missing API configuration');
  }

  if (!conversationLog.length || conversationLog[0].role !== 'system') {
    conversationLog.unshift({ role: 'system', content: SYSTEM_MESSAGE });
  }

  const payload = {
    model,
    input: conversationLog.map((item) => ({
      role: item.role,
      content: [
        {
          type: 'text',
          text: item.content,
        },
      ],
    })),
  };

  let response;
  try {
    response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (networkError) {
    const error = new Error('Nimbus could not reach OpenAI. Check your connection and try again.');
    error.cause = networkError instanceof Error ? networkError : undefined;
    throw error;
  }

  if (!response.ok) {
    let errorDetail = '';
    let errorCode = '';
    try {
      const errorPayload = await response.json();
      errorDetail = errorPayload?.error?.message ?? '';
      errorCode = errorPayload?.error?.type ?? '';
    } catch (parseError) {
      errorDetail = '';
    }
    const error = new Error(errorDetail || `OpenAI responded with status ${response.status}`);
    error.status = response.status;
    if (errorCode) {
      error.code = errorCode;
    }
    throw error;
  }

  const data = await response.json();
  if (data?.error) {
    const apiMessage = data.error?.message ?? 'OpenAI reported an error.';
    const error = new Error(apiMessage);
    if (typeof data.error?.code === 'number') {
      error.status = data.error.code;
    }
    throw error;
  }
  const reply = extractTextFromResponse(data);
  if (!reply) {
    const error = new Error('OpenAI did not return any text for this request.');
    error.status = response.status;
    throw error;
  }
  return reply;
}

async function handleSettingsSubmit(event) {
  event.preventDefault();

  const previousKey = cachedApiKey;
  let nextKey = cachedApiKey;
  if (apiKeyInput) {
    const state = apiKeyInput.dataset.state;
    const rawValue = apiKeyInput.value.trim();
    if (state === 'masked') {
      nextKey = cachedApiKey;
    } else if (!rawValue) {
      nextKey = '';
    } else if (rawValue !== MASKED_KEY_VALUE) {
      nextKey = rawValue;
    }
  }

  const keyChanged = nextKey !== previousKey;
  cachedApiKey = nextKey;

  let nextModel = cachedModel;
  if (modelSelect) {
    if (!modelSelect.disabled && modelSelect.value) {
      nextModel = modelSelect.value;
    } else if (!modelSelect.disabled && !modelSelect.value) {
      nextModel = '';
    } else if (modelSelect.disabled && keyChanged) {
      nextModel = '';
    }
  }

  if (keyChanged) {
    if (!nextKey || modelsFingerprint !== nextKey) {
      cachedModels = [];
      nextModel = '';
    }
  }

  cachedModel = nextModel;

  if (!cachedApiKey) {
    window.localStorage.removeItem(STORAGE_KEYS.apiKey);
    window.localStorage.removeItem(STORAGE_KEYS.modelsCache);
  }

  if (!cachedModel) {
    window.localStorage.removeItem(STORAGE_KEYS.model);
  }

  syncSettingsForm();
  persistSettings();
  updateSubtitle();

  if (!cachedApiKey) {
    settingsFeedback &&
      (settingsFeedback.textContent = 'API key removed. Nimbus will stay offline until you add a new key.');
    conversationLog = [];
    window.setTimeout(() => {
      closeSettings();
    }, 400);
    return;
  }

  if (keyChanged) {
    conversationLog = [];
  }

  let shouldClose = true;

  if (cachedApiKey && (!cachedModels.length || keyChanged)) {
    settingsFeedback && (settingsFeedback.textContent = 'Fetching models…');
    const loaded = await refreshModels({ autopick: true });
    if (!loaded) {
      shouldClose = false;
    } else if (!cachedModel) {
      shouldClose = false;
    }
  }

  if (shouldClose && cachedModel) {
    settingsFeedback && (settingsFeedback.textContent = 'Settings saved.');
    window.setTimeout(() => {
      closeSettings();
    }, 600);
  } else if (!cachedModel) {
    settingsFeedback &&
      (settingsFeedback.textContent = 'Select a model to finish setup. Nimbus will stay here until you do.');
  }
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

function handleGlobalKeydown(event) {
  if (event.key !== 'Escape') return;
  if (!settingsOverlay || settingsOverlay.hasAttribute('hidden')) return;
  if (event.target instanceof Node && settingsOverlay.contains(event.target)) {
    event.stopPropagation();
  }
  closeSettings();
}

async function sendMessage(event) {
  event.preventDefault();
  if (!composerInput) return;
  if (isAwaitingResponse) return;

  const text = composerInput.value.trim();
  if (!text) return;

  appendMessage('user', text);
  conversationLog.push({ role: 'user', content: text });

  composerInput.value = '';
  autoResizeComposer();
  hideMentionSuggestions();

  if (!cachedApiKey || !cachedModel) {
    readPersistedSettings();
    updateSubtitle();
  }

  if (!cachedApiKey) {
    appendMessage('system', 'Add your OpenAI API key in the settings panel to send messages.');
    return;
  }

  if (!cachedModel) {
    appendMessage('system', 'Choose an OpenAI model from the settings panel before chatting.');
    return;
  }

  const pendingBubble = appendMessage('assistant', 'Nimbus is contacting OpenAI…');
  isAwaitingResponse = true;

  try {
    const reply = await requestAssistantResponse();
    if (pendingBubble) {
      pendingBubble.textContent = reply;
      pendingBubble.dataset.role = 'assistant';
    } else {
      appendMessage('assistant', reply);
    }
    conversationLog.push({ role: 'assistant', content: reply });
  } catch (error) {
    console.error(error);
    let friendlyMessage =
      (error instanceof Error && error.message) || 'Something went wrong talking to OpenAI.';
    const status = typeof error?.status === 'number' ? error.status : undefined;
    if (status === 401 || status === 403) {
      friendlyMessage =
        'OpenAI rejected Nimbus\' API request. Double-check your API key in the settings overlay.';
    } else if (typeof status === 'number' && status >= 500) {
      friendlyMessage = 'OpenAI is having trouble right now. Try again in a moment.';
    }

    if (pendingBubble) {
      pendingBubble.dataset.role = 'system';
      pendingBubble.textContent = friendlyMessage;
    } else {
      appendMessage('system', friendlyMessage);
    }
  } finally {
    isAwaitingResponse = false;
  }
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

function closeTrayMenu() {
  if (!trayMenu || !trayToggle) return;
  trayMenu.setAttribute('hidden', 'hidden');
  trayToggle.setAttribute('aria-expanded', 'false');
}

function handleTrayAction(action) {
  switch (action) {
    case 'open-settings':
      closeTrayMenu();
      openSettings();
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
    closeTrayMenu();
  });

  trayMenu?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    if (!action) return;
    handleTrayAction(action);
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

  settingsForm?.addEventListener('submit', handleSettingsSubmit);
  settingsClose?.addEventListener('click', () => {
    closeSettings();
  });
  settingsCancel?.addEventListener('click', () => {
    closeSettings();
  });
  refreshModelsButton?.addEventListener('click', () => {
    refreshModels({ autopick: false });
  });
  apiKeyToggle?.addEventListener('click', () => {
    handleApiKeyToggle();
  });
  apiKeyInput?.addEventListener('input', () => {
    handleApiKeyInput();
  });
  apiKeyInput?.addEventListener('blur', () => {
    if (apiKeyInput.dataset.state === 'revealed' && apiKeyInput.value === cachedApiKey) {
      applyMaskedKey();
    }
  });
  settingsOverlay?.addEventListener('pointerdown', (event) => {
    if (event.target === settingsOverlay) {
      closeSettings();
    }
  });
  document.addEventListener('keydown', handleGlobalKeydown);
}

function init() {
  readPersistedSettings();
  updateSubtitle();
  autoResizeComposer();
  appendMessage(
    'assistant',
    'Hi! I\'m Nimbus. Ask anything or type @ to launch an applet. Add your OpenAI key from the ☰ taskbar when you want me to reach GPT-5 models.'
  );
}

bindEvents();
loadRegistry().finally(() => {
  init();
});
