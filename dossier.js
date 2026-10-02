/* North Country Circle — Dossier. Hub-spoke directory + dossier documents + redaction wall. */
(function(){
'use strict';
var S = { q:'', rel:'', sel:null, showBg:false, listOpen:true };
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
    '<div class="doc-head"><button id="mclose" aria-label="Close dossier">Close</button>'+
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
  });
  $('#rightbody').addEventListener('submit', function(e){
    var form = e.target.closest('.wallform');
    if(form){ e.preventDefault(); tryUnlock(form); }
  });
  document.addEventListener('keydown', function(e){
    if(e.key==='Escape' && S.sel !== null){ S.sel = null; renderProfile(); renderList(); }
  });
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
