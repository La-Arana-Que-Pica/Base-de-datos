/**
 * Base de datos Option File PES 2018–2026
 * Player Profile Page Script
 *
 * Loads a single player's full data from URL params:
 *   player.html?id=PLAYERID&team=TEAMID
 */

'use strict';

// ─── Utilities ────────────────────────────────────────────────────────────────

function handleMinifaceError(img, playerId) {
  if (!img.dataset.ddsTried) {
    img.dataset.ddsTried = '1';
    img.src = 'img/players/player_' + playerId + '.dds';
  } else {
    img.onerror = null;
    img.src = 'img/players/default.png';
  }
}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(';').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(';').map(v => v.trim());
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] !== undefined ? values[idx] : '';
    });
    rows.push(obj);
  }
  return { headers, rows };
}

function pickValue(obj, keys, fallback = '') {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
      return obj[key];
    }
  }
  return fallback;
}

async function fetchText(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

function flagSrc(countryId) {
  if (!countryId) return 'img/flags/default.png';
  return `img/flags/${countryId}.png`;
}

function statColorClass(value) {
  const v = parseInt(value, 10);
  if (isNaN(v)) return 'stat-range-1';
  if (v >= 95) return 'stat-range-6';
  if (v >= 90) return 'stat-range-5';
  if (v >= 80) return 'stat-range-4';
  if (v >= 70) return 'stat-range-3';
  if (v >= 60) return 'stat-range-2';
  return 'stat-range-1';
}

function statColor(value) {
  const v = parseInt(value, 10);
  if (isNaN(v)) return '#d33d35';
  if (v >= 95) return '#00ff87';
  if (v >= 90) return '#62ff51';
  if (v >= 80) return '#a8ff00';
  if (v >= 70) return '#e5dc00';
  if (v >= 60) return '#e59f01';
  return '#d33d35';
}

function statTextColor(hexColor) {
  return ['#e5dc00', '#a8ff00', '#62ff51', '#00ff87'].includes(hexColor) ? '#111' : '#fff';
}

function overallColor(value) {
  const v = parseInt(value, 10);
  if (isNaN(v)) return 'stat-range-1';
  if (v >= 95) return 'stat-range-6';
  if (v >= 90) return 'stat-range-5';
  if (v >= 80) return 'stat-range-4';
  if (v >= 70) return 'stat-range-3';
  if (v >= 60) return 'stat-range-2';
  return 'stat-range-1';
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Translations (UI display only) ──────────────────────────────────────────

// Stats: CSV column name → Spanish display label
const STAT_LABELS = {
  'Attacking Prowess': 'Ataque',
  'Ball Control':      'Control de balón',
  'Dribbling':         'Drible',
  'Low Pass':          'Pase al ras',
  'Lofted Pass':       'Pase bombeado',
  'Finishing':         'Finalización',
  'Place Kicking':     'Balón parado',
  'Controlled Spin':   'Efecto',
  'Header':            'Cabeza',
  'Defensive Prowess': 'Defensa',
  'Ball Winning':      'Recup. de balón',
  'Kicking Power':     'Potencia de tiro',
  'Speed':             'Velocidad',
  'Explosive Power':   'Fuerza explosiva',
  'Body Control':      'Control corporal',
  'Physical Contact':  'Contacto físico',
  'Jump':              'Salto',
  'Goalkeeping':       'Capac. de portero',
  'Catching':          'Atajar',
  'Clearing':          'Despejar',
  'Reflexes':          'Reflejos',
  'Coverage':          'Alcance',
  'Stamina':           'Resistencia',
  'Weak Foot Usage':   'Uso de pie malo',
  'Weak Foot Acc.':    'Precisión de pie malo',
  'Form':              'Estabilidad',
  'Injury Resistance': 'Resist. a lesiones',
};

// Positions: PES abbreviation → Spanish UI label
const POSITION_LABELS = {
  'GK':  'PT',
  'CB':  'DEC',
  'LB':  'LI',
  'RB':  'LD',
  'DMF': 'MCD',
  'CMF': 'MC',
  'LMF': 'MDI',
  'RMF': 'MDD',
  'AMF': 'MO',
  'LWF': 'EXI',
  'RWF': 'EXD',
  'SS':  'SD',
  'CF':  'CD',
};

const NATIONALITY_NAMES = {
  '7':   'China',        '10':  'Indonesia',   '11':  'Irán',
  '12':  'Irak',         '13':  'Japón',        '14':  'Jordania',
  '15':  'Corea del Norte', '16': 'Corea del Sur', '17': 'Kuwait',
  '19':  'Líbano',       '26':  'Omán',         '30':  'Qatar',
  '31':  'Arabia Saudita', '36': 'Tailandia',   '37':  'Emiratos Árabes Unidos',
  '44':  'Argelia',      '45':  'Angola',       '48':  'Burkina Faso',
  '50':  'Camerún',      '51':  'Cabo Verde',   '52':  'Benín',
  '55':  'Congo DR',     '56':  'Costa de Marfil', '58': 'Egipto',
  '59':  'Andorra',      '63':  'Gambia',       '64':  'Ghana',
  '65':  'Guinea',       '66':  'Guinea-Bisáu', '70':  'Libia',
  '73':  'Malí',         '76':  'Marruecos',    '77':  'Mozambique',
  '79':  'Níger',        '80':  'Nigeria',      '83':  'Senegal',
  '87':  'Sudáfrica',    '91':  'Togo',         '92':  'Túnez',
  '94':  'Zambia',       '95':  'Zimbabue',     '110': 'Canadá',
  '112': 'Costa Rica',   '115': 'Rep. Dominicana', '120': 'Haití',
  '121': 'Honduras',     '122': 'Jamaica',      '124': 'México',
  '128': 'Panamá',       '133': 'Filipinas',    '135': 'Estados Unidos',
  '139': 'Surinam',      '144': 'Argentina',    '145': 'Bolivia',
  '146': 'Brasil',       '147': 'Chile',        '148': 'Colombia',
  '149': 'Ecuador',      '150': 'Paraguay',     '151': 'Perú',
  '152': 'Uruguay',      '153': 'Venezuela',    '162': 'Australia',
  '166': 'Nueva Zelanda','189': 'Israel',       '190': 'Turquía',
  '191': 'Albania',      '193': 'Armenia',      '194': 'Austria',
  '196': 'Bielorrusia',  '197': 'Bélgica',      '198': 'Bosnia y Herzegovina',
  '199': 'Bulgaria',     '200': 'Croacia',       '201': 'Chipre',
  '202': 'Rep. Checa',   '203': 'Dinamarca',    '204': 'Inglaterra',
  '207': 'Finlandia',    '208': 'Francia',      '209': 'Georgia',
  '210': 'Alemania',     '211': 'Grecia',       '212': 'Hungría',
  '213': 'Islandia',     '214': 'Irlanda',      '215': 'Italia',
  '219': 'Lituania',     '221': 'Macedonia del Norte', '223': 'Moldavia',
  '224': 'Países Bajos', '225': 'Irlanda del Norte', '226': 'Noruega',
  '227': 'Polonia',      '228': 'Portugal',     '229': 'Rumanía',
  '230': 'Rusia',        '232': 'Escocia',      '234': 'Eslovaquia',
  '235': 'Eslovenia',    '236': 'España',       '237': 'Suecia',
  '238': 'Suiza',        '239': 'Ucrania',      '240': 'Uzbekistán',
  '241': 'Gales',        '303': 'Serbia',       '304': 'Montenegro',
  '311': 'Kosovo',
};

function nationalityName(countryId) {
  if (!countryId) return '–';
  return NATIONALITY_NAMES[String(countryId)] || countryId;
}

// Team type → Spanish label
const TYPE_LABELS = {
  '0': 'Clubes',
  '1': 'Equipos especiales',
  '2': 'Selecciones',
};

function translateStat(csvCol) {
  return STAT_LABELS[csvCol] || csvCol;
}

function translatePosition(pesPos) {
  return POSITION_LABELS[pesPos] || pesPos;
}

function positionGroupColor(pesPos) {
  if (pesPos === 'GK') return '#f9d901';
  if (['CB', 'LB', 'RB'].includes(pesPos)) return '#2cccfa';
  if (['DMF', 'CMF', 'LMF', 'RMF', 'AMF'].includes(pesPos)) return '#57e42b';
  if (['LWF', 'RWF', 'SS', 'CF'].includes(pesPos)) return '#ff2c77';
  return '#8b949e';
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PES_POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'SS', 'CF'];

// Position rating columns (same order as PES_POSITIONS)
const POSITION_RATING_COLS = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'SS', 'CF'];

const POSITION_FIELD_COORDS = {
  'GK':  { left: 50, top: 88 },
  'CB':  { left: 50, top: 72 },
  'LB':  { left: 16, top: 65 },
  'RB':  { left: 84, top: 65 },
  'DMF': { left: 50, top: 52 },
  'CMF': { left: 50, top: 42 },
  'LMF': { left: 22, top: 42 },
  'RMF': { left: 78, top: 42 },
  'AMF': { left: 50, top: 30 },
  'LWF': { left: 16, top: 20 },
  'RWF': { left: 84, top: 20 },
  'SS':  { left: 50, top: 22 },
  'CF':  { left: 50, top: 10 },
};

// Ordered stat columns for the Habilidades section (exact game order)
const STAT_COLUMNS_ORDERED = [
  'Attacking Prowess', 'Ball Control', 'Dribbling',
  'Low Pass', 'Lofted Pass', 'Finishing',
  'Place Kicking', 'Controlled Spin', 'Header',
  'Defensive Prowess', 'Ball Winning', 'Kicking Power',
  'Speed', 'Explosive Power', 'Body Control',
  'Physical Contact', 'Jump', 'Goalkeeping',
  'Catching', 'Clearing', 'Reflexes',
  'Coverage', 'Stamina',
  'Weak Foot Usage', 'Weak Foot Acc.', 'Form', 'Injury Resistance',
];

// Playing style numeric index → Spanish label
const PLAYING_STYLE_LABELS = {
  '0':  '-',
  '1':  'Cazagoles',
  '2':  'Señuelo',
  '3':  'Hombre de área',
  '4':  'Extremo prolífico',
  '5':  'Diez clásico',
  '6':  'Jugador de huecos',
  '7':  'Omnipresente',
  '8':  'Medio escudo',
  '9':  'El destructor',
  '10': 'Atacante extra',
  '11': 'Lateral ofensivo',
  '12': 'Lateral defensivo',
  '13': 'Referente',
  '14': 'Creador de jugadas',
  '15': 'Creación',
  '16': 'Portero ofensivo',
  '17': 'Portero defensivo',
  '18': '-',
};

// Player skills S01–S28 (True/False) — Habilidades de jugador
const PLAYER_SKILLS = [
  { col: 'S01', label: 'Tijera' },
  { col: 'S02', label: 'Gambeta' },
  { col: 'S03', label: 'Marsellesa' },
  { col: 'S04', label: 'Sombrerito' },
  { col: 'S05', label: 'Amago por detrás y giro' },
  { col: 'S06', label: 'Rebote interior' },
  { col: 'S07', label: 'Cabeceador' },
  { col: 'S08', label: 'Cañonero' },
  { col: 'S09', label: 'Tiro con empeine' },
  { col: 'S10', label: 'Finaliz. acrobática' },
  { col: 'S11', label: 'Taconazo' },
  { col: 'S12', label: 'Remate primer toque' },
  { col: 'S13', label: 'Pase al primer toque' },
  { col: 'S14', label: 'Pase a profundidad' },
  { col: 'S15', label: 'Pase cruzado' },
  { col: 'S16', label: 'Centro con rosca' },
  { col: 'S17', label: 'Rabona' },
  { col: 'S18', label: 'Pase bombeado bajo' },
  { col: 'S19', label: 'Trayect. en picada' },
  { col: 'S20', label: 'Saque largo de banda' },
  { col: 'S21', label: 'Saq. meta largo' },
  { col: 'S22', label: 'Malicia' },
  { col: 'S23', label: 'Marcar hombre' },
  { col: 'S24', label: 'Delantero atrasado' },
  { col: 'S25', label: 'Despeje acrobático' },
  { col: 'S26', label: 'Capitanía' },
  { col: 'S27', label: 'Super refuerzo' },
  { col: 'S28', label: 'Espíritu de lucha' },
];

// COM playing styles P01–P07 (True/False) — Estilos de juego COM
const COM_PLAYING_STYLES = [
  { col: 'P01', label: 'Mago del balón' },
  { col: 'P02', label: 'Esquivo' },
  { col: 'P03', label: 'Misil con el balón' },
  { col: 'P04', label: 'Llegador' },
  { col: 'P05', label: 'Experto pases largos' },
  { col: 'P06', label: 'Centrador' },
  { col: 'P07', label: 'Cañonero' },
];

// ─── Appearance section/subsection definitions ────────────────────────────────

// Fields with image: path is img/appearance/{imageKey}/{value}.png
// Fields with enum: numeric/bool value → Spanish label
// Fields with source:'player': read from the players CSV row, not appearances
// Fields with conditionalDash: show '-' when another col matches a value
// Fields with dashIfZero: show '-' when the field value is '0'
// Fields with showImageIf: show image only when value is not '0' (and not empty)

const APPEARANCE_SECTIONS = [
  {
    title: 'Cara',
    subsections: [
      {
        title: 'Color de piel / Proporción de cabeza',
        fields: [
          { col: 'Skin Colour',  label: 'Color de piel',          imageKey: 'skin_colour' },
          { col: 'Head Length',  label: 'Altura de la cabeza' },
          { col: 'Head Width',   label: 'Anchura de la cabeza' },
          { col: 'Head Depth',   label: 'Profundidad de la cabeza' },
          { col: 'Face Height',  label: 'Largo de la cara' },
          { col: 'Face Size',    label: 'Tamaño de la cara' },
        ],
      },
      {
        title: 'Ojos',
        fields: [
          { col: 'Upper Eyelid Type',        label: 'Tipo de párpado superior',   imageKey: 'upper_eyelid' },
          { col: 'Bottom Eyelid Type',       label: 'Tipo de párpado inferior',   imageKey: 'bottom_eyelid' },
          { col: 'Eye Height',               label: 'Altura de los ojos' },
          { col: 'Horizontal Eye Position',  label: 'Posición horizontal ojos' },
          { col: 'Iris Colour',              label: 'Color del iris',             imageKey: 'iris_colour' },
          { col: 'Pupil Size',               label: 'Tamaño del iris' },
          { col: 'Upper Eyelid Ht. (Inner)', label: 'Alt. Párpado sup. (I.)' },
          { col: 'Upper Eyelid Wd. (Inner)', label: 'Ancho Párpado sup. (I.)' },
          { col: 'Upper Eyelid Ht. (Outer)', label: 'Alt. Párpado sup. (E.)' },
          { col: 'Upper Eyelid Wd. (Outer)', label: 'Ancho Párpado sup. (E.)' },
          { col: 'Inner Eye Height',         label: 'Altura interior ojos' },
          { col: 'Inner Eye Position',       label: 'Posición interior de ojos' },
          { col: 'Eye Corner Height',        label: 'Altura exterior ojos' },
          { col: 'Outer Eye Position',       label: 'Posición exterior de ojos' },
          { col: 'Bottom Eyelid Height',     label: 'Altura Párpado Inferior' },
          { col: 'Eye Depth',                label: 'Prof. de los ojos' },
        ],
      },
      {
        title: 'Frente / Cejas',
        fields: [
          { col: 'Forehead',            label: 'Frente',               imageKey: 'forehead' },
          { col: 'Eyebrow Type',        label: 'Estilo de cejas',      imageKey: 'eyebrow_type' },
          { col: 'Eyebrow Thickness',   label: 'Espesor de cejas' },
          { col: 'Eyebrow Style',       label: 'Tipo de cejas',        enum: { '0': 'Fina', '1': 'Normal', '2': 'Gruesa' } },
          { col: 'Eyebrow Density',     label: 'Densidad de cejas' },
          { col: 'Eyebrow Colour R',    label: 'Color de cejas R',   noPlus: true },
          { col: 'Eyebrow Colour G',    label: 'Color de cejas V',   noPlus: true },
          { col: 'Eyebrow Colour B',    label: 'Color de cejas A',   noPlus: true },
          { col: 'Inner Eyebrow Height',label: 'Altura interior cejas' },
          { col: 'Brow Width',          label: 'Ancho del entrecejo' },
          { col: 'Outer Edyebrow Height',label: 'Altura exterior cejas' },
          { col: 'Temple Width',        label: 'Ancho de la sien' },
          { col: 'Eyebrow Depth',       label: 'Profundidad de las cejas' },
        ],
      },
      {
        title: 'Nariz',
        fields: [
          { col: 'Nose Type',      label: 'Tipo de nariz',         imageKey: 'nose_type' },
          { col: 'Laughter Lines', label: 'Arrugas',               imageKey: 'laughter_lines' },
          { col: 'Nose Height',    label: 'Altura de la nariz' },
          { col: 'Nostril Width',  label: 'Tamaño fosas nasales' },
          { col: 'Nose Width',     label: 'Grosor de la nariz' },
          { col: 'Nose Tip Depth', label: 'Profundidad punta nariz' },
          { col: 'Nose Depth',     label: 'Profundidad nariz' },
        ],
      },
      {
        title: 'Boca',
        fields: [
          { col: 'Upper Lip Type',     label: 'Tipo labio sup.',    imageKey: 'upper_lip' },
          { col: 'Lower Lip Type',     label: 'Tipo labio inf.',    imageKey: 'lower_lip' },
          { col: 'Mouth Position',     label: 'Posición de la boca' },
          { col: 'Lip Size',           label: 'Tamaño labios' },
          { col: 'Lip Width',          label: 'Ancho de labio' },
          { col: 'Mouth Corner Height',label: 'Alt. comisuras lab.' },
          { col: 'Mouth Depth',        label: 'Profundidad de boca' },
        ],
      },
      {
        title: 'Vello Facial',
        fields: [
          { col: 'Facial Hair Type',    label: 'Tipo vello fac.',          imageKey: 'facial_hair', conditionalLabel: { value: '1', label: 'No' } },
          { col: 'Facial Hair Colour R',label: 'Color del vello facial R', noPlus: true, conditionalDash: { col: 'Facial Hair Type', value: '1' } },
          { col: 'Facial Hair Colour G',label: 'Color del vello facial V', noPlus: true, conditionalDash: { col: 'Facial Hair Type', value: '1' } },
          { col: 'Facial Hair Colour B',label: 'Color del vello facial A', noPlus: true, conditionalDash: { col: 'Facial Hair Type', value: '1' } },
          { col: 'Thickness',           label: 'Espesura',                              conditionalDash: { col: 'Facial Hair Type', value: '1' } },
        ],
      },
      {
        title: 'Mejillas / Maxilar / Mentón',
        fields: [
          { col: 'Cheek Type',    label: 'Tipo mejillas',              imageKey: 'cheek_type' },
          { col: 'Neck Line Type',label: 'Tipo de línea del cuello',   imageKey: 'neck_line' },
          { col: 'Cheekbones',    label: 'Pómulos' },
          { col: 'Chin Height',   label: 'Altura del mentón' },
          { col: 'Chin Width',    label: 'Ancho del mentón' },
          { col: 'Jaw Height',    label: 'Altura del maxilar' },
          { col: 'Jawline',       label: 'Línea del maxilar' },
          { col: 'Chin Depth',    label: 'Profundidad del mentón' },
        ],
      },
      {
        title: 'Orejas',
        fields: [
          { col: 'Ear Length', label: 'Largo de orejas' },
          { col: 'Ear Width',  label: 'Ancho de orejas' },
          { col: 'Ear Angle',  label: 'Ángulo de la oreja' },
        ],
      },
    ],
  },
  {
    title: 'Peinado',
    subsections: [
      {
        title: 'General',
        fields: [
          { col: 'Overall - Style',         label: 'Estilo',    enum: { '0': '-', '1': 'Normal', '2': 'Seco', '3': 'Mohicano', '4': 'Afro', '5': 'Rastas', '6': 'Trenzado', '7': 'Especial' } },
          { col: 'Overall - Length',        label: 'Longitud',  enum: { '0': '-', '1': 'Afeitado', '2': 'Muy corto', '3': 'Corto', '4': 'Mediano', '5': 'Largo' }, notApplicableWhen: { col: 'Overall - Style', value: '7' } },
          { col: 'Overall - Wave Level',    label: 'Ondulado',  notApplicableWhen: { col: 'Overall - Style', value: '7' } },
          { col: 'Overall - Hair Variation',label: 'Variación del pelo', imageKey: 'hair_variation' },
        ],
      },
      {
        title: 'Delante',
        fields: [
          { col: 'Font - Style',          label: 'Estilo',        enum: { '0': '-', '1': 'Arriba', '2': 'Abajo', '3': 'Hacia atrás' } },
          { col: 'Font - Parted',         label: 'Con raya',      enum: { '0': '-', '1': 'No', '2': 'Izquierda 2', '3': 'Izquierda 1', '4': 'Centro', '5': 'Derecha 1', '6': 'Derecha 2' } },
          { col: 'Font - Hairline',       label: 'A raíz',        enum: { '0': '-', '1': 'Tipo 1', '2': 'Tipo 2', '3': 'Tipo 3' } },
          { col: 'Font - Forehead Width', label: 'Ancho de frente', enum: { '0': '-', '1': 'Estrecha', '2': 'Normal', '3': 'Amplia' } },
        ],
      },
      {
        title: 'Lateral / Atrás',
        fields: [
          { col: 'Side/Back - Style',   label: 'Estilo',    enum: { '0': '-', '1': 'Normal', '2': 'Menos volumen', '3': 'Menos lateral', '4': 'Recortado' } },
          { col: 'Side/Back - Cropped', label: 'Recortado', showImageIf: true, imageKey: 'hair_cropped' },
        ],
      },
      {
        title: 'Color de pelo / Accesorios',
        fields: [
          { col: 'Hair Colour',    label: 'Color de pelo',    imageKey: 'hair_colour' },
          { col: 'Hair Colour R',  label: 'Color de pelo R',  noPlus: true },
          { col: 'Hair Colour G',  label: 'Color de pelo V',  noPlus: true },
          { col: 'Hair Colour B',  label: 'Color de pelo A',  noPlus: true },
          { col: 'Accessories',    label: 'Accesorios',       enum: { 'False': 'No', 'True': 'Sí' } },
          { col: 'Accessory Colour',label: 'Color de accesorio', noPlus: true },
        ],
      },
    ],
  },
  {
    title: 'Físico',
    subsections: [
      {
        title: null,
        fields: [
          { col: 'Height',            label: 'Altura (cm)',          source: 'player', noPlus: true },
          { col: 'Weight',            label: 'Peso (kg)',            source: 'player', noPlus: true },
          { col: 'Neck Length',       label: 'Longitud del cuello' },
          { col: 'Neck Size',         label: 'Anchura del cuello' },
          { col: 'Shoulder Height',   label: 'Altura de hombros' },
          { col: 'Shoulder Width',    label: 'Anchura de hombros' },
          { col: 'Chest Measurement', label: 'Medida del pecho' },
          { col: 'Waist Size',        label: 'Grosor cintura' },
          { col: 'Arm Size',          label: 'Medida de brazos' },
          { col: 'Thigh Size',        label: 'Grosor muslos' },
          { col: 'Calf Size',         label: 'Grosor pantorrillas' },
          { col: 'Leg Length',        label: 'Longitud de piernas' },
          { col: 'Arm Length',        label: 'Longitud del brazo' },
        ],
      },
    ],
  },
  {
    title: 'Forma de vestir',
    subsections: [
      {
        title: null,
        fields: [
          { col: 'Boots',              label: 'Calzado',                       imageKey: 'boots', imagePath: 'img/boots' },
          { col: 'Wrist taping',       label: 'Vendaje',                       enum: { '0': 'No', '1': 'Derecha', '2': 'Izquierda', '3': 'Ambos' } },
          { col: 'Wrist Tape Colou',   label: 'Color vendaje muñeca',          conditionalDash: { col: 'Wrist taping', value: '0' } },
          { col: 'Ankle Taping',       label: 'Vendaje tobillo',               enum: { '0': 'No', '1': 'Sí' } },
          { col: 'Player Gloves',      label: 'Guantes',                       enum: { '0': 'No', '1': 'Para invierno' } },
          { col: 'Colour',             label: 'Color de guantes',              conditionalDash: { col: 'Player Gloves', value: '0' } },
          { col: 'Gloves',             label: 'Guantes portero',               imageKey: 'gloves', gkOnly: true },
          { col: 'Undershorts',        label: 'Calentadores',                  enum: { '0': 'V: No / I: No', '1': 'V: No / I: Largo', '2': 'V: Corto / I: Corto', '3': 'V: Corto / I: Largo' } },
          { col: 'Shirttail',          label: 'Estilo de la camiseta',         enum: { '0': 'Dentro', '1': 'Fuera' } },
          { col: 'Sock Length',        label: 'Largo de las calcetas',         enum: { '0': 'Normal', '1': 'Corto', '2': 'Largo' } },
          { col: 'Long-Sleeved Inners',label: 'Playera interior manga larga',  enum: { '0': 'No', '1': 'Normal', '2': 'Cuello tortuga' } },
        ],
      },
    ],
  },
  {
    title: 'Movimiento',
    subsections: [
      {
        title: 'Drible',
        fields: [
          { col: 'Drib. Hunching', label: 'Encorvadura', source: 'player' },
          { col: 'Drib. Arm Move.',label: 'Mov. de brazo', source: 'player' },
        ],
      },
      {
        title: 'Animación de carrera',
        fields: [
          { col: 'Run. Hunching', label: 'Encorvadura', source: 'player' },
          { col: 'Run. Arm Move.',label: 'Mov. de brazo', source: 'player' },
        ],
      },
      {
        title: 'Animación de disparo',
        fields: [
          { col: 'Corner Kicks', label: 'Tiro de esquina', source: 'player' },
          { col: 'Free Kicks',   label: 'Tiro libre',      source: 'player' },
          { col: 'Penalty Kick', label: 'Penal',           source: 'player' },
        ],
      },
      {
        title: 'Celebración de goles',
        fields: [
          { col: 'Celebration 1', label: 'Celebración de goles 1', source: 'player', noPlus: true, zeroLabel: 'No' },
          { col: 'Celebration 2', label: 'Celebración de goles 2', source: 'player', noPlus: true, zeroLabel: 'No' },
        ],
      },
    ],
  },
];

// ─── Radar chart ─────────────────────────────────────────────────────────────

function computeRadarAttributes(player) {
  const avg = (...keys) => {
    const vals = keys.map(k => parseInt(player[k], 10)).filter(v => !isNaN(v));
    if (!vals.length) return 0;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  };
  return {
    PAS: avg('Low Pass', 'Lofted Pass', 'Controlled Spin', 'Place Kicking'),
    TIR: avg('Finishing', 'Attacking Prowess'),
    FIS: avg('Physical Contact'),
    DEF: avg('Defensive Prowess'),
    VEL: avg('Speed'),
    DRI: avg('Dribbling', 'Ball Control'),
    POR: avg('Goalkeeping', 'Catching', 'Clearing', 'Reflexes', 'Coverage'),
  };
}

function drawRadar(canvasId, attrs) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  const maxR = Math.min(cx, cy) - 42;
  const MIN_VAL = 40;
  const MAX_VAL = 99;
  const labels = Object.keys(attrs);
  const values = Object.values(attrs);
  const n = labels.length;

  ctx.clearRect(0, 0, W, H);

  // Grid rings (5 levels, center = MIN_VAL)
  for (let ring = 1; ring <= 5; ring++) {
    const r = (maxR * ring) / 5;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = ring === 5 ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = ring === 5 ? 1.5 : 1;
    ctx.stroke();
  }

  // Axis lines
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle));
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Data polygon fill (center = MIN_VAL)
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const r = Math.max(0, (values[i] - MIN_VAL) / (MAX_VAL - MIN_VAL)) * maxR;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(192, 57, 43, 0.25)';
  ctx.fill();
  ctx.strokeStyle = '#e74c3c';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Data points
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const r = Math.max(0, (values[i] - MIN_VAL) / (MAX_VAL - MIN_VAL)) * maxR;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#e74c3c';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Labels: attribute name only (no numeric value)
  ctx.textAlign = 'center';
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const labelR = maxR + 24;
    const lx = cx + labelR * Math.cos(angle);
    const ly = cy + labelR * Math.sin(angle);

    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    ctx.fillStyle = '#eaeaea';
    ctx.textBaseline = 'middle';
    ctx.fillText(labels[i], lx, ly);
  }
}

