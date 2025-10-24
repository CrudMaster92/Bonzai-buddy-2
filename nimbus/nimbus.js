const root = document.getElementById('nimbus-root');
const chatToggle = document.getElementById('chat-toggle');
const chatPanel = document.getElementById('chat-panel');
const chatClose = document.getElementById('chat-close');
const messageLog = document.getElementById('message-log');
const composerForm = document.getElementById('composer-form');
const composerInput = document.getElementById('composer-input');
const statusRegion = document.getElementById('nimbus-status');
const chatStatusText = document.querySelector('[data-chat-status]');
const buddy = document.querySelector('.buddy');
const chatHeader = document.querySelector('.chat-header');

if (root && !root.hasAttribute('data-chat-open')) {
  root.setAttribute('data-chat-open', 'false');
}


const settingsOverlay = document.getElementById('settings-overlay');
const settingsForm = document.getElementById('settings-form');
const settingsClose = document.getElementById('settings-close');
const settingsCancel = document.getElementById('settings-cancel');
const apiKeyInput = document.getElementById('settings-api-key');
const apiKeyHelp = document.getElementById('api-key-help');
const apiKeyRemoveButton = document.getElementById('api-key-remove');
const modelSelect = document.getElementById('settings-model');
const refreshModelsButton = document.getElementById('refresh-models');
const settingsFeedback = document.getElementById('settings-feedback');

const desktopAPI = window.desktopAPI ?? null;
const isDesktopShell = Boolean(desktopAPI);

const STORAGE_KEYS = {
  apiKey: 'nimbus.openai.apiKey',
  model: 'nimbus.openai.model',
  models: 'nimbus.openai.models',
};

const OPENAI_MODELS_ENDPOINT = 'https://api.openai.com/v1/models';
const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';
const SYSTEM_MESSAGE =
  'You are Nimbus, a playful desktop companion. Keep answers friendly, brief, and helpful.';

let hasStoredApiKey = false;
let cachedApiKey = '';
let cachedModel = '';
let cachedModels = [];
let conversationHistory = [{ role: 'system', content: SYSTEM_MESSAGE }];
let isSending = false;
let removeStoredKey = false;
let chatPanelPosition = null;
let chatDragPointerId = null;
let chatDragOffset = { x: 0, y: 0 };

function clampChatPanelPosition(left, top, rect) {
  if (!chatPanel) return { left, top };
  const panelRect = rect ?? chatPanel.getBoundingClientRect();
  const width = panelRect.width || chatPanel.offsetWidth || 0;
  const height = panelRect.height || chatPanel.offsetHeight || 0;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const padding = 12;

  const minLeft = padding;
  const minTop = padding;
  const maxLeft = Math.max(minLeft, viewportWidth - width - padding);
  const maxTop = Math.max(minTop, viewportHeight - height - padding);

  return {
    left: Math.min(Math.max(left, minLeft), maxLeft),
    top: Math.min(Math.max(top, minTop), maxTop),
  };
}

function applyChatPanelPosition(position) {
  if (!chatPanel || !position) return;
  chatPanel.style.left = `${position.left}px`;
  chatPanel.style.top = `${position.top}px`;
  chatPanel.style.right = 'auto';
  chatPanel.style.bottom = 'auto';
}

function computeDefaultChatPosition() {
  if (!chatPanel) return null;
  const panelRect = chatPanel.getBoundingClientRect();
  const buddyRect = buddy?.getBoundingClientRect();
  const rootRect = root?.getBoundingClientRect();

  let left = window.innerWidth - panelRect.width - 32;
  let top = window.innerHeight - panelRect.height - 32;

  if (buddyRect) {
    left = buddyRect.right + 16;
    top = buddyRect.top + buddyRect.height / 2 - panelRect.height / 2;
  } else if (rootRect) {
    left = rootRect.right + 16;
    top = rootRect.top + rootRect.height / 2 - panelRect.height / 2;
  }

  return clampChatPanelPosition(left, top, panelRect);
}

function positionChatPanel(options = {}) {
  if (!chatPanel || chatPanel.hasAttribute('hidden')) return;
  const { reset = false } = options;
  const rect = chatPanel.getBoundingClientRect();

  if (!chatPanelPosition || reset) {
    chatPanelPosition = computeDefaultChatPosition();
  } else {
    chatPanelPosition = clampChatPanelPosition(chatPanelPosition.left, chatPanelPosition.top, rect);
  }

  applyChatPanelPosition(chatPanelPosition);
}

