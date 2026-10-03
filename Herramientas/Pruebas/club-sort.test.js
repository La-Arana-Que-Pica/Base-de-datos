'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compareRosterRows } = require('../../js/club.js');
const collator = new Intl.Collator('es', { sensitivity:'base', numeric:true });
const row = (name, number, position, overall, age) => ({dataset:{name,number,position,overall,age}});
const rows = [
  row('B', '10', '2', '80', '23'), row('C', '', '1', '90', '30'),
  row('Á', '2', '0', '75', '20'), row('D', '1', '4', '60', '27'),
];
function sorted(key, direction) {
  return [...rows].sort((a,b)=>compareRosterRows(a,b,key,direction,collator)).map(r=>r.dataset.name);
}
test('shirt numbers sort numerically both ways with missing last',()=>{
  assert.deepEqual(sorted('number',1),['D','Á','B','C']);
  assert.deepEqual(sorted('number',-1),['B','Á','D','C']);
});
test('football position order, name, overall and age toggle',()=>{
  assert.deepEqual(sorted('position',1),['Á','C','B','D']);
  assert.deepEqual(sorted('name',1),['Á','B','C','D']);
  assert.deepEqual(sorted('overall',-1),['C','B','Á','D']);
  assert.deepEqual(sorted('overall',1),['D','Á','B','C']);
  assert.deepEqual(sorted('age',1),['Á','B','D','C']);
  assert.deepEqual(sorted('age',-1),['C','D','B','Á']);
});