// ─── Special attribute configuration ─────────────────────────────────────────

// Stat bar range for standard attributes (PES stats go from 40 to 99)
const STAT_MIN = 40;
const STAT_MAX = 99;

// Attributes that use special ranges and should NOT use standard 40-99 bars
const SPECIAL_ATTRS = {
  'Weak Foot Usage':   { max: 4 },
  'Weak Foot Acc.':    { max: 4 },
  'Form':              { max: 8 },
  'Injury Resistance': { max: 3 },
};

// ─── Rendering helpers ────────────────────────────────────────────────────────

function renderStatRow(label, value, col) {
  const v = parseInt(value, 10) || 0;
  // Special attributes: render as bar scaled to their own range
  if (col && SPECIAL_ATTRS[col]) {
    const { max } = SPECIAL_ATTRS[col];
    const pct = Math.max(0, Math.min(100, (v / max) * 100));
    const barColor = v >= max * 0.75 ? '#a8ff00' : v >= max * 0.5 ? '#e59f01' : '#d33d35';
    const textColor = statTextColor(barColor);
    return `<div class="stat-row">
      <span class="stat-name">${label}</span>
      <span class="stat-value" style="background:${barColor};color:${textColor}">${v}</span>
      <div class="stat-bar-container">
        <div class="stat-bar" style="width:${pct}%;background:${barColor}"></div>
      </div>
    </div>`;
  }
  // Normal stat: scale bar from STAT_MIN to STAT_MAX
  const barColor = statColor(value);
  const textColor = statTextColor(barColor);
  const pct = Math.max(0, Math.min(100, ((v - STAT_MIN) / (STAT_MAX - STAT_MIN)) * 100));
  return `<div class="stat-row">
    <span class="stat-name">${label}</span>
    <span class="stat-value" style="background:${barColor};color:${textColor}">${value || '–'}</span>
    <div class="stat-bar-container">
      <div class="stat-bar" style="width:${pct}%;background:${barColor}"></div>
    </div>
  </div>`;
}

