'use strict';

(function attachScoutingRealism(root, factory) {
  const api = factory(root.ScoutingData || (typeof require === 'function' ? require('./scouting-data.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ScoutingRealism = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function scoutingRealismFactory(Data) {
  const clamp = Data?.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));
  const number = Data?.number || (value => Number(value) || 0);
  const POSITIVE_TYPES = new Set(['hincha', 'simpatizante', 'deseo_jugar', 'deseo_regreso', 'exjugador', 'formado_en', 'idolo', 'identificacion']);
  const HISTORY_BONUS = { formado_en: 18, idolo: 22, exjugador: 13, paso_importante: 10, identificacion: 13 };
  const RIVAL_CURRENT_CAP = { maximo: 8, fuerte: 18, regional: 38, secundario: 52 };
  const RIVAL_PENALTY = { maximo: 44, fuerte: 30, regional: 17, secundario: 10 };
  const levelLabel = score => score >= 80 ? 'REALISTA' : score >= 60 ? 'AMBICIOSO' : score >= 30 ? 'POCO REALISTA' : 'PRÁCTICAMENTE IMPOSIBLE';

  const reason = (tone, label, detail, factor) => ({ tone, label, detail, factor });
  const ratioScore = (value, normal, exceptional) => {
    if (!value || !normal) return 55;
    if (value <= normal * 0.65) return 96;
    if (value <= normal) return 84;
    if (value <= exceptional) return 62;
    if (value <= exceptional * 1.5) return 35;
    if (value <= exceptional * 2.5) return 16;
    return 4;
  };

  function estimateMarketValue(player, currentClub) {
    const ovr = number(player.OverallStats, 65);
    const age = number(player.Age, 27);
    const peak = age <= 20 ? 1.2 : age <= 24 ? 1.45 : age <= 28 ? 1.25 : age <= 31 ? 0.82 : age <= 34 ? 0.48 : 0.25;
    const value = Math.pow(Math.max(1, ovr - 55), 2.45) * 4300 * peak;
    const prestige = currentClub ? (number(currentClub.avgOverall, 68) - 65) * 0.035 + 1 : 1;
    return Math.max(100_000, Math.round(value * clamp(prestige, 0.65, 1.8) / 100_000) * 100_000);
  }

  function estimateWage(player, currentClub) {
    const ovr = number(player.OverallStats, 65);
    const age = number(player.Age, 27);
    const clubLevel = currentClub ? number(currentClub.avgOverall, 68) : 68;
    const ageFactor = age < 22 ? 0.72 : age > 33 ? 0.88 : 1;
    return Math.max(1_000, Math.round(Math.pow(Math.max(1, ovr - 52), 2.1) * 31 * Math.pow(Math.max(0.72, clubLevel / 72), 2.2) * ageFactor / 1000) * 1000);
  }

  function economicValues(player, buyer, currentClub, data) {
    const valueRow = data.marketValues.get(String(player.Id));
    const wageRow = data.wages.get(String(player.Id));
    return {
      marketValue: valueRow ? number(valueRow.market_value) : estimateMarketValue(player, currentClub),
      valueConfidence: valueRow ? (valueRow.confidence || 'estimated') : 'estimated',
      valueSource: valueRow?.source || 'scouting_model',
      wage: wageRow ? number(wageRow.weekly_wage) : estimateWage(player, currentClub),
      wageConfidence: wageRow ? (wageRow.confidence || 'estimated') : 'estimated',
      wageSource: wageRow?.source || 'scouting_model',
      currency: valueRow?.currency || wageRow?.currency || 'EUR',
      finance: data.getFinance(buyer),
    };
  }

  function marketAffinity(player, buyer, profile, history, data) {
    if (!profile) return { score: 55, notes: [] };
    const nationality = String(player.Country || '');
    const leagueId = String(player.leagueId || '');
    const buyerCountry = String(buyer.country || '');
    const clubNat = (profile.frequent_nationalities || []).includes(nationality);
    const leagueNat = (profile.leagueNationalities || []).includes(nationality);
    const lowNat = (profile.low_frequency_nationalities || []).includes(nationality);
    const currentLeague = (profile.frequent_leagues || []).includes(leagueId);
    const countryExperience = history.some(row => {
      const oldClub = data.teams.get(String(row.club_id || ''));
      return oldClub && String(oldClub.country || '') === buyerCountry;
    });
    const leagueExperience = history.some(row => {
      const oldClub = data.teams.get(String(row.club_id || ''));
      return oldClub && String(oldClub.leagueId || '') === String(buyer.leagueId || '');
    });
    const clubScore = clubNat ? 92 : lowNat ? 28 : 54;
    const leagueScore = leagueNat ? 82 : 52;
    let score = clubScore * clamp(number(profile.clubWeight, 0.6), 0.25, 0.8) + leagueScore * (1 - clamp(number(profile.clubWeight, 0.6), 0.25, 0.8));
    if (currentLeague) score += 12;
    if (leagueExperience) score += 16;
    else if (countryExperience) score += 10;
    return { score: clamp(Math.round(score), 10, 100), clubNat, leagueNat, lowNat, currentLeague, leagueExperience, countryExperience };
  }

  function rivalryEffect(player, buyer, history, data) {
    const current = data.getRivalry(String(buyer.id), String(player.teamId || ''));
    let penalty = 0;
    let cap = 100;
    const notes = [];
    if (current) {
      penalty += RIVAL_PENALTY[current.level] || 10;
      cap = Math.min(cap, RIVAL_CURRENT_CAP[current.level] || 52);
      notes.push(reason('block', `Actualmente pertenece a un rival ${current.level}`, 'El vínculo actual aplica una restricción dura.', 'rivalry'));
    }
    history.forEach(row => {
      const rivalry = data.getRivalry(String(buyer.id), String(row.club_id || ''));
      if (!rivalry) return;
      const yearsAgo = row.fecha_fin ? Math.max(0, new Date().getFullYear() - number(String(row.fecha_fin).slice(0, 4), new Date().getFullYear())) : 0;
      const recency = yearsAgo >= 8 ? 0.35 : yearsAgo >= 4 ? 0.6 : 1;
      const identity = row.tipo === 'formado_en' ? 1.25 : row.tipo === 'idolo' ? 1.4 : row.tipo === 'paso_menor' ? 0.45 : 0.75;
      penalty += (RIVAL_PENALTY[rivalry.level] || 10) * recency * identity;
      if (rivalry.level === 'maximo') {
        if (row.tipo === 'idolo') cap = Math.min(cap, yearsAgo >= 8 ? 55 : 25);
        else if (row.tipo === 'formado_en') cap = Math.min(cap, yearsAgo >= 8 ? 62 : yearsAgo >= 4 ? 48 : 32);
        else if (row.tipo !== 'paso_menor' && yearsAgo < 4) cap = Math.min(cap, 52);
      }
      notes.push(reason('negative', `${row.tipo === 'formado_en' ? 'Formado' : 'Pasado'} en un rival ${rivalry.level}`, yearsAgo ? `Vínculo de hace ${yearsAgo} años.` : 'Vínculo histórico relevante.', 'rivalry'));
    });
    return { score: clamp(Math.round(100 - penalty), 0, 100), cap, notes };
  }

  function relationshipEffect(player, buyer, history, affinities) {
    let bonus = 0;
    const notes = [];
    let strongestHistoryBonus = 0;
    history.filter(row => String(row.club_id) === String(buyer.id)).forEach(row => {
      const amount = HISTORY_BONUS[row.tipo] || 8;
      strongestHistoryBonus = Math.max(strongestHistoryBonus, amount);
      notes.push(reason('positive', row.tipo === 'formado_en' ? 'Formado en el club' : 'Exjugador del club', 'Un regreso es culturalmente coherente.', 'history'));
    });
    bonus += strongestHistoryBonus;
    affinities.filter(row => String(row.club_id) === String(buyer.id)).forEach(row => {
      const intensity = clamp(number(row.intensidad, 50), 0, 100);
      const type = row.tipo || row.tipo_vinculo || '';
      const positive = POSITIVE_TYPES.has(type);
      const amount = Math.round(intensity * (positive ? 0.13 : -0.18));
      bonus += amount;
      notes.push(reason(positive ? 'positive' : 'negative', type === 'hincha' ? 'Afinidad personal declarada' : `Vínculo especial: ${String(type).replace(/_/g, ' ')}`, row.notas || 'Dato manual curado.', 'affinity'));
    });
    return { bonus: clamp(bonus, -30, 30), notes };
  }

  function ageAndArchetype(player, profile) {
    const age = number(player.Age, 0);
    if (!age || !profile) return 58;
    if (age >= number(profile.age_min, 20) && age <= number(profile.age_max, 29)) return 88;
    const distance = age < number(profile.age_min, 20) ? number(profile.age_min, 20) - age : age - number(profile.age_max, 29);
    return clamp(82 - distance * 9, 22, 82);
  }

  function evaluate(input) {
    const { player, buyer, sportingFit = 50, data } = input;
    if (!data) throw new Error('ScoutingRealism.evaluate requiere un índice de datos.');
    const currentClub = data.teams.get(String(player.teamId || '')) || null;
    const history = data.histories.get(String(player.Id)) || [];
    const affinities = data.affinities.get(String(player.Id)) || [];
    const profile = data.getProfile(buyer);
    const economy = economicValues(player, buyer, currentClub, data);
    const valueScore = ratioScore(economy.marketValue, economy.finance.typical_transfer_max, economy.finance.exceptional_transfer_max);
    const wageScore = ratioScore(economy.wage, economy.finance.high_wage, economy.finance.estimated_wage_ceiling);
    const economicScore = Math.round(Math.sqrt(Math.max(1, valueScore) * Math.max(1, wageScore)));
    const playerPrestige = clamp(Math.round(number(player.OverallStats, 65) * 1.35 - 27 + (currentClub ? Math.max(0, number(currentClub.avgOverall, 65) - 72) : 0)), 15, 99);
    const prestigeGap = playerPrestige - number(economy.finance.prestige, 50);
    const prestigeScore = clamp(Math.round(82 - Math.max(0, prestigeGap) * 3.4 + Math.max(0, -prestigeGap) * 0.7), 5, 96);
    const levelGap = currentClub ? number(currentClub.avgOverall, 68) - number(buyer.avgOverall, 68) : 0;
    const currentClubScore = clamp(Math.round(80 - Math.max(0, levelGap) * 5.5), 10, 92);
    const market = marketAffinity(player, buyer, profile, history, data);
    const rivalry = rivalryEffect(player, buyer, history, data);
    const relationship = relationshipEffect(player, buyer, history, affinities);
    const ageScore = ageAndArchetype(player, profile);
    const operationScore = player.isFreeAgent ? 92 : 62;

    let score = economicScore * 0.32 + prestigeScore * 0.15 + currentClubScore * 0.10 + market.score * 0.19 + rivalry.score * 0.11 + ageScore * 0.07 + operationScore * 0.04 + clamp(sportingFit, 0, 100) * 0.02;
    score += relationship.bonus;
    let cap = rivalry.cap;
    const capReasons = [];
    const wageRatio = economy.wage / Math.max(1, economy.finance.estimated_wage_ceiling);
    const valueRatio = economy.marketValue / Math.max(1, economy.finance.exceptional_transfer_max);
    if (wageRatio > 3.25) { cap = Math.min(cap, 10); capReasons.push('salario completamente fuera de estructura'); }
    else if (wageRatio > 2) { cap = Math.min(cap, 22); capReasons.push('salario muy por encima del techo'); }
    else if (wageRatio > 1.2) { cap = Math.min(cap, 48); capReasons.push('salario superior al techo estimado'); }
    if (valueRatio > 3) { cap = Math.min(cap, 12); capReasons.push('valor muy superior al máximo excepcional'); }
    else if (valueRatio > 1.75) { cap = Math.min(cap, 28); capReasons.push('operación fuera del rango histórico'); }
    if (prestigeGap > 26) { cap = Math.min(cap, 18); capReasons.push('brecha extrema de prestigio'); }
    else if (prestigeGap > 17) { cap = Math.min(cap, 38); capReasons.push('brecha alta de prestigio'); }
    if (number(player.OverallStats) > number(buyer.maxOverall, 70) + 9) { cap = Math.min(cap, 16); capReasons.push('nivel muy superior al plantel'); }
    score = clamp(Math.round(Math.min(score, cap)), 0, 100);

    const reasons = [];
    if (valueScore >= 70) reasons.push(reason('positive', 'Valor dentro del rango habitual', 'Compatible con la escala económica del club.', 'value'));
    else reasons.push(reason(valueScore < 25 ? 'block' : 'negative', valueScore < 25 ? 'Valor de mercado inalcanzable' : 'Operación económicamente exigente', 'Comparado con el gasto habitual y máximo excepcional.', 'value'));
    if (wageScore >= 70) reasons.push(reason('positive', 'Salario compatible', 'Entra en la estructura salarial estimada.', 'wage'));
    else reasons.push(reason(wageScore < 25 ? 'block' : 'negative', wageScore < 25 ? 'Salario incompatible con el club' : 'Salario superior a la media', 'El techo salarial limita el realismo.', 'wage'));
    if (market.leagueExperience) reasons.push(reason('positive', 'Experiencia previa en esta liga', 'Reduce el salto cultural y deportivo.', 'market'));
    else if (market.currentLeague) reasons.push(reason('positive', 'Procede de un mercado habitual', 'La liga de origen encaja con el perfil.', 'market'));
    else if (market.lowNat) reasons.push(reason('negative', 'Nacionalidad poco frecuente para este club', 'Es una penalización cultural, no una imposibilidad.', 'market'));
    else if (market.score >= 72) reasons.push(reason('positive', 'Afinidad de mercado alta', 'Nacionalidad y procedencia compatibles.', 'market'));
    else if (market.score < 48) reasons.push(reason('negative', 'Mercado de procedencia poco habitual', 'El perfil del club y el de la liga tienen pocos antecedentes.', 'market'));
    if (ageScore >= 80) reasons.push(reason('positive', 'Edad habitual para el club', 'Coincide con su ventana de fichajes.', 'age'));
    if (prestigeScore < 38) reasons.push(reason('negative', 'Brecha alta de prestigio', 'El jugador compite en una escala superior.', 'prestige'));
    reasons.push(...relationship.notes, ...rivalry.notes);
    capReasons.forEach(text => reasons.push(reason('block', `Tope: ${text}`, `El realismo no puede superar ${cap}%.`, 'cap')));

    return {
      score,
      category: levelLabel(score),
      cap,
      capReasons,
      factors: { economic: economicScore, value: valueScore, wage: wageScore, prestige: prestigeScore, currentClub: currentClubScore, market: market.score, rivalry: rivalry.score, age: ageScore, sporting: Math.round(sportingFit) },
      reasons: reasons.sort((a, b) => ({ block: 0, negative: 1, positive: 2 }[a.tone] - ({ block: 0, negative: 1, positive: 2 }[b.tone]))).slice(0, 7),
      marketValue: economy.marketValue,
      marketValueConfidence: economy.valueConfidence,
      wage: economy.wage,
      wageConfidence: economy.wageConfidence,
      currency: economy.currency,
      finance: economy.finance,
      profile,
      relationshipBonus: relationship.bonus,
    };
  }

  return { evaluate, estimateMarketValue, estimateWage, levelLabel };
});
