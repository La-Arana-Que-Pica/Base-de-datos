/**
 * Base de datos Option File PES 2018–2026
 * Player Profile Page Script
 *
 * Loads a single player's full data from URL params:
 *   player.html?id=PLAYERID&team=TEAMFOLDER
 */

'use strict';

// ─── Utilities (shared logic from app.js) ─────────────────────────────────────

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

async function fetchJSON(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.json();
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

// ─── Constants ────────────────────────────────────────────────────────────────

const PES_POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'SS', 'CF'];

// Position rating columns (from the positional ability columns in the CSV)
const POSITION_RATING_COLS = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'SS', 'CF'];

// All ability stat columns grouped by category (all numeric 0–99 stats)
const ABILITY_GROUPS = [
  {
    title: 'Attack',
    cols: [
      'Attacking Prowess', 'Ball Control', 'Dribbling',
      'Low Pass', 'Lofted Pass', 'Finishing',
      'Place Kicking', 'Controlled Spin', 'Header',
    ],
  },
  {
    title: 'Physical',
    cols: [
      'Kicking Power', 'Speed', 'Explosive Power',
      'Body Control', 'Physical Contact', 'Jump', 'Stamina',
    ],
  },
  {
    title: 'Defence',
    cols: ['Defensive Prowess', 'Ball Winning'],
  },
  {
    title: 'Goalkeeping',
    cols: ['Goalkeeping', 'Catching', 'Clearing', 'Reflexes', 'Coverage'],
  },
  {
    title: 'Form & Fitness',
    cols: ['Weak Foot Usage', 'Weak Foot Acc.', 'Form', 'Injury Resistance'],
  },
];

// Skill columns (P01–P07 = position presets, S01–S28 = special skills)
const SKILL_COLS = [
  'P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07',
  'S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08',
  'S09', 'S10', 'S11', 'S12', 'S13', 'S14', 'S15', 'S16',
  'S17', 'S18', 'S19', 'S20', 'S21', 'S22', 'S23', 'S24',
  'S25', 'S26', 'S27', 'S28',
];

// Face / physique appearance columns (unique to the appearence CSV)
// These follow after the duplicate 'Id' column in the appearence CSV.
const FACE_GROUPS = [
  {
    title: 'Physique',
    cols: [
      'Neck Length', 'Neck Size', 'Shoulder Height', 'Shoulder Width',
      'Chest Measurement', 'Waist Size', 'Arm Size', 'Thigh Size',
      'Calf Size', 'Leg Length', 'Arm Length', 'Skin Colour',
    ],
  },
  {
    title: 'Head',
    cols: [
      'Head Length', 'Head Width', 'Head Depth',
      'Face Height', 'Face Size', 'Forehead',
    ],
  },
  {
    title: 'Eyes',
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
    title: 'Eyebrows',
    cols: [
      'Eyebrow Type', 'Eyebrow Thickness', 'Eyebrow Style', 'Eyebrow Density',
      'Eyebrow Colour R', 'Eyebrow Colour G', 'Eyebrow Colour B',
      'Inner Eyebrow Height', 'Brow Width', 'Outer Edyebrow Height',
      'Temple Width', 'Eyebrow Depth',
    ],
  },
  {
    title: 'Nose',
    cols: [
      'Nose Type', 'Laughter Lines', 'Nose Height', 'Nostril Width',
      'Nose Width', 'Nose Tip Depth', 'Nose Depth',
    ],
  },
  {
    title: 'Mouth',
    cols: [
      'Upper Lip Type', 'Lower Lip Type', 'Mouth Position',
      'Lip Size', 'Lip Width', 'Mouth Corner Height', 'Mouth Depth',
    ],
  },
  {
    title: 'Face Features',
    cols: [
      'Facial Hair Type', 'Facial Hair Colour R', 'Facial Hair Colour G', 'Facial Hair Colour B',
      'Thickness', 'Cheek Type', 'Neck Line Type', 'Cheekbones',
      'Chin Height', 'Chin Width', 'Jaw Height', 'Jawline', 'Chin Depth',
      'Ear Length', 'Ear Width', 'Ear Angle',
    ],
  },
  {
    title: 'Hair',
    cols: [
      'Overall - Style', 'Overall - Length', 'Overall - Wave Level', 'Overall - Hair Variation',
      'Font - Style', 'Font - Parted', 'Font - Hairline', 'Font - Forehead Width',
      'Side/Back - Style', 'Side/Back - Cropped',
      'Hair Colour R', 'Hair Colour G', 'Hair Colour B', 'Accessory Colour', 'Hair Colour',
    ],
  },
  {
    title: 'Kit & Accessories',
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
    SHT: avg('Finishing', 'Attacking Prowess'),
    PHY: avg('Physical Contact'),
    DEF: avg('Defensive Prowess'),
    SPD: avg('Speed'),
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
  const maxR = Math.min(cx, cy) - 30;
  const MAX_VAL = 99;
  const labels = Object.keys(attrs);
  const values = Object.values(attrs);
  const n = labels.length;

  ctx.clearRect(0, 0, W, H);

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
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle));
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const r = (values[i] / MAX_VAL) * maxR;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(233, 69, 96, 0.3)';
  ctx.fill();
  ctx.strokeStyle = '#e94560';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const r = (values[i] / MAX_VAL) * maxR;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, 2 * Math.PI);
    ctx.fillStyle = '#e94560';
    ctx.fill();
  }

  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const labelR = maxR + 18;
    const x = cx + labelR * Math.cos(angle);
    const y = cy + labelR * Math.sin(angle);
    ctx.font = 'bold 11px Segoe UI, sans-serif';
    ctx.fillStyle = '#eaeaea';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labels[i], x, y);

    const valY = cy + (labelR + 12) * Math.sin(angle);
    ctx.font = '10px Segoe UI, sans-serif';
    ctx.fillStyle = '#e94560';
    ctx.fillText(values[i], x, valY);
  }
}

