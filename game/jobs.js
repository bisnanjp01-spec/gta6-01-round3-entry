// Emberline — jobs: the payphone board and the Tide Ledger story.
// Mara takes work from payphones. Side jobs pay cash and reputation;
// story chapters unlock with reputation and pay out big. Every job is a
// short list of stages — go, pick up, deliver, steal, follow, escape —
// so the same engine runs a taxi fare and the final convoy heist.
import { distance } from "./rng.js";

export const STORY = [
  {
    id: "first-fare", title: "Chapter 1 — First Fare", rep: 0, payout: 300,
    brief: "A nervous accountant needs a quiet ride across Glass Row. No cops, no questions.",
    stages: [
      { type: "goto", x: 640, y: 620, label: "Pick up the accountant at the Glass Row payphone", radius: 70 },
      { type: "deliver", x: 1000, y: 220, y2: 0, label: "Drop him at the Glass Spire — keep it smooth", radius: 80, time: 75 },
    ],
  },
  {
    id: "wet-work", title: "Chapter 2 — Wet Work", rep: 2, payout: 450,
    brief: "A courier package for the Docks. The tide turns at midnight — be there before it does.",
    stages: [
      { type: "pickup", x: 1020, y: 1440, label: "Collect the package at the Old Market payphone", radius: 70 },
      { type: "deliver", x: 2600, y: 400, label: "Deliver to the north pier before the tide turns", radius: 90, time: 90 },
    ],
  },
  {
    id: "hot-wheels", title: "Chapter 3 — Hot Wheels", rep: 4, payout: 600,
    brief: "Rusty wants a specific sportscar from Glass Row. Take it. Quietly, if you can.",
    stages: [
      { type: "steal", x: 1400, y: 200, label: "Steal the red sportscar parked on Glass Row", radius: 90 },
      { type: "deliver", x: 2200, y: 1800, label: "Deliver it to Rusty's Chop Shop", radius: 90, time: 100 },
    ],
  },
  {
    id: "storm-gate", title: "Chapter 4 — Storm Gate", rep: 6, payout: 800,
    brief: "Crates across the harbor, past the patrol boats. The river is faster than the road tonight.",
    stages: [
      { type: "pickup", x: 1650, y: 600, label: "Collect the crates at the north river dock", radius: 80 },
      { type: "boat", x: 2900, y: 1600, label: "Sail to the south harbor pier — stay off the patrols' line", radius: 110, time: 120 },
    ],
  },
  {
    id: "payphone", title: "Chapter 5 — The Witness", rep: 8, payout: 950,
    brief: "A witness has to reach the safehouse alive. The Port Police already know her name.",
    stages: [
      { type: "goto", x: 640, y: 1440, label: "Pick up the witness at the Old Market payphone", radius: 70 },
      { type: "deliver", x: 1000, y: 1400, label: "Get her to the safehouse — expect company", radius: 80, time: 110, wanted: 2 },
    ],
  },
  {
    id: "glass-house", title: "Chapter 6 — Glass House", rep: 10, payout: 1200,
    brief: "One page of the harbormaster's ledger sits in the Glass Spire. Walk in, walk out.",
    stages: [
      { type: "goto", x: 1000, y: 200, label: "Reach the Glass Spire on foot", radius: 90, onFoot: true },
      { type: "pickup", x: 1060, y: 260, label: "Grab the ledger page from the lobby desk", radius: 60, onFoot: true },
      { type: "deliver", x: 1000, y: 1400, label: "Carry the page to the safehouse", radius: 80, time: 100 },
    ],
  },
  {
    id: "roadblock", title: "Chapter 7 — Roadblock", rep: 12, payout: 1500,
    brief: "Escort the crew's truck through three police roadblocks. Do not stop. Do not look back.",
    stages: [
      { type: "follow", x: 600, y: 1000, label: "Meet the crew truck at Old Market", radius: 110 },
      { type: "deliver", x: 2600, y: 1800, label: "Escort the truck to the Quay — the road is hot", radius: 120, time: 130, wanted: 3 },
    ],
  },
  {
    id: "tide-turn", title: "Chapter 8 — Tide Turn", rep: 14, payout: 3000,
    brief: "The harbormaster's ledger rides in an armored convoy. Take it, then vanish through the storm gates by boat.",
    stages: [
      { type: "follow", x: 1800, y: 600, label: "Find the armored convoy on the dock road", radius: 130 },
      { type: "grab", x: 1800, y: 600, label: "Pull alongside the convoy and hold close to grab the ledger", radius: 70, hold: 2 },
      { type: "boat", x: 3050, y: 1200, label: "Escape by boat through the storm gates in the bay", radius: 130, time: 150 },
    ],
  },
];

export function makeJobs() {
  return { chapter: 0, rep: 0, completed: 0, active: null, board: [], boardSeed: 0, finished: false };
}

function stageTarget(stage, state) {
  if (stage.type === "follow" || stage.type === "grab") {
    const convoy = state.convoy;
    if (convoy) return { x: convoy.x, y: convoy.y, label: stage.label };
  }
  return { x: stage.x, y: stage.y, label: stage.label };
}

export function nextStoryChapter(jobs) {
  if (jobs.chapter >= STORY.length) return null;
  const ch = STORY[jobs.chapter];
  if (jobs.rep < ch.rep) return null;
  return ch;
}

