'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TACTICS_PATH = path.join(ROOT, 'database', 'tacticas.csv');
const TEAMS_PATH = path.join(ROOT, 'database', 'tacticas', 'teams');
const EXCLUDED_ID = 'river-2018-2019';

const TARGET_IDS = [
  'boca-2000-2001',
  'paises-bajos-1978',
  'river-maquina-1941-1945',
  'barcelona-2010-2011',
  'ac-milan-1988-90',
  'arsenal-2003-2004',
  'brasil-1970',
  'inter-2009-2010',
  'real-madrid-2016-2018',
  'liverpool-2018-2020',
  'espana-2010',
  'ajax-1994-1995',
  'manchester-united-1998-1999',
  'bayern-munich-2012-2013',
  'chelsea-2004-2005',
  'real-madrid-2001-2002',
  'manchester-city-2022-2023',
  'argentina-1986',
  'francia-1998',
  'juventus-2014-2015',
  'borussia-dortmund-2012-2013',
  'roma-2000-2001',
  'psg-2024-2025',
  'bayer-leverkusen-2023-2024',
  'atalanta-2023-2024',
  'leicester-city-2015-2016',
  'grecia-2004',
  'porto-2003-2004',
  'inter-2020-2021',
  'chile-2015',
  'italia-2006',
  'napoli-1986-1987',
];

const TACTIC_OVERRIDES = {
  'paises-bajos-1978': {
    rango_apoyo: '3-4',
  },
  'barcelona-2010-2011': {
    rango_apoyo: '2-3',
  },
  'grecia-2004': {
    formacion_con_balon: '4-4-1-1',
  },
  'porto-2003-2004': {
    formacion_con_balon: '2-3-3-2',
    portada: 'assets/images/tacticas/porto-2003-2004.webp',
  },
  'inter-2020-2021': {
    formacion_con_balon: '3-3-2-2',
  },
  'chile-2015': {
    formacion_con_balon: '3-2-3-2',
  },
};

const ATTACK_INSTRUCTIONS = new Set([
  'Falso extremo',
  'Defensivo',
  'Ensanchar la cancha',
  'Laterales ofensivos',
  'Rotación de banda',
  'Tiqui-taca',
  'Falso nueve',
  'Centros al área',
  'Falsos laterales',
]);

const DEFENSE_INSTRUCTIONS = new Set([
  'Carrilero',
  'Marcaje estrecho',
  'Defensa atrasada',
  'Poblar el área',
  'Presión alta',
  'Delantero liberado',
]);

const DEFENSIVE_PLAYERS = {
  'boca-2000-2001': 'Serna',
  'ac-milan-1988-90': 'Ancelotti',
  'inter-2009-2010': 'Cambiasso',
  'chelsea-2004-2005': 'Makelele',
  'argentina-1986': 'Batista',
  'francia-1998': 'Deschamps',
  'juventus-2014-2015': 'Pirlo',
  'leicester-city-2015-2016': 'Kanté',
  'grecia-2004': 'Zagorakis',
  'porto-2003-2004': 'Costinha',
  'italia-2006': 'Pirlo',
  'napoli-1986-1987': 'De Napoli',
};

