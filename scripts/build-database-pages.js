'use strict';

const fs = require('fs');
const path = require('path');

const VERSION = resolveVersion();
const SITE_URL = 'https://laqp.website';
const rootDir = path.resolve(__dirname, '..');
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
    .replace(/^-+|-+$/g, '') || 'item';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function writePage(relativeDir, html) {
  const outputDir = path.join(rootDir, relativeDir);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'index.html'), html, 'utf8');
}

function main() {
  const teams = readCsv('All teams exported.csv');
  const leagues = readCsv('All leagues exported.csv');
  const teamById = new Map(teams.map(team => [team.Id, team]));
  const publishedTeamIds = new Set(
    leagues.flatMap(league => String(league.team_ids || '').split(',').map(id => id.trim()).filter(Boolean))
  );
  const urls = [];

  [
    path.join(rootDir, 'database', VERSION),
    path.join(rootDir, 'league', VERSION),
    path.join(rootDir, 'team', VERSION),
  ].forEach(dir => fs.rmSync(dir, { recursive: true, force: true }));

  const directoryPages = [
    {
      view: 'players',
      title: 'Jugadores PES 2018 - Base de datos LAqP',
      description: 'Explora todos los jugadores publicados de PES 2018 con medias, stats, posiciones, equipos y nacionalidades.',
    },
    {
      view: 'teams',
      title: 'Equipos PES 2018 - Base de datos LAqP',
      description: 'Explora todos los equipos publicados de PES 2018 con plantillas, medias, ligas y escudos.',
    },
    {
      view: 'leagues',
      title: 'Ligas PES 2018 - Base de datos LAqP',
      description: 'Explora todas las ligas publicadas de PES 2018 y sus equipos.',
    },
  ];

  directoryPages.forEach(page => {
    const pathname = `/database/${VERSION}/${page.view}/`;
    writePage(`database/${VERSION}/${page.view}`, prepareTemplate('database.html', {
      embeddedMeta: `<meta name="laqp-database-view" content="${page.view}">`,
      title: page.title,
      description: page.description,
      absoluteUrl: `${SITE_URL}${pathname}`,
      imageUrl: `${SITE_URL}/img/logo.png`,
    }));
    urls.push(pathname);
  });

  leagues.forEach(league => {
    if (!league.league_id || !league.league_name) return;
    const slug = `${slugify(league.league_name)}-${league.league_id}`;
    const pathname = `/league/${VERSION}/${slug}/`;
    const teamCount = String(league.team_ids || '').split(',').filter(Boolean).length;
    writePage(`league/${VERSION}/${slug}`, prepareTemplate('league.html', {
      embeddedMeta: `<meta name="laqp-league-id" content="${escapeHtml(league.league_id)}">`,
      title: `${league.league_name} - Equipos PES 2018 | LAqP`,
      description: `${league.league_name} en PES 2018: ${teamCount} equipos, plantillas, escudos y medias.`,
      absoluteUrl: `${SITE_URL}${pathname}`,
      imageUrl: `${SITE_URL}/img/leagues/${encodeURIComponent(league.league_id)}.webp`,
    }));
    urls.push(pathname);
  });

  publishedTeamIds.forEach(teamId => {
    const team = teamById.get(teamId);
    if (!team || !team.Name || team.Name === '-') return;
    const slug = `${slugify(team.Name)}-${team.Id}`;
    const pathname = `/team/${VERSION}/${slug}/`;
    writePage(`team/${VERSION}/${slug}`, prepareTemplate('team.html', {
      embeddedMeta: `<meta name="laqp-team-id" content="${escapeHtml(team.Id)}">`,
      title: `${team.Name} - Plantilla PES 2018 | LAqP`,
      description: `${team.Name} en PES 2018: plantilla, jugadores, formacion, medias y stats.`,
      absoluteUrl: `${SITE_URL}${pathname}`,
      imageUrl: `${SITE_URL}/img/teams/${encodeURIComponent(team.Id)}.webp`,
    }));
    urls.push(pathname);
  });

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(url => `  <url><loc>${SITE_URL}${url}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`)
    .join('\n')}\n</urlset>\n`;
  fs.writeFileSync(path.join(rootDir, `sitemap-database-${VERSION}.xml`), sitemap, 'utf8');
  console.log(`Generated ${directoryPages.length} directories, ${leagues.length} leagues and ${urls.length - directoryPages.length - leagues.length} teams.`);
}

main();
