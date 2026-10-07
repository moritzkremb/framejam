// SCENE TEMPLATE. Copy to engine/scenes/<id>.js and add it to engine/timeline.js.
// Write the beat-by-beat plan here first: every lyric word + onset (engine/data/lyrics.json), the visual event, its layer
// (BACK / MID / FRONT), the camera move, and which beat or downbeat each cut lands on.
//
// PLAN
//   t      word/event          visual                                   layer   camera / cut
//   0.00   (hard cut in)       ...                                      ...     ...
//
// Layer recipe over footage ("type behind the subject"):
//   BACK graphics -> drawPlate(v) -> MID graphics -> drawPlate(v, {matte:true}) -> FRONT graphics (tracked to the subject)
// Pure-graphics moments skip the plates and render 2D/3D only.
import * as THREE from "three";

const CLIP = "clip_a"; // a folder in assets/video/ (prepped by tools/prep_clip.sh)
const SLOT = 0.0; // song time at clip frame 1, for clips generated against the song (lip-sync, beat-guided dance): local = t - SLOT
let v = null,
  g,
  scene,
  cam,
  word;

// smooth a tracked landmark over +-2 frames (raw pose jitter looks cheap)
function smoothPt(v, localT, idx) {
  let x = 0,
    y = 0,
    n = 0;
  for (let k = -2; k <= 2; k++) {
    const tr = v.trackAt(localT + k / v.meta.fps);
    const p = tr?.pose?.[idx];
    if (p && p[2] > 0.3) {
      x += p[0];
      y += p[1];
      n++;
    }
  }
  return n ? [x / n, y / n] : null;
}

export default {
  async load(E, layer) {
    try {
      v = await E.loadVideo(CLIP);
    } catch (e) {
      console.warn("footage missing", CLIP);
    }
    g = E.makeG2D(E.W, E.H); // one full-res 2D surface, reused for MID and FRONT
    // 3D hero type: emissive front face (HDR > 1 blooms on dark looks), darker extrusion sides
    scene = new THREE.Scene();
    cam = new THREE.PerspectiveCamera(40, E.W / E.H, 0.1, 200);
    cam.position.set(0, 0, 10);
    word = new THREE.Mesh(
      E.text3D("HELLO", { font: "ArchivoBlack", size: 1.6, depth: 0.45 }),
      [
        new THREE.MeshBasicMaterial({ color: E.col(E.PAL.accent, 1.3) }),
        new THREE.MeshBasicMaterial({ color: E.col(E.PAL.ember, 0.8) }),
      ],
    );
    scene.add(word);
  },
  async prepare(E, t) {
    if (v) await v.frame(Math.max(0, t - SLOT));
  }, // never let a clip freeze: keep localT inside the clip
  render(E, t, rt) {
    const S = E.SCALE,
      c = g.ctx,
      local = t - SLOT;
    E.renderer.setRenderTarget(rt);
    const w = E.words.find((x) => x.w.toUpperCase() === "HELLO");
    if (v) {
      E.drawPlate(E, v); // full-frame clean plate (cover)
      g.clear(); // MID: giant type behind the subject
      E.drawText(c, "HELLO.", E.W / 2, E.H * 0.45, {
        font: "Archivo",
        weight: 900,
        stretch: "125%",
        size: 420 * S,
        color: E.PAL.accent,
        align: "center",
        s: w ? E.popScale(t, w.s, { k: 300, z: 0.45, from: 1.6 }) : 1,
        alpha: w ? E.wordAlpha(t, w.s, w.e) : 1,
      });
      g.commit();
      E.blitG2D(E, g, 1);
      E.drawPlate(E, v, { matte: true }); // subject back in front
      g.clear(); // FRONT: label locked to the nose (pose landmark 0)
      const p = smoothPt(v, local, 0);
      if (p) {
        const [x, y] = E.plateToScreen(E, v, p);
        c.strokeStyle = E.PAL.white;
        c.lineWidth = 3 * S;
        c.strokeRect(x - 60 * S, y - 70 * S, 120 * S, 140 * S);
        E.drawText(c, "SUBJECT_01", x + 70 * S, y - 60 * S, {
          font: "JetBrains Mono",
          weight: 700,
          size: 22 * S,
          color: E.PAL.white,
          align: "left",
        });
      }
      g.commit();
      E.blitG2D(E, g, 1);
    } else {
      word.scale.setScalar(Math.max(0.001, w ? E.popScale(t, w.s) : 1)); // pure-graphics fallback: 3D word on the onset
      E.renderer.render(scene, cam);
    }
    E.post.punch = 0.03 * E.pulse("kicks", t, 0.09); // camera punch on kicks (moves the frame, never alters pixels)
    E.hud.theme = "dark"; // 'light' on white/colour frames
    E.hud.sub = true; // false only while this scene shows the full sung line itself
  },
};
