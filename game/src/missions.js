// missions.js — the story of Ezra Cole and the six jobs that take him
// from a broke garage mechanic to the name every crew in Lantern Bay
// knows. Each mission is a short list of objectives the game tracks.

var STORY_INTRO = 'Ezra Cole fixed other people\'s cars for five years and stayed broke. ' +
  'Tonight the crews of Lantern Bay start paying him to drive, steal and fight instead. ' +
  'Six jobs. One city. No going back.';

var MISSIONS = [
  {
    id: 'first-fare',
    title: '1 — First Fare',
    reward: 400,
    briefing: 'Old Sal at the docks has a package that needs to reach the Marina Pier before midnight. Take the sedan outside the garage, drive to the docks, grab the package, and deliver it. Easy money. Probably.',
    steps: [
      { type: 'goto', x: 530, y: 2145, radius: 90, text: 'Drive to the Fisherman Docks and pick up the package' },
      { type: 'goto', x: 3120, y: 920, radius: 90, text: 'Deliver the package to Marina Pier' }
    ]
  },
  {
    id: 'hot-wheels',
    title: '2 — Hot Wheels',
    reward: 700,
    briefing: 'A customer wants a gold coupe that parks outside the Gilded Lantern most nights. Steal it — walk up and press E — and bring it back to Cole\'s Garage. The valet will not be thrilled. The police might notice.',
    steps: [
      { type: 'steal', x: 1470, y: 1000, radius: 60, text: 'Steal the gold coupe outside the Gilded Lantern (press E)' },
      { type: 'goto', x: 555, y: 530, radius: 90, text: 'Bring the coupe back to Cole\'s Garage' }
    ]
  },
  {
    id: 'dockside',
    title: '3 — Dockside Trouble',
    reward: 900,
    briefing: 'The Marlowe crew jumped Sal\'s men at the docks and took a crate of parts that belongs to the garage. Go on foot, deal with the four rivals guarding the crate, and take it back. Aim with the mouse, click to shoot.',
    steps: [
      { type: 'combat', x: 530, y: 2145, radius: 260, count: 4, text: 'Clear out the Marlowe rivals at the docks (0/4)' },
      { type: 'goto', x: 555, y: 530, radius: 90, text: 'Bring the crate back to Cole\'s Garage' }
    ]
  },
  {
    id: 'getaway',
    title: '4 — The Getaway',
    reward: 1200,
    briefing: 'The hotel job went loud. You have the payout, the whole Lantern Bay PD is on you, and the safehouse is across town. Three stars, one car, no mistakes. Reach the safehouse and lose them.',
    steps: [
      { type: 'escape', x: 575, y: 1295, radius: 100, text: 'Reach the safehouse with the payout — lose the police!' }
    ]
  },
  {
    id: 'night-market',
    title: '5 — Night Market Run',
    reward: 1500,
    briefing: 'Three drops, one night, no questions. The market crew pays by the minute, so keep moving: the hospital corner, the old town square, then the marina. A timer is running.',
    steps: [
      { type: 'timed', x: 2260, y: 620, radius: 90, time: 150, text: 'Drop 1/3: St. Anselm Hospital corner' },
      { type: 'timed', x: 420, y: 420, radius: 90, time: 150, text: 'Drop 2/3: Old Town square' },
      { type: 'timed', x: 3120, y: 920, radius: 90, text: 'Drop 3/3: Marina Pier' }
    ]
  },
  {
    id: 'king',
    title: '6 — King of Lantern Bay',
    reward: 2500,
    briefing: 'Vince Marlowe runs this city from the top floor of his hotel, and he put the price on your head. Walk into the Marlowe Hotel, finish his six guards, and the city is yours. This is the last job.',
    steps: [
      { type: 'combat', x: 1860, y: 1305, radius: 280, count: 6, text: 'Fight through Marlowe\'s guards at the hotel (0/6)' },
      { type: 'goto', x: 555, y: 530, radius: 90, text: 'Return to Cole\'s Garage — King of Lantern Bay' }
    ]
  }
];

var MissionState = {
  index: 0,
  step: 0,
  active: false,
  done: false,
  defeated: 0,
  timer: 0,
  enemies: [],
  banner: '',
  bannerTimer: 0,
  completedCount: 0
};

MissionState.start = function (index, game) {
  this.index = index;
  this.step = 0;
  this.active = true;
  this.done = false;
  this.defeated = 0;
  this.timer = 0;
  this.enemies = [];
  var m = MISSIONS[index];
  this.showBanner(m.title + ' — ' + m.briefing);
  this.enterStep(game);
};

MissionState.current = function () {
  return MISSIONS[this.index];
};

MissionState.currentStep = function () {
  var m = this.current();
  if (!m) return null;
  return m.steps[this.step] || null;
};

