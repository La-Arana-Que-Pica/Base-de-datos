// Guardado local en IndexedDB: proyectos (JSON), archivos originales (Blob) y miniaturas. Nada sale del navegador.
const DB = 'laqp-kit-color-studio';
let dbp = null;

function req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

export function openDb() {
  dbp ||= new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Este navegador no permite guardar datos locales.')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of ['projects', 'blobs', 'thumbs', 'meta']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('Cerrá las otras pestañas de Kit Color Studio y recargá la página.'));
  }).catch(e => { dbp = null; throw e; });
  return dbp;
}

async function tx(stores, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let out;
    Promise.resolve(fn(...[].concat(stores).map(s => t.objectStore(s)))).then(v => { out = v; }, reject);
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Operación cancelada'));
  });
}

export const getMeta = key => tx('meta', 'readonly', s => req(s.get(key)));
export const setMeta = (key, value) => tx('meta', 'readwrite', s => { s.put(value, key); });
export const listProjects = () => tx('projects', 'readonly', s => req(s.getAll()));
export const getProject = id => tx('projects', 'readonly', s => req(s.get(id)));
export const saveProject = project => tx('projects', 'readwrite', s => { s.put(structuredClone(project), project.id); });
export const getBlob = key => tx('blobs', 'readonly', s => req(s.get(key)));
export const putBlob = (key, blob) => tx('blobs', 'readwrite', s => { s.put(blob, key); });
export const getThumb = key => tx('thumbs', 'readonly', s => req(s.get(key)));
export const putThumb = (key, blob) => tx('thumbs', 'readwrite', s => { s.put(blob, key); });
export const deleteBlobs = keys => tx(['blobs', 'thumbs'], 'readwrite', (b, t) => { for (const k of keys) { if (!k) continue; b.delete(k); t.delete(k); } });

export async function deleteProject(project) {
  const keys = Object.values(project.nodes).filter(n => n.type === 'file').map(n => n.blob);
  await deleteBlobs(keys);
  await tx('projects', 'readwrite', s => { s.delete(project.id); });
}

/** Pide almacenamiento persistente (el navegador puede negarlo); nunca bloquea. */
export async function requestPersistence() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}

export async function storageEstimate() {
  try { return await navigator.storage?.estimate?.(); } catch { return null; }
}
