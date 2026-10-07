// Master edit decision list for "Which Frame?" (FrameJam). Sections cut on downbeats, or just before a vocal pickup.
// Song: audio/master.mp3, 125 BPM, 128.04 s. The outro end card runs past the song (render pads silence).
export const TIMELINE = [
  { id: "intro", start: 0.0, end: 7.78, z: 0 },
  { id: "verse1", start: 7.78, end: 31.0, z: 0 },
  { id: "pre", start: 31.0, end: 41.6, z: 0 },
  { id: "chorus1", start: 41.6, end: 58.1, z: 0 },
  { id: "verse2", start: 58.1, end: 75.52, z: 0 },
  { id: "chorus2", start: 75.52, end: 91.02, z: 0 },
  { id: "bridge", start: 91.02, end: 103.4, z: 0 },
  { id: "chorus3", start: 103.4, end: 118.12, z: 0 },
  { id: "outro", start: 118.12, end: 133.0, z: 0 },
  { id: "hud", start: 0.0, end: 9999, z: 100 },
];

// step keys for a 'text' counter: [[t, index], ...] -> holds each index until the next time
const steps = (pts) => pts.flatMap(([t, i], k) => (k ? [[t - 0.001, pts[k - 1][1]], [t, i]] : [[t, i]]));

const VERSIONS = ["V1", "V2", "V3", "V3_FINAL", "V3_FINAL_FINAL", "V3_FINAL_FINAL_2", "V3_FINAL_FINAL_FINAL", "V12", "V12_FINAL", "V12_FINAL_FINAL", "V12_FINAL_FINAL_FINAL.MP4", "V1", "V2", "V3 · APPROVED"];
const NOTES = ["0", "1 VAGUE", "2 VAGUE", "3 VAGUE", "4 VAGUE", "5 VAGUE", "6 VAGUE", "7 VAGUE", "8 VAGUE", "0 PINNED", "1 PINNED", "2 PINNED", "3 PINNED", "3 SENT"];

export const HUD = {
  title: "WHICH FRAME?",
  mark: null,
  sections: [
    [0, "INTRO"],
    [7.78, "VERSE_01"],
    [31.0, "PRE"],
    [41.6, "HOOK_01"],
    [58.1, "VERSE_02"],
    [75.52, "HOOK_02"],
    [91.02, "BRIDGE"],
    [103.4, "HOOK_03"],
    [118.12, "OUTRO"],
  ],
  counters: [
    { label: "CALL", keys: [[0, 0], [133, 133 / 60]], fmt: "clock" },
    {
      label: "NOTES",
      fmt: "text",
      texts: NOTES,
      keys: steps([[0, 0], [8.65, 1], [12.53, 2], [15.85, 3], [20.02, 4], [21.66, 5], [23.89, 6], [25.44, 7], [28.74, 8], [41.6, 9], [46.56, 10], [47.44, 11], [48.42, 12], [50.7, 13]]),
    },
    {
      label: "VERSION",
      fmt: "text",
      texts: VERSIONS,
      keys: steps([[0, 0], [33.41, 1], [34.15, 2], [34.44, 3], [35.2, 4], [35.7, 5], [36.14, 6], [36.92, 7], [37.4, 8], [38.08, 9], [38.54, 10], [41.6, 11], [55.78, 12], [116.86, 13]]),
    },
  ],
  progress: true,
  dark: { ink: "#F4F4F5", accent: "#D4FF3A", sub: "#D4FF3A" },
  light: { ink: "#0C0C0D", accent: "#0C0C0D", sub: "#0C0C0D" },
};

export const POST = {};
