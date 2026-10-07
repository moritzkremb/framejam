// Master edit decision list. One entry per section scene (hard cuts at section boundaries, on downbeats or just
// before a vocal pickup), plus the global HUD on top. Scenes render only inside [start, end). id = file name in engine/scenes/.
//   file:    optional, use another file than <id>.js
//   variant: optional alternate version of a section (e.g. two endings). Only variant 'a' renders unless you pass --variant b.
//            Entries without a variant always render.
export const TIMELINE = [
  { id: "intro", file: "_template.js", start: 0.0, end: 16.66, z: 0 }, // replace with your own scene files
  // { id: 'hook1',  start: 16.66, end: 37.60, z: 0 },
  // { id: 'outro',   start: 140.0, end: 150.0, z: 0, variant: 'a' },
  // { id: 'outro_b', start: 140.0, end: 153.0, z: 0, variant: 'b' },     // may run past the song: render.mjs pads silence
  { id: "hud", start: 0.0, end: 9999, z: 100 },
];

// Persistent frame. See engine/scenes/hud.js for every option.
export const HUD = {
  title: "SONG TITLE",
  mark: null, // or { path: '<svg path d>', w, h, alphas: [1] }
  sections: [
    [0, "INTRO"],
    [16.66, "HOOK_01"],
  ],
  counters: [
    // The spine lives here when the concept has one, e.g. a clock or a counter that grows over the song:
    // { label: '', keys: [[0, 120], [150, 420]], fmt: 'clock', suffix: ' AM' },
    // { label: 'COUNT', keys: [[0, 1], [40, 10000], [150, Infinity]], interp: 'log', fmt: 'short' },
  ],
  progress: true,
};

// Project-wide post defaults (merged over the neutral engine defaults; scenes can still override per frame via E.post).
// Neutral = footage passes through untouched. Use grade:'warm' only for amber-on-black, mostly graphics pieces.
export const POST = {
  // grade: 'warm', grain: 0.045, vignette: 0.35, ca: 0.0015, invertCol: '#FFA010',
};
