'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DB = path.join(ROOT, 'database');
const SITE_URL = 'https://laqp.website';
const PES_POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'SS', 'CF'];

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function write(file, content) {
  fs.mkdirSync(path.dirname(path.join(ROOT, file)), { recursive: true });
  writeFileWithRetry(path.join(ROOT, file), content);
}

function hydrationGateScript() {
  return `<script data-laqp-hydration-gate>document.documentElement.classList.add('laqp-js');window.setTimeout(function(){document.documentElement.classList.add('laqp-js-timeout');},6000);</script>`;
}

function ensureHydrationGate(html) {
  if (html.includes('data-laqp-hydration-gate')) return html;
  return html.replace('<head>', `<head>\n  ${hydrationGateScript()}`);
}

function wait(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writeFileWithRetry(filePath, content) {
  const retryable = new Set(['UNKNOWN', 'EBUSY', 'EPERM', 'EACCES']);
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      fs.writeFileSync(filePath, content, 'utf8');
      return;
    } catch (error) {
      lastError = error;
      if (!retryable.has(error.code) || attempt === 19) break;
      wait(75 * (attempt + 1));
    }
  }
  throw lastError;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function cleanText(value) {
  const str = String(value || '');
  if (!/[ÃÂ]/.test(str)) return str;
  try {
    return Buffer.from(str, 'latin1').toString('utf8');
  } catch {
    return str;
  }
}

function htmlText(value) {
  return escapeHtml(cleanText(value));
}

function attrText(value) {
  return escapeAttr(cleanText(value));
}

function slugify(value, fallback = 'item') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];
  const delimiter = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const parseLine = line => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];
      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };
  const headers = parseLine(lines[0].replace(/^\uFEFF/, ''));
  return lines.slice(1).map(line => {
    const values = parseLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
  });
}

function readCsv(file) {
  return parseCsv(fs.readFileSync(path.join(DB, file), 'utf8'));
}

function readOptionalCsv(file) {
  const filePath = path.join(DB, file);
  if (!fs.existsSync(filePath)) return [];
  return parseCsv(fs.readFileSync(filePath, 'utf8'));
}

function readJson(file) {
  const filePath = path.join(DB, file);
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function replaceMarked(html, marker, content) {
  const start = `<!-- LAQP_STATIC_${marker}_START -->`;
  const end = `<!-- LAQP_STATIC_${marker}_END -->`;
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (!pattern.test(html)) throw new Error(`No se encontro el marcador ${marker}`);
  return html.replace(pattern, `${start}\n${content}\n                  ${end}`);
}

function setTextById(html, id, text) {
  return html.replace(new RegExp(`(<[^>]+id="${id}"[^>]*>)[\\s\\S]*?(<\\/[^>]+>)`), `$1${escapeHtml(text)}$2`);
}

function setMeta(html, selector, content) {
  const escaped = escapeAttr(content);
  if (selector === 'title') return html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escaped}</title>`);
  if (selector === 'description') {
    return html.replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escaped}" />`);
  }
  if (selector === 'canonical') return html.replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${escaped}" />`);
  return html;
}

function teamIdsFromLeagues(leagues) {
  return new Set(leagues.flatMap(league => String(league.team_ids || '').split(',').map(id => id.trim()).filter(Boolean)));
}

function playerUrl(player, team) {
  return `/player/v2/${encodeURIComponent(team.Id)}/${slugify(player.Name)}-${encodeURIComponent(player.Id)}/`;
}

function teamUrl(team) {
  return `/team/v2/${slugify(team.Name)}-${encodeURIComponent(team.Id)}/`;
}

function leagueUrl(league) {
  return `/league/v2/${slugify(league.league_name)}-${encodeURIComponent(league.league_id)}/`;
}

function downloadUrl(item) {
  return `/download/${encodeURIComponent(item.id || item.ID)}/`;
}

function tacticUrl(item) {
  return `/tactics/${encodeURIComponent(item.id)}/`;
}

function readTacticPlayers(tacticId) {
  const filePath = path.join(DB, 'tacticas', 'teams', tacticId, 'players.csv');
  if (!fs.existsSync(filePath)) return [];
  return parseCsv(fs.readFileSync(filePath, 'utf8'));
}

