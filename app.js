"use strict";
/* North Country Circle — full-screen desktop explorer.
   One flat aggregate network: every handle seen across the collected following
   lists is a node, every follow a directed edge. Custom navigation tools:
   search + fly-to, connection-count filter, hub highlighting, neighbor
   isolation, and shortest-path tracing back to JD. */
/* App version — one number shared by both apps (explorer + dossier); scheme
   and changelog live in VERSION.md at the repo root. MAJOR = design era
   (2 = Swiss Mono), MINOR = feature batch, PATCH = fixes and small tweaks. */
const APP_VERSION = "2.5.0";
const D = window.CIRCLE_DATA || {};
const PEOPLE = D.people || [];
const EDGES = D.edges || [];
const META = D.meta || {};
const N = PEOPLE.length;

/* ---------- graph ---------- */
const outAdj = Array.from({length: N}, () => []);
const inAdj = Array.from({length: N}, () => []);
const undAdj = Array.from({length: N}, () => []);
for (const [a, b] of EDGES) {
  if (a === b || a < 0 || b < 0 || a >= N || b >= N) continue;
  outAdj[a].push(b);
  inAdj[b].push(a);
  undAdj[a].push(b);
  undAdj[b].push(a);
}
const totalOf = i => PEOPLE[i].in_degree + PEOPLE[i].out_degree;
const maxTotal = Math.max(1, ...PEOPLE.map((_, i) => totalOf(i)));
const jdIndex = PEOPLE.findIndex(p => p.username === "jdmeyers_");
/* ChatGPT master-roster research overlay (data/research.js): researched
   people who are NOT in the dossier draw amber and grow with the amount on
   file; the research itself stays in the detail sidebar for everyone. */
const RES = window.RESEARCH || {};
const resOf = i => RES[PEOPLE[i].username] || null;
const resVis = i => { const r = resOf(i); return r && !r.dossier ? r : null; };
const resScale = i => { const r = resVis(i); return r ? Math.min(2.2, 1 + 0.35 * Math.sqrt(r.amount)) : 1; };
let RESN = 0;
for (let i = 0; i < N; i++) if (resVis(i)) RESN++;
/* Inferred names (display only): many nodes carry no real name. When a
   username decomposes cleanly into exactly two alphabetic tokens (split on
   '.' / '_' / camelCase, trailing digit block stripped), show it as a
   First Last name in purple — the color is the only signal. Never written
   to data, never used for research matching or counts. */
function inferName(u) {
  const s = String(u || "").replace(/\d+$/, "");
  if (!s) return null;
  const parts = [];
  for (const piece of s.split(/[._]+/)) {
    if (!piece) continue;
    const toks = piece
      .replace(/([a-z])([A-Z])/g, "$1\u0001$2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1\u0001$2")
      .split("\u0001");
    for (const t of toks) parts.push(t);
  }
  if (parts.length !== 2) return null;
  if (!parts.every(t => /^[A-Za-z]{2,}$/.test(t))) return null;
  return parts.map(t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()).join(" ");
}
const INF = PEOPLE.map(p => (p.name && p.name.trim()) ? null : inferName(p.username));
let INFN = 0;
for (let i = 0; i < N; i++) if (INF[i]) INFN++;
/* sort/display name parts: real name wins, then inferred, then username */
const FIRST = new Array(N), LAST = new Array(N);
for (let i = 0; i < N; i++) {
  const nm = (PEOPLE[i].name && PEOPLE[i].name.trim()) ? PEOPLE[i].name.trim() : INF[i];
  if (!nm) { FIRST[i] = LAST[i] = PEOPLE[i].username.toLowerCase(); continue; }
  const toks = nm.split(/\s+/);
  FIRST[i] = toks[0].toLowerCase();
  LAST[i] = toks[toks.length - 1].toLowerCase();
}
/* Dossier membership for the directory's dossier sort:Research entries carry
   a baked flag for the 255 matched people; everyone else is resolved against
   dossier.json's directory (same handle + normalized-name cross-walk the
   overlay build used), fetched lazily the first time the drawer opens. */
function normName(s) {
  return String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/^(dr|mr|mrs|ms|miss|rev) /, "");
}
let dossierHandles = null, dossierNames = null;
function loadDossierMembership() {
  if (dossierHandles) return;
  dossierHandles = new Set(); dossierNames = new Set();
  fetch("data/dossier.json").then(r => r.json()).then(dj => {
    for (const e of (dj.directory || [])) {
      const nm = String(e.name || "");
      if (nm && !nm.includes(":")) dossierHandles.add(nm);
      if (e.ig) dossierHandles.add(String(e.ig));
      const dn = normName(e.display);
      if (dn) dossierNames.add(dn);
    }
    if (!document.getElementById("directory").hidden) paintDir();
  }).catch(() => {});
}
function inDossier(i) {
  const r = resOf(i);
  if (r) return !!r.dossier;
  if (dossierHandles) {
    if (dossierHandles.has(PEOPLE[i].username)) return true;
    const nm = normName(PEOPLE[i].name);
    if (nm && dossierNames.has(nm)) return true;
  }
  return false;
}
const XS = new Float32Array(N), YS = new Float32Array(N);
for (let i = 0; i < N; i++) { XS[i] = PEOPLE[i].x; YS[i] = PEOPLE[i].y; }
/* per-frame screen positions, rebuilt once at the top of draw(): edges,
   nodes, and labels all read these instead of each recomputing rotation +
   projection for the same node over and over within one frame */
const SX = new Float32Array(N), SY = new Float32Array(N);
/* Ambient solar drift (design pass 2026-10-14): the whole layout slowly turns
   around its center — one revolution per 3 minutes. Rotation applies to node
   positions only (labels stay upright); hit-testing inverts it. The drift has
   an angular velocity that eases toward its target (full speed or zero) with
   a ~1s exponential ramp, so starting and stopping never jerk. Target is zero
   while a node is hovered, while a pointer is down/dragging, while a
   selection or path is up, and for ~5s after any other interaction; hovering
   empty space does not pause. Off under reduced motion. */
const REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
const COARSE = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
let viewRot = 0, lastAct = -10000, lastDrawn = 0;
let gestureActive = false; /* a pointer is down on the map (set in the pointer handlers) */
let rotVel = 0, lastStep = 0; /* current angular velocity (rad/ms) + ramp clock */
const DRIFT_MS = Math.PI * 2 / 180000; /* radians per millisecond */
const RAMP_TAU = 1000; /* ms — velocity easing time constant */
/* rotation trig cached per viewRot value: RX/RY are called ~200k times per
   frame (every edge endpoint + node), and recomputing cos/sin on every call
   was a measurable slice of the frame cost on phone CPUs */
