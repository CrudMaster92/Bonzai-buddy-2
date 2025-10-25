const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs/promises');

const SETTINGS_FILE = 'settings.json';
const REGISTRY_FILE = path.resolve(__dirname, '..', 'applets.json');
const NIMBUS_ROOT = path.resolve(__dirname, '..', 'nimbus', 'index.html');
const RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';
const MODELS_ENDPOINT = 'https://api.openai.com/v1/models';
const REALTIME_ENDPOINT = 'https://api.openai.com/v1/realtime';
const REALTIME_MODEL_FALLBACK = 'gpt-4o-realtime';
const REALTIME_VOICE_DEFAULT = 'alloy';

let tray = null;
let windowInstance = null;
let settingsPath = '';
let settingsCache = {
  apiKey: '',
  model: '',
  models: [],
  skin: 'cumulus',
};

function resolveSettingsPath() {
  if (settingsPath) {
    return settingsPath;
  }
  const userData = app.getPath('userData');
  settingsPath = path.join(userData, SETTINGS_FILE);
  return settingsPath;
}

async function ensureSettingsLoaded() {
  if (settingsCache.__loaded) {
    return settingsCache;
  }
  const filePath = resolveSettingsPath();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    settingsCache = {
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      model: typeof parsed.model === 'string' ? parsed.model : '',
      models: Array.isArray(parsed.models) ? parsed.models : [],
      skin: typeof parsed.skin === 'string' && parsed.skin ? parsed.skin : 'cumulus',
      __loaded: true,
    };
  } catch (error) {
    settingsCache = { apiKey: '', model: '', models: [], skin: 'cumulus', __loaded: true };
    if (error.code !== 'ENOENT') {
      console.warn('Nimbus desktop could not read settings file', error);
    }
  }
  return settingsCache;
}

async function persistSettingsCache() {
  const filePath = resolveSettingsPath();
  const payload = {
    apiKey: settingsCache.apiKey,
    model: settingsCache.model,
    models: settingsCache.models,
    skin: settingsCache.skin,
  };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function createTrayIcon() {
  const baseImage = nativeImage
    .createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAFgwJ/lC0U5wAAAABJRU5ErkJggg=='
    )
    .resize({ width: 16, height: 16 });
  if (process.platform === 'darwin') {
    baseImage.setTemplateImage(true);
  }
  return baseImage;
}

