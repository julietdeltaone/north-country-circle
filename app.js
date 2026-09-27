"use strict";
/* North Country Circle — static site, no build step. Data in window.CIRCLE_DATA. */
const D = window.CIRCLE_DATA || {};
const PEOPLE = (D.people && D.people.people) || [];
const GRAPH = (D.follow_graph && D.follow_graph.people) || [];
const EVENTS = (D.unfollows && D.unfollows.events) || [];
const META = D.meta || {};
const EDGES = (D.friend_edges && D.friend_edges.edges) || [];
const gById = Object.fromEntries(GRAPH.map(g => [g.id, g]));
const igToId = Object.fromEntries(PEOPLE.filter(p => p.ig).map(p => [p.ig, p.id]));

const NAV = [
  {group: "Command", items: [["overview", "Overview"]]},
  {group: "Circle", items: [["graph", "Circle Graph"], ["follows", "Who Follows Who"], ["connections", "Friend Connections"], ["unfollows", "Unfollows"]]},
  {group: "Directory", items: [["directory", "Directory"]]},
  {group: "Add", items: [["intake", "Friend Intake"]]},
];
const RENDERERS = {overview: renderOverview, graph: renderGraph, follows: renderFollows,
                   connections: renderConnections,
                   unfollows: renderUnfollows, directory: renderDirectory, intake: renderIntake};

const COLORS = {mutual: "#8fd0ff", jdfollows: "#ffb454", followsjd: "#d8b98a",
                unfollowed: "#ff7b7b", unlinked: "#8a93a3"};

function statusOf(g) {
  if (!g || !g.linked) return ["unlinked", "Not linked"];
  if (g.unfollowed) return ["unfollowed", "Unfollowed you"];
  if (g.mutual) return ["mutual", "Mutual"];
  if (g.jd_follows) return ["jdfollows", "You follow them"];
  if (g.follows_jd) return ["followsjd", "They follow you"];
  return ["unlinked", "No follow link"];
}
function colorOf(g) { return COLORS[statusOf(g)[0]]; }
function personOf(id) { return PEOPLE.find(p => p.id === id); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

/* ---------- nav ---------- */
function buildNav() {
  const nav = document.getElementById("nav");
  let html = "";
  NAV.forEach(sec => sec.items.forEach(([key, label]) => {
    html += `<button data-view="${key}">${esc(label)}</button>`;
  }));
  nav.innerHTML = html;
  nav.addEventListener("click", e => {
    const b = e.target.closest("button[data-view]");
    if (b) show(b.dataset.view);
  });
  document.getElementById("sync-line").textContent =
    `Synced ${esc(META.synced_at || "—")} · @jdmeyers_ only`;
}
function show(key) {
  document.querySelectorAll(".view").forEach(v => v.hidden = true);
  document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("active", b.dataset.view === key));
  document.getElementById("view-" + key).hidden = false;
  RENDERERS[key]();
  window.scrollTo(0, 0);
}

/* ---------- overview ---------- */
function renderOverview() {
  const el = document.getElementById("view-overview");
  const friends = PEOPLE.filter(p => p.tier === "friend");
  const area = PEOPLE.filter(p => p.tier === "area");
  const mutual = GRAPH.filter(g => g.mutual).length;
  const unf = GRAPH.filter(g => g.unfollowed).length;
  const recent = EVENTS.slice(0, 3);
  el.innerHTML = `
    <h2>Overview<span class="sub">Your North Country circle — friends, their friends in the area, and the Instagram layer on top. Instagram tracking is @jdmeyers_ only.</span></h2>
    <div class="tiles">
      <div class="tile"><div class="n">${friends.length}</div><div class="l">Friends</div></div>
      <div class="tile"><div class="n">${area.length}</div><div class="l">Area connections</div></div>
      <div class="tile good"><div class="n">${mutual}</div><div class="l">Mutual follows</div></div>
      <div class="tile${unf ? " warn" : ""}"><div class="n">${unf}</div><div class="l">Friends who unfollowed</div></div>
      <div class="tile"><div class="n">${EVENTS.length}</div><div class="l">Unfollow events</div></div>
    </div>
    <div class="card">
      <h2 style="font-size:16px">Latest unfollow signals</h2>
      ${recent.length ? recent.map(e => `
        <div class="event"><strong>${esc(e.name)}</strong> <span class="note">@${esc(e.handle)}</span>
        <div class="d">${esc(e.detected)} — ${esc(e.note)}</div></div>`).join("")
        : `<div class="empty">No friend has unfollowed you in the tracked window. Add IG handles via Friend Intake to widen tracking.</div>`}
    </div>
    <div class="card note">Snapshots: ${esc(META.snapshots_used || 0)} follower snapshots
      (${esc(META.snapshot_range || "—")}). Following seed: ${esc(META.following_seed || "—")}.</div>`;
}

