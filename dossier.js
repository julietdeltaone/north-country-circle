/* North Country Circle — Dossier. Hub-spoke directory + dossier documents + redaction wall. */
(function(){
'use strict';
var S = { q:'', rel:'', sel:null, showBg:false, listOpen:true, mode:'3d', auditFilter:false, editing:false };
var D = null, NODES = [], ORDER = [];
var UNLOCKED = false;
try { UNLOCKED = sessionStorage.getItem('dossier_clear') === '1'; } catch(e){}

function $(s,r){ return (r||document).querySelector(s); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function initial(s){ s=String(s||'').replace(/^@/,'').trim(); return s? s[0].toUpperCase() : '·'; }
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0;
  var t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t;
  return ((t^t>>>14)>>>0)/4294967296; }; }

var RELC = { mutual:'#e8b34b', following:'#6fd3e7', follower:'#6db3f2' };

/* ---------- ambient backdrop ---------- */
function ambient(){
  var cv = $('#ambient'), ctx = cv.getContext('2d');
  var W,H;
  function size(){
    W = Math.floor(innerWidth/3); H = Math.floor(innerHeight/3);
    cv.width=W; cv.height=H; cv.style.width=innerWidth+'px'; cv.style.height=innerHeight+'px';
  }
  size(); addEventListener('resize', size);
  var blobs = [
    {x:.22,y:.28,r:.42,c:'232,179,75', a:.055, sx:.00011, sy:.00013, p:0},
    {x:.78,y:.62,r:.5, c:'111,211,231',a:.045, sx:.00009, sy:.00012, p:2},
    {x:.6, y:.12,r:.36, c:'180,140,232',a:.04, sx:.00012, sy:.00008, p:4},
    {x:.12,y:.85,r:.4, c:'109,179,242',a:.035,sx:.00008, sy:.0001,  p:1}
  ];
  var t0 = performance.now(), running = true;
  document.addEventListener('visibilitychange', function(){ running = !document.hidden; if(running) requestAnimationFrame(frame); });
  function frame(now){
    if(!running) return;
    var t = (now-t0)/1000;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = '#070a10'; ctx.fillRect(0,0,W,H);
    blobs.forEach(function(b){
      var x = (b.x + Math.sin(t*b.sx*1000 + b.p)*.06) * W;
      var y = (b.y + Math.cos(t*b.sy*1000 + b.p)*.06) * H;
      var r = b.r * Math.max(W,H);
      var g = ctx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,'rgba('+b.c+','+b.a+')');
      g.addColorStop(1,'rgba('+b.c+',0)');
      ctx.fillStyle = g;
      ctx.fillRect(0,0,W,H);
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ---------- dossier document (unchanged design) ---------- */
function igURL(h){ return 'https://www.instagram.com/'+encodeURIComponent(String(h).replace(/^@/,'') )+'/'; }
function meter(n, max, label){
  var p = Math.max(0, Math.min(100, (n/max)*100));
  return '<div class="pmeter"><div class="barlbl"><span>'+label+'</span><b>'+n+' / '+max+'</b></div>'+
    '<div class="bar"><i style="width:'+p+'%"></i></div></div>';
}
function classbar(){ return '<div class="classbar">Personal file · JD Meyers</div>'; }

var PROFILE_FIELDS = [
  {k:'relationship', label:'Relationship', type:'select', options:['','family','friend','coworker','acquaintance','other']},
  {k:'context', label:'Context', type:'select', options:['','work','school','military','community','online','other']},
  {k:'closeness', label:'Closeness', type:'score', hint:'1 rarely interact · 5 know them well'},
  {k:'specialty', label:'Specialty', type:'text'},
  {k:'interests', label:'Interests', type:'text'},
  {k:'charisma', label:'Charisma', type:'score', hint:'1 fades into background · 5 people gravitate'},
  {k:'competence', label:'Competence', type:'score', hint:'within their own field'},
  {k:'intellect', label:'Intellect', type:'score'},
  {k:'creativity', label:'Creativity', type:'score'},
  {k:'reliability', label:'Reliability', type:'score', hint:'1 often misses · 5 never check'},
  {k:'reputation', label:'Reputation', type:'score'},
  {k:'assertiveness', label:'Assertiveness', type:'score'},
  {k:'ego', label:'Ego', type:'score', hint:'1 credits others · 5 takes credit'},
];
function pkey(e){ return e.src === 'contacts' ? e.name : 'ig:' + (e.name || '').toLowerCase(); }
function auditBadge(e){
  var a = (e.profile || {}).audit || 'needs_audit';
  return a === 'audited'
    ? '<span class="auditbadge ok">● audited</span>'
    : '<span class="auditbadge needs">● needs audit</span>';
}
function dotRow(k, val){
  var h = '<div class="dots" data-pk="' + k + '">';
  for(var i = 1; i <= 5; i++){
    h += '<span class="pdot' + (String(val) === String(i) ? ' on' : '') + '" data-v="' + i + '">' + i + '</span>';
  }
  return h + '</div>';
}
function profRow(f, prof){
  var v = prof[f.k] || '';
  var h = '<div class="prow"><div class="plab">' + esc(f.label) +
    (f.hint ? '<span class="phint">' + esc(f.hint) + '</span>' : '') + '</div><div class="pctl">';
  if(f.type === 'select'){
    h += '<select data-pk="' + f.k + '">' + f.options.map(function(o){
      return '<option value="' + esc(o) + '"' + (o === v ? ' selected' : '') + '>' + esc(o || '—') + '</option>';
    }).join('') + '</select>';
  } else if(f.type === 'score'){
    h += dotRow(f.k, v);
  } else {
    h += '<input data-pk="' + f.k + '" value="' + esc(v) + '" placeholder="—">';
  }
  return h + '</div></div>';
}
var SCORE_FIELDS = [
  {k:'closeness', label:'Closeness'},
  {k:'charisma', label:'Charisma'},
  {k:'competence', label:'Competence'},
  {k:'intellect', label:'Intellect'},
  {k:'creativity', label:'Creativity'},
  {k:'reliability', label:'Reliability'},
  {k:'reputation', label:'Reputation'},
  {k:'assertiveness', label:'Assertiveness'},
  {k:'ego', label:'Ego'}
];
function ringSVG(val, max, label){
  var v = parseInt(val || '0', 10) || 0;
  var C = 2 * Math.PI * 15.5, frac = max ? Math.max(0, Math.min(1, v / max)) : 0;
  return '<div class="vring"><svg viewBox="0 0 40 40" width="52" height="52">' +
    '<circle cx="20" cy="20" r="15.5" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="5"/>' +
    '<circle cx="20" cy="20" r="15.5" fill="none" stroke="var(--amber)" stroke-width="5" stroke-linecap="round" ' +
    'stroke-dasharray="' + (C * frac).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 20 20)"/>' +
    '<text x="20" y="24" text-anchor="middle" font-size="11" font-weight="700" fill="var(--txt)">' + v + '</text></svg>' +
    '<span>' + esc(label) + '</span></div>';
}
function barRow(f, val){
  var v = parseInt(val || '0', 10) || 0;
  return '<div class="vrow"><span class="vlab">' + esc(f.label) + '</span>' +
    '<div class="vbar"><i style="width:' + (v * 20) + '%"></i></div>' +
    '<b class="vval">' + (val ? v : '–') + '</b></div>';
}
/* Compact read-only view: every data point visible without scrolling. */
function dossierView(e, idx, head){
  var prof = e.profile || {};
  var bars = SCORE_FIELDS.map(function(f){ return barRow(f, prof[f.k]); }).join('');
  var chips = '';
  if(prof.relationship) chips += '<span class="vchip">' + esc(prof.relationship) + '</span>';
  if(prof.context) chips += '<span class="vchip">' + esc(prof.context) + '</span>';
  if(e.src === 'contacts') chips += '<span class="vchip">phone contact</span>';
  var spec = '';
  if(prof.specialty) spec += '<div class="vline"><span>Specialty</span>' + esc(prof.specialty) + '</div>';
  if(prof.interests) spec += '<div class="vline"><span>Interests</span>' + esc(prof.interests) + '</div>';
  var score100 = '';
  if(prof.enriched_value){
    var m = String(prof.enriched_value).match(/^(\d{1,3})\s*[—–-]/);
    if(m) score100 = ringSVG(m[1], 100, 'Score');
  }
  var narr = prof.enriched_value
    ? esc(String(prof.enriched_value).replace(/^\d{1,3}\s*[—–-]\s*/, ''))
    : 'No assessment generated yet.';
  return '<div class="doc">' + classbar() + head +
    '<div class="dsec"><h3><span class="n">01</span> The 15</h3>' +
    (chips ? '<div class="vchips">' + chips + '</div>' : '') +
    '<div class="vcols"><div class="vbars">' + bars + '</div>' +
    '<div class="vrings">' + ringSVG(prof.closeness, 5, 'Close') + score100 + '</div></div>' +
    spec + '</div>' +
    '<div class="dsec"><h3><span class="n">02</span> Assessment</h3>' +
    '<div class="narr">' + narr + '</div>' +
    '<div class="arow"><button id="enrichbtn" class="xbtn acc">Generate assessment</button><span id="enrmsg"></span></div>' +
    ((prof.enriched === '1' || prof.enriched === 1)
      ? '<div class="calcnote">calculated' + (prof.enriched_at ? ' · ' + esc(prof.enriched_at) : '') + '</div>'
      : '<div class="calcnote dim">not calculated</div>') +
    '</div>' +
    '<details class="dsec det"><summary><h3><span class="n">03</span> Directory</h3></summary>' + dirDetails(e) + '</details>' +
    '<details class="dsec det"><summary><h3><span class="n">04</span> Reference</h3></summary>' + refDetails(e) + '</details>' +
    classbar().replace('classbar', 'classbar bot') + '</div>';
}
function dirDetails(e){
  var c = e.contact || {};
  var rows = '<dt>Key</dt><dd>' + esc(pkey(e)) + '</dd>';
  if(c.phones && c.phones.length) rows += '<dt>Phone</dt><dd>' + esc(c.phones.join(', ')) + '</dd>';
  if(c.emails && c.emails.length) rows += '<dt>Email</dt><dd>' + esc(c.emails.join(', ')) + '</dd>';
  if(c.orgs && c.orgs.length) rows += '<dt>Org</dt><dd>' + esc(c.orgs.join(', ')) + '</dd>';
  if(e.src !== 'contacts'){
    rows += '<dt>Relation</dt><dd>' + esc(e.relation || '—') + '</dd>' +
      '<dt>Graph connections</dt><dd>' + e.degree + '</dd>' +
      '<dt>Shared with you</dt><dd>' + e.shared_with_jd + '</dd>';
    if(e.detail) rows += '<dt>On file</dt><dd>' + esc(e.detail) + '</dd>';
  }
  var nbrs = (e.neighbors || []).slice(0, 8);
  var nbrChips = nbrs.length ? nbrs.map(function(nb){
    return '<span class="nchip" data-nx="' + esc(nb.u) + '">' + esc(nb.d || nb.u) + '</span>';
  }).join('') : '<p class="body">No close connections mapped.</p>';
  return '<dl class="kv">' + rows + '</dl><h4 style="margin:12px 0 8px">Close connections</h4>' + nbrChips;
}
function refDetails(e){
  var leg = e.legacy || {}, rec = e.record || {};
  var hasSensitive = !!(leg.desc || rec.body || (e.friendsdb || {}).phone || e.notes);
  var inner = '';
  if(leg.desc) inner += '<p class="body rtext">' + esc(leg.desc) + '</p>';
  if(rec.body) inner += '<p class="body rtext">' + esc(rec.body) + '</p>';
  if(e.public_footprint) inner += '<p class="body rtext"><span style="color:var(--dim)">Public footprint</span><br>' + esc(e.public_footprint) + '</p>';
  if(!inner) inner = '<p class="body">No reference material on file.</p>';
  return '<div class="memoir' + (UNLOCKED || !hasSensitive ? ' unlocked' : '') + '">' + inner + (hasSensitive ? wallHTML() : '') + '</div>';
}
/* Edit mode: the fast-entry form. */
function dossierEdit(e, idx, head){
  var prof = e.profile || {};
  var prows = PROFILE_FIELDS.map(function(f){ return profRow(f, prof); }).join('');
  var narrVal = prof.enriched_value ? String(prof.enriched_value).replace(/^\d{1,3}\s*[—–-]\s*/, '') : '';
  return '<div class="doc">' + classbar() + head +
    '<div class="dsec"><h3><span class="n">01</span> The 15</h3><div class="pform">' + prows + '</div></div>' +
    '<div class="dsec"><h3><span class="n">02</span> Assessment</h3>' +
    '<textarea id="narrtext" data-pk="enriched_value" rows="4" placeholder="Narrative assessment — or Generate to fill it in.">' + esc(narrVal) + '</textarea>' +
    '<div class="arow"><button id="enrichbtn" class="xbtn acc">Generate assessment</button><span id="enrmsg"></span></div></div>' +
    classbar().replace('classbar', 'classbar bot') + '</div>';
}
function dossierDir(e, idx){
  var prof = e.profile || {};
  var title = e.display || e.name;
  var sub = e.src === 'contacts' ? 'phone contact' : '@' + e.name;
  if(e.relation) sub += ' · ' + e.relation;
  var head = '<div class="doc-head"><div class="doc-actions">' +
    (S.editing
      ? '<input id="ppw" type="password" placeholder="Password" autocomplete="off" aria-label="Password">' +
        '<button id="psave" disabled>Save</button><button id="pdone">Done</button>'
      : '<button id="pedit">Edit</button>') +
    '<button id="paudit">' + ((prof.audit === 'audited') ? 'Audited ✓' : 'Mark audited') + '</button>' +
    '<button id="mclose">Close</button></div>' +
    '<div class="doc-kicker">Personal file · #' + String(idx + 1).padStart(3, '0') + ' ' + auditBadge(e) + '</div>' +
    '<h2>' + esc(title) + '</h2>' +
    '<div class="doc-filed">' + esc(sub) + '</div></div>';
  return S.editing ? dossierEdit(e, idx, head) : dossierView(e, idx, head);
}

/* Soft barrier only: this page and its data are public on a static host.
   The password is a privacy screen against casual viewing, not access control. */
function wallHTML(){
  return '<div class="wall"><div class="wlock">◈</div>'+
    '<div class="wstamp">Restricted</div>'+
    '<p>This section holds personal subject material. Enter the password to reveal it.</p>'+
    '<form class="wallform"><input type="password" placeholder="Password" autocomplete="off" aria-label="Password">'+
    '<button type="submit">Reveal</button></form>'+
    '<p class="werr"></p></div>';
}
function unlock(){
  UNLOCKED = true;
  try { sessionStorage.setItem('dossier_clear', '1'); } catch(e){}
  document.querySelectorAll('.memoir').forEach(function(m){ m.classList.add('unlocked'); });
}
function tryUnlock(form){
  var input = form.querySelector('input'), err = form.parentElement.querySelector('.werr');
  if(input.value === 'admin'){ unlock(); }
  else { err.textContent = 'Wrong password.'; input.value=''; input.focus(); }
}

/* ---------- hub-spoke layout (deterministic) ---------- */
function buildNodes(){
  var dir = D.directory;
  var maxS = 1;
  dir.forEach(function(r){ if(r.strength > maxS) maxS = r.strength; });
  ORDER = dir.map(function(r,i){ return i; })
    .filter(function(i){ return dir[i].has_graph !== false; })
    .sort(function(a,b){ return dir[b].strength - dir[a].strength || a - b; });
  var bounds = [60, 300, dir.length];           // ring cutoffs
  var radii  = [170, 310, 490];
  var spread = [16, 36, 50];
  var counts = [0,0,0];
  NODES = ORDER.map(function(di, pos){
    var ring = pos < bounds[0] ? 0 : (pos < bounds[1] ? 1 : 2);
    var k = counts[ring]++;
    var n = ring===0 ? bounds[0] : (ring===1 ? bounds[1]-bounds[0] : dir.length-bounds[1]);
    var rng = mulberry32(di*2654435761 % 2147483647);
    var ang = (k/n)*Math.PI*2 + (rng()-0.5)*(Math.PI*2/n)*0.6 + ring*0.7;
    var rad = radii[ring] + (rng()-0.5)*2*spread[ring];
    var r = dir[di];
    return {
      i: di, ring: ring, ang: ang,
      x: Math.cos(ang)*rad, y: Math.sin(ang)*rad,
      rad: 2.0 + 3.6*(r.strength/maxS),
      color: RELC[r.relation] || '#9aa3b2',
      title: r.display || r.name, handle: r.name, relation: r.relation,
      pieces: r.pieces, strength: r.strength
    };
  });
}

/* ---------- hub-spoke canvas ---------- */
var hub = {
  cv:null, ctx:null, W:0, H:0, dpr:1,
  cam:{x:0,y:0,z:1}, target:null,
  rot:0, hover:null, dragging:false, lastT:0,
  bgDots:null
};
function hubInit(){
  hub.cv = $('#hub'); hub.ctx = hub.cv.getContext('2d');
  hubResize();
  addEventListener('resize', hubResize);
  // camera fit
  hubFit();
  // pointer
  var sx=0, sy=0, moved=false;
  hub.cv.addEventListener('pointerdown', function(e){
    hub.dragging = true; moved = false; sx = e.clientX; sy = e.clientY;
    hub.cv.setPointerCapture(e.pointerId);
  });
  hub.cv.addEventListener('pointermove', function(e){
    if(hub.dragging){
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if(Math.abs(dx)+Math.abs(dy) > 3) moved = true;
      hub.cam.x -= dx/hub.cam.z; hub.cam.y -= dy/hub.cam.z;
      hub.target = null;
      sx = e.clientX; sy = e.clientY;
    } else {
      hubHover(e);
    }
  });
  hub.cv.addEventListener('pointerup', function(e){
    hub.dragging = false;
    if(!moved) hubClick(e);
  });
  hub.cv.addEventListener('pointerleave', function(){ hub.hover = null; tipHide(); });
  hub.cv.addEventListener('wheel', function(e){
    e.preventDefault();
    var z2 = Math.max(0.35, Math.min(3.2, hub.cam.z * Math.exp(-e.deltaY*0.0011)));
    // zoom toward cursor
    var r = hub.cv.getBoundingClientRect();
    var mx = e.clientX - r.left, my = e.clientY - r.top;
    var wx = (mx - hub.W/2)/hub.cam.z + hub.cam.x;
    var wy = (my - hub.H/2)/hub.cam.z + hub.cam.y;
    hub.cam.z = z2;
    hub.cam.x = wx - (mx - hub.W/2)/z2;
    hub.cam.y = wy - (my - hub.H/2)/z2;
    hub.target = null;
  }, {passive:false});
  document.addEventListener('visibilitychange', function(){
    if(!document.hidden) hub.lastT = performance.now();
  });
  hub.lastT = performance.now();
  requestAnimationFrame(hubFrame);
}
function hubResize(){
  var r = $('#stage').getBoundingClientRect();
  hub.dpr = Math.min(2, window.devicePixelRatio || 1);
  hub.W = Math.max(50, r.width); hub.H = Math.max(50, r.height);
  hub.cv.width = Math.round(hub.W*hub.dpr); hub.cv.height = Math.round(hub.H*hub.dpr);
  hub.cv.style.width = hub.W+'px'; hub.cv.style.height = hub.H+'px';
  hub.bgDots = null;
}
function hubFit(){
  var z = Math.min(hub.W, hub.H)/2 / 560;
  hub.cam = {x:0, y:0, z:Math.max(0.3, Math.min(1.4, z))};
  hub.target = null;
}
function w2s(wx, wy){
  var sh = (typeof layoutShift === 'function') ? layoutShift().ox2d : 0;
  return [ (wx - hub.cam.x)*hub.cam.z + hub.W/2 + sh, (wy - hub.cam.y)*hub.cam.z + hub.H/2 ];
}
function s2w(sx, sy){
  var sh = (typeof layoutShift === 'function') ? layoutShift().ox2d : 0;
  return [ (sx - hub.W/2 - sh)/hub.cam.z + hub.cam.x, (sy - hub.H/2)/hub.cam.z + hub.cam.y ];
}
function nodeAlpha(n){
  var q = S.q.trim().toLowerCase();
  if(S.rel && n.relation !== S.rel) return 0.1;
  if(q && (n.title+' @'+n.handle).toLowerCase().indexOf(q) < 0) return 0.1;
  return 1;
}
function hubFrame(now){
  if(S.mode === '3d'){ requestAnimationFrame(hubFrame); return; }
  var dt = Math.min(0.05, (now - hub.lastT)/1000); hub.lastT = now;
  // gentle drift; pauses on hover/drag/selection so targets stay put
  if(!document.hidden && !hub.dragging && hub.hover === null && S.sel === null){
    hub.rot += dt * 0.018;
  }
  // camera glide toward target
  if(hub.target){
    hub.cam.x += (hub.target.x - hub.cam.x)*Math.min(1, dt*5);
    hub.cam.y += (hub.target.y - hub.cam.y)*Math.min(1, dt*5);
    if(Math.abs(hub.target.x-hub.cam.x) < 1 && Math.abs(hub.target.y-hub.cam.y) < 1) hub.target = null;
  }
  var ctx = hub.ctx, W = hub.W, H = hub.H;
  ctx.setTransform(hub.dpr,0,0,hub.dpr,0,0);
  ctx.clearRect(0,0,W,H);
  var z = hub.cam.z;

  // background full circle
  if(S.showBg) drawBg(ctx, z);

  // spokes
  ctx.lineWidth = 1;
  NODES.forEach(function(n){
    var a = nodeAlpha(n);
    if(a < 0.5 && S.q === '' && !S.rel) { /* still draw faint */ }
    var p = w2s(n.x, n.y), c = w2s(0,0);
    ctx.strokeStyle = hexA(n.color, n.ring===0 ? 0.10 : 0.05);
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.moveTo(c[0],c[1]); ctx.lineTo(p[0],p[1]); ctx.stroke();
  });
  ctx.globalAlpha = 1;

  // nodes
  NODES.forEach(function(n){
    var a = nodeAlpha(n);
    var p = w2s(rotX(n), rotY(n));
    if(p[0] < -30 || p[1] < -30 || p[0] > W+30 || p[1] > H+30) return;
    var rr = Math.max(1.6, n.rad * Math.sqrt(z));
    ctx.globalAlpha = a;
    if(a > 0.5 || S.sel === n.i){
      ctx.shadowColor = n.color; ctx.shadowBlur = (S.sel===n.i || hub.hover===n) ? 14 : 6;
    }
    ctx.fillStyle = n.color;
    ctx.beginPath(); ctx.arc(p[0],p[1],rr,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    if(S.sel === n.i || hub.hover === n){
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(p[0],p[1],rr+3.5,0,Math.PI*2); ctx.stroke();
    }
  });
  ctx.globalAlpha = 1;

  // center node: JD
  var c = w2s(0,0);
  var grd = ctx.createRadialGradient(c[0],c[1],0,c[0],c[1],26*Math.sqrt(z));
  grd.addColorStop(0,'rgba(232,179,75,.9)'); grd.addColorStop(1,'rgba(232,179,75,0)');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(c[0],c[1],26*Math.sqrt(z),0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#e8b34b';
  ctx.beginPath(); ctx.arc(c[0],c[1],Math.max(7,11*Math.sqrt(z)),0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#0b0d12';
  ctx.font = '700 '+Math.max(9,11*Math.sqrt(z))+'px Archivo,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('JD', c[0], c[1]+0.5);
  ctx.fillStyle = 'rgba(236,233,226,.75)';
  ctx.font = '600 11px "Hanken Grotesk",sans-serif';
  ctx.fillText('@jdmeyers_', c[0], c[1] + 20*Math.sqrt(z) + 8);

  requestAnimationFrame(hubFrame);
}
function rotX(n){ var a = n.ang + hub.rot; var r = Math.hypot(n.x, n.y); return Math.cos(a)*r; }
function rotY(n){ var a = n.ang + hub.rot; var r = Math.hypot(n.x, n.y); return Math.sin(a)*r; }
function hexA(hex, a){
  var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return 'rgba('+r+','+g+','+b+','+a+')';
}
function drawBg(ctx, z){
  if(!hub.bgDots){
    var dots = [];
    var idx = D.circle_index;
    for(var i=0;i<idx.length;i++){
      var rng = mulberry32((i+1)*2246822519 % 2147483647);
      var ang = rng()*Math.PI*2;
      var rad = 640 + rng()*rng()*1100;   // outer annulus, denser inward
      dots.push([Math.cos(ang)*rad, Math.sin(ang)*rad]);
    }
    hub.bgDots = dots;
  }
  ctx.fillStyle = 'rgba(154,163,178,.16)';
  var dots = hub.bgDots;
  for(var i=0;i<dots.length;i++){
    var p = w2s(dots[i][0], dots[i][1]);
    if(p[0] < -4 || p[1] < -4 || p[0] > hub.W+4 || p[1] > hub.H+4) continue;
    ctx.fillRect(p[0], p[1], 1.6, 1.6);
  }
}
function hubNodeAt(sx, sy){
  var w = s2w(sx, sy);
  var best = null, bestD = 14/hub.cam.z;
  for(var i=0;i<NODES.length;i++){
    var n = NODES[i];
    var nx = rotX(n), ny = rotY(n);
    var d = Math.hypot(nx-w[0], ny-w[1]);
    if(d < bestD + n.rad*0.4){ bestD = d; best = n; }
  }
  return best;
}
function hubHover(e){
  var r = hub.cv.getBoundingClientRect();
  var n = hubNodeAt(e.clientX - r.left, e.clientY - r.top);
  hub.hover = n;
  hub.cv.style.cursor = n ? 'pointer' : 'grab';
  if(n) tipShow(e.clientX, e.clientY, n); else tipHide();
}
function hubClick(e){
  var r = hub.cv.getBoundingClientRect();
  var n = hubNodeAt(e.clientX - r.left, e.clientY - r.top);
  if(n) selectDir(n.i, true);
  else if(S.sel !== null) selectDir(S.sel, false); // toggle off
}
function tipShow(cx, cy, n){
  var tip = $('#tip');
  tip.innerHTML = '<b>'+esc(n.title)+'</b><span>@'+esc(n.handle)+' · '+esc(n.relation)+' · '+n.pieces+' pieces</span>';
  tip.hidden = false;
  var x = Math.min(cx+16, innerWidth-240), y = Math.min(cy+14, innerHeight-90);
  tip.style.left = x+'px'; tip.style.top = y+'px';
}
function tipHide(){ $('#tip').hidden = true; }

/* ---------- left list ---------- */
function listRows(){
  var q = S.q.trim().toLowerCase();
  var onlyNeeds = !!S.auditFilter;
  return ORDER.filter(function(di){
    var r = D.directory[di];
    if(onlyNeeds && (r.profile || {}).audit === 'audited') return false;
    if(S.rel && r.relation !== S.rel) return false;
    if(!q) return true;
    return ((r.display||r.name)+' @'+r.name).toLowerCase().indexOf(q) >= 0;
  });
}
function renderList(){
  var rows = listRows();
  $('#lcount').textContent = rows.length===D.directory.length
    ? D.directory.length+' names'
    : rows.length+' of '+D.directory.length+' names';
  var body = $('#leftbody');
  body.innerHTML = rows.length ? rows.slice(0,400).map(function(di,i){
    var r = D.directory[di];
    var t = r.display || r.name;
    var aud = (r.profile || {}).audit === 'audited';
    var sub2 = r.src === 'contacts' ? 'phone contact' : '@'+esc(r.name)+(r.relation ? ' · '+esc(r.relation) : '');
    return '<div class="row'+(S.sel===di?' sel':'')+'" data-i="'+di+'"'+
      ' style="animation-delay:'+Math.min(i*8,240)+'ms" role="button" tabindex="0">'+
      '<div class="ring '+esc(r.relation||'')+'">'+esc(initial(t))+'</div>'+
      '<div class="nm"><b>'+esc(t)+'</b><span>'+sub2+'</span></div>'+
      '<span class="adot '+(aud?'ok':'needs')+'" title="'+(aud?'audited':'needs audit')+'"></span></div>';
  }).join('') + (rows.length>400 ? '<div class="empty-note">Showing first 400 — refine the search.</div>' : '')
    : '<div class="empty-note">No names match.</div>';
}

/* ---------- dossier panel ---------- */
function renderProfile(){
  var body = $('#rightbody'), panel = $('#right');
  if(S.sel === null){
    panel.classList.remove('open');
    body.innerHTML = '';
    return;
  }
  panel.classList.add('open');
  body.innerHTML = dossierDir(D.directory[S.sel], S.sel);
  body.scrollTop = 0;
}

/* ---------- selection ---------- */
function selectDir(idx, on){
  S.editing = false;
  if(on === false){ S.sel = null; }
  else S.sel = (S.sel === idx) ? null : idx;
  document.querySelectorAll('#leftbody .row').forEach(function(el){
    el.classList.toggle('sel', parseInt(el.dataset.i,10) === S.sel);
  });
  if(S.sel !== null){
    var n = NODES.filter(function(x){ return x.i === S.sel; })[0];
    if(n) hub.target = {x: rotX(n)*0.55, y: rotY(n)*0.55};
    var el = document.querySelector('#leftbody .row[data-i="'+S.sel+'"]');
    if(el) el.scrollIntoView({block:'nearest', behavior:'smooth'});
  }
  renderProfile();
  glSyncFocus();
}

/* ---------- events ---------- */
function bind(){
  var fq = $('#fq'), deb = null;
  fq.addEventListener('input', function(){
    clearTimeout(deb);
    deb = setTimeout(function(){ S.q = fq.value; renderList(); }, 140);
  });
  $('#frel').addEventListener('change', function(e){ S.rel = e.target.value; renderList(); });
  $('#bgtoggle').addEventListener('click', function(){
    S.showBg = !S.showBg;
    this.classList.toggle('on', S.showBg);
    this.setAttribute('aria-pressed', S.showBg);
    glSyncBg();
  });
  var mt = $('#modeToggle');
  if(mt) mt.querySelectorAll('button').forEach(function(b){
    b.addEventListener('click', function(){ setMode(b.dataset.m); });
  });
  $('#auditfilter').addEventListener('click', function(){
    S.auditFilter = !S.auditFilter;
    this.classList.toggle('on', S.auditFilter);
    this.setAttribute('aria-pressed', S.auditFilter);
    renderList();
  });
  updateAuditPill();
  var sgb = document.querySelector('#settingsbtn');
  if(sgb) sgb.addEventListener('click', openSettings);
  $('#listtoggle').addEventListener('click', function(){
    S.listOpen = !S.listOpen;
    this.classList.toggle('on', S.listOpen);
    document.body.classList.toggle('nolist', !S.listOpen);
    if(S.mode === '3d') glRecenter();
    setTimeout(hubResize, 60);
  });
  $('#leftbody').addEventListener('click', function(e){
    var row = e.target.closest('.row');
    if(row) selectDir(parseInt(row.dataset.i,10), true);
  });
  $('#leftbody').addEventListener('keydown', function(e){
    var row = e.target.closest('.row');
    if(row && (e.key==='Enter'||e.key===' ')){ e.preventDefault(); selectDir(parseInt(row.dataset.i,10), true); }
  });
  $('#rightbody').addEventListener('click', function(e){
    if(e.target.closest('#mclose')){ S.sel = null; renderProfile(); renderList(); return; }
    if(e.target.closest('#pedit')){ S.editing = true; renderProfile(); return; }
    if(e.target.closest('#pdone')){ S.editing = false; renderProfile(); return; }
    if(e.target.closest('#psave')){ saveProfile(); return; }
    if(e.target.closest('#paudit')){ toggleAudit(); return; }
    if(e.target.closest('#enrichbtn')){ runEnrich(); return; }
    var pd = e.target.closest('.pdot');
    if(pd){
      var box = pd.closest('.dots');
      var cur = box.getAttribute('data-v');
      var nv = (cur === pd.getAttribute('data-v')) ? '' : pd.getAttribute('data-v');
      box.setAttribute('data-v', nv);
      box.querySelectorAll('.pdot').forEach(function(d2){
        d2.classList.toggle('on', d2.getAttribute('data-v') === nv && nv !== '');
      });
      markDirty();
      return;
    }
    var nx = e.target.closest('.nchip');
    if(nx){
      var u = nx.getAttribute('data-nx');
      var found = -1;
      D.directory.forEach(function(x, xi){
        if((x.name || '').toLowerCase() === (u || '').toLowerCase()) found = xi;
      });
      if(found >= 0) selectDir(found);
      return;
    }
  });
  $('#rightbody').addEventListener('input', function(e){
    if(e.target.closest('[data-pk]')) markDirty();
  });
  $('#rightbody').addEventListener('submit', function(e){
    var form = e.target.closest('.wallform');
    if(form){ e.preventDefault(); tryUnlock(form); }
  });
  document.addEventListener('keydown', function(e){
    if(e.key==='Escape' && S.sel !== null){ S.sel = null; renderProfile(); renderList(); }
  });
}

/* ---------- expanded profile (read-only full view) ---------- */
function xRow(k, v){
  if(v == null || v === '') return '';
  return '<div class="xrow"><div class="k">' + esc(k) + '</div><div class="v">' + v + '</div></div>';
}
function openExpanded(){
  if(S.sel === null) return;
  closeExpanded();
  var e = D.directory[S.sel];
  var prof = e.profile || {};
  var title = e.display || e.name;
  var p15 = PROFILE_FIELDS.map(function(f){
    var v = prof[f.k];
    if(f.type === 'score') v = v ? v + ' / 5' : '—';
    return xRow(f.label, esc(v || '—'));
  }).join('') + xRow('Last note', (prof.last_note_date ? esc(prof.last_note_date) + ' · ' : '') + esc(prof.last_note || '—'));
  var enriched = (prof.enriched === '1' || prof.enriched === 1) && prof.enriched_value;
  var leg = e.legacy || {}, rec = e.record || {};
  var hasSensitive = !!(leg.desc || rec.body || (e.friendsdb || {}).phone || e.notes);
  var refInner = '';
  if(leg.desc) refInner += '<p class="body rtext">' + esc(leg.desc) + '</p>';
  if(rec.body) refInner += '<p class="body rtext">' + esc(rec.body) + '</p>';
  if(e.public_footprint) refInner += '<p class="body rtext"><span style="color:var(--dim)">Public footprint</span><br>' + esc(e.public_footprint) + '</p>';
  if(!refInner) refInner = '<p class="body">No reference material on file.</p>';
  var c = e.contact || {};
  var contactRows = xRow('Key', esc(pkey(e))) +
    xRow('Phone', esc((c.phones || []).join(', '))) +
    xRow('Email', esc((c.emails || []).join(', '))) +
    xRow('Org', esc((c.orgs || []).join(', '))) +
    (e.src === 'contacts' ? '' : xRow('Graph connections', e.degree) + xRow('Shared with you', e.shared_with_jd));
  var html =
  '<div id="xoverlay"><div id="xcard" role="dialog" aria-label="Expanded profile">' +
    '<div class="xhead"><div class="xava">' + esc(initial(title)) + '</div>' +
    '<div><h2>' + esc(title) + '</h2><div class="xsub">Personal file · #' + String(S.sel + 1).padStart(3, '0') + ' ' + auditBadge(e) + '</div></div>' +
    '<div class="sp"></div><button class="xbtn" id="xclose">Close</button></div>' +
    '<div class="xbody"><div class="xgrid">' +
    '<div class="xsec"><h4>The 15</h4>' + p15 + '</div>' +
    '<div class="xsec"><h4>Directory</h4>' + contactRows + '</div>' +
    (enriched ? '<div class="xsec full"><h4>Assessment</h4><div class="xrow"><div class="v pre">' + esc(prof.enriched_value) + '</div></div></div>' : '') +
    '<div class="xsec full"><h4>Reference</h4><div class="memoir' + (UNLOCKED || !hasSensitive ? ' unlocked' : '') + '">' + refInner + (hasSensitive ? wallHTML() : '') + '</div></div>' +
    '</div></div></div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
  document.querySelector('#xclose').addEventListener('click', closeExpanded);
  document.querySelector('#xoverlay').addEventListener('click', function(ev){ if(ev.target.id === 'xoverlay') closeExpanded(); });
}
function closeExpanded(){
  var o = document.querySelector('#xoverlay'); if(o) o.remove();
}

/* ---------- 15-point profile: save, audit, enrich (via the sheet web app) ---------- */
var WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwZli1Dv07iWBpR3Oz4jD4imtNLN845jFDBnXIbtmT3sPGExsMlKFMQwt42FmrUdFBD/exec'; // set to the Apps Script web app /exec URL after deploying Code.gs

function getPw(){
  var inp = document.querySelector('#ppw');
  var v = inp ? inp.value : '';
  if(v){ try { sessionStorage.setItem('dossier_edit_pw', v); } catch(x){} return v; }
  try { return sessionStorage.getItem('dossier_edit_pw') || ''; } catch(x){ return ''; }
}
function markDirty(){
  var b = document.querySelector('#psave');
  if(b) b.disabled = false;
}
function collectProfile(e){
  var prof = e.profile || {}, changed = {};
  document.querySelectorAll('#rightbody [data-pk]').forEach(function(inp){
    var k = inp.getAttribute('data-pk'), nv;
    if(inp.classList && inp.classList.contains('dots')){
      nv = inp.getAttribute('data-v') || '';
    } else {
      nv = inp.value;
    }
    if(nv !== (prof[k] || '')) changed[k] = nv;
  });
  return changed;
}
function postKind(kind, id, patch, pw, onOk, onErr){
  fetch(WEBAPP_URL, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ password: pw, kind: kind, id: id, patch: patch })
  }).then(function(r){ return r.json(); }).then(function(res){
    if(res && res.ok) onOk(res);
    else onErr('Save failed: ' + ((res && res.error) || 'unknown'));
  }).catch(function(){ onErr('Network error.'); });
}
function applyProfileEdit(e, changed){
  e.profile = e.profile || {};
  Object.keys(changed).forEach(function(k){ e.profile[k] = changed[k]; });
}
function saveProfile(){
  var e = D.directory[S.sel];
  if(!WEBAPP_URL){ toast('Editing is not configured yet — the web app URL is missing.'); return; }
  var pw = getPw();
  if(!pw){ toast('Enter the password first.'); return; }
  var changed = collectProfile(e);
  if(!Object.keys(changed).length){ toast('No changes.'); return; }
  var btn = document.querySelector('#psave');
  btn.disabled = true; btn.textContent = 'Saving…';
  postKind('profile', pkey(e), changed, pw, function(){
    applyProfileEdit(e, changed);
    renderProfile(); renderList(); updateAuditPill();
    toast('Saved.');
  }, function(err){
    toast(err); btn.disabled = false; btn.textContent = 'Save';
  });
}
function toggleAudit(){
  var e = D.directory[S.sel];
  if(!WEBAPP_URL){ toast('Editing is not configured yet — the web app URL is missing.'); return; }
  var pw = getPw();
  if(!pw){ toast('Enter the password first.'); return; }
  var next = ((e.profile || {}).audit === 'audited') ? 'needs_audit' : 'audited';
  postKind('profile', pkey(e), { audit: next }, pw, function(){
    e.profile = e.profile || {}; e.profile.audit = next;
    renderProfile(); renderList(); updateAuditPill();
    toast(next === 'audited' ? 'Marked audited.' : 'Back to needs audit.');
  }, function(err){ toast(err); });
}
function runEnrich(){
  var e = D.directory[S.sel];
  if(!WEBAPP_URL){ toast('Editing is not configured yet — the web app URL is missing.'); return; }
  var pw = getPw();
  if(!pw){ toast('Enter the password first.'); return; }
  var btn = document.querySelector('#enrichbtn'), msg = document.querySelector('#enrmsg');
  btn.disabled = true; btn.textContent = 'Generating…'; msg.textContent = '';
  postKind('enrich', pkey(e), { enrich: 1 }, pw, function(res){
    e.profile = e.profile || {};
    e.profile.enriched = '1'; e.profile.enriched_value = res.value; e.profile.enriched_at = res.at;
    renderProfile();
    toast('Assessment calculated.');
  }, function(err){
    msg.textContent = err; btn.disabled = false; btn.textContent = 'Generate assessment';
  });
}
function updateAuditPill(){
  var pill = document.querySelector('#auditpill');
  if(!pill) return;
  var done = D.directory.filter(function(r){ return (r.profile || {}).audit === 'audited'; }).length;
  pill.textContent = 'Audited ' + done + '/' + D.directory.length;
}

/* ---------- settings (enrich prompt + api key, stored server-side in the sheet) ---------- */
function openSettings(){
  closeSettings();
  var html = '<div id="setoverlay"><div id="setcard" role="dialog" aria-label="Settings">' +
    '<div class="xhead"><h2>Settings</h2><div class="sp"></div><button class="xbtn" id="setclose">Close</button></div>' +
    '<div class="setbody">' +
    '<label>Assessment prompt<label class="sh">Sent to Gemini with the 15 values on every Generate. Edit freely.</label></label>' +
    '<textarea id="setprompt" rows="10" placeholder="Loading…"></textarea>' +
    '<label>Gemini API key<label class="sh">Stored in the sheet, server-side only. Get one at aistudio.google.com → Get API key.</label></label>' +
    '<input id="setkey" type="password" placeholder="AIza…" autocomplete="off">' +
    '<div class="arow"><button id="setsave" class="xbtn acc">Save settings</button><span id="setmsg"></span></div>' +
    '</div></div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
  document.querySelector('#setclose').addEventListener('click', closeSettings);
  document.querySelector('#setoverlay').addEventListener('click', function(ev){ if(ev.target.id === 'setoverlay') closeSettings(); });
  document.querySelector('#setsave').addEventListener('click', saveSettings);
  if(!WEBAPP_URL){ document.querySelector('#setmsg').textContent = 'Web app URL is not configured yet.'; return; }
  fetch(WEBAPP_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify({ password:getPw(), kind:'getsettings', id:'settings', patch:{x:1} }) })
    .then(function(r){ return r.json(); }).then(function(res){
      if(res && res.ok){
        document.querySelector('#setprompt').value = res.prompt || '';
        if(res.hasKey) document.querySelector('#setkey').placeholder = 'Key saved ✓ (enter a new one to replace)';
      } else {
        document.querySelector('#setmsg').textContent = 'Could not load: ' + ((res && res.error) || 'unknown');
      }
    }).catch(function(){ document.querySelector('#setmsg').textContent = 'Network error.'; });
}
function closeSettings(){ var o = document.querySelector('#setoverlay'); if(o) o.remove(); }
function saveSettings(){
  var msg = document.querySelector('#setmsg');
  var patch = { prompt: document.querySelector('#setprompt').value };
  var kv = document.querySelector('#setkey').value;
  if(kv) patch.gemini_key = kv;
  msg.textContent = 'Saving…';
  fetch(WEBAPP_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify({ password:getPw(), kind:'settings', id:'settings', patch:patch }) })
    .then(function(r){ return r.json(); }).then(function(res){
      msg.textContent = (res && res.ok) ? 'Saved.' : ('Save failed: ' + ((res && res.error) || 'unknown'));
    }).catch(function(){ msg.textContent = 'Network error.'; });
}

/* ---------- 3D sphere ---------- */
/* ---------- 3D sphere ---------- */
var GL = null;
var THREE_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'
];
function loadScript(src){
  return new Promise(function(res, rej){
    var s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = function(){ rej(new Error('load failed: '+src)); };
    document.head.appendChild(s);
  });
}
/* Keep the subject centered in the free space between the left list and the right panel. */
function layoutShift(){
  var lw = (S.listOpen && document.querySelector('#left')) ? document.querySelector('#left').offsetWidth : 0;
  var pw = (S.sel !== null && document.querySelector('#right')) ? document.querySelector('#right').offsetWidth : 0;
  return { ox2d: (lw - pw) / 2, vox: (pw - lw) / 2 };
}
function glRecenter(){
  if(!GL || !GL.camera) return;
  var sh = layoutShift();
  GL.camera.setViewOffset(window.innerWidth, window.innerHeight, sh.vox, 0, window.innerWidth, window.innerHeight);
}
function setMode(m){
  S.mode = m;
  var t = $('#modeToggle');
  if(t) t.querySelectorAll('button').forEach(function(b){ b.classList.toggle('on', b.dataset.m === m); });
  var hint = $('#stagehint');
  if(m === '3d'){
    $('#gl3d').hidden = false;
    $('#hub').style.visibility = 'hidden';
    if(hint) hint.textContent = 'Drag to orbit · scroll to zoom · click a node to fly to them';
    initGL();
  } else {
    $('#gl3d').hidden = true;
    $('#hub').style.visibility = 'visible';
    if(hint) hint.textContent = 'Drag to pan · scroll to zoom · click a node to open their dossier';
  }
}
function initGL(){
  var holder = $('#gl3d');
  if(GL){ glResize(); glSyncFocus(); return; }
  if(holder.querySelector('.gl-loading')) return;
  holder.insertAdjacentHTML('beforeend', '<div class="gl-loading">building 3D space…</div>');
  loadScript(THREE_URLS[0]).then(function(){ return loadScript(THREE_URLS[1]); }).then(function(){
    var l = holder.querySelector('.gl-loading'); if(l) l.remove();
    buildGL(); glSyncFocus();
  }).catch(function(){
    var l = holder.querySelector('.gl-loading');
    if(l) l.textContent = 'Could not load the 3D engine. Check your connection and try again.';
  });
}
function makeLabel(text, o){
  o = o || {};
  var fs = o.size || 26;
  var cv = document.createElement('canvas');
  var mctx = cv.getContext('2d');
  mctx.font = '700 ' + fs + 'px "Hanken Grotesk", sans-serif';
  cv.width = Math.ceil(mctx.measureText(text).width) + 30;
  cv.height = fs + 32;
  var ctx = cv.getContext('2d');
  ctx.font = '700 ' + fs + 'px "Hanken Grotesk", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = 9;
  ctx.fillStyle = o.color || '#e8ecf3';
  ctx.fillText(text, 15, cv.height / 2);
  var tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  var s = 0.068;
  sp.scale.set(cv.width * s, cv.height * s, 1);
  sp.renderOrder = 10;
  return sp;
}
function makeGlow(colorHex, size){
  var cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  var ctx = cv.getContext('2d');
  var g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  var c = '#' + ('000000' + colorHex.toString(16)).slice(-6);
  g.addColorStop(0, c); g.addColorStop(0.35, c + 'aa'); g.addColorStop(1, c + '00');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  sp.scale.set(size, size, 1);
  return sp;
}
function buildGL(){
  var holder = $('#gl3d');
  var W = holder.clientWidth || innerWidth, H = holder.clientHeight || innerHeight;
  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(W, H);
  holder.appendChild(renderer.domElement);
  var scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x070a10, 0.0011);
  var camera = new THREE.PerspectiveCamera(52, W / H, 0.5, 4000);
  camera.position.set(0, 72, 305);
  var controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.06;
  controls.minDistance = 14; controls.maxDistance = 1000;

  // JD at the center
  var jd = new THREE.Mesh(
    new THREE.SphereGeometry(4.6, 28, 28),
    new THREE.MeshBasicMaterial({ color: 0xe8b34b })
  );
  scene.add(jd);
  var glow = makeGlow(0xe8b34b, 30);
  scene.add(glow);
  var jdLabel = makeLabel('JD', { size: 34, color: '#e8b34b' });
  jdLabel.position.set(0, 10, 0);
  scene.add(jdLabel);

  // the 732, on three shells by ring
  var n = NODES.length;
  var posArr = new Float32Array(n * 3), colArr = new Float32Array(n * 3);
  var shells = [56, 94, 132];
  var perShell = [[], [], []];
  NODES.forEach(function(nd, k){ perShell[Math.min(nd.ring || 0, 2)].push(k); });
  var glPos = new Array(n);
  perShell.forEach(function(list, s){
    var R = shells[s];
    list.forEach(function(k, j){
      var di = NODES[k].i;
      var y = 1 - 2 * (j + 0.5) / list.length;
      var r = Math.sqrt(Math.max(0, 1 - y * y));
      var th = j * 2.399963;
      var rnd = mulberry32(di * 7919 + 13);
      var jr = R * (0.93 + rnd() * 0.14);
      var v = new THREE.Vector3(Math.cos(th) * r * jr, y * jr, Math.sin(th) * r * jr);
      glPos[di] = v;
      posArr[k * 3] = v.x; posArr[k * 3 + 1] = v.y; posArr[k * 3 + 2] = v.z;
      var c = new THREE.Color(NODES[k].color || '#6db3f2');
      colArr[k * 3] = c.r; colArr[k * 3 + 1] = c.g; colArr[k * 3 + 2] = c.b;
    });
  });
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  var mat = new THREE.PointsMaterial({
    size: 2.8, vertexColors: true, sizeAttenuation: true,
    transparent: true, opacity: 0.95, depthWrite: false
  });
  var points = new THREE.Points(geo, mat);
  scene.add(points);

  // background full circle
  var bg = null;
  var ci = D.circle_index || [];
  if(ci.length){
    var bp = new Float32Array(ci.length * 3);
    var R2 = 218;
    for(var bi = 0; bi < ci.length; bi++){
      var y2 = 1 - 2 * (bi + 0.5) / ci.length;
      var r2 = Math.sqrt(Math.max(0, 1 - y2 * y2));
      var th2 = bi * 2.399963;
      bp[bi * 3] = Math.cos(th2) * r2 * R2;
      bp[bi * 3 + 1] = y2 * R2;
      bp[bi * 3 + 2] = Math.sin(th2) * r2 * R2;
    }
    var bgGeo = new THREE.BufferGeometry();
    bgGeo.setAttribute('position', new THREE.BufferAttribute(bp, 3));
    bg = new THREE.Points(bgGeo, new THREE.PointsMaterial({
      size: 1.4, color: 0x2b3648, transparent: true, opacity: 0.5, depthWrite: false
    }));
    bg.visible = !!S.showBg;
    scene.add(bg);
  }

  GL = {
    renderer: renderer, scene: scene, camera: camera, controls: controls,
    points: points, mat: mat, bg: bg, glPos: glPos,
    flight: null, focusGroup: null, focusDi: -1, dirByUser: {},
    nbrGeo: new THREE.SphereGeometry(1.7, 16, 16),
    ray: new THREE.Raycaster(), downX: 0, downY: 0
  };
  GL.ray.params.Points = { threshold: 4.5 };
  D.directory.forEach(function(e, di){ GL.dirByUser[(e.name || '').toLowerCase()] = di; });

  renderer.domElement.addEventListener('pointerdown', function(ev){
    GL.downX = ev.clientX; GL.downY = ev.clientY;
  });
  renderer.domElement.addEventListener('pointerup', function(ev){
    if(Math.hypot(ev.clientX - GL.downX, ev.clientY - GL.downY) > 6) return;
    glClick(ev);
  });
  renderer.domElement.addEventListener('pointermove', function(ev){
    if(!GL) return;
    var hit = glPick(ev);
    renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
  });
  addEventListener('resize', glResize);
  (function glAnimate(){
    requestAnimationFrame(glAnimate);
    if(S.mode !== '3d' || !GL) return;
    var now = performance.now();
    if(GL.flight){
      var f = GL.flight, t = Math.min(1, (now - f.start) / f.dur);
      var e2 = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      var a = f.p0.clone().lerp(f.p1, e2), b = f.p1.clone().lerp(f.p2, e2);
      GL.camera.position.copy(a.lerp(b, e2));
      GL.controls.target.copy(f.t0.clone().lerp(f.t2, e2));
      if(t >= 1) GL.flight = null;
    }
    GL.controls.update();
    GL.renderer.render(GL.scene, GL.camera);
  })();
}
function glResize(){
  if(!GL) return;
  var holder = $('#gl3d');
  var W = holder.clientWidth || innerWidth, H = holder.clientHeight || innerHeight;
  GL.camera.aspect = W / H;
  GL.camera.updateProjectionMatrix();
  GL.renderer.setSize(W, H);
}
function glPick(ev){
  var rect = GL.renderer.domElement.getBoundingClientRect();
  var mx = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  var my = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  GL.ray.setFromCamera({ x: mx, y: my }, GL.camera);
  if(GL.focusGroup){
    var hits = GL.ray.intersectObjects(GL.focusGroup.children.filter(function(o){ return o.isMesh; }));
    if(hits.length) return { kind: 'neighbor', obj: hits[0].object };
  }
  var ph = GL.ray.intersectObject(GL.points);
  if(ph.length && ph[0].index != null) return { kind: 'node', index: ph[0].index };
  return null;
}
function glClick(ev){
  var hit = glPick(ev);
  if(!hit){ selectDir(null); return; }
  if(hit.kind === 'neighbor'){
    var di = hit.obj.userData.dirIdx;
    if(di >= 0) selectDir(di);
    return;
  }
  selectDir(NODES[hit.index].i);
}
function glFlyTo(destPos, destTarget, dur){
  var p0 = GL.camera.position.clone(), t0 = GL.controls.target.clone();
  var mid = p0.clone().add(destPos).multiplyScalar(0.5);
  mid.setLength(Math.max(p0.length(), destPos.length()) + 70);
  GL.flight = {
    p0: p0, p1: mid, p2: destPos.clone(),
    t0: t0, t2: destTarget.clone(),
    start: performance.now(), dur: dur || 1500
  };
}
function glClearFocus(){
  if(!GL || !GL.focusGroup) return;
  GL.scene.remove(GL.focusGroup);
  GL.focusGroup = null;
  GL.focusDi = -1;
  GL.mat.opacity = 0.95;
}
function glFocus(di){
  if(!GL || !GL.glPos[di]) return;
  glClearFocus();
  GL.focusDi = di;
  var p = GL.glPos[di];
  var e = D.directory[di];
  var g = new THREE.Group();
  var nbrs = (e.neighbors || []).slice(0, 8);
  nbrs.forEach(function(nb, j){
    var y = 1 - 2 * (j + 0.5) / nbrs.length;
    var r = Math.sqrt(Math.max(0, 1 - y * y));
    var th = j * 2.399963;
    var np = new THREE.Vector3(
      p.x + Math.cos(th) * r * 16,
      p.y + y * 16,
      p.z + Math.sin(th) * r * 16
    );
    var di2 = GL.dirByUser[(nb.u || '').toLowerCase()];
    var mesh = new THREE.Mesh(GL.nbrGeo, new THREE.MeshBasicMaterial({
      color: di2 != null ? 0x6fd3e7 : 0x5a6b84
    }));
    mesh.position.copy(np);
    mesh.userData.dirIdx = (di2 != null ? di2 : -1);
    mesh.userData.uname = nb.u;
    g.add(mesh);
    var lab = makeLabel(nb.d || nb.u, { size: 22, color: '#cfe6f2' });
    lab.position.set(np.x, np.y + 3.6, np.z);
    g.add(lab);
    var lg = new THREE.BufferGeometry().setFromPoints([p, np]);
    g.add(new THREE.Line(lg, new THREE.LineBasicMaterial({
      color: 0x6fd3e7, transparent: true, opacity: 0.25
    })));
  });
  var fl = makeLabel(e.display || e.name, { size: 30, color: '#e8b34b' });
  fl.position.set(p.x, p.y + 5.5, p.z);
  g.add(fl);
  var marker = makeGlow(0xe8b34b, 16);
  marker.position.copy(p);
  g.add(marker);
  GL.focusGroup = g;
  GL.scene.add(g);
  GL.mat.opacity = 0.16;
  var out = p.clone().normalize();
  var dest = p.clone().add(out.multiplyScalar(38));
  dest.y += 10;
  glFlyTo(dest, p.clone(), 1600);
}
function glUnfocus(){
  if(!GL) return;
  glClearFocus();
  glFlyTo(new THREE.Vector3(0, 72, 305), new THREE.Vector3(0, 0, 0), 1400);
}
function glSyncFocus(){
  if(!GL || S.mode !== '3d') return;
  if(S.sel == null || S.sel < 0){ glUnfocus(); return; }
  if(S.sel !== GL.focusDi) glFocus(S.sel);
}
function glSyncBg(){
  if(GL && GL.bg) GL.bg.visible = !!S.showBg;
}

/* ---------- boot ---------- */
function boot(){
  ambient();
  $('#leftbody').innerHTML = '<div class="empty-note">Loading dossier data…</div>';
  var tries = 0;
  function attempt(){
    tries++;
    fetch('data/dossier.json', {cache:'no-store'})
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(function(d){
        D = d;
        $('#fresh').textContent = 'updated ' + (D.updated||'—');
        buildNodes();
        hubInit();
        renderList();
        bind();
      })
      .catch(function(){
        if(tries < 4){
          $('#leftbody').innerHTML = '<div class="empty-note">Loading dossier data… (retry '+tries+'/3)</div>';
          setTimeout(attempt, 1200*tries);
        } else {
          $('#leftbody').innerHTML = '<div class="empty-note">Could not load dossier data. <a href="" onclick="location.reload();return false;" style="color:var(--amber)">Retry</a></div>';
          var sh = $('#stagehint'); if(sh) sh.textContent = 'Data failed to load.';
        }
      });
  }
  attempt();
}
document.addEventListener('DOMContentLoaded', boot);
})();
