'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const formations = require('../../js/builder-formations');
const values = require('../../js/builder-transfer-value');
const builder = require('../../js/squad-builder');

test('las formaciones tienen once slots únicos y coordenadas porcentuales válidas', () => {
  assert.equal(formations.formations.length, 12);
  formations.formations.forEach(formation => {
    assert.equal(formation.slots.length, 11, formation.id);
    assert.equal(new Set(formation.slots.map(slot => slot.id)).size, 11, formation.id);
    formation.slots.forEach(slot => {
      assert.ok(slot.x >= 0 && slot.x <= 100);
      assert.ok(slot.y >= 0 && slot.y <= 100);
    });
  });
});

test('el precio estimado aplica overall, edad y redondeo legible', () => {
  const young = values.estimatedTransferFee({ overall: 80, age: 19 });
  const veteran = values.estimatedTransferFee({ overall: 80, age: 35 });
  assert.ok(young > veteran);
  assert.match(values.formatEstimatedMoney(young), /^~€[\d.]+[MKB]?$/);
  assert.equal(values.estimatedTransferFee({ overall: null, age: 20 }), 0);
});

test('el cambio de formación conserva jugadores sin duplicarlos', () => {
  const oldFormation = formations.byId['4-3-3'];
  const nextFormation = formations.byId['3-5-2'];
  const players = new Map([
    ['1', { id:'1', position:'GK', secondaryPositions:[] }],
    ['2', { id:'2', position:'CB', secondaryPositions:['RB'] }],
    ['3', { id:'3', position:'CF', secondaryPositions:['SS'] }],
  ]);
  const before = {
    gk: { playerId:'1' },
    rcb: { playerId:'2' },
    cf: { playerId:'3' },
  };
  const after = builder.remapAssignments(before, oldFormation, nextFormation, players);
  assert.deepEqual(new Set(Object.values(after).map(item => item.playerId)), new Set(['1','2','3']));
  assert.equal(Object.keys(after).length, 3);
  assert.equal(after.gk.playerId, '1');
  Object.entries(after).forEach(([slotId, assignment]) => {
    const slot = nextFormation.slots.find(item => item.id === slotId);
    assert.equal(assignment.x, slot.x);
    assert.equal(assignment.y, slot.y);
  });
});

test('el estado compartido mantiene Unicode, estructura mínima y coordenadas libres', () => {
  const input = { v:2, n:'Peña campeón', f:'4-2-3-1', x:[['gk','118340','101',12000000,47.3,88.6]] };
  assert.deepEqual(builder.decodeShareState(builder.encodeShareState(input)), input);
});
