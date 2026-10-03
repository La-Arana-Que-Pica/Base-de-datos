/**
 * Home page.
 * Reads the structured Option Files source, with the legacy CSV as fallback.
 */

'use strict';

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return [];
  const delimiter = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';

  const parseLine = line => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];
      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  const headers = parseLine(lines[0].replace(/^\uFEFF/, ''));
  return lines.slice(1).map(line => {
    if (!line.trim()) return null;
    const values = parseLine(line);
    const row = {};
    headers.forEach((header, index) => { row[header] = values[index] !== undefined ? values[index] : ''; });
    return row;
  }).filter(Boolean);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function assetPath(path, fallback = 'img/logo.webp') {
  const value = String(path || '').trim();
  if (!value) return fallback;
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  return value.replace(/^\/+/, '');
}

function uniqueById(rows) {
  const seen = new Set();
  return rows.filter((row, index) => {
    const id = row.id || row.ID || `${row.titulo || row.nombre || row.juego || 'option-file'}-${row.version || ''}-${row.plataforma || ''}-${index}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function optionSlug(item) {
  const explicit = String(item.slug || '').trim();
  if (explicit) return explicit;
  const title = item.titulo || item.nombre || item.title || item.name || item.juego || 'option-file';
  const platform = Array.isArray(item.platforms) ? item.platforms.join(' ') : (item.plataforma || item.platform || '');
  return `${title} ${platform}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function fetchText(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

function getDownloadLinks(item) {
  const links = [];
  const addLink = (url, label) => {
    const href = String(url || '').trim();
    if (!href || href === '#') return;
    links.push({
      href,
      label: String(label || `Parte ${links.length + 1}`).trim(),
    });
  };

  if (Array.isArray(item.download_parts)) {
    item.download_parts.forEach(part => {
      if (part && typeof part === 'object') addLink(part.url || part.href, part.name || part.label);
    });
    if (links.length) return links;
  }

  const multiLinks = item.links || item.link_partes || item.partes || '';
  String(multiLinks || '').split('|').forEach((entry, index) => {
    const value = entry.trim();
    if (!value) return;
    const parts = value.split('::');
    if (parts.length > 1) {
      addLink(parts.slice(1).join('::'), parts[0]);
      return;
    }
    addLink(value, `Parte ${index + 1}`);
  });

  ['1', '2', '3', '4', '5'].forEach(number => {
    addLink(
      item[`link_${number}`] || item[`link${number}`],
      item[`link_${number}_label`] || item[`label_${number}`] || item[`parte_${number}_label`] || `Parte ${number}`,
    );
  });

  if (!links.length) addLink(item.link || item.url, t('home.downloadAction'));
  return links;
}

function renderFeaturedDownloadButtons(item) {
  const links = getDownloadLinks(item);
  if (!links.length) return `<span class="featured-of-btn featured-of-btn-soon">${t('home.soon')}</span>`;
  if (links.length === 1) {
    return `<a class="featured-of-btn featured-of-btn-download" href="${escapeHtml(links[0].href)}" target="_blank" rel="noopener noreferrer">${t('home.downloadAction')}</a>`;
  }
  const slug = optionSlug(item);
  return `<a class="featured-of-btn featured-of-btn-download" href="option-files/${encodeURIComponent(slug)}/descargar/">Ver descargas</a>`;
}

function renderFeaturedCard(item) {
  // Fallback title keeps old CSV rows usable, but new rows should define `titulo`.
  const title = escapeHtml(item.titulo || item.nombre || item.title || item.name || item.juego || 'Option File');
  const version = escapeHtml(item.version || '');
  const game = escapeHtml(item.game || item.juego || '');
  const platform = escapeHtml(Array.isArray(item.platforms) ? item.platforms.join(' / ') : (item.plataforma || item.platform || ''));
  const desc = escapeHtml(item.descripcion || item.description || '');
  const image = escapeHtml(assetPath(item.cover || item.miniatura || item.thumbnail || item.image || item.imagen));
  const slug = optionSlug(item);
  const details = assetPath(item.detalles || item.details || (slug ? `option-files/${encodeURIComponent(slug)}/` : ''), '');

  return `
    <article class="featured-of-card">
      <div class="featured-of-media">
        <img src="${image}" alt="${title}" loading="lazy" onerror="this.onerror=null;this.src='img/logo.webp'">
      </div>
      <div class="featured-of-card-header">
        <span class="featured-of-game">${title}</span>
        ${version ? `<span class="download-version-badge">${version}</span>` : ''}
      </div>
      ${game && game !== title ? `<div class="featured-of-game-sub">${game}</div>` : ''}
      ${platform ? `<div class="featured-of-platform"><span class="download-platform-badge">${platform}</span></div>` : ''}
      <p class="featured-of-desc">${desc || t('home.noDescription')}</p>
      <div class="featured-of-actions">
        ${details ? `<a class="featured-of-btn featured-of-btn-details" href="${escapeHtml(details)}">${t('home.details')}</a>` : ''}
        ${renderFeaturedDownloadButtons(item)}
      </div>
    </article>`;
}

function renderHomeGuide(article) {
  const articleUrl = typeof laqpArticleUrl === 'function'
    ? laqpArticleUrl(article.id, article.title)
    : `articulo.html?id=${encodeURIComponent(article.id)}`;
  return `
    <article class="editorial-card">
      <a class="editorial-card-media" href="${articleUrl}">
        <img src="${escapeHtml(assetPath(article.image))}" alt="${escapeHtml(article.title)}" loading="lazy" width="640" height="360" onerror="this.onerror=null;this.src='img/logo.webp'">
      </a>
      <div class="editorial-card-body">
        <div class="editorial-meta">
          <span>${escapeHtml(article.category)}</span>
          <span>${escapeHtml(article.readTime)}</span>
        </div>
        <h2><a href="${articleUrl}">${escapeHtml(article.title)}</a></h2>
        <p>${escapeHtml(article.description)}</p>
        <a class="editorial-card-cta" href="${articleUrl}">Ver guia</a>
      </div>
    </article>`;
}

async function renderHomeGuides() {
  const grid = document.getElementById('home-guides-grid');
  if (!grid) return;
  const articles = typeof loadLAQPArticles === 'function'
    ? await loadLAQPArticles()
    : (window.LAQP_ARTICLES || []);
  if (!articles.length) return;
  const preferredIds = [
    'instalar-option-file-pes-2018-2026',
    'importar-kits-pes-2018',
    'sistema-medias-pes-2018',
  ];
  const preferred = preferredIds
    .map(id => articles.find(article => article.id === id))
    .filter(Boolean);
  grid.innerHTML = (preferred.length === 3 ? preferred : articles.slice(0, 3))
    .map(renderHomeGuide)
    .join('');
}

async function bootHome() {
  const section = document.getElementById('featured-of-section');
  if (!section) return;

  // El HTML ya fue generado desde el CSV. Si hay que hidratarlo, usar siempre
  // ese mismo CSV para no reemplazarlo con un option-files.json desactualizado.
  const csvText = await fetchText('database/descargas.csv');
  if (!csvText) return;
  const rows = parseCSV(csvText);

  const featured = uniqueById(rows).filter(row => row.featured === true || String(row.destacado || '').trim() === '1');
  if (!featured.length) return;

  const grid = section.querySelector('#featured-of-grid');
  if (grid) grid.innerHTML = featured.map(renderFeaturedCard).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  renderHomeGuides().catch(err => console.error('Error loading home guides:', err));
  bootHome().catch(err => console.error('Error loading featured option files:', err));
});
