'use strict';

// All club data is already in the HTML. Interactions never fetch the database.
function compareRosterRows(a, b, key, direction, collator) {
  if (key === 'name') return direction * collator.compare(a.dataset.name, b.dataset.name);
  const left = Number(a.dataset[key]), right = Number(b.dataset[key]);
  const leftMissing = !a.dataset[key] || !Number.isFinite(left);
  const rightMissing = !b.dataset[key] || !Number.isFinite(right);
  if (leftMissing || rightMissing) return Number(leftMissing) - Number(rightMissing);
  return direction * (left - right) || collator.compare(a.dataset.name, b.dataset.name);
}

if (typeof module !== 'undefined') module.exports = { compareRosterRows };

function ensureClubAdPlacements(club) {
  const create = (name, unitName) => {
    const placement = document.createElement('div');
    placement.className = 'ad-placement';
    placement.dataset.adPlacement = name;
    placement.dataset.adUnitTarget = unitName;
    return placement;
  };

  if (!document.querySelector('[data-ad-placement="team-top"]')) {
    club.querySelector('.club-hero')?.after(create('team-top', 'banner'));
  }
  if (!document.querySelector('[data-ad-placement="team-mid"]')) {
    club.querySelector('.club-roster')?.before(create('team-mid', 'banner'));
  }

  window.LAQPAds?.placeAll(document);
  window.LAQPAds?.monitorAll(document);
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => {
  const club = document.querySelector('.club-detail');
  if (!club) return;
  ensureClubAdPlacements(club);
  const identity = club.querySelector('.club-identity');
  if (identity && !identity.querySelector('.club-builder-cta')) {
    const teamId = club.dataset.clubId || document.querySelector('meta[name="laqp-team-id"]')?.content || '';
    const cta = document.createElement('a');
    cta.className = 'club-builder-cta club-text-link';
    cta.href = `alineaciones.html?team=${encodeURIComponent(teamId)}`;
    cta.textContent = typeof t === 'function' ? t('team.buildLineup') : 'Crear alineación con este equipo';
    identity.appendChild(cta);
  }
  const body = club.querySelector('.club-roster-table tbody');
  const rows = Array.from(body.rows);
  const search = club.querySelector('[data-club-search]');
  const collator = new Intl.Collator(
    typeof window.getCurrentLanguage === 'function' ? window.getCurrentLanguage() : 'es',
    { sensitivity: 'base', numeric: true }
  );
  let group = '', sort = '', direction = 1;
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();

  function filterRows() {
    const term = normalize(search.value.trim());
    let count = 0;
    rows.forEach(row => {
      row.hidden = !!((group && row.dataset.group !== group) || !normalize(row.dataset.name).includes(term));
      if (!row.hidden) count++;
    });
    club.querySelector('[data-roster-count]').textContent = typeof t === 'function'
      ? t('team.playersShown', { count, total: rows.length })
      : `${count} de ${rows.length} jugadores`;
    club.querySelector('[data-roster-empty]').hidden = count !== 0;
  }

  club.addEventListener('click', event => {
    const filter = event.target.closest('[data-club-filter]');
    if (filter) {
      group = filter.dataset.clubFilter;
      club.querySelectorAll('[data-club-filter]').forEach(button => button.setAttribute('aria-pressed', String(button === filter)));
      filterRows();
    }
    const sortButton = event.target.closest('[data-club-sort]');
    if (sortButton) {
      const key = sortButton.dataset.clubSort;
      direction = sort === key ? -direction : (key === 'overall' ? -1 : 1);
      sort = key;
      const ordered = [...rows].sort((a, b) => compareRosterRows(a, b, key, direction, collator));
      body.append(...ordered);
      club.querySelectorAll('[data-club-sort]').forEach(button => {
        button.closest('th').setAttribute('aria-sort', button === sortButton ? (direction === 1 ? 'ascending' : 'descending') : 'none');
        button.querySelector('.club-sort-indicator').textContent = button === sortButton ? (direction === 1 ? '↑' : '↓') : '';
      });
    }
    const variant = event.target.closest('[data-formation]');
    if (variant) {
      club.querySelectorAll('[data-formation]').forEach(button => button.setAttribute('aria-pressed', String(button === variant)));
      club.querySelectorAll('[data-formation-player]').forEach(player => {
        const positions = JSON.parse(player.dataset.positions);
        const state = positions[variant.dataset.formation] || positions.normal;
        player.style.left = `${state.left}%`;
        player.style.top = `${state.top}%`;
        player.querySelector('.club-pitch-position').textContent = typeof i18nLookup === 'function'
          ? i18nLookup('positions', state.positionKey, state.position)
          : state.position;
      });
      club.querySelector('.club-pitch').setAttribute('aria-label', `${typeof t === 'function' ? t('team.startingEleven') : 'Once inicial'}: ${variant.textContent}`);
    }
  });
  search.addEventListener('input', filterRows);
});
