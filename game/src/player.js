// player.js — Mara Voss, on foot and behind the wheel.
// On foot she walks and sprints, punches and shoots. In a car she drives with
// acceleration, steering and a handbrake, and can steal any parked or traffic
// car by walking up to it and pressing E.
const PLAYER_RADIUS = 13;
const WALK_SPEED = 175;
const SPRINT_SPEED = 285;

function createPlayer(city) {
  const home = city.landmarks.hideout;
  return {
    x: home.x, y: home.y, angle: -Math.PI / 2,
    vx: 0, vy: 0, speed: 0,
    health: 100, armor: 0, cash: 250, ammo: 24,
    inCar: null, wanted: 0, wantedHeat: 0,
    punchCooldown: 0, shootCooldown: 0, invuln: 0,
    kills: 0, carsStolen: 0, missionsDone: 0,
  };
}

function playerSpeedLimit(player) { return player.inCar ? 460 : WALK_SPEED; }

function updatePlayer(player, input, dt, city, cars, game) {
  player.punchCooldown = Math.max(0, player.punchCooldown - dt);
  player.shootCooldown = Math.max(0, player.shootCooldown - dt);
  player.invuln = Math.max(0, player.invuln - dt);
  if (player.inCar) {
    updatePlayerDriving(player, input, dt, city, cars, game);
  } else {
    updatePlayerOnFoot(player, input, dt, city, game);
  }
}

function updatePlayerOnFoot(player, input, dt, city, game) {
  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const len = Math.hypot(mx, my);
  if (len > 0) { mx /= len; my /= len; }
  const sprint = input.sprint ? SPRINT_SPEED : WALK_SPEED;
  const target = sprint * (len > 0 ? 1 : 0);
  player.speed = lerpValue(player.speed, target, 1 - Math.pow(0.001, dt));
  player.x += mx * player.speed * dt;
  player.y += my * player.speed * dt;
  if (len > 0) player.angle = Math.atan2(my, mx);
  player.x = clampValue(player.x, 20, CITY_WIDTH - 20);
  player.y = clampValue(player.y, 20, CITY_HEIGHT - 20);
  collideCircleWithBuildings(city, player, PLAYER_RADIUS);
  // Face the mouse when aiming.
  if (game && game.mouseWorld) {
    player.angle = angleTo(player.x, player.y, game.mouseWorld.x, game.mouseWorld.y);
  }
}

function updatePlayerDriving(player, input, dt, city, cars, game) {
  const car = player.inCar;
  const accel = input.up ? 420 : (input.down ? -300 : 0);
  const maxFwd = 460, maxRev = 150;
  car.speed += accel * dt;
  car.speed *= Math.pow(0.4, dt); // rolling drag
  if (input.handbrake) car.speed *= Math.pow(0.02, dt);
  car.speed = clampValue(car.speed, -maxRev, maxFwd);
  const steer = ((input.left ? 1 : 0) - (input.right ? 1 : 0)) * (car.speed >= 0 ? 1 : -1);
  const turnRate = 2.4 * clampValue(Math.abs(car.speed) / 120, 0, 1);
  car.angle += steer * turnRate * dt * (input.handbrake ? 1.5 : 1);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  car.x = nx; car.y = ny;
  player.x = car.x; player.y = car.y; player.angle = car.angle; player.speed = Math.abs(car.speed);
  // Building collision: bounce off and lose speed.
  const hit = collideCircleWithBuildings(city, car, 20);
  if (hit) {
    if (Math.abs(car.speed) > 180) { SoundEngine.crash(); game.addShake(6); }
    car.speed *= -0.35;
  }
  car.x = clampValue(car.x, 20, CITY_WIDTH - 20);
  car.y = clampValue(car.y, 20, CITY_HEIGHT - 20);
  // Off-road is slower and dusty.
  if (!isOnRoad(car.x, car.y) && Math.abs(car.speed) > 200) car.speed *= Math.pow(0.6, dt);
  if (Math.abs(car.speed) > 30 && game) game.spawnSkid(car);
  SoundEngine.setEngine(Math.abs(car.speed) / maxFwd, true);
}

function playerEnterCar(player, car) {
  if (!car || car.isPolice) return false;
  player.inCar = car;
  car.driver = "player";
  car.speed = 0;
  if (!car.stolen) { car.stolen = true; player.carsStolen++; }
  return true;
}

function playerExitCar(player, game) {
  const car = player.inCar;
  if (!car) return;
  car.driver = null;
  car.speed = 0;
  player.inCar = null;
  player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
  player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
  player.speed = 0;
  if (game) collideCircleWithBuildings(game.city, player, PLAYER_RADIUS);
  SoundEngine.setEngine(0, false);
  if (game) game.message("You left the " + car.name + ".");
}

function playerPunch(player, enemies, game) {
  if (player.punchCooldown > 0 || player.inCar) return;
  player.punchCooldown = 0.45;
  SoundEngine.punch();
  const reach = 34;
  const px = player.x + Math.cos(player.angle) * reach;
  const py = player.y + Math.sin(player.angle) * reach;
  for (const e of enemies) {
    if (e.health <= 0) continue;
    if (distanceBetween(px, py, e.x, e.y) < 26) {
      e.health -= 34;
      e.x += Math.cos(player.angle) * 14; e.y += Math.sin(player.angle) * 14;
      game.addHitSpark(e.x, e.y, "#ffd23f");
      if (e.health <= 0) { player.kills++; game.onEnemyDown(e); }
      return;
    }
  }
}

function playerShoot(player, targetX, targetY, enemies, game) {
  if (player.shootCooldown > 0 || player.ammo <= 0) return false;
  player.shootCooldown = 0.22;
  player.ammo--;
  SoundEngine.gunshot();
  player.angle = angleTo(player.x, player.y, targetX, targetY);
  const range = 520;
  let hitEnemy = null, hitD = range;
  for (const e of enemies) {
    if (e.health <= 0) continue;
    const d = distanceBetween(player.x, player.y, e.x, e.y);
    if (d > range) continue;
    const ang = Math.abs(angleDiff(player.angle, angleTo(player.x, player.y, e.x, e.y)));
    if (ang < 0.16 && d < hitD) { hitD = d; hitEnemy = e; }
  }
  const endX = player.x + Math.cos(player.angle) * hitD;
  const endY = player.y + Math.sin(player.angle) * hitD;
  game.addTracer(player.x, player.y, endX, endY);
  if (hitEnemy) {
    hitEnemy.health -= 45;
    game.addHitSpark(hitEnemy.x, hitEnemy.y, "#ff5a4e");
    if (hitEnemy.health <= 0) { player.kills++; game.onEnemyDown(hitEnemy); }
  }
  game.raiseWanted(0.35);
  return true;
}

function damagePlayer(player, amount, game) {
  if (player.invuln > 0) return;
  let left = amount;
  if (player.armor > 0) {
    const absorbed = Math.min(player.armor, left * 0.6);
    player.armor -= absorbed; left -= absorbed;
  }
  player.health -= left;
  player.invuln = 0.4;
  if (game) game.addShake(4);
  if (player.health <= 0) { player.health = 0; if (game) game.onPlayerDown(); }
}
