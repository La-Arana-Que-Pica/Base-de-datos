/* Face authorship is keyed by PES player ID, independently of memberships/minifaces. */
(function (root) {
  'use strict';
  let edited = new Set();
  let scanned = new Set();
  let available = false;
  let pending;
  const idFor = player => String(player?.ID ?? player?.Id ?? '');
  function configure(rows, scannedRows) {
    rows = Array.isArray(rows) ? rows : rows?.rows ?? null;
    scannedRows = Array.isArray(scannedRows) ? scannedRows : scannedRows?.rows ?? null;
    available = Array.isArray(rows) && Array.isArray(scannedRows);
    scanned = new Set((scannedRows || []).map(idFor));
    edited = new Set((rows || []).filter(row => ['1', 'true'].includes(String(row.Edited).trim().toLowerCase()) && !scanned.has(idFor(row))).map(idFor));
  }
  async function load(parseCSV) {
    if (!pending) pending = Promise.all(['caras_editadas.csv', 'scanned_players.csv'].map(async file => {
      try {
        const response = await fetch(`database/${file}`, { cache: 'no-cache' });
        return response.ok ? parseCSV((await response.text()).replace(/^\uFEFF/, '')) : null;
      } catch { return null; }
    })).then(([rows, scanned]) => configure(rows, scanned));
    return pending;
  }
  const isEdited = player => available && edited.has(typeof player === 'object' ? idFor(player) : String(player));
  const isScanned = player => scanned.has(typeof player === 'object' ? idFor(player) : String(player));
  const full = players => available && players.length > 0 && players.every(player => isEdited(player) || isScanned(player));
  const fullLeague = (league, teams) => (league.teamIds || []).length > 0 && league.teamIds.every(id => {
    const team = teams.find(team => String(team.id) === String(id));
    return team && full(team.players || []);
  });
  function badge(show, fullFaces = false, scannedFace = false) {
    if (!show) return '';
    const key = fullFaces ? 'faces.full' : scannedFace ? 'player.faceStatus.scanned' : 'faces.edited';
    const label = typeof root.t === 'function' ? root.t(key) : fullFaces ? 'Full caras LAqP' : scannedFace ? 'Escaneado en PES 2018' : 'Cara LAqP';
    const helpKey = fullFaces ? 'faces.fullHelp' : scannedFace ? 'player.faceStatus.scanned' : 'player.faceStatus.edited';
    const help = typeof root.t === 'function' ? root.t(helpKey) : fullFaces ? 'Todas las caras editadas por LAqP o escaneadas en PES 2018' : scannedFace ? 'Escaneado en PES 2018' : 'Cara editada por LAqP';
    return `<span class="laqp-face-badge${fullFaces ? ' is-full' : scannedFace ? ' is-scanned' : ''}" title="${help}" aria-label="${help}"><span aria-hidden="true">⚑</span> ${label}</span>`;
  }
  const matches = (players, value) => !value || (available && (value === 'full' ? full(players) : value === 'yes' ? players.some(isEdited) : players.every(player => !isEdited(player))));
  const playerBadge = player => badge(isEdited(player) || isScanned(player), false, isScanned(player));
  const api = { configure, load, isEdited, isScanned, full, fullLeague, badge, playerBadge, matches };
  root.LAQPEditedFaces = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
