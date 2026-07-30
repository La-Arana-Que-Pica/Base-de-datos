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

function splitTags(value) {
  return String(value || '').split('|').map(tag => tag.trim()).filter(Boolean);
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

  if (!links.length) addLink(item.link || item.url, 'Descargar');
  return links;
}

function renderDownloadButtons(item, className = '') {
  const links = getDownloadLinks(item);
  if (!links.length) return '<span class="download-btn download-btn-unavailable">Proximamente</span>';

  return links.map(link => (
    `<a class="download-btn${className}" href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`
  )).join('');
}

function platformCopy(platform) {
  const value = String(platform || '').toUpperCase();
  if (value.includes('PC')) return 'Compatible con PES 2018 en PC. Revisá la ruta de guardado y no mezcles archivos de otro parche sin copia de seguridad.';
  if (value.includes('PS4') || value.includes('PS5')) return 'Compatible con PES 2018 de PS4 y con la version de PS4 ejecutada en PS5 mediante importacion desde WEPES.';
  return 'Revisá la plataforma indicada antes de instalar para evitar datos incompatibles.';
}

function formatDownloadDate(dateStr) {
  if (!dateStr) return '';
  const normalized = String(dateStr).includes('/')
    ? String(dateStr).split('/').reverse().join('-')
    : String(dateStr);
  const date = new Date(`${normalized}T00:00:00`);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function buildDownloadDetails(item) {
  const title = item.titulo || item.nombre || item.title || item.juego || 'Option File';
  const version = item.version || 'version publicada';
  const platform = item.plataforma || item.platform || '';
  const tags = splitTags(item.tags);
  const isComplement = /complement/i.test(title);
  const year = tags.find(tag => /^20\d{2}$/.test(tag)) || '2026';

  return {
    intro: `${title} es una descarga para mantener PES 2018 actualizado al ${year}. La idea no es solo reemplazar nombres: el pack ordena equipos, plantillas, kits y contenido editable para que el juego se sienta vigente sin perder estabilidad.`,
    features: isComplement
      ? ['Licencia equipos que no forman parte del Option File base.', 'Completa kits, escudos y datos editables pendientes.', 'Debe instalarse siguiendo el tutorial para respetar el orden correcto.']
      : ['Plantillas actualizadas y equipos reorganizados para la temporada indicada.', 'Kits, escudos, nombres de equipos y competiciones revisados.', 'Base preparada para explorar jugadores, ligas, equipos, stats y caras de PES 2018.'],
    compatibility: platformCopy(platform),
    steps: [
      'Descargá el archivo correspondiente a tu plataforma.',
      'Extraé el contenido y revisá si incluye carpeta WEPES, archivos .ted o instrucciones para PC.',
      'Instalá primero el Option File base y después los complementos de la misma versión.',
      'Abrí PES 2018 y verificá equipos, kits y plantillas antes de iniciar una partida larga.',
    ],
    issues: [
      'Si faltan kits, revisá espacio de imágenes y estructura de carpetas.',
      'Si un equipo aparece duplicado, probablemente se importó sobre otra base.',
      'Si las plantillas no coinciden, hacé una instalación limpia de datos editados.',
    ],
    changelog: [
      `${version}: publicacion preparada para ${platform || 'PES 2018'} dentro del sitio de PES 2018 actualizado.`,
      'Se recomienda mirar el tutorial relacionado antes de reemplazar archivos existentes.',
    ],
  };
}

function renderDownloadEditorial(item) {
  const detail = buildDownloadDetails(item);
  return `
    <div class="download-editorial">
      <p>${escapeHtml(detail.intro)}</p>
      <div class="download-detail-grid">
        <section>
          <h4>Caracteristicas</h4>
          <ul>${detail.features.map(feature => `<li>${escapeHtml(feature)}</li>`).join('')}</ul>
        </section>
        <section>
          <h4>Compatibilidad</h4>
          <p>${escapeHtml(detail.compatibility)}</p>
        </section>
        <section>
          <h4>Instalacion recomendada</h4>
          <ol>${detail.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
        </section>
        <section>
          <h4>Problemas comunes</h4>
          <ul>${detail.issues.map(issue => `<li>${escapeHtml(issue)}</li>`).join('')}</ul>
        </section>
      </div>
      <details class="download-faq">
        <summary>FAQ y changelog</summary>
        <div class="download-detail-grid">
          <section>
            <h4>Preguntas frecuentes</h4>
            <p>Hacé copia de seguridad y respetá la carpeta WEPES antes de instalar.</p>
          </section>
          <section>
            <h4>Changelog</h4>
            <ul>${detail.changelog.map(change => `<li>${escapeHtml(change)}</li>`).join('')}</ul>
          </section>
        </div>
      </details>
      <div class="download-related-links">
        <a href="${typeof laqpArticleUrl === 'function' ? laqpArticleUrl('instalar-option-file-pes-2018-2026', 'Guia de instalacion') : 'articulo.html?id=instalar-option-file-pes-2018-2026'}">Guia de instalacion</a>
        <a href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('tutorials.html') : 'tutorials.html'}">Tutorial en video</a>
        <a href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('rankings.html') : 'rankings.html'}">Scouting de fichajes</a>
      </div>
    </div>`;
}

function renderDownloadCard(item) {
  // Fallback title keeps old CSV rows usable, but new rows should define `titulo`.
  const title = escapeHtml(item.titulo || item.nombre || item.title || item.juego || 'Option File');
  const version = escapeHtml(item.version || '');
  const game = escapeHtml(item.juego || item.game || '');
  const platform = escapeHtml(item.plataforma || item.platform || '');
  const desc = escapeHtml(item.descripcion || item.description || '');
  const image = escapeHtml(assetPath(item.miniatura || item.thumbnail || item.image || item.imagen));
  const date = formatDownloadDate(item.fecha || item.date || '');
  const details = assetPath(item.detalles || item.details || '', '');
  const itemId = item.id || item.ID || '';
  const detailUrl = itemId
    ? (typeof laqpDownloadUrl === 'function' ? laqpDownloadUrl(itemId, title) : `downloads.html?id=${encodeURIComponent(itemId)}`)
    : (details || (typeof laqpPageUrl === 'function' ? laqpPageUrl('downloads.html') : 'downloads.html'));

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
        <div class="download-card-meta">
          ${date ? `<span>${escapeHtml(date)}</span>` : ''}
          ${item.categoria ? `<span>${escapeHtml(item.categoria)}</span>` : ''}
        </div>
        <h3 class="download-card-title">${title}</h3>
        ${game && game !== title ? `<div class="download-card-game">${game}</div>` : ''}
        <p class="download-description">${desc || 'Sin descripcion.'}</p>
      </div>
      <div class="download-card-footer">
        <a class="download-btn download-btn-secondary" href="${escapeHtml(detailUrl)}">Ver detalles</a>
        ${renderDownloadButtons(item)}
      </div>
    </article>`;
}

function renderDownloadDetail(item) {
  const title = escapeHtml(item.titulo || item.nombre || item.title || item.juego || 'Option File');
  const version = escapeHtml(item.version || '');
  const game = escapeHtml(item.juego || item.game || '');
  const platform = escapeHtml(item.plataforma || item.platform || '');
  const desc = escapeHtml(item.descripcion || item.description || '');
  const image = escapeHtml(assetPath(item.miniatura || item.thumbnail || item.image || item.imagen));
  const tags = splitTags(item.tags);
  const date = formatDownloadDate(item.fecha || item.date || '');

  return `
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('index.html') : 'index.html'}">${t('common.home')}</a>
      <a href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('downloads.html') : 'downloads.html'}">Option Files</a>
      <span>${title}</span>
    </nav>
    <article class="download-detail-page of-detail-page">
      <div class="download-detail-hero of-detail-hero">
        <div class="download-detail-media of-detail-media">
          <img src="${image}" alt="${title} para PES 2018" loading="eager" width="960" height="540" onerror="this.onerror=null;this.src='img/logo.webp'">
        </div>
        <div class="download-detail-summary of-detail-summary">
          <div class="download-card-header">
            ${platform ? `<span class="download-platform-badge">${platform}</span>` : ''}
            ${version ? `<span class="download-version-badge">${version}</span>` : ''}
            ${date ? `<span class="download-version-badge download-date-badge">${date}</span>` : ''}
          </div>
          <h1>${title}</h1>
          ${game && game !== title ? `<div class="download-card-game">${game}</div>` : ''}
          <p>${desc}</p>
          ${tags.length ? `<div class="download-tag-row">${tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
          <div class="download-detail-actions">
            ${renderDownloadButtons(item)}
            <a class="download-btn download-btn-secondary" href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('tutorials.html') : 'tutorials.html'}">Tutoriales</a>
            <a class="download-btn download-btn-secondary" href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('downloads.html') : 'downloads.html'}">Volver</a>
          </div>
        </div>
      </div>
      ${renderDownloadEditorial(item)}
    </article>
    <section class="download-context-panel">
      <h2>Contenido relacionado</h2>
      <div class="seo-link-row">
        <a href="${typeof laqpArticleUrl === 'function' ? laqpArticleUrl('instalar-option-file-pes-2018-2026', 'Como instalar Option Files') : 'articulo.html?id=instalar-option-file-pes-2018-2026'}">Como instalar Option Files</a>
        <a href="${typeof laqpArticleUrl === 'function' ? laqpArticleUrl('diferencia-option-file-parche-pes', 'Option File vs parche') : 'articulo.html?id=diferencia-option-file-parche-pes'}">Option File vs parche</a>
        <a href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('rankings.html') : 'rankings.html'}">Scouting de fichajes</a>
      </div>
    </section>`;
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

  const params = new URLSearchParams(window.location.search);
  const routeDownloadId = typeof laqpFirstRoutePart === 'function' ? laqpFirstRoutePart('download', 'id') : null;
  const selectedId = routeDownloadId || params.get('id');
  if (selectedId) {
    const selected = rows.find(row => String(row.id || row.ID || '') === selectedId);
    if (!selected) {
      showError('No se encontro la descarga solicitada.');
      return;
    }
    const selectedTitle = selected.titulo || selected.nombre || selected.title || 'Option File';
    document.title = `${selectedTitle} - Descargar PES 2018 | LAqP`;
    const canonical = document.querySelector('link[rel="canonical"]');
    const description = document.querySelector('meta[name="description"]');
    const selectedPath = typeof laqpDownloadUrl === 'function' ? laqpDownloadUrl(selectedId, selectedTitle) : `/downloads.html?id=${encodeURIComponent(selectedId)}`;
    if (canonical) canonical.setAttribute('href', typeof laqpAbsoluteUrl === 'function' ? laqpAbsoluteUrl(selectedPath) : `https://laqp.website${selectedPath}`);
    if (description) description.setAttribute('content', `${selectedTitle}: detalles, compatibilidad, instalacion, problemas comunes, changelog y descarga para PES 2018.`);
    if (window.location.pathname !== selectedPath && typeof history.replaceState === 'function') {
      history.replaceState(null, '', selectedPath);
    }
    content.innerHTML = renderDownloadDetail(selected);
    content.style.display = '';
    hideLoading();
    return;
  }

  content.innerHTML = `
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('index.html') : 'index.html'}">${t('common.home')}</a>
      <span>Option Files</span>
    </nav>
    <section class="content-hub-hero of-hero">
      <div class="guides-hero-icon" aria-hidden="true">OF</div>
      <div class="guides-hero-copy">
        <div class="content-hub-kicker">PES 2018</div>
        <h1>Option Files</h1>
        <p>Descargas ordenadas para actualizar PES 2018 en PS4, PS5 y PC.</p>
      </div>
    </section>
    <section class="guides-library-panel of-library-panel">
      <div class="guides-panel-head">
        <div>
          <span class="guides-panel-kicker">Descargas</span>
          <h2>Option Files publicados</h2>
        </div>
        <span class="guides-count-pill">${rows.length} archivos</span>
      </div>
      <div class="downloads-how-to">
        <strong>${t('downloads.firstTime')}</strong>
        <span>${t('downloads.howTo').replace(t('downloads.howToLink'), `<a href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('tutorials.html') : 'tutorials.html'}">${t('downloads.howToLink')}</a>`)}</span>
      </div>
      ${renderDownloads(groupByGame(rows))}
    </section>
    <section class="guides-quick-strip">
      <div class="guides-brand-tile">
        <img src="img/logo.webp" alt="LAqP" loading="lazy">
        <div>
          <strong>La Arana Que Pica</strong>
          <span>Option Files y herramientas PES 2018.</span>
        </div>
      </div>
      <a href="${typeof laqpArticleUrl === 'function' ? laqpArticleUrl('instalar-option-file-pes-2018-2026', 'Como instalar Option Files') : 'articulo.html?id=instalar-option-file-pes-2018-2026'}">
        <strong>Instalacion</strong>
        <span>Guia paso a paso</span>
      </a>
      <a href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('tutorials.html') : 'tutorials.html'}">
        <strong>Tutoriales</strong>
        <span>Videos de instalacion</span>
      </a>
      <a href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('database.html') : 'database.html'}">
        <strong>Base de datos</strong>
        <span>Jugadores y equipos</span>
      </a>
    </section>`;

  content.style.display = '';
  hideLoading();
}

document.addEventListener('DOMContentLoaded', () => {
  boot().catch(err => {
    showError(`Error inesperado: ${err.message}`);
    console.error(err);
  });
});

