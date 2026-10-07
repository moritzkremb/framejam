// WebGL music-video engine: compositor, post pipeline, deterministic frame API.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { TexturePass } from "three/addons/postprocessing/TexturePass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import * as core from "./core.js";
import * as TL from "./timeline.js";
const TIMELINE = TL.TIMELINE;
import * as roto from "./roto.js";
import * as typekit from "./typekit.js";
import * as plate from "./plate.js";

// spring overshoot can drive a radius slightly negative for a frame; canvas throws on that, so clamp it
for (const fn of ["arc", "ellipse"]) {
  const orig = CanvasRenderingContext2D.prototype[fn];
  CanvasRenderingContext2D.prototype[fn] = function (...a) {
    a[2] = Math.max(0, a[2]);
    if (fn === "ellipse") a[3] = Math.max(0, a[3]);
    return orig.apply(this, a);
  };
}
const _arcTo = CanvasRenderingContext2D.prototype.arcTo;
CanvasRenderingContext2D.prototype.arcTo = function (x1, y1, x2, y2, r) {
  return _arcTo.call(this, x1, y1, x2, y2, Math.max(0, r));
};
const Q = new URLSearchParams(location.search);
const SCALE = parseFloat(Q.get("scale") ?? "1");
const W = Math.round(1920 * SCALE),
  H = Math.round(1080 * SCALE);
const ONLY = Q.get("only") ? Q.get("only").split(",") : null;

const canvas = document.getElementById("c");
canvas.width = W;
canvas.height = H;
canvas.style.width = W + "px";
canvas.style.height = H + "px";
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  preserveDrawingBuffer: true,
  powerPreference: "high-performance",
  alpha: false,
});
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // final shader does sRGB encode itself
renderer.toneMapping = THREE.NoToneMapping;
renderer.autoClear = false;

const mkRT = (samples = 4) =>
  new THREE.WebGLRenderTarget(W, H, {
    type: THREE.HalfFloatType,
    samples,
    colorSpace: THREE.LinearSRGBColorSpace,
    depthBuffer: true,
  });
const accum = mkRT(0);
const _emptyScene = new THREE.Scene(),
  _emptyCam = new THREE.OrthographicCamera();
const layerRTs = [];
const getLayerRT = (i) => (layerRTs[i] ??= mkRT(4));

