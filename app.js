"use strict";
/* North Country Circle — full-screen desktop explorer.
   One flat aggregate network: every handle seen across the collected following
   lists is a node, every follow a directed edge. Custom navigation tools:
   search + fly-to, connection-count filter, hub highlighting, neighbor
   isolation, and shortest-path tracing back to JD. */
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
const XS = new Float32Array(N), YS = new Float32Array(N);
for (let i = 0; i < N; i++) { XS[i] = PEOPLE[i].x; YS[i] = PEOPLE[i].y; }
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
    flyToXY((XS[br.a] + XS[br.b]) / 2, (YS[br.a] + YS[br.b]) / 2);
    addLayer(br.a);
    renderBridgePanel();
  }));
}

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function igLink(u) { return `<a href="https://www.instagram.com/${esc(u)}/" target="_blank" rel="noopener">@${esc(u)}</a>`; }

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
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fitView();
  draw();
}
window.addEventListener("resize", () => { clearTimeout(window.__rzT); window.__rzT = setTimeout(resize, 200); });

/* ---------- filter / tool state ---------- */
const visible = new Uint8Array(N).fill(1);
let visibleCount = N;
let minConn = 0, fJd = false, fList = false, isolate = false, hubMode = false, fLabels = true;
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
}
function updateStats() {
  const parts = [`${N.toLocaleString()} people`, `${EDGES.length.toLocaleString()} connections`];
  if (visibleCount !== N) parts.push(`${visibleCount.toLocaleString()} shown`);
  if (META.synced_at) parts.push(`synced ${esc(META.synced_at)}`);
  document.getElementById("stats").innerHTML = parts.join(" &middot; ");
}

/* ---------- renderer ---------- */
const rad = i => 2 + 7 * Math.sqrt(totalOf(i) / maxTotal);

function draw() {
  ctx.clearRect(0, 0, W, H);
  const x0 = s2wX(-30), x1 = s2wX(W + 30), y0 = s2wY(-30), y1 = s2wY(H + 30);

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
  const drawEdges = (onlyHi, style, width) => {
    ctx.strokeStyle = style; ctx.lineWidth = width; ctx.beginPath();
    let n = 0;
    for (const [a, b] of EDGES) {
      if (!visible[a] || !visible[b]) continue;
      const bothHi = hi.has(a) && hi.has(b);
      if (onlyHi ? !bothHi : (dim && bothHi)) continue;
      const ax = XS[a], ay = YS[a];
      if ((ax < x0 || ax > x1 || ay < y0 || ay > y1) &&
          (XS[b] < x0 || XS[b] > x1 || YS[b] < y0 || YS[b] > y1)) continue;
      ctx.moveTo(w2sX(ax), w2sY(ay));
      ctx.lineTo(w2sX(XS[b]), w2sY(YS[b]));
      if (++n > 60000) break;
    }
    ctx.stroke();
  };
  if (pathSet) {
    drawEdges(false, "rgba(70,85,120,0.14)", 1);
    /* path edges in amber */
    ctx.strokeStyle = "rgba(255,180,84,0.85)"; ctx.lineWidth = 2.5; ctx.beginPath();
    for (const key of pathEdgeSet) {
      const a = Math.floor(key / N), b = key % N;
      ctx.moveTo(w2sX(XS[a]), w2sY(YS[a]));
      ctx.lineTo(w2sX(XS[b]), w2sY(YS[b]));
    }
    ctx.stroke();
  } else if (dim) {
    drawEdges(false, "rgba(70,85,120,0.10)", 1);
    drawEdges(true, "rgba(143,208,255,0.55)", 1);
  } else {
    drawEdges(false, bridgeMode ? "rgba(70,85,120,0.12)" : "rgba(70,85,120,0.28)", 1);
  }

  /* long-range bridges: glow underlay + bright core, selected one in amber */
  if (bridgeMode && bridgeThresh > 0) {
    for (const [style, w] of [["rgba(170,120,255,0.30)", 6], ["rgba(216,170,255,0.95)", 2]]) {
      ctx.strokeStyle = style;
      ctx.lineWidth = w;
      ctx.beginPath();
      for (let e = 0; e < EDGES.length; e++) {
        if (edgeLen[e] < bridgeThresh) continue;
        const a = EDGES[e][0], b = EDGES[e][1];
        if (!visible[a] || !visible[b]) continue;
        ctx.moveTo(w2sX(XS[a]), w2sY(YS[a]));
        ctx.lineTo(w2sX(XS[b]), w2sY(YS[b]));
      }
      ctx.stroke();
    }
    const sb = bridgeList[selectedBridge];
    if (sb && visible[sb.a] && visible[sb.b]) {
      ctx.strokeStyle = "#ffb454";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w2sX(XS[sb.a]), w2sY(YS[sb.a]));
      ctx.lineTo(w2sX(XS[sb.b]), w2sY(YS[sb.b]));
      ctx.stroke();
    }
  }

  /* nodes */
  for (let i = 0; i < N; i++) {
    if (!visible[i]) continue;
    if (isolate && layers.length > 0 && !hi.has(i)) continue;
    const x = w2sX(XS[i]), y = w2sY(YS[i]);
    if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
    const isHi = !dim || hi.has(i);
    const r = rad(i);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (pathSet && pathSet.has(i)) ctx.fillStyle = "#ffb454";
    else if (hubMode && hubSet.has(i)) ctx.fillStyle = isHi ? "#ffd9a0" : "rgba(255,217,160,0.3)";
    else ctx.fillStyle = isHi ? "#8fd0ff" : "rgba(143,208,255,0.22)";
    ctx.fill();
    if (i === jdIndex || layerSet.has(i) || i === hover || (hubMode && hubSet.has(i) && isHi)) {
      ctx.lineWidth = i === jdIndex ? 2.5 : 2;
      ctx.strokeStyle = i === jdIndex ? "#ffb454" : (hubMode && hubSet.has(i) && !layerSet.has(i) && i !== hover ? "rgba(255,180,84,0.8)" : "#ffb454");
      ctx.stroke();
    }
  }

  /* default labels: JD + big nodes when zoomed in (toggleable in Filters) */
  ctx.font = "11px -apple-system,Segoe UI,Roboto,sans-serif";
  ctx.textAlign = "center";
  const labelZoom = baseScale * 6;
  if (fLabels && jdIndex >= 0 && visible[jdIndex]) {
    ctx.fillStyle = "#ffb454";
    ctx.fillText("@jdmeyers_", w2sX(XS[jdIndex]), w2sY(YS[jdIndex]) - rad(jdIndex) - 5);
  }
  /* big-node labels when zoomed in */
  if (fLabels && scale >= labelZoom) {
    ctx.fillStyle = "rgba(219,226,238,0.85)";
    let drawn = 0;
    const cutoff = totalOf([...hubSet][79]);
    for (let i = 0; i < N && drawn < 220; i++) {
      if (!visible[i] || totalOf(i) < cutoff) continue;
      const x = w2sX(XS[i]), y = w2sY(YS[i]);
      if (x < 0 || y < 0 || x > W || y > H) continue;
      ctx.fillText("@" + PEOPLE[i].username, x, y - rad(i) - 4);
      drawn++;
    }
  }

  /* labels for every connection of each layered person */
  if (layers.length) {
    ctx.fillStyle = "rgba(143,208,255,0.9)";
    for (const s of layers) {
      const nbs = undAdj[s].filter(j => visible[j] && j !== s)
        .sort((a, b) => totalOf(b) - totalOf(a)).slice(0, 80);
      for (const j of nbs) {
        const x = w2sX(XS[j]), y = w2sY(YS[j]);
        if (x < 0 || y < 0 || x > W || y > H) continue;
        ctx.fillText("@" + PEOPLE[j].username, x, y - rad(j) - 4);
      }
    }
  }
}

