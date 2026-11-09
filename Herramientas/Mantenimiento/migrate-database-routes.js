'use strict';
// Local, idempotent migration: preserve every file, reject destination collisions.
const fs = require('node:fs');
const path = require('node:path');
const {projectRoot} = require('./project-root');
const families=['database','player','team','league'];
const root=path.resolve(projectRoot);
for(const family of families){
 const parent=path.resolve(root,family), source=path.resolve(parent,'v2');
 if(path.dirname(parent)!==root || path.dirname(source)!==parent)throw Error('Unsafe migration path');
 if(!fs.existsSync(source))continue;
 const entries=fs.readdirSync(source);
 for(const name of entries){const destination=path.resolve(parent,name);if(path.dirname(destination)!==parent || fs.existsSync(destination))throw Error('Destination collision: '+destination)}
 function moveEntry(from,to){
  if(!from.startsWith(source+path.sep)||!to.startsWith(parent+path.sep)||to.startsWith(source+path.sep))throw Error('Unsafe move target');
  const info=fs.lstatSync(from);if(info.isSymbolicLink())throw Error('Symlink requires manual migration');
  if(info.isDirectory()){fs.mkdirSync(to);for(const name of fs.readdirSync(from))moveEntry(path.join(from,name),path.join(to,name));fs.rmdirSync(from)}
  else fs.renameSync(from,to);
 }
 for(const name of entries)moveEntry(path.join(source,name),path.join(parent,name));
 fs.rmdirSync(source); // Only removes the now-empty v2 directory.
 console.log(family+': '+entries.length+' entries moved');
}
const files=[];
function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())visit(file);else if(/\.(html|json|xml)$/.test(entry.name))files.push(file)}}
for(const family of families)visit(path.join(root,family));
(async()=>{let updated=0;for(let i=0;i<files.length;i+=32){await Promise.all(files.slice(i,i+32).map(async file=>{const before=await fs.promises.readFile(file,'utf8');const after=before.replace(/(database|player|team|league)\/v2\//g,'$1/');if(before!==after){await fs.promises.writeFile(file,after);updated++}}));}console.log(updated+' pages/indexes updated')})().catch(error=>{console.error(error);process.exitCode=1});
