'use strict';

const assert = require('node:assert/strict');
const Data = require('../../js/scouting-data.js');
const Realism = require('../../js/scouting-realism.js');

const club = (id, name, leagueId, country, avgOverall, maxOverall, region = 'south-america', rivals = []) => ({
  id: String(id), name, leagueId: String(leagueId), country: String(country), avgOverall, startersAvg: avgOverall + 1,
  maxOverall, avgAge: 26, region, rivals, squad: [],
});
const player = (Id, Name, Country, OverallStats, Age, teamId, leagueId) => ({
  Id: String(Id), Name, Country: String(Country), OverallStats: String(OverallStats), Age: String(Age),
  teamId: String(teamId), leagueId: String(leagueId), pos: 'CMF', teamName: `Club ${teamId}`,
});

const river = club(138, 'River Plate', 144, 144, 78, 84, 'south-america', ['139']);
const boca = club(139, 'Boca Juniors', 144, 144, 78, 84, 'south-america', ['138']);
const cremonese = club(4220, 'Cremonese', 215, 215, 71, 76, 'europe');
const realMadrid = club(109, 'Real Madrid', 236, 236, 87, 92, 'europe');
const leverkusen = club(2349, 'Bayer Leverkusen', 210, 210, 83, 87, 'europe');
const flamengo = club(500, 'Flamengo', 146, 146, 78, 84, 'south-america');
const argentinos = club(501, 'Club argentino', 144, 144, 72, 77, 'south-america');
const atleticoMineiro = club(1245, 'Atlético Mineiro', 146, 146, 78, 83, 'south-america');

const base = {
  teams: [river, boca, cremonese, realMadrid, leverkusen, flamengo, argentinos, atleticoMineiro],
  players: [],
  finances: [
    { club_id: '138', typical_transfer_max: '10000000', exceptional_transfer_max: '25000000', average_wage: '18000', high_wage: '35000', estimated_wage_ceiling: '60000', financial_power: '78', prestige: '82' },
    { club_id: '139', typical_transfer_max: '9000000', exceptional_transfer_max: '22000000', average_wage: '18000', high_wage: '35000', estimated_wage_ceiling: '60000', financial_power: '77', prestige: '82' },
    { club_id: '4220', typical_transfer_max: '3500000', exceptional_transfer_max: '9000000', average_wage: '12000', high_wage: '25000', estimated_wage_ceiling: '40000', financial_power: '48', prestige: '56' },
  ],
  profiles: [
    { club_id: '138', age_min: '20', age_max: '29', frequent_nationalities: '144|152|148|150', frequent_leagues: '144', low_frequency_nationalities: '146', policies: 'jovenes|repatriaciones', club_weight: '.65' },
    { club_id: '139', age_min: '20', age_max: '30', frequent_nationalities: '144|152|148|150', frequent_leagues: '144', club_weight: '.65' },
  ],
  rivalries: [{ club_id: '138', rival_club_id: '139', level: 'maximo' }, { club_id: '139', rival_club_id: '138', level: 'maximo' }],
  marketValues: [], wages: [], history: [], affinities: [],
};

function engine(overrides = {}) {
  return Data.create({ ...base, ...overrides });
}
function evaluate(candidate, buyer, data, sportingFit = 90) {
  return Realism.evaluate({ player: candidate, buyer, data, sportingFit });
}

// A: el encaje deportivo no puede romper topes económicos extremos.
{
  const rudiger = player(104677, 'A. Rüdiger', 210, 82, 33, 109, 236);
  const data = engine({ marketValues: [{ player_id: '104677', market_value: '12000000', currency: 'EUR' }], wages: [{ player_id: '104677', weekly_wage: '280000', currency: 'EUR' }] });
  const result = evaluate(rudiger, cremonese, data, 95);
  assert.ok(result.score <= 10, `Rüdiger → Cremonese debe tener cap <= 10, obtuvo ${result.score}`);
  assert.equal(result.category, 'PRÁCTICAMENTE IMPOSIBLE');
  assert.equal(result.factors.sporting, 95);
}

