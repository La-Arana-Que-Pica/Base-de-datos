'use strict';

(function () {
  const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const node = (tag, text, className) => {
    const result = document.createElement(tag);
    if (text !== undefined) result.textContent = text;
    if (className) result.className = className;
    return result;
  };

  // Original text is never interpreted as markup, including query highlights.
  function highlight(text, query) {
    const fragment = document.createDocumentFragment();
    const terms = normalize(query).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    // Preserve offsets when stripping combining accents, including decomposed text.
    let normalized = '', positions = [];
    for (let i = 0; i < text.length; i++) {
      const value = normalize(text[i]);
      for (const char of value) { normalized += char; positions.push(i); }
    }
    const ranges = [];
    terms.forEach(term => {
      let start = normalized.indexOf(term);
      while (start !== -1) {
        ranges.push([positions[start], positions[start + term.length - 1] + 1]);
        start = normalized.indexOf(term, start + term.length);
      }
    });
    ranges.sort((a, b) => a[0] - b[0]);
    let offset = 0;
    for (const [start, end] of ranges) {
      if (start < offset) continue;
      fragment.append(document.createTextNode(text.slice(offset, start)), node('mark', text.slice(start, end)));
      offset = end;
    }
    fragment.append(document.createTextNode(text.slice(offset)));
    return fragment;
  }

  function snippet(content, query) {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    const lowered = normalize(content);
    const offsets = terms.map(term => lowered.indexOf(term)).filter(i => i >= 0);
    const start = offsets.length ? Math.max(0, Math.min(...offsets) - 65) : 0;
    return (start ? '…' : '') + content.slice(start, start + 230).replace(/\s+/g, ' ') + (content.length > start + 230 ? '…' : '');
  }

  async function searchLibrary() {
    const form = document.getElementById('guide-search');
    if (!form) return;
    const status = document.getElementById('guide-status');
    const grid = document.getElementById('guide-results');
    const original = [...grid.childNodes].map(n => n.cloneNode(true));
    try {
      const [response, module] = await Promise.all([
        fetch('/database/guides-search.json'), import('/js/vendor/minisearch.js'),
      ]);
      if (!response.ok) throw new Error('Índice no disponible');
      const { documents } = await response.json();
      const MiniSearch = module.default;
      const index = new MiniSearch({ fields: ['title', 'content'], storeFields: ['title'], processTerm: normalize });
      index.addAll(documents);
      const query = document.getElementById('guide-query');
      const scope = document.getElementById('guide-scope');

      let timer;
      function restore() {
        const params = new URLSearchParams(location.search);
        query.value = params.get('q') || '';
        scope.value = ['title', 'content', 'all'].includes(params.get('scope')) ? params.get('scope') : 'all';

      }
      function render(save = true, replace = false) {
        const value = query.value.trim();
        const fields = scope.value === 'all' ? ['title', 'content'] : [scope.value];
        let results = value ? index.search(value, { fields, boost: { title: 3 }, prefix: true, combineWith: 'AND' }).map(r => documents.find(d => d.id === r.id)) : documents;
        grid.replaceChildren();
        for (const doc of results) {
          const article = node('article', undefined, 'gl-card');
          const cardLink = node('a', undefined, 'gl-card-link');cardLink.href=doc.url;cardLink.setAttribute('aria-labelledby','card-'+doc.id);
          const media = node('span', undefined, 'gl-card-image');
          const image = node('img'); image.src = doc.image; image.alt = ''; image.loading = 'lazy'; image.width = 960; image.height = 720;
          image.style.objectPosition=doc.thumbnailPosition || 'center';image.style.objectFit=doc.thumbnailFit==='contain'?'contain':'cover';
          media.append(image);
          const copy = node('div', undefined, 'gl-card-copy');
          const title = node('h3'); title.id='card-'+doc.id;title.append(highlight(doc.title, fields.includes('title') ? value : ''));
          const description = node('p'); description.append(highlight(value ? snippet(doc.content, value) : doc.description, fields.includes('content') ? value : ''));
          const meta = node('div', undefined, 'gl-card-meta'); meta.append(node('span', doc.readTime || ''), node('span', '↗'));
          copy.append(node('span', doc.category, 'gl-card-kicker'), title, description, meta); cardLink.append(media,copy);article.append(cardLink); grid.append(article);
        }
        document.getElementById('guide-empty').hidden = !!results.length;
        status.textContent = `${results.length} ${results.length === 1 ? 'guía' : 'guías'}${value ? ` para “${value}”` : ' para explorar'}`;
        if (save) {
          const next = new URL(location.href);
          for (const key of ['q', 'scope', 'category', 'platform']) next.searchParams.delete(key);
          if (value) next.searchParams.set('q', value);
          if (scope.value !== 'all') next.searchParams.set('scope', scope.value);

          if (next.href !== location.href) history[replace ? 'replaceState' : 'pushState'](null, '', next);
        }
      }
      form.hidden = false;
      restore(); render(false);
      form.addEventListener('submit', event => { event.preventDefault(); clearTimeout(timer); render(); });
      query.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => render(true, true), 200); });
      scope.addEventListener('change', () => { clearTimeout(timer); render(); });
      const clear = () => { clearTimeout(timer); form.reset(); render(); query.focus(); };
      document.getElementById('guide-clear').addEventListener('click', clear);
      document.querySelector('[data-clear-search]')?.addEventListener('click', clear);
      window.addEventListener('popstate', () => { clearTimeout(timer); restore(); render(false); });
    } catch (error) {
      console.warn('[Guías LAqP]', error);
      form.hidden = true;
      grid.replaceChildren(...original);
      document.getElementById('guide-empty').hidden = true;
      status.textContent = 'El buscador no está disponible. Podés explorar todas las guías a continuación.';
    }
  }

  function media() {
    let dialog, opener;
    document.querySelectorAll('[data-guide-zoom]').forEach(link => {
      link.addEventListener('click', event => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        if (typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal) return;
        event.preventDefault();
        if (!dialog) {
          dialog = node('dialog', undefined, 'gl-lightbox'); dialog.setAttribute('aria-label', 'Imagen ampliada de la guía');
          const close = node('button', 'Cerrar ×'); close.type = 'button'; close.addEventListener('click', () => dialog.close());
          dialog.append(close, node('img'), node('p'));
          dialog.addEventListener('close', () => {
            // A queued close event must not steal a later, deliberate focus
            // change (or focus from an image that has already been reopened).
            if (dialog.open) return;
            const active = document.activeElement;
            if (opener?.isConnected && (!active || active === document.body || dialog.contains(active))) opener.focus();
          });
          dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
          document.body.append(dialog);
        }
        const image = link.querySelector('img');
        dialog.querySelector('img').src = link.href; dialog.querySelector('img').alt = image.alt;
        dialog.querySelector('p').textContent = link.closest('figure')?.querySelector('figcaption')?.textContent || image.alt;
        opener = link;
        dialog.showModal();
      });
    });
    document.querySelectorAll('[data-guide-video]').forEach(button => button.addEventListener('click', () => {
      const id = button.dataset.guideVideo;
      if (!/^[\w-]{11}$/.test(id)) return;
      const iframe = node('iframe'); iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&start=${Number(button.dataset.videoStart)||0}`;
      iframe.title = button.getAttribute('aria-label'); iframe.allow = 'autoplay; encrypted-media; picture-in-picture'; iframe.allowFullscreen = true;
      button.replaceWith(iframe); iframe.focus();
    }));
    document.querySelectorAll('[data-copy-code]').forEach(button=>button.addEventListener('click',async()=>{const host=button.closest('.gl-code'),code=host.querySelector('code'),status=host.querySelector('[role=status]');try{await navigator.clipboard.writeText(code.textContent);status.textContent='Código copiado.';}catch{const range=document.createRange();range.selectNodeContents(code);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);status.textContent='El código quedó seleccionado. Usá Copiar en tu dispositivo.';}}));
    if (location.hash === '#videos') document.querySelector('#videos details')?.setAttribute('open', '');
  }
  searchLibrary(); media();
})();