function handleWindowResize() {
  if (!chatPanel || chatPanel.hasAttribute('hidden') || !chatPanelPosition) {
    return;
  }
  const rect = chatPanel.getBoundingClientRect();
  chatPanelPosition = clampChatPanelPosition(chatPanelPosition.left, chatPanelPosition.top, rect);
  applyChatPanelPosition(chatPanelPosition);
}

function startChatDrag(event) {
  if (!chatPanel) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  if (event.target.closest('button')) return;

  event.preventDefault();
  const rect = chatPanel.getBoundingClientRect();
  if (!chatPanelPosition) {
    chatPanelPosition = clampChatPanelPosition(rect.left, rect.top, rect);
    applyChatPanelPosition(chatPanelPosition);
  }
  chatDragPointerId = event.pointerId;
  chatDragOffset = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
  chatHeader?.setAttribute('data-dragging', 'true');
  chatPanel.setPointerCapture(chatDragPointerId);
}

function updateChatDrag(event) {
  if (!chatPanel || chatDragPointerId !== event.pointerId) return;
  const rect = chatPanel.getBoundingClientRect();
  const desiredLeft = event.clientX - chatDragOffset.x;
  const desiredTop = event.clientY - chatDragOffset.y;
  chatPanelPosition = clampChatPanelPosition(desiredLeft, desiredTop, rect);
  applyChatPanelPosition(chatPanelPosition);
}

function endChatDrag(event) {
  if (!chatPanel || chatDragPointerId !== event.pointerId) return;
  if (chatPanel.hasPointerCapture(chatDragPointerId)) {
    chatPanel.releasePointerCapture(chatDragPointerId);
  }
  chatDragPointerId = null;
  chatHeader?.removeAttribute('data-dragging');
}

function appendMessage(role, content) {
  if (!messageLog) return null;
  const bubble = document.createElement('div');
  bubble.className = 'message';
  bubble.dataset.role = role;
  bubble.textContent = content;
  messageLog.appendChild(bubble);
  messageLog.scrollTop = messageLog.scrollHeight;
  return bubble;
}

function setStatus(text) {
  if (!statusRegion) return;
  statusRegion.textContent = text;
}

function updateChatStatus(text) {
  if (!chatStatusText) return;
  chatStatusText.textContent = text;
}

function currentChatStatus() {
  return chatStatusText?.textContent?.trim() ?? '';
}

function setComposerBusy(state) {
  isSending = state;
  if (composerInput) {
    composerInput.disabled = state;
    composerInput.setAttribute('aria-busy', state ? 'true' : 'false');
  }
  const submit = composerForm?.querySelector('button[type="submit"]');
  if (submit) {
    submit.disabled = state;
  }
  if (state) {
    updateChatStatus('Thinking...');
  } else if (!chatPanel?.hasAttribute('hidden') && currentChatStatus() === 'Thinking...') {
    const online = root?.dataset.online === 'true';
    updateChatStatus(online ? 'Ready' : 'Set up');
  }
}

function updateOnlineState() {
  if (!root) return;
  const hasKey = hasStoredApiKey || Boolean(cachedApiKey);
  root.dataset.online = hasKey && Boolean(cachedModel) ? 'true' : 'false';
}

async function readPersistedSettings() {
  if (isDesktopShell && desktopAPI) {
    try {
      const settings = await desktopAPI.loadSettings();
      hasStoredApiKey = Boolean(settings?.hasApiKey);
      cachedApiKey = '';
      cachedModel = settings?.model ?? '';
      cachedModels = Array.isArray(settings?.models) ? settings.models : [];
    } catch (error) {
      console.warn('Unable to read settings from desktop shell', error);
      hasStoredApiKey = false;
      cachedApiKey = '';
      cachedModel = '';
      cachedModels = [];
    }
    updateOnlineState();
    return;
  }

  try {
    cachedApiKey = window.localStorage.getItem(STORAGE_KEYS.apiKey) ?? '';
    cachedModel = window.localStorage.getItem(STORAGE_KEYS.model) ?? '';
    const rawModels = window.localStorage.getItem(STORAGE_KEYS.models);
    cachedModels = rawModels ? JSON.parse(rawModels) : [];
    hasStoredApiKey = Boolean(cachedApiKey);
  } catch (error) {
    console.warn('Unable to read settings from local storage', error);
    cachedApiKey = '';
    cachedModel = '';
    cachedModels = [];
    hasStoredApiKey = false;
  }

  updateOnlineState();
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
      window.localStorage.setItem(STORAGE_KEYS.models, JSON.stringify(cachedModels));
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.models);
    }
  } catch (error) {
    console.warn('Unable to persist settings', error);
  }
}

