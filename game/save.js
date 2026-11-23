// save.js — saving Solstice City to this machine's localStorage.
// One job: persist cash, day, mission progress and bests, and bring them back.
(function () {
  'use strict';
  var KEY = 'solstice-city-save-v1';

  function saveGame(state) {
    try {
      var data = {
        cash: Math.floor(state.cash), day: state.day,
        missionIndex: state.missions.index, kills: state.missions.kills,
        bestCash: Math.max(state.bestCash || 0, Math.floor(state.cash)),
        storyDone: state.missions.storyDone, savedAt: Date.now()
      };
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  function loadGame() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function hasSave() { return loadGame() !== null; }

  function clearSave() {
    try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
  }

  window.SC.save = {
    saveGame: saveGame, loadGame: loadGame, hasSave: hasSave, clearSave: clearSave
  };
})();
