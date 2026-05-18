/**
 * Tutorials page.
 * Loads tutoriales.csv and renders a list + internal detail view.
 */

'use strict';

let _tutorialRows = [];

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
    headers.forEach((h, idx) => { obj[h] = values[idx] !== undefined ? values[idx] : ''; });
    result.push(obj);
  }
  return result;
}

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
  const content = document.getElementById('tutorials-content');
  if (!content) return;
  content.style.display = '';
  content.innerHTML = `<div class="error-message">${escapeHtml(message)}</div>`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
}

function tutorialThumbnail(videoId, item) {
  return item.thumbnail || item.image || (videoId ? `https://img.youtube.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg` : 'img/logo.webp');
}

function renderTutorialCard(item, index) {
  const title = escapeHtml(item.titulo || item.title || 'Tutorial');
  const videoId = (item.video_id || item.youtube || '').trim();
  const desc = escapeHtml(item.descripcion || item.description || '');
  const date = formatDate(item.fecha || item.date || '');
  const thumb = escapeHtml(tutorialThumbnail(videoId, item));

  return `
    <article class="tutorial-card" onclick="showTutorialDetail(${index})">
      <div class="tutorial-card-thumb-wrap">
        <img class="tutorial-card-thumb" src="${thumb}" alt="${title} - tutorial PES 2018" loading="lazy" width="480" height="270" onerror="this.onerror=null;this.src='img/logo.webp'">
        ${videoId ? `<span class="tutorial-play-btn" aria-hidden="true">&#9658;</span>` : ''}
      </div>
      <div class="tutorial-card-body">
        <h3 class="tutorial-card-title">${title}</h3>
        ${date ? `<time class="tutorial-card-date">${date}</time>` : ''}
        <p class="tutorial-card-desc">${desc}</p>
        <button class="tutorial-watch-btn" onclick="event.stopPropagation();showTutorialDetail(${index})">Ver tutorial</button>
      </div>
    </article>`;
}

function renderTutorialList() {
  return `
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="index.html">${t('common.home')}</a>
      <span>${t('nav.tutorials')}</span>
    </nav>
    <div class="page-section-header">
      <h1 class="page-section-title">${t('tutorials.title')}</h1>
      <p class="page-section-subtitle">${t('tutorials.subtitle')}</p>
    </div>
    <div class="tutorial-cards-grid">
      ${_tutorialRows.map(renderTutorialCard).join('')}
    </div>`;
}

function showTutorialList() {
  const content = document.getElementById('tutorials-content');
  if (!content) return;
  content.innerHTML = renderTutorialList();
}

function showTutorialDetail(index) {
  const item = _tutorialRows[index];
  const content = document.getElementById('tutorials-content');
  if (!item || !content) return;

  const title = escapeHtml(item.titulo || item.title || 'Tutorial');
  const videoId = (item.video_id || item.youtube || '').trim();
  const desc = escapeHtml(item.descripcion || item.description || '');
  const date = formatDate(item.fecha || item.date || '');
  const thumb = escapeHtml(tutorialThumbnail(videoId, item));
  const steps = String(item.pasos || item.resumen || item.steps || '').split('|').map(s => s.trim()).filter(Boolean);
  updateTutorialSchema(item, title, desc, videoId, thumb, date);

  content.innerHTML = `
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="index.html">Inicio</a>
      <a href="tutorials.html">Tutoriales</a>
      <span>${title}</span>
    </nav>
    <button class="back-btn" onclick="showTutorialList()">‹ Volver a tutoriales</button>
    <article class="tutorial-detail">
      <div class="tutorial-detail-media">
        ${videoId
          ? `<iframe class="tutorial-iframe" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0" title="${title}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>`
          : `<img class="tutorial-detail-thumb" src="${thumb}" alt="${title} - tutorial PES 2018" width="960" height="540">`}
      </div>
      <div class="tutorial-detail-body">
        ${date ? `<time class="tutorial-card-date">${date}</time>` : ''}
        <h1>${title}</h1>
        <p>${desc}</p>
        ${steps.length ? `<ol class="tutorial-steps">${steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol>` : ''}
      </div>
    </article>`;
  content.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateTutorialSchema(item, title, desc, videoId, thumb, date) {
  document.querySelectorAll('script[data-dynamic-schema="tutorial"]').forEach(el => el.remove());
  if (!videoId) return;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: title,
    description: desc || 'Tutorial de PES 2018 del proyecto LAqP.',
    thumbnailUrl: [thumb],
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
    publisher: {
      '@type': 'Organization',
      name: 'LAqP',
      logo: {
        '@type': 'ImageObject',
        url: 'https://laqp.website/img/logo.png',
      },
    },
  };
  if (date) schema.uploadDate = item.fecha || item.date;
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.dataset.dynamicSchema = 'tutorial';
  script.textContent = JSON.stringify(schema);
  document.head.appendChild(script);
}

async function boot() {
  showLoading('Cargando tutoriales...');

  const csvText = await fetchText('database/tutoriales.csv');
  if (!csvText) {
    showError('No se pudo cargar el archivo de tutoriales.');
    return;
  }

  _tutorialRows = parseCSV(csvText);
  if (!_tutorialRows.length) {
    showError('No hay tutoriales disponibles en este momento.');
    return;
  }

  const content = document.getElementById('tutorials-content');
  if (!content) return;
  content.innerHTML = renderTutorialList();
  content.style.display = '';
  hideLoading();
}

document.addEventListener('DOMContentLoaded', () => {
  boot().catch(err => {
    showError(`Error inesperado: ${err.message}`);
    console.error(err);
  });
});