function populateModelOptions(models, selectedValue) {
  if (!modelSelect) return;
  modelSelect.innerHTML = '';

  if (!models.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No models loaded yet';
    option.disabled = true;
    option.selected = true;
    modelSelect.appendChild(option);
    modelSelect.disabled = true;
    return;
  }

  for (const model of models) {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    if (model === selectedValue) {
      option.selected = true;
    }
    modelSelect.appendChild(option);
  }

  if (!selectedValue || !models.includes(selectedValue)) {
    modelSelect.selectedIndex = 0;
    cachedModel = modelSelect.value;
  }

  modelSelect.disabled = false;
}

function syncSettingsForm() {
  removeStoredKey = false;
  if (!apiKeyInput || !apiKeyHelp) return;

  if (hasStoredApiKey && isDesktopShell) {
    apiKeyInput.value = '';
    apiKeyInput.placeholder = 'Stored securely';
    apiKeyHelp.textContent = 'Enter a new key to replace the stored one.';
    apiKeyRemoveButton?.removeAttribute('hidden');
  } else if (hasStoredApiKey) {
    apiKeyInput.value = cachedApiKey;
    apiKeyInput.placeholder = 'sk-...';
    apiKeyHelp.textContent = 'Your key is stored locally on this device.';
    apiKeyRemoveButton?.removeAttribute('hidden');
  } else {
    apiKeyInput.value = '';
    apiKeyInput.placeholder = 'sk-...';
    apiKeyHelp.textContent = 'Paste a key from your OpenAI account.';
    apiKeyRemoveButton?.setAttribute('hidden', 'hidden');
  }

  populateModelOptions(cachedModels, cachedModel);
  settingsFeedback.textContent = '';
  settingsFeedback.removeAttribute('data-status');
  if (refreshModelsButton) {
    refreshModelsButton.disabled = !(hasStoredApiKey || apiKeyInput.value.trim());
    refreshModelsButton.dataset.state = 'idle';
  }
}

function closeSettings() {
  settingsOverlay?.setAttribute('hidden', 'hidden');
  settingsFeedback.textContent = '';
  settingsFeedback.removeAttribute('data-status');
  removeStoredKey = false;
  setStatus('Settings closed');
}

async function openSettings() {
  await readPersistedSettings();
  syncSettingsForm();
  settingsOverlay?.removeAttribute('hidden');
  window.setTimeout(() => apiKeyInput?.focus(), 40);
}

function activeApiKey() {
  if (isDesktopShell) {
    if (removeStoredKey) {
      return { directive: 'remove' };
    }
    const inline = apiKeyInput?.value.trim();
    if (inline) {
      return { directive: 'update', value: inline };
    }
    return { directive: 'keep' };
  }

  const inline = apiKeyInput?.value.trim() ?? '';
  if (!inline && !hasStoredApiKey) {
    return { directive: 'remove' };
  }
  if (inline) {
    return { directive: 'update', value: inline };
  }
  return { directive: 'keep', value: cachedApiKey };
}

function setRefreshModelsState(state) {
  if (!refreshModelsButton) return;
  refreshModelsButton.dataset.state = state;
  if (state === 'loading') {
    refreshModelsButton.disabled = true;
  } else {
    refreshModelsButton.disabled = !(hasStoredApiKey || Boolean(apiKeyInput?.value.trim()));
  }
}

