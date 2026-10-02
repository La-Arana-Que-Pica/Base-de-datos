'use strict';

(function exposeBuilderFormations(root) {
  const slot = (id, position, x, y) => ({ id, position, x, y });
  const formations = [
    { id: '4-3-3', name: '4-3-3', slots: [slot('gk','GK',50,91),slot('lb','LB',14,72),slot('lcb','CB',38,77),slot('rcb','CB',62,77),slot('rb','RB',86,72),slot('lcm','CMF',28,51),slot('dm','DMF',50,60),slot('rcm','CMF',72,51),slot('lw','LWF',17,22),slot('cf','CF',50,14),slot('rw','RWF',83,22)] },
    { id: '4-2-3-1', name: '4-2-3-1', slots: [slot('gk','GK',50,91),slot('lb','LB',14,73),slot('lcb','CB',38,78),slot('rcb','CB',62,78),slot('rb','RB',86,73),slot('ldm','DMF',35,59),slot('rdm','DMF',65,59),slot('lam','LMF',18,39),slot('am','AMF',50,37),slot('ram','RMF',82,39),slot('cf','CF',50,14)] },
    { id: '4-4-2', name: '4-4-2', slots: [slot('gk','GK',50,91),slot('lb','LB',14,73),slot('lcb','CB',38,78),slot('rcb','CB',62,78),slot('rb','RB',86,73),slot('lm','LMF',16,47),slot('lcm','CMF',39,53),slot('rcm','CMF',61,53),slot('rm','RMF',84,47),slot('lcf','CF',38,18),slot('rcf','CF',62,18)] },
    { id: '4-1-4-1', name: '4-1-4-1', slots: [slot('gk','GK',50,91),slot('lb','LB',14,73),slot('lcb','CB',38,78),slot('rcb','CB',62,78),slot('rb','RB',86,73),slot('dm','DMF',50,61),slot('lm','LMF',16,43),slot('lcm','CMF',39,46),slot('rcm','CMF',61,46),slot('rm','RMF',84,43),slot('cf','CF',50,15)] },
    { id: '4-3-1-2', name: '4-3-1-2', slots: [slot('gk','GK',50,91),slot('lb','LB',14,73),slot('lcb','CB',38,78),slot('rcb','CB',62,78),slot('rb','RB',86,73),slot('lcm','CMF',27,54),slot('dm','DMF',50,61),slot('rcm','CMF',73,54),slot('am','AMF',50,37),slot('lcf','CF',37,16),slot('rcf','CF',63,16)] },
    { id: '4-1-2-1-2', name: '4-1-2-1-2', slots: [slot('gk','GK',50,91),slot('lb','LB',14,73),slot('lcb','CB',38,78),slot('rcb','CB',62,78),slot('rb','RB',86,73),slot('dm','DMF',50,62),slot('lcm','CMF',29,51),slot('rcm','CMF',71,51),slot('am','AMF',50,35),slot('lcf','CF',37,15),slot('rcf','CF',63,15)] },
    { id: '4-2-2-2', name: '4-2-2-2', slots: [slot('gk','GK',50,91),slot('lb','LB',14,73),slot('lcb','CB',38,78),slot('rcb','CB',62,78),slot('rb','RB',86,73),slot('ldm','DMF',35,59),slot('rdm','DMF',65,59),slot('lam','AMF',25,38),slot('ram','AMF',75,38),slot('lcf','CF',38,16),slot('rcf','CF',62,16)] },
    { id: '3-5-2', name: '3-5-2', slots: [slot('gk','GK',50,91),slot('lcb','CB',23,76),slot('cb','CB',50,81),slot('rcb','CB',77,76),slot('lm','LMF',12,49),slot('lcm','CMF',35,54),slot('dm','DMF',50,63),slot('rcm','CMF',65,54),slot('rm','RMF',88,49),slot('lcf','CF',38,17),slot('rcf','CF',62,17)] },
    { id: '3-4-2-1', name: '3-4-2-1', slots: [slot('gk','GK',50,91),slot('lcb','CB',23,76),slot('cb','CB',50,81),slot('rcb','CB',77,76),slot('lm','LMF',13,51),slot('lcm','CMF',38,56),slot('rcm','CMF',62,56),slot('rm','RMF',87,51),slot('lam','AMF',34,34),slot('ram','AMF',66,34),slot('cf','CF',50,14)] },
    { id: '3-4-3', name: '3-4-3', slots: [slot('gk','GK',50,91),slot('lcb','CB',23,76),slot('cb','CB',50,81),slot('rcb','CB',77,76),slot('lm','LMF',14,51),slot('lcm','CMF',39,56),slot('rcm','CMF',61,56),slot('rm','RMF',86,51),slot('lw','LWF',17,22),slot('cf','CF',50,14),slot('rw','RWF',83,22)] },
    { id: '5-3-2', name: '5-3-2', slots: [slot('gk','GK',50,91),slot('lwb','LB',10,66),slot('lcb','CB',28,77),slot('cb','CB',50,81),slot('rcb','CB',72,77),slot('rwb','RB',90,66),slot('lcm','CMF',30,51),slot('dm','DMF',50,60),slot('rcm','CMF',70,51),slot('lcf','CF',38,17),slot('rcf','CF',62,17)] },
    { id: '5-2-3', name: '5-2-3', slots: [slot('gk','GK',50,91),slot('lwb','LB',10,66),slot('lcb','CB',28,77),slot('cb','CB',50,81),slot('rcb','CB',72,77),slot('rwb','RB',90,66),slot('lcm','CMF',38,53),slot('rcm','CMF',62,53),slot('lw','LWF',17,22),slot('cf','CF',50,14),slot('rw','RWF',83,22)] },
  ];

  const byId = Object.fromEntries(formations.map(formation => [formation.id, formation]));
  const api = Object.freeze({ formations: Object.freeze(formations), byId: Object.freeze(byId) });
  root.LAQPBuilderFormations = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
