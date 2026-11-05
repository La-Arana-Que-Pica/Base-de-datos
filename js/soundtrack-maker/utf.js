// Tablas @UTF de CRI (ACB/ACF/CPK), lectura y escritura en el navegador o en Node, sin dependencias.
// Cabecera (big-endian, offsets relativos a 0x08): '@UTF' · u32 tamaño · u16 versión · u16 filas · u32 cadenas ·
// u32 datos · u32 nombre · u16 columnas · u16 ancho de fila · u32 cantidad de filas. Columna: u8 (almacenamiento | tipo)
// + u32 nombre [+ valor constante]. Almacenamiento: 0x10 cero · 0x30 constante · 0x50 por fila.

export const TYPE = { u8: 0, s8: 1, u16: 2, s16: 3, u32: 4, s32: 5, u64: 6, s64: 7, f32: 8, f64: 9, str: 0xa, data: 0xb };
export const STORAGE = { zero: 0x10, const: 0x30, row: 0x50 };
const SIZE = [1, 1, 2, 2, 4, 4, 8, 8, 4, 8, 4, 8];
const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

function readValue(view, p, type) {
  switch (type) {
    case 0: return view.getUint8(p);
    case 1: return view.getInt8(p);
    case 2: return view.getUint16(p);
    case 3: return view.getInt16(p);
    case 4: return view.getUint32(p);
    case 5: return view.getInt32(p);
    case 6: return view.getBigUint64(p);
    case 7: return view.getBigInt64(p);
    case 8: return view.getFloat32(p);
    case 9: return view.getFloat64(p);
    default: throw new Error(`tipo @UTF ${type}`);
  }
}

function writeValue(view, p, type, v) {
  switch (type) {
    case 0: view.setUint8(p, v); break;
    case 1: view.setInt8(p, v); break;
    case 2: view.setUint16(p, v); break;
    case 3: view.setInt16(p, v); break;
    case 4: view.setUint32(p, v); break;
    case 5: view.setInt32(p, v); break;
    case 6: view.setBigUint64(p, BigInt(v)); break;
    case 7: view.setBigInt64(p, BigInt(v)); break;
    case 8: view.setFloat32(p, v); break;
    case 9: view.setFloat64(p, v); break;
    default: throw new Error(`tipo @UTF ${type}`);
  }
}

const isUtf = b => b && b.length >= 32 && b[0] === 0x40 && b[1] === 0x55 && b[2] === 0x54 && b[3] === 0x46;

/**
 * Lee una tabla @UTF. Las columnas de datos que contienen otra tabla @UTF se leen recursivamente (`{ table }`);
 * las demás quedan como Uint8Array. Devuelve { name, version, columns: [{name, type, storage, value}], rows: [{…}] }.
 */
export function readUtf(bytes) {
  if (!isUtf(bytes)) throw new Error('No es una tabla @UTF');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const base = 8;
  const version = view.getUint16(8), rowsOffset = view.getUint16(10);
  const stringsOffset = view.getUint32(12), dataOffset = view.getUint32(16);
  const nameOffset = view.getUint32(20), columnCount = view.getUint16(24), rowWidth = view.getUint16(26);
  const rowCount = view.getUint32(28);
  const str = o => {
    const start = base + stringsOffset + o;
    let end = start;
    while (bytes[end] !== 0) end++;
    return fromUtf8.decode(bytes.subarray(start, end));
  };
  const data = (o, n) => {
    if (n === 0) return o === 0 ? new Uint8Array(0) : Object.assign(new Uint8Array(0), { positioned: true });
    const b = bytes.slice(base + dataOffset + o, base + dataOffset + o + n);
    return isUtf(b) ? { table: readUtf(b) } : b;
  };
  const read = (p, type) => {
    if (type === TYPE.str) return str(view.getUint32(p));
    if (type === TYPE.data) return data(view.getUint32(p), view.getUint32(p + 4));
    return readValue(view, p, type);
  };
  const columns = [];
  let p = 0x20;
  for (let i = 0; i < columnCount; i++) {
    const flag = bytes[p];
    const column = { name: str(view.getUint32(p + 1)), type: flag & 0x0f, storage: flag & 0xf0 };
    p += 5;
    if (column.storage === STORAGE.const) { column.value = read(p, column.type); p += SIZE[column.type]; }
    else if (column.storage !== STORAGE.zero && column.storage !== STORAGE.row) throw new Error(`almacenamiento @UTF ${flag}`);
    columns.push(column);
  }
  const rows = [];
  for (let r = 0; r < rowCount; r++) {
    let q = base + rowsOffset + r * rowWidth;
    const row = {};
    for (const c of columns) {
      if (c.storage === STORAGE.row) { row[c.name] = read(q, c.type); q += SIZE[c.type]; }
    }
    rows.push(row);
  }
  return { name: str(nameOffset), version, columns, rows };
}

