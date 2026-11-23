// save.js — localStorage persistence for Costa Verde progress.
// Save shape: { cash, missionIndex, completed, bestWanted, muted }
// Progress is written on every mission event and on bust, never mid-frame.
const KEY = 'costa-verde-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s !== 'object' || s === null) return null;
    return {
      cash: Number(s.cash) || 0,
      missionIndex: Number(s.missionIndex) || 0,
      completed: Array.isArray(s.completed) ? s.completed.filter((x) => typeof x === 'string') : [],
      bestWanted: Number(s.bestWanted) || 0,
      muted: Boolean(s.muted),
    };
  } catch (_e) {
    return null;
  }
}

export function saveGame(state) {
  try {
    const data = {
      cash: Math.floor(state.cash),
      missionIndex: state.missions.index,
      completed: state.missions.completed.slice(),
      bestWanted: state.bestWanted,
      muted: Boolean(state.audioMuted),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (_e) {
    return false;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (_e) { /* storage unavailable */ }
}
