const registryPath = '../applets.json';

const root = document.getElementById('nimbus-root');
const toggle = document.querySelector('.buddy-toggle');
const menu = document.querySelector('.buddy-menu');
const appletList = document.getElementById('applet-list');

async function loadRegistry() {
  try {
    const response = await fetch(registryPath);
    if (!response.ok) {
      throw new Error(`Failed to load applet registry: ${response.status}`);
    }
    const registry = await response.json();
    renderMenu(registry);
  } catch (error) {
    console.error(error);
    appletList.innerHTML = '<li class="applet-error">Unable to load applets.</li>';
  }
}

function renderMenu(registry) {
  const entries = Object.values(registry);
  if (!entries.length) {
    appletList.innerHTML = '<li class="applet-empty">No applets registered yet.</li>';
    return;
  }

  appletList.innerHTML = '';
  for (const entry of entries) {
    const item = document.createElement('li');
    item.className = 'applet-item';
    item.textContent = entry.name ?? entry.slug;
    item.dataset.entry = entry.entry;
    appletList.appendChild(item);
  }
}

function toggleMenu() {
  const isHidden = menu.hasAttribute('hidden');
  if (isHidden) {
    menu.removeAttribute('hidden');
  } else {
    menu.setAttribute('hidden', 'hidden');
  }
  toggle.setAttribute('aria-expanded', String(isHidden));
}

function bindEvents() {
  toggle?.addEventListener('click', toggleMenu);
  appletList?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.dataset.entry) return;
    // TODO: Load the target.dataset.entry into an isolated iframe container.
    console.info('Applet selection pending iframe host:', target.dataset.entry);
  });
}

bindEvents();
loadRegistry();
