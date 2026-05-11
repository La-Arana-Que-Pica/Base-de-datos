/**
 * Home page.
 * Reads featured Option Files exclusively from database/descargas.csv.
 * Only rows with destacado exactly equal to "1" are rendered.
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

function renderFeaturedCard(item) {
  // Fallback title keeps old CSV rows usable, but new rows should define `titulo`.
  const title = escapeHtml(item.titulo || item.nombre || item.title || item.name || item.juego || 'Option File');
  const version = escapeHtml(item.version || '');
  const game = escapeHtml(item.juego || '');
  const platform = escapeHtml(item.plataforma || item.platform || '');
  const link = item.link || item.url || '#';
  const desc = escapeHtml(item.descripcion || item.description || '');
  const image = escapeHtml(assetPath(item.miniatura || item.thumbnail || item.image || item.imagen));
  const details = assetPath(item.detalles || item.details || '', '');
  const isAvailable = link && link !== '#';

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
      <p class="featured-of-desc">${desc || 'Sin descripcion.'}</p>
      <div class="featured-of-actions">
        ${isAvailable
          ? `<a class="featured-of-btn featured-of-btn-download" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Descargar</a>`
          : `<span class="featured-of-btn featured-of-btn-soon">Proximamente</span>`}
        ${details ? `<a class="featured-of-btn featured-of-btn-details" href="${escapeHtml(details)}">Ver detalles</a>` : ''}
      </div>
    </article>`;
}

async function bootHome() {
  const section = document.getElementById('featured-of-section');
  if (!section) return;

  const csvText = await fetchText('database/descargas.csv');
  if (!csvText) {
    section.style.display = 'none';
    return;
  }

  const featured = uniqueById(parseCSV(csvText)).filter(row => String(row.destacado || '').trim() === '1');
  if (!featured.length) {
    section.style.display = 'none';
    return;
  }

  const grid = section.querySelector('#featured-of-grid');
  if (grid) grid.innerHTML = featured.map(renderFeaturedCard).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  bootHome().catch(err => console.error('Error loading featured option files:', err));
});
