(function () {
  const state = {
    players: [],
    sortKey: 'overall',
    sortDir: 'desc',
  };

  const els = {
    input: document.getElementById('squad-input'),
    file: document.getElementById('squad-file'),
    parseBtn: document.getElementById('btn-parse'),
    clearBtn: document.getElementById('btn-clear'),
    feedback: document.getElementById('squad-feedback'),
    results: document.getElementById('squad-results'),
    summary: document.getElementById('squad-summary'),
    nameFilter: document.getElementById('filter-name'),
    posFilter: document.getElementById('filter-position'),
    minOverallFilter: document.getElementById('filter-min-overall'),
    minPotentialFilter: document.getElementById('filter-min-potential'),
    table: document.getElementById('squad-table'),
    tbody: document.querySelector('#squad-table tbody'),
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseNumber(value) {
    if (value === null || value === undefined) return null;
    const n = parseInt(String(value).trim(), 10);
    return Number.isNaN(n) ? null : n;
  }

  function parseEuro(value) {
    if (!value) return null;
    const raw = String(value).replace(/\s/g, '').replace(',', '.');
    const match = raw.match(/€?(-?\d+(?:\.\d+)?)([KMB])?/i);
    if (!match) return null;
    const base = parseFloat(match[1]);
    if (Number.isNaN(base)) return null;
    const unit = (match[2] || '').toUpperCase();
    const unitMultiplier = { B: 1_000_000_000, M: 1_000_000, K: 1_000 };
    const multiplier = unitMultiplier[unit] || 1;
    return Math.round(base * multiplier);
  }

  function parseMarketRange(value) {
    if (!value) return { min: null, max: null, text: '-' };
    const clean = String(value).trim();
    const parts = clean.split(/\s*-\s*/).filter(Boolean);
    if (parts.length >= 2) {
      return { min: parseEuro(parts[0]), max: parseEuro(parts[1]), text: clean };
    }
    const single = parseEuro(clean);
    return { min: single, max: single, text: clean };
  }

  function normalizePlayer(raw) {
    const overall = parseNumber(raw.overall);
    const potential = parseNumber(raw.potential);
    const age = parseNumber(raw.age);
    const wage = raw.wage || '-';
    const clause = raw.clause || '-';
    const market = parseMarketRange(raw.sellValue || raw.marketValue || raw.value || '-');
    return {
      overall,
      potential,
      name: String(raw.name || '').trim(),
      position: String(raw.position || '').trim(),
      age,
      contract: String(raw.contract || '').trim(),
      wage: String(wage).trim(),
      clause: String(clause).trim(),
      sellValue: market.text,
      wageValue: parseEuro(wage),
      clauseValue: parseEuro(clause),
      marketMin: market.min,
      marketMax: market.max,
    };
  }

  function parseDelimited(text) {
    const lines = text
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);
    if (lines.length < 2) return [];

    const first = lines[0];
    const delimiter = first.includes('\t') ? '\t' : first.includes(';') ? ';' : first.includes(',') ? ',' : null;
    if (!delimiter) return [];

    const headers = first.split(delimiter).map(h => h.trim().toLowerCase());
    const idx = {
      overall: headers.findIndex(h => ['rating', 'overall', 'media', 'ovr'].includes(h)),
      potential: headers.findIndex(h => ['potential', 'potencial', 'pot'].includes(h)),
      name: headers.findIndex(h => ['name', 'nombre'].includes(h)),
      position: headers.findIndex(h => ['position', 'posición', 'pos'].includes(h)),
      age: headers.findIndex(h => ['age', 'edad'].includes(h)),
      contract: headers.findIndex(h => ['contract', 'contrato'].includes(h)),
      wage: headers.findIndex(h => ['wage', 'sueldo', 'salary'].includes(h)),
      clause: headers.findIndex(h => ['clause', 'cláusula'].includes(h)),
      value: headers.findIndex(h => ['sell value', 'sell value range', 'market value', 'valor mercado', 'value'].includes(h)),
    };

    if (idx.name < 0) return [];

    return lines.slice(1).map(line => {
      const parts = line.split(delimiter).map(v => v.trim());
      return normalizePlayer({
        overall: idx.overall >= 0 ? parts[idx.overall] : null,
        potential: idx.potential >= 0 ? parts[idx.potential] : null,
        name: parts[idx.name],
        position: idx.position >= 0 ? parts[idx.position] : '',
        age: idx.age >= 0 ? parts[idx.age] : null,
        contract: idx.contract >= 0 ? parts[idx.contract] : '',
        wage: idx.wage >= 0 ? parts[idx.wage] : '',
        clause: idx.clause >= 0 ? parts[idx.clause] : '',
        sellValue: idx.value >= 0 ? parts[idx.value] : '',
      });
    }).filter(p => p.name);
  }

  function nextNonEmpty(lines, start) {
    let i = start;
    while (i < lines.length && !lines[i].trim()) i += 1;
    return i;
  }

  function parseBlockList(text) {
    const lines = text.split(/\r?\n/);
    const players = [];
    let i = 0;

    while (i < lines.length) {
      i = nextNonEmpty(lines, i);
      if (i >= lines.length) break;
      const rating = lines[i].trim();
      if (!/^\d{1,3}$/.test(rating)) {
        i += 1;
        continue;
      }
      i += 1;

      i = nextNonEmpty(lines, i);
      if (i >= lines.length) break;

      let potential = null;
      let maybeName = lines[i].trim();
      if (/^\d{1,3}$/.test(maybeName)) {
        potential = maybeName;
        i += 1;
        i = nextNonEmpty(lines, i);
        if (i >= lines.length) break;
        maybeName = lines[i].trim();
      }

      const name = maybeName;
      i += 1;
      i = nextNonEmpty(lines, i);
      if (i >= lines.length) break;
      const position = lines[i].trim();
      i += 1;
      i = nextNonEmpty(lines, i);
      if (i >= lines.length) break;
      const age = lines[i].trim();
      i += 1;
      i = nextNonEmpty(lines, i);
      if (i >= lines.length) break;
      const contract = lines[i].trim();
      i += 1;
      i = nextNonEmpty(lines, i);
      if (i >= lines.length) break;
      const wage = lines[i].trim();
      i += 1;
      i = nextNonEmpty(lines, i);
      if (i >= lines.length) break;
      const clause = lines[i].trim();
      i += 1;
      i = nextNonEmpty(lines, i);
      if (i >= lines.length) break;
      const sellValue = lines[i].trim();
      i += 1;

      players.push(normalizePlayer({
        overall: rating,
        potential,
        name,
        position,
        age,
        contract,
        wage,
        clause,
        sellValue,
      }));
    }

    return players.filter(p => p.name);
  }

  function getFilteredSortedPlayers() {
    const q = els.nameFilter.value.trim().toLowerCase();
    const pos = els.posFilter.value;
    const minOverall = parseNumber(els.minOverallFilter.value);
    const minPotential = parseNumber(els.minPotentialFilter.value);

    const list = state.players.filter(p => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (pos && p.position !== pos) return false;
      if (minOverall !== null && (p.overall ?? -1) < minOverall) return false;
      if (minPotential !== null && (p.potential ?? -1) < minPotential) return false;
      return true;
    });

    list.sort((a, b) => {
      const key = state.sortKey;
      const dir = state.sortDir === 'asc' ? 1 : -1;
      const va = a[key];
      const vb = b[key];
      const aNull = va === null || va === undefined || va === '';
      const bNull = vb === null || vb === undefined || vb === '';
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va).localeCompare(String(vb), 'es', { sensitivity: 'base' }) * dir;
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    return list;
  }

  function formatMoney(value, fallback) {
    if (value === null || value === undefined) return fallback || '-';
    return `€${new Intl.NumberFormat('es-ES').format(value)}`;
  }

  function render() {
    const list = getFilteredSortedPlayers();
    els.summary.textContent = `${list.length} de ${state.players.length} jugadores`;

    if (!list.length) {
      els.tbody.innerHTML = `<tr><td colspan="9" class="no-results-row">No hay jugadores para ese filtro.</td></tr>`;
      updateSortIcons();
      return;
    }

    els.tbody.innerHTML = list.map(p => `
      <tr>
        <td>${p.overall ?? '–'}</td>
        <td>${p.potential ?? '–'}</td>
        <td><strong>${escapeHtml(p.name)}</strong></td>
        <td>${escapeHtml(p.position || '–')}</td>
        <td>${p.age ?? '–'}</td>
        <td>${escapeHtml(p.contract || '–')}</td>
        <td title="${escapeHtml(p.wage)}">${escapeHtml(p.wage || '–')}</td>
        <td title="${escapeHtml(p.clause)}">${escapeHtml(p.clause || '–')}</td>
        <td title="${escapeHtml(p.sellValue)}">${escapeHtml(p.sellValue || formatMoney(p.marketMin))}</td>
      </tr>
    `).join('');

    updateSortIcons();
  }

  function updateSortIcons() {
    els.table.querySelectorAll('th.sortable').forEach(th => {
      const icon = th.querySelector('.sort-icon');
      if (!icon) return;
      if (th.dataset.sort === state.sortKey) {
        icon.textContent = state.sortDir === 'asc' ? '▲' : '▼';
      } else {
        icon.textContent = '⇅';
      }
    });
  }

  function updatePositionOptions(players) {
    const current = els.posFilter.value;
    const positions = Array.from(new Set(players.map(p => p.position).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    els.posFilter.innerHTML = '<option value="">Todas las posiciones</option>' +
      positions.map(pos => `<option value="${escapeHtml(pos)}">${escapeHtml(pos)}</option>`).join('');
    els.posFilter.value = positions.includes(current) ? current : '';
  }

  function processText(text) {
    const delimited = parseDelimited(text);
    const players = delimited.length ? delimited : parseBlockList(text);

    if (!players.length) {
      state.players = [];
      els.results.style.display = 'none';
      els.feedback.textContent = 'No se pudo interpretar la lista. Prueba con CSV/TSV con encabezados o con el formato en bloques (rating, potencial, nombre, etc.).';
      return;
    }

    state.players = players;
    els.feedback.textContent = `Plantilla procesada correctamente (${players.length} jugadores).`;
    els.results.style.display = '';
    updatePositionOptions(players);
    render();
  }

  els.parseBtn.addEventListener('click', () => processText(els.input.value));
  els.clearBtn.addEventListener('click', () => {
    els.input.value = '';
    els.file.value = '';
    state.players = [];
    els.results.style.display = 'none';
    els.feedback.textContent = '';
  });

  els.file.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      els.input.value = content;
      processText(content);
    };
    reader.readAsText(file);
  });

  [els.nameFilter, els.posFilter, els.minOverallFilter, els.minPotentialFilter].forEach(el => {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });

  els.table.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = key === 'name' || key === 'position' || key === 'contract' ? 'asc' : 'desc';
      }
      render();
    });
  });

  updateSortIcons();
})();
