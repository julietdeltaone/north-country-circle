"use strict";
/* North Country Circle — flat aggregate network. Everyone equal: every unique
   handle seen across the collected following lists + JD's following seed is a
   node; every follow is a directed edge. No tiers, no center. */
const D = window.CIRCLE_DATA || {};
const PEOPLE = D.people || [];
const EDGES = D.edges || [];
const META = D.meta || {};

const N = PEOPLE.length;
const outAdj = Array.from({length: N}, () => []);
const inAdj = Array.from({length: N}, () => []);
for (const [a, b] of EDGES) {
  if (a === b || a < 0 || b < 0 || a >= N || b >= N) continue;
  outAdj[a].push(b);
  inAdj[b].push(a);
}
const totalOf = i => PEOPLE[i].in_degree + PEOPLE[i].out_degree;
const maxTotal = Math.max(1, ...PEOPLE.map((_, i) => totalOf(i)));
const byName = new Map(PEOPLE.map((p, i) => [p.username, i]));
const isMobile = () => window.matchMedia("(max-width: 640px)").matches;

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function igLink(u) { return `<a href="https://www.instagram.com/${esc(u)}/" target="_blank" rel="noopener">@${esc(u)}</a>`; }

/* ---------- nav ---------- */
const NAV = [["network", "Network"], ["directory", "Directory"]];
function buildNav() {
  const nav = document.getElementById("nav");
  nav.innerHTML = NAV.map(([k, l]) => `<button data-view="${k}">${l}</button>`).join("");
  nav.addEventListener("click", e => {
    const b = e.target.closest("button[data-view]");
    if (b) location.hash = b.dataset.view === "directory" ? "directory" : "network";
  });
  const parts = [`${META.num_people || N} people`, `${META.num_edges || EDGES.length} connections`];
  if (META.friend_lists) parts.push(`${META.friend_lists.length} lists collected`);
  if (META.synced_at) parts.push(`synced ${esc(META.synced_at)}`);
  document.getElementById("sync-line").textContent = parts.join(" · ");
}
let pendingJump = null; // person index to fly to after the network view renders
function show(key) {
  document.querySelectorAll(".view").forEach(v => v.hidden = true);
  document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("active", b.dataset.view === key));
  document.getElementById("view-" + key).hidden = false;
  if (key === "network") renderNetwork();
  else renderDirectory();
  window.scrollTo(0, 0);
}

/* ---------- network (canvas) ---------- */
let net = null;
function connListHTML(arr) {
  const cap = 40;
  return arr.slice(0, cap).map(j =>
    `<div class="conn" data-i="${j}"><strong>${esc(PEOPLE[j].name || PEOPLE[j].username)}</strong> <span class="note">@${esc(PEOPLE[j].username)}</span></div>`).join("")
    + (arr.length > cap ? `<div class="note">+${arr.length - cap} more</div>` : "");
}
function showDetail(i) {
  const boxEl = document.getElementById("net-detail");
  if (!boxEl) return;
  if (i < 0) { boxEl.innerHTML = `<div class="empty">Tap a node to see its connections.</div>`; return; }
  const p = PEOPLE[i];
  const followers = inAdj[i].slice().sort((a, b) => totalOf(b) - totalOf(a));
  const following = outAdj[i].slice().sort((a, b) => totalOf(b) - totalOf(a));
  boxEl.innerHTML = `
    <h3>${esc(p.name || p.username)}</h3>
    <div class="meta">${igLink(p.username)}${p.num_lists ? ` · in ${p.num_lists} list${p.num_lists > 1 ? "s" : ""}` : ""}${p.has_list ? " · list collected" : ""}${p.jd_follows ? " · followed by JD" : ""}</div>
    <div class="statrow">
      <div><b>${p.in_degree}</b><span>in</span></div>
      <div><b>${p.out_degree}</b><span>out</span></div>
      <div><b>${totalOf(i)}</b><span>total</span></div>
    </div>
    <h4>Followed by (${followers.length})</h4>
    <div class="connlist">${connListHTML(followers) || `<div class="note">Nobody in the collected lists.</div>`}</div>
    <h4>Follows (${following.length})</h4>
    <div class="connlist">${connListHTML(following) || `<div class="note">Nobody in the collected lists.</div>`}</div>`;
  boxEl.querySelectorAll(".conn").forEach(c => c.addEventListener("click", () => {
    if (net) { net.centerOn(+c.dataset.i); net.select(+c.dataset.i); }
  }));
}
function renderNetwork() {
  const el = document.getElementById("view-network");
  el.innerHTML = `
    <h2>Network<span class="sub">Every person found across the collected following lists, and every follow between them. Node size = total connections.</span></h2>
    <div class="net-wrap">
      <div class="card net-box">
        <div class="net-search">
          <input id="net-q" placeholder="Find a person by handle or name…" autocomplete="off">
          <div id="net-results" class="net-results" hidden></div>
        </div>
        <div class="canvas-holder">
          <canvas id="net-canvas"></canvas>
          <div class="zoomctl">
            <button id="zoom-in" aria-label="Zoom in">+</button>
            <button id="zoom-out" aria-label="Zoom out">&minus;</button>
            <button id="zoom-reset" aria-label="Reset view">&#10226;</button>
          </div>
        </div>
        <div class="hint">Drag background to pan &middot; pinch or scroll to zoom &middot; drag a node to move it &middot; tap a node for details</div>
      </div>
      <div class="card detail" id="net-detail"><div class="empty">Tap a node to see its connections.</div></div>
    </div>`;
  initCanvas(document.getElementById("net-canvas"));
  initNetSearch();
  document.getElementById("zoom-in").addEventListener("click", () => net && net.zoomCenter(1.35));
  document.getElementById("zoom-out").addEventListener("click", () => net && net.zoomCenter(1 / 1.35));
  document.getElementById("zoom-reset").addEventListener("click", () => net && net.reset());
  if (pendingJump != null && net) {
    const i = pendingJump; pendingJump = null;
    net.centerOn(i); net.select(i);
  }
}

