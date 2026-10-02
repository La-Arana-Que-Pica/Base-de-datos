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
