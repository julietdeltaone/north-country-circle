/* North Country Circle — Dossier. Hub-spoke directory + dossier documents + redaction wall. */
(function(){
'use strict';
var S = { q:'', rel:'', sel:null, showBg:false, listOpen:true, mode:'2d' };
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

function dossierDir(e, idx){
  var person = null;
  D.people.forEach(function(p){ if(p.dir_idx === idx) person = p; });
  var leg = e.legacy, rec = e.record;
  var title = e.display || e.name;
  var kv = '';
  if(leg){
    kv += '<dt>Role</dt><dd>'+esc(leg.role||'—')+'</dd>'+
          '<dt>Period</dt><dd>'+esc(leg.period||'—')+'</dd>'+
          '<dt>Standing</dt><dd>'+esc(leg.status||'—')+'</dd>';
  }
  if(person && person.aliases) kv += '<dt>Also known as</dt><dd>'+esc(person.aliases)+'</dd>';
  kv += '<dt>IG handle</dt><dd><a class="iglink" href="'+igURL(e.name)+'" target="_blank" rel="noopener">@'+esc(e.name)+' ↗</a></dd>'+
        '<dt>Relation</dt><dd><span class="chip '+esc(e.relation||'')+'">'+esc(e.relation||'—')+'</span></dd>';
  if(person) kv += '<dt>Named file</dt><dd>'+esc(person.person)+' · '+esc(person.mentions||'0')+' file mentions</dd>';
  var fdb = e.friendsdb || null;
  if(fdb){
    if(fdb.closeness_tier) kv += '<dt>Closeness</dt><dd>'+esc(fdb.closeness_tier)+'</dd>';
    if(fdb.standing) kv += '<dt>Standing</dt><dd>'+esc(fdb.standing)+'</dd>';
    if(fdb.trajectory) kv += '<dt>Trajectory</dt><dd>'+esc(fdb.trajectory)+'</dd>';
    if(fdb.years_known) kv += '<dt>Years known</dt><dd>'+esc(fdb.years_known)+'</dd>';
    if(fdb.shared_interests) kv += '<dt>Shared interests</dt><dd>'+esc(fdb.shared_interests)+'</dd>';
    if(fdb.groups) kv += '<dt>Contexts</dt><dd>'+esc(fdb.groups)+'</dd>';
    if(fdb.personal_context) kv += '<dt>Context</dt><dd>'+esc(fdb.personal_context)+'</dd>';
  }

  var memoirInner = '';
  if(leg && leg.desc) memoirInner += '<p class="body rtext">'+esc(leg.desc)+'</p>';
  if(rec && rec.body) memoirInner += '<p class="body rtext">'+esc(rec.body)+'</p>';
  if(fdb && fdb.phone) memoirInner += '<p class="body rtext"><span style="color:var(--dim)">Phone</span><br>'+esc(fdb.phone)+'</p>';
  if(!memoirInner) memoirInner = '<p class="body">No subject material on file.</p>';

  var chips = [];
  if(leg) chips.push('<span class="chip ghost">subject file</span>');
  if(rec) chips.push('<span class="chip ghost">the record</span>');
  chips.push('<span class="chip ghost">circle graph</span>');
  chips.push('<span class="chip ghost">directory</span>');
  if(rec && rec.chips) rec.chips.slice(0,8).forEach(function(c){
    chips.push('<span class="chip violet">'+esc(c.label)+'</span>');
  });

  var hasSensitive = !!(leg && leg.desc) || !!(rec && rec.body) || !!(fdb && fdb.phone);
  return '<div class="doc">'+ classbar() +
    '<div class="doc-head"><div class="doc-actions"><button id="dedit" aria-label="Edit this dossier">Edit</button><button id="dxpand" aria-label="Open expanded profile">Expand</button><button id="mclose" aria-label="Close dossier">Close</button></div>'+
    '<div class="doc-kicker">Personal file · #'+String(idx+1).padStart(3,'0')+'</div>'+
    '<h2>'+esc(title)+'</h2>'+
    '<div class="doc-filed">File opened '+esc(D.updated)+' · first-hop connection</div>'+
    '<span class="stamp'+(leg||rec?'':' amber')+'">'+(leg||rec?'On record':'Graph only')+'</span></div>'+
    '<div class="dsec"><h3><span class="n">01</span> Subject profile</h3><dl class="kv">'+kv+'</dl></div>'+
    '<div class="dsec"><h3><span class="n">02</span> Connections</h3>'+
    meter(e.pieces, 8, 'Profile completeness')+
    '<div class="dstats">'+
    '<div class="stat"><div class="v">'+e.degree+'</div><div class="l">graph connections</div></div>'+
    '<div class="stat"><div class="v">'+e.shared_with_jd+'</div><div class="l">shared with you</div></div>'+
    '</div>'+
    (e.detail ? '<p class="body" style="margin-top:10px;font-size:12.5px;color:var(--mut)"><span style="color:var(--dim);text-transform:uppercase;font-size:10.5px;letter-spacing:.08em">On file</span><br>'+esc(e.detail.split('; ').join(' · ')).replace(/^./, function(c){return c.toUpperCase();})+'</p>' : '')+
    '</div>'+
    '<div class="dsec"><h3><span class="n">03</span> Subject file</h3>'+
    '<div class="memoir'+(UNLOCKED||!hasSensitive?' unlocked':'')+'">'+
    memoirInner+
    (hasSensitive ? wallHTML() : '')+
    '</div></div>'+
    '<div class="dsec"><h3><span class="n">04</span> Assessment</h3><div class="asmt">'+
    '<h4>Scored dimensions</h4><p class="nodata">insufficient data — the record system will fill this in.</p>'+
    '<h4>Tags</h4><p class="nodata">insufficient data — the record system will fill this in.</p>'+
    '<h4>Evidence log</h4><p class="nodata">insufficient data — the record system will fill this in.</p>'+
    '</div></div>'+
    '<div class="dsec"><h3><span class="n">05</span> Sources</h3><div class="srcrow">'+chips.join('')+'</div></div>'+
    classbar().replace('classbar', 'classbar bot') +
    '</div>';
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
  return [ (wx - hub.cam.x)*hub.cam.z + hub.W/2, (wy - hub.cam.y)*hub.cam.z + hub.H/2 ];
}
function s2w(sx, sy){
  return [ (sx - hub.W/2)/hub.cam.z + hub.cam.x, (sy - hub.H/2)/hub.cam.z + hub.cam.y ];
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
  return ORDER.filter(function(di){
    var r = D.directory[di];
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
    return '<div class="row'+(S.sel===di?' sel':'')+'" data-i="'+di+'"'+
      ' style="animation-delay:'+Math.min(i*8,240)+'ms" role="button" tabindex="0">'+
      '<div class="ring '+esc(r.relation||'')+'">'+esc(initial(t))+'</div>'+
      '<div class="nm"><b>'+esc(t)+'</b><span>@'+esc(r.name)+' · '+esc(r.relation)+'</span></div></div>';
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
  $('#listtoggle').addEventListener('click', function(){
    S.listOpen = !S.listOpen;
    this.classList.toggle('on', S.listOpen);
    document.body.classList.toggle('nolist', !S.listOpen);
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
    if(e.target.closest('#dxpand')){ openExpanded(); return; }
    if(e.target.closest('#dedit')){ openEditor(); return; }
  });
  $('#rightbody').addEventListener('submit', function(e){
    var form = e.target.closest('.wallform');
    if(form){ e.preventDefault(); tryUnlock(form); }
  });
  document.addEventListener('keydown', function(e){
    if(e.key==='Escape' && S.sel !== null){ S.sel = null; renderProfile(); renderList(); }
  });
}

/* ---------- expanded profile (full view + robust edit) ---------- */
var XEDIT = false; // expanded overlay in edit mode?

function xRow(k, v){
  if(v == null || v === '') return '';
  return '<div class="xrow"><div class="k">'+esc(k)+'</div><div class="v">'+v+'</div></div>';
}
function openExpanded(){
  if(S.sel === null) return;
  XEDIT = false;
  renderExpanded();
}
function closeExpanded(){
  var o = $('#xoverlay'); if(o) o.remove();
}
function renderExpanded(){
  closeExpanded();
  var e = D.directory[S.sel];
  var person = null;
  D.people.forEach(function(p){ if(p.dir_idx === S.sel) person = p; });
  var leg = e.legacy || {}, rec = e.record || {}, fdb = e.friendsdb || {};
  var title = e.display || e.name;

  var ident = xRow('Display name', esc(e.display || '—')) +
    xRow('IG handle', '<a class="iglink" href="'+igURL(e.name)+'" target="_blank" rel="noopener">@'+esc(e.name)+' ↗</a>') +
    xRow('Relation', esc(e.relation || '—')) +
    xRow('Info pieces', e.pieces + ' / 8') +
    (person ? xRow('Also known as', esc(person.aliases || '—')) + xRow('Named file', esc(person.person)+' · '+esc(person.mentions||'0')+' mentions') : '') +
    (e.detail ? xRow('On file', esc(e.detail)) : '');

  var conn = xRow('Graph connections', e.degree) +
    xRow('Shared with you', e.shared_with_jd) +
    xRow('Strength', e.strength);

  var hasSensitive = !!(leg.desc || rec.body || fdb.phone || e.notes);
  var subjInner = '';
  if(leg.desc) subjInner += '<p class="body rtext">'+esc(leg.desc)+'</p>';
  if(rec.body) subjInner += '<p class="body rtext">'+esc(rec.body)+'</p>';
  if(fdb.phone) subjInner += '<p class="body rtext"><span style="color:var(--dim)">Phone</span><br>'+esc(fdb.phone)+'</p>';
  if(!subjInner) subjInner = '<p class="body">No subject material on file.</p>';

  var fdbRows = ['relationship_type','groups','closeness_tier','state','standing','trajectory','personal_context','shared_interests','years_known']
    .map(function(k){ return xRow(k.replace(/_/g,' '), esc(fdb[k] || '—')); }).join('');

  var pf = e.public_footprint ?
    '<div class="xsec full"><h4>Public footprint</h4><div class="xrow"><div class="v pre">'+esc(e.public_footprint)+'</div></div></div>' : '';

  var notesInner = e.notes ? '<p class="body rtext">'+esc(e.notes)+'</p>' : '<p class="body">No private notes.</p>';

  var nbrs = (e.neighbors || []).slice(0, 8);
  var nbrChips = nbrs.length ? nbrs.map(function(nb){
    var di2 = null;
    D.directory.forEach(function(x, xi){ if((x.name||'').toLowerCase() === (nb.u||'').toLowerCase()) di2 = xi; });
    return '<span class="nchip" data-nx="'+(di2 == null ? -1 : di2)+'">'+esc(nb.d || nb.u)+'</span>';
  }).join('') : '<p class="body">No close connections mapped.</p>';

  var html =
  '<div id="xoverlay"><div id="xcard" role="dialog" aria-label="Expanded profile">'+
    '<div class="xhead"><div class="xava">'+esc(initial(title))+'</div>'+
    '<div><h2>'+esc(title)+'</h2><div class="xsub">Personal file · #'+String(S.sel+1).padStart(3,'0')+' · '+(leg||rec?'on record':'graph only')+'</div></div>'+
    '<div class="sp"></div>'+
    '<button class="xbtn acc" id="xeditbtn">'+(XEDIT ? 'Viewing' : 'Edit full profile')+'</button>'+
    '<button class="xbtn" id="xclose">Close</button></div>'+
    '<div class="xbody">' +
    (XEDIT ? xEditorHTML(e) :
      '<div class="xgrid">'+
      '<div class="xsec"><h4>Identity</h4>'+ident+'</div>'+
      '<div class="xsec"><h4>Connection</h4>'+conn+'</div>'+
      '<div class="xsec full"><h4>Subject file</h4><div class="memoir'+(UNLOCKED||!hasSensitive?' unlocked':'')+'">'+subjInner+(hasSensitive?wallHTML():'')+'</div></div>'+
      '<div class="xsec"><h4>Friends database</h4>'+fdbRows+'</div>'+
      '<div class="xsec"><h4>Private notes</h4><div class="memoir'+(UNLOCKED||!e.notes?' unlocked':'')+'">'+notesInner+(e.notes&&!UNLOCKED?wallHTML():'')+'</div></div>'+
      pf +
      '<div class="xsec full"><h4>Close connections</h4>'+nbrChips+'</div>'+
      '</div>') +
    '</div>' +
    (XEDIT ? '<div class="xfoot"><input id="xpw" type="password" placeholder="Password" autocomplete="off" aria-label="Password">'+
      '<span id="xmsg"></span><div class="sp" style="flex:1"></div><button class="xbtn acc" id="xsave">Save changes</button></div>' : '') +
  '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
  $('#xclose').addEventListener('click', closeExpanded);
  $('#xoverlay').addEventListener('click', function(ev){ if(ev.target.id === 'xoverlay') closeExpanded(); });
  $('#xeditbtn').addEventListener('click', function(){ XEDIT = !XEDIT; renderExpanded(); });
  if(XEDIT){
    $('#xsave').addEventListener('click', saveExpanded);
    $('#xaddchip').addEventListener('click', function(){
      $('#xchips').insertAdjacentHTML('beforeend', chipRowHTML({type:'', label:''}));
    });
    document.querySelectorAll('#xchips .crm').forEach(function(b){
      b.addEventListener('click', function(){ b.closest('.chiprow').remove(); });
    });
    try { var p = sessionStorage.getItem('dossier_edit_pw'); if(p) $('#xpw').value = p; } catch(x){}
  } else {
    document.querySelectorAll('#xoverlay .nchip').forEach(function(c){
      c.addEventListener('click', function(){
        var nx = parseInt(c.dataset.nx, 10);
        closeExpanded();
        if(nx >= 0) selectDir(nx);
      });
    });
  }
}
var CHIP_TYPES = ['person','place','org','event','topic'];
function chipRowHTML(c){
  return '<div class="chiprow"><select data-ct>'+CHIP_TYPES.map(function(t){
    return '<option value="'+t+'"'+(t===c.type?' selected':'')+'>'+t+'</option>';
  }).join('')+'</select><input data-cl placeholder="Label" value="'+esc(c.label||'')+'">'+
  '<button class="crm" type="button">Remove</button></div>';
}
function xEditorHTML(e){
  var html = '';
  var groups = [], seen = {};
  EDIT_FIELDS.forEach(function(f){ if(!seen[f.group]){ seen[f.group] = 1; groups.push(f.group); } });
  groups.forEach(function(g){
    html += '<div class="xsec'+(g==='Subject file'?' full':'')+'"><h4>'+esc(g)+'</h4>';
    EDIT_FIELDS.filter(function(f){ return f.group === g; }).forEach(function(f){
      if(f.k === 'chips') return; // handled by the chip manager below
      var v = editVal(e, f);
      html += '<label class="efield"><span>'+esc(f.label)+'</span>';
      if(f.type === 'select'){
        html += '<select data-k="'+f.k+'">'+f.options.map(function(o){
          return '<option value="'+esc(o)+'"'+(o===v?' selected':'')+'>'+esc(o||'—')+'</option>';
        }).join('')+'</select>';
      } else if(f.type === 'area'){
        html += '<textarea data-k="'+f.k+'" rows="3">'+esc(v)+'</textarea>';
      } else {
        html += '<input data-k="'+f.k+'" value="'+esc(v)+'">';
      }
      html += '</label>';
    });
    if(g === 'Subject file'){
      html += '<label class="efield"><span>Chips</span></label><div id="xchips">';
      ((e.record && e.record.chips) || []).forEach(function(c){ html += chipRowHTML(c); });
      html += '</div><button class="xadd" id="xaddchip" type="button">+ Add chip</button>';
    }
    html += '</div>';
  });
  return '<div class="xgrid">' + html + '</div>';
}
/* Shared write pipeline: grouped patches -> web app POSTs. */
function postPatches(patches, pw, onOk, onErr){
  var kinds = Object.keys(patches).filter(function(k){
    return Object.keys(patches[k].patch).length && patches[k].id;
  });
  if(!kinds.length){ onOk(); return; }
  function postOne(i){
    if(i >= kinds.length){ onOk(); return; }
    var k = kinds[i], p = patches[k];
    fetch(WEBAPP_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ password: pw, kind: k, id: p.id, patch: p.patch })
    }).then(function(r){ return r.json(); }).then(function(res){
      if(res && res.ok) postOne(i + 1);
      else onErr('Save failed: ' + ((res && res.error) || 'unknown'));
    }).catch(function(){ onErr('Network error.'); });
  }
  postOne(0);
}
function buildPatches(e, changed){
  var patches = { directory: { id: e.name, patch: {} }, subject: { id: null, patch: {} } };
  patches.subject.id = (e.legacy && e.legacy.slug) || (e.record && e.record.slug) || null;
  Object.keys(changed).forEach(function(k){
    var f = EDIT_FIELDS.filter(function(x){ return x.k === k; })[0];
    if(f) patches[f.kind].patch[k] = changed[k];
  });
  return patches;
}
function saveExpanded(){
  var e = D.directory[S.sel];
  var pw = $('#xpw').value, msg = $('#xmsg'), btn = $('#xsave');
  if(!WEBAPP_URL){ msg.textContent = 'Editing is not configured yet — the web app URL is missing.'; return; }
  if(!pw){ msg.textContent = 'Enter the password.'; return; }
  var changed = {};
  document.querySelectorAll('#xcard [data-k]').forEach(function(inp){
    var k = inp.getAttribute('data-k');
    var f = EDIT_FIELDS.filter(function(x){ return x.k === k; })[0];
    if(f && inp.value !== editVal(e, f)) changed[k] = inp.value;
  });
  var chips = [];
  document.querySelectorAll('#xchips .chiprow').forEach(function(row){
    var t = row.querySelector('[data-ct]').value, l = row.querySelector('[data-cl]').value.trim();
    if(l) chips.push({ type: t, label: l });
  });
  var curChips = ((e.record && e.record.chips) || []).map(function(c){ return c.type+': '+c.label; }).join('; ');
  var newChips = chips.map(function(c){ return c.type+': '+c.label; }).join('; ');
  if(newChips !== curChips) changed.chips = newChips;
  if(!Object.keys(changed).length){ XEDIT = false; renderExpanded(); return; }
  btn.disabled = true; btn.textContent = 'Saving…'; msg.textContent = '';
  postPatches(buildPatches(e, changed), pw, function(){
    try { sessionStorage.setItem('dossier_edit_pw', pw); } catch(x){}
    applyLocalEdit(e, changed);
    XEDIT = false;
    renderExpanded(); renderProfile(); renderList();
    toast('Saved — syncing to the sheet and repo.');
  }, function(err){
    msg.textContent = err; btn.disabled = false; btn.textContent = 'Save changes';
  });
}

/* ---------- dashboard editing (writes back via the sheet's web app) ---------- */
var WEBAPP_URL = ''; // set to the Apps Script web app /exec URL after deploying Code.gs

var EDIT_FIELDS = [
  {k:'display', label:'Display name', kind:'directory', group:'Identity'},
  {k:'category', label:'Category', kind:'subject', group:'Subject file', type:'select',
   options:['','fam','peer','rom','auth','ment','conf']},
  {k:'role', label:'Role', kind:'subject', group:'Subject file'},
  {k:'period', label:'Period', kind:'subject', group:'Subject file'},
  {k:'standing', label:'Standing', kind:'subject', group:'Subject file'},
  {k:'description', label:'Description', kind:'subject', group:'Subject file', type:'area'},
  {k:'bio', label:'Bio', kind:'subject', group:'Subject file', type:'area'},
  {k:'chips', label:'Chips (type: label; …)', kind:'subject', group:'Subject file'},
  {k:'relationship_type', label:'Relationship type', kind:'subject', group:'Friends database', type:'select',
   options:['','Friend','Family','Acquaintance','Colleague']},
  {k:'groups', label:'Groups / contexts', kind:'subject', group:'Friends database'},
  {k:'closeness_tier', label:'Closeness tier', kind:'subject', group:'Friends database', type:'select',
   options:['','Inner','Regular','Distant']},
  {k:'fdb_state', label:'State', kind:'subject', group:'Friends database', type:'select',
   options:['','Active','Inactive','Closed']},
  {k:'fdb_standing', label:'Standing', kind:'subject', group:'Friends database', type:'select',
   options:['','Stable','Dormant','Rebuilding','Strained']},
  {k:'trajectory', label:'Trajectory', kind:'subject', group:'Friends database', type:'select',
   options:['','Improving','Flat','Declining','Unclear']},
  {k:'personal_context', label:'Personal context', kind:'subject', group:'Friends database'},
  {k:'shared_interests', label:'Shared interests', kind:'subject', group:'Friends database'},
  {k:'years_known', label:'Years known', kind:'subject', group:'Friends database'},
  {k:'phone', label:'Phone (redacted)', kind:'subject', group:'Friends database'},
  {k:'public_footprint', label:'Public footprint', kind:'subject', group:'Subject file', type:'area'},
  {k:'notes', label:'Private notes', kind:'subject', group:'Subject file', type:'area'}
];

function editVal(e, f){
  var leg = e.legacy||{}, rec = e.record||{}, fdb = e.friendsdb||{};
  switch(f.k){
    case 'display': return e.display||'';
    case 'category': return leg.cat||'';
    case 'role': return leg.role||'';
    case 'period': return leg.period||'';
    case 'standing': return leg.status||'';
    case 'description': return leg.desc||'';
    case 'bio': return rec.body||'';
    case 'chips': return (rec.chips||[]).map(function(c){ return c.type+': '+c.label; }).join('; ');
    case 'relationship_type': return fdb.relationship_type||'';
    case 'groups': return fdb.groups||'';
    case 'closeness_tier': return fdb.closeness_tier||'';
    case 'fdb_state': return fdb.state||'';
    case 'fdb_standing': return fdb.standing||'';
    case 'trajectory': return fdb.trajectory||'';
    case 'personal_context': return fdb.personal_context||'';
    case 'shared_interests': return fdb.shared_interests||'';
    case 'years_known': return fdb.years_known||'';
    case 'phone': return fdb.phone||'';
    case 'public_footprint': return e.public_footprint||'';
    case 'notes': return e.notes||'';
  }
  return '';
}

function openEditor(){
  if(S.sel === null) return;
  if(!WEBAPP_URL){
    toast('Editing is not configured yet — the web app URL is missing.');
    return;
  }
  var e = D.directory[S.sel];
  var groups = [], seen = {};
  EDIT_FIELDS.forEach(function(f){ if(!seen[f.group]){ seen[f.group]=1; groups.push(f.group); } });
  var html = '<div id="eoverlay"><div id="emodal" role="dialog" aria-label="Edit dossier">'+
    '<div class="ehead"><div><div class="ekicker">Edit dossier</div><h3>'+esc(e.display||e.name)+'</h3></div>'+
    '<button id="eclose" aria-label="Close editor">Close</button></div>'+
    '<div class="ebody">';
  groups.forEach(function(g){
    html += '<div class="egroup"><div class="eglabel">'+esc(g)+'</div>';
    EDIT_FIELDS.filter(function(f){ return f.group===g; }).forEach(function(f){
      var v = editVal(e, f);
      html += '<label class="efield"><span>'+esc(f.label)+'</span>';
      if(f.type==='select'){
        html += '<select data-k="'+f.k+'">'+f.options.map(function(o){
          return '<option value="'+esc(o)+'"'+(o===v?' selected':'')+'>'+esc(o||'—')+'</option>';
        }).join('')+'</select>';
      } else if(f.type==='area'){
        html += '<textarea data-k="'+f.k+'" rows="3">'+esc(v)+'</textarea>';
      } else {
        html += '<input data-k="'+f.k+'" value="'+esc(v)+'">';
      }
      html += '</label>';
    });
    html += '</div>';
  });
  var pw = '';
  try { pw = sessionStorage.getItem('dossier_edit_pw') || ''; } catch(x){}
  html += '</div><div class="efoot">'+
    '<input id="epw" type="password" placeholder="Password" autocomplete="off" aria-label="Password" value="'+esc(pw)+'">'+
    '<span id="emsg"></span>'+
    '<button id="esave">Save changes</button></div></div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
  $('#eclose').addEventListener('click', closeEditor);
  $('#eoverlay').addEventListener('click', function(ev){ if(ev.target.id==='eoverlay') closeEditor(); });
  $('#esave').addEventListener('click', saveEditor);
}

function closeEditor(){
  var o = $('#eoverlay'); if(o) o.remove();
}

function toast(msg){
  var t = document.createElement('div');
  t.className = 'etoast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function(){ t.classList.add('show'); }, 30);
  setTimeout(function(){ t.classList.remove('show'); setTimeout(function(){ t.remove(); }, 400); }, 2600);
}

function saveEditor(){
  var e = D.directory[S.sel];
  var pw = $('#epw').value;
  var msg = $('#emsg'), btn = $('#esave');
  var changed = {};
  document.querySelectorAll('#emodal [data-k]').forEach(function(inp){
    var k = inp.getAttribute('data-k');
    var nv = inp.value;
    if(nv !== editVal(e, EDIT_FIELDS.filter(function(f){ return f.k===k; })[0])) changed[k] = nv;
  });
  if(!Object.keys(changed).length){ closeEditor(); return; }
  if(!pw){ msg.textContent = 'Enter the password.'; return; }
  btn.disabled = true; btn.textContent = 'Saving…'; msg.textContent = '';
  postPatches(buildPatches(e, changed), pw, function(){
    try { sessionStorage.setItem('dossier_edit_pw', pw); } catch(x){}
    applyLocalEdit(e, changed);
    closeEditor();
    renderProfile(); renderList();
    toast('Saved — syncing to the sheet and repo.');
  }, function(err){
    msg.textContent = err; btn.disabled = false; btn.textContent = 'Save changes';
  });
}

/* Optimistic local update so the change is visible immediately. */
function applyLocalEdit(e, changed){
  Object.keys(changed).forEach(function(k){
    var v = changed[k];
    if(k==='display') e.display = v;
    else if(k==='category'){ e.legacy = e.legacy||{}; e.legacy.cat = v; }
    else if(k==='role'){ e.legacy = e.legacy||{}; e.legacy.role = v; }
    else if(k==='period'){ e.legacy = e.legacy||{}; e.legacy.period = v; }
    else if(k==='standing'){ e.legacy = e.legacy||{}; e.legacy.status = v; }
    else if(k==='description'){ e.legacy = e.legacy||{}; e.legacy.desc = v; }
    else if(k==='bio'){ e.record = e.record||{}; e.record.body = v; }
    else if(k==='public_footprint'){ e.public_footprint = v; }
    else if(k==='notes'){ e.notes = v; }
    else if(k==='chips'){
      e.record = e.record||{};
      e.record.chips = String(v).split(';').map(function(part){
        var bits = part.split(':'), t = bits.shift().trim();
        return { type: t, label: bits.join(':').trim() };
      }).filter(function(c){ return c.label; });
    }
    else {
      e.friendsdb = e.friendsdb||{};
      var fk = (k==='fdb_state') ? 'state' : (k==='fdb_standing' ? 'standing' : k);
      e.friendsdb[fk] = v;
      if(k==='trajectory') e.friendsdb.trend = ({'Improving':'up','Flat':'flat','Declining':'down'})[v] || 'unknown';
    }
  });
}

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
      var y = 1 - 2 * (j + 0.5) / list.length;
      var r = Math.sqrt(Math.max(0, 1 - y * y));
      var th = j * 2.399963;
      var rnd = mulberry32(k * 7919 + 13);
      var jr = R * (0.93 + rnd() * 0.14);
      var v = new THREE.Vector3(Math.cos(th) * r * jr, y * jr, Math.sin(th) * r * jr);
      glPos[k] = v;
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
