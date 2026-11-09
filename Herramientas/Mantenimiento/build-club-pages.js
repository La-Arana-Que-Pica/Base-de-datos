'use strict';

// Every entry point shares the Python club renderer and its source template.
const { spawnSync } = require('child_process');
const path = require('path');
const { projectRoot } = require('./project-root');

function buildClubs({ version = 'v2', missingOnly = false, dryRun = false } = {}) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(version)) throw new Error('Version invalida');
  const rootDir = projectRoot;
  const generator = path.join(__dirname, '..', 'Generadores', 'generar_web.py');
  const args = [generator, '--cli', '--teams-only', `--version=${version}`,
    `--project-root=${rootDir}`, `--output-root=${rootDir}`];
  if (missingOnly) args.push('--missing-only');
  if (dryRun) {
    console.log(`Clubes: python ${args.join(' ')} (sin escribir)`);
    return;
  }
  const options = { cwd: rootDir, stdio: 'inherit', windowsHide: true };
  let result = spawnSync(process.env.LAQP_PYTHON || 'python', args, options);
  if (result.error?.code === 'ENOENT' && !process.env.LAQP_PYTHON) {
    result = spawnSync('py', ['-3', ...args], options);
  }
  if (result.error) throw result.error;
  // Keep source-validation failures visible without preventing the caller from
  // finishing its other page families. Never silently report a successful build.
  if (result.status !== 0) process.exitCode = result.status || 1;
}

module.exports = { buildClubs };