function renderPositionGrid(player) {
  const cells = POSITION_RATING_COLS.map(pos => {
    const val = parseInt(player[pos], 10);
    let profDisplay, profClass;
    if (isNaN(val)) {
      profDisplay = '–';
      profClass = '';
    } else if (val === 0) {
      profDisplay = 'C';
      profClass = 'pos-prof-c';
    } else if (val === 1) {
      profDisplay = 'B';
      profClass = 'pos-prof-b';
    } else {
      profDisplay = 'A';
      profClass = 'pos-prof-a';
    }
    return `<div class="pos-rating-cell">
      <div class="pos-rating-label">${translatePosition(pos)}</div>
      <div class="pos-rating-value ${profClass}">${profDisplay}</div>
    </div>`;
  }).join('');
  return `<div class="pos-rating-grid">${cells}</div>`;
}

function renderHabilidades(player) {
  const rows = STAT_COLUMNS_ORDERED
    .filter(col => player[col] !== undefined && player[col] !== '')
    .map(col => renderStatRow(translateStat(col), player[col], col))
    .join('');
  return `<div class="player-section">
    <div class="player-section-title">Habilidades</div>
    <div class="stats-list">${rows}</div>
  </div>`;
}

function renderEstiloDeJuego(player) {
  const val = player['PlayingStyle'] || '';
  const styleName = PLAYING_STYLE_LABELS[val] || (val ? `Estilo ${val}` : '-');
  const isEmpty = !val || val === '0' || val === '18' || styleName === '-';
  return `<div class="player-section">
    <div class="player-section-title">Roles</div>
    <div class="skill-items-list">
      <div class="skill-item-row${isEmpty ? ' skill-item-empty' : ''}">${isEmpty ? '-' : styleName}</div>
    </div>
  </div>`;
}