let _rc = 1, _rs = 0, _rFor = NaN;
function rotCS() { if (_rFor !== viewRot) { _rFor = viewRot; _rc = Math.cos(viewRot); _rs = Math.sin(viewRot); } }
function RX(i) { rotCS(); return XS[i] * _rc - YS[i] * _rs; }
function RY(i) { rotCS(); return XS[i] * _rs + YS[i] * _rc; }
function invRot(x, y) { rotCS(); return [x * _rc + y * _rs, -x * _rs + y * _rc]; }
/* top hubs for highlight mode */
const hubSet = new Set(
  PEOPLE.map((p, i) => i).sort((a, b) => totalOf(b) - totalOf(a)).slice(0, 80)
);
/* long-range bridges: the edges spanning furthest across the layout —
   these are the interesting cross-community connections */
const edgeLen = new Float32Array(EDGES.length);
for (let e = 0; e < EDGES.length; e++) {
  const a = EDGES[e][0], b = EDGES[e][1];
  edgeLen[e] = (a === b || a < 0 || b < 0 || a >= N || b >= N) ? 0
    : Math.hypot(XS[a] - XS[b], YS[a] - YS[b]);
}
const bridgeThresh = (() => {
  const s = Array.from(edgeLen).sort((x, y) => y - x);
  return s[Math.min(149, s.length - 1)] || 0;
})();
let bridgeMode = false;
let bridgeList = [];
let selectedBridge = -1;
function buildBridgeList() {
  bridgeList = [];
  if (bridgeThresh <= 0) return;
  for (let e = 0; e < EDGES.length; e++) {
    if (edgeLen[e] < bridgeThresh) continue;
    const a = EDGES[e][0], b = EDGES[e][1];
    if (!visible[a] || !visible[b]) continue;
    bridgeList.push({a, b, len: edgeLen[e]});
  }
  bridgeList.sort((x, y) => y.len - x.len);
}
function renderBridgePanel() {
  const el = document.getElementById("bridges-panel");
  const list = document.getElementById("bridges-list");
  el.hidden = !bridgeMode;
  if (!bridgeMode) return;
  const rows = bridgeList.slice(0, 40);
  list.innerHTML = rows.length ? rows.map((br, k) => `
    <button class="brow${k === selectedBridge ? " on" : ""}" data-k="${k}">
      <span class="u">@${esc(PEOPLE[br.a].username)}</span><span class="bsep">↔</span><span class="u">@${esc(PEOPLE[br.b].username)}</span>
    </button>`).join("")
    : `<div class="note">No long-range bridges among the visible people.</div>`;
  list.querySelectorAll(".brow").forEach(b => b.addEventListener("click", () => {
    const k = +b.dataset.k, br = bridgeList[k];
    selectedBridge = k;
    flyToXY((RX(br.a) + RX(br.b)) / 2, (RY(br.a) + RY(br.b)) / 2);
    addLayer(br.a);
    renderBridgePanel();
  }));
}

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function igLink(u) { return `<a href="https://www.instagram.com/${esc(u)}/" target="_blank" rel="noopener">@${esc(u)}</a>`; }
/* display name as HTML: real name plain, inferred name purple, else username */
function nameHTML(i) {
  const p = PEOPLE[i];
  if (p.name && p.name.trim()) return esc(p.name);
  if (INF[i]) return `<span class="infname">${esc(INF[i])}</span>`;
  return esc(p.username);
}

/* ---------- canvas + view ---------- */
const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");
let W = 0, H = 0, dpr = 1;
let scale = 1, ox = 0, oy = 0, baseScale = 1, SMIN = 1, SMAX = 1;
const w2sX = x => ox + x * scale, w2sY = y => oy + y * scale;
const s2wX = x => (x - ox) / scale, s2wY = y => (y - oy) / scale;
const clampScale = s => Math.min(SMAX, Math.max(SMIN, s));

function fitView() {
  baseScale = Math.min(W, H) / 2.25;
  SMIN = Math.min(W, H) / 8;
  SMAX = 10 * Math.min(W, H) / 2.25;
  scale = baseScale; ox = W / 2; oy = H / 2;
}
let sized = false;
function resize() {
  /* Preserve the view across resizes. On a phone, resize almost never means
     "re-fit the map": it fires because the browser chrome moved (URL bar
     showing/hiding changes innerHeight) or the keyboard opened/closed. The
     old code called fitView() here, so any of those snapped the user's
     pan/zoom back to the fitted view mid-use — the "big circle glitch."
     Instead: update the scale limits for the new viewport and keep the same
     world point at the center of the screen. Only the very first sizing
     (and the Reset button, via fitView) fits the view. */
  const wx = W ? s2wX(W / 2) : 0, wy = H ? s2wY(H / 2) : 0;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  baseScale = Math.min(W, H) / 2.25;
  SMIN = Math.min(W, H) / 8;
  SMAX = 10 * Math.min(W, H) / 2.25;
  if (!sized) { sized = true; scale = baseScale; ox = W / 2; oy = H / 2; }
  else {
    scale = clampScale(scale);
    ox = W / 2 - wx * scale;
    oy = H / 2 - wy * scale;
  }
  draw();
}
function scheduleResize() { clearTimeout(window.__rzT); window.__rzT = setTimeout(resize, 120); }
window.addEventListener("resize", scheduleResize);
window.addEventListener("orientationchange", scheduleResize);
if (window.visualViewport) window.visualViewport.addEventListener("resize", scheduleResize);

/* ---------- filter / tool state ---------- */
const visible = new Uint8Array(N).fill(1);
let visibleCount = N;
let minConn = 0, fJd = false, fList = false, isolate = false, hubMode = false, fLabels = true;
let resFilter = false; /* amber-set isolation: ghost everything except researched-not-in-dossier */
let layers = [], hover = -1;
const curSel = () => layers.length ? layers[layers.length - 1] : -1;
let pathNodes = null, pathSet = null, pathEdgeSet = null;

function applyFilters() {
  let vc = 0;
  for (let i = 0; i < N; i++) {
    const p = PEOPLE[i];
    let v = totalOf(i) >= minConn;
    if (v && fJd) v = !!p.jd_follows;
    if (v && fList) v = !!p.has_list;
    visible[i] = v ? 1 : 0;
    if (v) vc++;
  }
  visibleCount = vc;
  document.getElementById("vis-count").textContent =
    `${vc.toLocaleString()} of ${N.toLocaleString()} people shown`;
  updateStats();
  if (bridgeMode) { buildBridgeList(); renderBridgePanel(); }
  draw();
  scheduleDirPaint();
}
function updateStats() {
  const parts = [`${N.toLocaleString()} people`, `${EDGES.length.toLocaleString()} connections`];
  if (visibleCount !== N) parts.push(`${visibleCount.toLocaleString()} shown`);
  if (META.synced_at) parts.push(`synced ${esc(META.synced_at)}`);
  document.getElementById("stats").innerHTML = parts.join(" &middot; ");
  const rc = document.getElementById("rescount");
  if (rc) rc.textContent = RESN ? `(${RESN} people)` : "";
  const rn = document.getElementById("resfilter-n");
  if (rn) rn.textContent = RESN ? `(${RESN})` : "";
  const drn = document.getElementById("d-resfilter-n");
  if (drn) drn.textContent = RESN ? `(${RESN})` : "";
}
/* ---------- shared filter state: Navigate panel + Directory mirror ----------
   One set of state variables; both control sets write through the setters
   below and syncFilterUI() pushes the state back into both control sets, so
   a change made anywhere is reflected (and reversible) everywhere. */
