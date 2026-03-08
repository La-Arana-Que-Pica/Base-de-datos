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
  if (isNaN(v)) return 'stat-red';
  if (v >= 75) return 'stat-green';
  if (v >= 60) return 'stat-yellow';
  return 'stat-red';
}

function statColor(value) {
  const v = parseInt(value, 10);
  if (isNaN(v)) return '#e74c3c';
  if (v >= 75) return '#27ae60';
  if (v >= 60) return '#f39c12';
  return '#e74c3c';
}

function overallColor(value) {
  const v = parseInt(value, 10);
  if (isNaN(v)) return 'stat-red';
  if (v >= 80) return 'stat-green';
  if (v >= 70) return 'stat-yellow';
  return 'stat-red';
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

// ─── Constants ────────────────────────────────────────────────────────────────

const PES_POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'SS', 'CF'];

// Position rating columns (same order as PES_POSITIONS)
const POSITION_RATING_COLS = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'SS', 'CF'];

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

// Face / physique appearance columns
const FACE_GROUPS = [
  {
    title: 'Físico',
    cols: [
      'Neck Length', 'Neck Size', 'Shoulder Height', 'Shoulder Width',
      'Chest Measurement', 'Waist Size', 'Arm Size', 'Thigh Size',
      'Calf Size', 'Leg Length', 'Arm Length', 'Skin Colour',
    ],
  },
  {
    title: 'Cabeza',
    cols: [
      'Head Length', 'Head Width', 'Head Depth',
      'Face Height', 'Face Size', 'Forehead',
    ],
  },
  {
    title: 'Ojos',
    cols: [
      'Upper Eyelid Type', 'Bottom Eyelid Type', 'Eye Height',
      'Horizontal Eye Position', 'Iris Colour', 'Pupil Size',
      'Upper Eyelid Ht. (Inner)', 'Upper Eyelid Wd. (Inner)',
      'Upper Eyelid Ht. (Outer)', 'Upper Eyelid Wd. (Outer)',
      'Inner Eye Height', 'Inner Eye Position', 'Eye Corner Height',
      'Outer Eye Position', 'Bottom Eyelid Height ', 'Eye Depth',
    ],
  },
  {
    title: 'Cejas',
    cols: [
      'Eyebrow Type', 'Eyebrow Thickness', 'Eyebrow Style', 'Eyebrow Density',
      'Eyebrow Colour R', 'Eyebrow Colour G', 'Eyebrow Colour B',
      'Inner Eyebrow Height', 'Brow Width', 'Outer Edyebrow Height',
      'Temple Width', 'Eyebrow Depth',
    ],
  },
  {
    title: 'Nariz',
    cols: [
      'Nose Type', 'Laughter Lines', 'Nose Height', 'Nostril Width',
      'Nose Width', 'Nose Tip Depth', 'Nose Depth',
    ],
  },
  {
    title: 'Boca',
    cols: [
      'Upper Lip Type', 'Lower Lip Type', 'Mouth Position',
      'Lip Size', 'Lip Width', 'Mouth Corner Height', 'Mouth Depth',
    ],
  },
  {
    title: 'Rasgos faciales',
    cols: [
      'Facial Hair Type', 'Facial Hair Colour R', 'Facial Hair Colour G', 'Facial Hair Colour B',
      'Thickness', 'Cheek Type', 'Neck Line Type', 'Cheekbones',
      'Chin Height', 'Chin Width', 'Jaw Height', 'Jawline', 'Chin Depth',
      'Ear Length', 'Ear Width', 'Ear Angle',
    ],
  },
  {
    title: 'Cabello',
    cols: [
      'Overall - Style', 'Overall - Length', 'Overall - Wave Level', 'Overall - Hair Variation',
      'Font - Style', 'Font - Parted', 'Font - Hairline', 'Font - Forehead Width',
      'Side/Back - Style', 'Side/Back - Cropped',
      'Hair Colour R', 'Hair Colour G', 'Hair Colour B', 'Accessory Colour', 'Hair Colour',
    ],
  },
  {
    title: 'Equipación y accesorios',
    cols: [
      'Accessories', 'Wrist taping', 'Wrist Tape Colou', 'Ankle Taping',
      'Player Gloves', 'Colour', 'Undershorts', 'Sleeves',
      'Shirttail', 'Sock Length', 'Long-Sleeved Inners',
      'Boots', 'Gloves',
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
  const MAX_VAL = 99;
  const labels = Object.keys(attrs);
  const values = Object.values(attrs);
  const n = labels.length;

  ctx.clearRect(0, 0, W, H);

  // Grid rings (5 levels)
  const ringLevels = [20, 40, 60, 80, 99];
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
    // Ring value label at top
    ctx.font = '9px Segoe UI, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(String(ringLevels[ring - 1]), cx, cy - r - 2);
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

  // Data polygon fill
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const r = (values[i] / MAX_VAL) * maxR;
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
    const r = (values[i] / MAX_VAL) * maxR;
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

  // Labels: "LABEL\nVAL" outside each axis
  ctx.textAlign = 'center';
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const labelR = maxR + 26;
    const lx = cx + labelR * Math.cos(angle);
    const ly = cy + labelR * Math.sin(angle);

    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    ctx.fillStyle = '#eaeaea';
    ctx.textBaseline = 'middle';
    ctx.fillText(labels[i], lx, ly - 6);

    ctx.font = 'bold 12px "Segoe UI", sans-serif';
    ctx.fillStyle = '#e74c3c';
    ctx.fillText(String(values[i]), lx, ly + 8);
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
    const barColor = v >= max * 0.75 ? '#27ae60' : v >= max * 0.5 ? '#f39c12' : '#e74c3c';
    const colorClass = v >= max * 0.75 ? 'stat-green' : v >= max * 0.5 ? 'stat-yellow' : 'stat-red';
    return `<div class="stat-row">
      <span class="stat-name">${label}</span>
      <span class="stat-value ${colorClass}">${v}</span>
      <div class="stat-bar-container">
        <div class="stat-bar" style="width:${pct}%;background:${barColor}"></div>
      </div>
    </div>`;
  }
  // Normal stat: scale bar from STAT_MIN to STAT_MAX
  const colorClass = statColorClass(value);
  const barColor = statColor(value);
  const pct = Math.max(0, Math.min(100, ((v - STAT_MIN) / (STAT_MAX - STAT_MIN)) * 100));
  return `<div class="stat-row">
    <span class="stat-name">${label}</span>
    <span class="stat-value ${colorClass}">${value || '–'}</span>
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
  const styleName = PLAYING_STYLE_LABELS[val] || (val ? `Estilo ${val}` : '–');
  return `<div class="player-section">
    <div class="player-section-title">Estilo de juego</div>
    <div class="skill-items-list">
      <div class="skill-item-row">${styleName}</div>
    </div>
  </div>`;
}

function renderHabilidadesJugador(player) {
  const active = PLAYER_SKILLS.filter(s => player[s.col] === 'True');
  const content = active.length
    ? `<div class="skill-items-list">${active.map(s => `<div class="skill-item-row">${s.label}</div>`).join('')}</div>`
    : `<div class="skills-empty">Sin habilidades especiales</div>`;
  return `<div class="player-section">
    <div class="player-section-title">Habilidades de jugador</div>
    ${content}
  </div>`;
}

function renderEstilosJuegoCOM(player) {
  const active = COM_PLAYING_STYLES.filter(s => player[s.col] === 'True');
  const content = active.length
    ? `<div class="skill-items-list">${active.map(s => `<div class="skill-item-row">${s.label}</div>`).join('')}</div>`
    : `<div class="skills-empty">Sin estilos COM asignados</div>`;
  return `<div class="player-section">
    <div class="player-section-title">Estilos de juego COM</div>
    ${content}
  </div>`;
}

function renderFaceData(appearance) {
  if (!appearance) {
    return `<div class="appearance-empty">No hay datos de apariencia para este jugador.</div>`;
  }
  return FACE_GROUPS.map(group => {
    const rows = group.cols
      .filter(col => appearance[col] !== undefined && appearance[col] !== '')
      .map(col => `<div class="face-data-row">
        <span class="face-data-label">${col}</span>
        <span class="face-data-value">${appearance[col]}</span>
      </div>`)
      .join('');
    if (!rows) return '';
    return `<div class="face-group">
      <div class="face-group-title">${group.title}</div>
      <div class="face-data-grid">${rows}</div>
    </div>`;
  }).join('');
}

// ─── Tab switching ────────────────────────────────────────────────────────────

function switchTab(tabId) {
  document.querySelectorAll('.profile-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.profile-tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === tabId);
  });
}

// ─── Main render ─────────────────────────────────────────────────────────────

function renderPlayerPage(player, team, appearance, typeLabel) {
  const ovrClass = overallColor(player['OverallStats'] || '');
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
        <div class="stats-section-title">Valoraciones por posición</div>
        ${renderPositionGrid(player)}
        <div class="radar-card" style="margin-top:20px">
          <h3>Radar de atributos</h3>
          <canvas id="radar-canvas" width="260" height="260"></canvas>
        </div>
      </div>
      <div class="profile-stats-right">
        ${renderHabilidades(player)}
        ${renderEstiloDeJuego(player)}
        ${renderHabilidadesJugador(player)}
        ${renderEstilosJuegoCOM(player)}
      </div>
    </div>`;

  const appearanceHtml = renderFaceData(appearance);

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
            <span class="position-badge">${posDisplay || '–'}</span>
            <span class="overall-badge ${ovrClass}">${ovr}</span>
          </div>
          <div class="profile-meta-row">
            <img src="${flagSrc(player['Country'])}"
              onerror="this.onerror=null;this.src='img/flags/default.png'"
              alt="" class="profile-flag">
            <span>${player['Country'] || '–'}</span>
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
          <div class="profile-quick-stats">
            <div class="quick-stat"><span class="qs-label">Altura</span><span class="qs-val">${player['Height'] || '–'} cm</span></div>
            <div class="quick-stat"><span class="qs-label">Peso</span><span class="qs-val">${player['Weight'] || '–'} kg</span></div>
            <div class="quick-stat"><span class="qs-label">Edad</span><span class="qs-val">${player['Age'] || '–'}</span></div>
            <div class="quick-stat"><span class="qs-label">Pie</span><span class="qs-val">${footDisplay}</span></div>
          </div>
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

  renderPlayerPage(player, team, appearance, typeLabel);
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
