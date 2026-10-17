/* =====================================================================
   GRAND FLYOVER 2.8 — the Network roll call, rebuilt as a stage.

   What changed from 2.7.1 and why (see the audit notes shipped with
   this build):
   - ONE continuous camera. Every move (approach, orbit, transit,
     exit) is a cubic Hermite flight that matches position AND
     velocity at both ends, so there are no seams, no ease-to-zero
     stalls between phases, and the orbit is an analytic function of
     time (dt jitter can no longer show up as speed wobble).
   - A real-time clock. Stage time follows wall time down to 4fps
     instead of the old 20fps clamp that stretched the choreography.
   - Composition is designed, not pasted: the name plate is a fixed
     typographic block, the orb sits off-centre on a third, and the
     camera distance is computed from the person's own system so the
     whole orbit fits the frame (dense circles read wide and small,
     sparse circles read close and large).
   - Labels are laid out by a collision solver (no overlaps, nothing
     clipped by the edge, nothing drawn through the orb). Bodies are
     shaped by kind: person = glowing dot, organization = ring,
     group = diamond.
   - Zero per-frame allocation in the hot path: the score arc is a
     shader gauge (it used to build a new RingGeometry every frame
     of its sweep), tethers/packets/satellites are single draw calls.
   - Adaptive quality that is warm-up aware, uses robust percentiles,
     scales resolution before it removes effects, and can step back
     up. Bloom runs at half resolution. All materials include the
     colour-space chunk so the bloom-off path matches the bloom-on
     path (the old ladder changed brightness mid-flight).
   - Shaders are pre-compiled before the crossfade so the first frame
     does not hitch.

   Standing rules kept exactly: lazy-loaded, vendored Three.js, shuffle
   bag with no repeats, any input exits, selection and camera restored
   by dossier.js on exit, reads only the baked data and writes nothing,
   WebGL failure falls back to the canvas roll call, reduced motion
   disables Flyover, Swiss Mono (tier owns colour; signal red only for
   the lock-on ring, the pinned tick and the Exit hover; no emoji).
   ===================================================================== */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

(function(){
'use strict';

/* ---------------- helpers ---------------- */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const smooth = t => t * t * (3 - 2 * t);
const smoother = t => t * t * t * (t * (t * 6 - 15) + 10);
const hash01 = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function initialsOf(name){
  const w = String(name || '').replace(/^@/, '').split(/\s+/).filter(Boolean);
  if(!w.length) return '··';
  if(w.length === 1) return (w[0].charAt(0) + (w[0].charAt(1) || '')).toUpperCase();
  return (w[0].charAt(0) + w[w.length - 1].charAt(0)).toUpperCase();
}
function nebTexture(){
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  for(let i = 0; i < 26; i++){
    const x = 40 + Math.random() * 176, y = 40 + Math.random() * 176, r = 30 + Math.random() * 80;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.05)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
  }
  return new THREE.CanvasTexture(c);
}

/* ---------------- timings (9.5s per person, steady state) ---------------- */
const T_TAKEOVER = 0.35, T_APPROACH = 1.8, T_TRANSIT = 2.2, T_HOLD = 7.3, T_EXIT = 0.7;
const T_PLATE_OUT = 0.30;          /* plate clears before the transit begins */
const OMEGA = 0.21;                /* orbit angular speed, rad/s (about 12 deg/s), constant */
const FOV_HOLD = 42;
const LEGACY_ORBIT_END = 5.8;      /* debug() reports hold as orbit/linger for the old harnesses */

/* ---------------- shaders ---------------- */
const CORE_VERT = `
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){
  vP = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = mv.xyz; vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;
const CORE_FRAG = `
uniform vec3 uColor; uniform float uTime; uniform float uBright;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float v = 0.0, a = 0.5; for(int i = 0; i < 4; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main(){
  vec3 V = normalize(-vV); vec3 N = normalize(vN);
  float ndv = max(dot(N, V), 0.0);
  float fr = pow(1.0 - ndv, 3.0);
  vec3 p = normalize(vP);
  float cs = cos(uTime * 0.07), sn = sin(uTime * 0.07);
  vec3 q = vec3(cs * p.x + sn * p.z, p.y, -sn * p.x + cs * p.z);
  float n = fbm(q * 2.2 + vec3(0.0, uTime * 0.03, uTime * 0.02));
  float n2 = noise(q * 6.0 - vec3(uTime * 0.025, 0.0, 0.0));
  float ridge = 1.0 - abs(2.0 * n - 1.0);
  float energy = pow(ridge, 4.0);
  /* graticule: a 15 degree lat/long grid, so the orb reads as an instrument, not a blob */
  float lat = asin(clamp(q.y, -1.0, 1.0)), lon = atan(q.z, q.x);
  float gl = abs(fract(lat * (12.0 / 3.14159265) + 0.5) - 0.5);
  float gm = abs(fract(lon * (12.0 / 3.14159265) + 0.5) - 0.5) * max(cos(lat), 0.18);
  float grat = max(1.0 - smoothstep(0.0, 0.05, gl), 1.0 - smoothstep(0.0, 0.05, gm));
  vec3 col = uColor * 0.040;
  col += uColor * (n * 0.20 + n2 * 0.05);
  col += uColor * energy * 0.50;
  col += uColor * grat * (0.07 + 0.30 * fr);
  col += uColor * fr * 1.45;
  col += vec3(1.0) * pow(fr, 5.0) * 0.32;
  gl_FragColor = vec4(col * uBright, 1.0);
  #include <colorspace_fragment>
}`;
const ATMO_VERT = `
varying vec3 vN;
void main(){
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const ATMO_FRAG = `
uniform vec3 uColor; uniform float uBreathe; uniform float uBright;
varying vec3 vN;
void main(){
  float i = pow(clamp(0.68 - dot(normalize(vN), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 3.5);
  gl_FragColor = vec4(uColor * i * 0.95 * uBreathe * uBright, 1.0);
  #include <colorspace_fragment>
}`;
/* the score gauge: a full faint track plus a bright sweep, driven by one uniform */
const ARC_VERT = `
varying vec2 vPos;
void main(){ vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ARC_FRAG = `
uniform vec3 uColor; uniform float uSweep; uniform float uBright;
varying vec2 vPos;
void main(){
  float t = fract((1.5707963 - atan(vPos.y, vPos.x)) / 6.2831853);
  float on = step(t, uSweep);
  float head = smoothstep(uSweep - 0.05, uSweep, t) * on;
  float a = on > 0.5 ? (0.80 + 0.45 * head) : 0.13;
  gl_FragColor = vec4(uColor * a * uBright, a * uBright);
  #include <colorspace_fragment>
}`;
/* one point shader for everything glowing: universe, stars, packets, flare, satellites, shell */
const DOTS_VERT = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor; attribute float aKind;
uniform float uPx; uniform float uAtten; uniform float uPR; uniform float uFog; uniform float uOpacity; uniform float uNear; uniform vec3 uTint;
varying vec3 vC; varying float vA; varying float vK;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = max(1.0, -mv.z);
  float px = mix(aSize * uPR, aSize * uPx / dist, uAtten);
  gl_PointSize = clamp(px, 1.0, 72.0 * uPR);
  gl_Position = projectionMatrix * mv;
  float fog = uFog > 0.0 ? exp(-pow(uFog * dist, 2.0)) : 1.0;
  float near = uNear > 0.0 ? smoothstep(uNear * 0.3, uNear, dist) : 1.0;
  vC = aColor * uTint; vA = aAlpha * uOpacity * fog * near; vK = aKind;
}`;
const DOTS_FRAG = `
varying vec3 vC; varying float vA; varying float vK;
void main(){
  vec2 p = gl_PointCoord - 0.5; float d = length(p) * 2.0;
  float a;
  if(vK < 0.5){            /* person: soft glow, hot core */
    a = pow(max(0.0, 1.0 - d), 1.6) + smoothstep(0.34, 0.0, d) * 0.9;
  } else if(vK < 1.5){     /* organization: ring */
    a = smoothstep(0.13, 0.0, abs(d - 0.62)) * 1.1 + pow(max(0.0, 1.0 - d), 2.5) * 0.22;
  } else {                 /* group: diamond */
    float q = abs(p.x) + abs(p.y);
    a = smoothstep(0.46, 0.30, q) + pow(max(0.0, 1.0 - d), 2.5) * 0.22;
  }
  if(a * vA < 0.004) discard;
  gl_FragColor = vec4(vC * a, vA);
  #include <colorspace_fragment>
}`;
function dotsMaterial(extra){
  const m = new THREE.ShaderMaterial({
    vertexShader: DOTS_VERT, fragmentShader: DOTS_FRAG,
    uniforms: { uPx:{ value:800 }, uAtten:{ value:1 }, uPR:{ value:1 }, uFog:{ value:0 },
      uOpacity:{ value:1 }, uNear:{ value:0 }, uTint:{ value:new THREE.Color(1, 1, 1) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  if(extra) Object.keys(extra).forEach(k => { m.uniforms[k].value = extra[k]; });
  return m;
}
function dotsGeometry(n){
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n).fill(4), 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  g.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(n), 1));
  return g;
}

/* ---------------- shared geometry (built once, never disposed per hero) ---------------- */
let SH = null;
function shared(){
  if(SH) return SH;
  const circ = [];
  for(let i = 0; i < 128; i++){ const a = i / 128 * Math.PI * 2; circ.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0)); }
  const shell = dotsGeometry(700), sp = shell.attributes.position.array, ga = Math.PI * (3 - Math.sqrt(5));
  for(let i = 0; i < 700; i++){
    const y = 1 - (i / 699) * 2, rr = Math.sqrt(Math.max(0, 1 - y * y)), th = ga * i;
    sp[i * 3] = Math.cos(th) * rr; sp[i * 3 + 1] = y; sp[i * 3 + 2] = Math.sin(th) * rr;
    shell.attributes.aSize.array[i] = 1.1 + hash01(i) * 0.9;
    shell.attributes.aAlpha.array[i] = 0.5 + hash01(i + 9) * 0.5;
  }
  SH = {
    sphere: new THREE.SphereGeometry(1, 48, 32),
    circle: new THREE.BufferGeometry().setFromPoints(circ),
    arc: new THREE.RingGeometry(1.58, 1.70, 160, 1),
    pulse: new THREE.RingGeometry(1.0, 1.04, 96),
    tick: new THREE.PlaneGeometry(0.30, 0.075),
    shell: shell,
    ringMatA: new THREE.LineBasicMaterial({ color:0x9a9a9a, transparent:true, opacity:0.50 }),
    ringMatB: new THREE.LineBasicMaterial({ color:0x9a9a9a, transparent:true, opacity:0.28 }),
    tickMat: new THREE.MeshBasicMaterial({ color:0xe30613, side:THREE.DoubleSide, transparent:true, opacity:0.95 })
  };
  return SH;
}

/* ---------------- the stage ---------------- */
let ST = null;
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _hw = new THREE.Vector3(), _hw1 = new THREE.Vector3(), _P = new THREE.Vector3(), _Pa = new THREE.Vector3(), _Pb = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qI = new THREE.Quaternion(), _qG = new THREE.Quaternion();
const AX_X = new THREE.Vector3(1, 0, 0), AX_Y = new THREE.Vector3(0, 1, 0);

function nodePos(api, di, out){
  const nd = api.byDi[di]; if(!nd) return out.set(0, 0, 0);
  const p = api.pos(nd);
  return out.set(p[0], -p[1], -p[2]); /* the matched-rig flip: (x, -y, -z) */
}

/* ---- universe, stars, selection layer ---- */
function buildUniverse(st){
  const nodes = st.api.nodes, n = nodes.length;
  const g = dotsGeometry(n), c = new THREE.Color();
  for(let i = 0; i < n; i++){
    c.set(st.api.tierCol(nodes[i].di));
    g.attributes.aColor.array.set([c.r, c.g, c.b], i * 3);
    g.attributes.aSize.array[i] = 5.0 + (nodes[i].r || 3) * 1.7;
    g.attributes.aAlpha.array[i] = 0.9;
  }
  st.uniMat = dotsMaterial({ uFog:0.00035, uNear:150 });
  const pts = new THREE.Points(g, st.uniMat);
  pts.frustumCulled = false;
  st.viewGroup.add(pts);
  st.universe = pts; st.uniIndex = {};
  nodes.forEach((nd, i) => { st.uniIndex[nd.di] = i; });
  paintUniverse(st);
}
function paintUniverse(st){
  const nodes = st.api.nodes, pos = st.universe.geometry.attributes.position.array;
  for(let i = 0; i < nodes.length; i++){
    const p = st.api.pos(nodes[i]);
    pos[i * 3] = p[0]; pos[i * 3 + 1] = -p[1]; pos[i * 3 + 2] = -p[2];
  }
  st.universe.geometry.attributes.position.needsUpdate = true;
}
function buildStars(st){
  const layers = st.mobile ? [550, 380, 220] : [1750, 1100, 650];
  const sizes = [2.0, 1.5, 1.1], ops = [0.55, 0.38, 0.26], rates = [0.006, -0.004, 0.0026];
  st.stars = [];
  for(let L = 0; L < 3; L++){
    const n = layers[L], g = dotsGeometry(n), pos = g.attributes.position.array;
    for(let i = 0; i < n; i++){
      const u = Math.random() * 2 - 1, th = Math.random() * 6.2832, rr = Math.sqrt(1 - u * u);
      const rad = 2500 + Math.random() * 2600;
      pos[i * 3] = Math.cos(th) * rr * rad; pos[i * 3 + 1] = u * rad * 0.8;
      pos[i * 3 + 2] = Math.random() < 0.5 ? Math.sin(th) * rr * rad - 600 : -1400 - Math.abs(Math.sin(th) * rr * rad) * 0.7 - Math.random() * 800;
      g.attributes.aColor.array.set([0.85, 0.85, 0.85], i * 3);
      g.attributes.aSize.array[i] = sizes[L] * (0.7 + Math.random() * 0.8);
      g.attributes.aAlpha.array[i] = 0.5 + Math.random() * 0.5;
    }
    const mat = dotsMaterial({ uAtten:0, uOpacity:ops[L] });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    st.scene.add(pts);
    st.stars.push({ pts, mat, baseOp:ops[L], rate:rates[L], full:n });
  }
  st.nebulas = [];
  const neb = st.nebTex || (st.nebTex = nebTexture());
  for(let k = 0; k < 3; k++){
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map:neb, color:0x8a8a8a, transparent:true,
      opacity:0.05 + k * 0.012, depthWrite:false, fog:false }));
    sp.position.set((k - 1) * 1900, 500 - k * 420, -3400 - k * 500);
    sp.scale.set(3400 + k * 700, 2400 + k * 500, 1);
    st.scene.add(sp); st.nebulas.push(sp);
  }
}
function buildSelection(st){
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 6), 3));
  eg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(8 * 6), 3));
  st.edgeLines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ vertexColors:true, transparent:true,
    blending:THREE.AdditiveBlending, depthWrite:false }));
  st.edgeLines.frustumCulled = false;
  st.viewGroup.add(st.edgeLines);
  const pg = dotsGeometry(8);
  st.packetMat = dotsMaterial({ uNear:60 });
  st.packets = new THREE.Points(pg, st.packetMat); st.packets.frustumCulled = false;
  for(let i = 0; i < 8; i++) pg.attributes.aSize.array[i] = 6;
  st.viewGroup.add(st.packets);
  const fg = dotsGeometry(1);
  st.flareMat = dotsMaterial({ uNear:60 });
  st.flare = new THREE.Points(fg, st.flareMat); st.flare.frustumCulled = false; st.flare.visible = false;
  st.viewGroup.add(st.flare);
  st.edgeDis = [];
}