let dirPaintTimer = 0;
function scheduleDirPaint() {
  const dr = document.getElementById("directory");
  if (!dr || dr.hidden) return;
  clearTimeout(dirPaintTimer);
  dirPaintTimer = setTimeout(paintDir, 50);
}
function syncFilterUI() {
  for (const pre of ["", "d-"]) {
    const mc = document.getElementById(pre + "minconn");
    if (mc) mc.value = minConn;
    const mv = document.getElementById(pre + "minconn-val");
    if (mv) mv.textContent = minConn.toLocaleString();
    const set = (id, v) => { const el = document.getElementById(pre + id); if (el) el.checked = v; };
    set("f-jd", fJd); set("f-list", fList); set("f-resfilter", resFilter);
    set("f-isolate", isolate); set("f-labels", fLabels);
  }
}
function setMinConn(v) { minConn = v; syncFilterUI(); applyFilters(); }
function setFJd(v) { fJd = v; syncFilterUI(); applyFilters(); }
function setFList(v) { fList = v; syncFilterUI(); applyFilters(); }
function setResFilter(v) {
  resFilter = v; syncFilterUI();
  if (resFilter && hover >= 0 && !resVis(hover)) { hover = -1; tip.hidden = true; }
  draw();
  scheduleDirPaint();
}
function setIsolate(v) { isolate = v; syncFilterUI(); draw(); }
function setFLabels(v) { fLabels = v; syncFilterUI(); draw(); }

/* ---------- renderer ---------- */
const rad = i => (2 + 7 * Math.sqrt(totalOf(i) / maxTotal)) * resScale(i);