export function startStory(state) {
  const ch = nextStoryChapter(state.jobs);
  if (!ch || state.jobs.active) return null;
  const job = {
    kind: "story", id: ch.id, title: ch.title, brief: ch.brief,
    stages: ch.stages, stageIndex: 0, payout: ch.payout,
    timer: null, holdT: 0, failed: false,
  };
  state.jobs.active = job;
  state.events.push({ type: "toast", text: ch.title + " — " + ch.brief });
  return job;
}

export function makeSideJob(state, kind) {
  const rng = state.rng;
  const spots = state.city.stashSpots;
  const pick = () => spots[Math.floor(rng.next() * spots.length)];
  const a = pick();
  let b = pick();
  if (b === a) b = spots[(spots.indexOf(a) + 2) % spots.length];
  const dist = distance(a.x, a.y, b.x, b.y);
  const base = {
    courier: { title: "Courier run", pay: 180, time: 80 },
    taxi: { title: "Taxi fare", pay: 150, time: 70 },
    getaway: { title: "Getaway drive", pay: 260, time: 90 },
    stash: { title: "Stash pickup", pay: 220, time: 100 },
    race: { title: "Street race", pay: 320, time: 75 },
    boatrun: { title: "Harbor boat run", pay: 300, time: 110 },
  }[kind];
  const pay = Math.round(base.pay + dist / 12);
  return {
    kind: "side", id: kind + "-" + state.jobs.boardSeed++,
    title: base.title, payout: pay,
    stages: [
      { type: kind === "boatrun" ? "boat" : "goto", x: a.x, y: a.y, label: kind === "stash" ? "Find the stash: " + a.name : "Pick up at " + a.name, radius: 80 },
      { type: kind === "boatrun" ? "boat" : kind === "race" ? "deliver" : "deliver", x: b.x, y: b.y, label: "Deliver to " + b.name, radius: 90, time: base.time },
    ],
    stageIndex: 0, timer: null, holdT: 0, failed: false,
  };
}

export function refreshBoard(state) {
  const kinds = ["courier", "taxi", "getaway", "stash", "race", "boatrun"];
  state.jobs.board = kinds.slice(0, 4).map((k) => makeSideJob(state, k));
}

export function startJob(state, job) {
  if (state.jobs.active) return false;
  state.jobs.active = job;
  state.jobs.board = state.jobs.board.filter((j) => j !== job);
  if (job.stages[0].wanted) state.cops.heat = Math.max(state.cops.heat, 40);
  state.events.push({ type: "toast", text: job.title + " started — " + job.stages[0].label });
  return true;
}

export function abandonJob(state) {
  if (!state.jobs.active) return;
  state.events.push({ type: "toast", text: "Job abandoned: " + state.jobs.active.title });
  state.jobs.active = null;
}

export function updateJobs(state, dt) {
  const job = state.jobs.active;
  if (!job) return;
  const stage = job.stages[job.stageIndex];
  if (!stage) {
    completeJob(state, job);
    return;
  }
  const target = stageTarget(stage, state);
  const px = state.player.x;
  const py = state.player.y;
  const d = distance(px, py, target.x, target.y);
  if (stage.time && job.timer === null) job.timer = stage.time;
  if (job.timer !== null) {
    job.timer -= dt;
    if (job.timer <= 0) {
      failJob(state, job, "Out of time.");
      return;
    }
  }
  if (stage.type === "grab") {
    const convoy = state.convoy;
    if (convoy && d < 80 && state.vehicle) {
      job.holdT += dt;
      if (job.holdT >= (stage.hold || 2)) {
        state.events.push({ type: "toast", text: "Ledger grabbed! Run for the boats!" });
        job.stageIndex++;
        job.holdT = 0;
        job.timer = null;
      }
    } else {
      job.holdT = Math.max(0, job.holdT - dt);
    }
    return;
  }
  if (stage.type === "boat" && state.vehicle?.kind !== "boat" && d < (stage.radius || 90)) {
    // Reached the dock on foot: the stage wants the boat, so wait for boarding.
    return;
  }
  if (d < (stage.radius || 80)) {
    if (stage.type === "steal" && state.vehicle !== state.markedCar) return; // must be in the marked car
    if (stage.type === "boat" && state.vehicle?.kind !== "boat") return;
    if (stage.onFoot && state.vehicle) return;
    job.stageIndex++;
    job.timer = null;
    job.holdT = 0;
    if (job.stageIndex >= job.stages.length) {
      completeJob(state, job);
    } else {
      const next = job.stages[job.stageIndex];
      state.events.push({ type: "toast", text: next.label });
      if (next.wanted) {
        state.cops.heat = Math.max(state.cops.heat, next.wanted * 18);
        state.cops.wanted = Math.max(state.cops.wanted, next.wanted);
      }
    }
  }
}

function completeJob(state, job) {
  state.cash += job.payout;
  state.jobs.rep += job.kind === "story" ? 2 : 1;
  state.jobs.completed++;
  if (job.kind === "story") {
    state.jobs.chapter++;
    if (state.jobs.chapter >= STORY.length) {
      state.jobs.finished = true;
      state.events.push({ type: "toast", text: "THE TIDE LEDGER IS YOURS. Emberline is yours now — legend status." });
    }
  }
  state.events.push({ type: "toast", text: "Job done: " + job.title + " — +$" + job.payout });
  state.events.push({ type: "jobdone", payout: job.payout });
  state.jobs.active = null;
  refreshBoard(state);
}

function failJob(state, job, why) {
  state.events.push({ type: "toast", text: "Job failed: " + job.title + " — " + why });
  state.jobs.active = null;
}