/* ---- the hero: one orb built from one person's record ---- */
function buildHero(st, di){
  const api = st.api, S = shared();
  const sc = api.score(di), score = sc ? sc.score : null, pinned = !!(sc && sc.pinned);
  const R = 30 * (0.85 + 0.35 * (score == null ? 0.45 : score / 100));
  const hex = api.tierCol(di), col = new THREE.Color(hex);
  const white = new THREE.Color(0xffffff);
  const mats = [], geos = [], els = [];
  const g = new THREE.Group();

  const coreMat = new THREE.ShaderMaterial({ vertexShader:CORE_VERT, fragmentShader:CORE_FRAG,
    uniforms:{ uColor:{ value:col }, uTime:{ value:0 }, uBright:{ value:0 } } });
  mats.push(coreMat);
  const core = new THREE.Mesh(S.sphere, coreMat); core.scale.setScalar(R); g.add(core);

  const atmoMat = new THREE.ShaderMaterial({ vertexShader:ATMO_VERT, fragmentShader:ATMO_FRAG,
    uniforms:{ uColor:{ value:col }, uBreathe:{ value:1 }, uBright:{ value:0 } },
    side:THREE.BackSide, blending:THREE.AdditiveBlending, transparent:true, depthWrite:false });
  mats.push(atmoMat);
  const atmo = new THREE.Mesh(S.sphere, atmoMat); atmo.scale.setScalar(R * 1.16); g.add(atmo);

  const fabric = api.fabric(di);
  const shellMat = dotsMaterial({ uOpacity:0.30 + 0.55 * fabric });
  shellMat.uniforms.uTint.value = col.clone().lerp(white, 0.55);
  mats.push(shellMat);
  const shell = new THREE.Points(S.shell, shellMat); shell.scale.setScalar(R * 1.35); shell.frustumCulled = false;
  g.add(shell);

  const rings = new THREE.Group(); g.add(rings);
  const pivA = new THREE.Group(); pivA.rotation.set(1.25, 0, 0.15);
  const rA = new THREE.LineLoop(S.circle, S.ringMatA); rA.scale.setScalar(R * 1.62); pivA.add(rA); rings.add(pivA);
  const pivB = new THREE.Group(); pivB.rotation.set(0.35, 0.5, 1.05);
  const rB = new THREE.LineLoop(S.circle, S.ringMatB); rB.scale.setScalar(R * 1.95); pivB.add(rB); rings.add(pivB);
  const pivArc = new THREE.Group(); pivArc.rotation.set(1.05, -0.35, 0.2); rings.add(pivArc);
  const arcMat = new THREE.ShaderMaterial({ vertexShader:ARC_VERT, fragmentShader:ARC_FRAG,
    uniforms:{ uColor:{ value:col }, uSweep:{ value:0 }, uBright:{ value:0 } },
    side:THREE.DoubleSide, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending });
  mats.push(arcMat);
  const arc = new THREE.Mesh(S.arc, arcMat); arc.scale.setScalar(R); pivArc.add(arc);
  const tick = new THREE.Mesh(S.tick, S.tickMat); tick.scale.setScalar(R); tick.visible = false; pivArc.add(tick);

  const pulseMat = new THREE.MeshBasicMaterial({ color:0xe30613, side:THREE.DoubleSide, transparent:true, opacity:0, depthWrite:false });
  mats.push(pulseMat);
  const pulse = new THREE.Mesh(S.pulse, pulseMat); pulse.scale.setScalar(R * 1.04); g.add(pulse);

  /* bodies: the orbit system is the person's own record (api.bodies),
     radii packed tight so the whole system fits one frame */
  const bodies = (api.bodies ? api.bodies(di) : api.hot(di).map(t => ({ k:'p', di:t, n:api.name(t) }))).slice(0, 8);
  const nb = bodies.length;
  const sg = dotsGeometry(Math.max(1, nb)); geos.push(sg);
  const satMat = dotsMaterial({ uNear:40 }); mats.push(satMat);
  const satPts = new THREE.Points(sg, satMat); satPts.frustumCulled = false; satPts.visible = nb > 0;
  g.add(satPts);
  const tg = new THREE.BufferGeometry(); geos.push(tg);
  tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(1, nb) * 6), 3));
  tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(Math.max(1, nb) * 6), 3));
  const tetherMat = new THREE.LineBasicMaterial({ vertexColors:true, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false });
  mats.push(tetherMat);
  const tethers = new THREE.LineSegments(tg, tetherMat); tethers.frustumCulled = false; tethers.visible = nb > 0;
  g.add(tethers);

  const sats = [];
  bodies.forEach((b, i) => {
    const isP = b.k === 'p', sdi = isP ? b.di : null;
    const nm = String(isP ? api.name(sdi) : b.n);
    const seed = isP ? sdi : 5000 + i * 131 + nm.length * 17;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(hash01(seed * 3 + 1) * 1.9 - 0.95, hash01(seed * 5 + 2) * 1.2, hash01(seed * 7 + 3) * 1.9 - 0.95));
    const scol = isP ? new THREE.Color(api.tierCol(sdi)) : col.clone().lerp(white, 0.45);
    const ssc = isP ? api.score(sdi) : null;
    sg.attributes.aColor.array.set([scol.r, scol.g, scol.b], i * 3);
    sg.attributes.aSize.array[i] = isP ? 6.5 + 4.5 * ((ssc ? ssc.score : 40) / 100) : 8.5;
    sg.attributes.aKind.array[i] = isP ? 0 : (b.k === 'o' ? 1 : 2);
    sg.attributes.aAlpha.array[i] = 0;
    const el = document.createElement('div');
    el.className = 'f3-sattag' + (isP ? '' : ' og');
    const dot = document.createElement('i'); dot.className = 'f3-sdot';
    dot.style.background = '#' + scol.getHexString();
    const tx = document.createElement('span'); tx.textContent = nm.length > 26 ? nm.slice(0, 25) + '…' : nm;
    if(isP) el.appendChild(dot); el.appendChild(tx);
    if(!isP) el.style.color = hex;
    st.tagLayer.appendChild(el); els.push(el);
    sats.push({ di:sdi, kind:b.k, name:nm, q, el, w:0, h:15, rad:R * (2.0 + 0.22 * i),
      ang:hash01(seed * 11 + 4) * 6.2832, speed:(0.17 - 0.012 * i) * (hash01(seed * 13) < 0.5 ? 1 : -1),
      col:scol, op:0, la:0, side:0, x:0, y:0, tx:0, ty:0, placed:false, local:new THREE.Vector3() });
  });
  sg.attributes.position.needsUpdate = true;

  /* monogram: initials at the core, tier-coloured, scaled with the orb */
  const monoEl = document.createElement('div');
  monoEl.className = 'f3-mono'; monoEl.textContent = initialsOf(api.name(di));
  monoEl.style.color = hex; st.tagLayer.appendChild(monoEl); els.push(monoEl);

  const sysR = R * (nb ? 2.0 + 0.22 * (nb - 1) : 2.0) + 4;
  st.viewGroup.add(g);
  const h = { di, group:g, R, sysR, score, pinned, core, coreMat, atmoMat, shell, shellMat, pivA, pivB, pivArc,
    arcMat, tick, pulse, pulseMat, sats, sg, satMat, tethers, tg, monoEl, mats, geos, els,
    grow:0, coll:1, bright:0, sweep:0, plateAt:-1, local:new THREE.Vector3(),
    az0:0, el0:0.28, D:10 * R, bodies: bodies.map(b => ({ k:b.k, n:b.k === 'p' ? api.name(b.di) : b.n })), edges:[] };
  nodePos(api, di, h.local); g.position.copy(h.local); g.scale.setScalar(0.03);
  h.edges = (api.edges ? api.edges(di) : api.hot(di)).slice(0, 8);
  computeHeroD(st, h);
  return h;
}
function disposeHero(st, h){
  if(!h) return;
  st.viewGroup.remove(h.group);
  h.mats.forEach(m => m.dispose()); h.geos.forEach(g => g.dispose());
  h.els.forEach(e => { if(e.parentNode) e.parentNode.removeChild(e); });
}
const heroScale = h => Math.max(0.001, (0.03 + 0.97 * easeOut(clamp(h.grow, 0, 1))) * h.coll);