function initCanvas(canvas) {
  const box = canvas.parentElement;
  const W = Math.max(300, box.clientWidth);
  const H = isMobile() ? Math.max(340, Math.round(window.innerHeight * 0.55)) : 620;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const baseScale = Math.min(W, H) / 2.25;
  const SMIN = Math.min(W, H) / 6, SMAX = 8 * Math.min(W, H) / 2.25;
  let scale = baseScale, ox = W / 2, oy = H / 2;
  const w2sX = x => ox + x * scale, w2sY = y => oy + y * scale;
  const s2wX = x => (x - ox) / scale, s2wY = y => (y - oy) / scale;
  const clampScale = s => Math.min(SMAX, Math.max(SMIN, s));
  const rad = i => 2 + 7 * Math.sqrt(totalOf(i) / maxTotal);

  let hover = -1, selected = -1;
  const tip = document.getElementById("tooltip");
  const posOf = e => {
    const r = canvas.getBoundingClientRect();
    return {x: e.clientX - r.left, y: e.clientY - r.top};
  };

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const hi = new Set();
    if (hover >= 0 || selected >= 0) {
      const c = hover >= 0 ? hover : selected;
      hi.add(c);
      for (const j of outAdj[c]) hi.add(j);
      for (const j of inAdj[c]) hi.add(j);
    }
    const dim = hi.size > 0;
    ctx.lineWidth = 1;
    if (dim) {
      ctx.strokeStyle = "rgba(70,85,120,0.18)";
      ctx.beginPath();
      for (const [a, b] of EDGES) {
        if (hi.has(a) && hi.has(b)) continue;
        ctx.moveTo(w2sX(PEOPLE[a].x), w2sY(PEOPLE[a].y));
        ctx.lineTo(w2sX(PEOPLE[b].x), w2sY(PEOPLE[b].y));
      }
      ctx.stroke();
      ctx.strokeStyle = "rgba(143,208,255,0.55)";
      ctx.beginPath();
      for (const [a, b] of EDGES) {
        if (!(hi.has(a) && hi.has(b))) continue;
        ctx.moveTo(w2sX(PEOPLE[a].x), w2sY(PEOPLE[a].y));
        ctx.lineTo(w2sX(PEOPLE[b].x), w2sY(PEOPLE[b].y));
      }
      ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(70,85,120,0.35)";
      ctx.beginPath();
      for (const [a, b] of EDGES) {
        ctx.moveTo(w2sX(PEOPLE[a].x), w2sY(PEOPLE[a].y));
        ctx.lineTo(w2sX(PEOPLE[b].x), w2sY(PEOPLE[b].y));
      }
      ctx.stroke();
    }
    for (let i = 0; i < N; i++) {
      const p = PEOPLE[i], r = rad(i);
      const x = w2sX(p.x), y = w2sY(p.y);
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      const isHi = !dim || hi.has(i);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = isHi ? "#8fd0ff" : "rgba(143,208,255,0.25)";
      ctx.fill();
      if (i === selected || i === hover) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ffb454";
        ctx.stroke();
      }
    }
  }

  function nearest(mx, my) {
    const wx = s2wX(mx), wy = s2wY(my);
    const tol = 16 / scale;
    let best = -1, bd = tol * tol;
    for (let i = 0; i < N; i++) {
      const dx = PEOPLE[i].x - wx, dy = PEOPLE[i].y - wy;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function pick(i) {
    selected = i;
    draw();
    showDetail(i);
  }
  function zoomAt(mx, my, f) {
    const ns = clampScale(scale * f);
    ox = mx - (mx - ox) * (ns / scale);
    oy = my - (my - oy) * (ns / scale);
    scale = ns;
    draw();
  }

  /* ----- unified pointer handling: tap = select, drag bg = pan,
         drag node = move, two fingers = pinch zoom ----- */
  const pts = new Map();
  let mode = "idle", activeNode = -1, startX = 0, startY = 0;
  let moved = false, downT = 0;
  let pinch = null;
  const TAP_MS = 400, TAP_PX = 9;
  const pdist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

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

  canvas.addEventListener("pointerdown", e => {
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    const p = posOf(e);
    pts.set(e.pointerId, p);
    if (pts.size === 1) {
      const h = nearest(p.x, p.y);
      mode = h >= 0 ? "node" : "pan";
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
      PEOPLE[activeNode].x = s2wX(p.x);
      PEOPLE[activeNode].y = s2wY(p.y);
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
      if (tap && mode === "node" && activeNode >= 0) pick(activeNode === selected ? -1 : activeNode);
      else if (tap && mode === "pan" && selected >= 0) pick(-1);
      mode = "idle"; activeNode = -1; pinch = null;
    } else if (pts.size === 1) {
      // pinch released back to one finger: re-baseline so nothing jumps
      const p = [...pts.values()][0];
      startX = p.x; startY = p.y; moved = false; downT = Date.now();
      const h = nearest(p.x, p.y);
      mode = h >= 0 ? "node" : "pan"; activeNode = h; pinch = null;
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
    zoomAt(p.x, p.y, 1.6);
  });

  net = {
    draw,
    select: pick,
    zoomCenter: f => zoomAt(W / 2, H / 2, f),
    reset: () => { scale = baseScale; ox = W / 2; oy = H / 2; draw(); },
    centerOn: (i, boost) => {
      const s = clampScale(Math.max(scale, baseScale) * (boost || 3));
      scale = s;
      ox = W / 2 - PEOPLE[i].x * s;
      oy = H / 2 - PEOPLE[i].y * s;
      draw();
    },
  };
  draw();
}

/* ---------- find-a-person search on the network view ---------- */
function initNetSearch() {
  const q = document.getElementById("net-q"), res = document.getElementById("net-results");
  if (!q) return;
  q.addEventListener("input", () => {
    const s = q.value.trim().toLowerCase();
    if (s.length < 2) { res.hidden = true; return; }
    const scored = [];
    for (let i = 0; i < N && scored.length < 400; i++) {
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
      `<div class="net-hit" data-i="${i}"><strong>${esc(PEOPLE[i].name || PEOPLE[i].username)}</strong> <span class="note">@${esc(PEOPLE[i].username)} &middot; ${totalOf(i)} connections</span></div>`).join("")
      || `<div class="note" style="padding:10px 12px">No matches.</div>`;
    res.hidden = false;
    res.querySelectorAll(".net-hit").forEach(h => h.addEventListener("click", () => {
      const i = +h.dataset.i;
      res.hidden = true; q.value = ""; q.blur();
      if (net) { net.centerOn(i); net.select(i); }
      if (isMobile()) document.getElementById("net-detail").scrollIntoView({behavior: "smooth", block: "nearest"});
    }));
  });
  q.addEventListener("keydown", e => { if (e.key === "Escape") { res.hidden = true; q.blur(); } });
  document.addEventListener("click", e => { if (!e.target.closest(".net-search")) res.hidden = true; });
}

/* ---------- directory ---------- */
let dirState = {q: "", key: "total", dir: -1};
let dirMode = null; // "table" | "cards"
function renderDirectory() {
  const el = document.getElementById("view-directory");
  el.innerHTML = `
    <h2>Directory<span class="sub">Everyone found across the collected following lists. Search by handle or name; tap a column to sort.</span></h2>
    <div class="card controls">
      <input id="dir-q" placeholder="Search handle or name…" value="${esc(dirState.q)}">
      <span class="note" id="dir-count"></span>
    </div>
    <div id="dir-list"></div>`;
  const q = document.getElementById("dir-q");
  q.addEventListener("input", () => { dirState.q = q.value; paintDir(); });
  dirMode = null;
  paintDir();
  if (!isMobile()) q.focus();
}
function dirRows() {
  const q = dirState.q.trim().toLowerCase();
  let rows = PEOPLE.map((p, i) => ({i, p, total: totalOf(i)}));
  if (q) rows = rows.filter(({p}) =>
    p.username.toLowerCase().includes(q) || (p.name || "").toLowerCase().includes(q));
  const k = dirState.key, d = dirState.dir;
  const val = ({p, total}) =>
    k === "total" ? total : k === "jd" ? (p.jd_follows ? 1 : 0) : (p[k] ?? "");
  rows.sort((a, b) => {
    const va = val(a), vb = val(b);
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * d || (a.total - b.total) * -1;
    return String(va).localeCompare(String(vb)) * d;
  });
  return rows;
}
function jumpToNetwork(i) {
  pendingJump = i;
  if (location.hash === "#network" || !location.hash) renderNetwork();
  else location.hash = "network";
  window.scrollTo(0, 0);
}
function paintDir() {
  const rows = dirRows();
  const mode = isMobile() ? "cards" : "table";
  if (mode !== dirMode) dirMode = mode;
  document.getElementById("dir-count").textContent = `${rows.length.toLocaleString()} of ${N.toLocaleString()} people`;
  const list = document.getElementById("dir-list");
  if (mode === "cards") {
    const cap = 400;
    const shown = rows.slice(0, cap);
    list.innerHTML = `<div class="dir-cards">` + shown.map(({p, i, total}) => `
      <div class="dir-card">
        <div class="dir-card-main">
          <div><strong>${esc(p.name || p.username)}</strong></div>
          <div class="note">${igLink(p.username)}</div>
          <div class="dir-card-stats">${total} connections${p.num_lists ? ` &middot; ${p.num_lists} lists` : ""}${p.jd_follows ? ` &middot; <span class="jdtag">JD follows</span>` : ""}</div>
        </div>
        <button class="dir-map" data-i="${i}">Map</button>
      </div>`).join("") + `</div>`
      + (rows.length > cap ? `<div class="note" style="margin-top:10px">Showing ${cap} of ${rows.length.toLocaleString()} — refine your search.</div>` : "")
      + (rows.length === 0 ? `<div class="empty">No matches.</div>` : "");
    list.querySelectorAll(".dir-map").forEach(b => b.addEventListener("click", () => jumpToNetwork(+b.dataset.i)));
  } else {
    const cap = 2000;
    const shown = rows.slice(0, cap);
    list.innerHTML = `<div class="card" style="padding:6px 10px;overflow-x:auto"><table id="dir-table">
      <thead><tr>
        <th data-k="username">Handle</th><th data-k="name">Name</th>
        <th data-k="in_degree">In</th><th data-k="out_degree">Out</th>
        <th data-k="total">Total</th><th data-k="num_lists">Lists</th>
        <th data-k="jd">JD follows</th>
      </tr></thead>
      <tbody>` + shown.map(({p, i, total}) => `
      <tr>
        <td>${igLink(p.username)}</td>
        <td>${esc(p.name || "—")}</td>
        <td>${p.in_degree}</td><td>${p.out_degree}</td><td><strong>${total}</strong></td>
        <td>${p.num_lists || ""}${p.has_list ? " ●" : ""}</td>
        <td>${p.jd_follows ? "Yes" : ""}</td>
      </tr>`).join("") + `</tbody></table></div>`
      + (rows.length > cap ? `<div class="note" style="margin-top:10px">Showing ${cap.toLocaleString()} of ${rows.length.toLocaleString()} — refine your search.</div>` : "")
      + (rows.length === 0 ? `<div class="empty">No matches.</div>` : "");
    list.querySelectorAll("th[data-k]").forEach(th => th.addEventListener("click", () => {
      const k = th.dataset.k;
      if (dirState.key === k) dirState.dir *= -1;
      else { dirState.key = k; dirState.dir = k === "username" || k === "name" ? 1 : -1; }
      paintDir();
    }));
    list.querySelectorAll("#dir-table th").forEach(th => {
      const k = th.dataset.k;
      th.classList.toggle("sorted", dirState.key === k);
      th.textContent = th.textContent.replace(/ [▲▼]$/, "") + (dirState.key === k ? (dirState.dir === 1 ? " ▲" : " ▼") : "");
    });
  }
}
let rszT = null, lastMobile = null;
window.addEventListener("resize", () => {
  clearTimeout(rszT);
  rszT = setTimeout(() => {
    const m = isMobile();
    if (m !== lastMobile) {
      lastMobile = m;
      if (!document.getElementById("view-directory").hidden) paintDir();
      else if (!document.getElementById("view-network").hidden) renderNetwork();
    }
  }, 250);
});

buildNav();
lastMobile = isMobile();
show(location.hash === "#directory" ? "directory" : "network");
window.addEventListener("hashchange", () => {
  const k = location.hash === "#directory" ? "directory" : "network";
  show(k);
});