function nearest(mx, my) {
  const wx = s2wX(mx), wy = s2wY(my);
  const tol = 18 / scale, tol2 = tol * tol;
  let best = -1, bd = tol2;
  for (let i = 0; i < N; i++) {
    if (!visible[i]) continue;
    const dx = XS[i] - wx, dy = YS[i] - wy;
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
function zoomAt(mx, my, f) {
  const ns = clampScale(scale * f);
  ox = mx - (mx - ox) * (ns / scale);
  oy = my - (my - oy) * (ns / scale);
  scale = ns;
  draw();
}
/* smooth fly-to animation */
let flyAnim = null;
function flyTo(i, targetScale) {
  flyToXY(XS[i], YS[i], targetScale);
}
function flyToXY(wx, wy, targetScale) {
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
  const h = nearest(mx, my);
  if (h !== hover) { hover = h; draw(); }
  if (h >= 0) {
    const p = PEOPLE[h];
    tip.hidden = false;
    tip.style.left = (cx + 14) + "px";
    tip.style.top = (cy + 10) + "px";
    tip.innerHTML = `<strong>${esc(p.name || p.username)}</strong><br>@${esc(p.username)} &middot; ${totalOf(h)} connections`;
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
      draw();
    }
    return;
  }
  if (Math.hypot(p.x - startX, p.y - startY) > TAP_PX) moved = true;
  if (mode === "node" && activeNode >= 0 && moved) {
    XS[activeNode] = s2wX(p.x);
    YS[activeNode] = s2wY(p.y);
    draw();
    return;
  }
  if (mode === "pan" && moved) {
    ox += p.x - prev.x; oy += p.y - prev.y;
    draw();
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
canvas.addEventListener("wheel", e => {
  e.preventDefault();
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
    `<div class="conn" data-i="${j}"><strong>${esc(PEOPLE[j].name || PEOPLE[j].username)}</strong> <span class="note">@${esc(PEOPLE[j].username)}</span></div>`).join("")
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
function renderDetail() {
  const el = document.getElementById("detail");
  const i = curSel();
  if (i < 0) { el.hidden = true; return; }
  el.hidden = false;
  const p = PEOPLE[i];
  const followers = inAdj[i].slice().sort((a, b) => totalOf(b) - totalOf(a));
  const following = outAdj[i].slice().sort((a, b) => totalOf(b) - totalOf(a));
  el.innerHTML = `
    <div class="dhead"><h3>${esc(p.name || p.username)}</h3><button class="tbtn" id="d-clear" title="Clear selection (Esc)">×</button></div>
    <div class="meta">${igLink(p.username)}${p.num_lists ? ` &middot; in ${p.num_lists} list${p.num_lists > 1 ? "s" : ""}` : ""}${listStatusText(p)}${p.jd_follows ? " &middot; followed by JD" : ""}</div>
    <div class="statrow">
      <div><b>${p.in_degree}</b><span>in</span></div>
      <div><b>${p.out_degree}</b><span>out</span></div>
      <div><b>${totalOf(i)}</b><span>total</span></div>
    </div>
    ${i === jdIndex ? "" : `<button class="pathbtn" id="path-jd">Trace path to JD</button>`}
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
    x0 = Math.min(x0, XS[j]); x1 = Math.max(x1, XS[j]);
    y0 = Math.min(y0, YS[j]); y1 = Math.max(y1, YS[j]);
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
      let rank = -1;
      if (u === s || nm === s) rank = 0;
      else if (u.startsWith(s) || nm.startsWith(s)) rank = 1;
      else if (u.includes(s) || nm.includes(s)) rank = 2;
      if (rank >= 0) scored.push([rank, totalOf(i), i]);
    }
    scored.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    const matches = scored.slice(0, 8).map(x => x[2]);
    res.innerHTML = matches.map(i =>
      `<div class="hit" data-i="${i}"><strong>${esc(PEOPLE[i].name || PEOPLE[i].username)}</strong> <span class="note">@${esc(PEOPLE[i].username)} &middot; ${totalOf(i)} connections</span></div>`).join("")
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
function dirRows() {
  const q = dirQ.trim().toLowerCase();
  let rows = [];
  for (let i = 0; i < N; i++) {
    if (!visible[i]) continue;
    const p = PEOPLE[i];
    if (q && !p.username.toLowerCase().includes(q) && !(p.name || "").toLowerCase().includes(q)) continue;
    rows.push({i, p, total: totalOf(i)});
  }
  const k = dirKey, d = dirDir;
  const val = ({p, total}) =>
    k === "total" ? total : k === "jd" ? (p.jd_follows ? 1 : 0) : (p[k] ?? "");
  rows.sort((a, b) => {
    const va = val(a), vb = val(b);
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * d || (b.total - a.total);
    return String(va).localeCompare(String(vb)) * d;
  });
  return rows;
}
function paintDir() {
  const rows = dirRows();
  const cap = 2000;
  const shown = rows.slice(0, cap);
  document.getElementById("dir-count").textContent =
    `${rows.length.toLocaleString()} of ${visibleCount.toLocaleString()} shown people`;
  document.getElementById("dir-list").innerHTML = `<table>
    <thead><tr>
      <th data-k="username">Handle</th><th data-k="name">Name</th>
      <th data-k="in_degree">In</th><th data-k="out_degree">Out</th>
      <th data-k="total">Total</th><th data-k="num_lists">Lists</th>
      <th data-k="jd">JD</th><th></th>
    </tr></thead>
    <tbody>` + shown.map(({p, i, total}) => `
    <tr>
      <td>${igLink(p.username)}</td>
      <td>${esc(p.name || "—")}</td>
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
      else { dirKey = k; dirDir = (k === "username" || k === "name") ? 1 : -1; }
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
  document.getElementById("btn-dir").addEventListener("click", () => {
    dr.hidden = !dr.hidden;
    document.getElementById("btn-dir").classList.toggle("on", !dr.hidden);
    if (!dr.hidden) { paintDir(); document.getElementById("dir-q").focus(); }
  });
  document.getElementById("dir-close").addEventListener("click", () => {
    dr.hidden = true;
    document.getElementById("btn-dir").classList.remove("on");
  });
  document.getElementById("dir-q").addEventListener("input", e => { dirQ = e.target.value; paintDir(); });
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
  mc.addEventListener("input", () => {
    minConn = +mc.value;
    document.getElementById("minconn-val").textContent = minConn.toLocaleString();
    applyFilters();
  });
  document.getElementById("f-jd").addEventListener("change", e => { fJd = e.target.checked; applyFilters(); });
  document.getElementById("f-list").addEventListener("change", e => { fList = e.target.checked; applyFilters(); });
  document.getElementById("f-isolate").addEventListener("change", e => { isolate = e.target.checked; draw(); });
  document.getElementById("f-labels").addEventListener("change", e => { fLabels = e.target.checked; draw(); });
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
resize();
updateStats();
applyFilters();
initSearch();
initDirectory();
initToolbar();
