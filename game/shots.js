// shots.js — staged scenes for the game's own screenshots.
// One job: when the page loads with ?shot=N, put the world into one fixed,
// readable scene (a chase, a street walk, a mission, the start screen) and
// freeze it there, so a screenshot is a real render of the game's code.
(function () {
  'use strict';

  function shotNumber() {
    var m = /[?&]shot=([1-4])/.exec(window.location.search || '');
    return m ? parseInt(m[1], 10) : 0;
  }

  // Stage the world for one screenshot, then step it a fixed number of ticks
  // so traffic, police and the player sit in a lively, mid-action pose.
  function stage(game, shot) {
    var P = window.SC.city.PLACES;
    if (shot === 1) {
      // Cover: a three-star police chase through Uptown, player in a taxi.
      game.startPlay();
      game.player.x = 700; game.player.y = 1000;
      game.player.inCar = true;
      game.player.car = { color: '#e8c33a', kind: 'taxi', len: 34, wid: 17 };
      game.player.angle = Math.PI / 2;
      game.player.speed = 120;
      game.police.stars = 3; game.police.heat = 55;
      game.police.cruisers = [];
      game.state.missions.index = 4; game.state.missions.stage = 2;
      game.state.cash = 6400;
      game.hudShow('JOB 5 — THE BIG ONE: lose the cops, reach the Safehouse.');
      for (var i = 0; i < 150; i++) game.step(1 / 60);
    } else if (shot === 2) {
      // On foot downtown at noon: traffic, pedestrians, the diner, no heat.
      game.startPlay();
      game.player.x = P.inezDiner.x + 60; game.player.y = P.inezDiner.y + 30;
      game.player.inCar = false;
      game.player.angle = -Math.PI / 4;
      game.state.cash = 1200;
      game.hudShow('Explore Solstice City — steal a car with E, talk to Inez.');
      for (var j = 0; j < 240; j++) game.step(1 / 60);
    } else if (shot === 3) {
      // Mission in progress: the Viper ambush at the Marina, one star.
      // The player stands clear of the rival pack so she reads at a glance.
      game.startPlay();
      game.player.x = P.marina.x + 210; game.player.y = P.marina.y + 180;
      game.player.inCar = false;
      game.player.angle = -2.44;
      game.state.missions.index = 3; game.state.missions.stage = 1;
      game.state.missions.kills = 2;
      game.police.stars = 1; game.police.heat = 18;
      game.state.cash = 3800;
      game.spawnRivals(P.marina.x, P.marina.y, 5);
      game.hudShow('JOB 4 — BLOCK PARTY: Viper ambush (2/5).');
      for (var k = 0; k < 60; k++) game.step(1 / 60);
    } else if (shot === 4) {
      // Start screen: leave the overlays alone, the title says it all.
      game.showStart();
    }
    game.frozen = shot !== 0;
  }

  window.SC.shots = { shotNumber: shotNumber, stage: stage };
})();
