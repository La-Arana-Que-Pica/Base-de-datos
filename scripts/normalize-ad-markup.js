'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const AD_VERSION = '20261002b';
const CSS_VERSION = '20261002a';
const PLAYER_VERSION = '20261002a';
const CLUB_VERSION = '20261002a';
const placement = name => `<div class="ad-placement" data-ad-placement="${name}" data-ad-unit-target="responsive"></div>`;
const slot = name => `<aside class="ad-slot" aria-label="Publicidad" data-ad-slot="${name}" data-ad-unit="responsive" data-ad-format="responsive" data-ad-context="profile" data-ad-state="pending">
    <span class="ad-slot__label">Publicidad</span>
    <div class="ad-slot__content"><script>window.LAQPAds.render(document.currentScript.closest('.ad-slot'));</script></div>
  </aside>`;

function htmlFiles(directory) {
  if (!fs.existsSync(directory)) return [];
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

function allHtmlFiles(directory) {
  const result = [];
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile() && entry.name.endsWith('.html')) result.push(target);
    }
  }
  return result;
}

function versionAdsRuntime(html) {
  return html.replace(/src="js\/ads\.js(?:\?v=[^"]*)?"/g, `src="js/ads.js?v=${AD_VERSION}"`);
}

function versionSharedAssets(html) {
  return versionAdsRuntime(html).replace(
    /href="css\/style\.css(?:\?v=[^"]*)?"/g,
    `href="css/style.css?v=${CSS_VERSION}"`,
  );
}

function normalizePlayer(html) {
  let next = versionSharedAssets(html).replace(
    /src="js\/player\.js(?:\?v=[^"]*)?"/g,
    `src="js/player.js?v=${PLAYER_VERSION}"`,
  );
  if (!next.includes('data-ad-placement="player-stats"')) {
    const anchor = placement('player-mid');
    next = next.replace(anchor, `${placement('player-stats')}\n          ${anchor}`);
  }
  if (!next.includes('data-ad-slot="player-stats"')) {
    const anchor = '<aside class="ad-slot" aria-label="Publicidad" data-ad-slot="player-mid"';
    next = next.replace(anchor, `${slot('player-stats')}<${anchor.slice(1)}`);
  }
  return next;
}

function normalizeTeam(html) {
  let next = versionSharedAssets(html).replace(
    /src="js\/club\.js(?:\?v=[^"]*)?"/g,
    `src="js/club.js?v=${CLUB_VERSION}"`,
  );
  if (!next.includes('data-ad-placement="team-top"')) {
    next = next.replace(
      /(<article class="club-detail"[\s\S]*?<header class="club-hero[\s\S]*?<\/header>)/,
      `$1\n          ${placement('team-top')}`,
    );
  }
  if (!next.includes('data-ad-placement="team-mid"')) {
    next = next.replace(
      /(<section class="club-section club-roster")/,
      `${placement('team-mid')}\n          $1`,
    );
  }
  return next;
}

function update(file, transform) {
  const current = fs.readFileSync(file, 'utf8');
  const next = transform(current);
  if (next === current) return false;
  for (let attempt = 1; ; attempt += 1) {
    try {
      fs.writeFileSync(file, next, 'utf8');
      break;
    } catch (error) {
      if (attempt >= 5 || !['EBUSY', 'EPERM', 'UNKNOWN'].includes(error.code)) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 50);
    }
  }
  return true;
}

const playerFiles = [path.join(ROOT, 'player.html'), ...htmlFiles(path.join(ROOT, 'player', 'v2'))];
const teamFiles = [path.join(ROOT, 'team.html'), ...htmlFiles(path.join(ROOT, 'team', 'v2'))];
const profileFiles = new Set([...playerFiles, ...teamFiles]);
const sharedFiles = allHtmlFiles(ROOT).filter(file => !profileFiles.has(file));
const playerChanged = playerFiles.filter(file => update(file, normalizePlayer)).length;
const teamChanged = teamFiles.filter(file => update(file, normalizeTeam)).length;
const sharedChanged = sharedFiles.filter(file => update(file, versionSharedAssets)).length;

console.log(`Publicidad normalizada: ${playerFiles.length} fichas de jugador (${playerChanged} actualizadas), ${teamFiles.length} fichas de equipo (${teamChanged} actualizadas), ${sharedChanged} páginas compartidas actualizadas.`);
