// Rutas, tipos de archivo y árbol del proyecto. Los nombres originales nunca se cambian: solo se limpian rutas inseguras.

export const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'dds', 'ftex'];
export const ARCHIVE_EXT = ['zip', 'rar'];
export const ACCEPT = [...IMAGE_EXT, ...ARCHIVE_EXT].map(e => '.' + e).join(',') + ',image/png,image/jpeg,image/webp';
const AUX = { _back: 'back', _chest: 'chest', _leg: 'leg', _name: 'name', _srm: 'srm' };
export const AUX_LABEL = { back: 'Dorsal (espalda)', chest: 'Número del pecho', leg: 'Número del pantalón', name: 'Fuente del nombre', srm: 'Mapa de brillo (_srm)' };

export function extension(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

/** Tipo por los primeros bytes (manda sobre la extensión). */
export function sniff(bytes, name = '') {
  const b = bytes;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  if (b[0] === 0x44 && b[1] === 0x44 && b[2] === 0x53 && b[3] === 0x20) return 'dds';
  if (b[0] === 0x46 && b[1] === 0x54 && b[2] === 0x45 && b[3] === 0x58) return 'ftex';
  if (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5)) return 'zip';
  if (b[0] === 0x52 && b[1] === 0x61 && b[2] === 0x72 && b[3] === 0x21) return 'rar';
  const ext = extension(name);
  return ext === 'jpeg' ? 'jpg' : ext;
}

/** Ruta interna de un archivo comprimido → segmentos seguros (sin «..», unidades, raíz absoluta ni caracteres de control). */
export function safeSegments(path) {
  return String(path || '').replace(/\\/g, '/').split('/')
    .map(s => s.replace(/[\u0000-\u001f\u007f]/g, ''))
    .filter((s, i) => s && s !== '.' && s !== '..' && !(i === 0 && /^[a-z]:$/i.test(s)))
    .slice(-32);
}

/** Nombre sin extensión (también «x.ftex.dds»). */
export function stem(name) {
  return name.replace(/\.[a-z0-9]+$/i, '').replace(/\.ftex$/i, '');
}

/** kit · aux (back/chest/leg/name/srm). */
export function classify(name) {
  const s = stem(name).toLowerCase();
  for (const [suffix, kind] of Object.entries(AUX)) if (s.endsWith(suffix)) return { role: 'aux', aux: kind, base: stem(name).slice(0, -suffix.length) };
  return { role: 'kit', aux: null, base: stem(name) };
}

const TAGS = [
  [/(^|[^a-z0-9])(p1|1st|home|local|titular)([^a-z0-9]|$)/i, 'Local'],
  [/(^|[^a-z0-9])(p2|2nd|away|visitante|suplente)([^a-z0-9]|$)/i, 'Visitante'],
  [/(^|[^a-z0-9])(p3|3rd|third|alternativ[oa]|tercera)([^a-z0-9]|$)/i, 'Alternativo'],
  [/(^|[^a-z0-9])p([4-9])([^a-z0-9]|$)/i, m => `Alternativo ${m[2] - 2}`],
  [/(^|[^a-z0-9])(g1|gk|gk1|gk1st|goalkeeper|arquero|portero)([^a-z0-9]|$)/i, 'Arquero'],
  [/(^|[^a-z0-9])(g([2-9])|gk([2-9]))([^a-z0-9]|$)/i, m => `Arquero ${m[3] || m[4]}`],
];
/** Etiqueta informativa (no cambia nada): primero el nombre del archivo, después la carpeta que lo contiene (p1, g1…). */
export function kitTag(name, parentName = '') {
  const s = stem(name).replace(/^u\d{4}(?=[pg]\d)/i, ' ');
  for (const candidate of [s, parentName]) {
    if (!candidate) continue;
    for (const [re, label] of TAGS) { const m = re.exec(candidate); if (m) return typeof label === 'function' ? label(m) : label; }
  }
  return '';
}

export function naturalCompare(a, b) { return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }); }

let seq = 0;
export function newId(prefix = 'n') { return `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

// ---------- Árbol del proyecto (nodos planos con parentId) ----------
export function children(project, parentId) {
  return Object.values(project.nodes).filter(n => n.parentId === parentId)
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'folder' ? -1 : 1) || naturalCompare(a.name, b.name));
}

export function pathOf(project, id) {
  const out = [];
  for (let n = project.nodes[id]; n; n = project.nodes[n.parentId]) out.unshift(n.name);
  return out;
}

/** Carpeta hija con ese nombre exacto; si no existe la crea. */
export function ensureFolder(project, parentId, name) {
  const found = Object.values(project.nodes).find(n => n.type === 'folder' && n.parentId === parentId && n.name === name);
  if (found) return found.id;
  const id = newId('d');
  project.nodes[id] = { id, type: 'folder', name, parentId };
  return id;
}

export function isDescendant(project, id, ancestorId) {
  for (let n = project.nodes[id]; n; n = project.nodes[n.parentId]) if (n.id === ancestorId) return true;
  return false;
}

export function moveNode(project, id, parentId) {
  const n = project.nodes[id];
  if (!n || (parentId && !project.nodes[parentId]) || (parentId && project.nodes[parentId].type !== 'folder')) return false;
  if (n.type === 'folder' && parentId && isDescendant(project, parentId, id)) return false;
  n.parentId = parentId || null;
  return true;
}

/** Elimina el nodo y sus descendientes; devuelve las claves de archivos (blobs) liberadas. */
export function removeNode(project, id) {
  const freed = [];
  const walk = nid => {
    for (const c of Object.values(project.nodes)) if (c.parentId === nid) walk(c.id);
    const n = project.nodes[nid];
    if (n?.type === 'file') freed.push(n.blob);
    delete project.nodes[nid];
  };
  walk(id);
  return freed;
}

/** Archivos en el orden del explorador (recorrido en profundidad). */
export function orderedFiles(project, filter = () => true) {
  const out = [];
  const walk = pid => { for (const n of children(project, pid)) { if (n.type === 'folder') walk(n.id); else if (filter(n)) out.push(n); } };
  walk(null);
  return out;
}

/** Kit al que pertenece una textura auxiliar (mismo nombre base, misma carpeta). */
export function siblingKit(project, aux) {
  const base = classify(aux.name).base.toLowerCase();
  return Object.values(project.nodes).find(n => n.type === 'file' && n.parentId === aux.parentId && n.role === 'kit' && stem(n.name).toLowerCase() === base) || null;
}
