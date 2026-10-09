/* North Country Circle — Dossier v5
   Directory rail + connection map + dossier panel.
   Level colors: L1 On file = blue, L2 Record = amber, L3 Files = green.

   v5 changes (consolidated model):
   - Level 1 is now "On file": everything idiosyncratic to the person (contact, background,
     known associates, public footprint, synopsis). Record level holds the relationship.
   - Closeness is now the hero metric Open / Associate / Vetted. Map rings, dot colors and
     the legend all key off tier.
   - Status collapsed into one Momentum metric (1-5, 3 neutral) with a directional UI.
   - Ratings feed a Big Five estimator; the top trait shows as a single hero chip.
   - Record is synopsis-only. Timeline events keep only the initiated-by toggle.
   v4 changes (editing + saving rebuilt):
   - Edit mode is one stack of collapsible sections that covers every column in the Profiles sheet.
   - Every edit goes through one outbox: saved to this browser first, sent to the sheet in batches,
     retried until the server confirms, and re-sent after a reload if it never got through.
   - On load the page asks the sheet for rows edited recently, so edits show even before the
     GitHub snapshot catches up.
   - Events and files now live in the Profiles sheet row like everything else. */
(function(){
'use strict';

var WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwZli1Dv07iWBpR3Oz4jD4imtNLN845jFDBnXIbtmT3sPGExsMlKFMQwt42FmrUdFBD/exec';

var LV = {
  1:{ c:'#7ea6f0', n:'On file', ic:'user' },
  2:{ c:'#f0b44c', n:'Record',   ic:'book' },
  3:{ c:'#5cd6a0', n:'Files',   ic:'folder' }
};
/* tiers: the hero metric. Rings, dot colors and the legend all key off this. */
var TIERS = {
  vetted:   { c:'#f0b44c', n:'Vetted' },
  associate:{ c:'#7ea6f0', n:'Associate' },
  open:     { c:'#9aa3b2', n:'Open' }
};
var TIER_ORDER = ['vetted', 'associate', 'open'];
var MOM_LABELS = { '-':'negative', '0':'neutral', '+':'positive' };
var MOM_ICONS = { '-':'\u2212', '0':'\u25c6', '+':'+' };
function momPos(v){ return v === '-' ? 0 : (v === '+' ? 100 : 50); }
function momVal(e){ var v = gv(e, 'momentum'); return (v === '-' || v === '+' || v === '0') ? v : ''; }
/* Known-since year: stored as a 4-digit year. Migrates old year-count values. */
function knownSinceYear(e){
  var v = String(gv(e, 'years_known') || '').trim();
  if(!v) return 0;
  var n = parseInt(v, 10);
  if(n >= 1900 && n <= 2100) return n;
  if(n > 0 && n < 100) return new Date().getFullYear() - n;
  return 0;
}
function yearsKnownCalc(e){
  var y = knownSinceYear(e);
  return y ? Math.max(0, new Date().getFullYear() - y) : 0;
}
function tierOf(e){ return (((e || {}).profile || {}).tier || '').toLowerCase(); }
function tierCol(e){ return (TIERS[tierOf(e)] || {}).c || '#4a5568'; }
function tierName(e){ return (TIERS[tierOf(e)] || {}).n || ''; }
function catLabel(e){
  var v = gv(e, 'category'), ps = fieldDef('category').o || [];
  for(var i = 0; i < ps.length; i++) if(ps[i][0] === v) return ps[i][1];
  return v;
}
var RELC = { mutual:'#e0688a', following:'#b48ce8', follower:'#8b95a7' };
var RELN = { mutual:'Mutual', following:'Following', follower:'Follower' };

var S = {
  q:'', rel:'', lvlF:0, auditOnly:false, enrichedOnly:false, tag:null, sort:'strength',
  rail:'people', limit:200, showIndicators:false,
  sel:null, editing:false, lvl:1, hist:[], fwd:[], wide:false,
  mode:'3d', colorBy:'tier', showBg:false, listOpen:true, tierF:'',
  openSecs:{}, evEdit:null, degEdit:null, jumpTo:null, editGroup:1
};
var D = null, NODES = [], ORDER = [], LIST_ORDER = [], BYN = {}, PK2I = {};

/* ---------- small helpers ---------- */
function $(s, r){ return (r || document).querySelector(s); }
function $$(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0;
  var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function tagList(v){ return String(v || '').split(',').map(function(x){ return x.trim(); }).filter(Boolean); }
function splitTags(v, sep){
  var re = String(sep || ', ').indexOf(';') >= 0 ? /\s*;\s*/ : /\s*,\s*/;
  return String(v || '').split(re).map(function(x){ return x.trim(); }).filter(Boolean);
}
function cap(s){ s = String(s || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function fmtPhone(p){
  var raw = String(p || '').trim(), ext = '';
  var xm = raw.match(/[;x]|ext\.?\s*(\d+)$/i);
  if(xm){ ext = (xm[1] || raw.split(/[;x]/i).pop() || '').replace(/\D/g, ''); raw = raw.slice(0, xm.index).trim(); }
  var d = raw.replace(/\D/g, '');
  if(d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
  var out = d.length === 10 ? '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6) : raw;
  return out + (ext ? ' ext. ' + ext : '');
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
function parseArr(v){
  if(Array.isArray(v)) return v;
  var str = String(v || '').trim();
  if(!str) return [];
  try{ var a = JSON.parse(str); if(Array.isArray(a)) return a; }catch(x){}
  // legacy text format: "Major — School (Year); Major2 — School2 (Year2)"
  return str.split(/\s*;\s*/).map(function(part){
    var m = part.match(/^(.*?)\s*[\u2014-]\s*(.*?)\s*(?:\(([^)]*)\))?$/);
    if(!m) return null;
    var left = m[1].trim(), right = m[2].trim(), year = (m[3] || '').trim();
    // guess which side is the school
    var isSchool = function(x){ return /^(SUNY|CUNY)\b|university|college|institute|academy|\bschool\b/i.test(x); };
    var d = {};
    if(isSchool(right)){ d.school = right; if(left) d.major = left; }
    else if(isSchool(left)){ d.school = left; if(right) d.major = right; }
    else { d.school = right || left; if(left && left !== d.school) d.major = left; }
    if(year) d.year = year.replace(/[^0-9]/g, '').slice(-4) || year;
    return d.school ? d : null;
  }).filter(Boolean);
}

/* ---------- icons (one stroke family, so they all sit together) ---------- */
var IC = {
  home:'<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  chevl:'<path d="m15 18-6-6 6-6"/>',
  chevr:'<path d="m9 18 6-6-6-6"/>',
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
  help:'<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  folder:'<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  book:'<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  quote:'<path d="M10 11H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6c0 2-1 3.5-3 4.5M20 11h-4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6c0 2-1 3.5-3 4.5"/>',
  zap:'<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  briefcase:'<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  award:'<circle cx="12" cy="8" r="6"/><path d="M15.5 13 17 22l-5-3-5 3 1.5-9"/>',
  church:'<path d="M12 2v4M8 4h8"/><path d="M5 8 3 9v13h18V9l-2-1"/><path d="M9 22v-6h6v6"/>',
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
  sparkle:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  cap:'<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/><path d="M22 10v6"/>'
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

/* ---------- field registry: one place that knows every Profiles column the page edits ---------- */
var ORG_CATS = [
  {k:'churches', label:'Churches', options:['CFC Potsdam','CFC Canton','CFC Madrid','NTC','Calvary Baptist']},
  {k:'companies', label:'Companies', options:['Rochester Regional Health','Clarkson University','Park Bros.']},
  {k:'universities', label:'Universities', options:['SUNY Canton','SUNY Potsdam','St. Lawrence University','Clarkson University']}
];
var F = {
  display_name:{ l:'Name', t:'text' },
  also_known_as:{ l:'Also known as', t:'text' },
  phone:{ l:'Phone', t:'phone' },
  email:{ l:'Email', t:'text' },

  relationship:{ l:'Relationship', t:'select', o:['','family','friend','coworker','acquaintance','other'] },
  context:{ l:'Context', t:'select', o:['','work','school','military','community','church','online','other'] },
  category:{ l:'Category', t:'select', o:[['',''],['peer','Peer'],['rom','Romantic'],['fam','Family'],['auth','Authority'],['ment','Mentor'],['conf','Conflict']] },
  years_known:{ l:'Known since', t:'text' },
  tier:{ l:'Tier', t:'tier' },
  momentum:{ l:'Momentum', t:'momentum' },

  charisma:{ l:'Charisma', t:'score' },
  competence:{ l:'Competence', t:'score' },
  intellect:{ l:'Intellect', t:'score' },
  creativity:{ l:'Creativity', t:'score' },
  reliability:{ l:'Reliability', t:'score' },
  reputation:{ l:'Reputation', t:'score' },
  assertiveness:{ l:'Assertiveness', t:'score' },
  ego:{ l:'Ego', t:'score' },

  specialty:{ l:'Specialty', t:'text' },
  interests:{ l:'Interests', t:'text' },
  shared_interests:{ l:'Shared interests', t:'tags', sep:', ' },
  churches:{ l:'Churches', t:'pick', sep:', ' },
  companies:{ l:'Companies', t:'pick', sep:', ' },
  universities:{ l:'Universities', t:'pick', sep:', ' },
  chips:{ l:'Tags', t:'tags', sep:'; ', ph:'+ type: label' },
  public_footprint:{ l:'Public footprint', t:'long', r:4 },
  highlights:{ l:'Highlights', t:'tags', sep:' | ', ph:'Key fact, e.g. NYSP trooper in Canton' },
  achievements:{ l:'Achievements', t:'tags', sep:' | ', ph:'Award + year, e.g. Dean\'s List 2020' },

  synopsis:{ l:'Synopsis', t:'long', r:4, ai:'synopsis', ph:'One topic per line, starting with a label and colon.' },

  review_flag:{ l:'Review flag', t:'select', o:[['',''],['missing_info','Missing info'],['duplicate','Possible duplicate']] },
  relationship_type:{ l:'Type (legacy)', t:'text' },
  sources:{ l:'Sources', t:'text' },
  mentions:{ l:'Mentions', t:'text' }
};
var L1_SCORES = ['charisma','competence','intellect','creativity','reliability','reputation','assertiveness','ego'];
var READ_TRAITS = L1_SCORES.slice();
var L1_TOTAL = 14;

/* The edit stack, top to bottom. lv = which level color the section wears. */
var SECTIONS = [
  { id:'identity',    title:'Contact',      ic:'user',      lv:1, fields:['phone','email'] },
  { id:'relationship',title:'Relationship', ic:'users',     lv:2, fields:['relationship','context','category','years_known','tier','momentum'] },
  { id:'ratings',     title:'Persona',      ic:'star',      lv:1, fields:L1_SCORES },
  { id:'background',  title:'Background',   ic:'briefcase', lv:1, fields:['specialty','interests','churches','companies','universities','highlights','public_footprint'] },
  { id:'onfile',      title:'On file',      ic:'quote',     lv:1, fields:['synopsis'] },
  { id:'education',   title:'Education',    ic:'cap',       lv:1, fields:[] },
  { id:'connections', title:'Connections',  ic:'share',     lv:2, fields:[] },
  { id:'timeline',    title:'Timeline',     ic:'calendar',  lv:2, fields:[] },
  { id:'files',       title:'Files',        ic:'folder',    lv:3, fields:[] },
  { id:'admin',       title:'Admin',        ic:'shield',    lv:0, fields:['review_flag','relationship_type','sources','mentions'] }
];
var EVT_ICON = { milestone:'flag', note:'quote', 'life event':'heart' };

function fieldDef(k){ return F[k] || { k:k, l:k }; }
function dispName(e){
  var pr = e.profile || {};
  var fn = (pr.first_name || '').trim(), ln = (pr.last_name || '').trim();
  if(fn || ln) return (fn + ' ' + ln).trim();
  return e.display || e.name || '';
}

/* ---------- education: degrees from the four local universities ---------- */
var SCHOOLS = {
  'Clarkson University':{ s:'Clarkson' }, 'SUNY Potsdam':{ s:'SUNY Potsdam' },
  'SUNY Canton':{ s:'SUNY Canton' }, 'St. Lawrence University':{ s:'SLU' }
};
var DEGREE_TYPES = ['AA','AAS','AS','BA','BS','BFA','BBA','BTech','MA','MS','MBA','MEd','MPA','PhD','EdD','DPT','OTD','JD','MD','Certificate','Attended (no degree)','Other'];
function degreesOf(e){ return parseArr(gv(e, 'degrees')).filter(function(d){ return d && (d.school || d.degree || d.major || d.year); }); }
function degreeText(e){ return degreesOf(e).map(function(d){ return [d.school, d.degree, d.major, d.year].join(' '); }).join(' '); }
function yy(y){ y = String(y || ''); return /^\d{4}$/.test(y) ? '\u2019' + y.slice(2) : y; }
function schoolShort(s){ return (SCHOOLS[s] && SCHOOLS[s].s) || s || 'School'; }
function sortDegrees(ds){ return ds.slice().sort(function(a, b){ return String(b.year || '').localeCompare(String(a.year || '')); }); }
function achievementsOf(e){
  var fp = String(gv(e, 'public_footprint') || ''), out = [], seen = {};
  function add(label){ label = String(label || '').trim(); if(label && !seen[label.toLowerCase()]){ seen[label.toLowerCase()] = 1; out.push(label); } }
  var m, rx;
  // Dean's / President's List with optional year ranges
  rx = /(President'?s|Dean'?s) List/gi;
  while((m = rx.exec(fp))){
    var tail = fp.slice(m.index, m.index + 120).split(/[.\n]/)[0];
    var ym = tail.match(/((?:Fall|Spring|Summer|Winter)\s+(?:19|20)\d{2}|(?:19|20)\d{2}(?:\s*(?:[\u2013\u2014-]|to)\s*(?:19|20)?\d{2,4})?(?:\s*,\s*(?:19|20)\d{2})*)/i);
    var yrs = ym ? ym[1].trim().replace(/\s+/g, ' ') : '';
    add(m[1].replace(/'?s$/, "'s") + ' List' + (yrs ? ' ' + yrs : ''));
  }
  // Named awards
  ['Director\'?s Award', 'Photo of the Day', 'Rookie of the Year'].forEach(function(pat){
    rx = new RegExp(pat, 'gi');
    while((m = rx.exec(fp))) add(m[0]);
  });
  // Scholarships: "X Scholarship"
  rx = /([A-Z][A-Za-z&.'-]*(?:\s+[A-Z][A-Za-z&.'-]*){0,3} Scholarship)/g;
  while((m = rx.exec(fp))) add(m[1]);
  // Certifications: "Certified X Technician/..."
  rx = /Certified ([A-Z][A-Za-z ]{2,40}?)(?=\s+(?:at|in|from|\.|,|\n|$))/g;
  while((m = rx.exec(fp))) add('Certified ' + m[1].trim());
  return out.slice(0, 8);
}
function parseAchievements(v){
  return String(v || '').split(/\s*\|\s*/).map(function(x){ return x.trim(); }).filter(Boolean).slice(0, 8);
}
function degBadge(d){
  var bits = [];
  if(d.degree) bits.push(esc(d.degree));
  if(d.major) bits.push(esc(d.major));
  if(d.year) bits.push(esc(yy(d.year)));
  return '<span class="dbadge" title="' + esc([d.school, d.degree, d.major, d.year].filter(Boolean).join(' · ')) + '">' + ic('cap', 12) +
    '<b>' + esc(schoolShort(d.school)) + '</b>' + (bits.length ? '<span>' + bits.join(' · ') + '</span>' : '') + '</span>';
}
function headBadges(e){
  var ds = sortDegrees(degreesOf(e)); if(!ds.length) return '';
  var shown = ds.slice(0, 4), more = ds.length - shown.length;
  return '<div class="dbadges">' + shown.map(degBadge).join('') + (more > 0 ? '<span class="dmore">+' + more + '</span>' : '') + '</div>';
}
function capHTML(e){
  var ds = degreesOf(e); if(!ds.length) return '';
  return '<span class="rcap" title="' + esc(ds.map(function(d){ return schoolShort(d.school) + ' ' + (d.degree || ''); }).join(', ')) + '">' + ic('cap', 14) + '</span>';
}

/* The sheet row key. Prefix tells which data dump a person came from. */
function pkey(e){
  var n = String(e.name || '');
  if(/^(ig|ct|sf|fdb):/.test(n)) return n;
  if(e.src === 'contacts') return 'ct:' + n.toLowerCase();
  if(e.src === 'subject') return 'sf:' + ((e.record && e.record.slug) || n);
  return 'ig:' + n.toLowerCase();
}

/* Get a field's value from wherever it lives. The profile row wins once it has been edited here. */
function isEnriched(e){
  var pr = e.profile || {};
  if((pr.degrees || '').trim() || (pr.highlights || '').trim() || (pr.achievements || '').trim()) return true;
  var fp = String(pr.public_footprint || e.public_footprint || '');
  return fp.indexOf('http') >= 0;
}
function gv(e, k){
  var p = e.profile || {}, v = p[k];
  var edited = !!(e._set && e._set[k]);
  if(!edited && (v === undefined || v === null || v === '')){
    v = e[k];
    if(v === undefined || v === null || typeof v === 'object') v = (e.friendsdb || {})[k];
    if((v === undefined || v === null || v === '') && k === 'phone') v = ((e.contact || {}).phones || []).join(', ');
    if((v === undefined || v === null || v === '') && k === 'email') v = ((e.contact || {}).emails || []).join(', ');
  }
  return (v === undefined || v === null || typeof v === 'object') ? '' : String(v);
}
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
  return '';
}
function l1Fill(e){
  var n = 0;
  if(gv(e, 'phone')) n++;
  if(gv(e, 'email')) n++;
  ['specialty','interests'].concat(L1_SCORES).forEach(function(k){ if(gv(e, k)) n++; });
  if(ORG_CATS.some(function(cat){ return tagList(gv(e, cat.k)).length; })) n++;
  if(gv(e, 'synopsis')) n++;
  return n;
}
function normEntry(r){
  var p = r.profile || {};
  var pe = parseArr(p.events), pf = parseArr(p.files);
  r.events = pe.length ? pe : (Array.isArray(r.events) ? r.events : []);
  r.files = pf.length ? pf : (Array.isArray(r.files) ? r.files : []);
}
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
  if(S.enrichedOnly && !isEnriched(r)) return false;
  if(S.tag && tagList(gv(r, S.tag.k)).indexOf(S.tag.v) < 0) return false;
  if(S.rel && r.relation !== S.rel) return false;
  if(!skipLvl && S.lvlF && personLevel(r) !== S.lvlF) return false;
  if(S.tierF && tierOf(r) !== S.tierF) return false;
  if(!skipQ){
    var q = S.q.trim().toLowerCase();
    if(q && ((dispName(r) + ' @' + r.name + ' ' + gv(r, 'specialty') + ' ' + gv(r, 'interests') + ' ' + gv(r, 'also_known_as') + ' ' + degreeText(r) + ' ' + tierName(r)).toLowerCase().indexOf(q) < 0)) return false;
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
    n.col = S.colorBy === 'rel' ? (RELC[r.relation] || '#8b95a7') : tierCol(r);
  });
}
function refresh(){
  refreshMatch(); renderRail(); glRecolor(); updateAuditPill(); updateLegend();
}
var _rt = null;
function refreshSoon(){ clearTimeout(_rt); _rt = setTimeout(refresh, 450); }

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
  return '<span class="pips" title="On file' + (on[1] ? ', Record' : '') + (on[2] ? ', Files' : '') + '">' +
    [1,2,3].map(function(n){ return '<i class="pip' + (on[n - 1] ? ' lit' : '') + '" style="--c:' + LV[n].c + '"></i>'; }).join('') + '</span>';
}
/* Per-person level dots: blue=On file, yellow=Record, green=Files.
   One dot per filled section; hollow when empty. */
var DOTDEFS = [
  ['Contact', '#7ea6f0', 'identity', function(e){ var p = e.profile || {}; return !!((p.phone || '').trim() || (p.email || '').trim() || (e.name || '').trim()); }],
  ['Education', '#7ea6f0', 'education', function(e){ return degreesOf(e).length > 0; }],
  ['Background', '#7ea6f0', 'background', function(e){ var p = e.profile || {}; return !!((p.specialty || '').trim() || (p.interests || '').trim()); }],
  ['Synopsis', '#7ea6f0', 'onfile', function(e){ return !!((e.profile || {}).synopsis || '').trim(); }],
  ['Persona', '#7ea6f0', 'ratings', function(e){ var p = e.profile || {}; return ['assertiveness','charisma','competence','creativity','intellect','ego'].some(function(k){ return p[k] !== undefined && p[k] !== null && String(p[k]).trim() !== ''; }); }],
  ['Relationship', '#f0b44c', 'relationship', function(e){ var p = e.profile || {}; return !!((p.relationship || '').trim() || (p.tier || '').trim()); }],
  ['Timeline', '#f0b44c', 'timeline', function(e){ return !!((e.events || []).length); }],
  ['Phases', '#f0b44c', 'connections', function(e){ return connPhases(e).length > 0; }],
  ['Files', '#5cd6a0', 'files', function(e){ return !!((e.files || []).length); }],
];
function fieldIndicators(di, e){
  if(!S.showIndicators) return '';
  return '<span class="fstrip">' + DOTDEFS.map(function(d){
    var on = d[3](e);
    return '<i class="iseg' + (on ? ' on' : '') + '" style="--c:' + d[1] + '" data-di="' + di + '" data-sec="' + d[2] + '" title="' + d[0] + (on ? ': filled — click to edit' : ': empty — click to add') + '"></i>';
  }).join('') + '</span>';
}
function indLegendHTML(){
  if(!S.showIndicators) return '';
  return '<div class="indlegend"><b><i class="iseg on" style="--c:#7ea6f0"></i>On file</b>' +
    '<b><i class="iseg on" style="--c:#f0b44c"></i>Record</b>' +
    '<b><i class="iseg on" style="--c:#5cd6a0"></i>Files</b>' +
    '<b><i class="iseg web"></i>Web-scraped</b></div>';
}
function renderRail(){
  var lb = $('#leftbody'), keepTop = lb ? lb.scrollTop : 0;
  $$('#railtabs button').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-r') === S.rail); });
  $('#lvlchips').parentNode.style.display = S.rail === 'people' ? '' : 'none';
  if(S.rail === 'people') railPeople();
  else if(S.rail === 'events') railEvents();
  else railFiles();
  updateFilterUI();
  if(lb) lb.scrollTop = keepTop;
}
function railPeople(){
  renderLvlChips();
  var rows = listRows();
  var total = LIST_ORDER.filter(function(di){ return (D.directory[di].profile || {}).deleted !== '1'; }).length;
  $('#lcount').textContent = rows.length === total ? total + ' people' : rows.length + ' of ' + total + ' people';
  var indTogg = '<label class="indtogg inscrl" title="Show per-person field indicators"><input type="checkbox" id="showindicators"' + (S.showIndicators ? ' checked' : '') + '><span class="itrack"><i></i></span><em>Show Indicators</em></label>';
  var shown = rows.slice(0, S.limit);
  var h = shown.map(function(di){
    var r = D.directory[di], lv = personLevel(r), aud = (r.profile || {}).audit === 'audited';
    var sub = subLine(r) + (r.relation ? ' · ' + RELN[r.relation] : '');
    return '<div class="row' + (S.sel === di ? ' sel' : '') + '" data-i="' + di + '" role="button" tabindex="0">' +
      '<div class="ava" style="--c:' + LV[lv].c + '">' + esc((dispName(r).replace(/^@/, '').trim().charAt(0) || '·').toUpperCase()) +
      (S.showIndicators ? (!aud ? '<i class="auddot' + (isEnriched(r) ? ' enr' : '') + '" title="Needs audit"></i>' : (isEnriched(r) ? '<i class="enrdot" title="Enriched from online sources"></i>' : '')) : '') + '</div>' +
      '<div class="nm"><b>' + esc(dispName(r)) + '</b><div class="subrow"><span class="sub">' + esc(sub) + '</span>' + fieldIndicators(di, r) + '</div></div>' + capHTML(r) + '</div>';
  }).join('');
  if(rows.length > shown.length) h += '<button class="morebtn" data-more="1">Show ' + Math.min(200, rows.length - shown.length) + ' more</button>';
  $('#leftbody').innerHTML = indTogg + indLegendHTML() + (h || '<div class="empty-note">No one matches. Try clearing a filter.</div>');
  var si = $('#showindicators');
  if(si) si.addEventListener('change', function(e){ S.showIndicators = e.target.checked; refresh(); });
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
  $('#leftbody').innerHTML = h || '<div class="empty-note">No timeline events yet. Open someone and add one in the Timeline section.</div>';
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
  $('#leftbody').innerHTML = h || '<div class="empty-note">No files attached yet. Open someone and use the Files section.</div>';
}
function updateFilterUI(){
  var n = (S.rel ? 1 : 0) + (S.tierF ? 1 : 0) + (S.auditOnly ? 1 : 0) + (S.enrichedOnly ? 1 : 0) + (S.sort !== 'strength' ? 1 : 0);
  var b = $('#filtercount');
  b.hidden = !n; b.textContent = n;
  $('#frel').value = S.rel; $('#fsort').value = S.sort; $('#fauditonly').checked = S.auditOnly; $('#fenrichedonly').checked = S.enrichedOnly;
  var chips = [];
  if(S.tag) chips.push('<button class="aflt" data-clr="tag">' + esc(S.tag.v) + '<b>' + ic('x', 11) + '</b></button>');
  if(S.rel) chips.push('<button class="aflt" data-clr="rel">' + esc(RELN[S.rel]) + '<b>' + ic('x', 11) + '</b></button>');
  if(S.tierF) chips.push('<button class="aflt" data-clr="tier">' + esc(TIERS[S.tierF].n) + '<b>' + ic('x', 11) + '</b></button>');
  if(S.auditOnly) chips.push('<button class="aflt" data-clr="audit">Needs audit<b>' + ic('x', 11) + '</b></button>');
  if(S.enrichedOnly) chips.push('<button class="aflt" data-clr="enriched">Enriched<b>' + ic('x', 11) + '</b></button>');
  if(S.q.trim()) chips.push('<button class="aflt" data-clr="q">“' + esc(S.q.trim()) + '”<b>' + ic('x', 11) + '</b></button>');
  $('#activeflt').innerHTML = chips.join('');
  $('#auditpill').classList.toggle('on', S.auditOnly);
}
function clearFilter(k){
  if(k === 'tag') S.tag = null;
  else if(k === 'rel') S.rel = '';
  else if(k === 'tier') S.tierF = '';
  else if(k === 'audit') S.auditOnly = false;
  else if(k === 'enriched') S.enrichedOnly = false;
  else if(k === 'q'){ S.q = ''; $('#fq').value = ''; }
  else if(k === 'all'){ S.tag = null; S.rel = ''; S.tierF = ''; S.auditOnly = false; S.enrichedOnly = false; S.sort = 'strength'; S.lvlF = 0; S.q = ''; $('#fq').value = ''; }
  S.limit = 200; refresh();
}
function updateAuditPill(){
  var live = LIST_ORDER.filter(function(di){ return (D.directory[di].profile || {}).deleted !== '1'; });
  var done = live.filter(function(di){ return (D.directory[di].profile || {}).audit === 'audited'; }).length;
  $('#aptxt').textContent = 'Audited ' + done + '/' + live.length;
  $('#apfill').style.width = (live.length ? Math.round(done / live.length * 100) : 0) + '%';
}
function updateLegend(){
  var tc = { vetted:0, associate:0, open:0, none:0 }, rc = { mutual:0, following:0, follower:0 };
  LIST_ORDER.forEach(function(di){
    var r = D.directory[di];
    if(!passes(r, true)) return;
    if(S.colorBy === 'rel'){ if(rc[r.relation] != null) rc[r.relation]++; }
    else { var t = tierOf(r); if(tc[t] != null) tc[t]++; else tc.none++; }
  });
  var h = '';
  if(S.colorBy === 'rel'){
    ['mutual','following','follower'].forEach(function(k){
      h += '<button class="lg' + (S.rel === k ? ' on' : '') + '" data-rf="' + k + '" style="--c:' + RELC[k] + '"><i></i>' + RELN[k] + ' <b>' + rc[k] + '</b></button>';
    });
  } else {
    TIER_ORDER.forEach(function(t){
      h += '<button class="lg' + (S.tierF === t ? ' on' : '') + '" data-tf="' + t + '" style="--c:' + TIERS[t].c + '" title="Show only ' + TIERS[t].n + '"><i></i>' + TIERS[t].n + ' <b>' + tc[t] + '</b></button>';
    });
    if(tc.none) h += '<span class="lg dim" style="--c:#4a5568"><i></i>Untiered <b>' + tc.none + '</b></span>';
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
function emptyBox(text){
  return '<div class="empty"><p>' + esc(text) + '</p></div>';
}
function reviewBadge(e){
  var f = (e.profile || {}).review_flag;
  if(!f) return '';
  var label = f === 'duplicate' ? 'Possible duplicate' : (f === 'missing_info' ? 'Missing info' : f);
  return '<span class="revbadge" title="Flagged for review">' + esc(label) + '</span>';
}
function editHeroName(e){
  if(!e || !S.editing) return;
  var pr = e.profile || {};
  var fn = prompt('First name:', pr.first_name || '');
  if(fn === null) return;
  var ln = prompt('Last name:', pr.last_name || '');
  if(ln === null) return;
  queuePatch(S.sel, { first_name: fn.trim(), last_name: ln.trim() });
  renderPanel(true);
  toast('Name updated.');
}
function phead(e){
  var prof = e.profile || {}, pl = personLevel(e), col = LV[pl].c, aud = prof.audit === 'audited';
  var prev = S.hist.length ? D.directory[S.hist[S.hist.length - 1]] : null;
  var auditBack = AUD.fromAudit ? '<button class="ibtn" data-act="backaudit" title="Back to the audit list">' + ic('back', 15) + '<span>Audit</span></button>' : '';
  var back = prev ? '<button class="ibtn" data-act="back" title="Back to ' + esc(dispName(prev)) + ' (Alt+←)" aria-label="Back">' + ic('back', 17) + '</button>' : '';
  var edit = S.editing
    ? '<button class="ibtn solid" data-act="done" title="Finish editing (Esc)">' + ic('check', 16) + '<span>Done</span></button>'
    : '<button class="ibtn" data-act="edit" title="Edit this dossier (E)" aria-label="Edit">' + ic('edit', 16) + '</button>';
  var cnt = { 1:l1Fill(e) + '/' + L1_TOTAL, 2:(e.events || []).length || '', 3:(e.files || []).length || '' };
  var tabs = S.editing ? '' : '<div class="tabs" role="tablist">' + [1,2,3].map(function(n){
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
  return '<div class="phead' + (S.editing ? ' editing' : '') + '"><div class="hrow">' + auditBack + back +
    '<div class="ava lg-ava" style="--c:' + col + '">' + esc((dispName(e).replace(/^@/, '').trim().charAt(0) || '·').toUpperCase()) + '</div>' +
    '<div class="hname"><h2 title="' + esc(dispName(e)) + (S.editing ? ' — click to edit name' : '') + '"' + (S.editing ? ' data-act="editname" style="cursor:pointer"' : '') + '>' + esc(dispName(e)) +
    (S.editing ? '<span class="hpct" title="Profile completeness">' + pct(e) + '%</span>' : '') + '</h2>' +
    (function(){ var sl = subLine(e); return sl ? '<div class="hsub"><span>' + esc(sl) + '</span>' +
    reviewBadge(e) + (S.editing ? '<span class="editflag">Editing</span>' : '') + '</div>' : ''; })() + '</div>' +
    '<div class="hact">' + edit +
    '<button class="ibtn" id="pwide" data-act="wide" title="' + (S.wide ? 'Narrow the panel' : 'Widen the panel') + '" aria-label="Resize panel">' + ic(S.wide ? 'shrink' : 'expand', 16) + '</button>' +
    menu + '<button class="ibtn" data-act="close" title="Close (Esc)" aria-label="Close">' + ic('x', 17) + '</button></div></div>' + headBadges(e) + tabs + '</div>';
}

/* ---------- panel: view mode ---------- */
function footprintHTML(e){
  var fp = gv(e, 'public_footprint');
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
  var phones = gv(e, 'phone'), emails = gv(e, 'email'), aka = gv(e, 'also_known_as');
  var rows = '';
  if(e.src !== 'contacts' && e.src !== 'subject' && e.name)
    rows += '<div class="idrow"><span class="idic">' + ic('ig', 15) + '</span><div><span>Instagram</span><a class="iglink ' + (e.relation === 'mutual' ? 'ig-mutual' : 'ig-oneway') + '" href="' + igURL(e.name) + '" target="_blank" rel="noopener">@' + esc(e.name) + '</a></div></div>';
  if(aka) rows += '<div class="idrow"><span class="idic">' + ic('user', 15) + '</span><div><span>Also known as</span><b>' + esc(aka) + '</b></div></div>';
  if(phones) rows += '<div class="idrow"><span class="idic">' + ic('phone', 15) + '</span><div><span>Phone</span>' +
    String(phones).split(',').map(function(x){ var f = fmtPhone(x); return '<a href="tel:' + esc(f.replace(/[^\d+]/g, '')) + '">' + esc(f) + '</a>'; }).join('') + '</div></div>';
  if(emails) rows += '<div class="idrow"><span class="idic">' + ic('mail', 15) + '</span><div><span>Email</span>' +
    String(emails).split(',').map(function(x){ x = x.trim(); return '<a href="mailto:' + esc(x) + '">' + esc(x) + '</a>'; }).join('') + '</div></div>';
  var contact = rows ? card('user', 'Contact', 1, rows) : '';

  var ds = sortDegrees(degreesOf(e));
  var edu = ds.length ? card('cap', 'Education', 1, '<div class="edulist">' + ds.map(function(d){
    var line = [d.degree, d.major].filter(Boolean).join(' \u00b7 ');
    return '<div class="edu"><span class="eic">' + ic('cap', 15) + '</span><div><b>' + esc(d.school || 'School not set') + '</b>' +
      (line ? '<span>' + esc(line) + '</span>' : '') + (d.note ? '<span class="dim">' + esc(d.note) + '</span>' : '') + '</div>' +
      (d.year ? '<em>' + esc(d.year) + '</em>' : '') + '</div>';
  }).join('') + '</div>', '', '') : '';

  var ach = parseAchievements(gv(e, 'achievements'));
  if(!ach.length) ach = achievementsOf(e);
  if(ach.length){
    var achHTML = '<div class="achrow"><span class="achlab">' + ic('award', 13) + 'Honors</span><div class="chips">' +
      ach.map(function(a){ return '<span class="vchip achchip">' + ic('award', 12) + esc(a) + '</span>'; }).join('') + '</div></div>';
    edu = edu ? edu.replace(/<\/div><\/section>$/, achHTML + '</div></section>') : card('cap', 'Education', 1, achHTML, '', 'span');
  }
  var traits = '<div class="traits grid2">' + L1_SCORES.map(function(k){
    var v = gv(e, k);
    return '<div class="trait' + (v ? '' : ' empty-t') + '"><span>' + esc(fieldDef(k).l) + '</span>' + pips5(v) + '</div>';
  }).join('') + '</div>';
  var personaTraits = '<div class="persona-grid">' + L1_SCORES.map(function(k){
    var v = parseInt(gv(e, k), 10) || 0;
    return '<div class="ptrait" title="' + esc(fieldDef(k).l) + ': ' + v + '/5"><span>' + esc(fieldDef(k).l) + '</span><div class="pbar"><b style="width:' + (v*20) + '%"></b></div></div>';
  }).join('') + '</div>';
  var ratings = L1_SCORES.some(function(k){ return gv(e, k) !== ''; }) ? card('activity', 'Persona', 1, personaTraits) : '';

  var bg = '';
  if(gv(e, 'specialty')) bg += '<div class="idrow"><span class="idic">' + ic('zap', 15) + '</span><div><span>Specialty</span><b>' + esc(gv(e, 'specialty')) + '</b></div></div>';
  if(gv(e, 'interests')) bg += '<div class="idrow"><span class="idic">' + ic('tag', 15) + '</span><div><span>Interests</span><b>' + esc(gv(e, 'interests')) + '</b></div></div>';
  if(bg) bg = '<div class="bggrid">' + bg + '</div>';
  var ORG_ICONS = { churches:'church', companies:'briefcase', universities:'cap' };
  var orgs = '';
  ORG_CATS.forEach(function(cat){
    tagList(gv(e, cat.k)).forEach(function(v){
      orgs += '<span class="vchip orgchip"><span class="oc-ic">' + ic(ORG_ICONS[cat.k] || 'briefcase', 12) + '</span>' + esc(v) + '</span>';
    });
  });
  var hl = parseAchievements(gv(e, 'highlights'));
  var hlHTML = hl.length ? '<div class="subhead">Highlights</div><div class="chips">' +
    hl.map(function(h){ return '<span class="vchip hchip">' + ic('zap', 12) + esc(h) + '</span>'; }).join('') + '</div>' : '';
  var bgBody = bg + hlHTML + (orgs ? '<div class="subhead">Organizations</div><div class="chips">' + orgs + '</div>' : '');
  var background = bgBody ? card('briefcase', 'Background', 1, bgBody) : '';

  var syn = gv(e, 'synopsis') ? card('quote', 'Synopsis', 1, '<div class="narr">' + esc(gv(e, 'synopsis')) + '</div>', '', 'span') : '';
  var ka = knownAssociates(e);
  var conns = ka.length ? card('share', 'Known associates', 1, '<div class="chips">' + ka.map(function(nb){ return nbrChipHTML(nb, false); }).join('') + '</div>', '', '') : '';
  var top2col = (contact || edu) ? '<div class="ce2col">' + contact + edu + '</div>' : '';
  var out = top2col + ratings + background + syn + conns;
  if(!out) out = card('user', 'On file', 1, emptyBox('Nothing on file yet. Press the pencil to start filling this in.'), '', 'span');
  return out;
}

function linkedFrom(e){
  var me = (e.name || '').toLowerCase(), out = [];
  D.directory.forEach(function(r, di){
    if(r === e || (r.profile || {}).deleted === '1') return;
    if((r.neighbors || []).some(function(n){ return (n.u || '').toLowerCase() === me; })) out.push(di);
  });
  return out;
}
function hiddenAssoc(e){
  var h = {};
  tagList(String((e.profile || {}).close_hide || '')).forEach(function(x){ h[x.toLowerCase()] = 1; });
  return h;
}
function knownAssociates(e){
  var seen = {}, out = [], hide = hiddenAssoc(e);
  (e.neighbors || []).forEach(function(nb){
    var k = (nb.u || '').toLowerCase();
    if(k && !seen[k] && !hide[k]){ seen[k] = 1; out.push({ u:nb.u, d:nb.d }); }
  });
  return out;
}
function listedByOthers(e){
  // reverse edges: people whose auto-picks include this person. Shown separately in the
  // editor as incoming/auto context — NOT as this person's own known associates.
  var me = (e.name || '').toLowerCase(), hide = hiddenAssoc(e), out = [];
  D.directory.forEach(function(r){
    if(r === e || (r.profile || {}).deleted === '1') return;
    if((r.neighbors || []).some(function(n){ return (n.u || '').toLowerCase() === me; })){
      var k = (r.name || '').toLowerCase();
      if(k && !hide[k]) out.push(r);
    }
  });
  return out;
}
function nbrChipHTML(nb, removable){
  var di = BYN[(nb.u || '').toLowerCase()];
  var d = di != null ? LV[personLevel(D.directory[di])].c : '#5a6b84';
  var label = di != null ? auName(D.directory[di]).name : personLabel(nb.u, nb.d);
  return '<span class="nchip' + (removable ? '' : ' plain') + '" style="--d:' + d + '" ' + (di != null ? 'data-act="nav" data-di="' + di + '" title="Open dossier"' : 'title="Not in the directory"') + '><i></i>' +
    esc(label) + (removable ? '<b class="nx" data-act="rmnx" data-u="' + esc(nb.u) + '" title="Remove known associate">×</b>' : '') + '</span>';
}
function tile(icon, val, label){
  return '<div class="tile"><span class="tic">' + ic(icon, 15) + '</span><span class="tx"><b' + (val ? '' : ' class="dim"') + '>' + esc(val || '—') + '</b><i>' + esc(label) + '</i></span></div>';
}
function timelineHTML(e){
  var evs = sortedEvents(e);
  if(!evs.length) return emptyBox('No timeline events yet.');
  return '<div class="tl">' + evs.map(function(o){
    var ev = o.ev;
    var meta = '';
    if(ev.init) meta += '<span class="evbadge">' + (ev.init === 'me' ? 'I reached out' : 'They reached out') + '</span>';
    return '<div class="ev"><span class="evdot"></span><div class="evtop"><time>' + evDate(ev.date) + '</time>' + meta + '</div>' +
      '<div class="evtitle">' + esc(ev.summary || '') + '</div>' + (ev.detail ? '<div class="evdetail">' + esc(ev.detail) + '</div>' : '') + '</div>';
  }).join('') + '</div>';
}

function lvl2View(e){
  var tier = tierOf(e), mom = momVal(e);
  var tierChip = tier ? '<div class="tchip1" style="--c:' + tierCol(e) + '"><b>' + TIERS[tier].n + '</b></div>' : '';
  var momHTML = '';
  if(mom){
    momHTML = '<div class="momview"><div class="momtrack"><div class="momfill" style="width:' + momPos(mom) + '%"></div>' +
      '<div class="mommark sym" style="left:' + momPos(mom) + '%">' + MOM_ICONS[mom] + '</div></div>' +
      '<div class="momlabels"><span>negative</span><b>' + MOM_LABELS[mom] + '</b><span>positive</span></div></div>';
  }
  var tierMom = (tierChip || momHTML) ? '<div class="tiermom">' + tierChip + momHTML + '</div>' : '';
  var sinceY = knownSinceYear(e), yrsK = yearsKnownCalc(e);
  var tiles = '<div class="tiles">' +
    tile('users', cap(gv(e, 'relationship')), 'Relationship') +
    tile('briefcase', cap(gv(e, 'context')), 'Context') +
    tile('tag', catLabel(e), 'Category') +
    tile('clock', sinceY ? String(sinceY) : '', 'Known since' + (yrsK > 0 ? ' (' + yrsK + ' yrs)' : '')) + '</div>';
  var connection = card('users', 'Connection', 2, tierMom + tiles, '', 'span');
  var phases = connTimelineHTML(e);
  var tlBody = phases ? '<div class="tl2col"><div class="tlmain">' + timelineHTML(e) + '</div><div class="tlphases"><div class="subhead">Phases</div>' + phases + '</div></div>' : timelineHTML(e);
  var tl = card('calendar', 'Timeline', 2, tlBody,
    '<button class="mini" data-act="addevent" style="--c:' + LV[2].c + '">' + ic('plus', 13) + 'Add event</button>', 'span');
  return connection + tl;
}

function filesHTML(e){
  var fs = e.files || [];
  if(!fs.length) return emptyBox('Nothing attached. Use a file when the timeline runs out of room.');
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

/* ---------- panel: edit mode (one stack of sections) ---------- */
function optPair(o){ return Array.isArray(o) ? o : [o, o ? cap(o) : '—']; }
function labHTML(f, extra){
  return '<span class="ilab">' + esc(f.l) + '</span>' + (extra || '');
}

function tagChip(v, on, rm){
  return '<span class="tchip' + (on ? ' on' : '') + (rm ? ' rm' : '') + '" data-tv="' + esc(v) + '">' + esc(v) + (rm ? '<b>×</b>' : '') + '</span>';
}
function orgCat(k){ return ORG_CATS.filter(function(c){ return c.k === k; })[0]; }
function rateRow(k, e){
  var f = fieldDef(k), v = gv(e, k);
  var h = '<div class="rrow"><span class="rlab">' + esc(f.l) + '</span><div class="dots" data-pk="' + k + '" data-v="' + esc(v) + '">';
  for(var i = 1; i <= 5; i++) h += '<span class="pdot' + (String(v) === String(i) ? ' on' : '') + '" data-v="' + i + '">' + i + '</span>';
  return h + '</div></div>';
}
function fieldRow(k, e){
  var f = fieldDef(k), v = gv(e, k);
  if(f.t === 'score') return rateRow(k, e);
  if(f.t === 'tier') return tierEditHTML(e);
  if(f.t === 'momentum') return momentumEditHTML(e);
  if(f.t === 'select'){
    var opts = f.o.map(optPair);
    if(v && !opts.some(function(p){ return p[0] === v; })) opts.push([v, v]);
    return '<div class="irow">' + labHTML(f) + '<select data-pk="' + k + '">' + opts.map(function(p){
      return '<option value="' + esc(p[0]) + '"' + (p[0] === v ? ' selected' : '') + '>' + esc(p[1]) + '</option>';
    }).join('') + '</select></div>';
  }
  if(f.t === 'long'){
    var ai = f.ai ? '<button class="mini neutral aibtn" data-act="tidy" data-k="' + k + '">' + ic('sparkle', 13) + 'Tidy with AI</button><span class="aimsg" id="aimsg-' + k + '"></span>' : '';
    return '<div class="lrow"><div class="lhead">' + labHTML(f) + ai + '</div><textarea data-pk="' + k + '" rows="' + (f.r || 4) + '" placeholder="' + esc(f.ph || '') + '">' + esc(v) + '</textarea></div>';
  }
  if(f.t === 'tags' || f.t === 'pick'){
    var sep = f.sep || ', ', cur = splitTags(v, sep), chips;
    if(f.t === 'pick'){
      var cat = orgCat(k), all = cat.options.concat(cur.filter(function(x){ return cat.options.indexOf(x) < 0; }));
      chips = all.map(function(o){ return tagChip(o, cur.indexOf(o) >= 0, false); });
    } else chips = cur.map(function(x){ return tagChip(x, true, true); });
    return '<div class="trow">' + labHTML(f) + '<div class="tchips" data-pk="' + k + '" data-mode="' + (f.t === 'pick' ? 'pick' : 'tags') + '" data-sep="' + esc(sep) + '">' +
      chips.join('') + '<input class="tadd" placeholder="' + esc(f.ph || '+ add') + '" aria-label="Add ' + esc(f.l) + '"></div></div>';
  }
  return '<div class="irow">' + labHTML(f) + '<input data-pk="' + k + '" value="' + esc(v) + '" placeholder="—" autocomplete="off"></div>';
}
function secFill(s, e){
  var n;
  if(s.id === 'connections'){ n = (e.neighbors || []).length + connPhases(e).length; return { t:String(n), done:n > 0 }; }
  if(s.id === 'education'){ n = degreesOf(e).length; return { t:String(n), done:n > 0 }; }
  if(s.id === 'timeline'){ n = (e.events || []).length; return { t:String(n), done:n > 0 }; }
  if(s.id === 'files'){ n = (e.files || []).length; return { t:String(n), done:n > 0 }; }
  if(s.id === 'admin'){ var a = (e.profile || {}).audit === 'audited'; return { t:a ? 'Audited' : 'Needs audit', done:a }; }
  var got = s.fields.filter(function(k){ return gv(e, k) !== ''; }).length;
  return { t:got + '/' + s.fields.length, done:got === s.fields.length };
}
/* tier hero editor + momentum directional editor */
function tierEditHTML(e){
  var v = tierOf(e);
  return '<div class="irow"><span class="ilab">Tier</span><div class="tierhero edit">' + TIER_ORDER.map(function(t){
    return '<button type="button" class="tseg' + (v === t ? ' on' : '') + '" data-tier="' + t + '" style="--c:' + TIERS[t].c + '"><b>' + TIERS[t].n + '</b></button>';
  }).join('') + '</div></div>';
}
function momentumEditHTML(e){
  var v = momVal(e) || '0';
  var order = ['-', '0', '+'];
  var h = '<div class="irow"><span class="ilab">Momentum</span><div class="momwrap"><div class="momtrack tri" data-pk="momentum" data-v="' + v + '"><div class="momfill" style="width:' + momPos(v) + '%"></div>';
  order.forEach(function(t){ h += '<button type="button" class="mstop' + (t === v ? ' on' : '') + '" data-v="' + t + '" title="' + MOM_LABELS[t] + '"><b class="msym">' + MOM_ICONS[t] + '</b></button>'; });
  h += '</div><div class="momlabels"><span>negative</span><b>' + MOM_LABELS[v] + '</b><span>positive</span></div></div></div>';
  return h;
}

function updateFills(){
  if(S.sel === null || !S.editing) return;
  var e = D.directory[S.sel];
  SECTIONS.forEach(function(s){
    var el = $('#rightbody .esec[data-sec="' + s.id + '"] .sbadge'); if(!el) return;
    var f = secFill(s, e); el.textContent = f.t; el.classList.toggle('done', f.done);
  });
}
function connectionsBody(e){
  var nb = knownAssociates(e);
  var chips = nb.length ? '<div class="chips">' + nb.map(function(x){ return nbrChipHTML(x, true); }).join('') + '</div>' : '<p class="dim" style="margin:0;font-size:13px">None mapped yet.</p>';
  var cps = connPhases(e);
  return '<div class="subhead first">Known associates</div>' + chips +
    '<div class="naddwrap"><input id="naddinput" placeholder="Add a known associate: type a name" autocomplete="off"><div id="naddlist"></div></div>' +
    '<div class="subhead">Connection timeline</div>' +
    '<div id="cprows">' + cps.map(function(p, i){ return cpRowHTML(p, i); }).join('') + '</div>' +
    '<div class="arow"><button class="mini" data-act="cpadd" style="--c:' + LV[2].c + '">' + ic('plus', 13) + 'Add phase</button></div>' +
    '<datalist id="cplabels">' + CP_LABELS.map(function(l){ return '<option value="' + esc(l) + '">'; }).join('') + '</datalist>';
}
function evFormHTML(ev){
  ev = ev || {};
  function seg(id, items, cur){
    return '<div class="seg" id="' + id + '">' + items.map(function(it){
      return '<button type="button" data-v="' + it[0] + '"' + (String(cur || '') === it[0] ? ' class="on"' : '') + '>' + it[1] + '</button>'; }).join('') + '</div>';
  }
  return '<div class="evform" id="evform"><div class="subhead">' + (S.evEdit != null ? 'Edit event' : 'Add event') + '</div>' +
    '<input type="text" id="evdate" value="' + esc(ev.date || todayStr()) + '" placeholder="YYYY-MM-DD" autocomplete="off" style="width:100%">' +
    '<input type="text" id="evtitle" value="' + esc(ev.summary || '') + '" placeholder="Headline, for example: Started a new job" autocomplete="off">' +
    '<textarea id="evdetail" rows="3" placeholder="Details (optional)">' + esc(ev.detail || '') + '</textarea>' +
    '<div class="evmeta"><span class="evmlab">Initiated by</span>' + seg('evinit', [['', '—'], ['me', 'Me'], ['them', 'Them']], ev.init) + '</div>' +
    '<div class="arow"><button class="mini" data-act="evsave" style="--c:' + LV[2].c + '">' + ic('check', 13) + (S.evEdit != null ? 'Update event' : 'Add to timeline') + '</button>' +
    (S.evEdit != null ? '<button class="mini neutral" data-act="evcancel">Cancel</button>' : '') + '</div></div>';
}
function timelineEdit(e){
  var rows = sortedEvents(e).map(function(o){
    var ev = o.ev;
    return '<div class="evrow' + (S.evEdit === o.i ? ' editing' : '') + '"><div><div class="evtop"><time style="color:var(--l2);font-size:11.5px;font-weight:700">' + evDate(ev.date) + '</time></div>' +
      '<div class="evtitle">' + esc(ev.summary || '') + '</div>' + (ev.detail ? '<div class="evdetail">' + esc(ev.detail) + '</div>' : '') + '</div>' +
      '<div class="evbtns"><button class="mini neutral" data-act="evedit" data-evi="' + o.i + '">Edit</button><button class="mini danger" data-act="evdel" data-evi="' + o.i + '">Remove</button></div></div>';
  }).join('') || '<p class="dim" style="margin:0 0 8px;font-size:13px">No events yet.</p>';
  var cur = S.evEdit != null ? (e.events || [])[S.evEdit] : null;
  return rows + evFormHTML(cur);
}
function filesEdit(e){
  var rows = (e.files || []).map(function(f, i){
    var isDoc = f.kind === 'gdoc';
    return '<div class="evrow"><div class="fic">' + ic(isDoc ? 'file' : 'link', 16) + '</div><div><div class="evtitle">' + esc(f.name || 'Untitled') + '</div>' +
      (f.url ? '<div class="evdetail">' + esc(f.url) + '</div>' : '') + (f.note ? '<div class="evdetail">' + esc(f.note) + '</div>' : '') + '</div>' +
      '<div class="evbtns"><button class="mini danger" data-act="fdel" data-fi="' + i + '">Remove</button></div></div>';
  }).join('') || '<p class="dim" style="margin:0 0 8px;font-size:13px">No files attached.</p>';
  return rows + '<div class="evform"><div class="subhead">Attach a link</div>' +
    '<input type="text" id="fname" placeholder="Name, for example: Full journal record" autocomplete="off">' +
    '<input type="text" id="furl" placeholder="https://docs.google.com/…" autocomplete="off">' +
    '<input type="text" id="fnote" placeholder="Note (optional)" autocomplete="off">' +
    '<div class="arow"><button class="mini" data-act="fsave" style="--c:' + LV[3].c + '">' + ic('link', 13) + 'Attach</button>' +
    '<button class="mini neutral" data-act="newdoc">' + ic('plus', 13) + 'New Drive doc instead</button></div></div>';
}
function adminBody(e){
  var aud = (e.profile || {}).audit === 'audited';
  var h = '<div class="irow"><span class="ilab">Audit</span><div class="seg" id="audseg">' +
    '<button type="button" data-act="setaudit" data-v="needs_audit"' + (aud ? '' : ' class="on"') + '>Needs audit</button>' +
    '<button type="button" data-act="setaudit" data-v="audited"' + (aud ? ' class="on"' : '') + '>Audited</button></div></div>';
  h += SECTIONS[SECTIONS.length - 1].fields.map(function(k){ return fieldRow(k, e); }).join('');
  if(e.src === 'contacts' || e.src === 'subject') h += '<div class="subhead">Merge person</div>' + mergeBody(e);
  h += '<div class="subhead">Danger zone</div><div class="arow" style="margin-top:0"><button class="mini danger" data-act="delete">' + ic('trash', 13) + 'Delete this person</button></div>';
  return h;
}
function educationBody(e){
  var ds = parseArr(gv(e, 'degrees'));
  var rows = ds.map(function(d, i){ return { d:d, i:i }; })
    .sort(function(a, b){ return String(b.d.year || '').localeCompare(String(a.d.year || '')); })
    .map(function(o){
      var line = [o.d.degree, o.d.major, o.d.year].filter(Boolean).join(' · ');
      return '<div class="evrow' + (S.degEdit === o.i ? ' editing' : '') + '"><div class="fic">' + ic('cap', 16) + '</div><div><div class="evtitle">' + esc(o.d.school || 'School not set') + '</div>' +
        (line ? '<div class="evdetail">' + esc(line) + '</div>' : '') + (o.d.note ? '<div class="evdetail">' + esc(o.d.note) + '</div>' : '') + '</div>' +
        '<div class="evbtns"><button class="mini neutral" data-act="degedit" data-di="' + o.i + '">Edit</button><button class="mini danger" data-act="degdel" data-di="' + o.i + '">Remove</button></div></div>';
    }).join('') || '<p class="dim" style="margin:0 0 8px;font-size:13px">No degrees on file.</p>';
  var cur = (S.degEdit != null && ds[S.degEdit]) ? ds[S.degEdit] : {};
  var known = !!SCHOOLS[cur.school], other = cur.school && !known;
  var schoolOpts = '<option value="">School…</option>' + Object.keys(SCHOOLS).map(function(k){
    return '<option value="' + esc(k) + '"' + (cur.school === k ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') +
    '<option value="__other"' + (other ? ' selected' : '') + '>Other school</option>';
  var degOpts = '<option value="">Degree…</option>' + DEGREE_TYPES.map(function(k){
    return '<option value="' + esc(k) + '"' + (cur.degree === k ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('');
  if(cur.degree && DEGREE_TYPES.indexOf(cur.degree) < 0) degOpts += '<option value="' + esc(cur.degree) + '" selected>' + esc(cur.degree) + '</option>';
  return rows + '<div class="evform"><div class="subhead">' + (S.degEdit != null ? 'Edit degree' : 'Add degree') + '</div>' +
    '<div class="two"><select id="ddschool">' + schoolOpts + '</select><select id="dddegree">' + degOpts + '</select></div>' +
    '<input type="text" id="ddother" value="' + esc(other ? cur.school : '') + '" placeholder="Other school name (only if not in the list)" autocomplete="off">' +
    '<div class="two"><input type="text" id="ddmajor" value="' + esc(cur.major || '') + '" placeholder="Major" autocomplete="off">' +
    '<input type="text" id="ddyear" value="' + esc(cur.year || '') + '" placeholder="Grad year, for example 2019" autocomplete="off"></div>' +
    '<input type="text" id="ddnote" value="' + esc(cur.note || '') + '" placeholder="Source or note (optional)" autocomplete="off">' +
    '<div class="arow"><button class="mini" data-act="degsave" style="--c:' + LV[1].c + '">' + ic('check', 13) + (S.degEdit != null ? 'Update degree' : 'Add degree') + '</button>' +
    (S.degEdit != null ? '<button class="mini neutral" data-act="degcancel">Cancel</button>' : '') + '</div></div>' +
    '<div class="subhead">Achievements</div>' + fieldRow('achievements', e);
}
function saveDegree(){
  var e = D.directory[S.sel]; if(!e) return;
  var sch = $('#ddschool').value, school = sch === '__other' ? $('#ddother').value.trim() : sch;
  var degree = $('#dddegree').value, major = $('#ddmajor').value.trim(), year = $('#ddyear').value.trim(), note = $('#ddnote').value.trim();
  if(!school){ toast('Pick the school first.'); return; }
  if(!degree && !major && !year){ toast('Add at least a degree, major, or year.'); return; }
  if(year && !/^\d{4}$/.test(year)){ toast('Use a four digit year like 2019.'); return; }
  var d = { school:school };
  if(degree) d.degree = degree;
  if(major) d.major = major;
  if(year) d.year = year;
  if(note) d.note = note;
  var arr = parseArr(gv(e, 'degrees')).slice();
  if(S.degEdit != null && arr[S.degEdit]) arr[S.degEdit] = d; else arr.push(d);
  var patch = { degrees:JSON.stringify(arr) };
  if(SCHOOLS[school]){
    var us = tagList(gv(e, 'universities'));
    if(us.indexOf(school) < 0){ us.push(school); patch.universities = us.join(', '); }
  }
  var edited = S.degEdit != null;
  S.degEdit = null;
  queuePatch(S.sel, patch);
  renderPanel(true); toast(edited ? 'Degree updated.' : 'Degree added.');
}
function delDegree(i){
  var e = D.directory[S.sel], arr = parseArr(gv(e, 'degrees')).slice();
  if(!arr[i]) return;
  if(!confirm('Remove this degree?\n\n' + [arr[i].school, arr[i].degree, arr[i].major].filter(Boolean).join(' · '))) return;
  arr.splice(i, 1); S.degEdit = null;
  queuePatch(S.sel, { degrees:JSON.stringify(arr) });
  renderPanel(true); toast('Degree removed.');
}
function secBody(s, e){
  if(s.id === 'connections') return connectionsBody(e);
  if(s.id === 'timeline') return timelineEdit(e);
  if(s.id === 'education') return educationBody(e);
  if(s.id === 'files') return filesEdit(e);
  if(s.id === 'admin') return adminBody(e);
  if(s.id === 'ratings') return '<div class="rgrid">' + s.fields.map(function(k){ return fieldRow(k, e); }).join('') + '</div>';
  return s.fields.map(function(k){ return fieldRow(k, e); }).join('');
}
function secHTML(s, e){
  var open = S.openSecs[s.id] !== false, fl = secFill(s, e);
  return '<section class="esec' + (open ? ' open' : '') + '" data-sec="' + s.id + '" style="--c:' + (s.lv ? LV[s.lv].c : '#ece9e2') + '">' +
    '<header data-act="sectoggle" data-sec="' + s.id + '"><span class="cic">' + ic(s.ic, 15) + '</span><h3>' + esc(s.title) + '</h3>' +
    '<span class="sbadge' + (fl.done ? ' done' : '') + '">' + esc(fl.t) + '</span><span class="chev">' + ic('chev', 14) + '</span></header>' +
    '<div class="sbody">' + secBody(s, e) + '</div></section>';
}
function editCompletenessData(e){
  var tot = 0, got = 0, levels = {};
  SECTIONS.forEach(function(s){
    var flds = s.fields || [];
    if(s.id === 'education'){ tot += 1; if(degreesOf(e).length) got += 1; return; }
    if(s.id === 'connections'){ tot += 1; if((e.neighbors || []).length) got += 1; return; }
    if(s.id === 'timeline'){ tot += 1; if((e.events || []).length) got += 1; return; }
    if(s.id === 'files'){ tot += 1; if((e.files || []).length) got += 1; return; }
    flds.forEach(function(k){ tot++; if(gv(e, k) !== '') got++; });
  });
  [1, 2, 3].forEach(function(lv){
    var lt = 0, lg = 0;
    SECTIONS.forEach(function(s){
      if(s.lv !== lv) return;
      (s.fields || []).forEach(function(k){ lt++; if(gv(e, k) !== '') lg++; });
      if(s.id === 'education'){ lt++; if(degreesOf(e).length) lg++; }
      if(s.id === 'connections'){ lt++; if((e.neighbors || []).length) lg++; }
      if(s.id === 'timeline'){ lt++; if((e.events || []).length) lg++; }
    });
    levels[lv] = lt ? Math.round(lg / lt * 100) : 0;
  });
  return { pct: tot ? Math.round(got / tot * 100) : 0, levels: levels };
}
function pct(e){ return editCompletenessData(e).pct; }
function editGroups(){
  // level groups for the edit hero toggle: 1=On file, 2=Record, 3=Files(+Admin)
  return [
    { id:1, n:'On file', c:LV[1].c, lvs:[1] },
    { id:2, n:'Record',  c:LV[2].c, lvs:[2] },
    { id:3, n:'Files',   c:LV[3].c, lvs:[3, 0] }
  ];
}
function dossierEdit(e){
  if(S.editGroup == null) S.editGroup = 1;
  var groups = editGroups();
  var comp = editCompletenessData(e);
  var hero = '<div class="egrouphero">' + groups.map(function(g){
    var gp = comp.levels[g.id] != null ? comp.levels[g.id] : 0;
    return '<button type="button" class="egh' + (S.editGroup === g.id ? ' on' : '') + '" data-act="egroup" data-g="' + g.id + '" style="--c:' + g.c + '"><b>' + g.n + '</b><i>' + gp + '%</i></button>';
  }).join('') + '</div>';
  var lvlN = { 1:'On file', 2:'Record', 3:'Files', 0:'Admin' }, stack = '';
  var active = groups.filter(function(g){ return g.id === S.editGroup; })[0];
  SECTIONS.forEach(function(s){
    if(active.lvs.indexOf(s.lv) < 0) return;
    stack += secHTML(s, e);
  });
  return '<div class="doc edit">' + phead(e) + hero + '<div class="lvstage estage">' +
    '<div class="estack">' + stack + '</div></div>' +
    '<div class="efoot"><span id="savestate" class="savestate">All changes saved</span><span class="esp"></span>' +
    '<button class="ibtn solid" data-act="done">' + ic('check', 16) + '<span>Done</span></button></div></div>';
}
function saveOpenSecs(){ store('ncc_secs', JSON.stringify(S.openSecs)); }
function toggleSec(id, force){
  var on = force != null ? force : !(S.openSecs[id] !== false);
  S.openSecs[id] = on; saveOpenSecs();
  var el = $('#rightbody .esec[data-sec="' + id + '"]'); if(el) el.classList.toggle('open', on);
}
function jumpTo(id){
  toggleSec(id, true);
  var el = $('#rightbody .esec[data-sec="' + id + '"]'); if(!el) return;
  var stg = $('#rightbody .estage');
  if(stg) stg.scrollTo({ top: Math.max(0, el.offsetTop - 8), behavior:'smooth' });
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
  document.body.classList.toggle('is-editing', !!S.editing);
  var e = D.directory[S.sel];
  body.innerHTML = S.editing ? dossierEdit(e) : dossierView(e);
  var stg = $('.lvstage', body);
  if(stg && st != null) stg.scrollTop = st;
  if(S.editing) syncUI();
  if(S.jumpTo){ var j = S.jumpTo; S.jumpTo = null; jumpTo(j); }
}
function rerender(){ renderPanel(true); }
function markSel(){
  $$('#leftbody [data-i]').forEach(function(el){ el.classList.toggle('sel', parseInt(el.getAttribute('data-i'), 10) === S.sel); });
}
function openPerson(idx, o){
  o = o || {};
  if(idx == null || !D.directory[idx]) return;
  if(!o.fromAuditKeep) AUD.fromAudit = false;
  if(o.push && S.sel !== null && S.sel !== idx){ S.hist.push(S.sel); S.fwd = []; }
  else if(!o.keepHist){ S.hist = []; S.fwd = []; }
  syncNavBtns();
  S.sel = idx; S.editing = !!o.edit; S.lvl = o.lvl || 1; S.evEdit = null; S.degEdit = null;
  markSel();
  var row = $('#leftbody [data-i="' + idx + '"]');
  if(row) row.scrollIntoView({ block:'nearest' });
  var n = NODES.filter(function(x){ return x.i === idx; })[0];
  if(n) hub.target = { x:rotX(n), y:rotY(n) };
  renderPanel(false);
  glSyncFocus();
}
function closePanel(){
  S.sel = null; S.editing = false; S.hist = []; S.fwd = []; S.evEdit = null; S.degEdit = null;
  markSel(); renderPanel(false); glSyncFocus();
}
function goBack(){
  if(!S.hist.length) return;
  if(S.sel !== null) S.fwd.push(S.sel);
  var prev = S.hist.pop();
  openPerson(prev, { keepHist:true });
  syncNavBtns();
}
function goForward(){
  if(!S.fwd.length) return;
  if(S.sel !== null) S.hist.push(S.sel);
  var nxt = S.fwd.pop();
  openPerson(nxt, { keepHist:true });
  syncNavBtns();
}
function goHome(){
  closePanel();
  if(S.mode === '3d' && typeof glReset === 'function') glReset();
  else if(typeof hubFit === 'function') hubFit();
  syncNavBtns();
}
function syncNavBtns(){
  var b = $('#navback'), f = $('#navfwd');
  if(b) b.classList.toggle('dim', !S.hist.length);
  if(f) f.classList.toggle('dim', !S.fwd.length);
}
function setLevel(n){
  if(S.sel === null || S.editing) return;
  S.lvl = n;
  $$('#rightbody .tab').forEach(function(t){ t.classList.toggle('on', parseInt(t.getAttribute('data-lvl'), 10) === n); });
  $$('#rightbody .lvl').forEach(function(l){ l.classList.toggle('on', parseInt(l.getAttribute('data-l'), 10) === n); });
  var stg = $('#rightbody .lvstage'); if(stg) stg.scrollTop = 0;
}
function enterEdit(sec){
  if(S.sel === null) return;
  S.editing = true; S.evEdit = null; S.degEdit = null;
  if(sec) S.jumpTo = sec;
  renderPanel(false);
}
function exitEdit(){
  outKick(); S.editing = false; S.evEdit = null; S.degEdit = null; renderPanel(true); refresh();
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
    case 'backaudit': openAudit(); break;
    case 'edit': enterEdit(); break;
    case 'done': exitEdit(); break;
    case 'editname': editHeroName(e); break;
    case 'wide': S.wide = !S.wide; document.body.classList.toggle('panelwide', S.wide); rerender(); break;
    case 'menu': var pop = $('.menu-pop', el.parentNode); pop.hidden = !pop.hidden; break;
    case 'tab': setLevel(parseInt(el.getAttribute('data-lvl'), 10) || 1); break;
    case 'sectoggle': toggleSec(el.getAttribute('data-sec')); break;
    case 'jump': jumpTo(el.getAttribute('data-sec')); break;
    case 'secall': SECTIONS.forEach(function(s){ S.openSecs[s.id] = el.getAttribute('data-v') === '1'; }); saveOpenSecs(); $$('#rightbody .esec').forEach(function(x){ x.classList.toggle('open', el.getAttribute('data-v') === '1'); }); break;
    case 'egroup': S.editGroup = parseInt(el.getAttribute('data-g'), 10); renderPanel(true); break;
    case 'audit': toggleAudit(); break;
    case 'setaudit': setAudit(el.getAttribute('data-v')); break;
    case 'auditnext':
      var nx = nextNeedsAudit();
      setAudit('audited');
      if(nx != null) openPerson(nx); else toast('That was the last one in this list.');
      break;
    case 'export': exportDossier(); break;
    case 'viewdoc': viewDossier(); break;
    case 'cardtoggle': { var tsec = el.closest('.card'); if(tsec) tsec.classList.toggle('is-collapsed'); break; }
    case 'delete': deletePerson(); break;
    case 'addevent': S.evEdit = null; if(S.editing){ renderPanel(true); jumpTo('timeline'); } else enterEdit('timeline'); break;
    case 'attach': if(S.editing) jumpTo('files'); else enterEdit('files'); break;
    case 'newdoc': openDocComposer(); break;
    case 'evedit': S.evEdit = parseInt(el.getAttribute('data-evi'), 10); S.jumpTo = 'timeline'; renderPanel(true); break;
    case 'evcancel': S.evEdit = null; renderPanel(true); break;
    case 'degedit': S.degEdit = parseInt(el.getAttribute('data-di'), 10); S.jumpTo = 'education'; renderPanel(true); break;
    case 'degcancel': S.degEdit = null; renderPanel(true); break;
    case 'degsave': saveDegree(); break;
    case 'degdel': delDegree(parseInt(el.getAttribute('data-di'), 10)); break;
    case 'evsave': saveEvent(); break;
    case 'evdel': delEvent(parseInt(el.getAttribute('data-evi'), 10)); break;
    case 'fsave': saveFileLink(); break;
    case 'fdel': delFile(parseInt(el.getAttribute('data-fi'), 10)); break;
    case 'cpadd': (function(){ var w = $('#cprows'); if(!w) return; var d = document.createElement('div'); d.innerHTML = cpRowHTML({}, w.children.length); w.appendChild(d.firstChild); syncConnPhases(); })(); break;
    case 'cpdel': (function(){ var r = el.closest('.cprow'); if(r){ r.remove(); syncConnPhases(); } })(); break;
    case 'tidy': aiTidy(el.getAttribute('data-k')); break;
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

/* ============================================================
   SAVING: one outbox for every edit.
   1. The edit shows on screen immediately.
   2. It is written to this browser (localStorage) before anything goes over the network.
   3. Pending edits are sent to the sheet in batches, one request at a time, in order.
   4. An edit leaves the outbox only after the server says it saved. Failures retry with backoff.
   5. If the tab closes first, the leftovers are re-sent the next time the page opens.
   ============================================================ */
var OUT = { items:[], busy:false, timer:null, retry:0, err:'' };
var OUT_KEY = 'ncc_outbox_v2';
function outLoad(){
  var a = [];
  try{ a = JSON.parse(localStorage.getItem(OUT_KEY) || '[]'); }catch(x){ a = []; }
  OUT.items = Array.isArray(a) ? a.filter(function(it){ return it && it.id; }) : [];
  OUT.items.forEach(function(it){
    it.patch = it.patch || {};
    if(it.sending){ it.patch = Object.assign({}, it.sending, it.patch); it.sending = null; }
  });
}
function outSave(){ try{ localStorage.setItem(OUT_KEY, JSON.stringify(OUT.items)); }catch(x){} }
function outPending(){ return OUT.items.filter(function(it){ return Object.keys(it.patch || {}).length || it.sending; }).length; }
function getPw(){ return store('ncc_edit_key') || ''; }
function normPatch(p){
  var o = {};
  Object.keys(p).forEach(function(k){ o[k] = p[k] == null ? '' : String(p[k]); });
  if(o.display_name) o.display = o.display_name;
  return o;
}
function applyProfileEdit(e, ch){
  e.profile = e.profile || {}; e._set = e._set || {};
  Object.keys(ch).forEach(function(k){
    var v = ch[k];
    e.profile[k] = v; e._set[k] = 1;
    if(k === 'events') e.events = parseArr(v);
    else if(k === 'files') e.files = parseArr(v);
  });
  if(ch.display) e.display = ch.display;
  else if(ch.display_name) e.display = ch.display_name;
}
function queuePatch(idx, patch){
  var e = D.directory[idx]; if(!e) return;
  patch = normPatch(patch);
  applyProfileEdit(e, patch);
  var key = pkey(e), it = null;
  for(var i = 0; i < OUT.items.length; i++) if(OUT.items[i].id === key){ it = OUT.items[i]; break; }
  if(!it){ it = { id:key, patch:{}, sending:null }; OUT.items.push(it); }
  Object.keys(patch).forEach(function(k){ it.patch[k] = patch[k]; });
  outSave(); syncUI();
  clearTimeout(OUT.timer); OUT.timer = setTimeout(outKick, 700);
  refreshSoon();
}
function outKick(){
  clearTimeout(OUT.timer);
  if(OUT.busy) return;
  var batch = [];
  OUT.items.forEach(function(it){
    if(batch.length < 25 && Object.keys(it.patch).length){ it.sending = it.patch; it.patch = {}; batch.push(it); }
  });
  if(!batch.length){ OUT.items = OUT.items.filter(function(it){ return it.sending; }); outSave(); syncUI(); return; }
  if(!WEBAPP_URL){ batch.forEach(function(it){ it.patch = it.sending; it.sending = null; }); return; }
  OUT.busy = true; outSave(); syncUI();
  fetch(WEBAPP_URL, {
    method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' },
    body:JSON.stringify({ password:getPw(), kind:'batch', id:'batch', patch:{ items:batch.map(function(it){ return { id:it.id, patch:it.sending }; }) } })
  }).then(function(r){ return r.json(); }).then(function(res){
    if(!res || !res.ok) throw new Error((res && res.error) || 'unknown');
    var warn = [], made = [];
    batch.forEach(function(it, i){
      var r = (res.results || [])[i] || {};
      if(r.ignored && r.ignored.length) warn.push(r.ignored.join(', '));
      if(r.created) made.push(it.id);
      it.sending = null;
    });
    OUT.busy = false; OUT.retry = 0; OUT.err = '';
    OUT.items = OUT.items.filter(function(it){ return Object.keys(it.patch).length || it.sending; });
    outSave(); syncUI();
    if(warn.length) toast('Some fields are not columns in the sheet and were skipped: ' + warn.join('; '));
    else if(made.length) toast('No sheet row matched ' + made[0] + '. A new row was created.');
    if(OUT.items.length) outKick();
  }).catch(function(err){
    OUT.busy = false;
    batch.forEach(function(it){ it.patch = Object.assign({}, it.sending, it.patch); it.sending = null; });
    var msg = String(err && err.message || err);
    OUT.retry++; OUT.err = msg; outSave(); syncUI();
    if(/unauthorized/i.test(msg)){
      var k = prompt('Edit key:');
      if(k){ store('ncc_edit_key', k.trim()); OUT.retry = 0; OUT.timer = setTimeout(outKick, 300); return; }
    }
    OUT.timer = setTimeout(outKick, Math.min(30000, 2000 * Math.pow(2, OUT.retry - 1)));
  });
}
function setSaveState(t, cls){
  var el = $('#savestate'); if(!el) return;
  el.textContent = t || ''; el.className = 'savestate' + (cls ? ' ' + cls : '');
}
function syncUI(){
  var n = outPending(), txt, cls = '';
  if(!n){ txt = 'All changes saved'; }
  else if(OUT.err){ txt = n + ' not saved yet · retrying'; cls = 'err'; }
  else if(OUT.busy){ txt = 'Saving…'; cls = 'dim'; }
  else { txt = 'Unsaved changes'; cls = 'dim'; }
  setSaveState(txt, cls);
  var p = $('#syncpill');
  if(!p){
    p = document.createElement('button'); p.id = 'syncpill'; p.className = 'syncpill'; p.type = 'button';
    p.addEventListener('click', function(){ OUT.retry = 0; outKick(); });
    document.body.appendChild(p);
  }
  p.hidden = !n;
  p.className = 'syncpill' + (cls ? ' ' + cls : '');
  p.textContent = txt;
  p.title = OUT.err ? ('Last error: ' + OUT.err + '. Click to retry now.') : '';
}
addEventListener('online', function(){ OUT.retry = 0; outKick(); });
addEventListener('pagehide', function(){
  if(!outPending() || !navigator.sendBeacon || !WEBAPP_URL) return;
  var items = OUT.items.map(function(it){ return { id:it.id, patch:Object.assign({}, it.sending || {}, it.patch || {}) }; })
    .filter(function(it){ return Object.keys(it.patch).length; });
  if(!items.length) return;
  try{ navigator.sendBeacon(WEBAPP_URL, new Blob([JSON.stringify({ password:getPw(), kind:'batch', id:'batch', patch:{ items:items } })], { type:'text/plain;charset=utf-8' })); }catch(x){}
});

/* put anything still waiting in the outbox back on top of freshly loaded data */
function applyOutbox(){
  OUT.items.forEach(function(it){
    var di = PK2I[it.id]; if(di === undefined) return;
    var e = D.directory[di];
    applyProfileEdit(e, it.patch);
    if(it.patch.close_add !== undefined || it.patch.close_hide !== undefined) syncNeighborsFromClose(e);
  });
}
function syncNeighborsFromClose(e){
  var prof = e.profile || {};
  var hide = tagList(prof.close_hide).map(function(x){ return x.toLowerCase(); });
  var adds = tagList(prof.close_add);
  if(hide.length) e.neighbors = (e.neighbors || []).filter(function(n){ return hide.indexOf((n.u || '').toLowerCase()) < 0; });
  adds.forEach(function(a){
    var kl = a.toLowerCase(), di = BYN[kl];
    if(di === undefined) return;
    var t = D.directory[di];
    if(!(e.neighbors || []).some(function(n){ return (n.u || '').toLowerCase() === kl; }))
      (e.neighbors = e.neighbors || []).push({ u:t.name || '', d:dispName(t) });
  });
}
/* ask the sheet for rows edited in the last 3 days, so edits show before the GitHub snapshot is rebuilt */
var lastFeed = 0;
function fetchChanges(){
  if(!WEBAPP_URL || !D || S.editing) return;
  lastFeed = Date.now();
  var since = Date.parse(String(D.updated || '').replace(' UTC', 'Z').replace(' ', 'T'));
  var q = isNaN(since) ? 'hours=72' : 'since=' + encodeURIComponent(new Date(since - 15 * 60000).toISOString());
  fetch(WEBAPP_URL + '?action=changes&' + q + '&password=' + encodeURIComponent(getPw()))
    .then(function(r){ return r.json(); }).then(function(res){
      if(!res || !res.ok) return;
      var pend = {}; OUT.items.forEach(function(it){ pend[it.id] = 1; });
      var n = 0;
      (res.rows || []).forEach(function(row){
        var di = PK2I[row.pkey]; if(di === undefined || pend[row.pkey]) return;
        var e = D.directory[di], ch = {};
        Object.keys(row.profile || {}).forEach(function(k){ ch[k] = row.profile[k]; });
        applyProfileEdit(e, ch);
        if(ch.close_add || ch.close_hide) syncNeighborsFromClose(e);
        n++;
      });
      if(n){ refresh(); if(S.sel !== null && !S.editing) renderPanel(true); }
    }).catch(function(){});
}
document.addEventListener('visibilitychange', function(){
  if(!document.hidden && D && Date.now() - lastFeed > 60000) fetchChanges();
});
function postKind(kind, id, patch, pw, onOk, onErr){
  fetch(WEBAPP_URL, {
    method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' },
    body:JSON.stringify({ password:pw, kind:kind, id:id, patch:patch })
  }).then(function(r){ return r.json(); }).then(function(res){
    if(res && res.ok) onOk(res); else onErr('Failed: ' + ((res && res.error) || 'unknown'));
  }).catch(function(){ onErr('Network error.'); });
}

/* ---------- field handlers (edit mode) ---------- */
function setField(k, v){
  if(S.sel === null) return;
  var e = D.directory[S.sel]; v = String(v == null ? '' : v);
  if(gv(e, k) === v) return;
  var p = {}; p[k] = v;
  queuePatch(S.sel, p);
  updateFills();
}
function readTags(box){
  var sep = box.getAttribute('data-sep') || ', ';
  return $$('.tchip.on', box).map(function(c){ return c.getAttribute('data-tv'); }).join(sep);
}
function setAudit(next){
  if(S.sel === null) return;
  queuePatch(S.sel, { audit:next });
  renderPanel(true); refresh();
  toast(next === 'audited' ? 'Marked as audited.' : 'Back to needs audit.');
}
function toggleAudit(){
  var e = D.directory[S.sel]; if(!e) return;
  setAudit(((e.profile || {}).audit === 'audited') ? 'needs_audit' : 'audited');
}
function deletePerson(){
  var e = D.directory[S.sel];
  if(!e) return;
  var label = dispName(e);
  if(!confirm('Delete ' + label + ' from the circle?\n\nThey will be hidden from the directory and the map. To bring them back, clear the deleted flag in the sheet.')) return;
  queuePatch(S.sel, { deleted:'1' });
  closePanel(); refresh(); toast('Deleted ' + label + '.');
}
function delEvent(i){
  var e = D.directory[S.sel];
  if(!e || !e.events || !e.events[i]) return;
  if(!confirm('Remove this timeline event?\n\n' + (e.events[i].summary || ''))) return;
  var arr = e.events.slice(); arr.splice(i, 1);
  S.evEdit = null;
  queuePatch(S.sel, { events:JSON.stringify(arr) });
  renderPanel(true); toast('Event removed.');
}
function saveEvent(){
  var e = D.directory[S.sel]; if(!e) return;
  var date = $('#evdate').value.trim(), type = 'note';
  var summary = $('#evtitle').value.trim(), detail = $('#evdetail').value.trim();
  if(!summary){ toast('Give the event a headline.'); return; }
  if(!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(date)){ toast('Use a date like 2026-10-04.'); return; }
  var ev = { date:date, type:type, summary:summary };
  if(detail) ev.detail = detail;
  var is = $('#evinit .on');
  if(is && is.getAttribute('data-v')) ev.init = is.getAttribute('data-v');
  var arr = (e.events || []).slice();
  if(S.evEdit != null && arr[S.evEdit]) arr[S.evEdit] = ev; else arr.push(ev);
  var edited = S.evEdit != null;
  S.evEdit = null;
  queuePatch(S.sel, { events:JSON.stringify(arr) });
  renderPanel(true); toast(edited ? 'Event updated.' : 'Added to the timeline.');
}
function saveFileLink(){
  var e = D.directory[S.sel]; if(!e) return;
  var nm = $('#fname').value.trim(), url = $('#furl').value.trim(), note = $('#fnote').value.trim();
  if(!nm){ toast('Name the file first.'); return; }
  if(!url){ toast('Paste the file link.'); return; }
  var f = { name:nm, kind:url.indexOf('docs.google.com') >= 0 ? 'gdoc' : 'link', url:url };
  if(note) f.note = note;
  var arr = (e.files || []).slice(); arr.push(f);
  queuePatch(S.sel, { files:JSON.stringify(arr) });
  renderPanel(true); toast('File attached.');
}
function delFile(i){
  var e = D.directory[S.sel];
  if(!e || !e.files || !e.files[i]) return;
  if(!confirm('Remove this file attachment?\n\n' + (e.files[i].name || ''))) return;
  var arr = e.files.slice(); arr.splice(i, 1);
  queuePatch(S.sel, { files:JSON.stringify(arr) });
  renderPanel(true); toast('File removed.');
}
function openDocComposer(){
  var e = D.directory[S.sel];
  if(!e || !WEBAPP_URL){ toast('Nothing to create for.'); return; }
  openModal('New Drive doc',
    '<label class="lab">For ' + esc(dispName(e)) + '<span class="sh">Creates a Google Doc in the North Country Circle Files folder and attaches it to their Files section.</span></label>' +
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
  postKind('createdoc', subjSlug(e), { title:title }, getPw(), function(res){
    if(!res.url){ btn.disabled = false; toast('Doc creation failed.'); return; }
    var arr = (e.files || []).slice(); arr.push({ name:res.name || title, kind:'gdoc', url:res.url });
    closeModal();
    queuePatch(S.sel, { files:JSON.stringify(arr) });
    renderPanel(true); toast('Doc created and attached.');
  }, function(err){ btn.disabled = false; toast(err + ' Not created.'); });
}
function aiTidy(k){
  var ta = $('#rightbody textarea[data-pk="' + k + '"]'), msg = $('#aimsg-' + k), btn = $('[data-act="tidy"][data-k="' + k + '"]');
  var text = ta ? ta.value.trim() : '';
  if(!text){ if(msg) msg.textContent = 'Write something first.'; return; }
  if(btn) btn.disabled = true; if(msg) msg.textContent = 'Cleaning up…';
  postKind('tidy', 'tidy', { text:text, mode:k }, getPw(), function(res){
    if(btn) btn.disabled = false;
    if(res.value){ ta.value = res.value; setField(k, res.value); if(msg) msg.textContent = 'Cleaned up. Give it a read.'; }
    else if(msg) msg.textContent = 'Nothing came back.';
  }, function(err){ if(btn) btn.disabled = false; if(msg) msg.textContent = err; });
}

/* ---------- known associates + merge ---------- */
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
function addClose(e, idx){
  var t = D.directory[idx];
  if(!e || !t) return;
  var key = t.name || '', kl = key.toLowerCase();
  var adds = tagList(gv(e, 'close_add'));
  if(adds.map(function(x){ return x.toLowerCase(); }).indexOf(kl) < 0) adds.push(key);
  var hides = tagList(gv(e, 'close_hide')).filter(function(x){ return x.toLowerCase() !== kl; });
  e.neighbors = e.neighbors || [];
  if(!e.neighbors.some(function(n){ return (n.u || '').toLowerCase() === kl; })) e.neighbors.push({ u:key, d:dispName(t) });
  queuePatch(S.sel, { close_add:adds.join(', '), close_hide:hides.join(', ') });
  renderPanel(true);
}
function removeClose(e, u){
  if(!e || !u) return;
  var kl = u.toLowerCase();
  var adds = tagList(gv(e, 'close_add')), hides = tagList(gv(e, 'close_hide'));
  if(adds.map(function(x){ return x.toLowerCase(); }).indexOf(kl) >= 0){
    adds = adds.filter(function(x){ return x.toLowerCase() !== kl; });
  } else if(hides.map(function(x){ return x.toLowerCase(); }).indexOf(kl) < 0) hides.push(u);
  e.neighbors = (e.neighbors || []).filter(function(n){ return (n.u || '').toLowerCase() !== kl; });
  queuePatch(S.sel, { close_add:adds.join(', '), close_hide:hides.join(', ') });
  renderPanel(true);
}
function mergeBody(e){
  var mi = gv(e, 'merged_into').trim();
  if(mi) return '<p style="font-size:13px;margin:0 0 8px">Merged into <b>@' + esc(mi) + '</b>. Their numbers now live on that profile; this entry hides after the next sync.</p>' +
    '<button class="mini danger" data-act="unmerge">Unmerge</button>';
  return '<p class="dim" style="font-size:13px;margin:0 0 8px">Fold this contact’s numbers into an Instagram person and hide the duplicate.</p>' +
    '<div class="naddwrap"><input id="mergeinput" placeholder="Merge into: type a name or @handle" autocomplete="off"><div id="mergelist"></div></div>';
}
function mergeSearch(q){
  var list = $('#mergelist'); if(!list) return;
  q = (q || '').toLowerCase().trim();
  var hits = [];
  if(q.length >= 2){
    D.directory.forEach(function(r, i){
      if(hits.length >= 6) return;
      if(r.src === 'contacts' || r.src === 'subject' || (r.profile || {}).deleted === '1') return;
      var label = dispName(r) || '', h = (r.name || '').toLowerCase();
      if(label.toLowerCase().indexOf(q) >= 0 || h.indexOf(q.replace('@','')) >= 0) hits.push({ i:i, label:label, handle:r.name });
    });
  }
  list.innerHTML = hits.length ? hits.map(function(h){
    return '<div class="naddhit" data-mh="' + esc(h.handle) + '">' + esc(h.label) + ' <span class="dim">@' + esc(h.handle) + '</span></div>';
  }).join('') : (q.length >= 2 ? '<div class="naddhit none">No matches</div>' : '');
}
function doMerge(e, handle){
  if(!e || !handle) return;
  queuePatch(S.sel, { merged_into:handle.toLowerCase() });
  renderPanel(true); toast('Merged into @' + handle + '. Hides after the next sync.');
}
function doUnmerge(e){
  if(!e) return;
  queuePatch(S.sel, { merged_into:'' });
  renderPanel(true); toast('Unmerged.');
}

/* ---------- pro personality score ---------- */

/* Big Five, estimated from the 8 trait ratings. The top trait is the hero chip. */
var BIG5 = [
  { n:'Openness',         from:['intellect','creativity'],   inv:[] },
  { n:'Conscientiousness', from:['competence','reliability'], inv:[] },
  { n:'Extraversion',      from:['charisma','assertiveness'], inv:[] },
  { n:'Agreeableness',     from:['reputation'],              inv:['ego'] },
  { n:'Neuroticism',       from:['ego'],                     inv:['reliability'] }
];
function big5Scores(e){
  return BIG5.map(function(t){
    var vals = [];
    t.from.forEach(function(k){ var v = parseFloat(gv(e, k)); if(!isNaN(v)) vals.push(v); });
    t.inv.forEach(function(k){ var v = parseFloat(gv(e, k)); if(!isNaN(v)) vals.push(6 - v); });
    if(!vals.length) return null;
    return { n:t.n, score:Math.round(vals.reduce(function(a, b){ return a + b; }, 0) / vals.length / 5 * 100) };
  }).filter(Boolean);
}
function readHTML(e){
  var ts = big5Scores(e);
  if(!ts.length) return '';
  ts.sort(function(a, b){ return b.score - a.score; });
  var top = ts[0];
  return '<div class="prow"><div class="pchip"><em style="width:' + top.score + '%"></em><b>' + top.score + '</b><span>' + esc(top.n) + '</span></div></div>' +
    '<div class="pr-desc" style="margin:6px 0 0">Top trait from the ratings below.</div>';
}


/* ---------- connection timeline ---------- */
var CP_LABELS = ['Acquaintances','Friends','Close friends','Best friends','Drifted apart','Reconnected','Working together','Dating','Roommates','Teammates','Mentor','Fell out'];
function connPhases(e){
  var raw = gv(e, 'conn_phases');
  if(!raw) return [];
  try{
    var a = JSON.parse(raw);
    return Array.isArray(a) ? a.filter(function(p){ return p && (p.f || p.l); }) : [];
  }catch(x){ return []; }
}
function ymIdx(s){
  var m = String(s || '').match(/(\d{4})-(\d{1,2})/);
  if(!m) return null;
  return parseInt(m[1], 10) * 12 + parseInt(m[2], 10);
}
function ymLabel(s){
  var m = String(s || '').match(/(\d{4})-(\d{1,2})/);
  if(!m) return '';
  var M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return M[parseInt(m[2], 10) - 1] + ' ' + m[1];
}
function connTimelineHTML(e){
  var ps = connPhases(e);
  if(!ps.length) return '';
  var cols = ['#f0b44c', '#7ea6f0', '#5cd6a0', '#b48ce8'];
  ps.sort(function(a, b){ return String(a.f || '').localeCompare(String(b.f || '')); });
  var rows = ps.map(function(p, i){
    var c = cols[i % 4];
    var range = ymLabel(p.f) + (p.t ? ' \u2013 ' + ymLabel(p.t) : ' \u2013 now');
    return '<div class="ev"><span class="evdot" style="--c:' + c + ';background:' + c + '"></span>' +
      '<div class="evtop"><time>' + esc(range) + '</time></div>' +
      '<div class="evtitle">' + esc(p.l || 'Untitled phase') + '</div>' +
      (p.n ? '<div class="evdetail">' + esc(p.n) + '</div>' : '') + '</div>';
  }).join('');
  return '<div class="tl">' + rows + '</div>';
}
function cpRowHTML(p, i){
  p = p || {};
  var ongoing = !p.t;
  return '<div class="cprow" data-i="' + i + '">' +
    '<input type="month" class="cp-f" value="' + esc(p.f || '') + '" aria-label="From">' +
    '<span class="cp-arr">\u2192</span>' +
    '<input type="month" class="cp-t" value="' + esc(p.t || '') + '" aria-label="To"' + (ongoing ? ' disabled' : '') + '>' +
    '<label class="cp-now"><input type="checkbox" class="cp-tp"' + (ongoing ? ' checked' : '') + '> now</label>' +
    '<input class="cp-l" list="cplabels" value="' + esc(p.l || '') + '" placeholder="Phase label" aria-label="Phase label">' +
    '<input class="cp-n" value="' + esc(p.n || '') + '" placeholder="Note (optional)" aria-label="Note">' +
    '<button class="mini danger" data-act="cpdel">Remove</button></div>';
}
function syncConnPhases(){
  var wrap = $('#cprows'); if(!wrap) return;
  var out = [];
  $$('.cprow', wrap).forEach(function(r){
    var f = $('.cp-f', r).value, tp = $('.cp-tp', r).checked;
    var t = tp ? '' : $('.cp-t', r).value;
    var l = $('.cp-l', r).value.trim(), n = $('.cp-n', r).value.trim();
    if(f || l) out.push({ f:f, t:t, l:l, n:n });
  });
  out.sort(function(a, b){ return String(a.f || '').localeCompare(String(b.f || '')); });
  setField('conn_phases', out.length ? JSON.stringify(out) : '');
}
function todayStr(){
  var t = new Date();
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
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
function personLabel(handle, display){
  var h = String(handle || '').trim();
  var raw = String(display || '').trim();
  if(raw) return raw;
  var clean = h.replace(/^_+|_+$/g, '');
  var parts = clean.split(/[._\-]+/).filter(function(p){ return p && !/^\d+$/.test(p); });
  if(parts.length) return titleCase(parts.join(' '));
  return h;
}
function auName(e){
  var handle = String(e.name || '').trim();
  var nm = personLabel(handle, String(e.display || gv(e, 'display_name') || '').trim());
  return { name:nm || 'Unknown', business:isBusiness(e), handle:handle };
}
function lastNameOf(e){
  return String(gv(e, 'last_name') || '').trim().toLowerCase();
}
function firstNameOf(e){
  return String(gv(e, 'first_name') || '').trim();
}
function nameOk(e){
  return !!(firstNameOf(e) && lastNameOf(e));
}
function nameFlag(e){
  if(nameOk(e)) return '';
  var d = String(e.display || '');
  if(!d.trim()) return 'blank';
  if(d.indexOf('&') >= 0) return 'couple';
  if(!firstNameOf(e)) return 'no name';
  return 'no last name';
}
/* closeness prediction: family of fleshed-out people + own data richness + tier + years known */
function closeScore(e, famMap){
  var st = auditStats(e);
  if(st.audited) return null;
  var score = 0, reasons = [];
  var ln = lastNameOf(e);
  if(ln && famMap[ln]){
    var fams = famMap[ln].filter(function(x){ return x.i !== (e.name || '').toLowerCase(); });
    if(fams.length){
      score += 50;
      reasons.push('Family: ' + fams.slice(0, 2).map(function(x){ return x.d; }).join(', '));
    }
  }
  if(st.score > 0){ score += st.score * 10; reasons.push(st.score + '/4 on file'); }
  var tier = tierOf(e);
  if(tier === 'vetted'){ score += 20; reasons.push('Vetted'); }
  else if(tier === 'associate'){ score += 10; reasons.push('Associate'); }
  var yk = yearsKnownCalc(e);
  if(yk > 0) score += Math.min(yk, 15);
  if((e.relation || '') === 'mutual') score += 5;
  if(!score) return null;
  return { score:score, reasons:reasons };
}
function auditStats(e){
  var hasR = L1_SCORES.some(function(k){ return gv(e, k) !== ''; });
  var hasB = !!(gv(e, 'specialty') || gv(e, 'interests') || ORG_CATS.some(function(c){ return gv(e, c.k).trim(); }));
  var hasC = !!(gv(e, 'relationship') || gv(e, 'context') || gv(e, 'tier'));
  var audited = (e.profile || {}).audit === 'audited';
  var missing = (hasR ? 0 : 1) + (hasB ? 0 : 1) + (hasC ? 0 : 1) + (audited ? 0 : 1);
  return { hasR:hasR, hasB:hasB, hasC:hasC, audited:audited, missing:missing, score:4 - missing };
}
function openAudit(){
  AUD.open = true;
  $('#auditscreen').hidden = false;
  $('#auq').value = AUD.q;
  renderAudit();
  if(AUD.scroll) $('#aubody').scrollTop = AUD.scroll;
}
function closeAudit(){
  var ab = $('#aubody');
  if(ab) AUD.scroll = ab.scrollTop;
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
  entry.items.forEach(function(it){
    var p = {}; p[entry.postKey] = toPrev ? it.prev : it.next;
    queuePatch(it.di, p);
  });
  renderAudit(); refresh();
  if(done) done();
}
function doUndo(){
  var en = AUD.undoStack.pop();
  if(!en){ toast('Nothing to undo.'); return; }
  applyEntry(en, true, function(){ AUD.redoStack.push(en); updateUndoBtns(); });
}
function doRedo(){
  var en = AUD.redoStack.pop();
  if(!en){ toast('Nothing to redo.'); return; }
  applyEntry(en, false, function(){ AUD.undoStack.push(en); updateUndoBtns(); });
}
function setAuditFor(di, next){
  var e = D.directory[di]; if(!e) return;
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
  if(AUD.f === 'dup'){ renderDupAudit(q); return; }
  var rows = [];
  /* family map: last name -> fleshed-out people (score>=2) carrying it */
  var famMap = {};
  D.directory.forEach(function(x){
    if((x.profile || {}).deleted === '1' || isBusiness(x)) return;
    if(auditStats(x).score < 2) return;
    var ln = lastNameOf(x);
    if(!ln) return;
    (famMap[ln] = famMap[ln] || []).push({ i:(x.name || '').toLowerCase(), d:dispName(x) });
  });
  D.directory.forEach(function(e, di){
    if((e.profile || {}).deleted === '1') return;
    var st = auditStats(e);
    var an = auName(e);
    var cs = null;
    var pass = true;
    if(AUD.f === 'needs') pass = st.missing > 0;
    else if(AUD.f === 'audit') pass = !st.audited;
    else if(AUD.f === 'ratings') pass = !st.hasR;
    else if(AUD.f === 'background') pass = !st.hasB;
    else if(AUD.f === 'connection') pass = !st.hasC;
    else if(AUD.f === 'business') pass = an.business;
    else if(AUD.f === 'name') pass = !an.business && !nameOk(e);
    else if(AUD.f === 'close'){ cs = closeScore(e, famMap); pass = !!cs; }
    if(!pass) return;
    if(q){
      var hay = (an.name + ' ' + an.handle + ' ' + gv(e, 'display_name')).toLowerCase();
      if(hay.indexOf(q) < 0) return;
    }
    rows.push({ di:di, e:e, st:st, an:an, cs:cs });
  });
  rows.sort(function(a, b){
    if(AUD.sort === 'name') return a.an.name.localeCompare(b.an.name);
    if(AUD.sort === 'complete') return b.st.score - a.st.score || a.an.name.localeCompare(b.an.name);
    if(AUD.sort === 'close' || AUD.f === 'close') return ((b.cs && b.cs.score) || 0) - ((a.cs && a.cs.score) || 0) || a.an.name.localeCompare(b.an.name);
    return a.st.score - b.st.score || a.an.name.localeCompare(b.an.name);
  });
  AUD.rows = rows;
  var nA = 0, nR = 0, nB = 0, nC = 0, nBiz = 0, nName = 0, nClose = 0;
  D.directory.forEach(function(e){
    if((e.profile || {}).deleted === '1') return;
    var st = auditStats(e);
    if(!st.audited) nA++;
    if(!st.hasR) nR++;
    if(!st.hasB) nB++;
    if(!st.hasC) nC++;
    if(isBusiness(e)) nBiz++;
    else if(!nameOk(e)) nName++;
    if(closeScore(e, famMap)) nClose++;
  });
  $('#aushown').textContent = rows.length + ' shown';
  function stat(f, label, n){
    return '<button class="austat' + (AUD.f === f ? ' on' : '') + '" data-f="' + f + '"><b>' + n + '</b><span>' + label + '</span></button>';
  }
  $('#austats').innerHTML = stat('audit', 'Need audit', nA) + stat('ratings', 'Need ratings', nR) +
    stat('background', 'Need background', nB) + stat('connection', 'Need connection', nC) + stat('business', 'Businesses', nBiz) +
    stat('name', 'Name review', nName) + stat('close', 'Likely close', nClose);
  function pill(has, label){ return '<b class="' + (has ? 'have' : 'miss') + '">' + label + '</b>'; }
  $('#aubody').innerHTML = rows.slice(0, 600).map(function(r){
    var ini = (r.an.name.replace(/^@/, '').trim().charAt(0) || '·').toUpperCase();
    var hd = (r.e.src === 'contacts' || r.e.src === 'subject') ? '' : r.an.handle.replace(/^@/, '');
    var sel = AUD.sel[r.di] ? ' checked' : '';
    return '<div class="aurow" data-di="' + r.di + '">' +
      '<input type="checkbox" class="ausel" data-di="' + r.di + '"' + sel + ' aria-label="Select">' +
      '<span class="auava">' + esc(ini) + '</span>' +
      '<span class="aumain"><span class="auname">' + esc(r.an.name) +
        (r.an.business ? '<em class="aubiz">Business</em>' : '') +
        (hd ? '<i>@' + esc(hd) + '</i>' : '') + '</span>' +
      '<span class="auneeds">' + pill(r.st.hasR, 'Persona') + pill(r.st.hasB, 'Background') + pill(r.st.hasC, 'Connection') + pill(r.st.audited, 'Audited') +
        (AUD.f === 'name' ? '<b class="miss">' + esc(nameFlag(r.e) || 'name') + '</b>' : '') +
        (r.cs ? r.cs.reasons.map(function(x){ return '<b class="have">' + esc(x) + '</b>'; }).join('') : '') + '</span></span>' +
      '<span class="aubar" title="' + r.st.score + ' of 4 complete"><i style="width:' + (r.st.score * 25) + '%"></i></span>' +
      '<span class="aubtn"><button class="mini" data-auact="' + (r.st.audited ? 'unaudit' : 'audit') + '">' + (r.st.audited ? 'Reopen' : 'Mark audited') + '</button></span></div>';
  }).join('') + (rows.length > 600 ? '<p class="dim" style="padding:14px">Showing the first 600. Narrow the filter or search to see the rest.</p>' : '') || '<p class="dim" style="padding:20px">Nobody matches this filter.</p>';
  renderBulk();
  updateUndoBtns();
}
function renderBulk(){
  var n = Object.keys(AUD.sel).length;
  var bb = $('#aubulk');
  var showMergeAll = AUD.f === 'dup' && AUD.dupGroups && AUD.dupGroups.length;
  if(!n && !showMergeAll){ bb.hidden = true; return; }
  bb.hidden = false;
  bb.innerHTML = (n ? '<span><b>' + n + '</b> selected</span>' : '') +
    (n ? '<button class="mini" data-bulk="audit">Mark audited</button>' +
    '<button class="mini" data-bulk="unaudit">Reopen</button>' +
    '<button class="mini danger" data-bulk="delete">Delete</button>' : '') +
    (n ? '<button class="mini neutral" data-bulk="clear">Clear</button>' : '');
  if(showMergeAll){
    bb.innerHTML += '<button class="mini" data-bulk="mergeall" style="--c:#f0b44c">Merge all duplicates</button>';
  }
}

/* ---------- duplicate detection + nuclear merge ---------- */
function normDupName(s){
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function dupHandle(e){
  return String(e.name || '').toLowerCase();
}
function findDupGroups(){
  var byName = {}, i, e, pr, key;
  for(i = 0; i < D.directory.length; i++){
    e = D.directory[i];
    pr = e.profile || {};
    if(pr.deleted === '1' || (pr.merged_into || '').trim()) continue;
    key = normDupName(e.display || dispName(e));
    if(!key || key.length < 2) continue;
    (byName[key] = byName[key] || []).push(i);
  }
  var groups = [];
  Object.keys(byName).forEach(function(k){
    var members = byName[k];
    if(members.length < 2) return;
    var scored = members.map(function(di){
      var en = D.directory[di];
      var st = auditStats(en);
      var score = st.score + (en.has_graph ? 2 : 0) + ((en.pieces || 0) > 0 ? 1 : 0);
      return { di:di, e:en, st:st, score:score };
    });
    scored.sort(function(a, b){ return b.score - a.score; });
    groups.push({ key:k, members:scored, survivor:scored[0].di });
  });
  groups.sort(function(a, b){ return b.members.length - a.members.length; });
  return groups;
}
function renderDupAudit(q){
  var groups = findDupGroups();
  if(q){
    groups = groups.filter(function(g){
      return g.key.indexOf(q) >= 0 || g.members.some(function(m){
        return dupHandle(m.e).indexOf(q) >= 0;
      });
    });
  }
  AUD.dupGroups = groups;
  AUD.rows = [];
  var nDup = groups.reduce(function(n, g){ return n + g.members.length; }, 0);
  $('#aushown').textContent = groups.length + ' groups · ' + nDup + ' entries';
  var dupStat = $('#austats .austat[data-f="dup"]');
  if(!dupStat){
    $('#austats').insertAdjacentHTML('beforeend',
      '<button class="austat on" data-f="dup"><b>' + groups.length + '</b><span>Duplicate groups</span></button>');
  } else {
    dupStat.querySelector('b').textContent = groups.length;
    $('#austats').querySelectorAll('.austat').forEach(function(s){ s.classList.toggle('on', s.getAttribute('data-f') === 'dup'); });
  }
  function dupSrcLabel(e){
    var n = String(e.name || '');
    var m = n.match(/^(ig|ct|sf|fdb):/);
    if(m) return m[1];
    return e.has_graph ? 'ig' : 'entry';
  }
  $('#aubody').innerHTML = groups.map(function(g, gi){
    var cards = g.members.map(function(m){
      var an = auName(m.e);
      var srcTag = '<i>' + esc(dupSrcLabel(m.e)) + '</i>';
      var isS = m.di === g.survivor;
      return '<label class="dupmem' + (isS ? ' surv' : '') + '">' +
        '<input type="radio" name="dupsurv' + gi + '" data-gi="' + gi + '" data-di="' + m.di + '"' + (isS ? ' checked' : '') + '>' +
        '<span class="auava">' + esc((an.name.replace(/^@/, '').trim().charAt(0) || '·').toUpperCase()) + '</span>' +
        '<span class="aumain"><span class="auname">' + esc(an.name) + ' ' + srcTag + '</span>' +
        '<span class="auneeds"><b class="' + (m.st.score >= 3 ? 'have' : 'miss') + '">' + m.st.score + '/4 data</b>' +
        (m.e.has_graph ? '<b class="have">graph</b>' : '') +
        ((m.e.pieces || 0) ? '<b class="have">' + m.e.pieces + ' mentions</b>' : '') + '</span></span>' +
        (isS ? '<em class="dupsurvtag">survivor</em>' : '') + '</label>';
    }).join('');
    return '<div class="dupgroup"><div class="duphead"><b>' + esc(g.members[0].e.display || g.key) + '</b>' +
      '<span class="dim">' + g.members.length + ' entries</span>' +
      '<button class="mini" data-dupmerge="' + gi + '" style="--c:#f0b44c">Merge into survivor</button></div>' +
      '<div class="dupmems">' + cards + '</div></div>';
  }).join('') || '<p class="dim" style="padding:20px">No duplicates found.</p>';
  renderBulk();
  updateUndoBtns();
}
function dupSurvivorName(g){
  var e = D.directory[g.survivor];
  return e ? (dispName(e) || dupHandle(e)) : '?';
}
function doMergeGroup(gi){
  var g = (AUD.dupGroups || [])[gi];
  if(!g) return;
  var surv = D.directory[g.survivor];
  if(!surv) return;
  var target = dupHandle(surv);
  if(!target){ toast('Survivor has no handle to merge into.'); return; }
  var losers = g.members.filter(function(m){ return m.di !== g.survivor; });
  if(!losers.length){ toast('Nothing to merge.'); return; }
  if(!confirm('Merge ' + losers.length + ' duplicate' + (losers.length > 1 ? 's' : '') + ' into "' +
      dupSurvivorName(g) + '"?\n\nTheir info folds into the survivor and they disappear from the directory. You can undo this.')) return;
  var entry = { postKey:'merged_into', items:losers.map(function(m){
    return { di:m.di, prev:((D.directory[m.di].profile || {}).merged_into || ''), next:target };
  }) };
  pushUndo(entry);
  applyEntry(entry, false, function(){ toast(losers.length + ' merged into ' + dupSurvivorName(g) + '.'); });
}
function doMergeAllDups(){
  var groups = AUD.dupGroups || [];
  if(!groups.length){ toast('No duplicate groups.'); return; }
  var total = groups.reduce(function(n, g){ return n + g.members.length - 1; }, 0);
  if(!total){ toast('Nothing to merge.'); return; }
  if(!confirm('Merge ' + total + ' duplicates across ' + groups.length + ' groups?\n\nEach group folds into its selected survivor. You can undo this.')) return;
  var items = [];
  groups.forEach(function(g){
    var surv = D.directory[g.survivor];
    if(!surv) return;
    var target = dupHandle(surv);
    if(!target) return;
    g.members.forEach(function(m){
      if(m.di === g.survivor) return;
      items.push({ di:m.di, prev:((D.directory[m.di].profile || {}).merged_into || ''), next:target });
    });
  });
  if(!items.length){ toast('Nothing to merge.'); return; }
  var entry = { postKey:'merged_into', items:items };
  pushUndo(entry);
  applyEntry(entry, false, function(){ toast(total + ' duplicates merged.'); });
}
function dupSetSurvivor(gi, di){
  var g = (AUD.dupGroups || [])[gi];
  if(g) g.survivor = di;
}

/* ---------- export ---------- */
function dossierFileName(e){
  var base = String(dispName(e) || 'person').replace(/[\\/:*?"<>|]/g, '').trim() || 'person';
  return 'Dossier - ' + base + '.html';
}
function buildDossierDoc(e){
  var name = dispName(e);
  var handle = (e.src === 'contacts' || e.src === 'subject') ? '' : '@' + (e.name || '');
  var aka = gv(e, 'also_known_as');
  var today = new Date();
  var ds = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  var bio = gv(e, 'synopsis');
  var classif = [gv(e, 'relationship'), gv(e, 'context'), tierName(e)].filter(Boolean).join(' · ');
  var orgs = [];
  ORG_CATS.forEach(function(cat){ tagList(gv(e, cat.k)).forEach(function(v){ orgs.push(v); }); });
  var contact = [];
  if(handle) contact.push('<span class="cl">Instagram</span> ' + esc(handle));
  if(gv(e, 'email')) contact.push('<span class="cl">Email</span> ' + esc(gv(e, 'email')));
  if(gv(e, 'phone')) contact.push('<span class="cl">Phone</span> ' + esc(gv(e, 'phone')));
  if(orgs.length) contact.push('<span class="cl">Orgs</span> ' + esc(orgs.join(' · ')));
  var bars = READ_TRAITS.map(function(k){
    var v = parseInt(gv(e, k), 10), ok = !isNaN(v);
    var w = ok ? Math.max(0, Math.min(5, v)) / 5 * 100 : 0;
    return '<div class="brow"><span>' + esc(fieldDef(k).l) + '</span><div class="bar"><i style="width:' + w + '%"></i></div><em>' + (ok ? v + '/5' : '—') + '</em></div>';
  }).join('');
  var extras = '';
  if(gv(e, 'specialty')) extras += '<div class="kv"><span class="cl">Specialty</span> ' + esc(gv(e, 'specialty')) + '</div>';
  if(gv(e, 'interests')) extras += '<div class="kv"><span class="cl">Interests</span> ' + esc(gv(e, 'interests')) + '</div>';
  if(tierName(e)) extras += '<div class="kv"><span class="cl">Tier</span> ' + esc(tierName(e)) + '</div>';
  if(momVal(e)) extras += '<div class="kv"><span class="cl">Momentum</span> ' + esc(MOM_LABELS[momVal(e)]) + '</div>';
  degreesOf(e).forEach(function(d){ extras += '<div class="kv"><span class="cl">Degree</span> ' + esc([d.school, d.degree, d.major, d.year].filter(Boolean).join(' · ')) + '</div>'; });
  var assoc = knownAssociates(e).map(function(nb){
    var di = BYN[(nb.u || '').toLowerCase()];
    var label = di != null ? auName(D.directory[di]).name : personLabel(nb.u, nb.d);
    return '<li>' + esc(label) + '</li>';
  }).join('');
  var notes = '';
  if(gv(e, 'notes')) notes += '<p>' + esc(gv(e, 'notes')).replace(/\n/g, '<br>') + '</p>';
  if(gv(e, 'public_footprint')) notes += '<p><b>Public footprint</b><br>' + esc(gv(e, 'public_footprint')).replace(/\n/g, '<br>') + '</p>';
  if(!notes) notes = '<p>—</p>';
  var meta = ['Compiled ' + ds];
  if(classif) meta.push(esc(classif));
  meta.push((e.degree || 0) + ' graph connections');
  if(e.shared_with_jd) meta.push(e.shared_with_jd + ' shared');
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
  '.cols2{column-count:2;column-gap:30px}' +
  '.cols2 .sec{break-inside:avoid;margin:0 0 18px}' +
  '.cols2 .slabel{font-size:11px;margin-bottom:6px}' +
  '.cols2 .sbody{font-size:12px;line-height:1.6}' +
  '.cols2 .brow{margin-bottom:5px}' +
  '.cols2 .brow span{width:96px;font-size:10px}' +
  '.cols2 ul.assoc{font-size:12px;line-height:1.6}' +
  '.cols2 .kv{font-size:12px;margin:4px 0}' +
  'ul.assoc{margin:0;padding-left:22px;font-size:13px;line-height:1.7}' +
  '.foot{border-top:2px solid #141414;margin-top:26px;padding-top:10px;font-size:11px}' +
  '.foot .sig{font-family:"Segoe Script",cursive;font-size:22px;margin:6px 0}' +
  '@media print{body{background:#fff;padding:0}.page{box-shadow:none;max-width:none}}' +
  '</style></head><body><div class="page">' +
  '<div class="hero"><h1>' + esc(name) + '</h1>' +
  (aka ? '<div class="aka">also known as ' + esc(aka) + '</div>' : '') +
  (contact.length ? '<div class="contact">' + contact.join('<br>') + '</div>' : '') + '</div>' +
  '<div class="meta">' + meta.join(' &nbsp;·&nbsp; ') + '</div>' +
  '<div class="sec"><div class="slabel">SYNOPSIS</div><div class="sbody">' + (bio ? '<p>' + esc(bio).replace(/\n/g, '<br>') + '</p>' : '<p>—</p>') + '</div></div>' +
  '<div class="cols2">' +
  '<div class="sec"><div class="slabel">PROFILE RATINGS</div><div class="bars">' + bars + '</div>' + extras + '</div>' +
  '<div class="sec"><div class="slabel">KNOWN ASSOCIATES</div>' +
    (assoc ? '<ul class="assoc">' + assoc + '</ul>' : '<div class="sbody"><p>—</p></div>') + '</div>' +
  '<div class="sec"><div class="slabel">FIELD NOTES</div><div class="sbody">' + notes + '</div></div>' +
  '<div class="sec"><div class="slabel">TIMELINE</div><div class="sbody">' + tl + '</div></div>' +
  '<div class="sec"><div class="slabel">ATTACHED FILES</div><div class="sbody">' + fls + '</div></div>' +
  '</div>' +
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

/* ---------- modals + settings ---------- */
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
function reviewQueueHTML(){
  var rows = [];
  D.directory.forEach(function(r, i){
    var pr = r.profile || {};
    if(!pr.review_flag || pr.deleted === '1') return;
    var label = pr.review_flag === 'duplicate' ? 'Possible duplicate' : (pr.review_flag === 'missing_info' ? 'Missing info' : pr.review_flag);
    rows.push('<div class="revrow" data-ri="' + i + '"><b>' + esc(dispName(r)) + '</b><span>' + esc(label) + '</span></div>');
  });
  if(rows.length > 150) rows = rows.slice(0, 150).concat(['<p class="dim" style="margin:8px 0 0;font-size:12.5px">Showing the first 150.</p>']);
  return rows.length ? rows.join('') : '<p class="dim" style="margin:0;font-size:13px">Nothing flagged. Set a review flag in a person’s Admin section to queue them here.</p>';
}
function openSettings(){
  openModal('Settings',
    '<label class="lab">Keyboard shortcuts</label>' +
    '<div class="keys"><kbd>/</kbd><span>Search</span><kbd>↑ ↓</kbd><span>Move through the directory</span><kbd>1 2 3</kbd><span>On file, Record, Files</span><kbd>E</kbd><span>Edit the open dossier</span>' +
    '<kbd>Alt ←</kbd><span>Back to the previous person</span><kbd>Esc</kbd><span>Back, finish editing, or close</span><kbd>B</kbd><span>Show or hide the directory</span></div>' +
    '<label class="lab">Edit key<span class="sh">Only needed if you set EDIT_TOKEN in the Apps Script project. Stored in this browser.</span></label>' +
    '<input type="password" id="setedit" placeholder="Edit key" autocomplete="off" value="' + esc(getPw()) + '">' +
    '<label class="lab">Bio tidy prompt<span class="sh">Sent to Gemini with the draft text when you press Tidy with AI on a Bio.</span></label>' +
    '<textarea id="setprompt" rows="8" placeholder="Loading…"></textarea>' +
    '<label class="lab">Gemini API key<span class="sh">Stored in the sheet, server-side only. Get one at aistudio.google.com.</span></label>' +
    '<input type="password" id="setkey" placeholder="AIza…" autocomplete="off">' +
    '<div class="arow"><button id="setsave" class="mini neutral">Save settings</button><button id="settest" class="mini neutral">Test Gemini</button><button id="setclear" class="mini neutral">Clear key</button><span id="setmsg"></span></div>' +
    '<div class="revq"><h3>Needs review</h3><div id="revqlist">' + reviewQueueHTML() + '</div></div>', 0, true);
  $('#setedit').addEventListener('change', function(){ store('ncc_edit_key', this.value.trim()); loadSettings(); });
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
  /* rings are tiers: vetted inner, associate middle, open outer, untiered halo */
  var tierRing = { vetted:0, associate:1, open:2 };
  function ringOf(di){ var t = tierOf(dir[di]); return tierRing[t] != null ? tierRing[t] : 3; }
  var seen = {}, placement = [];
  ORDER.forEach(function(di){ seen[di] = true; placement.push(di); });
  dir.forEach(function(r, di){
    if(seen[di] || r.has_graph !== false) return;
    if(!((r.events || []).length || (r.files || []).length || !!r.record)) return;
    placement.push(di);
  });
  var byRing = [[], [], [], []];
  placement.forEach(function(di){ byRing[ringOf(di)].push(di); });
  var radii = [170, 310, 490, 640], spread = [16, 36, 50, 70];
  NODES = [];
  byRing.forEach(function(list, ring){
    var n = list.length;
    list.forEach(function(di, k){
      var rng = mulberry32(di * 2654435761 % 2147483647);
      var ang = (k / Math.max(1, n)) * Math.PI * 2 + (rng() - 0.5) * 0.3 + ring * 0.7;
      var rad = radii[ring] + (rng() - 0.5) * 2 * spread[ring];
      var r = dir[di];
      NODES.push({ i:di, ring:ring, ang:ang, x:Math.cos(ang) * rad, y:Math.sin(ang) * rad,
        rad:2.0 + 3.6 * (r.strength / maxS), title:dispName(r), handle:r.name, relation:r.relation,
        pieces:r.pieces, strength:r.strength, on:true, col:'#7ea6f0' });
    });
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
    var _sel = S.sel !== null;
    GL.controls.autoRotateSpeed = _sel ? 0.12 : 0.25;
    GL.controls.autoRotate = !GL.flight && !GL.userHold && !(GL.hoverDi != null && GL.hoverDi >= 0);
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
  var lab = makeLabel(auName(D.directory[di]).name, { size:20, color:'#e8ecf3' }), p = GL.glPos[di];
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
  var nbrs = knownAssociates(e).slice(0, 12);
  nbrs.forEach(function(nb, j){
    var y = 1 - 2 * (j + 0.5) / nbrs.length, r = Math.sqrt(Math.max(0, 1 - y * y)), th = j * 2.399963;
    var np = new THREE.Vector3(p.x + Math.cos(th) * r * 16, p.y + y * 16, p.z + Math.sin(th) * r * 16);
    var di2 = BYN[(nb.u || '').toLowerCase()];
    var col = di2 != null ? new THREE.Color(LV[personLevel(D.directory[di2])].c) : new THREE.Color(0x5a6b84);
    var mesh = new THREE.Mesh(GL.nbrGeo, new THREE.MeshBasicMaterial({ color:col }));
    mesh.position.copy(np);
    mesh.userData.dirIdx = di2 != null ? di2 : -1;
    g.add(mesh);
    var lab = makeLabel((function(){ var _di = BYN[(nb.u||'').toLowerCase()]; return _di != null ? auName(D.directory[_di]).name : personLabel(nb.u, nb.d); })(), { size:19, color:'#d7e5f2' });
    var ldir = np.clone().sub(p);
    if(ldir.lengthSq() < 1e-6) ldir.set(0, 1, 0);
    ldir.normalize();
    lab.position.set(np.x + ldir.x * 8.5, np.y + ldir.y * 8.5, np.z + ldir.z * 8.5);
    lab.userData.nodePos = np.clone();
    g.add(lab);
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p, np]), new THREE.LineBasicMaterial({ color:col, transparent:true, opacity:0.35 })));
  });
  var fl = makeLabel(auName(e).name, { size:24, color:'#f4efe6' });
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
function glReset(){ resetView(); }
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

  /* nav buttons (bound once, here, not inside an action) */
  var nh = $('#navhome'), nb = $('#navback'), nf = $('#navfwd');
  if(nh) nh.addEventListener('click', goHome);
  if(nb) nb.addEventListener('click', goBack);
  if(nf) nf.addEventListener('click', goForward);

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
  $('#fenrichedonly').addEventListener('change', function(e){ S.enrichedOnly = e.target.checked; S.limit = 200; refresh(); });
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
    else if(k === 'mergeall') doMergeAllDups();
    else if(k === 'clear'){ AUD.sel = {}; renderAudit(); }
  });
  $('#ausort').addEventListener('change', function(ev){ AUD.sort = ev.target.value; renderAudit(); });
  var _audt = null;
  $('#auq').addEventListener('input', function(ev){ clearTimeout(_audt); _audt = setTimeout(function(){ AUD.q = ev.target.value; renderAudit(); }, 200); });
  $('#aubody').addEventListener('change', function(ev){
    var cb = ev.target.closest('.ausel'); if(cb){
      var di = parseInt(cb.getAttribute('data-di'), 10);
      if(cb.checked) AUD.sel[di] = 1; else delete AUD.sel[di];
      renderBulk();
      return;
    }
    var radio = ev.target.closest('input[type="radio"][data-gi]');
    if(radio){
      dupSetSurvivor(parseInt(radio.getAttribute('data-gi'), 10), parseInt(radio.getAttribute('data-di'), 10));
      renderDupAudit(AUD.q.trim().toLowerCase());
      return;
    }
  });
  $('#aubody').addEventListener('click', function(ev){
    if(ev.target.classList && ev.target.classList.contains('ausel')) return;
    var dm = ev.target.closest('[data-dupmerge]');
    if(dm){ ev.stopPropagation(); doMergeGroup(parseInt(dm.getAttribute('data-dupmerge'), 10)); return; }
    var ab = ev.target.closest('[data-auact]');
    if(ab){
      ev.stopPropagation();
      var rr = ab.closest('.aurow');
      setAuditFor(parseInt(rr.getAttribute('data-di'), 10), ab.getAttribute('data-auact') === 'audit' ? 'audited' : 'needs_audit');
      return;
    }
    var row = ev.target.closest('.aurow');
    if(row){ AUD.fromAudit = true; closeAudit(); openPerson(parseInt(row.getAttribute('data-di'), 10), { push:true, edit:true, fromAuditKeep:true }); }
  });
  $('#listtoggle').addEventListener('click', toggleList);
  $('#settingsbtn').addEventListener('click', openSettings);
  $('#leftbody').addEventListener('click', function(e){
    if(e.target.closest('[data-more]')){ S.limit += 200; renderRail(); return; }
    var dot = e.target.closest('.fstrip .iseg');
    if(dot){
      e.stopPropagation();
      var di = parseInt(dot.getAttribute('data-di'), 10), sec = dot.getAttribute('data-sec');
      if(S.sel === di && S.editing){ jumpTo(sec); }
      else { openPerson(di, { edit:true }); S.jumpTo = sec; setTimeout(function(){ jumpTo(sec); }, 60); }
      return;
    }
    var row = e.target.closest('[data-i]');
    if(row) openPerson(parseInt(row.getAttribute('data-i'), 10), { lvl:parseInt(row.getAttribute('data-go'), 10) || 1, edit:S.editing });
  });
  $('#leftbody').addEventListener('keydown', function(e){
    var row = e.target.closest('[data-i]');
    if(row && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openPerson(parseInt(row.getAttribute('data-i'), 10), { lvl:parseInt(row.getAttribute('data-go'), 10) || 1, edit:S.editing }); }
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
    if(b.hasAttribute('data-tf')){ var t2 = b.getAttribute('data-tf'); S.tierF = S.tierF === t2 ? '' : t2; }
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
    var sg = e.target.closest('#evinit button');
    if(sg){ $$('button', sg.parentNode).forEach(function(x){ x.classList.toggle('on', x === sg); }); return; }
    var tseg = e.target.closest('.tseg[data-tier]');
    if(tseg){
      var tv = tseg.getAttribute('data-tier');
      $$('.tseg', tseg.parentNode).forEach(function(x){ x.classList.toggle('on', x === tseg); });
      setField('tier', tv); return;
    }
    var mst = e.target.closest('.mstop');
    if(mst){
      var mv = mst.getAttribute('data-v'), track = mst.closest('.momtrack');
      setField('momentum', mv);
      if(track){
        track.setAttribute('data-v', mv);
        $$('.mstop', track).forEach(function(x){ x.classList.toggle('on', x.getAttribute('data-v') === mv); });
        var fill = $('.momfill', track); if(fill) fill.style.width = momPos(mv) + '%';
        var lab = $('.momlabels b', track.parentNode); if(lab) lab.textContent = MOM_LABELS[mv];
      }
      updateFills(); return;
    }
    var pd = e.target.closest('.pdot');
    if(pd){
      var box = pd.closest('.dots'), nv = box.getAttribute('data-v') === pd.getAttribute('data-v') ? '' : pd.getAttribute('data-v');
      box.setAttribute('data-v', nv);
      $$('.pdot', box).forEach(function(d2){ d2.classList.toggle('on', d2.getAttribute('data-v') === nv && nv !== ''); });
      setField(box.getAttribute('data-pk'), nv); return;
    }
    var ah = e.target.closest('.naddhit');
    if(ah && ah.getAttribute('data-ai')){ addClose(D.directory[S.sel], parseInt(ah.getAttribute('data-ai'), 10)); return; }
    if(ah && ah.getAttribute('data-mh')){ doMerge(D.directory[S.sel], ah.getAttribute('data-mh')); return; }
    var um = e.target.closest('[data-act="unmerge"]');
    if(um){ doUnmerge(D.directory[S.sel]); return; }
    var tc = e.target.closest('.tchip');
    if(tc){
      var cont = tc.closest('.tchips');
      if(cont.getAttribute('data-mode') === 'pick') tc.classList.toggle('on');
      else tc.remove();
      setField(cont.getAttribute('data-pk'), readTags(cont));
    }
  });
  rb.addEventListener('keydown', function(e){
    if(e.target.classList && e.target.classList.contains('tadd') && e.key === 'Enter'){
      e.preventDefault();
      var v = e.target.value.trim(); if(!v) return;
      var cont = e.target.parentNode, dup = false;
      $$('.tchip', cont).forEach(function(c){ if(c.getAttribute('data-tv').toLowerCase() === v.toLowerCase()){ c.classList.add('on'); dup = true; } });
      if(!dup){
        var tmp = document.createElement('div');
        tmp.innerHTML = tagChip(v, true, cont.getAttribute('data-mode') !== 'pick');
        cont.insertBefore(tmp.firstChild, e.target);
      }
      e.target.value = '';
      setField(cont.getAttribute('data-pk'), readTags(cont));
    }
  });
  rb.addEventListener('input', function(e){
    var t = e.target;
    if(t.id === 'naddinput'){ renderNadd(t.value); return; }
    if(t.id === 'mergeinput'){ mergeSearch(t.value); return; }
    if(t.closest('#cprows')){ syncConnPhases(); return; }
    var k = t.getAttribute && t.getAttribute('data-pk');
    if(k && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && k !== 'phone') setField(k, t.value);
  });
  rb.addEventListener('change', function(e){
    var t = e.target;
    if(t.classList && t.classList.contains('cp-tp')){
      var row = t.closest('.cprow'), mt = row ? $('.cp-t', row) : null;
      if(mt) mt.disabled = t.checked;
      syncConnPhases(); return;
    }
    if(t.closest && t.closest('#cprows')){ syncConnPhases(); return; }
    var k = t.getAttribute && t.getAttribute('data-pk');
    if(!k) return;
    if(k === 'phone'){
      t.value = String(t.value).split(',').map(function(x){ return fmtPhone(x); }).filter(Boolean).join(', ');
      setField(k, t.value);
    } else if(t.tagName === 'SELECT') setField(k, t.value);
  });

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
  if(e.altKey && e.key === 'ArrowRight'){ e.preventDefault(); goForward(); return; }
  if(typing() || e.metaKey || e.ctrlKey || e.altKey) return;
  if(e.key === '/'){ e.preventDefault(); if(!S.listOpen) toggleList(); $('#fq').focus(); $('#fq').select(); return; }
  if(e.key === 'b' || e.key === 'B'){ toggleList(); return; }
  if(e.key === 'h' || e.key === 'H'){ goHome(); return; }
  if(e.key === 'ArrowDown' || e.key === 'j'){ e.preventDefault(); stepSel(1); return; }
  if(e.key === 'ArrowUp' || e.key === 'k'){ e.preventDefault(); stepSel(-1); return; }
  if(S.sel === null) return;
  if((e.key === '1' || e.key === '2' || e.key === '3') && !S.editing){ setLevel(parseInt(e.key, 10)); return; }
  if((e.key === 'e' || e.key === 'E') && !S.editing){ e.preventDefault(); enterEdit(); }
}

/* ---------- boot ---------- */
function boot(){
  injectIcons(document);
  ambient();
  var m = store('ncc_mode'), c = store('ncc_color');
  if(m === '2d' || m === '3d') S.mode = m;
  if(c === 'tier' || c === 'rel') S.colorBy = c; else if(c === 'level') S.colorBy = 'tier';
  try{ store('ncc_secs', '{}'); }catch(x){} S.openSecs = {};
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
        D.directory.forEach(function(r, i){
          BYN[(r.name || '').toLowerCase()] = i;
          normEntry(r);
          PK2I[pkey(r)] = i;
        });
        outLoad();
        try { applyOutbox(); } catch(px){}
        try { syncNavBtns(); } catch(nx){}
        buildNodes();
        $('#fq').placeholder = 'Search ' + LIST_ORDER.length + ' people…';
        hubInit(); bind(); refresh(); setMode(S.mode);
        syncUI(); outKick(); fetchChanges();
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
