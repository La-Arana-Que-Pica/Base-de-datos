'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(path.join(ROOT, 'js', 'tactics.js'), 'utf8');
const context = vm.createContext({
  console,
  document: { addEventListener() {} },
  window: {
    LAQPCountryFilter: {
      continentOrder: ['europe', 'south-america', 'other'],
      continentFor(id) {
        if (['144', '146', '147'].includes(String(id))) return 'south-america';
        if (['204', '208', '210', '211', '215', '224', '228', '236'].includes(String(id))) return 'europe';
        return 'other';
      },
      continentLabel(continent) {
        return { europe: 'Europa', 'south-america': 'Sudamérica', other: 'Otros' }[continent];
      },
    },
  },
  URLSearchParams,
  Set,
  Map,
});
vm.runInContext(source, context);

const parse = vm.runInContext('parseTacticsCSV', context);
const prepare = vm.runInContext('prepareTacticFilterData', context);
const matches = vm.runInContext('tacticMatchesFilters', context);
const tactics = parse(fs.readFileSync(path.join(ROOT, 'database', 'tacticas.csv'), 'utf8'));
const metadata = parse(fs.readFileSync(path.join(ROOT, 'database', 'tacticas-metadata.csv'), 'utf8'));
const metadataById = new Map(metadata.map(item => [item.id, item]));
const prepared = tactics.map(tactic => prepare({ ...tactic, ...metadataById.get(tactic.id) }));

function state(overrides = {}) {
  return {
    query: '', team: null, formacion: '', temporada: '', entrenador: '',
    styles: new Set(), instructions: new Set(), onlyAdvanced: false,
    ...overrides,
  };
}

test('every published tactic has filter taxonomy metadata', () => {
  assert.equal(metadataById.size, tactics.length);
  prepared.forEach(tactic => {
    assert.ok(tactic.pais_id, `${tactic.id} needs pais_id`);
    assert.ok(tactic.pais, `${tactic.id} needs pais`);
    assert.ok(tactic.entrenador, `${tactic.id} needs entrenador`);
    assert.notEqual(tactic.filterData.continent, 'other', `${tactic.id} needs a known continent`);
  });
});

test('partial, accent-insensitive team search finds River Plate', () => {
  const result = prepared.filter(tactic => matches(tactic, state({ query: 'river' })));
  assert.ok(result.length >= 2);
  assert.ok(result.every(tactic => tactic.equipo === 'River Plate'));
});

test('country, formation, style and instruction filters combine with AND', () => {
  const result = prepared.filter(tactic => matches(tactic, state({
    team: { type: 'country', value: 'Italia' },
    formacion: '3-5-2',
    styles: new Set(['derived:contraataque']),
    instructions: new Set(['offense:Laterales ofensivos']),
  })));
  assert.deepEqual(Array.from(result, tactic => tactic.id), ['inter-2020-2021']);
});

test('continent filters separate Europe and South America without team IDs', () => {
  const europe = prepared.filter(tactic => matches(tactic, state({ team: { type: 'continent', value: 'europe' } })));
  const southAmerica = prepared.filter(tactic => matches(tactic, state({ team: { type: 'continent', value: 'south-america' } })));
  assert.ok(europe.length > 0);
  assert.ok(southAmerica.length > 0);
  assert.ok(europe.every(tactic => tactic.filterData.continent === 'europe'));
  assert.ok(southAmerica.every(tactic => tactic.filterData.continent === 'south-america'));
});
