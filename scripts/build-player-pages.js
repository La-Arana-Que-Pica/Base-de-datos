'use strict';

const fs = require('fs');
const path = require('path');

const VERSION = resolveVersion();
const SITE_URL = 'https://laqp.website';
const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, 'player', VERSION);
const databaseDir = path.join(rootDir, 'database');

function normalizeVersion(value) {
  const version = String(value || 'v2').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(version)) {
    throw new Error(`Version invalida: "${value}". Usa nombres como v2, v3 o 2026.`);
  }
  return version;
}

function resolveVersion() {
  const versionFlag = process.argv.find(arg => arg.startsWith('--version='));
  const versionFromFlag = versionFlag ? versionFlag.slice('--version='.length) : '';
  const versionFromArgs = process.argv.slice(2).find(arg => arg && !arg.startsWith('-'));
  return normalizeVersion(process.env.LAQP_DATABASE_VERSION || versionFromFlag || versionFromArgs || 'v2');
}

function parseCsv(csvText) {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(';').map(value => value.trim());
  return lines.slice(1).filter(Boolean).map(line => {
    const values = line.split(';').map(value => value.trim());
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
  });
}

function readCsv(fileName) {
  return parseCsv(fs.readFileSync(path.join(databaseDir, fileName), 'utf8'));
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'jugador';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(value) {
  return escapeHtml(value);
}

function pageHtml(player, team, pathname) {
  const playerName = escapeHtml(player.Name || 'Jugador');
  const teamName = escapeHtml(team.Name || team.Id);
  const description = `${playerName} en PES 2018 actualizado: media ${escapeHtml(player.OverallStats || '-')}, equipo ${teamName}, stats, posiciones y apariencia.`;
  const absoluteUrl = `${SITE_URL}${pathname}`;
  const imageUrl = `${SITE_URL}/img/players/${encodeURIComponent(player.Id)}.webp`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <base href="/">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="laqp-player-id" content="${escapeHtml(player.Id)}">
  <meta name="laqp-team-id" content="${escapeHtml(team.Id)}">
  <title>${playerName} - ${teamName} | Base de datos PES 2018 LAqP</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${absoluteUrl}">
  <meta property="og:title" content="${playerName} - ${teamName} | PES 2018">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:url" content="${absoluteUrl}">
  <meta property="og:type" content="profile">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${playerName} - ${teamName} | PES 2018">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">
  <link rel="stylesheet" href="css/style.css">
  <link rel="icon" href="img/logo.png" type="image/webp">
  <script src="js/ads.js"></script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-M7ZNDRZB27"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-M7ZNDRZB27');
  </script>
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5301686002102491" crossorigin="anonymous"></script>
</head>
<body>
  <header id="header">
    <a href="index.html" class="header-logo-link">
      <img class="logo" src="img/logo.webp" alt="Logo">
    </a>
    <div class="header-title">Base de datos Option File <span>PES 2018-2026</span></div>
    <nav class="header-nav" aria-label="Menu principal"></nav>
  </header>
  <div id="player-page">
    <div id="loading-overlay">
      <div class="spinner"></div>
      <span class="loading-message" data-i18n="loading.player">Cargando jugador...</span>
    </div>
    <div id="player-content" style="display:none"></div>
  </div>
  <div class="ad-bootstrap ad-bootstrap--profile" aria-hidden="true">
    <aside class="ad-slot" aria-label="Publicidad" data-ad-slot="player-top" data-ad-unit="responsive" data-ad-format="responsive" data-ad-context="profile" data-ad-state="pending"><span class="ad-slot__label">Publicidad</span><div class="ad-slot__content"><script>window.LAQPAds.render(document.currentScript.closest('.ad-slot'));</script></div></aside>
    <aside class="ad-slot" aria-label="Publicidad" data-ad-slot="player-mid" data-ad-unit="rectangle" data-ad-format="300x250" data-ad-context="profile" data-ad-state="pending"><span class="ad-slot__label">Publicidad</span><div class="ad-slot__content"><script>window.LAQPAds.render(document.currentScript.closest('.ad-slot'));</script></div></aside>
    <aside class="ad-slot" aria-label="Publicidad" data-ad-slot="player-bottom" data-ad-unit="native" data-ad-format="native" data-ad-context="profile" data-ad-state="pending"><span class="ad-slot__label">Publicidad</span><div class="ad-slot__content"><script>window.LAQPAds.render(document.currentScript.closest('.ad-slot'));</script></div></aside>
  </div>
  <script src="js/i18n.js"></script>
  <script src="js/site.js"></script>
  <script src="js/favorites.js"></script>
  <script src="js/player.js"></script>
</body>
</html>
`;
}

function main() {
  const players = readCsv('All players exported.csv');
  const teams = readCsv('All teams exported.csv');
  const squads = readCsv('All squads exported.csv');
  const leagues = readCsv('All leagues exported.csv');

  const playerById = new Map(players.map(player => [player.Id, player]));
  const teamById = new Map(teams.map(team => [team.Id, team]));
  const publishedTeamIds = new Set(
    leagues.flatMap(league => String(league.team_ids || '').split(',').map(id => id.trim()).filter(Boolean))
  );
  const pages = [];

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  squads.forEach(squad => {
    if (!publishedTeamIds.has(squad.Id)) return;
    const team = teamById.get(squad.Id);
    if (!team || !team.Name || team.Name === '-') return;

    for (let index = 1; index <= 32; index += 1) {
      const player = playerById.get(squad[`Player ${index}`]);
      if (!player) continue;

      const playerSlug = `${slugify(player.Name)}-${player.Id}`;
      const playerDir = path.join(outputDir, team.Id, playerSlug);
      const pathname = `/player/${VERSION}/${encodeURIComponent(team.Id)}/${playerSlug}/`;

      fs.mkdirSync(playerDir, { recursive: true });
      fs.writeFileSync(path.join(playerDir, 'index.html'), pageHtml(player, team, pathname), 'utf8');
      pages.push(pathname);
    }
  });

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
    .map(pathname => `  <url><loc>${escapeXml(`${SITE_URL}${pathname}`)}</loc><changefreq>weekly</changefreq><priority>0.75</priority></url>`)
    .join('\n')}\n</urlset>\n`;
  fs.writeFileSync(path.join(rootDir, `sitemap-players-${VERSION}.xml`), sitemap, 'utf8');

  console.log(`Generated ${pages.length} player pages in player/${VERSION}.`);
}

main();
