/* =====================================================================
   GRAND FLYOVER — a dedicated WebGL stage for the Network roll call
   (JD 2026-10-16, design spec: your_files/ncc-flyover-grand-design-
   2026-10-16.md). Route A: this module is loaded LAZILY on the first
   Flyover press (dynamic import from dossier.js) and takes over from
   the canvas map: the canvas glides in close on the first person,
   then this stage crossfades in with a camera matched EXACTLY to the
   canvas projection (same layout coordinates, same framing — the
   rig math was verified to 0.000px against n3Project in a spike).
   Each call: dolly approach on a bézier with an FOV breathe, a ~120°
   orbit while the person's information builds in stagger, a linger
   on a micro-orbit, then a transit arc through the point-cloud
   universe to the next person. Shuffle-bag order, no repeats until
   the pool is called. Any input exits: pull back, crossfade out,
   and dossier.js restores the pre-Flyover camera + selection.
   If WebGL fails anywhere, begin() returns false and the shipped
   canvas roll call simply continues — this module can never break
   the map. Swiss Mono law: black, grayscale, hairlines; tier owns
   color; signal red only for the lock-on pulse, the pinned tick and
   the exit affordance. No emoji.

   IDENTITY PASS (V2.7.1, JD 2026-10-17): the stage must visibly BE
   the person it calls. (1) A monogram sigil — the person's
   initials, tier-colored — rides at the orb's core. (2) The orbit
   system is composed from the person's own record (api.bodies:
   associates first, then their canonical orgs, then their groups,
   cap 8), with larger bodies and readable name tags, so a dense
   network and a sparse one look structurally different. (3) The
   arrival selects the person out of the universe: their point
   flares, their connection lines light up with packets streaming
   in, and the orb GROWS out of the point (and collapses back into
   it on exit). (4) The name plate is part of the orb system —
   anchored beside the orb, tied to its rim by a hairline leader,
   its name assembling with the orb's own formation beat.
   ===================================================================== */
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