const COUNTER_TARGETS = {
  'river-2018-2019': { field: 'defensa_avanzada_2', player: 'Borré' },
  'boca-2000-2001': { field: 'defensa_avanzada_1', player: 'Palermo' },
  'river-maquina-1941-1945': { field: 'defensa_avanzada_2', player: 'Pedernera' },
  'barcelona-2010-2011': { field: 'defensa_avanzada_2', player: 'Messi' },
  'arsenal-2003-2004': { field: 'defensa_avanzada_1', player: 'Henry' },
  'brasil-1970': { field: 'defensa_avanzada_1', player: 'Jairzinho' },
  'inter-2009-2010': { field: 'defensa_avanzada_1', player: 'Milito' },
  'real-madrid-2016-2018': { field: 'defensa_avanzada_1', player: 'Cristiano Ronaldo' },
  'liverpool-2018-2020': { field: 'defensa_avanzada_2', player: 'Salah' },
  'manchester-united-1998-1999': { field: 'defensa_avanzada_2', player: 'Andy Cole' },
  'bayern-munich-2012-2013': { field: 'defensa_avanzada_2', player: 'Robben' },
  'chelsea-2004-2005': { field: 'defensa_avanzada_1', player: 'Drogba' },
  'real-madrid-2001-2002': { field: 'defensa_avanzada_1', player: 'Raúl' },
  'argentina-1986': { field: 'defensa_avanzada_1', player: 'Maradona' },
  'juventus-2014-2015': { field: 'defensa_avanzada_1', player: 'Tévez' },
  'borussia-dortmund-2012-2013': { field: 'defensa_avanzada_2', player: 'Reus' },
  'roma-2000-2001': { field: 'defensa_avanzada_1', player: 'Batistuta' },
  'leicester-city-2015-2016': { field: 'defensa_avanzada_1', player: 'Vardy' },
  'porto-2003-2004': { field: 'defensa_avanzada_1', player: 'Derlei' },
  'inter-2020-2021': { field: 'defensa_avanzada_1', player: 'Lukaku' },
  'napoli-1986-1987': { field: 'defensa_avanzada_1', player: 'Maradona' },
};

function instructionBase(value) {
  return String(value || '').split(':')[0].trim();
}

function withInstructionTarget(instruction, target) {
  return `${instructionBase(instruction)}: ${target}`;
}

function normalizeAttackInstruction(value, tacticId) {
  const label = String(value || '').trim().toLowerCase();
  if (/false wingers|falsos extremos|falso extremo/.test(label)) return 'Falso extremo';
  if (/^defensive|defensivo/.test(label)) return withInstructionTarget('Defensivo', DEFENSIVE_PLAYERS[tacticId] || 'jugador');
  if (/hug the touchline|ensanchar/.test(label)) return 'Ensanchar la cancha';
  if (/attacking full backs|laterales ofensivos/.test(label)) return 'Laterales ofensivos';
  if (/wing rotation|rotaci[oó]n/.test(label)) return 'Rotación de banda';
  if (/tiki|tiqui/.test(label)) return 'Tiqui-taca';
  if (/false no\.? 9|falso 9|falso nueve/.test(label)) return 'Falso nueve';
  if (/centring targets|objetivos de centro|centros? al/.test(label)) return 'Centros al área';
  if (/false full backs|falsos laterales/.test(label)) return 'Falsos laterales';
  return value;
}

function normalizeDefenseInstruction(value, row) {
  const label = String(value || '').trim().toLowerCase();
  let normalized = value;
  if (/wing back|carrilero/.test(label)) normalized = 'Carrilero';
  else if (/tight marking|marcaje/.test(label)) normalized = 'Marcaje estrecho: DC rival';
  else if (/deep defensive line|l[ií]nea defensiva retrasada|defensa atrasada/.test(label)) normalized = 'Defensa atrasada';
  else if (/swarm the box|poblar/.test(label)) normalized = 'Poblar el área';
  else if (/gegenpress|presi[oó]n tras p[eé]rdida|presi[oó]n alta/.test(label)) normalized = 'Presión alta';
  else if (/counter target|objetivo de contraataque|delantero liberado/.test(label)) {
    const target = COUNTER_TARGETS[row.id]?.player || String(value).split(':')[1]?.trim() || 'delantero';
    normalized = `Delantero liberado: ${target}`;
  }
  return normalized;
}

