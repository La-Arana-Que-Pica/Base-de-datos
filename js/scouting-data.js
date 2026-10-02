'use strict';

(function attachScoutingData(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ScoutingData = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function scoutingDataFactory() {
  const number = (value, fallback = 0) => {
    const parsed = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const split = value => String(value || '').split('|').map(item => item.trim()).filter(Boolean);
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  function rowsBy(rows, key) {
    const result = new Map();
    (rows || []).forEach(row => {
      const id = String(row[key] || '').trim();
      if (id) result.set(id, row);
    });
    return result;
  }

  function groupedRows(rows, key) {
    const result = new Map();
    (rows || []).forEach(row => {
      const id = String(row[key] || '').trim();
      if (!id) return;
      if (!result.has(id)) result.set(id, []);
      result.get(id).push(row);
    });
    return result;
  }

  function buildRivalryMap(rows, teams) {
    const map = new Map();
    const set = (clubId, rivalId, level, source) => {
      if (!clubId || !rivalId || rivalId === '262143') return;
      map.set(`${clubId}:${rivalId}`, { clubId, rivalId, level, source });
    };
    (teams || []).forEach(team => {
      const levels = ['maximo', 'fuerte', 'regional'];
      (team.rivals || []).forEach((rivalId, index) => set(String(team.id), String(rivalId), levels[index] || 'secundario', 'database'));
    });
    (rows || []).forEach(row => set(String(row.club_id || ''), String(row.rival_club_id || ''), row.level || 'secundario', 'curated'));
    return map;
  }

  function frequencyMap(values) {
    const map = new Map();
    values.filter(Boolean).forEach(value => map.set(String(value), (map.get(String(value)) || 0) + 1));
    return map;
  }

  function topKeys(map, limit = 4) {
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([key]) => key);
  }

  function inferFinancialPower(club) {
    const ovr = number(club.avgOverall, 68);
    const regionalFactor = club.region === 'south-america' ? 0.72 : club.region === 'europe' ? 1 : 0.78;
    return clamp(Math.round((ovr - 55) * 3.25 * regionalFactor), 20, 96);
  }

  function inferFinances(club) {
    const power = inferFinancialPower(club);
    const scale = Math.pow(power / 50, 2.35);
    const regionalFactor = club.region === 'south-america' ? 0.55 : club.region === 'europe' ? 1 : 0.72;
    const typicalMax = Math.round(5_000_000 * scale * regionalFactor / 250_000) * 250_000;
    const wageCeiling = Math.round((28_000 * Math.pow(power / 50, 1.9) * regionalFactor) / 1000) * 1000;
    return {
      club_id: String(club.id),
      typical_transfer_min: Math.max(100_000, Math.round(typicalMax * 0.12)),
      typical_transfer_max: Math.max(500_000, typicalMax),
      exceptional_transfer_max: Math.max(1_000_000, Math.round(typicalMax * 2.15)),
      average_wage: Math.max(2_000, Math.round(wageCeiling * 0.42)),
      high_wage: Math.max(4_000, Math.round(wageCeiling * 0.72)),
      estimated_wage_ceiling: Math.max(6_000, wageCeiling),
      financial_power: power,
      prestige: clamp(Math.round(number(club.startersAvg || club.avgOverall, 68) * 1.35 - 30), 20, 96),
      confidence: 'estimated',
      source: 'squad_model',
    };
  }

  function hydrateFinance(row, club) {
    const fallback = inferFinances(club);
    if (!row) return fallback;
    const result = { ...fallback };
    Object.keys(fallback).forEach(key => {
      if (row[key] !== undefined && row[key] !== '') result[key] = /club_id|confidence|source/.test(key) ? row[key] : number(row[key], fallback[key]);
    });
    result.confidence = row.confidence || 'curated';
    result.source = row.source || 'club_finances.csv';
    return result;
  }

  function deriveProfiles(teams, players) {
    const leagueCountries = new Map();
    (players || []).forEach(player => {
      const leagueId = String(player.leagueId || '');
      if (!leagueCountries.has(leagueId)) leagueCountries.set(leagueId, []);
      leagueCountries.get(leagueId).push(String(player.Country || ''));
    });
    const profiles = new Map();
    (teams || []).forEach(club => {
      const countries = frequencyMap((club.squad || []).map(player => player.Country));
      const ages = (club.squad || []).map(player => number(player.Age)).filter(Boolean).sort((a, b) => a - b);
      const usual = topKeys(countries, 5);
      const leagueUsual = topKeys(frequencyMap(leagueCountries.get(String(club.leagueId)) || []), 6);
      profiles.set(String(club.id), {
        club_id: String(club.id),
        age_min: ages[Math.floor(ages.length * 0.2)] || 20,
        age_max: ages[Math.floor(ages.length * 0.8)] || 29,
        frequent_nationalities: usual,
        frequent_leagues: [String(club.leagueId || '')].filter(Boolean),
        low_frequency_nationalities: [],
        policies: number(club.avgAge, 27) <= 25 ? ['jovenes', 'reventa'] : ['experiencia_inmediata'],
        archetypes: [],
        confidence: 'estimated',
        source: 'current_squad_and_league',
        clubWeight: (club.squad || []).length >= 18 ? 0.6 : 0.35,
        leagueNationalities: leagueUsual,
      });
    });
    return profiles;
  }

  function mergeProfiles(derived, rows) {
    (rows || []).forEach(row => {
      const id = String(row.club_id || '');
      if (!id) return;
      const base = derived.get(id) || {};
      derived.set(id, {
        ...base,
        club_id: id,
        age_min: number(row.age_min, base.age_min || 20),
        age_max: number(row.age_max, base.age_max || 29),
        frequent_nationalities: split(row.frequent_nationalities).length ? split(row.frequent_nationalities) : base.frequent_nationalities || [],
        frequent_leagues: split(row.frequent_leagues).length ? split(row.frequent_leagues) : base.frequent_leagues || [],
        low_frequency_nationalities: split(row.low_frequency_nationalities),
        policies: split(row.policies).length ? split(row.policies) : base.policies || [],
        archetypes: split(row.archetypes),
        confidence: row.confidence || 'curated',
        source: row.source || 'club_market_profiles.csv',
        clubWeight: number(row.club_weight, base.clubWeight || 0.6),
      });
    });
    return derived;
  }

  function create(input) {
    const teams = input.teams || [];
    const players = input.players || [];
    const finances = rowsBy(input.finances, 'club_id');
    const derivedProfiles = mergeProfiles(deriveProfiles(teams, players), input.profiles);
    const teamMap = new Map(teams.map(team => [String(team.id), team]));
    return {
      marketValues: rowsBy(input.marketValues, 'player_id'),
      wages: rowsBy(input.wages, 'player_id'),
      finances,
      histories: groupedRows(input.history, 'player_id'),
      affinities: groupedRows(input.affinities, 'player_id'),
      rivalries: buildRivalryMap(input.rivalries, teams),
      profiles: derivedProfiles,
      teams: teamMap,
      getFinance(club) { return hydrateFinance(finances.get(String(club.id)), club); },
      getProfile(club) { return derivedProfiles.get(String(club.id)); },
      getRivalry(clubId, rivalId) { return this.rivalries.get(`${clubId}:${rivalId}`) || null; },
      normalize,
    };
  }

  return { create, inferFinances, normalize, number, clamp };
});