(function(){
'use strict';

/* ---------------- helpers ---------------- */
function clamp(v, a, b){ return v < a ? a : v > b ? b : v; }
function lerp(a, b, t){ return a + (b - a) * t; }
function easeInOut(t){ return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function easeOut(t){ return 1 - Math.pow(1 - t, 3); }
function smoother(t){ return t * t * t * (t * (t * 6 - 15) + 10); }
function hash01(n){ var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function initialsOf(name){
  var w = String(name || '').replace(/^@/, '').split(/\s+/).filter(Boolean);
  if(!w.length) return '··';
  if(w.length === 1) return (w[0].charAt(0) + (w[0].charAt(1) || '')).toUpperCase();
  return (w[0].charAt(0) + w[w.length - 1].charAt(0)).toUpperCase();
}
/* orb growth curve: a called person starts as their universe point
   (3% scale) and assembles to full size — never a fade-up pop */
function heroScale(anim){ return 0.03 + 0.97 * easeOut(clamp(anim, 0, 1)); }
function dotTexture(){
  var c = document.createElement('canvas'); c.width = c.height = 64;
  var g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.85)');
  gr.addColorStop(0.7, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  var t = new THREE.CanvasTexture(c); return t;
}
function nebTexture(){
  var c = document.createElement('canvas'); c.width = c.height = 256;
  var g = c.getContext('2d');
  for(var i = 0; i < 26; i++){
    var x = 40 + Math.random() * 176, y = 40 + Math.random() * 176, r = 30 + Math.random() * 80;
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.05)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
  }
  return new THREE.CanvasTexture(c);
}

/* ---------------- shaders ---------------- */
var CORE_VERT = [
  'varying vec3 vN; varying vec3 vV; varying vec3 vP;',
  'void main(){',
  '  vP = position;',
  '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
  '  vV = mv.xyz; vN = normalize(normalMatrix * normal);',
  '  gl_Position = projectionMatrix * mv;',
  '}'
].join('\n');
var CORE_FRAG = [
  'uniform vec3 uColor; uniform float uTime; uniform float uBright;',
  'varying vec3 vN; varying vec3 vV; varying vec3 vP;',
  'float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }',
  'float noise(vec3 p){',
  '  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
  '  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),',
  '             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);',
  '}',
  'float fbm(vec3 p){ float v = 0.0, a = 0.5; for(int i = 0; i < 4; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }',
  'void main(){',
  '  vec3 V = normalize(-vV); vec3 N = normalize(vN);',
  '  float fr = pow(1.0 - max(dot(N, V), 0.0), 2.4);',
  '  float n = fbm(vP * 0.055 + vec3(uTime * 0.030, uTime * 0.021, uTime * 0.013));',
  '  float n2 = fbm(vP * 0.16 - vec3(0.0, uTime * 0.017, uTime * 0.026));',
  '  vec3 col = uColor * 0.07;',
  '  col += uColor * n * 0.34;',
  '  col += uColor * n2 * 0.10;',
  '  col += uColor * fr * 1.75;',
  '  col += vec3(1.0) * pow(fr, 6.0) * 0.28;',
  '  gl_FragColor = vec4(col * uBright, 1.0);',
  '}'
].join('\n');
var ATMO_VERT = [
  'varying vec3 vN;',
  'void main(){',
  '  vN = normalize(normalMatrix * normal);',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '}'
].join('\n');
var ATMO_FRAG = [
  'uniform vec3 uColor; uniform float uBreathe; uniform float uBright;',
  'varying vec3 vN;',
  'void main(){',
  '  float i = pow(clamp(0.68 - dot(normalize(vN), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 3.5);',
  '  gl_FragColor = vec4(uColor * i * 0.95 * uBreathe * uBright, 1.0);',
  '}'
].join('\n');

/* ---------------- timings (Grand pacing, spec §3) ---------------- */
var T_TAKEOVER = 0.35, T_APPROACH = 1.8, T_ORBIT = 5.8, T_LINGER = 1.7, T_TRANSIT = 2.0, T_EXIT = 0.7;
var ORBIT_SWEEP = 2.094; /* 120 degrees of travel across the orbit phase */

/* ---------------- the stage ---------------- */
var ST = null;

function nodePos(api, di, out){
  var nd = api.byDi[di]; if(!nd) return out.set(0, 0, 0);
  var p = api.pos(nd);
  return out.set(p[0], -p[1], -p[2]); /* the matched-rig flip: (x, -y, -z) */
}
function buildUniverse(st){
  var nodes = st.api.nodes, n = nodes.length;
  var geo = new THREE.BufferGeometry();
  var pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  var c = new THREE.Color();
  for(var i = 0; i < n; i++){
    c.set(st.api.tierCol(nodes[i].di));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  var mat = new THREE.PointsMaterial({ size:3.4, sizeAttenuation:true, map:st.dotTex,
    vertexColors:true, transparent:true, opacity:0.92, depthWrite:false,
    blending:THREE.AdditiveBlending, fog:true });
  var pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  st.viewGroup.add(pts);
  st.universe = pts; st.universePos = pos;
  paintUniverse(st);
}
function buildStars(st){
  var mobile = st.mobile;
  var layers = mobile ? [550, 380, 220] : [1750, 1100, 650];
  var sizes = [2.0, 1.5, 1.1], ops = [0.55, 0.38, 0.26], rates = [0.006, -0.004, 0.0026];
  st.stars = [];
  for(var L = 0; L < 3; L++){
    var n = layers[L], pos = new Float32Array(n * 3);
    for(var i = 0; i < n; i++){
      var u = Math.random() * 2 - 1, th = Math.random() * 6.2832, rr = Math.sqrt(1 - u * u);
      var rad = 2500 + Math.random() * 2600;
      pos[i * 3] = Math.cos(th) * rr * rad; pos[i * 3 + 1] = u * rad * 0.8; pos[i * 3 + 2] = -1400 - Math.abs(Math.sin(th) * rr * rad) * 0.7 - Math.random() * 800;
      if(Math.random() < 0.5) pos[i * 3 + 2] = Math.sin(th) * rr * rad - 600;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var mat = new THREE.PointsMaterial({ size:sizes[L], sizeAttenuation:false, map:st.dotTex,
      color:0xd8d8d8, transparent:true, opacity:ops[L], depthWrite:false, blending:THREE.AdditiveBlending, fog:false });
    var pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    st.scene.add(pts);
    st.stars.push({ pts:pts, mat:mat, baseOp:ops[L], rate:rates[L], full:n });
  }
  /* grayscale nebula smoke — Swiss law: no color, barely there */
  st.nebulas = [];
  for(var k = 0; k < 3; k++){
    var sm = new THREE.SpriteMaterial({ map:st.nebTex, color:0x8a8a8a, transparent:true,
      opacity:0.05 + k * 0.012, depthWrite:false, fog:false });
    var sp = new THREE.Sprite(sm);
    sp.position.set((k - 1) * 1900, 500 - k * 420, -3400 - k * 500);
    sp.scale.set(3400 + k * 700, 2400 + k * 500, 1);
    st.scene.add(sp); st.nebulas.push(sp);
  }
}
function circleLine(radius, color, opacity){
  var pts = [];
  for(var i = 0; i <= 128; i++){
    var a = i / 128 * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
  }
  var geo = new THREE.BufferGeometry().setFromPoints(pts);
  var mat = new THREE.LineBasicMaterial({ color:color, transparent:true, opacity:opacity, fog:false });
  return new THREE.Line(geo, mat);
}
function buildOrb(st, di, keepOld){
  /* dismantle any previous hero (unless the caller is keeping it
     alive to shrink out during a transit) */
  if(st.hero && !keepOld){
    st.viewGroup.remove(st.hero.group);
    st.hero.group.traverse(function(o){
      if(o.geometry) o.geometry.dispose();
      if(o.material){ (Array.isArray(o.material) ? o.material : [o.material]).forEach(function(m){ m.dispose(); }); }
    });
    st.hero = null;
  }
  var api = st.api, e = api.entry(di);
  var sc = api.score(di);
  var score = sc ? sc.score : null, pinned = !!(sc && sc.pinned);
  var R = 30 * (0.85 + 0.35 * (score == null ? 0.45 : score / 100));
  var col = new THREE.Color(api.tierCol(di));
  var g = new THREE.Group();

  var coreMat = new THREE.ShaderMaterial({ vertexShader:CORE_VERT, fragmentShader:CORE_FRAG,
    uniforms:{ uColor:{ value:col }, uTime:{ value:0 }, uBright:{ value:0 } } });
  var core = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), coreMat);
  g.add(core);

  var atmoMat = new THREE.ShaderMaterial({ vertexShader:ATMO_VERT, fragmentShader:ATMO_FRAG,
    uniforms:{ uColor:{ value:col }, uBreathe:{ value:1 }, uBright:{ value:0 } },
    side:THREE.BackSide, blending:THREE.AdditiveBlending, transparent:true, depthWrite:false });
  var atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.16, 48, 32), atmoMat);
  g.add(atmo);

  /* monogram sigil: the person's initials at the core, tier-colored,
     camera-facing for the whole orbit (CSS2D) — the orb is marked
     with who it is at all times */
  var hex = api.tierCol(di);
  var monoEl = document.createElement('div');
  monoEl.className = 'f3-mono';
  monoEl.textContent = initialsOf(api.name(di));
  monoEl.style.color = hex;
  monoEl.style.borderColor = hex;
  monoEl.style.boxShadow = '0 0 22px ' + hex + '59, inset 0 0 16px rgba(0,0,0,.55)';
  var mono = new CSS2DObject(monoEl);
  mono.center.set(0.5, 0.5);
  g.add(mono);

  /* particle shell — ~700 points on a fibonacci sphere, density of
     presence scaled mildly by the fabric component of the score */
  var fabric = api.fabric(di);
  var N = 700, sp = new Float32Array(N * 3), ga = Math.PI * (3 - Math.sqrt(5));
  for(var i = 0; i < N; i++){
    var y = 1 - (i / (N - 1)) * 2, rr = Math.sqrt(Math.max(0, 1 - y * y)), th = ga * i;
    sp[i * 3] = Math.cos(th) * rr * R * 1.35; sp[i * 3 + 1] = y * R * 1.35; sp[i * 3 + 2] = Math.sin(th) * rr * R * 1.35;
  }
  var shellGeo = new THREE.BufferGeometry();
  shellGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  var shellMat = new THREE.PointsMaterial({ size:2.1, sizeAttenuation:true, map:st.dotTex,
    color:col.clone().lerp(new THREE.Color(0xffffff), 0.55), transparent:true,
    opacity:0.30 + 0.55 * fabric, depthWrite:false, blending:THREE.AdditiveBlending, fog:false });
  var shell = new THREE.Points(shellGeo, shellMat);
  shell.frustumCulled = false;
  g.add(shell);

  /* ring system — two hairline gyroscope rings + the score arc ring */
  var rings = new THREE.Group(); g.add(rings);
  var pivA = new THREE.Group(); pivA.rotation.set(1.25, 0, 0.15); pivA.add(circleLine(R * 1.62, 0x9a9a9a, 0.50)); rings.add(pivA);
  var pivB = new THREE.Group(); pivB.rotation.set(0.35, 0.5, 1.05); pivB.add(circleLine(R * 1.95, 0x9a9a9a, 0.30)); rings.add(pivB);
  var pivArc = new THREE.Group(); pivArc.rotation.set(1.05, -0.35, 0.2); rings.add(pivArc);
  var arcMat = new THREE.MeshBasicMaterial({ color:col, side:THREE.DoubleSide, transparent:true, opacity:0.95, fog:false });
  var arc = new THREE.Mesh(new THREE.RingGeometry(R * 1.58, R * 1.70, 96, 1, 0, 0.001), arcMat);
  pivArc.add(arc);
  var tick = new THREE.Mesh(new THREE.PlaneGeometry(R * 0.30, R * 0.075),
    new THREE.MeshBasicMaterial({ color:0xe30613, side:THREE.DoubleSide, transparent:true, opacity:0.95, fog:false }));
  tick.visible = false; pivArc.add(tick);

  /* the lock-on pulse: signal red, its one beat — an expanding ring
     in the arc plane at the moment of arrival */
  var pulse = new THREE.Mesh(new THREE.RingGeometry(R * 1.02, R * 1.06, 64),
    new THREE.MeshBasicMaterial({ color:0xe30613, side:THREE.DoubleSide, transparent:true, opacity:0, fog:false }));
  pulse.rotation.x = Math.PI / 2; g.add(pulse);

  /* satellites — the orbit system composed from the person's own
     record (api.bodies): their strongest on-map known associates
     first, then their canonical organizations, then their groups,
     filling to the cap of 8. Associates are tier-colored like the
     map; org/group bodies ride in the hero's own tier tint. Bodies
     and tags are sized to actually register on screen. */
  var sats = [], bodyRecs = [];
  var bodies = (api.bodies ? api.bodies(di)
    : api.hot(di).map(function(t){ return { k:'p', di:t }; })).slice(0, 8);
  bodies.forEach(function(b, i){
    var isP = b.k === 'p';
    var sdi = isP ? b.di : null;
    var nm = isP ? api.name(sdi) : b.n;
    var seed = isP ? sdi : 5000 + i * 131 + nm.length * 17;
    var pivot = new THREE.Group();
    pivot.rotation.set(hash01(seed * 3 + 1) * 1.9 - 0.95, hash01(seed * 5 + 2) * 1.2, hash01(seed * 7 + 3) * 1.9 - 0.95);
    g.add(pivot);
    var scol = isP ? new THREE.Color(api.tierCol(sdi))
                   : col.clone().lerp(new THREE.Color(0xffffff), 0.45);
    var spr = new THREE.Sprite(new THREE.SpriteMaterial({ map:st.dotTex, color:scol,
      transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending, fog:false }));
    var rad = R * (2.35 + 0.38 * i);
    spr.scale.set(isP ? 13 : 11.5, isP ? 13 : 11.5, 1);
    pivot.add(spr);
    var lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    var line = new THREE.Line(lgeo, new THREE.LineBasicMaterial({ color:0xffffff, transparent:true, opacity:0, fog:false }));
    line.frustumCulled = false;
    pivot.add(line);
    var tagEl = document.createElement('div');
    tagEl.className = 'f3-sattag' + (isP ? '' : ' og');
    tagEl.textContent = nm; tagEl.style.opacity = '0';
    if(!isP) tagEl.style.color = hex;
    var tag = new CSS2DObject(tagEl);
    tag.center.set(0.5, -0.6);
    pivot.add(tag);
    sats.push({ di:sdi, kind:b.k, name:nm, pivot:pivot, spr:spr, line:line, tag:tag, tagEl:tagEl,
      rad:rad, ang:hash01(seed * 11 + 4) * 6.2832, speed:(0.14 + 0.045 * i) * (hash01(seed * 13) < 0.5 ? 1 : -1),
      op:0 });
    bodyRecs.push({ k:b.k, n:nm });
  });
  /* the selection layer follows this hero: universe edges run to
     their on-map associates (people only — orgs/groups are not
     points in the universe), and the flare/packets take the tint */
  st.edgeDis = (api.edges ? api.edges(di) : api.hot(di)).slice(0, 8);
  if(st.flare) st.flare.material.color.set(hex);
  if(st.edgeLines) st.edgeLines.material.color.copy(col.clone().lerp(new THREE.Color(0xffffff), 0.35));
  if(st.packets) st.packets.forEach(function(pk){ pk.material.color.copy(col.clone().lerp(new THREE.Color(0xffffff), 0.25)); });

  st.viewGroup.add(g);
  st.hero = { di:di, group:g, core:core, coreMat:coreMat, atmoMat:atmoMat, shell:shell,
    pivA:pivA, pivB:pivB, pivArc:pivArc, arc:arc, arcMat:arcMat, tick:tick, pulse:pulse,
    sats:sats, R:R, score:score, pinned:pinned, anim:0, sweepShown:-1,
    mono:mono, monoEl:monoEl, bodies:bodyRecs };
  nodePos(api, di, g.position);
  g.scale.setScalar(0.03);
  fillPanel(st, di);
  return st.hero;
}

function shuffleBag(api, avoidDi, firstDi){
  var dis = api.nodes.map(function(n){ return n.di; });
  for(var i = dis.length - 1; i > 0; i--){
    var j = Math.floor(Math.random() * (i + 1)), t = dis[i]; dis[i] = dis[j]; dis[j] = t;
  }
  if(firstDi != null){
    var k = dis.indexOf(firstDi);
    if(k > 0){ dis.splice(k, 1); dis.unshift(firstDi); }
  } else if(dis.length > 1 && dis[0] === avoidDi){
    var t2 = dis[0]; dis[0] = dis[1]; dis[1] = t2;
  }
  return dis;
}
function bez(p0, p1, p2, t, out){
  var u = 1 - t;
  out.set(0, 0, 0)
    .addScaledVector(p0, u * u)
    .addScaledVector(p1, 2 * u * t)
    .addScaledVector(p2, t * t);
  return out;
}

var FLY3D = {
  active:false, busy:false,
  begin:function(api){ return stageBegin(api); },
  exit:function(){ stageExit(); },
  _forceQuality:function(q){ if(ST){ ST.forceQ = q; applyQuality(ST); } },
  /* harness-only: call a specific person next (the current call is
     cut short). JD never triggers this; it exists so the black-box
     suites can cast dense / sparse / org-only profiles on purpose. */
  _jump:function(di){
    if(!ST || !FLY3D.active) return;
    ST.jumpDi = di;
    if(ST.phase === 'orbit'){ ST.phase = 'linger'; ST.phaseT = T_LINGER - 0.05; }
    else if(ST.phase === 'linger'){ ST.phaseT = T_LINGER - 0.05; }
  },
  debug:function(){
    if(!ST) return { active:this.active, built:false };
    var plate = null;
    if(ST.panelEl && ST.wrap){
      var pr = ST.panelEl.getBoundingClientRect(), wr = ST.wrap.getBoundingClientRect();
      plate = { x:pr.left - wr.left, y:pr.top - wr.top, w:pr.width, h:pr.height,
        wrapW:wr.width, wrapH:wr.height,
        shown:ST.panelEl.classList.contains('in') };
    }
    return { active:this.active, built:true, phase:ST.phase, heroDi:ST.heroDi,
      calls:ST.callLog.slice(), quality:ST.quality, bloom:ST.bloomOn,
      azDeg:ST.azRel * 57.29578, fps:Math.round(ST.fps * 10) / 10,
      heroPx:ST.heroPx || null,
      dpr:ST.renderer ? ST.renderer.getPixelRatio() : 0,
      orbitR:ST.hero ? Math.round(orbitRadius(ST, ST.hero.R)) : 0,
      mono:ST.hero ? ST.hero.monoEl.textContent : null,
      monoOp:ST.hero ? parseFloat(ST.hero.monoEl.style.opacity || '0') : 0,
      bodies:ST.hero ? ST.hero.bodies : null,
      tags:ST.hero ? ST.hero.sats.map(function(s){ return s.name; }) : [],
      edges:(ST.edgeDis || []).slice(),
      edgeOp:ST.edgeLines ? Math.round(ST.edgeLines.material.opacity * 100) / 100 : 0,
      flareOp:ST.flare ? Math.round(ST.flare.material.opacity * 100) / 100 : 0,
      heroScale:ST.hero ? Math.round(ST.hero.group.scale.x * 1000) / 1000 : 0,
      boundPx:ST.boundPx ? Math.round(ST.boundPx) : 0,
      side:ST.panelSide || null,
      leader:ST.leaderEl ? parseFloat(ST.leaderEl.style.opacity || '0') : 0,
      plate:plate };
  }
};
window.FLY3D = FLY3D;

function stageBegin(api){
  if(FLY3D.active || FLY3D.busy) return false;
  var wrap = api.wrap; if(!wrap || !api.nodes.length || api.firstDi == null) return false;
  var st = ST;
  try {
    if(!st){
      st = { dotTex:dotTexture(), nebTex:nebTexture(), hero:null, universe:null, stars:[], nebulas:[] };
      st.renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false, powerPreference:'high-performance' });
      var ctx = st.renderer.getContext();
      if(!ctx || (ctx.isContextLost && ctx.isContextLost())){ st = null; return false; }
      st.css2d = new CSS2DRenderer();
      ST = st;
    }
  } catch(err){ ST = null; return false; }

  st.api = api; st.wrap = wrap;
  st.mobile = !!api.mobile;
  st.dead = false; st.exiting = false;
  st.anchorInit = false;
  if(st.scene){
    st.scene.traverse(function(o){
      if(o.geometry) o.geometry.dispose();
      if(o.material){ (Array.isArray(o.material) ? o.material : [o.material]).forEach(function(m){ m.dispose(); }); }
    });
    st.hero = null;
    if(st.css2d) st.css2d.domElement.innerHTML = '';
  }
  st.drift = 0; st.time = 0;
  st.phase = 'takeover'; st.phaseT = 0;
  st._edgeOp = 0; st._flareOp = 0;
  st.panelIn = false; st.panelSide = null; st.jumpDi = null; st.boundPx = 0;
  st.heroDi = api.firstDi; st.lastDi = api.lastDi;
  st.bag = shuffleBag(api, api.lastDi, api.firstDi); st.bi = 1; /* first entry is the person the canvas glided to */
  st.callLog = [api.firstDi];
  st.quality = 'full'; st.bloomOn = true; st.forceQ = null;
  st.fps = 60; st.fpsFrames = 0; st.fpsWindow = 0; st.qStage = 0;
  st.azRel = 0;

  /* --- DOM --- */
  var ov = document.createElement('div');
  ov.className = 'fly3d'; ov.id = 'fly3d';
  ov.setAttribute('aria-hidden', 'true');
  var glHost = document.createElement('div'); glHost.className = 'f3-gl';
  ov.appendChild(glHost);
  glHost.appendChild(st.renderer.domElement);
  /* the leader layer: an SVG hairline from the plate to the orb rim,
     above the GL canvas, below the CSS2D plates */
  var leader = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  leader.setAttribute('class', 'f3-leader');
  leader.innerHTML = '<line x1="0" y1="0" x2="0" y2="0"></line><circle r="2.5" cx="0" cy="0"></circle>';
  ov.appendChild(leader);
  st.leaderEl = leader;
  st.leaderLine = leader.querySelector('line');
  st.leaderDot = leader.querySelector('circle');
  st.css2d.domElement.className = 'f3-css2d';
  st.css2d.domElement.style.pointerEvents = 'none';
  ov.appendChild(st.css2d.domElement);
  var xb = document.createElement('button');
  xb.type = 'button'; xb.className = 'f3-exit'; xb.textContent = 'Exit';
  xb.setAttribute('aria-label', 'Exit Flyover');
  ov.appendChild(xb);
  wrap.appendChild(ov);
  st.overlay = ov;
  ov.addEventListener('pointerdown', function(){ stageExit(); });
  ov.addEventListener('wheel', function(){ stageExit(); }, { passive:true });
  xb.addEventListener('pointerdown', function(ev){ ev.stopPropagation(); stageExit(); });

  /* --- scene --- */
  var snap = api.cam();
  st.snap = snap;
  st.scene = new THREE.Scene();
  st.scene.background = new THREE.Color(0x0a0a0a);
  st.scene.fog = new THREE.FogExp2(0x0a0a0a, 0.00035);
  var base = Math.min(snap.W, snap.H) / 1500 * (snap.W < 600 ? 1.15 : 1);
  st.fov0 = 2 * Math.atan(snap.H / (1900 * base * snap.zoom)) * 57.29578;
  st.camera = new THREE.PerspectiveCamera(st.fov0, snap.W / Math.max(1, snap.H), 1, 14000);
  st.camera.position.set(0, 0, 0);
  st.viewGroup = new THREE.Group();
  st.viewGroup.position.z = -1070;
  st.scene.add(st.viewGroup);
  paintViewGroup(st);
  buildUniverse(st);
  buildStars(st);

  /* selection layer (identity pass): the called person's universe
     edges as light-up lines, packets that stream along them toward
     the hero, and the flare that marks their point before the orb
     assembles. Children of viewGroup: positions are the same local
     coordinates the point cloud uses. */
  var egeo = new THREE.BufferGeometry();
  egeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 2 * 3), 3));
  st.edgeLines = new THREE.LineSegments(egeo, new THREE.LineBasicMaterial({ color:0xffffff,
    transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false, fog:false }));
  st.edgeLines.frustumCulled = false;
  st.viewGroup.add(st.edgeLines);
  st.packets = [];
  for(var pi = 0; pi < 8; pi++){
    var pk = new THREE.Sprite(new THREE.SpriteMaterial({ map:st.dotTex, color:0xffffff,
      transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending, fog:false }));
    pk.scale.set(7, 7, 1); pk.frustumCulled = false; pk.visible = false;
    st.viewGroup.add(pk); st.packets.push(pk);
  }
  st.flare = new THREE.Sprite(new THREE.SpriteMaterial({ map:st.dotTex, color:0xffffff,
    transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending, fog:false }));
  st.flare.scale.set(20, 20, 1); st.flare.frustumCulled = false; st.flare.visible = false;
  st.viewGroup.add(st.flare);
  st.edgeDis = [];

  /* hero panel (CSS2D, always screen-upright) */
  var panel = document.createElement('div');
  panel.className = 'f3-plate';
  panel.innerHTML = '<b class="f3-name"></b><span class="f3-meta"><span class="f3-tier"></span><span class="f3-scorewrap"> · Score <b class="f3-num">0</b></span><span class="f3-pin"> · Pinned</span></span>' +
    '<span class="f3-fact f3-f1"></span><span class="f3-fact f3-f2"></span>';
  panel.style.pointerEvents = 'none';
  st.panelEl = panel;
  st.panelName = panel.querySelector('.f3-name');
  st.panelTier = panel.querySelector('.f3-tier');
  st.panelNum = panel.querySelector('.f3-num');
  st.panelScoreWrap = panel.querySelector('.f3-scorewrap');
  st.panelPin = panel.querySelector('.f3-pin');
  st.panelF1 = panel.querySelector('.f3-f1');
  st.panelF2 = panel.querySelector('.f3-f2');
  st.anchorObj = new THREE.Object3D();
  st.scene.add(st.anchorObj);
  var pobj = new CSS2DObject(panel);
  pobj.center.set(0.5, 1);
  st.anchorObj.add(pobj);
  st.panelObj = pobj;

  /* composer: threshold-selective bloom */
  st.composer = new EffectComposer(st.renderer);
  st.composer.addPass(new RenderPass(st.scene, st.camera));
  st.bloomPass = new UnrealBloomPass(new THREE.Vector2(snap.W, snap.H), 0.85, 0.55, 0.52);
  st.composer.addPass(st.bloomPass);
  st.composer.addPass(new OutputPass());

  buildOrb(st, st.heroDi);
  st.heroFrom = new THREE.Vector3();
  nodePos(api, st.heroDi, st.heroFrom);

  sizeStage(st);
  st.lastTs = 0;
  FLY3D.active = true; FLY3D.busy = false;
  requestAnimationFrame(function(){ ov.style.opacity = '1'; });
  st.raf = requestAnimationFrame(stageTick);
  return true;
}
function paintViewGroup(st){
  var s = st.snap;
  var qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -(s.yaw + st.drift));
  var qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), s.pitch);
  st.viewGroup.quaternion.copy(qx).multiply(qy);
  /* the canvas focus wander (fx/fy/cxOff) is ~0 by takeover (the
     roll-call glide zeroes it); fold what remains in at hero depth */
  var base = Math.min(s.W, s.H) / 1500 * (s.W < 600 ? 1.15 : 1);
  var kHero = 950 * base * s.zoom / 1070;
  st.viewGroup.position.set(-(s.cxOff + s.fx) / Math.max(0.2, kHero), (s.fy || 0) / Math.max(0.2, kHero), -1070);
}
function sizeStage(st){
  if(!st.wrap) return;
  var w = st.wrap.clientWidth || st.snap.W, h = st.wrap.clientHeight || st.snap.H;
  var dprCap = st.mobile ? 1.5 : 2;
  st.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
  st.renderer.setSize(w, h, false);
  st.composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
  st.composer.setSize(w, h);
  st.css2d.setSize(w, h);
  st.camera.aspect = w / Math.max(1, h);
  st.camera.updateProjectionMatrix();
}
function stageExit(){
  if(!FLY3D.active || !ST || ST.exiting) return;
  ST.exiting = true;
  ST.phase = 'exit'; ST.phaseT = 0;
  ST.exitFrom = ST.camera.position.clone();
  ST.exitFov = ST.camera.fov;
  collapsePanel(ST, true);
}
function finishExit(st){
  cancelAnimationFrame(st.raf);
  st.overlay.style.opacity = '0';
  var drift = st.drift;
  setTimeout(function(){
    if(st.overlay && st.overlay.parentNode) st.overlay.parentNode.removeChild(st.overlay);
    FLY3D.active = false; FLY3D.busy = false;
    if(st.api && st.api.onGone) st.api.onGone(drift);
  }, 330);
}
function teardown(st){
  cancelAnimationFrame(st.raf);
  if(st.overlay && st.overlay.parentNode) st.overlay.parentNode.removeChild(st.overlay);
  FLY3D.active = false; FLY3D.busy = false;
  ST = null;
}
function nextCall(st){
  if(st.jumpDi != null){
    var jd = st.jumpDi; st.jumpDi = null;
    if(jd !== st.heroDi && st.api.byDi[jd]) return jd;
  }
  var di = null;
  while(st.bi < st.bag.length){
    var cand = st.bag[st.bi++];
    if(st.api.byDi[cand]){ di = cand; break; }
  }
  if(di == null){
    st.bag = shuffleBag(st.api, st.lastDi, null); st.bi = 0;
    while(st.bi < st.bag.length){
      var c2 = st.bag[st.bi++];
      if(st.api.byDi[c2]){ di = c2; break; }
    }
  }
  return di;
}
function collapsePanel(st, fast){
  st.panelEl.classList.add('fast');
  st.panelEl.classList.remove('in');
  st.panelIn = false;
  st.hero && st.hero.sats.forEach(function(s){ s.op = 0; });
}

