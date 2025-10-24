const registryPath = '../applets.json';

const root = document.getElementById('nimbus-root');
const tray = document.querySelector('.tray');
const trayToggle = document.querySelector('.tray-toggle');
const trayMenu = document.getElementById('nimbus-tray-menu');
const composerToggle = document.getElementById('composer-toggle');
const composerPopover = document.getElementById('composer-popover');
const composerClose = document.getElementById('composer-close');
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

const desktopAPI = window.desktopAPI ?? null;
const isDesktopShell = Boolean(desktopAPI);
const STORED_KEY_TOKEN = '__stored__';

const SKIN_STORAGE_KEY = 'nimbus.appearance.skin';

const SKINS = [
  {
    id: 'default',
    label: 'Nimbus Cloud',
    properties: {},
  },
  {
    id: 'twilight',
    label: 'Twilight Drift',
    properties: {
      '--cloud-base': '#fef6ff',
      '--cloud-layer': '#fbe8ff',
      '--cloud-outline': 'rgba(99, 102, 241, 0.45)',
      '--face-eye': '#312e81',
      '--face-mouth': '#4338ca',
      '--action-icon': '#7c3aed',
      '--action-surface': 'rgba(124, 58, 237, 0.18)',
      '--action-surface-hover': 'rgba(124, 58, 237, 0.24)',
      '--tray-surface': 'rgba(76, 29, 149, 0.22)',
      '--tray-border': 'rgba(244, 215, 255, 0.32)',
      '--highlight-glow': 'rgba(124, 58, 237, 0.26)',
    },
  },
];

const SKIN_INDEX = new Map(SKINS.map((skin) => [skin.id, skin]));

let activeSkin = root?.dataset.skin ?? 'default';
const appliedSkinProperties = new Set();

let cachedApiKey = '';
let hasStoredApiKey = false;
let cachedModel = '';
let cachedModels = [];
let conversationLog = [];
let isFetchingModels = false;
let isAwaitingResponse = false;
let modelsFingerprint = '';

function applySkin(skinId, { persist = true } = {}) {
  if (!root) return;
  const skin = SKIN_INDEX.get(skinId) ?? SKIN_INDEX.get('default');
  if (!skin) return;

  for (const property of appliedSkinProperties) {
    root.style.removeProperty(property);
  }
  appliedSkinProperties.clear();

  const entries = Object.entries(skin.properties ?? {});
  for (const [property, value] of entries) {
    root.style.setProperty(property, value);
    appliedSkinProperties.add(property);
  }

  root.dataset.skin = skin.id;
  activeSkin = skin.id;

  if (!persist) return;
  try {
    window.localStorage.setItem(SKIN_STORAGE_KEY, skin.id);
  } catch (error) {
    console.warn('Unable to persist Nimbus skin preference', error);
  }
}

function restoreSkinPreference() {
  try {
    const storedSkin = window.localStorage.getItem(SKIN_STORAGE_KEY);
    if (storedSkin && SKIN_INDEX.has(storedSkin)) {
      applySkin(storedSkin, { persist: false });
      return;
    }
  } catch (error) {
    console.warn('Unable to read Nimbus skin preference', error);
  }
  applySkin(activeSkin ?? 'default', { persist: false });
}

function cycleSkin() {
  const ids = SKINS.map((skin) => skin.id);
  const currentIndex = ids.indexOf(activeSkin);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % ids.length;
  applySkin(ids[nextIndex]);
}

const OPENAI_MODELS_ENDPOINT = 'https://api.openai.com/v1/models';
const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';
const SYSTEM_MESSAGE =
  "You are Nimbus, a friendly desktop companion. Keep answers concise and offer to launch applets when helpful.";
const MASKED_KEY_VALUE = '••••••••••••';

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
  return bubble;
}

function autoResizeComposer() {
  if (!composerInput) return;
  composerInput.style.height = 'auto';
  composerInput.style.height = `${composerInput.scrollHeight}px`;
}

