/** Interacciones progresivas de los artículos de Option Files. */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const dialog = document.getElementById('of-lightbox');
  const dialogImage = dialog?.querySelector('img');
  const closeButton = dialog?.querySelector('button');

  document.querySelectorAll('[data-gallery-src]').forEach(button => {
    button.addEventListener('click', () => {
      if (!dialog || !dialogImage) return;
      dialogImage.src = button.dataset.gallerySrc || '';
      dialogImage.alt = button.dataset.galleryAlt || '';
      dialog.showModal();
    });
  });

  closeButton?.addEventListener('click', () => dialog.close());
  dialog?.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });

  const tocLinks = [...document.querySelectorAll('.of-toc a[href^="#"]')];
  if (!tocLinks.length || !('IntersectionObserver' in window)) return;
  const byId = new Map(tocLinks.map(link => [link.hash.slice(1), link]));
  const observer = new IntersectionObserver(entries => {
    const visible = entries
      .filter(entry => entry.isIntersecting)
      .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
    if (!visible) return;
    tocLinks.forEach(link => link.removeAttribute('aria-current'));
    byId.get(visible.target.id)?.setAttribute('aria-current', 'location');
  }, { rootMargin: '-18% 0px -68% 0px' });
  byId.forEach((_link, id) => {
    const section = document.getElementById(id);
    if (section) observer.observe(section);
  });
});


// Progressive season navigation. All publications and links remain in the static HTML.
document.addEventListener('DOMContentLoaded', () => {
  const seasons = [...document.querySelectorAll('.sp-season[data-season]')];
  const controls = [...document.querySelectorAll('[data-season-link]')];
  if (!seasons.length || !controls.length) return;
  const published = [...document.querySelectorAll('.sp-season [data-release][data-status="published"]')]
    .filter(node => node.dataset.published && node.querySelector('a[href*="/option-files/"]'))
    .sort((a, b) => b.dataset.published.localeCompare(a.dataset.published) || b.dataset.release.localeCompare(a.dataset.release, undefined, { numeric: true }));
  const defaultSeason = document.querySelector('.sp-featured[data-status="published"]')?.dataset.season || published[0]?.dataset.season || seasons[0].dataset.season;
  const selectSeason = (value) => {
    if (!seasons.some(section => section.dataset.season === value)) return;
    seasons.forEach(section => { section.hidden = section.dataset.season !== value; });
    controls.forEach(link => {
      if (link.dataset.seasonLink === value) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  };
  const followHash = () => {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = id ? document.getElementById(id) : null;
    const section = target?.closest('.sp-season');
    selectSeason(section?.dataset.season || defaultSeason);
    let disclosure = target?.closest('details');
    while (disclosure) {
      disclosure.open = true;
      disclosure = disclosure.parentElement?.closest('details');
    }
    if (target && section) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  };
  controls.forEach(link => link.addEventListener('click', () => selectSeason(link.dataset.seasonLink)));
  window.addEventListener('hashchange', followHash);
  followHash();
});


// A blocked thumbnail must not hide the usable YouTube link or play affordance.
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.sp-video-thumb img').forEach(image => {
    image.addEventListener('error', () => { image.hidden = true; });
    if (image.complete && !image.naturalWidth) image.hidden = true;
  });
});


// Installation links are rendered statically from the published Spider Patch source.
function spiderPatchInstallationVideoUrl(config) {
  if (!config || !Number.isSafeInteger(config.startSeconds) || config.startSeconds < 0) return null;
  try {
    const source = new URL(config.url);
    if (source.protocol !== 'https:') return null;
    const host = source.hostname.toLowerCase();
    let videoId;
    if (host === 'youtu.be') videoId = source.pathname.slice(1);
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) {
      videoId = source.pathname === '/watch' ? source.searchParams.get('v') : source.pathname.match(/^\/(?:embed|shorts)\/([^/]+)$/)?.[1];
    }
    if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
    const target = new URL('https://www.youtube.com/watch');
    target.searchParams.set('v', videoId);
    target.searchParams.set('t', String(config.startSeconds) + 's');
    return target.href;
  } catch { return null; }
}