function renderHabilidadesJugador(player) {
  const active = PLAYER_SKILLS.filter(s => player[s.col] === 'True');
  const content = active.length
    ? `<div class="skill-items-list">${active.map(s => `<div class="skill-item-row">${s.label}</div>`).join('')}</div>`
    : `<div class="skill-items-list"><div class="skill-item-row skill-item-empty">-</div></div>`;
  return `<div class="player-section">
    <div class="player-section-title">Habilidades de jugador</div>
    ${content}
  </div>`;
}

function renderEstilosJuegoCOM(player) {
  const active = COM_PLAYING_STYLES.filter(s => player[s.col] === 'True');
  const content = active.length
    ? `<div class="skill-items-list">${active.map(s => `<div class="skill-item-row">${s.label}</div>`).join('')}</div>`
    : `<div class="skill-items-list"><div class="skill-item-row skill-item-empty">-</div></div>`;
  return `<div class="player-section">
    <div class="player-section-title">Estilos de juego COM</div>
    ${content}
  </div>`;
}

function appearanceImagePath(imageKey, value) {
  if (imageKey === 'boots') return `img/boots/${value}.png`;
  if (imageKey === 'gloves') return `img/appearance/gloves/${value}.png`;
  return `img/appearance/${imageKey}/${value}.png`;
}

