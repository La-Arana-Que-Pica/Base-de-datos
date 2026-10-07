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
  return window.LAQPRating.colorFor(value);
}

function dbRatingClass(value) {
  return window.LAQPRating.classFor(value);
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
  const cardsHtml = teams.map(team => {
    const avg = teamAvgOvr(team.players);
    const avgHtml = avg !== null
      ? `<span class="db-rating ${dbRatingClass(avg)}">${avg}</span>`
      : '';
    return `
      <a class="db-club-row" href="${typeof laqpTeamUrl === 'function' ? laqpTeamUrl(team.id, team.displayName) : `team.html?id=${encodeURIComponent(team.id)}`}">
        <img
          src="img/teams/${escapeHtml(team.id)}.webp"
          onerror="this.onerror=null;this.src='img/teams/default.webp'"
          alt="" width="46" height="46" loading="lazy">
        <span class="db-club-row-copy"><strong>${escapeHtml(team.displayName)}</strong><small>${t('db.playerCount', { count: team.players.length })}</small></span>
        ${avgHtml}
      </a>`;
  }).join('');
  const allScores = teams.flatMap(team => team.players.map(player => Number(player['OverallStats']))).filter(value => Number.isFinite(value) && value >= 40 && value <= 109);
  const leagueAverage = allScores.length ? `<span>${t('common.overall')} ${Math.round(allScores.reduce((sum, value) => sum + value, 0) / allScores.length)}</span>` : '';
  const playerCount = teams.reduce((sum, team) => sum + team.players.length, 0);

  content.innerHTML = `
    <div class="breadcrumb-row"><nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('index.html') : 'index.html'}">${t('common.home')}</a>
      <a href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('database.html') : 'database.html'}">${t('common.database')}</a>
      <span>${escapeHtml(league.name)}</span>
    </nav></div>
    <button class="back-btn" onclick="window.location.href='${typeof laqpDatabaseUrl === 'function' ? laqpDatabaseUrl('leagues') : 'database.html?view=leagues'}'">${t('common.backToLeagues')}</button>

    <header class="league-hero db-hero">
      <img width="112" height="112"
        src="img/leagues/${escapeHtml(league.id)}.webp"
        onerror="this.onerror=null;this.src='img/leagues/default.webp'"
        alt="${escapeHtml(league.name)}">
      <div>
        <p class="db-eyebrow">${t('league.databaseLeague')}</p>
        <h1>${escapeHtml(league.name)}</h1>
        <div class="db-hero-summary"><span>${t('db.teamCount', { count: teams.length })}</span><span>${t('db.playerCount', { count: playerCount })}</span>${leagueAverage}</div>
      </div>
    </header>

    <section class="db-section league-clubs"><div class="db-section-heading"><h2>${t('common.teams')}</h2><span>${teams.length} ${t('league.clubs')}</span></div><div class="db-club-grid">${cardsHtml}</div></section>
    `;

  document.documentElement.classList.add('laqp-hydrated');
  content.style.display = 'block';
  const loadingOverlay = document.getElementById('loading-overlay');
  if (loadingOverlay) {
    loadingOverlay.classList.remove('js-hydration-loader');
    loadingOverlay.style.display = 'none';
  }
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
  document.documentElement.classList.add('laqp-hydrated');
  const loadingOverlay = document.getElementById('loading-overlay');
  if (loadingOverlay) {
    loadingOverlay.classList.remove('js-hydration-loader');
    loadingOverlay.style.display = 'none';
  }
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
  await window.LAQPEnsurePes2018Overall();
  const params = new URLSearchParams(window.location.search);
  const embeddedLeagueId = document.querySelector('meta[name="laqp-league-id"]')?.content || '';
  const embeddedLeagueName = document.querySelector('meta[name="laqp-league-name"]')?.content || '';
  const leagueId = embeddedLeagueId || params.get('id');

  if (!leagueId) {
    const content = document.getElementById('league-content');
    if (content?.querySelector('.js-prerender-fallback')) {
      const loadingOverlay = document.getElementById('loading-overlay');
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      content.style.display = 'block';
      return;
    }
    showError(t('errors.noLeagueParam'));
    return;
  }

  const [teamsText, playersText, squadsText, leaguesText] = await Promise.all([
    fetchText('database/All teams exported.csv'),
    fetchText('database/All players exported.csv'),
    fetchText('database/All squads exported.csv'),
    fetchText('database/All leagues exported.csv'),
  ]);

  if (!teamsText || !playersText || !squadsText || !leaguesText) {
    showError(t('errors.databaseLoad'));
    return;
  }

  const { rows: teamRows } = parseCSV(teamsText);
  const { rows: playerRows } = parseCSV(playersText);
  playerRows.forEach(row => window.PES2018Overall.assignOverall(row));
  const { rows: squadRows } = parseCSV(squadsText);
  const leagueRows = parseLeaguesCSV(leaguesText);

  // Find this league
  // league_id=31 is currently shared by two competitions. Generated pages also
  // embed the name so both URLs hydrate with the correct row instead of always
  // selecting the first occurrence of that ID.
  const leagueRow = leagueRows.find(l =>
    (l['league_id'] || '') === leagueId &&
    (!embeddedLeagueName || (l['league_name'] || '') === embeddedLeagueName)
  ) || leagueRows.find(l => (l['league_id'] || '') === leagueId);
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
      if (p) players.push(p);
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