function formatDate(value) {
  if (!value) return '';
  const normalized = String(value).includes('/') ? String(value).split('/').reverse().join('-') : String(value);
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isoDate(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (String(value).includes('/')) {
    const [day, month, year] = String(value).split('/');
    return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return '';
}

function maxDate(rows) {
  const dates = rows.map(row => isoDate(row.fecha || row.date)).filter(Boolean).sort();
  return dates[dates.length - 1] || '2026-07-14';
}

function normalizePosition(value) {
  const raw = String(value || '');
  const index = parseInt(raw, 10);
  if (/^\d+$/.test(raw) && index >= 0 && index < PES_POSITIONS.length) return PES_POSITIONS[index];
  return raw || '-';
}

function statColor(value) {
  const number = parseInt(value, 10);
  if (Number.isNaN(number)) return '#d33d35';
  if (number >= 95) return '#00ff87';
  if (number >= 90) return '#62ff51';
  if (number >= 80) return '#a8ff00';
  if (number >= 70) return '#e5dc00';
  if (number >= 60) return '#e59f01';
  return '#d33d35';
}

function statTextColor(color) {
  return ['#e5dc00', '#a8ff00', '#62ff51', '#00ff87'].includes(color) ? '#111' : '#fff';
}

function overallBadge(value) {
  const color = statColor(value);
  return `<span class="overall-badge" style="background:${color};color:${statTextColor(color)}">${htmlText(value || '-')}</span>`;
}

function publicAsset(file) {
  return fs.existsSync(path.join(ROOT, file)) ? file : null;
}

function teamAverage(team, squadByTeamId, playerById) {
  const squad = squadByTeamId.get(team.Id);
  if (!squad) return null;
  const values = [];
  for (let index = 1; index <= 32; index += 1) {
    const player = playerById.get(squad[`Player ${index}`]);
    const overall = parseInt(player && player.OverallStats, 10);
    if (!Number.isNaN(overall) && overall > 0) values.push(overall);
  }
  const top = values.sort((a, b) => b - a).slice(0, 16);
  if (!top.length) return null;
  return Math.round(top.reduce((sum, value) => sum + value, 0) / top.length);
}

function getDownloadLinks(item) {
  const links = [];
  const add = (label, href) => {
    if (!href || href === '#') return;
    links.push({ label: label || `Parte ${links.length + 1}`, href });
  };
  String(item.links || '').split('|').forEach((entry, index) => {
    const value = entry.trim();
    if (!value) return;
    const parts = value.split('::');
    if (parts.length > 1) add(parts.shift().trim(), parts.join('::').trim());
    else add(`Parte ${index + 1}`, value);
  });
  if (!links.length) add('Descargar', item.link || item.url);
  return links;
}

function loadData() {
  const players = readCsv('All players exported.csv');
  const teams = readCsv('All teams exported.csv');
  const squads = readCsv('All squads exported.csv');
  const leagues = readCsv('All leagues exported.csv');
  const downloads = readCsv('descargas.csv').filter(row => (row.estado || '').toLowerCase() !== 'oculto');
  const tutorials = readCsv('tutoriales.csv');
  const guides = readJson('guias.json');
  const tactics = readOptionalCsv('tacticas.csv').filter(row => row.id);
  const news = readOptionalCsv('novedades.csv');
  const teamById = new Map(teams.map(team => [team.Id, team]));
  const playerById = new Map(players.map(player => [player.Id, player]));
  const squadByTeamId = new Map(squads.map(squad => [squad.Id, squad]));
  const publishedTeamIds = teamIdsFromLeagues(leagues);
  const publishedTeams = [...publishedTeamIds].map(id => teamById.get(id)).filter(team => team && team.Name && team.Name !== '-');
  const publishedPlayers = [];
  for (const team of publishedTeams) {
    const squad = squadByTeamId.get(team.Id);
    if (!squad) continue;
    for (let index = 1; index <= 32; index += 1) {
      const player = playerById.get(squad[`Player ${index}`]);
      if (player && player.Id && player.Name) publishedPlayers.push({ player, team });
    }
  }
  tactics.forEach(tactic => {
    tactic.players = readTacticPlayers(tactic.id);
  });
  return {
    players,
    teams,
    squads,
    leagues,
    downloads,
    tutorials,
    guides,
    tactics,
    news,
    teamById,
    playerById,
    squadByTeamId,
    publishedTeams,
    publishedPlayers,
  };
}

function renderDatabase(data) {
  let html = ensureHydrationGate(read('database.html'));
  const updateDate = maxDate([...data.downloads, ...data.tutorials]);
  const topPlayers = data.publishedPlayers
    .slice()
    .sort((a, b) => Number(b.player.OverallStats || 0) - Number(a.player.OverallStats || 0))
    .slice(0, 8);
  const featuredTeams = data.publishedTeams.slice(0, 8);
  const featuredLeagues = data.leagues.slice(0, 8);

  html = html.replace(/<div id="loading-overlay"[^>]*>/, '<div id="loading-overlay" style="display:none">');
  html = html.replace(/<div id="home-view"[^>]*>/, '<div id="home-view" class="active">');
  html = setTextById(html, 'stat-players', data.publishedPlayers.length.toLocaleString('es-AR'));
  html = setTextById(html, 'stat-teams', data.publishedTeams.length.toLocaleString('es-AR'));
  html = setTextById(html, 'stat-leagues', data.leagues.length.toLocaleString('es-AR'));
  html = replaceMarked(html, 'PLAYERS', topPlayers.map(({ player, team }) => `
                    <a class="db-feature-row" href="${playerUrl(player, team)}">
                      <img src="img/players/${escapeAttr(player.Id)}.webp" alt="Miniface de ${escapeAttr(player.Name)}" loading="lazy" width="42" height="42" onerror="this.onerror=null;this.src='img/players/player.webp'">
                      <span><strong>${escapeHtml(player.Name)}</strong><small>${escapeHtml(team.Name)} · ${escapeHtml(player.POS || 'POS')} · ${escapeHtml(player.Age || '-')} años</small></span>
                      <b>${escapeHtml(player.OverallStats || '-')}</b>
                    </a>`).join(''));
  html = replaceMarked(html, 'TEAMS', featuredTeams.map(team => `
                    <a class="team-mini-card" href="${teamUrl(team)}">
                      <img src="img/teams/${escapeAttr(team.Id)}.webp" alt="Escudo de ${escapeAttr(team.Name)}" loading="lazy" width="44" height="44" onerror="this.onerror=null;this.src='img/teams/default.webp'">
                      <span>${escapeHtml(team.Name)}</span>
                    </a>`).join(''));
  html = replaceMarked(html, 'LEAGUES', featuredLeagues.map(league => `
                  <a class="league-mini-row" href="${leagueUrl(league)}">
                    <span>${escapeHtml(league.league_name)}</span>
                    <small>${String(league.team_ids || '').split(',').filter(Boolean).length} equipos</small>
                  </a>`).join(''));
  html = replaceMarked(html, 'DATABASE_INTRO', `
                <p>Jugadores, equipos, ligas, stats, medias, plantillas, caras/minifaces y referencias de edicion para mantener PES 2018 actualizado con datos modernos. Busca un jugador, revisa sus stats y usa la ficha como guia para editarlo dentro del juego.</p>
                <p class="db-static-note">Ultima actualizacion registrada: <time datetime="${updateDate}">${formatDate(updateDate)}</time>. Incluye ${data.publishedPlayers.length.toLocaleString('es-AR')} jugadores, ${data.publishedTeams.length.toLocaleString('es-AR')} equipos y ${data.leagues.length.toLocaleString('es-AR')} ligas.</p>`);
  html = replaceMarked(html, 'NOSCRIPT_LINKS', `
                <noscript>
                  <p>JavaScript esta desactivado. Podes entrar igual a los listados principales:</p>
                  <ul>
                    <li><a href="database/v2/players/">Jugadores actualizados de PES 2018</a></li>
                    <li><a href="database/v2/teams/">Equipos y plantillas actualizadas</a></li>
                    <li><a href="database/v2/leagues/">Ligas y competiciones actualizadas</a></li>
                  </ul>
                </noscript>`);
  write('database.html', html);
}

function tutorialThumb(item) {
  if (item.thumbnail || item.image) return item.thumbnail || item.image;
  if (item.video_id) return `https://img.youtube.com/vi/${encodeURIComponent(item.video_id)}/hqdefault.jpg`;
  return 'img/logo.webp';
}

function renderTutorials(data) {
  let html = read('tutorials.html');
  const cards = data.tutorials.map(item => `
        <article class="tutorial-card">
          <a class="tutorial-card-thumb-wrap" href="https://www.youtube.com/watch?v=${escapeAttr(item.video_id)}" target="_blank" rel="noopener noreferrer">
            <img class="tutorial-card-thumb" src="${escapeAttr(tutorialThumb(item))}" alt="${attrText(item.titulo)} - tutorial PES 2018" loading="lazy" width="480" height="270" onerror="this.onerror=null;this.src='img/logo.webp'">
            <span class="tutorial-play-btn" aria-hidden="true">&#9658;</span>
          </a>
          <div class="tutorial-card-body">
            <div class="tutorial-card-meta"><span>Video</span>${item.fecha ? `<time datetime="${isoDate(item.fecha)}">${formatDate(item.fecha)}</time>` : ''}</div>
            <h3 class="tutorial-card-title">${htmlText(item.titulo)}</h3>
            <p class="tutorial-card-desc">${htmlText(item.descripcion)}</p>
            <a class="tutorial-watch-btn" href="https://www.youtube.com/watch?v=${escapeAttr(item.video_id)}" target="_blank" rel="noopener noreferrer">Ver tutorial</a>
          </div>
        </article>`).join('');
  const guideLinks = data.guides.slice(0, 6).map(guide => `
        <a href="/guia/${encodeURIComponent(guide.id)}/">
          <strong>${htmlText(guide.title)}</strong>
          <span>${htmlText(guide.category || 'Guia')}</span>
        </a>`).join('');
  html = replaceMarked(html, 'TUTORIALS', `
      <nav class="breadcrumbs" aria-label="Breadcrumb">
        <a href="index.html">Inicio</a>
        <span>Tutoriales</span>
      </nav>
      <section class="content-hub-hero tutorials-hero">
        <div class="guides-hero-icon" aria-hidden="true">YT</div>
        <div class="guides-hero-copy">
          <div class="content-hub-kicker">Videos PES 2018</div>
          <h1>Tutoriales</h1>
          <p>Guias en video para instalar, configurar y editar PES 2018 actualizado: Option Files, caras, kits, herramientas y soluciones a problemas comunes.</p>
        </div>
      </section>
      <section class="guides-library-panel tutorials-library-panel">
        <div class="guides-panel-head">
          <div>
            <span class="guides-panel-kicker">Biblioteca</span>
            <h2>Tutoriales publicados</h2>
          </div>
          <span class="guides-count-pill">${data.tutorials.length} tutoriales</span>
        </div>
        <div class="tutorial-cards-grid">${cards}</div>
      </section>
      <section class="guides-quick-strip">
        <div class="guides-brand-tile">
          <img src="img/logo.webp" alt="LAqP" loading="lazy">
          <div><strong>PES 2018 Actualizado</strong><span>Guias, videos, stats y recursos de edicion.</span></div>
        </div>
        ${guideLinks}
      </section>
      <noscript>
        <section class="guides-library-panel"><h2>Accesos sin JavaScript</h2><p>Los enlaces de video y guías escritas están disponibles directamente desde esta página.</p></section>
      </noscript>`);
  html = html.replace(
    /<div><strong>La Ara[\s\S]*?PES 2018\.<\/span><\/div>/,
    '<div><strong>PES 2018 Actualizado</strong><span>Guias, videos, stats y recursos de edicion.</span></div>'
  );
  write('tutorials.html', html);
}

function guideCategoryKey(category) {
  return cleanText(category)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function renderGuideIndexCard(guide) {
  const url = articleUrl(guide);
  const category = guide.category || 'Guia';
  return `
    <article class="editorial-card guide-card" data-category="${attrText(guideCategoryKey(category))}">
      <a class="editorial-card-media" href="${url}">
        <img src="${escapeAttr(articleImage(guide))}" alt="${attrText(guide.title)}" loading="lazy" width="640" height="360" onerror="this.onerror=null;this.src='img/logo.webp'">
      </a>
      <div class="editorial-card-body">
        <div class="editorial-meta guide-card-meta">
          <span>${htmlText(guide.readTime || 'Lectura')}</span>
          <span>${htmlText(category)}</span>
          ${guide.date ? `<time datetime="${escapeAttr(guide.date)}">${formatDate(guide.date)}</time>` : ''}
        </div>
        <h2><a href="${url}">${htmlText(guide.title)}</a></h2>
        <p>${htmlText(guide.description)}</p>
        <a class="text-link guide-card-link" href="${url}">Ver guia <span aria-hidden="true">&rsaquo;</span></a>
      </div>
    </article>`;
}

function renderGuidesIndex(data) {
  let html = read('guias.html');
  const cards = data.guides.map(renderGuideIndexCard).join('');
  html = html.replace(
    /(<span class="guides-count-pill" id="guides-count">)[\s\S]*?(<\/span>)/,
    `$1${data.guides.length} guias publicadas$2`
  );
  html = html.replace(
    /<section class="editorial-grid guides-grid" id="guides-grid" aria-label="Listado de guias">[\s\S]*?<\/section>/,
    `<section class="editorial-grid guides-grid" id="guides-grid" aria-label="Listado de guias">${cards}\n      </section>`
  );
  write('guias.html', html);
}

function renderDownloadButtons(item) {
  return getDownloadLinks(item).map(link => `<a class="download-btn" href="${escapeAttr(link.href)}" target="_blank" rel="noopener noreferrer">${htmlText(link.label)}</a>`).join('');
}

function renderHomeDownloadButtons(item) {
  const links = getDownloadLinks(item);
  if (!links.length) return '<span class="featured-of-btn featured-of-btn-soon">Proximamente</span>';
  return links.map(link => `<a class="featured-of-btn featured-of-btn-download" href="${escapeAttr(link.href)}" target="_blank" rel="noopener noreferrer">${htmlText(link.label)}</a>`).join('');
}

function renderHomeFeaturedCard(item) {
  const title = item.titulo || item.nombre || item.title || item.name || item.juego || 'Option File';
  const version = item.version || '';
  const game = item.juego || '';
  const platform = item.plataforma || item.platform || '';
  const image = String(item.miniatura || item.thumbnail || item.image || item.imagen || 'img/logo.webp').replace(/^\/+/, '');
  return `
            <article class="featured-of-card">
              <div class="featured-of-media">
                <img src="${escapeAttr(image)}" alt="${attrText(title)}" loading="lazy" onerror="this.onerror=null;this.src='img/logo.webp'">
              </div>
              <div class="featured-of-card-header">
                <span class="featured-of-game">${htmlText(title)}</span>
                ${version ? `<span class="download-version-badge">${htmlText(version)}</span>` : ''}
              </div>
              ${game && game !== title ? `<div class="featured-of-game-sub">${htmlText(game)}</div>` : ''}
              ${platform ? `<div class="featured-of-platform"><span class="download-platform-badge">${htmlText(platform)}</span></div>` : ''}
              <p class="featured-of-desc">${htmlText(item.descripcion || item.description || 'Descarga para mantener PES 2018 actualizado.')}</p>
              <div class="featured-of-actions">
                ${renderHomeDownloadButtons(item)}
                <a class="featured-of-btn featured-of-btn-details" href="${downloadUrl(item)}">Ver detalles</a>
              </div>
            </article>`;
}

function renderHome(data) {
  let html = read('index.html');
  const featured = data.downloads.filter(item => String(item.destacado || '').trim() === '1');
  html = replaceMarked(html, 'HOME_FEATURED', featured.map(renderHomeFeaturedCard).join(''));
  write('index.html', html);
}

function renderDownloadCard(item) {
  const title = item.titulo || item.nombre || 'Option File';
  const platform = item.plataforma ? ` (${cleanText(item.plataforma)})` : '';
  return `
        <article class="download-card" id="${escapeAttr(item.id)}">
          <div class="download-card-media">
            <img src="${escapeAttr(String(item.miniatura || 'img/logo.webp').replace(/^\/+/, ''))}" alt="${attrText(title)}${attrText(platform)} para PES 2018" loading="lazy" width="640" height="360" onerror="this.onerror=null;this.src='img/logo.webp'">
          </div>
          <div class="download-card-header">
            ${item.plataforma ? `<span class="download-platform-badge">${htmlText(item.plataforma)}</span>` : ''}
            ${item.version ? `<span class="download-version-badge">${htmlText(item.version)}</span>` : ''}
          </div>
          <div class="download-card-body">
            <div class="download-card-meta">${item.fecha ? `<span>${formatDate(item.fecha)}</span>` : ''}${item.categoria ? `<span>${htmlText(item.categoria)}</span>` : ''}</div>
            <h3 class="download-card-title">${htmlText(title)}${htmlText(platform)}</h3>
            <p class="download-description">${htmlText(item.descripcion)}</p>
          </div>
          <div class="download-card-footer">
            <a class="download-btn download-btn-secondary" href="${downloadUrl(item)}">Ver detalles</a>
            ${renderDownloadButtons(item)}
          </div>
        </article>`;
}

function downloadDetailHtml(baseHtml, item) {
  const title = item.titulo || 'Option File';
  const platform = item.plataforma ? ` ${cleanText(item.plataforma)}` : '';
  const pageTitle = `${cleanText(title)}${platform}`;
  let html = baseHtml;
  if (!html.includes('<base href="/">')) {
    html = html.replace('<head>', '<head>\n  <base href="/">');
  }
  html = setMeta(html, 'title', `${pageTitle} - Descargar PES 2018 Actualizado`);
  html = setMeta(html, 'description', `${pageTitle}: detalles, plataforma, compatibilidad, recomendaciones de instalacion y enlaces de descarga para actualizar PES 2018.`);
  html = setMeta(html, 'canonical', `${SITE_URL}${downloadUrl(item)}`);
  return replaceMarked(html, 'DOWNLOADS', `
      <nav class="breadcrumbs" aria-label="Breadcrumb">
        <a href="index.html">Inicio</a>
        <a href="downloads.html">Option Files</a>
        <span>${htmlText(pageTitle)}</span>
      </nav>
      <article class="download-detail-page of-detail-page">
        <div class="download-detail-hero of-detail-hero">
          <div class="download-detail-media of-detail-media">
            <img src="${escapeAttr(String(item.miniatura || 'img/logo.webp').replace(/^\/+/, ''))}" alt="${attrText(pageTitle)} para PES 2018" loading="eager" width="960" height="540" onerror="this.onerror=null;this.src='img/logo.webp'">
          </div>
          <div class="download-detail-summary of-detail-summary">
            <div class="download-card-header">
              ${item.plataforma ? `<span class="download-platform-badge">${htmlText(item.plataforma)}</span>` : ''}
              ${item.version ? `<span class="download-version-badge">${htmlText(item.version)}</span>` : ''}
              ${item.fecha ? `<span class="download-version-badge download-date-badge">${formatDate(item.fecha)}</span>` : ''}
            </div>
            <h1>${htmlText(pageTitle)}</h1>
            <p>${htmlText(item.descripcion)}</p>
            <div class="download-detail-actions">${renderDownloadButtons(item)}<a class="download-btn download-btn-secondary" href="tutorials.html">Tutoriales</a></div>
          </div>
        </div>
        <div class="download-editorial">
          <p>Descarga para mantener PES 2018 actualizado. Revisa la plataforma indicada antes de instalar y hace una copia de seguridad de tus datos editados.</p>
          <div class="download-detail-grid">
            <section><h2>Contenido incluido</h2><p>${htmlText(item.descripcion)}</p></section>
            <section><h2>Antes de instalar</h2><p>Confirma que la descarga corresponde a tu plataforma (${htmlText(item.plataforma || 'plataforma indicada')}) y conserva una copia de seguridad de tus datos editados de PES 2018.</p></section>
            <section><h2>Instalacion relacionada</h2><p>Usa las guias de instalacion y edicion para respetar el orden correcto en PC, PS4 o PS5. Si instalaste otros parches o mods, revisa compatibilidad antes de reemplazar archivos.</p></section>
            <section><h2>Enlaces externos</h2><p>Los botones de descarga apuntan a servicios externos. Esta ficha resume version, plataforma y recomendaciones antes de salir del sitio.</p></section>
          </div>
        </div>
      </article>`);
}

function renderDownloads(data) {
  let html = read('downloads.html');
  const grouped = new Map();
  data.downloads.forEach(item => {
    const group = item.juego || 'Option Files';
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(item);
  });
  const sections = [...grouped].map(([game, items]) => `
        <section class="download-group">
          <h2 class="download-group-title">${htmlText(game)}</h2>
          <div class="download-cards-grid">${items.map(renderDownloadCard).join('')}</div>
        </section>`).join('');
  html = replaceMarked(html, 'DOWNLOADS', `
      <nav class="breadcrumbs" aria-label="Breadcrumb">
        <a href="index.html">Inicio</a>
        <span>Option Files</span>
      </nav>
      <section class="content-hub-hero of-hero">
        <div class="guides-hero-icon" aria-hidden="true">OF</div>
        <div class="guides-hero-copy">
          <div class="content-hub-kicker">PES 2018</div>
          <h1>Option Files</h1>
          <p>Descargas para mantener PES 2018 actualizado en PS4, PS5 y PC: plantillas, ligas, kits y contenido editable.</p>
        </div>
      </section>
      <section class="guides-library-panel of-library-panel">
        <div class="guides-panel-head"><div><span class="guides-panel-kicker">Descargas</span><h2>Option Files publicados</h2></div><span class="guides-count-pill">${data.downloads.length} archivos</span></div>
        <div class="downloads-how-to"><strong>Antes de instalar</strong><span>Revisa el tutorial correspondiente, descarga la plataforma correcta y conserva una copia de seguridad.</span></div>
        ${sections}
      </section>
      <noscript><section class="guides-library-panel"><h2>Descargas sin JavaScript</h2><p>Las tarjetas y enlaces principales están disponibles directamente en el HTML.</p></section></noscript>`);
  write('downloads.html', html);
  data.downloads.forEach(item => {
    if (!item.id && !item.ID) return;
    write(path.join(downloadUrl(item), 'index.html').replace(/^\//, ''), downloadDetailHtml(html, item));
  });
}

function articleUrl(guide) {
  return `/guia/${encodeURIComponent(guide.id)}/`;
}

function articleImage(guide) {
  return String(guide.image || 'img/logo.webp').replace(/^\/+/, '');
}

function renderArticleFigure(figure, heading) {
  if (!figure || !figure.image) return '';
  return `
              <figure class="article-figure${figure.size === 'small' ? ' article-figure-small' : ''}">
                <img src="${escapeAttr(String(figure.image).replace(/^\/+/, ''))}" alt="${attrText(figure.alt || heading)}" loading="lazy" width="960" height="540" onerror="this.onerror=null;this.src='img/logo.webp'">
                ${figure.caption ? `<figcaption>${htmlText(figure.caption)}</figcaption>` : ''}
              </figure>`;
}

function renderArticleBody(guide) {
  return (guide.sections || []).map((section, index) => `
            <section id="section-${index + 1}">
              <h2>${htmlText(section.heading)}</h2>
              ${(section.body || []).map(paragraph => `<p>${htmlText(paragraph)}</p>`).join('')}
              ${section.list ? `<ul>${section.list.map(item => `<li>${htmlText(item)}</li>`).join('')}</ul>` : ''}
              ${renderArticleFigure(section.figure, section.heading)}
            </section>`).join('');
}

function renderArticleFaq(guide) {
  if (!guide.faq || !guide.faq.length) return '';
  return `
            <section id="faq">
              <h2>Preguntas frecuentes</h2>
              <div class="article-faq">
                ${guide.faq.map(([question, answer]) => `
                  <details>
                    <summary>${htmlText(question)}</summary>
                    <p>${htmlText(answer)}</p>
                  </details>`).join('')}
              </div>
            </section>`;
}

function renderArticleSchema(guide) {
  const url = `${SITE_URL}${articleUrl(guide)}`;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: cleanText(guide.title),
    description: cleanText(guide.description),
    image: `${SITE_URL}/${articleImage(guide)}`,
    datePublished: guide.date,
    dateModified: guide.date,
    inLanguage: 'es',
    author: { '@type': 'Person', name: 'Agustin Segade', alternateName: 'La Araña Que Pica' },
    publisher: {
      '@type': 'Organization',
      name: 'LAqP',
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/img/logo.webp` },
    },
    mainEntityOfPage: url,
  };
  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

function staticArticleHtml(guide, allGuides) {
  const title = cleanText(guide.title || 'Guia PES 2018');
  const description = cleanText(guide.description || 'Guia de PES 2018 actualizado.');
  const related = (guide.related || [])
    .map(id => allGuides.find(item => item.id === id))
    .filter(Boolean);
  const url = `${SITE_URL}${articleUrl(guide)}`;
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <base href="/">
  ${hydrationGateScript()}
  <script src="js/consent-mode.js"></script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} | PES 2018 Actualizado</title>
  <meta name="description" content="${escapeAttr(description)}">
  <link rel="canonical" href="${url}">
  <meta property="og:title" content="${escapeAttr(title)}">
  <meta property="og:description" content="${escapeAttr(description)}">
  <meta property="og:image" content="${SITE_URL}/${escapeAttr(articleImage(guide))}">
  <meta property="og:url" content="${url}">
  <meta property="og:type" content="article">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeAttr(title)}">
  <meta name="twitter:description" content="${escapeAttr(description)}">
  <meta name="twitter:image" content="${SITE_URL}/${escapeAttr(articleImage(guide))}">
  <link rel="stylesheet" href="css/style.css">
  <link rel="icon" href="img/logo.webp" type="image/webp">
  ${renderArticleSchema(guide)}
</head>
<body>
  <header id="header">
    <a href="index.html" class="header-logo-link"><img class="logo" src="img/logo.webp" alt="Logo LAqP"></a>
    <div class="header-title"><span>Academia PES</span> <span>LAqP.website</span></div>
    <nav class="header-nav" aria-label="Menu principal"></nav>
  </header>

  <main class="article-page">
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="index.html">Inicio</a>
      <a href="guias.html">Guias</a>
      <span>${htmlText(guide.category || 'Guia')}</span>
    </nav>
    <article class="long-article">
      <header class="long-article-header">
        <div class="editorial-meta">
          <span>${htmlText(guide.category || 'Guia')}</span>
          ${guide.date ? `<time datetime="${escapeAttr(guide.date)}">${formatDate(guide.date)}</time>` : ''}
          <span>${htmlText(guide.readTime || 'Lectura')}</span>
          <span>Por Agustin Segade</span>
        </div>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(description)}</p>
        <img src="${escapeAttr(articleImage(guide))}" alt="${escapeAttr(title)}" loading="eager" width="960" height="540" onerror="this.onerror=null;this.src='img/logo.webp'">
      </header>

      <div class="article-layout">
        <aside class="article-toc" aria-label="Indice del articulo">
          <strong>En esta guia</strong>
          ${(guide.sections || []).map((section, index) => `<a href="#section-${index + 1}">${htmlText(section.heading)}</a>`).join('')}
          ${guide.faq && guide.faq.length ? '<a href="#faq">FAQ</a>' : ''}
        </aside>

        <div class="article-body">
          ${renderArticleBody(guide)}
          ${renderArticleFaq(guide)}
          <section>
            <h2>Seguir explorando</h2>
            <p>Para completar el recorrido podes abrir tutoriales en video, comparar jugadores en la base de datos o revisar descargas compatibles con tu plataforma.</p>
            <div class="seo-link-row">
              <a href="tutorials.html">Tutoriales</a>
              <a href="downloads.html">Option Files</a>
              <a href="database.html">Base de datos</a>
              <a href="tactics.html">Tacticas</a>
            </div>
          </section>
        </div>
      </div>
    </article>

    ${related.length ? `
      <section class="landing-section article-related">
        <div class="landing-section-header">
          <h2 class="landing-section-title">Guias relacionadas</h2>
          <a class="landing-section-link" href="guias.html">Ver todas</a>
        </div>
        <div class="editorial-grid editorial-grid-compact">
          ${related.map(item => `
            <article class="editorial-card guide-card">
              <a class="editorial-card-media" href="${articleUrl(item)}"><img src="${escapeAttr(articleImage(item))}" alt="${attrText(item.title)}" loading="lazy" width="640" height="360" onerror="this.onerror=null;this.src='img/logo.webp'"></a>
              <div class="editorial-card-body"><h2><a href="${articleUrl(item)}">${htmlText(item.title)}</a></h2><p>${htmlText(item.description)}</p></div>
            </article>`).join('')}
        </div>
      </section>` : ''}
  </main>

  <script src="js/i18n.js"></script>
  <script src="js/site.js"></script>
</body>
</html>
`;
}

function renderStaticArticles(data) {
  data.guides.forEach(guide => {
    if (!guide.id) return;
    write(path.join(articleUrl(guide), 'index.html').replace(/^\//, ''), staticArticleHtml(guide, data.guides));
  });
}

function renderSitemap(data) {
  const urls = new Set([
    '/',
    '/database.html',
    '/downloads.html',
    '/tutorials.html',
    '/guias.html',
    '/rankings.html',
    '/tactics.html',
    '/calculadora-medias.html',
    '/acerca-de.html',
    '/contact.html',
    '/faq.html',
    '/privacy-policy.html',
    '/cookies.html',
    '/terms.html',
    '/dmca.html',
    '/database/v2/players/',
    '/database/v2/teams/',
    '/database/v2/leagues/',
  ]);
  data.downloads.forEach(item => item.id && urls.add(downloadUrl(item)));
  data.guides.forEach(guide => guide.id && urls.add(articleUrl(guide)));
  data.tactics.forEach(tactic => tactic.id && urls.add(tacticUrl(tactic)));
  data.leagues.forEach(league => league.league_id && urls.add(leagueUrl(league)));
  data.publishedTeams.forEach(team => urls.add(teamUrl(team)));
  data.publishedPlayers.forEach(({ player, team }) => urls.add(playerUrl(player, team)));
  const today = new Date().toISOString().slice(0, 10);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...urls].map(url => `  <url><loc>${SITE_URL}${escapeHtml(url)}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`;
  write('sitemap.xml', xml);
  write('robots.txt', `User-agent: *\nAllow: /\nAllow: /css/\nAllow: /js/\nAllow: /database/\nAllow: /img/\nAllow: /assets/\n\nUser-agent: Mediapartners-Google\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
}

function renderDatabaseListPagesLegacy(data) {
  const shell = (view, title, description, body) => `<!DOCTYPE html>
<html lang="es">
<head>
  <base href="/">
  ${hydrationGateScript()}
  <script src="js/consent-mode.js"></script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="laqp-database-view" content="${escapeAttr(view)}">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeAttr(description)}">
  <link rel="canonical" href="${SITE_URL}/${title.includes('Jugadores') ? 'database/v2/players/' : title.includes('Equipos') ? 'database/v2/teams/' : 'database/v2/leagues/'}">
  <link rel="stylesheet" href="css/style.css">
  <link rel="icon" href="img/logo.webp" type="image/webp">
</head>
<body>
  <header id="header">
    <a href="index.html" class="header-logo-link"><img class="logo" src="img/logo.webp" alt="Logo LAqP"></a>
    <div class="header-title">PES 2018 Actualizado <span>Base de datos</span></div>
    <nav class="header-nav" aria-label="Menu principal">
      <a href="downloads.html" class="header-nav-link">Option Files</a>
      <a href="tutorials.html" class="header-nav-link">Tutoriales</a>
      <a href="database.html" class="header-nav-link active">Base de datos</a>
    </nav>
    <div id="search-container">
      <span class="search-icon" aria-hidden="true">&#128269;</span>
      <input type="text" id="search-input" placeholder="Buscar jugadores..." data-i18n-placeholder="search.players" autocomplete="off">
    </div>
  </header>
  <div id="layout">
    <nav id="sidebar"></nav>
    <main id="main">
      <div id="loading-overlay" class="js-hydration-loader" style="display:none">
        <div class="spinner"></div>
        <span class="loading-message" data-i18n="loading.database">Cargando base de datos...</span>
      </div>
      <div class="js-prerender-fallback">
        <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="index.html">Inicio</a><a href="database.html">Base de datos</a><span>${escapeHtml(title)}</span></nav>
        <section class="guides-library-panel">
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(description)}</p>
          ${body}
        </section>
      </div>
      <div id="home-view"></div>
      <div id="league-teams-view"></div>
      <div id="players-view"></div>
      <div id="player-view"></div>
      <div id="search-view"></div>
      <div id="leagues-view"></div>
      <div id="teams-grid-view"></div>
      <div id="favorites-view"></div>
    </main>
  </div>
  <script src="js/i18n.js"></script>
  <script src="js/site.js"></script>
  <script src="js/favorites.js"></script>
  <script src="js/app.js"></script>
</body>
</html>
`;
  const players = data.publishedPlayers
    .slice()
    .sort((a, b) => Number(b.player.OverallStats || 0) - Number(a.player.OverallStats || 0))
    .slice(0, 250);
  write('database/v2/players/index.html', shell(
    'players',
    'Jugadores PES 2018 Actualizado - Stats y Caras',
    `Listado estatico de jugadores actualizados para PES 2018 con stats, medias, equipos y referencias de edicion. La base completa contiene ${data.publishedPlayers.length.toLocaleString('es-AR')} jugadores.`,
    `<table class="static-stats-table"><thead><tr><th>Jugador</th><th>Equipo</th><th>Pos</th><th>Media</th></tr></thead><tbody>${players.map(({ player, team }) => `<tr><td><a href="${playerUrl(player, team)}">${escapeHtml(player.Name)}</a></td><td><a href="${teamUrl(team)}">${escapeHtml(team.Name)}</a></td><td>${escapeHtml(player.POS || '-')}</td><td>${escapeHtml(player.OverallStats || '-')}</td></tr>`).join('')}</tbody></table>`
  ));
  write('database/v2/teams/index.html', shell(
    'teams',
    'Equipos PES 2018 Actualizado - Plantillas y Stats',
    `Listado estatico de equipos y plantillas actualizadas para PES 2018. Hay ${data.publishedTeams.length.toLocaleString('es-AR')} equipos detectados.`,
    `<div class="download-cards-grid">${data.publishedTeams.map(team => `<article class="download-card"><div class="download-card-media"><img src="img/teams/${escapeAttr(team.Id)}.webp" alt="Escudo de ${escapeAttr(team.Name)}" loading="lazy" width="160" height="160" onerror="this.onerror=null;this.src='img/teams/default.webp'"></div><div class="download-card-body"><h2 class="download-card-title"><a href="${teamUrl(team)}">${escapeHtml(team.Name)}</a></h2><p>ID ${escapeHtml(team.Id)}</p></div></article>`).join('')}</div>`
  ));
  write('database/v2/leagues/index.html', shell(
    'leagues',
    'Ligas PES 2018 Actualizado - Equipos y Plantillas',
    `Listado estatico de ligas y competiciones actualizadas para PES 2018. Hay ${data.leagues.length.toLocaleString('es-AR')} ligas detectadas.`,
    `<table class="static-stats-table"><thead><tr><th>Liga</th><th>Equipos</th></tr></thead><tbody>${data.leagues.map(league => `<tr><td><a href="${leagueUrl(league)}">${escapeHtml(league.league_name)}</a></td><td>${String(league.team_ids || '').split(',').filter(Boolean).length}</td></tr>`).join('')}</tbody></table>`
  ));
}

function renderDatabaseListPages(data) {
  const directoryPlayers = (() => {
    const clubPlayerIds = new Set(data.publishedPlayers
      .filter(({ team }) => String(team.Type || '') !== '2')
      .map(({ player }) => player.Id));
    const seen = new Set();
    return data.publishedPlayers
      .filter(({ player, team }) => {
        if (!player.Id || seen.has(player.Id)) return false;
        if (String(team.Type || '') === '2' && clubPlayerIds.has(player.Id)) return false;
        seen.add(player.Id);
        return true;
      })
      .sort((a, b) => Number(b.player.OverallStats || 0) - Number(a.player.OverallStats || 0));
  })();

  const canonicalPaths = {
    players: 'database/v2/players/',
    teams: 'database/v2/teams/',
    leagues: 'database/v2/leagues/',
  };

  const viewHtml = (target, activeView, body) =>
    `<div id="${target}"${target === activeView ? ' class="active"' : ''}>${target === activeView ? `<div class="js-prerender-fallback">${body}</div>` : ''}</div>`;

  const shell = (view, title, description, body) => {
    const activeView = view === 'teams' ? 'teams-grid-view' : `${view}-view`;
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <base href="/">
  ${hydrationGateScript()}
  <script src="js/consent-mode.js"></script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="laqp-database-view" content="${escapeAttr(view)}">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeAttr(description)}">
  <link rel="canonical" href="${SITE_URL}/${canonicalPaths[view]}">
  <link rel="stylesheet" href="css/style.css">
  <link rel="icon" href="img/logo.webp" type="image/webp">
</head>
<body>
  <header id="header">
    <a href="index.html" class="header-logo-link"><img class="logo" src="img/logo.webp" alt="Logo LAqP"></a>
    <div class="header-title">PES 2018 Actualizado <span>Base de datos</span></div>
    <nav class="header-nav" aria-label="Menu principal">
      <a href="downloads.html" class="header-nav-link">Option Files</a>
      <a href="tutorials.html" class="header-nav-link">Tutoriales</a>
      <a href="database.html" class="header-nav-link active">Base de datos</a>
    </nav>
    <div id="search-container">
      <span class="search-icon" aria-hidden="true">&#128269;</span>
      <input type="text" id="search-input" placeholder="Buscar jugadores..." data-i18n-placeholder="search.players" autocomplete="off">
    </div>
  </header>
  <div id="layout">
    <nav id="sidebar"></nav>
    <main id="main">
      <div id="loading-overlay" class="js-hydration-loader" style="display:none">
        <div class="spinner"></div>
        <span class="loading-message" data-i18n="loading.database">Cargando base de datos...</span>
      </div>
      <div id="home-view"></div>
      <div id="league-teams-view"></div>
      ${viewHtml('players-view', activeView, body)}
      <div id="player-view"></div>
      <div id="search-view"></div>
      ${viewHtml('leagues-view', activeView, body)}
      ${viewHtml('teams-grid-view', activeView, body)}
      <div id="favorites-view"></div>
    </main>
  </div>
  <script src="js/i18n.js"></script>
  <script src="js/site.js"></script>
  <script src="js/favorites.js"></script>
  <script src="js/app.js"></script>
</body>
</html>
`;
  };

  const renderPlayersBody = () => `
    <div class="breadcrumb-row"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="index.html">Inicio</a><a href="database.html">Base de datos</a><span>Jugadores</span></nav></div>
    <div class="view-header">
      <div>
        <h1 class="view-title">Jugadores</h1>
        <div class="view-subtitle">${directoryPlayers.length.toLocaleString('es-AR')} jugadores actualizados con stats, medias, equipos y referencias de edicion</div>
      </div>
    </div>
    <div class="table-responsive">
      <table class="players-table players-table--directory">
        <thead><tr><th></th><th>Jugador</th><th>Equipo</th><th>Pos</th><th>Media</th><th>Edad</th></tr></thead>
        <tbody>
          ${directoryPlayers.map(({ player, team }) => {
            const image = publicAsset(`img/players/${player.Id}.webp`) || 'img/players/default.webp';
            return `
            <tr>
              <td><img class="player-row-photo" src="${escapeAttr(image)}" alt="${attrText(player.Name)}" loading="lazy" onerror="this.onerror=null;this.src='img/players/default.webp'"></td>
              <td><a href="${playerUrl(player, team)}"><strong>${htmlText(player.Name)}</strong></a></td>
              <td><a href="${teamUrl(team)}">${htmlText(team.Name)}</a></td>
              <td><span class="position-badge">${htmlText(normalizePosition(player.POS))}</span></td>
              <td>${overallBadge(player.OverallStats)}</td>
              <td>${htmlText(player.Age || '-')}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

  const renderTeamCard = team => {
    const avg = teamAverage(team, data.squadByTeamId, data.playerById);
    const avgHtml = avg !== null ? `<span class="team-avg-badge" style="background:${statColor(avg)};color:${statTextColor(statColor(avg))}">${avg}</span>` : '';
    const squad = data.squadByTeamId.get(team.Id);
    let playerCount = 0;
    if (squad) {
      for (let index = 1; index <= 32; index += 1) {
        const id = squad[`Player ${index}`];
        if (id && id !== '0') playerCount += 1;
      }
    }
    const league = data.leagues.find(item => String(item.team_ids || '').split(',').map(id => id.trim()).includes(team.Id));
    return `
      <a class="grid-card db-index-card db-team-card" href="${teamUrl(team)}">
        <span class="grid-card-ovr">${avgHtml}</span>
        <img class="grid-card-img" src="img/teams/${escapeAttr(team.Id)}.webp" alt="${attrText(team.Name)}" loading="lazy" onerror="this.onerror=null;this.src='img/teams/default.webp'">
        <span class="grid-card-kicker">Equipo</span>
        <span class="grid-card-name">${htmlText(team.Name)}</span>
        <span class="grid-card-sub">${htmlText(league ? league.league_name : 'Sin liga')} - ${playerCount} jugadores</span>
        <span class="grid-card-action">Ver plantel</span>
      </a>`;
  };

  const renderTeamsBody = () => `
    <div class="breadcrumb-row"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="index.html">Inicio</a><a href="database.html">Base de datos</a><span>Equipos</span></nav></div>
    <div class="view-header">
      <div>
        <h1 class="view-title">Equipos</h1>
        <div class="view-subtitle">${data.publishedTeams.length.toLocaleString('es-AR')} equipos con plantillas modernas para PES 2018 actualizado</div>
      </div>
    </div>
    <div class="grid-cards" id="teams-grid-cards">${data.publishedTeams.map(renderTeamCard).join('')}</div>`;

  const renderLeagueCard = league => {
    const teamCount = String(league.team_ids || '').split(',').filter(Boolean).length;
    return `
      <a class="grid-card db-index-card db-league-card" href="${leagueUrl(league)}">
        <img class="grid-card-img" src="img/leagues/${escapeAttr(league.league_id)}.webp" alt="${attrText(league.league_name)}" loading="lazy" onerror="this.onerror=null;this.src='img/leagues/default.webp'">
        <span class="grid-card-kicker">Liga</span>
        <span class="grid-card-name">${htmlText(league.league_name)}</span>
        <span class="grid-card-sub">${teamCount} equipos</span>
        <span class="grid-card-action">Ver equipos</span>
      </a>`;
  };

  const renderLeaguesBody = () => `
    <div class="breadcrumb-row"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="index.html">Inicio</a><a href="database.html">Base de datos</a><span>Ligas</span></nav></div>
    <div class="view-header">
      <div>
        <h1 class="view-title">Ligas</h1>
        <div class="view-subtitle">${data.leagues.length.toLocaleString('es-AR')} ligas y competiciones ordenadas para PES 2018 actualizado</div>
      </div>
    </div>
    <div class="grid-cards" id="leagues-grid-cards">${data.leagues.map(renderLeagueCard).join('')}</div>`;

  write('database/v2/players/index.html', shell(
    'players',
    'Jugadores PES 2018 Actualizado - Stats, Caras y Medias',
    `Listado de jugadores para PES 2018 actualizado con stats, medias, equipos, posiciones, edad y referencias de caras/minifaces cuando estan disponibles.`,
    renderPlayersBody()
  ));
  write('database/v2/teams/index.html', shell(
    'teams',
    'Equipos PES 2018 Actualizado - Plantillas y Stats',
    `Equipos y plantillas actualizadas para PES 2018 con enlaces a jugadores, medias, posiciones y datos utiles para editar el juego.`,
    renderTeamsBody()
  ));
  write('database/v2/leagues/index.html', shell(
    'leagues',
    'Ligas PES 2018 Actualizado - Equipos y Plantillas',
    `Ligas y competiciones actualizadas para PES 2018 con equipos, plantillas y enlaces a fichas de jugadores editables.`,
    renderLeaguesBody()
  ));
}

function replaceBlockBefore(html, startNeedle, endNeedle, replacement) {
  const start = html.indexOf(startNeedle);
  if (start < 0) throw new Error(`No se encontro el bloque ${startNeedle}`);
  const end = html.indexOf(endNeedle, start);
  if (end < 0) throw new Error(`No se encontro el cierre ${endNeedle}`);
  return `${html.slice(0, start)}${replacement}${html.slice(end)}`;
}

function newsItems(data) {
  const items = [];
  data.news
    .slice()
    .sort((a, b) => String(b.date || b.fecha || '').localeCompare(String(a.date || a.fecha || '')))
    .forEach(row => {
      items.push({
        type: row.category || row.categoria || 'Canal',
        title: row.title || row.titulo || 'Novedad',
        description: row.description || row.descripcion || '',
        meta: row.date || row.fecha || '',
        href: row.link || row.url || '',
        cta: 'Ver relacionado',
      });
    });

  data.downloads
    .filter(row => String(row.destacado || '').trim() === '1')
    .slice(0, 3)
    .forEach(row => {
      items.push({
        type: 'Option File',
        title: row.titulo || `${row.juego || 'Option File'} ${row.version || ''}`.trim(),
        description: row.descripcion || 'Descarga destacada disponible.',
        meta: row.plataforma || '',
        href: 'downloads.html',
        cta: 'Ver descarga',
      });
    });

  data.tutorials
    .slice()
    .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))
    .slice(0, 2)
    .forEach(row => {
      items.push({
        type: 'Tutorial',
        title: row.titulo || 'Nuevo tutorial',
        description: row.descripcion || 'Contenido nuevo para PES 2018 actualizado.',
        meta: row.fecha || '',
        href: 'tutorials.html',
        cta: 'Ver tutorial',
      });
    });

  return items;
}

function renderNewsCard(item) {
  return `
    <article class="news-card">
      <div class="news-card-kicker">${htmlText(item.type)}</div>
      <h2 class="news-card-title">${htmlText(item.title)}</h2>
      <p class="news-card-desc">${htmlText(item.description)}</p>
      ${item.meta ? `<div class="news-card-meta">${htmlText(item.meta)}</div>` : ''}
      ${item.href ? `<a class="news-card-link" href="${escapeAttr(item.href)}">${htmlText(item.cta || 'Ver mas')}</a>` : ''}
    </article>`;
}

function renderNews(data) {
  let html = read('news.html');
  const items = newsItems(data);
  html = html.replace(/<div id="loading-overlay"[^>]*>/, '<div id="loading-overlay" style="display:none">');
  html = replaceBlockBefore(html, '<div id="news-content"', '\n  </main>', `<div id="news-content">
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="index.html">Inicio</a>
      <span>Novedades</span>
    </nav>
    <div class="page-section-header">
      <h1 class="page-section-title">Novedades</h1>
      <p class="page-section-subtitle">Actualizaciones de PES 2018: descargas, tutoriales, plantillas, stats y cambios importantes de la base de datos.</p>
    </div>
    <div class="news-grid">
      ${items.map(renderNewsCard).join('')}
    </div>
  </div>`);
  write('news.html', html);
}

function tacticSeasonStart(tactic) {
  const match = String(tactic.temporada || '').match(/\d{4}/);
  return match ? Number(match[0]) : 0;
}

function tacticFormation(tactic, key = 'formacion') {
  const label = cleanText(tactic[key] || tactic.formacion || '').trim();
  const excelDate = label.match(/^(\d{1,2})\/(\d{1,2})\/20(\d{2})$/);
  return excelDate ? `${Number(excelDate[1])}-${Number(excelDate[2])}-${Number(excelDate[3])}` : label;
}

function tacticList(value) {
  return String(value || '').split('|').map(item => item.trim()).filter(Boolean);
}

function tacticSettingRows(tactic, compact = false) {
  const rows = [
    ['Ataque', tactic.estilo_ataque],
    ['Construccion', tactic.construccion],
    ['Zona de ataque', tactic.zona_ataque],
    ['Posicionamiento', tactic.posicionamiento],
    ['Apoyo', tactic.rango_apoyo],
    ['Defensa', tactic.estilo_defensivo],
    ['Contencion', tactic.zona_contencion],
    ['Presion', tactic.presion],
    ['Linea defensiva', tactic.linea_defensiva],
    ['Compacidad', tactic.compacidad],
  ].filter(([, value]) => value);
  return (compact ? rows.slice(0, 6) : rows)
    .map(([label, value]) => `<div><dt>${htmlText(label)}</dt><dd>${htmlText(value)}</dd></div>`)
    .join('');
}

function renderTacticSettingsStatic(tactic, compact = false) {
  return `<dl class="history-tactic-settings${compact ? ' is-compact' : ''}">${tacticSettingRows(tactic, compact)}</dl>`;
}

function renderTacticPitchStatic(tactic, compact = false) {
  const players = tactic.players || [];
  const markers = players.map(player => {
    const name = player.nombre || 'Jugador';
    const position = player.posicion_inicial || player.posicion || '-';
    const x = Number(player.x_inicial || player.x) || 50;
    const y = Number(player.y_inicial || player.y) || 50;
    return `
      <span class="history-tactic-player" style="left:${x}%;top:${y}%" title="${attrText(`${name} - ${position}`)}">
        <span class="history-player-photo-wrap">
          <img src="database/tacticas/teams/${encodeURIComponent(tactic.id)}/${encodeURIComponent(player.id || '')}.webp" alt="${attrText(name)}" loading="lazy" onerror="this.onerror=null;this.src='img/players/default.webp'">
        </span>
        <span class="history-player-position">${htmlText(position)}</span>
        <span class="history-player-name${name.length > 11 ? ' is-long' : ''}"><span>${htmlText(name)}</span></span>
      </span>`;
  }).join('');
  return `
    <div class="history-tactic-pitch${compact ? ' is-compact' : ''}" aria-label="Formacion ${attrText(tacticFormation(tactic))}">
      <span class="history-pitch-half"></span>
      <span class="history-pitch-circle"></span>
      <span class="history-pitch-area history-pitch-area-top"></span>
      <span class="history-pitch-area history-pitch-area-bottom"></span>
      ${markers}
    </div>`;
}

function renderTacticCardStatic(tactic) {
  return `
    <article class="history-tactic-card">
      <div class="history-tactic-cover">
        <img class="history-tactic-cover-image" src="${escapeAttr(tactic.portada || 'assets/images/home-banner-main-2.png')}" alt="${attrText(`${tactic.equipo} ${tactic.temporada}`)}" loading="lazy" onerror="this.onerror=null;this.src='assets/images/home-banner-main-2.png'">
        <div class="history-tactic-cover-shade"></div>
        <img class="history-tactic-badge" src="${escapeAttr(tactic.escudo || 'img/teams/default.webp')}" alt="${attrText(tactic.equipo)}" loading="lazy" onerror="this.onerror=null;this.src='img/teams/default.webp'">
      </div>
      <div class="history-tactic-summary">
        <span class="history-tactic-season">${htmlText(tactic.temporada)}</span>
        <h2>${htmlText(tactic.equipo)}</h2>
        <strong>${htmlText(tactic.apodo)}</strong>
        <p>${htmlText(tactic.descripcion)}</p>
        <a class="history-secondary-button" href="${tacticUrl(tactic)}">Leer mas</a>
      </div>
      <div class="history-tactic-formation">
        <span>${htmlText(tacticFormation(tactic))}</span>
        ${renderTacticPitchStatic(tactic, true)}
      </div>
      <div class="history-tactic-actions">
        <span class="history-tactic-section-label">Ajustes clave en PES 2018</span>
        ${renderTacticSettingsStatic(tactic, true)}
        <a class="history-primary-button" href="${tacticUrl(tactic)}">Ver tactica completa</a>
      </div>
    </article>`;
}

function renderPopularTacticStatic(tactic) {
  return `
    <article class="history-popular-card">
      <div class="history-tactic-cover">
        <img class="history-tactic-cover-image" src="${escapeAttr(tactic.portada || 'assets/images/home-banner-main-2.png')}" alt="${attrText(`${tactic.equipo} ${tactic.temporada}`)}" loading="lazy" onerror="this.onerror=null;this.src='assets/images/home-banner-main-2.png'">
        <div class="history-tactic-cover-shade"></div>
        <img class="history-tactic-badge" src="${escapeAttr(tactic.escudo || 'img/teams/default.webp')}" alt="${attrText(tactic.equipo)}" loading="lazy" onerror="this.onerror=null;this.src='img/teams/default.webp'">
      </div>
      <div class="history-tactic-summary">
        <span class="history-tactic-season">${htmlText(tactic.temporada)}</span>
        <h2>${htmlText(tactic.equipo)}</h2>
        <strong>${htmlText(tactic.apodo)}</strong>
        <p>${htmlText(tactic.descripcion)}</p>
        <a class="history-primary-button" href="${tacticUrl(tactic)}">Ver tactica</a>
      </div>
    </article>`;
}

function sortedTactics(data) {
  return data.tactics.slice().sort((a, b) => tacticSeasonStart(b) - tacticSeasonStart(a)
    || cleanText(a.equipo).localeCompare(cleanText(b.equipo), 'es'));
}

function renderTacticsIndexContent(data) {
  const tactics = sortedTactics(data);
  const popular = tactics.slice(0, 4);
  return `
    <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="index.html">Inicio</a><span>Tacticas</span></nav>
    <section class="history-tactics-hero">
      <div class="history-tactics-hero-copy">
        <span class="history-kicker">Futbol historico en PES 2018</span>
        <h1>Tacticas</h1>
        <p>Reviví equipos que marcaron una epoca con esquemas y ajustes listos para recrear.</p>
      </div>
    </section>
    <div class="history-list-heading">
      <div><span class="history-kicker">Mas vistas</span><h2>Tacticas populares</h2></div>
    </div>
    <section id="history-popular-tactics-list" class="history-tactics-list history-popular-tactics-list" aria-label="Tacticas populares">${popular.map(renderPopularTacticStatic).join('')}</section>
    <div class="history-list-heading">
      <div><span class="history-kicker">Coleccion LAqP</span><h2>Todas las tacticas</h2></div>
      <strong>${tactics.length} tacticas</strong>
    </div>
    <section id="history-tactics-list" class="history-tactics-list" aria-label="Listado de tacticas">${tactics.map(renderTacticCardStatic).join('')}</section>`;
}

function renderTacticDetailContent(tactic, allTactics) {
  const keys = tacticList(tactic.claves);
  const related = allTactics.filter(item => item.id !== tactic.id).slice(0, 3);
  return `
    <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="index.html">Inicio</a><a href="tactics.html">Tacticas</a><span>${htmlText(tactic.equipo)}</span></nav>
    <section class="history-detail-hero">
      <img class="history-detail-cover" src="${escapeAttr(tactic.portada || 'assets/images/home-banner-main-2.png')}" alt="${attrText(`${tactic.equipo} ${tactic.temporada}`)}" loading="eager" onerror="this.onerror=null;this.src='assets/images/home-banner-main-2.png'">
      <div class="history-detail-shade"></div>
      <div class="history-detail-copy">
        <img class="history-detail-badge" src="${escapeAttr(tactic.escudo || 'img/teams/default.webp')}" alt="${attrText(tactic.equipo)}" loading="eager" onerror="this.onerror=null;this.src='img/teams/default.webp'">
        <div>
          <span class="history-kicker">${htmlText(tactic.temporada)} - ${htmlText(tactic.region)}</span>
          <h1>${htmlText(tactic.equipo)}</h1>
          <strong>${htmlText(tactic.apodo)}</strong>
          <p>${htmlText(tactic.descripcion)}</p>
        </div>
      </div>
    </section>
    <section class="history-detail-grid">
      <article class="history-detail-panel history-detail-formation">
        <div class="history-detail-panel-head"><span class="history-kicker">Formacion</span><h2>${htmlText(tacticFormation(tactic))}</h2></div>
        ${renderTacticPitchStatic(tactic)}
      </article>
      <div class="history-detail-side">
        <article class="history-detail-panel">
          <div class="history-detail-panel-head"><span class="history-kicker">Configuracion</span><h2>Ajustes en PES 2018</h2></div>
          ${renderTacticSettingsStatic(tactic)}
          ${keys.length ? `<div class="history-key-list">${keys.map(key => `<span>${htmlText(key)}</span>`).join('')}</div>` : ''}
        </article>
        <section class="history-related">
          <div class="history-list-heading"><div><span class="history-kicker">Segui explorando</span><h2>Otras tacticas</h2></div><a href="tactics.html">Ver todas</a></div>
          <div class="history-related-grid">${related.map(item => `<a href="${tacticUrl(item)}"><img class="history-related-badge" src="${escapeAttr(item.escudo || 'img/teams/default.webp')}" alt="${attrText(item.equipo)}" loading="lazy" onerror="this.onerror=null;this.src='img/teams/default.webp'"><span><strong>${htmlText(item.equipo)}</strong><small>${htmlText(item.temporada)} - ${htmlText(tacticFormation(item))}</small></span></a>`).join('')}</div>
        </section>
      </div>
    </section>`;
}

function renderTactics(data) {
  let html = read('tactics.html');
  html = html.replace(/<div id="tactics-loading"[^>]*>/, '<div id="tactics-loading" class="tactics-loading" style="display:none">');
  html = replaceBlockBefore(html, '<div id="tactics-content"', '\n  </main>', `<div id="tactics-content" class="js-prerender-fallback">${renderTacticsIndexContent(data)}</div>`);
  write('tactics.html', html);

  const allTactics = sortedTactics(data);
  allTactics.forEach(tactic => {
    let detail = html;
    if (!detail.includes('<base href="/">')) detail = detail.replace('<head>', '<head>\n  <base href="/">');
    const title = `${cleanText(tactic.equipo)} ${cleanText(tactic.temporada)} - Tactica PES 2018 | LAqP`;
    const description = `${cleanText(tactic.equipo)} ${cleanText(tactic.temporada)} en PES 2018: formacion ${tacticFormation(tactic)}, ajustes, instrucciones y claves para recrear la tactica.`;
    detail = setMeta(detail, 'title', title);
    detail = setMeta(detail, 'description', description);
    detail = setMeta(detail, 'canonical', `${SITE_URL}${tacticUrl(tactic)}`);
    detail = replaceBlockBefore(detail, '<div id="tactics-content"', '\n  </main>', `<div id="tactics-content" class="js-prerender-fallback">${renderTacticDetailContent(tactic, allTactics)}</div>`);
    write(path.join(tacticUrl(tactic), 'index.html').replace(/^\//, ''), detail);
  });
}

function writeAudit(data) {
  const content = `# Auditoria AdSense LAqP.website

Fecha de auditoria: ${new Date().toISOString().slice(0, 10)}

## Problemas encontrados

| Prioridad | Problema | Archivos afectados | Solucion aplicada |
| --- | --- | --- | --- |
| Alta | El HTML inicial de tutoriales y descargas contenia solo cargadores y contenedores vacios. | tutorials.html, downloads.html | Se agrego prerender desde CSV con tarjetas reales en el codigo fuente. |
| Alta | La portada de base de datos mostraba contadores en cero y listados vacios hasta ejecutar JavaScript. | database.html | El build inserta cantidades reales, introduccion, destacados y enlaces noscript desde los CSV. |
| Alta | Las paginas de detalle de descarga dependian de parametros y se armaban solo por JavaScript. | downloads.html, download/* | Se generan paginas HTML estaticas para cada descarga completa. |
| Media | El sitemap no se generaba desde las fuentes de datos actuales. | sitemap.xml | El build genera sitemap con secciones principales, guias, descargas y fichas con datos. |
| Media | robots.txt debia dejar claro que CSS, JS, CSV, JSON e imagenes son rastreables. | robots.txt | Se actualizo robots.txt para permitir contenido publico y Mediapartners-Google. |
| Media | No habia comando unico documentado para generar la version publicable. | package.json, README.md | Se agregaron npm run build y npm run validate-site con documentacion. |
| Media | Faltaba validacion automatica de H1, metadatos, enlaces e imagenes sin alt. | scripts/validate-site.js | Se agrego validador que produce VALIDATION_REPORT.md. |
| Media | Las paginas shell heredadas de jugador, equipo, liga y novedades pueden quedar vacias si se indexan directamente. | player.html, team.html, league.html, news.html | Se mantienen como rutas de soporte, pero deben quedar con noindex, follow; las URLs indexables son las paginas estaticas canonicas. |
| Baja | Algunas herramientas siguen siendo principalmente interactivas y tienen margen para mas contenido estatico. | rankings.html, tactics.html, calculadora-medias.html, database/DTs/ | Documentado como mejora futura; no se desactivo ninguna herramienta. |

## Fuentes de datos detectadas

- Jugadores: \`database/All players exported.csv\`
- Equipos: \`database/All teams exported.csv\`
- Planteles: \`database/All squads exported.csv\`
- Ligas: \`database/All leagues exported.csv\`
- Descargas: \`database/descargas.csv\`
- Tutoriales: \`database/tutoriales.csv\`
- Guias escritas: \`database/guias.json\`

## Cambios finalmente realizados

- Se creo \`scripts/build-site.js\` para prerenderizar contenido principal desde CSV/JSON.
- Se creo \`scripts/validate-site.js\` para auditoria automatica local.
- Se agrego \`package.json\` con \`npm run build\` y \`npm run validate-site\`.
- Se agrego \`README.md\` con el flujo de generacion para GitHub Pages.
- \`database.html\` ahora incluye contenido real en el HTML inicial: introduccion, conteos, destacados y enlaces sin JavaScript.
- \`tutorials.html\` ahora incluye tutoriales reales en el HTML inicial.
- \`downloads.html\` ahora incluye descargas reales en el HTML inicial.
- Se generan paginas individuales en \`download/<id>/index.html\` para descargas completas.
- Se regeneran \`robots.txt\` y \`sitemap.xml\` desde el build.

## Pendientes recomendados

- Publicar la version generada: la web publicada debe coincidir con el HTML prerenderizado del repositorio para que Google vea el contenido inicial.
- Ampliar prerender editorial de herramientas si se detecta otro rechazo despues de esta correccion principal.
- Definir una configuracion central explicita de fecha de base de datos si se prefiere no calcularla desde descargas/tutoriales.

## Resumen de datos generados

- Jugadores publicados detectados: ${data.publishedPlayers.length}
- Equipos publicados detectados: ${data.publishedTeams.length}
- Ligas detectadas: ${data.leagues.length}
- Descargas detectadas: ${data.downloads.length}
- Tutoriales detectados: ${data.tutorials.length}
- Guias escritas detectadas: ${data.guides.length}
`;
  write('ADSENSE_AUDIT.md', content);
}

function main() {
  const data = loadData();
  renderHome(data);
  renderDatabase(data);
  renderTutorials(data);
  renderGuidesIndex(data);
  renderDownloads(data);
  renderStaticArticles(data);
  renderDatabaseListPages(data);
  renderNews(data);
  renderTactics(data);
  renderSitemap(data);
  writeAudit(data);
  execFileSync(process.execPath, [path.join(__dirname, 'create-missing-database-html.js'), '--force'], { stdio: 'inherit' });
  console.log(`Build LAqP listo: ${data.publishedPlayers.length} jugadores, ${data.publishedTeams.length} equipos, ${data.leagues.length} ligas.`);
}

main();
