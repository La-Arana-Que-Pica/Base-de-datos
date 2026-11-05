// Ficha PDF de colores: formato vertical 9:16 pensado para leerla en el celular mientras se edita en la consola.
import { PdfDocument, fit, textWidth } from './pdf.js';
import { ROLES, editorValues, parseHex } from './colors.js';
import { kitTag, pathOf } from './library.js';

const W = 405, H = 720, M = 24;
const INK = [20, 24, 28], MUTED = [104, 116, 124], LINE = [222, 228, 232], ACCENT = [16, 150, 136], BAND = [12, 22, 27];
const ROW = 62, CROW = 50, HEAD = 238, FOOT = 36;

/** Recorta por el principio («…/Equipo / p1»): en las rutas lo importante es el final. */
function fitStart(s, size, max, font = 'regular') {
  if (textWidth(s, size, font) <= max) return s;
  const t = [...s];
  while (t.length && textWidth('…' + t.join(''), size, font) > max) t.shift();
  return '…' + t.join('');
}

function rowsFor(node) {
  const rows = ROLES.map(r => ({ label: r.label, hex: node.colors?.[r.key] || null, big: true }));
  (node.custom || []).forEach((c, i) => rows.push({ label: c.name, hex: c.hex, big: false, first: i === 0 }));
  return rows;
}

/** Páginas que ocupa un kit (la primera tiene la miniatura). */
function paginate(rows) {
  const pages = [[]];
  let y = HEAD + 26;
  for (const r of rows) {
    const h = (r.big ? ROW : CROW) + (r.first ? 14 : 0);
    if (y + h > H - FOOT) { pages.push([]); y = 90; }
    pages[pages.length - 1].push(r); y += h;
  }
  return pages;
}

function colorRow(page, y, r) {
  const sw = r.big ? 44 : 34;
  if (r.hex) page.rect(M, y, sw, sw, parseHex(r.hex), [190, 198, 204], 0.6);
  else page.rect(M, y, sw, sw, [246, 247, 248], [200, 206, 210], 0.6).line(M + 4, y + sw - 4, M + sw - 4, y + 4, [200, 206, 210]);
  const x = M + sw + 14;
  page.text(x, y + 11, fit(r.label, 9.5, W - x - M, 'bold'), { size: 9.5, font: 'bold', color: MUTED });
  if (!r.hex) { page.text(x, y + (r.big ? 32 : 27), 'Sin definir', { size: r.big ? 15 : 13, color: MUTED }); return; }
  const v = editorValues(r.hex), c = parseHex(r.hex), size = r.big ? 21 : 16;
  page.text(x, y + (r.big ? 34 : 28), `R ${String(v[0]).padStart(2)}  G ${String(v[1]).padStart(2)}  B ${String(v[2]).padStart(2)}`, { size, font: 'mono', color: INK });
  page.text(x, y + (r.big ? 48 : 41), `#${r.hex} · RGB ${c.join(' ')}`, { size: 8, color: MUTED });
}

function footer(page, n, total, title) {
  page.line(M, H - 26, W - M, H - 26, LINE, 0.6);
  page.text(M, H - 13, fit(title, 8, W - 2 * M - 60), { size: 8, color: MUTED });
  page.text(W - M, H - 13, `${n} / ${total}`, { size: 8, color: MUTED, align: 'right' });
}

/**
 * @param project proyecto completo (para rutas de carpetas)
 * @param nodes kits en el orden del explorador
 * @param thumbs Map(id → {bytes, width, height}) JPEG de cada miniatura
 */
