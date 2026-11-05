// Lector de EDIT00000000 de PES 2018 (solo lectura).
// Recibe los bytes de un archivo elegido por el usuario y devuelve clubes, jugadores y plantillas.
// No existe ninguna función de escritura ni de cifrado: el EDIT original nunca se modifica.
//
// Descifrado: misma lógica que pesXdecrypter (incluido en PES 2018 Editor), reimplementada y
// verificada byte a byte contra su salida. MT19937 + flujo con rotaciones, clave maestra de PES 2018.
// Datos: diseño fijo del EDIT de PES 2018 (tamaño constante), contrastado con exportaciones CSV.

const MASTER_KEY_PES18 = hexBytes('47518338839e853afa3908dc86af0cb5c40ee4e415e3cb641b8af1e52cbd4d1ba4d6a1972c4bd1dafacd7eb48a18c9e8c53e1a8b194501f88b85978b787b3c2e');

const ENCRYPTION_HEADER_SIZE = 0x140;
const FILE_HEADER_SIZE = 0xd0;

// Tablas de data.dat
const DATA_HEADER_SIZE = 0x50;
const PLAYER_TABLE = 0x7c, PLAYER_SIZE = 188, PLAYER_CAPACITY = 21000;
const TEAM_TABLE = PLAYER_TABLE + PLAYER_SIZE * PLAYER_CAPACITY, TEAM_SIZE = 480;
const SQUAD_TABLE = 4652884, SQUAD_SIZE = 164, SQUAD_SLOTS = 32, TEAM_CAPACITY = 600;
// Inscripción de clubes en ligas: lugares fijos por liga (definidos por el juego), separados por vacíos.
const ENTRY_TABLE = SQUAD_TABLE + SQUAD_SIZE * TEAM_CAPACITY, ENTRY_SLOTS = 752;
// Nombres de competiciones editables (registros de 124 bytes; el ID va 6 bytes antes de la marca FFFFFFFF).
const COMPETITION_TABLE = 4310930, COMPETITION_SIZE = 124, COMPETITION_RANGE = [-8, 80];

/**
 * Reparto fijo de la tabla de inscripción de PES 2018 (constante del juego, idéntico en el
 * CompetitionEntry.bin oficial de Konami y en el de LAqP): primer lugar, capacidad e ID de competición.
 * Los nombres se leen del EDIT de cada usuario; DEFAULT_NAMES solo cubre las ligas que el EDIT no nombra.
 */
const LEAGUE_LAYOUT = [
  [0, 24, 9], [24, 28, 66], [80, 24, 12], [104, 24, 68], [128, 24, 10], [152, 26, 69], [178, 22, 13],
  [200, 24, 11], [224, 26, 67], [250, 22, 14], [272, 24, 21], [296, 32, 22], [328, 20, 23],
  [348, 24, 39], [372, 24, 40], [396, 24, 41],
];
const OTHER_GROUPS = [
  [420, 32, 'Otros clubes de Asia y Oceanía'], [452, 100, 'Otros clubes de Europa'],
  [552, 100, 'Otros clubes de Latinoamérica'], [652, 100, 'Otros clubes'],
];
const DEFAULT_NAMES = {
  9: 'Premier League', 66: 'Championship', 12: 'Ligue 1', 68: 'Ligue 2', 10: 'Serie A', 69: 'Serie B',
  13: 'Eredivisie', 11: 'LaLiga', 67: 'LaLiga 2', 14: 'Liga Portugal', 21: 'Brasileirão', 22: 'Liga Argentina',
  23: 'Primera División de Chile', 39: 'PEU League', 40: 'PLA League', 41: 'PAS League',
};
// Posición registrada (byte 32, bits 6–9) con el código interno de PES.
export const POSITIONS = Object.freeze(['POR', 'DEC', 'LI', 'LD', 'MCD', 'MC', 'II', 'ID', 'MO', 'EI', 'ED', 'SD', 'DC']);
const EMPTY_SQUAD_TEAM = 0x3ffff;
// IDs «inflados» (datapacks, jugadores creados): el juego usa el ID menos este valor para la miniface.
export const SPECIAL_ID_FLAG = 0x40000000;

export class EditError extends Error {}

function hexBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

