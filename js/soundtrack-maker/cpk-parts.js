// CPK por partes para archivos grandes (un AWB de 32 canciones supera los 350 MB): misma estructura que
// js/miniface-studio/cpk.js (CRI Packed File Maker, modo FILENAME, alineación 512; confirmada en PES 2018), pero los
// datos no se copian a un único Uint8Array: se devuelve la lista de partes (Uint8Array o Blob) para armar un Blob.
// Una prueba exige que el resultado sea idéntico byte a byte al de createCpk de Miniface Studio.

const CONTENT_OFFSET = 0x800;
const DEFAULT_ALIGN = 512;
export const TOOL_VERSION = 'LAqP Soundtrack Maker CPK 1.0';

const TYPE = { u16: 0x02, u32: 0x04, u64: 0x06, str: 0x0a, data: 0x0b };
const STORAGE = { zero: 0x10, const: 0x30, row: 0x50 };
const SIZE = { u16: 2, u32: 4, u64: 8, str: 4, data: 8 };
const encoder = new TextEncoder();
const alignUp = (value, align) => Math.ceil(value / align) * align;

function utfTable(name, columns, rows) {
  const strings = [];
  const stringOffsets = new Map();
  let stringBytes = 0;
  const addString = text => {
    if (stringOffsets.has(text)) return stringOffsets.get(text);
    const bytes = encoder.encode(text + '\0');
    stringOffsets.set(text, stringBytes);
    strings.push(bytes);
    stringBytes += bytes.length;
    return stringOffsets.get(text);
  };
  addString('<NULL>');
  const tableName = addString(name);
  const columnMeta = columns.map(column => {
    const meta = { ...column, nameOffset: addString(column.name) };
    if (column.storage === 'const' && column.type === 'str') meta.constOffset = addString(column.value);
    return meta;
  });
  const rowColumns = columnMeta.filter(column => column.storage === 'row');
  for (const row of rows) for (const column of rowColumns) if (column.type === 'str') addString(row[column.name]);

  const columnsSize = columnMeta.reduce((sum, c) => sum + 5 + (c.storage === 'const' ? SIZE[c.type] : 0), 0);
  const rowLength = rowColumns.reduce((sum, c) => sum + SIZE[c.type], 0);
  const rowsOffset = 24 + columnsSize;
  const stringsOffset = rowsOffset + rowLength * rows.length;
  const tableSize = alignUp(stringsOffset + stringBytes, 8);

  const out = new Uint8Array(8 + tableSize);
  const view = new DataView(out.buffer);
  out.set(encoder.encode('@UTF'), 0);
  view.setUint32(4, tableSize);
  const base = 8;
  view.setUint16(base, 0);
  view.setUint16(base + 2, rowsOffset);
  view.setUint32(base + 4, stringsOffset);
  view.setUint32(base + 8, tableSize);
  view.setUint32(base + 12, tableName);
  view.setUint16(base + 16, columnMeta.length);
  view.setUint16(base + 18, rowLength);
  view.setUint32(base + 20, rows.length);

  const write = (offset, type, value) => {
    switch (type) {
      case 'u16': view.setUint16(offset, value); break;
      case 'u32': view.setUint32(offset, value); break;
      case 'u64': view.setBigUint64(offset, BigInt(value)); break;
      case 'str': view.setUint32(offset, stringOffsets.get(value)); break;
      case 'data': view.setUint32(offset, value[0]); view.setUint32(offset + 4, value[1]); break;
      default: throw new Error('Tipo de columna desconocido: ' + type);
    }
  };
  let p = base + 24;
  for (const column of columnMeta) {
    out[p] = STORAGE[column.storage] | TYPE[column.type];
    view.setUint32(p + 1, column.nameOffset);
    p += 5;
    if (column.storage === 'const') { write(p, column.type, column.value); p += SIZE[column.type]; }
  }
  for (const row of rows) {
    for (const column of rowColumns) { write(p, column.type, row[column.name]); p += SIZE[column.type]; }
  }
  p = base + stringsOffset;
  for (const bytes of strings) { out.set(bytes, p); p += bytes.length; }
  return out;
}

