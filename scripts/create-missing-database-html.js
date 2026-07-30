'use strict';

const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://laqp.website';
const rootDir = path.resolve(__dirname, '..');
const databaseDir = path.join(rootDir, 'database');
const VERBOSE = process.env.LAQP_VERBOSE === '1';

function normalizeVersion(value) {
  const version = String(value || 'v2').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(version)) {
    throw new Error(`Version invalida: "${value}". Usa nombres como v2, v3 o 2026.`);
  }
  return version;
}

function getArgValue(name) {
  const inline = process.argv.find(arg => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function resolveVersion() {
  return normalizeVersion(
    process.env.LAQP_DATABASE_VERSION ||
    getArgValue('--version') ||
    process.argv.slice(2).find(arg => arg && !arg.startsWith('-')) ||
    'v2',
  );
}

function parseCsv(csvText) {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return [];

  const delimiter = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const parseLine = line => {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];
      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        index += 1;
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
  return lines.slice(1).filter(line => line.trim()).map(line => {
    const values = parseLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
  });
}

function readCsv(fileName) {
  return parseCsv(fs.readFileSync(path.join(databaseDir, fileName), 'utf8'));
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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function playerImagePath(playerId) {
  const id = String(playerId || '').trim();
  if (!id) return 'img/players/default.webp';

  const relativePath = `img/players/${encodeURIComponent(id)}.webp`;
  const localPath = path.join(rootDir, 'img', 'players', `${id}.webp`);
  return fs.existsSync(localPath) ? relativePath : 'img/players/default.webp';
}

function hydrationGateScript() {
  return `<script>document.documentElement.classList.add('laqp-js');window.setTimeout(function(){document.documentElement.classList.add('laqp-js-timeout');},6000);</script>`;
}

function prepareTemplate(fileName, options) {
  let html = fs.readFileSync(path.join(rootDir, fileName), 'utf8');
  html = html.replace(/<head>/, `<head>\n  <base href="/">\n  ${options.embeddedMeta || ''}`);
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(options.title)}</title>`);
  html = html.replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeHtml(options.description)}" />`);
  html = html.replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${options.absoluteUrl}" />`);
  html = html.replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${escapeHtml(options.title)}" />`);
  html = html.replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${escapeHtml(options.description)}" />`);
  html = html.replace(/<meta property="og:image" content="[^"]*" \/>/, `<meta property="og:image" content="${options.imageUrl}" />`);
  html = html.replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${options.absoluteUrl}" />`);
  html = html.replace(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${escapeHtml(options.title)}" />`);
  html = html.replace(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${escapeHtml(options.description)}" />`);
  html = html.replace(/<meta name="twitter:image" content="[^"]*" \/>/, `<meta name="twitter:image" content="${options.imageUrl}" />`);
  return html;
}

function playerHtml(player, team, pathname) {
  const playerName = escapeHtml(player.Name || 'Jugador');
  const teamName = escapeHtml(team.Name || team.Id);
  const playerId = escapeHtml(player.Id);
  const description = `${playerName} para PES 2018 actualizado: stats, media ${escapeHtml(player.OverallStats || '-')}, equipo ${teamName}, posicion, datos de apariencia y referencias para editar su cara/miniface.`;
  const absoluteUrl = `${SITE_URL}${pathname}`;
  const imagePath = playerImagePath(player.Id);
  const imageUrl = `${SITE_URL}/${imagePath}`;
  const statNames = [
    'Attacking Prowess', 'Ball Control', 'Dribbling', 'Low Pass', 'Lofted Pass',
    'Finishing', 'Header', 'Defensive Prowess', 'Ball Winning', 'Kicking Power',
    'Speed', 'Explosive Power', 'Physical Contact', 'Jump', 'Stamina',
    'Goalkeeping', 'Catching', 'Clearing', 'Reflexes', 'Coverage',
  ];
  const statsRows = statNames
    .filter(name => player[name])
    .map(name => `<tr><th>${escapeHtml(name)}</th><td>${escapeHtml(player[name])}</td></tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <base href="/">
  ${hydrationGateScript()}
  <script src="js/consent-mode.js"></script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="laqp-player-id" content="${escapeHtml(player.Id)}">
  <meta name="laqp-team-id" content="${escapeHtml(team.Id)}">
  <title>${playerName} PES 2018 Actualizado - Stats, Cara y Media</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${absoluteUrl}">
  <meta property="og:title" content="${playerName} #${playerId} - ${teamName} | PES 2018">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:url" content="${absoluteUrl}">
  <meta property="og:type" content="profile">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${playerName} #${playerId} - ${teamName} | PES 2018">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">
  <link rel="stylesheet" href="css/style.css">
  <link rel="icon" href="img/logo.webp" type="image/webp">
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
    <div class="header-title">PES 2018 Actualizado <span>Stats y caras</span></div>
    <nav class="header-nav" aria-label="Menu principal"></nav>
  </header>
  <div id="player-page">
    <div id="loading-overlay" class="js-hydration-loader" style="display:none">
      <div class="spinner"></div>
      <span class="loading-message" data-i18n="loading.player">Cargando jugador...</span>
    </div>
    <div id="player-content">
      <div class="js-prerender-fallback">
      <nav class="breadcrumbs" aria-label="Breadcrumb">
        <a href="index.html">Inicio</a>
        <a href="database.html">Base de datos</a>
        <a href="${teamUrlPath(team)}">${teamName}</a>
        <span>${playerName}</span>
      </nav>
      <article class="player-static-detail db-panel">
        <header class="player-static-header">
          <img src="${escapeHtml(imagePath)}" alt="Miniface de ${playerName}" width="120" height="120" loading="eager" onerror="this.onerror=null;this.src='img/players/default.webp'">
          <div>
            <h1>${playerName}</h1>
            <p>${description}</p>
            <div class="download-card-header">
              <span class="download-platform-badge">Media ${escapeHtml(player.OverallStats || '-')}</span>
              <span class="download-version-badge">${escapeHtml(player.POS || 'POS')}</span>
              <span class="download-version-badge">${escapeHtml(player.Age || '-')} años</span>
            </div>
          </div>
        </header>
        <section class="download-detail-grid">
          <div>
            <h2>Datos principales</h2>
            <ul>
              <li>Equipo: <a href="${teamUrlPath(team)}">${teamName}</a></li>
              <li>ID jugador: ${playerId}</li>
              <li>Nacionalidad ID: ${escapeHtml(player.Country || '-')}</li>
              <li>Altura: ${escapeHtml(player.Height || '-')} cm</li>
              <li>Peso: ${escapeHtml(player.Weight || '-')} kg</li>
              <li>Pierna habil: ${escapeHtml(player.Foot || '-')}</li>
            </ul>
          </div>
          <div>
            <h2>Estadisticas PES 2018</h2>
            <table class="static-stats-table"><tbody>${statsRows}</tbody></table>
          </div>
        </section>
      </article>
      <noscript><p>Esta ficha contiene datos estaticos para editar el jugador en PES 2018 actualizado.</p></noscript>
      </div>
    </div>
  </div>
  <script src="js/i18n.js"></script>
  <script src="js/site.js"></script>
  <script src="js/favorites.js"></script>
  <script src="js/player.js"></script>
</body>
</html>
`;
}

function teamUrlPath(team) {
  return `/team/v2/${slugify(team.Name)}-${encodeURIComponent(team.Id)}/`;
}

function leagueUrlPath(league) {
  return `/league/v2/${slugify(league.league_name)}-${encodeURIComponent(league.league_id)}/`;
}

function teamHtml(team, squadPlayers, pathname) {
  const teamName = escapeHtml(team.Name || 'Equipo');
  const absoluteUrl = `${SITE_URL}${pathname}`;
  const description = `${teamName} para PES 2018 actualizado: plantilla moderna, jugadores, medias, posiciones y enlaces a fichas de stats y caras.`;
  const rows = squadPlayers.slice(0, 32).map(player => `
              <tr>
                <td><a href="/player/v2/${encodeURIComponent(team.Id)}/${slugify(player.Name)}-${encodeURIComponent(player.Id)}/">${escapeHtml(player.Name)}</a></td>
                <td>${escapeHtml(player.POS || '-')}</td>
                <td>${escapeHtml(player.OverallStats || '-')}</td>
                <td>${escapeHtml(player.Age || '-')}</td>
              </tr>`).join('');
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <base href="/">
  ${hydrationGateScript()}
  <script src="js/consent-mode.js"></script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="laqp-team-id" content="${escapeHtml(team.Id)}">
  <title>${teamName} PES 2018 Actualizado - Plantilla y Stats</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${absoluteUrl}">
  <meta property="og:title" content="${teamName} PES 2018 Actualizado - Plantilla y Stats">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${SITE_URL}/img/teams/${encodeURIComponent(team.Id)}.webp">
  <meta property="og:url" content="${absoluteUrl}">
  <meta property="og:type" content="website">
  <link rel="stylesheet" href="css/style.css">
  <link rel="icon" href="img/logo.webp" type="image/webp">
</head>
<body>
  <header id="header">
    <a href="index.html" class="header-logo-link"><img class="logo" src="img/logo.webp" alt="Logo LAqP"></a>
    <div class="header-title">PES 2018 Actualizado <span>Plantillas y stats</span></div>
    <nav class="header-nav" aria-label="Menu principal"></nav>
  </header>
  <div id="team-page">
    <div id="loading-overlay" class="js-hydration-loader" style="display:none"><div class="spinner"></div><span class="loading-message">Cargando equipo...</span></div>
    <div id="team-content">
      <div class="js-prerender-fallback">
      <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="index.html">Inicio</a><a href="database.html">Base de datos</a><span>${teamName}</span></nav>
      <article class="db-panel team-static-detail">
        <header class="player-static-header">
          <img src="img/teams/${escapeHtml(team.Id)}.webp" alt="Escudo de ${teamName}" width="120" height="120" loading="eager" onerror="this.onerror=null;this.src='img/teams/default.webp'">
          <div><h1>${teamName}</h1><p>${escapeHtml(description)}</p><p>${squadPlayers.length} jugadores detectados en la plantilla exportada.</p></div>
        </header>
        <section><h2>Plantilla</h2><table class="static-stats-table"><thead><tr><th>Jugador</th><th>Pos</th><th>Media</th><th>Edad</th></tr></thead><tbody>${rows}</tbody></table></section>
      </article>
      </div>
    </div>
  </div>
  <script src="js/i18n.js"></script>
  <script src="js/site.js"></script>
  <script src="js/favorites.js"></script>
  <script src="js/team.js"></script>
</body>
</html>
`;
}

function leagueHtml(league, leagueTeams, pathname) {
  const leagueName = escapeHtml(league.league_name || 'Liga');
  const absoluteUrl = `${SITE_URL}${pathname}`;
  const teamCount = leagueTeams.length;
  const description = `${leagueName} para PES 2018 actualizado: ${teamCount} equipos, plantillas modernas, escudos, stats y enlaces a jugadores editables.`;
  const rows = leagueTeams.map(team => `
              <tr>
                <td><a href="${teamUrlPath(team)}">${escapeHtml(team.Name)}</a></td>
                <td>${escapeHtml(team.Id)}</td>
                <td>${escapeHtml(team.Country || '-')}</td>
              </tr>`).join('');
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <base href="/">
  ${hydrationGateScript()}
  <script src="js/consent-mode.js"></script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="laqp-league-id" content="${escapeHtml(league.league_id)}">
  <title>${leagueName} PES 2018 Actualizado - Equipos y Plantillas</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${absoluteUrl}">
  <meta property="og:title" content="${leagueName} PES 2018 Actualizado - Equipos y Plantillas">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${SITE_URL}/img/logo.webp">
  <meta property="og:url" content="${absoluteUrl}">
  <meta property="og:type" content="website">
  <link rel="stylesheet" href="css/style.css">
  <link rel="icon" href="img/logo.webp" type="image/webp">
</head>
<body>
  <header id="header">
    <a href="index.html" class="header-logo-link"><img class="logo" src="img/logo.webp" alt="Logo LAqP"></a>
    <div class="header-title">PES 2018 Actualizado <span>Ligas y plantillas</span></div>
    <nav class="header-nav" aria-label="Menu principal"></nav>
  </header>
  <div id="league-page">
    <div id="loading-overlay" class="js-hydration-loader" style="display:none"><div class="spinner"></div><span class="loading-message">Cargando liga...</span></div>
    <div id="league-content">
      <div class="js-prerender-fallback">
      <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="index.html">Inicio</a><a href="database.html">Base de datos</a><span>${leagueName}</span></nav>
      <article class="db-panel league-static-detail">
        <h1>${leagueName}</h1>
        <p>${escapeHtml(description)}</p>
        <section>
          <h2>Que incluye esta liga</h2>
          <p>Esta pagina agrupa los equipos actualizados de ${leagueName} para PES 2018. Desde cada equipo podes abrir su plantilla completa, revisar medias, posiciones y enlaces hacia fichas individuales.</p>
          <p>Los datos funcionan como referencia para editar el juego: plantillas, stats, equipos, ligas y caras/minifaces cuando estan disponibles.</p>
        </section>
        <section><h2>Equipos</h2><table class="static-stats-table"><thead><tr><th>Equipo</th><th>ID</th><th>Nacionalidad</th></tr></thead><tbody>${rows}</tbody></table></section>
      </article>
      </div>
    </div>
  </div>
  <script src="js/i18n.js"></script>
  <script src="js/site.js"></script>
  <script src="js/league.js"></script>
</body>
</html>
`;
}

function wait(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writeFileWithRetry(filePath, html) {
  const retryable = new Set(['UNKNOWN', 'EBUSY', 'EPERM', 'EACCES']);
  let lastError;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === html) return;
      fs.writeFileSync(filePath, html, 'utf8');
      return;
    } catch (error) {
      lastError = error;
      if (!retryable.has(error.code) || attempt === 11) break;
      wait(150 * (attempt + 1));
    }
  }
  throw lastError;
}

function writeMissingPage(relativeDir, html, options, stats, label) {
  const outputDir = path.join(rootDir, relativeDir);
  const filePath = path.join(outputDir, 'index.html');
  const exists = fs.existsSync(filePath);

  if (exists && !options.force) {
    stats.skipped += 1;
    return;
  }

  if (options.dryRun) {
    stats.planned += 1;
    if (VERBOSE) console.log(`[dry-run] ${exists ? 'Regeneraria' : 'Crearia'} ${label}: ${relativeDir}/index.html`);
    return;
  }

  fs.mkdirSync(outputDir, { recursive: true });
  writeFileWithRetry(filePath, html);
  stats.created += 1;
  if (VERBOSE) console.log(`${exists ? 'Regenerado' : 'Creado'} ${label}: ${relativeDir}/index.html`);
}

function teamIdsFromLeagues(leagues) {
  return new Set(
    leagues.flatMap(league => String(league.team_ids || '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)),
  );
}

function main() {
  const version = resolveVersion();
  const options = {
    force: hasFlag('--force'),
    dryRun: hasFlag('--dry-run'),
  };
  const onlyArg = getArgValue('--only');
  const only = new Set(String(onlyArg || 'leagues,teams,players').split(',').map(item => item.trim()).filter(Boolean));

  const players = readCsv('All players exported.csv');
  const teams = readCsv('All teams exported.csv');
  const squads = readCsv('All squads exported.csv');
  const leagues = readCsv('All leagues exported.csv');

  const playerById = new Map(players.map(player => [player.Id, player]));
  const teamById = new Map(teams.map(team => [team.Id, team]));
  const squadByTeamId = new Map(squads.map(squad => [squad.Id, squad]));
  const publishedTeamIds = teamIdsFromLeagues(leagues);
  const stats = { created: 0, planned: 0, skipped: 0 };

  if (only.has('leagues')) {
    leagues.forEach(league => {
      if (!league.league_id || !league.league_name) return;
      const slug = `${slugify(league.league_name)}-${league.league_id}`;
      const relativeDir = `league/${version}/${slug}`;
      const pathname = `/league/${version}/${slug}/`;
      const leagueTeams = String(league.team_ids || '').split(',').map(id => teamById.get(id.trim())).filter(Boolean);
      const html = leagueHtml(league, leagueTeams, pathname);
      writeMissingPage(relativeDir, html, options, stats, 'liga');
    });
  }

  if (only.has('teams')) {
    publishedTeamIds.forEach(teamId => {
      const team = teamById.get(teamId);
      if (!team || !team.Name || team.Name === '-') return;
      const slug = `${slugify(team.Name)}-${team.Id}`;
      const relativeDir = `team/${version}/${slug}`;
      const pathname = `/team/${version}/${slug}/`;
      const squad = squadByTeamId.get(team.Id);
      const squadPlayers = [];
      if (squad) {
        for (let index = 1; index <= 32; index += 1) {
          const player = playerById.get(squad[`Player ${index}`]);
          if (player && player.Id && player.Name) squadPlayers.push(player);
        }
      }
      const html = teamHtml(team, squadPlayers, pathname);
      writeMissingPage(relativeDir, html, options, stats, 'equipo');
    });
  }

  if (only.has('players')) {
    publishedTeamIds.forEach(teamId => {
      const team = teamById.get(teamId);
      const squad = squadByTeamId.get(teamId);
      if (!team || !team.Name || team.Name === '-' || !squad) return;

      for (let index = 1; index <= 32; index += 1) {
        const player = playerById.get(squad[`Player ${index}`]);
        if (!player || !player.Id || !player.Name) continue;

        const playerSlug = `${slugify(player.Name, 'jugador')}-${player.Id}`;
        const relativeDir = `player/${version}/${team.Id}/${playerSlug}`;
        const pathname = `/player/${version}/${encodeURIComponent(team.Id)}/${playerSlug}/`;
        writeMissingPage(relativeDir, playerHtml(player, team, pathname), options, stats, 'jugador');
      }
    });
  }

  const action = options.dryRun ? 'planificadas' : 'creadas';
  console.log(`\nListo: ${stats.created || stats.planned} paginas ${action}, ${stats.skipped} existentes omitidas.`);
  if (!options.force && stats.skipped) console.log('Tip: usa --force si queres regenerar tambien las existentes.');
}

main();