function renderAppearanceField(field, appearance, player) {
  const source = field.source === 'player' ? player : appearance;
  const rawVal = source ? (source[field.col] !== undefined ? source[field.col] : '') : '';

  // Conditional dash: show '-' when a dependency column matches a specific value
  if (field.conditionalDash) {
    const depVal = appearance ? (appearance[field.conditionalDash.col] || '') : '';
    if (depVal === field.conditionalDash.value) {
      return renderAppearanceRow(field.label, '-', null, null);
    }
  }

  // gkOnly: show '-' if player is not a GK (POS index 0 = GK)
  if (field.gkOnly) {
    const posIdx = parseInt(player ? (player['POS'] || '') : '', 10);
    if (isNaN(posIdx) || posIdx !== 0) {
      return renderAppearanceRow(field.label, '-', null, null);
    }
  }

  // notApplicableWhen: show '*' when a dependency column matches a specific value
  if (field.notApplicableWhen) {
    const depVal = appearance ? (appearance[field.notApplicableWhen.col] || '') : '';
    if (depVal === field.notApplicableWhen.value) {
      return renderAppearanceRow(field.label, '*', null, null);
    }
  }

  // conditionalLabel: show a specific label when rawVal matches the given value (takes priority over imageKey)
  if (field.conditionalLabel && rawVal === field.conditionalLabel.value) {
    return renderAppearanceRow(field.label, field.conditionalLabel.label, null, null);
  }

  // zeroLabel: show a custom label (e.g. "No") when value is '0'
  if (field.zeroLabel !== undefined && rawVal === '0') {
    return renderAppearanceRow(field.label, field.zeroLabel, null, null);
  }

  // dashIfZero: show '-' if value is '0'
  if (field.dashIfZero && rawVal === '0') {
    return renderAppearanceRow(field.label, '-', null, null);
  }

  const displayVal = rawVal !== undefined && rawVal !== '' ? rawVal : '-';

  // Enum translation
  if (field.enum) {
    const translated = field.enum[rawVal];
    const label = translated !== undefined ? translated : displayVal;
    return renderAppearanceRow(field.label, label, null, null);
  }

  // imageKey: always show image for the field when value is present
  if (field.imageKey && rawVal) {
    const imgPath = appearanceImagePath(field.imageKey, rawVal);
    return renderAppearanceRow(field.label, rawVal, imgPath, field.imageKey);
  }

  // showImageIf: show image only when value is non-zero and non-empty (e.g. Side/Back - Cropped)
  if (field.showImageIf && rawVal && rawVal !== '0') {
    const imgPath = appearanceImagePath(field.imageKey, rawVal);
    return renderAppearanceRow(field.label, rawVal, imgPath, field.imageKey);
  }

  const numVal = Number(displayVal);
  const isNumeric = !isNaN(numVal) && displayVal !== '' && displayVal !== '-';
  let formattedVal;
  if (isNumeric && !field.noPlus) {
    formattedVal = numVal >= 0 ? '+' + numVal : String(numVal);
  } else {
    formattedVal = displayVal;
  }
  return renderAppearanceRow(field.label, formattedVal, null, null);
}

