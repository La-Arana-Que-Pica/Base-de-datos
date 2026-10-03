const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sandbox = { window: {}, document: { addEventListener() {} }, Intl };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'country-filter.js'), 'utf8'), sandbox);
const filter = sandbox.window.LAQPCountryFilter;

const examples = {
  europe: ['236', '204'],
  'south-america': ['144', '146'],
  'north-america': ['135', '124'],
  africa: ['76', '80'],
  asia: ['13', '16'],
  oceania: ['162'],
  other: ['2'],
};
for (const [continent, ids] of Object.entries(examples)) {
  for (const id of ids) assert.equal(filter.continentFor(id), continent, `${id} should be in ${continent}`);
}

const names = { '144': 'Argentina', '146': 'Brasil', '204': 'Inglaterra', '236': 'España', '2': '2' };
const grouped = filter.group(['236', '144', '146', '204', '2', '144'], id => names[id], 'es');
assert.deepEqual(Array.from(grouped, item => item.key), ['europe', 'south-america', 'other']);
assert.deepEqual(Array.from(grouped[0].countries, country => country.name), ['España', 'Inglaterra']);
assert.equal(grouped[1].countries.length, 2, 'duplicate player nationalities must appear once');

const markup = filter.render({ ids: ['144', '236'], selected: '144', nameFor: id => names[id], locale: 'es', inputId: 'flt-nationality', label: 'Nacionalidad', allLabel: 'Todas' });
assert.match(markup, /Argentina/);
assert.match(markup, /Europa/);
assert.doesNotMatch(markup, /Brasil/);
assert.match(markup, /id="flt-nationality" hidden/);

console.log('Country filter mapping and available-country rendering: OK');