function draw() {
  ctx.clearRect(0, 0, W, H);
  /* one position pass per frame: rotate + project every node once into
     SX/SY; the edge, node, and label passes below all read those */
  rotCS();
  for (let i = 0; i < N; i++) {
    SX[i] = ox + (XS[i] * _rc - YS[i] * _rs) * scale;
    SY[i] = oy + (XS[i] * _rs + YS[i] * _rc) * scale;
  }
  /* text is the slowest canvas op per item; on touch devices the name
     labels pause while a gesture is in flight (they repaint on release
     via endPointer's final draw). Desktop rendering is unchanged. */
  const gesturing = COARSE && gestureActive;

  /* highlight set: layered nodes + their neighbors (+ hover), or the JD path */
  const hi = new Set();
  if (pathSet) { for (const i of pathSet) hi.add(i); }
  else {
    for (const s of layers) {
      hi.add(s);
      for (const j of outAdj[s]) hi.add(j);
      for (const j of inAdj[s]) hi.add(j);
    }
    if (hover >= 0) {
      hi.add(hover);
      for (const j of outAdj[hover]) hi.add(j);
      for (const j of inAdj[hover]) hi.add(j);
    }
  }
  const layerSet = new Set(layers);
  const dim = hi.size > 0;

  /* edges, batched in as few strokes as possible */
  const drawEdges = (onlyHi, style, width, pred) => {
    ctx.strokeStyle = style; ctx.lineWidth = width; ctx.beginPath();
    let n = 0;
    for (const [a, b] of EDGES) {
      if (!visible[a] || !visible[b]) continue;
      const bothHi = hi.has(a) && hi.has(b);
      if (onlyHi ? !bothHi : (dim && bothHi)) continue;
      if (pred && !pred(a, b)) continue;
      const ax = SX[a], ay = SY[a], bx = SX[b], by = SY[b];
      if ((ax < -30 || ax > W + 30 || ay < -30 || ay > H + 30) &&
          (bx < -30 || bx > W + 30 || by < -30 || by > H + 30)) continue;
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      if (++n > 60000) break;
    }
    ctx.stroke();
  };
  if (pathSet) {
    drawEdges(false, "rgba(255,255,255,0.05)", 1);
    /* path edges in amber */
    ctx.strokeStyle = "rgba(245,185,66,0.85)"; ctx.lineWidth = 2.5; ctx.beginPath();
    for (const key of pathEdgeSet) {
      const a = Math.floor(key / N), b = key % N;
      ctx.moveTo(SX[a], SY[a]);
      ctx.lineTo(SX[b], SY[b]);
    }
    ctx.stroke();
  } else if (dim) {
    if (resFilter) {
      /* ghost pass: all non-highlight edges near-invisible; highlight edges
         between two amber-set people stay amber, other highlight edges ice */
      drawEdges(false, "rgba(255,255,255,0.018)", 1);
      drawEdges(true, "rgba(245,185,66,0.50)", 1, (a, b) => !!resVis(a) && !!resVis(b));
      drawEdges(true, "rgba(255,255,255,0.22)", 1, (a, b) => !(resVis(a) && resVis(b)));
    } else {
      drawEdges(false, "rgba(255,255,255,0.03)", 1);
      drawEdges(true, "rgba(255,255,255,0.38)", 1);
    }
  } else {
    drawEdges(false, resFilter ? "rgba(255,255,255,0.018)" : (bridgeMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.06)"), 1);
  }

  /* long-range bridges: glow underlay + bright core, selected one in amber */
  if (bridgeMode && bridgeThresh > 0) {
    for (const [style, w] of [["rgba(255,255,255,0.06)", 6], ["rgba(255,255,255,0.7)", 2]]) {
      ctx.strokeStyle = style;
      ctx.lineWidth = w;
      ctx.beginPath();
      for (let e = 0; e < EDGES.length; e++) {
        if (edgeLen[e] < bridgeThresh) continue;
        const a = EDGES[e][0], b = EDGES[e][1];
        if (!visible[a] || !visible[b]) continue;
        ctx.moveTo(SX[a], SY[a]);
        ctx.lineTo(SX[b], SY[b]);
      }
      ctx.stroke();
    }
    const sb = bridgeList[selectedBridge];
    if (sb && visible[sb.a] && visible[sb.b]) {
      ctx.strokeStyle = "#e30613";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(SX[sb.a], SY[sb.a]);
      ctx.lineTo(SX[sb.b], SY[sb.b]);
      ctx.stroke();
    }
  }

  /* nodes */
  for (let i = 0; i < N; i++) {
    if (!visible[i]) continue;
    if (isolate && layers.length > 0 && !hi.has(i)) continue;
    const x = SX[i], y = SY[i];
    if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
    const isHi = !dim || hi.has(i);
    const r = rad(i);
    const res = resVis(i);
    if (res && (isHi || resFilter)) {
      ctx.beginPath();
      ctx.arc(x, y, r * 2.15, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(245,185,66,0.14)";
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (resFilter) ctx.fillStyle = res ? "#f5b942" : "rgba(255,255,255,0.05)";
    else if (pathSet && pathSet.has(i)) ctx.fillStyle = "#f5b942";
    else if (res) ctx.fillStyle = isHi ? "#f5b942" : "rgba(245,185,66,0.25)";
    else if (hubMode && hubSet.has(i)) ctx.fillStyle = isHi ? "#ffffff" : "rgba(255,255,255,0.35)";
    else ctx.fillStyle = isHi ? "#d4d4d4" : "rgba(195,195,195,0.26)";
    ctx.fill();
    if (i === jdIndex || layerSet.has(i) || i === hover || (hubMode && hubSet.has(i) && isHi)) {
      ctx.lineWidth = i === jdIndex ? 2.5 : 2;
      ctx.strokeStyle = i === jdIndex ? "#e30613" : (hubMode && hubSet.has(i) && !layerSet.has(i) && i !== hover ? "rgba(255,255,255,0.85)" : "#e30613");
      ctx.stroke();
    }
  }

  /* default labels: JD + big nodes when zoomed in (toggleable in Filters) —
     all label passes skip while a touch gesture is in flight (see above) */
  if (!gesturing) {
  ctx.font = "11px Archivo,sans-serif";
  ctx.textAlign = "center";
  const labelZoom = baseScale * 6;
  if (fLabels && jdIndex >= 0 && visible[jdIndex]) {
    ctx.fillStyle = "#f2f2f2";
    ctx.fillText("@jdmeyers_", SX[jdIndex], SY[jdIndex] - rad(jdIndex) - 5);
  }
  /* big-node labels when zoomed in */
  if (fLabels && scale >= labelZoom) {
    ctx.fillStyle = "rgba(219,226,238,0.85)";
    let drawn = 0;
    const cutoff = totalOf([...hubSet][79]);
    for (let i = 0; i < N && drawn < 220; i++) {
      if (!visible[i] || totalOf(i) < cutoff) continue;
      if (resFilter && !resVis(i)) continue;
      const x = SX[i], y = SY[i];
      if (x < 0 || y < 0 || x > W || y > H) continue;
      ctx.fillText("@" + PEOPLE[i].username, x, y - rad(i) - 4);
      drawn++;
    }
  }

  /* labels for every connection of each layered person */
  if (layers.length) {
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    for (const s of layers) {
      const nbs = undAdj[s].filter(j => visible[j] && j !== s)
        .sort((a, b) => totalOf(b) - totalOf(a)).slice(0, 80);
      for (const j of nbs) {
        const x = SX[j], y = SY[j];
        if (x < 0 || y < 0 || x > W || y > H) continue;
        ctx.fillText("@" + PEOPLE[j].username, x, y - rad(j) - 4);
      }
    }
  }
  }
}

function nearest(mx, my, resOnly) {
  const wx = s2wX(mx), wy = s2wY(my);
  const tol = 18 / scale, tol2 = tol * tol;
  let best = -1, bd = tol2;
  for (let i = 0; i < N; i++) {
    if (!visible[i]) continue;
    if (resOnly && !resVis(i)) continue;
    const dx = RX(i) - wx, dy = RY(i) - wy;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/* ---------- pointer interaction ---------- */
const tip = document.getElementById("tooltip");
const posOf = e => {
  const r = canvas.getBoundingClientRect();
  return {x: e.clientX - r.left, y: e.clientY - r.top};
};
/* Gesture-driven draws coalesce onto rAF: a fast finger (or a trackpad
   wheel) can fire far more events than the display can show, and one full
   draw is a whole frame of work — extra events only need to move the
   target transform, not each repaint the world. */
let drawQueued = false;
function drawSoon() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
function zoomAt(mx, my, f) {
  const ns = clampScale(scale * f);
  ox = mx - (mx - ox) * (ns / scale);
  oy = my - (my - oy) * (ns / scale);
  scale = ns;
  drawSoon();
}
/* smooth fly-to animation */
let flyAnim = null;
function flyTo(i, targetScale) {
  flyToXY(RX(i), RY(i), targetScale);
}
function flyToXY(wx, wy, targetScale) {
  lastAct = performance.now();
  if (flyAnim) cancelAnimationFrame(flyAnim);
  const ts = clampScale(targetScale || Math.max(scale, baseScale) * 3.2);
  const tx = W / 2 - wx * ts, ty = H / 2 - wy * ts;
  const s0 = scale, ox0 = ox, oy0 = oy, t0 = performance.now(), dur = 450;
  const step = t => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    scale = s0 + (ts - s0) * e;
    ox = ox0 + (tx - ox0) * e;
    oy = oy0 + (ty - oy0) * e;
    draw();
    if (k < 1) flyAnim = requestAnimationFrame(step);
    else flyAnim = null;
  };
  flyAnim = requestAnimationFrame(step);
}

function setHover(mx, my, cx, cy) {
  /* with the amber filter on, hover only "sees" filtered nodes: ghosted
     nodes get no tooltip and no hover highlight (clicks still hit them) */
  const h = nearest(mx, my, resFilter);
  if (h !== hover) { hover = h; draw(); }
  if (h >= 0) {
    const p = PEOPLE[h];
    tip.hidden = false;
    tip.style.left = (cx + 14) + "px";
    tip.style.top = (cy + 10) + "px";
    tip.innerHTML = `<strong>${nameHTML(h)}</strong><br>@${esc(p.username)} &middot; ${totalOf(h)} connections`;
    canvas.style.cursor = "pointer";
  } else {
    tip.hidden = true;
    canvas.style.cursor = "default";
  }
}

const pts = new Map();
let mode = "idle", activeNode = -1, startX = 0, startY = 0;
let moved = false, downT = 0, pinch = null;
const TAP_MS = 400, TAP_PX = 9;
const pdist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

canvas.addEventListener("pointerdown", e => {
  lastAct = performance.now();
  gestureActive = true;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  const p = posOf(e);
  pts.set(e.pointerId, p);
  if (flyAnim) { cancelAnimationFrame(flyAnim); flyAnim = null; }
  if (pts.size === 1) {
    const h = nearest(p.x, p.y);
    mode = (e.shiftKey || h < 0) ? "pan" : "node";
    activeNode = h; startX = p.x; startY = p.y;
    moved = false; downT = Date.now(); pinch = null;
  } else if (pts.size === 2) {
    const [a, b] = [...pts.values()];
    pinch = {d: pdist(a, b), scale, ox, oy, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2};
    mode = "pinch"; moved = true; activeNode = -1;
    tip.hidden = true;
  }
});
canvas.addEventListener("pointermove", e => {
  if (!pts.has(e.pointerId)) {
    if (e.pointerType === "mouse") { const p = posOf(e); setHover(p.x, p.y, e.clientX, e.clientY); }
    return;
  }
  const p = posOf(e), prev = pts.get(e.pointerId);
  pts.set(e.pointerId, p);
  if (mode === "pinch" && pts.size >= 2 && pinch && pinch.d > 0) {
    const [a, b] = [...pts.values()];
    const d = pdist(a, b);
    if (d > 0) {
      const ns = clampScale(pinch.scale * d / pinch.d);
      const f = ns / scale;
      ox = pinch.cx - (pinch.cx - pinch.ox) * f;
      oy = pinch.cy - (pinch.cy - pinch.oy) * f;
      scale = ns;
      drawSoon();
    }
    return;
  }
  if (Math.hypot(p.x - startX, p.y - startY) > TAP_PX) moved = true;
  /* Touch has no Shift key, so a touch drag that starts on a dot must pan the
     map — otherwise the drag just moves that one dot and the map feels stuck.
     Mouse keeps the old behavior (drag a dot to move it, Shift+drag pans);
     taps are unaffected either way: a tap never sets `moved`. */
  if (mode === "node" && moved && e.pointerType !== "mouse") mode = "pan";
  if (mode === "node" && activeNode >= 0 && moved) {
    const un = invRot(s2wX(p.x), s2wY(p.y));
    XS[activeNode] = un[0];
    YS[activeNode] = un[1];
    drawSoon();
    return;
  }
  if (mode === "pan" && moved) {
    ox += p.x - prev.x; oy += p.y - prev.y;
    drawSoon();
    return;
  }
  if (e.pointerType === "mouse" && !moved) setHover(p.x, p.y, e.clientX, e.clientY);
});
function endPointer(e) {
  const wasSingle = pts.size === 1;
  const tap = wasSingle && !moved && (Date.now() - downT) < TAP_MS;
  pts.delete(e.pointerId);
  if (pts.size === 0) {
    if (tap && mode === "node" && activeNode >= 0) {
      if (layers.includes(activeNode)) removeLayer(activeNode);
      else addLayer(activeNode);
    }
    else if (tap && mode === "pan" && pathSet) { clearPath(); draw(); }
    gestureActive = false;
    draw(); /* full repaint on release: labels (paused mid-gesture) return */
    mode = "idle"; activeNode = -1; pinch = null;
  } else if (pts.size === 1) {
    const p = [...pts.values()][0];
    startX = p.x; startY = p.y; moved = false; downT = Date.now();
    const h = nearest(p.x, p.y);
    mode = (!e.shiftKey && h >= 0) ? "node" : "pan"; activeNode = h; pinch = null;
  }
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("pointerleave", e => {
  if (!pts.has(e.pointerId) && e.pointerType === "mouse") { tip.hidden = true; hover = -1; draw(); }
});
canvas.addEventListener("contextmenu", e => e.preventDefault());
/* iOS Safari page-zoom gestures start on whatever the fingers land on —
   HUD chrome included; touch-action:none covers the canvas only. The
   explorer is a full-screen tool: the page itself must never zoom, all
   pinch belongs to the map. (gesturestart is Mobile Safari's event.) */
document.addEventListener("gesturestart", e => e.preventDefault());
document.addEventListener("gesturechange", e => e.preventDefault());
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  lastAct = performance.now();
  const p = posOf(e);
  zoomAt(p.x, p.y, e.deltaY < 0 ? 1.15 : 1 / 1.15);
}, {passive: false});
canvas.addEventListener("dblclick", e => {
  const p = posOf(e);
  const h = nearest(p.x, p.y);
  if (h >= 0) flyTo(h, scale * 2.2);
  else zoomAt(p.x, p.y, 1.6);
});

/* ---------- selection + detail panel ---------- */
function connListHTML(arr) {
  const cap = 40;
  return arr.slice(0, cap).map(j =>
    `<div class="conn" data-i="${j}"><strong>${nameHTML(j)}</strong> <span class="note">@${esc(PEOPLE[j].username)}</span></div>`).join("")
    + (arr.length > cap ? `<div class="note" style="padding:4px 8px">+${arr.length - cap} more</div>` : "");
}
/* ---------- breadcrumb trail: hop person -> person through following lists ---------- */
let trail = [];
/* ---------- stackable selection layers ---------- */
function pushTrail(i) {
  if (trail[trail.length - 1] !== i) {
    trail.push(i);
    if (trail.length > 12) trail.shift();
  }
  renderTrail();
}
function addLayer(i, push = true) {
  if (i < 0) return;
  if (push) pushTrail(i);
  if (!layers.includes(i)) layers.push(i);
  clearPath();
  draw();
  renderDetail();
  renderLayers();
}
function removeLayer(i) {
  layers = layers.filter(j => j !== i);
  draw();
  renderDetail();
  renderLayers();
}
function clearLayers() {
  layers = [];
  draw();
  renderDetail();
  renderLayers();
}
function renderLayers() {
  const el = document.getElementById("layers");
  if (!layers.length) { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  el.innerHTML = layers.map(j =>
    `<span class="lchip" data-j="${j}">@${esc(PEOPLE[j].username)}<button data-j="${j}" title="Remove this layer">×</button></span>`
  ).join("") + `<button class="layers-clear" id="layers-clear">Clear all</button>`;
  el.querySelectorAll(".lchip").forEach(c => c.addEventListener("click", e => {
    const j = +c.dataset.j;
    if (e.target.tagName === "BUTTON") removeLayer(j);
    else flyTo(j);
  }));
  document.getElementById("layers-clear").addEventListener("click", clearLayers);
}
function renderTrail() {
  const el = document.getElementById("trail");
  if (trail.length < 2) { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  el.innerHTML = trail.map((j, k) =>
    `<button class="crumb${k === trail.length - 1 ? " cur" : ""}" data-k="${k}">@${esc(PEOPLE[j].username)}</button>${k < trail.length - 1 ? `<span class="sep">→</span>` : ""}`
  ).join("") + `<button class="trail-x" title="Clear trail">×</button>`;
  el.querySelectorAll(".crumb").forEach(b => b.addEventListener("click", () => {
    const k = +b.dataset.k;
    trail = trail.slice(0, k + 1);
    flyTo(trail[k]);
    addLayer(trail[k], false);
    renderTrail();
  }));
  el.querySelector(".trail-x").addEventListener("click", () => { trail = []; renderTrail(); });
}
function listStatusText(p) {
  switch (p.list_status) {
    case "complete": return " &middot; list complete";
    case "partial-bounded": return " &middot; list partial";
    case "exhausted-mismatch": return " &middot; list partial (header mismatch)";
    case "private": return " &middot; private — no list";
    case "failed": return " &middot; capture failed";
    default: return "";
  }
}
function researchHTML(i) {
  const r = resOf(i);
  if (!r) return "";
  const items = r.findings.map(f => {
    const links = f.sources.map((s, k) =>
      `<a href="${esc(s)}" target="_blank" rel="noopener">${f.sources.length > 1 ? "Source " + (k + 1) : "Source"}</a>`).join(" &middot; ");
    return `<div class="resitem"><div class="restext">${esc(f.text)}</div>` +
      (f.anchor ? `<div class="resanchor">${esc(f.anchor)}</div>` : "") +
      `<div class="ressrc">${links}</div></div>`;
  }).join("");
  return `<h4>Research on file (${r.amount})</h4><div class="reslist">${items}</div>`;
}
function renderDetail() {
  const el = document.getElementById("detail");
  const i = curSel();
  if (i < 0) { el.hidden = true; return; }
  el.hidden = false;
  const p = PEOPLE[i];
  const followers = inAdj[i].slice().sort((a, b) => totalOf(b) - totalOf(a));
  const following = outAdj[i].slice().sort((a, b) => totalOf(b) - totalOf(a));
  el.innerHTML = `
    <div class="dhead"><h3>${nameHTML(i)}</h3><button class="tbtn" id="d-clear" title="Clear selection (Esc)">×</button></div>
    <div class="meta">${igLink(p.username)}${p.num_lists ? ` &middot; in ${p.num_lists} list${p.num_lists > 1 ? "s" : ""}` : ""}${listStatusText(p)}${p.jd_follows ? " &middot; followed by JD" : ""}</div>
    <div class="statrow">
      <div><b>${p.in_degree}</b><span>in</span></div>
      <div><b>${p.out_degree}</b><span>out</span></div>
      <div><b>${totalOf(i)}</b><span>total</span></div>
    </div>
    ${i === jdIndex ? "" : `<button class="pathbtn" id="path-jd">Trace path to JD</button>`}
    ${researchHTML(i)}
    <h4>Followed by (${followers.length})</h4>
    <div class="connlist">${connListHTML(followers) || `<div class="note">Nobody in the collected lists.</div>`}</div>
    <h4>Follows (${following.length})</h4>
    <div class="connlist">${connListHTML(following) || `<div class="note">Nobody in the collected lists.</div>`}</div>`;
  el.querySelectorAll(".conn").forEach(c => c.addEventListener("click", () => {
    const j = +c.dataset.i;
    flyTo(j); addLayer(j);
  }));
  const pb = document.getElementById("path-jd");
  if (pb) pb.addEventListener("click", () => tracePathToJD(i));
  document.getElementById("d-clear").addEventListener("click", () => removeLayer(i));
}

/* ---------- shortest path back to JD ---------- */
function bfsPath(from, to) {
  const prev = new Int32Array(N).fill(-1);
  const q = [from]; prev[from] = from;
  for (let h = 0; h < q.length; h++) {
    const u = q[h];
    if (u === to) break;
    for (const v of undAdj[u]) if (prev[v] === -1) { prev[v] = u; q.push(v); }
  }
  if (prev[to] === -1) return null;
  const path = [];
  for (let c = to; c !== from; c = prev[c]) path.push(c);
  path.push(from);
  return path.reverse();
}
function tracePathToJD(i) {
  if (jdIndex < 0) return;
  const path = bfsPath(i, jdIndex);
  const el = document.getElementById("detail");
  if (!path) {
    el.querySelector("#path-jd").outerHTML =
      `<div class="note" style="margin-top:10px">No connection path found to JD in the collected lists.</div>`;
    return;
  }
  pathNodes = path;
  pathSet = new Set(path);
  pathEdgeSet = new Set();
  for (let k = 0; k < path.length - 1; k++) {
    const a = path[k], b = path[k + 1];
    pathEdgeSet.add(a * N + b);
    pathEdgeSet.add(b * N + a);
  }
  /* frame the whole path */
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const j of path) {
    x0 = Math.min(x0, RX(j)); x1 = Math.max(x1, RX(j));
    y0 = Math.min(y0, RY(j)); y1 = Math.max(y1, RY(j));
  }
  const pad = 0.15;
  const need = Math.max((x1 - x0) * (1 + pad), (y1 - y0) * (1 + pad), 0.2);
  scale = clampScale(Math.min(W, H) / need);
  ox = W / 2 - (x0 + x1) / 2 * scale;
  oy = H / 2 - (y0 + y1) / 2 * scale;
  draw();
  const hops = path.length - 1;
  el.querySelector("#path-jd").outerHTML =
    `<button class="pathbtn clear" id="path-clear">${hops} hop${hops === 1 ? "" : "s"} to JD — ${path.map(j => "@" + esc(PEOPLE[j].username)).join(" → ")}</button>
     <div class="note" style="margin-top:6px">Tap the map or press Esc to clear.</div>`;
  document.getElementById("path-clear").addEventListener("click", () => { clearPath(); draw(); });
}
function clearPath() {
  pathNodes = null; pathSet = null; pathEdgeSet = null;
}

/* ---------- search ---------- */
function initSearch() {
  const q = document.getElementById("q"), res = document.getElementById("results");
  q.addEventListener("input", () => {
    const s = q.value.trim().toLowerCase();
    if (s.length < 2) { res.hidden = true; return; }
    const scored = [];
    for (let i = 0; i < N && scored.length < 600; i++) {
      if (!visible[i]) continue;
      const p = PEOPLE[i];
      const u = p.username.toLowerCase(), nm = (p.name || "").toLowerCase();
      const inf = (INF[i] || "").toLowerCase();
      let rank = -1;
      if (u === s || nm === s || inf === s) rank = 0;
      else if (u.startsWith(s) || nm.startsWith(s) || inf.startsWith(s)) rank = 1;
      else if (u.includes(s) || nm.includes(s) || inf.includes(s)) rank = 2;
      if (rank >= 0) scored.push([rank, totalOf(i), i]);
    }
    scored.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    const matches = scored.slice(0, 8).map(x => x[2]);
    res.innerHTML = matches.map(i =>
      `<div class="hit" data-i="${i}"><strong>${nameHTML(i)}</strong> <span class="note">@${esc(PEOPLE[i].username)} &middot; ${totalOf(i)} connections</span></div>`).join("")
      || `<div class="note" style="padding:10px 12px">No matches among shown people.</div>`;
    res.hidden = false;
    res.querySelectorAll(".hit").forEach(h => h.addEventListener("click", () => {
      const i = +h.dataset.i;
      res.hidden = true; q.value = ""; q.blur();
      flyTo(i); addLayer(i);
    }));
  });
  q.addEventListener("keydown", e => {
    if (e.key === "Escape") { res.hidden = true; q.blur(); }
    if (e.key === "Enter") {
      const first = res.querySelector(".hit");
      if (first) first.click();
    }
  });
  document.addEventListener("click", e => { if (!e.target.closest(".searchbox")) res.hidden = true; });
}

/* ---------- directory drawer ---------- */
let dirQ = "", dirKey = "total", dirDir = -1;
const defaultDir = k => (k === "username" || k === "first" || k === "last" || k === "dossier") ? 1 : -1;
function dirRows() {
  const q = dirQ.trim().toLowerCase();
  let rows = [];
  for (let i = 0; i < N; i++) {
    if (!visible[i]) continue;
    if (resFilter && !resVis(i)) continue;
    const p = PEOPLE[i];
    if (q && !p.username.toLowerCase().includes(q) && !(p.name || "").toLowerCase().includes(q)) continue;
    rows.push({i, p, total: totalOf(i)});
  }
  const k = dirKey, d = dirDir;
  const val = ({i, p, total}) => {
    switch (k) {
      case "first": return FIRST[i];
      case "last": return LAST[i];
      case "research": { const r = RES[p.username]; return r ? r.amount : 0; }
      case "dossier": return inDossier(i) ? 0 : 1;
      case "total": return total;
      case "jd": return p.jd_follows ? 1 : 0;
      default: return p[k] ?? "";
    }
  };
  rows.sort((a, b) => {
    const va = val(a), vb = val(b);
    let c;
    if (typeof va === "number" && typeof vb === "number") c = (va - vb) * d;
    else c = String(va).localeCompare(String(vb)) * d;
    if (c) return c;
    if (k === "last") { const f = FIRST[a.i].localeCompare(FIRST[b.i]); if (f) return f; }
    if (k === "first") { const l = LAST[a.i].localeCompare(LAST[b.i]); if (l) return l; }
    return b.total - a.total;
  });
  return rows;
}
function paintDir() {
  const rows = dirRows();
  const cap = 2000;
  const shown = rows.slice(0, cap);
  document.getElementById("dir-count").textContent =
    `${rows.length.toLocaleString()} of ${visibleCount.toLocaleString()} shown people`;
  const ssel = document.getElementById("dir-sort");
  if (ssel) ssel.value = dirKey;
  const sdir = document.getElementById("dir-dirbtn");
  if (sdir) sdir.textContent = dirDir === 1 ? "▲ Asc" : "▼ Desc";
  document.getElementById("dir-list").innerHTML = `<table>
    <thead><tr>
      <th data-k="username">Handle</th><th data-k="last">Name</th>
      <th data-k="in_degree">In</th><th data-k="out_degree">Out</th>
      <th data-k="total">Total</th><th data-k="num_lists">Lists</th>
      <th data-k="jd">JD</th><th></th>
    </tr></thead>
    <tbody>` + shown.map(({p, i, total}) => `
    <tr>
      <td>${igLink(p.username)}</td>
      <td>${(p.name && p.name.trim()) ? esc(p.name) : (INF[i] ? `<span class="infname">${esc(INF[i])}</span>` : "—")}</td>
      <td>${p.in_degree}</td><td>${p.out_degree}</td><td><strong>${total}</strong></td>
      <td>${p.num_lists || ""}${p.has_list ? " ●" : (p.list_status === "private" ? " P" : (p.list_status === "failed" ? " !" : ""))}</td>
      <td>${p.jd_follows ? "Yes" : ""}</td>
      <td><button class="locate" data-i="${i}">Locate</button></td>
    </tr>`).join("") + `</tbody></table>`
    + (rows.length > cap ? `<div class="note" style="padding:10px">Showing ${cap.toLocaleString()} of ${rows.length.toLocaleString()} — refine your search.</div>` : "")
    + (rows.length === 0 ? `<div class="empty">No matches.</div>` : "");
  document.querySelectorAll("#dir-list th[data-k]").forEach(th => {
    const k = th.dataset.k;
    th.classList.toggle("sorted", dirKey === k);
    th.innerHTML = th.textContent.replace(/ [▲▼]$/, "") + (dirKey === k ? (dirDir === 1 ? " ▲" : " ▼") : "");
    th.onclick = () => {
      if (dirKey === k) dirDir *= -1;
      else { dirKey = k; dirDir = defaultDir(k); }
      paintDir();
    };
  });
  document.querySelectorAll("#dir-list .locate").forEach(b => b.addEventListener("click", () => {
    const i = +b.dataset.i;
    document.getElementById("directory").hidden = true;
    flyTo(i); addLayer(i);
  }));
}
function initDirectory() {
  const dr = document.getElementById("directory");
  /* drag-resizable drawer: grip on the left edge, width persisted */
  let dirW = 0;
  try { dirW = +localStorage.getItem("ncc-dir-width") || 0; } catch (_) {}
  const applyDirWidth = () => {
    if (dirW > 0 && window.innerWidth > 900) dr.style.width = dirW + "px";
    else dr.style.width = "";
  };
  applyDirWidth();
  window.addEventListener("resize", applyDirWidth);
  const grip = document.getElementById("dir-grip");
  grip.addEventListener("pointerdown", e => {
    if (window.innerWidth <= 900) return;
    e.preventDefault();
    e.stopPropagation();
    try { grip.setPointerCapture(e.pointerId); } catch (_) {}
    document.body.classList.add("dir-resizing");
    const move = ev => {
      dirW = Math.round(Math.min(Math.max(window.innerWidth - ev.clientX, 320), window.innerWidth * 0.92));
      dr.style.width = dirW + "px";
    };
    const up = () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
      document.body.classList.remove("dir-resizing");
      try { localStorage.setItem("ncc-dir-width", String(dirW)); } catch (_) {}
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
  });
  document.getElementById("btn-dir").addEventListener("click", () => {
    dr.hidden = !dr.hidden;
    document.getElementById("btn-dir").classList.toggle("on", !dr.hidden);
    if (!dr.hidden) { loadDossierMembership();
      document.getElementById("dir-list").innerHTML = '<div class="dirskl" aria-busy="true">' + '<div class="skr"></div>'.repeat(9) + '</div>';
      requestAnimationFrame(paintDir); document.getElementById("dir-q").focus(); }
  });
  document.getElementById("dir-close").addEventListener("click", () => {
    dr.hidden = true;
    document.getElementById("btn-dir").classList.remove("on");
  });
  document.getElementById("dir-q").addEventListener("input", e => { dirQ = e.target.value; paintDir(); });
  /* mirrored Navigate filters — same shared setters as the Filters panel */
  const dmc = document.getElementById("d-minconn");
  dmc.max = maxTotal;
  dmc.addEventListener("input", () => setMinConn(+dmc.value));
  document.getElementById("d-f-jd").addEventListener("change", e => setFJd(e.target.checked));
  document.getElementById("d-f-list").addEventListener("change", e => setFList(e.target.checked));
  document.getElementById("d-f-resfilter").addEventListener("change", e => setResFilter(e.target.checked));
  document.getElementById("d-f-isolate").addEventListener("change", e => setIsolate(e.target.checked));
  document.getElementById("d-f-labels").addEventListener("change", e => setFLabels(e.target.checked));
  /* full sort-key set (headers cover the common ones; the select has all) */
  document.getElementById("dir-sort").addEventListener("change", e => {
    const k = e.target.value;
    if (k !== dirKey) { dirKey = k; dirDir = defaultDir(k); }
    if (k === "dossier") loadDossierMembership();
    paintDir();
  });
  document.getElementById("dir-dirbtn").addEventListener("click", () => { dirDir *= -1; paintDir(); });
  syncFilterUI();
}

/* ---------- toolbar, filters, keyboard ---------- */
function initToolbar() {
  const f = document.getElementById("filters");
  const bf = document.getElementById("btn-filters");
  bf.addEventListener("click", () => {
    f.hidden = !f.hidden;
    bf.classList.toggle("on", !f.hidden);
  });
  const mc = document.getElementById("minconn");
  mc.max = maxTotal;
  mc.addEventListener("input", () => setMinConn(+mc.value));
  document.getElementById("f-jd").addEventListener("change", e => setFJd(e.target.checked));
  document.getElementById("f-list").addEventListener("change", e => setFList(e.target.checked));
  document.getElementById("f-resfilter").addEventListener("change", e => setResFilter(e.target.checked));
  document.getElementById("f-isolate").addEventListener("change", e => setIsolate(e.target.checked));
  document.getElementById("f-labels").addEventListener("change", e => setFLabels(e.target.checked));
  const bb = document.getElementById("btn-bridges");
  function setBridgeMode(v) {
    bridgeMode = v;
    bb.classList.toggle("on", bridgeMode);
    selectedBridge = -1;
    if (bridgeMode) buildBridgeList();
    renderBridgePanel();
    draw();
  }
  bb.addEventListener("click", () => setBridgeMode(!bridgeMode));
  document.getElementById("bridges-close").addEventListener("click", () => setBridgeMode(false));
  const ver = document.createElement("span");
  ver.className = "ver";
  ver.title = "App version";
  ver.textContent = "V" + APP_VERSION;
  document.querySelector(".hud-tr").appendChild(ver);
  const gb = document.getElementById("btn-guide"), gp = document.getElementById("guide");
  const setGuide = v => { gp.hidden = !v; gb.classList.toggle("on", v); };
  gb.addEventListener("click", () => setGuide(gp.hidden));
  document.getElementById("guide-close").addEventListener("click", () => setGuide(false));
  const bh = document.getElementById("btn-hubs");
  bh.addEventListener("click", () => {
    hubMode = !hubMode;
    bh.classList.toggle("on", hubMode);
    draw();
  });
  document.getElementById("btn-reset").addEventListener("click", () => { fitView(); clearLayers(); draw(); });
  document.getElementById("zin").addEventListener("click", () => zoomAt(W / 2, H / 2, 1.35));
  document.getElementById("zout").addEventListener("click", () => zoomAt(W / 2, H / 2, 1 / 1.35));
  document.getElementById("zfit").addEventListener("click", () => { fitView(); draw(); });
  const fsb = document.getElementById("btn-fs");
  function toggleFS() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }
  fsb.addEventListener("click", toggleFS);
  document.addEventListener("fullscreenchange", () => fsb.classList.toggle("on", !!document.fullscreenElement));
  document.addEventListener("keydown", e => {
    if (e.target.matches("input, textarea")) return;
    if (e.key === "/") { e.preventDefault(); document.getElementById("q").focus(); }
    else if (e.key === "Escape") {
      if (!document.getElementById("guide").hidden) {
        document.getElementById("guide").hidden = true;
        document.getElementById("btn-guide").classList.remove("on");
      } else if (!document.getElementById("directory").hidden) {
        document.getElementById("directory").hidden = true;
        document.getElementById("btn-dir").classList.remove("on");
      } else if (pathSet || layers.length) { clearPath(); clearLayers(); }
    }
    else if (e.key === "+" || e.key === "=") zoomAt(W / 2, H / 2, 1.25);
    else if (e.key === "-") zoomAt(W / 2, H / 2, 1 / 1.25);
    else if (e.key === "0") { fitView(); clearLayers(); draw(); }
    else if (e.key === "f" || e.key === "F") toggleFS();
  });
  if (window.innerWidth < 900) {
    const mn = document.getElementById("mobile-note");
    mn.hidden = false;
    document.getElementById("mobile-note-x").addEventListener("click", () => { mn.hidden = true; });
  }
}

/* ---------- init ---------- */
function driftLoop(t) {
  requestAnimationFrame(driftLoop);
  if (REDUCED) { rotVel = 0; lastStep = t; return; }
  /* ease the angular velocity toward its target every frame; the angle itself
     still advances on the ~30fps draw cadence so the drawn frame and
     hit-testing always share the same viewRot */
  const blocked = hover >= 0 || pts.size > 0 || layers.length > 0 || !!pathSet || (t - lastAct < 5000);
  const target = blocked ? 0 : DRIFT_MS;
  const dtF = lastStep ? Math.min(250, t - lastStep) : 0;
  lastStep = t;
  if (dtF > 0) rotVel += (target - rotVel) * (1 - Math.exp(-dtF / RAMP_TAU));
  if (target === 0 && rotVel < DRIFT_MS * 0.002) rotVel = 0;
  if (rotVel <= 0) return;
  if (t - lastDrawn < 33) return;
  const dt = lastDrawn ? Math.min(100, t - lastDrawn) : 33;
  lastDrawn = t;
  viewRot += rotVel * dt;
  draw();
}
requestAnimationFrame(driftLoop);
resize();
updateStats();
applyFilters();
initSearch();
initDirectory();
initToolbar();
/* SWISS MONO boot: first frame is on screen — complete the brand bar and fade */
requestAnimationFrame(() => {
  const b = document.getElementById("bootload");
  if (b) { b.classList.add("done"); setTimeout(() => b.remove(), 320); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => draw());
});