function renderAppearanceRow(label, value, imgPath, imageKey) {
  let valueHtml;
  if (imgPath) {
    const fallback = `img/appearance/placeholder.png`;
    valueHtml = `<span class="face-data-value face-data-with-img">
      <img class="appearance-thumb" src="${imgPath}"
        onerror="this.onerror=null;this.src='${fallback}'"
        alt="${imageKey || ''}" title="${value}">
      <span class="appearance-thumb-val">${value}</span>
    </span>`;
  } else {
    const VALUE_EXTRA_CLASS = { '-': ' face-data-dash', '*': ' face-data-na' };
    const extraClass = VALUE_EXTRA_CLASS[value] || '';
    valueHtml = `<span class="face-data-value${extraClass}">${value}</span>`;
  }
  return `<div class="face-data-row">
    <span class="face-data-label">${label}</span>
    ${valueHtml}
  </div>`;
}

function renderFaceData(appearance, player) {
  if (!appearance && !player) {
    return `<div class="appearance-empty">No hay datos de apariencia para este jugador.</div>`;
  }

  // Check if the player has a scanned face (Id_Face ≠ 0)
  const idFace = appearance ? (appearance['Id_Face'] || '0') : '0';
  const hasScannedFace = idFace !== '0' && idFace !== '';

  // When player has a scanned face: hide Cara and Peinado sections,
  // show a notice, and only render Físico, Forma de vestir, Movimiento.
  const sectionsToShow = hasScannedFace
    ? APPEARANCE_SECTIONS.slice(2)
    : APPEARANCE_SECTIONS;

  const scannedNoticeHtml = hasScannedFace
    ? `<div class="scanned-face-notice">
        <span class="scanned-face-icon">✅</span>
        Este jugador tiene una cara escaneada.
      </div>`
    : '';

  const navButtons = sectionsToShow.map((section, i) =>
    `<button class="appearance-section-btn${i === 0 ? ' active' : ''}" onclick="switchAppearanceSection(${i})">${section.title}</button>`
  ).join('');

  const sectionsHtml = sectionsToShow.map((section, i) => {
    const subsectionsHtml = section.subsections.map(sub => {
      const fieldsHtml = sub.fields
        .map(field => renderAppearanceField(field, appearance, player))
        .join('');
      if (!fieldsHtml) return '';
      const subTitle = sub.title
        ? `<div class="face-subsection-title">${sub.title}</div>`
        : '';
      return `<div class="face-subsection">${subTitle}<div class="face-data-grid">${fieldsHtml}</div></div>`;
    }).join('');

    if (!subsectionsHtml) return '';
    return `<div class="face-section${i === 0 ? ' active' : ''}" id="appearance-section-${i}">
      ${subsectionsHtml}
    </div>`;
  }).join('');

  return `${scannedNoticeHtml}
<div class="appearance-section-nav">${navButtons}</div>
<div class="appearance-section-panels">${sectionsHtml}</div>`;
}

