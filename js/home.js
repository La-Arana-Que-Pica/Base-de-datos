/**
 * Base de datos Option File PES 2018–2026
 * Home Page Script
 *
 * Loads destacados.csv and renders featured Option File cards on the home page.
 * CSV format (semicolon-delimited):
 *   version;juego;plataforma;link;descripcion;destacado
 */

'use strict';

// ─── CSV parser ───────────────────────────────────────────────────────────────

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

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderFeaturedCard(item) {
  const version  = escapeHtml(item['version']    || '');
  const juego    = escapeHtml(item['juego']       || '');
  const platform = escapeHtml(item['plataforma']  || '');
  const link     = item['link'] || '#';
  const desc     = escapeHtml(item['descripcion'] || '');
  const isAvail  = link && link !== '#';

  const platIcons = { PS3: '🎮', PS4: '🎮', PS5: '🎮', PC: '🖥️', Xbox: '🎮' };
  const platIcon  = platIcons[item['plataforma']] || '📦';

  return `
    <div class="featured-of-card">
      <div class="featured-of-card-header">
        <span class="featured-of-game">${juego}</span>
        <span class="download-version-badge">${version}</span>
      </div>
      <div class="featured-of-platform">
        <span class="download-platform-badge">${platIcon} ${platform}</span>
      </div>
      <p class="featured-of-desc">${desc || 'Sin descripción.'}</p>
      <div class="featured-of-actions">
        ${isAvail
          ? `<a class="featured-of-btn featured-of-btn-download" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">⬇ Descargar</a>`
          : `<span class="featured-of-btn featured-of-btn-soon">Próximamente</span>`}
        <a class="featured-of-btn featured-of-btn-details" href="downloads.html">Ver todos</a>
      </div>
    </div>`;
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function bootHome() {
  const section = document.getElementById('featured-of-section');
  if (!section) return;

  const csvText = await fetchText('database/destacados.csv');
  if (!csvText) {
    section.style.display = 'none';
    return;
  }

  const rows = parseCSV(csvText).filter(r => r['destacado'] === '1');
  if (!rows.length) {
    section.style.display = 'none';
    return;
  }

  const grid = section.querySelector('#featured-of-grid');
  if (grid) {
    grid.innerHTML = rows.map(renderFeaturedCard).join('');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bootHome().catch(err => console.error('Error loading featured option files:', err));
});