/* ---------- circle graph ---------- */
function renderGraph() {
  const el = document.getElementById("view-graph");
  const W = 900, C = 450, R1 = 250, R2 = 395;
  const friends = PEOPLE.filter(p => p.tier === "friend").sort((a, b) => a.name.localeCompare(b.name));
  const areas = PEOPLE.filter(p => p.tier === "area");
  const angleOf = {};
  friends.forEach((f, i) => angleOf[f.id] = friends.length === 1 ? -Math.PI / 2 : (i / friends.length) * Math.PI * 2 - Math.PI / 2);

  let svg = `<svg viewBox="0 0 ${W} ${W}" width="100%" role="img" aria-label="Circle graph">`;
  // edges JD -> friends
  friends.forEach(f => {
    const a = angleOf[f.id], g = gById[f.id];
    const x = C + R1 * Math.cos(a), y = C + R1 * Math.sin(a);
    svg += `<line x1="${C}" y1="${C}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${colorOf(g)}" stroke-width="1.5" opacity="0.55"/>`;
  });
  // friend-to-friend edges (collected following lists): thin arcs between inner-ring nodes
  const drawn = new Set();
  EDGES.forEach(e => {
    const aId = igToId[e.from], bId = igToId[e.to];
    if (!aId || !bId || aId === bId) return;
    if (angleOf[aId] == null || angleOf[bId] == null) return;
    const key = [aId, bId].sort().join("|");
    if (drawn.has(key)) return;
    drawn.add(key);
    const a1 = angleOf[aId], a2 = angleOf[bId];
    const x1 = C + R1 * Math.cos(a1), y1 = C + R1 * Math.sin(a1);
    const x2 = C + R1 * Math.cos(a2), y2 = C + R1 * Math.sin(a2);
    const mid = (a1 + a2) / 2;
    const cx = C + R1 * 0.55 * Math.cos(mid), cy = C + R1 * 0.55 * Math.sin(mid);
    svg += `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}" fill="none" stroke="#4a5a7a" stroke-width="1.2" opacity="0.65"/>`;
  });
  // edges friend -> area
  areas.forEach(p => {
    const via = p.via && personOf(p.via);
    const base = via && angleOf[via.id] != null ? angleOf[via.id] : 0;
    const sibs = areas.filter(q => q.via === p.via);
    const j = sibs.findIndex(q => q.id === p.id);
    const a = base + (j - (sibs.length - 1) / 2) * 0.22;
    const x1 = C + R1 * Math.cos(base), y1 = C + R1 * Math.sin(base);
    const x2 = C + R2 * Math.cos(a), y2 = C + R2 * Math.sin(a);
    svg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#3a4660" stroke-width="1" opacity="0.6"/>`;
    p._x = x2; p._y = y2;
  });

  const node = (x, y, r, color, name, sub, id) => `
    <g class="node" data-id="${esc(id)}">
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="#10141d" stroke="${color}" stroke-width="2.5"/>
      <text x="${x.toFixed(1)}" y="${(y + r + 16).toFixed(1)}">${esc(name)}</text>
      ${sub ? `<text class="sub" x="${x.toFixed(1)}" y="${(y + r + 30).toFixed(1)}">${esc(sub)}</text>` : ""}
    </g>`;
  // JD hub
  svg += `<g class="node" data-id="__jd">
      <circle cx="${C}" cy="${C}" r="36" fill="#16202f" stroke="#8fd0ff" stroke-width="3"/>
      <text x="${C}" y="${C + 6}" style="font-weight:800;font-size:15px">JD</text>
      <text class="sub" x="${C}" y="${C + 54}">@jdmeyers_</text></g>`;
  friends.forEach(f => {
    const a = angleOf[f.id], g = gById[f.id];
    const x = C + R1 * Math.cos(a), y = C + R1 * Math.sin(a);
    svg += node(x, y, 24, colorOf(g), f.name, f.town || "", f.id);
  });
  areas.forEach(p => {
    const g = gById[p.id];
    svg += node(p._x, p._y, 17, colorOf(g), p.name, p.town || "", p.id);
  });
  svg += `</svg>`;

  el.innerHTML = `
    <h2>Circle Graph<span class="sub">Hub-and-spoke: you at the center, friends on the inner ring, their North Country friends on the outer ring. Tap a node for details.</span></h2>
    <div class="legend">
      <span><span class="dot" style="background:#8fd0ff"></span>Mutual follow</span>
      <span><span class="dot" style="background:#ffb454"></span>You follow them</span>
      <span><span class="dot" style="background:#d8b98a"></span>They follow you</span>
      <span><span class="dot" style="background:#ff7b7b"></span>Unfollowed you</span>
      <span><span class="dot" style="background:#8a93a3"></span>No IG linked</span>
      <span><span class="dot" style="background:#4a5a7a"></span>Friend-to-friend follow</span>
    </div>
    <div class="graph-wrap">
      <div class="card graph-box">${svg}</div>
      <div class="card detail" id="node-detail"><div class="empty">Tap a node to see details.</div></div>
    </div>`;
  el.querySelectorAll(".node").forEach(n => n.addEventListener("click", () => showDetail(n.dataset.id)));
}
function showDetail(id) {
  const box = document.getElementById("node-detail");
  if (id === "__jd") {
    box.innerHTML = `<h3>JD Meyers</h3><div class="meta">@jdmeyers_ · Potsdam, NY</div>
      <div class="how">The hub. ${PEOPLE.length} people mapped so far.</div>`;
    return;
  }
  const p = personOf(id), g = gById[id] || {};
  const [cls, label] = statusOf(g);
  const via = p.via && personOf(p.via);
  const evts = EVENTS.filter(e => e.handle === p.ig);
  box.innerHTML = `
    <h3>${esc(p.name)}</h3>
    <div class="meta">${p.ig ? `<a href="https://www.instagram.com/${esc(p.ig)}/" target="_blank" rel="noopener">@${esc(p.ig)}</a> · ` : ""}${esc(p.town || "")}${p.county && p.county !== "unknown" ? ", " + esc(p.county) : ""}</div>
    <p><span class="pill ${cls}">${label}</span></p>
    ${p.how ? `<div class="how">${esc(p.how)}</div>` : ""}
    ${via ? `<div class="note" style="margin-top:8px">Connected via ${esc(via.name)}</div>` : ""}
    ${evts.length ? `<div style="margin-top:10px"><strong>Unfollow history</strong>${evts.map(e => `<div class="event"><div class="d">${esc(e.detected)}</div>${esc(e.note)}</div>`).join("")}</div>` : ""}
    ${p.notes ? `<div class="note" style="margin-top:8px">${esc(p.notes)}</div>` : ""}
    ${p.ig_source ? `<div class="note" style="margin-top:8px">IG link: ${esc(p.ig_source)}</div>` : ""}`;
}