function packet(magic, table) {
  const out = new Uint8Array(16 + table.length);
  const view = new DataView(out.buffer);
  out.set(encoder.encode(magic), 0);
  view.setUint32(4, 0xff, true);
  view.setBigUint64(8, BigInt(table.length), true);
  out.set(table, 16);
  return out;
}

function cpkDateTime(date) {
  return (BigInt(date.getFullYear()) << 48n) | (BigInt(date.getMonth() + 1) << 40n) | (BigInt(date.getDate()) << 32n)
    | (BigInt(date.getHours()) << 24n) | (BigInt(date.getMinutes()) << 16n) | (BigInt(date.getSeconds()) << 8n);
}

function compareBytes(a, b) {
  const x = encoder.encode(a), y = encoder.encode(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}

function tocColumns(entries) {
  const many = entries.length > 1;
  const same = key => many && entries.every(entry => entry[key] === entries[0][key]);
  const column = (name, type) => (same(name)
    ? { name, type, storage: 'const', value: entries[0][name] }
    : { name, type, storage: 'row' });
  return [
    column('DirName', 'str'), column('FileName', 'str'), column('FileSize', 'u32'), column('ExtractSize', 'u32'),
    column('FileOffset', 'u64'), column('ID', 'u32'),
    many ? { name: 'UserString', type: 'str', storage: 'const', value: '<NULL>' } : { name: 'UserString', type: 'str', storage: 'zero' },
  ];
}

const HEADER_COLUMNS = [
  ['UpdateDateTime', 'u64', 'row'], ['FileSize', 'u64', 'zero'], ['ContentOffset', 'u64', 'row'], ['ContentSize', 'u64', 'row'],
  ['TocOffset', 'u64', 'row'], ['TocSize', 'u64', 'row'], ['TocCrc', 'u32', 'zero'], ['HtocOffset', 'u64', 'zero'], ['HtocSize', 'u64', 'zero'],
  ['EtocOffset', 'u64', 'row'], ['EtocSize', 'u64', 'row'], ['ItocOffset', 'u64', 'zero'], ['ItocSize', 'u64', 'zero'], ['ItocCrc', 'u32', 'zero'],
  ['GtocOffset', 'u64', 'zero'], ['GtocSize', 'u64', 'zero'], ['GtocCrc', 'u32', 'zero'], ['HgtocOffset', 'u64', 'zero'], ['HgtocSize', 'u64', 'zero'],
  ['EnabledPackedSize', 'u64', 'row'], ['EnabledDataSize', 'u64', 'row'], ['TotalDataSize', 'u64', 'zero'], ['Tocs', 'u32', 'zero'],
  ['Files', 'u32', 'row'], ['Groups', 'u32', 'row'], ['Attrs', 'u32', 'row'], ['TotalFiles', 'u32', 'zero'], ['Directories', 'u32', 'zero'],
  ['Updates', 'u32', 'zero'], ['Version', 'u16', 'row'], ['Revision', 'u16', 'row'], ['Align', 'u16', 'row'], ['Sorted', 'u16', 'row'],
  ['EnableFileName', 'u16', 'row'], ['EID', 'u16', 'zero'], ['CpkMode', 'u32', 'row'], ['Tvers', 'str', 'row'], ['Comment', 'str', 'zero'],
  ['Codec', 'u32', 'row'], ['DpkItoc', 'u32', 'row'], ['EnableTocCrc', 'u16', 'row'], ['EnableFileCrc', 'u16', 'row'], ['CrcMode', 'u32', 'row'],
  ['CrcTable', 'data', 'row'],
].map(([name, type, storage]) => ({ name, type, storage }));

const partSize = part => (part instanceof Uint8Array ? part.length : part.size);

/**
 * CPK en modo FILENAME a partir de archivos cuyo contenido es una lista de partes.
 * @param {{path: string, parts: (Uint8Array|Blob)[]}[]} files
 * @returns {(Uint8Array|Blob)[]} partes del CPK en orden (para `new Blob(partes)`).
 */
export function createCpkParts(files, { date = new Date(), align = DEFAULT_ALIGN, toolVersion = TOOL_VERSION } = {}) {
  if (!files.length) throw new Error('No hay archivos para empaquetar.');
  const seen = new Set();
  const sorted = files.map(file => {
    const path = file.path.replace(/\\/g, '/').replace(/^\/+/, '');
    if (seen.has(path)) throw new Error(`Ruta repetida en el CPK: ${path}`);
    seen.add(path);
    const slash = path.lastIndexOf('/');
    const size = file.parts.reduce((sum, part) => sum + partSize(part), 0);
    return { path, dir: slash < 0 ? '' : path.slice(0, slash), name: path.slice(slash + 1), parts: file.parts, size };
  }).sort((a, b) => compareBytes(a.path, b.path));

  let cursor = 0;
  const entries = sorted.map((file, index) => {
    const entry = { DirName: file.dir, FileName: file.name, FileSize: file.size, ExtractSize: file.size, FileOffset: cursor, ID: index, parts: file.parts };
    cursor = alignUp(cursor + file.size, align);
    return entry;
  });
  const last = entries[entries.length - 1];
  const tocOffset = alignUp(CONTENT_OFFSET + last.FileOffset + last.FileSize, align);

  const toc = packet('TOC ', utfTable('CpkTocInfo', tocColumns(entries), entries));
  const stamp = cpkDateTime(date);
  const etocRows = [...entries.map(entry => ({ UpdateDateTime: stamp, LocalDir: entry.DirName })), { UpdateDateTime: 0n, LocalDir: '' }];
  const etoc = packet('ETOC', utfTable('CpkEtocInfo', [
    { name: 'UpdateDateTime', type: 'u64', storage: 'row' }, { name: 'LocalDir', type: 'str', storage: 'row' },
  ], etocRows));
  const etocOffset = alignUp(tocOffset + toc.length, align);
  const totalData = entries.reduce((sum, entry) => sum + entry.FileSize, 0);

  const header = packet('CPK ', utfTable('CpkHeader', HEADER_COLUMNS, [{
    UpdateDateTime: 1, ContentOffset: CONTENT_OFFSET, ContentSize: tocOffset - CONTENT_OFFSET,
    TocOffset: tocOffset, TocSize: toc.length, EtocOffset: etocOffset, EtocSize: etoc.length,
    EnabledPackedSize: totalData, EnabledDataSize: totalData, Files: entries.length, Groups: 0, Attrs: 0,
    Version: 7, Revision: 14, Align: align, Sorted: 1, EnableFileName: 1, CpkMode: 1, Tvers: toolVersion,
    Codec: 0, DpkItoc: 0, EnableTocCrc: 0, EnableFileCrc: 0, CrcMode: 0, CrcTable: [0, 0],
  }]));
  if (header.length > CONTENT_OFFSET - 6) throw new Error('Cabecera CPK demasiado grande.');

  const head = new Uint8Array(CONTENT_OFFSET);
  head.set(header, 0);
  head.set(encoder.encode('(c)CRI'), CONTENT_OFFSET - 6);
  const parts = [head];
  let pos = CONTENT_OFFSET;
  const padTo = target => { if (target > pos) { parts.push(new Uint8Array(target - pos)); pos = target; } };
  for (const entry of entries) {
    padTo(CONTENT_OFFSET + entry.FileOffset);
    for (const part of entry.parts) { parts.push(part); pos += partSize(part); }
  }
  padTo(tocOffset);
  parts.push(toc);
  pos += toc.length;
  padTo(etocOffset);
  parts.push(etoc);
  return parts;
}
