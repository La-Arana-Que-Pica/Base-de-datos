'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('one overall scale serves all database views', () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../js/database-rating.js'), 'utf8'), context);
  const scale = context.window.LAQPRating;
  assert.deepEqual([59, 60, 70, 77, 80, 90, 95].map(value => scale.classFor(value)),
    ['stat-range-1', 'stat-range-2', 'stat-range-3', 'stat-range-3', 'stat-range-4', 'stat-range-5', 'stat-range-6']);
  assert.equal(scale.colorFor(77), '#e5dc00');
  assert.equal(scale.textFor(77), '#111');
});
