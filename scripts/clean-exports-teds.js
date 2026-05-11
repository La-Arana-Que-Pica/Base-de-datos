#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_EXPORTS_DIR = path.join(ROOT, 'exports');
const DEFAULT_BACKUP_DIR = path.join(DEFAULT_EXPORTS_DIR, '_unused');
const TEAMS_CSV = path.join(ROOT, 'database', 'All teams exported.csv');
const LEAGUES_CSV = path.join(ROOT, 'database', 'All leagues exported.csv');

function parseArgs(argv) {
  const args = {
    apply: false,
    dryRun: true,
    exportsDir: DEFAULT_EXPORTS_DIR,
    backupDir: DEFAULT_BACKUP_DIR,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') {
      args.apply = true;
      args.dryRun = false;
    } else if (arg === '--dry-run') {
      args.apply = false;
      args.dryRun = true;
    } else if (arg === '--exports-dir') {
      args.exportsDir = path.resolve(argv[++i]);
    } else if (arg === '--backup-dir') {
      args.backupDir = path.resolve(argv[++i]);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Argumento no reconocido: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Uso:
  node scripts/clean-exports-teds.js --dry-run
  node scripts/clean-exports-teds.js --apply

Opciones:
  --exports-dir <ruta>  Carpeta donde buscar .ted. Default: exports
  --backup-dir <ruta>   Carpeta donde mover sobrantes. Default: exports/_unused
`);
}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (!lines.length) return [];
  const headers = lines[0].replace(/^\uFEFF/, '').split(';').map(h => h.trim());
  return lines.slice(1).filter(Boolean).map(line => {
    const values = line.split(';').map(v => v.trim());
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] !== undefined ? values[index] : '';
    });
    return row;
  });
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\.ted$/i, '')
    .replace(/^\d+[\s_-]*/, '')
    .replace(/&/g, 'and')
    .replace(/\b(futbol club|football club|club de futbol)\b/g, '')
    .replace(/\b(fc|cf|ac|sc|cd|ca|afc|cfc|sfc)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function readRows(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe el archivo requerido: ${filePath}`);
  }
  return parseCSV(fs.readFileSync(filePath, 'utf8'));
}

function loadValidTeams() {
  const teamRows = readRows(TEAMS_CSV);
  const leagueRows = readRows(LEAGUES_CSV);

  const teamsById = new Map();
  const validIds = new Set();
  const validNames = new Map();

  teamRows.forEach(row => {
    const id = row.Id || row.id || '';
    const name = row.Name || row.name || '';
    if (!id || !name || name === '-') return;
    teamsById.set(id, { id, name });
  });

  leagueRows.forEach(row => {
    String(row.team_ids || '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)
      .forEach(id => {
        if (teamsById.has(id)) validIds.add(id);
      });
  });

  validIds.forEach(id => {
    const team = teamsById.get(id);
    const normalized = normalizeName(team.name);
    if (!normalized) return;
    if (!validNames.has(normalized)) validNames.set(normalized, []);
    validNames.get(normalized).push(team);
  });

  return { teamsById, validIds, validNames };
}

function listTedFiles(dir, backupDir) {
  const files = [];
  const resolvedBackup = path.resolve(backupDir);

  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return;
    const resolved = path.resolve(currentDir);
    if (resolved === resolvedBackup || resolved.startsWith(resolvedBackup + path.sep)) return;

    fs.readdirSync(currentDir, { withFileTypes: true }).forEach(entry => {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.toLowerCase() === '_unused' || entry.name.toLowerCase() === 'exports_unused') return;
        walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.ted')) {
        files.push(fullPath);
      }
    });
  }

  walk(dir);
  return files.sort((a, b) => a.localeCompare(b));
}