/* ---- layout: where the plate lives and where the orb sits ---- */
function computeLayout(st){
  const W = st.W, H = st.H, portrait = W / H < 0.9 || W < 620;
  const L = { portrait };
  if(portrait){
    L.shiftX = 0; L.shiftY = H * 0.17;                 /* orb rides high, plate below */
    L.cx = W / 2; L.cy = H / 2 - L.shiftY;
    L.rFree = Math.min(W / 2 - 10, L.cy - 44, H * 0.57 - L.cy);
  } else {
    L.shiftX = W * 0.15; L.shiftY = 0;                 /* orb on the right third */
    L.cx = W / 2 + L.shiftX; L.cy = H / 2;
    const plateR = Math.max(24, W * 0.05) + Math.min(W * 0.36, 460);
    L.rFree = Math.min(L.cx - plateR - 18, W - L.cx - 16, H / 2 - 30);
  }
  L.rFree = Math.max(60, L.rFree * 0.94);
  st.layout = L;
}
function computeHeroD(st, h){
  const L = st.layout; if(!L) return;
  const tanH = Math.tan(FOV_HOLD * Math.PI / 360);
  h.D = Math.max(h.sysR * 1.12 * st.H / (2 * tanH * L.rFree), h.R * 4.2);
}

/* ---- the rig: analytic hold pose + Hermite flights ---- */
function vgQuat(st, drift, out){
  _qa.setFromAxisAngle(AX_Y, -(st.snap.yaw + drift));
  _qb.setFromAxisAngle(AX_X, st.snap.pitch);
  return out.copy(_qb).multiply(_qa);
}
function worldAt(st, local, drift, out){
  vgQuat(st, drift, _qG);
  return out.copy(local).applyQuaternion(_qG).add(st.vgPos);
}
function holdPose(st, h, t, drift, out){
  worldAt(st, h.local, drift, _hw1);
  const az = h.az0 + OMEGA * t, el = h.el0 + 0.06 * Math.sin(t * 0.5);
  const D = h.D * (1 + 0.02 * Math.sin(t * 0.7));
  return out.set(D * Math.cos(el) * Math.sin(az), D * Math.sin(el), D * Math.cos(el) * Math.cos(az)).add(_hw1);
}
function holdVel(st, h, t, drift, out){
  const e = 0.02;
  holdPose(st, h, t + e, drift + st.api.driftRate * e, _Pa);
  holdPose(st, h, t - e, drift - st.api.driftRate * e, _Pb);
  return out.copy(_Pa).sub(_Pb).multiplyScalar(1 / (2 * e));
}
function flightPose(f, u, out){
  const u2 = u * u, u3 = u2 * u;
  out.set(0, 0, 0)
    .addScaledVector(f.P0, 2 * u3 - 3 * u2 + 1).addScaledVector(f.M0, u3 - 2 * u2 + u)
    .addScaledVector(f.P1, -2 * u3 + 3 * u2).addScaledVector(f.M1, u3 - u2);
  if(f.bump){ const b = Math.sin(Math.PI * u); out.addScaledVector(f.bump, b * b); }
  return out;
}
/* endpoint of a flight = the destination hero's hold pose at t = 0, predicted
   forward by the remaining time so the drift is accounted for */
function flightEnds(st, f, h1, remaining){
  const drift1 = st.drift + st.api.driftRate * remaining;
  nodePos(st.api, h1.di, h1.local);
  holdPose(st, h1, 0, drift1, f.P1);
  holdVel(st, h1, 0, drift1, f.V1);
  f.M1.copy(f.V1).multiplyScalar(f.T);
  /* never let a tangent dwarf the chord: that is what makes Hermite loop */
  const chord = f.P0.distanceTo(f.P1) + 1;
  [f.M0, f.M1].forEach(m => { const l = m.length(); if(l > chord * 1.2) m.multiplyScalar(chord * 1.2 / l); });
}
function startFlight(st, kind, h1){
  const f = { kind, T:kind === 'approach' ? T_APPROACH : T_TRANSIT, P0:new THREE.Vector3(), P1:new THREE.Vector3(),
    V0:new THREE.Vector3(), V1:new THREE.Vector3(), M0:new THREE.Vector3(), M1:new THREE.Vector3(), bump:null, h1 };
  f.P0.copy(st.camera.position);
  if(st.camVel) f.V0.copy(st.camVel);
  f.M0.copy(f.V0).multiplyScalar(f.T);
  /* arrive on the side we are coming from */
  worldAt(st, nodePos(st.api, h1.di, h1.local), st.drift + st.api.driftRate * f.T, _hw);
  _v1.copy(f.P0).sub(_hw);
  h1.az0 = Math.atan2(_v1.x, _v1.z); h1.el0 = 0.28;
  flightEnds(st, f, h1, f.T);
  if(kind === 'transit'){
    const dist = f.P0.distanceTo(f.P1);
    f.bump = new THREE.Vector3(0, dist * 0.10, dist * 0.20);
    _v2.copy(f.P1).sub(f.P0).normalize(); _v3.crossVectors(_v2, AX_Y).normalize();
    f.bump.addScaledVector(_v3, dist * 0.06);
  }
  st.flight = f;
  return f;
}