async function refreshModels() {
  if (!apiKeyInput || isSending) return;
  const resolved = activeApiKey();
  if (resolved.directive === 'remove' && !cachedApiKey && !hasStoredApiKey) {
    settingsFeedback.textContent = 'Add an API key first.';
    settingsFeedback.dataset.status = 'error';
    return;
  }

  setRefreshModelsState('loading');
  try {
    let models = [];
    if (isDesktopShell && desktopAPI) {
      const payload = resolved.directive === 'update' && resolved.value
        ? await desktopAPI.fetchModels({ apiKey: resolved.value })
        : await desktopAPI.fetchModels({ useStoredKey: true });
      models = payload.models ?? [];
      if (payload.persisted) {
        cachedModels = models;
      }
    } else {
      const key = resolved.directive === 'update' ? resolved.value : cachedApiKey;
      const response = await fetch(OPENAI_MODELS_ENDPOINT, {
        headers: {
          Authorization: `Bearer ${key}`,
        },
      });
      if (!response.ok) {
        throw new Error('Unable to refresh models');
      }
      const data = await response.json();
      const list = data?.data ?? data?.models ?? [];
      models = list
        .map((entry) => entry?.id ?? entry)
        .filter((id) => typeof id === 'string' && /gpt/i.test(id))
        .sort((a, b) => a.localeCompare(b));
      cachedModels = models;
      cachedApiKey = key;
      hasStoredApiKey = Boolean(cachedApiKey);
      await persistSettings();
    }

    populateModelOptions(models, cachedModel);
    settingsFeedback.textContent = models.length
      ? 'Models refreshed'
      : 'No GPT models returned for this key yet.';
    settingsFeedback.removeAttribute('data-status');
  } catch (error) {
    console.error(error);
    settingsFeedback.textContent = error.message || 'Could not refresh models.';
    settingsFeedback.dataset.status = 'error';
  } finally {
    setRefreshModelsState('idle');
    updateOnlineState();
  }
}

async function saveSettings(event) {
  event?.preventDefault();
  const resolved = activeApiKey();
  const chosenModel = modelSelect?.value ?? '';

  try {
    if (isDesktopShell && desktopAPI) {
      const payload = {
        keyDirective: resolved.directive,
        model: chosenModel,
      };
      if (resolved.directive === 'update' && resolved.value) {
        payload.apiKey = resolved.value;
      }
      const result = await desktopAPI.saveSettings(payload);
      hasStoredApiKey = Boolean(result?.hasApiKey);
      cachedModel = result?.model ?? '';
      cachedModels = Array.isArray(result?.models) ? result.models : cachedModels;
    } else {
      if (resolved.directive === 'update' && resolved.value) {
        cachedApiKey = resolved.value;
        hasStoredApiKey = true;
      } else if (resolved.directive === 'remove') {
        cachedApiKey = '';
        hasStoredApiKey = false;
      }
      cachedModel = chosenModel;
      await persistSettings();
    }

    settingsFeedback.textContent = 'Settings saved';
    settingsFeedback.removeAttribute('data-status');
    removeStoredKey = false;
    updateOnlineState();
  } catch (error) {
    console.error(error);
    settingsFeedback.textContent = error.message || 'Unable to save settings.';
    settingsFeedback.dataset.status = 'error';
  }
}

