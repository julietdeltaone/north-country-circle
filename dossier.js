/* North Country Circle — Dossier. Hub-spoke directory + dossier documents + redaction wall. */
(function(){
'use strict';
var S = { q:'', rel:'', sel:null, showBg:false, listOpen:true, mode:'3d', auditFilter:false, editing:false, lvl:1 };
var D = null, NODES = [], ORDER = [], LIST_ORDER = [];

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

var PROFILE_FIELDS = [
  {k:'relationship', label:'Relationship', type:'select', options:['','family','friend','coworker','acquaintance','other']},
  {k:'context', label:'Context', type:'select', options:['','work','school','military','community','church','online','other']},
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
var ORG_CATS = [
  {k:'churches', label:'Churches', options:['CFC Potsdam','CFC Canton','CFC Madrid','NTC','Calvary Baptist']},
  {k:'companies', label:'Companies', options:['Rochester Regional Health','Clarkson University','Park Bros.']},
  {k:'universities', label:'Universities', options:['SUNY Canton','SUNY Potsdam','St. Lawrence University','Clarkson University']}
];
function tagList(v){ return String(v || '').split(',').map(function(x){ return x.trim(); }).filter(Boolean); }
function fmtPhone(p){
  var d = String(p || '').replace(/\D/g, '');
  if(d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
  if(d.length === 10) return '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6);
  return String(p || '').trim();
}
function tagPicker(cat, prof){
  var sel = tagList(prof[cat.k]);
  var all = cat.options.concat(sel.filter(function(x){ return cat.options.indexOf(x) < 0; }));
  var h = '<div class="tcat"><div class="tlab">' + esc(cat.label) + '</div>' +
    '<div class="tchips" data-tcat="' + cat.k + '">' +
    all.map(function(o){
      return '<span class="tchip' + (sel.indexOf(o) >= 0 ? ' on' : '') + '" data-tv="' + esc(o) + '">' + esc(o) + '</span>';
    }).join('') +
    '<input class="tadd" placeholder="+ add new" aria-label="Add new ' + esc(cat.label) + '"></div>' +
    '<input type="hidden" data-pk="' + cat.k + '" value="' + esc(sel.join(', ')) + '"></div>';
  return h;
}
function syncTagHidden(tcat){
  var vals = [];
  tcat.querySelectorAll('.tchip.on').forEach(function(c){ vals.push(c.getAttribute('data-tv')); });
  tcat.querySelector('input[data-pk]').value = vals.join(', ');
}
function refreshTagCat(k){
  var panel = $('#rightbody'); if(!panel) return;
  var tcat = panel.querySelector('.tchips[data-tcat="' + k + '"]');
  if(!tcat) return;
  var cat = ORG_CATS.filter(function(c){ return c.k === k; })[0]; if(!cat) return;
  var sel = tagList(tcat.parentNode.querySelector('input[data-pk]').value);
  var all = cat.options.concat(sel.filter(function(x){ return cat.options.indexOf(x) < 0; }));
  tcat.innerHTML = all.map(function(o){
    return '<span class="tchip' + (sel.indexOf(o) >= 0 ? ' on' : '') + '" data-tv="' + esc(o) + '">' + esc(o) + '</span>';
  }).join('') + '<input class="tadd" placeholder="+ add new" aria-label="Add new ' + esc(cat.label) + '">';
}
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
/* Shared panel header (view + edit): name, handle/relation, audit badge, closeness ring,
   pencil / three-dot / close on the far right. */
function phead(e){
  var prof = e.profile || {}, fdb = e.friendsdb || {};
  var title = e.display || e.name;
  var sub = e.src === 'contacts' ? 'phone contact' : e.src === 'subject' ? 'subject file' : '@' + e.name;
  if(e.relation) sub += ' · ' + e.relation;
  var aud = (prof.audit === 'audited');
  var actBtn = S.editing
    ? '<button id="pdone" class="phbtn acc" title="Done — save and exit edit mode">' + ic('check', 16) + '</button>'
    : '<button id="pedit" class="phbtn" title="Edit this file">' + ic('edit', 15) + '</button>';
  var initial = esc(String(title || '?').trim().charAt(0).toUpperCase());
  var pl = personLevel(e);
  var close = prof.closeness ? String(prof.closeness) + '/5' : '—';
  var tiles = statTile('heart', close, 'closeness', '#e0688a') +
    statTile('flag', fdb.standing || '—', 'standing', '#e8b34b') +
    statTile('clock', fdb.years_known ? fdb.years_known + ' yrs' : '—', 'known', '#6fd3e7') +
    statTile('share', String(e.degree || 0), 'graph links', '#8fa8d8');
  return '<div class="phead">' +
    '<div class="ph-id">' +
      '<div class="ph-ava" style="--c:' + LVLC[pl] + '"><span>' + initial + '</span></div>' +
      '<div class="ph-name"><h2>' + esc(title) + '</h2>' +
      '<div class="ph-sub"><span>' + esc(sub) + '</span>' +
      '<button id="auditbadge" class="auditbadge ' + (aud ? 'ok' : 'needs') + '" title="Toggle audit status">' +
      (aud ? '● audited' : '● needs audit') + '</button>' + reviewBadge(e) + '</div></div>' +
      '<div class="phbtns">' + actBtn +
      '<div class="dmenu"><button class="phbtn dbtn" aria-label="More actions" aria-haspopup="true">' + ic('dots', 15) + '</button>' +
      '<div class="ditems"><button id="paudit">' + (aud ? 'Audited ✓' : 'Mark audited') + '</button>' +
      '<button id="pexport">Export dossier</button>' +
      '<button id="paddnote">Add timeline event</button>' +
      '<button id="pdelete" class="danger">Delete this person</button></div></div>' +
      '<button id="mclose" class="phbtn" title="Close panel">' + ic('x', 16) + '</button></div>' +
    '</div>' +
    '<div class="ph-tiles">' + tiles + '</div>' +
    levelPill(e) +
  '</div>';
}
function fieldDef(k){
  for(var i = 0; i < PROFILE_FIELDS.length; i++) if(PROFILE_FIELDS[i].k === k) return PROFILE_FIELDS[i];
  return { k: k, label: k };
}
/* ---------- three dossier levels ----------
   L1 Snapshot: facts about the person alone (nothing about JD).
   L2 Story:    the connection to JD + narrative + timeline events.
   L3 Files:    attached documents. Level is derived from content. */
var LVLC = {1:'#8fa8d8', 2:'#e8b34b', 3:'#6fd08c'};
var LVLN = {1:'Snapshot', 2:'Story', 3:'Files'};
/* ---------- icon set (inline SVG, stroke = currentColor) ---------- */
var IC = {
  phone:'<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  user:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  heart:'<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  flag:'<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  folder:'<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  book:'<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  camera:'<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  quote:'<path d="M10 11H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6c0 2-1 3.5-3 4.5M20 11h-4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6c0 2-1 3.5-3 4.5"/>',
  zap:'<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  briefcase:'<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  tag:'<path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24H4a1 1 0 0 0-1 1v5.59a2 2 0 0 0 .59 1.41l9.58 9.59a2 2 0 0 0 2.83 0l4.59-4.59a2 2 0 0 0 0-2.83z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  trend:'<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  activity:'<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  edit:'<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
  dots:'<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
  send:'<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>'
};
function ic(n, s){
  s = s || 16;
  return '<svg class="icsvg" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || '') + '</svg>';
}
/* "Generate assessment" button visibility: off by default, toggle in Settings. */
function assessOn(){
  try{ return localStorage.getItem('ncc_show_assess') === '1'; }catch(e){ return false; }
}
/* small stat tile: icon, value, label */
function statTile(icon, val, label, color){
  return '<div class="stile"' + (color ? ' style="--tc:' + color + '"' : '') + '>' +
    '<span class="stic">' + ic(icon, 17) + '</span>' +
    '<span class="stx"><b>' + esc(val) + '</b><i>' + esc(label) + '</i></span></div>';
}
/* section header: icon + title + tag */
function secHead(icon, title, tag, color){
  return '<div class="sechead"><span class="shic"' + (color ? ' style="color:' + color + '"' : '') + '>' +
    ic(icon, 17) + '</span><h3>' + esc(title) + '</h3>' +
    (tag ? '<span class="lvltag">' + esc(tag) + '</span>' : '') + '</div>';
}
function subjSlug(e){
  if(e.record && e.record.slug) return e.record.slug;
  return String(e.display || e.name || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function personLevel(e){
  if((e.files || []).length) return 3;
  if((e.events || []).length) return 2;
  return 1;
}
function levelPill(e){
  var pl = personLevel(e), cur = S.lvl || 1;
  var icons = {1:'camera', 2:'book', 3:'folder'};
  var h = '<div class="levels" id="lvlpill" role="tablist" aria-label="Dossier level"><span class="ind" id="lvlind"></span>';
  [1,2,3].forEach(function(n){
    var lit = n === 1 || (n === 2 && pl >= 2) || (n === 3 && pl >= 3);
    h += '<button class="lvlbtn' + (cur === n ? ' on' : '') + '" data-lvl="' + n + '" role="tab" title="Level ' + n + ' — ' + LVLN[n] + '" style="--c:' + LVLC[n] + '">' +
      '<span class="lvic">' + ic(icons[n], 15) + '</span><span class="lvlab">' + LVLN[n] + '</span>' +
      '<span class="dot' + (lit ? ' lit' : '') + '"' + (lit ? ' style="background:' + LVLC[n] + '"' : '') + '></span></button>';
  });
  return h + '</div>';
}
function positionLvlInd(){
  var pill = document.querySelector('#lvlpill');
  if(!pill) return;
  var btn = pill.querySelector('.lvlbtn.on'), ind = pill.querySelector('.ind');
  if(!btn || !ind) return;
  ind.style.left = btn.offsetLeft + 'px';
  ind.style.width = btn.offsetWidth + 'px';
  ind.style.background = btn.style.getPropertyValue('--c') || LVLC[1];
}
/* Single-line rating: label left, 1-5 pills right, hint as hover tooltip. */
function rateLine(k, prof){
  var f = fieldDef(k), v = prof[f.k] || '';
  var h = '<div class="rrow"><span class="rlab"' + (f.hint ? ' title="' + esc(f.hint) + '"' : '') + '>' +
    esc(f.label) + '</span><div class="dots sm" data-pk="' + f.k + '" data-v="' + esc(v) + '">';
  for(var i = 1; i <= 5; i++)
    h += '<span class="pdot' + (String(v) === String(i) ? ' on' : '') + '" data-v="' + i + '">' + i + '</span>';
  return h + '</div></div>';
}
function idrow(k, label, val){
  return '<div class="irow"><span class="ilab">' + esc(label) + '</span>' +
    '<input data-pk="' + k + '" value="' + esc(val) + '" placeholder="—" autocomplete="off"></div>';
}
/* Public footprint: prose paragraphs + sources shortened to clickable site names. */
function footprintHTML(e){
  var fp = e.public_footprint;
  if(!fp) return '<div class="fpbox"><p class="body dim">No public footprint on file.</p></div>';
  var parts = String(fp).split(/\n*Sources:\s*/);
  var prose = parts[0].trim().split(/\n+/).map(function(p){
    return '<p>' + esc(p) + '</p>';
  }).join('');
  var links = '';
  if(parts[1]){
    links = parts[1].split(/;\s*/).map(function(u){
      u = String(u).trim(); if(!u) return '';
      var host = u.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      return '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(host) + '</a>';
    }).join('');
  }
  return '<div class="fpbox">' + prose +
    (links ? '<div class="fpsrc"><span>Sources</span>' + links + '</div>' : '') + '</div>';
}
/* ---------- three-level views ---------- */
var L1_SCORES = ['charisma','competence','intellect','creativity','reliability','reputation','assertiveness','ego'];
var EVTC = { milestone:'#e8b34b', note:'#6fd3e7', 'life event':'#e0685c' };
function evDate(d){
  var m = String(d || '').match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/);
  if(!m) return esc(String(d || ''));
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var mi = parseInt(m[2] || '1', 10) - 1;
  if(m[3]) return esc(MON[mi] + ' ' + parseInt(m[3], 10) + ', ' + m[1]);
  if(m[2]) return esc(MON[mi] + ' ' + m[1]);
  return esc(m[1]);
}
function sortedEvents(e){
  return (e.events || []).slice().sort(function(a, b){
    var x = String(a.date || ''), y = String(b.date || '');
    return x < y ? 1 : (x > y ? -1 : 0);
  });
}
/* L1 — Snapshot: facts about the person alone. Nothing about JD. */
function lvl1View(e){
  var prof = e.profile || {}, c = e.contact || {};
  var phones = prof.phone || (c.phones || []).join(', ');
  var emails = prof.email || (c.emails || []).join(', ');
  var idrows = '';
  if(phones) idrows += '<div class="idrow"><span class="idic">' + ic('phone', 15) + '</span><div><span>Phone</span><b>' +
    esc(String(phones).split(',').map(function(x){ return fmtPhone(x); }).join(', ')) + '</b></div></div>';
  if(emails) idrows += '<div class="idrow"><span class="idic">' + ic('mail', 15) + '</span><div><span>Email</span><b>' + esc(emails) + '</b></div></div>';
  if(e.detail) idrows += '<div class="idrow"><span class="idic">' + ic('file', 15) + '</span><div><span>On file</span><b>' + esc(e.detail) + '</b></div></div>';
  var traits = L1_SCORES.map(function(k){
    var f = fieldDef(k), v = parseInt(prof[k] || '0', 10) || 0;
    return '<div class="trait' + (v ? '' : ' empty') + '"><div class="t-top"><span>' + esc(f.label) + '</span><b>' +
      (v ? v + '<i>/5</i>' : '—') + '</b></div>' +
      '<div class="t-bar"><i style="width:' + (v * 20) + '%"></i></div></div>';
  }).join('');
  var spec = '';
  if(prof.specialty) spec += '<div class="idrow"><span class="idic">' + ic('zap', 15) + '</span><div><span>Specialty</span><b>' + esc(prof.specialty) + '</b></div></div>';
  if(prof.interests) spec += '<div class="idrow"><span class="idic">' + ic('tag', 15) + '</span><div><span>Interests</span><b>' + esc(prof.interests) + '</b></div></div>';
  var score100 = '';
  if(prof.enriched_value){
    var m = String(prof.enriched_value).match(/^(\d{1,3})\s*[—–-]/);
    if(m) score100 = statTile('star', m[1] + '/100', 'ai score', '#e8b34b');
  }
  var orgs = '';
  ['churches','companies','universities'].forEach(function(k){
    tagList(prof[k]).forEach(function(v){ orgs += '<span class="vchip">' + ic('briefcase', 12) + esc(v) + '</span>'; });
  });
  return '<div class="dsec">' + secHead('user', 'Snapshot', 'facts only', LVLC[1]) +
    (idrows ? '<div class="idcard">' + idrows + '</div>' : '') +
    '<div class="traitgrid">' + traits + '</div>' +
    (spec ? '<div class="idcard">' + spec + '</div>' : '') +
    (score100 ? '<div class="ph-tiles solo">' + score100 + '</div>' : '') +
    (orgs ? '<div class="vchips">' + orgs + '</div>' : '') +
    '</div>' +
    '<div class="dsec fpsec">' + secHead('link', 'Public footprint', '', '#6fd3e7') + footprintHTML(e) + '</div>';
}
function connRows(e){
  var prof = e.profile || {}, fdb = e.friendsdb || {};
  var h = '';
  var rel = [prof.relationship, prof.context].filter(Boolean).join(' · ');
  if(rel) h += '<div class="kvrow"><span>Relationship</span><b>' + esc(rel) + '</b></div>';
  if(prof.closeness) h += '<div class="kvrow"><span>Closeness</span><b>' + esc(prof.closeness) + ' / 5</b></div>';
  if(fdb.standing) h += '<div class="kvrow"><span>Standing</span><b>' + esc(fdb.standing) + '</b></div>';
  if(fdb.state) h += '<div class="kvrow"><span>State</span><b>' + esc(fdb.state) + '</b></div>';
  if(fdb.trajectory) h += '<div class="kvrow"><span>Trajectory</span><b>' + esc(fdb.trajectory) + '</b></div>';
  if(fdb.years_known) h += '<div class="kvrow"><span>Known</span><b>' + esc(fdb.years_known) + ' yrs</b></div>';
  if(e.relation) h += '<div class="kvrow"><span>Relation</span><b>' + esc(e.relation) + '</b></div>';
  h += '<div class="kvrow"><span>Graph connections</span><b>' + e.degree + '</b></div>';
  h += '<div class="kvrow"><span>Shared with you</span><b>' + e.shared_with_jd + '</b></div>';
  return h;
}
function nbrChipsHTML(e){
  var nbrs = (e.neighbors || []).slice(0, 12);
  return nbrs.length ? nbrs.map(function(nb){
    return '<span class="nchip" data-nx="' + esc(nb.u) + '">' + esc(nb.d || nb.u) +
      '<b class="nx" data-rmnx="' + esc(nb.u) + '" title="Remove close connection">×</b></span>';
  }).join('') : '<p class="body dim">No close connections mapped.</p>';
}
function timelineHTML(e, editable){
  var evs = sortedEvents(e);
  var h = '<div class="tl">';
  if(!evs.length) h += '<p class="body dim">No timeline events yet.</p>';
  evs.forEach(function(ev){
    var t = ev.type || 'note';
    var col = EVTC[t] || '#9aa3b2';
    h += '<div class="ev"><span class="evdot" style="background:' + col + '"></span>' +
      '<div class="evdate">' + evDate(ev.date) + '<span class="evtype">' + esc(t) + '</span></div>' +
      '<div class="evtitle">' + esc(ev.summary || '') + '</div>' +
      (ev.detail ? '<div class="evdetail">' + esc(ev.detail) + '</div>' : '') + '</div>';
  });
  h += '</div>';
  if(!editable) h += '<div class="arow"><button id="paddevent2" class="xbtn acc">Add event</button></div>';
  return h;
}
/* L2 — Story: the connection to JD + narrative + timeline. */
function lvl2View(e){
  var prof = e.profile || {}, fdb = e.friendsdb || {};
  var narr = prof.enriched_value
    ? esc(String(prof.enriched_value).replace(/^\d{1,3}\s*[—–-]\s*/, ''))
    : 'No story written yet.';
  var rel = [prof.relationship, prof.context].filter(Boolean).join(' · ');
  var tiles = statTile('activity', fdb.state || '—', 'state', '#8fa8d8') +
    statTile('trend', fdb.trajectory || '—', 'trajectory', '#6fd3e7') +
    statTile('send', String(e.shared_with_jd || 0), 'shared with you', '#6fd08c');
  var notes = prof.notes
    ? secHead('file', 'Reference notes', '', '#9aa3b2') + '<div class="narr-card">' +
      esc(prof.notes).replace(/\n/g, '<br>') + '</div>' : '';
  var assessBtn = assessOn()
    ? '<div class="genrow"><button id="enrichbtn" class="xbtn acc">' + ic('zap', 13) + ' Generate assessment</button>' +
      ((prof.enriched === '1' || prof.enriched === 1)
        ? '<span class="calcnote">generated' + (prof.enriched_at ? ' · ' + esc(prof.enriched_at) : '') + '</span>'
        : '<span class="calcnote dim">not generated</span>') + '</div>'
    : '';
  return '<div class="dsec">' + secHead('book', 'Story', 'connection + history', LVLC[2]) +
    (rel ? '<div class="rel-line">' + ic('users', 15) + '<span>' + esc(rel) + '</span></div>' : '') +
    '<div class="ph-tiles trio">' + tiles + '</div></div>' +
    '<div class="dsec">' + secHead('quote', 'Narrative', '', '#e8b34b') +
    '<div class="narr-card">' + narr + '</div>' + assessBtn + '</div>' +
    '<div class="dsec">' + secHead('users', 'Close connections', '', '#8fa8d8') +
    '<div class="nchips">' + nbrChipsHTML(e) + '</div>' +
    '<div class="naddwrap"><input id="naddinput" placeholder="Add a close connection — type a name…" autocomplete="off"><div id="naddlist"></div></div></div>' +
    '<div class="dsec">' + secHead('calendar', 'Timeline', (e.events || []).length + ' events', LVLC[2]) + timelineHTML(e, false) + '</div>' + notes;
}
function filesHTML(e){
  var fs = e.files || [];
  var h = '';
  if(!fs.length) h = '<div class="empty-card">' + ic('folder', 20) + '<p>No files attached yet.</p><span>Attach the documents that need more room than the timeline.</span></div>';
  fs.forEach(function(f){
    var isDoc = (f.kind === 'gdoc');
    h += '<div class="file"><div class="fic' + (isDoc ? ' doc' : '') + '">' + ic(isDoc ? 'file' : 'link', 17) + '</div>' +
      '<div class="fbody"><div class="fn">' + esc(f.name || 'Untitled') + '</div>' +
      (f.note ? '<div class="fm">' + esc(f.note) + '</div>' : '') +
      '<div class="fm dim">' + (isDoc ? 'Google Doc' : 'Link') + '</div></div>' +
      (f.url ? '<a class="open" href="' + esc(f.url) + '" target="_blank" rel="noopener">Open ' + ic('send', 12) + '</a>' : '') + '</div>';
  });
  return h;
}
/* L3 — Files: attached documents. */
function lvl3View(e){
  return '<div class="dsec">' + secHead('folder', 'Files', 'attached documents', LVLC[3]) +
    filesHTML(e) +
    '<div class="arow"><button id="pnewdoc" class="xbtn acc">' + ic('plus', 13) + ' New Drive doc</button>' +
    '<button id="pattachfile" class="xbtn">' + ic('link', 13) + ' Attach existing</button></div></div>';
}
/* View mode: level pill + one scrolling stage holding all three levels. */
function dossierView(e){
  var lv = S.lvl || 1;
  return '<div class="doc">' + phead(e) +
    '<div class="lvstage">' +
    '<div class="lvl' + (lv === 1 ? ' on' : '') + '">' + lvl1View(e) + '</div>' +
    '<div class="lvl' + (lv === 2 ? ' on' : '') + '">' + lvl2View(e) + '</div>' +
    '<div class="lvl' + (lv === 3 ? ' on' : '') + '">' + lvl3View(e) + '</div>' +
    '</div></div>';
}
/* Edit mode: level pill switches which fields show; all levels stay in the DOM so saves collect everything. */
function dossierEdit(e){
  var prof = e.profile || {};
  var c = e.contact || {};
  var lv = S.lvl || 1;
  var tagRows = ORG_CATS.map(function(cat){ return tagPicker(cat, prof); }).join('');
  var narrVal = prof.enriched_value ? String(prof.enriched_value).replace(/^\d{1,3}\s*[—–-]\s*/, '') : '';
  var relF = PROFILE_FIELDS[0], ctxF = PROFILE_FIELDS[1], spF = PROFILE_FIELDS[3], intF = PROFILE_FIELDS[4];
  var g1 = ['charisma', 'competence', 'intellect', 'creativity'].map(function(k){ return rateLine(k, prof); }).join('');
  var g2 = ['reliability', 'reputation', 'assertiveness', 'ego'].map(function(k){ return rateLine(k, prof); }).join('');
  /* L1 edit: identity, specialty/interests, the 8, orgs */
  var l1 = '<div class="dsec"><h3><span class="n">L1</span> Snapshot — facts</h3><div class="pform">' +
    idrow('display_name', 'Name', prof.display_name || e.display || '') +
    idrow('phone', 'Phone', prof.phone || (c.phones || []).join(', ')) +
    idrow('email', 'Email', prof.email || (c.emails || []).join(', ')) +
    profRow(spF, prof) + profRow(intF, prof) +
    '</div><div class="rgroups"><div>' + g1 + '</div><div>' + g2 + '</div></div></div>' +
    '<div class="dsec"><h3><span class="n">◈</span> Organizations</h3>' + tagRows + '</div>';
  /* L2 edit: connection fields, narrative, timeline, close connections, notes */
  var evRows = (e.events || []).length ? (e.events || []).map(function(ev, i){
    return '<div class="evrow"><div><div class="evdate">' + evDate(ev.date) +
      '<span class="evtype">' + esc(ev.type || 'note') + '</span></div>' +
      '<div class="evtitle">' + esc(ev.summary || '') + '</div>' +
      (ev.detail ? '<div class="evdetail">' + esc(ev.detail) + '</div>' : '') + '</div>' +
      '<button class="xbtn danger evdel" data-evi="' + i + '">Remove</button></div>';
  }).join('') : '<p class="body dim">No events yet.</p>';
  var l2 = '<div class="dsec"><h3><span class="n">L2</span> Story — connection</h3><div class="pform">' +
    profRow(relF, prof) + profRow(ctxF, prof) + rateLine('closeness', prof) + '</div></div>' +
    '<div class="dsec"><h3><span class="n">◈</span> Narrative</h3>' +
    '<textarea id="narrtext" data-pk="enriched_value" rows="4" placeholder="Write the narrative here.">' + esc(narrVal) + '</textarea>' +
    (assessOn() ? '<div class="genrow"><button id="enrichbtn" class="xbtn acc">' + ic('zap', 13) + ' Generate assessment</button><span id="enrmsg"></span></div>' : '') + '</div>' +
    '<div class="dsec"><h3><span class="n">◈</span> Timeline</h3>' + evRows +
    '<div class="arow"><button id="paddevent" class="xbtn acc">Add event</button></div></div>' +
    '<div class="dsec"><h3><span class="n">◈</span> Close connections</h3><div class="nchips">' + nbrChipsHTML(e) + '</div>' +
    '<div class="naddwrap"><input id="naddinput" placeholder="Add a close connection — type a name…" autocomplete="off"><div id="naddlist"></div></div></div>' +
    '<div class="dsec notesec"><h3><span class="n">◈</span> Reference notes</h3>' +
    '<textarea id="refnotes" data-pk="notes" placeholder="Field notes — private reference material.">' + esc(prof.notes || '') + '</textarea></div>';
  /* L3 edit: files */
  var fRows = (e.files || []).length ? (e.files || []).map(function(f, i){
    return '<div class="evrow"><div class="fic' + (f.kind === 'gdoc' ? ' doc' : '') + '">' + (f.kind === 'gdoc' ? 'G' : '↗') + '</div>' +
      '<div><div class="evtitle">' + esc(f.name || 'Untitled') + '</div>' +
      (f.url ? '<div class="evdetail">' + esc(f.url) + '</div>' : '') + '</div>' +
      '<button class="xbtn danger fdel" data-fi="' + i + '">Remove</button></div>';
  }).join('') : '<p class="body dim">No files attached.</p>';
  var l3 = '<div class="dsec"><h3><span class="n">L3</span> Files — attached documents</h3>' + fRows +
    '<div class="arow"><button id="pnewdoc" class="xbtn acc">New Drive doc</button>' +
    '<button id="pattachfile" class="xbtn">Attach existing</button></div></div>';
  return '<div class="doc edit">' + phead(e) +
    '<div class="qfill"><input id="pfree" placeholder="Describe them in your own words — e.g. “friend from church, closeness 4, really charismatic…”" autocomplete="off">' +
    '<button id="pfill" class="xbtn acc">Fill the 15</button><span id="pfillmsg"></span></div>' +
    '<div class="lvstage">' +
    '<div class="lvl' + (lv === 1 ? ' on' : '') + '">' + l1 + '</div>' +
    '<div class="lvl' + (lv === 2 ? ' on' : '') + '">' + l2 + '</div>' +
    '<div class="lvl' + (lv === 3 ? ' on' : '') + '">' + l3 + '</div>' +
    '</div>' +
    '<div class="efoot"><span id="savestate" class="savestate"></span><span class="esp"></span>' +
    '<button id="psave" class="xbtn acc" disabled>Save</button><button id="pdone" class="xbtn">Cancel</button></div>' +
    '</div>';
}
function dossierDir(e, idx){
  return S.editing ? dossierEdit(e) : dossierView(e);
}
function reviewBadge(e){
  var f = (e.profile || {}).review_flag;
  if(!f) return '';
  var label = f === 'duplicate' ? 'possible duplicate' : (f === 'missing_info' ? 'missing info' : f);
  return ' <span class="revbadge" title="Flagged for review: ' + esc(label) + '">needs review</span>';
}
/* ---------- hub-spoke layout (deterministic) ---------- */
function buildNodes(){
  var dir = D.directory;
  var maxS = 1;
  dir.forEach(function(r){ if(r.strength > maxS) maxS = r.strength; });
  ORDER = dir.map(function(r,i){ return i; })
    .filter(function(i){ return dir[i].has_graph !== false; })
    .sort(function(a,b){ return dir[b].strength - dir[a].strength || a - b; });
  /* Directory list also shows off-graph people who have dossier content
     (subject file, timeline events, or attached files) so L2/L3 is reachable. */
  LIST_ORDER = dir.map(function(r,i){ return i; })
    .filter(function(i){
      var r = dir[i];
      return r.has_graph !== false || (r.events || []).length ||
        (r.files || []).length || !!r.record;
    })
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
  addEventListener('resize', function(){ hubResize(); if(S.mode === '3d') glRecenter(); });
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
  return LIST_ORDER.filter(function(di){
    var r = D.directory[di];
    var pr = r.profile || {};
    if(pr.deleted === '1') return false;
    if(onlyNeeds && pr.audit === 'audited') return false;
    if(S.tag && tagList(pr[S.tag.k]).indexOf(S.tag.v) < 0) return false;
    if(S.rel && r.relation !== S.rel) return false;
    if(!q) return true;
    return ((r.display||r.name)+' @'+r.name).toLowerCase().indexOf(q) >= 0;
  });
}
function renderList(){
  var rows = listRows();
  $('#lcount').textContent = rows.length===LIST_ORDER.length
    ? LIST_ORDER.length+' names'
    : rows.length+' of '+LIST_ORDER.length+' names';
  var body = $('#leftbody');
  body.innerHTML = rows.length ? rows.slice(0,400).map(function(di,i){
    var r = D.directory[di];
    var t = r.display || r.name;
    var aud = (r.profile || {}).audit === 'audited';
    var lv = personLevel(r);
    var sub2 = r.src === 'contacts' ? 'phone contact' : '@'+esc(r.name)+(r.relation ? ' · '+esc(r.relation) : '');
    return '<div class="row'+(S.sel===di?' sel':'')+'" data-i="'+di+'"'+
      ' style="animation-delay:'+Math.min(i*8,240)+'ms" role="button" tabindex="0">'+
      '<div class="ring '+esc(r.relation||'')+'">'+esc(initial(t))+'</div>'+
      '<div class="nm"><b>'+esc(t)+'</b><span>'+sub2+'</span></div>'+
      '<span class="lvdot lv'+lv+'" title="Level '+lv+' — '+LVLN[lv]+'"></span>'+
      '<span class="adot '+(aud?'ok':'needs')+'" title="'+(aud?'audited':'needs audit')+'"></span></div>';
  }).join('') + (rows.length>400 ? '<div class="empty-note">Showing first 400 — refine the search.</div>' : '')
    : '<div class="empty-note">No names match.</div>';
}

/* ---------- dossier panel ---------- */
function renderProfile(){
  var body = $('#rightbody'), panel = $('#right');
  if(S.sel === null){
    panel.classList.remove('open');
    panel.classList.remove('editing');
    document.body.classList.remove('panelopen');
    document.body.classList.remove('editing-drawer');
    body.innerHTML = '';
    if(S.mode === '3d'){ setTimeout(glRecenter, 60); setTimeout(function(){ glResize(); glRecenter(); }, 480); }
    else { setTimeout(function(){ if(hub.cv) hubResize(); }, 480); }
    return;
  }
  panel.classList.add('open');
  document.body.classList.add('panelopen');
  var isEditing = !!S.editing;
  panel.classList.toggle('editing', isEditing);
  document.body.classList.toggle('editing-drawer', isEditing);
  body.innerHTML = dossierDir(D.directory[S.sel], S.sel);
  body.scrollTop = 0;
  positionLvlInd();
  setTimeout(positionLvlInd, 350);
  if(S.mode === '3d'){ setTimeout(glRecenter, 60); setTimeout(function(){ glResize(); glRecenter(); }, 480); }
  else { setTimeout(function(){ if(hub.cv) hubResize(); }, 480); }
}

/* ---------- selection ---------- */
function selectDir(idx, on){
  if(S.saveTimer && S.sel !== null && S.sel !== idx){
    clearTimeout(S.saveTimer); S.saveTimer = null; saveProfile(true, S.sel);
  }
  S.editing = false;
  S.lvl = 1;
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
  var tgp = $('#tagpill');
  if(tgp) tgp.addEventListener('click', function(){ S.tag = null; renderList(); updateTagPill(); });
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
    if(e.target.closest('#pedit')){ S.editing = true; renderProfile(); positionLvlInd(); return; }
    var lb = e.target.closest('.lvlbtn');
    if(lb){ S.lvl = parseInt(lb.getAttribute('data-lvl'), 10) || 1; renderProfile(); positionLvlInd(); return; }
    if(e.target.closest('#paddnote') || e.target.closest('#paddevent') || e.target.closest('#paddevent2')){ openEventComposer(); return; }
    if(e.target.closest('#pnewdoc')){ openDocComposer(); return; }
    if(e.target.closest('#pattachfile')){ openFileComposer(); return; }
    var evd = e.target.closest('.evdel');
    if(evd){ delEvent(parseInt(evd.getAttribute('data-evi'), 10)); return; }
    var fd = e.target.closest('.fdel');
    if(fd){ delFile(parseInt(fd.getAttribute('data-fi'), 10)); return; }
    if(e.target.closest('#pdone')){
      if(S.saveTimer){ clearTimeout(S.saveTimer); S.saveTimer = null; saveProfile(true, S.sel); }
      S.editing = false; renderProfile(); return;
    }
    if(e.target.closest('#psave')){ saveProfile(false); return; }
    if(e.target.closest('#paudit')){ toggleAudit(); return; }
    if(e.target.closest('#enrichbtn')){ if(!S.editing){ S.editing = true; S.lvl = 2; renderProfile(); positionLvlInd(); var nt = document.querySelector('#narrtext'); if(nt){ nt.focus(); } var m2 = document.querySelector('#enrmsg'); if(m2) m2.textContent = 'Write your draft above, then Generate.'; } else { runEnrich(); } return; }
    if(e.target.closest('#auditbadge')){ toggleAudit(); return; }
    if(e.target.closest('#pfill')){ fillFromText(); return; }
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
    var rmx = e.target.closest('[data-rmnx]');
    if(rmx){ removeClose(D.directory[S.sel], rmx.getAttribute('data-rmnx')); return; }
    var ah = e.target.closest('.naddhit');
    if(ah && ah.getAttribute('data-ai')){
      addClose(D.directory[S.sel], parseInt(ah.getAttribute('data-ai'), 10));
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
    var tc = e.target.closest('.tchip');
    if(tc){
      tc.classList.toggle('on');
      syncTagHidden(tc.closest('.tcat'));
      markDirty();
      return;
    }
    var og = e.target.closest('.otag');
    if(og){
      S.tag = { k: og.getAttribute('data-tagk'), v: og.getAttribute('data-tagv') };
      renderList(); updateTagPill();
      return;
    }
    if(e.target.closest('#pexport')){ exportDossier(); return; }
    if(e.target.closest('#pdelete')){ deletePerson(); return; }
  });
  $('#rightbody').addEventListener('keydown', function(e){
    if(e.target.classList && e.target.classList.contains('tadd') && e.key === 'Enter'){
      e.preventDefault();
      var v = e.target.value.trim();
      if(!v) return;
      var chips = e.target.parentNode;
      var dup = false;
      chips.querySelectorAll('.tchip').forEach(function(c){
        if(c.getAttribute('data-tv').toLowerCase() === v.toLowerCase()){ c.classList.add('on'); dup = true; }
      });
      if(!dup){
        var sp = document.createElement('span');
        sp.className = 'tchip on'; sp.setAttribute('data-tv', v); sp.textContent = v;
        chips.insertBefore(sp, e.target);
      }
      e.target.value = '';
      syncTagHidden(chips.closest('.tcat'));
      markDirty();
    }
  });
  $('#rightbody').addEventListener('input', function(e){
    if(e.target.closest('[data-pk]')) markDirty();
    if(e.target.id === 'naddinput') renderNadd(e.target.value);
  });
  document.addEventListener('keydown', function(e){
    if(e.key==='Escape' && document.querySelector('#noteoverlay')){ closeNoteComposer(); return; }
    if(e.key==='Escape' && S.sel !== null){
      if(S.saveTimer){ clearTimeout(S.saveTimer); S.saveTimer = null; saveProfile(true, S.sel); }
      S.sel = null; S.editing = false; renderProfile(); renderList();
    }
  });
  // three-dot menu: click toggles, click elsewhere closes
  document.addEventListener('click', function(e){
    var m = e.target.closest ? e.target.closest('.dmenu') : null;
    document.querySelectorAll('.dmenu.open').forEach(function(x){ if(x !== m) x.classList.remove('open'); });
    if(m && e.target.closest('.dbtn')) m.classList.toggle('open');
  });
}

/* ---------- 15-point profile: save, audit, enrich (via the sheet web app) ---------- */
var WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwZli1Dv07iWBpR3Oz4jD4imtNLN845jFDBnXIbtmT3sPGExsMlKFMQwt42FmrUdFBD/exec'; // set to the Apps Script web app /exec URL after deploying Code.gs

function getPw(){ return ''; }
function setSaveState(t, cls){
  var el = document.querySelector('#savestate');
  if(!el) return;
  el.textContent = t || '';
  el.className = 'savestate' + (cls ? ' ' + cls : '');
}
function markDirty(){
  var b = document.querySelector('#psave');
  if(b) b.disabled = false;
  setSaveState('Unsaved changes', 'dim');
  clearTimeout(S.saveTimer);
  var idx = S.sel;
  S.saveTimer = setTimeout(function(){ S.saveTimer = null; saveProfile(true, idx); }, 2500);
}
function collectProfile(e){
  var prof = e.profile || {}, changed = {};
  document.querySelectorAll('#rightbody [data-pk]').forEach(function(inp){
    var k = inp.getAttribute('data-pk'), nv;
    if(k === 'phone' && inp.value !== undefined) inp.value = String(inp.value).split(',').map(function(x){ return fmtPhone(x); }).join(', ');
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
  if(changed.display_name) e.display = changed.display_name;
}
function saveProfile(auto, idx){
  if(idx === undefined || idx === null) idx = S.sel;
  var e = D.directory[idx];
  if(!e) return;
  if(!WEBAPP_URL){ if(!auto) toast('Editing is not configured yet — the web app URL is missing.'); return; }
  var changed = collectProfile(e);
  if(!Object.keys(changed).length){ if(!auto) toast('No changes.'); setSaveState('All changes saved'); return; }
  applyProfileEdit(e, changed);
  renderList(); updateAuditPill();
  var btn = document.querySelector('#psave');
  if(btn) btn.disabled = true;
  setSaveState('Saving…');
  clearTimeout(S.saveTimer); S.saveTimer = null;
  postKind('profile', pkey(e), changed, getPw(), function(){
    setSaveState('All changes saved');
    if(!auto) toast('Saved.');
  }, function(err){
    setSaveState('Could not save — will retry', 'err');
    if(btn) btn.disabled = false;
    if(!auto) toast(err + ' — kept locally, hit Save again to retry.');
    clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(function(){ S.saveTimer = null; saveProfile(true, idx); }, 8000);
  });
}
function renderNadd(q){
  var list = document.querySelector('#naddlist');
  if(!list) return;
  q = (q || '').trim().toLowerCase();
  var e = D.directory[S.sel];
  var existing = {};
  (e.neighbors || []).forEach(function(n){ existing[(n.u || '').toLowerCase()] = 1; });
  if(!q || q.length < 2){ list.innerHTML = ''; return; }
  var hits = [];
  D.directory.forEach(function(r, i){
    if(i === S.sel || (r.profile || {}).deleted === '1') return;
    var key = (r.name || '').toLowerCase();
    if(existing[key]) return;
    var label = r.display || r.name || '';
    if((label + ' ' + (r.name || '')).toLowerCase().indexOf(q) < 0) return;
    hits.push({ i: i, label: label });
  });
  list.innerHTML = hits.length
    ? hits.slice(0, 6).map(function(h){
        return '<div class="naddhit" data-ai="' + h.i + '">' + esc(h.label) + '</div>';
      }).join('')
    : '<div class="naddhit none">No matches</div>';
}
function saveCloseLists(e){
  var prof = e.profile || {};
  postKind('profile', pkey(e), {
    close_add: prof.close_add || '', close_hide: prof.close_hide || ''
  }, getPw(), function(){ toast('Close connections updated.'); },
  function(err){ toast(err + ' — kept locally, reopen to retry.'); });
}
function addClose(e, idx){
  var t = D.directory[idx];
  if(!e || !t || !WEBAPP_URL) return;
  var prof = e.profile = e.profile || {};
  var key = t.name || '', kl = key.toLowerCase();
  var adds = tagList(prof.close_add);
  if(adds.map(function(x){ return x.toLowerCase(); }).indexOf(kl) < 0) adds.push(key);
  prof.close_add = adds.join(', ');
  prof.close_hide = tagList(prof.close_hide).filter(function(x){ return x.toLowerCase() !== kl; }).join(', ');
  e.neighbors = e.neighbors || [];
  if(!e.neighbors.some(function(n){ return (n.u || '').toLowerCase() === kl; }))
    e.neighbors.push({ u: key, d: t.display || t.name });
  saveCloseLists(e);
  renderProfile();
}
function removeClose(e, u){
  if(!e || !u || !WEBAPP_URL) return;
  var kl = (u || '').toLowerCase();
  var prof = e.profile = e.profile || {};
  var adds = tagList(prof.close_add);
  if(adds.map(function(x){ return x.toLowerCase(); }).indexOf(kl) >= 0){
    prof.close_add = adds.filter(function(x){ return x.toLowerCase() !== kl; }).join(', ');
  } else {
    var hides = tagList(prof.close_hide);
    if(hides.map(function(x){ return x.toLowerCase(); }).indexOf(kl) < 0) hides.push(u);
    prof.close_hide = hides.join(', ');
  }
  e.neighbors = (e.neighbors || []).filter(function(n){ return (n.u || '').toLowerCase() !== kl; });
  saveCloseLists(e);
  renderProfile();
}
function deletePerson(){
  var e = D.directory[S.sel];
  if(!e || !WEBAPP_URL){ toast('Nothing to delete.'); return; }
  var label = e.display || e.name;
  if(!confirm('Delete ' + label + ' from the circle?\n\nThey will be hidden from the directory and the 3D view. Undo it anytime by clearing the flag in the sheet.')) return;
  postKind('profile', pkey(e), { deleted: '1' }, getPw(), function(){
    e.profile = e.profile || {}; e.profile.deleted = '1';
    S.sel = null; S.editing = false;
    renderProfile(); renderList(); updateAuditPill();
    toast('Deleted ' + label + '.');
  }, function(err){ toast(err + ' — not deleted, try again.'); });
}
function updateTagPill(){
  var pill = $('#tagpill');
  if(!pill) return;
  if(S.tag){ pill.hidden = false; pill.querySelector('span').textContent = S.tag.v; }
  else pill.hidden = true;
}
function toggleAudit(){
  var e = D.directory[S.sel];
  if(!WEBAPP_URL){ toast('Editing is not configured yet — the web app URL is missing.'); return; }
  var pw = getPw();
  var next = ((e.profile || {}).audit === 'audited') ? 'needs_audit' : 'audited';
  e.profile = e.profile || {}; e.profile.audit = next;
  renderProfile(); renderList(); updateAuditPill();
  postKind('profile', pkey(e), { audit: next }, pw, function(){
    toast(next === 'audited' ? 'Marked audited.' : 'Back to needs audit.');
  }, function(err){ toast(err + ' — tap again to retry.'); });
}
function fillFromText(){
  var ta = document.querySelector('#pfree'), msg = document.querySelector('#pfillmsg');
  var text = ta ? ta.value.trim() : '';
  if(!text){ msg.textContent = 'Describe the person first.'; return; }
  if(!WEBAPP_URL){ msg.textContent = 'Web app URL is not configured yet.'; return; }
  var btn = document.querySelector('#pfill');
  btn.disabled = true; btn.textContent = 'Parsing…'; msg.textContent = '';
  fetch(WEBAPP_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify({ password:getPw(), kind:'parseprofile', id:'parse', patch:{text:text} }) })
    .then(function(r){ return r.json(); }).then(function(res){
      btn.disabled = false; btn.textContent = 'Fill the 15';
      if(res && res.ok && res.fields){ applyParsed(res.fields, msg); }
      else { msg.textContent = 'Parse failed: ' + ((res && res.error) || 'unknown'); }
    }).catch(function(){ btn.disabled = false; btn.textContent = 'Fill the 15'; msg.textContent = 'Network error.'; });
}
function applyParsed(fields, msg){
  var n = 0;
  Object.keys(fields).forEach(function(k){
    var v = fields[k];
    if(v === '' || v === null || v === undefined) return;
    var el = document.querySelector('#rightbody [data-pk="' + k + '"]');
    if(!el) return;
    if(el.classList && el.classList.contains('dots')){
      v = String(parseInt(v, 10) || '');
      if(v < '1' || v > '5') return;
      el.setAttribute('data-v', v);
      el.querySelectorAll('.pdot').forEach(function(d){
        d.classList.toggle('on', d.getAttribute('data-v') === v);
      });
      n++;
    } else if(el.tagName === 'SELECT'){
      var ok = Array.prototype.some.call(el.options, function(o){ return o.value === String(v).toLowerCase(); });
      if(ok){ el.value = String(v).toLowerCase(); n++; }
    } else if(el.type === 'hidden' && (k === 'churches' || k === 'companies' || k === 'universities')){
      el.value = String(v); refreshTagCat(k); n++;
    } else {
      el.value = String(v); n++;
    }
  });
  if(n){ markDirty(); msg.textContent = 'Filled ' + n + ' field' + (n === 1 ? '' : 's') + ' — review, then Save.'; }
  else { msg.textContent = 'Nothing recognizable — try simpler wording.'; }
}
function runEnrich(){
  var e = D.directory[S.sel];
  if(!WEBAPP_URL){ toast('Editing is not configured yet — the web app URL is missing.'); return; }
  var btn = document.querySelector('#enrichbtn'), msg = document.querySelector('#enrmsg');
  var ta = document.querySelector('#narrtext');
  var draft = (ta && ta.value.trim()) || '';
  if(!draft){ msg.textContent = 'Write your draft bio first — Generate will clean it up.'; return; }
  btn.disabled = true; btn.textContent = 'Cleaning up…'; msg.textContent = '';
  postKind('enrich', pkey(e), { draft: draft }, getPw(), function(res){
    e.profile = e.profile || {};
    e.profile.enriched = '1'; e.profile.enriched_value = res.value; e.profile.enriched_at = res.at;
    renderProfile();
    toast('Bio cleaned up.');
  }, function(err){
    msg.textContent = err; btn.disabled = false; btn.textContent = 'Generate bio';
  });
}
function updateAuditPill(){
  var pill = document.querySelector('#auditpill');
  if(!pill) return;
  var done = D.directory.filter(function(r){ return (r.profile || {}).audit === 'audited'; }).length;
  pill.textContent = 'Audited ' + done + '/' + D.directory.length;
}

/* ---------- dossier export: FBI-form-style document -> Google Drive ---------- */
function dossierFileName(e){
  var base = String(e.display || e.name || 'person').replace(/[\\/:*?"<>|]/g, '').trim() || 'person';
  return 'Dossier - ' + base + '.html';
}
function buildDossierDoc(e){
  var prof = e.profile || {}, c = e.contact || {};
  var name = e.display || e.name || '';
  var handle = e.src === 'contacts' ? '' : '@' + (e.name || '');
  var aliases = [];
  if(prof.display_name && prof.display_name !== name) aliases.push(prof.display_name);
  if(e.name && e.display && e.name !== e.display) aliases.push('@' + e.name);
  var today = new Date();
  var ds = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  var bio = prof.enriched_value ? String(prof.enriched_value).replace(/^\d{1,3}\s*[—–-]\s*/, '') : '';
  var score = '';
  if(prof.enriched_value){
    var m = String(prof.enriched_value).match(/^(\d{1,3})\s*[—–-]/);
    if(m) score = m[1] + ' / 100';
  }
  var classif = [prof.relationship, prof.context].filter(Boolean).join(' · ');
  var orgs = [];
  ['churches', 'companies', 'universities'].forEach(function(k){
    tagList(prof[k]).forEach(function(v){ orgs.push(v); });
  });
  var ratings = SCORE_FIELDS.map(function(f){
    var v = prof[f.k];
    return '<tr><td>' + esc(f.label) + '</td><td>' + (v ? esc(v) + ' / 5' : '—') + '</td></tr>';
  }).join('');
  var extras = '';
  if(prof.specialty) extras += '<tr><td>Specialty</td><td>' + esc(prof.specialty) + '</td></tr>';
  if(prof.interests) extras += '<tr><td>Interests</td><td>' + esc(prof.interests) + '</td></tr>';
  if(score) extras += '<tr><td>Assessment score</td><td>' + esc(score) + '</td></tr>';
  var assoc = (e.neighbors || []).map(function(nb){ return '<li>' + esc(nb.d || nb.u) + '</li>'; }).join('');
  var dir = '';
  var phones = prof.phone || (c.phones || []).join(', ');
  if(phones) dir += '<div><b>Phone:</b> ' + esc(phones) + '</div>';
  var emails = prof.email || (c.emails || []).join(', ');
  if(emails) dir += '<div><b>Email:</b> ' + esc(emails) + '</div>';
  if(e.relation) dir += '<div><b>Relation:</b> ' + esc(e.relation) + '</div>';
  dir += '<div><b>Graph connections:</b> ' + e.degree + '</div>';
  dir += '<div><b>Shared with you:</b> ' + e.shared_with_jd + '</div>';
  if(e.detail) dir += '<div><b>On file:</b> ' + esc(e.detail) + '</div>';
  var notes = '';
  if(prof.notes) notes += '<p>' + esc(prof.notes).replace(/\n/g, '<br>') + '</p>';
  if(e.public_footprint) notes += '<p><b>Public footprint</b><br>' + esc(e.public_footprint).replace(/\n/g, '<br>') + '</p>';
  if(!notes) notes = '<p>—</p>';
  var evs = sortedEvents(e);
  var tl = evs.length
    ? '<ul class="assoc">' + evs.map(function(ev){
        return '<li><b>' + esc(ev.date || '') + '</b> [' + esc(ev.type || 'note') + '] — ' + esc(ev.summary || '') +
          (ev.detail ? '<br>' + esc(ev.detail) : '') + '</li>';
      }).join('') + '</ul>'
    : '<div class="sbody"><p>—</p></div>';
  var fls = (e.files || []).length
    ? '<ul class="assoc">' + (e.files || []).map(function(f){
        return '<li>' + esc(f.name || 'Untitled') + (f.url ? '<br>' + esc(f.url) : '') +
          (f.note ? '<br>' + esc(f.note) : '') + '</li>';
      }).join('') + '</ul>'
    : '<div class="sbody"><p>—</p></div>';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<title>Dossier — ' + esc(name) + '</title><style>' +
  'body{background:#26292f;margin:0;padding:28px;font-family:"Courier New",Courier,monospace;color:#141414}' +
  '.page{background:#f5f2e9;max-width:800px;margin:0 auto;padding:40px 44px;box-shadow:0 0 50px rgba(0,0,0,.55)}' +
  '.mast{display:flex;align-items:center;gap:18px;justify-content:center;margin-bottom:4px}' +
  '.seal{width:64px;height:64px;border:3px double #141414;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px}' +
  'h1{font-size:27px;letter-spacing:.3em;margin:0;font-weight:700}' +
  '.psub{text-align:center;letter-spacing:.5em;font-size:12px;margin:6px 0 18px;color:#333}' +
  '.frow{display:flex;justify-content:space-between;font-size:12px;margin-bottom:14px}' +
  'table.box{width:100%;border-collapse:collapse;border:2px solid #141414;margin-bottom:22px}' +
  'table.box th,table.box td{border:1px solid #141414;padding:8px 10px;font-size:12.5px;vertical-align:top;text-align:left}' +
  'table.box th{font-size:10.5px;letter-spacing:.12em;background:#ece7d8}' +
  '.redact{background:#141414;color:#141414;border-radius:2px;padding:0 10px;user-select:none}' +
  '.sec{margin:0 0 20px}.slabel{font-size:12px;letter-spacing:.14em;font-weight:700;margin-bottom:8px}' +
  '.sbody{font-size:13px;line-height:1.65}.sbody p{margin:0 0 10px}' +
  'table.rate{width:100%;border-collapse:collapse}table.rate td{border:1px solid #141414;padding:6px 10px;font-size:12.5px}' +
  'table.rate td:first-child{width:45%;background:#ece7d8;letter-spacing:.06em;font-size:11.5px}' +
  'ul.assoc{margin:0;padding-left:22px;font-size:13px;line-height:1.7}' +
  '.kv div{margin-bottom:4px;font-size:13px}' +
  '.foot{border-top:2px solid #141414;margin-top:26px;padding-top:10px;font-size:11px}' +
  '.foot .sig{font-family:"Segoe Script",cursive;font-size:22px;margin:6px 0}' +
  '.dnw{text-align:center;letter-spacing:.2em;font-size:10.5px;margin:14px 0 6px}' +
  'table.copies{width:100%;border-collapse:collapse;border:2px solid #141414}table.copies td{border:1px solid #141414;height:44px}' +
  '@media print{body{background:#fff;padding:0}.page{box-shadow:none;max-width:none}}' +
  '</style></head><body><div class="page">' +
  '<div class="mast"><div class="seal">◈</div><h1>NORTH COUNTRY CIRCLE</h1></div>' +
  '<div class="psub">PERSONAL DOSSIER</div>' +
  '<div class="frow"><span>FORM NO. NCC-01</span><span>FILE NO. <span class="redact">████████</span></span></div>' +
  '<table class="box">' +
  '<tr><th>REPORT MADE AT</th><th>DATE REPORT MADE</th><th>LAST ASSESSMENT</th><th>REPORT MADE BY</th></tr>' +
  '<tr><td>Potsdam, NY</td><td>' + ds + '</td><td>' + esc(prof.enriched_at || '—') + '</td><td><span class="redact">██████</span></td></tr>' +
  '<tr><th colspan="2">TITLE / DESCRIPTION AND ALL KNOWN ALIASES</th><th colspan="2">CLASSIFICATION</th></tr>' +
  '<tr><td colspan="2"><b>' + esc(name) + '</b>' +
  (aliases.length ? '<br>aka ' + esc(aliases.join(', ')) : '') +
  (handle ? '<br>' + esc(handle) : '') + '</td>' +
  '<td colspan="2">' + esc(classif || '—') +
  (orgs.length ? '<br>' + esc(orgs.join(' · ')) : '') + '</td></tr></table>' +
  '<div class="sec"><div class="slabel">SYNOPSIS OF FACTS:</div><div class="sbody">' +
  (bio ? '<p>' + esc(bio) + '</p>' : '<p>—</p>') + '</div></div>' +
  '<div class="sec"><div class="slabel">PROFILE RATINGS:</div><table class="rate">' + ratings + extras + '</table></div>' +
  '<div class="sec"><div class="slabel">KNOWN ASSOCIATES:</div>' +
  (assoc ? '<ul class="assoc">' + assoc + '</ul>' : '<div class="sbody"><p>—</p></div>') + '</div>' +
  '<div class="sec"><div class="slabel">DIRECTORY PARTICULARS:</div><div class="sbody kv">' + dir + '</div></div>' +
  '<div class="sec"><div class="slabel">FIELD NOTES:</div><div class="sbody">' + notes + '</div></div>' +
  '<div class="sec"><div class="slabel">TIMELINE:</div><div class="sbody">' + tl + '</div></div>' +
  '<div class="sec"><div class="slabel">ATTACHED FILES:</div><div class="sbody">' + fls + '</div></div>' +
  '<div class="foot"><div>APPROVED / FORWARDED BY</div><div class="sig">J. Meyers</div>' +
  '<div class="dnw">DO NOT WRITE IN THE BOXES BELOW</div>' +
  '<table class="copies"><tr><td></td><td></td></tr></table>' +
  '<div style="text-align:center;margin-top:8px;letter-spacing:.2em">COPIES OF THIS REPORT</div></div>' +
  '</div></body></html>';
}
function downloadDossierFile(name, html){
  try {
    var blob = new Blob([html], {type: 'text/html'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  } catch(x){ toast('Download failed.'); }
}
function exportDossier(){
  var e = D.directory[S.sel];
  if(!e){ toast('Nothing to export.'); return; }
  var btn = document.querySelector('#pexport');
  if(btn) btn.disabled = true;
  var html, fname;
  try { html = buildDossierDoc(e); fname = dossierFileName(e); }
  catch(err){ toast('Could not build the document.'); if(btn) btn.disabled = false; return; }
  downloadDossierFile(fname, html);
  toast('Downloaded ' + fname + '.');
  if(btn) btn.disabled = false;
}

/* ---------- Level 2/3 writes: events + files live in the subject file ---------- */
function ensureSubject(e, cb){
  if(e.record && e.record.slug){ cb(); return; }
  var slug = subjSlug(e);
  postKind('subject', slug, { name: e.display || e.name, events: '[]', files: '[]' }, getPw(), function(res){
    if(res && res.api !== 3){ toast('The sheet script needs a redeploy before timelines can save.'); return; }
    e.record = { slug: slug, events: [], files: [] };
    e.events = []; e.files = [];
    cb();
  }, function(err){ toast(err + ' — could not create the subject file.'); });
}
function saveSubjectPatch(patch, okMsg){
  var e = D.directory[S.sel];
  if(!e) return;
  toast('Saving…');
  postKind('subject', subjSlug(e), patch, getPw(), function(res){
    if(res && res.api !== 3){
      toast('Saved locally — the sheet script needs a redeploy to keep it.');
    } else {
      toast(okMsg || 'Saved.');
    }
    renderProfile(); renderList(); positionLvlInd();
  }, function(err){
    toast(err + ' — kept locally, reopen to retry.');
    renderProfile(); renderList(); positionLvlInd();
  });
}
/* ---------- timeline event composer ---------- */
function openEventComposer(){
  closeNoteComposer();
  var e = D.directory[S.sel];
  if(!e || !WEBAPP_URL){ toast('Nothing to add to.'); return; }
  var name = e.display || e.name || 'this person';
  var t = new Date();
  var today = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  var html = '<div id="noteoverlay"><div id="notecard" role="dialog" aria-label="Add timeline event">' +
    '<div class="xhead"><h2>Timeline event</h2><div class="sp"></div><button class="xbtn" id="noteclose">Cancel</button></div>' +
    '<div class="setbody">' +
    '<label>For ' + esc(name) + '<label class="sh">Saved to their Level 2 timeline. Cmd/Ctrl+Enter saves.</label></label>' +
    '<div class="evform"><input id="evdate" value="' + today + '" placeholder="YYYY-MM-DD" autocomplete="off">' +
    '<select id="evtype"><option value="milestone">milestone</option><option value="note" selected>note</option><option value="life event">life event</option></select></div>' +
    '<input id="evtitle" placeholder="Headline — e.g. Started a new job" autocomplete="off">' +
    '<textarea id="evdetail" rows="4" placeholder="Details (optional)"></textarea>' +
    '<div class="arow"><button id="evsave" class="xbtn acc">Add to timeline</button></div>' +
    '</div></div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
  document.querySelector('#noteclose').addEventListener('click', closeNoteComposer);
  document.querySelector('#noteoverlay').addEventListener('click', function(ev){ if(ev.target.id === 'noteoverlay') closeNoteComposer(); });
  document.querySelector('#evsave').addEventListener('click', saveEvent);
  var ti = document.querySelector('#evtitle');
  document.querySelector('#notecard').addEventListener('keydown', function(ev){
    if((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter'){ ev.preventDefault(); saveEvent(); }
  });
  ti.focus();
}
function closeNoteComposer(){
  var o = document.querySelector('#noteoverlay');
  if(o) o.remove();
}
function saveEvent(){
  var e = D.directory[S.sel];
  if(!e){ closeNoteComposer(); return; }
  var date = document.querySelector('#evdate').value.trim();
  var type = document.querySelector('#evtype').value;
  var summary = document.querySelector('#evtitle').value.trim();
  var detail = document.querySelector('#evdetail').value.trim();
  if(!summary){ toast('Give the event a headline.'); return; }
  if(!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(date)){ toast('Date as YYYY-MM-DD.'); return; }
  ensureSubject(e, function(){
    var ev = { date: date, type: type, summary: summary };
    if(detail) ev.detail = detail;
    e.events = e.events || [];
    e.events.push(ev);
    closeNoteComposer();
    saveSubjectPatch({ events: JSON.stringify(e.events) }, 'Added to the timeline.');
  });
}
function delEvent(i){
  var e = D.directory[S.sel];
  if(!e || !e.events || !e.events[i]) return;
  if(!confirm('Remove this timeline event?\n\n' + (e.events[i].summary || ''))) return;
  e.events.splice(i, 1);
  saveSubjectPatch({ events: JSON.stringify(e.events) }, 'Event removed.');
}
/* ---------- file attach / new-doc composers ---------- */
function openFileComposer(){
  closeNoteComposer();
  var e = D.directory[S.sel];
  if(!e || !WEBAPP_URL){ toast('Nothing to attach to.'); return; }
  var name = e.display || e.name || 'this person';
  var html = '<div id="noteoverlay"><div id="notecard" role="dialog" aria-label="Attach a file">' +
    '<div class="xhead"><h2>Attach file</h2><div class="sp"></div><button class="xbtn" id="noteclose">Cancel</button></div>' +
    '<div class="setbody">' +
    '<label>For ' + esc(name) + '<label class="sh">Paste a Google Drive / Docs link. It becomes part of their Level 3.</label></label>' +
    '<input id="evtitle" placeholder="Name — e.g. Full journal record" autocomplete="off">' +
    '<input id="evdate" placeholder="https://docs.google.com/…" autocomplete="off" style="margin-top:8px">' +
    '<textarea id="evdetail" rows="2" placeholder="Note about this file (optional)" style="margin-top:8px"></textarea>' +
    '<div class="arow"><button id="evsave" class="xbtn acc">Attach</button></div>' +
    '</div></div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
  document.querySelector('#noteclose').addEventListener('click', closeNoteComposer);
  document.querySelector('#noteoverlay').addEventListener('click', function(ev){ if(ev.target.id === 'noteoverlay') closeNoteComposer(); });
  document.querySelector('#evsave').addEventListener('click', saveFileLink);
  document.querySelector('#evtitle').focus();
}
function saveFileLink(){
  var e = D.directory[S.sel];
  if(!e){ closeNoteComposer(); return; }
  var nm = document.querySelector('#evtitle').value.trim();
  var url = document.querySelector('#evdate').value.trim();
  var note = document.querySelector('#evdetail').value.trim();
  if(!nm){ toast('Name the file first.'); return; }
  if(!url){ toast('Paste the file link.'); return; }
  ensureSubject(e, function(){
    var f = { name: nm, kind: url.indexOf('docs.google.com') >= 0 ? 'gdoc' : 'link', url: url };
    if(note) f.note = note;
    e.files = e.files || [];
    e.files.push(f);
    closeNoteComposer();
    saveSubjectPatch({ files: JSON.stringify(e.files) }, 'File attached.');
  });
}
function openDocComposer(){
  closeNoteComposer();
  var e = D.directory[S.sel];
  if(!e || !WEBAPP_URL){ toast('Nothing to create for.'); return; }
  var name = e.display || e.name || 'this person';
  var html = '<div id="noteoverlay"><div id="notecard" role="dialog" aria-label="New Drive doc">' +
    '<div class="xhead"><h2>New Drive doc</h2><div class="sp"></div><button class="xbtn" id="noteclose">Cancel</button></div>' +
    '<div class="setbody">' +
    '<label>For ' + esc(name) + '<label class="sh">Creates a Google Doc in the North Country Circle Files folder and attaches it as their Level 3.</label></label>' +
    '<input id="evtitle" placeholder="Doc title — e.g. Full journal record" autocomplete="off">' +
    '<div class="arow"><button id="evsave" class="xbtn acc">Create doc</button></div>' +
    '</div></div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
  document.querySelector('#noteclose').addEventListener('click', closeNoteComposer);
  document.querySelector('#noteoverlay').addEventListener('click', function(ev){ if(ev.target.id === 'noteoverlay') closeNoteComposer(); });
  document.querySelector('#evsave').addEventListener('click', saveNewDoc);
  document.querySelector('#evtitle').focus();
}
function saveNewDoc(){
  var e = D.directory[S.sel];
  if(!e){ closeNoteComposer(); return; }
  var title = document.querySelector('#evtitle').value.trim();
  if(!title){ toast('Title the doc first.'); return; }
  var btn = document.querySelector('#evsave');
  btn.disabled = true; btn.textContent = 'Creating…';
  ensureSubject(e, function(){
    postKind('createdoc', subjSlug(e), { title: title }, getPw(), function(res){
      if(!res || !res.url){ btn.disabled = false; btn.textContent = 'Create doc'; toast('Doc creation failed.'); return; }
      e.files = e.files || [];
      e.files.push({ name: res.name || title, kind: 'gdoc', url: res.url });
      closeNoteComposer();
      saveSubjectPatch({ files: JSON.stringify(e.files) }, 'Doc created and attached.');
    }, function(err){
      btn.disabled = false; btn.textContent = 'Create doc';
      toast(err + ' — not created.');
    });
  });
}
function delFile(i){
  var e = D.directory[S.sel];
  if(!e || !e.files || !e.files[i]) return;
  if(!confirm('Remove this file attachment?\n\n' + (e.files[i].name || ''))) return;
  e.files.splice(i, 1);
  saveSubjectPatch({ files: JSON.stringify(e.files) }, 'File removed.');
}

/* ---------- settings (enrich prompt + api key, stored server-side in the sheet) ---------- */
function openSettings(){
  closeSettings();
  var html = '<div id="setoverlay"><div id="setcard" role="dialog" aria-label="Settings">' +
    '<div class="xhead"><h2>Settings</h2><div class="sp"></div><button class="xbtn" id="setclose">Close</button></div>' +
    '<div class="setbody">' +
    '<label class="setrow"><input type="checkbox" id="setassess"' + (assessOn() ? ' checked' : '') + '> Show “Generate assessment” button' +
    '<span class="sh">Hidden by default. Restores the Gemini draft button on dossiers.</span></label>' +
    '<label>Bio prompt<label class="sh">Sent to Gemini with the person\'s facts on every Generate. Edit freely.</label></label>' +
    '<textarea id="setprompt" rows="10" placeholder="Loading…"></textarea>' +
    '<label>Gemini API key<label class="sh">Stored in the sheet, server-side only. Get one at aistudio.google.com → Get API key.</label></label>' +
    '<input id="setkey" type="password" placeholder="AIza…" autocomplete="off">' +
    '<div class="arow"><button id="setsave" class="xbtn acc">Save settings</button>' +
    '<button id="settest" class="xbtn">Test Gemini</button>' +
    '<button id="setclear" class="xbtn">Clear key</button><span id="setmsg"></span></div>' +
    '<div class="revq"><h3>Needs review</h3><div id="revqlist">' + reviewQueueHTML() + '</div></div>' +
    '</div></div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
  document.querySelector('#setclose').addEventListener('click', closeSettings);
  var sacb = document.querySelector('#setassess');
  if(sacb) sacb.addEventListener('change', function(){
    try{ localStorage.setItem('ncc_show_assess', sacb.checked ? '1' : '0'); }catch(e){}
  });
  document.querySelector('#revqlist').addEventListener('click', function(ev){
    var row = ev.target.closest('.revrow');
    if(!row) return;
    var i = parseInt(row.getAttribute('data-ri'), 10);
    closeSettings();
    if(i >= 0 && i !== S.sel) selectDir(i);
    else if(i >= 0){ renderProfile(); }
  });
  document.querySelector('#setoverlay').addEventListener('click', function(ev){ if(ev.target.id === 'setoverlay') closeSettings(); });
  document.querySelector('#setsave').addEventListener('click', saveSettings);
  document.querySelector('#settest').addEventListener('click', testGemini);
  document.querySelector('#setclear').addEventListener('click', clearGeminiKey);
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
function reviewQueueHTML(){
  var rows = [];
  D.directory.forEach(function(r, i){
    var pr = r.profile || {};
    if(!pr.review_flag || pr.deleted === '1') return;
    var label = pr.review_flag === 'duplicate' ? 'possible duplicate' : (pr.review_flag === 'missing_info' ? 'missing info' : pr.review_flag);
    rows.push('<div class="revrow" data-ri="' + i + '"><b>' + esc(r.display || r.name) + '</b><span>' + esc(label) + '</span></div>');
  });
  return rows.length ? rows.join('') : '<p class="body dim">Nothing flagged. Set "Needs review" on a person\'s file to queue them here.</p>';
}
function closeSettings(){ var o = document.querySelector('#setoverlay'); if(o) o.remove(); }
function clearGeminiKey(){
  var msg = document.querySelector('#setmsg');
  if(!WEBAPP_URL){ msg.textContent = 'Web app URL is not configured yet.'; return; }
  msg.textContent = 'Clearing…';
  fetch(WEBAPP_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify({ password:getPw(), kind:'settings', id:'settings', patch:{clear_key:true} }) })
    .then(function(r){ return r.json(); }).then(function(res){
      msg.textContent = (res && res.ok) ? 'Key cleared.' : ('Clear failed: ' + ((res && res.error) || 'unknown'));
      if(res && res.ok) loadSettings();
    }).catch(function(){ msg.textContent = 'Network error.'; });
}
function testGemini(){
  var msg = document.querySelector('#setmsg');
  if(!WEBAPP_URL){ msg.textContent = 'Web app URL is not configured yet.'; return; }
  msg.textContent = 'Testing…';
  fetch(WEBAPP_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify({ password:getPw(), kind:'testgemini', id:'settings', patch:{x:1} }) })
    .then(function(r){ return r.json(); }).then(function(res){
      msg.textContent = (res && res.ok) ? ('Gemini says: ' + res.reply) : ('Test failed: ' + ((res && res.error) || 'unknown'));
    }).catch(function(){ msg.textContent = 'Network error.'; });
}
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
/* The stage element itself resizes to the free space between the rail and the panel,
   so the graph center is already the visible middle — no camera offsets needed. */
function layoutShift(){ return { ox2d: 0, vox: 0 }; }
function glRecenter(){
  if(!GL || !GL.camera) return;
  try { GL.camera.clearViewOffset(); } catch(x){}
  GL.camera.updateProjectionMatrix();
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
  var SS = 3; // supersample: draw big, scale down — crisp text up close
  var cv = document.createElement('canvas');
  var mctx = cv.getContext('2d');
  mctx.font = '700 ' + fs + 'px "Hanken Grotesk", sans-serif';
  var w = Math.ceil(mctx.measureText(text).width) + 30, h = fs + 32;
  cv.width = w * SS; cv.height = h * SS;
  var ctx = cv.getContext('2d');
  ctx.scale(SS, SS);
  ctx.font = '700 ' + fs + 'px "Hanken Grotesk", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = 9;
  ctx.fillStyle = o.color || '#e8ecf3';
  ctx.fillText(text, 15, h / 2);
  var tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  try { tex.anisotropy = GL.renderer.capabilities.getMaxAnisotropy(); } catch(x){}
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  var sc = 0.068;
  sp.scale.set(w * sc, h * sc, 1);
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
  camera.position.set(0, 88, 370);
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
    ray: new THREE.Raycaster(), downX: 0, downY: 0,
    hoverLabel: null, hoverDi: -1
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
    var di = (hit && hit.kind === 'node') ? NODES[hit.index].i : null;
    glHoverLabel(di);
  });
  renderer.domElement.addEventListener('pointerleave', function(){ glHoverLabel(null); });
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
/* Hover label: name sprite above the hovered node (3D). Only one at a time. */
function glHoverLabel(di){
  if(!GL) return;
  if(di === GL.hoverDi) return;
  GL.hoverDi = di;
  if(GL.hoverLabel){ GL.scene.remove(GL.hoverLabel); GL.hoverLabel = null; }
  if(di == null || di < 0 || !GL.glPos[di]) return;
  if(di === GL.focusDi) return; // already has its gold label
  var e = D.directory[di];
  if(!e) return;
  var lab = makeLabel(e.display || e.name, { size: 22, color: '#e8ecf3' });
  var p = GL.glPos[di];
  lab.position.set(p.x, p.y + 4.5, p.z);
  GL.scene.add(lab);
  GL.hoverLabel = lab;
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
  glHoverLabel(null);
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
  var dest = p.clone().add(out.multiplyScalar(58));
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
        setMode(S.mode);
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