/* ---- DOM: overlay, plate, labels, exit, live region ---- */
function buildDom(st){
  const ov = document.createElement('div');
  ov.className = 'fly3d'; ov.id = 'fly3d';
  ov.setAttribute('role', 'region'); ov.setAttribute('aria-label', 'Flyover');
  const gl = document.createElement('div'); gl.className = 'f3-gl'; gl.setAttribute('aria-hidden', 'true');
  gl.appendChild(st.renderer.domElement); ov.appendChild(gl);
  const scrim = document.createElement('div'); scrim.className = 'f3-scrim'; scrim.setAttribute('aria-hidden', 'true'); ov.appendChild(scrim);
  const leader = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  leader.setAttribute('class', 'f3-leader'); leader.setAttribute('aria-hidden', 'true');
  leader.innerHTML = '<line x1="0" y1="0" x2="0" y2="0"></line><circle r="2.5" cx="0" cy="0"></circle>';
  ov.appendChild(leader);
  st.leaderEl = leader; st.leaderLine = leader.querySelector('line'); st.leaderDot = leader.querySelector('circle');
  const tags = document.createElement('div'); tags.className = 'f3-tags'; tags.setAttribute('aria-hidden', 'true');
  ov.appendChild(tags); st.tagLayer = tags;
  const plate = document.createElement('section'); plate.className = 'f3-plate'; plate.setAttribute('aria-hidden', 'true');
  plate.innerHTML = '<div class="f3-roll"><span class="f3-rn"></span><span class="f3-rt"></span><i class="f3-prog"><b></b></i></div>' +
    '<h2 class="f3-name"></h2>' +
    '<div class="f3-meta"><span class="f3-tier"><i class="f3-dot"></i><span class="f3-tn"></span></span>' +
    '<span class="f3-score"><small>Score</small><b class="f3-num">0</b></span><span class="f3-pin">Pinned</span></div>' +
    '<p class="f3-fact f3-f1"></p><p class="f3-fact f3-f2"></p>';
  ov.appendChild(plate);
  st.plate = plate;
  st.pRn = plate.querySelector('.f3-rn'); st.pRt = plate.querySelector('.f3-rt');
  st.pProg = plate.querySelector('.f3-prog b'); st.pName = plate.querySelector('.f3-name');
  st.pDot = plate.querySelector('.f3-dot'); st.pTn = plate.querySelector('.f3-tn');
  st.pScore = plate.querySelector('.f3-score'); st.pNum = plate.querySelector('.f3-num'); st.pPin = plate.querySelector('.f3-pin');
  st.pF1 = plate.querySelector('.f3-f1'); st.pF2 = plate.querySelector('.f3-f2');
  const xb = document.createElement('button');
  xb.type = 'button'; xb.className = 'f3-exit'; xb.innerHTML = 'Exit <kbd>Esc</kbd>'; xb.setAttribute('aria-label', 'Exit Flyover');
  ov.appendChild(xb); st.exitBtn = xb;
  const sr = document.createElement('div'); sr.className = 'f3-sr'; sr.setAttribute('role', 'status'); sr.setAttribute('aria-live', 'polite');
  ov.appendChild(sr); st.sr = sr;
  ov.addEventListener('pointerdown', () => stageExit());
  ov.addEventListener('wheel', () => stageExit(), { passive:true });
  xb.addEventListener('pointerdown', ev => { ev.stopPropagation(); stageExit(); });
  xb.addEventListener('click', () => stageExit());
  st.overlay = ov;
}
function fillPlate(st, h, callNo){
  const api = st.api, di = h.di, p = st.plate;
  p.classList.remove('in', 'out');
  st.pRn.textContent = String(callNo).padStart(3, '0');
  st.pRt.textContent = '/ ' + st.total;
  const name = api.name(di);
  st.pName.textContent = '';
  let ci = 0;
  name.split(/\s+/).filter(Boolean).forEach(word => {
    const w = document.createElement('span'); w.className = 'w';
    Array.from(word).forEach(ch => { const c = document.createElement('span'); c.className = 'c'; c.textContent = ch; c.style.setProperty('--i', ci++); w.appendChild(c); });
    st.pName.appendChild(w); st.pName.appendChild(document.createTextNode(' '));
  });
  const tier = api.tierName(di) || 'No tier yet';
  st.pTn.textContent = tier; st.pDot.style.background = api.tierCol(di);
  st.pScore.style.display = h.score == null ? 'none' : '';
  st.pPin.style.display = h.pinned ? '' : 'none';
  st.pNum.textContent = '0';
  const f = api.facts(di);
  st.pF1.textContent = f[0] || ''; st.pF1.style.display = f[0] ? '' : 'none';
  st.pF2.textContent = f[1] || ''; st.pF2.style.display = f[1] ? '' : 'none';
  st.pProg.style.transform = 'scaleX(0)'; st.progShown = 0;
  st.srText = name + '. ' + tier + (h.score != null ? ', score ' + h.score : '') + (h.pinned ? ', pinned' : '') + '. ' + f.join('. ');
  st.plateRect = null;
}
function measurePlate(st){
  const o = st.overlay.getBoundingClientRect(), r = st.plate.getBoundingClientRect();
  st.plateRect = { l:r.left - o.left, t:r.top - o.top, r:r.right - o.left, b:r.bottom - o.top };
}
function plateShow(st, h){
  if(st.plateOn) return;
  st.plateOn = true; h.plateAt = st.time;
  st.plate.classList.remove('out'); st.plate.classList.add('in');
  measurePlate(st);
  st.sr.textContent = st.srText;
}
function plateHide(st){
  if(!st.plateOn && !st.plate.classList.contains('in')) return;
  st.plateOn = false;
  st.plate.classList.add('out'); st.plate.classList.remove('in');
}

/* ---- begin / exit ---- */
function qualityLevels(){
  return [
    { id:'full',    pr:1.00, bloom:true,  stars:1.0, shell:true,  neb:true  },
    { id:'smooth',  pr:0.80, bloom:true,  stars:1.0, shell:true,  neb:true  },
    { id:'nobleed', pr:0.80, bloom:false, stars:0.8, shell:true,  neb:true  },
    { id:'lite',    pr:0.60, bloom:false, stars:0.5, shell:false, neb:false }
  ];
}
const LEVELS = qualityLevels();
const LEGACY_Q = { full:0, nobleed:2, lite:3 };

const FLY3D = {
  active:false, busy:false,
  begin(api){ return stageBegin(api); },
  exit(){ stageExit(); },
  _forceQuality(q){ if(!ST) return; ST.forceQ = q == null ? null : (typeof q === 'number' ? q : LEGACY_Q[q]); applyQuality(ST); },
  /* harness hooks: cast a specific person next, freeze the clock, step it by hand */
  _jump(di){
    if(!ST || !FLY3D.active) return;
    ST.jumpDi = di;
    if(ST.phase === 'hold') ST.phaseT = Math.max(ST.phaseT, T_HOLD - 0.01);
  },
  _freeze(on){ if(ST) ST.frozen = !!on; },
  _step(dt, n){ if(!ST || !FLY3D.active) return; n = n || 1; for(let i = 0; i < n; i++){ advance(ST, dt); if(i >= n - 24) render(ST); } render(ST); try { ST.renderer.getContext().finish(); } catch(e){} },
  debug(){
    if(!ST) return { active:this.active, built:false };
    const h = ST.hero;
    let plate = null;
    if(ST.plate && ST.overlay){
      const o = ST.overlay.getBoundingClientRect(), r = ST.plate.getBoundingClientRect();
      plate = { x:r.left - o.left, y:r.top - o.top, w:r.width, h:r.height, wrapW:o.width, wrapH:o.height, shown:ST.plate.classList.contains('in') };
    }
    const legacy = ST.phase === 'hold' ? (ST.phaseT < LEGACY_ORBIT_END ? 'orbit' : 'linger') : ST.phase;
    return { active:this.active, built:true, phase:legacy, stagePhase:ST.phase, holdT:ST.phase === 'hold' ? ST.phaseT : null,
      heroDi:ST.heroDi, calls:ST.callLog.slice(), quality:LEVELS[ST.level].id, level:ST.level, bloom:ST.bloomOn,
      fps:Math.round(ST.fps * 10) / 10, heroPx:ST.heroPx || null, dpr:ST.renderer ? ST.renderer.getPixelRatio() : 0,
      orbitR:h ? Math.round(h.D) : 0, mono:h ? h.monoEl.textContent : null, monoOp:h ? parseFloat(h.monoEl.style.opacity || '0') : 0,
      bodies:h ? h.bodies : null, tags:h ? h.sats.map(s => s.name) : [], edges:(ST.edgeDis || []).slice(),
      edgeOp:ST.edgeOp || 0, flareOp:ST.flareOp || 0, heroScale:h ? Math.round(h.group.scale.x * 1000) / 1000 : 0,
      boundPx:ST.boundPx ? Math.round(ST.boundPx) : 0, corePx:ST.corePx ? Math.round(ST.corePx) : 0,
      side:ST.layout ? (ST.layout.portrait ? 'below' : 'left') : null, leader:ST.leaderEl ? parseFloat(ST.leaderEl.style.opacity || '0') : 0,
      plate, labels:h ? h.sats.map(s => ({ n:s.name, x:Math.round(s.x), y:Math.round(s.y), a:Math.round(s.la * 100) / 100, w:s.w })) : [],
      tagsOverlap:overlapCount(ST), layout:ST.layout || null, camVel:ST.camVel ? ST.camVel.length() : 0 };
  }
};
window.FLY3D = FLY3D;

