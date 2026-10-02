/* North Country Circle — Dossier. Directory look + official-document profiles + redaction wall. */
(function(){
'use strict';
var S = { scope:'dir', q:'', sort:'name', rel:'', sel:null };
var D = null;
var UNLOCKED = false;
try { UNLOCKED = sessionStorage.getItem('dossier_clear') === '1'; } catch(e){}

function $(s,r){ return (r||document).querySelector(s); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function initial(s){ s=String(s||'').replace(/^@/,'').trim(); return s? s[0].toUpperCase() : '·'; }

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

/* ---------- left list ---------- */
function dirRows(){
  var q = S.q.trim().toLowerCase();
  var rows = D.directory.map(function(r,i){
    return { i:i, title:r.display||r.name, sub:'@'+r.name, relation:r.relation,
      pieces:r.pieces, strength:r.strength, shared:r.shared_with_jd, key:'d'+i };
  }).filter(function(r){
    if(S.rel && r.relation!==S.rel) return false;
    if(!q) return true;
    return (r.title+' '+r.sub).toLowerCase().indexOf(q) >= 0;
  });
  rows.sort(function(a,b){
    if(S.sort==='strength') return b.strength-a.strength || a.title.localeCompare(b.title);
    if(S.sort==='pieces') return b.pieces-a.pieces || a.title.localeCompare(b.title);
    if(S.sort==='shared') return b.shared-a.shared || a.title.localeCompare(b.title);
    return a.title.localeCompare(b.title);
  });
  return rows;
}
function bgRows(){
  var q = S.q.trim().toLowerCase();
  if(q.length < 2) return null;
  var out = [];
  var idx = D.circle_index;
  for(var i=0;i<idx.length && out.length<200;i++){
    var u = idx[i][0], n = idx[i][1];
    if((u+' '+n).toLowerCase().indexOf(q) >= 0)
      out.push({ i:i, title:n||u, sub:'@'+u, degree:idx[i][2], key:'b'+i });
  }
  out.sort(function(a,b){ return b.degree-a.degree; });
  return out;
}
function sortOptions(){
  var o = S.scope==='dir'
    ? [['name','Name A–Z'],['strength','Strongest first'],['pieces','Most info pieces'],['shared','Most shared connections']]
    : [['name','Name A–Z']];
  $('#fsort').innerHTML = o.map(function(x){
    return '<option value="'+x[0]+'"'+(S.sort===x[0]?' selected':'')+'>'+x[1]+'</option>';
  }).join('');
  $('#frel').style.display = S.scope==='dir' ? '' : 'none';
}
function renderList(){
  var body = $('#leftbody');
  if(S.scope==='all'){
    var rows = bgRows();
    $('#scopenote').textContent = 'Background data — the full circle, outside your 732.';
    $('#scopenote').classList.add('bg');
    if(rows === null){
      $('#lcount').textContent = '';
      body.innerHTML = '<div class="empty-note">Type at least 2 characters to search the full circle.</div>';
      return;
    }
    $('#lcount').textContent = rows.length >= 200 ? 'first 200 of many matches' : rows.length+' background matches';
    body.innerHTML = rows.length ? rows.map(function(r,i){
      return '<div class="row bgrow'+(S.sel===r.key?' sel':'')+'" data-key="'+r.key+'"'+
        ' style="animation-delay:'+Math.min(i*12,360)+'ms" role="button" tabindex="0">'+
        '<div class="ring bg">'+esc(initial(r.title))+'</div>'+
        '<div class="nm"><b>'+esc(r.title)+'</b><span>'+esc(r.sub)+'</span></div>'+
        '<div class="meta"><b>'+r.degree+'</b><span>links</span></div></div>';
    }).join('') : '<div class="empty-note">No background matches.</div>';
    return;
  }
  $('#scopenote').textContent = 'Your first hop — the people who matter.';
  $('#scopenote').classList.remove('bg');
  var drows = dirRows();
  $('#lcount').textContent = drows.length===D.directory.length
    ? D.directory.length+' names'
    : drows.length+' of '+D.directory.length+' names';
  body.innerHTML = drows.length ? drows.map(function(r,i){
    return '<div class="row'+(S.sel===r.key?' sel':'')+'" data-key="'+r.key+'"'+
      ' style="animation-delay:'+Math.min(i*12,360)+'ms" role="button" tabindex="0">'+
      '<div class="ring '+esc(r.relation||'')+'">'+esc(initial(r.title))+'</div>'+
      '<div class="nm"><b>'+esc(r.title)+'</b><span>'+esc(r.sub)+' · '+esc(r.relation)+'</span></div>'+
      '<div class="meta"><b>'+r.pieces+'</b><span>pieces</span></div></div>';
  }).join('') : '<div class="empty-note">No names match.</div>';
}

/* ---------- middle: metrics + strongest ---------- */
function renderMid(){
  var m = D.metrics, el = $('#midbody');
  var rel = m.relations;
  var tot = rel.mutual + rel.following + rel.follower;
  function pct(n){ return tot ? Math.round(n/tot*1000)/10 : 0; }
  var tiles = [
    ['hi', m.scope, 'in scope'],
    ['', m.circle_total.toLocaleString(), 'full circle'],
    ['', m.circle_edges.toLocaleString(), 'connections'],
    ['', m.avg_pieces, 'avg info pieces'],
    ['', Math.round(m.avg_degree), 'avg graph links'],
    ['', m.named_people, 'named people'],
    ['', m.legacy_matched+'<small>/'+m.legacy_cards+'</small>', 'memoir cards matched'],
    ['', m.record_matched+'<small>/'+m.record_profiles+'</small>', 'record profiles matched'],
    ['hi', m.strongest ? D.strongest.length : 8, 'strongest ranked']
  ];
  el.innerHTML =
    '<div class="m-head"><h2>Circle metrics</h2><span>'+esc(D.updated)+'</span></div>'+
    '<div class="m-grid">' + tiles.map(function(t,i){
      return '<div class="mtile '+(t[0]||'')+'" style="animation-delay:'+Math.min(i*40,320)+'ms">'+
        '<div class="v">'+t[1]+'</div><div class="l">'+t[2]+'</div></div>';
    }).join('') + '</div>'+
    '<div class="relbar"><div class="rlbl"><span>Mutual <b>'+rel.mutual+'</b></span>'+
    '<span>Following <b>'+rel.following+'</b></span><span>Follower <b>'+rel.follower+'</b></span></div>'+
    '<div class="reltrack">'+
    '<i style="width:'+pct(rel.mutual)+'%;background:#e8b34b"></i>'+
    '<i style="width:'+pct(rel.following)+'%;background:#6fd3e7"></i>'+
    '<i style="width:'+pct(rel.follower)+'%;background:#6db3f2"></i>'+
    '</div></div>'+
    '<div class="m-sec">Strongest connections</div>'+
    D.strongest.map(function(s,i){
      return '<div class="scard'+(S.sel==='d'+s.dir_idx?' sel':'')+'" data-key="d'+s.dir_idx+'"'+
        ' style="animation-delay:'+Math.min(i*50,400)+'ms" role="button" tabindex="0">'+
        '<div class="srank">'+(i+1)+'</div>'+
        '<div class="nm"><b>'+esc(s.title)+'</b><span>'+esc(s.reason)+'</span></div>'+
        '<div class="score">'+s.strength+'</div></div>';
    }).join('')+
    '<p class="m-note">Strength blends the relationship (mutual / following / follower), '+
    'how much is on file, graph connections, and connections you share. '+
    'The full circle stays in the background — switch the list scope to search it.</p>';
}

/* ---------- dossier ---------- */
function igURL(h){ return 'https://www.instagram.com/'+encodeURIComponent(String(h).replace(/^@/,''))+'/'; }
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
  if(person) kv += '<dt>Named file</dt><dd>'+esc(person.person)+' · '+esc(person.mentions||'0')+' memoir mentions</dd>';

  var memoirInner = '';
  if(leg && leg.desc) memoirInner += '<p class="body rtext">'+esc(leg.desc)+'</p>';
  if(rec && rec.body) memoirInner += '<p class="body rtext">'+esc(rec.body)+'</p>';
  if(!memoirInner) memoirInner = '<p class="body">No memoir material on file.</p>';

  var chips = [];
  if(leg) chips.push('<span class="chip ghost">legacy memoir</span>');
  if(rec) chips.push('<span class="chip ghost">the record</span>');
  chips.push('<span class="chip ghost">circle graph</span>');
  chips.push('<span class="chip ghost">directory</span>');
  if(rec && rec.chips) rec.chips.slice(0,8).forEach(function(c){
    chips.push('<span class="chip violet">'+esc(c.label)+'</span>');
  });

  var hasSensitive = !!(leg && leg.desc) || !!(rec && rec.body);
  return '<div class="doc">'+ classbar() +
    '<div class="doc-head"><button id="mclose">Close</button>'+
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
    '<div class="dsec"><h3><span class="n">03</span> Memoir file</h3>'+
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

function dossierBg(u, n, deg){
  return '<div class="doc">'+ classbar() +
    '<div class="doc-head"><button id="mclose">Close</button>'+
    '<div class="doc-kicker">Background data</div><h2>'+esc(n||u)+'</h2>'+
    '<a class="iglink" href="'+igURL(u)+'" target="_blank" rel="noopener">@'+esc(u)+' ↗</a>'+
    '<div class="doc-filed">Outside your 732 — full-circle background record</div>'+
    '<span class="stamp amber">Background</span></div>'+
    '<div class="dsec"><h3><span class="n">01</span> Subject profile</h3><dl class="kv">'+
    '<dt>Graph links</dt><dd>'+deg+'</dd>'+
    '<dt>Scope</dt><dd>Background — not in the 732</dd></dl></div>'+
    '<div class="dsec"><h3><span class="n">02</span> Memoir file</h3>'+
    '<p class="body">No memoir material — background records carry graph data only.</p></div>'+
    classbar().replace('classbar', 'classbar bot') + '</div>';
}

/* Soft barrier only: this page and its data are public on a static host.
   The password is a privacy screen against casual viewing, not access control. */
function wallHTML(){
  return '<div class="wall"><div class="wlock">◈</div>'+
    '<div class="wstamp">Restricted</div>'+
    '<p>This section holds personal memoir material. Enter the password to reveal it.</p>'+
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

function renderProfile(){
  var body = $('#rightbody'), panel = $('#right');
  if(S.sel === null){
    panel.classList.remove('open');
    body.innerHTML = '<div class="p-empty"><div class="mark">◈</div>'+
      '<p>Select a name from the directory to open their dossier.</p></div>';
    return;
  }
  var html;
  if(S.sel[0] === 'd'){
    var i = parseInt(S.sel.slice(1), 10);
    html = dossierDir(D.directory[i], i);
  } else {
    var b = parseInt(S.sel.slice(1), 10);
    var c = D.circle_index[b];
    html = dossierBg(c[0], c[1], c[2]);
  }
  panel.classList.add('open');
  body.innerHTML = html;
  body.scrollTop = 0;
}

/* ---------- selection ---------- */
function select(key){
  S.sel = (S.sel === key) ? null : key;
  document.querySelectorAll('#leftbody .row').forEach(function(el){
    el.classList.toggle('sel', el.dataset.key === S.sel);
  });
  document.querySelectorAll('#midbody .scard').forEach(function(el){
    el.classList.toggle('sel', el.dataset.key === S.sel);
  });
  renderProfile();
}
function selectDir(idx){
  if(S.scope !== 'dir'){
    S.scope = 'dir'; S.q=''; $('#fq').value=''; S.sort='strength';
    document.querySelectorAll('.scopetoggle button').forEach(function(b){
      var on = b.dataset.scope==='dir';
      b.classList.toggle('on', on); b.setAttribute('aria-selected', on);
    });
    sortOptions(); renderList();
  }
  S.sel = 'd'+idx;
  document.querySelectorAll('#leftbody .row').forEach(function(el){
    el.classList.toggle('sel', el.dataset.key === S.sel);
  });
  document.querySelectorAll('#midbody .scard').forEach(function(el){
    el.classList.toggle('sel', el.dataset.key === S.sel);
  });
  renderProfile();
  var el = document.querySelector('#leftbody .row[data-key="d'+idx+'"]');
  if(el) el.scrollIntoView({block:'nearest', behavior:'smooth'});
}

/* ---------- events ---------- */
function bind(){
  var fq = $('#fq'), deb = null;
  fq.addEventListener('input', function(){
    clearTimeout(deb);
    deb = setTimeout(function(){ S.q = fq.value; renderList(); }, 140);
  });
  $('#fsort').addEventListener('change', function(e){ S.sort = e.target.value; renderList(); });
  $('#frel').addEventListener('change', function(e){ S.rel = e.target.value; renderList(); });
  document.querySelectorAll('.scopetoggle button').forEach(function(b){
    b.addEventListener('click', function(){
      if(S.scope === b.dataset.scope) return;
      S.scope = b.dataset.scope; S.q=''; fq.value=''; S.sort='name'; S.rel=''; S.sel=null;
      $('#frel').value='';
      document.querySelectorAll('.scopetoggle button').forEach(function(x){
        var on = x===b; x.classList.toggle('on', on); x.setAttribute('aria-selected', on);
      });
      fq.placeholder = S.scope==='dir' ? 'Search names…' : 'Search the full circle…';
      sortOptions(); renderList(); renderProfile();
    });
  });
  $('#leftbody').addEventListener('click', function(e){
    var row = e.target.closest('.row');
    if(row) select(row.dataset.key);
  });
  $('#leftbody').addEventListener('keydown', function(e){
    var row = e.target.closest('.row');
    if(row && (e.key==='Enter'||e.key===' ')){ e.preventDefault(); select(row.dataset.key); }
  });
  $('#midbody').addEventListener('click', function(e){
    var card = e.target.closest('.scard');
    if(card) selectDir(parseInt(card.dataset.key.slice(1), 10));
  });
  $('#midbody').addEventListener('keydown', function(e){
    var card = e.target.closest('.scard');
    if(card && (e.key==='Enter'||e.key===' ')){ e.preventDefault(); selectDir(parseInt(card.dataset.key.slice(1), 10)); }
  });
  $('#rightbody').addEventListener('click', function(e){
    if(e.target.closest('#mclose')){ select(S.sel); return; }
  });
  $('#rightbody').addEventListener('submit', function(e){
    var form = e.target.closest('.wallform');
    if(form){ e.preventDefault(); tryUnlock(form); }
  });
  document.addEventListener('keydown', function(e){
    if(e.key==='Escape' && S.sel) select(S.sel);
  });
}

/* ---------- boot ---------- */
function boot(){
  ambient();
  fetch('data/dossier.json', {cache:'no-store'})
    .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(function(d){
      D = d;
      $('#fresh').textContent = 'updated ' + (D.updated||'—');
      sortOptions(); renderList(); renderMid(); renderProfile(); bind();
    })
    .catch(function(){
      $('#leftbody').innerHTML = '<div class="empty-note">Could not load dossier data.</div>';
      $('#midbody').innerHTML = '<div class="empty-note">Data failed to load.</div>';
      $('#rightbody').innerHTML = '<div class="p-empty"><p>Data failed to load.</p></div>';
    });
}
document.addEventListener('DOMContentLoaded', boot);
})();
