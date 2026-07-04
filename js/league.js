/**
 * Base de datos Option File PES 2018–2026
 * League Profile Page Script
 *
 * Loads a league's teams from pretty paths or URL params:
 *   /league/LEAGUEID/league-slug
 *   league.html?id=LEAGUEID
 */

'use strict';

// ─── Utilities ────────────────────────────────────────────────────────────────

function handleMinifaceError(img, playerId) {
  img.onerror = null;
  img.src = 'img/players/default.webp';
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

async function fetchText(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toTitleCaseName(value) {
  const raw = String(value || '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';
  const keepUpper = new Set(['FC', 'AC', 'CF', 'CD', 'CA', 'SC', 'RC', 'AFC', 'BSC', 'PSG', 'PSV', 'UFC', 'UD', 'SD']);
  const lowerWords = new Set(['de', 'del', 'da', 'das', 'do', 'dos', 'y', 'e']);
  return raw.toLocaleLowerCase('es').split(' ').map((word, index) => {
    const clean = word.replace(/[^\p{L}\p{N}]/gu, '').toLocaleUpperCase('es');
    if (keepUpper.has(clean)) return clean;
    if (index > 0 && lowerWords.has(word)) return word;
    return word.split('-').map(part => part ? part.charAt(0).toLocaleUpperCase('es') + part.slice(1) : part).join('-');
  }).join(' ');
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

// ─── League CSV helpers ───────────────────────────────────────────────────────

function parseLeaguesCSV(text) {
  if (!text) return [];
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return [];
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
  return rows;
}

// ─── Avg OVR helper ──────────────────────────────────────────────────────────

function teamAvgOvr(players) {
  const ovrs = players
    .map(p => parseInt(p['OverallStats'], 10))
    .filter(v => !isNaN(v) && v > 0)
    .sort((a, b) => b - a)
    .slice(0, 16);
  if (!ovrs.length) return null;
  return Math.round(ovrs.reduce((a, b) => a + b, 0) / ovrs.length);
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderLeaguePage(league, teams) {
  const content = document.getElementById('league-content');

  const cardsHtml = teams.map(t => {
    const avg = teamAvgOvr(t.players);
    const avgHtml = avg !== null
      ? `<div class="grid-card-ovr"><span class="team-avg-badge" style="background:${statColor(avg)};color:${statTextColor(statColor(avg))}">${avg}</span></div>`
      : '';
    return `
      <div class="grid-card" onclick="window.location.href='${typeof laqpTeamUrl === 'function' ? laqpTeamUrl(t.id, t.displayName) : `team.html?id=${encodeURIComponent(t.id)}`}'">
        <img class="grid-card-img"
          src="img/teams/${escapeHtml(t.id)}.webp"
          onerror="this.onerror=null;this.src='img/teams/default.webp'"
          alt="${escapeHtml(t.displayName)}">
        <div class="grid-card-name">${escapeHtml(t.displayName)}</div>
        ${avgHtml}
      </div>`;
  }).join('');

  content.innerHTML = `
    <div class="breadcrumb-row"><nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('index.html') : 'index.html'}">${t('common.home')}</a>
      <a href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('database.html') : 'database.html'}">${t('common.database')}</a>
      <span>${escapeHtml(league.name)}</span>
    </nav></div>
    <button class="back-btn" onclick="window.location.href='${typeof laqpDatabaseUrl === 'function' ? laqpDatabaseUrl('leagues') : 'database.html?view=leagues'}'">${t('common.backToLeagues')}</button>

    <div class="view-header">
      <img class="grid-card-img" style="width:56px;height:56px;object-fit:contain"
        src="img/leagues/${escapeHtml(league.id)}.webp"
        onerror="this.onerror=null;this.src='img/leagues/default.webp'"
        alt="${escapeHtml(league.name)}">
      <div>
        <div class="view-title">${escapeHtml(league.name)}</div>
        <div class="view-subtitle">${t('db.teamCount', { count: teams.length })}</div>
      </div>
    </div>

    <div class="grid-cards">${cardsHtml}</div>`;

  content.style.display = 'block';
  document.getElementById('loading-overlay').style.display = 'none';
  document.title = `${league.name} - ${t('common.database')} PES`;
  const leaguePath = typeof laqpLeagueUrl === 'function' ? laqpLeagueUrl(league.id, league.name) : `/league.html?id=${encodeURIComponent(league.id)}`;
  const leagueUrl = typeof laqpAbsoluteUrl === 'function' ? laqpAbsoluteUrl(leaguePath) : `https://laqp.website${leaguePath}`;
  const canonical = document.querySelector('link[rel="canonical"]');
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (canonical) canonical.setAttribute('href', leagueUrl);
  if (ogUrl) ogUrl.setAttribute('content', leagueUrl);
  if (window.location.pathname !== leaguePath && typeof history.replaceState === 'function') {
    history.replaceState(null, '', leaguePath);
  }
}

// ─── Error display ────────────────────────────────────────────────────────────

function showError(message) {
  document.getElementById('loading-overlay').style.display = 'none';
  const content = document.getElementById('league-content');
  content.textContent = '';

  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = message;

  const backLink = document.createElement('p');
  backLink.style.marginTop = '16px';
  const anchor = document.createElement('a');
  anchor.href = typeof laqpPageUrl === 'function' ? laqpPageUrl('database.html') : 'database.html';
  anchor.style.color = 'var(--color-highlight)';
  anchor.textContent = t('common.backToDatabase');
  backLink.appendChild(anchor);

  content.appendChild(errorDiv);
  content.appendChild(backLink);
  content.style.display = 'block';
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  const params = new URLSearchParams(window.location.search);
  const embeddedLeagueId = document.querySelector('meta[name="laqp-league-id"]')?.content || '';
  const leagueId = embeddedLeagueId || params.get('id');

  if (!leagueId) {
    showError(t('errors.noLeagueParam'));
    return;
  }

  const [teamsText, playersText, squadsText, leaguesText, corregidosText] = await Promise.all([
    fetchText('database/All teams exported.csv'),
    fetchText('database/All players exported.csv'),
    fetchText('database/All squads exported.csv'),
    fetchText('database/All leagues exported.csv'),
    fetchText('database/medias_corregidas.csv'),
  ]);

  if (!teamsText || !playersText || !squadsText || !leaguesText) {
    showError(t('errors.databaseLoad'));
    return;
  }

  const { rows: teamRows } = parseCSV(teamsText);
  const { rows: playerRows } = parseCSV(playersText);
  const { rows: squadRows } = parseCSV(squadsText);
  const leagueRows = parseLeaguesCSV(leaguesText);

  // Find this league
  const leagueRow = leagueRows.find(l => (l['league_id'] || '') === leagueId);
  if (!leagueRow) {
    showError(t('errors.leagueNotFound', { id: leagueId }));
    return;
  }

  const league = {
    id: leagueId,
    name: leagueRow['league_name'] || leagueId,
    teamIds: (leagueRow['team_ids'] || '').split(',').map(s => s.trim()).filter(Boolean),
  };

  // Build player map
  const playerMap = {};
  playerRows.forEach(row => {
    const pid = row['Id'];
    if (pid) playerMap[pid] = row;
  });

  // Build corrected overall map from medias_corregidas.csv
  const corregidosMap = {};
  if (corregidosText) {
    const { rows: corregidosRows } = parseCSV(corregidosText);
    corregidosRows.forEach(r => {
      const pid = r['PlayerId'] || r['Id'] || r['id'] || r['player_id'] || '';
      const ovr = r['OverallStats'] || r['Overall'] || r['corrected_overall'] || r['media'] || '';
      if (pid && ovr) {
        corregidosMap[pid] = ovr;
      }
    });
  }

  // Build squad map (teamId → player list)
  const squadMap = {};
  squadRows.forEach(squadRow => {
    const tid = squadRow['Id'];
    if (!tid) return;
    const players = [];
    for (let i = 1; i <= 32; i++) {
      const pid = squadRow[`Player ${i}`];
      if (!pid || pid === '0') continue;
      const p = playerMap[pid];
      if (p) {
        const corregidosOvr = corregidosMap[pid];
        if (corregidosOvr) {
          players.push({ ...p, OverallStats: corregidosOvr });
        } else {
          players.push(p);
        }
      }
    }
    squadMap[tid] = players;
  });

  // Build team objects for this league
  const teamById = {};
  teamRows.forEach(row => {
    const tid = row['Id'];
    if (tid) teamById[tid] = row;
  });

  const teams = league.teamIds
    .map(tid => {
      const row = teamById[tid];
      if (!row) return null;
      const name = row['Name'] || '';
      if (!name || name === '-') return null;
      return {
        id: tid,
        rawName: name,
        displayName: toTitleCaseName(name),
        players: squadMap[tid] || [],
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));

  renderLeaguePage(league, teams);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  boot().catch(err => {
    showError(t('errors.unexpected', { message: err.message }));
    console.error(err);
  });
});