const alignUp = (value, align) => Math.ceil(value / align) * align;

/**
 * Serializa una tabla con la misma disposición que CRI Atom Craft (verificada byte a byte con los ACB de PES 2018):
 * cadenas en orden de aparición (nombre de tabla, columnas con sus constantes, valores de fila), sin deduplicar;
 * en la tabla raíz (`root`), bloque de datos y cada blob alineados a 32, con al menos un byte de relleno entre blobs y
 * al final; en las anidadas, datos
 * contiguos y total alineado a 4. Los blobs vacíos se escriben con offset 0.
 */
export function writeUtf(table, { root = false } = {}) {
  const strings = [];
  let stringBytes = 0;
  const addString = text => {
    const offset = stringBytes;
    const bytes = utf8.encode(text + '\0');
    strings.push(bytes);
    stringBytes += bytes.length;
    return offset;
  };
  const blobs = [];
  const blobAlign = root ? 32 : 1;
  let dataBytes = 0;
  const addBlob = value => {
    const bytes = value instanceof Uint8Array ? value : value && value.table ? writeUtf(value.table) : new Uint8Array(0);
    // Vacío: offset 0, salvo los vacíos «posicionados» (CRI los apunta a la posición actual del bloque de datos).
    if (!bytes.length) return [value && value.positioned ? dataBytes : 0, 0];
    // CRI deja al menos un byte de relleno entre blobs de la raíz (si el anterior termina alineado, salta 32).
    const offset = root && blobs.length ? alignUp(dataBytes + 1, blobAlign) : alignUp(dataBytes, blobAlign);
    blobs.push([offset, bytes]);
    dataBytes = offset + bytes.length;
    return [offset, bytes.length];
  };
  const encodeValue = (type, value) => (type === TYPE.str ? addString(value) : type === TYPE.data ? addBlob(value) : value);

  const tableName = addString(table.name);
  const columns = table.columns.map(c => {
    const meta = { ...c, nameOffset: addString(c.name) };
    if (c.storage === STORAGE.const) meta.encoded = encodeValue(c.type, c.value);
    return meta;
  });
  const rowColumns = columns.filter(c => c.storage === STORAGE.row);
  const rows = table.rows.map(row => rowColumns.map(c => encodeValue(c.type, row[c.name])));

  const columnsSize = columns.reduce((sum, c) => sum + 5 + (c.storage === STORAGE.const ? SIZE[c.type] : 0), 0);
  const rowWidth = rowColumns.reduce((sum, c) => sum + SIZE[c.type], 0);
  const rowsOffset = 24 + columnsSize;
  const stringsOffset = rowsOffset + rowWidth * rows.length;
  const dataOffset = root ? alignUp(8 + stringsOffset + stringBytes, 32) - 8 : stringsOffset + stringBytes;
  const total = root ? alignUp(8 + dataOffset + dataBytes + 1, 32) : 8 + alignUp(dataOffset + dataBytes, 4);

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  out.set(utf8.encode('@UTF'), 0);
  view.setUint32(4, total - 8);
  view.setUint16(8, table.version ?? 1);
  view.setUint16(10, rowsOffset);
  view.setUint32(12, stringsOffset);
  view.setUint32(16, dataOffset);
  view.setUint32(20, tableName);
  view.setUint16(24, columns.length);
  view.setUint16(26, rowWidth);
  view.setUint32(28, rows.length);
  const put = (p, type, encoded) => {
    if (type === TYPE.str) view.setUint32(p, encoded);
    else if (type === TYPE.data) { view.setUint32(p, encoded[0]); view.setUint32(p + 4, encoded[1]); }
    else writeValue(view, p, type, encoded);
  };
  let p = 0x20;
  for (const c of columns) {
    out[p] = c.storage | c.type;
    view.setUint32(p + 1, c.nameOffset);
    p += 5;
    if (c.storage === STORAGE.const) { put(p, c.type, c.encoded); p += SIZE[c.type]; }
  }
  for (const row of rows) {
    rowColumns.forEach((c, i) => { put(p, c.type, row[i]); p += SIZE[c.type]; });
  }
  p = 8 + stringsOffset;
  for (const bytes of strings) { out.set(bytes, p); p += bytes.length; }
  for (const [offset, bytes] of blobs) out.set(bytes, 8 + dataOffset + offset);
  return out;
}
