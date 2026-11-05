// Escritor PDF mínimo: fuentes estándar (Helvetica, Helvetica-Bold, Courier-Bold) con WinAnsi, imágenes JPEG,
// rectángulos y enlaces internos. Coordenadas en puntos desde la esquina superior izquierda.

const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const FONTS = { regular: ['F1', 'Helvetica'], bold: ['F2', 'Helvetica-Bold'], mono: ['F3', 'Courier-Bold'] };
// Unicode → WinAnsi (cp1252) para los caracteres fuera de Latin-1
const CP1252 = { '€': 128, '‚': 130, 'ƒ': 131, '„': 132, '…': 133, '†': 134, '‡': 135, 'ˆ': 136, '‰': 137, 'Š': 138, '‹': 139, 'Œ': 140, 'Ž': 142, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '˜': 152, '™': 153, 'š': 154, '›': 155, 'œ': 156, 'ž': 158, 'Ÿ': 159 };

function winAnsi(s) {
  const out = [];
  for (const ch of String(s).normalize('NFC')) {
    const c = ch.codePointAt(0);
    out.push(CP1252[ch] ?? (c >= 32 && c <= 255 && !(c >= 127 && c < 160) ? c : 63));
  }
  return out;
}

export function textWidth(s, size, font = 'regular') {
  if (font === 'mono') return [...String(s)].length * 600 * size / 1000;
  let w = 0;
  for (const c of winAnsi(s)) {
    const base = c >= 192 ? String.fromCharCode(c).normalize('NFD').charCodeAt(0) : c;
    w += HELV[(base >= 32 && base <= 126 ? base : 110) - 32];
  }
  return w * size / 1000 * (font === 'bold' ? 1.06 : 1);
}

/** Recorta con «…» para que entre en `max` puntos. */
export function fit(s, size, max, font = 'regular') {
  s = String(s);
  if (textWidth(s, size, font) <= max) return s;
  let t = [...s];
  while (t.length && textWidth(t.join('') + '…', size, font) > max) t.pop();
  return t.join('') + '…';
}

function pdfString(s) {
  let out = '(';
  for (const c of winAnsi(s)) out += c === 40 || c === 41 || c === 92 ? '\\' + String.fromCharCode(c) : c < 128 ? String.fromCharCode(c) : '\\' + c.toString(8).padStart(3, '0');
  return out + ')';
}
const n2 = v => (Math.round(v * 100) / 100).toString();
const rgb = c => c.map(v => n2(v / 255)).join(' ');

export class PdfDocument {
  constructor(width, height) { this.width = width; this.height = height; this.pages = []; this.images = []; }

  addPage() {
    const page = { ops: [], links: [] };
    this.pages.push(page);
    const H = this.height;
    const api = {
      index: this.pages.length - 1,
      rect: (x, y, w, h, fill, stroke, lineWidth = 1) => {
        page.ops.push(`${fill ? rgb(fill) + ' rg ' : ''}${stroke ? rgb(stroke) + ' RG ' + n2(lineWidth) + ' w ' : ''}${n2(x)} ${n2(H - y - h)} ${n2(w)} ${n2(h)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
        return api;
      },
      line: (x1, y1, x2, y2, color, lineWidth = 1) => { page.ops.push(`${rgb(color)} RG ${n2(lineWidth)} w ${n2(x1)} ${n2(H - y1)} m ${n2(x2)} ${n2(H - y2)} l S`); return api; },
      /** y = línea de base. */
      text: (x, y, s, { size = 11, font = 'regular', color = [20, 24, 28], align = 'left' } = {}) => {
        const w = align === 'left' ? 0 : textWidth(s, size, font);
        const tx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
        page.ops.push(`BT /${FONTS[font][0]} ${n2(size)} Tf ${rgb(color)} rg ${n2(tx)} ${n2(H - y)} Td ${pdfString(s)} Tj ET`);
        return api;
      },
      image: (img, x, y, w, h) => { page.ops.push(`q ${n2(w)} 0 0 ${n2(h)} ${n2(x)} ${n2(H - y - h)} cm /${img.name} Do Q`); return api; },
      link: (x, y, w, h, targetIndex) => { page.links.push({ rect: [x, H - y - h, x + w, H - y], target: targetIndex }); return api; },
    };
    return api;
  }

  /** JPEG (Uint8Array) con sus dimensiones. */
  addJpeg(bytes, width, height) {
    const img = { name: 'Im' + (this.images.length + 1), bytes, width, height };
    this.images.push(img);
    return img;
  }

  toBlob({ title = '' } = {}) {
    const enc = new TextEncoder();
    const objects = [];   // [contenido (Uint8Array[])]
    const alloc = () => { objects.push(null); return objects.length; };
    const set = (id, ...parts) => { objects[id - 1] = parts.map(p => typeof p === 'string' ? enc.encode(p) : p); };
    const catalog = alloc(), pagesId = alloc(), info = alloc();
    const fontIds = Object.fromEntries(Object.values(FONTS).map(([key, base]) => { const id = alloc(); set(id, `<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>`); return [key, id]; }));
    const imgIds = this.images.map(img => {
      const id = alloc();
      set(id, `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`, img.bytes, '\nendstream');
      return [img.name, id];
    });
    const pageIds = this.pages.map(() => alloc());
    const resources = `<< /Font << ${Object.entries(fontIds).map(([k, id]) => `/${k} ${id} 0 R`).join(' ')} >> /XObject << ${imgIds.map(([k, id]) => `/${k} ${id} 0 R`).join(' ')} >> >>`;
    this.pages.forEach((page, i) => {
      const content = enc.encode(page.ops.join('\n'));
      const cid = alloc();
      set(cid, `<< /Length ${content.length} >>\nstream\n`, content, '\nendstream');
      const annots = page.links.map(l => `<< /Type /Annot /Subtype /Link /Border [0 0 0] /Rect [${l.rect.map(n2).join(' ')}] /Dest [${pageIds[l.target]} 0 R /XYZ null null null] >>`);
      set(pageIds[i], `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n2(this.width)} ${n2(this.height)}] /Resources ${resources} /Contents ${cid} 0 R${annots.length ? ' /Annots [' + annots.join(' ') + ']' : ''} >>`);
    });
    set(pagesId, `<< /Type /Pages /Kids [${pageIds.map(id => id + ' 0 R').join(' ')}] /Count ${pageIds.length} >>`);
    set(catalog, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    set(info, `<< /Title ${pdfString(title)} /Producer (LAqP Kit Color Studio) >>`);

    const chunks = [enc.encode('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')];
    let offset = chunks[0].length;
    const offsets = [];
    objects.forEach((parts, i) => {
      offsets.push(offset);
      const head = enc.encode(`${i + 1} 0 obj\n`), tail = enc.encode('\nendobj\n');
      chunks.push(head, ...parts, tail);
      offset += head.length + parts.reduce((n, p) => n + p.length, 0) + tail.length;
    });
    const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`;
    chunks.push(enc.encode(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${offset}\n%%EOF\n`));
    return new Blob(chunks, { type: 'application/pdf' });
  }
}