/* ---------- who follows who ---------- */
function renderFollows() {
  const el = document.getElementById("view-follows");
  const rows = PEOPLE.map(p => {
    const g = gById[p.id] || {};
    const [cls, label] = statusOf(g);
    const chk = v => v ? "Yes" : "No";
    return `<tr>
      <td><strong>${esc(p.name)}</strong><br><span class="note">${p.ig ? `<a href="https://www.instagram.com/${esc(p.ig)}/" target="_blank" rel="noopener">@${esc(p.ig)}</a>` : "no IG linked"}</span></td>
      <td>${chk(g.jd_follows)}</td><td>${chk(g.follows_jd)}</td>
      <td><span class="pill ${cls}">${label}</span></td>
    </tr>`;
  }).join("");
  el.innerHTML = `
    <h2>Who Follows Who<span class="sub">Follow status between you and everyone mapped, from @jdmeyers_ data.</span></h2>
    <div class="card"><table>
      <tr><th>Person</th><th>You follow</th><th>Follows you</th><th>Status</th></tr>
      ${rows || `<tr><td colspan="4"><div class="empty">Nobody mapped yet — add friends under Friend Intake.</div></td></tr>`}
    </table></div>
    <div class="card note">Friend-to-friend follows come from the collected following lists (see Friend Connections) — not just what you tell Luna.</div>`;
}