// B: un regreso formado en River supera a un candidato idéntico sin vínculo.
{
  const palacios = player(115044, 'E. Palacios', 144, 81, 27, 2349, 210);
  const common = { marketValues: [{ player_id: '115044', market_value: '18000000' }], wages: [{ player_id: '115044', weekly_wage: '60000' }] };
  const linked = evaluate(palacios, river, engine({ ...common, history: [{ player_id: '115044', club_id: '138', tipo: 'formado_en', fecha_fin: '2020-01-01' }, { player_id: '115044', club_id: '138', tipo: 'exjugador', fecha_fin: '2020-01-01' }] }));
  const neutral = evaluate(palacios, river, engine(common));
  assert.ok(linked.score >= neutral.score + 15, `El regreso debe tener bonus visible (${linked.score} vs ${neutral.score})`);
}

// C: la formación en Boca reduce de forma fuerte el realismo hacia River.
{
  const equi = player(60246, 'E. Fernández', 144, 75, 24, 2349, 210);
  const linked = evaluate(equi, river, engine({ history: [{ player_id: '60246', club_id: '139', tipo: 'formado_en', fecha_fin: '2024-01-01' }] }));
  const neutral = evaluate(equi, river, engine());
  assert.ok(linked.score <= neutral.score - 20, `El vínculo con Boca debe penalizar (${linked.score} vs ${neutral.score})`);
}

// D/E: nacionalidad y liga actual son factores separados.
{
  const fromBrazil = player(7001, 'Brasileño A', 146, 74, 23, 500, 146);
  const inArgentina = player(7002, 'Brasileño B', 146, 74, 23, 501, 144);
  const data = engine();
  const foreign = evaluate(fromBrazil, river, data);
  const adapted = evaluate(inArgentina, river, data);
  assert.ok(adapted.factors.market >= foreign.factors.market + 10, `La experiencia actual en Argentina debe mitigar la penalización (${adapted.factors.market} vs ${foreign.factors.market})`);
}

// F: afinidad personal ayuda, sin alterar los factores económicos.
{
  const torreira = player(108129, 'L. Torreira', 152, 76, 30, 500, 146);
  const liked = evaluate(torreira, boca, engine({ affinities: [{ player_id: '108129', club_id: '139', tipo_vinculo: 'hincha', intensidad: '85' }] }));
  const neutral = evaluate(torreira, boca, engine());
  assert.ok(liked.score > neutral.score);
  assert.equal(liked.factors.economic, neutral.factors.economic);
}

// G: la simpatía de Renan Lodi da un bonus pequeño, no borra economía/procedencia.
{
  const lodi = player(114523, 'Renan Lodi', 146, 77, 28, 1245, 146);
  const data = engine({ marketValues: [{ player_id: '114523', market_value: '12000000' }], wages: [{ player_id: '114523', weekly_wage: '70000' }], affinities: [{ player_id: '114523', club_id: '138', tipo_vinculo: 'simpatizante', intensidad: '45' }] });
  const result = evaluate(lodi, river, data);
  assert.ok(result.relationshipBonus > 0 && result.relationshipBonus <= 8);
  assert.ok(result.score < 80, `La afinidad no debe volverlo automáticamente realista (${result.score})`);
}

// H: un jugador actual de Boca hacia River queda bajo un cap extremo.
{
  const currentBoca = player(8001, 'Jugador Boca', 144, 76, 25, 139, 144);
  const result = evaluate(currentBoca, river, engine());
  assert.ok(result.score <= 8, `Jugador actual de Boca → River debe quedar <= 8 (${result.score})`);
}

// Los datos faltantes degradan a estimaciones explícitas.
{
  const unknown = player(9001, 'Sin datos económicos', 152, 70, 22, 501, 144);
  const result = evaluate(unknown, river, engine());
  assert.equal(result.marketValueConfidence, 'estimated');
  assert.equal(result.wageConfidence, 'estimated');
  assert.ok(result.marketValue > 0 && result.wage > 0);
}

console.log('scouting-realism: 9 escenarios validados');