// ─── Tab switching ────────────────────────────────────────────────────────────

function switchAppearanceSection(idx) {
  document.querySelectorAll('.appearance-section-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === idx);
  });
  document.querySelectorAll('.face-section').forEach((panel, i) => {
    panel.classList.toggle('active', i === idx);
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.profile-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.profile-tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === tabId);
  });
}

// ─── Main render ─────────────────────────────────────────────────────────────

function renderPositionPitch(player) {
  const rawPos = player['POS'] || '';
  const posIdx = parseInt(rawPos, 10);
  const primaryPos = /^\d+$/.test(rawPos) && posIdx >= 0 && posIdx < PES_POSITIONS.length
    ? PES_POSITIONS[posIdx] : rawPos;

  const markers = [];

  PES_POSITIONS.forEach(pos => {
    const coords = POSITION_FIELD_COORDS[pos];
    if (!coords) return;

    const val = parseInt(player[pos], 10);
    const color = positionGroupColor(pos);
    const isPrimary = pos === primaryPos;

    let bgStyle, borderStyle, textColor, zIdx;

    if (isNaN(val)) {
      // No rating data – show very faintly
      bgStyle = 'background:rgba(0,0,0,0.25)';
      borderStyle = `border-color:rgba(255,255,255,0.12)`;
      textColor = 'rgba(255,255,255,0.25)';
      zIdx = 1;
    } else if (val === 0) {
      // Grade C – transparent fill, visible border and text
      bgStyle = 'background:transparent';
      borderStyle = `border-color:${color}`;
      textColor = color;
      zIdx = 3;
    } else if (val === 1) {
      // Grade B – medium opacity fill
      bgStyle = `background:${hexToRgba(color, 0.40)}`;
      borderStyle = `border-color:${color}`;
      textColor = color;
      zIdx = 4;
    } else {
      // Grade A – fully filled
      bgStyle = `background:${color}`;
      borderStyle = `border-color:${color}`;
      textColor = '#111';
      zIdx = 5;
    }

    if (isPrimary && !isNaN(val)) zIdx = 10;

    markers.push(`
      <div class="field-pos-marker" style="${bgStyle};${borderStyle};color:${textColor};z-index:${zIdx}${isPrimary && !isNaN(val) ? ';box-shadow:0 0 6px rgba(0,0,0,0.5)' : ''};left:${coords.left}%;top:${coords.top}%">
        <span class="field-pos-label">${pos}</span>
      </div>`);
  });

  if (!markers.length) return '';

  return `
    <div class="player-section" style="margin-bottom:0">
      <div class="player-section-title">Posiciones en el campo</div>
      <div class="position-field-wrap">
        <div class="position-field">
          <div class="position-field-line pf-halfway"></div>
          <div class="position-field-line pf-penalty-bottom"></div>
          <div class="position-field-line pf-goal-bottom"></div>
          <div class="position-field-line pf-penalty-top"></div>
          <div class="position-field-line pf-goal-top"></div>
          <div class="position-field-center-circle"></div>
          ${markers.join('')}
        </div>
      </div>
    </div>`;
}

