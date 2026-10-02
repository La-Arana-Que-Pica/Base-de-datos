'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const EXPECTED_KEYS = new Set([
  '8a3fb93caf85fe0ba7fb51f68738589f',
  '773a61a788f6eb62ac193612dd67ce6d',
  'f6c2dfca11f920a6f33d547a57042ebd',
  '15f06f812a82d88a666136d4084cdcc7',
]);
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

function checkPage(file, assignments, allowDynamicPlacements = false) {
  const names = Object.keys(assignments);
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
    if (!dynamicShell && !html.includes(`data-ad-placement="${name}" data-ad-unit-target="${assignments[name]}"`)) errors.push(`${file}: formato incorrecto para placement ${name}`);
    if (!html.includes(`data-ad-slot="${name}" data-ad-unit="${assignments[name]}" data-ad-format="${assignments[name]}"`)) errors.push(`${file}: formato incorrecto para slot ${name}`);
  }
}

const playerFiles = [path.join(ROOT, 'player.html'), ...files(path.join(ROOT, 'player', 'v2'))];
const teamFiles = [path.join(ROOT, 'team.html'), ...files(path.join(ROOT, 'team', 'v2'))];
const playerAssignments = { 'player-top': 'banner', 'player-stats': 'banner', 'player-mid': 'banner', 'player-bottom': 'banner' };
const teamAssignments = { 'team-top': 'banner', 'team-mid': 'banner' };
playerFiles.forEach(file => checkPage(file, playerAssignments, true));
teamFiles.forEach(file => checkPage(file, teamAssignments));

const playerRuntime = fs.readFileSync(path.join(ROOT, 'js', 'player.js'), 'utf8');
for (const name of Object.keys(playerAssignments)) {
  if (occurrences(playerRuntime, `data-ad-placement="${name}"`) !== 1) errors.push(`js/player.js: placement dinámico ${name} ausente o duplicado`);
}

const teamRuntime = fs.readFileSync(path.join(ROOT, 'js', 'team.js'), 'utf8');
for (const name of Object.keys(teamAssignments)) {
  if (occurrences(teamRuntime, `data-ad-placement="${name}"`) !== 1) errors.push(`js/team.js: placement dinámico ${name} ausente o duplicado`);
}
if (teamRuntime.includes('data-ad-placement="team-bottom"')) errors.push('js/team.js conserva el tercer slot de equipo eliminado.');

const clubRuntime = fs.readFileSync(path.join(ROOT, 'js', 'club.js'), 'utf8');
if (clubRuntime.includes('team-bottom') || clubRuntime.includes("'native'") || clubRuntime.includes("'rectangle'")) errors.push('js/club.js conserva formatos o posiciones publicitarias eliminados.');

const runtime = fs.readFileSync(path.join(ROOT, 'js', 'ads.js'), 'utf8');
const keys = new Set(runtime.match(/[0-9a-f]{32}/g) || []);
if (keys.size !== EXPECTED_KEYS.size || [...keys].some(key => !EXPECTED_KEYS.has(key))) errors.push(`js/ads.js contiene keys inesperadas: ${[...keys].join(', ')}`);
if (runtime.includes('window.open')) errors.push('js/ads.js no debe interceptar window.open.');
for (const obsolete of ['sandboxDocument', 'createSandboxedFrame', 'srcdoc', 'ad-sandbox-frame', "setAttribute('sandbox'"]) {
  if (runtime.includes(obsolete)) errors.push(`js/ads.js conserva infraestructura sandbox obsoleta: ${obsolete}`);
}
if (!runtime.includes('providerQueue') || !runtime.includes('script.async = false')) errors.push('js/ads.js no serializa explícitamente la carga de invoke.js.');
if (!runtime.includes('width: 728') || !runtime.includes('height: 90')) errors.push('js/ads.js no contiene las dimensiones 728x90 requeridas.');
for (const removed of ['width: 320', 'height: 50', 'width: 300', 'height: 250', "format: 'native'", "data-ad-unit=\"native\"", "data-ad-unit=\"rectangle\""]) {
  if (runtime.includes(removed)) errors.push(`js/ads.js conserva un formato eliminado: ${removed}`);
}

if (errors.length) {
  console.error(errors.slice(0, 30).join('\n'));
  if (errors.length > 30) console.error(`... y ${errors.length - 30} errores más.`);
  process.exitCode = 1;
} else {
  console.log(`Verificación correcta: ${playerFiles.length} fichas de jugador con 4 banners 728x90 y ${teamFiles.length} fichas de equipo con 2 banners 728x90.`);
}