async function requestChatResponse(conversation) {
  if (isDesktopShell && desktopAPI) {
    const result = await desktopAPI.sendMessage({ conversation });
    return result.reply ?? '';
  }

  const key = cachedApiKey;
  if (!key) {
    throw new Error('Add an API key in settings before chatting.');
  }
  const model = cachedModel;
  if (!model) {
    throw new Error('Choose a model in settings before chatting.');
  }

  const response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      input: conversation.map((entry) => ({
        role: entry.role,
        content: [
          {
            type: 'text',
            text: String(entry.content ?? ''),
          },
        ],
      })),
    }),
  });

  if (!response.ok) {
    throw new Error('OpenAI did not return any text for this request.');
  }

  const payload = await response.json();
  if (Array.isArray(payload.output)) {
    const combined = [];
    for (const item of payload.output) {
      const contents = item?.content ?? item?.contents;
      if (!Array.isArray(contents)) continue;
      for (const block of contents) {
        if (block?.type === 'output_text' && typeof block.text === 'string') {
          combined.push(block.text);
        }
        if (block?.type === 'text' && typeof block.text === 'string') {
          combined.push(block.text);
        }
      }
    }
    if (combined.length) {
      return combined.join('\n');
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

  if (typeof payload.result === 'string') {
    return payload.result;
  }

  return '';
}

async function handleComposerSubmit(event) {
  event.preventDefault();
  if (!composerInput) return;
  const message = composerInput.value.trim();
  if (!message || isSending) return;

  composerInput.value = '';
  composerInput.style.height = 'auto';
  appendMessage('user', message);
  conversationHistory.push({ role: 'user', content: message });

  setComposerBusy(true);
  appendMessage('system', 'Nimbus is thinking...');

  try {
    const reply = await requestChatResponse(conversationHistory);
    const last = messageLog?.lastElementChild;
    if (last?.dataset.role === 'system' && last.textContent === 'Nimbus is thinking...') {
      last.remove();
    }
    const trimmed = reply.trim();
    if (!trimmed) {
      throw new Error('Nimbus could not find words this time. Try again?');
    }
    appendMessage('assistant', trimmed);
    conversationHistory.push({ role: 'assistant', content: trimmed });
    setStatus('Reply received');
    updateChatStatus('Ready');
  } catch (error) {
    const last = messageLog?.lastElementChild;
    if (last?.dataset.role === 'system' && last.textContent === 'Nimbus is thinking...') {
      last.textContent = error.message || 'Nimbus ran into a problem.';
    } else {
      appendMessage('system', error.message || 'Nimbus ran into a problem.');
    }
    if (conversationHistory[conversationHistory.length - 1]?.role === 'user') {
      conversationHistory.pop();
    }
    updateChatStatus('Check settings');
  } finally {
    setComposerBusy(false);
  }
}

function toggleChatPanel(forceOpen) {
  if (!chatPanel || !chatToggle) return;
  const isHidden = chatPanel.hasAttribute('hidden');
  const shouldOpen = forceOpen ?? isHidden;

  if (shouldOpen) {
    chatPanel.removeAttribute('hidden');
    chatToggle.setAttribute('aria-expanded', 'true');
    root?.setAttribute('data-chat-open', 'true');
    const online = root?.dataset.online === 'true';
    updateChatStatus(online ? 'Ready' : 'Set up');
    window.requestAnimationFrame(() => {
      positionChatPanel({ reset: !chatPanelPosition });
      window.setTimeout(() => composerInput?.focus(), 40);
    });
  } else {
    chatPanel.setAttribute('hidden', 'hidden');
    chatToggle.setAttribute('aria-expanded', 'false');
    root?.setAttribute('data-chat-open', 'false');
    chatToggle.focus();
  }
}

function autoResizeComposer() {
  if (!composerInput) return;
  composerInput.style.height = 'auto';
  composerInput.style.height = `${composerInput.scrollHeight}px`;
}

function installEventListeners() {
  chatToggle?.addEventListener('click', () => toggleChatPanel());
  chatClose?.addEventListener('click', () => toggleChatPanel(false));
  composerInput?.addEventListener('input', autoResizeComposer);
  composerForm?.addEventListener('submit', handleComposerSubmit);
  chatHeader?.addEventListener('pointerdown', startChatDrag);
  chatHeader?.addEventListener('pointermove', updateChatDrag);
  chatHeader?.addEventListener('pointerup', endChatDrag);
  chatHeader?.addEventListener('pointercancel', endChatDrag);
  settingsClose?.addEventListener('click', closeSettings);
  settingsCancel?.addEventListener('click', closeSettings);
  settingsForm?.addEventListener('submit', saveSettings);
  refreshModelsButton?.addEventListener('click', refreshModels);
  apiKeyInput?.addEventListener('input', () => {
    removeStoredKey = false;
    if (refreshModelsButton) {
      refreshModelsButton.disabled = !(hasStoredApiKey || Boolean(apiKeyInput.value.trim()));
    }
  });
  apiKeyRemoveButton?.addEventListener('click', () => {
    removeStoredKey = true;
    apiKeyInput.value = '';
    settingsFeedback.textContent = 'The stored key will be removed when you save.';
    settingsFeedback.removeAttribute('data-status');
    if (refreshModelsButton) {
      refreshModelsButton.disabled = !(hasStoredApiKey || Boolean(apiKeyInput.value.trim()));
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (settingsOverlay && !settingsOverlay.hasAttribute('hidden')) {
        event.preventDefault();
        closeSettings();
      } else if (chatPanel && !chatPanel.hasAttribute('hidden')) {
        event.preventDefault();
        toggleChatPanel(false);
      }
    }
  });

  window.addEventListener('resize', handleWindowResize);

  if (desktopAPI?.onSettingsOpen) {
    desktopAPI.onSettingsOpen(() => {
      openSettings();
      toggleChatPanel(false);
    });
  }
}

function greet() {
  appendMessage('assistant', 'Hi! Nimbus is ready whenever you want to chat.');
  const online = root?.dataset.online === 'true';
  updateChatStatus(online ? 'Ready' : 'Set up');
}

(async function bootstrap() {
  installEventListeners();
  await readPersistedSettings();
  greet();
})();
