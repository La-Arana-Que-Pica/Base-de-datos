/* Carrusel de Entretenimiento de la portada.
 * La primera diapositiva ya fue elegida al azar por el script en línea de index.html (data-start),
 * antes del primer pintado. Este archivo agrega autoavance, controles, gestos y datos reales:
 * - Draft y Arcade leen window.LAQP_ENTERTAINMENT (js/entertainment-catalog.js).
 * - El Top 3 sale del ranking histórico real (js/home-promo-ranking.mjs), sin datos de ejemplo.
 */
(function () {
  'use strict';
  const root = document.getElementById('home-promo');
  if (!root) return;
  const track = root.querySelector('.home-promo-track');
  const slides = Array.from(root.querySelectorAll('.home-promo-slide'));
  const dots = Array.from(root.querySelectorAll('.home-promo-dot'));
  const count = slides.length;
  if (!count) return;

  const DURATION = 5000;
  const LANG = (document.documentElement.lang || 'es').slice(0, 2);
  const TEXT = {
    es: { loading: 'Consultando el ranking…', votes: n => 'Según ' + n + (n === 1 ? ' votación' : ' votaciones') + ' de la comunidad', empty: 'Todavía no hay votos: ¡tu Top puede inaugurar el ranking!', off: 'El ranking comunitario todavía no está habilitado.', error: 'No pudimos cargar el ranking ahora. Podés verlo completo en Rankings.', pts: 'pts', cover: 'Portada de ', play_now: 'Jugar ahora' },
    en: { loading: 'Loading the ranking…', votes: n => 'Based on ' + n + (n === 1 ? ' community vote' : ' community votes'), empty: 'No votes yet: your Top can open the ranking!', off: 'The community ranking is not enabled yet.', error: 'We could not load the ranking right now. See it in full in Rankings.', pts: 'pts', cover: 'Cover of ', play_now: 'Play now' },
    pt: { loading: 'Carregando o ranking…', votes: n => 'Com base em ' + n + (n === 1 ? ' voto' : ' votos') + ' da comunidade', empty: 'Ainda não há votos: seu Top pode inaugurar o ranking!', off: 'O ranking da comunidade ainda não está ativado.', error: 'Não foi possível carregar o ranking agora. Veja-o completo em Rankings.', pts: 'pts', cover: 'Capa de ', play_now: 'Jogar agora' },
    it: { loading: 'Caricamento della classifica…', votes: n => 'Secondo ' + n + (n === 1 ? ' voto' : ' voti') + ' della community', empty: 'Ancora nessun voto: la tua Top può inaugurare la classifica!', off: 'La classifica della community non è ancora attiva.', error: 'Non è stato possibile caricare la classifica. Consultala in Rankings.', pts: 'pt', cover: 'Copertina di ', play_now: 'Gioca ora' },
    ar: { loading: 'جارٍ تحميل التصنيف…', votes: n => 'بناءً على ' + n + ' تصويتات من المجتمع', empty: 'لا توجد أصوات بعد: قائمتك يمكن أن تفتتح التصنيف!', off: 'تصنيف المجتمع غير مفعّل بعد.', error: 'تعذّر تحميل التصنيف الآن. يمكنك مشاهدته كاملًا في صفحة التصنيفات.', pts: 'نقطة', cover: 'غلاف ', play_now: 'العب الآن' },
  };
  const tr = TEXT[LANG] || TEXT.es;

  let index = Math.min(Math.max(Number(root.dataset.start) || 0, 0), count - 1);
  // Siempre activo: solo se detiene mientras hay interacción o el carrusel no está a la vista.
  // Con movimiento reducido sigue avanzando, pero sin animaciones (ver home-draft.css).
  const holds = new Set(); // hover · focus · touch · hidden · offscreen
  let timer = 0, startedAt = 0, remaining = DURATION;

  root.style.setProperty('--promo-duration', DURATION + 'ms');

  function restartProgress() {
    dots.forEach(dot => dot.classList.remove('is-running'));
    const dot = dots[index];
    if (!dot || count < 2) return;
    void dot.offsetWidth; // reinicia la animación CSS de la barra de progreso
    dot.classList.add('is-running');
  }

  function render(next, manual) {
    index = (next + count) % count;
    slides.forEach((slide, i) => {
      const on = i === index;
      slide.classList.toggle('is-active', on);
      slide.inert = !on;
      if (on) slide.removeAttribute('aria-hidden'); else slide.setAttribute('aria-hidden', 'true');
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === index);
      if (i === index) dot.setAttribute('aria-current', 'true'); else dot.removeAttribute('aria-current');
    });
    // Anunciar solo los cambios pedidos por el usuario; el autoavance no interrumpe al lector de pantalla.
    track.setAttribute('aria-live', manual ? 'polite' : 'off');
    remaining = DURATION;
    stopTimer();
    restartProgress();
    prepare(index);
    prepare(index + 1);
    sync();
  }

  function stopTimer() {
    if (!timer) return;
    clearTimeout(timer);
    timer = 0;
    remaining = Math.max(0, remaining - (performance.now() - startedAt));
  }

  function sync() {
    const paused = holds.size > 0 || count < 2;
    root.classList.toggle('is-paused', paused);
    if (paused) { stopTimer(); return; }
    if (!timer) {
      startedAt = performance.now();
      timer = setTimeout(() => { timer = 0; render(index + 1, false); }, remaining);
    }
  }

  function hold(reason, on) {
    if (on) holds.add(reason); else holds.delete(reason);
    sync();
  }

  // Controles
  root.querySelector('[data-promo-prev]')?.addEventListener('click', () => render(index - 1, true));
  root.querySelector('[data-promo-next]')?.addEventListener('click', () => render(index + 1, true));
  dots.forEach((dot, i) => dot.addEventListener('click', () => render(i, true)));
  root.addEventListener('keydown', event => {
    if (event.target.closest('input, textarea, select')) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); render(index - 1, true); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); render(index + 1, true); }
  });

  // Pausa mientras el cursor está encima, el foco está adentro o hay un toque en curso.
  root.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') hold('hover', true); });
  root.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') hold('hover', false); });
  root.addEventListener('focusin', () => hold('focus', true));
  root.addEventListener('focusout', event => { if (!root.contains(event.relatedTarget)) hold('focus', false); });

  // Deslizar en pantallas táctiles.
  let swipe = null, swiped = false;
  // Un deslizamiento no debe abrir el enlace sobre el que empezó.
  track.addEventListener('click', event => { if (swiped) { event.preventDefault(); event.stopPropagation(); } swiped = false; }, true);
  track.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') return;
    swipe = { x: event.clientX, y: event.clientY };
    swiped = false;
    hold('touch', true);
  });
  const endSwipe = event => {
    if (!swipe) return;
    const dx = event.clientX - swipe.x, dy = event.clientY - swipe.y;
    swipe = null;
    if (event.type === 'pointerup' && Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      swiped = true;
      render(index + (dx < 0 ? 1 : -1), true);
    }
    hold('touch', false);
  };
  track.addEventListener('pointerup', endSwipe);
  track.addEventListener('pointercancel', endSwipe);

  // Nunca avanza con la pestaña inactiva ni con el carrusel fuera de pantalla.
  document.addEventListener('visibilitychange', () => hold('hidden', document.hidden));
  if (document.hidden) holds.add('hidden');
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => hold('offscreen', !entries[0].isIntersecting), { threshold: 0.35 }).observe(root);
  }

  // ---------- Datos reales ----------
  const catalog = window.LAQP_ENTERTAINMENT;

  function hydrateDraft() {
    const item = catalog?.items?.find(entry => entry.id === 'laqp-draft');
    if (!item || item.status !== 'available') return; // sigue «Próximamente»
    const cta = root.querySelector('[data-draft-cta]');
    if (cta) { cta.href = item.href; cta.firstChild.textContent = (item.cta || tr.play_now) + ' '; }
    const text = root.querySelector('[data-draft-text]');
    if (text && (item.featuredText || item.description)) text.textContent = item.featuredText || item.description;
  }

  function hydrateArcade() {
    const list = root.querySelector('[data-arcade-games]');
    const games = (catalog?.items || []).filter(entry => entry.status === 'available' && entry.category === 'minigame' && entry.href);
    if (!list || !games.length) return; // se conserva el contenido estático
    const current = Array.from(list.querySelectorAll('a')).map(a => a.getAttribute('href')).join('|');
    if (current !== games.map(game => game.href).join('|')) {
      list.replaceChildren(...games.slice(0, 3).map(game => {
        const li = document.createElement('li'), a = document.createElement('a'), strong = document.createElement('strong'), small = document.createElement('small');
        a.href = game.href; strong.textContent = game.name; small.textContent = game.description || '';
        a.append(strong, small); li.append(a); return li;
      }));
    }
  }

  const rankingSlide = slides.find(slide => slide.dataset.promo === 'ranking');
  let rankingRequested = false;

  function prepare(i) {
    if (slides[(i + count) % count] === rankingSlide) loadRanking();
  }

  function setRankingState(state, message) {
    rankingSlide.dataset.state = state;
    const status = rankingSlide.querySelector('[data-ranking-status]');
    if (status) status.textContent = message;
  }

  async function loadRanking() {
    if (!rankingSlide || rankingRequested) return;
    rankingRequested = true;
    setRankingState('loading', tr.loading);
    let result;
    try {
      const mod = await import('/js/home-promo-ranking.mjs');
      result = await mod.loadTop3();
      if (result.state === 'disabled') return setRankingState('error', tr.off);
      if (result.state === 'empty') return setRankingState('empty', tr.empty);
      const items = rankingSlide.querySelectorAll('.home-podium-item');
      result.rows.forEach(row => {
        const li = Array.from(items).find(item => Number(item.dataset.position) === row.position);
        if (!li) return;
        li.dataset.game = row.game_id;
        li.querySelector('.home-podium-title').textContent = row.title;
        li.querySelector('.home-podium-points').textContent = Number(row.points).toLocaleString(LANG) + ' ' + tr.pts;
      });
      setRankingState('ready', tr.votes(Number(result.ballots).toLocaleString(LANG)));
      const covers = await mod.coversFor(result.rows).catch(() => []);
      result.rows.forEach((row, i) => {
        const li = rankingSlide.querySelector('.home-podium-item[data-game="' + CSS.escape(String(row.game_id)) + '"]');
        const box = li?.querySelector('.home-podium-cover');
        if (!box || !covers[i]) return;
        const img = new Image();
        img.alt = tr.cover + row.title; img.width = 240; img.height = 320; img.decoding = 'async';
        img.onload = () => img.classList.add('is-loaded');
        img.src = covers[i];
        box.replaceChildren(img);
      });
    } catch (error) {
      rankingRequested = false; // se reintenta la próxima vez que aparezca la diapositiva
      setRankingState('error', tr.error);
    }
  }

  hydrateDraft();
  hydrateArcade();
  slides.forEach((slide, i) => { slide.inert = i !== index; });
  restartProgress();
  prepare(index);
  prepare(index + 1);
  sync();
  // Las transiciones se activan después del primer pintado para que la carga no tenga fundidos.
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-ready')));
})();