// ─── Rendering helpers ────────────────────────────────────────────────────────

function renderStatRow(label, value) {
  const colorClass = statColorClass(value);
  const barColor = statColor(value);
  const pct = Math.min(100, parseInt(value, 10) || 0);
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
    const colorClass = isNaN(val) ? '' : statColorClass(val);
    return `<div class="pos-rating-cell">
      <div class="pos-rating-label">${pos}</div>
      <div class="pos-rating-value ${colorClass}">${isNaN(val) ? '–' : val}</div>
    </div>`;
  }).join('');
  return `<div class="pos-rating-grid">${cells}</div>`;
}

function renderAbilityGroups(player) {
  return ABILITY_GROUPS.map(group => {
    // Only render groups that have at least one non-empty column
    const rows = group.cols
      .filter(col => player[col] !== undefined && player[col] !== '')
      .map(col => renderStatRow(col, player[col]))
      .join('');
    if (!rows) return '';
    return `<div class="stats-group">
      <div class="stats-group-title">${group.title}</div>
      <div class="stats-list">${rows}</div>
    </div>`;
  }).join('');
}

function renderFaceData(appearance) {
  if (!appearance) {
    return `<div class="appearance-empty">No appearance data available for this player.</div>`;
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

function renderPlayerPage(player, team, appearance, leagueName) {
  const ovrClass = overallColor(player['OverallStats'] || player.OverallStats || '');
  const ovr = player['OverallStats'] || '–';

  const rawPos = player['POS'] || '';
  const posIdx = parseInt(rawPos, 10);
  const position = /^\d+$/.test(rawPos) && posIdx >= 0 && posIdx < PES_POSITIONS.length
    ? PES_POSITIONS[posIdx]
    : rawPos;

  const radarAttrs = computeRadarAttributes(player);

  const statsHtml = `
    <div class="profile-stats-layout">
      <div class="profile-stats-left">
        <div class="stats-section-title">Position Ratings</div>
        ${renderPositionGrid(player)}
        <div class="radar-card" style="margin-top:20px">
          <h3>Attribute Radar</h3>
          <canvas id="radar-canvas" width="240" height="240"></canvas>
        </div>
      </div>
      <div class="profile-stats-right">
        ${renderAbilityGroups(player)}
      </div>
    </div>`;

  const appearanceHtml = renderFaceData(appearance);

  const content = document.getElementById('player-content');
  content.innerHTML = `
    <button class="back-btn" onclick="goBack()">◀ Back</button>

    <div class="player-profile-page">

      <!-- Header card -->
      <div class="profile-header-card">
        <img class="profile-photo"
          src="img/players/${player['Id']}.png"
          onerror="this.onerror=null;this.src='img/players/default.png'"
          alt="${player['Name']}">
        <div class="profile-header-info">
          <div class="profile-name">${player['Name'] || 'Unknown Player'}</div>
          <div class="profile-badges">
            <span class="position-badge">${position || '–'}</span>
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
              src="img/teams/${team.folder}.png"
              onerror="this.onerror=null;this.src='img/teams/default.png'"
              alt="${team.displayName}">
            <span>${team.displayName}</span>
          </div>
          <div class="profile-meta-row">
            <img class="sidebar-league-logo"
              src="img/leagues/${team.leagueId || 'default'}.png"
              onerror="this.onerror=null;this.src='img/leagues/default.png'"
              alt="${leagueName}">
            <span>${leagueName}</span>
          </div>
          <div class="profile-quick-stats">
            <div class="quick-stat"><span class="qs-label">Height</span><span class="qs-val">${player['Height'] || '–'} cm</span></div>
            <div class="quick-stat"><span class="qs-label">Weight</span><span class="qs-val">${player['Weight'] || '–'} kg</span></div>
            <div class="quick-stat"><span class="qs-label">Age</span><span class="qs-val">${player['Age'] || '–'}</span></div>
            <div class="quick-stat"><span class="qs-label">Foot</span><span class="qs-val">${player['Foot'] === 'True' ? 'Left' : player['Foot'] === 'False' ? 'Right' : (player['Foot'] || '–')}</span></div>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="profile-tabs">
        <div class="profile-tab-bar">
          <button class="profile-tab-btn active" data-tab="tab-stats" onclick="switchTab('tab-stats')">Stats</button>
          <button class="profile-tab-btn" data-tab="tab-appearance" onclick="switchTab('tab-appearance')">Appearance</button>
        </div>

        <div id="tab-stats" class="profile-tab-panel active">
          ${statsHtml}
        </div>

        <div id="tab-appearance" class="profile-tab-panel">
          <div class="appearance-info">
            These values define the player's face and body in the game editor.
          </div>
          ${appearanceHtml}
        </div>
      </div>

    </div>`;

  content.style.display = 'block';
  document.getElementById('loading-overlay').style.display = 'none';

  // Update page title
  document.title = `${player['Name'] || 'Player'} – PES Database`;

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
  const teamFolder = params.get('team');

  if (!playerId || !teamFolder) {
    showError('Missing player ID or team in URL. Use player.html?id=ID&team=FOLDER');
    return;
  }

  // Load leagues
  const leaguesMap = {};
  const leagueText = await fetchText('database/leagues/leagues.csv');
  if (leagueText) {
    const { rows } = parseCSV(leagueText);
    rows.forEach(row => {
      leaguesMap[row.league_id] = row;
    });
  }

  // Load teams manifest
  const manifest = await fetchJSON('database/teams/index.json');
  if (!manifest || !Array.isArray(manifest.teams)) {
    showError('Failed to load teams manifest.');
    return;
  }

  const teamMeta = manifest.teams.find(t => t.folder === teamFolder);
  if (!teamMeta) {
    showError(`Team "${teamFolder}" not found in manifest.`);
    return;
  }

  const { folder, files } = teamMeta;
  const displayName = teamMeta.displayName || folder;
  const base = `database/teams/${folder}`;

  const [playersText, appearenceText, teamText] = await Promise.all([
    files.players ? fetchText(`${base}/${files.players}`) : null,
    files.appearence ? fetchText(`${base}/${files.appearence}`) : null,
    files.team ? fetchText(`${base}/${files.team}`) : null,
  ]);

  if (!playersText) {
    showError(`Could not load player data for team "${displayName}".`);
    return;
  }

  const { rows: playerRows } = parseCSV(playersText);
  const { rows: appearenceRows } = appearenceText ? parseCSV(appearenceText) : { rows: [] };
  const { rows: teamRows } = teamText ? parseCSV(teamText) : { rows: [] };

  // Find the player (Id column, BOM stripped by trim() in parseCSV)
  const player = playerRows.find(p => p['Id'] === playerId);
  if (!player) {
    showError(`Player with ID "${playerId}" not found in team "${displayName}".`);
    return;
  }

  // Build appearance map and find this player's appearance data
  const appearanceMap = {};
  appearenceRows.forEach(a => {
    const pid = pickValue(a, ['Id', 'PlayerID', 'PlayerId', 'ID', 'id']);
    if (pid) appearanceMap[pid] = a;
  });
  const appearance = appearanceMap[playerId] || null;

  // Determine league
  const leagueId = teamRows.length > 0 ? teamRows[0].Country : null;
  const league = leagueId ? leaguesMap[leagueId] : null;
  const leagueName = league ? league.league_name : 'Unknown League';

  const team = { folder, displayName, leagueId, league };

  renderPlayerPage(player, team, appearance, leagueName);
}

// ─── Error display ────────────────────────────────────────────────────────────

function showError(message) {
  document.getElementById('loading-overlay').style.display = 'none';
  const content = document.getElementById('player-content');
  content.innerHTML = `
    <div class="error-message">${message}</div>
    <p style="margin-top:16px"><a href="index.html" style="color:var(--color-highlight)">← Back to database</a></p>`;
  content.style.display = 'block';
}

// ─── Entry point ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  boot().catch(err => {
    showError(`Unexpected error: ${err.message}`);
    console.error(err);
  });
});
