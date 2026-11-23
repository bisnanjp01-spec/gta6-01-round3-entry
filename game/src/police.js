// police.js — the wanted system and the Azura PD response.
// Wanted runs 0–5 stars. Crime raises heat; heat decays when the player stays
// out of sight. Cops spawn as patrol cars that chase and ram, and at higher
// levels as officers on foot. Getting caught on foot at low speed means busted;
// at zero health the player is wasted and respawns at the hideout.
const MAX_WANTED = 5;

function createPolice() {
  return { copCars: [], officers: [], spawnTimer: 0, sirenOn: false };
}

function wantedStars(player) { return clampValue(Math.floor(player.wanted), 0, MAX_WANTED); }

function raiseWanted(player, amount) {
  player.wanted = clampValue(player.wanted + amount, 0, MAX_WANTED);
  player.wantedHeat = 1;
}

function updatePolice(police, dt, city, player, traffic, game) {
  const stars = wantedStars(player);
  police.sirenOn = stars > 0;
  SoundEngine.setSiren(police.sirenOn && game.state === "playing");
  // Heat decays when the player is calm and no cop is close.
  const copNear = police.copCars.some(c => distanceBetween(c.x, c.y, player.x, player.y) < 420);
  if (!copNear && stars > 0) {
    player.wanted = Math.max(0, player.wanted - dt * 0.12);
  }
  // Spawn cop cars up to the wanted level's allowance.
  police.spawnTimer -= dt;
  const wantCars = stars === 0 ? 0 : Math.min(1 + stars, 5);
  if (police.spawnTimer <= 0 && police.copCars.length < wantCars && stars > 0) {
    police.spawnTimer = 1.6;
    police.copCars.push(spawnCopCar(city, player));
  }
  if (stars === 0) {
    // Cops give up and drive away.
    for (const cop of police.copCars) cop.givingUp = true;
  }
  for (let i = police.copCars.length - 1; i >= 0; i--) {
    const cop = police.copCars[i];
    updateCopCar(cop, dt, city, player, game);
    if (cop.givingUp && distanceBetween(cop.x, cop.y, player.x, player.y) > 900) {
      police.copCars.splice(i, 1);
    }
  }
  // Officers on foot appear at 2+ stars when the player is on foot.
  if (stars >= 2 && !player.inCar && police.officers.length < stars - 1 && randChance(dt * 0.5)) {
    police.officers.push(spawnOfficer(city, player));
  }
  for (let i = police.officers.length - 1; i >= 0; i--) {
    const off = police.officers[i];
    updateOfficer(off, dt, player, game);
    if (off.health <= 0 || stars === 0) police.officers.splice(i, 1);
  }
}

function spawnCopCar(city, player) {
  const spot = nearestRoadPoint(
    player.x + randPick([-1, 1]) * randRange(420, 650),
    player.y + randPick([-1, 1]) * randRange(420, 650));
  return {
    x: clampValue(spot.x, 60, CITY_WIDTH - 60), y: clampValue(spot.y, 60, CITY_HEIGHT - 60),
    angle: angleTo(spot.x, spot.y, player.x, player.y), speed: 0, maxSpeed: 330,
    color: "#1c2f4a", name: "APD Interceptor", driver: "police",
    isPolice: true, stolen: false, givingUp: false, ramCooldown: 0,
  };
}

function spawnOfficer(city, player) {
  const a = randRange(0, Math.PI * 2);
  return {
    x: clampValue(player.x + Math.cos(a) * 260, 40, CITY_WIDTH - 40),
    y: clampValue(player.y + Math.sin(a) * 260, 40, CITY_HEIGHT - 40),
    angle: a, speed: 0, health: 60, isOfficer: true, shootCooldown: randRange(0.5, 1.5),
  };
}

function updateCopCar(cop, dt, city, player, game) {
  cop.ramCooldown = Math.max(0, cop.ramCooldown - dt);
  if (cop.givingUp) {
    cop.speed = lerpValue(cop.speed, 140, dt);
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;
    return;
  }
  const targetAngle = angleTo(cop.x, cop.y, player.x, player.y);
  const diff = angleDiff(cop.angle, targetAngle);
  cop.angle += clampValue(diff, -2.6 * dt, 2.6 * dt);
  const dist = distanceBetween(cop.x, cop.y, player.x, player.y);
  const want = dist > 120 ? cop.maxSpeed : cop.maxSpeed * 0.7;
  cop.speed = lerpValue(cop.speed, want, 1 - Math.pow(0.1, dt));
  cop.x += Math.cos(cop.angle) * cop.speed * dt;
  cop.y += Math.sin(cop.angle) * cop.speed * dt;
  collideCircleWithBuildings(city, cop, 20);
  // Ram the player: on foot it hurts, in a car it shoves and slows.
  if (dist < 46 && cop.ramCooldown <= 0) {
    cop.ramCooldown = 0.9;
    if (player.inCar) {
      player.inCar.speed *= 0.55;
      game.addShake(7);
      SoundEngine.crash();
    } else {
      damagePlayer(player, 18, game);
      game.message("The APD rammed you!");
    }
    raiseWanted(player, 0.1);
  }
}

function updateOfficer(off, dt, player, game) {
  const dist = distanceBetween(off.x, off.y, player.x, player.y);
  off.angle = angleTo(off.x, off.y, player.x, player.y);
  if (dist > 60) {
    off.x += Math.cos(off.angle) * 165 * dt;
    off.y += Math.sin(off.angle) * 165 * dt;
  }
  off.shootCooldown -= dt;
  if (dist < 420 && off.shootCooldown <= 0) {
    off.shootCooldown = randRange(1.1, 1.8);
    if (randChance(0.45)) {
      game.addTracer(off.x, off.y, player.x, player.y);
      SoundEngine.gunshot();
      damagePlayer(player, 9, game);
    }
  }
  // Busted: an officer touching a slow, wanted player on foot ends the run.
  if (dist < 26 && !player.inCar && player.speed < 60) {
    game.onBusted();
  }
}