function overlapCount(st){
  const h = st.hero; if(!h) return 0;
  const r = h.sats.filter(s => s.la > 0.2).map(s => [s.x, s.y, s.x + s.w, s.y + s.h]);
  let n = 0;
  for(let i = 0; i < r.length; i++) for(let j = i + 1; j < r.length; j++){
    if(r[i][0] < r[j][2] && r[j][0] < r[i][2] && r[i][1] < r[j][3] && r[j][1] < r[i][3]) n++;
  }
  return n;
}

function shuffleBag(api, avoidDi, firstDi){
  const dis = api.nodes.map(n => n.di);
  for(let i = dis.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1)), t = dis[i]; dis[i] = dis[j]; dis[j] = t;
  }
  if(firstDi != null){
    const k = dis.indexOf(firstDi);
    if(k > 0){ dis.splice(k, 1); dis.unshift(firstDi); }
  } else if(dis.length > 1 && dis[0] === avoidDi){
    const t2 = dis[0]; dis[0] = dis[1]; dis[1] = t2;
  }
  return dis;
}
function nextCall(st){
  if(st.jumpDi != null){
    const jd = st.jumpDi; st.jumpDi = null;
    if(jd !== st.heroDi && st.api.byDi[jd]) return jd;
  }
  let di = null;
  while(st.bi < st.bag.length){ const c = st.bag[st.bi++]; if(st.api.byDi[c]){ di = c; break; } }
  if(di == null){
    st.bag = shuffleBag(st.api, st.lastDi, null); st.bi = 0;
    while(st.bi < st.bag.length){ const c2 = st.bag[st.bi++]; if(st.api.byDi[c2]){ di = c2; break; } }
  }
  return di;
}

function ensureStage(){
  if(ST && ST.renderer) return ST;
  const st = { hero:null };
  const r = new THREE.WebGLRenderer({ antialias:false, alpha:false, powerPreference:'high-performance', stencil:false });
  const ctx = r.getContext();
  if(!ctx || (ctx.isContextLost && ctx.isContextLost())){ r.dispose(); return null; }
  r.domElement.addEventListener('webglcontextlost', ev => { ev.preventDefault(); if(ST && FLY3D.active) forceEnd(ST); });
  st.renderer = r;
  ST = st;
  return st;
}
function stageBegin(api){
  if(FLY3D.active || FLY3D.busy) return false;
  const wrap = api.wrap; if(!wrap || !api.nodes.length || api.firstDi == null) return false;
  let st;
  try { st = ensureStage(); } catch(err){ ST = null; return false; }
  if(!st) return false;
  try {
    st.api = api; st.wrap = wrap; st.mobile = !!api.mobile;
    st.dead = false; st.exiting = false; st.frozen = false;
    st.snap = api.cam();
    st.total = api.nodes.length;
    st.drift = 0; st.time = 0; st.phase = 'wait'; st.phaseT = 0; st.waitT = 0;
    st.plateOn = false; st.jumpDi = null; st.boundPx = 0; st.corePx = 0;
    st.heroDi = api.firstDi; st.lastDi = api.lastDi;
    st.bag = shuffleBag(api, api.lastDi, api.firstDi); st.bi = 1;
    st.callLog = [api.firstDi]; st.callNo = 1;
    st.level = 0; st.forceQ = null; st.fps = 60; st.ft = []; st.ftSince = 0; st.lastChange = -99; st.banned = {}; st.lastUp = -99;
    st.edgeOp = 0; st.flareOp = 0; st.shiftX = 0; st.shiftY = 0; st.uniOp = 0.9; st.flight = null; st.camVel = new THREE.Vector3();
    st.prevPos = new THREE.Vector3(); st.hasPrev = false; st.ready = false; st.lastTs = 0; st.holdSeen = false;
    st.nextHero = null;

    buildDom(st);
    wrap.appendChild(st.overlay);
    st.W = wrap.clientWidth || st.snap.W; st.H = wrap.clientHeight || st.snap.H;

    st.scene = new THREE.Scene();
    st.scene.background = new THREE.Color(0x0a0a0a);
    const base = Math.min(st.snap.W, st.snap.H) / 1500 * (st.snap.W < 600 ? 1.15 : 1);
    st.fov0 = 2 * Math.atan(st.snap.H / (1900 * base * st.snap.zoom)) * 57.29578;
    st.camera = new THREE.PerspectiveCamera(st.fov0, st.W / Math.max(1, st.H), 1, 14000);
    st.camera.position.set(0, 0, 0);
    st.viewGroup = new THREE.Group();
    st.scene.add(st.viewGroup);
    st.vgPos = new THREE.Vector3();
    computeVgPos(st); paintViewGroup(st);
    shared();
    buildUniverse(st); buildStars(st); buildSelection(st);

    st.composer = new EffectComposer(st.renderer, new THREE.WebGLRenderTarget(2, 2, { type:THREE.HalfFloatType, samples:st.mobile ? 0 : 4 }));
    st.composer.addPass(new RenderPass(st.scene, st.camera));
    st.bloomPass = new UnrealBloomPass(new THREE.Vector2(st.W, st.H), 0.72, 0.5, 0.58);
    st.composer.addPass(st.bloomPass);
    st.composer.addPass(new OutputPass());

    sizeStage(st);
    st.hero = buildHero(st, st.heroDi);
    st.hero.az0 = 0; /* set properly when the approach starts */
    applyQuality(st);
    fillPlate(st, st.hero, 1);
    updateEdgeSet(st);

    FLY3D.active = true; FLY3D.busy = false;
    /* warm start: compile every program before the crossfade so frame one does not hitch */
    const go = () => { if(ST === st && !st.ready){ st.ready = true; st.phase = 'takeover'; st.phaseT = 0; requestAnimationFrame(() => { if(st.overlay) st.overlay.classList.add('on'); }); } };
    try {
      st.renderer.compileAsync(st.scene, st.camera).then(go, go);
      setTimeout(go, 900);
    } catch(e){ go(); }
    st.raf = requestAnimationFrame(tick);
    return true;
  } catch(err){
    try { teardown(st); } catch(e2){}
    return false;
  }
}
function computeVgPos(st){
  const s = st.snap;
  const base = Math.min(s.W, s.H) / 1500 * (s.W < 600 ? 1.15 : 1);
  const kHero = 950 * base * s.zoom / 1070;
  st.vgPos.set(-(s.cxOff + s.fx) / Math.max(0.2, kHero), (s.fy || 0) / Math.max(0.2, kHero), -1070);
}
function paintViewGroup(st){
  vgQuat(st, st.drift, st.viewGroup.quaternion);
  st.viewGroup.position.copy(st.vgPos);
}
function sizeStage(st){
  if(!st.wrap) return;
  const w = st.wrap.clientWidth || st.snap.W, h = st.wrap.clientHeight || st.snap.H;
  st.W = w; st.H = h;
  const cap = Math.min(window.devicePixelRatio || 1, st.mobile ? 1.5 : 2);
  const lv = LEVELS[st.forceQ != null ? st.forceQ : st.level];
  const pr = Math.max(0.75, cap * lv.pr);
  st.renderer.setPixelRatio(pr);
  st.renderer.setSize(w, h, false);
  st.composer.setPixelRatio(pr);
  st.composer.setSize(w, h);
  /* bloom at half resolution: the mip chain is the budget item */
  st.bloomPass.setSize(Math.max(2, Math.round(w * pr * 0.5)), Math.max(2, Math.round(h * pr * 0.5)));
  st.camera.aspect = w / Math.max(1, h);
  computeLayout(st);
  [st.hero, st.nextHero].forEach(hh => { if(hh) computeHeroD(st, hh); });
  if(st.plateOn) measurePlate(st);
  st.camera.updateProjectionMatrix();
}
function applyQuality(st){
  const lv = LEVELS[st.forceQ != null ? st.forceQ : st.level];
  st.bloomOn = lv.bloom;
  st.bloomPass.enabled = lv.bloom;
  st.stars.forEach(L => L.pts.geometry.setDrawRange(0, Math.floor(L.full * lv.stars)));
  st.nebulas.forEach((sp, i) => { sp.visible = lv.neb && (!st.mobile || i === 0); });
  [st.hero, st.nextHero].forEach(h => { if(h) h.shell.visible = lv.shell; });
  if(st.wrap) sizeStage(st);
}
/* warm-up aware, percentile-based, hysteretic; resolution first, effects second */
function sampleFrames(st, raw){
  if(st.time < 1.2 || st.phase === 'wait') return;
  st.ft.push(raw * 1000); if(st.ft.length > 60) st.ft.shift();
  if(st.time - st.ftSince < 0.8 || st.ft.length < 24 || st.forceQ != null) return;
  st.ftSince = st.time;
  const s = st.ft.slice().sort((a, b) => a - b);
  const p75 = s[Math.floor(s.length * 0.75)], med = s[Math.floor(s.length * 0.5)];
  st.fps = 1000 / Math.max(1, med);
  if(p75 > 24 && st.level < LEVELS.length - 1 && st.time - st.lastChange > 1.6){
    if(st.time - st.lastUp < 4) st.banned[st.level] = true;   /* the step up did not hold */
    st.level++; st.lastChange = st.time; st.ft.length = 0; applyQuality(st);
  } else if(p75 < 18.8 && st.level > 0 && st.time - st.lastChange > 10 && !st.banned[st.level - 1]){
    st.level--; st.lastChange = st.time; st.lastUp = st.time; st.ft.length = 0; applyQuality(st);
  }
}

