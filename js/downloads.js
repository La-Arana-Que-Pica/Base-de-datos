/**
 * Option Files page.
 * Every card is rendered from database/descargas.csv.
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

async function fetchText(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

function showLoading(message) {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  const msg = overlay.querySelector('.loading-message');
  if (msg) msg.textContent = message || 'Cargando...';
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'none';
}

function showError(message) {
  hideLoading();
  const content = document.getElementById('downloads-content');
  if (!content) return;
  content.style.display = '';
  content.innerHTML = `<div class="error-message">${escapeHtml(message)}</div>`;
}

function groupByGame(rows) {
  const map = new Map();
  rows.forEach(row => {
    const game = row.juego || row.game || 'Option Files';
    if (!map.has(game)) map.set(game, []);
    map.get(game).push(row);
  });
  return map;
}

function renderDownloadCard(item) {
  // Fallback title keeps old CSV rows usable, but new rows should define `titulo`.
  const title = escapeHtml(item.titulo || item.nombre || item.title || item.juego || 'Option File');
  const version = escapeHtml(item.version || '');
  const game = escapeHtml(item.juego || item.game || '');
  const platform = escapeHtml(item.plataforma || item.platform || '');
  const link = item.link || item.url || '#';
  const desc = escapeHtml(item.descripcion || item.description || '');
  const image = escapeHtml(assetPath(item.miniatura || item.thumbnail || item.image || item.imagen));
  const details = assetPath(item.detalles || item.details || '', '');
  const isAvailable = link && link !== '#';

  return `
    <article class="download-card" id="${escapeHtml(item.id || '')}">
      <div class="download-card-media">
        <img src="${image}" alt="${title} para PES 2018" loading="lazy" width="640" height="360" onerror="this.onerror=null;this.src='img/logo.webp'">
      </div>
      <div class="download-card-header">
        ${platform ? `<span class="download-platform-badge">${platform}</span>` : ''}
        ${version ? `<span class="download-version-badge">${version}</span>` : ''}
      </div>
      <div class="download-card-body">
        <h3 class="download-card-title">${title}</h3>
        ${game && game !== title ? `<div class="download-card-game">${game}</div>` : ''}
        <p class="download-description">${desc || 'Sin descripcion.'}</p>
      </div>
      <div class="download-card-footer">
        ${isAvailable
          ? `<a class="download-btn" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Descargar</a>`
          : `<span class="download-btn download-btn-unavailable">Proximamente</span>`}
        ${details ? `<a class="download-btn download-btn-secondary" href="${escapeHtml(details)}">Ver detalles</a>` : ''}
      </div>
    </article>`;
}

function renderDownloads(grouped) {
  let html = '';
  grouped.forEach((items, game) => {
    html += `
      <section class="download-group">
        <h2 class="download-group-title">${escapeHtml(game)}</h2>
        <div class="download-cards-grid">
          ${items.map(renderDownloadCard).join('')}
        </div>
      </section>`;
  });
  return html;
}

async function boot() {
  showLoading('Cargando descargas...');

  const csvText = await fetchText('database/descargas.csv');
  if (!csvText) {
    showError('No se pudo cargar el archivo de descargas.');
    return;
  }

  const rows = uniqueById(parseCSV(csvText));
  if (!rows.length) {
    showError('No hay descargas disponibles en este momento.');
    return;
  }

  const content = document.getElementById('downloads-content');
  if (!content) return;

  content.innerHTML = `
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="index.html">${t('common.home')}</a>
      <span>Option Files</span>
    </nav>
    <div class="page-section-header">
      <h1 class="page-section-title">${t('downloads.title')}</h1>
      <p class="page-section-subtitle">${t('downloads.subtitle')}</p>
    </div>
    <div class="downloads-how-to">
      <h3>${t('downloads.firstTime')}</h3>
      <p>${t('downloads.howTo').replace(t('downloads.howToLink'), `<a href="tutorials.html">${t('downloads.howToLink')}</a>`)}</p>
    </div>
    ${renderDownloads(groupByGame(rows))}`;

  content.style.display = '';
  hideLoading();
}

document.addEventListener('DOMContentLoaded', () => {
  boot().catch(err => {
    showError(`Error inesperado: ${err.message}`);
    console.error(err);
  });
});