/* ---------- friend connections ---------- */
function edgeName(handle, fallback) {
  const id = igToId[handle];
  if (id) { const p = personOf(id); if (p) return p.name; }
  return fallback || ("@" + handle);
}
function renderConnections() {
  const el = document.getElementById("view-connections");
  const rows = EDGES.map(e => {
    const fn = edgeName(e.from, e.from_name), tn = edgeName(e.to, e.to_name);
    const tag = e.target_kind === "jd_account" ? "your account"
      : e.target_kind === "collected" ? "collected list" : "roster";
    return `<tr>
      <td><strong>${esc(fn)}</strong><br><span class="note"><a href="https://www.instagram.com/${esc(e.from)}/" target="_blank" rel="noopener">@${esc(e.from)}</a></span></td>
      <td class="note">follows</td>
      <td><strong>${esc(tn)}</strong><br><span class="note"><a href="https://www.instagram.com/${esc(e.to)}/" target="_blank" rel="noopener">@${esc(e.to)}</a></span></td>
      <td><span class="note">${esc(tag)}</span></td>
    </tr>`;
  }).join("");
  el.innerHTML = `
    <h2>Friend Connections<span class="sub">Follow links between mapped friends and your accounts, from the friend-of-friend following lists collected 2026-09-27. Same links draw as thin arcs on the Circle Graph.</span></h2>
    <div class="card"><table>
      <tr><th>Follower</th><th></th><th>Followed</th><th>Target</th></tr>
      ${rows || `<tr><td colspan="4"><div class="empty">No friend-to-friend edges collected yet.</div></td></tr>`}
    </table></div>
    <div class="card note">${EDGES.length} directed edges. Lists: @johnmeyers_sr, @jamesphilipm, @mr_writers_block, @davidzufall (partial, 132 of 1,436), @elisameyers. David Zufall's handle and Elisa Meyers' identity are unconfirmed.</div>`;
}

/* ---------- unfollows ---------- */
function renderUnfollows() {
  const el = document.getElementById("view-unfollows");
  el.innerHTML = `
    <h2>Unfollows<span class="sub">Friends who stopped following @jdmeyers_, newest first. Detected from your follower snapshots.</span></h2>
    ${EVENTS.length ? EVENTS.map(e => `
      <div class="event"><strong>${esc(e.name)}</strong> <span class="note">@${esc(e.handle)}</span>
      <div class="d">${esc(e.detected)} — ${esc(e.note)}</div></div>`).join("")
      : `<div class="empty">No unfollows detected among your mapped friends. Link IG handles on the Friend Intake view to widen tracking.</div>`}`;
}