function paintUniverse(st){
  var nodes = st.api.nodes, pos = st.universePos;
  for(var i = 0; i < nodes.length; i++){
    var p = st.api.pos(nodes[i]);
    pos[i * 3] = p[0]; pos[i * 3 + 1] = -p[1]; pos[i * 3 + 2] = -p[2];
  }
  st.universe.geometry.attributes.position.needsUpdate = true;
}
function fillPanel(st, di){
  var api = st.api, e = api.entry(di), sc = api.score(di);
  st.panelName.textContent = api.name(di);
  st.panelTier.textContent = api.tierName(di) || 'No tier yet';
  st.panelScoreWrap.style.display = sc ? '' : 'none';
  st.panelPin.style.display = (sc && sc.pinned) ? '' : 'none';
  st.panelNum.textContent = '0';
  var f = api.facts(di);
  st.panelF1.textContent = f[0] || ''; st.panelF1.style.display = f[0] ? '' : 'none';
  st.panelF2.textContent = f[1] || ''; st.panelF2.style.display = f[1] ? '' : 'none';
  st.panelEl.classList.remove('fast');
  st.panelEl.classList.remove('in');
  st.panelIn = false; st.panelSide = null;
}
/* The plate belongs to the orb system: it anchors BESIDE the orb
   (never in a detached corner), its facing edge at the orb's
   bounding circle plus a leader gap. The bounding circle is the
   solid assembly — core, atmosphere, score arc — at 1.78 radii;
   the two outer gyroscope hairlines (1px, low opacity) sweep a
   wider ellipse and may pass behind the plate's far corner on
   smaller screens. The side is chosen once per call, at formation,
   by measured fit: viewport containment is the hard constraint,
   clearance the preference (left, then right, then below/above;
   portrait wraps go below/above first). */