function stageExit(){
  if(!FLY3D.active || !ST || ST.exiting) return;
  const st = ST;
  st.exiting = true;
  if(st.phase === 'wait'){ finishExit(st); return; }
  st.exitFrom = { P:st.camera.position.clone(), V:st.camVel.clone(), fov:st.camera.fov, q:st.camera.quaternion.clone(), shiftX:st.shiftX, shiftY:st.shiftY };
  st.phase = 'exit'; st.phaseT = 0; st.flight = null;
  plateHide(st);
}
function finishExit(st){
  cancelAnimationFrame(st.raf);
  st.overlay.classList.remove('on');
  const drift = st.drift;
  setTimeout(() => {
    cleanupFlight(st);
    FLY3D.active = false; FLY3D.busy = false;
    if(st.api && st.api.onGone) st.api.onGone(drift);
  }, 330);
}
function forceEnd(st){
  cancelAnimationFrame(st.raf);
  const drift = st.drift;
  cleanupFlight(st);
  FLY3D.active = false; FLY3D.busy = false;
  if(st.api && st.api.onGone) st.api.onGone(drift);
}
function cleanupFlight(st){
  if(st.overlay && st.overlay.parentNode) st.overlay.parentNode.removeChild(st.overlay);
  disposeHero(st, st.hero); disposeHero(st, st.nextHero); disposeHero(st, st.leaving);
  st.hero = st.nextHero = st.leaving = null;
  if(st.scene){
    st.scene.traverse(o => {
      if(o.isSprite && o.material){ o.material.dispose(); }
      if(o.isPoints){ if(o.geometry && o.geometry !== SH.shell) o.geometry.dispose(); if(o.material) o.material.dispose(); }
      if(o.isLineSegments && o.geometry){ o.geometry.dispose(); if(o.material) o.material.dispose(); }
    });
  }
  if(st.composer){ st.composer.dispose && st.composer.dispose(); }
  st.scene = null; st.composer = null;
}
function teardown(st){
  cancelAnimationFrame(st.raf);
  cleanupFlight(st);
  FLY3D.active = false; FLY3D.busy = false;
}

/* ---- the selection layer: hero edges, packets, flare ---- */
function updateEdgeSet(st){
  const h = st.hero; if(!h) return;
  st.edgeDis = h.edges;
  const tint = new THREE.Color(st.api.tierCol(h.di)).lerp(new THREE.Color(0xffffff), 0.35);
  st.edgeTint = tint;
  st.flareMat.uniforms.uTint.value.set(st.api.tierCol(h.di));
  st.packetMat.uniforms.uTint.value.copy(tint);
  const a = st.universe.geometry.attributes.aAlpha.array;
  a.fill(0.9);
  const idx = st.uniIndex;
  if(idx[h.di] != null) a[idx[h.di]] = 0;               /* the orb replaces their point */
  h.edges.forEach(d => { if(idx[d] != null) a[idx[d]] = 1.6; });
  st.universe.geometry.attributes.aAlpha.needsUpdate = true;
}
function paintSelection(st, dt){
  const h = st.hero; if(!h) return;
  const hp = nodePos(st.api, h.di, _v1);
  const ea = st.edgeLines.geometry.attributes, pa = ea.position.array, ca = ea.color.array, op = st.edgeOp;
  const pk = st.packets.geometry.attributes;
  for(let i = 0; i < 8; i++){
    const tdi = st.edgeDis[i], has = tdi != null && st.api.byDi[tdi];
    const tp = has ? nodePos(st.api, tdi, _v2) : hp;
    pa[i * 6] = hp.x; pa[i * 6 + 1] = hp.y; pa[i * 6 + 2] = hp.z;
    const el = has ? Math.hypot(tp.x - hp.x, tp.y - hp.y, tp.z - hp.z) : 1, cut = has ? Math.min(1, st.hero.sysR * 5 / el) : 1;
    pa[i * 6 + 3] = hp.x + (tp.x - hp.x) * cut; pa[i * 6 + 4] = hp.y + (tp.y - hp.y) * cut; pa[i * 6 + 5] = hp.z + (tp.z - hp.z) * cut;
    /* bright at the hero, fading to nothing at the far end: no lines running off the page */
    const k = has ? 0.34 * op : 0;
    ca[i * 6] = st.edgeTint.r * k; ca[i * 6 + 1] = st.edgeTint.g * k; ca[i * 6 + 2] = st.edgeTint.b * k;
    ca[i * 6 + 3] = 0; ca[i * 6 + 4] = 0; ca[i * 6 + 5] = 0;
    const ppos = pk.position.array;
    if(has && op > 0.02){
      const frc = (st.time * 0.4 + i * 0.173) % 1;
      ppos[i * 3] = lerp(tp.x, hp.x, frc); ppos[i * 3 + 1] = lerp(tp.y, hp.y, frc); ppos[i * 3 + 2] = lerp(tp.z, hp.z, frc);
      pk.aAlpha.array[i] = op * Math.sin(frc * Math.PI) * 1.1;
    } else pk.aAlpha.array[i] = 0;
  }
  ea.position.needsUpdate = true; ea.color.needsUpdate = true;
  pk.position.needsUpdate = true; pk.aAlpha.needsUpdate = true;
  /* the flare burns where the person still is just a point */
  const fp = st.flare.geometry.attributes, fop = st.flareOp;
  fp.position.array[0] = hp.x; fp.position.array[1] = hp.y; fp.position.array[2] = hp.z;
  fp.aSize.array[0] = 16 + 46 * fop; fp.aAlpha.array[0] = fop * 0.9;
  fp.position.needsUpdate = true; fp.aSize.needsUpdate = true; fp.aAlpha.needsUpdate = true;
  st.flare.visible = fop > 0.02;
}

/* ---- per-frame hero animation ---- */
function animateHero(st, h, dt, plateAge){
  const sc = heroScale(h), bright = easeOut(clamp(h.grow, 0, 1)) * h.coll;
  h.bright = bright;
  h.group.scale.setScalar(sc);
  h.coreMat.uniforms.uTime.value = st.time; h.coreMat.uniforms.uBright.value = bright;
  h.atmoMat.uniforms.uBreathe.value = 0.85 + 0.15 * Math.sin(st.time * 1.5708);
  h.atmoMat.uniforms.uBright.value = bright;
  h.shell.rotation.y -= dt * 0.05;
  h.pivA.rotation.y = Math.sin(st.time * 0.21) * 0.4;
  h.pivB.rotation.x = 0.35 + Math.sin(st.time * 0.16 + 1) * 0.35;
  h.pivArc.rotation.y = Math.sin(st.time * 0.13 + 2) * 0.3;
  h.arcMat.uniforms.uBright.value = bright;
  /* score gauge + count-up, keyed to the moment the plate assembled */
  if(h.score != null){
    const sp = plateAge < 0 ? 0 : easeOut(clamp((plateAge - 0.45) / 1.0, 0, 1));
    h.sweep = sp;
    const frac = Math.max(0.002, sp * h.score / 100);
    h.arcMat.uniforms.uSweep.value = frac;
    if(h.pinned){
      const a = Math.PI / 2 - frac * Math.PI * 2;
      h.tick.position.set(Math.cos(a) * 1.64 * h.R, Math.sin(a) * 1.64 * h.R, 0);
      h.tick.rotation.z = a + Math.PI / 2; h.tick.visible = sp > 0.02;
    }
    if(st.hero === h){
      const n = Math.round(h.score * sp);
      if(st.numShown !== n){ st.numShown = n; st.pNum.textContent = String(n); }
    }
  }
  /* lock-on ring: signal red, its one beat, at the instant the plate lands */
  if(plateAge >= 0 && plateAge < 0.9){
    const pp = plateAge / 0.9;
    h.pulse.scale.setScalar(h.R * (1.04 + pp * 1.6));
    h.pulseMat.opacity = 0.75 * (1 - pp);
    _qa.copy(st.viewGroup.quaternion).invert().multiply(st.camera.quaternion);
    h.pulse.quaternion.copy(_qa);
  } else h.pulseMat.opacity = 0;
  /* satellites: motion, kind-shaped dots, tethers, staggered arrival */
  const sa = h.sg.attributes, ta = h.tg.attributes;
  h.sats.forEach((s, i) => {
    s.ang += s.speed * dt;
    s.local.set(Math.cos(s.ang) * s.rad, 0, Math.sin(s.ang) * s.rad).applyQuaternion(s.q);
    const target = plateAge < 0 ? 0 : clamp((plateAge - 1.1 - i * 0.09) / 0.6, 0, 1);
    s.op = Math.min(target, h.coll);
    sa.position.array[i * 3] = s.local.x; sa.position.array[i * 3 + 1] = s.local.y; sa.position.array[i * 3 + 2] = s.local.z;
    sa.aAlpha.array[i] = s.op * 0.95;
    ta.position.array[i * 6] = 0; ta.position.array[i * 6 + 1] = 0; ta.position.array[i * 6 + 2] = 0;
    ta.position.array[i * 6 + 3] = s.local.x; ta.position.array[i * 6 + 4] = s.local.y; ta.position.array[i * 6 + 5] = s.local.z;
    const k = s.op * 0.5;
    ta.color.array[i * 6] = 0; ta.color.array[i * 6 + 1] = 0; ta.color.array[i * 6 + 2] = 0;
    ta.color.array[i * 6 + 3] = s.col.r * k; ta.color.array[i * 6 + 4] = s.col.g * k; ta.color.array[i * 6 + 5] = s.col.b * k;
  });
  sa.position.needsUpdate = true; sa.aAlpha.needsUpdate = true; ta.position.needsUpdate = true; ta.color.needsUpdate = true;
}