function classifyTed(filePath, teamData) {
  const fileName = path.basename(filePath);
  const stem = fileName.replace(/\.ted$/i, '');
  const match = stem.match(/^(\d+)(?:[\s_-]+(.+))?$/);
  const idFromFile = match ? match[1] : '';
  const namePart = match && match[2] ? match[2] : stem;
  const normalizedFileName = normalizeName(namePart);
  const matchesByName = teamData.validNames.get(normalizedFileName) || [];

  if (idFromFile && teamData.validIds.has(idFromFile)) {
    return {
      action: 'keep',
      reason: `ID ${idFromFile} existe en ligas/base de datos`,
      team: teamData.teamsById.get(idFromFile),
    };
  }

  if (!idFromFile && matchesByName.length === 1) {
    return {
      action: 'keep',
      reason: `nombre normalizado coincide con ${matchesByName[0].name}`,
      team: matchesByName[0],
    };
  }

  if (idFromFile && teamData.teamsById.has(idFromFile) && !teamData.validIds.has(idFromFile)) {
    return {
      action: 'move',
      reason: `ID ${idFromFile} existe en CSV de equipos pero no aparece en ligas de la web`,
      team: teamData.teamsById.get(idFromFile),
    };
  }

  if (matchesByName.length > 1) {
    return {
      action: 'doubtful',
      reason: `nombre coincide con varios equipos: ${matchesByName.map(t => `${t.id} ${t.name}`).join(', ')}`,
    };
  }

  if (matchesByName.length === 1) {
    return {
      action: 'doubtful',
      reason: `nombre coincide con ${matchesByName[0].name}, pero el ID del archivo no coincide o no es confiable`,
      team: matchesByName[0],
    };
  }

  return {
    action: 'doubtful',
    reason: idFromFile
      ? `ID ${idFromFile} no existe en el CSV de equipos y el nombre no coincide con equipos validos`
      : 'sin ID confiable y sin coincidencia exacta por nombre normalizado',
  };
}

function uniqueDestination(backupDir, fileName) {
  let candidate = path.join(backupDir, fileName);
  if (!fs.existsSync(candidate)) return candidate;

  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let index = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(backupDir, `${base} (${index})${ext}`);
    index++;
  }
  return candidate;
}

function printSection(title, items, exportsDir) {
  console.log(`\n${title} (${items.length})`);
  if (!items.length) {
    console.log('  - ninguno');
    return;
  }
  items.forEach(item => {
    const relative = path.relative(exportsDir, item.file);
    console.log(`  - ${relative} :: ${item.result.reason}`);
  });
}

function main() {
  const args = parseArgs(process.argv);
  const exportsDir = path.resolve(args.exportsDir);
  const backupDir = path.resolve(args.backupDir);

  if (!fs.existsSync(exportsDir)) {
    throw new Error(`No existe la carpeta exports: ${exportsDir}`);
  }

  const teamData = loadValidTeams();
  const tedFiles = listTedFiles(exportsDir, backupDir);
  const classified = tedFiles.map(file => ({ file, result: classifyTed(file, teamData) }));

  const keep = classified.filter(item => item.result.action === 'keep');
  const move = classified.filter(item => item.result.action === 'move');
  const doubtful = classified.filter(item => item.result.action === 'doubtful');

  console.log(args.apply ? 'MODO APPLY' : 'MODO DRY-RUN');
  console.log(`Fuente equipos: ${path.relative(ROOT, TEAMS_CSV)}`);
  console.log(`Fuente ligas: ${path.relative(ROOT, LEAGUES_CSV)}`);
  console.log(`Equipos validos en web/base de datos: ${teamData.validIds.size}`);
  console.log(`Total .ted encontrados: ${tedFiles.length}`);
  console.log(`Se conservarian: ${keep.length}`);
  console.log(`Se moverian a backup: ${move.length}`);
  console.log(`Dudosos para revision manual: ${doubtful.length}`);

  printSection('ARCHIVOS QUE SE CONSERVARIAN', keep, exportsDir);
  printSection('ARCHIVOS QUE SE MOVERIAN', move, exportsDir);
  printSection('DUDOSOS - NO SE MUEVEN', doubtful, exportsDir);

  if (!args.apply) {
    console.log('\nNo se movio ningun archivo. Ejecuta con --apply para mover solo los de la lista "ARCHIVOS QUE SE MOVERIAN".');
    return;
  }

  fs.mkdirSync(backupDir, { recursive: true });
  move.forEach(item => {
    const destination = uniqueDestination(backupDir, path.basename(item.file));
    fs.renameSync(item.file, destination);
    console.log(`MOVIDO: ${path.relative(ROOT, item.file)} -> ${path.relative(ROOT, destination)}`);
  });
  console.log(`\nListo. Movidos: ${move.length}. Dudosos sin tocar: ${doubtful.length}.`);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
