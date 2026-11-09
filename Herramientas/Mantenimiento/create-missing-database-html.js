'use strict';
// Preserve the helper's force/dry-run/only flags while using the canonical templates.
const path = require('path');
const {spawnSync} = require('child_process');
const {projectRoot} = require('./project-root');
const input=process.argv.slice(2);
const force=input.includes('--force'), dryRun=input.includes('--dry-run');
const args=[path.join(__dirname,'../Generadores/generar_web.py'),'--cli','--database-only',...input.filter(arg=>!['--force','--dry-run'].includes(arg))];
if(!force)args.push('--missing-only');
if(dryRun){console.log('Generacion local prevista con plantillas compartidas: '+args.slice(1).join(' '));}
else {const result=spawnSync(process.env.LAQP_PYTHON || 'python',args,{cwd:projectRoot,stdio:'inherit',windowsHide:true});if(result.error)throw result.error;process.exitCode=result.status || 0;}