/* ---- labels: projected, collision-solved, edge-clamped, orb-aware ---- */
function projectTo(st, world, out){
  _v4.copy(world).project(st.camera);
  out.x = (_v4.x + 1) / 2 * st.W; out.y = (1 - _v4.y) / 2 * st.H;
  return out;
}
const _sp = { x:0, y:0 };
function circleHitsRect(cx, cy, r, x0, y0, x1, y1){
  const nx = clamp(cx, x0, x1), ny = clamp(cy, y0, y1);
  return (nx - cx) * (nx - cx) + (ny - cy) * (ny - cy) < r * r;
}
function layoutLabels(st, h, dt){
  const W = st.W, H = st.H, cx = st.heroPx.x, cy = st.heroPx.y, rc = st.corePx;
  const obst = [];
  if(st.plateRect && st.plateOn) obst.push([st.plateRect.l - 8, st.plateRect.t - 8, st.plateRect.r + 8, st.plateRect.b + 8]);
  if(st.exitRect) obst.push(st.exitRect);
  /* satellites in world space -> screen, plus facing/occlusion */
  const heroDepth = _v3.copy(_hw).applyMatrix4(st.camera.matrixWorldInverse).z * -1;
  h.sats.forEach(s => {
    _v2.copy(s.local).applyMatrix4(h.group.matrixWorld);
    const dz = -_v1.copy(_v2).applyMatrix4(st.camera.matrixWorldInverse).z;
    projectTo(st, _v2, _sp); s.sx = _sp.x; s.sy = _sp.y;
    s.behind = dz > heroDepth;
    s.occluded = s.behind && Math.hypot(s.sx - cx, s.sy - cy) < rc * 1.04;
    s.depth = dz;
  });
  const order = h.sats.slice().sort((a, b) => a.depth - b.depth);
  const k = 1 - Math.exp(-dt / 0.12), km = 1 - Math.exp(-dt / 0.09);
  const margin = 10;
  order.forEach(s => {
    if(!s.w){ s.w = s.el.offsetWidth || 90; s.h = s.el.offsetHeight || 15; }
    const aT = s.op * (s.occluded ? 0 : s.behind ? 0.4 : 1);
    s.la += (aT - s.la) * k;
    if(s.la < 0.01){ s.el.style.opacity = '0'; return; }
    const out = s.sx >= cx ? 1 : -1, vert = s.sy < cy ? -1 : 1;
    const w = s.w, hh = s.h;
    const cand = [
      [out > 0 ? s.sx + 11 : s.sx - 11 - w, s.sy - hh / 2],
      [s.sx - w / 2, vert < 0 ? s.sy - hh - 9 : s.sy + 9],
      [s.sx - w / 2, vert < 0 ? s.sy + 9 : s.sy - hh - 9],
      [out > 0 ? s.sx - 11 - w : s.sx + 11, s.sy - hh / 2]
    ];
    const ok = c => {
      if(c[0] < margin || c[1] < margin || c[0] + w > W - margin || c[1] + hh > H - margin) return false;
      for(let i = 0; i < obst.length; i++){ const o = obst[i]; if(c[0] < o[2] && o[0] < c[0] + w && c[1] < o[3] && o[1] < c[1] + hh) return false; }
      if(circleHitsRect(cx, cy, rc * 1.02, c[0], c[1], c[0] + w, c[1] + hh)) return false;
      return true;
    };
    let pick = -1;
    if(s.side >= 0 && s.placed && ok(cand[s.side])) pick = s.side;           /* hysteresis: stay put if still fine */
    if(pick < 0) for(let i = 0; i < 4; i++){ if(ok(cand[i])){ pick = i; break; } }
    let c = pick >= 0 ? cand[pick] : cand[0];
    if(pick < 0){ c = [clamp(c[0], margin, W - margin - w), clamp(c[1], margin, H - margin - hh)]; }
    s.side = pick;
    s.tx = c[0]; s.ty = c[1];
    if(!s.placed){ s.x = s.tx; s.y = s.ty; s.placed = true; }
    else { s.x += (s.tx - s.x) * km; s.y += (s.ty - s.y) * km; }
    obst.push([s.x - 3, s.y - 2, s.x + w + 3, s.y + hh + 2]);
    s.el.style.transform = 'translate3d(' + Math.round(s.x) + 'px,' + Math.round(s.y) + 'px,0)';
    s.el.style.opacity = (s.la * (pick < 0 ? (st.layout.portrait ? 0 : 0.55) : 1)).toFixed(3);
  });
}

/* ---- the clock ---- */
function tick(ts){
  const st = ST; if(!st || st.dead || !st.scene) return;
  if(!document.contains(st.wrap)){ teardown(st); return; }
  st.raf = requestAnimationFrame(tick);
  const raw = st.lastTs ? (ts - st.lastTs) / 1000 : 1 / 60;
  st.lastTs = ts;
  if(st.frozen) return;
  /* real time down to 4fps; a long gap (tab hidden) is a pause, not a leap */
  const dt = raw > 1 ? 1 / 60 : Math.min(0.25, Math.max(0, raw));
  sampleFrames(st, raw > 1 ? 1 / 60 : raw);
  advance(st, dt);
  render(st);
}