// ---- composite layers into accum
const compMat = new THREE.ShaderMaterial({
  uniforms: { tex: { value: null }, opacity: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
  fragmentShader: `uniform sampler2D tex; uniform float opacity; varying vec2 vUv; void main(){ vec4 c=texture2D(tex,vUv); gl_FragColor=vec4(c.rgb*opacity, c.a*opacity); }`,
  depthTest: false,
  depthWrite: false,
  transparent: true,
});
const quad = new core.FSQuad(compMat);
function blendFor(mode) {
  compMat.blending = THREE.CustomBlending;
  if (mode === "add") {
    compMat.blendSrc = THREE.OneFactor;
    compMat.blendDst = THREE.OneFactor;
  } else if (mode === "screen") {
    compMat.blendSrc = THREE.OneFactor;
    compMat.blendDst = THREE.OneMinusSrcColorFactor;
  } else if (mode === "multiply") {
    compMat.blendSrc = THREE.DstColorFactor;
    compMat.blendDst = THREE.ZeroFactor;
  } else {
    compMat.blendSrc = THREE.OneFactor;
    compMat.blendDst = THREE.OneMinusSrcAlphaFactor;
  } // premultiplied normal
  compMat.blendEquation = THREE.AddEquation;
  compMat.needsUpdate = true;
}

// ---- post
const composer = new EffectComposer(
  renderer,
  new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType }),
);
composer.setPixelRatio(1);
composer.setSize(W, H);
const texPass = new TexturePass(accum.texture);
composer.addPass(texPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 1.0, 0.55, 1.05);
composer.addPass(bloom);
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(W, H) },
    uFrame: { value: 0 },
    uExposure: { value: 1 },
    uCA: { value: 0.0015 },
    uGrain: { value: 0.05 },
    uVig: { value: 0.35 },
    uFlash: { value: 0 },
    uFlashCol: { value: new THREE.Color(1, 0.85, 0.6) },
    uInvert: { value: 0 },
    uPunch: { value: 0 },
    uShake: { value: new THREE.Vector2() },
    uRot: { value: 0 },
    uScan: { value: 0 },
    uGlitch: { value: 0 },
    uAmber: { value: new THREE.Color("#FFA010") },
    uWarm: { value: 0 },
    uLetterbox: { value: 0 },
    uSat: { value: 1 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uFade: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uWarm, uFrame, uExposure, uCA, uGrain, uVig, uFlash, uInvert, uPunch, uRot, uScan, uGlitch, uLetterbox, uSat, uFade;
    uniform vec2 uShake; uniform vec3 uFlashCol, uAmber, uTint; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.,1.); }
    vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c,vec3(1./2.4))-0.055, step(0.0031308,c)); }
    void main(){
      vec2 uv = vUv - 0.5; float asp = uRes.x/uRes.y; uv.x *= asp;
      float cr = cos(uRot), sr = sin(uRot); uv = mat2(cr,-sr,sr,cr)*uv; uv /= (1.0+uPunch); uv.x /= asp; uv += 0.5 + uShake;
      if(uGlitch>0.){ float row=floor(uv.y*38.); float g=h(vec2(row, floor(uFrame/2.))); if(g<uGlitch*0.6){ uv.x += (h(vec2(row,uFrame))-0.5)*0.12*uGlitch; } }
      vec2 d = (uv-0.5); float r2 = dot(d,d);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + d*uCA*(1.+r2*4.)).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - d*uCA*(1.+r2*4.)).b;
      col *= uExposure * uTint;
      if (uWarm < 0.5) {
        // grade 'neutral' (default): footage passes through untouched. Values <= 1 are identity (no grade, no tonemap, no clamp).
        // Only HDR graphics (>1) are compressed: hue-preserving, with a white-hot core so neon reads like a tube.
        float mx = max(max(col.r,col.g),col.b); if (mx > 1.0) { float k = 1.0 - 1.0/mx; col = mix(col/mx, vec3(1.0), clamp(k*0.55,0.,1.)); }
      } else {
        // grade 'warm': amber-on-black palettes only. Clamps g<=r, b<=g (kills cool CA fringes), 50% hue-preserving ACES.
        col.g = min(col.g, col.r * 1.02); col.b = min(col.b, col.g * 0.98);
        vec3 a1 = aces(col); float mx = max(max(col.r,col.g),max(col.b,1e-4)); vec3 a2 = col * (aces(vec3(mx)).r / mx); col = mix(a1, a2, 0.5);
      }
      float lum = dot(col, vec3(0.2126,0.7152,0.0722));
      col = mix(vec3(lum), col, uSat);
      if (uWarm > 0.5) {
        // pull saturated yellows toward amber (ACES turns #FFB000 lemon), then re-clamp blue (kills pink casts on skin)
        float mx=max(col.r,1e-4), mn=min(min(col.r,col.g),col.b); float st=(mx-mn)/mx; col.g = mix(col.g, min(col.g, col.r*0.46), smoothstep(0.5,0.9,st)); col.b = min(col.b, col.g*0.85);
        vec3 inv = mix(uAmber, vec3(0.012,0.006,0.0), smoothstep(0.02,0.6,lum));
        col = mix(col, inv, uInvert);                  // brand-colour poster invert
      } else {
        col = mix(col, vec3(1.0) - col, uInvert);      // true RGB invert (graphics-only frames)
      }
      col += uFlashCol * uFlash;
      col *= 1.0 - uVig * smoothstep(0.15, 0.85, r2*2.2);
      if(uScan>0.) col *= 1.0 - uScan*0.5*(0.5+0.5*sin(gl_FragCoord.y*3.14159*0.5));
      col = clamp(col,0.,1.);
      col = toSRGB(col);
      col += (h(gl_FragCoord.xy + fract(uFrame*0.61803)*100.) - 0.5) * uGrain;
      float lb = uLetterbox * 0.5 * (1.0 - (uRes.x/uRes.y)/2.39);
      if (vUv.y < lb || vUv.y > 1.0-lb) col = vec3(0.);
      gl_FragColor = vec4(col*uFade, 1.0);
    }`,
};
const finalPass = new ShaderPass(FinalShader);
composer.addPass(finalPass);

// Neutral by default so footage is never altered. Projects override per video with `export const POST = {...}` in timeline.js
// (e.g. { grade:'warm', grain:0.045, vignette:0.35, ca:0.0015 } for an all-graphics amber-on-black piece); scenes override per frame.
const POST_DEFAULT = {
  bloom: 0.55,
  bloomRadius: 0.35,
  bloomThreshold: 1.05,
  exposure: 1.0,
  ca: 0,
  grain: 0,
  vignette: 0,
  flash: 0,
  flashCol: [1, 0.82, 0.55],
  invert: 0,
  punch: 0,
  shake: [0, 0],
  rot: 0,
  scan: 0,
  glitch: 0,
  letterbox: 0,
  sat: 1,
  tint: [1, 1, 1],
  fade: 1,
  grade: "neutral",
  invertCol: "#FFA010",
  ...(TL.POST ?? {}),
};

// ---- engine object passed to scenes
const HUD_DEFAULT = { alpha: 1, label: "", sub: true, corners: true };
const E = {
  THREE,
  core,
  renderer,
  W,
  H,
  SCALE,
  post: { ...POST_DEFAULT },
  hud: { ...HUD_DEFAULT },
  frame: 0,
  fps: 60,
  ...core,
  ...roto,
  ...typekit,
  ...plate,
  roto,
  typekit,
};
window.E = E;

async function boot() {
  const [A, L] = await Promise.all([
    fetch("/engine/data/audio.json").then((r) => r.json()),
    fetch("/engine/data/lyrics.json").then((r) => r.json()),
  ]);
  Object.assign(E, core.makeTimeline(A, L));
  E.dur = A.duration;
  await Promise.all([
    document.fonts.load("900 100px Archivo"),
    document.fonts.load('100px "Archivo Black"'),
    document.fonts.load("100px Anton"),
    document.fonts.load('400 100px "JetBrains Mono"'),
    document.fonts.load("900 100px Doto"),
    document.fonts.load('100px "Black Han Sans"'),
    document.fonts.load("900 100px Unbounded"),
    document.fonts.load('italic 100px "Instrument Serif"'),
    document.fonts.load('100px "Instrument Serif"'),
    document.fonts.load('600 100px "Geist"'),
    document.fonts.load('800 100px "Geist"'),
    document.fonts.load('500 100px "Geist Mono"'),
  ]);
  await document.fonts.ready;
  await Promise.all([
    core.loadFont3D("ArchivoBlack", "/assets/fonts/ArchivoBlack.ttf"),
    core.loadFont3D("Anton", "/assets/fonts/Anton.ttf"),
    core.loadFont3D("BlackHanSans", "/assets/fonts/BlackHanSans.ttf"),
  ]);
  // load scenes
  E.layers = [];
  for (const entry of TIMELINE) {
    if (ONLY && !ONLY.includes(entry.id)) continue;
    if (
      !ONLY &&
      entry.variant &&
      entry.variant !== (Q.get("variant") || Q.get("ending") || "a")
    )
      continue; // alternate versions of a section (e.g. endings): render with --variant b
    const mod = await import(
      `/engine/scenes/${entry.file ?? entry.id + ".js"}`
    );
    const scene = mod.default;
    const layer = { ...entry, scene, loaded: false };
    E.layers.push(layer);
  }
  await Promise.all(
    E.layers.map(async (l) => {
      if (l.scene.load) await l.scene.load(E, l);
      l.loaded = true;
    }),
  );
  window.__ready = true;
}
const bootP = boot().catch((e) => {
  console.error(e);
  window.__error = String(e.stack || e);
});

// Render global time t. Returns when the frame is on the canvas.
async function renderTime(t, frameIdx = Math.round(t * E.fps)) {
  await bootP;
  if (window.__error) throw new Error(window.__error);
  E.t = t;
  E.frame = frameIdx;
  E.post = JSON.parse(JSON.stringify(POST_DEFAULT));
  E.hud = { ...HUD_DEFAULT };
  const active = E.layers
    .filter((l) => t >= l.start && t < l.end)
    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  for (const l of active) if (l.scene.prepare) await l.scene.prepare(E, t, l);
  renderer.setRenderTarget(accum);
  renderer.setClearColor(0x000000, 1);
  renderer.clear(true, true, true);
  active.forEach((l, i) => {
    const rt = getLayerRT(i);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
    const op = l.scene.render(E, t, rt, l);
    renderer.setRenderTarget(rt);
    renderer.render(_emptyScene, _emptyCam); // force MSAA resolve even if the scene drew nothing
    const opacity = typeof op === "number" ? op : 1;
    blendFor(l.blend ?? "normal");
    compMat.uniforms.tex.value = rt.texture;
    compMat.uniforms.opacity.value = opacity;
    quad.render(renderer, accum, false);
  });
  const P = E.post,
    U = finalPass.uniforms;
  bloom.strength = P.bloom;
  bloom.radius = P.bloomRadius;
  bloom.threshold = P.bloomThreshold;
  U.uFrame.value = frameIdx;
  U.uExposure.value = P.exposure;
  U.uCA.value = P.ca;
  U.uGrain.value = P.grain;
  U.uVig.value = P.vignette;
  U.uFlash.value = P.flash < 0.02 ? 0 : P.flash;
  U.uFlashCol.value.setRGB(...P.flashCol);
  U.uInvert.value = P.invert;
  U.uPunch.value = P.punch;
  U.uShake.value.set(...P.shake);
  U.uWarm.value = P.grade === "warm" ? 1 : 0;
  U.uAmber.value.set(P.invertCol);
  U.uRot.value = P.rot;
  U.uScan.value = P.scan;
  U.uGlitch.value = P.glitch;
  U.uLetterbox.value = P.letterbox;
  U.uSat.value = P.sat;
  U.uTint.value.set(...P.tint);
  U.uFade.value = P.fade;
  renderer.setRenderTarget(null);
  composer.render();
  return true;
}
window.renderFrame = (frameIdx, fps = 60) => {
  E.fps = fps;
  return renderTime(frameIdx / fps, frameIdx);
};
window.renderTime = (t) => renderTime(t);
window.grab = async (type = "image/jpeg", q = 0.93) => {
  const b = await new Promise((r) => canvas.toBlob(r, type, q));
  return new Uint8Array(await b.arrayBuffer());
};

// Interactive preview: ?t=12.3 renders a still; ?play=1 plays in realtime (no audio sync guarantees)
if (Q.get("t")) bootP.then(() => renderTime(parseFloat(Q.get("t"))));
if (Q.get("play"))
  bootP.then(() => {
    const t0 = parseFloat(Q.get("play"));
    const s = performance.now();
    const loop = async () => {
      await renderTime(t0 + (performance.now() - s) / 1000);
      requestAnimationFrame(loop);
    };
    loop();
  });