async function readPersistedSettings() {
  if (isDesktopShell && desktopAPI) {
    try {
      const settings = await desktopAPI.loadSettings();
      hasStoredApiKey = Boolean(settings?.hasApiKey);
      cachedApiKey = hasStoredApiKey ? STORED_KEY_TOKEN : '';
      cachedModel = settings?.model ?? '';
      cachedModels = Array.isArray(settings?.models) ? settings.models : [];
      modelsFingerprint = hasStoredApiKey ? STORED_KEY_TOKEN : '';
    } catch (error) {
      console.warn('Unable to read settings from desktop shell', error);
      cachedApiKey = '';
      cachedModel = '';
      cachedModels = [];
      hasStoredApiKey = false;
      modelsFingerprint = '';
    }
    return;
  }

  try {
    cachedApiKey = window.localStorage.getItem(STORAGE_KEYS.apiKey) ?? '';
    cachedModel = window.localStorage.getItem(STORAGE_KEYS.model) ?? '';
    const storedModels = window.localStorage.getItem(STORAGE_KEYS.modelsCache);
    cachedModels = storedModels ? JSON.parse(storedModels) : [];
    hasStoredApiKey = Boolean(cachedApiKey);
    modelsFingerprint = cachedApiKey;
  } catch (error) {
    console.warn('Unable to read settings from storage', error);
    cachedApiKey = '';
    cachedModel = '';
    cachedModels = [];
    hasStoredApiKey = false;
    modelsFingerprint = '';
  }
}

