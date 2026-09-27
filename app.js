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
  if (i < 0) { boxEl.innerHTML = `<div class="empty">Click a node to see its connections.</div>`; return; }
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
    if (net) net.select(+c.dataset.i);
  }));
}
function renderNetwork() {
  const el = document.getElementById("view-network");
  el.innerHTML = `
    <h2>Network<span class="sub">Every person found across the collected following lists, and every follow between them. Node size = total connections. Drag a node to move it, drag the background to pan, scroll to zoom, click a node for details.</span></h2>
    <div class="net-wrap">
      <div class="card net-box"><canvas id="net-canvas"></canvas></div>
      <div class="card detail" id="net-detail"><div class="empty">Click a node to see its connections.</div></div>
    </div>`;
  initCanvas(document.getElementById("net-canvas"));
}

function initCanvas(canvas) {
  const box = canvas.parentElement;
  const W = Math.max(320, box.clientWidth - 36), H = 620;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // fit layout box [-1,1] into canvas
  let scale = Math.min(W, H) / 2.25, ox = W / 2, oy = H / 2;
  const w2sX = x => ox + x * scale, w2sY = y => oy + y * scale;
  const s2wX = x => (x - ox) / scale, s2wY = y => (y - oy) / scale;
  const rad = i => 2 + 7 * Math.sqrt(totalOf(i) / maxTotal);

  let hover = -1, selected = -1, dragNode = -1, panning = false, px = 0, py = 0, moved = false;
  const tip = document.getElementById("tooltip");

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
    // edges
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
    // nodes
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
    const tol = 14 / scale;
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

  canvas.addEventListener("mousemove", e => {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    if (dragNode >= 0) {
      PEOPLE[dragNode].x = s2wX(mx); PEOPLE[dragNode].y = s2wY(my);
      draw(); return;
    }
    if (panning) {
      ox += mx - px; oy += my - py; px = mx; py = my; moved = true;
      draw(); return;
    }
    const h = nearest(mx, my);
    if (h !== hover) { hover = h; draw(); }
    if (h >= 0) {
      const p = PEOPLE[h];
      tip.hidden = false;
      tip.style.left = (e.clientX + 14) + "px";
      tip.style.top = (e.clientY + 10) + "px";
      tip.innerHTML = `<strong>${esc(p.name || p.username)}</strong><br>@${esc(p.username)} · ${totalOf(h)} connections`;
      canvas.style.cursor = "pointer";
    } else {
      tip.hidden = true;
      canvas.style.cursor = "default";
    }
  });
  canvas.addEventListener("mouseleave", () => { tip.hidden = true; hover = -1; draw(); });
  canvas.addEventListener("mousedown", e => {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const h = nearest(mx, my);
    moved = false;
    if (h >= 0) { dragNode = h; }
    else { panning = true; px = mx; py = my; }
  });
  window.addEventListener("mouseup", e => {
    if (dragNode >= 0 && !moved) { /* treated as click below */ }
    const wasDrag = dragNode >= 0, wasPan = panning && moved;
    dragNode = -1; panning = false;
    if (wasDrag && !wasPan) {
      const r = canvas.getBoundingClientRect();
      const h = nearest(e.clientX - r.left, e.clientY - r.top);
      if (h >= 0) { pick(selected === h ? -1 : h); }
      draw();
    }
  });
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const ns = Math.min(8 * Math.min(W, H) / 2.25, Math.max(Math.min(W, H) / 6, scale * f));
    ox = mx - (mx - ox) * (ns / scale);
    oy = my - (my - oy) * (ns / scale);
    scale = ns;
    draw();
  }, {passive: false});

  net = {draw, select: pick};
  draw();
}

/* ---------- directory ---------- */
let dirState = {q: "", key: "total", dir: -1};
function renderDirectory() {
  const el = document.getElementById("view-directory");
  el.innerHTML = `
    <h2>Directory<span class="sub">Everyone found across the collected following lists. Search by handle or name; click a column to sort.</span></h2>
    <div class="card controls">
      <input id="dir-q" placeholder="Search handle or name…" value="${esc(dirState.q)}">
      <span class="note" id="dir-count"></span>
    </div>
    <div class="card"><table id="dir-table">
      <thead><tr>
        <th data-k="username">Handle</th><th data-k="name">Name</th>
        <th data-k="in_degree">In</th><th data-k="out_degree">Out</th>
        <th data-k="total">Total</th><th data-k="num_lists">Lists</th>
        <th data-k="jd">JD follows</th>
      </tr></thead>
      <tbody></tbody>
    </table></div>`;
  const q = document.getElementById("dir-q");
  q.addEventListener("input", () => { dirState.q = q.value; paintDir(); });
  el.querySelectorAll("th[data-k]").forEach(th => th.addEventListener("click", () => {
    const k = th.dataset.k;
    if (dirState.key === k) dirState.dir *= -1;
    else { dirState.key = k; dirState.dir = k === "username" || k === "name" ? 1 : -1; }
    paintDir();
  }));
  paintDir();
  q.focus();
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
function paintDir() {
  const rows = dirRows();
  document.getElementById("dir-count").textContent = `${rows.length} of ${N} people`;
  document.querySelectorAll("#dir-table th").forEach(th => {
    const k = th.dataset.k;
    th.classList.toggle("sorted", dirState.key === k);
    th.textContent = th.textContent.replace(/ [▲▼]$/, "") + (dirState.key === k ? (dirState.dir === 1 ? " ▲" : " ▼") : "");
  });
  document.querySelector("#dir-table tbody").innerHTML = rows.map(({p, total}) => `
    <tr>
      <td>${igLink(p.username)}</td>
      <td>${esc(p.name || "—")}</td>
      <td>${p.in_degree}</td><td>${p.out_degree}</td><td><strong>${total}</strong></td>
      <td>${p.num_lists || ""}${p.has_list ? " ●" : ""}</td>
      <td>${p.jd_follows ? "Yes" : ""}</td>
    </tr>`).join("") || `<tr><td colspan="7"><div class="empty">No matches.</div></td></tr>`;
}

buildNav();
show(location.hash === "#directory" ? "directory" : "network");
window.addEventListener("hashchange", () => {
  const k = location.hash === "#directory" ? "directory" : "network";
  show(k);
});
