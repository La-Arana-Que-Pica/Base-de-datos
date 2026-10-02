'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OFFICIAL_KEY = '8a3fb93caf85fe0ba7fb51f68738589f';
const errors = [];

function files(directory) {
  const result = [];
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile() && entry.name === 'index.html') result.push(target);
    }
  }
  return result;
}

function occurrences(source, value) {
  return source.split(value).length - 1;
}

function checkPage(file, names, allowDynamicPlacements = false) {
  const html = fs.readFileSync(file, 'utf8');
  const placementCount = occurrences(html, 'data-ad-placement=');
  const slotCount = occurrences(html, 'data-ad-slot=');
  const dynamicShell = allowDynamicPlacements
    && placementCount === 0
    && html.includes('id="player-content"');
  if (!dynamicShell && placementCount !== names.length) errors.push(`${file}: ${placementCount} placements; se esperaban ${names.length}`);
  if (slotCount !== names.length) errors.push(`${file}: ${slotCount} slots; se esperaban ${names.length}`);
  for (const name of names) {
    if (!dynamicShell && occurrences(html, `data-ad-placement="${name}"`) !== 1) errors.push(`${file}: placement ${name} ausente o duplicado`);
    if (occurrences(html, `data-ad-slot="${name}"`) !== 1) errors.push(`${file}: slot ${name} ausente o duplicado`);
  }
}

const playerFiles = [path.join(ROOT, 'player.html'), ...files(path.join(ROOT, 'player', 'v2'))];
const teamFiles = [path.join(ROOT, 'team.html'), ...files(path.join(ROOT, 'team', 'v2'))];
playerFiles.forEach(file => checkPage(file, ['player-top', 'player-stats', 'player-mid', 'player-bottom'], true));
teamFiles.forEach(file => checkPage(file, ['team-top', 'team-mid', 'team-bottom']));

const playerRuntime = fs.readFileSync(path.join(ROOT, 'js', 'player.js'), 'utf8');
for (const name of ['player-top', 'player-stats', 'player-mid', 'player-bottom']) {
  if (occurrences(playerRuntime, `data-ad-placement="${name}"`) !== 1) errors.push(`js/player.js: placement dinámico ${name} ausente o duplicado`);
}

const runtime = fs.readFileSync(path.join(ROOT, 'js', 'ads.js'), 'utf8');
const keys = new Set(runtime.match(/[0-9a-f]{32}/g) || []);
if (keys.size !== 1 || !keys.has(OFFICIAL_KEY)) errors.push(`js/ads.js contiene keys no oficiales: ${[...keys].join(', ')}`);
if (!runtime.includes(`https://www.highrevenueformat.com/${OFFICIAL_KEY}/invoke.js`)) errors.push('js/ads.js no contiene el invoke.js oficial.');
if (!runtime.includes('width: 728') || !runtime.includes('height: 90')) errors.push('js/ads.js no configura exclusivamente 728x90.');

if (errors.length) {
  console.error(errors.slice(0, 30).join('\n'));
  if (errors.length > 30) console.error(`... y ${errors.length - 30} errores más.`);
  process.exitCode = 1;
} else {
  console.log(`Verificación correcta: ${playerFiles.length} fichas de jugador con 4 banners y ${teamFiles.length} fichas de equipo con 3 banners; una única key 728x90.`);
}