// ---------- MT19937 ----------
class MersenneTwister {
  constructor(key) {
    this.mt = new Uint32Array(624);
    this.index = 624;
    this.initByArray(key);
  }
  initGenrand(seed) {
    const mt = this.mt;
    mt[0] = seed >>> 0;
    for (let i = 1; i < 624; i++) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = (Math.imul(1812433253, prev) + i) >>> 0;
    }
  }
  initByArray(key) {
    this.initGenrand(19650218);
    const mt = this.mt, n = key.length;
    let i = 1, j = 0;
    for (let k = Math.max(624, n); k; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(prev, 1664525)) + key[j] + j) >>> 0;
      i++; j++;
      if (i >= 624) { mt[0] = mt[623]; i = 1; }
      if (j >= n) j = 0;
    }
    for (let k = 623; k; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(prev, 1566083941)) - i) >>> 0;
      i++;
      if (i >= 624) { mt[0] = mt[623]; i = 1; }
    }
    mt[0] = 0x80000000;
    this.index = 624;
  }
  next() {
    const mt = this.mt;
    if (this.index >= 624) {
      for (let k = 0; k < 624; k++) {
        const y = (mt[k] & 0x80000000) | (mt[(k + 1) % 624] & 0x7fffffff);
        mt[k] = mt[(k + 397) % 624] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      this.index = 0;
    }
    let y = mt[this.index++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }
}

const rol = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;
const ror = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0;

/** Descifra un bloque (cryptStream de pesXdecrypter). Devuelve una copia nueva. */
function cryptStream(key64, input) {
  const keyView = new DataView(key64.buffer, key64.byteOffset, 64);
  const key = new Uint32Array(16);
  for (let i = 0; i < 16; i++) key[i] = keyView.getUint32(i * 4, true);
  const mt = new MersenneTwister(key);
  let a = mt.next(), b = mt.next(), c = mt.next(), d = mt.next();
  const out = new Uint8Array(input.length);
  const src = new DataView(input.buffer, input.byteOffset, input.length);
  const dst = new DataView(out.buffer);
  const words = input.length >>> 2;
  for (let i = 0; i < words; i++) {
    const e = mt.next();
    dst.setUint32(i * 4, (src.getUint32(i * 4, true) ^ a ^ b ^ c ^ d ^ e) >>> 0, true);
    a = ror(b, 15); b = rol(c, 11); c = rol(d, 7); d = ror(e, 13);
  }
  const rest = input.length & 3;
  if (rest) {
    const e = mt.next();
    const tail = new Uint8Array(4);
    tail.set(input.subarray(words * 4));
    const value = (new DataView(tail.buffer).getUint32(0, true) ^ a ^ b ^ c ^ d ^ e) >>> 0;
    new DataView(tail.buffer).setUint32(0, value, true);
    out.set(tail.subarray(0, rest), words * 4);
  }
  return out;
}

function sectionKey(baseKey, mark) {
  const key = baseKey.slice();
  for (let i = 0; i < 64; i += 8) key[i] ^= mark;
  return key;
}

/**
 * Descifra el EDIT en memoria y devuelve la cabecera y data.dat.
 * @param {ArrayBuffer|Uint8Array} buffer bytes del archivo (se copian; el original no se toca)
 */
export function decryptEdit(buffer) {
  const file = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (file.length < ENCRYPTION_HEADER_SIZE + FILE_HEADER_SIZE + DATA_HEADER_SIZE) throw new EditError('El archivo es demasiado chico para ser un EDIT de PES 2018.');
  const seed = file.slice(0x100, 0x140);
  const headerKey = new Uint8Array(64);
  for (let i = 0; i < 64; i++) headerKey[i] = seed[i] ^ MASTER_KEY_PES18[(i & ~7) + 7 - (i & 7)];
  const encryptionHeader = cryptStream(headerKey, file.subarray(0, ENCRYPTION_HEADER_SIZE));
  encryptionHeader.set(seed, 0x100);
  const key = encryptionHeader.slice(0, 64);
  for (let i = 0; i < 0x100; i++) key[i & 63] ^= encryptionHeader[0x40 + i];
  const header = cryptStream(sectionKey(key, 0xd0), file.subarray(ENCRYPTION_HEADER_SIZE, ENCRYPTION_HEADER_SIZE + FILE_HEADER_SIZE));
  const hv = new DataView(header.buffer);
  const dataSize = hv.getUint32(0x40, true), logoSize = hv.getUint32(0x44, true), descSize = hv.getUint32(0x48, true);
  const ascii = (offset, length) => String.fromCharCode(...header.subarray(offset, offset + length)).replace(/\0.*$/s, '');
  const fileType = ascii(0x90, 16), game = ascii(0xb0, 32);
  const dataStart = ENCRYPTION_HEADER_SIZE + FILE_HEADER_SIZE + descSize + logoSize;
  if (fileType !== 'EDIT' || !/PRO EVOLUTION SOCCER 2018/.test(game) || dataStart + dataSize > file.length) {
    throw new EditError('No se reconoce como EDIT00000000 de PES 2018 (cabecera no válida).');
  }
  const data = cryptStream(sectionKey(key, 2), file.subarray(dataStart, dataStart + dataSize));
  return { game, fileType, data };
}

const utf8 = new TextDecoder('utf-8');
function readString(bytes, offset, length) {
  const view = bytes.subarray(offset, offset + length);
  const end = view.indexOf(0);
  return utf8.decode(end < 0 ? view : view.subarray(0, end)).trim();
}

/** Interpreta data.dat: jugadores, clubes y plantillas con dorsales. */
export function parseEditData(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint32(0, true) !== 0x0e || view.getUint32(4, true) !== DATA_HEADER_SIZE || view.getUint32(8, true) !== data.length - DATA_HEADER_SIZE) {
    throw new EditError('El contenido del EDIT no tiene la estructura esperada de PES 2018.');
  }
  const playerCount = view.getUint32(0x60, true);
  const teamCount = view.getUint32(0x70, true);
  if (playerCount > PLAYER_CAPACITY || teamCount > 2000 || SQUAD_TABLE + teamCount * SQUAD_SIZE > data.length) {
    throw new EditError('Las cantidades de jugadores o equipos del EDIT no son válidas.');
  }
  const players = new Map();
  for (let k = 0; k < playerCount; k++) {
    const o = PLAYER_TABLE + k * PLAYER_SIZE;
    const id = view.getUint32(o, true);
    if (!id || id === 0xffffffff) continue;
    players.set(id, { id, name: readString(data, o + 52, 46), shirtName: readString(data, o + 98, 18), position: (view.getUint16(o + 32, true) >> 6) & 0x0f });
  }
  const squadsById = new Map();
  const readSquad = o => {
    const slots = [];
    for (let s = 0; s < SQUAD_SLOTS; s++) {
      const playerId = view.getUint32(o + 4 + s * 4, true);
      if (playerId) slots.push({ playerId, number: data[o + 4 + SQUAD_SLOTS * 4 + s] });
    }
    return slots;
  };
  for (let k = 0; k < TEAM_CAPACITY; k++) {
    const o = SQUAD_TABLE + k * SQUAD_SIZE;
    if (o + SQUAD_SIZE > data.length) break;
    const teamId = view.getUint32(o, true);
    if (!teamId || teamId === EMPTY_SQUAD_TEAM || squadsById.has(teamId)) continue;
    squadsById.set(teamId, readSquad(o));
  }
  const teams = [];
  for (let k = 0; k < teamCount; k++) {
    const o = TEAM_TABLE + k * TEAM_SIZE;
    const id = view.getUint32(o, true);
    const name = readString(data, o + 152, 70);
    if (!id || !name) continue;
    const squad = (squadsById.get(id) || []).map(slot => {
      const player = players.get(slot.playerId);
      return {
        id: slot.playerId, number: slot.number,
        name: player ? player.name : '', shirtName: player ? player.shirtName : '', position: player ? player.position : null,
        special: slot.playerId >= SPECIAL_ID_FLAG,
      };
    });
    teams.push({ id, name, abbr: readString(data, o + 222, 4), squad });
  }
  return { playerCount: players.size, players: [...players.values()], teams, leagues: readLeagues(data, view, teams) };
}

