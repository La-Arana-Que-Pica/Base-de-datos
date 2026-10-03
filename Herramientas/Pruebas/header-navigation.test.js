'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function publicHtmlFiles(directory = ROOT) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'Herramientas') continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...publicHtmlFiles(absolutePath));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(absolutePath);
    }
  }

  return files;
}

test('el menú principal usa rutas absolutas desde cualquier nivel', () => {
  const source = read('js/site.js');
  const navBlock = source.match(/const SITE_NAV_ITEMS = \[([\s\S]*?)\n\];/)?.[1] || '';
  const hrefs = [...navBlock.matchAll(/href: '([^']+)'/g)].map(match => match[1]);

  assert.equal(hrefs.length, 10);
  assert.ok(hrefs.every(href => href.startsWith('/')), 'todos los enlaces del header deben partir desde la raíz');
  assert.deepEqual(hrefs, [
    '/index.html',
    '/database.html',
    '/alineaciones.html',
    '/database/DTs/',
    '/rankings.html',
    '/tactics.html',
    '/guias.html',
    '/tutorials.html',
    '/calculadora-medias.html',
    '/downloads.html',
  ]);
});

test('el menú visible de escritorio acepta clicks', () => {
  const source = read('css/style.css');
  const desktopNavRule = source.match(
    /@media \(min-width: 1180px\) \{[\s\S]*?#header:not\(:has\(\.global-search\)\):not\(:has\(#global-search\)\) \.header-nav \{([\s\S]*?)\n  \}/,
  )?.[1] || '';

  assert.match(desktopNavRule, /pointer-events:\s*auto\s*!important/);
});

test('el logo del header siempre vuelve al inicio principal', () => {
  const siteSource = read('js/site.js');
  const databaseSource = read('database.html');

  assert.match(siteSource, /logoLink\.setAttribute\('href', '\/index\.html'\)/);
  assert.match(databaseSource, /<a href="\/index\.html" class="header-logo-link"/);
  assert.doesNotMatch(databaseSource, /onclick="goHome\(\)"/);
});

test('ninguna página pública conserva un logo relativo a su subcarpeta', () => {
  for (const file of publicHtmlFiles()) {
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes('id="header"')) continue;

    const relativePath = path.relative(ROOT, file);
    assert.match(
      source,
      /<a href="\/index\.html" class="header-logo-link"/,
      `${relativePath} no vuelve al index principal`,
    );
    assert.doesNotMatch(
      source,
      /<a href="index\.html" class="header-logo-link"/,
      `${relativePath} conserva un destino relativo`,
    );
  }
});

test('los generadores conservan el destino absoluto del logo', () => {
  const sources = [
    'Herramientas/Generadores/templates/player.html',
    'Herramientas/Generadores/templates/team.html',
    'Herramientas/Generadores/templates/league.html',
    'Herramientas/Generadores/generador_secciones.py',
    'Herramientas/Mantenimiento/build-player-pages.js',
    'Herramientas/Mantenimiento/build-site.js',
    'Herramientas/Mantenimiento/create-missing-database-html.js',
  ];

  for (const file of sources) {
    const source = read(file);
    assert.doesNotMatch(source, /<a href="index\.html" class="header-logo-link"/, `${file} todavía genera un logo relativo`);
  }
});
