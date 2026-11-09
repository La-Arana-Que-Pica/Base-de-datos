/**
 * Ahorcado Futbolero — núcleo puro (sin DOM).
 *
 * Funciona en el navegador (window.LAQPHangman) y en Node (require) para que
 * la extracción de apellidos, la ponderación por dificultad, el puntaje y las
 * reglas de cada ronda se prueben con los datos reales de la base.
 *
 * Preparación para un ranking global (V2): una ronda es JSON serializable con
 * el jugador y la secuencia exacta de letras. Un servidor que elija los
 * jugadores y reciba sólo las letras puede reproducir `applyGuess` y
 * `scoreRound` con esta misma configuración; nunca debe aceptar el puntaje
 * calculado por el navegador.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LAQPHangman = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_ERRORS = 7;
  const ROUNDS_PER_MATCH = 10;
  const HINT_ERRORS = [5, 6];
  const MIN_POOL_TO_PLAY = ROUNDS_PER_MATCH;
  const SMALL_POOL_WARNING = 40;

  /* ── Normalización de letras ───────────────────────────────────────── */

  // Letras sin descomposición NFD. Cada carácter visible equivale a UNA tecla.
  const SPECIAL_LETTERS = { ø: 'o', Ø: 'O', ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', ð: 'd', Ð: 'D', ı: 'i', ħ: 'h', Ħ: 'H' };
  // Sin equivalente de una sola letra: producirían respuestas imposibles.
  const UNSUPPORTED_CHARS = /[ßæœþÆŒÞẞ]/;
  const PUNCTUATION = new Set(['-', "'", '’']);

  function baseLetter(char) {
    const mapped = SPECIAL_LETTERS[char] || char;
    const plain = mapped.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    return /^[A-Z]$/.test(plain) ? plain : '';
  }

  function letterKey(text) {
    return Array.from(String(text || '')).map(baseLetter).join('');
  }

  function searchText(text) {
    return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  /* ── Extracción de apellidos ───────────────────────────────────────── */

  // Países cuyo nombre de jugador suele escribirse con el apellido primero.
  const FAMILY_NAME_FIRST = new Set(['7', '8', '15', '16', '38']);
  const INITIALS_PATTERN = /^((?:\p{L}{1,3}\.\s?)+)\s*(.+)$/u;
  const ANSWER_RULES = { minLetters: 3, maxLetters: 22, maxWords: 3 };

  function answerProblem(text) {
    if (!text) return 'respuesta vacía';
    if (/\d/.test(text)) return 'contiene números';
    if (text.includes('.')) return 'nombre abreviado';
    if (UNSUPPORTED_CHARS.test(text)) return 'carácter sin equivalente de una letra';
    for (const char of text) {
      if (char === ' ' || PUNCTUATION.has(char)) continue;
      if (!baseLetter(char)) return `carácter no admitido «${char}»`;
    }
    const letters = letterKey(text).length;
    if (letters < ANSWER_RULES.minLetters) return 'apellido demasiado corto';
    if (letters > ANSWER_RULES.maxLetters) return 'apellido demasiado largo';
    if (text.split(' ').length > ANSWER_RULES.maxWords) return 'demasiadas palabras';
    if (/^[-'’]|[-'’]$|[-'’]{2}|\s[-'’]|[-'’]\s/.test(text)) return 'puntuación incompleta';
    return '';
  }

  // Países lusófonos: «Ayrton Lucas» o «Felipe Anderson» suelen ser dos nombres de pila.
  const TWO_GIVEN_NAMES_COMMON = new Set(['45', '51', '66', '77', '146', '228']);
  const NAME_SUFFIX = /^(?:\p{L}{1,2}\.|jr\.?|júnior\.?|ii|iii|iv)$/iu;

  /** Quita sufijos que no forman parte del apellido: «González M.», «Oregel Jr.», «Malparitti II». */
  function stripNameSuffixes(text) {
    const words = String(text || '').split(' ').filter(Boolean);
    while (words.length > 1 && NAME_SUFFIX.test(words[words.length - 1]) && !/^j[uú]nior$/i.test(words[words.length - 1])) words.pop();
    return words.join(' ');
  }

  /** «M. LUSUARDI» → { main: 'LUSUARDI', trailing: '' }; «DANI C.» → { main: 'DANI', trailing: 'C' }. */
  function shirtParts(shirt) {
    let text = String(shirt || '').toUpperCase().replace(/^(?:[A-Z]{1,3}\.\s*)+/, '').trim();
    let trailing = '';
    const match = text.match(/^(.*\S)\s+([A-Z])\.$/);
    if (match) { text = match[1]; trailing = match[2]; }
    return { main: text, trailing };
  }

  function shirtCore(shirt) {
    return shirtParts(shirt).main;
  }

  /**
   * Devuelve { ok, text, key, kind, reason, warning }.
   * kind: 'surname' (apellido), 'mononym' (conocido por un único nombre) o
   * 'footballName' (nombre futbolístico de varias palabras).
   * shirt sólo se necesita para nombres de varias palabras sin inicial.
   */
  function extractAnswer(name, shirt, countryId) {
    const clean = String(name || '').replace(/\s+/g, ' ').trim();
    const reject = reason => ({ ok: false, reason });
    const accept = (text, kind, warning) => {
      const problem = answerProblem(text);
      if (problem) return reject(problem);
      return { ok: true, text, key: letterKey(text), kind, warning: warning || '' };
    };
    if (!clean) return reject('sin nombre');

    const initials = clean.match(INITIALS_PATTERN);
    if (initials) {
      // Convención de PES: «Á. Di María». La inicial es el nombre; el resto, el apellido completo.
      const surname = stripNameSuffixes(initials[2].trim());
      let warning = '';
      if (shirt) {
        const shirtKey = letterKey(shirtCore(shirt));
        const surnameKey = letterKey(surname);
        if (shirtKey && !surnameKey.includes(shirtKey) && !shirtKey.includes(surnameKey)) warning = 'camiseta distinta del apellido';
      }
      return accept(surname, 'surname', warning);
    }

    const shirtInfo = shirtParts(shirt);
    const shirtKey = letterKey(shirtInfo.main);
    const base = stripNameSuffixes(clean);
    const words = base.split(' ');
    if (words.length === 1) {
      // «Pedri», «Cristiano» o «Riquelme F.»: el nombre futbolístico es la respuesta.
      if (base !== clean && shirtKey && shirtKey !== letterKey(base)) return reject('sufijo sin validar');
      return accept(base, base !== clean ? 'surname' : 'mononym');
    }

    if (!shirt) return reject('nombre de varias palabras sin validar');
    if (!shirtKey) return reject('camiseta vacía');
    if (shirtKey === letterKey(base)) return accept(base, 'footballName');
    for (let size = 1; size < words.length; size += 1) {
      const tail = words.slice(-size).join(' ');
      if (letterKey(tail) === shirtKey) return accept(tail, 'surname');
    }
    const country = String(countryId || '');
    if (FAMILY_NAME_FIRST.has(country)) {
      for (let size = 1; size < words.length; size += 1) {
        const head = words.slice(0, size).join(' ');
        if (letterKey(head) === shirtKey) return accept(head, 'surname');
      }
    }
    if (letterKey(words[0]) === shirtKey) {
      const rest = words.slice(1).join(' ');
      // «DANI C.»: la camiseta confirma la inicial del apellido.
      if (shirtInfo.trailing && letterKey(rest).startsWith(shirtInfo.trailing)) return accept(rest, 'surname');
      // «PAU» en «Pau Torres»: nombre de pila + un apellido, fuera de la tradición lusófona.
      if (!shirtInfo.trailing && words.length === 2 && !TWO_GIVEN_NAMES_COMMON.has(country)) return accept(rest, 'surname');
    }
    return reject('la camiseta no coincide con ningún apellido del nombre');
  }

  /* ── Base de datos del juego ──────────────────────────────────────── */

  const POSITION_GROUPS = {
    GK: 'Arquero',
    CB: 'Defensor', LB: 'Defensor', RB: 'Defensor',
    DMF: 'Mediocampista', CMF: 'Mediocampista', LMF: 'Mediocampista', RMF: 'Mediocampista', AMF: 'Mediocampista',
    LWF: 'Delantero', RWF: 'Delantero', SS: 'Delantero', CF: 'Delantero',
  };

  // Mismo mapa de nacionalidades PES que js/app.js y js/player.js.
  const COUNTRY_NAMES = {
    7: 'China', 8: 'Hong Kong', 9: 'India', 10: 'Indonesia', 11: 'Irán', 12: 'Irak', 13: 'Japón', 14: 'Jordania',
    15: 'Corea del Norte', 16: 'Corea del Sur', 17: 'Kuwait', 19: 'Líbano', 21: 'Malasia', 26: 'Omán', 28: 'Palestina',
    29: 'Filipinas', 30: 'Qatar', 31: 'Arabia Saudita', 32: 'Singapur', 34: 'Siria', 36: 'Tailandia',
    37: 'Emiratos Árabes Unidos', 38: 'Vietnam', 44: 'Argelia', 45: 'Angola', 46: 'Benín', 48: 'Burkina Faso',
    49: 'Burundi', 50: 'Camerún', 51: 'Cabo Verde', 52: 'República Centroafricana', 54: 'Comoras', 55: 'Congo DR',
    56: 'Costa de Marfil', 58: 'Egipto', 59: 'Guinea Ecuatorial', 62: 'Gabón', 63: 'Gambia', 64: 'Ghana', 65: 'Guinea',
    66: 'Guinea-Bisáu', 67: 'Kenia', 70: 'Libia', 71: 'Madagascar', 73: 'Malí', 74: 'Mauritania', 76: 'Marruecos',
    77: 'Mozambique', 79: 'Níger', 80: 'Nigeria', 83: 'Senegal', 85: 'Sierra Leona', 87: 'Sudáfrica', 90: 'Tanzania',
    91: 'Togo', 92: 'Túnez', 94: 'Zambia', 95: 'Zimbabue', 98: 'Congo', 110: 'Canadá', 112: 'Costa Rica',
    115: 'Rep. Dominicana', 120: 'Haití', 121: 'Honduras', 122: 'Jamaica', 124: 'México', 128: 'Panamá',
    129: 'Puerto Rico', 133: 'Trinidad y Tobago', 135: 'Estados Unidos', 139: 'Surinam', 140: 'Curazao',
    144: 'Argentina', 145: 'Bolivia', 146: 'Brasil', 147: 'Chile', 148: 'Colombia', 149: 'Ecuador', 150: 'Paraguay',
    151: 'Perú', 152: 'Uruguay', 153: 'Venezuela', 162: 'Australia', 166: 'Nueva Zelanda', 189: 'Israel',
    190: 'Turquía', 191: 'Albania', 193: 'Armenia', 194: 'Austria', 196: 'Bielorrusia', 197: 'Bélgica',
    198: 'Bosnia y Herzegovina', 199: 'Bulgaria', 200: 'Croacia', 201: 'Chipre', 202: 'Rep. Checa', 203: 'Dinamarca',
    204: 'Inglaterra', 205: 'Estonia', 206: 'Islas Feroe', 207: 'Finlandia', 208: 'Francia', 209: 'Georgia',
    210: 'Alemania', 211: 'Grecia', 212: 'Hungría', 213: 'Islandia', 214: 'Irlanda', 215: 'Italia', 216: 'Kazajistán',
    217: 'Letonia', 219: 'Lituania', 220: 'Luxemburgo', 221: 'Macedonia del Norte', 223: 'Moldavia',
    224: 'Países Bajos', 225: 'Irlanda del Norte', 226: 'Noruega', 227: 'Polonia', 228: 'Portugal', 229: 'Rumanía',
    230: 'Rusia', 232: 'Escocia', 234: 'Eslovaquia', 235: 'Eslovenia', 236: 'España', 237: 'Suecia', 238: 'Suiza',
    239: 'Ucrania', 240: 'Uzbekistán', 241: 'Gales', 303: 'Serbia', 304: 'Montenegro', 311: 'Kosovo',
  };

  const MIXED_CASE = { VFL: 'VfL', VFB: 'VfB', TSG: 'TSG' };

  function titleCaseTeam(name) {
    const raw = String(name || '').trim();
    if (!raw || raw !== raw.toUpperCase()) return raw;
    const keepUpper = /^(FC|CF|CFC|AC|AS|SC|CA|CD|SD|UD|RC|RCD|SL|SK|FK|NK|KV|KRC|PSV|AZ|RB|VFB|VFL|TSG|SV|BSC|AFC|OGC|LOSC|PAOK|AEK|CSKA|IF|BK|AIK|SS|SSC|US|EC|SE|CR|CRB|SA|II|III|LDU|QPR|PSG|OSC|ACF|ATL|R\.)$/;
    const particles = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'do', 'dos', 'das', 'di', 'van', 'von', 'der', 'den', 'et', 'of', 'the']);
    return raw.toLowerCase().split(/(\s+|-|\.)/).map((part, index) => {
      if (MIXED_CASE[part.toUpperCase()]) return MIXED_CASE[part.toUpperCase()];
      if (keepUpper.test(part.toUpperCase())) return part.toUpperCase();
      if (index > 0 && particles.has(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join('');
  }

  /**
   * index: database/builder-player-index.json
   * shirts: { id: shirt } de database/ahorcado-camisetas.json (opcional)
   */
  function prepareDatabase(index, shirts) {
    const teamsById = new Map((index.teams || []).map(team => [String(team.id), team]));
    const leagues = (index.leagues || []).map(league => ({ id: String(league.id), name: league.name }));
    const players = [];
    const excluded = [];
    const warnings = [];
    for (const raw of index.players || []) {
      const id = String(raw.id);
      const answer = extractAnswer(raw.name, shirts ? shirts[id] : '', raw.countryId);
      if (!answer.ok) { excluded.push({ id, name: raw.name, reason: answer.reason }); continue; }
      const overall = Number(raw.overall);
      const position = String(raw.position || '');
      if (!Number.isFinite(overall) || !POSITION_GROUPS[position]) {
        excluded.push({ id, name: raw.name, reason: 'sin media o posición' });
        continue;
      }
      if (answer.warning) warnings.push({ id, name: raw.name, warning: answer.warning });
      const teamIds = (raw.teamIds || []).map(String).filter(teamId => teamsById.has(teamId));
      const leagueIds = [...new Set(teamIds.flatMap(teamId => (teamsById.get(teamId).leagueIds || []).map(String)))];
      const clubId = raw.clubId && teamsById.has(String(raw.clubId)) ? String(raw.clubId) : '';
      players.push({
        id,
        name: raw.name,
        answer: answer.text,
        answerKey: answer.key,
        answerKind: answer.kind,
        overall,
        position,
        positionGroup: POSITION_GROUPS[position],
        age: Number(raw.age) || 0,
        countryId: String(raw.countryId || ''),
        clubId,
        clubName: clubId ? titleCaseTeam(teamsById.get(clubId).name) : '',
        teamIds,
        leagueIds,
        miniface: raw.miniface || '',
      });
    }
    return { players, excluded, warnings, teamsById, leagues, databaseVersion: index.databaseVersion || '' };
  }

  function countryName(countryId) {
    return COUNTRY_NAMES[countryId] || '';
  }

  /* ── Filtros y dificultad ──────────────────────────────────────────── */

  const DIFFICULTIES = {
    easy: { label: 'Fácil', cutoff: 0.15, target: 0.0, spread: 0.09 },
    medium: { label: 'Medio', cutoff: 0.5, target: 0.22, spread: 0.12 },
    hard: { label: 'Difícil', cutoff: 0.75, target: 0.47, spread: 0.14 },
    impossible: { label: 'Imposible', cutoff: 1.0, target: 0.8, spread: 0.2 },
  };
  const DIFFICULTY_ORDER = ['easy', 'medium', 'hard', 'impossible'];
  // Peso mínimo relativo: nadie elegible queda en cero, pero los extremos son raros.
  const WEIGHT_FLOOR = 0.01;
  const RECENT_PENALTY = 0.05;

  function filterPlayers(db, filter) {
    const type = filter && filter.type || 'global';
    const value = filter && String(filter.value || '');
    if (type === 'league') return db.players.filter(player => player.leagueIds.includes(value));
    if (type === 'country') return db.players.filter(player => player.countryId === value);
    if (type === 'club') return db.players.filter(player => player.teamIds.includes(value) && player.clubId === value);
    return db.players.slice();
  }

  /** Percentil de cada jugador (0 = mayor media). Empates comparten rango medio. */
  function percentiles(pool) {
    const n = pool.length;
    const byOverall = new Map();
    pool.forEach(player => byOverall.set(player.overall, (byOverall.get(player.overall) || 0) + 1));
    const values = [...byOverall.keys()].sort((a, b) => b - a);
    const rankOf = new Map();
    let above = 0;
    for (const value of values) {
      const equal = byOverall.get(value);
      rankOf.set(value, n <= 1 ? 0 : (above + (equal - 1) / 2) / (n - 1));
      above += equal;
    }
    return new Map(pool.map(player => [player.id, rankOf.get(player.overall)]));
  }

  function difficultyWeight(difficulty, percentile) {
    const config = DIFFICULTIES[difficulty];
    if (!config || percentile > config.cutoff + 1e-9) return 0;
    const z = (percentile - config.target) / config.spread;
    return WEIGHT_FLOOR + Math.exp(-0.5 * z * z);
  }

  /**
   * Universo elegible de una dificultad: { candidates: [{player, percentile, weight}], poolSize }.
   * poolSize es el total filtrado; candidates.length, los elegibles de esa dificultad.
   */
  function eligibleFor(db, filter, difficulty) {
    const pool = filterPlayers(db, filter);
    const ranks = percentiles(pool);
    let candidates = pool
      .map(player => ({ player, percentile: ranks.get(player.id), weight: difficultyWeight(difficulty, ranks.get(player.id)) }))
      .filter(entry => entry.weight > 0);
    if (!candidates.length && pool.length) {
      // Pozo minúsculo: al menos el grupo de mayor media.
      const best = Math.max(...pool.map(player => player.overall));
      candidates = pool.filter(player => player.overall === best).map(player => ({ player, percentile: 0, weight: 1 }));
    }
    return { candidates, poolSize: pool.length };
  }

  function availability(db, filter) {
    const counts = {};
    let poolSize = 0;
    for (const difficulty of DIFFICULTY_ORDER) {
      const result = eligibleFor(db, filter, difficulty);
      counts[difficulty] = result.candidates.length;
      poolSize = result.poolSize;
    }
    return { poolSize, counts };
  }

  function pickCandidate(candidates, options) {
    const rng = options && options.rng || Math.random;
    const exclude = options && options.exclude || new Set();
    const excludeKeys = options && options.excludeKeys || new Set();
    const recent = options && options.recent || new Set();
    let pool = candidates.filter(entry => !exclude.has(entry.player.id) && !excludeKeys.has(entry.player.answerKey));
    if (!pool.length) pool = candidates.filter(entry => !exclude.has(entry.player.id));
    if (!pool.length) pool = candidates;
    if (!pool.length) return null;
    const weights = pool.map(entry => entry.weight * (recent.has(entry.player.id) ? RECENT_PENALTY : 1));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let ticket = rng() * total;
    for (let i = 0; i < pool.length; i += 1) {
      ticket -= weights[i];
      if (ticket <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  /* ── Puntaje ───────────────────────────────────────────────────────── */

  const SCORING = {
    base: { easy: 100, medium: 180, hard: 280, impossible: 400 },
    // Por percentil dentro del conjunto filtrado: la mayor media vale ×min, la menor ×max.
    rarity: { min: 0.8, max: 1.4 },
    // Cada error resta este porcentaje del puntaje base (6 errores → ×0,46).
    errorPenalty: 0.09,
    // Amplitud del universo elegible: escala logarítmica hasta `fullAt` jugadores.
    breadth: { min: 0.1, fullAt: 1000 },
    hardcoreBonus: 1.35,
  };

  function breadthFactor(eligibleCount) {
    const { min, fullAt } = SCORING.breadth;
    const n = Math.max(1, eligibleCount);
    const value = min + (1 - min) * (Math.log10(n) / Math.log10(fullAt));
    return Math.min(1, Math.max(min, value));
  }

  function round2(value) {
    return Math.round(value * 100) / 100;
  }

  /**
   * { won, difficulty, percentile, errors, eligibleCount, hardcore } →
   * { total, factors, breakdown: [{ key, label, value }] }
   */
  function scoreRound(input) {
    if (!input || !input.won) {
      return { total: 0, factors: null, breakdown: [{ key: 'lost', label: 'Ronda perdida', value: '0 pts' }] };
    }
    const base = SCORING.base[input.difficulty] || SCORING.base.easy;
    const percentile = Math.min(1, Math.max(0, Number(input.percentile) || 0));
    const errors = Math.min(MAX_ERRORS - 1, Math.max(0, Number(input.errors) || 0));
    const rarity = SCORING.rarity.min + (SCORING.rarity.max - SCORING.rarity.min) * percentile;
    const errorFactor = 1 - SCORING.errorPenalty * errors;
    const breadth = breadthFactor(input.eligibleCount);
    const hardcore = input.hardcore ? SCORING.hardcoreBonus : 1;
    const total = Math.round(base * rarity * errorFactor * breadth * hardcore);
    const label = DIFFICULTIES[input.difficulty] ? DIFFICULTIES[input.difficulty].label : 'Fácil';
    const breakdown = [
      { key: 'base', label: `Base ${label}`, value: `${base} pts` },
      { key: 'rarity', label: 'Rareza del jugador', value: `×${round2(rarity).toFixed(2)}` },
      { key: 'errors', label: errors === 1 ? '1 error' : `${errors} errores`, value: `×${round2(errorFactor).toFixed(2)}` },
      { key: 'breadth', label: `Amplitud (${input.eligibleCount} jugadores)`, value: `×${round2(breadth).toFixed(2)}` },
    ];
    if (input.hardcore) breakdown.push({ key: 'hardcore', label: 'Bonus Hardcore', value: `×${SCORING.hardcoreBonus.toFixed(2)}` });
    return { total, factors: { base, rarity, errorFactor, breadth, hardcore }, breakdown };
  }

  /* ── Ronda ─────────────────────────────────────────────────────────── */

  function buildCells(text) {
    return Array.from(text).map(char => {
      if (char === ' ') return { type: 'space' };
      if (PUNCTUATION.has(char)) return { type: 'punct', char };
      return { type: 'letter', char, letter: baseLetter(char) };
    });
  }

  /** Pistas de una ronda: posición general a los 5 errores; club (o alternativa) a los 6. */
  function buildHints(player, context) {
    if (context && context.hardcore) return [];
    const filterType = context && context.filterType || 'global';
    const hints = [{ at: HINT_ERRORS[0], key: 'position', label: 'Posición', value: player.positionGroup }];
    const country = countryName(player.countryId);
    if (filterType !== 'club' && player.clubName) hints.push({ at: HINT_ERRORS[1], key: 'club', label: 'Club', value: player.clubName });
    else if (filterType !== 'country' && country) hints.push({ at: HINT_ERRORS[1], key: 'country', label: 'Nacionalidad', value: country });
    else if (player.age) hints.push({ at: HINT_ERRORS[1], key: 'age', label: 'Edad', value: `${player.age} años` });
    return hints;
  }

  function createRound(entry, context) {
    const player = entry.player;
    return {
      playerId: player.id,
      answer: player.answer,
      answerKind: player.answerKind,
      percentile: entry.percentile,
      cells: buildCells(player.answer),
      hints: buildHints(player, context),
      guesses: [],
      wrong: [],
      status: 'playing',
    };
  }

  function roundLetters(round) {
    return new Set(round.cells.filter(cell => cell.type === 'letter').map(cell => cell.letter));
  }

  function isSolved(round) {
    const guessed = new Set(round.guesses);
    return [...roundLetters(round)].every(letter => guessed.has(letter));
  }

  /** Aplica una letra. Devuelve 'hit' | 'miss' | 'repeat' | 'invalid' | 'over'. Muta la ronda. */
  function applyGuess(round, input) {
    if (round.status !== 'playing') return 'over';
    const letter = baseLetter(Array.from(String(input || ''))[0] || '');
    if (!letter) return 'invalid';
    if (round.guesses.includes(letter)) return 'repeat';
    round.guesses.push(letter);
    const hit = roundLetters(round).has(letter);
    if (!hit) round.wrong.push(letter);
    if (isSolved(round)) round.status = 'won';
    else if (round.wrong.length >= MAX_ERRORS) round.status = 'lost';
    return hit ? 'hit' : 'miss';
  }

  function visibleHints(round) {
    return round.hints.filter(hint => round.wrong.length >= hint.at);
  }

  /* ── Búsqueda aproximada (portal y selectores) ─────────────────────── */

  function editDistance(a, b, limit) {
    // Distancia de Damerau (alineación óptima): una transposición cuenta como un error.
    if (Math.abs(a.length - b.length) > limit) return limit + 1;
    let older = null;
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      const current = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
        if (older && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) current[j] = Math.min(current[j], older[j - 2] + 1);
        rowMin = Math.min(rowMin, current[j]);
      }
      if (rowMin > limit) return limit + 1;
      older = previous;
      previous = current;
    }
    return previous[b.length];
  }

  /** 0 = sin coincidencia; mayor es mejor. Admite parciales y errores leves de escritura. */
  function fuzzyScore(query, haystack) {
    const terms = searchText(query).split(/[^a-z0-9ñ]+/).filter(Boolean);
    if (!terms.length) return 1;
    const text = searchText(haystack);
    const words = text.split(/[^a-z0-9ñ]+/).filter(Boolean);
    let score = 0;
    for (const term of terms) {
      let best = 0;
      if (text.includes(term)) best = 3;
      for (const word of words) {
        if (word.startsWith(term)) best = Math.max(best, 4);
        if (best >= 4) break;
        const limit = term.length >= 7 ? 2 : term.length >= 4 ? 1 : 0;
        if (!limit) continue;
        const candidate = word.length > term.length ? word.slice(0, term.length) : word;
        if (editDistance(term, candidate, limit) <= limit) best = Math.max(best, 2);
        else if (editDistance(term, word, limit) <= limit) best = Math.max(best, 2);
      }
      if (!best) return 0;
      score += best;
    }
    return score;
  }

  return {
    MAX_ERRORS, ROUNDS_PER_MATCH, HINT_ERRORS, MIN_POOL_TO_PLAY, SMALL_POOL_WARNING,
    DIFFICULTIES, DIFFICULTY_ORDER, SCORING, POSITION_GROUPS,
    baseLetter, letterKey, searchText, extractAnswer, answerProblem,
    prepareDatabase, countryName, titleCaseTeam,
    filterPlayers, percentiles, difficultyWeight, eligibleFor, availability, pickCandidate,
    breadthFactor, scoreRound,
    buildCells, buildHints, createRound, applyGuess, isSolved, visibleHints,
    editDistance, fuzzyScore,
  };
}));
