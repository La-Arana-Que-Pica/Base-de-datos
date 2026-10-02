/** Country grouping and picker shared by the Database player and team filters. */
(function () {
  'use strict';

  const order = ['europe', 'south-america', 'north-america', 'africa', 'asia', 'oceania', 'other'];
  // PES country IDs, not names: England, Scotland, Wales and Northern Ireland stay separate.
  const idsByContinent = {
    europe: ['190','191','193','194','196','197','198','199','200','201','202','203','204','205','206','207','208','209','210','211','212','213','214','215','217','219','220','221','223','224','225','226','227','228','229','230','232','234','235','236','237','238','239','241','303','304','311'],
    'south-america': ['139','144','145','146','147','148','149','150','151','152','153'],
    'north-america': ['110','112','115','120','121','122','124','128','129','133','135','140'],
    africa: ['44','45','46','48','49','50','51','52','54','55','56','58','59','62','63','64','65','66','67','70','71','73','74','76','77','79','80','83','85','87','90','91','92','94','95','98'],
    asia: ['7','8','9','10','11','12','13','14','15','16','17','19','21','26','28','29','30','31','32','34','36','37','38','189','216','240'],
    oceania: ['162','166'],
  };
  const continentById = Object.fromEntries(Object.entries(idsByContinent).flatMap(([continent, ids]) => ids.map(id => [id, continent])));
  const labels = {
    es: { europe: 'Europa', 'south-america': 'Sudamérica', 'north-america': 'Norteamérica / Centroamérica / Caribe', africa: 'África', asia: 'Asia', oceania: 'Oceanía', other: 'Otros', search: 'Buscar país...', all: 'Todas las nacionalidades', empty: 'No hay países coincidentes' },
    en: { europe: 'Europe', 'south-america': 'South America', 'north-america': 'North / Central America / Caribbean', africa: 'Africa', asia: 'Asia', oceania: 'Oceania', other: 'Other', search: 'Search country...', all: 'All countries', empty: 'No matching countries' },
    pt: { europe: 'Europa', 'south-america': 'América do Sul', 'north-america': 'América do Norte / Central / Caribe', africa: 'África', asia: 'Ásia', oceania: 'Oceania', other: 'Outros', search: 'Buscar país...', all: 'Todas as nacionalidades', empty: 'Nenhum país encontrado' },
    it: { europe: 'Europa', 'south-america': 'Sudamerica', 'north-america': 'Nord / Centro America / Caraibi', africa: 'Africa', asia: 'Asia', oceania: 'Oceania', other: 'Altri', search: 'Cerca paese...', all: 'Tutte le nazionalità', empty: 'Nessun paese trovato' },
  };

  const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
  const useFlyout = () => innerWidth > 700 && matchMedia('(hover: hover) and (pointer: fine)').matches;

  function group(ids, nameFor, locale = 'es') {
    const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
    const entries = [...new Set(ids.map(String).filter(Boolean))].map(id => ({ id, name: String(nameFor(id) || id), continent: continentById[id] || 'other' }));
    return order.map(key => ({ key, countries: entries.filter(entry => entry.continent === key).sort((a, b) => collator.compare(a.name, b.name)) })).filter(item => item.countries.length);
  }

  function render({ ids, selected = '', nameFor, locale = 'es', inputId, label, allLabel }) {
    const groups = group(ids, nameFor, locale);
    const dictionary = labels[locale] || labels.es;
    const countries = groups.flatMap(item => item.countries);
    const selectedName = countries.find(item => item.id === selected)?.name || allLabel || dictionary.all;
    const countryButton = country => `<button type="button" class="country-filter-country${country.id === selected ? ' is-selected' : ''}" data-country-id="${escape(country.id)}" aria-pressed="${country.id === selected}">${escape(country.name)}</button>`;
    return `<div class="adv-filter-group country-filter" data-country-filter>
      <label for="${escape(inputId)}-trigger">${escape(label)}</label>
      <select id="${escape(inputId)}" hidden aria-hidden="true"><option value="">${escape(allLabel || dictionary.all)}</option>${countries.map(item => `<option value="${escape(item.id)}"${item.id === selected ? ' selected' : ''}>${escape(item.name)}</option>`).join('')}</select>
      <button type="button" class="country-filter-trigger${selected ? ' has-selection' : ''}" id="${escape(inputId)}-trigger" aria-haspopup="true" aria-expanded="false"><span class="country-filter-current">${escape(selectedName)}</span><span aria-hidden="true">▾</span></button>
      <div class="country-filter-menu" hidden>
        <div class="country-filter-search-wrap"><input type="search" class="country-filter-search" placeholder="${escape(dictionary.search)}" aria-label="${escape(dictionary.search)}" autocomplete="off"></div>
        <button type="button" class="country-filter-clear" data-country-id="">${escape(allLabel || dictionary.all)}</button>
        <div class="country-filter-groups">${groups.map(item => `<div class="country-filter-continent" data-continent="${item.key}"><button type="button" class="country-filter-continent-button" aria-expanded="false"><span>${escape(dictionary[item.key])}</span><span aria-hidden="true">›</span></button><div class="country-filter-submenu">${item.countries.map(countryButton).join('')}</div></div>`).join('')}</div>
        <div class="country-filter-results" hidden>${[...countries].sort((a, b) => new Intl.Collator(locale, { sensitivity: 'base', numeric: true }).compare(a.name, b.name)).map(countryButton).join('')}<p class="country-filter-empty" hidden>${escape(dictionary.empty)}</p></div>
      </div>
    </div>`;
  }

  function close(root) {
    if (!root) return;
    root.classList.remove('is-open');
    root.querySelector('.country-filter-menu').hidden = true;
    root.querySelector('.country-filter-trigger').setAttribute('aria-expanded', 'false');
    root.querySelector('.country-filter-search').value = '';
    root.querySelector('.country-filter-groups').hidden = false;
    root.querySelector('.country-filter-results').hidden = true;
    root.querySelectorAll('.country-filter-results [data-country-id]').forEach(button => { button.hidden = false; });
    root.querySelectorAll('.country-filter-continent.is-open').forEach(row => {
      row.classList.remove('is-open');
      row.querySelector('.country-filter-continent-button').setAttribute('aria-expanded', 'false');
    });
  }

  function sync(root) {
    if (!root) return;
    const select = root.querySelector('select');
    const selected = select.value;
    const trigger = root.querySelector('.country-filter-trigger');
    root.querySelector('.country-filter-current').textContent = select.selectedOptions[0]?.textContent || '';
    trigger.classList.toggle('has-selection', !!selected);
    root.querySelectorAll('[data-country-id]').forEach(button => {
      const active = !!selected && button.dataset.countryId === selected;
      button.classList.toggle('is-selected', active);
      if (button.classList.contains('country-filter-country')) button.setAttribute('aria-pressed', String(active));
    });
  }

  function positionSubmenu(row) {
    if (!useFlyout()) return;
    const submenu = row.querySelector('.country-filter-submenu');
    const rect = row.getBoundingClientRect();
    const width = submenu.getBoundingClientRect().width;
    const height = submenu.getBoundingClientRect().height;
    const left = innerWidth - rect.right >= width + 8 ? rect.right - 1 : Math.max(8, rect.left - width + 1);
    submenu.style.left = `${left}px`;
    submenu.style.top = `${Math.max(8, Math.min(rect.top, innerHeight - height - 8))}px`;
  }

  function mount(root, onSelect) {
    if (!root) return;
    const trigger = root.querySelector('.country-filter-trigger');
    const menu = root.querySelector('.country-filter-menu');
    const search = root.querySelector('.country-filter-search');
    root.addEventListener('click', event => {
      if (event.target.closest('.country-filter-trigger')) {
        if (!menu.hidden) { close(root); return; }
        document.querySelectorAll('[data-country-filter].is-open').forEach(close);
        root.classList.remove('align-right', 'open-up');
        menu.hidden = false;
        root.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        root.classList.toggle('align-right', menu.getBoundingClientRect().right > innerWidth - 8);
        if (useFlyout()) {
          menu.style.maxHeight = '';
          menu.style.overflowY = '';
          root.classList.toggle('open-up', menu.getBoundingClientRect().bottom > innerHeight - 8 && trigger.getBoundingClientRect().top > menu.getBoundingClientRect().height + 8);
        } else {
          const triggerRect = trigger.getBoundingClientRect();
          const below = innerHeight - triggerRect.bottom - 12;
          const above = triggerRect.top - 12;
          const up = below < 330 && above > below;
          root.classList.toggle('open-up', up);
          menu.style.maxHeight = `${Math.max(180, Math.min(440, up ? above : below))}px`;
          menu.style.overflowY = 'auto';
        }
        return;
      }
      const country = event.target.closest('[data-country-id]');
      if (country && root.contains(country)) {
        root.querySelector('select').value = country.dataset.countryId;
        sync(root);
        close(root);
        onSelect(country.dataset.countryId);
        return;
      }
      const continentButton = event.target.closest('.country-filter-continent-button');
      if (continentButton && root.contains(continentButton)) {
        const row = continentButton.closest('.country-filter-continent');
        const next = !row.classList.contains('is-open');
        root.querySelectorAll('.country-filter-continent.is-open').forEach(openRow => {
          if (openRow !== row) { openRow.classList.remove('is-open'); openRow.querySelector('button').setAttribute('aria-expanded', 'false'); }
        });
        row.classList.toggle('is-open', next);
        continentButton.setAttribute('aria-expanded', String(next));
        if (next) positionSubmenu(row);
      }
    });
    root.querySelectorAll('.country-filter-continent').forEach(row => {
      row.addEventListener('pointerenter', () => {
        if (!useFlyout() || menu.hidden) return;
        row.classList.add('is-open');
        row.querySelector('button').setAttribute('aria-expanded', 'true');
        positionSubmenu(row);
      });
      row.addEventListener('pointerleave', () => {
        if (!useFlyout()) return;
        row.classList.remove('is-open');
        row.querySelector('button').setAttribute('aria-expanded', 'false');
      });
    });
    root.querySelector('.country-filter-groups').addEventListener('scroll', () => {
      root.querySelectorAll('.country-filter-continent.is-open').forEach(row => {
        row.classList.remove('is-open');
        row.querySelector('button').setAttribute('aria-expanded', 'false');
      });
    }, { passive: true });
    search.addEventListener('input', () => {
      const query = normalize(search.value);
      root.querySelector('.country-filter-groups').hidden = !!query;
      const results = root.querySelector('.country-filter-results');
      results.hidden = !query;
      if (!query) return;
      let count = 0;
      results.querySelectorAll('[data-country-id]').forEach(button => {
        button.hidden = !normalize(button.textContent).includes(query);
        if (!button.hidden) count++;
      });
      results.querySelector('.country-filter-empty').hidden = count > 0;
    });
    sync(root);
  }

  document.addEventListener('click', event => {
    document.querySelectorAll('[data-country-filter].is-open').forEach(root => {
      if (!root.contains(event.target)) close(root);
    });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') document.querySelectorAll('[data-country-filter].is-open').forEach(root => { close(root); root.querySelector('.country-filter-trigger').focus(); });
  });

  window.LAQPCountryFilter = Object.freeze({
    group,
    render,
    mount,
    sync,
    continentOrder: Object.freeze([...order]),
    continentFor: id => continentById[String(id)] || 'other',
    continentLabel: (continent, locale = 'es') => (labels[locale] || labels.es)[continent] || (labels[locale] || labels.es).other,
  });
})();
