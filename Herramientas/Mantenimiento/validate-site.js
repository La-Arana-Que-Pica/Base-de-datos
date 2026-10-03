'use strict';

const fs = require('fs');
const path = require('path');
const { projectRoot } = require('./project-root');

const ROOT = projectRoot;
const IGNORE_DIRS = new Set([
  '.git', 'Herramientas',
]);
const OPTIONAL_FETCHES = new Set(['database/novedades.csv']);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if ([...IGNORE_DIRS].some(ignore => rel === ignore || rel.startsWith(`${ignore}/`))) continue;
      walk(full, files);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

function walkByExtension(dir, extensions, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if ([...IGNORE_DIRS].some(ignore => rel === ignore || rel.startsWith(`${ignore}/`))) continue;
      walkByExtension(full, extensions, files);
    } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(full);
    }
  }
  return files;
}

function strip(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function attrs(tag) {
  const out = {};
  tag.replace(/([a-zA-Z0-9:-]+)\s*=\s*"([^"]*)"/g, (_, key, value) => {
    out[key.toLowerCase()] = value;
    return '';
  });
  return out;
}

function isExternal(href) {
  return /^(https?:|mailto:|tel:|javascript:|#|data:)/i.test(href || '');
}

function resolveLocal(fromFile, href, html) {
  const clean = href.split('#')[0].split('?')[0];
  if (!clean || isExternal(clean)) return null;
  let decoded = clean;
  try {
    decoded = decodeURIComponent(clean);
  } catch {}
  const hasRootBase = /<base\s+href="\/"/i.test(html || '');
  const base = clean.startsWith('/') || hasRootBase ? ROOT : path.dirname(fromFile);
  const resolved = path.resolve(base, decoded.replace(/^\/+/, ''));
  if (decoded.endsWith('/')) return path.join(resolved, 'index.html');
  if (path.extname(resolved)) return resolved;
  return fs.existsSync(resolved) && fs.statSync(resolved).isDirectory() ? path.join(resolved, 'index.html') : resolved;
}

function main() {
  const files = walk(ROOT);
  const issues = [];
  const titles = new Map();
  const descriptions = new Map();
  const urlSet = new Set();
  const sitemapPath = path.join(ROOT, 'sitemap.xml');
  const sitemapUrls = new Set();
  if (fs.existsSync(sitemapPath)) {
    const sitemap = fs.readFileSync(sitemapPath, 'utf8');
    for (const match of sitemap.matchAll(/<loc>https:\/\/laqp\.website([^<]+)<\/loc>/g)) {
      const url = match[1];
      sitemapUrls.add(url === '/' ? 'index.html' : url.replace(/^\//, '').replace(/\/$/, '/index.html'));
    }
  }

  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const html = fs.readFileSync(file, 'utf8');
    const isRootPage = rel === 'index.html';
    const isSitemapPage = sitemapUrls.has(rel);
    const isPublicPage = isRootPage || isSitemapPage;
    if (!isPublicPage && /^(player|team|league)\//.test(rel)) continue;

    const text = strip(html);
    const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || '';
    const description = (html.match(/<meta name="description" content="([^"]*)"/i) || [])[1]?.trim() || '';
    const h1s = [...html.matchAll(/<h1\b[\s\S]*?<\/h1>/gi)];
    const canonical = (html.match(/<link rel="canonical" href="([^"]*)"/i) || [])[1]?.trim() || '';
    const hasNoindex = /<meta name="robots" content="[^"]*noindex/i.test(html);
    const isRootHtml = !rel.includes('/') && rel.endsWith('.html');

    if (!/<html[^>]+lang="es"/i.test(html)) issues.push([rel, 'Alta', 'Falta lang="es".']);
    if (!title) issues.push([rel, 'Alta', 'Falta title.']);
    if (!description && isPublicPage) issues.push([rel, 'Alta', 'Falta meta description.']);
    if (!canonical && isPublicPage) issues.push([rel, 'Media', 'Falta canonical.']);
    if (isPublicPage && !hasNoindex && h1s.length !== 1) issues.push([rel, 'Alta', `Cantidad de H1 invalida: ${h1s.length}.`]);
    if (/(Cargando base de datos|Cargando tutoriales|Cargando descargas)/i.test(text) && text.length < 700) {
      issues.push([rel, 'Alta', 'La pagina parece depender solo de un cargador.']);
    }
    if (/(id="stat-(players|teams|leagues)"[^>]*>\s*0\s*<)/i.test(html)) {
      issues.push([rel, 'Alta', 'Hay contadores principales en cero.']);
    }
    if (!/<(nav|header)\b/i.test(html)) issues.push([rel, 'Media', 'No se detecta navegacion/header.']);
    if (isPublicPage && text.length < 300 && !hasNoindex) issues.push([rel, 'Media', 'Contenido visible muy escaso sin noindex.']);
    if (isRootHtml && !isPublicPage && text.length < 300 && !hasNoindex) {
      issues.push([rel, 'Media', 'Pagina shell raiz con poco contenido y sin noindex.']);
    }

    if (title) {
      if (titles.has(title)) issues.push([rel, 'Media', `Title duplicado con ${titles.get(title)}.`]);
      else titles.set(title, rel);
    }
    if (description) {
      if (descriptions.has(description)) issues.push([rel, 'Media', `Meta description duplicada con ${descriptions.get(description)}.`]);
      else descriptions.set(description, rel);
    }

    for (const img of html.matchAll(/<img\b[^>]*>/gi)) {
      const at = attrs(img[0]);
      if (!at.alt && !/aria-hidden="true"/i.test(img[0])) issues.push([rel, 'Media', `Imagen sin alt: ${at.src || img[0].slice(0, 80)}`]);
      const target = resolveLocal(file, at.src || '', html);
      if (target && !fs.existsSync(target)) issues.push([rel, 'Baja', `Imagen referenciada no encontrada: ${at.src}`]);
    }

    for (const asset of html.matchAll(/<(script|link|source)\b[^>]*>/gi)) {
      const at = attrs(asset[0]);
      const reference = at.src || at.href || at.srcset?.split(/\s*,\s*/)[0]?.split(/\s+/)[0] || '';
      const target = resolveLocal(file, reference, html);
      if (target && !fs.existsSync(target)) issues.push([rel, 'Alta', `Recurso web no encontrado: ${reference}`]);
    }

    for (const link of html.matchAll(/<a\b[^>]*href="([^"]*)"/gi)) {
      const href = link[1];
      const target = resolveLocal(file, href, html);
      if (target && !fs.existsSync(target)) issues.push([rel, 'Baja', `Enlace interno roto: ${href}`]);
    }
  }


  for (const file of walkByExtension(ROOT, new Set(['.js']))) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:fetch|fetchText|mediaCalcFetchText)\(\s*['"]([^'"`]+)['"]/g)) {
      const reference = match[1];
      if (isExternal(reference)) continue;
      const target = path.resolve(ROOT, reference.replace(/^\/+/, ''));
      if (!fs.existsSync(target) && !OPTIONAL_FETCHES.has(reference)) {
        issues.push([rel, 'Alta', `Dato cargado por JavaScript no encontrado: ${reference}`]);
      }
    }
  }

  for (const file of walkByExtension(ROOT, new Set(['.css']))) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/url\(\s*['"]?([^)'"?#]+)[^)]*\)/g)) {
      const reference = match[1].trim();
      if (!reference || isExternal(reference) || reference.startsWith('data:')) continue;
      const target = reference.startsWith('/')
        ? path.resolve(ROOT, reference.replace(/^\/+/, ''))
        : path.resolve(path.dirname(file), reference);
      if (!fs.existsSync(target)) issues.push([rel, 'Media', `Recurso CSS no encontrado: ${reference}`]);
    }
  }

  if (!fs.existsSync(sitemapPath)) {
    issues.push(['sitemap.xml', 'Alta', 'No existe sitemap.xml.']);
  } else {
    const sitemap = fs.readFileSync(sitemapPath, 'utf8');
    for (const match of sitemap.matchAll(/<loc>https:\/\/laqp\.website([^<]+)<\/loc>/g)) {
      const url = match[1];
      if (urlSet.has(url)) issues.push(['sitemap.xml', 'Media', `URL duplicada: ${url}`]);
      urlSet.add(url);
      if (/[?&](search|q|filter|page|sort)=/i.test(url)) issues.push(['sitemap.xml', 'Alta', `URL de filtro/busqueda incluida: ${url}`]);
    }
  }

  const report = `# Informe de validacion

Fecha: ${new Date().toISOString().slice(0, 10)}

Archivos HTML revisados: ${files.length}

${issues.length ? `## Hallazgos\n\n| Archivo | Prioridad | Detalle |\n| --- | --- | --- |\n${issues.map(([file, priority, detail]) => `| ${file} | ${priority} | ${detail.replace(/\|/g, '\\|')} |`).join('\n')}\n` : 'No se encontraron errores bloqueantes en las comprobaciones automaticas.\n'}
`;

  const reportPath = path.join(ROOT, 'Herramientas', 'Documentacion', 'reports', 'VALIDATION_REPORT.md');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report, 'utf8');
  if (issues.some(issue => issue[1] === 'Alta')) {
    console.error(`Validacion con ${issues.length} hallazgos. Revisar Herramientas/Documentacion/reports/VALIDATION_REPORT.md.`);
    process.exit(1);
  }
  console.log(`Validacion finalizada: ${issues.length} hallazgos no bloqueantes. Ver Herramientas/Documentacion/reports/VALIDATION_REPORT.md.`);
}

main();
