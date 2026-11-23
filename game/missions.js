// missions.js — three chained story jobs for Mara Voss in Costa Verde.
import { TILE } from './city.js';

export const MISSION_DEFS = [
  {
    id: 'getaway',
    title: 'JOB 1 — THE GETAWAY',
    reward: 500,
    intro: 'Rico: "Steal a car, any car, and bring it to the harbour garage. Quick and quiet."',
    stages: [
      { text: 'Steal a car (walk up to one and press E)', type: 'steal' },
      { text: 'Drive to the harbour garage', type: 'goto', x: 4.5 * TILE, y: 27.5 * TILE },
    ],
  },
  {
    id: 'pickup',
    title: 'JOB 2 — THE PICKUP',
    reward: 800,
    intro: 'Rico: "My cousin Tito is waiting at the plaza fountain. Pick him up, then drop him at the north motel. No detours."',
    stages: [
      { text: 'Go to the plaza fountain and pick up Tito', type: 'goto', x: 19.5 * TILE, y: 14.5 * TILE },
      { text: 'Drive Tito to the north motel', type: 'goto', x: 34.5 * TILE, y: 3.5 * TILE },
    ],
  },
  {
    id: 'delivery',
    title: 'JOB 3 — THE HOT DELIVERY',
    reward: 1500,
    intro: 'Rico: "Last one. A package for the docks — and the PD already knows. Two stars on you the second you grab it. Don\'t stop."',
    stages: [
      { text: 'Grab the package at the east warehouse', type: 'goto', x: 36.5 * TILE, y: 19.5 * TILE },
      { text: 'Deliver it to the docks — lose the cops!', type: 'goto', x: 7.5 * TILE, y: 27.5 * TILE, timed: 95 },
    ],
  },
];

export class Missions {
  constructor() {
    this.index = 0;          // current mission
    this.stage = 0;          // stage inside it
    this.completed = [];     // finished mission ids
    this.done = false;       // whole story done
    this.timer = 0;          // countdown for timed stages
    this.message = '';       // toast text
    this.messageT = 0;
    this.passenger = false;  // Tito riding along
  }

  current() { return this.done ? null : MISSION_DEFS[this.index]; }
  currentStage() {
    const m = this.current();
    return m ? m.stages[this.stage] : null;
  }
  marker() {
    const s = this.currentStage();
    return s && s.x !== undefined ? { x: s.x, y: s.y } : null;
  }
  objectiveText() {
    if (this.done) return 'Story complete — free roam. Enjoy Costa Verde!';
    const m = this.current();
    const s = this.currentStage();
    return `${m.title}: ${s.text}`;
  }

  toast(text, seconds) {
    this.message = text;
    this.messageT = seconds || 4;
  }

  startMission(state) {
    const m = this.current();
    if (!m) return;
    this.stage = 0;
    this.timer = 0;
    this.toast(m.intro, 5);
    if (m.id === 'delivery') state.police.setWanted(0, state);
  }

  // Returns 'advanced' | 'complete' | 'failed' | null.
  update(dt, state) {
    if (this.messageT > 0) this.messageT -= dt;
    const m = this.current();
    if (!m) return null;
    const s = this.currentStage();
    if (!s) return null;
    if (s.timed && this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.toast('Too slow — the buyer walked. Job failed, try again!', 4);
        this.stage = 0;
        this.timer = 0;
        this.passenger = false;
        return 'failed';
      }
    }
    const p = state.player;
    if (s.type === 'steal') {
      // Stealing counts the moment Mara is behind the wheel.
      if (p.car) return this.advance(state);
      return null;
    }
    if (s.type === 'goto') {
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d < 56) return this.advance(state);
      return null;
    }
    return null;
  }

  advance(state) {
    const m = this.current();
    const s = this.currentStage();
    if (m.id === 'pickup' && this.stage === 0) {
      this.passenger = true;
      this.toast('Tito: "Finally! North motel, and step on it."', 3);
      state.audio.pickup();
    }
    if (m.id === 'delivery' && this.stage === 0) {
      state.police.setWanted(2, state);
      this.timer = 95;
      this.toast('Package grabbed — the PD is on you! GO!', 4);
      state.audio.pickup();
    }
    this.stage += 1;
    if (this.stage >= m.stages.length) {
      // Mission complete.
      state.cash += m.reward;
      this.completed.push(m.id);
      this.passenger = false;
      state.audio.missionDone();
      this.toast(`${m.title} COMPLETE — +$${m.reward}`, 4);
      this.index += 1;
      this.stage = 0;
      this.timer = 0;
      if (this.index >= MISSION_DEFS.length) {
        this.done = true;
        this.toast('STORY COMPLETE — Costa Verde is yours, Mara!', 6);
        state.police.setWanted(0, state);
        return 'complete';
      }
      this.startMission(state);
      return 'complete';
    }
    return 'advanced';
  }
}