function placePanel(st){
  var W = st.wrap.clientWidth || 900, H = st.wrap.clientHeight || 650;
  var pw = st.panelEl.offsetWidth || 248, ph = st.panelEl.offsetHeight || 150;
  var hp = st.heroPx || { x:W / 2, y:H / 2 }, bp = st.boundPx || 120, gap = 30;
  var fits = {
    left: hp.x - bp - gap - pw >= 4,
    right: hp.x + bp + gap + pw <= W - 4,
    below: hp.y + bp + gap + ph <= H - 4,
    above: hp.y - bp - gap - ph >= 4
  };
  var order = W < 620 ? ['below', 'above', 'left', 'right'] : ['left', 'right', 'below', 'above'];
  var side = order[0];
  for(var i = 0; i < order.length; i++){ if(fits[order[i]]){ side = order[i]; break; } }
  st.panelSide = side;
  st.panelObj.center.set(side === 'left' ? 1 : side === 'right' ? 0 : 0.5,
                         (side === 'left' || side === 'right') ? 0.5 : side === 'below' ? 0 : 1);
}
function panelShow(st){
  if(st.panelIn) return;
  st.panelIn = true;
  placePanel(st);
  st.panelEl.classList.add('in');
}
function applyQuality(st){
  var q = st.forceQ || st.quality;
  st.bloomOn = q === 'full';
  if(st.bloomPass) st.bloomPass.enabled = st.bloomOn;
  var lite = q === 'lite';
  st.stars.forEach(function(L, i){
    var n = lite ? Math.floor(L.full / 2) : L.full;
    L.pts.geometry.setDrawRange(0, n);
  });
  st.nebulas.forEach(function(sp){ sp.visible = !lite; });
  if(st.hero && st.hero.shell) st.hero.shell.visible = !lite;
}
function sampleFps(st, dt){
  st.fpsFrames++; st.fpsWindow += dt;
  if(st.qStage === 0 && st.time >= 2.0){
    st.fps = st.fpsFrames / Math.max(0.1, st.fpsWindow);
    st.quality = st.fps >= 45 ? 'full' : st.fps >= 30 ? 'nobleed' : 'lite';
    applyQuality(st);
    st.qStage = 1; st.fpsFrames = 0; st.fpsWindow = 0;
  } else if(st.qStage === 1 && st.time >= 6.0){
    var f2 = st.fpsFrames / Math.max(0.1, st.fpsWindow);
    st.fps = f2;
    var q2 = f2 >= 45 ? 'full' : f2 >= 30 ? 'nobleed' : 'lite';
    var rank = { full:0, nobleed:1, lite:2 };
    if(rank[q2] > rank[st.quality]){ st.quality = q2; applyQuality(st); }
    st.qStage = 2;
  }
}

