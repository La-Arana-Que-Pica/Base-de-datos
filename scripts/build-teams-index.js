'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const teamsDir = path.join(rootDir, 'database', 'teams');
const outputPath = path.join(teamsDir, 'index.json');

const REQUIRED_TYPES = ['team', 'players', 'appearence', 'formation', 'squad'];

function parseCsvFirstRow(csvText) {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return null;

  const headers = lines[0].split(';').map(value => value.trim());
  const values = lines[1].split(';').map(value => value.trim());
  const row = {};
  headers.forEach((header, index) => {
    row[header] = values[index] !== undefined ? values[index] : '';
  });
  return row;
}

function formatDisplayName(folderName) {
  return folderName
    .split('-')
    .filter(Boolean)
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function discoverTeamFolder(folderName) {
  const folderPath = path.join(teamsDir, folderName);
  const allEntries = fs.readdirSync(folderPath, { withFileTypes: true });
  const csvFiles = allEntries
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.csv'))
    .map(entry => entry.name);

  const files = {};
  csvFiles.forEach(fileName => {
    const typeMatch = fileName.match(/_([^_]+)\.csv$/i);
    if (!typeMatch) return;
    const type = typeMatch[1].toLowerCase();
    if (REQUIRED_TYPES.includes(type)) {
      files[type] = fileName;
    }
  });

  let displayName = formatDisplayName(folderName);
  if (files.team) {
    try {
      const teamCsv = fs.readFileSync(path.join(folderPath, files.team), 'utf8');
      const firstTeamRow = parseCsvFirstRow(teamCsv);
      if (firstTeamRow && firstTeamRow.Name) {
        displayName = firstTeamRow.Name
          .toLowerCase()
          .split(' ')
          .map(token => token ? token[0].toUpperCase() + token.slice(1) : token)
          .join(' ');
      }
    } catch {
      // Keep folder-based name fallback
    }
  }

  const missingRequired = REQUIRED_TYPES.filter(type => !files[type]);

  return {
    folder: folderName,
    displayName,
    files,
    missingRequired,
  };
}

function main() {
  if (!fs.existsSync(teamsDir)) {
    throw new Error(`Teams directory not found: ${teamsDir}`);
  }

  const folderEntries = fs.readdirSync(teamsDir, { withFileTypes: true });
  const teamFolders = folderEntries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const teams = teamFolders.map(discoverTeamFolder);

  const manifest = {
    generatedAt: new Date().toISOString(),
    requiredFileTypes: REQUIRED_TYPES,
    teams,
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const missingCount = teams.filter(team => team.missingRequired.length > 0).length;
  console.log(`Generated ${path.relative(rootDir, outputPath)} for ${teams.length} team(s).`);
  if (missingCount > 0) {
    console.warn(`${missingCount} team(s) are missing one or more required CSV files.`);
  }
}

main();