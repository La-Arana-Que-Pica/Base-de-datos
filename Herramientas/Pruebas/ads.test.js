'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..', '..');
const PLAYER_ROOT = path.join(ROOT, 'player', 'v2');
const PLAYER_PLACEMENTS = ['player-top', 'player-stats', 'player-mid', 'player-bottom'];
const FORBIDDEN_AD_VALUE = /data-ad-(?:unit|unit-target|format)=["'](?:native|rectangle|300x250|vertical|square|sticky|popup|popunder)["']/i;
const REMOVED_PROVIDER_ASSET = /(?:597f4baefd789b5a554a76a03af8bc9b|d7f6b2bd0a3bdbc016d2bcff231bd9bd|profitableratecpmnetwork)/i;

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function walk(directory, predicate = () => true) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath, predicate);
    return predicate(fullPath) ? [fullPath] : [];
  });
}

function currentPlayerFiles() {
  const sitemap = path.join(ROOT, 'sitemap-players-v2.xml');
  if (!fs.existsSync(sitemap)) return walk(PLAYER_ROOT, file => path.basename(file) === 'index.html');
  return [...fs.readFileSync(sitemap, 'utf8').matchAll(/<loc>https:\/\/laqp\.website(\/player\/v2\/[^<]+)<\/loc>/g)]
    .map(match => path.join(ROOT, decodeURIComponent(match[1]).replace(/^\//, ''), 'index.html'))
    .filter(file => fs.existsSync(file));
}

function attributeValues(source, attribute) {
  return [...source.matchAll(new RegExp(`${attribute}=["']([^"']+)["']`, 'g'))].map(match => match[1]);
}

function assertPlayerAdvertising(source, label, { placementsInMarkup = true, slotsInMarkup = true } = {}) {
  const placements = attributeValues(source, 'data-ad-placement').filter(value => value.startsWith('player-'));
  const slots = attributeValues(source, 'data-ad-slot').filter(value => value.startsWith('player-'));
  const units = attributeValues(source, 'data-ad-unit');
  const formats = attributeValues(source, 'data-ad-format');

  if (placementsInMarkup) {
    assert.deepEqual(placements.sort(), [...PLAYER_PLACEMENTS].sort(), `${label}: deben existir exactamente cuatro ubicaciones de jugador`);
  }
  if (slotsInMarkup) {
    assert.deepEqual(slots.sort(), [...PLAYER_PLACEMENTS].sort(), `${label}: deben existir exactamente cuatro slots de jugador`);
    assert.equal(units.length, 4, `${label}: deben existir exactamente cuatro unidades publicitarias`);
    assert.equal(formats.length, 4, `${label}: deben existir exactamente cuatro formatos declarados`);
  }
  assert.ok(units.every(value => value === 'banner'), `${label}: todos los anuncios deben usar el banner horizontal vigente`);
  assert.ok(formats.every(value => value === 'banner'), `${label}: no debe reaparecer otro formato publicitario`);
}

test('el runtime conserva solo los banners horizontales y serializa al proveedor', () => {
  const source = read('js/ads.js');

  assert.match(source, /width:\s*728[\s\S]*height:\s*90/);
  assert.equal((source.match(/width:\s*728,\s*height:\s*90/g) || []).length, 4);
  assert.doesNotMatch(source, REMOVED_PROVIDER_ASSET);
  assert.doesNotMatch(source, /\bnative\s*:/i);
  assert.doesNotMatch(source, /\brectangle\s*:/i);
  assert.doesNotMatch(source, /document\.write\s*\(/);
  assert.match(source, /function enqueue\(record\)[\s\S]*?providerQueue/);
  assert.match(source, /function removeAll\(\)[\s\S]*?clearRecord\(slot\)[\s\S]*?slot\.dataset\.adState = 'consent-blocked'/);
});

test('las fuentes que regeneran jugadores mantienen los cuatro banners', () => {
  const template = read('Herramientas/Generadores/templates/player.html');
  assertPlayerAdvertising(template, 'plantilla Python', { slotsInMarkup: false });
  assert.equal((template.match(/\{\{AD_BOOTSTRAP\}\}/g) || []).length, 1, 'la plantilla debe insertar un solo bootstrap de anuncios');
  assertPlayerAdvertising(read('player.html'), 'shell de jugador');

  const playerRuntime = read('js/player.js');
  const runtimePlacements = attributeValues(playerRuntime, 'data-ad-placement').filter(value => value.startsWith('player-'));
  assert.deepEqual(runtimePlacements.sort(), [...PLAYER_PLACEMENTS].sort(), 'player.js debe montar exactamente cuatro ubicaciones');

  const generator = read('Herramientas/Generadores/generador_database.py');
  assert.match(generator, /"player":\s*\(\("banner",\s*"player-top"\),\s*\("banner",\s*"player-stats"\),\s*\("banner",\s*"player-mid"\),\s*\("banner",\s*"player-bottom"\)\)/);

  const legacyBuilder = read('Herramientas/Mantenimiento/build-player-pages.js');
  for (const placement of PLAYER_PLACEMENTS) {
    assert.match(legacyBuilder, new RegExp(`data-ad-slot=["']${placement}["'][^>]+data-ad-unit=["']banner["']`));
  }
});

test('todas las fichas generadas contienen exactamente cuatro banners horizontales', () => {
  const files = currentPlayerFiles();
  assert.ok(files.length > 0, 'no se encontraron fichas de jugador generadas');

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const label = path.relative(ROOT, file);
    const placements = attributeValues(source, 'data-ad-placement').filter(value => value.startsWith('player-'));
    assert.ok(placements.length === 0 || placements.length === 4, `${label}: ubicaciones publicitarias incompletas`);
    if (placements.length === 0) {
      assert.match(source, /<script\b[^>]+src=["']js\/player\.js(?:\?[^"']*)?["']/, `${label}: la ficha legacy debe hidratar las cuatro ubicaciones desde player.js`);
    }
    assertPlayerAdvertising(source, label, { placementsInMarkup: placements.length > 0 });
  }
});

test('ningún HTML publicado conserva formatos o scripts publicitarios retirados', () => {
  const htmlFiles = walk(ROOT, file => file.toLowerCase().endsWith('.html') && !file.includes(`${path.sep}Herramientas${path.sep}`));

  for (const file of htmlFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const label = path.relative(ROOT, file);
    assert.doesNotMatch(source, FORBIDDEN_AD_VALUE, `${label}: formato publicitario retirado`);
    assert.doesNotMatch(source, REMOVED_PROVIDER_ASSET, `${label}: script publicitario retirado`);
    assert.doesNotMatch(source, /<script\b[^>]+(?:highrevenueformat|googlesyndication|profitableratecpmnetwork)/i, `${label}: proveedor cargado fuera del runtime aislado`);
  }
});

test('el CSS limita cada anuncio a su propia caja y al viewport', () => {
  const source = read('css/style.css');

  assert.match(source, /\.ad-slot\s*\{[\s\S]*?position:\s*relative;[\s\S]*?isolation:\s*isolate;[\s\S]*?max-width:\s*100%;[\s\S]*?overflow:\s*hidden;/);
  assert.match(source, /\.ad-slot__content > iframe\s*\{[\s\S]*?position:\s*relative\s*!important;[\s\S]*?width:\s*var\(--ad-render-width,\s*728px\)\s*!important;[\s\S]*?overflow:\s*hidden;/);
  assert.match(source, /\.ad-bootstrap\s*\{[\s\S]*?height:\s*0;[\s\S]*?overflow:\s*hidden;[\s\S]*?pointer-events:\s*none;[\s\S]*?visibility:\s*hidden;/);
});
