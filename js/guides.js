'use strict';

function guideText(value) {
  const str = String(value || '');
  if (!/[ÃÂ]/.test(str)) return str;
  try {
    return decodeURIComponent(str.split('').map(char => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
  } catch {
    return str
      .replace(/Ã¡/g, 'á').replace(/Ã©/g, 'é').replace(/Ã­/g, 'í').replace(/Ã³/g, 'ó').replace(/Ãº/g, 'ú')
      .replace(/Ã±/g, 'ñ').replace(/Ã/g, 'Á').replace(/Ã‰/g, 'É').replace(/Ã/g, 'Í').replace(/Ã“/g, 'Ó')
      .replace(/Ãš/g, 'Ú').replace(/Ã‘/g, 'Ñ').replace(/Â¿/g, '¿').replace(/Â¡/g, '¡');
  }
}

function guideEscape(str) {
  return guideText(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function guideDate(date) {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00`);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
}

function guideShortDate(date) {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00`);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function articleUrl(article) {
  return typeof laqpArticleUrl === 'function'
    ? laqpArticleUrl(article.id, article.title)
    : `articulo.html?id=${encodeURIComponent(article.id)}`;
}

function guideImage(article) {
  const images = {
    'instalar-option-file-pes-2018-2026': 'assets/images/guias/instalar-of.png',
    'importar-kits-pes-2018': 'assets/images/guias/configurar-kits.png',
    'consejos-crear-caras-pes-2018-editor-interno': 'assets/images/guias/consejos-caras.png',
    'sistema-medias-pes-2018': 'assets/images/guias/sistema-medias.png',
    'sider-y-cpk-pes-2018': 'assets/images/guias/cpk-vs-sider.png',
    'diferencia-option-file-parche-pes': 'assets/images/guias/parches-vs-option-files.png',
  };
  return images[article.id] || article.image || 'img/logo.webp';
}

function guideCategoryKey(category) {
  return guideText(category)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function updateGuidesCount(count, total) {
  const target = document.getElementById('guides-count');
  if (!target) return;
  target.textContent = count === total ? `${total} guias publicadas` : `${count} de ${total} guias`;
}

function renderGuideCard(article, index) {
  const url = articleUrl(article);
  const category = guideText(article.category);
  return `
    <article class="editorial-card guide-card" data-category="${guideEscape(guideCategoryKey(category))}">
      <a class="editorial-card-media" href="${url}">
        <img src="${guideEscape(guideImage(article))}" alt="${guideEscape(article.title)}" loading="lazy" width="640" height="360" onerror="this.onerror=null;this.src='img/logo.webp'">
      </a>
      <div class="editorial-card-body">
        <div class="editorial-meta guide-card-meta">
          <span>${guideEscape(article.readTime)}</span>
          <span>${guideEscape(category)}</span>
          <time datetime="${guideEscape(article.date)}">${guideEscape(guideShortDate(article.date))}</time>
        </div>
        <h2><a href="${url}">${guideEscape(article.title)}</a></h2>
        <p>${guideEscape(article.description)}</p>
        <a class="text-link guide-card-link" href="${url}">Ver guia <span aria-hidden="true">&rsaquo;</span></a>
      </div>
    </article>`;
}

async function getArticles() {
  return typeof loadLAQPArticles === 'function'
    ? await loadLAQPArticles()
    : (window.LAQP_ARTICLES || []);
}

async function renderGuidesPage() {
  const grid = document.getElementById('guides-grid');
  if (!grid) return;
  const articles = await getArticles();
  if (!articles.length) return;
  grid.innerHTML = articles.map(renderGuideCard).join('');
  updateGuidesCount(articles.length, articles.length);

  document.querySelectorAll('.topic-filter-btn').forEach(button => {
    button.addEventListener('click', () => {
      const category = guideCategoryKey(button.dataset.category || 'all');
      let visible = 0;
      document.querySelectorAll('.topic-filter-btn').forEach(btn => btn.classList.toggle('is-active', btn === button));
      grid.querySelectorAll('.editorial-card').forEach(card => {
        const shouldHide = category !== 'all' && card.dataset.category !== category;
        card.hidden = shouldHide;
        if (!shouldHide) visible += 1;
      });
      updateGuidesCount(visible, articles.length);
    });
  });
}

function updateMeta(article) {
  document.title = `${guideText(article.title)} | LAqP`;
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', guideText(article.description));
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute('href', typeof laqpAbsoluteUrl === 'function' ? laqpAbsoluteUrl(articleUrl(article)) : `https://laqp.website/${articleUrl(article)}`);
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const ogDesc = document.querySelector('meta[property="og:description"]');
  const ogImage = document.querySelector('meta[property="og:image"]');
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogTitle) ogTitle.setAttribute('content', guideText(article.title));
  if (ogDesc) ogDesc.setAttribute('content', guideText(article.description));
  if (ogImage) ogImage.setAttribute('content', `https://laqp.website/${article.image.replace(/^\/+/, '')}`);
  if (ogUrl) ogUrl.setAttribute('content', typeof laqpAbsoluteUrl === 'function' ? laqpAbsoluteUrl(articleUrl(article)) : `https://laqp.website/${articleUrl(article)}`);
}

function articleSchema(article) {
  document.querySelectorAll('script[data-dynamic-schema="article"]').forEach(el => el.remove());
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guideText(article.title),
    description: guideText(article.description),
    image: `https://laqp.website/${article.image.replace(/^\/+/, '')}`,
    datePublished: article.date,
    dateModified: article.date,
    inLanguage: 'es',
    author: { '@type': 'Organization', name: 'LAqP' },
    publisher: {
      '@type': 'Organization',
      name: 'LAqP',
      logo: { '@type': 'ImageObject', url: 'https://laqp.website/img/logo.png' },
    },
    mainEntityOfPage: typeof laqpAbsoluteUrl === 'function' ? laqpAbsoluteUrl(articleUrl(article)) : `https://laqp.website/${articleUrl(article)}`,
  };
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.dataset.dynamicSchema = 'article';
  script.textContent = JSON.stringify(schema);
  document.head.appendChild(script);
}

async function renderArticlePage() {
  const root = document.getElementById('article-content');
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const routeArticleId = typeof laqpFirstRoutePart === 'function'
    ? (laqpFirstRoutePart('guia', 'id') || laqpFirstRoutePart('article', 'id'))
    : null;
  const articles = await getArticles();
  const article = articles.find(item => item.id === (routeArticleId || params.get('id'))) || articles[0];
  if (!article) {
    root.innerHTML = '<div class="error-message">No se encontro el articulo solicitado.</div>';
    return;
  }

  updateMeta(article);
  articleSchema(article);
  const prettyPath = articleUrl(article);
  if (window.location.pathname !== prettyPath && typeof history.replaceState === 'function') {
    history.replaceState(null, '', prettyPath);
  }

  const related = (article.related || [])
    .map(id => articles.find(item => item.id === id))
    .filter(Boolean);

  root.innerHTML = `
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('index.html') : 'index.html'}">Inicio</a>
      <a href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('guias.html') : 'guias.html'}">Guias</a>
      <span>${guideEscape(article.category)}</span>
    </nav>
    <article class="long-article">
      <header class="long-article-header">
        <div class="editorial-meta">
          <span>${guideEscape(article.category)}</span>
          <time datetime="${guideEscape(article.date)}">${guideDate(article.date)}</time>
          <span>${guideEscape(article.readTime)}</span>
        </div>
        <h1>${guideEscape(article.title)}</h1>
        <p>${guideEscape(article.description)}</p>
        <img src="${guideEscape(article.image)}" alt="${guideEscape(article.title)}" loading="eager" width="960" height="540" onerror="this.onerror=null;this.src='img/logo.webp'">
      </header>

      <div class="article-layout">
        <aside class="article-toc" aria-label="Indice del articulo">
          <strong>En esta guia</strong>
          ${article.sections.map((section, index) => `<a href="#section-${index + 1}">${guideEscape(section.heading)}</a>`).join('')}
          <a href="#faq">FAQ</a>
        </aside>

        <div class="article-body">
          ${article.sections.map((section, index) => `
            <section id="section-${index + 1}">
              <h2>${guideEscape(section.heading)}</h2>
              ${(section.body || []).map(p => `<p>${guideEscape(p)}</p>`).join('')}
              ${section.list ? `<ul>${section.list.map(item => `<li>${guideEscape(item)}</li>`).join('')}</ul>` : ''}
              ${section.figure && section.figure.image ? `
                <figure class="article-figure${section.figure.size === 'small' ? ' article-figure-small' : ''}">
                  <img src="${guideEscape(section.figure.image)}" alt="${guideEscape(section.figure.alt || section.heading)}" loading="lazy" width="960" height="540" onerror="this.onerror=null;this.src='img/logo.webp'">
                  ${section.figure.caption ? `<figcaption>${guideEscape(section.figure.caption)}</figcaption>` : ''}
                </figure>` : ''}
            </section>`).join('')}

          ${article.faq && article.faq.length ? `
            <section id="faq">
              <h2>Preguntas frecuentes</h2>
              <div class="article-faq">
                ${article.faq.map(([q, a]) => `
                  <details>
                    <summary>${guideEscape(q)}</summary>
                    <p>${guideEscape(a)}</p>
                  </details>`).join('')}
              </div>
            </section>` : ''}

          <section>
            <h2>Seguir explorando</h2>
            <p>Para completar el recorrido podes abrir tutoriales en video, comparar jugadores en la base de datos o usar Scouting para buscar fichajes segun club, posicion y perfil.</p>
            <div class="seo-link-row">
              <a href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('tutorials.html') : 'tutorials.html'}">Tutoriales</a>
              <a href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('rankings.html') : 'rankings.html'}">Scouting</a>
              <a href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('downloads.html') : 'downloads.html'}">Option Files</a>
              <a href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('database.html') : 'database.html'}">Base de datos</a>
            </div>
          </section>
        </div>
      </div>
    </article>

    ${related.length ? `
      <section class="landing-section article-related">
        <div class="landing-section-header">
          <h2 class="landing-section-title">Guias relacionadas</h2>
          <a class="landing-section-link" href="${typeof laqpPageUrl === 'function' ? laqpPageUrl('guias.html') : 'guias.html'}">Ver todas</a>
        </div>
        <div class="editorial-grid editorial-grid-compact">
          ${related.map(renderGuideCard).join('')}
        </div>
      </section>` : ''}`;
}

document.addEventListener('DOMContentLoaded', () => {
  renderGuidesPage().catch(err => console.error('Error loading guides:', err));
  renderArticlePage().catch(err => console.error('Error loading article:', err));
});
