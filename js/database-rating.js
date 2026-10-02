/* PES overall scale shared by the public database views. */
(function () {
  'use strict';
  const bands = [
    { min: 95, className: 'stat-range-6', color: '#00ff87' },
    { min: 90, className: 'stat-range-5', color: '#62ff51' },
    { min: 80, className: 'stat-range-4', color: '#a8ff00' },
    { min: 70, className: 'stat-range-3', color: '#e5dc00' },
    { min: 60, className: 'stat-range-2', color: '#e59f01' },
    { min: 0, className: 'stat-range-1', color: '#d33d35' },
  ];
  function bandFor(value) {
    const number = Number.parseInt(value, 10);
    return bands.find(band => Number.isFinite(number) && number >= band.min) || bands[bands.length - 1];
  }
  window.LAQPRating = Object.freeze({
    classFor(value) { return bandFor(value).className; },
    colorFor(value) { return bandFor(value).color; },
    textFor(value) { return ['stat-range-3', 'stat-range-4', 'stat-range-5', 'stat-range-6'].includes(bandFor(value).className) ? '#111' : '#fff'; },
  });
})();