async function persistSettings() {
  if (isDesktopShell) {
    return;
  }
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

function updateOnlineState() {
  if (!root) return;
  const isConfigured = hasStoredApiKey || (!!cachedApiKey && cachedApiKey !== STORED_KEY_TOKEN);
  root.dataset.online = isConfigured && cachedModel ? 'true' : 'false';
}

function applyMaskedKey() {
  if (!apiKeyInput || !apiKeyToggle) return;
  apiKeyInput.type = 'password';
  apiKeyInput.value = MASKED_KEY_VALUE;
  apiKeyInput.dataset.state = 'masked';
  apiKeyToggle.disabled = hasStoredApiKey ? true : false;
  apiKeyToggle.dataset.visibility = 'hidden';
  apiKeyToggle.setAttribute(
    'aria-label',
    hasStoredApiKey ? 'API key stored securely' : 'Reveal API key'
  );
}

function resetApiKeyField() {
  if (!apiKeyInput || !apiKeyToggle) return;
  if (hasStoredApiKey) {
    applyMaskedKey();
    if (apiKeyHelp) {
      apiKeyHelp.textContent =
        'Nimbus keeps your API key in the desktop shell. Enter a new key to replace it or leave blank to remove it.';
    }
  } else if (cachedApiKey && !isDesktopShell) {
    applyMaskedKey();
    apiKeyHelp &&
      (apiKeyHelp.textContent = 'A key is stored locally. Enter a new key to replace it.');
    apiKeyToggle.disabled = false;
    apiKeyToggle.dataset.visibility = 'hidden';
    apiKeyToggle.setAttribute('aria-label', 'Reveal API key');
  } else {
    apiKeyInput.type = 'password';
    apiKeyInput.value = '';
    apiKeyInput.dataset.state = 'empty';
    apiKeyToggle.disabled = true;
    apiKeyToggle.dataset.visibility = 'hidden';
    apiKeyToggle.setAttribute('aria-label', 'Reveal API key');
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
    refreshModelsButton.disabled = !resolveActiveApiKey().hasKey;
    setRefreshModelsState(refreshModelsButton.disabled ? 'disabled' : 'idle');
  }
}

async function openSettings() {
  await readPersistedSettings();
  syncSettingsForm();
  closeComposer();
  settingsOverlay?.removeAttribute('hidden');
  window.setTimeout(() => {
    apiKeyInput?.focus();
  }, 50);
  if (hasStoredApiKey && !cachedModels.length && refreshModelsButton && !refreshModelsButton.disabled) {
    refreshModels();
  }
}

function closeSettings() {
  settingsOverlay?.setAttribute('hidden', 'hidden');
  settingsFeedback && (settingsFeedback.textContent = '');
  trayToggle?.focus();
}

function resolveActiveApiKey() {
  if (!apiKeyInput) {
    if (isDesktopShell) {
      return { kind: hasStoredApiKey ? 'stored' : 'none', hasKey: hasStoredApiKey };
    }
    const value = cachedApiKey?.trim?.() ?? '';
    return value
      ? { kind: 'stored', hasKey: true, value }
      : { kind: 'none', hasKey: false };
  }

  const state = apiKeyInput.dataset.state;
  const rawValue = apiKeyInput.value.trim();

  if (state === 'masked') {
    if (isDesktopShell) {
      return { kind: hasStoredApiKey ? 'stored' : 'none', hasKey: hasStoredApiKey };
    }
    return cachedApiKey
      ? { kind: 'stored', hasKey: true, value: cachedApiKey }
      : { kind: 'none', hasKey: false };
  }

  if (!rawValue) {
    if (state === 'empty') {
      return { kind: hasStoredApiKey ? 'stored' : 'none', hasKey: hasStoredApiKey };
    }
    if (!isDesktopShell && cachedApiKey) {
      return { kind: 'stored', hasKey: true, value: cachedApiKey };
    }
    return { kind: hasStoredApiKey ? 'stored' : 'none', hasKey: hasStoredApiKey };
  }

  return { kind: 'inline', hasKey: true, value: rawValue };
}

function handleApiKeyToggle() {
  if (!apiKeyInput || !apiKeyToggle) return;
  if (isDesktopShell && hasStoredApiKey) {
    settingsFeedback &&
      (settingsFeedback.textContent = 'Nimbus keeps your key outside the page. Enter a new key to replace it.');
    return;
  }

  const state = apiKeyInput.dataset.state;
  if (cachedApiKey && state === 'masked') {
    apiKeyInput.type = 'text';
    apiKeyInput.value = cachedApiKey;
    apiKeyInput.dataset.state = 'revealed';
    apiKeyToggle.dataset.visibility = 'visible';
    apiKeyToggle.setAttribute('aria-label', 'Hide API key');
    return;
  }

  if (cachedApiKey && state === 'revealed' && apiKeyInput.value === cachedApiKey) {
    applyMaskedKey();
    apiKeyToggle.dataset.visibility = 'hidden';
    return;
  }

  if (apiKeyInput.type === 'password') {
    apiKeyInput.type = 'text';
    apiKeyToggle.dataset.visibility = 'visible';
    apiKeyToggle.setAttribute('aria-label', 'Hide API key');
  } else {
    apiKeyInput.type = 'password';
    apiKeyToggle.dataset.visibility = 'hidden';
    apiKeyToggle.setAttribute('aria-label', 'Reveal API key');
  }
}

function handleApiKeyInput() {
  if (!apiKeyInput || !apiKeyToggle) return;
  const rawValue = apiKeyInput.value;
  const state = apiKeyInput.dataset.state;
  if (state === 'masked' && rawValue !== MASKED_KEY_VALUE) {
    apiKeyInput.dataset.state = rawValue ? 'editing' : 'empty';
  } else if (state === 'revealed' && rawValue !== cachedApiKey) {
    apiKeyInput.dataset.state = rawValue ? 'editing' : 'empty';
  } else if (state !== 'masked') {
    apiKeyInput.dataset.state = rawValue ? 'editing' : 'empty';
  }

  apiKeyToggle.disabled = !rawValue && !cachedApiKey && !hasStoredApiKey;

  if (refreshModelsButton) {
    refreshModelsButton.disabled = !resolveActiveApiKey().hasKey;
    setRefreshModelsState(refreshModelsButton.disabled ? 'disabled' : 'idle');
  }
}

function setRefreshModelsState(state) {
  if (!refreshModelsButton) return;
  refreshModelsButton.dataset.state = state;
  if (state === 'loading') {
    refreshModelsButton.setAttribute('aria-label', 'Refreshing models');
  } else {
    refreshModelsButton.setAttribute('aria-label', 'Refresh models');
  }
}

function isComposerOpen() {
  return Boolean(composerPopover && !composerPopover.hasAttribute('hidden'));
}

function openComposer() {
  if (!composerPopover || !composerToggle) return;
  if (root?.classList.contains('is-collapsed')) return;
  composerPopover.removeAttribute('hidden');
  composerToggle.setAttribute('aria-expanded', 'true');
  root?.setAttribute('data-composer', 'open');
  window.setTimeout(() => {
    composerInput?.focus();
    autoResizeComposer();
  }, 20);
}

function closeComposer({ restoreFocus = false } = {}) {
  if (!composerPopover || !composerToggle) return;
  composerPopover.setAttribute('hidden', 'hidden');
  composerToggle.setAttribute('aria-expanded', 'false');
  root?.setAttribute('data-composer', 'closed');
  hideMentionSuggestions();
  if (restoreFocus) {
    composerToggle.focus();
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

async function refreshModels() {
  if (isFetchingModels) return;
  const keyStatus = resolveActiveApiKey();
  if (!keyStatus.hasKey) {
    settingsFeedback &&
      (settingsFeedback.textContent = 'Enter and save an API key before refreshing models.');
    return;
  }

  if (refreshModelsButton) {
    refreshModelsButton.disabled = true;
    setRefreshModelsState('loading');
  }

  isFetchingModels = true;

  try {
    if (isDesktopShell && desktopAPI) {
      const payload = {};
      if (keyStatus.kind === 'stored') {
        payload.useStoredKey = true;
      } else if (keyStatus.kind === 'inline' && keyStatus.value) {
        payload.apiKey = keyStatus.value;
      }
      const result = await desktopAPI.fetchModels(payload);
      const models = Array.isArray(result?.models)
        ? result.models
        : Array.isArray(result)
        ? result
        : [];
      cachedModels = models;
      if (payload.useStoredKey) {
        modelsFingerprint = STORED_KEY_TOKEN;
      }
      populateModelOptions(models, cachedModel);
      if (!models.length) {
        settingsFeedback &&
          (settingsFeedback.textContent = 'No GPT-compatible models were returned for this key.');
      } else {
        settingsFeedback &&
          (settingsFeedback.textContent = `Loaded ${models.length} models.`);
      }
      return;
    }

    const key = keyStatus.value;
    const response = await fetch(OPENAI_MODELS_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });

    if (!response.ok) {
      throw new Error(`OpenAI responded with ${response.status}`);
    }

    const data = await response.json();
    const list = data?.data ?? data?.models ?? [];
    const nextModels = list
      .map((entry) => entry?.id ?? entry)
      .filter((id) => typeof id === 'string' && /gpt/i.test(id))
      .sort((a, b) => a.localeCompare(b));

    if (!nextModels.length) {
      settingsFeedback &&
        (settingsFeedback.textContent = 'No GPT-compatible models were returned for this key.');
      cachedModels = [];
      populateModelOptions([], '');
    } else {
      cachedModels = nextModels;
      modelsFingerprint = key ?? '';
      populateModelOptions(nextModels, cachedModel);
      settingsFeedback &&
        (settingsFeedback.textContent = `Loaded ${nextModels.length} models.`);
      await persistSettings();
    }
  } catch (error) {
    console.error(error);
    settingsFeedback &&
      (settingsFeedback.textContent = 'Unable to load models. Check your key permissions and network.');
  } finally {
    isFetchingModels = false;
    if (refreshModelsButton) {
      refreshModelsButton.disabled = !resolveActiveApiKey().hasKey;
      setRefreshModelsState(refreshModelsButton.disabled ? 'disabled' : 'idle');
    }
  }
}

async function requestAssistantResponse() {
  const keyStatus = resolveActiveApiKey();
  const model = cachedModel;
  if (!model || !keyStatus.hasKey) {
    throw new Error('Missing API configuration');
  }

  if (!conversationLog.length || conversationLog[0].role !== 'system') {
    conversationLog.unshift({ role: 'system', content: SYSTEM_MESSAGE });
  }

  if (isDesktopShell && desktopAPI) {
    const response = await desktopAPI.sendMessage({
      model,
      conversation: conversationLog,
    });
    if (!response) {
      throw new Error('Nimbus desktop shell did not return a response.');
    }
    const reply = typeof response === 'string' ? response : response.reply;
    if (!reply) {
      throw new Error('Nimbus desktop shell returned an empty response.');
    }
    return reply;
  }

  const key = keyStatus.value;
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

  const response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorDetail = '';
    try {
      const errorPayload = await response.json();
      errorDetail = errorPayload?.error?.message ?? '';
    } catch (parseError) {
      errorDetail = '';
    }
    throw new Error(errorDetail || `OpenAI responded with status ${response.status}`);
  }

  const data = await response.json();
  const reply = extractTextFromResponse(data);
  if (!reply) {
    throw new Error('OpenAI did not return any text for this request.');
  }
  return reply;
}

async function handleSettingsSubmit(event) {
  event.preventDefault();

  const previousHasKey = hasStoredApiKey || (!!cachedApiKey && cachedApiKey !== STORED_KEY_TOKEN);
  const previousModel = cachedModel;

  let nextKeyDirective = 'keep';
  let submittedKey = '';

  if (apiKeyInput) {
    const state = apiKeyInput.dataset.state;
    const rawValue = apiKeyInput.value.trim();
    if (isDesktopShell) {
      if (state === 'masked') {
        nextKeyDirective = 'keep';
      } else if (!rawValue) {
        nextKeyDirective = hasStoredApiKey ? 'remove' : 'keep';
      } else {
        nextKeyDirective = 'update';
        submittedKey = rawValue;
      }
    } else {
      if (state === 'masked') {
        submittedKey = cachedApiKey;
      } else if (!rawValue) {
        submittedKey = '';
      } else if (rawValue !== MASKED_KEY_VALUE) {
        submittedKey = rawValue;
      }
    }
  }

  let nextModel = cachedModel;
  if (modelSelect) {
    if (!modelSelect.disabled && modelSelect.value) {
      nextModel = modelSelect.value;
    } else if (!modelSelect.disabled && !modelSelect.value) {
      nextModel = '';
    } else if (modelSelect.disabled && nextKeyDirective !== 'keep') {
      nextModel = '';
    }
  }

  try {
    if (isDesktopShell && desktopAPI) {
      const result = await desktopAPI.saveSettings({
        keyDirective: nextKeyDirective,
        apiKey: submittedKey,
        model: nextModel,
      });
      hasStoredApiKey = Boolean(result?.hasApiKey);
      cachedApiKey = hasStoredApiKey ? STORED_KEY_TOKEN : '';
      cachedModel = result?.model ?? '';
      cachedModels = Array.isArray(result?.models) ? result.models : cachedModels;
      modelsFingerprint = hasStoredApiKey ? STORED_KEY_TOKEN : '';
    } else {
      cachedApiKey = submittedKey;
      cachedModel = nextModel;
      if (!cachedApiKey) {
        window.localStorage.removeItem(STORAGE_KEYS.apiKey);
        window.localStorage.removeItem(STORAGE_KEYS.modelsCache);
      }
      if (!cachedModel) {
        window.localStorage.removeItem(STORAGE_KEYS.model);
      }
      await persistSettings();
      hasStoredApiKey = Boolean(cachedApiKey);
    }
  } catch (error) {
    console.error(error);
    settingsFeedback &&
      (settingsFeedback.textContent =
        'Nimbus could not save your settings. Double-check the desktop app permissions.');
    return;
  }

  syncSettingsForm();
  updateOnlineState();

  const keyChanged = isDesktopShell
    ? nextKeyDirective === 'update' || nextKeyDirective === 'remove'
    : previousHasKey !== (cachedApiKey !== '');
  if (keyChanged) {
    conversationLog = [];
  }

  if (!hasStoredApiKey && (!cachedApiKey || cachedApiKey === '')) {
    settingsFeedback &&
      (settingsFeedback.textContent = 'API key removed. Nimbus will stay offline until you add a new key.');
  } else if (cachedModel !== previousModel) {
    settingsFeedback && (settingsFeedback.textContent = 'Model updated.');
  } else {
    settingsFeedback && (settingsFeedback.textContent = 'Settings saved.');
  }

  window.setTimeout(() => {
    closeSettings();
  }, 400);
}

async function loadRegistry() {
  if (isDesktopShell && desktopAPI) {
    try {
      const entries = await desktopAPI.loadRegistry();
      registryEntries = Array.isArray(entries) ? entries : [];
    } catch (error) {
      console.error('Failed to load registry from desktop shell', error);
      registryEntries = [];
    }
    return;
  }

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
  const caretPosition = afterStripped.length
    ? before.length + mentionText.length + separator.length
    : composerInput.value.length;
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
  if (isComposerOpen()) {
    if (event.target instanceof Node && composerPopover?.contains(event.target)) {
      event.stopPropagation();
    }
    closeComposer({ restoreFocus: true });
    return;
  }

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

  await readPersistedSettings();
  updateOnlineState();

  const keyStatus = resolveActiveApiKey();
  if (!keyStatus.hasKey) {
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
    if (pendingBubble) {
      pendingBubble.dataset.role = 'system';
      pendingBubble.textContent =
        (error instanceof Error && error.message) || 'Something went wrong talking to OpenAI.';
    } else {
      appendMessage(
        'system',
        (error instanceof Error && error.message) || 'Something went wrong talking to OpenAI.'
      );
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
    case 'cycle-skin':
      closeTrayMenu();
      cycleSkin();
      break;
    case 'collapse':
      root?.classList.toggle('is-collapsed');
      if (root?.classList.contains('is-collapsed')) {
        closeComposer();
      }
      break;
    default:
      console.info('Unhandled tray action', action);
  }
}

function bindEvents() {
  composerToggle?.addEventListener('click', () => {
    if (isComposerOpen()) {
      closeComposer({ restoreFocus: true });
    } else {
      openComposer();
    }
  });

  composerClose?.addEventListener('click', () => {
    closeComposer({ restoreFocus: true });
  });

  trayToggle?.addEventListener('click', () => {
    toggleTrayMenu();
  });

  trayMenu?.addEventListener('click', (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest('.tray-action') : null;
    if (!button) return;
    const action = button.dataset.action;
    if (!action) return;
    handleTrayAction(action);
  });

  composerInput?.addEventListener('input', handleComposerInput);
  composerInput?.addEventListener('keydown', handleComposerKeydown);
  composerInput?.addEventListener('click', updateMentionSuggestions);
  composerInput?.addEventListener('focus', updateMentionSuggestions);

  composerForm?.addEventListener('submit', sendMessage);

  document.addEventListener('pointerdown', (event) => {
    if (!(event.target instanceof Node)) return;

    if (trayMenu && !trayMenu.hasAttribute('hidden')) {
      if (!(tray?.contains(event.target))) {
        closeTrayMenu();
      }
    }

    if (isComposerOpen()) {
      if (
        composerPopover &&
        !composerPopover.contains(event.target) &&
        !composerToggle?.contains(event.target)
      ) {
        closeComposer();
      }
    }

    if (mentionSuggestions && !mentionSuggestions.hasAttribute('hidden')) {
      if (mentionSuggestions.contains(event.target) || composerInput?.contains?.(event.target)) {
        return;
      }
      hideMentionSuggestions();
    }
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
    refreshModels();
  });
  apiKeyToggle?.addEventListener('click', () => {
    handleApiKeyToggle();
  });
  apiKeyInput?.addEventListener('input', () => {
    handleApiKeyInput();
  });
  apiKeyInput?.addEventListener('blur', () => {
    if (!isDesktopShell && apiKeyInput.dataset.state === 'revealed' && apiKeyInput.value === cachedApiKey) {
      applyMaskedKey();
    }
    if (isDesktopShell && apiKeyInput.dataset.state === 'revealed') {
      apiKeyInput.dataset.state = 'editing';
    }
  });
  settingsOverlay?.addEventListener('pointerdown', (event) => {
    if (event.target === settingsOverlay) {
      closeSettings();
    }
  });
  document.addEventListener('keydown', handleGlobalKeydown);
}

async function init() {
  await readPersistedSettings();
  updateOnlineState();
  autoResizeComposer();
  root?.setAttribute('data-composer', 'closed');
  appendMessage(
    'assistant',
    'Nimbus is ready whenever you are. Tap the chat bubble to talk or type @ to launch an applet.'
  );
}

restoreSkinPreference();
bindEvents();
loadRegistry().finally(() => {
  init();
});