function normalizeAdvancedInstructions(row) {
  row.ataque_avanzada_1 = normalizeAttackInstruction(row.ataque_avanzada_1, row.id);
  row.ataque_avanzada_2 = normalizeAttackInstruction(row.ataque_avanzada_2, row.id);

  row.defensa_avanzada_1 = normalizeDefenseInstruction(row.defensa_avanzada_1, row);
  row.defensa_avanzada_2 = normalizeDefenseInstruction(row.defensa_avanzada_2, row);
  const counterTarget = COUNTER_TARGETS[row.id];
  if (counterTarget) {
    row[counterTarget.field] = `Delantero liberado: ${counterTarget.player}`;
  }
  for (const field of ['defensa_avanzada_1', 'defensa_avanzada_2']) {
    if (instructionBase(row[field]) === 'Marcaje estrecho' && !row[field].includes(':')) {
      row[field] = 'Marcaje estrecho: DC rival';
    }
  }
  return row;
}

const PHASE_OVERRIDES = {
  'ajax-1994-1995': {
    inicial: {
      'Edwin van der Sar': ['PT', 50, 91],
      'Michael Reiziger': ['DFC', 70, 74],
      'Danny Blind': ['DFC', 50, 74],
      'Frank de Boer': ['DFC', 30, 74],
      'Finidi George': ['MD', 82, 52],
      'Frank Rijkaard': ['MC', 62, 52],
      'Clarence Seedorf': ['SD', 62, 24],
      'Edgar Davids': ['MC', 38, 52],
      'Marc Overmars': ['MI', 18, 52],
      'Jari Litmanen': ['SD', 38, 24],
      'Patrick Kluivert': ['DC', 50, 20],
    },
    sin_balon: {
      'Edwin van der Sar': ['PT', 50, 91],
      'Michael Reiziger': ['LD', 83, 74],
      'Danny Blind': ['DFC', 61, 74],
      'Frank de Boer': ['DFC', 39, 74],
      'Finidi George': ['MD', 82, 39],
      'Frank Rijkaard': ['MCD', 50, 58],
      'Clarence Seedorf': ['MC', 62, 39],
      'Edgar Davids': ['LI', 17, 74],
      'Marc Overmars': ['MI', 18, 39],
      'Jari Litmanen': ['MC', 38, 39],
      'Patrick Kluivert': ['DC', 50, 20],
    },
  },
  'grecia-2004': {
    con_balon: {
      'Antonios Nikopolidis': ['PT', 50, 91],
      'Giourkas Seitaridis': ['LD', 83, 74],
      'Traianos Dellas': ['DFC', 61, 74],
      'Michalis Kapsis': ['DFC', 39, 74],
      'Takis Fyssas': ['LI', 17, 74],
      'Theodoros Zagorakis': ['MC', 62, 52],
      'Stelios Giannakopoulos': ['MP', 50, 36],
      'Angelos Basinas': ['MC', 38, 52],
      'Kostas Katsouranis': ['MD', 82, 52],
      'Giorgos Karagounis': ['MI', 18, 52],
      'Angelos Charisteas': ['DC', 50, 20],
    },
  },
  'porto-2003-2004': {
    con_balon: {
      'Vítor Baía': ['PT', 50, 91],
      'Paulo Ferreira': ['MD', 78, 58],
      'Ricardo Carvalho': ['DFC', 61, 74],
      'Jorge Costa': ['DFC', 39, 74],
      'Nuno Valente': ['MI', 22, 58],
      Costinha: ['MCD', 50, 58],
      Maniche: ['MP', 70, 39],
      'Pedro Mendes': ['MP', 30, 39],
      Deco: ['MP', 50, 39],
      Derlei: ['SD', 42, 22],
      'Benni McCarthy': ['DC', 58, 22],
    },
    sin_balon: {
      'Vítor Baía': ['PT', 50, 91],
      'Paulo Ferreira': ['LD', 83, 74],
      'Ricardo Carvalho': ['DFC', 61, 74],
      'Jorge Costa': ['DFC', 39, 74],
      'Nuno Valente': ['LI', 17, 74],
      Costinha: ['MCD', 50, 60],
      Maniche: ['MC', 35, 50],
      'Pedro Mendes': ['MC', 65, 50],
      Deco: ['MP', 50, 38],
      Derlei: ['SD', 42, 22],
      'Benni McCarthy': ['DC', 58, 22],
    },
  },
  'inter-2020-2021': {
    con_balon: {
      'Samir Handanovic': ['PT', 50, 91],
      'Milan Skriniar': ['DFC', 70, 74],
      'Stefan de Vrij': ['DFC', 50, 74],
      'Alessandro Bastoni': ['DFC', 30, 74],
      'Achraf Hakimi': ['MD', 78, 58],
      'Ivan Perisic': ['MI', 22, 58],
      'Nicolò Barella': ['MP', 62, 39],
      'Marcelo Brozovic': ['MCD', 50, 58],
      'Christian Eriksen': ['MP', 38, 39],
      'Lautaro Martínez': ['SD', 42, 22],
      'Romelu Lukaku': ['DC', 58, 22],
    },
  },
  'chile-2015': {
    con_balon: {
      'Claudio Bravo': ['PT', 50, 91],
      'Gary Medel': ['DFC', 70, 74],
      'Gonzalo Jara': ['DFC', 50, 74],
      'Francisco Silva': ['DFC', 30, 74],
      'Mauricio Isla': ['MD', 80, 39],
      'Jean Beausejour': ['MI', 20, 39],
      'Marcelo Díaz': ['MCD', 42, 58],
      'Charles Aránguiz': ['MC', 58, 58],
      'Arturo Vidal': ['MP', 50, 39],
      'Alexis Sánchez': ['SD', 42, 22],
      'Eduardo Vargas': ['DC', 58, 22],
    },
  },
  'italia-2006': {
    sin_balon: {
      'Gianluigi Buffon': ['PT', 50, 91],
      'Gianluca Zambrotta': ['LD', 83, 74],
      'Fabio Cannavaro': ['DFC', 61, 74],
      'Marco Materazzi': ['DFC', 39, 74],
      'Fabio Grosso': ['LI', 17, 74],
      'Gennaro Gattuso': ['MC', 38, 52],
      'Andrea Pirlo': ['MC', 62, 52],
      'Simone Perrotta': ['MD', 82, 52],
      'Francesco Totti': ['MP', 50, 36],
      'Luca Toni': ['DC', 50, 20],
      'Alessandro Del Piero': ['MI', 18, 52],
    },
  },
  'juventus-2014-2015': {
    con_balon: {
      'Gianluigi Buffon': ['PT', 50, 91],
      'Stephan Lichtsteiner': ['MD', 82, 52],
      'Leonardo Bonucci': ['DFC', 70, 74],
      'Giorgio Chiellini': ['DFC', 50, 74],
      'Patrice Evra': ['DFC', 30, 74],
      'Claudio Marchisio': ['MC', 62, 52],
      'Andrea Pirlo': ['MCD', 50, 60],
      'Paul Pogba': ['MI', 18, 52],
      'Arturo Vidal': ['MP', 50, 38],
      'Carlos Tévez': ['SD', 42, 22],
      'Álvaro Morata': ['DC', 58, 22],
    },
    sin_balon: {
      'Gianluigi Buffon': ['PT', 50, 91],
      'Stephan Lichtsteiner': ['LD', 83, 74],
      'Leonardo Bonucci': ['DFC', 61, 74],
      'Giorgio Chiellini': ['DFC', 39, 74],
      'Patrice Evra': ['LI', 17, 74],
      'Claudio Marchisio': ['MC', 35, 50],
      'Andrea Pirlo': ['MCD', 50, 60],
      'Paul Pogba': ['MC', 65, 50],
      'Arturo Vidal': ['MP', 50, 38],
      'Carlos Tévez': ['SD', 42, 22],
      'Álvaro Morata': ['DC', 58, 22],
    },
  },
  'napoli-1986-1987': {
    sin_balon: {
      'Claudio Garella': ['PT', 50, 91],
      'Moreno Ferrario': ['DFC', 66, 74],
      'Giuseppe Bruscolotti': ['DFC', 50, 74],
      'Alessandro Renica': ['DFC', 34, 74],
      'Salvatore Bagni': ['LD', 83, 74],
      'Giovanni Francini': ['LI', 17, 74],
      'Fernando De Napoli': ['MCD', 50, 58],
      'Francesco Romano': ['MC', 38, 58],
      'Diego Maradona': ['MP', 50, 38],
      'Bruno Giordano': ['MC', 62, 58],
      'Andrea Carnevale': ['DC', 50, 20],
    },
  },
};