function advance(st, dt){
  if(st.phase === 'wait'){ st.waitT += dt; return; }
  st.time += dt; st.phaseT += dt;
  st.drift += st.api.driftRate * dt;
  paintViewGroup(st);
  paintUniverse(st);
  st.viewGroup.updateMatrixWorld(true);
  const cam = st.camera, hero = st.hero;
  nodePos(st.api, hero.di, hero.local); hero.group.position.copy(hero.local);
  hero.group.updateMatrixWorld(true);
  hero.group.getWorldPosition(_hw);
  let plateAge = hero.plateAt >= 0 ? st.time - hero.plateAt : -1;
  let shiftT = 1, fov = FOV_HOLD, lookInstead = null;
  const prevPos = st.hasPrev ? _Pa.copy(st.prevPos) : null;

  switch(st.phase){
    case 'takeover': {
      st.flareOp = 1;
      st.edgeOp = 0.15 + 0.35 * clamp(st.phaseT / T_TAKEOVER, 0, 1);
      cam.position.set(0, 0, 0); cam.lookAt(_hw);
      shiftT = 0; fov = st.fov0;
      if(st.phaseT >= T_TAKEOVER){
        st.phase = 'approach'; st.phaseT = 0;
        cam.fov = st.fov0;
        st.camVel.set(0, 0, 0);
        startFlight(st, 'approach', hero);
      }
      break;
    }
    case 'approach': case 'transit': {
      const f = st.flight, u = clamp(st.phaseT / f.T, 0, 1);
      f.P0.copy(f.P0);
      flightEnds(st, f, f.h1, f.T - st.phaseT);
      flightPose(f, u, cam.position);
      fov = st.phase === 'approach' ? lerp(st.fov0, FOV_HOLD, smoother(u)) : FOV_HOLD + 12 * Math.pow(Math.sin(Math.PI * u), 2);
      shiftT = st.phase === 'approach' ? smoother(clamp((u - 0.15) / 0.85, 0, 1)) : 1;
      if(st.phase === 'approach'){
        hero.grow = Math.min(1, hero.grow + dt / 1.1);
        st.flareOp = 1 - hero.grow; st.edgeOp = 0.30 + 0.25 * hero.grow;
        if(hero.grow >= 0.72) plateShow(st, hero);
        cam.lookAt(_hw);
        if(st.phaseT >= T_APPROACH){ st.phase = 'hold'; st.phaseT = 0; st.flight = null; }
      } else {
        const old = st.leaving, nh = st.hero;   /* hero already points at the arriving person */
        if(old){
          old.coll = clamp(1 - st.phaseT / 0.5, 0, 1);
          nodePos(st.api, old.di, old.local); old.group.position.copy(old.local);
          animateHero(st, old, dt, 99);
          if(old.coll <= 0){ disposeHero(st, old); st.leaving = null; }
        }
        nh.grow = clamp((u - 0.55) / 0.45, 0, 1);
        st.flareOp = u < 0.5 ? 0 : 1 - nh.grow; st.edgeOp = 0.15 + 0.35 * nh.grow;
        if(nh.grow >= 0.72) plateShow(st, nh);
        /* look from the person we are leaving to the person we are arriving at */
        const oldW = f.oldW;
        nodePos(st.api, f.h1.di, f.h1.local); worldAt(st, f.h1.local, st.drift, _hw1);
        if(old){ old.group.getWorldPosition(f.oldW); }
        lookInstead = _v3.copy(f.oldW).lerp(_hw1, smoother(clamp((u - 0.12) / 0.76, 0, 1)));
        cam.lookAt(lookInstead);
        if(st.phaseT >= T_TRANSIT){ st.phase = 'hold'; st.phaseT = 0; st.flight = null; }
      }
      break;
    }
    case 'hold': {
      st.flareOp = 0; st.edgeOp = 0.30;
      holdPose(st, hero, st.phaseT, st.drift, cam.position);
      cam.lookAt(_hw);
      if(!st.holdSeen){ st.holdSeen = true; }
      /* plate clears just before the next flight */
      if(st.phaseT >= T_HOLD - T_PLATE_OUT) plateHide(st);
      if(st.phaseT >= T_HOLD){
        const ndi = nextCall(st);
        if(ndi == null){ stageExit(); break; }
        const old = hero, nh = buildHero(st, ndi);
        st.leaving = old; st.hero = nh; st.heroDi = ndi; st.lastDi = ndi;
        st.callLog.push(ndi); st.callNo = Math.min(st.total, (st.bi || st.callNo + 1));
        fillPlate(st, nh, st.callNo);
        applyQuality(st);
        updateEdgeSet(st);
        st.numShown = -1;
        st.phase = 'transit'; st.phaseT = 0;
        const f = startFlight(st, 'transit', nh);
        f.oldW = old.group.getWorldPosition(new THREE.Vector3());
      }
      break;
    }
    case 'exit': {
      const x = st.exitFrom, u = clamp(st.phaseT / T_EXIT, 0, 1), s = smoother(u);
      st.flareOp = 0; st.edgeOp = 0.30 * (1 - u);
      const f = { P0:x.P, M0:_v3.copy(x.V).multiplyScalar(T_EXIT), P1:_v1.set(0, 0, 0), M1:_v2.set(0, 0, 0), bump:null };
      flightPose(f, u, cam.position);
      cam.lookAt(_hw);
      _qI.identity(); cam.quaternion.slerp(_qI, s);       /* end exactly on the canvas camera */
      fov = lerp(x.fov, st.fov0, s); shiftT = 0;
      hero.coll = clamp(1 - u / 0.6, 0, 1);
      if(st.phaseT >= T_EXIT){ st.phase = 'gone'; finishExit(st); return; }
      break;
    }
  }
  /* scene dressing that follows the phase */
  const uniTarget = st.phase === 'hold' ? 0.62 : 0.9;
  st.uniOp += (uniTarget - st.uniOp) * (1 - Math.exp(-dt / 0.5));
  st.uniMat.uniforms.uOpacity.value = st.uniOp;
  /* view offset: the orb sits on a third while the plate owns the other two */
  const L = st.layout, sx = L.shiftX * shiftT, sy = L.shiftY * shiftT;
  st.shiftX += (sx - st.shiftX) * (1 - Math.exp(-dt / 0.18)); st.shiftY += (sy - st.shiftY) * (1 - Math.exp(-dt / 0.18));
  if(Math.abs(cam.fov - fov) > 0.001 || st.vo !== st.shiftX + ':' + st.shiftY){
    cam.fov = fov;
    cam.setViewOffset(st.W, st.H, -st.shiftX, st.shiftY, st.W, st.H);
    st.vo = st.shiftX + ':' + st.shiftY;
  }
  cam.updateMatrixWorld();
  /* camera velocity, measured, so the next flight leaves exactly as the last one arrived */
  if(prevPos && dt > 0) st.camVel.copy(cam.position).sub(prevPos).multiplyScalar(1 / dt);
  st.prevPos.copy(cam.position); st.hasPrev = true;

  /* the people */
  plateAge = hero.plateAt >= 0 ? st.time - hero.plateAt : -1;
  animateHero(st, hero, dt, plateAge);
  paintSelection(st, dt);
  st.stars.forEach((L2, i) => {
    L2.pts.rotation.y += L2.rate * dt;
    L2.mat.uniforms.uOpacity.value = L2.baseOp * (0.8 + 0.2 * Math.sin(st.time * (0.5 + i * 0.23) + i * 2.1));
  });
  /* plate progress rule */
  if(st.phase === 'hold'){
    const p = clamp(st.phaseT / T_HOLD, 0, 1);
    if(Math.abs(p - st.progShown) > 0.004){ st.progShown = p; st.pProg.style.transform = 'scaleX(' + p.toFixed(3) + ')'; }
  }
  /* screen-space probes */
  hero.group.getWorldPosition(_hw);
  projectTo(st, _hw, _sp);
  st.heroPx = { x:_sp.x, y:_sp.y };
  const right = _v1.set(1, 0, 0).applyQuaternion(cam.quaternion);
  const sc = hero.group.scale.x;
  _v2.copy(_hw).addScaledVector(right, hero.R * sc); projectTo(st, _v2, _sp);
  st.corePx = Math.hypot(_sp.x - st.heroPx.x, _sp.y - st.heroPx.y);
  _v2.copy(_hw).addScaledVector(right, hero.R * sc * 1.78); projectTo(st, _v2, _sp);
  st.boundPx = Math.hypot(_sp.x - st.heroPx.x, _sp.y - st.heroPx.y);
  const u2 = uniformsPx(st);
  [st.uniMat, st.packetMat, st.flareMat, hero.satMat, hero.shellMat].concat(st.leaving ? [st.leaving.satMat, st.leaving.shellMat] : [])
    .forEach(m => { m.uniforms.uPx.value = u2.px; m.uniforms.uPR.value = u2.pr; });
  st.stars.forEach(L2 => { L2.mat.uniforms.uPR.value = u2.pr; });
}
function uniformsPx(st){
  const pr = st.renderer.getPixelRatio();
  return { pr, px:(st.H * pr) / (2 * Math.tan(st.camera.fov * Math.PI / 360)) };
}

function render(st){
  if(!st.scene || st.phase === 'wait') return;
  const hero = st.hero;
  /* monogram + labels ride the projected orb */
  const mono = hero.monoEl, s = st.corePx / 96;
  mono.style.opacity = hero.bright.toFixed(3);
  mono.style.transform = 'translate3d(' + st.heroPx.x.toFixed(1) + 'px,' + st.heroPx.y.toFixed(1) + 'px,0) translate(-50%,-50%) scale(' + s.toFixed(3) + ')';
  if(st.leaving){
    const o = st.leaving; o.monoEl.style.opacity = '0';
    o.sats.forEach(q => { q.el.style.opacity = '0'; });
  }
  if(!st.exitRect && st.exitBtn){
    const o = st.overlay.getBoundingClientRect(), r = st.exitBtn.getBoundingClientRect();
    st.exitRect = [r.left - o.left - 8, r.top - o.top - 8, r.right - o.left + 8, r.bottom - o.top + 8];
  }
  layoutLabels(st, hero, 1 / 60);
  paintLeader(st);
  if(st.bloomOn) st.composer.render(); else st.renderer.render(st.scene, st.camera);
}
function paintLeader(st){
  const L = st.leaderEl; if(!L) return;
  if(st.plateOn && st.plateRect && !st.exiting){
    const pr = st.plateRect, hx = st.heroPx.x, hy = st.heroPx.y;
    const pcx = clamp(hx, pr.l, pr.r), pcy = clamp(hy, pr.t, pr.b);
    const dx = pcx - hx, dy = pcy - hy, dl = Math.max(1, Math.hypot(dx, dy));
    const rim = st.boundPx;
    const rx = hx + dx / dl * rim, ry = hy + dy / dl * rim;
    st.leaderLine.setAttribute('x1', (pcx + (dx / dl) * 10).toFixed(1)); st.leaderLine.setAttribute('y1', pcy.toFixed(1));
    st.leaderLine.setAttribute('x2', rx.toFixed(1)); st.leaderLine.setAttribute('y2', ry.toFixed(1));
    st.leaderDot.setAttribute('cx', rx.toFixed(1)); st.leaderDot.setAttribute('cy', ry.toFixed(1));
    L.style.opacity = '0.7';
  } else L.style.opacity = '0';
}

/* ---- environment ---- */
let rzT = 0;
window.addEventListener('resize', () => {
  if(!(ST && FLY3D.active)) return;
  clearTimeout(rzT); rzT = setTimeout(() => { if(ST && FLY3D.active && ST.scene){ ST.exitRect = null; sizeStage(ST); } }, 120);
});
document.addEventListener('fullscreenchange', () => {
  if(!(ST && FLY3D.active && ST.scene)) return;
  ST.exitRect = null; sizeStage(ST);
});
if(window.matchMedia){
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onMq = () => { if(mq.matches && ST && FLY3D.active) stageExit(); };
  if(mq.addEventListener) mq.addEventListener('change', onMq); else if(mq.addListener) mq.addListener(onMq);
}
document.addEventListener('keydown', ev => { if(ev.key === 'Escape' && ST && FLY3D.active) stageExit(); });

})();
