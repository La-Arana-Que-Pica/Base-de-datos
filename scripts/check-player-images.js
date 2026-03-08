'use strict';

/**
 * check-player-images.js
 *
 * Scans all team CSV files and reports which player images are present in
 * img/players/ and which ones are missing (will fall back to default.png).
 *
 * Usage:
 *   node scripts/check-player-images.js
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const teamsDir = path.join(rootDir, 'database', 'teams');
const playersImgDir = path.join(rootDir, 'img', 'players');
const indexPath = path.join(teamsDir, 'index.json');

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(';').map(h => h.trim());
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(';').map(v => v.trim());
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] !== undefined ? values[idx] : '';
    });
    result.push(obj);
  }
  return result;
}

function pickValue(obj, keys, fallback = '') {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
      return obj[key];
    }
  }
  return fallback;
}

/** Return true only if a path segment is a plain name with no traversal. */
function isSafeName(name) {
  return typeof name === 'string' && name.length > 0 && !/[/\\]/.test(name) && !name.startsWith('.');
}

function main() {
  if (!fs.existsSync(indexPath)) {
    console.error(`Teams index not found: ${indexPath}`);
    console.error('Run "node scripts/build-teams-index.js" first.');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  if (!Array.isArray(manifest.teams)) {
    console.error('Invalid index.json format.');
    process.exit(1);
  }

  const allImgFiles = fs.existsSync(playersImgDir)
    ? fs.readdirSync(playersImgDir)
    : [];
  const pngFiles = new Set(allImgFiles.filter(f => f.toLowerCase().endsWith('.png')));
  const ddsFiles = new Set(allImgFiles.filter(f => f.toLowerCase().endsWith('.dds')));

  let totalPlayers = 0;
  let withPng = 0;
  let withDds = 0;
  let withoutImage = 0;
  const missing = [];

  for (const teamMeta of manifest.teams) {
    const { folder, displayName, files } = teamMeta;
    if (!files || !files.players) continue;

    if (!isSafeName(folder) || !isSafeName(files.players)) {
      console.warn(`Skipping team with unsafe path values: folder="${folder}", players="${files.players}"`);
      continue;
    }

    const csvPath = path.join(teamsDir, folder, files.players);
    if (!fs.existsSync(csvPath)) continue;

    const csvText = fs.readFileSync(csvPath, 'utf8');
    const rows = parseCSV(csvText);

    for (const row of rows) {
      const playerId = pickValue(row, ['ID', 'Id', 'id']);
      if (!playerId) continue;

      totalPlayers++;
      const pngFile = `${playerId}.png`;
      const ddsFile = `player_${playerId}.dds`;

      if (pngFiles.has(pngFile)) {
        withPng++;
      } else if (ddsFiles.has(ddsFile)) {
        withDds++;
      } else {
        withoutImage++;
        missing.push({ playerId, name: pickValue(row, ['Name', 'PlayerName']), team: displayName });
      }
    }
  }

  console.log(`\nPlayer image report`);
  console.log('===================');
  console.log(`Total players : ${totalPlayers}`);
  console.log(`With PNG      : ${withPng}`);
  console.log(`With DDS      : ${withDds}`);
  console.log(`Missing image : ${withoutImage}`);

  if (missing.length > 0) {
    console.log('\nPlayers using the default fallback image:');
    missing.forEach(({ playerId, name, team }) => {
      console.log(`  [${team}] ID ${playerId} — ${name || '(no name)'} → img/players/${playerId}.png`);
    });
  } else {
    console.log('\nAll players have a dedicated image. ✓');
  }

  console.log('');
}

main();