export function buildSheet(project, nodes, thumbs = new Map()) {
  const doc = new PdfDocument(W, H);
  const date = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  const kits = nodes.map(n => ({ node: n, folders: pathOf(project, n.id).slice(0, -1), pages: paginate(rowsFor(n)) }));

  // Índice: entradas (carpetas como encabezados) y cuántas páginas ocupa
  const entries = [];
  let last = null;
  for (const [i, k] of kits.entries()) {
    const f = k.folders.join(' / ');
    if (f && f !== last) entries.push({ folder: f });
    last = f;
    entries.push({ kit: i });
  }
  const single = kits.length === 1;
  const perFirst = Math.floor((H - FOOT - 236) / 22), perNext = Math.floor((H - FOOT - 60) / 22);
  // Reparto del índice en páginas sin dejar un encabezado de carpeta solo al pie
  const indexLayout = [];
  if (!single) {
    let cur = [];
    entries.forEach((e, i) => {
      const max = indexLayout.length ? perNext : perFirst;
      if (cur.length >= max || (e.folder && cur.length === max - 1 && entries[i + 1])) { indexLayout.push(cur); cur = []; }
      cur.push(e);
    });
    indexLayout.push(cur);
  }
  let next = indexLayout.length;
  for (const k of kits) { k.first = next; next += k.pages.length; }
  const total = next;

  // Portada + índice
  if (!single) {
    let page = doc.addPage(), y = 0;
    page.rect(0, 0, W, 150, BAND).rect(M, 30, 4, 34, ACCENT);
    page.text(M + 14, 44, 'LAqP · KIT COLOR STUDIO', { size: 9, font: 'bold', color: [120, 220, 205] });
    page.text(M + 14, 66, fit(project.name, 20, W - 2 * M - 14, 'bold'), { size: 20, font: 'bold', color: [242, 246, 247] });
    page.text(M + 14, 92, `${kits.length} uniformes · ${date}`, { size: 10, color: [170, 190, 194] });
    page.text(M + 14, 118, 'Valores R G B de 0 a 63 para el editor de PES 2018.', { size: 9.5, color: [210, 225, 228] });
    page.text(M + 14, 132, 'Tocá un uniforme para ir a su ficha.', { size: 9.5, color: [170, 190, 194] });
    page.text(M, 186, 'Índice', { size: 13, font: 'bold' });
    y = 214;
    indexLayout.forEach((rows, pi) => {
      if (pi) { footer(page, doc.pages.length, total, project.name); page = doc.addPage(); y = 44; }
      for (const e of rows) {
      if (e.folder) {
        page.text(M, y, fitStart(e.folder, 9, W - 2 * M, 'bold'), { size: 9, font: 'bold', color: ACCENT });
      } else {
        const k = kits[e.kit], tag = k.node.role === 'kit' ? kitTag(k.node.name, k.folders.at(-1)) : '';
        const indent = k.folders.length ? 10 : 0;
        page.text(M + indent, y, fit(k.node.name + (tag ? `  · ${tag}` : ''), 11, W - 2 * M - indent - 40), { size: 11 });
        page.text(W - M, y, String(k.first + 1), { size: 10, color: MUTED, align: 'right' });
        page.link(M, y - 14, W - 2 * M, 20, k.first);
      }
      y += 22;
      }
    });
    footer(page, doc.pages.length, total, project.name);
  }

  // Fichas
  for (const k of kits) {
    const n = k.node;
    k.pages.forEach((rows, pi) => {
      const page = doc.addPage();
      const crumbs = k.folders.length ? k.folders.join(' / ') : project.name;
      page.rect(0, 0, W, 4, ACCENT);
      page.text(M, 26, fitStart(crumbs, 8.5, W - 2 * M), { size: 8.5, color: MUTED });
      page.text(M, 48, fit(n.name, 17, W - 2 * M, 'bold'), { size: 17, font: 'bold' });
      let y;
      if (pi === 0) {
        const tag = kitTag(n.name, k.folders.at(-1));
        const meta = [tag, n.formatName, n.width ? `${n.width} × ${n.height}` : '', n.analysis?.mode === 'free' ? 'imagen libre' : ''].filter(Boolean).join(' · ');
        page.text(M, 64, fit(meta, 9, W - 2 * M), { size: 9, color: MUTED });
        const t = thumbs.get(n.id), box = 150;
        page.rect(M, 76, W - 2 * M, box + 8, [244, 246, 247]);
        if (t) {
          const s = Math.min(box / t.width, box / t.height), w = t.width * s, h = t.height * s;
          page.image(doc.addJpeg(t.bytes, t.width, t.height), (W - w) / 2, 80 + (box - h) / 2, w, h);
        } else page.text(W / 2, 80 + box / 2, 'Sin vista previa', { size: 9, color: MUTED, align: 'center' });
        y = HEAD + 26;
      } else {
        page.text(M, 64, 'continuación', { size: 9, color: MUTED });
        y = 90;
      }
      rows.forEach(r => {
        if (r.first) { page.text(M, y + 4, 'Colores personalizados', { size: 9, font: 'bold', color: ACCENT }); y += 14; }
        colorRow(page, y, r);
        y += r.big ? ROW : CROW;
      });
      footer(page, doc.pages.length, total, project.name);
    });
  }
  return doc.toBlob({ title: `${project.name} · Kit Color Studio` });
}

