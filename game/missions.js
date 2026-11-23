// missions.js — the story: five jobs from Mama Inez that pay off Rae's debt.
// One job: hold the mission list, track the active job's stage, and say what
// the player must do next. The world (main.js) acts on the stages.
(function () {
  'use strict';
  var P = window.SC.city.PLACES;

  var MISSIONS = [
    {
      id: 'first-fare', title: 'Job 1 — First Fare',
      brief: "Inez: 'A client waits at the Marina Pier. Get a car, pick him up, bring him to Old Plaza. No cops, no dents.'",
      pay: 1200, stages: [
        { kind: 'getCar', text: 'Steal a car (E near any car).' },
        { kind: 'reach', place: 'marina', text: 'Pick up the client at Marina Pier.' },
        { kind: 'reach', place: 'plaza', text: 'Drop the client at Old Plaza.' }
      ]
    },
    {
      id: 'hot-package', title: 'Job 2 — Hot Package',
      brief: "Inez: 'A package waits at the Foundry Gate. Grab it on foot and walk it to Lou's Garage. The Vipers are watching — stay quick.'",
      pay: 1600, stages: [
        { kind: 'reach', place: 'foundryGate', text: 'Reach the Foundry Gate on foot.' },
        { kind: 'pickup', text: 'Pick up the package (walk over it).' },
        { kind: 'reach', place: 'garage', text: 'Deliver the package to Lou\'s Garage.' }
      ]
    },
    {
      id: 'repo-run', title: 'Job 3 — Repo Run',
      brief: "Inez: 'A gold coupe sits by Uptown Bank — the Vipers took it from a friend of mine. Take it back to the garage.'",
      pay: 2000, stages: [
        { kind: 'reach', place: 'uptownBank', text: 'Find the gold coupe by Uptown Bank.' },
        { kind: 'stealGold', text: 'Steal the gold coupe (E near it).' },
        { kind: 'reach', place: 'garage', text: 'Bring the coupe to Lou\'s Garage.' }
      ]
    },
    {
      id: 'block-party', title: 'Job 4 — Block Party',
      brief: "Inez: 'The Vipers set a trap at the Marina. Five of them, all armed. Clear the block and get out alive.'",
      pay: 2400, stages: [
        { kind: 'reach', place: 'marina', text: 'Reach the Marina Pier.' },
        { kind: 'combat', count: 5, text: 'Deal with the Viper ambush (0/5).' },
        { kind: 'reach', place: 'safehouse', text: 'Fall back to the Safehouse.' }
      ]
    },
    {
      id: 'the-big-one', title: 'Job 5 — The Big One',
      brief: "Inez: 'Last job. Uptown Bank, the vault, $8,000. Grab the cash, lose the cops, reach the Safehouse — and the debt is gone.'",
      pay: 8000, stages: [
        { kind: 'reach', place: 'uptownBank', text: 'Reach Uptown Bank.' },
        { kind: 'pickup', text: 'Grab the vault cash (walk over it).' },
        { kind: 'escape', text: 'Lose the police, then reach the Safehouse.' }
      ]
    }
  ];

  function makeMissions() {
    return { index: 0, stage: 0, done: false, kills: 0, packageHeld: false, storyDone: false };
  }

  function current(m) {
    if (m.index >= MISSIONS.length) return null;
    return MISSIONS[m.index];
  }

  function currentStage(m) {
    var mission = current(m);
    if (!mission) return null;
    return mission.stages[m.stage] || null;
  }

  function stageText(m) {
    var s = currentStage(m);
    if (!s) return 'All jobs done.';
    if (s.kind === 'combat') return 'Deal with the Viper ambush (' + m.kills + '/' + s.count + ').';
    return s.text;
  }

  function advance(m) {
    var mission = current(m);
    if (!mission) return { missionDone: false };
    m.stage++;
    if (m.stage >= mission.stages.length) {
      var pay = mission.pay;
      m.index++;
      m.stage = 0;
      m.kills = 0;
      m.packageHeld = false;
      if (m.index >= MISSIONS.length) m.storyDone = true;
      return { missionDone: true, pay: pay, title: mission.title, storyDone: m.storyDone };
    }
    return { missionDone: false };
  }

  function placeOf(stage) {
    if (!stage || !stage.place) return null;
    return P[stage.place] || null;
  }

  window.SC.missions = {
    MISSIONS: MISSIONS, makeMissions: makeMissions, current: current,
    currentStage: currentStage, stageText: stageText, advance: advance,
    placeOf: placeOf
  };
})();
