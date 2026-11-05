/* Search identity only. No stats, teams or nationality in player matching. */
(function (root) {
  'use strict';
  const cache = new Map();
  function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
  }
  function prepare(value) {
    const raw = String(value || '');
    if (!cache.has(raw)) {
      const text = normalize(raw);
      cache.set(raw, { text, words: text ? text.split(' ') : [] });
    }
    return cache.get(raw);
  }
  function score(name, query) {
    if (!query.text || !name.text) return 0;
    if (name.text === query.text) return 1000;
    const words = query.words;
    if (words.length > 1 && words[0].length === 1) {
      if (!name.words[0].startsWith(words[0])) return 0;
      const surname = words.slice(1);
      for (let start = 1; start <= name.words.length - surname.length; start++) {
        if (surname.every((word, i) => name.words[start + i] === word)) return 950;
      }
      // A partial compound surname still needs the same first-name initial.
      for (let start = 1; start <= name.words.length - surname.length; start++) {
        if (surname.every((word, i) => word === name.words[start + i] || (word.length >= 3 && name.words[start + i].startsWith(word)))) return 400;
      }
      return 0;
    }
    if (name.text.startsWith(query.text)) return 800;
    if (words.every(word => name.words.includes(word))) return 600;
    if (words.every(word => name.words.some(candidate => candidate === word || (word.length >= 3 && candidate.startsWith(word))))) return 400;
    if (words.every(word => name.words.some(candidate => candidate === word || (word.length >= 3 && candidate.includes(word))))) return 200;
    return 0;
  }
  function rank(records, query, nameFor) {
    const prepared = prepare(query);
    if (!prepared.text) return records.slice();
    return records.map(record => ({ record, name: prepare(nameFor(record)) }))
      .map(item => ({ ...item, score: score(item.name, prepared) })).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.name.text.localeCompare(b.name.text, 'es'))
      .map(item => item.record);
  }
  const api = Object.freeze({ normalize, prepare, score, rank });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LAQPDatabaseSearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
