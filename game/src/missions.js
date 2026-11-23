// missions.js — Mara's story: six jobs across Port Azura, each a chain of
// objectives (drive somewhere, steal a car, lose the cops, fight, deliver).
// Completing a mission pays cash, unlocks the next one and saves the game.
const MISSION_DEFS = [
  {
    id: "m1", title: "1 · First Delivery",
    intro: "Rico needs a package at Azura Plaza. Take any car — or walk — and get it there.",
    steps: [
      { kind: "goto", x: 1000, y: 800, label: "Deliver the package to Azura Plaza", radius: 70 },
    ],
    reward: 400,
  },
  {
    id: "m2", title: "2 · Hot Wheels",
    intro: "A client wants a Sundown, any Sundown. Steal one and bring it to Rico's Garage.",
    steps: [
      { kind: "steal", label: "Steal a car (walk up to one and press E)", radius: 0 },
      { kind: "deliver", x: 600, y: 1800, label: "Deliver the stolen car to Rico's Garage", radius: 80 },
    ],
    reward: 900,
  },
  {
    id: "m3", title: "3 · Heat on the Pier",
    intro: "The APD is onto Rico's crew. Draw the heat, then lose them — get your wanted level to zero.",
    steps: [
      { kind: "heat", label: "Make some noise — raise your wanted level to 2 stars", radius: 0 },
      { kind: "lose", label: "Now lose the cops: get wanted back to 0", radius: 0 },
    ],
    reward: 1200,
  },
  {
    id: "m4", title: "4 · The Informant",
    intro: "A snitch is meeting the Harbor Kings at Cafe Lumen. Go there and shut the meeting down.",
    steps: [
      { kind: "goto", x: 2200, y: 1400, label: "Reach Cafe Lumen", radius: 70 },
      { kind: "defeat", x: 2200, y: 1400, count: 3, label: "Deal with the Harbor Kings crew (3)", radius: 0 },
    ],
    reward: 1800,
  },
  {
    id: "m5", title: "5 · Bank of Azura",
    intro: "The big one. Hit the Bank of Azura, grab the cash, and outrun a 4-star response.",
    steps: [
      { kind: "goto", x: 1400, y: 1000, label: "Reach the Bank of Azura", radius: 70 },
      { kind: "grab", x: 1400, y: 1000, label: "Grab the cash (stand in the bank doorway)", radius: 0 },
      { kind: "escape", x: 1000, y: 2250, label: "Escape to the Harbor Docks", radius: 90 },
    ],
    reward: 5000,
  },
  {
    id: "m6", title: "6 · Queen of Port Azura",
    intro: "One last run: take the cash to Sunset Pier and prove the city is yours.",
    steps: [
      { kind: "deliver", x: 3050, y: 600, label: "Deliver the score to Sunset Pier", radius: 80 },
    ],
    reward: 8000,
  },
];

function createMissions() {
  return {
    defs: MISSION_DEFS,
    index: 0, step: 0, active: false,
    grabbed: false, defeatLeft: 0,
    done: false,
  };
}

function currentMission(missions) {
  if (missions.index >= missions.defs.length) return null;
  return missions.defs[missions.index];
}

function currentStep(missions) {
  const m = currentMission(missions);
  if (!m) return null;
  return m.steps[missions.step] || null;
}

function startMission(missions, game) {
  const m = currentMission(missions);
  if (!m) { missions.done = true; return; }
  missions.active = true;
  missions.step = 0;
  missions.grabbed = false;
  const step = currentStep(missions);
  missions.defeatLeft = step && step.kind === "defeat" ? step.count : 0;
  game.message(m.title + " — " + m.intro);
  game.setObjective(m.title, step ? step.label : "", null);
  SoundEngine.pickup();
}

function advanceMissionStep(missions, game) {
  const m = currentMission(missions);
  missions.step++;
  if (missions.step >= m.steps.length) {
    completeMission(missions, game);
    return;
  }
  const step = currentStep(missions);
  missions.defeatLeft = step.kind === "defeat" ? step.count : 0;
  missions.grabbed = false;
  if (step.kind === "defeat") game.spawnGangCrew(step.x, step.y, step.count);
  game.setObjective(m.title, step.label, step);
  game.message("Next: " + step.label);
  SoundEngine.pickup();
}

function completeMission(missions, game) {
  const m = currentMission(missions);
  const player = game.player;
  player.cash += m.reward;
  player.missionsDone++;
  game.message("Mission complete: " + m.title + "  +$" + m.reward);
  game.showToast("MISSION COMPLETE  +$" + m.reward);
  SoundEngine.missionDone();
  missions.index++;
  missions.active = false;
  game.saveGame();
  if (missions.index >= missions.defs.length) {
    missions.done = true;
    game.setObjective("Port Azura is yours", "You finished every job. Free roam — the city is yours, Mara.", null);
    game.message("You are the Queen of Port Azura. Free roam unlocked.");
  } else {
    game.setObjective("Job done", "Press N for your next job, or keep exploring.", null);
  }
}

// Called every frame; checks whether the current step's condition is met.
function updateMissions(missions, dt, game) {
  if (!missions.active) return;
  const step = currentStep(missions);
  if (!step) return;
  const player = game.player;
  const dist = (step.x !== undefined) ? distanceBetween(player.x, player.y, step.x, step.y) : 1e9;
  if (step.kind === "goto" || step.kind === "deliver" || step.kind === "escape") {
    game.setObjective(currentMission(missions).title, step.label, step, Math.round(dist));
    if (dist < step.radius) advanceMissionStep(missions, game);
  } else if (step.kind === "steal") {
    if (player.inCar && player.inCar.stolen) advanceMissionStep(missions, game);
  } else if (step.kind === "heat") {
    game.setObjective(currentMission(missions).title, step.label + "  (" + wantedStars(player) + "/2 stars)", step);
    if (wantedStars(player) >= 2) advanceMissionStep(missions, game);
  } else if (step.kind === "lose") {
    game.setObjective(currentMission(missions).title, step.label + "  (" + wantedStars(player) + " stars)", step);
    if (wantedStars(player) === 0) advanceMissionStep(missions, game);
  } else if (step.kind === "defeat") {
    game.setObjective(currentMission(missions).title,
      step.label + "  (" + missions.defeatLeft + " left)", step);
    if (missions.defeatLeft <= 0) advanceMissionStep(missions, game);
  } else if (step.kind === "grab") {
    game.setObjective(currentMission(missions).title, step.label, step);
    if (dist < 90 && !missions.grabbed) {
      missions.grabbed = true;
      raiseWanted(player, 4);
      game.message("Alarms! The APD is coming — run!");
      SoundEngine.crash();
      advanceMissionStep(missions, game);
    }
  }
}