/* ---------- directory ---------- */
function renderDirectory() {
  const el = document.getElementById("view-directory");
  const card = p => {
    const g = gById[p.id] || {};
    const [cls, label] = statusOf(g);
    const via = p.via && personOf(p.via);
    return `<div class="dir-card">
      <h3>${esc(p.name)}</h3>
      <div class="meta">${p.ig ? `<a href="https://www.instagram.com/${esc(p.ig)}/" target="_blank" rel="noopener">@${esc(p.ig)}</a> · ` : ""}${esc(p.tier === "friend" ? "Friend" : "Area connection")}${p.town ? " · " + esc(p.town) : ""}</div>
      ${p.how ? `<div class="how">${esc(p.how)}</div>` : ""}
      ${via ? `<div class="note">Via ${esc(via.name)}</div>` : ""}
      <p><span class="pill ${cls}">${label}</span></p>
    </div>`;
  };
  const friends = PEOPLE.filter(p => p.tier === "friend");
  const areas = PEOPLE.filter(p => p.tier === "area");
  el.innerHTML = `
    <h2>Directory<span class="sub">Everyone mapped, grouped by ring.</span></h2>
    <h2 style="font-size:15px">Friends</h2>
    <div class="grid">${friends.map(card).join("") || `<div class="empty">None yet.</div>`}</div>
    <h2 style="font-size:15px;margin-top:20px">Area connections</h2>
    <div class="grid">${areas.map(card).join("") || `<div class="empty">None yet.</div>`}</div>`;
}

/* ---------- intake ---------- */
function renderIntake() {
  const el = document.getElementById("view-intake");
  el.innerHTML = `
    <h2>Friend Intake<span class="sub">Queue people here, copy the block, paste it to Luna — she adds them to the circle on the next sync.</span></h2>
    <div class="card form">
      <div class="row2">
        <div><label>Name</label><input id="f-name" placeholder="Full name"></div>
        <div><label>Instagram handle (optional)</label><input id="f-ig" placeholder="username, no @"></div>
      </div>
      <div class="row2">
        <div><label>Town</label><input id="f-town" placeholder="Potsdam"></div>
        <div><label>Ring</label><select id="f-tier"><option value="friend">Friend (inner ring)</option><option value="area">Friend's friend in the area (outer ring)</option></select></div>
      </div>
      <div class="row2">
        <div><label>Connected via (for outer ring)</label><input id="f-via" placeholder="Which friend connects them"></div>
        <div><label>How you know them</label><input id="f-how" placeholder="e.g. pickup soccer, church"></div>
      </div>
      <label>Notes</label><textarea id="f-notes"></textarea>
      <button class="btn" id="q-add">Queue person</button>
      <button class="btn ghost" id="q-copy">Copy queue as text</button>
      <button class="btn ghost" id="q-clear">Clear queue</button>
      <div class="queue" id="q-list"></div>
    </div>`;
  const KEY = "ncc-intake";
  const get = () => JSON.parse(localStorage.getItem(KEY) || "[]");
  const set = v => localStorage.setItem(KEY, JSON.stringify(v));
  const paint = () => {
    const q = get();
    document.getElementById("q-list").innerHTML = q.length
      ? `<label>Queued (${q.length})</label><pre>${esc(q.map(block).join("\n"))}</pre>` : "";
  };
  const block = q => `FRIEND: ${q.name}\nIG: ${q.ig || "-"}\nTOWN: ${q.town || "-"}\nTIER: ${q.tier}\nVIA: ${q.via || "-"}\nHOW: ${q.how || "-"}\nNOTES: ${q.notes || "-"}`;
  document.getElementById("q-add").onclick = () => {
    const name = document.getElementById("f-name").value.trim();
    if (!name) return;
    const q = get();
    q.push({name, ig: document.getElementById("f-ig").value.trim().replace(/^@/, ""),
            town: document.getElementById("f-town").value.trim(),
            tier: document.getElementById("f-tier").value,
            via: document.getElementById("f-via").value.trim(),
            how: document.getElementById("f-how").value.trim(),
            notes: document.getElementById("f-notes").value.trim()});
    set(q); paint();
    ["f-name","f-ig","f-town","f-via","f-how","f-notes"].forEach(id => document.getElementById(id).value = "");
  };
  document.getElementById("q-copy").onclick = () => {
    const txt = get().map(block).join("\n\n");
    if (txt) navigator.clipboard.writeText(txt);
  };
  document.getElementById("q-clear").onclick = () => { set([]); paint(); };
  paint();
}

buildNav();
show("overview");
