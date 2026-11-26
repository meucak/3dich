// 3dich — Persistent Local Storage + IndexedDB Vault for Builds & Gemini 3D Renders

const DB_NAME = '3dich_vault_v1';
const DB_VERSION = 1;
const SETTINGS_KEY = '3dich_settings_v1';
const STATE_KEY = '3dich_build_v1';

const DEFAULT_SETTINGS = {
  lang: 'tr',
  theme: 'dark',
  provider: 'gemini',
  apiKey: '',
  textModel: 'gemini-3.8-flash',
  imageModel: 'gemini-3.1-flash-image',
  agyModel: 'gemini-3.8-flash-high',
  agyKasaToken: '',
  agyToshiToken: '',
  agyKasaUrl: '',
  agyToshiUrl: '',
  useProxy: false,
  dprCap: 2.0,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch { /* ignore private mode quota */ }
  return next;
}

export function saveBuildSnapshot(stateObj) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(stateObj));
  } catch { /* ignore */ }
}

export function loadBuildSnapshot() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// IndexedDB for heavy generated Gemini PNG renders
function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('renders')) {
        db.createObjectStore('renders', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRenderToGallery(item) {
  try {
    const db = await openDB();
    if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction('renders', 'readwrite');
      tx.objectStore('renders').put(item);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* non-fatal */ }
}

export async function loadRenderGallery() {
  try {
    const db = await openDB();
    if (!db) return [];
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('renders', 'readonly');
      const req = tx.objectStore('renders').getAll();
      req.onsuccess = () => {
        const list = (req.result || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        resolve(list.slice(0, 24));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function deleteRenderFromGallery(id) {
  try {
    const db = await openDB();
    if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction('renders', 'readwrite');
      tx.objectStore('renders').delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* ignore */ }
}