/** Nombres de competiciones guardados en el EDIT (los que el usuario o el parche editaron). */
function readCompetitionNames(data, view) {
  const names = new Map();
  for (let k = COMPETITION_RANGE[0]; k < COMPETITION_RANGE[1]; k++) {
    const o = COMPETITION_TABLE + k * COMPETITION_SIZE;
    if (o < 6 || o + COMPETITION_SIZE > data.length || view.getUint32(o, true) !== 0xffffffff) continue;
    const name = readString(data, o + 8, 76);
    if (name) names.set(view.getUint16(o - 6, true), name);
  }
  return names;
}

/**
 * Ligas según la tabla de inscripción del EDIT y el reparto fijo de PES 2018. Cada liga reúne los
 * clubes que el usuario tiene inscriptos en sus lugares; el nombre sale del propio EDIT.
 */
function readLeagues(data, view, teams) {
  const known = new Set(teams.map(team => team.id));
  if (ENTRY_TABLE + ENTRY_SLOTS * 4 > view.byteLength) return [];
  const names = readCompetitionNames(data, view);
  const clubsIn = (start, size) => {
    const ids = [];
    for (let slot = start; slot < Math.min(start + size, ENTRY_SLOTS); slot++) {
      const id = view.getUint32(ENTRY_TABLE + slot * 4, true);
      if (known.has(id) && !ids.includes(id)) ids.push(id);
    }
    return ids;
  };
  const leagues = [];
  for (const [start, size, competitionId] of LEAGUE_LAYOUT) {
    const teamIds = clubsIn(start, size);
    if (!teamIds.length) continue;
    const fromEdit = names.has(competitionId);
    leagues.push({ key: `c${competitionId}`, competitionId, firstSlot: start, name: fromEdit ? names.get(competitionId) : DEFAULT_NAMES[competitionId], fromEdit, teamIds });
  }
  for (const [start, size, name] of OTHER_GROUPS) {
    const teamIds = clubsIn(start, size);
    if (teamIds.length) leagues.push({ key: `g${start}`, competitionId: null, firstSlot: start, name, fromEdit: false, group: true, teamIds });
  }
  return leagues;
}

/** Lee un EDIT completo desde un File/Blob elegido por el usuario. */
export async function readEditFile(file) {
  if (!file) throw new EditError('Elegí el archivo EDIT00000000.');
  if (file.size > 32 * 1024 * 1024) throw new EditError('El archivo es demasiado grande para ser un EDIT de PES 2018.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { data } = decryptEdit(bytes);
  return parseEditData(data);
}
