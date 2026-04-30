/**
 * Base de datos Option File PES 2018–2026
 * Downloads Page Script
 *
 * Loads descargas.csv and renders download cards grouped by game and platform.
 * CSV format (semicolon-delimited):
 *   version;juego;plataforma;link;descripcion
 */

'use strict';

// ─── CSV parser ───────────────────────────────────────────────────────────────

/**
 * Parse a semicolon-delimited CSV string into an array of objects.
 * @param {string} text
 * @returns {Object[]}
 */
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].replace(/^\uFEFF/, '').split(';').map(h => h.trim());
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(';').map(v => v.trim());
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] !== undefined ? values[idx] : '';
    });
    result.push(obj);
  }
  return result;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  if (overlay) {
    overlay.style.display = 'flex';
    const msg = overlay.querySelector('.loading-message');
    if (msg) msg.textContent = message || 'Cargando...';
  }
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'none';
}

function showError(message) {
  hideLoading();
  const content = document.getElementById('downloads-content');
  if (content) {
    content.style.display = '';
    content.innerHTML = `<div class="error-message">${escapeHtml(message)}</div>`;
  }
}

// ─── Rendering ────────────────────────────────────────────────────────────────

/**
 * Groups an array of download items by game.
 * @param {Object[]} rows
 * @returns {Map<string, Object[]>}
 */
function groupByGame(rows) {
  const map = new Map();
  rows.forEach(row => {
    const game = row['juego'] || 'Sin juego';
    if (!map.has(game)) map.set(game, []);
    map.get(game).push(row);
  });
  return map;
}

/**
 * Renders a single download card.
 * @param {Object} item
 * @returns {string}
 */
function renderDownloadCard(item) {
  const version  = escapeHtml(item['version']     || '');
  const juego    = escapeHtml(item['juego']        || '');
  const platform = escapeHtml(item['plataforma']   || '');
  const link     = item['link'] || '#';
  const desc     = escapeHtml(item['descripcion']  || '');
  const isAvail  = link && link !== '#';

  // Platform icon
  const platIcons = { PS3: '🎮', PS4: '🎮', PS5: '🎮', PC: '🖥️', Xbox: '🎮' };
  const platIcon = platIcons[item['plataforma']] || '📦';

  return `
    <div class="download-card">
      <div class="download-card-header">
        <span class="download-platform-badge">${platIcon} ${platform}</span>
        <span class="download-version-badge">${version}</span>
      </div>
      <div class="download-card-body">
        <p class="download-description">${desc || 'Sin descripción.'}</p>
      </div>
      <div class="download-card-footer">
        ${isAvail
          ? `<a class="download-btn" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">⬇ Descargar</a>`
          : `<span class="download-btn download-btn-unavailable">Próximamente</span>`}
      </div>
    </div>`;
}

/**
 * Renders all download groups.
 * @param {Map<string, Object[]>} grouped
 * @returns {string}
 */
function renderDownloads(grouped) {
  let html = '';
  grouped.forEach((items, game) => {
    const cardsHtml = items.map(renderDownloadCard).join('');
    html += `
      <section class="download-group">
        <h2 class="download-group-title">
          <img class="download-group-logo" src="img/logo.webp" onerror="this.style.display='none'" alt="">
          ${escapeHtml(game)}
        </h2>
        <div class="download-cards-grid">
          ${cardsHtml}
        </div>
      </section>`;
  });
  return html;
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  showLoading('Cargando descargas...');

  const csvText = await fetchText('database/descargas.csv');
  if (!csvText) {
    showError('No se pudo cargar el archivo de descargas.');
    return;
  }

  const rows = parseCSV(csvText);
  if (!rows.length) {
    showError('No hay descargas disponibles en este momento.');
    return;
  }

  const grouped = groupByGame(rows);
  const content = document.getElementById('downloads-content');
  if (!content) return;

  content.innerHTML = `
    <div class="page-section-header">
      <h1 class="page-section-title">📦 Option Files</h1>
      <p class="page-section-subtitle">
        Descarga el Option File para tu versión de PES y plataforma. Los archivos se
        actualizan periódicamente con los últimos kits, escudos y plantillas.
      </p>
    </div>
    <div class="downloads-how-to">
      <h3>¿Cómo instalar?</h3>
      <p>¿Primera vez? Visita nuestra sección de <a href="tutorials.html">tutoriales</a> para ver cómo instalar paso a paso.</p>
    </div>
    ${renderDownloads(grouped)}`;

  content.style.display = '';
  hideLoading();
}

document.addEventListener('DOMContentLoaded', () => {
  boot().catch(err => {
    showError(`Error inesperado: ${err.message}`);
    console.error(err);
  });
});
