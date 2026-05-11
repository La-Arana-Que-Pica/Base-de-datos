/**
 * News page.
 * Builds a lightweight novedades feed from the existing CSV sources.
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
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseLine(line);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] !== undefined ? values[idx] : '';
    });
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

function showError(message) {
  const loading = document.getElementById('loading-overlay');
  const content = document.getElementById('news-content');
  if (loading) loading.style.display = 'none';
  if (!content) return;
  content.style.display = '';
  content.innerHTML = `<div class="error-message">${escapeHtml(message)}</div>`;
}

function renderNewsItem(item) {
  const cta = item.href
    ? `<a class="news-card-link" href="${escapeHtml(item.href)}">${escapeHtml(item.cta || 'Ver mas')}</a>`
    : '';

  return `
    <article class="news-card">
      <div class="news-card-kicker">${escapeHtml(item.type)}</div>
      <h2 class="news-card-title">${escapeHtml(item.title)}</h2>
      <p class="news-card-desc">${escapeHtml(item.description)}</p>
      ${item.meta ? `<div class="news-card-meta">${escapeHtml(item.meta)}</div>` : ''}
      ${cta}
    </article>`;
}

async function bootNews() {
  const [newsText, downloadsText, tutorialsText] = await Promise.all([
    fetchText('database/novedades.csv'),
    fetchText('database/descargas.csv'),
    fetchText('database/tutoriales.csv'),
  ]);

  const items = [];

  if (newsText) {
    parseCSV(newsText)
      .sort((a, b) => String(b.date || b.fecha || '').localeCompare(String(a.date || a.fecha || '')))
      .forEach(row => {
        items.push({
          type: row.category || row.categoria || 'Canal',
          title: row.title || row.titulo || 'Novedad',
          description: row.description || row.descripcion || '',
          meta: row.date || row.fecha || '',
          href: row.link || row.url || '',
          cta: 'Ver relacionado',
        });
      });
  }

  if (downloadsText) {
    parseCSV(downloadsText)
      .filter(row => String(row.destacado || '').trim() === '1')
      .slice(0, 3)
      .forEach(row => {
        items.push({
          type: 'Option File',
          title: row.titulo || `${row.juego || 'Option File'} ${row.version || ''}`.trim(),
          description: row.descripcion || 'Nueva version destacada disponible.',
          meta: row.plataforma || '',
          href: 'downloads.html',
          cta: 'Ver descarga',
        });
      });
  }

  if (tutorialsText) {
    parseCSV(tutorialsText)
      .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))
      .slice(0, 2)
      .forEach(row => {
        items.push({
          type: 'Tutorial',
          title: row.titulo || 'Nuevo tutorial',
          description: row.descripcion || 'Nuevo contenido del canal.',
          meta: row.fecha || '',
          href: 'tutorials.html',
          cta: 'Ver tutorial',
        });
      });
  }

  if (!items.length && downloadsText) {
    parseCSV(downloadsText).slice(-3).reverse().forEach(row => {
      items.push({
        type: 'Option File',
        title: `${row.juego || 'Option File'} ${row.version || ''}`.trim(),
        description: row.descripcion || 'Archivo disponible en la seccion de descargas.',
        meta: row.plataforma || '',
        href: 'downloads.html',
        cta: 'Ver descarga',
      });
    });
  }

  if (!items.length) {
    showError('No hay novedades disponibles en este momento.');
    return;
  }

  const loading = document.getElementById('loading-overlay');
  const content = document.getElementById('news-content');
  if (!content) return;

  content.innerHTML = `
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="index.html">Inicio</a>
      <span>Novedades</span>
    </nav>
    <div class="page-section-header">
      <h1 class="page-section-title">Novedades</h1>
      <p class="page-section-subtitle">
        Changelog del Option File, actualizaciones del canal, tutoriales nuevos y cambios importantes de la base de datos.
      </p>
    </div>
    <div class="news-grid">
      ${items.map(renderNewsItem).join('')}
    </div>`;

  content.style.display = '';
  if (loading) loading.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  bootNews().catch(err => {
    showError(`Error inesperado: ${err.message}`);
    console.error(err);
  });
});