/* camera geometry helpers (view space) */
var _hw = new THREE.Vector3(), _off = new THREE.Vector3(), _p1 = new THREE.Vector3(), _tgt = new THREE.Vector3();
var _ep = new THREE.Vector3(), _ep2 = new THREE.Vector3(), _bv = new THREE.Vector3();
function orbitOffset(az, el, R, out){
  return out.set(R * Math.cos(el) * Math.sin(az), R * Math.sin(el), R * Math.cos(el) * Math.cos(az));
}
function heroWorld(st, out){
  return st.hero.group.getWorldPosition(out);
}
/* orbit distance: the spec's visual target is the core at roughly a
   third to two-fifths of the frame height — 5.6 radii at the 48
   degree orbit FOV; wider still on narrow (portrait) wraps so the
   ring system stays in frame */
function orbitRadius(st, R){
  var a = st.camera ? st.camera.aspect : 1;
  var f = a < 0.8 ? 1.45 : a < 1.1 ? 1.2 : 1;
  return R * 5.6 * f;
}

function stageTick(ts){
  var st = ST; if(!st || st.dead) return;
  if(!document.contains(st.wrap)){ teardown(st); return; }
  if(st.exiting && st.phase !== 'exit'){ /* exit requested between frames */ }
  var dt = st.lastTs ? Math.min(0.05, Math.max(0, (ts - st.lastTs) / 1000)) : 0.016;
  st.lastTs = ts;
  st.time += dt; st.phaseT += dt;
  st.drift += st.api.driftRate * dt;
  paintViewGroup(st);
  paintUniverse(st);
  sampleFps(st, dt);

  var cam = st.camera, hero = st.hero;
  heroWorld(st, _hw);

  /* orb life */
  if(hero){
    hero.coreMat.uniforms.uTime.value = st.time;
    hero.atmoMat.uniforms.uBreathe.value = 0.85 + 0.15 * Math.sin(st.time * 1.5708);
    hero.shell.rotation.y -= dt * 0.05;
    hero.pivA.rotation.y = Math.sin(st.time * 0.21) * 0.4;
    hero.pivB.rotation.x = 0.35 + Math.sin(st.time * 0.16 + 1) * 0.35;
    hero.pivArc.rotation.y = Math.sin(st.time * 0.13 + 2) * 0.3;
    hero.group.position.copy(nodePos(st.api, hero.di, _tgt));
    var pulseT = st.phase === 'orbit' ? st.phaseT : 99;
    if(pulseT < 0.9){
      var pp = pulseT / 0.9;
      hero.pulse.scale.setScalar(1 + pp * 1.5);
      hero.pulse.material.opacity = 0.75 * (1 - pp);
    } else hero.pulse.material.opacity = 0;
  }

  switch(st.phase){
    case 'takeover': {
      /* the selection beat: the hero is still just their point in
         the universe — it flares, and their edges light up */
      st._flareOp = 1;
      st._edgeOp = 0.15 + 0.35 * clamp(st.phaseT / T_TAKEOVER, 0, 1);
      cam.position.set(0, 0, 0);
      cam.lookAt(_hw);
      if(st.phaseT >= T_TAKEOVER){
        st.phase = 'approach'; st.phaseT = 0;
        st.apFrom = cam.position.clone();
        st.apFromFov = cam.fov;
        var rel = _off.copy(cam.position).sub(_hw);
        st.az0 = Math.atan2(rel.x, rel.z);
        st.el0 = clamp(Math.asin(clamp(rel.y / Math.max(1, rel.length()), -1, 1)), 0.20, 0.55);
        st.orbitR = orbitRadius(st, hero.R);
        st.panelEl.classList.remove('in');
      }
      break;
    }
    case 'approach': {
      var t = easeInOut(clamp(st.phaseT / T_APPROACH, 0, 1));
      orbitOffset(st.az0, st.el0, st.orbitR, _tgt).add(_hw);
      _p1.copy(st.apFrom).lerp(_tgt, 0.5); _p1.y += st.apFrom.distanceTo(_tgt) * 0.12;
      bez(st.apFrom, _p1, _tgt, t, cam.position);
      cam.lookAt(_hw);
      cam.fov = lerp(st.apFromFov, 48, t); cam.updateProjectionMatrix();
      hero.anim = Math.min(1, hero.anim + dt / 1.1);
      st._flareOp = 1 - hero.anim;
      st._edgeOp = 0.30 + 0.25 * hero.anim;
      /* the name assembles WITH the formation: once the orb is
         mostly grown, its title plate builds in beside it */
      if(hero.anim >= 0.72) panelShow(st);
      if(st.phaseT >= T_APPROACH){
        st.phase = 'orbit'; st.phaseT = 0;
        panelShow(st);
      }
      break;
    }
    case 'orbit': case 'linger': {
      st._flareOp = 0;
      st._edgeOp = 0.30;
      var dur = st.phase === 'orbit' ? T_ORBIT : T_LINGER;
      var pt = clamp(st.phaseT / dur, 0, 1);
      var sw = smoother(pt);
      st.azRel = st.phase === 'orbit' ? ORBIT_SWEEP * sw : ORBIT_SWEEP + 0.55 * sw;
      var az = st.az0 + st.azRel;
      var el = st.el0 + Math.sin(pt * Math.PI) * 0.10;
      var rr = st.orbitR * (1 + 0.03 * Math.sin(pt * 6.2832));
      orbitOffset(az, el, rr, cam.position).add(_hw);
      cam.lookAt(_hw);
      /* info build: score count-up + arc sweep, keyed to orbit time */
      if(hero && hero.score != null){
        var sp2 = easeOut(clamp((st.phaseT - 0.5) / 0.8, 0, 1));
        if(st.phase === 'linger') sp2 = 1;
        var theta = Math.max(0.001, sp2 * (hero.score / 100) * Math.PI * 2);
        if(Math.abs(theta - hero.sweepShown) > 0.004){
          hero.sweepShown = theta;
          var old = hero.arc.geometry;
          hero.arc.geometry = new THREE.RingGeometry(hero.R * 1.58, hero.R * 1.70, 96, 1, 0, theta);
          old.dispose();
          var a = theta - Math.PI / 2;
          hero.tick.position.set(Math.cos(a) * hero.R * 1.64, Math.sin(a) * hero.R * 1.64, 0);
          hero.tick.rotation.z = a + Math.PI / 2;
          hero.tick.visible = hero.pinned;
        }
        st.panelNum.textContent = String(Math.round(hero.score * sp2));
      }
      /* satellites fade in from +1.5s of orbit */
      if(hero){
        var satIn = st.phase === 'linger' ? 1 : clamp((st.phaseT - 1.5) / 0.8, 0, 1);
        hero.sats.forEach(function(s){ s.op = satIn; });
      }
      if(st.phaseT >= dur){
        if(st.phase === 'orbit'){ st.phase = 'linger'; st.phaseT = 0; }
        else {
          var ndi = nextCall(st);
          if(ndi == null){ stageExit(); break; }
          var oldH = st.hero;
          var nh = buildOrb(st, ndi, true);
          nh.anim = 0;
          var nw = nodePos(st.api, ndi, new THREE.Vector3());
          st.viewGroup.localToWorld(nw);
          var rel2 = cam.position.clone().sub(nw);
          st.transit = { fromDi:st.heroDi, toDi:ndi, fromPos:cam.position.clone(),
            heroW0:_hw.clone(), oldHero:oldH, newHero:nh,
            az1:Math.atan2(rel2.x, rel2.z), el1:0.32, orbitR1:orbitRadius(st, nh.R), ctrl:null };
          st.heroDi = ndi; st.lastDi = ndi; st.callLog.push(ndi);
          st.phase = 'transit'; st.phaseT = 0;
          collapsePanel(st, true);
        }
      }
      break;
    }
    case 'transit': {
      var tr = st.transit, tt = clamp(st.phaseT / T_TRANSIT, 0, 1), te = easeInOut(tt);
      var nHeroW = nodePos(st.api, tr.toDi, _tgt);
      st.viewGroup.localToWorld(nHeroW);
      if(tr.oldHero){
        /* the departing orb collapses back into its universe point */
        var shrink = clamp(1 - tt / 0.28, 0, 1);
        tr.oldHero.group.scale.setScalar(Math.max(0.001, heroScale(tr.oldHero.anim) * shrink));
        tr.oldHero.coreMat.uniforms.uBright.value = shrink * tr.oldHero.anim;
        tr.oldHero.atmoMat.uniforms.uBright.value = shrink;
        tr.oldHero.monoEl.style.opacity = (shrink * easeOut(tr.oldHero.anim)).toFixed(3);
        if(tt >= 0.3 && tr.oldHero.group.parent){
          st.viewGroup.remove(tr.oldHero.group);
          tr.oldHero.group.traverse(function(o){
            if(o.geometry) o.geometry.dispose();
            if(o.material){ (Array.isArray(o.material) ? o.material : [o.material]).forEach(function(m){ m.dispose(); }); }
          });
          tr.oldHero = null;
        }
      }
      tr.newHero.anim = clamp((tt - 0.55) / 0.45, 0, 1);
      var ne2 = easeOut(tr.newHero.anim);
      tr.newHero.group.scale.setScalar(heroScale(tr.newHero.anim));
      tr.newHero.coreMat.uniforms.uBright.value = ne2;
      tr.newHero.atmoMat.uniforms.uBright.value = ne2;
      tr.newHero.monoEl.style.opacity = ne2.toFixed(3);
      /* the new person's point flares as their orb assembles, and
         their edges stream in with the growth */
      st._flareOp = tt < 0.5 ? 0 : 1 - tr.newHero.anim;
      st._edgeOp = 0.15 + 0.35 * tr.newHero.anim;
      if(tr.newHero.anim >= 0.72) panelShow(st);
      var dest = orbitOffset(tr.az1, tr.el1, tr.orbitR1, _p1).add(nHeroW);
      if(!tr.ctrl){
        tr.ctrl = tr.fromPos.clone().lerp(dest, 0.5);
        tr.ctrl.lerp(new THREE.Vector3(0, 0, 0), 0.42);
        tr.ctrl.y += tr.fromPos.distanceTo(dest) * 0.07;
      }
      bez(tr.fromPos, tr.ctrl, dest, te, cam.position);
      var look = tr.heroW0.clone().lerp(nHeroW, smoother(clamp((tt - 0.15) / 0.7, 0, 1)));
      cam.lookAt(look);
      if(st.phaseT >= T_TRANSIT){
        st.az0 = tr.az1; st.el0 = tr.el1; st.orbitR = tr.orbitR1; st.azRel = 0;
        st.phase = 'orbit'; st.phaseT = 0;
        st.transit = null;
        panelShow(st);
      }
      break;
    }
    case 'exit': {
      var xt = easeInOut(clamp(st.phaseT / T_EXIT, 0, 1));
      st._flareOp = 0;
      st._edgeOp = 0.30 * (1 - xt);
      _p1.copy(st.exitFrom).lerp(_tgt.set(0, 0, 0), 0.5);
      bez(st.exitFrom, _p1, _tgt.set(0, 0, 0), xt, cam.position);
      cam.lookAt(_hw);
      cam.fov = lerp(st.exitFov, st.fov0, xt); cam.updateProjectionMatrix();
      if(hero){
        hero.coreMat.uniforms.uBright.value = (1 - xt) * hero.anim;
        hero.atmoMat.uniforms.uBright.value = (1 - xt);
      }
      if(st.phaseT >= T_EXIT){ st.phase = 'gone'; finishExit(st); return; }
      break;
    }
  }

  /* hero assembly animation + satellite motion */
  if(hero && st.phase !== 'transit'){
    var e2 = easeOut(hero.anim);
    /* growth from the point; on exit the orb collapses back into it */
    var shrinkX = st.phase === 'exit' ? 1 - 0.97 * easeInOut(clamp(st.phaseT / T_EXIT, 0, 1)) : 1;
    hero.group.scale.setScalar(Math.max(0.001, heroScale(hero.anim) * shrinkX));
    if(st.phase !== 'exit'){
      hero.coreMat.uniforms.uBright.value = e2;
      hero.atmoMat.uniforms.uBright.value = e2;
    }
    hero.monoEl.style.opacity = (st.phase === 'exit'
      ? (1 - easeInOut(clamp(st.phaseT / T_EXIT, 0, 1))) * e2 : e2).toFixed(3);
    hero.sats.forEach(function(s){
      s.ang += s.speed * dt;
      var x = Math.cos(s.ang) * s.rad, z = Math.sin(s.ang) * s.rad;
      s.spr.position.set(x, 0, z);
      s.tag.position.set(x, 0, z);
      var lp = s.line.geometry.attributes.position.array;
      lp[0] = 0; lp[1] = 0; lp[2] = 0; lp[3] = x; lp[4] = 0; lp[5] = z;
      s.line.geometry.attributes.position.needsUpdate = true;
      /* facing fade: dim the tag when its satellite swings behind */
      var sw2 = s.spr.getWorldPosition(new THREE.Vector3());
      var toCam = _off.copy(cam.position).sub(_hw).normalize();
      var toSat = sw2.sub(_hw).normalize();
      var facing = toSat.dot(toCam);
      var base = s.op * (facing < -0.2 ? 0.25 : 1.0);
      s.tagEl.style.opacity = base.toFixed(3);
      s.spr.material.opacity = s.op * 0.95;
      s.line.material.opacity = s.op * 0.42;
    });
  }
  /* selection layer, applied: the hero's universe edges follow the
     live layout positions; packets stream from each associate's
     point toward the hero; the flare burns at the hero's point with
     the phase envelope (full while they are still just a point,
     gone once the orb has assembled) */
  if(st.edgeLines && hero){
    var hpL = nodePos(st.api, hero.di, _ep);
    var lpA = st.edgeLines.geometry.attributes.position.array;
    var eop = st._edgeOp || 0;
    for(var ei = 0; ei < 8; ei++){
      var tdi = st.edgeDis ? st.edgeDis[ei] : null;
      var tpL = (tdi != null && st.api.byDi[tdi]) ? nodePos(st.api, tdi, _ep2) : hpL;
      lpA[ei * 6] = hpL.x; lpA[ei * 6 + 1] = hpL.y; lpA[ei * 6 + 2] = hpL.z;
      lpA[ei * 6 + 3] = tpL.x; lpA[ei * 6 + 4] = tpL.y; lpA[ei * 6 + 5] = tpL.z;
      var pkt = st.packets[ei];
      if(tdi != null && eop > 0.02){
        pkt.visible = true;
        var frc = (st.time * 0.4 + ei * 0.173) % 1;
        pkt.position.lerpVectors(tpL, hpL, frc);
        pkt.material.opacity = eop * Math.sin(frc * Math.PI) * 0.95;
      } else pkt.visible = false;
    }
    st.edgeLines.geometry.attributes.position.needsUpdate = true;
    st.edgeLines.material.opacity = eop * 0.75;
    if(st.flare){
      st.flare.position.copy(hpL);
      var fop = st._flareOp || 0;
      st.flare.material.opacity = fop * 0.8;
      var fsc = 20 + 52 * fop;
      st.flare.scale.set(fsc, fsc, 1);
      st.flare.visible = fop > 0.02;
    }
  }

  /* panel anchor: beside the orb on the side placePanel chose at
     formation, its facing edge at the orb's bounding circle plus a
     leader gap; lerped so it rides with the system, never whips */
  var right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
  var up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
  var distH = Math.max(40, cam.position.distanceTo(_hw));
  var halfH = Math.tan(cam.fov * Math.PI / 360) * distH;
  var boundW = hero ? hero.R * 1.78 : 53;
  var gapW = 30 * (2 * halfH) / Math.max(1, st.wrap.clientHeight || 1);
  var pSide = st.panelSide || 'left';
  if(!st.panelSide) _tgt.copy(_hw).addScaledVector(up, boundW + gapW);
  else if(pSide === 'below') _tgt.copy(_hw).addScaledVector(up, -(boundW + gapW));
  else if(pSide === 'above') _tgt.copy(_hw).addScaledVector(up, boundW + gapW);
  else if(pSide === 'right') _tgt.copy(_hw).addScaledVector(right, boundW + gapW).addScaledVector(up, hero ? hero.R * 0.5 : 20);
  else _tgt.copy(_hw).addScaledVector(right, -(boundW + gapW)).addScaledVector(up, hero ? hero.R * 0.5 : 20);
  if(!st.anchorInit){ st.anchorObj.position.copy(_tgt); st.anchorInit = true; }
  else st.anchorObj.position.lerp(_tgt, 1 - Math.exp(-dt / 0.12));

  /* universe dressing: star layers turn at three rates, twinkle */
  st.stars.forEach(function(L, i){
    L.pts.rotation.y += L.rate * dt;
    L.mat.opacity = L.baseOp * (0.8 + 0.2 * Math.sin(st.time * (0.5 + i * 0.23) + i * 2.1));
  });

  if(st.bloomOn) st.composer.render();
  else st.renderer.render(st.scene, st.camera);
  st.css2d.render(st.scene, st.camera);
  /* harness probe: where the hero sits on screen this frame */
  var hv = _hw.clone().project(st.camera);
  st.heroPx = { x:(hv.x + 1) / 2 * (st.wrap.clientWidth || 1), y:(1 - hv.y) / 2 * (st.wrap.clientHeight || 1) };
  /* the orb assembly's projected bounding radius (core + arc) */
  _bv.copy(_hw).addScaledVector(right, boundW).project(st.camera);
  st.boundPx = Math.hypot((_bv.x + 1) / 2 * (st.wrap.clientWidth || 1) - st.heroPx.x,
                          (1 - _bv.y) / 2 * (st.wrap.clientHeight || 1) - st.heroPx.y);
  /* the leader: hairline from the plate's nearest edge point to
     the orb's rim, drawn only while the plate is built in */
  if(st.leaderEl){
    var showLeader = st.panelIn && !st.exiting && st.panelEl.classList.contains('in');
    if(showLeader){
      var wrL = st.wrap.getBoundingClientRect(), prL = st.panelEl.getBoundingClientRect();
      var hx = st.heroPx.x, hy = st.heroPx.y;
      var pcx = clamp(hx, prL.left - wrL.left, prL.right - wrL.left);
      var pcy = clamp(hy, prL.top - wrL.top, prL.bottom - wrL.top);
      var ldx = pcx - hx, ldy = pcy - hy, ldl = Math.max(1, Math.hypot(ldx, ldy));
      var rimX = hx + ldx / ldl * st.boundPx, rimY = hy + ldy / ldl * st.boundPx;
      st.leaderLine.setAttribute('x1', pcx.toFixed(1)); st.leaderLine.setAttribute('y1', pcy.toFixed(1));
      st.leaderLine.setAttribute('x2', rimX.toFixed(1)); st.leaderLine.setAttribute('y2', rimY.toFixed(1));
      st.leaderDot.setAttribute('cx', rimX.toFixed(1)); st.leaderDot.setAttribute('cy', rimY.toFixed(1));
      st.leaderEl.style.opacity = '0.85';
    } else st.leaderEl.style.opacity = '0';
  }
  st.raf = requestAnimationFrame(stageTick);
}

window.addEventListener('resize', function(){ if(ST && FLY3D.active) sizeStage(ST); });
document.addEventListener('fullscreenchange', function(){
  if(!ST || !FLY3D.active) return;
  ST.panelEl.classList.toggle('fs', !!document.fullscreenElement);
  sizeStage(ST);
});

})();