function createTray() {
  if (tray) return tray;
  tray = new Tray(createTrayIcon());
  tray.setToolTip('Nimbus Buddy');
  const context = Menu.buildFromTemplate([
    {
      label: 'Show Nimbus',
      click: toggleWindow,
    },
    {
      label: 'Settings…',
      click: () => {
        const win = createWindow();
        const send = () => win.webContents.send('settings:open');
        if (win.webContents.isLoading()) {
          win.webContents.once('did-finish-load', send);
        } else {
          send();
        }
        win.show();
        win.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Nimbus',
      click: () => {
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(context);
  tray.on('click', toggleWindow);
  return tray;
}

function createWindow() {
  if (windowInstance) {
    return windowInstance;
  }

  const windowOptions = {
    width: 320,
    height: 420,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  };

  if (process.platform === 'darwin') {
    windowOptions.vibrancy = 'under-window';
    windowOptions.visualEffectState = 'active';
  }

  windowInstance = new BrowserWindow(windowOptions);

  windowInstance.setMenuBarVisibility(false);

  windowInstance.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      windowInstance?.hide();
    }
  });

  windowInstance.loadFile(NIMBUS_ROOT);

  return windowInstance;
}

function getWindowPosition() {
  if (!tray || !windowInstance) return { x: 0, y: 0 };
  const trayBounds = tray.getBounds();
  const windowBounds = windowInstance.getBounds();
  let x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
  let y = Math.round(trayBounds.y - windowBounds.height - 12);
  if (process.platform === 'darwin') {
    y = Math.round(trayBounds.y + trayBounds.height + 8);
  }
  return { x, y };
}

function toggleWindow() {
  const win = createWindow();
  if (win.isVisible()) {
    win.hide();
    return;
  }

  const { x, y } = getWindowPosition();
  win.setPosition(x, y, false);
  win.show();
  win.focus();
}

async function loadRegistryEntries() {
  try {
    const raw = await fs.readFile(REGISTRY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Object.values(parsed).map((entry) => ({
      slug: entry.slug ?? entry.name ?? 'applet',
      name: entry.name ?? entry.slug ?? 'Applet',
      description: entry.description ?? '',
      entry: entry.entry ?? '',
    }));
  } catch (error) {
    console.warn('Nimbus desktop could not load applet registry', error);
    return [];
  }
}

async function callOpenAI(endpoint, key, options) {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let detail = '';
    try {
      const payload = await response.json();
      detail = payload?.error?.message ?? '';
    } catch (error) {
      detail = '';
    }
    throw new Error(detail || `OpenAI responded with ${response.status}`);
  }

  return response.json();
}

async function negotiateRealtimeAnswer({ key, sdp, model, voice }) {
  const targetModel = typeof model === 'string' && model ? model : REALTIME_MODEL_FALLBACK;
  const chosenVoice = typeof voice === 'string' && voice ? voice : REALTIME_VOICE_DEFAULT;
  const endpoint = `${REALTIME_ENDPOINT}?model=${encodeURIComponent(targetModel)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/sdp',
      'OpenAI-Beta': 'realtime=v1',
      'OpenAI-Session-Config': JSON.stringify({
        model: targetModel,
        voice: chosenVoice,
        modalities: ['audio'],
      }),
    },
    body: sdp,
  });

  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch (error) {
      detail = '';
    }
    const message = detail ? `OpenAI realtime error: ${detail}` : `OpenAI responded with ${response.status}`;
    throw new Error(message);
  }

  return response.text();
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
        } else if (block?.type === 'summary_text' && typeof block.text === 'string') {
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

ipcMain.handle('settings:load', async () => {
  const settings = await ensureSettingsLoaded();
  return {
    hasApiKey: Boolean(settings.apiKey),
    model: settings.model,
    models: settings.models,
    skin: settings.skin,
  };
});

ipcMain.handle('settings:save', async (_event, payload = {}) => {
  const settings = await ensureSettingsLoaded();
  const directive = payload.keyDirective;
  if (directive === 'remove') {
    settings.apiKey = '';
  } else if (directive === 'update' && typeof payload.apiKey === 'string') {
    settings.apiKey = payload.apiKey.trim();
  }
  if (typeof payload.model === 'string') {
    settings.model = payload.model;
  }
  if (typeof payload.skin === 'string') {
    settings.skin = payload.skin;
  }
  if (!settings.apiKey) {
    settings.models = [];
  }
  await persistSettingsCache();
  return {
    hasApiKey: Boolean(settings.apiKey),
    model: settings.model,
    models: settings.models,
    skin: settings.skin,
  };
});

ipcMain.handle('openai:fetchModels', async (_event, payload = {}) => {
  const settings = await ensureSettingsLoaded();
  let key = '';
  if (payload.useStoredKey) {
    key = settings.apiKey;
  } else if (typeof payload.apiKey === 'string') {
    key = payload.apiKey.trim();
  }

  if (!key) {
    throw new Error('No API key available to refresh models.');
  }

  const data = await callOpenAI(MODELS_ENDPOINT, key, { method: 'GET', headers: {} });
  const list = data?.data ?? data?.models ?? [];
  const models = list
    .map((entry) => entry?.id ?? entry)
    .filter((id) => typeof id === 'string' && /gpt/i.test(id))
    .sort((a, b) => a.localeCompare(b));

  if (payload.useStoredKey) {
    settings.models = models;
    await persistSettingsCache();
  }

  return { models, persisted: Boolean(payload.useStoredKey) };
});

ipcMain.handle('chat:send', async (_event, payload = {}) => {
  const settings = await ensureSettingsLoaded();
  const key = settings.apiKey;
  if (!key) {
    throw new Error('Add an API key in settings before chatting.');
  }

  const model = typeof payload.model === 'string' ? payload.model : settings.model;
  if (!model) {
    throw new Error('Select a model in settings before chatting.');
  }

  const conversation = Array.isArray(payload.conversation) ? payload.conversation : [];
  const requestPayload = {
    model,
    input: conversation.map((item) => ({
      role: item.role,
      content: [
        {
          type: item.role === 'assistant' ? 'output_text' : 'input_text',
          text: String(item.content ?? ''),
        },
      ],
    })),
  };

  const data = await callOpenAI(RESPONSES_ENDPOINT, key, {
    method: 'POST',
    body: JSON.stringify(requestPayload),
  });

  const reply = extractTextFromResponse(data);
  if (!reply) {
    throw new Error('OpenAI did not return any text for this request.');
  }

  return { reply };
});

ipcMain.handle('voice:negotiate', async (_event, payload = {}) => {
  const settings = await ensureSettingsLoaded();
  const key = settings.apiKey;
  if (!key) {
    throw new Error('Add an API key in settings before starting voice chat.');
  }

  const sdp = typeof payload.sdp === 'string' ? payload.sdp : '';
  if (!sdp) {
    throw new Error('Nimbus needs an SDP offer to start voice chat.');
  }

  const modelCandidate = typeof payload.model === 'string' && payload.model
    ? payload.model
    : settings.model;
  const voiceCandidate = typeof payload.voice === 'string' && payload.voice
    ? payload.voice
    : REALTIME_VOICE_DEFAULT;

  const answer = await negotiateRealtimeAnswer({
    key,
    sdp,
    model: modelCandidate,
    voice: voiceCandidate,
  });

  return { answer };
});

ipcMain.handle('registry:load', async () => {
  return loadRegistryEntries();
});

function prepareApp() {
  app.whenReady().then(async () => {
    if (process.platform === 'darwin') {
      app.dock.hide();
    }
    createTray();
    const win = createWindow();
    const showBuddy = () => {
      if (!win) return;
      if (!win.isVisible()) {
        const { x, y } = getWindowPosition();
        win.setPosition(x, y, false);
      }
      if (typeof win.showInactive === 'function') {
        win.showInactive();
      } else {
        win.show();
      }
    };
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', showBuddy);
    } else {
      showBuddy();
    }
  });

  app.on('window-all-closed', (event) => {
    event.preventDefault();
  });

  app.on('before-quit', () => {
    app.isQuiting = true;
  });

  app.on('activate', () => {
    const win = createWindow();
    win.show();
  });
}

prepareApp();
