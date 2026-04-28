/**
 * Base de datos Option File PES 2018–2026
 * Tutorials Page Script
 *
 * Loads tutoriales.csv and renders tutorial cards with embedded YouTube videos.
 * CSV format (semicolon-delimited):
 *   id;titulo;video_id;descripcion;fecha
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
  const content = document.getElementById('tutorials-content');
  if (content) {
    content.style.display = '';
    content.innerHTML = `<div class="error-message">${escapeHtml(message)}</div>`;
  }
}

// ─── State ────────────────────────────────────────────────────────────────────

// ID of the currently expanded/playing tutorial (null = none)
let _activeTutorialId = null;

// ─── Rendering ────────────────────────────────────────────────────────────────

/**
 * Formats a YYYY-MM-DD date string to a human-readable Spanish date.
 * @param {string} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Renders a single tutorial card.
 * @param {Object} item
 * @param {number} index  0-based index within the list
 * @returns {string}
 */
function renderTutorialCard(item, index) {
  const id       = escapeHtml(item['id'] || String(index + 1));
  const titulo   = escapeHtml(item['titulo'] || 'Sin título');
  const videoId  = (item['video_id'] || '').trim();
  const desc     = escapeHtml(item['descripcion'] || '');
  const dateStr  = formatDate(item['fecha'] || '');
  const cardId   = `tutorial-card-${id}`;

  // Thumbnail from YouTube (hqdefault = 480×360)
  const thumbSrc = videoId
    ? `https://img.youtube.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`
    : '';

  return `
    <article class="tutorial-card" id="${cardId}">
      <div class="tutorial-card-thumb-wrap">
        ${thumbSrc
          ? `<img class="tutorial-card-thumb" src="${thumbSrc}" alt="${titulo}"
               onerror="this.onerror=null;this.src='img/logo.webp'"
               loading="lazy">`
          : `<div class="tutorial-card-thumb tutorial-card-thumb-placeholder">🎥</div>`}
        ${videoId
          ? `<button class="tutorial-play-btn" onclick="playTutorial('${escapeHtml(videoId)}','${cardId}')" aria-label="Reproducir">▶</button>`
          : ''}
      </div>
      <div class="tutorial-card-body">
        <h3 class="tutorial-card-title">${titulo}</h3>
        ${dateStr ? `<time class="tutorial-card-date">${dateStr}</time>` : ''}
        <p class="tutorial-card-desc">${desc}</p>
        ${videoId
          ? `<button class="tutorial-watch-btn" onclick="playTutorial('${escapeHtml(videoId)}','${cardId}')">▶ Ver tutorial</button>`
          : ''}
      </div>
      <!-- Video embed container (hidden until user clicks play) -->
      <div class="tutorial-embed-wrap" id="embed-${cardId}" style="display:none"></div>
    </article>`;
}

/**
 * Expands (or collapses) a tutorial card to show the YouTube embed.
 * Pauses any other currently active tutorial.
 * @param {string} videoId  YouTube video ID
 * @param {string} cardId   ID of the article element that owns the button
 */
function playTutorial(videoId, cardId) {
  // Collapse previous embed
  if (_activeTutorialId && _activeTutorialId !== cardId) {
    const prevWrap = document.getElementById(`embed-${_activeTutorialId}`);
    if (prevWrap) {
      prevWrap.style.display = 'none';
      prevWrap.innerHTML = '';
    }
    const prevCard = document.getElementById(_activeTutorialId);
    if (prevCard) prevCard.classList.remove('tutorial-card--expanded');
  }

  const embedWrap = document.getElementById(`embed-${cardId}`);
  const card      = document.getElementById(cardId);
  if (!embedWrap || !card) return;

  // Toggle: if already expanded with same card, collapse it
  if (_activeTutorialId === cardId && card.classList.contains('tutorial-card--expanded')) {
    embedWrap.style.display = 'none';
    embedWrap.innerHTML = '';
    card.classList.remove('tutorial-card--expanded');
    _activeTutorialId = null;
    return;
  }

  // Build embed iframe
  const safeVideoId = encodeURIComponent(videoId);
  embedWrap.innerHTML = `
    <iframe class="tutorial-iframe"
      src="https://www.youtube-nocookie.com/embed/${safeVideoId}?autoplay=1&rel=0"
      title="YouTube video"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen
      loading="lazy">
    </iframe>`;
  embedWrap.style.display = '';
  card.classList.add('tutorial-card--expanded');
  _activeTutorialId = cardId;

  // Scroll card into view
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  showLoading('Cargando tutoriales...');

  const csvText = await fetchText('database/tutoriales.csv');
  if (!csvText) {
    showError('No se pudo cargar el archivo de tutoriales.');
    return;
  }

  const rows = parseCSV(csvText);
  if (!rows.length) {
    showError('No hay tutoriales disponibles en este momento.');
    return;
  }

  const cardsHtml = rows.map((row, i) => renderTutorialCard(row, i)).join('');
  const content   = document.getElementById('tutorials-content');
  if (!content) return;

  content.innerHTML = `
    <div class="page-section-header">
      <h1 class="page-section-title">🎥 Tutoriales</h1>
      <p class="page-section-subtitle">
        Guías en vídeo para sacarle el máximo partido al Option File.
        Haz clic en un tutorial para reproducirlo directamente aquí.
      </p>
    </div>
    <div class="tutorial-cards-grid">
      ${cardsHtml}
    </div>`;

  content.style.display = '';
  hideLoading();
}

document.addEventListener('DOMContentLoaded', () => {
  boot().catch(err => {
    showError(`Error inesperado: ${err.message}`);
    console.error(err);
  });
});