const PLAYER_HEADERS = [
  'id',
  'nombre',
  'posicion',
  'x',
  'y',
  'posicion_inicial',
  'x_inicial',
  'y_inicial',
  'posicion_con_balon',
  'x_con_balon',
  'y_con_balon',
  'posicion_sin_balon',
  'x_sin_balon',
  'y_sin_balon',
];

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const headers = lines.shift().split(';').map(value => value.trim());
  return {
    headers,
    rows: lines.filter(Boolean).map(line => {
      const values = line.split(';');
      return Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()]));
    }),
  };
}

function serializeCsv(headers, rows) {
  const lines = [
    headers.join(';'),
    ...rows.map(row => headers.map(header => String(row[header] ?? '').trim()).join(';')),
  ];
  return `${lines.join('\n')}\n`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertUnique(values, label) {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  assert(duplicates.length === 0, `${label} duplicados: ${[...new Set(duplicates)].join(', ')}`);
}

function rebuildTactics() {
  const original = fs.readFileSync(TACTICS_PATH, 'utf8');
  const { headers, rows } = parseCsv(original);
  const byId = new Map(rows.map(row => [row.id, row]));

  assert(TARGET_IDS.length === 32, 'El inventario debe contener exactamente 32 tácticas.');
  assertUnique(TARGET_IDS, 'IDs objetivo');
  TARGET_IDS.forEach(id => assert(byId.has(id), `Falta la táctica ${id}.`));
  assert(byId.has(EXCLUDED_ID), `Falta la táctica excluida ${EXCLUDED_ID}.`);

  const rebuilt = rows.map(row => {
    const clean = Object.fromEntries(headers.map(header => [header, row[header] || '']));
    const rebuiltRow = TARGET_IDS.includes(row.id)
      ? { ...clean, dinamica: 'Si', ...(TACTIC_OVERRIDES[row.id] || {}) }
      : clean;
    return normalizeAdvancedInstructions(rebuiltRow);
  });

  assertUnique(rebuilt.map(row => row.id), 'IDs de tácticas');
  assertUnique(rebuilt.map(row => `${row.equipo}|${row.temporada}`), 'Equipo/temporada');
  assert(rebuilt.length === 33, `Se esperaban 33 tácticas totales y hay ${rebuilt.length}.`);
  rebuilt.filter(row => TARGET_IDS.includes(row.id)).forEach(row => {
    for (const field of ['formacion', 'formacion_con_balon', 'formacion_sin_balon']) {
      assert(!row[field].includes('/'), `${row.id}: ${field} contiene una fecha de Excel.`);
    }
    assert(!/(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)/i.test(row.rango_apoyo), `${row.id}: rango de apoyo inválido.`);
  });
  rebuilt.forEach(row => {
    for (const field of ['ataque_avanzada_1', 'ataque_avanzada_2']) {
      const base = instructionBase(row[field]);
      assert(ATTACK_INSTRUCTIONS.has(base), `${row.id}: instrucción de ataque inválida: ${row[field]}`);
      if (base === 'Defensivo') {
        assert(row[field].includes(':') && row[field].split(':')[1].trim(), `${row.id}: Defensivo necesita jugador asignado.`);
      }
    }
    for (const field of ['defensa_avanzada_1', 'defensa_avanzada_2']) {
      const base = instructionBase(row[field]);
      assert(DEFENSE_INSTRUCTIONS.has(base), `${row.id}: instrucción defensiva inválida: ${row[field]}`);
      if (base === 'Marcaje estrecho' || base === 'Delantero liberado') {
        assert(row[field].includes(':') && row[field].split(':')[1].trim(), `${row.id}: ${base} necesita objetivo asignado.`);
      }
    }
  });

  fs.writeFileSync(TACTICS_PATH, serializeCsv(headers, rebuilt), 'utf8');
  return rebuilt;
}

function applyPhaseOverride(player, phase, values) {
  const [position, x, y] = values;
  player[`posicion_${phase}`] = position;
  player[`x_${phase}`] = String(x);
  player[`y_${phase}`] = String(y);
}

const TEAM_TILTS = {
  'ac-milan-1988-90': -1,
  'ajax-1994-1995': 1,
  'argentina-1986': -1,
  'arsenal-2003-2004': -1,
  'atalanta-2023-2024': -1,
  'barcelona-2010-2011': 1,
  'bayer-leverkusen-2023-2024': -1,
  'bayern-munich-2012-2013': 1,
  'boca-2000-2001': 1,
  'borussia-dortmund-2012-2013': -1,
  'brasil-1970': 1,
  'chelsea-2004-2005': -1,
  'chile-2015': 1,
  'espana-2010': -1,
  'francia-1998': 1,
  'grecia-2004': -1,
  'inter-2009-2010': 1,
  'inter-2020-2021': 1,
  'italia-2006': -1,
  'juventus-2014-2015': -1,
  'leicester-city-2015-2016': 1,
  'liverpool-2018-2020': -1,
  'manchester-city-2022-2023': 1,
  'manchester-united-1998-1999': 1,
  'napoli-1986-1987': -1,
  'paises-bajos-1978': 1,
  'porto-2003-2004': 1,
  'psg-2024-2025': 1,
  'real-madrid-2001-2002': 1,
  'real-madrid-2016-2018': -1,
  'river-maquina-1941-1945': -1,
  'roma-2000-2001': 1,
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function playerZone(position, y) {
  if (position === 'PT') return 'goalkeeper';
  if (position === 'DFC' || position === 'LD' || position === 'LI') return 'defense';
  if (position === 'DC' || position === 'SD' || position === 'ED' || position === 'EI') return 'attack';
  if (position === 'MP') return 'attackingMidfield';
  if (y > 66) return 'defense';
  if (y > 46) return 'midfield';
  if (y > 30) return 'attackingMidfield';
  return 'attack';
}

function normalizedInstructions(tactic) {
  return [
    tactic.ataque_avanzada_1,
    tactic.ataque_avanzada_2,
    tactic.defensa_avanzada_1,
    tactic.defensa_avanzada_2,
  ].join(' ').toLowerCase();
}

function organicPlayerPosition(player, phase, tactic) {
  const positionField = `posicion_${phase}`;
  const xField = `x_${phase}`;
  const yField = `y_${phase}`;
  const position = String(player[positionField] || player.posicion || '').toUpperCase();
  const originalX = Number(player[xField]);
  const originalY = Number(player[yField]);
  const zone = playerZone(position, originalY);
  const side = originalX < 45 ? -1 : originalX > 55 ? 1 : 0;
  const tilt = TEAM_TILTS[tactic.id] || 1;
  const instructions = normalizedInstructions(tactic);
  const hasAttackingFullBacks = /laterales ofensivos/.test(instructions);
  const hasFalseWingers = /falso extremo/.test(instructions);
  const hasHugTouchline = /ensanchar la cancha/.test(instructions);
  const phaseOffset = {
    inicial: { attack: 0, attackingMidfield: 0, midfield: 0, defense: 0 },
    con_balon: { attack: -2, attackingMidfield: -2, midfield: -2, defense: 0 },
    sin_balon: { attack: 2, attackingMidfield: 2, midfield: 2, defense: 1 },
  }[phase];
  const zoneBase = {
    goalkeeper: 91,
    defense: 74,
    midfield: 56,
    attackingMidfield: 39,
    attack: 22,
  }[zone];
  const roleOffset = {
    goalkeeper: { PT: 0 },
    defense: { DFC: 1, LD: -3, LI: -3, MCD: -1, MC: -2 },
    midfield: { MCD: 5, MC: 0, MD: -2, MI: -2, LD: 1, LI: 1, MP: -5, ED: -4, EI: -4 },
    attackingMidfield: { MP: 0, MC: 3, MD: 1, MI: 1, SD: -2, ED: -1, EI: -1, DC: -3 },
    attack: { DC: -2, SD: 3, ED: 2, EI: 2, MP: 5 },
  }[zone]?.[position] || 0;

  const isWide = ['LD', 'LI', 'MD', 'MI', 'ED', 'EI'].includes(position);
  const isFullBack = ['LD', 'LI'].includes(position);
  const isWinger = ['ED', 'EI'].includes(position);
  let x = isWide && side !== 0
    ? (side < 0 ? (isFullBack ? 17 : 18) : (isFullBack ? 83 : 82))
    : position === 'SD' && side !== 0
      ? (side < 0 ? 42 : 58)
      : originalX;
  let y = zoneBase + roleOffset + (phaseOffset[zone] || 0);

  if (zone !== 'goalkeeper') {
    y += side * tilt;
  }
  if (zone === 'defense' && position === 'DFC') {
    y += side === 0 ? 2 : -1;
  }
  if (zone === 'midfield' && position === 'MC') {
    y += side === tilt ? -2 : 1;
  }
  if (position === 'MP' && side === 0) {
    y -= phase === 'con_balon' ? 2 : 1;
  }
  if (phase === 'con_balon' && isWide) {
    if (hasHugTouchline || hasAttackingFullBacks) x += side * 3;
    if (hasFalseWingers && isWinger) x -= side * 8;
    if (hasAttackingFullBacks && isFullBack) y -= 5;
  }
  if (phase === 'sin_balon' && isWide) {
    x -= side * (isWinger ? 6 : 3);
    if (isWinger) y += 5;
  }

  return [position, clamp(Math.round(x), 10, 90), clamp(Math.round(y), 16, 92)];
}

function separatePhasePlayers(players, phase) {
  const xField = `x_${phase}`;
  const yField = `y_${phase}`;

  for (let pass = 0; pass < 12; pass += 1) {
    let moved = false;
    for (let first = 0; first < players.length; first += 1) {
      for (let second = first + 1; second < players.length; second += 1) {
        const a = players[first];
        const b = players[second];
        if (a[`posicion_${phase}`] === 'PT' || b[`posicion_${phase}`] === 'PT') continue;

        const ax = Number(a[xField]);
        const ay = Number(a[yField]);
        const bx = Number(b[xField]);
        const by = Number(b[yField]);
        const dx = Math.abs(ax - bx);
        const dy = Math.abs(ay - by);
        if (dx >= 12 || dy >= 8) continue;

        const horizontalMove = Math.ceil((13 - dx) / 2);
        const aGoesLeft = ax < bx || (ax === bx && first < second);
        const nextAx = clamp(ax + (aGoesLeft ? -horizontalMove : horizontalMove), 10, 90);
        const nextBx = clamp(bx + (aGoesLeft ? horizontalMove : -horizontalMove), 10, 90);
        a[xField] = String(nextAx);
        b[xField] = String(nextBx);
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function rebuildPlayers(tactic) {
  const tacticId = tactic.id;
  const playersPath = path.join(TEAMS_PATH, tacticId, 'players.csv');
  assert(fs.existsSync(playersPath), `Falta ${playersPath}.`);
  const { rows } = parseCsv(fs.readFileSync(playersPath, 'utf8'));
  assert(rows.length === 11, `${tacticId} debe tener 11 jugadores y tiene ${rows.length}.`);
  assertUnique(rows.map(player => player.id), `IDs de jugadores en ${tacticId}`);
  assertUnique(rows.map(player => player.nombre), `Nombres de jugadores en ${tacticId}`);

  const rebuilt = rows.map(source => {
    const player = Object.fromEntries(PLAYER_HEADERS.map(header => [header, source[header] || '']));

    player.posicion = player.posicion_inicial || player.posicion;
    player.x = player.x_inicial || player.x;
    player.y = player.y_inicial || player.y;

    for (const phase of ['inicial', 'con_balon', 'sin_balon']) {
      player[`posicion_${phase}`] ||= player.posicion;
      player[`x_${phase}`] ||= player.x;
      player[`y_${phase}`] ||= player.y;
      const override = PHASE_OVERRIDES[tacticId]?.[phase]?.[player.nombre];
      if (override) applyPhaseOverride(player, phase, override);
      applyPhaseOverride(player, phase, organicPlayerPosition(player, phase, tactic));
    }

    player.posicion = player.posicion_inicial;
    player.x = player.x_inicial;
    player.y = player.y_inicial;
    return player;
  });

  for (const phase of ['inicial', 'con_balon', 'sin_balon']) {
    separatePhasePlayers(rebuilt, phase);
  }

  rebuilt.forEach(player => {
    player.posicion = player.posicion_inicial;
    player.x = player.x_inicial;
    player.y = player.y_inicial;
  });

  for (const [phase, overrides] of Object.entries(PHASE_OVERRIDES[tacticId] || {})) {
    assert(
      Object.keys(overrides).every(name => rebuilt.some(player => player.nombre === name)),
      `${tacticId}/${phase} contiene jugadores desconocidos.`,
    );
  }

  rebuilt.forEach(player => {
    for (const field of ['x', 'y', 'x_inicial', 'y_inicial', 'x_con_balon', 'y_con_balon', 'x_sin_balon', 'y_sin_balon']) {
      const value = Number(player[field]);
      assert(Number.isFinite(value) && value >= 0 && value <= 100, `${tacticId}: ${field} inválido para ${player.nombre}.`);
    }
  });
  for (const phase of ['inicial', 'con_balon', 'sin_balon']) {
    assertUnique(
      rebuilt.map(player => `${player[`x_${phase}`]}|${player[`y_${phase}`]}`),
      `Coordenadas ${phase} en ${tacticId}`,
    );
    for (let first = 0; first < rebuilt.length; first += 1) {
      for (let second = first + 1; second < rebuilt.length; second += 1) {
        const dx = Math.abs(Number(rebuilt[first][`x_${phase}`]) - Number(rebuilt[second][`x_${phase}`]));
        const dy = Math.abs(Number(rebuilt[first][`y_${phase}`]) - Number(rebuilt[second][`y_${phase}`]));
        assert(dx >= 12 || dy >= 8, `${tacticId}/${phase}: jugadores demasiado cercanos.`);
      }
    }
  }

  fs.writeFileSync(playersPath, serializeCsv(PLAYER_HEADERS, rebuilt), 'utf8');
}

function main() {
  const tactics = rebuildTactics();
  const tacticsById = new Map(tactics.map(tactic => [tactic.id, tactic]));
  TARGET_IDS.forEach(id => rebuildPlayers(tacticsById.get(id)));

  const directories = fs.readdirSync(TEAMS_PATH, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
  assertUnique(directories, 'Directorios de tácticas');
  assert(directories.length === tactics.length, `Hay ${directories.length} directorios para ${tactics.length} tácticas.`);

  console.log(`Reconstruidas ${TARGET_IDS.length} tácticas y ${TARGET_IDS.length * 11} registros de jugadores.`);
  console.log(`Conservada sin reconstruir: ${EXCLUDED_ID}.`);
}

main();
