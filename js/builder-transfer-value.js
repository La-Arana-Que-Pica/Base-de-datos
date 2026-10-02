'use strict';

(function exposeTransferValue(root) {
  function ageMultiplier(age) {
    if (age === null || age === undefined || age === '') return 1;
    const value = Number(age);
    if (!Number.isFinite(value)) return 1;
    if (value <= 19) return 1.35;
    if (value <= 22) return 1.25;
    if (value <= 26) return 1.10;
    if (value <= 29) return 1;
    if (value <= 31) return 0.78;
    if (value <= 33) return 0.60;
    return 0.40;
  }

  function estimatedTransferFee(player) {
    const rawMarketValue = player && player.marketValueEur;
    const marketValue = rawMarketValue === null || rawMarketValue === undefined || rawMarketValue === '' ? NaN : Number(rawMarketValue);
    if (Number.isFinite(marketValue) && marketValue > 0) return Math.round(marketValue * 1.10);
    const rawOverall = player && player.overall;
    if (rawOverall === null || rawOverall === undefined || rawOverall === '') return 0;
    const overall = Number(rawOverall);
    if (!Number.isFinite(overall)) return 0;
    const baseMillions = 0.03 * (1.22 ** (overall - 50));
    return Math.max(100000, Math.round(baseMillions * ageMultiplier(player.age) * 1.10 * 1e6));
  }

  function roundMoney(value) {
    const amount = Math.max(0, Number(value) || 0);
    if (amount >= 100e6) return Math.round(amount / 10e6) * 10e6;
    if (amount >= 10e6) return Math.round(amount / 1e6) * 1e6;
    if (amount >= 1e6) return Math.round(amount / 500000) * 500000;
    return Math.round(amount / 100000) * 100000;
  }

  function formatEstimatedMoney(value) {
    const rounded = roundMoney(value);
    if (rounded >= 1e9) return `~€${(rounded / 1e9).toFixed(rounded % 1e9 ? 1 : 0)}B`;
    if (rounded >= 1e6) return `~€${(rounded / 1e6).toFixed(rounded % 1e6 ? 1 : 0)}M`;
    if (rounded >= 1000) return `~€${Math.round(rounded / 1000)}K`;
    return `~€${rounded}`;
  }

  const api = { ageMultiplier, estimatedTransferFee, roundMoney, formatEstimatedMoney };
  root.LAQPTransferValue = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
