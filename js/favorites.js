/**
 * Favorites module – localStorage fallback for PES players.
 * Loaded on index.html and player.html.
 *
 * Storage format: array of { playerId: string, teamId: string }
 * Key used: FAVORITES_KEY (see below).
 *
 * NOTE: All exported functions are global so they can be called from
 * inline onclick handlers and other scripts.
 */

'use strict';

const FAVORITES_KEY = 'pes_favorites';

/**
 * Returns the current favorites array.
 * @returns {{ playerId: string, teamId: string }[]}
 */
function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

/**
 * Persists the favorites array to localStorage.
 * @param {{ playerId: string, teamId: string }[]} favs
 */
function _saveFavorites(favs) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  } catch (e) { /* quota exceeded or private mode – silently ignore */ }
}

function _favoriteCloudReady() {
  return Boolean(window.LAQP_SUPABASE && typeof window.laqpCurrentUser === 'function' && window.laqpCurrentUser());
}

async function _syncFavoriteToCloud(playerId, added) {
  if (!_favoriteCloudReady()) return;
  const user = window.laqpCurrentUser();
  try {
    if (added) {
      await window.LAQP_SUPABASE
        .from('user_favorites')
        .insert({ user_id: user.id, player_id: String(playerId) });
    } else {
      await window.LAQP_SUPABASE
        .from('user_favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('player_id', String(playerId));
    }
  } catch (e) {
    console.warn('No se pudo sincronizar favorito en Supabase.', e);
  }
}

/**
 * Returns true if the given player is in favorites.
 * @param {string|number} playerId
 * @param {string|number} teamId
 * @returns {boolean}
 */
function isFavorite(playerId, teamId) {
  const id = String(playerId);
  const tid = String(teamId);
  return getFavorites().some(f => f.playerId === id && f.teamId === tid);
}

/**
 * Toggles a player in/out of favorites.
 * @param {string|number} playerId
 * @param {string|number} teamId
 * @returns {boolean} true if the player was ADDED, false if removed
 */
function toggleFavorite(playerId, teamId) {
  const id = String(playerId);
  const tid = String(teamId);
  const favs = getFavorites();
  const idx = favs.findIndex(f => f.playerId === id && f.teamId === tid);
  if (idx >= 0) {
    favs.splice(idx, 1);
    _saveFavorites(favs);
    _syncFavoriteToCloud(id, false);
    return false;
  }
  favs.push({ playerId: id, teamId: tid });
  _saveFavorites(favs);
  _syncFavoriteToCloud(id, true);
  return true;
}

/**
 * Removes a specific player from favorites without returning a value.
 * @param {string|number} playerId
 * @param {string|number} teamId
 */
function removeFavorite(playerId, teamId) {
  const id = String(playerId);
  const tid = String(teamId);
  _saveFavorites(getFavorites().filter(f => !(f.playerId === id && f.teamId === tid)));
  _syncFavoriteToCloud(id, false);
}

/**
 * Removes all favorites.
 */
function clearFavorites() {
  _saveFavorites([]);
}

/**
 * Returns the total number of favorites.
 * @returns {number}
 */
function getFavoritesCount() {
  return getFavorites().length;
}
