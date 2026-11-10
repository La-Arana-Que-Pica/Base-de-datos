/**
 * Registro de experiencias de Entretenimiento LAqP.
 *
 * Para sumar una experiencia nueva basta con agregar un objeto a `items`
 * (y, si corresponde, su categoría). El portal genera tarjetas, filtros,
 * búsqueda, favoritos, recientes y destacados a partir de estos datos.
 *
 * status: 'available' (jugable) | 'soon' (visible, sin acceso).
 * resumeKey: clave de localStorage donde la experiencia guarda
 *   { active: true, label: 'Ronda 3 de 10 · 240 pts', href, updatedAt } para «Continuar jugando».
 */
(function () {
  'use strict';
  window.LAQP_ENTERTAINMENT = {
    categories: [
      { key: 'minigame', filterLabel: 'Minijuegos' },
      { key: 'rankings', filterLabel: 'Rankings' },
      { key: 'strategy', filterLabel: 'Estrategia' },
    ],
    items: [
      {
        id: 'ahorcado-futbolero',
        name: 'Ahorcado Futbolero',
        category: 'minigame',
        categoryLabel: 'Minijuego · Conocimiento',
        description: 'Adiviná los apellidos de futbolistas reales.',
        href: '/ahorcado-futbolero.html',
        image: '/img/entretenimiento/ahorcado-futbolero.webp',
        status: 'available',
        badge: 'Nuevo',
        featured: true,
        featuredText: 'Diez rondas, cuatro dificultades y miles de futbolistas de la base de LAqP. Elegí liga, país o club y demostrá cuánto sabés.',
        addedAt: '2026-11-08',
        keywords: 'ahorcado adivinar apellido jugadores futbolistas palabras letras trivia quiz juego',
        resumeKey: 'laqp-ahorcado-resume-v1',
      },
      {
        id: 'rankings-tier-lists',
        name: 'Rankings y Tier Lists',
        category: 'rankings',
        categoryLabel: 'Rankings · Comunidad',
        description: 'Creá tus Tops y clasificá los mejores videojuegos de fútbol.',
        href: '/tier-list.html',
        image: '/img/entretenimiento/rankings-tier-lists.webp',
        status: 'available',
        cta: 'Abrir',
        addedAt: '2026-10-20',
        keywords: 'tier list top 10 ranking videojuegos fifa pes winning eleven clasificar comunidad',
      },
      {
        id: 'laqp-draft',
        name: 'LAqP Draft',
        category: 'strategy',
        categoryLabel: 'Estrategia · Fútbol',
        description: 'Construí tu equipo y participá en desafíos.',
        href: '/draft/',
        image: '/assets/images/draft-coming-soon.webp',
        status: 'soon',
        statusLabel: 'Próximamente',
        addedAt: '2026-11-05',
        keywords: 'draft equipo plantilla cartas estrategia clasico carrera supervivencia',
      },
    ],
  };
}());
