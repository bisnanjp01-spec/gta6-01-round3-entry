// Emberline — screenshot staging. The maker opens the game with
// ?shot=1..4 and each number stages one fixed, deterministic scene for
// the screenshots: a police chase, a night drive, a harbor boat escape,
// and the start screen. Nothing here ships as gameplay logic; it only
// places the player, the police and the jobs where the camera can see
// them, then the normal simulation takes over.
import { STORY } from "./jobs.js";
import { makeCar, makeBoat } from "./drive.js";

function placeCamera(state) {
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
}

function giveCar(state, x, y, angle, color, kind) {
  const car = makeCar(x, y, angle, color, kind || "sport");
  car.driver = "player";
  car.parked = false;
  state.vehicle = car;
  state.parkedCars.push(car);
  state.player.x = x;
  state.player.y = y;
  state.player.angle = angle;
  return car;
}

function giveBoat(state, x, y) {
  const boat = makeBoat(x, y, 0);
  boat.driver = "player";
  boat.parked = false;
  state.vehicle = boat;
  state.boats.push(boat);
  state.player.x = x;
  state.player.y = y;
  return boat;
}

function spawnCopBehind(state, x, y) {
  const car = makeCar(x, y, 0, "#1c2733", "sedan");
  car.driver = "police";
  car.maxSpeed = 400;
  car.siren = true;
  state.cops.cars.push(car);
  return car;
}

export function applyShot(state, n) {
  if (n === 1) {
    // Cover: a three-star chase down Glass Row with a job on the clock.
    state.simSeconds = 5400; // 22:30
    giveCar(state, 1000, 600, 0, "#ff4757", "sport");
    state.vehicle.speed = 280;
    state.cops.wanted = 3;
    state.cops.heat = 58;
    spawnCopBehind(state, 780, 600);
    spawnCopBehind(state, 720, 636);
    spawnCopBehind(state, 840, 642);
    state.traffic.cars[0].x = 1250; state.traffic.cars[0].y = 1000; state.traffic.cars[0].angle = 0;
    state.traffic.cars[1].x = 900; state.traffic.cars[1].y = 1400; state.traffic.cars[1].angle = Math.PI;
    state.jobs.active = {
      kind: "story", id: "first-fare", title: STORY[0].title, brief: STORY[0].brief,
      stages: STORY[0].stages, stageIndex: 1, payout: 300, timer: 62, holdT: 0,
    };
    placeCamera(state);
  } else if (n === 2) {
    // Night drive through the Docks with traffic and a courier job live.
    state.simSeconds = 3600; // 22:00
    giveCar(state, 2200, 1000, 0, "#2ed573", "sedan");
    state.vehicle.speed = 190;
    state.traffic.cars[0].x = 2380; state.traffic.cars[0].y = 1000; state.traffic.cars[0].angle = 0;
    state.traffic.cars[1].x = 2060; state.traffic.cars[1].y = 1036; state.traffic.cars[1].angle = Math.PI;
    state.traffic.cars[2].x = 2200; state.traffic.cars[2].y = 820; state.traffic.cars[2].angle = Math.PI / 2;
    state.traffic.cars[3].x = 2480; state.traffic.cars[3].y = 1400; state.traffic.cars[3].angle = -Math.PI / 2;
    state.jobs.active = {
      kind: "side", id: "courier-shot", title: "Courier run", payout: 240,
      stages: [
        { type: "goto", x: 2600, y: 1000, label: "Pick up at the north pier", radius: 80 },
        { type: "deliver", x: 1000, y: 2200, label: "Deliver to Old Market", radius: 90, time: 80 },
      ],
      stageIndex: 0, timer: null, holdT: 0,
    };
    placeCamera(state);
  } else if (n === 3) {
    // Harbor escape: Mara on a boat in the bay, a police boat closing in.
    state.simSeconds = 7200; // 23:00
    giveBoat(state, 2650, 1150);
    state.vehicle.speed = 60;
    state.cops.wanted = 2;
    state.cops.heat = 38;
    const pb = makeBoat(2720, 1080, 0.4);
    pb.driver = "police";
    state.cops.boats.push(pb);
    state.jobs.active = {
      kind: "story", id: "tide-turn", title: STORY[7].title, brief: STORY[7].brief,
      stages: STORY[7].stages, stageIndex: 2, payout: 3000, timer: 140, holdT: 0,
    };
    placeCamera(state);
  } else if (n === 4) {
    // The start screen: title, story, controls, and the save note.
    state.mode = "menu";
    state.simSeconds = 0;
    state.player.x = 1000;
    state.player.y = 660;
    placeCamera(state);
  }
  window.__emberline.shotReady = true;
  return state;
}