function renderPlayerPage(player, team, appearance, typeLabel, playsForNational) {
  const ovrColor = statColor(player['OverallStats'] || '');
  const ovrTextColor = statTextColor(ovrColor);
  const ovr = player['OverallStats'] || '–';

  const rawPos = player['POS'] || '';
  const posIdx = parseInt(rawPos, 10);
  const pesPosition = /^\d+$/.test(rawPos) && posIdx >= 0 && posIdx < PES_POSITIONS.length
    ? PES_POSITIONS[posIdx]
    : rawPos;
  const posDisplay = translatePosition(pesPosition);

  const radarAttrs = computeRadarAttributes(player);

  const footVal = player['Foot'];
  let footDisplay;
  if (footVal === 'True') footDisplay = 'Izquierdo';
  else if (footVal === 'False') footDisplay = 'Derecho';
  else footDisplay = footVal || '–';

  const statsHtml = `
    <div class="profile-stats-layout">
      <div class="profile-stats-left">
        <div class="stats-section-title">Posiciones</div>
        ${renderPositionPitch(player)}
      </div>
      <div class="profile-stats-right">
        ${renderHabilidades(player)}
        ${renderEstiloDeJuego(player)}
        ${renderHabilidadesJugador(player)}
        ${renderEstilosJuegoCOM(player)}
      </div>
    </div>`;

  const appearanceHtml = renderFaceData(appearance, player);

  const content = document.getElementById('player-content');
  content.innerHTML = `
    <button class="back-btn" onclick="goBack()">◀ Volver</button>

    <div class="player-profile-page">

      <!-- Header card -->
      <div class="profile-header-card">
        <img class="profile-photo"
          src="img/players/${player['Id']}.png"
          onerror="handleMinifaceError(this,'${player['Id']}')"
          alt="${player['Name']}">
        <div class="profile-header-info">
          <div class="profile-name">${player['Name'] || 'Jugador desconocido'}</div>
          <div class="profile-badges">
            <span class="position-badge" style="color:${positionGroupColor(pesPosition)};border-color:${positionGroupColor(pesPosition)};background:${positionGroupColor(pesPosition)}18">${posDisplay || '–'}</span>
            <span class="overall-badge" style="background:${ovrColor};color:${ovrTextColor}">${ovr}</span>
          </div>
          <div class="profile-meta-row">
            <img src="${flagSrc(player['Country'])}"
              onerror="this.onerror=null;this.src='img/flags/default.png'"
              alt="" class="profile-flag">
            <span>${nationalityName(player['Country'])}</span>
          </div>
          <div class="profile-meta-row">
            <img class="team-crest-sm"
              src="img/teams/${team.id}.png"
              onerror="this.onerror=null;this.src='img/teams/default.png'"
              alt="${team.displayName}">
            <span>${team.displayName}</span>
          </div>
          <div class="profile-meta-row">
            <span>${typeLabel}</span>
          </div>
          ${playsForNational ? `<div class="national-team-note">🌍 También juega para su selección.</div>` : ''}
          <div class="profile-quick-stats">
            <div class="quick-stat"><span class="qs-label">Altura</span><span class="qs-val">${player['Height'] || '–'} cm</span></div>
            <div class="quick-stat"><span class="qs-label">Peso</span><span class="qs-val">${player['Weight'] || '–'} kg</span></div>
            <div class="quick-stat"><span class="qs-label">Edad</span><span class="qs-val">${player['Age'] || '–'}</span></div>
            <div class="quick-stat"><span class="qs-label">Pie</span><span class="qs-val">${footDisplay}</span></div>
          </div>
        </div>
        <div class="profile-radar-wrap">
          <canvas id="radar-canvas" width="220" height="220"></canvas>
        </div>
      </div>

      <!-- Tabs -->
      <div class="profile-tabs">
        <div class="profile-tab-bar">
          <button class="profile-tab-btn active" data-tab="tab-stats" onclick="switchTab('tab-stats')">Estadísticas</button>
          <button class="profile-tab-btn" data-tab="tab-appearance" onclick="switchTab('tab-appearance')">Apariencia</button>
        </div>

        <div id="tab-stats" class="profile-tab-panel active">
          ${statsHtml}
        </div>

        <div id="tab-appearance" class="profile-tab-panel">
          <div class="appearance-info">
            Estos valores definen el aspecto del jugador en el editor del juego.
          </div>
          ${appearanceHtml}
        </div>
      </div>

    </div>`;

  content.style.display = 'block';
  document.getElementById('loading-overlay').style.display = 'none';

  // Update page title
  document.title = `${player['Name'] || 'Jugador'} – Base de datos PES`;

  requestAnimationFrame(() => drawRadar('radar-canvas', radarAttrs));
}

// ─── Back navigation ─────────────────────────────────────────────────────────

function goBack() {
  if (document.referrer && new URL(document.referrer).hostname === window.location.hostname) {
    history.back();
  } else {
    window.location.href = 'index.html';
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  const params = new URLSearchParams(window.location.search);
  const playerId = params.get('id');
  const teamId = params.get('team');

  if (!playerId || !teamId) {
    showError('Faltan el ID del jugador o del equipo en la URL.');
    return;
  }

  // Load all global CSV files in parallel
  const [playersText, teamsText, squadsText, appearancesText] = await Promise.all([
    fetchText('database/All players exported.csv'),
    fetchText('database/All teams exported.csv'),
    fetchText('database/All squads exported.csv'),
    fetchText('database/All appeaarances exported.csv'),
  ]);

  if (!playersText || !teamsText) {
    showError('Error al cargar los archivos de la base de datos.');
    return;
  }

  const { rows: playerRows } = parseCSV(playersText);
  const { rows: teamRows } = parseCSV(teamsText);
  const { rows: appearanceRows } = appearancesText ? parseCSV(appearancesText) : { rows: [] };
  const { rows: squadRows } = squadsText ? parseCSV(squadsText) : { rows: [] };

  // Find the player
  const player = playerRows.find(p => p['Id'] === playerId);
  if (!player) {
    showError(`Jugador con ID "${playerId}" no encontrado en la base de datos.`);
    return;
  }

  // Find the team
  const teamRow = teamRows.find(t => t['Id'] === teamId);
  if (!teamRow) {
    showError(`Equipo con ID "${teamId}" no encontrado en la base de datos.`);
    return;
  }

  const team = {
    id: teamId,
    displayName: teamRow['Name'] || teamId,
    type: teamRow['Type'] || '0',
  };
  const typeLabel = TYPE_LABELS[team.type] || '';

  // Build appearance map and find this player's appearance data
  const appearanceMap = {};
  appearanceRows.forEach(a => {
    const pid = a['Id'];
    if (pid) appearanceMap[pid] = a;
  });
  const appearance = appearanceMap[playerId] || null;

  // Check if player also plays for a national team (type '2')
  const teamTypeMap = {};
  teamRows.forEach(t => { teamTypeMap[t['Id']] = t['Type'] || '0'; });
  const currentTeamType = teamTypeMap[teamId] || '0';
  let playsForNational = false;
  if (currentTeamType !== '2') {
    // Player is on a club/special team — check if they're also on any national team squad
    for (const squadRow of squadRows) {
      const sqTeamId = squadRow['Id'];
      if (sqTeamId === teamId) continue;
      if ((teamTypeMap[sqTeamId] || '0') !== '2') continue;
      // This is a national team squad
      for (let i = 1; i <= 32; i++) {
        if (squadRow[`Player ${i}`] === playerId) {
          playsForNational = true;
          break;
        }
      }
      if (playsForNational) break;
    }
  }

  renderPlayerPage(player, team, appearance, typeLabel, playsForNational);
}

// ─── Error display ────────────────────────────────────────────────────────────

function showError(message) {
  document.getElementById('loading-overlay').style.display = 'none';
  const content = document.getElementById('player-content');
  content.textContent = '';

  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = message;

  const backLink = document.createElement('p');
  backLink.style.marginTop = '16px';
  const anchor = document.createElement('a');
  anchor.href = 'index.html';
  anchor.style.color = 'var(--color-highlight)';
  anchor.textContent = '← Volver a la base de datos';
  backLink.appendChild(anchor);

  content.appendChild(errorDiv);
  content.appendChild(backLink);
  content.style.display = 'block';
}

// ─── Entry point ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  boot().catch(err => {
    showError(`Error inesperado: ${err.message}`);
    console.error(err);
  });
});
