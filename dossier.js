/* North Country Circle — Dossier v3
   Directory rail + connection map + three-level dossier panel.
   Level colors (used everywhere): L1 Snapshot = blue, L2 Story = amber, L3 Files = green. */
(function(){
'use strict';

var WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwZli1Dv07iWBpR3Oz4jD4imtNLN845jFDBnXIbtmT3sPGExsMlKFMQwt42FmrUdFBD/exec';

var LV = {
  1:{ c:'#7ea6f0', n:'Snapshot', ic:'user' },
  2:{ c:'#f0b44c', n:'Story',    ic:'book' },
  3:{ c:'#5cd6a0', n:'Files',    ic:'folder' }
};
var RELC = { mutual:'#e0688a', following:'#b48ce8', follower:'#8b95a7' };
var RELN = { mutual:'Mutual', following:'Following', follower:'Follower' };

var S = {
  q:'', rel:'', lvlF:0, auditOnly:false, tag:null, sort:'strength',
  rail:'people', limit:200,
  sel:null, editing:false, lvl:1, hist:[], wide:false,
  mode:'3d', colorBy:'level', showBg:false, listOpen:true,
  saveTimer:null
};
var D = null, NODES = [], ORDER = [], LIST_ORDER = [], BYN = {};

/* ---------- small helpers ---------- */
function $(s, r){ return (r || document).querySelector(s); }
function $$(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0;
  var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function tagList(v){ return String(v || '').split(',').map(function(x){ return x.trim(); }).filter(Boolean); }
function fmtPhone(p){
  var d = String(p || '').replace(/\D/g, '');
  if(d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
  if(d.length === 10) return '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6);
  return String(p || '').trim();
}
function hexA(hex, a){
  var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}
function toast(msg){
  var t = $('#toast');
  if(!t){ t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(function(){ t.classList.remove('show'); }, 2600);
}
function store(k, v){ try{ if(v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); }catch(e){} return null; }
function typing(){
  var a = document.activeElement;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
}

/* ---------- icons (one stroke family, so they all sit together) ---------- */
var IC = {
  phone:'<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  user:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  heart:'<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  flag:'<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  ext:'<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  folder:'<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  book:'<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
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
  dots:'<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  send:'<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  settings:'<path d="M4 6h9.8M18.2 6H20M4 12h3.8M12.2 12H20M4 18h8.8M17.2 18H20"/><circle cx="16" cy="6" r="2.2"/><circle cx="10" cy="12" r="2.2"/><circle cx="15" cy="18" r="2.2"/>',
  filter:'<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  back:'<path d="m15 18-6-6 6-6"/>',
  undo:'<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo:'<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  chev:'<path d="m6 9 6 6 6-6"/>',
  expand:'<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  shrink:'<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  trash:'<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  orbit:'<circle cx="12" cy="12" r="2.4"/><circle cx="12" cy="12" r="9"/><circle cx="19.4" cy="7.6" r="1.4"/>',
  zin:'<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/>',
  zout:'<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M8 11h6"/>',
  reset:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  star:'<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  ig:'<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/>',
  sparkle:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>'
};
function ic(n, s){
  s = s || 16;
  return '<svg class="icsvg" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || '') + '</svg>';
}
function injectIcons(root){
  $$('[data-ic]', root).forEach(function(el){ el.innerHTML = ic(el.getAttribute('data-ic'), parseInt(el.getAttribute('data-s'), 10) || 16); });
}

/* ---------- ambient backdrop ---------- */
function ambient(){
  var cv = $('#ambient'), ctx = cv.getContext('2d'), W, H;
  function size(){
    W = Math.floor(innerWidth / 3); H = Math.floor(innerHeight / 3);
    cv.width = W; cv.height = H; cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
  }
  size(); addEventListener('resize', function(){ size(); if(still) draw(0); });
  var blobs = [
    {x:.22,y:.28,r:.42,c:'126,166,240',a:.05,sx:.00011,sy:.00013,p:0},
    {x:.78,y:.62,r:.5, c:'240,180,76', a:.035,sx:.00009,sy:.00012,p:2},
    {x:.6, y:.12,r:.36,c:'180,140,232',a:.035,sx:.00012,sy:.00008,p:4},
    {x:.12,y:.85,r:.4, c:'92,214,160', a:.03, sx:.00008,sy:.0001, p:1}
  ];
  var still = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var t0 = performance.now(), running = true;
  function draw(now){
    var t = (now - t0) / 1000;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#06080d'; ctx.fillRect(0, 0, W, H);
    blobs.forEach(function(b){
      var x = (b.x + Math.sin(t * b.sx * 1000 + b.p) * .06) * W;
      var y = (b.y + Math.cos(t * b.sy * 1000 + b.p) * .06) * H;
      var r = b.r * Math.max(W, H);
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(' + b.c + ',' + b.a + ')');
      g.addColorStop(1, 'rgba(' + b.c + ',0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    });
  }
  function frame(now){ if(!running) return; draw(now); requestAnimationFrame(frame); }
  if(still){ draw(0); return; }
  document.addEventListener('visibilitychange', function(){ running = !document.hidden; if(running) requestAnimationFrame(frame); });
  requestAnimationFrame(frame);
}

/* ---------- profile model ---------- */
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
  {k:'ego', label:'Ego', type:'score', hint:'1 credits others · 5 takes credit'}
];
var SCORE_FIELDS = [
  {k:'closeness', label:'Closeness'}, {k:'charisma', label:'Charisma'}, {k:'competence', label:'Competence'},
  {k:'intellect', label:'Intellect'}, {k:'creativity', label:'Creativity'}, {k:'reliability', label:'Reliability'},
  {k:'reputation', label:'Reputation'}, {k:'assertiveness', label:'Assertiveness'}, {k:'ego', label:'Ego'}
];
var L1_SCORES = ['charisma','competence','intellect','creativity','reliability','reputation','assertiveness','ego'];
var ORG_CATS = [
  {k:'churches', label:'Churches', options:['CFC Potsdam','CFC Canton','CFC Madrid','NTC','Calvary Baptist']},
  {k:'companies', label:'Companies', options:['Rochester Regional Health','Clarkson University','Park Bros.']},
  {k:'universities', label:'Universities', options:['SUNY Canton','SUNY Potsdam','St. Lawrence University','Clarkson University']}
];
var EVT_ICON = { milestone:'flag', note:'quote', 'life event':'heart' };

function fieldDef(k){
  for(var i = 0; i < PROFILE_FIELDS.length; i++) if(PROFILE_FIELDS[i].k === k) return PROFILE_FIELDS[i];
  return { k:k, label:k };
}
function dispName(e){ return e.display || e.name || ''; }
function pkey(e){ return e.src === 'contacts' ? e.name : 'ig:' + (e.name || '').toLowerCase(); }
function personLevel(e){
  if((e.files || []).length) return 3;
  if((e.events || []).length) return 2;
  return 1;
}
function subjSlug(e){
  if(e.record && e.record.slug) return e.record.slug;
  return String(dispName(e)).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function subLine(e){
  if(e.src === 'contacts') return 'Phone contact';
  if(e.src === 'subject') return 'Subject file';
  return '@' + e.name;
}
function l1Fill(e){
  var p = e.profile || {}, c = e.contact || {}, n = 0;
  if(p.phone || (c.phones || []).length) n++;
  if(p.email || (c.emails || []).length) n++;
  ['specialty','interests'].concat(L1_SCORES).forEach(function(k){ if(p[k]) n++; });
  if(ORG_CATS.some(function(cat){ return tagList(p[cat.k]).length; })) n++;
  return n;
}
var L1_TOTAL = 13;
function evDate(d){
  var m = String(d || '').match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/);
  if(!m) return esc(String(d || ''));
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var mi = parseInt(m[2] || '1', 10) - 1;
  if(m[3]) return esc(MON[mi] + ' ' + parseInt(m[3], 10) + ', ' + m[1]);
  if(m[2]) return esc(MON[mi] + ' ' + m[1]);
  return esc(m[1]);
}
function monthLabel(d){
  var m = String(d || '').match(/^(\d{4})(?:-(\d{2}))?/);
  if(!m) return 'Undated';
  var MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return m[2] ? MON[parseInt(m[2], 10) - 1] + ' ' + m[1] : m[1];
}
function sortedEvents(e){
  return (e.events || []).map(function(ev, i){ return { ev:ev, i:i }; }).sort(function(a, b){
    var x = String(a.ev.date || ''), y = String(b.ev.date || '');
    return x < y ? 1 : (x > y ? -1 : 0);
  });
}
function igURL(h){ return 'https://www.instagram.com/' + encodeURIComponent(String(h).replace(/^@/, '')) + '/'; }

/* ---------- filtering ---------- */
function passes(r, skipLvl, skipQ){
  var pr = r.profile || {};
  if(pr.deleted === '1') return false;
  if(S.auditOnly && pr.audit === 'audited') return false;
  if(S.tag && tagList(pr[S.tag.k]).indexOf(S.tag.v) < 0) return false;
  if(S.rel && r.relation !== S.rel) return false;
  if(!skipLvl && S.lvlF && personLevel(r) !== S.lvlF) return false;
  if(!skipQ){
    var q = S.q.trim().toLowerCase();
    if(q && ((dispName(r) + ' @' + r.name + ' ' + (pr.specialty || '') + ' ' + (pr.interests || '')).toLowerCase().indexOf(q) < 0)) return false;
  }
  return true;
}
function listRows(){
  var rows = LIST_ORDER.filter(function(di){ return passes(D.directory[di]); });
  if(S.sort === 'name'){
    rows.sort(function(a, b){ return dispName(D.directory[a]).localeCompare(dispName(D.directory[b])); });
  } else if(S.sort === 'audit'){
    var needs = rows.filter(function(di){ return (D.directory[di].profile || {}).audit !== 'audited'; });
    var done = rows.filter(function(di){ return (D.directory[di].profile || {}).audit === 'audited'; });
    rows = needs.concat(done);
  }
  return rows;
}
function refreshMatch(){
  NODES.forEach(function(n){
    var r = D.directory[n.i];
    n.on = passes(r);
    n.col = S.colorBy === 'rel' ? (RELC[r.relation] || '#8b95a7') : LV[personLevel(r)].c;
  });
}
function refresh(){
  refreshMatch(); renderRail(); glRecolor(); updateAuditPill(); updateLegend();
}

/* ---------- left rail ---------- */
function renderLvlChips(){
  var c = {0:0, 1:0, 2:0, 3:0};
  LIST_ORDER.forEach(function(di){
    var r = D.directory[di];
    if(!passes(r, true)) return;
    c[0]++; c[personLevel(r)]++;
  });
  $('#lvlchips').innerHTML = [0,1,2,3].map(function(n){
    return '<button class="lchip' + (S.lvlF === n ? ' on' : '') + '" data-lf="' + n + '" style="--c:' + (n ? LV[n].c : '#ece9e2') +
      '" title="' + (n ? 'Show only ' + LV[n].n + ' people' : 'Show everyone') + '"><b>' + c[n] + '</b><span>' + (n ? LV[n].n : 'All') + '</span></button>';
  }).join('');
}
function pipsHTML(e){
  var on = [true, !!(e.events || []).length, !!(e.files || []).length];
  return '<span class="pips" title="Snapshot' + (on[1] ? ', Story' : '') + (on[2] ? ', Files' : '') + '">' +
    [1,2,3].map(function(n){ return '<i class="pip' + (on[n - 1] ? ' lit' : '') + '" style="--c:' + LV[n].c + '"></i>'; }).join('') + '</span>';
}
function renderRail(){
  $$('#railtabs button').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-r') === S.rail); });
  $('#lvlchips').parentNode.style.display = S.rail === 'people' ? '' : 'none';
  if(S.rail === 'people') railPeople();
  else if(S.rail === 'events') railEvents();
  else railFiles();
  updateFilterUI();
}
function railPeople(){
  renderLvlChips();
  var rows = listRows();
  var total = LIST_ORDER.filter(function(di){ return (D.directory[di].profile || {}).deleted !== '1'; }).length;
  $('#lcount').textContent = rows.length === total ? total + ' people' : rows.length + ' of ' + total + ' people';
  var shown = rows.slice(0, S.limit);
  var h = shown.map(function(di){
    var r = D.directory[di], lv = personLevel(r), aud = (r.profile || {}).audit === 'audited';
    var sub = subLine(r) + (r.relation ? ' · ' + RELN[r.relation] : '');
    return '<div class="row' + (S.sel === di ? ' sel' : '') + '" data-i="' + di + '" role="button" tabindex="0">' +
      '<div class="ava" style="--c:' + LV[lv].c + '">' + esc((dispName(r).replace(/^@/, '').trim().charAt(0) || '·').toUpperCase()) +
      (aud ? '' : '<i class="auddot" title="Needs audit"></i>') + '</div>' +
      '<div class="nm"><b>' + esc(dispName(r)) + '</b><span>' + esc(sub) + '</span></div>' + pipsHTML(r) + '</div>';
  }).join('');
  if(rows.length > shown.length) h += '<button class="morebtn" data-more="1">Show ' + Math.min(200, rows.length - shown.length) + ' more</button>';
  $('#leftbody').innerHTML = h || '<div class="empty-note">No one matches. Try clearing a filter.</div>';
}
function collectEvents(){
  var q = S.q.trim().toLowerCase(), items = [];
  D.directory.forEach(function(r, di){
    if(!passes(r, true, true)) return;
    (r.events || []).forEach(function(ev){
      if(q && ((ev.summary || '') + ' ' + (ev.detail || '') + ' ' + dispName(r)).toLowerCase().indexOf(q) < 0) return;
      items.push({ ev:ev, di:di });
    });
  });
  items.sort(function(a, b){ var x = String(a.ev.date || ''), y = String(b.ev.date || ''); return x < y ? 1 : (x > y ? -1 : 0); });
  return items;
}
function railEvents(){
  var items = collectEvents();
  $('#lcount').textContent = items.length + (items.length === 1 ? ' event' : ' events') + ' across everyone';
  var h = '', last = '';
  items.slice(0, 300).forEach(function(it){
    var m = monthLabel(it.ev.date);
    if(m !== last){ h += '<div class="mhead">' + esc(m) + '</div>'; last = m; }
    h += '<div class="erow' + (S.sel === it.di ? ' sel' : '') + '" style="--c:' + LV[2].c + '" data-i="' + it.di + '" data-go="2" role="button" tabindex="0">' +
      '<span class="ebar"></span><div class="et"><time>' + evDate(it.ev.date) + '</time><b>' + esc(it.ev.summary || '') + '</b><span>' + esc(dispName(D.directory[it.di])) + '</span></div></div>';
  });
  $('#leftbody').innerHTML = h || '<div class="empty-note">No timeline events yet. Open someone and add one on the Story tab.</div>';
}
function railFiles(){
  var q = S.q.trim().toLowerCase(), items = [];
  D.directory.forEach(function(r, di){
    if(!passes(r, true, true)) return;
    (r.files || []).forEach(function(f){
      if(q && ((f.name || '') + ' ' + (f.note || '') + ' ' + dispName(r)).toLowerCase().indexOf(q) < 0) return;
      items.push({ f:f, di:di });
    });
  });
  $('#lcount').textContent = items.length + (items.length === 1 ? ' file' : ' files') + ' across everyone';
  var h = items.slice(0, 300).map(function(it){
    return '<div class="erow' + (S.sel === it.di ? ' sel' : '') + '" style="--c:' + LV[3].c + '" data-i="' + it.di + '" data-go="3" role="button" tabindex="0">' +
      '<span class="fi">' + ic(it.f.kind === 'gdoc' ? 'file' : 'link', 17) + '</span><div class="et"><b>' + esc(it.f.name || 'Untitled') + '</b><span>' +
      esc(dispName(D.directory[it.di])) + ' · ' + (it.f.kind === 'gdoc' ? 'Google Doc' : 'Link') + '</span></div></div>';
  }).join('');
  $('#leftbody').innerHTML = h || '<div class="empty-note">No files attached yet. Open someone and use the Files tab.</div>';
}
function updateFilterUI(){
  var n = (S.rel ? 1 : 0) + (S.auditOnly ? 1 : 0) + (S.sort !== 'strength' ? 1 : 0);
  var b = $('#filtercount');
  b.hidden = !n; b.textContent = n;
  $('#frel').value = S.rel; $('#fsort').value = S.sort; $('#fauditonly').checked = S.auditOnly;
  var chips = [];
  if(S.tag) chips.push('<button class="aflt" data-clr="tag">' + esc(S.tag.v) + '<b>' + ic('x', 11) + '</b></button>');
  if(S.rel) chips.push('<button class="aflt" data-clr="rel">' + esc(RELN[S.rel]) + '<b>' + ic('x', 11) + '</b></button>');
  if(S.auditOnly) chips.push('<button class="aflt" data-clr="audit">Needs audit<b>' + ic('x', 11) + '</b></button>');
  if(S.q.trim()) chips.push('<button class="aflt" data-clr="q">“' + esc(S.q.trim()) + '”<b>' + ic('x', 11) + '</b></button>');
  $('#activeflt').innerHTML = chips.join('');
  $('#auditpill').classList.toggle('on', S.auditOnly);
}
function clearFilter(k){
  if(k === 'tag') S.tag = null;
  else if(k === 'rel') S.rel = '';
  else if(k === 'audit') S.auditOnly = false;
  else if(k === 'q'){ S.q = ''; $('#fq').value = ''; }
  else if(k === 'all'){ S.tag = null; S.rel = ''; S.auditOnly = false; S.sort = 'strength'; S.lvlF = 0; S.q = ''; $('#fq').value = ''; }
  S.limit = 200; refresh();
}
function updateAuditPill(){
  var live = D.directory.filter(function(r){ return (r.profile || {}).deleted !== '1'; });
  var done = live.filter(function(r){ return (r.profile || {}).audit === 'audited'; }).length;
  $('#aptxt').textContent = 'Audited ' + done + '/' + live.length;
  $('#apfill').style.width = (live.length ? Math.round(done / live.length * 100) : 0) + '%';
}
function updateLegend(){
  var c = {1:0, 2:0, 3:0}, rc = {mutual:0, following:0, follower:0};
  LIST_ORDER.forEach(function(di){
    var r = D.directory[di];
    if(!passes(r, true)) return;
    c[personLevel(r)]++; if(rc[r.relation] != null) rc[r.relation]++;
  });
  var h = '';
  if(S.colorBy === 'level'){
    [1,2,3].forEach(function(n){
      h += '<button class="lg' + (S.lvlF === n ? ' on' : '') + '" data-lf="' + n + '" style="--c:' + LV[n].c + '" title="Show only ' + LV[n].n + '"><i></i>' + LV[n].n + ' <b>' + c[n] + '</b></button>';
    });
  } else {
    ['mutual','following','follower'].forEach(function(k){
      h += '<button class="lg' + (S.rel === k ? ' on' : '') + '" data-rf="' + k + '" style="--c:' + RELC[k] + '"><i></i>' + RELN[k] + ' <b>' + rc[k] + '</b></button>';
    });
  }
  $('#legend').innerHTML = h;
}

/* ---------- panel: shared bits ---------- */
function pips5(v){
  v = parseInt(v || '0', 10) || 0;
  var h = '<span class="pp">';
  for(var i = 1; i <= 5; i++) h += '<i' + (i <= v ? ' class="on"' : '') + '></i>';
  return h + '</span>';
}
function card(icon, title, lv, body, right, cls, collapsed){
  var cc = ('card ' + (cls || '') + (collapsed != null ? ' collapsible' : '') + (collapsed ? ' is-collapsed' : '')).replace(/\s+/g, ' ').trim();
  return '<section class="' + cc + '" style="--c:' + LV[lv].c + '"><header' +
    (collapsed != null ? ' data-act="cardtoggle" title="Expand/collapse"' : '') + '><span class="cic">' + ic(icon, 15) + '</span><h3>' + esc(title) + '</h3>' +
    (collapsed != null ? '<span class="chev">' + ic('chev', 14) + '</span>' : '') +
    (right ? '<div class="cr">' + right + '</div>' : '') + '</header><div class="cb">' + body + '</div></section>';
}
function emptyBox(text, btn, lv){
  return '<div class="empty"><p>' + esc(text) + '</p></div>';
}
function reviewBadge(e){
  var f = (e.profile || {}).review_flag;
  if(!f) return '';
  var label = f === 'duplicate' ? 'Possible duplicate' : (f === 'missing_info' ? 'Missing info' : f);
  return '<span class="revbadge" title="Flagged for review">' + esc(label) + '</span>';
}
function phead(e){
  var prof = e.profile || {}, pl = personLevel(e), col = LV[pl].c, aud = prof.audit === 'audited';
  var prev = S.hist.length ? D.directory[S.hist[S.hist.length - 1]] : null;
  var back = prev ? '<button class="ibtn" data-act="back" title="Back to ' + esc(dispName(prev)) + ' (Alt+←)" aria-label="Back">' + ic('back', 17) + '</button>' : '';
  var edit = S.editing
    ? '<button class="ibtn solid" data-act="done" title="Finish editing (Esc)">' + ic('check', 16) + '<span>Done</span></button>'
    : '<button class="ibtn" data-act="edit" title="Edit this dossier (E)" aria-label="Edit">' + ic('edit', 16) + '</button>';
  var rel = e.relation ? '<span class="rchip" style="--c:' + RELC[e.relation] + '">' + RELN[e.relation] + '</span>' : '';
  var cnt = { 1:l1Fill(e) + '/' + L1_TOTAL, 2:(e.events || []).length || '', 3:(e.files || []).length || '' };
  var tabs = '<div class="tabs" role="tablist">' + [1,2,3].map(function(n){
    return '<button class="tab' + (S.lvl === n ? ' on' : '') + (n > 1 && !cnt[n] ? ' empty' : '') + '" role="tab" data-act="tab" data-lvl="' + n + '" style="--c:' + LV[n].c +
      '" title="' + LV[n].n + ' (' + n + ')">' + ic(LV[n].ic, 15) + '<span>' + LV[n].n + '</span>' + (cnt[n] ? '<em>' + cnt[n] + '</em>' : '') + '</button>';
  }).join('') + '</div>';
  var menu = '<div class="menu"><button class="ibtn" data-act="menu" aria-haspopup="true" title="More actions" aria-label="More actions">' + ic('dots', 17) + '</button>' +
    '<div class="menu-pop" hidden>' +
    '<button data-act="audit">' + ic('shield', 16) + (aud ? 'Mark as needs audit' : 'Mark as audited') + '</button>' +
    (aud ? '' : '<button data-act="auditnext">' + ic('check', 16) + 'Mark audited, open next</button>') +
    '<hr>' +
    '<button data-act="addevent">' + ic('calendar', 16) + 'Add timeline event</button>' +
    '<button data-act="newdoc">' + ic('file', 16) + 'New Drive doc</button>' +
    '<button data-act="attach">' + ic('link', 16) + 'Attach a file link</button>' +
    '<hr>' +
    '<button data-act="export">' + ic('download', 16) + 'Export dossier</button>' +
    '<button data-act="viewdoc">' + ic('book', 16) + 'View dossier</button>' +
    '<button data-act="delete" class="danger">' + ic('trash', 16) + 'Delete this person</button></div></div>';
  return '<div class="phead"><div class="hrow">' + back +
    '<div class="ava lg-ava" style="--c:' + col + '">' + esc((dispName(e).replace(/^@/, '').trim().charAt(0) || '·').toUpperCase()) + '</div>' +
    '<div class="hname"><h2 title="' + esc(dispName(e)) + '">' + esc(dispName(e)) + '</h2>' +
    '<div class="hsub"><span>' + esc(subLine(e)) + '</span>' + rel +
    reviewBadge(e) + '</div></div>' +
    '<div class="hact">' + edit +
    '<button class="ibtn" id="pwide" data-act="wide" title="' + (S.wide ? 'Narrow the panel' : 'Widen the panel') + '" aria-label="Resize panel">' + ic(S.wide ? 'shrink' : 'expand', 16) + '</button>' +
    menu + '<button class="ibtn" data-act="close" title="Close (Esc)" aria-label="Close">' + ic('x', 17) + '</button></div></div>' + tabs + '</div>';
}

/* ---------- panel: view mode ---------- */
function footprintHTML(e){
  var fp = e.public_footprint;
  if(!fp) return '<div class="fpbox"><p class="dim">No public footprint on file.</p></div>';
  var parts = String(fp).split(/\n*Sources:\s*/);
  var prose = parts[0].trim().split(/\n+/).map(function(p){ return '<p>' + esc(p) + '</p>'; }).join('');
  var links = '';
  if(parts[1]){
    links = parts[1].split(/;\s*/).map(function(u){
      u = String(u).trim(); if(!u) return '';
      var host = u.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      return '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(host) + ic('ext', 12) + '</a>';
    }).join('');
  }
  return '<div class="fpbox">' + prose + (links ? '<div class="fpsrc"><span>Sources</span>' + links + '</div>' : '') + '</div>';
}
function lvl1View(e){
  var prof = e.profile || {}, c = e.contact || {};
  var phones = prof.phone || (c.phones || []).join(', ');
  var emails = prof.email || (c.emails || []).join(', ');
  var rows = '';
  if(e.src !== 'contacts' && e.src !== 'subject' && e.name)
    rows += '<div class="idrow"><span class="idic">' + ic('ig', 15) + '</span><div><span>Instagram</span><a href="' + igURL(e.name) + '" target="_blank" rel="noopener">@' + esc(e.name) + '</a></div></div>';
  if(phones) rows += '<div class="idrow"><span class="idic">' + ic('phone', 15) + '</span><div><span>Phone</span>' +
    String(phones).split(',').map(function(x){ var f = fmtPhone(x); return '<a href="tel:' + esc(f.replace(/[^\d+]/g, '')) + '">' + esc(f) + '</a>'; }).join('') + '</div></div>';
  if(emails) rows += '<div class="idrow"><span class="idic">' + ic('mail', 15) + '</span><div><span>Email</span>' +
    String(emails).split(',').map(function(x){ x = x.trim(); return '<a href="mailto:' + esc(x) + '">' + esc(x) + '</a>'; }).join('') + '</div></div>';
  var contact = card('user', 'Contact', 1, rows || emptyBox('No contact details yet.', 'Add details', 1));

  var anyScore = L1_SCORES.some(function(k){ return prof[k]; });
  var traits = '<div class="traits">' + L1_SCORES.map(function(k){
    var f = fieldDef(k), v = prof[k];
    return '<div class="trait' + (v ? '' : ' empty-t') + '"><span>' + esc(f.label) + '</span>' + pips5(v) + '</div>';
  }).join('') + '</div>';
  var score = '';
  if(prof.enriched_value){
    var m = String(prof.enriched_value).match(/^(\d{1,3})\s*[—–-]/);
    if(m) score = '<span class="score" title="Assessment score">' + ic('star', 11) + ' ' + m[1] + '/100</span>';
  }
  var ratings = card('activity', 'Ratings', 1, traits + readHTML(prof), score);

  var bg = '';
  if(prof.specialty) bg += '<div class="idrow"><span class="idic">' + ic('zap', 15) + '</span><div><span>Specialty</span><b>' + esc(prof.specialty) + '</b></div></div>';
  if(prof.interests) bg += '<div class="idrow"><span class="idic">' + ic('tag', 15) + '</span><div><span>Interests</span><b>' + esc(prof.interests) + '</b></div></div>';
  var orgs = '';
  ORG_CATS.forEach(function(cat){
    tagList(prof[cat.k]).forEach(function(v){
      orgs += '<button class="vchip" data-act="tagfilter" data-tagk="' + cat.k + '" data-tagv="' + esc(v) + '" title="See everyone at ' + esc(v) + '">' + ic('briefcase', 12) + esc(v) + '</button>';
    });
  });
  var bgBody = (bg ? bg : '') + (orgs ? '<div class="subhead">Organizations (click to see who else)</div><div class="chips">' + orgs + '</div>' : '');
  var background = card('briefcase', 'Background', 1, bgBody || emptyBox('No specialty, interests, or organizations yet.', 'Add background', 1));

  var fp = card('link', 'Public footprint', 1, footprintHTML(e), '', 'span');
  return contact + ratings + background + fp;
}
function linkedFrom(e){
  var me = (e.name || '').toLowerCase(), out = [];
  D.directory.forEach(function(r, di){
    if(r === e || (r.profile || {}).deleted === '1') return;
    if((r.neighbors || []).some(function(n){ return (n.u || '').toLowerCase() === me; })) out.push(di);
  });
  return out;
}
function nbrChipHTML(nb, removable){
  var di = BYN[(nb.u || '').toLowerCase()];
  var d = di != null ? LV[personLevel(D.directory[di])].c : '#5a6b84';
  return '<span class="nchip' + (removable ? '' : ' plain') + '" style="--d:' + d + '" ' + (di != null ? 'data-act="nav" data-di="' + di + '" title="Open dossier"' : 'title="Not in the directory"') + '><i></i>' +
    esc(nb.d || nb.u) + (removable ? '<b class="nx" data-act="rmnx" data-u="' + esc(nb.u) + '" title="Remove close connection">×</b>' : '') + '</span>';
}
function tile(icon, val, label){
  return '<div class="tile"><span class="tic">' + ic(icon, 15) + '</span><span class="tx"><b' + (val ? '' : ' class="dim"') + '>' + esc(val || '—') + '</b><i>' + esc(label) + '</i></span></div>';
}
function timelineHTML(e){
  var evs = sortedEvents(e);
  if(!evs.length) return emptyBox('No timeline events yet.', 'Add the first event', 2);
  return '<div class="tl">' + evs.map(function(o){
    var ev = o.ev, t = ev.type || 'note';
    return '<div class="ev"><span class="evdot"></span><div class="evtop"><time>' + evDate(ev.date) + '</time><span class="etype">' + ic(EVT_ICON[t] || 'quote', 11) + esc(t) + '</span></div>' +
      '<div class="evtitle">' + esc(ev.summary || '') + '</div>' + (ev.detail ? '<div class="evdetail">' + esc(ev.detail) + '</div>' : '') + '</div>';
  }).join('') + '</div>';
}
function lvl2View(e){
  var prof = e.profile || {}, fdb = e.friendsdb || {};
  var rel = [prof.relationship, prof.context].filter(Boolean).join(' · ');
  var conn = (rel ? '<div class="rel-line">' + ic('users', 15) + '<span>' + esc(rel.charAt(0).toUpperCase() + rel.slice(1)) + '</span></div>' : '') +
    '<div class="tiles">' + tile('heart', prof.closeness ? prof.closeness + ' / 5' : '', 'Closeness') + tile('flag', fdb.standing, 'Standing') +
    tile('activity', fdb.state, 'State') + tile('trend', fdb.trajectory, 'Trajectory') +
    tile('clock', fdb.years_known ? fdb.years_known + ' yrs' : '', 'Known for') + tile('share', String(e.degree || 0), 'Graph links') +
    tile('send', String(e.shared_with_jd || 0), 'Shared with you') + '</div>' +
    '';
  var connection = card('users', 'Connection', 2, conn, '', 'span');

  var narrText = prof.enriched_value ? esc(String(prof.enriched_value).replace(/^\d{1,3}\s*[—–-]\s*/, '')) : '';
  var assess = assessOn()
    ? '<div class="genrow"><button class="mini" data-act="enrich" style="--c:' + LV[2].c + '">' + ic('zap', 13) + 'Generate assessment</button>' +
      ((prof.enriched === '1' || prof.enriched === 1) ? '<span class="calcnote">Generated' + (prof.enriched_at ? ' ' + esc(prof.enriched_at) : '') + '</span>' : '<span class="calcnote">Not generated yet</span>') + '</div>'
    : '';
  var narrative = card('quote', 'Narrative', 2, (narrText ? '<div class="narr">' + narrText + '</div>' : emptyBox('No story written yet.', 'Write the story', 2)) + assess);

  var nbrs = (e.neighbors || []).slice(0, 12);
  var from = linkedFrom(e);
  var cc = (nbrs.length ? '<div class="chips">' + nbrs.map(function(nb){ return nbrChipHTML(nb, false); }).join('') + '</div>' : '<p class="dim" style="margin:0 0 4px;font-size:13px">No close connections mapped.</p>');
  if(from.length) cc += '<div class="subhead">Also linked here</div><div class="chips">' + from.slice(0, 12).map(function(di){
    return nbrChipHTML({ u:D.directory[di].name, d:dispName(D.directory[di]) }, false); }).join('') + '</div>';
  cc += '';
  var conns = card('share', 'Close connections', 2, cc, '', '', true);

  var tl = card('calendar', 'Timeline', 2, timelineHTML(e),
    '<button class="mini" data-act="addevent" style="--c:' + LV[2].c + '">' + ic('plus', 13) + 'Add event</button>', 'span');
  var notes = prof.notes ? card('file', 'Reference notes', 2, '<div class="narr" style="white-space:pre-wrap">' + esc(prof.notes) + '</div>', '', 'span') : '';
  return connection + narrative + conns + tl + notes;
}
function filesHTML(e){
  var fs = e.files || [];
  if(!fs.length) return emptyBox('Nothing attached. Use a file when the timeline runs out of room.', '', 3);
  return fs.map(function(f){
    var isDoc = f.kind === 'gdoc';
    return '<div class="file"><div class="fic">' + ic(isDoc ? 'file' : 'link', 17) + '</div><div class="fbody"><div class="fn">' + esc(f.name || 'Untitled') + '</div>' +
      (f.note ? '<div class="fm">' + esc(f.note) + '</div>' : '') + '<div class="fm dim">' + (isDoc ? 'Google Doc' : 'Link') + '</div></div>' +
      (f.url ? '<a class="open" href="' + esc(f.url) + '" target="_blank" rel="noopener">Open' + ic('ext', 12) + '</a>' : '') + '</div>';
  }).join('');
}
function lvl3View(e){
  return card('folder', 'Files', 3, filesHTML(e) +
    '<div class="arow"><button class="mini" data-act="newdoc" style="--c:' + LV[3].c + '">' + ic('plus', 13) + 'New Drive doc</button>' +
    '<button class="mini neutral" data-act="attach">' + ic('link', 13) + 'Attach existing link</button></div>', '', 'span');
}
function dossierView(e){
  var views = { 1:lvl1View, 2:lvl2View, 3:lvl3View };
  return '<div class="doc">' + phead(e) + '<div class="lvstage">' + [1,2,3].map(function(n){
    return '<div class="lvl' + (S.lvl === n ? ' on' : '') + '" data-l="' + n + '">' + views[n](e) + '</div>';
  }).join('') + '</div></div>';
}

/* ---------- panel: edit mode ---------- */
function irow(k, label, val){
  return '<div class="irow"><span class="ilab">' + esc(label) + '</span><input data-pk="' + k + '" value="' + esc(val) + '" placeholder="—" autocomplete="off"></div>';
}
function selRow(f, prof){
  var v = prof[f.k] || '';
  return '<div class="irow"><span class="ilab">' + esc(f.label) + '</span><select data-pk="' + f.k + '">' + f.options.map(function(o){
    return '<option value="' + esc(o) + '"' + (o === v ? ' selected' : '') + '>' + esc(o ? o.charAt(0).toUpperCase() + o.slice(1) : '—') + '</option>';
  }).join('') + '</select></div>';
}
function rateLine(k, prof){
  var f = fieldDef(k), v = prof[f.k] || '';
  var h = '<div class="rrow"><span class="rlab"' + (f.hint ? ' title="' + esc(f.hint) + '"' : '') + '>' + esc(f.label) + '</span><div class="dots" data-pk="' + f.k + '" data-v="' + esc(v) + '">';
  for(var i = 1; i <= 5; i++) h += '<span class="pdot' + (String(v) === String(i) ? ' on' : '') + '" data-v="' + i + '">' + i + '</span>';
  return h + '</div></div>';
}
function tagPicker(cat, prof){
  var sel = tagList(prof[cat.k]);
  var all = cat.options.concat(sel.filter(function(x){ return cat.options.indexOf(x) < 0; }));
  return '<div class="tcat"><div class="tlab">' + esc(cat.label) + '</div><div class="tchips" data-tcat="' + cat.k + '">' +
    all.map(function(o){ return '<span class="tchip' + (sel.indexOf(o) >= 0 ? ' on' : '') + '" data-tv="' + esc(o) + '">' + esc(o) + '</span>'; }).join('') +
    '<input class="tadd" placeholder="+ add new" aria-label="Add new ' + esc(cat.label) + '"></div>' +
    '<input type="hidden" data-pk="' + cat.k + '" value="' + esc(sel.join(', ')) + '"></div>';
}
function syncTagHidden(tcat){
  var vals = [];
  $$('.tchip.on', tcat).forEach(function(c){ vals.push(c.getAttribute('data-tv')); });
  $('input[data-pk]', tcat.parentNode).value = vals.join(', ');
}
function refreshTagCat(k){
  var tcat = $('#rightbody .tchips[data-tcat="' + k + '"]'); if(!tcat) return;
  var cat = ORG_CATS.filter(function(c){ return c.k === k; })[0]; if(!cat) return;
  var sel = tagList($('input[data-pk]', tcat.parentNode).value);
  var all = cat.options.concat(sel.filter(function(x){ return cat.options.indexOf(x) < 0; }));
  tcat.innerHTML = all.map(function(o){ return '<span class="tchip' + (sel.indexOf(o) >= 0 ? ' on' : '') + '" data-tv="' + esc(o) + '">' + esc(o) + '</span>'; }).join('') +
    '<input class="tadd" placeholder="+ add new" aria-label="Add new ' + esc(cat.label) + '">';
}
function dossierEdit(e){
  var prof = e.profile || {}, c = e.contact || {};
  var narrVal = prof.enriched_value ? String(prof.enriched_value).replace(/^\d{1,3}\s*[—–-]\s*/, '') : '';
  var relF = PROFILE_FIELDS[0], ctxF = PROFILE_FIELDS[1];

  var l1 = card('user', 'Identity', 1,
      irow('display_name', 'Name', prof.display_name || dispName(e)) +
      irow('phone', 'Phone', prof.phone || (c.phones || []).join(', ')) +
      irow('email', 'Email', prof.email || (c.emails || []).join(', '))) +
    card('briefcase', 'Background', 1, irow('specialty', 'Specialty', prof.specialty || '') + irow('interests', 'Interests', prof.interests || '')) +
    card('activity', 'Ratings', 1, '<div class="rgroups">' + L1_SCORES.map(function(k){ return rateLine(k, prof); }).join('') + '</div>') +
    card('tag', 'Organizations', 1, ORG_CATS.map(function(cat){ return tagPicker(cat, prof); }).join(''));

  var evRows = sortedEvents(e).map(function(o){
    var ev = o.ev;
    return '<div class="evrow"><div><div class="evtop"><time style="color:var(--l2);font-size:11.5px;font-weight:700">' + evDate(ev.date) + '</time><span class="etype">' + esc(ev.type || 'note') + '</span></div>' +
      '<div class="evtitle">' + esc(ev.summary || '') + '</div>' + (ev.detail ? '<div class="evdetail">' + esc(ev.detail) + '</div>' : '') + '</div>' +
      '<button class="mini danger" data-act="evdel" data-evi="' + o.i + '">Remove</button></div>';
  }).join('') || '<p class="dim" style="margin:0 0 4px;font-size:13px">No events yet.</p>';
  var l2 = card('users', 'Connection', 2, selRow(relF, prof) + selRow(ctxF, prof) + '<div class="rgroups">' + rateLine('closeness', prof) + '</div>') +
    card('quote', 'Narrative', 2, '<textarea id="narrtext" data-pk="enriched_value" data-orig="' + esc(narrVal) + '" rows="5" placeholder="Write the story of how you know them.">' + esc(narrVal) + '</textarea>' +
      (assessOn() ? '<div class="genrow"><button class="mini" data-act="enrich" style="--c:' + LV[2].c + '">' + ic('zap', 13) + 'Generate assessment</button><span id="enrmsg" class="calcnote"></span></div>' : '')) +
    card('share', 'Close connections', 2, '<div class="chips">' + ((e.neighbors || []).slice(0, 12).map(function(nb){ return nbrChipHTML(nb, true); }).join('') || '<span class="dim" style="font-size:13px">None mapped yet.</span>') +
      '</div><div class="naddwrap"><input id="naddinput" placeholder="Add a close connection — type a name" autocomplete="off"><div id="naddlist"></div></div>', '', '', true) +
    card('calendar', 'Timeline', 2, evRows + '<div class="arow"><button class="mini" data-act="addevent" style="--c:' + LV[2].c + '">' + ic('plus', 13) + 'Add event</button></div>', '', 'span') +
    card('file', 'Reference notes', 2, '<textarea id="refnotes" data-pk="notes" rows="5" placeholder="Private field notes.">' + esc(prof.notes || '') + '</textarea>', '', 'span');

  var fRows = (e.files || []).map(function(f, i){
    var isDoc = f.kind === 'gdoc';
    return '<div class="evrow"><div class="fic">' + ic(isDoc ? 'file' : 'link', 16) + '</div><div><div class="evtitle">' + esc(f.name || 'Untitled') + '</div>' +
      (f.url ? '<div class="evdetail">' + esc(f.url) + '</div>' : '') + '</div><button class="mini danger" data-act="fdel" data-fi="' + i + '">Remove</button></div>';
  }).join('') || '<p class="dim" style="margin:0 0 4px;font-size:13px">No files attached.</p>';
  var l3 = card('folder', 'Files', 3, fRows + '<div class="arow"><button class="mini" data-act="newdoc" style="--c:' + LV[3].c + '">' + ic('plus', 13) + 'New Drive doc</button>' +
    '<button class="mini neutral" data-act="attach">' + ic('link', 13) + 'Attach existing link</button></div>', '', 'span');

  var qfill = '<div class="qwrap"><div class="qfill"><input id="pfree" placeholder="Describe them in your own words — “friend from church, closeness 4, really charismatic”" autocomplete="off">' +
    '<button class="mini neutral" data-act="fill">' + ic('sparkle', 13) + 'Auto-fill</button><span id="pfillmsg"></span></div></div>';
  return '<div class="doc edit">' + phead(e) + '<div class="lvstage">' + qfill +
    [1,2,3].map(function(n){ return '<div class="lvl' + (S.lvl === n ? ' on' : '') + '" data-l="' + n + '">' + (n === 1 ? l1 : n === 2 ? l2 : l3) + '</div>'; }).join('') +
    '</div><div class="efoot"><span id="savestate" class="savestate">All changes saved</span><span class="esp"></span>' +
    '<button class="ibtn solid" data-act="done">' + ic('check', 16) + '<span>Done</span></button></div></div>';
}

/* ---------- panel: render + navigation ---------- */
function renderPanel(keep){
  var body = $('#rightbody'), panel = $('#right');
  if(S.sel === null){
    panel.classList.remove('open'); document.body.classList.remove('panelopen');
    body.innerHTML = ''; return;
  }
  var st = null;
  if(keep){ var old = $('.lvstage', body); if(old) st = old.scrollTop; }
  panel.classList.add('open'); document.body.classList.add('panelopen');
  var e = D.directory[S.sel];
  body.innerHTML = S.editing ? dossierEdit(e) : dossierView(e);
  var stg = $('.lvstage', body);
  if(stg && st != null) stg.scrollTop = st;
}
function flushSave(){
  if(S.saveTimer){ clearTimeout(S.saveTimer); S.saveTimer = null; if(S.sel !== null) saveProfile(true, S.sel); }
}
function rerender(){ flushSave(); renderPanel(true); }
function markSel(){
  $$('#leftbody [data-i]').forEach(function(el){ el.classList.toggle('sel', parseInt(el.getAttribute('data-i'), 10) === S.sel); });
}
function openPerson(idx, o){
  o = o || {};
  if(idx == null || !D.directory[idx]) return;
  flushSave();
  if(o.push && S.sel !== null && S.sel !== idx) S.hist.push(S.sel);
  else if(!o.keepHist) S.hist = [];
  S.sel = idx; S.editing = !!o.edit; S.lvl = o.lvl || 1;
  markSel();
  var row = $('#leftbody [data-i="' + idx + '"]');
  if(row) row.scrollIntoView({ block:'nearest' });
  var n = NODES.filter(function(x){ return x.i === idx; })[0];
  if(n) hub.target = { x:rotX(n), y:rotY(n) };
  renderPanel(false);
  glSyncFocus();
}
function closePanel(){
  flushSave();
  S.sel = null; S.editing = false; S.hist = [];
  markSel(); renderPanel(false); glSyncFocus();
}
function goBack(){
  if(!S.hist.length) return;
  var prev = S.hist.pop();
  openPerson(prev, { keepHist:true });
}
function setLevel(n){
  if(S.sel === null) return;
  S.lvl = n;
  $$('#rightbody .tab').forEach(function(t){ t.classList.toggle('on', parseInt(t.getAttribute('data-lvl'), 10) === n); });
  $$('#rightbody .lvl').forEach(function(l){ l.classList.toggle('on', parseInt(l.getAttribute('data-l'), 10) === n); });
  var stg = $('#rightbody .lvstage'); if(stg) stg.scrollTop = 0;
}
function enterEdit(lv){
  if(S.sel === null) return;
  S.editing = true; if(lv) S.lvl = lv;
  renderPanel(false);
}
function exitEdit(){
  flushSave(); S.editing = false; renderPanel(true); refresh();
}
function nextNeedsAudit(){
  var rows = listRows().filter(function(di){ return di !== S.sel && (D.directory[di].profile || {}).audit !== 'audited'; });
  return rows.length ? rows[0] : null;
}

/* ---------- panel actions ---------- */
function closeMenus(){ $$('.menu-pop').forEach(function(m){ m.hidden = true; }); }
function act(a, el){
  if(a !== 'menu') closeMenus();
  var e = S.sel !== null ? D.directory[S.sel] : null;
  switch(a){
    case 'close': closePanel(); break;
    case 'back': goBack(); break;
    case 'edit': enterEdit(); break;
    case 'done': exitEdit(); break;
    case 'wide': S.wide = !S.wide; document.body.classList.toggle('panelwide', S.wide); rerender(); break;
    case 'menu': var pop = $('.menu-pop', el.parentNode); pop.hidden = !pop.hidden; break;
    case 'tab': setLevel(parseInt(el.getAttribute('data-lvl'), 10) || 1); break;
    case 'goedit': enterEdit(parseInt(el.getAttribute('data-lvl'), 10) || 1); break;
    case 'audit': toggleAudit(); break;
    case 'auditnext':
      var nx = nextNeedsAudit();
      setAudit('audited');
      if(nx != null) openPerson(nx); else toast('That was the last one in this list.');
      break;
    case 'export': exportDossier(); break;
    case 'viewdoc': viewDossier(); break;
    case 'cardtoggle': { var tsec = el.closest('.card'); if(tsec) tsec.classList.toggle('is-collapsed'); break; }
    case 'delete': deletePerson(); break;
    case 'addevent': openEventComposer(); break;
    case 'newdoc': openDocComposer(); break;
    case 'attach': openFileComposer(); break;
    case 'evdel': delEvent(parseInt(el.getAttribute('data-evi'), 10)); break;
    case 'fdel': delFile(parseInt(el.getAttribute('data-fi'), 10)); break;
    case 'enrich': runEnrich(); break;
    case 'fill': fillFromText(); break;
    case 'nav': openPerson(parseInt(el.getAttribute('data-di'), 10), { push:true }); break;
    case 'rmnx': removeClose(e, el.getAttribute('data-u')); break;
    case 'tagfilter':
      S.tag = { k:el.getAttribute('data-tagk'), v:el.getAttribute('data-tagv') };
      S.rail = 'people'; S.limit = 200; S.listOpen = true;
      document.body.classList.remove('nolist'); $('#listtoggle').classList.add('on');
      refresh(); toast('Showing everyone at ' + S.tag.v);
      break;
  }
}

/* ---------- saving ---------- */
function setSaveState(t, cls){
  var el = $('#savestate'); if(!el) return;
  el.textContent = t || ''; el.className = 'savestate' + (cls ? ' ' + cls : '');
}
function markDirty(){
  setSaveState('Unsaved changes', 'dim');
  clearTimeout(S.saveTimer);
  var idx = S.sel;
  S.saveTimer = setTimeout(function(){ S.saveTimer = null; saveProfile(true, idx); }, 1800);
}
function collectProfile(e){
  var prof = e.profile || {}, changed = {};
  $$('#rightbody [data-pk]').forEach(function(inp){
    var k = inp.getAttribute('data-pk'), nv;
    if(k === 'phone') inp.value = String(inp.value).split(',').map(function(x){ return fmtPhone(x); }).join(', ');
    if(inp.classList && inp.classList.contains('dots')) nv = inp.getAttribute('data-v') || '';
    else nv = inp.value;
    if(k === 'enriched_value'){
      if(nv === inp.getAttribute('data-orig')) return;
      var pm = String(prof.enriched_value || '').match(/^\d{1,3}\s*[—–-]\s*/);
      if(pm) nv = pm[0] + nv;
    }
    if(nv !== (prof[k] || '')) changed[k] = nv;
  });
  return changed;
}
function postKind(kind, id, patch, pw, onOk, onErr){
  fetch(WEBAPP_URL, {
    method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' },
    body:JSON.stringify({ password:pw, kind:kind, id:id, patch:patch })
  }).then(function(r){ return r.json(); }).then(function(res){
    if(res && res.ok) onOk(res); else onErr('Save failed: ' + ((res && res.error) || 'unknown'));
  }).catch(function(){ onErr('Network error.'); });
}
function getPw(){ return ''; }
function applyProfileEdit(e, changed){
  e.profile = e.profile || {};
  Object.keys(changed).forEach(function(k){ e.profile[k] = changed[k]; });
  if(changed.display_name) e.display = changed.display_name;
}
function saveProfile(auto, idx){
  if(idx === undefined || idx === null) idx = S.sel;
  var e = D.directory[idx]; if(!e) return;
  if(!WEBAPP_URL){ if(!auto) toast('Editing is not set up: the web app URL is missing.'); return; }
  var changed = collectProfile(e);
  if(!Object.keys(changed).length){ setSaveState('All changes saved'); return; }
  applyProfileEdit(e, changed);
  clearTimeout(S.saveTimer); S.saveTimer = null;
  refresh();
  setSaveState('Saving…', 'dim');
  postKind('profile', pkey(e), changed, getPw(), function(){
    setSaveState('All changes saved');
  }, function(err){
    setSaveState('Could not save. Retrying…', 'err');
    if(!auto) toast(err + ' Kept on screen, will retry.');
    clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(function(){ S.saveTimer = null; saveProfile(true, idx); }, 8000);
  });
}
function setAudit(next){
  var e = D.directory[S.sel]; if(!e) return;
  if(!WEBAPP_URL){ toast('Editing is not set up: the web app URL is missing.'); return; }
  flushSave();
  e.profile = e.profile || {}; e.profile.audit = next;
  renderPanel(true); refresh();
  postKind('profile', pkey(e), { audit:next }, getPw(), function(){
    toast(next === 'audited' ? 'Marked as audited.' : 'Back to needs audit.');
  }, function(err){ toast(err + ' Tap again to retry.'); });
}
function toggleAudit(){
  var e = D.directory[S.sel]; if(!e) return;
  setAudit(((e.profile || {}).audit === 'audited') ? 'needs_audit' : 'audited');
}

/* ---------- predictive profile read (ultra-granular) ---------- */
var READ_CORE = [
  { k:'presence', label:'Presence', desc:'Commands attention when they walk in.',
    traits:['charisma','reputation','assertiveness'],
    hi:'Magnetic in a room \u2014 people orient toward them.', lo:'Quiet footprint \u2014 easy to overlook, often underestimated.' },
  { k:'trust', label:'Trust', desc:'You can hand them something important.',
    traits:['reliability','closeness','competence'],
    hi:'Someone you can count on \u2014 follow-through is the norm.', lo:'Unproven \u2014 enjoy, but verify.' },
  { k:'depth', label:'Depth', desc:'Conversations go somewhere real.',
    traits:['intellect','creativity'],
    hi:'Real inner life \u2014 conversations go somewhere.', lo:'Surface signal so far \u2014 untested past first impressions.' },
  { k:'edge', label:'Edge', desc:'Pushes their own agenda, for better or worse.',
    traits:['ego','assertiveness'],
    hi:'Strong-willed \u2014 directness lands better than hints.', lo:'Easygoing \u2014 unlikely to push back, even when they should.' }
];
var READ_FX = [
  { k:'flake', label:'Flake Risk', desc:'Chance they disappear when it counts.',
    parts:[['ego',1],['reliability',-1],['closeness',-1]],
    hi:'May vanish when it counts \u2014 don\u2019t build plans on them.', lo:'Shows up when it matters.' },
  { k:'surface', label:'Surface Charm', desc:'Sparkle without substance.',
    parts:[['charisma',1],['intellect',-1]],
    hi:'All sparkle, no substance \u2014 keep expectations shallow.', lo:'What you see is roughly what\u2019s there.' },
  { k:'qdrive', label:'Quiet Drive', desc:'Moves things forward without needing credit.',
    parts:[['assertiveness',1],['ego',-1]],
    hi:'Gets things done without needing the credit.', lo:'Needs a visible incentive to act.' },
  { k:'under', label:'Underrated', desc:'Better than people think.',
    parts:[['competence',1],['reputation',-1]],
    hi:'Better than their reputation suggests \u2014 look closer.', lo:'Reputation matches the reality.' },
  { k:'over', label:'Overrated', desc:'Coasting on name recognition.',
    parts:[['reputation',1],['competence',-1]],
    hi:'Coasting on name recognition \u2014 verify before trusting.', lo:'No hype gap \u2014 standing is earned.' },
  { k:'intensity', label:'Intensity', desc:'How heavy the relationship feels.',
    parts:[['closeness',1],['assertiveness',1]],
    hi:'The relationship runs heavy \u2014 set the pace deliberately.', lo:'Light touch \u2014 easy to keep at arm\u2019s length.' },
  { k:'like', label:'Likability', desc:'How easy they are to be around.',
    parts:[['charisma',1],['closeness',1],['reliability',1]],
    hi:'Easy to be around \u2014 rooms warm up to them.', lo:'An acquired taste \u2014 don\u2019t force it.' },
  { k:'follow', label:'Follow-through', desc:'Finishes what they start.',
    parts:[['reliability',1],['competence',1]],
    hi:'Finishes what they start.', lo:'Starts more than they finish.' },
  { k:'vol', label:'Volatility', desc:'Expect unpredictability.',
    parts:[['ego',1],['assertiveness',1],['reliability',-1]],
    hi:'Unpredictable \u2014 plan buffers.', lo:'Steady \u2014 few surprises.' }
];
var READ_TRAITS = ['closeness','charisma','competence','intellect','creativity','reliability','reputation','assertiveness','ego'];
function metricScore(prof, parts){
  var vals = [];
  parts.forEach(function(p){
    var v = parseFloat(prof[p[0]]);
    if(isNaN(v)) return;
    vals.push(p[1] < 0 ? 6 - v : v);
  });
  if(!vals.length) return null;
  return Math.round(vals.reduce(function(a, b){ return a + b; }, 0) / vals.length / 5 * 100);
}
function profileRead(prof){
  function mk(d, group){
    var parts = d.traits ? d.traits.map(function(t){ return [t, 1]; }) : d.parts;
    return { k:d.k, label:d.label, desc:d.desc, group:group, score:metricScore(prof, parts), hi:d.hi, lo:d.lo };
  }
  var core = READ_CORE.map(function(d){ return mk(d, 'core'); });
  var fx = READ_FX.map(function(d){ return mk(d, 'fx'); });
  var rated = READ_TRAITS.filter(function(t){ return !isNaN(parseFloat(prof[t])); }).length;
  var signal = Math.round(rated / READ_TRAITS.length * 100);
  var scoredCore = core.filter(function(m){ return m.score !== null; });
  if(scoredCore.length < 2) return null;
  var top = scoredCore.slice().sort(function(a, b){ return b.score - a.score; })[0];
  var ext = null, extDev = 0;
  fx.forEach(function(m){
    if(m.score === null) return;
    var dev = Math.abs(m.score - 50);
    if(dev > extDev){ extDev = dev; ext = m; }
  });
  var inf = top.score >= 50 ? top.hi : top.lo;
  if(ext && extDev >= 15) inf += ' ' + (ext.score >= 60 ? ext.hi : ext.lo);
  return { core:core, fx:fx, signal:signal, rated:rated, inference:inf };
}
function readHTML(prof){
  var r = profileRead(prof);
  if(!r) return '';
  function rows(list){
    return list.map(function(m){
      if(m.score === null) return '';
      return '<div class="pr-dim"><span>' + m.label + '</span><div class="pr-bar"><i style="width:' + m.score +
        '%"></i></div><em>' + m.score + '</em></div><div class="pr-desc">' + esc(m.desc) + '</div>';
    }).join('');
  }
  var fxRows = rows(r.fx);
  return '<div class="pread"><div class="pr-title">Profile read</div>' +
    '<div class="pr-group">Core</div>' + rows(r.core) +
    (fxRows ? '<div class="pr-group">Interactions</div>' + fxRows : '') +
    '<div class="pr-group">Signal</div>' +
    '<div class="pr-dim"><span>Data</span><div class="pr-bar"><i style="width:' + r.signal + '%"></i></div><em>' + r.rated + '/9</em></div>' +
    '<div class="pr-desc">' + (r.rated >= 7 ? 'Solid file \u2014 this read carries weight.' : r.rated >= 4 ? 'Partial file \u2014 directionally useful.' : 'Thin file \u2014 treat as a sketch.') + '</div>' +
    '<p class="pr-inf">' + esc(r.inference) + '</p></div>';
}

/* ---------- audit dashboard ---------- */
var AUD = { open:false, q:'', f:'needs', sort:'missing', sel:{}, rows:[], undoStack:[], redoStack:[] };
var BIZ_RE = /\b(llc|inc|corp|co\.|company|church|bakery|grill|cantina|pizza|caf[eé]|studio|salon|barber|tattoo|photo|productions|realty|motors|auto|plumbing|electric|construction|landscap|farm|market|deli|pub|brewery|winery|hotel|motel|insurance|dental|clinic|school|university|college|ntc|cfc|ministr)\b/i;
var ADDR_RE = /\d+\s+[A-Za-z.]+\s+(st|street|ave|avenue|rd|road|blvd|ln|lane|dr|drive)\b|\bNY\b\s*\d{5}|\b\d{5}\b/;
function isBusiness(e){
  var t = (String(e.display || '') + ' ' + String(e.name || '')).trim();
  return BIZ_RE.test(t) || ADDR_RE.test(t);
}
function titleCase(s){
  return String(s).replace(/[\w'’]+/g, function(w){ return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); });
}
function auName(e){
  var prof = e.profile || {};
  var raw = String(e.display || prof.display_name || '').trim();
  var handle = String(e.name || '').trim();
  var biz = isBusiness(e);
  if(raw && !biz) return { name:raw, business:false, handle:handle };
  var nm = raw;
  if(!nm){
    var clean = handle.replace(/^_+|_+$/g, '');
    var parts = clean.split(/[._\-]+/).filter(function(p){ return p && !/^\d+$/.test(p); });
    if(parts.length) nm = titleCase(parts.join(' '));
  }
  if(!nm) nm = handle || 'Unknown';
  return { name:nm, business:biz, handle:handle };
}
function auditStats(e){
  var prof = e.profile || {};
  var hasR = L1_SCORES.some(function(k){ return prof[k] != null && prof[k] !== ''; });
  var hasB = !!(prof.specialty || prof.interests || ORG_CATS.some(function(c){ return String(prof[c.k] || '').trim(); }));
  var hasC = !!(prof.relationship || prof.context || (prof.closeness != null && prof.closeness !== ''));
  var audited = prof.audit === 'audited';
  var missing = (hasR ? 0 : 1) + (hasB ? 0 : 1) + (hasC ? 0 : 1) + (audited ? 0 : 1);
  return { hasR:hasR, hasB:hasB, hasC:hasC, audited:audited, missing:missing, score:4 - missing };
}
function openAudit(){
  AUD.open = true; AUD.sel = {};
  $('#auditscreen').hidden = false;
  $('#auq').value = AUD.q;
  renderAudit();
}
function closeAudit(){
  AUD.open = false;
  $('#auditscreen').hidden = true;
}
function pushUndo(entry){
  AUD.undoStack.push(entry);
  if(AUD.undoStack.length > 30) AUD.undoStack.shift();
  AUD.redoStack = [];
  updateUndoBtns();
}
function updateUndoBtns(){
  var u = $('#auundo'), r = $('#auredo');
  if(u) u.disabled = !AUD.undoStack.length;
  if(r) r.disabled = !AUD.redoStack.length;
}
function applyEntry(entry, toPrev, done){
  var items = entry.items, pending = items.length;
  if(!pending){ if(done) done(); return; }
  items.forEach(function(it){
    var e = D.directory[it.di];
    if(!e || !WEBAPP_URL){ pending--; if(!pending) fin(); return; }
    var val = toPrev ? it.prev : it.next;
    var back = toPrev ? it.next : it.prev;
    e.profile = e.profile || {};
    if(entry.postKey === 'audit') e.profile.audit = val; else e.profile.deleted = val;
    var data = {}; data[entry.postKey] = val;
    postKind('profile', pkey(e), data, getPw(), function(){ pending--; if(!pending) fin(); },
      function(err){
        if(entry.postKey === 'audit') e.profile.audit = back; else e.profile.deleted = back;
        toast('A change failed: ' + err);
        pending--; if(!pending) fin();
      });
  });
  function fin(){ renderAudit(); refresh(); if(done) done(); }
}
function doUndo(){
  var en = AUD.undoStack.pop();
  if(!en){ toast('Nothing to undo.'); return; }
  updateUndoBtns();
  applyEntry(en, true, function(){ AUD.redoStack.push(en); updateUndoBtns(); });
}
function doRedo(){
  var en = AUD.redoStack.pop();
  if(!en){ toast('Nothing to redo.'); return; }
  updateUndoBtns();
  applyEntry(en, false, function(){ AUD.undoStack.push(en); updateUndoBtns(); });
}
function setAuditFor(di, next){
  var e = D.directory[di]; if(!e) return;
  if(!WEBAPP_URL){ toast('Editing is not set up: the web app URL is missing.'); return; }
  var prev = (e.profile || {}).audit || '';
  if(prev === next) return;
  var entry = { postKey:'audit', items:[{ di:di, prev:prev, next:next }] };
  pushUndo(entry);
  applyEntry(entry, false);
}
function bulkAudit(next){
  var dis = Object.keys(AUD.sel).map(Number).filter(function(di){
    var e = D.directory[di];
    return e && (e.profile || {}).deleted !== '1' && ((e.profile || {}).audit || '') !== next;
  });
  if(!dis.length){ toast('Nothing to update.'); return; }
  var entry = { postKey:'audit', items:dis.map(function(di){
    return { di:di, prev:(D.directory[di].profile || {}).audit || '', next:next };
  }) };
  AUD.sel = {};
  pushUndo(entry);
  applyEntry(entry, false, function(){ toast(dis.length + ' updated.'); });
}
function bulkDelete(){
  var dis = Object.keys(AUD.sel).map(Number).filter(function(di){
    var e = D.directory[di];
    return e && (e.profile || {}).deleted !== '1';
  });
  if(!dis.length) return;
  if(!confirm('Delete ' + dis.length + ' from the circle?\n\nThey will be hidden from the directory and the map. You can undo this.')) return;
  var entry = { postKey:'deleted', items:dis.map(function(di){
    return { di:di, prev:(D.directory[di].profile || {}).deleted || '', next:'1' };
  }) };
  AUD.sel = {};
  pushUndo(entry);
  applyEntry(entry, false, function(){ toast(dis.length + ' deleted.'); });
}
function auSetFilter(f){
  AUD.f = f;
  $$('#aufilters button').forEach(function(x){ x.classList.toggle('on', x.getAttribute('data-f') === f); });
  renderAudit();
}
function renderAudit(){
  var q = AUD.q.trim().toLowerCase();
  var rows = [];
  D.directory.forEach(function(e, di){
    if((e.profile || {}).deleted === '1') return;
    var st = auditStats(e);
    var an = auName(e);
    var pass = true;
    if(AUD.f === 'needs') pass = st.missing > 0;
    else if(AUD.f === 'audit') pass = !st.audited;
    else if(AUD.f === 'ratings') pass = !st.hasR;
    else if(AUD.f === 'background') pass = !st.hasB;
    else if(AUD.f === 'connection') pass = !st.hasC;
    else if(AUD.f === 'business') pass = an.business;
    if(!pass) return;
    if(q){
      var hay = (an.name + ' ' + an.handle + ' ' + ((e.profile || {}).display_name || '')).toLowerCase();
      if(hay.indexOf(q) < 0) return;
    }
    rows.push({ di:di, e:e, st:st, an:an });
  });
  rows.sort(function(a, b){
    if(AUD.sort === 'name') return a.an.name.localeCompare(b.an.name);
    if(AUD.sort === 'complete') return b.st.score - a.st.score || a.an.name.localeCompare(b.an.name);
    return a.st.score - b.st.score || a.an.name.localeCompare(b.an.name);
  });
  AUD.rows = rows;
  var nA = 0, nR = 0, nB = 0, nC = 0, nBiz = 0;
  D.directory.forEach(function(e){
    if((e.profile || {}).deleted === '1') return;
    var st = auditStats(e);
    if(!st.audited) nA++; if(!st.hasR) nR++; if(!st.hasB) nB++; if(!st.hasC) nC++;
    if(isBusiness(e)) nBiz++;
  });
  $('#aushown').textContent = rows.length + ' shown';
  function stat(f, label, n){
    return '<button class="austat' + (AUD.f === f ? ' on' : '') + '" data-f="' + f + '"><b>' + n + '</b><span>' + label + '</span></button>';
  }
  $('#austats').innerHTML = stat('audit', 'Need audit', nA) + stat('ratings', 'Need ratings', nR) +
    stat('background', 'Need background', nB) + stat('connection', 'Need connection', nC) + stat('business', 'Businesses', nBiz);
  function pill(has, label){ return '<b class="' + (has ? 'have' : 'miss') + '">' + label + '</b>'; }
  $('#aubody').innerHTML = rows.map(function(r){
    var ini = (r.an.name.replace(/^@/, '').trim().charAt(0) || '·').toUpperCase();
    var hd = (r.e.src === 'contacts' || r.e.src === 'subject') ? '' : r.an.handle.replace(/^@/, '');
    var sel = AUD.sel[r.di] ? ' checked' : '';
    return '<div class="aurow" data-di="' + r.di + '">' +
      '<input type="checkbox" class="ausel" data-di="' + r.di + '"' + sel + ' aria-label="Select">' +
      '<span class="auava">' + esc(ini) + '</span>' +
      '<span class="aumain"><span class="auname">' + esc(r.an.name) +
        (r.an.business ? '<em class="aubiz">Business</em>' : '') +
        (hd ? '<i>@' + esc(hd) + '</i>' : '') + '</span>' +
      '<span class="auneeds">' + pill(r.st.hasR, 'Ratings') + pill(r.st.hasB, 'Background') + pill(r.st.hasC, 'Connection') + pill(r.st.audited, 'Audited') + '</span></span>' +
      '<span class="aubar" title="' + r.st.score + ' of 4 complete"><i style="width:' + (r.st.score * 25) + '%"></i></span>' +
      '<span class="aubtn"><button class="mini" data-auact="' + (r.st.audited ? 'unaudit' : 'audit') + '">' + (r.st.audited ? 'Reopen' : 'Mark audited') + '</button></span></div>';
  }).join('') || '<p class="dim" style="padding:20px">Nobody matches this filter.</p>';
  renderBulk();
  updateUndoBtns();
}
function renderBulk(){
  var n = Object.keys(AUD.sel).length;
  var bb = $('#aubulk');
  if(!n){ bb.hidden = true; return; }
  bb.hidden = false;
  bb.innerHTML = '<span><b>' + n + '</b> selected</span>' +
    '<button class="mini" data-bulk="audit">Mark audited</button>' +
    '<button class="mini" data-bulk="unaudit">Reopen</button>' +
    '<button class="mini danger" data-bulk="delete">Delete</button>' +
    '<button class="mini neutral" data-bulk="clear">Clear</button>';
}

function deletePerson(){
  var e = D.directory[S.sel];
  if(!e || !WEBAPP_URL){ toast('Nothing to delete.'); return; }
  var label = dispName(e);
  if(!confirm('Delete ' + label + ' from the circle?\n\nThey will be hidden from the directory and the map. You can undo this by clearing the flag in the sheet.')) return;
  postKind('profile', pkey(e), { deleted:'1' }, getPw(), function(){
    e.profile = e.profile || {}; e.profile.deleted = '1';
    closePanel(); refresh(); toast('Deleted ' + label + '.');
  }, function(err){ toast(err + ' Not deleted, try again.'); });
}
function renderNadd(q){
  var list = $('#naddlist'); if(!list) return;
  q = (q || '').trim().toLowerCase();
  var e = D.directory[S.sel], existing = {};
  (e.neighbors || []).forEach(function(n){ existing[(n.u || '').toLowerCase()] = 1; });
  if(!q || q.length < 2){ list.innerHTML = ''; return; }
  var hits = [];
  D.directory.forEach(function(r, i){
    if(i === S.sel || (r.profile || {}).deleted === '1') return;
    if(existing[(r.name || '').toLowerCase()]) return;
    var label = dispName(r);
    if((label + ' ' + (r.name || '')).toLowerCase().indexOf(q) < 0) return;
    hits.push({ i:i, label:label });
  });
  list.innerHTML = hits.length ? hits.slice(0, 6).map(function(h){ return '<div class="naddhit" data-ai="' + h.i + '">' + esc(h.label) + '</div>'; }).join('')
    : '<div class="naddhit none">No matches</div>';
}
function saveCloseLists(e){
  var prof = e.profile || {};
  postKind('profile', pkey(e), { close_add:prof.close_add || '', close_hide:prof.close_hide || '' }, getPw(),
    function(){ toast('Close connections updated.'); },
    function(err){ toast(err + ' Kept on screen, reopen to retry.'); });
}
function addClose(e, idx){
  var t = D.directory[idx];
  if(!e || !t || !WEBAPP_URL) return;
  flushSave();
  var prof = e.profile = e.profile || {};
  var key = t.name || '', kl = key.toLowerCase();
  var adds = tagList(prof.close_add);
  if(adds.map(function(x){ return x.toLowerCase(); }).indexOf(kl) < 0) adds.push(key);
  prof.close_add = adds.join(', ');
  prof.close_hide = tagList(prof.close_hide).filter(function(x){ return x.toLowerCase() !== kl; }).join(', ');
  e.neighbors = e.neighbors || [];
  if(!e.neighbors.some(function(n){ return (n.u || '').toLowerCase() === kl; })) e.neighbors.push({ u:key, d:dispName(t) });
  saveCloseLists(e); renderPanel(true);
}
function removeClose(e, u){
  if(!e || !u || !WEBAPP_URL) return;
  flushSave();
  var kl = u.toLowerCase(), prof = e.profile = e.profile || {};
  var adds = tagList(prof.close_add);
  if(adds.map(function(x){ return x.toLowerCase(); }).indexOf(kl) >= 0){
    prof.close_add = adds.filter(function(x){ return x.toLowerCase() !== kl; }).join(', ');
  } else {
    var hides = tagList(prof.close_hide);
    if(hides.map(function(x){ return x.toLowerCase(); }).indexOf(kl) < 0) hides.push(u);
    prof.close_hide = hides.join(', ');
  }
  e.neighbors = (e.neighbors || []).filter(function(n){ return (n.u || '').toLowerCase() !== kl; });
  saveCloseLists(e); renderPanel(true);
}
function fillFromText(){
  var ta = $('#pfree'), msg = $('#pfillmsg');
  var text = ta ? ta.value.trim() : '';
  if(!text){ msg.textContent = 'Describe the person first.'; return; }
  if(!WEBAPP_URL){ msg.textContent = 'Web app URL is not set up.'; return; }
  var btn = $('[data-act="fill"]');
  btn.disabled = true; msg.textContent = 'Reading…';
  fetch(WEBAPP_URL, { method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' },
    body:JSON.stringify({ password:getPw(), kind:'parseprofile', id:'parse', patch:{ text:text } }) })
    .then(function(r){ return r.json(); }).then(function(res){
      btn.disabled = false;
      if(res && res.ok && res.fields) applyParsed(res.fields, msg);
      else msg.textContent = 'Could not read that: ' + ((res && res.error) || 'unknown');
    }).catch(function(){ btn.disabled = false; msg.textContent = 'Network error.'; });
}
function applyParsed(fields, msg){
  var n = 0;
  Object.keys(fields).forEach(function(k){
    var v = fields[k];
    if(v === '' || v === null || v === undefined) return;
    var el = $('#rightbody [data-pk="' + k + '"]');
    if(!el) return;
    if(el.classList && el.classList.contains('dots')){
      v = String(parseInt(v, 10) || '');
      if(v < '1' || v > '5') return;
      el.setAttribute('data-v', v);
      $$('.pdot', el).forEach(function(d){ d.classList.toggle('on', d.getAttribute('data-v') === v); });
      n++;
    } else if(el.tagName === 'SELECT'){
      var ok = Array.prototype.some.call(el.options, function(o){ return o.value === String(v).toLowerCase(); });
      if(ok){ el.value = String(v).toLowerCase(); n++; }
    } else if(el.type === 'hidden' && (k === 'churches' || k === 'companies' || k === 'universities')){
      el.value = String(v); refreshTagCat(k); n++;
    } else { el.value = String(v); n++; }
  });
  if(n){ markDirty(); msg.textContent = 'Filled ' + n + ' field' + (n === 1 ? '' : 's') + '. Review, then Done.'; }
  else msg.textContent = 'Nothing recognizable. Try simpler wording.';
}
function runEnrich(){
  var e = D.directory[S.sel];
  if(!WEBAPP_URL){ toast('Editing is not set up: the web app URL is missing.'); return; }
  if(!S.editing){ enterEdit(2); var m0 = $('#enrmsg'); if(m0) m0.textContent = 'Write your draft above, then Generate.'; var nt = $('#narrtext'); if(nt) nt.focus(); return; }
  var btn = $('[data-act="enrich"]'), msg = $('#enrmsg'), ta = $('#narrtext');
  var draft = (ta && ta.value.trim()) || '';
  if(!draft){ msg.textContent = 'Write your draft first. Generate will clean it up.'; return; }
  btn.disabled = true; msg.textContent = 'Cleaning up…';
  flushSave();
  postKind('enrich', pkey(e), { draft:draft }, getPw(), function(res){
    e.profile = e.profile || {};
    e.profile.enriched = '1'; e.profile.enriched_value = res.value; e.profile.enriched_at = res.at;
    renderPanel(true); refresh(); toast('Assessment generated.');
  }, function(err){ msg.textContent = err; btn.disabled = false; });
}

/* ---------- export ---------- */
function dossierFileName(e){
  var base = String(dispName(e) || 'person').replace(/[\\/:*?"<>|]/g, '').trim() || 'person';
  return 'Dossier - ' + base + '.html';
}
function buildDossierDoc(e){
  var prof = e.profile || {}, c = e.contact || {};
  var name = dispName(e);
  var handle = (e.src === 'contacts' || e.src === 'subject') ? '' : '@' + (e.name || '');
  var aka = (prof.display_name && prof.display_name !== name) ? prof.display_name : '';
  var today = new Date();
  var ds = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  var bio = prof.enriched_value ? String(prof.enriched_value).replace(/^\d{1,3}\s*[—–-]\s*/, '') : '';
  var score = '';
  if(prof.enriched_value){ var m = String(prof.enriched_value).match(/^(\d{1,3})\s*[—–-]/); if(m) score = m[1] + ' / 100'; }
  var classif = [prof.relationship, prof.context].filter(Boolean).join(' · ');
  var orgs = [];
  ORG_CATS.forEach(function(cat){ tagList(prof[cat.k]).forEach(function(v){ orgs.push(v); }); });
  var contact = [];
  if(handle) contact.push('<span class="cl">Instagram</span> ' + esc(handle));
  var emails = prof.email || (c.emails || []).join(', ');
  if(emails) contact.push('<span class="cl">Email</span> ' + esc(emails));
  var phones = prof.phone || (c.phones || []).join(', ');
  if(phones) contact.push('<span class="cl">Phone</span> ' + esc(phones));
  if(orgs.length) contact.push('<span class="cl">Orgs</span> ' + esc(orgs.join(' · ')));
  var bars = SCORE_FIELDS.map(function(f){
    var v = parseInt(prof[f.k], 10), ok = !isNaN(v);
    var w = ok ? Math.max(0, Math.min(5, v)) / 5 * 100 : 0;
    return '<div class="brow"><span>' + esc(f.label) + '</span><div class="bar"><i style="width:' + w + '%"></i></div><em>' + (ok ? v + '/5' : '—') + '</em></div>';
  }).join('');
  var extras = '';
  if(prof.specialty) extras += '<div class="kv"><span class="cl">Specialty</span> ' + esc(prof.specialty) + '</div>';
  if(prof.interests) extras += '<div class="kv"><span class="cl">Interests</span> ' + esc(prof.interests) + '</div>';
  if(score) extras += '<div class="kv"><span class="cl">Assessment</span> ' + esc(score) + '</div>';
  var assoc = (e.neighbors || []).map(function(nb){ return '<li>' + esc(nb.d || nb.u) + '</li>'; }).join('');
  var notes = '';
  if(prof.notes) notes += '<p>' + esc(prof.notes).replace(/\n/g, '<br>') + '</p>';
  if(e.public_footprint) notes += '<p><b>Public footprint</b><br>' + esc(e.public_footprint).replace(/\n/g, '<br>') + '</p>';
  if(!notes) notes = '<p>—</p>';
  var meta = ['Compiled ' + ds];
  if(prof.enriched_at) meta.push('Last assessment ' + esc(prof.enriched_at));
  if(classif) meta.push(esc(classif));
  meta.push((e.degree || 0) + ' graph connections');
  if(e.shared_with_jd) meta.push(e.shared_with_jd + ' shared');
  if(e.detail) meta.push('File note: ' + esc(e.detail));
  var evs = sortedEvents(e);
  var tl = evs.length
    ? '<ul class="assoc">' + evs.map(function(o){
        var ev = o.ev;
        return '<li><b>' + esc(ev.date || '') + '</b> [' + esc(ev.type || 'note') + '] — ' + esc(ev.summary || '') + (ev.detail ? '<br>' + esc(ev.detail) : '') + '</li>';
      }).join('') + '</ul>'
    : '<div class="sbody"><p>—</p></div>';
  var fls = (e.files || []).length
    ? '<ul class="assoc">' + (e.files || []).map(function(f){
        return '<li>' + esc(f.name || 'Untitled') + (f.url ? '<br>' + esc(f.url) : '') + (f.note ? '<br>' + esc(f.note) : '') + '</li>';
      }).join('') + '</ul>'
    : '<div class="sbody"><p>—</p></div>';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<title>Dossier — ' + esc(name) + '</title><style>' +
  'body{background:#26292f;margin:0;padding:28px;font-family:"Courier New",Courier,monospace;color:#141414}' +
  '.page{background:#f5f2e9;max-width:820px;margin:0 auto;padding:44px 48px;box-shadow:0 0 50px rgba(0,0,0,.55)}' +
  '.hero h1{font-size:34px;margin:0 0 4px;letter-spacing:.02em}' +
  '.hero .aka{font-size:13px;color:#333;margin-bottom:8px}' +
  '.contact{font-size:13px;line-height:2;margin-bottom:4px}' +
  '.cl{font-size:10.5px;letter-spacing:.14em;font-weight:700;margin-right:5px}' +
  '.meta{font-size:12px;color:#333;border-top:2px solid #141414;border-bottom:1px solid #141414;padding:9px 0;margin:14px 0 22px;line-height:1.8}' +
  '.sec{margin:0 0 20px}.slabel{font-size:12px;letter-spacing:.14em;font-weight:700;margin-bottom:8px}' +
  '.sbody{font-size:13px;line-height:1.65}.sbody p{margin:0 0 10px}' +
  '.brow{display:flex;align-items:center;gap:10px;margin-bottom:7px}' +
  '.brow span{width:120px;font-size:11px;letter-spacing:.08em;font-weight:700}' +
  '.brow .bar{flex:1;height:11px;border:1.5px solid #141414}' +
  '.brow .bar i{display:block;height:100%;background:#141414}' +
  '.brow em{font-style:normal;font-size:11.5px;width:36px;text-align:right}' +
  '.kv{font-size:13px;margin:6px 0}' +
  '.cols{display:flex;gap:28px}.cols .col{flex:1;min-width:0}' +
  'ul.assoc{margin:0;padding-left:22px;font-size:13px;line-height:1.7}' +
  '.foot{border-top:2px solid #141414;margin-top:26px;padding-top:10px;font-size:11px}' +
  '.foot .sig{font-family:"Segoe Script",cursive;font-size:22px;margin:6px 0}' +
  '@media print{body{background:#fff;padding:0}.page{box-shadow:none;max-width:none}}' +
  '</style></head><body><div class="page">' +
  '<div class="hero"><h1>' + esc(name) + '</h1>' +
  (aka ? '<div class="aka">also known as ' + esc(aka) + '</div>' : '') +
  (contact.length ? '<div class="contact">' + contact.join('<br>') + '</div>' : '') + '</div>' +
  '<div class="meta">' + meta.join(' &nbsp;·&nbsp; ') + '</div>' +
  '<div class="sec"><div class="slabel">SYNOPSIS</div><div class="sbody">' + (bio ? '<p>' + esc(bio) + '</p>' : '<p>—</p>') + '</div></div>' +
  '<div class="sec"><div class="slabel">PROFILE RATINGS</div><div class="bars">' + bars + '</div>' + extras + '</div>' +
  '<div class="cols"><div class="col"><div class="sec"><div class="slabel">KNOWN ASSOCIATES</div>' +
    (assoc ? '<ul class="assoc">' + assoc + '</ul>' : '<div class="sbody"><p>—</p></div>') + '</div></div>' +
  '<div class="col"><div class="sec"><div class="slabel">FIELD NOTES</div><div class="sbody">' + notes + '</div></div></div></div>' +
  '<div class="sec"><div class="slabel">TIMELINE</div><div class="sbody">' + tl + '</div></div>' +
  '<div class="sec"><div class="slabel">ATTACHED FILES</div><div class="sbody">' + fls + '</div></div>' +
  '<div class="foot"><div>APPROVED / FORWARDED BY</div><div class="sig">J. Meyers</div></div>' +
  '</div></body></html>';
}

function exportDossier(){
  var e = D.directory[S.sel];
  if(!e){ toast('Nothing to export.'); return; }
  var html, fname;
  try{ html = buildDossierDoc(e); fname = dossierFileName(e); }
  catch(err){ toast('Could not build the document.'); return; }
  try{
    var blob = new Blob([html], { type:'text/html' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = fname;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    toast('Downloaded ' + fname);
  }catch(x){ toast('Download failed.'); }
}
function viewDossier(){
  var e = D.directory[S.sel];
  if(!e){ toast('Nothing to view.'); return; }
  var html;
  try{ html = buildDossierDoc(e); }
  catch(err){ toast('Could not build the document.'); return; }
  try{
    var blob = new Blob([html], { type:'text/html' });
    var url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(function(){ URL.revokeObjectURL(url); }, 120000);
  }catch(x){ toast('Could not open the document.'); }
}

/* ---------- modals: event, file, doc, settings ---------- */
function openModal(title, bodyHTML, lv, wide){
  closeModal();
  document.body.insertAdjacentHTML('beforeend',
    '<div id="modal"><div class="mcard' + (wide ? ' wide' : '') + '" role="dialog" aria-label="' + esc(title) + '" style="--lc:' + (lv ? LV[lv].c : '#ece9e2') + '">' +
    '<div class="mhd"><h2>' + esc(title) + '</h2><span class="sp"></span><button class="ibtn" id="mclose" aria-label="Close">' + ic('x', 16) + '</button></div>' +
    '<div class="mb">' + bodyHTML + '</div></div></div>');
  $('#mclose').addEventListener('click', closeModal);
  $('#modal').addEventListener('mousedown', function(ev){ if(ev.target.id === 'modal') closeModal(); });
}
function closeModal(){ var m = $('#modal'); if(m) m.remove(); }
function todayStr(){
  var t = new Date();
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
}
function ensureSubject(e, cb){
  if(e.record && e.record.slug){ cb(); return; }
  var slug = subjSlug(e);
  postKind('subject', slug, { name:dispName(e), events:'[]', files:'[]' }, getPw(), function(res){
    if(res && res.api !== 3){ toast('The sheet script needs a redeploy before timelines can save.'); return; }
    e.record = { slug:slug, events:[], files:[] };
    e.events = e.events || []; e.files = e.files || [];
    cb();
  }, function(err){ toast(err + ' Could not create the subject file.'); });
}
function saveSubjectPatch(patch, okMsg){
  var e = D.directory[S.sel]; if(!e) return;
  flushSave();
  toast('Saving…');
  postKind('subject', subjSlug(e), patch, getPw(), function(res){
    toast(res && res.api !== 3 ? 'Saved on screen only. The sheet script needs a redeploy to keep it.' : (okMsg || 'Saved.'));
    renderPanel(true); refresh();
  }, function(err){
    toast(err + ' Kept on screen, reopen to retry.');
    renderPanel(true); refresh();
  });
}
function openEventComposer(){
  var e = D.directory[S.sel];
  if(!e || !WEBAPP_URL){ toast('Nothing to add to.'); return; }
  openModal('Add timeline event',
    '<label class="lab">For ' + esc(dispName(e)) + '<span class="sh">Saved to their Story tab. Press Ctrl or Cmd + Enter to save.</span></label>' +
    '<div class="two"><input type="text" id="evdate" value="' + todayStr() + '" placeholder="YYYY-MM-DD" autocomplete="off">' +
    '<select id="evtype"><option value="milestone">Milestone</option><option value="note" selected>Note</option><option value="life event">Life event</option></select></div>' +
    '<input type="text" id="evtitle" placeholder="Headline, for example: Started a new job" autocomplete="off">' +
    '<textarea id="evdetail" rows="4" placeholder="Details (optional)"></textarea>' +
    '<div class="arow"><button id="evsave" class="mini" style="--c:' + LV[2].c + '">' + ic('plus', 13) + 'Add to timeline</button></div>', 2);
  $('#evsave').addEventListener('click', saveEvent);
  $('#modal').addEventListener('keydown', function(ev){ if((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter'){ ev.preventDefault(); saveEvent(); } });
  $('#evtitle').focus();
}
function saveEvent(){
  var e = D.directory[S.sel]; if(!e){ closeModal(); return; }
  var date = $('#evdate').value.trim(), type = $('#evtype').value;
  var summary = $('#evtitle').value.trim(), detail = $('#evdetail').value.trim();
  if(!summary){ toast('Give the event a headline.'); return; }
  if(!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(date)){ toast('Use a date like 2026-10-04.'); return; }
  ensureSubject(e, function(){
    var ev = { date:date, type:type, summary:summary };
    if(detail) ev.detail = detail;
    e.events = e.events || []; e.events.push(ev);
    closeModal();
    saveSubjectPatch({ events:JSON.stringify(e.events) }, 'Added to the timeline.');
  });
}
function delEvent(i){
  var e = D.directory[S.sel];
  if(!e || !e.events || !e.events[i]) return;
  if(!confirm('Remove this timeline event?\n\n' + (e.events[i].summary || ''))) return;
  e.events.splice(i, 1);
  saveSubjectPatch({ events:JSON.stringify(e.events) }, 'Event removed.');
}
function openFileComposer(){
  var e = D.directory[S.sel];
  if(!e || !WEBAPP_URL){ toast('Nothing to attach to.'); return; }
  openModal('Attach a file link',
    '<label class="lab">For ' + esc(dispName(e)) + '<span class="sh">Paste a Google Drive or Docs link. It shows on their Files tab.</span></label>' +
    '<input type="text" id="fname" placeholder="Name, for example: Full journal record" autocomplete="off">' +
    '<input type="text" id="furl" placeholder="https://docs.google.com/…" autocomplete="off">' +
    '<textarea id="fnote" rows="2" placeholder="Note about this file (optional)"></textarea>' +
    '<div class="arow"><button id="fsave" class="mini" style="--c:' + LV[3].c + '">' + ic('link', 13) + 'Attach</button></div>', 3);
  $('#fsave').addEventListener('click', saveFileLink);
  $('#fname').focus();
}
function saveFileLink(){
  var e = D.directory[S.sel]; if(!e){ closeModal(); return; }
  var nm = $('#fname').value.trim(), url = $('#furl').value.trim(), note = $('#fnote').value.trim();
  if(!nm){ toast('Name the file first.'); return; }
  if(!url){ toast('Paste the file link.'); return; }
  ensureSubject(e, function(){
    var f = { name:nm, kind:url.indexOf('docs.google.com') >= 0 ? 'gdoc' : 'link', url:url };
    if(note) f.note = note;
    e.files = e.files || []; e.files.push(f);
    closeModal();
    saveSubjectPatch({ files:JSON.stringify(e.files) }, 'File attached.');
  });
}
function openDocComposer(){
  var e = D.directory[S.sel];
  if(!e || !WEBAPP_URL){ toast('Nothing to create for.'); return; }
  openModal('New Drive doc',
    '<label class="lab">For ' + esc(dispName(e)) + '<span class="sh">Creates a Google Doc in the North Country Circle Files folder and attaches it to their Files tab.</span></label>' +
    '<input type="text" id="dtitle" placeholder="Doc title, for example: Full journal record" autocomplete="off">' +
    '<div class="arow"><button id="dsave" class="mini" style="--c:' + LV[3].c + '">' + ic('plus', 13) + 'Create doc</button></div>', 3);
  $('#dsave').addEventListener('click', saveNewDoc);
  $('#dtitle').addEventListener('keydown', function(ev){ if(ev.key === 'Enter'){ ev.preventDefault(); saveNewDoc(); } });
  $('#dtitle').focus();
}
function saveNewDoc(){
  var e = D.directory[S.sel]; if(!e){ closeModal(); return; }
  var title = $('#dtitle').value.trim();
  if(!title){ toast('Title the doc first.'); return; }
  var btn = $('#dsave'); btn.disabled = true;
  ensureSubject(e, function(){
    postKind('createdoc', subjSlug(e), { title:title }, getPw(), function(res){
      if(!res || !res.url){ btn.disabled = false; toast('Doc creation failed.'); return; }
      e.files = e.files || [];
      e.files.push({ name:res.name || title, kind:'gdoc', url:res.url });
      closeModal();
      saveSubjectPatch({ files:JSON.stringify(e.files) }, 'Doc created and attached.');
    }, function(err){ btn.disabled = false; toast(err + ' Not created.'); });
  });
}
function delFile(i){
  var e = D.directory[S.sel];
  if(!e || !e.files || !e.files[i]) return;
  if(!confirm('Remove this file attachment?\n\n' + (e.files[i].name || ''))) return;
  e.files.splice(i, 1);
  saveSubjectPatch({ files:JSON.stringify(e.files) }, 'File removed.');
}

/* settings */
function assessOn(){ return store('ncc_show_assess') === '1'; }
function reviewQueueHTML(){
  var rows = [];
  D.directory.forEach(function(r, i){
    var pr = r.profile || {};
    if(!pr.review_flag || pr.deleted === '1') return;
    var label = pr.review_flag === 'duplicate' ? 'Possible duplicate' : (pr.review_flag === 'missing_info' ? 'Missing info' : pr.review_flag);
    rows.push('<div class="revrow" data-ri="' + i + '"><b>' + esc(dispName(r)) + '</b><span>' + esc(label) + '</span></div>');
  });
  return rows.length ? rows.join('') : '<p class="dim" style="margin:0;font-size:13px">Nothing flagged. Set “Needs review” on a person’s file to queue them here.</p>';
}
function openSettings(){
  openModal('Settings',
    '<label class="setrow"><input type="checkbox" id="setassess"' + (assessOn() ? ' checked' : '') + '><span>Show the “Generate assessment” button<span class="sh">Off by default. Brings back the Gemini draft button on the Story tab.</span></span></label>' +
    '<label class="lab">Keyboard shortcuts</label>' +
    '<div class="keys"><kbd>/</kbd><span>Search</span><kbd>↑ ↓</kbd><span>Move through the directory</span><kbd>1 2 3</kbd><span>Snapshot, Story, Files</span><kbd>E</kbd><span>Edit the open dossier</span>' +
    '<kbd>Alt ←</kbd><span>Back to the previous person</span><kbd>Esc</kbd><span>Back, finish editing, or close</span><kbd>B</kbd><span>Show or hide the directory</span></div>' +
    '<label class="lab">Bio prompt<span class="sh">Sent to Gemini with the person’s facts on every Generate.</span></label>' +
    '<textarea id="setprompt" rows="8" placeholder="Loading…"></textarea>' +
    '<label class="lab">Gemini API key<span class="sh">Stored in the sheet, server-side only. Get one at aistudio.google.com.</span></label>' +
    '<input type="password" id="setkey" placeholder="AIza…" autocomplete="off">' +
    '<div class="arow"><button id="setsave" class="mini neutral">Save settings</button><button id="settest" class="mini neutral">Test Gemini</button><button id="setclear" class="mini neutral">Clear key</button><span id="setmsg"></span></div>' +
    '<div class="revq"><h3>Needs review</h3><div id="revqlist">' + reviewQueueHTML() + '</div></div>', 0, true);
  $('#setassess').addEventListener('change', function(){ store('ncc_show_assess', this.checked ? '1' : '0'); if(S.sel !== null) renderPanel(true); });
  $('#revqlist').addEventListener('click', function(ev){
    var row = ev.target.closest('.revrow'); if(!row) return;
    var i = parseInt(row.getAttribute('data-ri'), 10);
    closeModal(); if(i >= 0) openPerson(i);
  });
  $('#setsave').addEventListener('click', saveSettings);
  $('#settest').addEventListener('click', testGemini);
  $('#setclear').addEventListener('click', clearGeminiKey);
  loadSettings();
}
function settingsCall(kind, patch, cb){
  var msg = $('#setmsg');
  if(!WEBAPP_URL){ if(msg) msg.textContent = 'Web app URL is not set up.'; return; }
  fetch(WEBAPP_URL, { method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' },
    body:JSON.stringify({ password:getPw(), kind:kind, id:'settings', patch:patch }) })
    .then(function(r){ return r.json(); }).then(cb)
    .catch(function(){ var m = $('#setmsg'); if(m) m.textContent = 'Network error.'; });
}
function loadSettings(){
  settingsCall('getsettings', { x:1 }, function(res){
    var m = $('#setmsg'), p = $('#setprompt'), k = $('#setkey'); if(!p) return;
    if(res && res.ok){
      p.value = res.prompt || '';
      k.placeholder = res.hasKey ? 'Key saved. Enter a new one to replace it.' : 'AIza…';
    } else if(m) m.textContent = 'Could not load: ' + ((res && res.error) || 'unknown');
  });
}
function saveSettings(){
  var msg = $('#setmsg'), patch = { prompt:$('#setprompt').value }, kv = $('#setkey').value;
  if(kv) patch.gemini_key = kv;
  msg.textContent = 'Saving…';
  settingsCall('settings', patch, function(res){ msg.textContent = (res && res.ok) ? 'Saved.' : 'Save failed: ' + ((res && res.error) || 'unknown'); });
}
function testGemini(){
  var msg = $('#setmsg'); msg.textContent = 'Testing…';
  settingsCall('testgemini', { x:1 }, function(res){ msg.textContent = (res && res.ok) ? 'Gemini says: ' + res.reply : 'Test failed: ' + ((res && res.error) || 'unknown'); });
}
function clearGeminiKey(){
  var msg = $('#setmsg'); msg.textContent = 'Clearing…';
  settingsCall('settings', { clear_key:true }, function(res){
    msg.textContent = (res && res.ok) ? 'Key cleared.' : 'Clear failed: ' + ((res && res.error) || 'unknown');
    if(res && res.ok) loadSettings();
  });
}

/* ---------- map: layout ---------- */
function buildNodes(){
  var dir = D.directory, maxS = 1;
  dir.forEach(function(r){ if(r.strength > maxS) maxS = r.strength; });
  ORDER = dir.map(function(r, i){ return i; })
    .filter(function(i){ return dir[i].has_graph !== false; })
    .sort(function(a, b){ return dir[b].strength - dir[a].strength || a - b; });
  LIST_ORDER = dir.map(function(r, i){ return i; })
    .filter(function(i){ var r = dir[i]; return r.has_graph !== false || (r.events || []).length || (r.files || []).length || !!r.record; })
    .sort(function(a, b){ return dir[b].strength - dir[a].strength || a - b; });
  var bounds = [60, 300, dir.length], radii = [170, 310, 490], spread = [16, 36, 50], counts = [0, 0, 0];
  NODES = ORDER.map(function(di, pos){
    var ring = pos < bounds[0] ? 0 : (pos < bounds[1] ? 1 : 2);
    var k = counts[ring]++;
    var n = ring === 0 ? bounds[0] : (ring === 1 ? bounds[1] - bounds[0] : dir.length - bounds[1]);
    var rng = mulberry32(di * 2654435761 % 2147483647);
    var ang = (k / n) * Math.PI * 2 + (rng() - 0.5) * (Math.PI * 2 / n) * 0.6 + ring * 0.7;
    var rad = radii[ring] + (rng() - 0.5) * 2 * spread[ring];
    var r = dir[di];
    return { i:di, ring:ring, ang:ang, x:Math.cos(ang) * rad, y:Math.sin(ang) * rad,
      rad:2.0 + 3.6 * (r.strength / maxS), title:dispName(r), handle:r.name, relation:r.relation,
      pieces:r.pieces, strength:r.strength, on:true, col:'#7ea6f0' };
  });
  /* ring 3: off-graph people who still have real content (events/files/records)
     get an outer halo so that selecting them always has somewhere to fly to */
  var seen = {};
  NODES.forEach(function(n){ seen[n.i] = true; });
  var halo = [];
  dir.forEach(function(r, di){
    if(seen[di] || r.has_graph !== false) return;
    if(!((r.events || []).length || (r.files || []).length || !!r.record)) return;
    halo.push(di);
  });
  halo.forEach(function(di, k){
    var hrng = mulberry32(di * 2654435761 % 2147483647);
    var hang = (k / halo.length) * Math.PI * 2 + (hrng() - 0.5) * 0.12 + 2.1;
    var hrad = 615 + hrng() * 80;
    var hr = dir[di];
    NODES.push({ i:di, ring:3, ang:hang, x:Math.cos(hang) * hrad, y:Math.sin(hang) * hrad,
      rad:2.0 + 3.6 * (hr.strength / maxS), title:dispName(hr), handle:hr.name, relation:hr.relation,
      pieces:hr.pieces, strength:hr.strength, on:true, col:'#7ea6f0' });
  });
}

/* ---------- map: 2D ---------- */
var hub = { cv:null, ctx:null, W:0, H:0, dpr:1, cam:{ x:0, y:0, z:1 }, target:null, rot:0, hover:null, dragging:false, lastT:0, bgDots:null, raf:0 };
function hubInit(){
  hub.cv = $('#hub'); hub.ctx = hub.cv.getContext('2d');
  hubResize(); hubFit();
  var sx = 0, sy = 0, moved = false;
  hub.cv.addEventListener('pointerdown', function(e){ hub.dragging = true; moved = false; sx = e.clientX; sy = e.clientY; hub.cv.setPointerCapture(e.pointerId); });
  hub.cv.addEventListener('pointermove', function(e){
    if(hub.dragging){
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if(Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      hub.cam.x -= dx / hub.cam.z; hub.cam.y -= dy / hub.cam.z; hub.target = null;
      sx = e.clientX; sy = e.clientY;
    } else hubHover(e);
  });
  hub.cv.addEventListener('pointerup', function(e){ hub.dragging = false; if(!moved) hubClick(e); });
  hub.cv.addEventListener('pointerleave', function(){ hub.hover = null; tipHide(); });
  hub.cv.addEventListener('wheel', function(e){
    e.preventDefault();
    var z2 = Math.max(0.35, Math.min(3.2, hub.cam.z * Math.exp(-e.deltaY * 0.0011)));
    var r = hub.cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    var wx = (mx - hub.W / 2) / hub.cam.z + hub.cam.x, wy = (my - hub.H / 2) / hub.cam.z + hub.cam.y;
    hub.cam.z = z2; hub.cam.x = wx - (mx - hub.W / 2) / z2; hub.cam.y = wy - (my - hub.H / 2) / z2; hub.target = null;
  }, { passive:false });
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) hub.lastT = performance.now(); });
  hub.lastT = performance.now();
}
function hubStart(){ if(!hub.raf){ hub.lastT = performance.now(); hub.raf = requestAnimationFrame(hubFrame); } }
function hubResize(){
  if(!hub.cv) return;
  var r = $('#stage').getBoundingClientRect();
  hub.dpr = Math.min(2, window.devicePixelRatio || 1);
  hub.W = Math.max(50, r.width); hub.H = Math.max(50, r.height);
  hub.cv.width = Math.round(hub.W * hub.dpr); hub.cv.height = Math.round(hub.H * hub.dpr);
  hub.cv.style.width = hub.W + 'px'; hub.cv.style.height = hub.H + 'px';
  hub.bgDots = null;
}
function hubFit(){
  var z = Math.min(hub.W, hub.H) / 2 / 730;
  hub.cam = { x:0, y:0, z:Math.max(0.3, Math.min(1.4, z)) };
  hub.target = null;
}
function w2s(wx, wy){ return [ (wx - hub.cam.x) * hub.cam.z + hub.W / 2, (wy - hub.cam.y) * hub.cam.z + hub.H / 2 ]; }
function s2w(sx, sy){ return [ (sx - hub.W / 2) / hub.cam.z + hub.cam.x, (sy - hub.H / 2) / hub.cam.z + hub.cam.y ]; }
function rotX(n){ var a = n.ang + hub.rot, r = Math.hypot(n.x, n.y); return Math.cos(a) * r; }
function rotY(n){ var a = n.ang + hub.rot, r = Math.hypot(n.x, n.y); return Math.sin(a) * r; }
function hubFrame(now){
  if(S.mode !== '2d'){ hub.raf = 0; return; }
  var dt = Math.min(0.05, (now - hub.lastT) / 1000); hub.lastT = now;
  if(!document.hidden && !hub.dragging && hub.hover === null && S.sel === null) hub.rot += dt * 0.018;
  if(hub.target){
    hub.cam.x += (hub.target.x - hub.cam.x) * Math.min(1, dt * 5);
    hub.cam.y += (hub.target.y - hub.cam.y) * Math.min(1, dt * 5);
    if(Math.abs(hub.target.x - hub.cam.x) < 1 && Math.abs(hub.target.y - hub.cam.y) < 1) hub.target = null;
  }
  var ctx = hub.ctx, W = hub.W, H = hub.H, z = hub.cam.z;
  ctx.setTransform(hub.dpr, 0, 0, hub.dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if(S.showBg) drawBg(ctx);
  var c = w2s(0, 0);
  ctx.lineWidth = 1;
  NODES.forEach(function(n){
    var p = w2s(n.x, n.y);
    ctx.strokeStyle = hexA(n.col, n.ring === 0 ? 0.10 : 0.05);
    ctx.globalAlpha = n.on ? 1 : 0.25;
    ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
  });
  ctx.globalAlpha = 1;
  NODES.forEach(function(n){
    var p = w2s(rotX(n), rotY(n));
    if(p[0] < -30 || p[1] < -30 || p[0] > W + 30 || p[1] > H + 30) return;
    var rr = Math.max(1.6, n.rad * Math.sqrt(z)), active = (S.sel === n.i || hub.hover === n);
    ctx.globalAlpha = n.on ? 1 : 0.1;
    if(n.on || S.sel === n.i){ ctx.shadowColor = n.col; ctx.shadowBlur = active ? 14 : 6; }
    ctx.fillStyle = n.col;
    ctx.beginPath(); ctx.arc(p[0], p[1], rr, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    if(active){ ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(p[0], p[1], rr + 3.5, 0, Math.PI * 2); ctx.stroke(); }
  });
  ctx.globalAlpha = 1;
  var s = Math.sqrt(z);
  var grd = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], 26 * s);
  grd.addColorStop(0, 'rgba(244,239,230,.55)'); grd.addColorStop(1, 'rgba(244,239,230,0)');
  ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(c[0], c[1], 26 * s, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f4efe6'; ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(7, 11 * s), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0b0d12'; ctx.font = '700 ' + Math.max(9, 11 * s) + 'px Archivo,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('JD', c[0], c[1] + 0.5);
  hub.raf = requestAnimationFrame(hubFrame);
}
function drawBg(ctx){
  if(!hub.bgDots){
    var dots = [], idx = D.circle_index || [];
    for(var i = 0; i < idx.length; i++){
      var rng = mulberry32((i + 1) * 2246822519 % 2147483647);
      var ang = rng() * Math.PI * 2, rad = 640 + rng() * rng() * 1100;
      dots.push([Math.cos(ang) * rad, Math.sin(ang) * rad]);
    }
    hub.bgDots = dots;
  }
  ctx.fillStyle = 'rgba(154,163,178,.16)';
  var dots2 = hub.bgDots;
  for(var j = 0; j < dots2.length; j++){
    var p = w2s(dots2[j][0], dots2[j][1]);
    if(p[0] < -4 || p[1] < -4 || p[0] > hub.W + 4 || p[1] > hub.H + 4) continue;
    ctx.fillRect(p[0], p[1], 1.6, 1.6);
  }
}
function hubNodeAt(sx, sy){
  var w = s2w(sx, sy), best = null, bestD = 14 / hub.cam.z;
  for(var i = 0; i < NODES.length; i++){
    var n = NODES[i], d = Math.hypot(rotX(n) - w[0], rotY(n) - w[1]);
    if(d < bestD + n.rad * 0.4){ bestD = d; best = n; }
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
  if(n) openPerson(n.i); else if(S.sel !== null) closePanel();
}
function tipShow(cx, cy, n){
  var tip = $('#tip'), lv = personLevel(D.directory[n.i]);
  tip.innerHTML = '<b>' + esc(n.title) + '</b><span style="--c:' + LV[lv].c + '"><i></i>' + LV[lv].n + (n.relation ? ' · ' + esc(RELN[n.relation] || n.relation) : '') + '</span>';
  tip.hidden = false;
  tip.style.left = Math.min(cx + 16, innerWidth - 250) + 'px';
  tip.style.top = Math.min(cy + 14, innerHeight - 80) + 'px';
}
function tipHide(){ $('#tip').hidden = true; }

/* ---------- map: 3D ---------- */
var GL = null;
var THREE_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'
];
function loadScript(src){
  return new Promise(function(res, rej){
    var s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = function(){ rej(new Error('load failed: ' + src)); };
    document.head.appendChild(s);
  });
}
function setMode(m){
  S.mode = m; store('ncc_mode', m);
  $$('#modeToggle button').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-m') === m); });
  var hint = $('#stagehint');
  if(m === '3d'){
    $('#gl3d').hidden = false; $('#hub').style.visibility = 'hidden';
    hint.textContent = 'Drag to orbit · scroll to zoom · click a dot to open them';
    initGL();
  } else {
    $('#gl3d').hidden = true; $('#hub').style.visibility = 'visible';
    hint.textContent = 'Drag to pan · scroll to zoom · click a dot to open them';
    hubResize(); hubStart();
  }
}
function setColorMode(c){
  S.colorBy = c; store('ncc_color', c);
  $$('#colorToggle button').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-c') === c); });
  refresh();
}
function initGL(){
  var holder = $('#gl3d');
  if(GL){ glResize(); glSyncFocus(); return; }
  if(holder.querySelector('.gl-loading')) return;
  holder.insertAdjacentHTML('beforeend', '<div class="gl-loading">Building 3D space…</div>');
  loadScript(THREE_URLS[0]).then(function(){ return loadScript(THREE_URLS[1]); }).then(function(){
    var l = holder.querySelector('.gl-loading'); if(l) l.remove();
    buildGL(); glRecolor(); glSyncFocus();
  }).catch(function(){
    var l = holder.querySelector('.gl-loading');
    if(l) l.textContent = 'Could not load the 3D engine. Check your connection, or switch to 2D.';
  });
}
function makeLabel(text, o){
  o = o || {};
  var fs = o.size || 26, SS = 3;
  var font = '600 ' + fs + 'px Inter, system-ui, sans-serif';
  var cv = document.createElement('canvas'), mctx = cv.getContext('2d');
  mctx.font = font;
  var tw = Math.ceil(mctx.measureText(text).width);
  var px = Math.round(fs * 0.66), py = Math.round(fs * 0.42);
  var w = tw + px * 2, h = fs + py * 2, r = (h - 3) / 2;
  cv.width = w * SS; cv.height = h * SS;
  var ctx = cv.getContext('2d');
  ctx.scale(SS, SS);
  ctx.beginPath();
  if(ctx.roundRect) ctx.roundRect(1.5, 1.5, w - 3, h - 3, r);
  else{ ctx.moveTo(1.5 + r, 1.5); ctx.arcTo(w - 1.5, 1.5, w - 1.5, h - 1.5, r); ctx.arcTo(w - 1.5, h - 1.5, 1.5, h - 1.5, r); ctx.arcTo(1.5, h - 1.5, 1.5, 1.5, r); ctx.arcTo(1.5, 1.5, w - 1.5, 1.5, r); ctx.closePath(); }
  ctx.fillStyle = o.bg || 'rgba(9,13,20,0.78)';
  ctx.fill();
  ctx.strokeStyle = o.edge || 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = o.color || '#e8ecf3';
  ctx.fillText(text, px, h / 2 + 1);
  var tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  try{ tex.anisotropy = GL.renderer.capabilities.getMaxAnisotropy(); }catch(x){}
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, transparent:true, depthTest:false }));
  sp.scale.set(w * 0.062, h * 0.062, 1);
  sp.renderOrder = 10;
  sp.userData.isLabel = true;
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
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map:new THREE.CanvasTexture(cv), transparent:true, depthWrite:false, blending:THREE.AdditiveBlending }));
  sp.scale.set(size, size, 1);
  return sp;
}
function buildGL(){
  var holder = $('#gl3d');
  var W = holder.clientWidth || innerWidth, H = holder.clientHeight || innerHeight;
  var renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(W, H);
  holder.appendChild(renderer.domElement);
  var scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x06080d, 0.0011);
  var camera = new THREE.PerspectiveCamera(52, W / H, 0.5, 4000);
  camera.position.set(0, 88, 370);
  var controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.06;
  controls.minDistance = 14; controls.maxDistance = 1000;
  controls.autoRotateSpeed = 0.25;
  controls.addEventListener('start', function(){ if(GL) GL.userHold = true; });
  controls.addEventListener('end', function(){ if(GL) GL.userHold = false; });

  scene.add(new THREE.Mesh(new THREE.SphereGeometry(4.6, 28, 28), new THREE.MeshBasicMaterial({ color:0xf4efe6 })));
  scene.add(makeGlow(0xf4efe6, 30));
  var jdLabel = makeLabel('JD', { size:30, color:'#f4efe6' });
  jdLabel.position.set(0, 10, 0);
  scene.add(jdLabel);

  var n = NODES.length;
  var posArr = new Float32Array(n * 3), colArr = new Float32Array(n * 3);
  var shells = [56, 94, 132, 178], perShell = [[], [], [], []];
  NODES.forEach(function(nd, k){ perShell[Math.min(nd.ring || 0, 3)].push(k); });
  var glPos = new Array(D.directory.length);
  perShell.forEach(function(list, s){
    var R = shells[s];
    list.forEach(function(k, j){
      var di = NODES[k].i;
      var y = 1 - 2 * (j + 0.5) / list.length, r = Math.sqrt(Math.max(0, 1 - y * y)), th = j * 2.399963;
      var rnd = mulberry32(di * 7919 + 13), jr = R * (0.93 + rnd() * 0.14);
      var v = new THREE.Vector3(Math.cos(th) * r * jr, y * jr, Math.sin(th) * r * jr);
      glPos[di] = v;
      posArr[k * 3] = v.x; posArr[k * 3 + 1] = v.y; posArr[k * 3 + 2] = v.z;
    });
  });
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  var mat = new THREE.PointsMaterial({ size:2.8, vertexColors:true, sizeAttenuation:true, transparent:true, opacity:0.95, depthWrite:false });
  var points = new THREE.Points(geo, mat);
  scene.add(points);

  var bg = null, ci = D.circle_index || [];
  if(ci.length){
    var bp = new Float32Array(ci.length * 3), R2 = 218;
    for(var bi = 0; bi < ci.length; bi++){
      var y2 = 1 - 2 * (bi + 0.5) / ci.length, r2 = Math.sqrt(Math.max(0, 1 - y2 * y2)), th2 = bi * 2.399963;
      bp[bi * 3] = Math.cos(th2) * r2 * R2; bp[bi * 3 + 1] = y2 * R2; bp[bi * 3 + 2] = Math.sin(th2) * r2 * R2;
    }
    var bgGeo = new THREE.BufferGeometry();
    bgGeo.setAttribute('position', new THREE.BufferAttribute(bp, 3));
    bg = new THREE.Points(bgGeo, new THREE.PointsMaterial({ size:1.4, color:0x2b3648, transparent:true, opacity:0.5, depthWrite:false }));
    bg.visible = !!S.showBg;
    scene.add(bg);
  }

  GL = { renderer:renderer, scene:scene, camera:camera, controls:controls, points:points, mat:mat, bg:bg, glPos:glPos, colArr:colArr, userHold:false,
    flight:null, focusGroup:null, focusDi:-1, nbrGeo:new THREE.SphereGeometry(1.7, 16, 16),
    ray:new THREE.Raycaster(), downX:0, downY:0, hoverLabel:null, hoverDi:-1 };
  GL.ray.params.Points = { threshold:4.5 };

  renderer.domElement.addEventListener('pointerdown', function(ev){ GL.downX = ev.clientX; GL.downY = ev.clientY; });
  renderer.domElement.addEventListener('pointerup', function(ev){
    if(Math.hypot(ev.clientX - GL.downX, ev.clientY - GL.downY) > 6) return;
    glClick(ev);
  });
  renderer.domElement.addEventListener('pointermove', function(ev){
    if(!GL) return;
    var hit = glPick(ev);
    renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
    glHoverLabel((hit && hit.kind === 'node') ? NODES[hit.index].i : null);
  });
  renderer.domElement.addEventListener('pointerleave', function(){ glHoverLabel(null); });
  (function glAnimate(){
    requestAnimationFrame(glAnimate);
    if(S.mode !== '3d' || !GL || document.hidden) return;
    if(GL.flight){
      var f = GL.flight, t = Math.min(1, (performance.now() - f.start) / f.dur);
      var e2 = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      var a = f.p0.clone().lerp(f.p1, e2), b = f.p1.clone().lerp(f.p2, e2);
      GL.camera.position.copy(a.lerp(b, e2));
      GL.controls.target.copy(f.t0.clone().lerp(f.t2, e2));
      if(t >= 1) GL.flight = null;
    }
    GL.controls.autoRotate = !GL.flight && !GL.userHold && !(GL.hoverDi != null && GL.hoverDi >= 0) && S.sel === null;
    GL.controls.update();
    if(GL.focusGroup){
      var _cd = GL.camera.position.clone().sub(GL.controls.target);
      var _cl = _cd.length() || 1; _cd.divideScalar(_cl);
      var _kids = GL.focusGroup.children;
      for(var _li = 0; _li < _kids.length; _li++){
        var _lo = _kids[_li];
        if(!_lo.userData || !_lo.userData.isLabel || !_lo.userData.nodePos) continue;
        var _od = _lo.userData.nodePos.clone().sub(GL.controls.target);
        var _ol = _od.length() || 1;
        var _facing = _od.divideScalar(_ol).dot(_cd);
        var _t = Math.min(1, Math.max(0, (_facing + 0.35) / 0.8));
        _t = _t * _t * (3 - 2 * _t);
        var _ndc = _lo.userData.nodePos.clone().project(GL.camera);
        var _edge = Math.max(Math.abs(_ndc.x), Math.abs(_ndc.y));
        var _ef = _edge > 0.9 ? Math.max(0, 1 - (_edge - 0.9) / 0.1) : 1;
        _lo.material.opacity = (0.16 + 0.84 * _t) * _ef;
      }
    }
    GL.renderer.render(GL.scene, GL.camera);
  })();
}
function glRecolor(){
  if(!GL) return;
  var c = new THREE.Color(), arr = GL.colArr;
  NODES.forEach(function(nd, k){
    c.set(nd.col); var f = nd.on ? 1 : 0.12;
    arr[k * 3] = c.r * f; arr[k * 3 + 1] = c.g * f; arr[k * 3 + 2] = c.b * f;
  });
  GL.points.geometry.attributes.color.needsUpdate = true;
}
function glResize(){
  if(!GL) return;
  var holder = $('#gl3d'), W = holder.clientWidth || innerWidth, H = holder.clientHeight || innerHeight;
  GL.camera.aspect = W / H; GL.camera.updateProjectionMatrix(); GL.renderer.setSize(W, H);
}
function glPick(ev){
  var rect = GL.renderer.domElement.getBoundingClientRect();
  var mx = ((ev.clientX - rect.left) / rect.width) * 2 - 1, my = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  GL.ray.setFromCamera({ x:mx, y:my }, GL.camera);
  if(GL.focusGroup){
    var hits = GL.ray.intersectObjects(GL.focusGroup.children.filter(function(o){ return o.isMesh; }));
    if(hits.length) return { kind:'neighbor', obj:hits[0].object };
  }
  var ph = GL.ray.intersectObject(GL.points);
  if(ph.length && ph[0].index != null) return { kind:'node', index:ph[0].index };
  return null;
}
function glHoverLabel(di){
  if(!GL || di === GL.hoverDi) return;
  GL.hoverDi = di;
  if(GL.hoverLabel){ GL.scene.remove(GL.hoverLabel); GL.hoverLabel = null; }
  if(di == null || di < 0 || !GL.glPos[di] || di === GL.focusDi) return;
  var lab = makeLabel(dispName(D.directory[di]), { size:20, color:'#e8ecf3' }), p = GL.glPos[di];
  lab.position.set(p.x, p.y + 4.5, p.z);
  GL.scene.add(lab); GL.hoverLabel = lab;
}
function glClick(ev){
  var hit = glPick(ev);
  if(!hit){ if(S.sel !== null) closePanel(); return; }
  if(hit.kind === 'neighbor'){
    var di = hit.obj.userData.dirIdx;
    if(di >= 0) openPerson(di, { push:true });
    return;
  }
  openPerson(NODES[hit.index].i);
}
function glFlyTo(destPos, destTarget, dur){
  var p0 = GL.camera.position.clone(), t0 = GL.controls.target.clone();
  var mid = p0.clone().add(destPos).multiplyScalar(0.5);
  mid.setLength(Math.max(p0.length(), destPos.length()) + 70);
  GL.flight = { p0:p0, p1:mid, p2:destPos.clone(), t0:t0, t2:destTarget.clone(), start:performance.now(), dur:dur || 1500 };
}
function glClearFocus(){
  glHoverLabel(null);
  if(!GL || !GL.focusGroup) return;
  GL.scene.remove(GL.focusGroup); GL.focusGroup = null; GL.focusDi = -1; GL.mat.opacity = 0.95;
}
function glFocus(di){
  if(!GL || !GL.glPos[di]) return;
  glClearFocus();
  GL.focusDi = di;
  var p = GL.glPos[di], e = D.directory[di], g = new THREE.Group();
  var nbrs = (e.neighbors || []).slice(0, 8);
  nbrs.forEach(function(nb, j){
    var y = 1 - 2 * (j + 0.5) / nbrs.length, r = Math.sqrt(Math.max(0, 1 - y * y)), th = j * 2.399963;
    var np = new THREE.Vector3(p.x + Math.cos(th) * r * 16, p.y + y * 16, p.z + Math.sin(th) * r * 16);
    var di2 = BYN[(nb.u || '').toLowerCase()];
    var col = di2 != null ? new THREE.Color(LV[personLevel(D.directory[di2])].c) : new THREE.Color(0x5a6b84);
    var mesh = new THREE.Mesh(GL.nbrGeo, new THREE.MeshBasicMaterial({ color:col }));
    mesh.position.copy(np);
    mesh.userData.dirIdx = di2 != null ? di2 : -1;
    g.add(mesh);
    var lab = makeLabel(nb.d || nb.u, { size:19, color:'#d7e5f2' });
    var ldir = np.clone().sub(p);
    if(ldir.lengthSq() < 1e-6) ldir.set(0, 1, 0);
    ldir.normalize();
    lab.position.set(np.x + ldir.x * 8.5, np.y + ldir.y * 8.5, np.z + ldir.z * 8.5);
    lab.userData.nodePos = np.clone();
    g.add(lab);
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p, np]), new THREE.LineBasicMaterial({ color:col, transparent:true, opacity:0.35 })));
  });
  var fl = makeLabel(dispName(e), { size:24, color:'#f4efe6' });
  fl.position.set(p.x, p.y + 11, p.z);
  g.add(fl);
  var marker = makeGlow(parseInt(LV[personLevel(e)].c.slice(1), 16), 16);
  marker.position.copy(p);
  g.add(marker);
  GL.focusGroup = g; GL.scene.add(g); GL.mat.opacity = 0.16;
  var dest = p.clone().add(p.clone().normalize().multiplyScalar(58));
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
function zoomBy(f){
  if(S.mode === '3d' && GL){
    var t = GL.controls.target, d = GL.camera.position.clone().sub(t).multiplyScalar(f);
    d.setLength(Math.min(1000, Math.max(14, d.length())));
    GL.camera.position.copy(t.clone().add(d));
  } else hub.cam.z = Math.max(0.35, Math.min(3.2, hub.cam.z / f));
}
function resetView(){
  if(S.mode === '3d' && GL) glFlyTo(new THREE.Vector3(0, 72, 305), new THREE.Vector3(0, 0, 0), 1200);
  else hubFit();
}

/* ---------- events ---------- */
function bind(){
  var fq = $('#fq'), deb = null;
  fq.addEventListener('input', function(){
    clearTimeout(deb);
    deb = setTimeout(function(){ S.q = fq.value; S.limit = 200; refresh(); }, 140);
  });

  /* rail */
  $('#railtabs').addEventListener('click', function(e){
    var b = e.target.closest('button'); if(!b) return;
    S.rail = b.getAttribute('data-r'); refresh();
  });
  $('#lvlchips').addEventListener('click', function(e){
    var b = e.target.closest('[data-lf]'); if(!b) return;
    S.lvlF = parseInt(b.getAttribute('data-lf'), 10) || 0; S.limit = 200; refresh();
  });
  $('#filterbtn').addEventListener('click', function(e){
    e.stopPropagation();
    var pop = $('#filterpop'); pop.hidden = !pop.hidden;
    this.setAttribute('aria-expanded', String(!pop.hidden));
  });
  $('#filterpop').addEventListener('click', function(e){ e.stopPropagation(); });
  $('#frel').addEventListener('change', function(e){ S.rel = e.target.value; S.limit = 200; refresh(); });
  $('#fsort').addEventListener('change', function(e){ S.sort = e.target.value; refresh(); });
  $('#fauditonly').addEventListener('change', function(e){ S.auditOnly = e.target.checked; S.limit = 200; refresh(); });
  $('#fclear').addEventListener('click', function(){ clearFilter('all'); $('#filterpop').hidden = true; });
  $('#activeflt').addEventListener('click', function(e){
    var b = e.target.closest('[data-clr]'); if(b) clearFilter(b.getAttribute('data-clr'));
  });
  $('#auditpill').addEventListener('click', openAudit);
  $('#auditback').addEventListener('click', closeAudit);
  $('#auundo').addEventListener('click', doUndo);
  $('#auredo').addEventListener('click', doRedo);
  $('#aufilters').addEventListener('click', function(ev){
    var b = ev.target.closest('button'); if(!b) return;
    auSetFilter(b.getAttribute('data-f'));
  });
  $('#austats').addEventListener('click', function(ev){
    var b = ev.target.closest('.austat'); if(!b) return;
    auSetFilter(b.getAttribute('data-f'));
  });
  $('#auselall').addEventListener('click', function(){
    var all = AUD.rows.length && AUD.rows.every(function(r){ return AUD.sel[r.di]; });
    if(all) AUD.sel = {}; else AUD.rows.forEach(function(r){ AUD.sel[r.di] = 1; });
    renderAudit();
  });
  $('#aubulk').addEventListener('click', function(ev){
    var b = ev.target.closest('[data-bulk]'); if(!b) return;
    var k = b.getAttribute('data-bulk');
    if(k === 'audit') bulkAudit('audited');
    else if(k === 'unaudit') bulkAudit('needs_audit');
    else if(k === 'delete') bulkDelete();
    else if(k === 'clear'){ AUD.sel = {}; renderAudit(); }
  });
  $('#ausort').addEventListener('change', function(ev){ AUD.sort = ev.target.value; renderAudit(); });
  var _audt = null;
  $('#auq').addEventListener('input', function(ev){ clearTimeout(_audt); _audt = setTimeout(function(){ AUD.q = ev.target.value; renderAudit(); }, 200); });
  $('#aubody').addEventListener('change', function(ev){
    var cb = ev.target.closest('.ausel'); if(!cb) return;
    var di = parseInt(cb.getAttribute('data-di'), 10);
    if(cb.checked) AUD.sel[di] = 1; else delete AUD.sel[di];
    renderBulk();
  });
  $('#aubody').addEventListener('click', function(ev){
    if(ev.target.classList && ev.target.classList.contains('ausel')) return;
    var ab = ev.target.closest('[data-auact]');
    if(ab){
      ev.stopPropagation();
      var rr = ab.closest('.aurow');
      setAuditFor(parseInt(rr.getAttribute('data-di'), 10), ab.getAttribute('data-auact') === 'audit' ? 'audited' : 'needs_audit');
      return;
    }
    var row = ev.target.closest('.aurow');
    if(row){ closeAudit(); openPerson(parseInt(row.getAttribute('data-di'), 10), { push:true }); }
  });
  $('#listtoggle').addEventListener('click', toggleList);
  $('#settingsbtn').addEventListener('click', openSettings);
  $('#leftbody').addEventListener('click', function(e){
    if(e.target.closest('[data-more]')){ S.limit += 200; renderRail(); return; }
    var row = e.target.closest('[data-i]');
    if(row) openPerson(parseInt(row.getAttribute('data-i'), 10), { lvl:parseInt(row.getAttribute('data-go'), 10) || 1 });
  });
  $('#leftbody').addEventListener('keydown', function(e){
    var row = e.target.closest('[data-i]');
    if(row && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openPerson(parseInt(row.getAttribute('data-i'), 10), { lvl:parseInt(row.getAttribute('data-go'), 10) || 1 }); }
  });

  /* stage */
  $('#modeToggle').addEventListener('click', function(e){ var b = e.target.closest('button'); if(b) setMode(b.getAttribute('data-m')); });
  $('#colorToggle').addEventListener('click', function(e){ var b = e.target.closest('button'); if(b) setColorMode(b.getAttribute('data-c')); });
  $('#bgtoggle').addEventListener('click', function(){
    S.showBg = !S.showBg; this.setAttribute('aria-pressed', String(S.showBg));
    if(GL && GL.bg) GL.bg.visible = S.showBg;
  });
  $('#zin').addEventListener('click', function(){ zoomBy(0.8); });
  $('#zout').addEventListener('click', function(){ zoomBy(1.25); });
  $('#zreset').addEventListener('click', resetView);
  $('#legend').addEventListener('click', function(e){
    var b = e.target.closest('button'); if(!b) return;
    if(b.hasAttribute('data-lf')){ var n = parseInt(b.getAttribute('data-lf'), 10); S.lvlF = S.lvlF === n ? 0 : n; }
    else if(b.hasAttribute('data-rf')){ var k = b.getAttribute('data-rf'); S.rel = S.rel === k ? '' : k; }
    S.rail = 'people'; S.limit = 200; refresh();
  });
  if(window.ResizeObserver){
    var pend = false;
    new ResizeObserver(function(){
      if(pend) return; pend = true;
      requestAnimationFrame(function(){ pend = false; hubResize(); glResize(); });
    }).observe($('#stage'));
  } else addEventListener('resize', function(){ hubResize(); glResize(); });

  /* dossier panel */
  var rb = $('#rightbody');
  rb.addEventListener('click', function(e){
    var a = e.target.closest('[data-act]');
    if(a){ e.stopPropagation(); act(a.getAttribute('data-act'), a); return; }
    var pd = e.target.closest('.pdot');
    if(pd){
      var box = pd.closest('.dots'), nv = box.getAttribute('data-v') === pd.getAttribute('data-v') ? '' : pd.getAttribute('data-v');
      box.setAttribute('data-v', nv);
      $$('.pdot', box).forEach(function(d2){ d2.classList.toggle('on', d2.getAttribute('data-v') === nv && nv !== ''); });
      markDirty(); return;
    }
    var ah = e.target.closest('.naddhit');
    if(ah && ah.getAttribute('data-ai')){ addClose(D.directory[S.sel], parseInt(ah.getAttribute('data-ai'), 10)); return; }
    var tc = e.target.closest('.tchip');
    if(tc){ tc.classList.toggle('on'); syncTagHidden(tc.closest('.tchips')); markDirty(); }
  });
  rb.addEventListener('keydown', function(e){
    if(e.target.classList && e.target.classList.contains('tadd') && e.key === 'Enter'){
      e.preventDefault();
      var v = e.target.value.trim(); if(!v) return;
      var chips = e.target.parentNode, dup = false;
      $$('.tchip', chips).forEach(function(c){ if(c.getAttribute('data-tv').toLowerCase() === v.toLowerCase()){ c.classList.add('on'); dup = true; } });
      if(!dup){
        var sp = document.createElement('span');
        sp.className = 'tchip on'; sp.setAttribute('data-tv', v); sp.textContent = v;
        chips.insertBefore(sp, e.target);
      }
      e.target.value = '';
      syncTagHidden(chips); markDirty();
    }
  });
  rb.addEventListener('input', function(e){
    if(e.target.id === 'naddinput'){ renderNadd(e.target.value); return; }
    if(e.target.closest('[data-pk]')) markDirty();
  });
  rb.addEventListener('change', function(e){ if(e.target.tagName === 'SELECT' && e.target.hasAttribute('data-pk')) markDirty(); });

  document.addEventListener('click', function(e){
    if(!e.target.closest('.menu')) closeMenus();
    if(!e.target.closest('.filterwrap')){ var fp = $('#filterpop'); if(fp && !fp.hidden){ fp.hidden = true; $('#filterbtn').setAttribute('aria-expanded', 'false'); } }
  });
  document.addEventListener('keydown', onKey);
}
function toggleList(){
  S.listOpen = !S.listOpen;
  $('#listtoggle').classList.toggle('on', S.listOpen);
  $('#listtoggle').setAttribute('aria-pressed', String(S.listOpen));
  document.body.classList.toggle('nolist', !S.listOpen);
}
function stepSel(d){
  if(S.rail !== 'people') return;
  var rows = listRows(); if(!rows.length) return;
  var cur = rows.indexOf(S.sel);
  openPerson(rows[cur < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, cur + d))], { lvl:S.lvl });
}
function onKey(e){
  if(AUD.open){
    if((e.metaKey || e.ctrlKey) && !e.altKey){
      var kz = String(e.key || '').toLowerCase();
      if(kz === 'z' && !typing()){ e.preventDefault(); if(e.shiftKey) doRedo(); else doUndo(); return; }
      if(kz === 'y' && !typing()){ e.preventDefault(); doRedo(); return; }
    }
    return;
  }
  if(e.key === 'Escape'){
    if(AUD.open){ closeAudit(); return; }
    if($('#modal')){ closeModal(); return; }
    var fp = $('#filterpop'); if(fp && !fp.hidden){ fp.hidden = true; return; }
    if(document.activeElement === $('#fq')){ if($('#fq').value){ clearFilter('q'); } else $('#fq').blur(); return; }
    if(typing()){ document.activeElement.blur(); return; }
    if(S.editing){ exitEdit(); return; }
    if(S.hist.length){ goBack(); return; }
    if(S.sel !== null) closePanel();
    return;
  }
  if($('#modal')) return;
  if(e.altKey && e.key === 'ArrowLeft'){ e.preventDefault(); goBack(); return; }
  if(typing() || e.metaKey || e.ctrlKey || e.altKey) return;
  if(e.key === '/'){ e.preventDefault(); if(!S.listOpen) toggleList(); $('#fq').focus(); $('#fq').select(); return; }
  if(e.key === 'b' || e.key === 'B'){ toggleList(); return; }
  if(e.key === 'ArrowDown' || e.key === 'j'){ e.preventDefault(); stepSel(1); return; }
  if(e.key === 'ArrowUp' || e.key === 'k'){ e.preventDefault(); stepSel(-1); return; }
  if(S.sel === null) return;
  if(e.key === '1' || e.key === '2' || e.key === '3'){ setLevel(parseInt(e.key, 10)); return; }
  if((e.key === 'e' || e.key === 'E') && !S.editing){ e.preventDefault(); enterEdit(); }
}

/* ---------- boot ---------- */
function boot(){
  injectIcons(document);
  ambient();
  var m = store('ncc_mode'), c = store('ncc_color');
  if(m === '2d' || m === '3d') S.mode = m;
  if(c === 'level' || c === 'rel') S.colorBy = c;
  $$('#colorToggle button').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-c') === S.colorBy); });
  if(innerWidth <= 860){ S.listOpen = false; document.body.classList.add('nolist'); $('#listtoggle').classList.remove('on'); $('#listtoggle').setAttribute('aria-pressed', 'false'); }
  $('#leftbody').innerHTML = '<div class="empty-note">Loading dossier data…</div>';
  var tries = 0;
  (function attempt(){
    tries++;
    fetch('data/dossier.json', { cache:'no-store' })
      .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(d){
        D = d;
        $('#fresh').textContent = 'Updated ' + (D.updated || '—');
        D.directory.forEach(function(r, i){ BYN[(r.name || '').toLowerCase()] = i; });
        buildNodes();
        $('#fq').placeholder = 'Search ' + LIST_ORDER.length + ' people…';
        hubInit(); bind(); refresh(); setMode(S.mode);
      })
      .catch(function(){
        if(tries < 4){
          $('#leftbody').innerHTML = '<div class="empty-note">Loading dossier data… (retry ' + tries + '/3)</div>';
          setTimeout(attempt, 1200 * tries);
        } else {
          $('#leftbody').innerHTML = '<div class="empty-note">Could not load the dossier data. <a href="" onclick="location.reload();return false;" style="color:var(--txt)">Retry</a></div>';
          $('#stagehint').textContent = 'Data failed to load.';
        }
      });
  })();
}
document.addEventListener('DOMContentLoaded', boot);
})();
