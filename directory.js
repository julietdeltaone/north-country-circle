/* North Country Circle — Directory app. Pulse-style directory + slide-over profile. */
(function(){
'use strict';
var S = { mode:'directory', q:'', sort:'name', rel:'', sel:null };
var D = null;
var dirByHandle = {};   // ig handle (lower) -> directory row
var personByHandle = {}; // ig handle (lower) -> person

function $(s,r){ return (r||document).querySelector(s); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function initial(s){ s=String(s||'').replace(/^@/,'').trim(); return s? s[0].toUpperCase() : '·'; }

/* ---------- ambient backdrop: slow drifting glows ---------- */
function ambient(){
  var cv = $('#ambient'), ctx = cv.getContext('2d');
  var W,H,dpr;
  function size(){
    dpr = Math.min(window.devicePixelRatio||1, 2);
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

/* ---------- data shaping ---------- */
function dirRows(){
  return D.directory.map(function(r,i){
    return { kind:'d', i:i, name:r.name, title:r.display||r.name, sub:'@'+r.name,
      relation:r.relation, pieces:r.pieces, detail:r.detail, key:'d'+i };
  });
}
function peopleRows(){
  return D.people.map(function(p,i){
    return { kind:'p', i:i, name:p.person, title:p.person, sub:p.ig? '@'+p.ig : 'no handle yet',
      ig:p.ig, aka:p.aka, source:p.source, mentions:p.mentions, key:'p'+i };
  });
}
function filtered(){
  var q = S.q.trim().toLowerCase();
  var rows = (S.mode==='directory' ? dirRows() : peopleRows()).filter(function(r){
    if(S.mode==='directory' && S.rel && r.relation!==S.rel) return false;
    if(!q) return true;
    var hay = (r.title+' '+r.name+' '+(r.ig||'')+' '+(r.aka||'')).toLowerCase();
    return hay.indexOf(q) >= 0;
  });
  rows.sort(function(a,b){
    if(S.sort==='pieces') return (b.pieces||0)-(a.pieces||0) || a.title.localeCompare(b.title);
    if(S.sort==='fewest') return (a.pieces||0)-(b.pieces||0) || a.title.localeCompare(b.title);
    if(S.sort==='mentions') return (parseInt(b.mentions,10)||0)-(parseInt(a.mentions,10)||0) || a.title.localeCompare(b.title);
    return a.title.localeCompare(b.title);
  });
  return rows;
}

/* ---------- left list ---------- */
function sortOptions(){
  var o = S.mode==='directory'
    ? [['name','Name A–Z'],['pieces','Most info pieces'],['fewest','Fewest info pieces']]
    : [['name','Name A–Z'],['mentions','Most mentions']];
  $('#fsort').innerHTML = o.map(function(x){
    return '<option value="'+x[0]+'"'+(S.sort===x[0]?' selected':'')+'>'+x[1]+'</option>';
  }).join('');
  $('#frel').style.display = S.mode==='directory' ? '' : 'none';
}
function renderList(){
  var rows = filtered();
  var total = S.mode==='directory' ? D.directory.length : D.people.length;
  $('#lcount').textContent = rows.length===total
    ? total+' names'
    : rows.length+' of '+total+' names';
  if(!rows.length){
    $('#leftbody').innerHTML = '<div class="empty-note">No names match.</div>';
    return;
  }
  var html = rows.map(function(r,i){
    var sub = S.mode==='directory'
      ? esc(r.sub)+' · '+esc(r.relation)
      : esc(r.sub);
    var meta = S.mode==='directory'
      ? '<div class="meta"><b>'+r.pieces+'</b><span>pieces</span></div>'
      : (r.mentions ? '<div class="meta"><b>'+esc(r.mentions)+'</b><span>mentions</span></div>' : '');
    return '<div class="row'+(S.sel===r.key?' sel':'')+'" data-key="'+r.key+'"'+
      ' style="animation-delay:'+Math.min(i*16,480)+'ms" role="button" tabindex="0">'+
      '<div class="ring '+(r.relation||'')+'">'+esc(initial(r.title))+'</div>'+
      '<div class="nm"><b>'+esc(r.title)+'</b><span>'+sub+'</span></div>'+meta+'</div>';
  }).join('');
  $('#leftbody').innerHTML = html;
}

/* ---------- profile ---------- */
function igURL(h){ return 'https://www.instagram.com/'+encodeURIComponent(String(h).replace(/^@/,''))+'/'; }
function meter(n, max, label){
  var pct = Math.max(0, Math.min(100, (n/max)*100));
  return '<div class="pmeter"><div class="barlbl"><span>'+label+'</span><b>'+n+' / '+max+'</b></div>'+
    '<div class="bar"><i style="width:'+pct+'%"></i></div></div>';
}
function profileDir(r){
  var person = personByHandle[r.name.toLowerCase()];
  var x = person ? '<div class="xcard" data-goto="people:'+esc(person.key)+'">'+
    '<div class="t">Also in Named People</div><div class="n">'+esc(person.title)+'</div>'+
    '<div class="s">'+esc(person.mentions||'0')+' memoir mentions · tap to view</div></div>' : '';
  return '<div class="prof">'+
    '<button id="mclose">Close</button>'+
    '<div class="p-eyebrow"><span class="chip '+esc(r.relation)+'">'+esc(r.relation)+'</span></div>'+
    '<h2>'+esc(r.title)+'</h2>'+
    '<a class="iglink" href="'+igURL(r.name)+'" target="_blank" rel="noopener">@'+esc(r.name)+' ↗</a>'+
    '<div class="p-stats"><div class="stat"><div class="v">'+r.pieces+'</div><div class="l">info pieces</div></div>'+
    '<div class="stat"><div class="v" style="text-transform:capitalize">'+esc(r.relation)+'</div><div class="l">relation</div></div></div>'+
    meter(r.pieces, 8, 'Profile completeness')+
    '<div class="sec"><h3>What we have</h3><p class="detail">'+esc(r.detail||'—')+'</p></div>'+
    x + '</div>';
}
function profilePerson(p){
  var d = p.ig ? dirByHandle[p.ig.replace(/^@/,'').toLowerCase()] : null;
  var aka = p.aka ? '<p class="aka">Also known as: '+esc(p.aka)+'</p>' : '';
  var src = p.source ? '<div class="srcrow">'+p.source.split(';').map(function(s){
    return '<span class="chip ghost">'+esc(s.trim())+'</span>'; }).join('')+'</div>' : '';
  var x = d ? '<div class="xcard" data-goto="directory:'+esc(d.key)+'">'+
    '<div class="t">In your first hop</div><div class="n">'+esc(d.title)+'</div>'+
    '<div class="s">'+esc(d.relation)+' · '+d.pieces+' info pieces · tap to view</div></div>' : '';
  return '<div class="prof">'+
    '<button id="mclose">Close</button>'+
    '<div class="p-eyebrow"><span class="chip ghost">named person</span></div>'+
    '<h2>'+esc(p.title)+'</h2>'+
    (p.ig ? '<a class="iglink" href="'+igURL(p.ig)+'" target="_blank" rel="noopener">@'+esc(p.ig)+' ↗</a>' : '')+
    aka +
    '<div class="p-stats"><div class="stat"><div class="v">'+esc(p.mentions||'0')+'</div><div class="l">memoir mentions</div></div>'+
    '<div class="stat"><div class="v">'+(p.ig?'Yes':'—')+'</div><div class="l">IG handle</div></div></div>'+
    (p.source ? '<div class="sec"><h3>Sources</h3>'+src+'</div>' : '')+
    x + '</div>';
}
function renderProfile(){
  var body = $('#rightbody'), panel = $('#right');
  if(!S.sel){
    panel.classList.remove('open');
    body.innerHTML = '<div class="p-empty"><div class="mark">◈</div><p>Select a name from the directory to see their profile.</p></div>';
    return;
  }
  var kind = S.sel[0], i = parseInt(S.sel.slice(1),10);
  var html = kind==='d'
    ? profileDir({ key:S.sel, name:D.directory[i].name, title:D.directory[i].display||D.directory[i].name,
        relation:D.directory[i].relation, pieces:D.directory[i].pieces, detail:D.directory[i].detail })
    : profilePerson({ key:S.sel, title:D.people[i].person, ig:D.people[i].ig, aka:D.people[i].aka,
        source:D.people[i].source, mentions:D.people[i].mentions });
  panel.classList.add('open');
  body.innerHTML = html;
  body.scrollTop = 0;
}

/* ---------- selection ---------- */
function select(key){
  S.sel = (S.sel===key) ? null : key;
  var rows = document.querySelectorAll('#leftbody .row');
  rows.forEach(function(el){ el.classList.toggle('sel', el.dataset.key===S.sel); });
  renderProfile();
}
function gotoRef(ref){
  var parts = ref.split(':'), mode = parts[0], key = parts[1];
  if(S.mode!==mode){
    S.mode = mode; S.q=''; $('#fq').value=''; S.sort='name';
    document.querySelectorAll('.modetoggle button').forEach(function(b){
      var on = b.dataset.mode===mode;
      b.classList.toggle('on', on); b.setAttribute('aria-selected', on);
    });
    sortOptions(); renderList();
  }
  S.sel = key;
  document.querySelectorAll('#leftbody .row').forEach(function(el){
    el.classList.toggle('sel', el.dataset.key===key);
  });
  renderProfile();
  var el = document.querySelector('#leftbody .row[data-key="'+key+'"]');
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
  document.querySelectorAll('.modetoggle button').forEach(function(b){
    b.addEventListener('click', function(){
      if(S.mode===b.dataset.mode) return;
      S.mode = b.dataset.mode; S.q=''; fq.value=''; S.sort='name'; S.rel=''; S.sel=null;
      $('#frel').value='';
      document.querySelectorAll('.modetoggle button').forEach(function(x){
        var on = x===b; x.classList.toggle('on', on); x.setAttribute('aria-selected', on);
      });
      fq.placeholder = S.mode==='directory' ? 'Search names…' : 'Search people…';
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
  $('#rightbody').addEventListener('click', function(e){
    if(e.target.closest('#mclose')){ select(S.sel); return; }
    var card = e.target.closest('[data-goto]');
    if(card) gotoRef(card.dataset.goto);
  });
  document.addEventListener('keydown', function(e){
    if(e.key==='Escape' && S.sel) select(S.sel);
  });
}

/* ---------- boot ---------- */
function boot(){
  ambient();
  fetch('data/directory.json', {cache:'no-store'})
    .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(function(d){
      D = d;
      D.directory.forEach(function(r){ dirByHandle[String(r.name).toLowerCase()] = r; });
      D.people.forEach(function(p,i){
        if(p.ig) personByHandle[String(p.ig).replace(/^@/,'').toLowerCase()] = Object.assign({key:'p'+i}, p);
      });
      // attach directory keys for cross-links
      D.directory.forEach(function(r,i){ dirByHandle[String(r.name).toLowerCase()].key = 'd'+i; });
      $('#fresh').textContent = 'updated ' + (D.updated||'—');
      sortOptions(); renderList(); renderProfile(); bind();
    })
    .catch(function(err){
      $('#leftbody').innerHTML = '<div class="empty-note">Could not load directory data.</div>';
      $('#rightbody').innerHTML = '<div class="p-empty"><p>Data failed to load.</p></div>';
    });
}
document.addEventListener('DOMContentLoaded', boot);
})();
