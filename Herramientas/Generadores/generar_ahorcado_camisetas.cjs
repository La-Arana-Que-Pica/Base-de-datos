'use strict';
/**
 * Ahorcado Futbolero: exporta los nombres de camiseta que el juego necesita para
 * validar apellidos de nombres compuestos sin inicial («Rafael Leão» → LEAO).
 *
 * Lee únicamente archivos locales (no escribe la base):
 *   database/builder-player-index.json      → jugadores publicados
 *   database/All players exported.csv       → columna Shirt
 * Escribe:
 *   database/ahorcado-camisetas.json        → { id: camiseta } sólo para esos nombres
 *   Herramientas/Salidas/logs/ahorcado-exclusiones.json → motivos de exclusión y avisos
 *
 * Uso: node Herramientas/Generadores/generar_ahorcado_camisetas.cjs
 * Volver a ejecutarlo después de regenerar la base de datos.
 */
const fs = require('node:fs');
const path = require('node:path');
const core = require('../../js/ahorcado-core.js');

const ROOT = path.resolve(__dirname, '..', '..');

function parseCsv(text, delimiter = ';') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === '') quoted = true;
    else if (char === delimiter) { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function readShirts(root) {
  const text = fs.readFileSync(path.join(root, 'database', 'All players exported.csv'), 'utf8').replace(/^﻿/, '');
  const [header, ...rows] = parseCsv(text);
  const idIndex = header.indexOf('Id');
  const shirtIndex = header.indexOf('Shirt');
  if (idIndex < 0 || shirtIndex < 0) throw new Error('El CSV de jugadores no tiene columnas Id y Shirt.');
  const shirts = new Map();
  for (const row of rows) if (row[idIndex]) shirts.set(String(row[idIndex]).trim(), String(row[shirtIndex] || '').trim());
  return shirts;
}

function needsShirt(name) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim();
  return clean.includes(' ') && !/^(?:\p{L}{1,3}\.\s?)+/u.test(clean);
}

function build(root = ROOT) {
  const index = JSON.parse(fs.readFileSync(path.join(root, 'database', 'builder-player-index.json'), 'utf8'));
  const allShirts = readShirts(root);
  const shirts = {};
  for (const player of index.players) {
    const shirt = allShirts.get(String(player.id));
    if (shirt && needsShirt(player.name)) shirts[player.id] = shirt;
  }
  const output = { schemaVersion: 1, databaseVersion: index.databaseVersion || '', shirts };
  fs.writeFileSync(path.join(root, 'database', 'ahorcado-camisetas.json'), JSON.stringify(output) + '\n');

  // Registro completo: valida también los apellidos con inicial contra la camiseta.
  const fullShirts = Object.fromEntries(index.players.map(player => [player.id, allShirts.get(String(player.id)) || '']));
  const db = core.prepareDatabase(index, fullShirts);
  const reasons = {};
  db.excluded.forEach(item => { reasons[item.reason] = (reasons[item.reason] || 0) + 1; });
  const report = {
    generatedAt: new Date().toISOString(),
    databaseVersion: output.databaseVersion,
    players: index.players.length,
    eligible: db.players.length,
    excluded: db.excluded.length,
    reasons,
    excludedPlayers: db.excluded,
    warnings: db.warnings,
  };
  const logDir = path.join(root, 'Herramientas', 'Salidas', 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, 'ahorcado-exclusiones.json'), JSON.stringify(report, null, 2) + '\n');
  return { output, report };
}

if (require.main === module) {
  const { output, report } = build();
  console.log(`Ahorcado: ${report.eligible}/${report.players} jugadores elegibles, ${report.excluded} excluidos, ${Object.keys(output.shirts).length} camisetas exportadas.`);
  console.log('Motivos:', report.reasons);
  console.log(`Avisos (camiseta distinta del apellido con inicial): ${report.warnings.length}`);
}

module.exports = { build, parseCsv, needsShirt };
