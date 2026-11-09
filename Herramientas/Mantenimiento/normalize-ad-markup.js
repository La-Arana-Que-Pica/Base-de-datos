'use strict';

const fs = require('fs');
const path = require('path');
const { projectRoot } = require('./project-root');

const ROOT = projectRoot;
const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules', '.pnpm-store']);

function htmlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : htmlFiles(path.join(directory, entry.name));
    }
    return entry.isFile() && entry.name.toLowerCase().endsWith('.html')
      ? [path.join(directory, entry.name)]
      : [];
  });
}

function normalize(html) {
  return html
    .replace(/\s*<script\b[^>]*\bsrc=["']https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js[^"']*["'][^>]*><\/script>/gi, '')
    .replace(/data-ad-unit-target=["'](?:native|rectangle)["']/gi, 'data-ad-unit-target="responsive"')
    .replace(/data-ad-unit=["'](?:native|rectangle)["']/gi, 'data-ad-unit="responsive"')
    .replace(/data-ad-format=["'](?:native|300x250)["']/gi, 'data-ad-format="responsive"');
}

function writeWithRetry(file, output) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.writeFileSync(file, output, 'utf8');
      return;
    } catch (error) {
      lastError = error;
      if (!['UNKNOWN', 'EBUSY', 'EPERM', 'EACCES'].includes(error.code) || attempt === 4) break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (attempt + 1));
    }
  }
  throw lastError;
}

let changed = 0;
const failed = [];
for (const file of htmlFiles(ROOT)) {
  const source = fs.readFileSync(file, 'utf8');
  const output = normalize(source);
  if (output === source) continue;
  try {
    writeWithRetry(file, output);
    changed += 1;
  } catch (error) {
    failed.push(`${path.relative(ROOT, file)} (${error.code || error.message})`);
  }
}

console.log(`Normalized horizontal advertising markup in ${changed} HTML files.`);
if (failed.length) {
  console.error(`Could not update ${failed.length} files:\n${failed.join('\n')}`);
  process.exitCode = 1;
}
