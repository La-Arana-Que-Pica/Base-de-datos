'use strict';

const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

function normalizeVersion(value) {
  const version = String(value || '').trim();
  if (!version) {
    throw new Error('Tenes que indicar un nombre de version, por ejemplo v2, v3 o 2026.');
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(version)) {
    throw new Error(`Version invalida: "${value}". Usa solo letras, numeros, puntos, guiones o guiones bajos.`);
  }
  return version;
}

function versionFromArgs() {
  const flag = process.argv.find(arg => arg.startsWith('--version='));
  if (flag) return flag.slice('--version='.length);

  const flagIndex = process.argv.indexOf('--version');
  if (flagIndex >= 0 && process.argv[flagIndex + 1]) return process.argv[flagIndex + 1];

  return process.argv.slice(2).find(arg => arg && !arg.startsWith('-'));
}

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

function run(scriptName, version) {
  const scriptPath = path.join(__dirname, scriptName);
  const result = spawnSync(process.execPath, [scriptPath, `--version=${version}`], {
    cwd: rootDir,
    env: {
      ...process.env,
      LAQP_DATABASE_VERSION: version,
    },
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${scriptName} termino con codigo ${result.status}.`);
  }
}

async function main() {
  const inputVersion = versionFromArgs() || await ask('Nombre de la version a generar (ej: v2, v3, 2026): ');
  const version = normalizeVersion(inputVersion);

  console.log(`\nGenerando HTML de base de datos en version "${version}"...\n`);
  run('build-database-pages.js', version);
  run('build-player-pages.js', version);

  console.log(`\nListo. Se genero:`);
  console.log(`- database/${version}/`);
  console.log(`- league/${version}/`);
  console.log(`- team/${version}/`);
  console.log(`- player/${version}/`);
  console.log(`- sitemap-database-${version}.xml`);
  console.log(`- sitemap-players-${version}.xml`);
}

main().catch(error => {
  console.error(`\nError: ${error.message}`);
  process.exitCode = 1;
});
