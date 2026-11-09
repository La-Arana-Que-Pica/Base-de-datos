'use strict';
// Share the canonical static templates with the one-click Python generator.
const path = require('path');
const { spawnSync } = require('child_process');
const { projectRoot } = require('./project-root');
const args = [path.join(__dirname, '../Generadores/generar_web.py'), '--cli', '--database-only', ...process.argv.slice(2)];
const result = spawnSync(process.env.LAQP_PYTHON || 'python', args, {cwd:projectRoot, stdio:'inherit', windowsHide:true});
if (result.error) throw result.error;
process.exitCode = result.status || 0;