MissionState.objectiveText = function () {
  if (!this.active) return this.done ? 'Story complete — Lantern Bay is yours. Free roam!' : 'No active mission. Press M to see the story.';
  var step = this.currentStep();
  if (!step) return '';
  if (step.type === 'combat') return step.text.replace(/\(\d+\/\d+\)/, '(' + this.defeated + '/' + step.count + ')');
  if (step.type === 'timed' && this.timer > 0) return step.text + ' — ' + Math.ceil(this.timer) + 's left';
  return step.text;
};

MissionState.showBanner = function (text) {
  this.banner = text;
  this.bannerTimer = 6;
};

MissionState.enterStep = function (game) {
  var step = this.currentStep();
  if (!step) return;
  this.defeated = 0;
  this.enemies = [];
  if (step.type === 'combat') {
    var rng = new LanternRng(9000 + this.index * 100 + this.step);
    var names = ['Rook', 'Fang', 'Brick', 'Sly', 'Vex', 'Hawk'];
    for (var i = 0; i < step.count; i++) {
      var a = rng.range(0, Math.PI * 2);
      var r = rng.range(50, step.radius * 0.8);
      this.enemies.push(makeEnemy(step.x + Math.cos(a) * r, step.y + Math.sin(a) * r, names[i % names.length]));
    }
  }
  if (step.type === 'escape') {
    game.player.wanted = 3;
  }
  if (step.type === 'timed' && step.time) {
    this.timer = step.time;
  }
  if (step.type === 'steal') {
    game.ensureStealTarget(step.x, step.y);
  }
};

MissionState.advance = function (game) {
  var m = this.current();
  this.step++;
  if (this.step >= m.steps.length) {
    game.player.cash += m.reward;
    this.completedCount++;
    this.showBanner('Job done! +' + '$' + m.reward + ' — ' + m.title + ' complete.');
    AudioSys.blip(880);
    this.active = false;
    if (this.index + 1 < MISSIONS.length) {
      this.index++;
      var self = this;
      setTimeout(function () { self.start(self.index, game); }, 2500);
    } else {
      this.done = true;
      this.showBanner('KING OF LANTERN BAY — you finished the story. The city is yours.');
    }
  } else {
    this.enterStep(game);
  }
};

MissionState.update = function (dt, game) {
  if (this.bannerTimer > 0) this.bannerTimer -= dt;
  if (!this.active) return;
  var step = this.currentStep();
  if (!step) return;
  var p = game.player;
  if (step.type === 'timed' && this.timer > 0) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.showBanner('Too slow — the drop window closed. Try the run again.');
      this.active = false;
      var self = this;
      setTimeout(function () { self.start(self.index, game); }, 2000);
      return;
    }
  }
  if (step.type === 'goto' || step.type === 'timed') {
    var d = Math.hypot(p.x - step.x, p.y - step.y);
    if (d < step.radius) {
      AudioSys.blip(990);
      Particles.burst(step.x, step.y, '#ffd94a', 24, 160);
      this.advance(game);
    }
  } else if (step.type === 'steal') {
    if (p.car && p.car.model.name === 'Coupe' && p.car.color === '#d4af37') {
      // The gold coupe is stolen; now drive it home.
      this.advance(game);
    }
  } else if (step.type === 'combat') {
    var alive = 0;
    for (var i = 0; i < this.enemies.length; i++) {
      if (this.enemies[i].alive) alive++;
    }
    this.defeated = step.count - alive;
    if (alive === 0) this.advance(game);
  } else if (step.type === 'escape') {
    var dd = Math.hypot(p.x - step.x, p.y - step.y);
    if (dd < step.radius && p.wanted === 0) {
      this.advance(game);
    }
  }
};

// Enemy guards shoot at the player when close and alive.
MissionState.updateEnemies = function (dt, game) {
  for (var i = 0; i < this.enemies.length; i++) {
    var e = this.enemies[i];
    if (!e.alive) continue;
    if (e.health <= 0) {
      e.alive = false;
      Particles.burst(e.x, e.y, '#c93a3a', 26, 180);
      AudioSys.crash();
      continue;
    }
    var p = game.player;
    var dx = p.x - e.x;
    var dy = p.y - e.y;
    var d = Math.hypot(dx, dy);
    e.angle = Math.atan2(dy, dx);
    if (d > 320) {
      e.x += Math.cos(e.angle) * e.speed * dt;
      e.y += Math.sin(e.angle) * e.speed * dt;
      collideBuildings(e, 12);
    } else if (d < 200) {
      e.shootTimer -= dt;
      if (e.shootTimer <= 0) {
        e.shootTimer = 1.8 + combatRng.float() * 1.0;
        var spread = (combatRng.float() - 0.5) * 0.35;
        Bullets.fire(e.x, e.y, e.angle + spread, false);
        AudioSys.shot();
      }
    }
  }
};
