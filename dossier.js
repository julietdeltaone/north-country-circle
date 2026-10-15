/* North Country Circle — Dossier v6
   One front end, four destinations: People, Network, Family, Groups. The visual
   map at index.html is the site's front door; this app is the reading + editing side.
   The profile is a page, not a panel. Everything that writes goes through the same outbox as v5
   (see DATA-CONTRACT.md section 6): queuePatch -> localStorage -> batched POST -> Sheet.

   Layout of this file
     1. constants + helpers          5. stamps + landOn (map markers, shared highlight)
     2. data access (gv, pkey ...)   6. family model + writes
     3. outbox + undo                7. merge
     4. waivers                      8. views: shell, router, People, Profile, Network, Family, Groups, Settings
*/
(function(){
'use strict';

/* ============================================================
   1. constants + helpers
   ============================================================ */
var WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwZli1Dv07iWBpR3Oz4jD4imtNLN845jFDBnXIbtmT3sPGExsMlKFMQwt42FmrUdFBD/exec';

var TIERS = {
  vetted:   { n:'Vetted',    c:'#f5b942' },
  associate:{ n:'Associate', c:'#7db3e8' },
  open:     { n:'Open',      c:'#9a9a9a' }
};
/* Ring palette (design pass 2026-10-14): color means ring — one muted hue per
   ring, shared by the map, legend, stats, People counts and profile tier marks.
   Ring 4 is the untiered ring; slate stays the neutral fallback off the map. */
var RING_C = ['#f5b942', '#7db3e8', '#9a9a9a', '#a794d8'];
var TIER_ORDER = ['vetted', 'associate', 'open'];
var TIER_RANK = { vetted:0, associate:1, open:2 };
var RELC = { mutual:'#c9c9c9', following:'#8a8a8a', follower:'#5f5f5f' };
var RELN = { mutual:'Mutual', following:'Following', follower:'Follower' };
var STAT_C = { needs:'#e0a35a', checked:'#f2f2f2', waiting:'#7d7d7d' };
var MOM_LABELS = { '-':'Cooling', '0':'Steady', '+':'Warming' };
var MOM_ICONS = { '-':'−', '0':'◆', '+':'+' };

var $ = function(s, r){ return (r || document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0;
  var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash32(s){ var h = 2166136261; s = String(s); for(var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function tagList(v){ return String(v || '').split(',').map(function(x){ return x.trim(); }).filter(Boolean); }
function splitTags(v, sep){
  var re = String(sep || ', ').indexOf(';') >= 0 ? /\s*;\s*/ : (String(sep).indexOf('|') >= 0 ? /\s*\|\s*/ : /\s*,\s*/);
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
  /* legacy text: "Major — School (Year); Major2 — School2 (Year2)" */
  return str.split(/\s*;\s*/).map(function(part){
    var m = part.match(/^(.*?)\s*[—-]\s*(.*?)\s*(?:\(([^)]*)\))?$/);
    if(!m) return null;
    var left = m[1].trim(), right = m[2].trim(), year = (m[3] || '').trim();
    var isSchool = function(x){ return /^(SUNY|CUNY)\b|university|college|institute|academy|\bschool\b/i.test(x); };
    var d = {};
    if(isSchool(right)){ d.school = right; if(left) d.major = left; }
    else if(isSchool(left)){ d.school = left; if(right) d.major = right; }
    else { d.school = right || left; if(left && left !== d.school) d.major = left; }
    if(year) d.year = year.replace(/[^0-9]/g, '').slice(-4) || year;
    return d.school ? d : null;
  }).filter(Boolean);
}
function todayStr(){
  var t = new Date();
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
}
function weekKey(){
  var d = new Date(), t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  var day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return t.getUTCFullYear() + '-W' + String(Math.ceil(((t - y0) / 864e5 + 1) / 7)).padStart(2, '0');
}

/* one stroke family so every icon sits together */
var IC = {
  minus:'<path d="M5 12h14"/>', target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  today:'<path d="M3 7.5 12 3l9 4.5-9 4.5z"/><path d="m3 12 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/>',
  people:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  network:'<circle cx="12" cy="12" r="2.4"/><circle cx="12" cy="12" r="9"/><circle cx="19.4" cy="7.6" r="1.4"/>',
  tree:'<circle cx="12" cy="5" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M12 7.5V12M12 12 6 15.5M12 12l6 3.5"/>',
  groups:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  chevl:'<path d="m15 18-6-6 6-6"/>', chevr:'<path d="m9 18 6-6-6-6"/>', chev:'<path d="m6 9 6 6 6-6"/>', chevu:'<path d="m18 15-6-6-6 6"/>',
  phone:'<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  user:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  ext:'<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  check:'<path d="M20 6 9 17l-5-5"/>', x:'<path d="M18 6 6 18M6 6l12 12"/>', plus:'<path d="M12 5v14M5 12h14"/>',
  edit:'<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
  dots:'<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  settings:'<path d="M4 6h9.8M18.2 6H20M4 12h3.8M12.2 12H20M4 18h8.8M17.2 18H20"/><circle cx="16" cy="6" r="2.2"/><circle cx="10" cy="12" r="2.2"/><circle cx="15" cy="18" r="2.2"/>',
  filter:'<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  undo:'<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo:'<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  trash:'<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  merge:'<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M6 8.5v7M8.4 6.8C13 7 15.6 9 15.6 12M8.4 17.2C13 17 15.6 15 15.6 12"/>',
  zin:'<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/>',
  zout:'<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M8 11h6"/>',
  reset:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  ig:'<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/>',
  fb:'<path d="M15.5 3.5h-2.6a4 4 0 0 0-4 4v2.6H6.5v3h2.4v7.4h3v-7.4h2.5l.5-3h-3V7.7a1.2 1.2 0 0 1 1.2-1.2h2.4z"/>',
  sparkle:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  cap:'<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/><path d="M22 10v6"/>',
  pin:'<path d="M12 21s-7-5.4-7-11a7 7 0 0 1 14 0c0 5.6-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  briefcase:'<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  church:'<path d="M12 2v4M8 4h8"/><path d="M5 8 3 9v13h18V9l-2-1"/><path d="M9 22v-6h6v6"/>',
  award:'<circle cx="12" cy="8" r="6"/><path d="M15.5 13 17 22l-5-3-5 3 1.5-9"/>',
  help:'<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  skip:'<path d="m5 4 10 8-10 8zM19 5v14"/>',
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  star:'<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  book:'<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>'
};
function ic(n, s){
  s = s || 16;
  return '<svg class="icsvg" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || '') + '</svg>';
}

/* ============================================================
   2. data access
   ============================================================ */
var D = null, BYN = {}, PK2I = {}, VER = 0;

var ORG_CATS = [
  { k:'churches',     label:'Churches',     ic:'church',    options:['CFC Potsdam','CFC Canton','CFC Madrid','NTC','Calvary Baptist'] },
  { k:'companies',    label:'Companies',    ic:'briefcase', options:['Rochester Regional Health','Clarkson University','Park Bros.'] },
  { k:'universities', label:'Universities', ic:'cap',       options:['Clarkson University','SUNY Potsdam','SUNY Canton','St. Lawrence University'] }
];
var SCHOOLS = {
  'Clarkson University':{ s:'Clarkson' }, 'SUNY Potsdam':{ s:'SUNY Potsdam' },
  'SUNY Canton':{ s:'SUNY Canton' }, 'St. Lawrence University':{ s:'SLU' }
};
var DEGREE_TYPES = ['AA','AAS','AS','BA','BS','BFA','BBA','BTech','MA','MS','MBA','MEd','MPA','PhD','EdD','DPT','OTD','JD','MD','Certificate','Attended (no degree)','Other'];
var SKILL_TAXONOMY = [
  { cat:'Healthcare', skills:['Registered Nurse','CNA','LPN','EMT','Mental Health','Physical Therapist','Occupational Therapist','Home Health Aide','Medical Technician'] },
  { cat:'Public Safety', skills:['Law Enforcement','Corrections','Security','Firefighter','Emergency Dispatcher'] },
  { cat:'Education', skills:['Teacher','Teaching','Professor','Student Worker','Admissions','Tutor','Coach','Librarian','Mathematics'] },
  { cat:'Technology', skills:['IT','Electrical Engineering','Civil Engineering','Mechanical Engineering','Environmental Engineering','Drones'] },
  { cat:'Transportation', skills:['Airline','Airlines','Airplanes','Pilot','Taxi Driver','Truck Driver','Delivery Driver'] },
  { cat:'Food Service', skills:['Cook','Server','Bartender','Barista','Baker'] },
  { cat:'Construction', skills:['Carpentry','Electrician','Plumber','HVAC','Welder','Mechanic'] },
  { cat:'Administration', skills:['Administrator','Administrative Assistant','Office Manager','Receptionist','Human Resources'] },
  { cat:'Business', skills:['Business Owner','Manager','Marketing','Accounting','Banking','Real Estate'] },
  { cat:'Sales', skills:['Retail','Car Sales'] },
  { cat:'Customer Service', skills:['Cashier','Front Desk'] },
  { cat:'Social Services', skills:['Social Work','Counselor','Case Manager','Childcare'] },
  { cat:'Agriculture', skills:['Farmer','Dairy Farmer','Farmhand','Veterinarian'] },
  { cat:'Creative Media', skills:['Photography','Video','Film','Content Creation','Coloring','Graphic Design','Writing'] },
  { cat:'Music', skills:['Singing','Guitar','Piano','Bass','Clarinet','Drums','Violin','Trumpet','Saxophone','Flute','Cello','Banjo','Ukulele','Choir','Songwriting','Music Production','DJ','Worship Leading'] },
  { cat:'Outdoors', skills:['Skiing','Golf','Running','Hiking','Horseback Riding','Ultimate Frisbee','Travel','Fishing','Hunting','Landscaping'] }
];
var SKILL_PARENT = {};
SKILL_TAXONOMY.forEach(function(g){
  SKILL_PARENT[g.cat] = g.cat;
  g.skills.forEach(function(s){ if(!SKILL_PARENT[s]) SKILL_PARENT[s] = g.cat; });
});
var PERSONA = [
  ['openness','Openness','Curious vs. set in their ways'],
  ['conscientiousness','Conscientiousness','Follow-through and organization'],
  ['extraversion','Extraversion','Outgoing vs. reserved'],
  ['agreeableness','Agreeableness','Warm and cooperative vs. harsh'],
  ['neuroticism','Neuroticism','Reactive vs. steady (high is worse)'],
  ['ego','Ego','Self-important (high is worse)']
];
var REL_OPTS = ['family','friend','coworker','acquaintance','other'];
var CTX_OPTS = ['work','school','military','community','church','online','other'];
var CAT_OPTS = [['peer','Peer'],['rom','Romantic'],['fam','Family'],['auth','Authority'],['ment','Mentor'],['conf','Conflict']];
var CP_LABELS = ['Acquaintances','Friends','Close friends','Best friends','Drifted apart','Reconnected','Working together','Dating','Roommates','Teammates','Mentor','Fell out'];
var AKA_KEY = 'sf:indira-quintana-lala';   /* the one person who may carry an AKA (contract, rule 7) */

function dispName(e){
  var pr = e.profile || {};
  var fn = (pr.first_name || '').trim(), ln = (pr.last_name || '').trim();
  if(fn || ln) return (fn + ' ' + ln).trim();
  return e.display || e.name || '';
}
function pkey(e){
  var n = String(e.name || '');
  if(/^(ig|ct|sf|fdb):/.test(n)) return n;
  if(e.src === 'contacts') return 'ct:' + n.toLowerCase();
  if(e.src === 'subject') return 'sf:' + ((e.record && e.record.slug) || n);
  return 'ig:' + n.toLowerCase();
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
function raw(e, k){ var v = (e.profile || {})[k]; return v == null ? '' : String(v); }
function tierOf(e){ return (((e || {}).profile || {}).tier || '').toLowerCase(); }
function tierCol(e){ return (TIERS[tierOf(e)] || {}).c || RING_C[3]; }
function tierName(e){ return (TIERS[tierOf(e)] || {}).n || ''; }
function momVal(e){ var v = gv(e, 'momentum'); return (v === '-' || v === '+' || v === '0') ? v : ''; }
function knownSinceYear(e){
  var v = String(gv(e, 'years_known') || '').trim();
  if(!v) return 0;
  var n = parseInt(v, 10);
  if(n >= 1900 && n <= 2100) return n;
  if(n > 0 && n < 100) return new Date().getFullYear() - n;
  return 0;
}
function liveEntry(e){ var p = e.profile || {}; return p.deleted !== '1' && p.audit !== 'trash' && !(p.merged_into || '').trim(); }
function isChecked(e){ return (e.profile || {}).audit === 'audited'; }
function igURL(h){ return 'https://www.instagram.com/' + encodeURIComponent(String(h).replace(/^@/, '')) + '/'; }
function hasHandle(e){ return e.src !== 'contacts' && e.src !== 'subject' && !/^(ig|ct|sf|fdb):/.test(String(e.name || '')) && !!e.name; }
/* the handle a profile answers to: its own name for IG entries, or the handle a merged-away IG profile handed it (e.ig, set by the build) */
function effHandle(e){ return hasHandle(e) ? String(e.name || '') : String(e.ig || ''); }
function normEntry(r){
  var p = r.profile || {};
  var pe = parseArr(p.events), pf = parseArr(p.files);
  r.events = pe.length ? pe : (Array.isArray(r.events) ? r.events : []);
  r.files = pf.length ? pf : (Array.isArray(r.files) ? r.files : []);
  r._nb0 = (r.neighbors || []).map(function(n){ return { u:n.u, d:n.d, 'new':n['new'] }; });
  r._nbx = [];
}
function personId(e){ var k = pkey(e); return /^ig:/.test(k) ? k.slice(3) : k; }
function diFromId(id){
  id = decodeURIComponent(id || '');
  if(PK2I[id] != null) return PK2I[id];
  if(PK2I['ig:' + id.toLowerCase()] != null) return PK2I['ig:' + id.toLowerCase()];
  return null;
}
/* the people the directory lists: same rule v5 used for its list, minus anything deleted or merged away */
function isListed(e){ return liveEntry(e) && (e.has_graph !== false || (e.events || []).length || (e.files || []).length || !!e.record); }
var PEOPLE_CACHE = { ver:-1, list:[] };
function people(){
  if(PEOPLE_CACHE.ver === VER) return PEOPLE_CACHE.list;
  var out = [];
  D.directory.forEach(function(e, di){ if(isListed(e)) out.push(di); });
  PEOPLE_CACHE = { ver:VER, list:out };
  return out;
}

/* degrees, honors, certifications */
function degreesOf(e){
  var ds = parseArr(gv(e, 'degrees')).filter(function(d){ return d && (d.school || d.degree || d.major || d.year); });
  tagList(gv(e, 'universities')).forEach(function(u){
    if(!ds.some(function(d){ return (d.school || '').toLowerCase() === u.toLowerCase(); }))
      ds.push({ school:u, degree:'', major:'', year:'', note:'' });
  });
  return ds;
}
function schoolShort(s){ return (SCHOOLS[s] && SCHOOLS[s].s) || s || 'School'; }
function sortDegrees(ds){ return ds.slice().sort(function(a, b){ return String(b.year || '').localeCompare(String(a.year || '')); }); }
function yy(y){ y = String(y || ''); return /^\d{4}$/.test(y) ? '’' + y.slice(2) : y; }
function parsePipe(v){ return String(v || '').split(/\s*\|\s*/).map(function(x){ return x.trim(); }).filter(Boolean); }
function achievementsOf(e){
  var fp = String(gv(e, 'public_footprint') || ''), out = [], seen = {}, m, rx;
  function add(label){ label = String(label || '').trim(); if(label && !seen[label.toLowerCase()]){ seen[label.toLowerCase()] = 1; out.push(label); } }
  rx = /(President'?s|Dean'?s) List/gi;
  while((m = rx.exec(fp))){
    var tail = fp.slice(m.index, m.index + 120).split(/[.\n]/)[0];
    var ym = tail.match(/((?:Fall|Spring|Summer|Winter)\s+(?:19|20)\d{2}|(?:19|20)\d{2}(?:\s*(?:[–—-]|to)\s*(?:19|20)?\d{2,4})?(?:\s*,\s*(?:19|20)\d{2})*)/i);
    var yrs = ym ? ym[1].trim().replace(/\s+/g, ' ') : '';
    add(m[1].replace(/'?s$/, "'s") + ' List' + (yrs ? ' ' + yrs : ''));
  }
  ['Director\'?s Award', 'Photo of the Day', 'Rookie of the Year'].forEach(function(pat){
    rx = new RegExp(pat, 'gi'); while((m = rx.exec(fp))) add(m[0]);
  });
  rx = /([A-Z][A-Za-z&.'-]*(?:\s+[A-Z][A-Za-z&.'-]*){0,3} Scholarship)/g;
  while((m = rx.exec(fp))) add(m[1]);
  return out.slice(0, 8);
}
function honorsOf(e){ var a = parsePipe(gv(e, 'achievements')).slice(0, 8); return a.length ? a : achievementsOf(e); }
function certsOf(e){
  var CERT_RE = /licen[cs]e|certif|specialist|board.certified|\bLMSW\b|\bLCSW\b|\bCRD#|series \d+|faaompt|investment adviser/i;
  var out = [], seen = {};
  parsePipe(gv(e, 'achievements')).concat(parsePipe(gv(e, 'highlights'))).forEach(function(a){
    if(!CERT_RE.test(a)) return;
    var label = a.length > 52 ? a.slice(0, 52).trim() + '…' : a;
    if(seen[label]) return; seen[label] = 1; out.push(label);
  });
  return out;
}

/* footprint: prose paragraphs, each optionally followed by "Source(s): url; url" */
function parseFootprint(text){
  var t = String(text || '').trim();
  if(!t) return { blocks:[], sources:[], sourced:false, inferred:false };
  var blocks = [], sources = [], cur = [];
  t.split(/\n/).forEach(function(line){
    var m = line.match(/^\s*Sources?:\s*(.*)$/i);
    if(m){
      var urls = (m[1] || '').split(/;\s*|\s+(?=https?:)/).map(function(u){ return u.trim(); }).filter(Boolean);
      if(cur.length){ blocks.push({ text:cur.join(' '), urls:urls }); cur = []; }
      else if(blocks.length) blocks[blocks.length - 1].urls = blocks[blocks.length - 1].urls.concat(urls);
      urls.forEach(function(u){ if(sources.indexOf(u) < 0) sources.push(u); });
    } else if(!line.trim()){
      if(cur.length){ blocks.push({ text:cur.join(' '), urls:[] }); cur = []; }
    } else cur.push(line.trim());
  });
  if(cur.length) blocks.push({ text:cur.join(' '), urls:[] });
  var inferred = blocks.length > 0 && blocks.every(function(b){ return !b.urls.length && /^place association/i.test(b.text); });
  return { blocks:blocks, sources:sources, sourced:sources.some(function(u){ return /^https?:/i.test(u); }), inferred:inferred };
}
function hostOf(u){ return String(u).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]; }
function footprintOf(e){ return parseFootprint(gv(e, 'public_footprint') || e.public_footprint || ''); }

/* timeline + phases */
function evDate(d){
  var m = String(d || '').match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/);
  if(!m) return String(d || '');
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var mi = parseInt(m[2] || '1', 10) - 1;
  if(m[3]) return MON[mi] + ' ' + parseInt(m[3], 10) + ', ' + m[1];
  if(m[2]) return MON[mi] + ' ' + m[1];
  return m[1];
}
function sortedEvents(e){
  return (e.events || []).map(function(ev, i){ return { ev:ev, i:i }; }).sort(function(a, b){
    var x = String(a.ev.date || ''), y = String(b.ev.date || '');
    return x < y ? 1 : (x > y ? -1 : 0);
  });
}
function connPhases(e){
  var rawv = gv(e, 'conn_phases');
  if(!rawv) return [];
  try{ var a = JSON.parse(rawv); return Array.isArray(a) ? a.filter(function(p){ return p && (p.f || p.l); }) : []; }catch(x){ return []; }
}
function ymLabel(s){
  var m = String(s || '').match(/(\d{4})-(\d{1,2})/);
  if(!m) return '';
  var M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return M[parseInt(m[2], 10) - 1] + ' ' + m[1];
}

/* associates */
function hiddenAssoc(e){ var h = {}; tagList(raw(e, 'close_hide')).forEach(function(x){ h[x.toLowerCase()] = 1; }); return h; }
function knownAssociates(e){
  var seen = {}, out = [], hide = hiddenAssoc(e);
  (e.neighbors || []).forEach(function(nb){
    var k = (nb.u || '').toLowerCase();
    if(k && !seen[k] && !hide[k]){ seen[k] = 1; out.push({ u:nb.u, d:nb.d, 'new':nb['new'] }); }
  });
  return out;
}
/* rebuild the displayed neighbor list from the baked base + local extras + close_add - close_hide */
function rebuildNeighbors(e){
  var hide = hiddenAssoc(e), seen = {}, out = [];
  function add(u, d, nw){
    var k = String(u || '').toLowerCase();
    if(!k || seen[k] || hide[k]) return;
    seen[k] = 1; out.push({ u:u, d:d, 'new':nw });
  }
  (e._nb0 || []).forEach(function(n){ add(n.u, n.d, n['new']); });
  (e._nbx || []).forEach(function(n){ add(n.u, n.d); });
  tagList(raw(e, 'close_add')).forEach(function(a){
    var di = BYN[a.toLowerCase()];
    add(a, di != null ? dispName(D.directory[di]) : a);
  });
  e.neighbors = out;
}

/* ============================================================
   3. outbox + undo
   ============================================================ */
var OUT = { items:[], busy:false, timer:null, retry:0, err:'', auth:false };
var OUT_KEY = 'ncc_outbox_v2';
var UNDO = { stack:[], redo:[], collect:null, suspend:false };

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
  if(ch.close_add !== undefined || ch.close_hide !== undefined) rebuildNeighbors(e);
  e._mt = null; VER++;
}
/* every write in the app goes through here */
function queuePatch(idx, patch){
  var e = D.directory[idx]; if(!e) return;
  patch = normPatch(patch);
  if(UNDO.collect && !UNDO.suspend){
    Object.keys(patch).forEach(function(k){
      var hit = null;
      UNDO.collect.items.forEach(function(it){ if(it.di === idx && it.k === k) hit = it; });
      if(hit) hit.next = patch[k];
      else UNDO.collect.items.push({ di:idx, k:k, prev:raw(e, k), next:patch[k] });
    });
  }
  applyProfileEdit(e, patch);
  var key = pkey(e), it = null;
  for(var i = 0; i < OUT.items.length; i++) if(OUT.items[i].id === key){ it = OUT.items[i]; break; }
  if(!it){ it = { id:key, patch:{}, sending:null }; OUT.items.push(it); }
  Object.keys(patch).forEach(function(k){ it.patch[k] = patch[k]; });
  outSave(); paintSync();
  clearTimeout(OUT.timer); OUT.timer = setTimeout(outKick, 700);
  if(window.__nccChanged) window.__nccChanged(idx);
}
/* group several patches into one undoable step */
function txn(label, fn){
  var prev = UNDO.collect, entry = { label:label, items:[] };
  UNDO.collect = entry;
  try{ fn(); } finally { UNDO.collect = prev; }
  if(entry.items.length && !UNDO.suspend){
    UNDO.stack.push(entry); if(UNDO.stack.length > 100) UNDO.stack.shift();
    UNDO.redo = [];
    paintUndo();
  }
  return entry;
}
function applyEntry(entry, useNext){
  UNDO.suspend = true;
  try{
    var byDi = {};
    entry.items.forEach(function(it){ (byDi[it.di] = byDi[it.di] || {})[it.k] = useNext ? it.next : it.prev; });
    Object.keys(byDi).forEach(function(di){ queuePatch(+di, byDi[di]); });
  } finally { UNDO.suspend = false; }
}
function doUndo(){
  var en = UNDO.stack.pop();
  if(!en){ toast('Nothing to undo.'); return; }
  applyEntry(en, false); UNDO.redo.push(en); paintUndo();
  toast('Undid: ' + en.label.toLowerCase() + '.');
}
function doRedo(){
  var en = UNDO.redo.pop();
  if(!en){ toast('Nothing to redo.'); return; }
  applyEntry(en, true); UNDO.stack.push(en); paintUndo();
  toast('Redid: ' + en.label.toLowerCase() + '.');
}
/* a text field edit: writes through the outbox but is not an undo step (the field has its own undo) */
function setField(di, k, v){
  var e = D.directory[di]; if(!e) return;
  v = String(v == null ? '' : v);
  if(gv(e, k) === v) return;
  var p = {}; p[k] = v;
  UNDO.suspend = true; try{ queuePatch(di, p); } finally { UNDO.suspend = false; }
}
function outKick(){
  clearTimeout(OUT.timer);
  if(OUT.busy || OUT.auth) return;
  var batch = [];
  OUT.items.forEach(function(it){
    if(batch.length < 25 && Object.keys(it.patch).length){ it.sending = it.patch; it.patch = {}; batch.push(it); }
  });
  if(!batch.length){ OUT.items = OUT.items.filter(function(it){ return it.sending; }); outSave(); paintSync(); return; }
  if(!WEBAPP_URL){ batch.forEach(function(it){ it.patch = it.sending; it.sending = null; }); return; }
  OUT.busy = true; outSave(); paintSync();
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
    outSave(); paintSync();
    if(warn.length) toast('Some fields are not columns in the sheet and were skipped: ' + warn.join('; '));
    else if(made.length) toast('No sheet row matched ' + made[0] + '. A new row was created.');
    if(OUT.items.length) outKick();
  }).catch(function(err){
    OUT.busy = false;
    batch.forEach(function(it){ it.patch = Object.assign({}, it.sending, it.patch); it.sending = null; });
    var msg = String(err && err.message || err);
    OUT.retry++; OUT.err = msg; outSave(); paintSync();
    if(/unauthorized/i.test(msg)){ OUT.auth = true; askEditKey(); return; }
    OUT.timer = setTimeout(outKick, Math.min(30000, 2000 * Math.pow(2, OUT.retry - 1)));
  });
}
addEventListener('online', function(){ OUT.retry = 0; outKick(); });
addEventListener('pagehide', function(){
  if(!outPending() || !navigator.sendBeacon || !WEBAPP_URL) return;
  var items = OUT.items.map(function(it){ return { id:it.id, patch:Object.assign({}, it.sending || {}, it.patch || {}) }; })
    .filter(function(it){ return Object.keys(it.patch).length; });
  if(!items.length) return;
  try{ navigator.sendBeacon(WEBAPP_URL, new Blob([JSON.stringify({ password:getPw(), kind:'batch', id:'batch', patch:{ items:items } })], { type:'text/plain;charset=utf-8' })); }catch(x){}
});
function applyOutbox(){
  OUT.items.forEach(function(it){
    var di = PK2I[it.id]; if(di === undefined) return;
    applyProfileEdit(D.directory[di], Object.assign({}, it.sending || {}, it.patch));
  });
}
/* rows edited in the Sheet since the snapshot overlay on top of it, so edits show before the next rebuild */
var lastFeed = 0;
function fetchChanges(){
  if(!WEBAPP_URL || !D) return;
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
        var ch = {};
        Object.keys(row.profile || {}).forEach(function(k){ ch[k] = row.profile[k]; });
        applyProfileEdit(D.directory[di], ch); n++;
      });
      if(n && window.__nccChanged) window.__nccChanged(-1);
    }).catch(function(){});
}
document.addEventListener('visibilitychange', function(){
  if(!document.hidden && D && Date.now() - lastFeed > 60000) fetchChanges();
});
function postKind(kind, id, patch, onOk, onErr){
  fetch(WEBAPP_URL, {
    method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' },
    body:JSON.stringify({ password:getPw(), kind:kind, id:id, patch:patch })
  }).then(function(r){ return r.json(); }).then(function(res){
    if(res && res.ok) onOk(res); else onErr('Failed: ' + ((res && res.error) || 'unknown'));
  }).catch(function(){ onErr('Network error.'); });
}

/* ============================================================
   4. waivers ("insufficient data") — section-level, same JSON shape as v5
   ============================================================ */
function wvSecs(e){
  try{ var v = JSON.parse(gv(e, 'waivers') || '{}'); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
  catch(x){ return {}; }
}
function secWaived(e, sid){ return !!wvSecs(e)[sid]; }
function setWaivers(di, sids, on){
  var e = D.directory[di]; if(!e) return;
  var w = wvSecs(e);
  sids.forEach(function(sid){ if(on) w[sid] = 1; else delete w[sid]; });
  queuePatch(di, { waivers: JSON.stringify(w) });
}

/* ============================================================
   5. stamps + shared navigation helper. New-connection marks feed
      the Network map; landOn is the one navigate-and-highlight
      used by controls app-wide. (The audit-era reasons engine that
      lived here was removed in the 2026-10-14 wind-down.)
   ============================================================ */
var FAM_INV_REL = { parent:'child', child:'parent', spouse:'spouse', sibling:'sibling' };

/* new-connection stamps: people whose associate edge is <= 7 days old (set by the build) */
var NEWGAIN = {};
function computeNewGain(){
  NEWGAIN = {};
  D.directory.forEach(function(r, di){
    (r._nb0 || []).forEach(function(nb){
      if(!nb['new']) return;
      NEWGAIN[di] = 1;
      var tj = BYN[(nb.u || '').toLowerCase()];
      if(tj != null) NEWGAIN[tj] = 1;
    });
  });
}

/* navigate-and-highlight: scroll the named target into view inside the app
   shell and mark it once (a single 1.3s glow, never a loop). Used by every
   control that points somewhere, so landing behavior is identical app-wide. */
function landOn(sel, opts){
  opts = opts || {};
  var tries = 0;
  (function attempt(){
    var el = typeof sel === 'string' ? $(sel) : sel;
    if(!el){ if(++tries < 12) setTimeout(attempt, 60); return; }
    var rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior:rm ? 'auto' : 'smooth', block:el.offsetHeight > innerHeight * 0.92 ? 'start' : 'center' });
    el.classList.remove('landed'); void el.offsetWidth; el.classList.add('landed');
    setTimeout(function(){ el.classList.remove('landed'); }, 1400);
    if(opts.focus){
      var f = el.querySelector('input:not([type=hidden]), textarea, select');
      if(f) setTimeout(function(){ f.focus({ preventScroll:true }); }, rm ? 0 : 350);
    }
  })();
}

/* ============================================================
   6. family model (bloodline trees) + writes
   ============================================================ */
function famLinks(e){
  try{ var v = JSON.parse(gv(e, 'family') || '[]'); return Array.isArray(v) ? v : []; }
  catch(x){ return []; }
}
var FAM_RELS = ['parent', 'spouse', 'child', 'sibling'];
function famRelDefault(){ var v = store('ncc_famrel'); return FAM_RELS.indexOf(v) >= 0 ? v : 'parent'; }
function famRelSave(v){ if(FAM_RELS.indexOf(v) >= 0) store('ncc_famrel', v); }
var FAM_INVERSE = { parent:'children', spouse:'spouses', child:'parents', sibling:'siblings' };
var FAM_GEN_COLORS = ['#f2f2f2', '#c9c9c9', '#a0a0a0', '#787878', '#5c5c5c'];
var FAM_SPOUSE_COLOR = '#a794d8';
var FAM_SUF = { 'sr.':1, 'jr.':1, 'ii':1, 'iii':1, 'iv':1 };
function famInitials(label){
  var w = String(label || '').trim().split(/\s+/).filter(Boolean);
  if(!w.length) return '?';
  return (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
}
function famDisplay(){
  var disp = {};
  function slot(di){ return disp[di] || (disp[di] = { parents:[], spouses:[], children:[], siblings:[] }); }
  function push(di, relKey, otherDi){
    if(di == null || otherDi == null || di === otherDi) return;
    var arr = slot(di)[relKey];
    if(!arr.some(function(x){ return x.di === otherDi; })) arr.push({ di:otherDi });
  }
  D.directory.forEach(function(e, di){
    if(!liveEntry(e)) return;
    famLinks(e).forEach(function(l){
      var tdi = BYN[String(l[1] || '').toLowerCase()];
      if(tdi == null) return;
      var mine = { parent:'parents', spouse:'spouses', child:'children', sibling:'siblings' }[l[0]];
      if(!mine) return;
      push(di, mine, tdi);
      push(tdi, FAM_INVERSE[l[0]], di);
    });
  });
  Object.keys(disp).forEach(function(diK){
    var di = +diK;
    disp[di].parents.forEach(function(p){
      D.directory.forEach(function(r, ri){
        if(ri === di || !disp[ri]) return;
        if(disp[ri].parents.some(function(pp){ return pp.di === p.di; })) push(di, 'siblings', ri);
      });
    });
  });
  return disp;
}
function famSurname(di){
  var parts = dispName(D.directory[di]).split(/\s+/).filter(function(x){ return x; });
  while(parts.length > 1 && FAM_SUF[parts[parts.length - 1].toLowerCase()]) parts.pop();
  return parts.length ? parts[parts.length - 1] : '';
}
/* A family tree is a BLOODLINE, never a connected component: marriage must not chain one bloodline into another. */
function famTrees(disp){
  function rel(di, rk){ return ((disp[di] && disp[di][rk]) || []).map(function(x){ return x.di; }); }
  var roots = Object.keys(disp).map(Number).filter(function(di){ return !rel(di, 'parents').length; }).sort(function(a, b){ return a - b; });
  var upar = {}; roots.forEach(function(di){ upar[di] = di; });
  function find(x){ while(upar[x] !== x){ upar[x] = upar[upar[x]]; x = upar[x]; } return x; }
  roots.forEach(function(di){
    rel(di, 'siblings').forEach(function(s){
      if(upar[s] == null) return;
      var a = find(di), b = find(s);
      if(a !== b) upar[a] = b;
    });
  });
  var groups = {}, founded = [], claimed = {}, foundedRoots = {};
  roots.forEach(function(di){ var r = find(di); (groups[r] = groups[r] || []).push(di); });
  Object.keys(groups).forEach(function(k){
    if(groups[k].length >= 2){
      var g = groups[k].slice().sort(function(a, b){ return a - b; });
      founded.push(g); g.forEach(function(di){ claimed[di] = 1; foundedRoots[di] = 1; });
    }
  });
  var singles = roots.filter(function(di){ return !claimed[di]; }), paired = {};
  singles.forEach(function(di){
    if(paired[di]) return;
    var sps = rel(di, 'spouses').filter(function(s){ return upar[s] != null && !claimed[s] && !paired[s]; });
    if(sps.length){
      founded.push([di, sps[0]].sort(function(a, b){ return a - b; }));
      paired[di] = paired[sps[0]] = 1; foundedRoots[di] = foundedRoots[sps[0]] = 1;
    }
  });
  singles.forEach(function(di){
    if(paired[di]) return;
    if(!rel(di, 'children').length) return;
    if(rel(di, 'spouses').some(function(s){ return foundedRoots[s]; })) return;
    founded.push([di]); foundedRoots[di] = 1;
  });
  var trees = founded.map(function(g, gi){
    var blood = {};
    g.forEach(function(di){ blood[di] = 1; });
    var grew = true;
    while(grew){
      grew = false;
      Object.keys(disp).map(Number).forEach(function(di){
        if(blood[di]) return;
        if(rel(di, 'parents').some(function(p){ return blood[p]; })){ blood[di] = 1; grew = true; return; }
        if(!rel(di, 'parents').length && rel(di, 'siblings').some(function(s){ return blood[s]; })){ blood[di] = 1; grew = true; }
      });
    }
    var members = {};
    Object.keys(blood).forEach(function(k){ members[k] = 1; rel(+k, 'spouses').forEach(function(s){ members[s] = 1; }); });
    return { id:'ft' + gi, roots:g, blood:blood, members:Object.keys(members).map(Number).sort(function(a, b){ return a - b; }) };
  });
  var claims = {};
  trees.forEach(function(t){
    var cnt = {};
    t.roots.forEach(function(di){ var s = famSurname(di); if(s) cnt[s] = (cnt[s] || 0) + 1; });
    t.cnt = cnt;
    var ks = Object.keys(cnt);
    if(ks.length === 1 && cnt[ks[0]] === t.roots.length) claims[ks[0]] = (claims[ks[0]] || 0) + 1;
  });
  trees.forEach(function(t){
    var cands = Object.keys(t.cnt).sort(function(a, b){ return t.cnt[b] - t.cnt[a] || (a < b ? -1 : 1); });
    var pick = null;
    for(var i = 0; i < cands.length; i++){ if(!claims[cands[i]] || cands.length === 1){ pick = cands[i]; break; } }
    var base = pick || cands[0];
    t.title = base ? base + ' family' : 'Family';
  });
  var homes = {};
  trees.forEach(function(t){
    Object.keys(t.blood).forEach(function(k){ if(!homes[k] || t.members.length > homes[k].members.length) homes[k] = t; });
  });
  trees.forEach(function(t){
    t.spousesFrom = [];
    var seenH = {};
    t.members.forEach(function(di){
      if(t.blood[di]) return;
      var hm = homes[di];
      if(hm && hm !== t && !seenH[hm.id]){ seenH[hm.id] = 1; t.spousesFrom.push(hm); }
    });
  });
  trees.sort(function(a, b){ return b.members.length - a.members.length || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0); });
  /* ids follow the sorted order so deep links stay stable within a bake */
  trees.forEach(function(t, i){ t.id = 'ft' + i; });
  return { trees:trees, homes:homes };
}
var DFT = { NW:118, NH:92, CY:28, CR:26, CGAP:38, UGAP:34, ROW:150, DROP:26 };
function famTreeModel(disp, tree, homes){
  var comp = tree.members, inComp = {};
  comp.forEach(function(di){ inComp[di] = 1; });
  function rel(di, rk){ return ((disp[di] && disp[di][rk]) || []).map(function(x){ return x.di; }).filter(function(x){ return inComp[x]; }); }
  var gen = {}, busy = {};
  function genOf(di){
    if(gen[di] != null) return gen[di];
    if(busy[di]) return 0;
    busy[di] = 1;
    var ps = rel(di, 'parents');
    gen[di] = ps.length ? 1 + Math.max.apply(null, ps.map(genOf)) : 0;
    busy[di] = 0;
    return gen[di];
  }
  comp.forEach(genOf);
  comp.forEach(function(di){
    if(gen[di] !== 0 || !tree.blood[di]) return;
    var best = 0;
    rel(di, 'siblings').forEach(function(s){ if(tree.blood[s] && gen[s] > best) best = gen[s]; });
    if(best) gen[di] = best;
  });
  function marriedIn(di){ return !tree.blood[di]; }
  var pairMap = {}, units = [];
  comp.forEach(function(di){
    if(marriedIn(di)) return;
    var u = { head:di, partner:null, childUnits:[] };
    units.push(u); pairMap[di] = u;
  });
  units.forEach(function(u){
    var sps = rel(u.head, 'spouses');
    for(var i = 0; i < sps.length; i++){
      var s = sps[i];
      if(s === u.head || pairMap[s] === u) continue;
      if(pairMap[s] && pairMap[s].partner != null) continue;
      u.partner = s; pairMap[s] = u; break;
    }
  });
  comp.forEach(function(di){
    if(!pairMap[di]){
      var u = { head:di, partner:null, childUnits:[] };
      units.push(u); pairMap[di] = u;
    }
  });
  var active = units.filter(function(u){ return pairMap[u.head] === u; });
  function parentUnitOf(child){
    var ps = rel(child, 'parents'), cand = [];
    ps.forEach(function(p){ var u = pairMap[p]; if(u && cand.indexOf(u) < 0) cand.push(u); });
    for(var i = 0; i < cand.length; i++) if(ps.every(function(p){ return pairMap[p] === cand[i]; })) return cand[i];
    return cand[0] || null;
  }
  comp.forEach(function(di){
    var pu = parentUnitOf(di);
    if(!pu || pu === pairMap[di]) return;
    if(!pu.childUnits.some(function(c){ return c.unit === pairMap[di]; })) pu.childUnits.push({ di:di, unit:pairMap[di] });
  });
  active.forEach(function(u){ u.childUnits.sort(function(a, b){ return a.di - b.di; }); });
  var childUnitSet = [];
  active.forEach(function(u){ u.childUnits.forEach(function(c){ if(childUnitSet.indexOf(c.unit) < 0) childUnitSet.push(c.unit); }); });
  var roots = active.filter(function(u){ return childUnitSet.indexOf(u) < 0; });
  function layoutUnit(u){
    var memberW = u.partner != null ? 2 * DFT.NW + DFT.CGAP : DFT.NW;
    var blocks = u.childUnits.map(function(c){ return { di:c.di, b:layoutUnit(c.unit) }; });
    var kidsW = blocks.length ? blocks.reduce(function(n, x){ return n + x.b.w; }, 0) + DFT.UGAP * (blocks.length - 1) : 0;
    var w = Math.max(memberW, kidsW);
    var nodes = [], lines = [], xOf = {};
    var mx = (w - memberW) / 2, gy = gen[u.head] * DFT.ROW;
    nodes.push({ di:u.head, x:mx, y:gy });
    xOf[u.head] = mx + DFT.NW / 2;
    if(u.partner != null){
      nodes.push({ di:u.partner, x:mx + DFT.NW + DFT.CGAP, y:gy });
      xOf[u.partner] = mx + DFT.NW + DFT.CGAP + DFT.NW / 2;
      lines.push({ x1:mx + DFT.NW / 2 + DFT.CR, y1:gy + DFT.CY, x2:mx + DFT.NW + DFT.CGAP + DFT.NW / 2 - DFT.CR, y2:gy + DFT.CY });
    }
    var headCx = mx + memberW / 2;
    if(blocks.length){
      var kx = (w - kidsW) / 2, barY = gy + DFT.NH + DFT.DROP, centers = [];
      blocks.forEach(function(x){
        x.b.nodes.forEach(function(n){ nodes.push({ di:n.di, x:n.x + kx, y:n.y }); });
        x.b.lines.forEach(function(l){ lines.push({ x1:l.x1 + kx, y1:l.y1, x2:l.x2 + kx, y2:l.y2 }); });
        Object.keys(x.b.xOf).forEach(function(k){ xOf[k] = x.b.xOf[k] + kx; });
        centers.push({ cx:x.b.xOf[x.di] + kx, top:gen[x.di] * DFT.ROW });
        kx += x.b.w + DFT.UGAP;
      });
      lines.push({ x1:headCx, y1:gy + DFT.CY, x2:headCx, y2:barY });
      lines.push({ x1:centers[0].cx, y1:barY, x2:centers[centers.length - 1].cx, y2:barY });
      centers.forEach(function(c){ lines.push({ x1:c.cx, y1:barY, x2:c.cx, y2:c.top }); });
    }
    return { w:w, nodes:nodes, lines:lines, xOf:xOf, headCx:headCx };
  }
  var sibGroups = [];
  roots.forEach(function(u){
    var g = null;
    sibGroups.forEach(function(gr){ if(gr.some(function(v){ return rel(u.head, 'siblings').indexOf(v.head) >= 0; })) g = gr; });
    if(g) g.push(u); else sibGroups.push([u]);
  });
  var blocks = roots.map(function(u){ return { u:u, b:layoutUnit(u) }; });
  var totalW = blocks.reduce(function(n, x){ return n + x.b.w; }, 0) + DFT.UGAP * Math.max(0, blocks.length - 1);
  var padTop = sibGroups.some(function(g){ return g.length > 1; }) ? 36 : 10;
  var nodes = [], lines = [], rootCenter = {}, ox = 0;
  blocks.forEach(function(x){
    x.b.nodes.forEach(function(n){ nodes.push({ di:n.di, x:n.x + ox, y:n.y + padTop }); });
    x.b.lines.forEach(function(l){ lines.push({ x1:l.x1 + ox, y1:l.y1 + padTop, x2:l.x2 + ox, y2:l.y2 + padTop }); });
    rootCenter[x.u.head] = x.b.xOf[x.u.head] + ox;
    ox += x.b.w + DFT.UGAP;
  });
  sibGroups.forEach(function(g){
    if(g.length < 2) return;
    var gy = Math.min.apply(null, g.map(function(u){ return gen[u.head]; }));
    var by = padTop + gy * DFT.ROW - 16;
    var cs = g.map(function(u){ return rootCenter[u.head]; });
    lines.push({ x1:Math.min.apply(null, cs), y1:by, x2:Math.max.apply(null, cs), y2:by });
    g.forEach(function(u){ lines.push({ x1:rootCenter[u.head], y1:by, x2:rootCenter[u.head], y2:padTop + gen[u.head] * DFT.ROW }); });
  });
  var maxY = 0, maxGen = 0, hasSpouse = false;
  nodes.forEach(function(n){ if(n.y > maxY) maxY = n.y; });
  comp.forEach(function(di){ if(gen[di] > maxGen) maxGen = gen[di]; if(marriedIn(di)) hasSpouse = true; });
  return { nodes:nodes, lines:lines, gen:gen, w:totalW, h:maxY + DFT.NH + 16, maxGen:maxGen, hasSpouse:hasSpouse,
    styleOf:function(di){
      if(marriedIn(di)) return { c:FAM_SPOUSE_COLOR, cap:'Married in' };
      var g = gen[di];
      return { c:FAM_GEN_COLORS[Math.min(g, FAM_GEN_COLORS.length - 1)], cap:'Gen ' + (g + 1) };
    } };
}
function famSpaceLayout(disp, ft){
  var trees = ft.trees, homes = ft.homes;
  var models = trees.map(function(t){ return famTreeModel(disp, t, homes); });
  var LABEL = 52, GX = 320, GY = 280, PAD = 150, totalArea = 0;
  models.forEach(function(m){ totalArea += (m.w + GX) * (m.h + LABEL + GY); });
  var target = Math.max(2000, Math.min(5200, Math.ceil(Math.sqrt(totalArea) * 1.55)));
  var clusters = [], cx = PAD, cy = PAD, rowH = 0;
  trees.forEach(function(t, i){
    var m = models[i], chh = m.h + LABEL;
    if(cx > PAD && cx + m.w > PAD + target){ cx = PAD; cy += rowH + GY; rowH = 0; }
    clusters.push({ tree:t, model:m, ox:cx, oy:cy + LABEL, w:m.w, h:m.h, labelY:cy });
    cx += m.w + GX; if(chh > rowH) rowH = chh;
  });
  var W = 0, H = 0;
  clusters.forEach(function(c){ if(c.ox + c.w > W) W = c.ox + c.w; if(c.oy + c.h > H) H = c.oy + c.h; });
  W += PAD; H += PAD;
  var centers = {};
  clusters.forEach(function(c){
    c.model.nodes.forEach(function(n){ centers[c.tree.id + '|' + n.di] = { x:c.ox + n.x + DFT.NW / 2, y:c.oy + n.y + DFT.CY }; });
  });
  var links = [], seenLink = {};
  clusters.forEach(function(c){
    c.model.nodes.forEach(function(n){
      if(c.tree.blood[n.di]) return;
      var home = homes[n.di];
      if(!home || home === c.tree) return;
      var a = centers[c.tree.id + '|' + n.di], b = centers[home.id + '|' + n.di];
      if(!a || !b || seenLink[n.di + '|' + c.tree.id]) return;
      seenLink[n.di + '|' + c.tree.id] = 1;
      links.push({ di:n.di, x1:a.x, y1:a.y, x2:b.x, y2:b.y, from:c.tree.id, to:home.id });
    });
  });
  return { trees:trees, homes:homes, clusters:clusters, W:W, H:H, links:links, models:models };
}

/* Family links are two-way IN STORAGE: a link written on one profile writes its inverse on the other. */
function famDualWrite(di, rel, tdi, adding){
  var e = D.directory[di], t = D.directory[tdi];
  if(!e || !t || di === tdi) return;
  var inv = FAM_INV_REL[rel]; if(!inv) return;
  var back = (e.name || '').toLowerCase();
  var tl = famLinks(t), before = tl.length;
  if(adding){
    if(!tl.some(function(l){ return l[0] === inv && String(l[1] || '').toLowerCase() === back; })) tl.push([inv, e.name || '']);
  } else {
    tl = tl.filter(function(l){ return !(l[0] === inv && String(l[1] || '').toLowerCase() === back); });
  }
  if(tl.length !== before) queuePatch(tdi, { family: JSON.stringify(tl) });
}
/* all family are known associates: mirror an add locally (respecting close_hide on either side) */
function famAssocSync(di, tdi){
  var e = D.directory[di], t = D.directory[tdi];
  if(!e || !t || di === tdi) return;
  [[e, t], [t, e]].forEach(function(pr){
    var o = pr[0], x = pr[1], xk = (x.name || '').toLowerCase();
    if(!xk) return;
    if(hiddenAssoc(o)[xk] || hiddenAssoc(x)[(o.name || '').toLowerCase()]) return;
    if(!(o.neighbors || []).some(function(n){ return (n.u || '').toLowerCase() === xk; })){
      (o._nbx = o._nbx || []).push({ u:x.name || '', d:dispName(x) });
      rebuildNeighbors(o);
    }
  });
}
function famSiblingsOf(di){
  var disp = famDisplay(), out = {}, s = disp[di];
  if(!s) return [];
  s.siblings.forEach(function(x){ out[x.di] = 1; });
  s.parents.forEach(function(p){
    Object.keys(disp).forEach(function(k){
      if(+k !== di && disp[k].parents.some(function(pp){ return pp.di === p.di; })) out[k] = 1;
    });
  });
  delete out[di];
  return Object.keys(out).map(Number);
}
function famAddLinkRaw(ownerDi, r, targetDi){
  var o = D.directory[ownerDi], tg = D.directory[targetDi];
  if(!o || !tg || ownerDi === targetDi) return false;
  var kl = (tg.name || '').toLowerCase(); if(!kl) return false;
  var ls = famLinks(o);
  if(ls.some(function(l){ return l[0] === r && String(l[1] || '').toLowerCase() === kl; })) return false;
  ls.push([r, tg.name || '']);
  queuePatch(ownerDi, { family: JSON.stringify(ls) });
  famDualWrite(ownerDi, r, targetDi, true);
  famAssocSync(ownerDi, targetDi);
  return true;
}
/* adding a parent gives the same parent to every sibling (adds only, idempotent) */
function famAddParentToSiblings(di, tdi){
  var n = 0;
  famSiblingsOf(di).forEach(function(sib){ if(sib !== tdi && famAddLinkRaw(sib, 'parent', tdi)) n++; });
  return n;
}
/* traditional setup (one spouse, no half or step): child -> spouse becomes the other parent, etc. */
function famSpouseComplements(di, rel, tdi){
  var e = D.directory[di], t = D.directory[tdi];
  if(!e || !t) return 0;
  function resolve(list, r){
    return list.filter(function(l){ return l[0] === r; }).map(function(l){ return BYN[String(l[1] || '').toLowerCase()]; }).filter(function(v){ return v != null; });
  }
  var n = 0;
  if(rel === 'child'){
    resolve(famLinks(e), 'spouse').forEach(function(sdi){ if(sdi !== tdi && famAddLinkRaw(tdi, 'parent', sdi)) n++; });
  } else if(rel === 'parent'){
    resolve(famLinks(t), 'spouse').forEach(function(sdi){
      if(sdi !== di && famAddLinkRaw(di, 'parent', sdi)){ n++; n += famAddParentToSiblings(di, sdi); }
    });
  } else if(rel === 'spouse'){
    resolve(famLinks(e), 'child').forEach(function(cdi){ if(cdi !== tdi && famAddLinkRaw(cdi, 'parent', tdi)) n++; });
  }
  return n;
}
function addFamily(di, rel, tdi){
  var e = D.directory[di], t = D.directory[tdi], msg = '';
  if(!e || !t) return '';
  famRelSave(rel);
  txn('Add ' + rel + ' link', function(){
    famAddLinkRaw(di, rel, tdi);
    var sibN = rel === 'parent' ? famAddParentToSiblings(di, tdi) : 0;
    var infN = famSpouseComplements(di, rel, tdi);
    msg = dispName(t) + ' added as ' + rel + ' of ' + dispName(e) +
      (sibN ? ', also to ' + sibN + ' sibling' + (sibN === 1 ? '' : 's') : '') +
      (infN ? (sibN ? ', plus ' : ', plus ') + infN + ' inferred link' + (infN === 1 ? '' : 's') : '') + '.';
  });
  return msg;
}
function removeFamily(di, i){
  var e = D.directory[di]; if(!e) return;
  var links = famLinks(e), gone = links[i]; if(!gone) return;
  txn('Remove family link', function(){
    links.splice(i, 1);
    queuePatch(di, { family: JSON.stringify(links) });
    var tdi = BYN[String(gone[1] || '').toLowerCase()];
    if(tdi != null) famDualWrite(di, gone[0], tdi, false);
  });
}

/* known associates are two-way: a write on one side writes the reciprocal on the other */
function assocSidePatch(ownerIdx, otherName, add){
  var o = D.directory[ownerIdx]; if(!o) return;
  var key = otherName || '', kl = key.toLowerCase(); if(!kl) return;
  var adds = tagList(raw(o, 'close_add')), hides = tagList(raw(o, 'close_hide'));
  var low = function(x){ return x.toLowerCase(); };
  if(add){
    if(adds.map(low).indexOf(kl) < 0) adds.push(key);
    hides = hides.filter(function(x){ return x.toLowerCase() !== kl; });
  } else {
    if(adds.map(low).indexOf(kl) >= 0) adds = adds.filter(function(x){ return x.toLowerCase() !== kl; });
    else if(hides.map(low).indexOf(kl) < 0) hides.push(key);
    /* a removed link also leaves any local family-sync extras */
    o._nbx = (o._nbx || []).filter(function(n){ return String(n.u || '').toLowerCase() !== kl; });
  }
  queuePatch(ownerIdx, { close_add:adds.join(', '), close_hide:hides.join(', ') });
}
function addAssociate(di, tdi){
  var e = D.directory[di], t = D.directory[tdi]; if(!e || !t) return;
  txn('Add known associate', function(){
    assocSidePatch(di, t.name || '', true);
    if(tdi !== di) assocSidePatch(tdi, e.name || '', true);
  });
}
function removeAssociate(di, u){
  var e = D.directory[di]; if(!e || !u) return;
  txn('Remove known associate', function(){
    assocSidePatch(di, u, false);
    var tdi = BYN[String(u).toLowerCase()];
    if(tdi !== undefined && tdi !== di) assocSidePatch(tdi, e.name || '', false);
  });
}

/* groups live in each person's own 'groups' list */
var GRP_EXTRA = (function(){ try{ return JSON.parse(store('ncc_groups_extra') || '[]') || []; }catch(x){ return []; } })();
function personGroups(e){ return splitTags(gv(e, 'groups'), ', '); }
function allGroups(){
  var map = {};
  D.directory.forEach(function(e, di){ if(liveEntry(e)) personGroups(e).forEach(function(g){ (map[g] = map[g] || []).push(di); }); });
  GRP_EXTRA.forEach(function(g){ if(!map[g]) map[g] = []; });
  return map;
}
function setPersonGroups(di, arr){ queuePatch(di, { groups: arr.join(', ') }); }
function orgMembers(k, name){
  var out = [];
  D.directory.forEach(function(e, di){ if(liveEntry(e) && tagList(gv(e, k)).indexOf(name) >= 0) out.push(di); });
  return out.sort(function(a, b){ return dispName(D.directory[a]).localeCompare(dispName(D.directory[b])); });
}
function orgNames(k){
  var seen = {}, out = [], cat = ORG_CATS.filter(function(c){ return c.k === k; })[0];
  if(cat) cat.options.forEach(function(o){ if(!seen[o]){ seen[o] = 1; out.push(o); } });
  D.directory.forEach(function(e){ if(liveEntry(e)) tagList(gv(e, k)).forEach(function(o){ if(!seen[o]){ seen[o] = 1; out.push(o); } }); });
  return out;
}

/* ============================================================
   7. merge — COMBINES. The loser is never overwritten and nothing from it is dropped:
      lists union, narratives append below the survivor's, single values keep the survivor's with blanks filled.
      The UI only writes the pointer; the build performs the combine (DATA-CONTRACT 5.1).
   ============================================================ */
var M_SINGLE = ['first_name','last_name','phone','relationship','context','category','years_known','tier','momentum','openness','conscientiousness','extraversion','agreeableness','neuroticism','ego'];
var M_LISTS = [['specialty','skills'],['churches','churches'],['companies','companies'],['universities','universities'],['groups','groups'],['highlights','highlights'],['achievements','honors']];
var M_TEXT = [['synopsis','synopsis'],['public_footprint','public footprint']];
function mergeTarget(survivorDi){ return String(D.directory[survivorDi].name || '').toLowerCase(); }
function mergeRichness(e){ return Object.keys(e.profile || {}).filter(function(k){ return String((e.profile || {})[k] || '').trim() && k !== 'updated_at'; }).length + (e.has_graph ? 3 : 0) + (e.neighbors || []).length / 5; }
function mergePreview(loserDi, survDi){
  var L = D.directory[loserDi], S = D.directory[survDi], out = { filled:[], union:[], appended:[], carried:[] };
  M_SINGLE.forEach(function(k){ if(!String(gv(S, k)).trim() && String(gv(L, k)).trim()) out.filled.push(k.replace(/_/g, ' ')); });
  M_LISTS.forEach(function(p){
    var sep = (p[0] === 'highlights' || p[0] === 'achievements') ? ' | ' : ', ';
    var have = splitTags(gv(S, p[0]), sep).map(function(x){ return x.toLowerCase(); });
    var add = splitTags(gv(L, p[0]), sep).filter(function(x){ return have.indexOf(x.toLowerCase()) < 0; });
    if(add.length) out.union.push(add.length + ' ' + p[1]);
  });
  M_TEXT.forEach(function(p){ var a = String(gv(L, p[0])).trim(), b = String(gv(S, p[0])).trim(); if(a && a !== b) out.appended.push(p[1]); });
  var ne = (L.events || []).length, nf = (L.files || []).length, nd = degreesOf(L).length, nfam = famLinks(L).length;
  if(ne) out.carried.push(ne + ' timeline event' + (ne === 1 ? '' : 's'));
  if(nf) out.carried.push(nf + ' file' + (nf === 1 ? '' : 's'));
  if(nd) out.carried.push(nd + ' degree' + (nd === 1 ? '' : 's'));
  if(nfam) out.carried.push(nfam + ' family link' + (nfam === 1 ? '' : 's'));
  var lh = effHandle(L), sh = effHandle(S);
  if(lh && !sh) out.carried.push('Instagram @' + lh);
  else if(lh && sh && lh.toLowerCase() !== sh.toLowerCase()) out.carried.push('Instagram stays @' + sh);
  return out;
}
function mergeInto(loserDi, survDi){
  var L = D.directory[loserDi], S = D.directory[survDi];
  if(!L || !S || loserDi === survDi) return false;
  var target = mergeTarget(survDi);
  if(!target) return false;
  txn('Merge ' + dispName(L), function(){
    queuePatch(loserDi, { merged_into:target });
    if(raw(S, 'review_flag') === 'duplicate') queuePatch(survDi, { review_flag:'' });
    if(raw(L, 'review_flag') === 'duplicate') queuePatch(loserDi, { review_flag:'' });
  });
  return true;
}
function unmerge(di){ txn('Unmerge', function(){ queuePatch(di, { merged_into:'' }); }); }

/* ============================================================
   export: a standalone document of one profile (neutral paper style, no theme colors)
   ============================================================ */
function buildDossierDoc(e){
  var name = dispName(e), handle = effHandle(e) ? '@' + effHandle(e) : '';
  var aka = personIsAka(e) ? gv(e, 'also_known_as') : '';
  var bio = String(gv(e, 'synopsis') || '').trim();
  var fp = gv(e, 'public_footprint');
  var classif = [gv(e, 'relationship'), gv(e, 'context'), tierName(e)].filter(Boolean).join(' · ');
  var orgs = [];
  ORG_CATS.forEach(function(cat){ tagList(gv(e, cat.k)).forEach(function(v){ orgs.push(v); }); });
  var contact = [];
  if(gv(e, 'email')) contact.push({ l:'Email', v:gv(e, 'email') });
  if(gv(e, 'phone')) contact.push({ l:'Phone', v:gv(e, 'phone') });
  if(orgs.length) contact.push({ l:'Orgs', v:orgs.join(' · ') });
  /* Synopsis fallback: field notes recast as prose (source URLs and filing attributions stripped). */
  function proseFromNotes(txt){
    var s = String(txt || '');
    s = s.replace(/https?:\/\/[^\s)<\]]+/g, '');
    s = s.replace(/\((?:via|filed)[^)]*\)/gi, '');
    s = s.replace(/\(\s*\)/g, '');
    s = s.replace(/\bSources?\s*:/gi, '');
    s = s.replace(/[ \t]+/g, ' ');
    s = s.split('\n').map(function(line){
      return line.replace(/\s*·\s*·\s*/g, ' · ').replace(/^[\s·,;|–—-]+/, '').replace(/[\s·,;]+$/, '').trim();
    }).filter(Boolean).join('\n');
    s = s.replace(/\s+([.,;:!?])/g, '$1').replace(/·\s*\./g, '.');
    return s.trim();
  }
  var synBody = bio || proseFromNotes(fp) || proseFromNotes(gv(e, 'notes'));
  /* Ratings: only traits carrying a value render; the block vanishes when none do. */
  var bars = PERSONA.filter(function(p){ return !isNaN(parseInt(gv(e, p[0]), 10)); }).map(function(p){
    var v = parseInt(gv(e, p[0]), 10);
    return { l:p[1], k:p[0], v:v, w:Math.max(0, Math.min(5, v)) / 5 * 100 };
  });
  var extras = [];
  if(gv(e, 'specialty')) extras.push({ l:'Skills', v:gv(e, 'specialty') });
  if(tierName(e)) extras.push({ l:'Tier', v:tierName(e) });
  if(momVal(e)) extras.push({ l:'Momentum', v:MOM_LABELS[momVal(e)] });
  degreesOf(e).forEach(function(d){ extras.push({ l:'Degree', v:[d.school, d.degree, d.major, d.year].filter(Boolean).join(' · ') }); });
  /* Known associates: strict First Last only — two tokens, each a capitalized name word. */
  function firstLastOk(nm){
    var parts = String(nm || '').trim().split(/\s+/);
    if(parts.length !== 2) return false;
    return parts.every(function(t){ return /^\p{Lu}[\p{L}'\u2019-]*$/u.test(t); });
  }
  var assocNames = knownAssociates(e).map(function(nb){
    var di = BYN[(nb.u || '').toLowerCase()];
    return di != null ? dispName(D.directory[di]) : (nb.d || nb.u || '');
  }).filter(firstLastOk).slice(0, 10); /* the printed list caps at the strongest 10, same order as the profile page (JD 2026-10-15) */
  var evs = sortedEvents(e).map(function(o){ return { date:o.ev.date || '', summary:o.ev.summary || '', detail:o.ev.detail || '' }; });
  var T = {
    name:name, aka:aka, handle:handle, classif:classif, rel:gv(e, 'relationship'), ctx:gv(e, 'context'), tierCol:tierCol(e), contact:contact, synBody:synBody,
    locCity:e.city || '', locHome:e.hometown || '', knownSince:knownSinceYear(e),
    bars:bars, extras:extras, assoc:assocNames,
    notesText:gv(e, 'notes') ? String(gv(e, 'notes')) : '', fpText:fp ? String(fp) : '',
    evs:evs, tier:tierName(e), initial:(name || '·').trim().charAt(0).toUpperCase()
  };
  var th = DOC_THEME;
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Dossier — ' + esc(name) + '</title>' +
    (th.fonts ? '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="' + th.fonts + '">' : '') +
    '<style>' + th.css + '</style></head><body>' + th.render(T) + '</body></html>';
}

/* ============================================================
   export design: presentation only. buildDossierDoc computes the content
   once (which sections exist, the synopsis fallback, the ratings and the
   First-Last associates rules); DOC_THEME below only renders that content.
   ============================================================ */
function docY(s){ return s.replace(/\b(?:19|20)\d{2}\b/g, '<b>$&</b>'); }
function docT(s){ return docY(esc(s)); }
function docBR(s){ return docT(s).replace(/\n/g, '<br>'); }
function docRateLabel(T){ return T.bars.length ? 'PROFILE RATINGS' : 'DETAILS'; }

/* ---------- Case File "Sidebar File": the single export design ----------
   Layout (JD, 2026-10-15): a full-width header band carries the name and the
   primary information (handle, location, tier, relationship/context, known
   since); below it the gray sidebar (contact + ratings + radar) runs beside
   the narrative column. ONE accent color: very dark navy #16283f (rules,
   section numbers, rating dots, radar, dotted lines). The tier stamp is the
   only other color: elegant maroon #5e2129, the same for every tier. Traits
   are distinguished by label only. Ratings are five-dot scales; sidebar rows
   are compact; contact and info values sit on dotted form lines. Years in
   body text and relationship/context values render bold. No rotated stamp. */
var DOC_NAVY = '#16283f';
var DOC_MAROON = '#5e2129';
var TRAIT_STYLE = {
  openness:{ s:'OPN' },
  conscientiousness:{ s:'CON' },
  extraversion:{ s:'EXT' },
  agreeableness:{ s:'AGR' },
  neuroticism:{ s:'NEU' },
  ego:{ s:'EGO' }
};
function traitC(b){ return DOC_NAVY; }
function traitS(b){ return (TRAIT_STYLE[b.k] || {}).s || String(b.l || '').slice(0, 3).toUpperCase(); }
var TIER_TINT = 'rgba(94,33,41,.07)';
function docDots(b){
  var f = Math.max(0, Math.min(5, b.v)), c = traitC(b), s = '<span class="dots" aria-hidden="true">';
  for(var i = 0; i < 5; i++) s += '<i class="' + (i < f ? 'on' : '') + '"' + (i < f ? ' style="background:' + c + ';border-color:' + c + '"' : '') + '></i>';
  return s + '</span>';
}
function docRadar(bars){
  var n = bars.length;
  if(n < 3) return '';
  var W = 196, H = 172, cx = 98, cy = 84, R = 50, i, p;
  function pt(i2, f){ var a = -Math.PI / 2 + i2 * 2 * Math.PI / n; return [cx + R * f * Math.cos(a), cy + R * f * Math.sin(a)]; }
  function ringPts(f){
    var out = [];
    for(var j = 0; j < n; j++){ var q = pt(j, f); out.push(q[0].toFixed(1) + ',' + q[1].toFixed(1)); }
    return out.join(' ');
  }
  function dataPts(){
    var out = [];
    for(var j = 0; j < n; j++){ var q = pt(j, Math.max(0, Math.min(5, bars[j].v)) / 5); out.push(q[0].toFixed(1) + ',' + q[1].toFixed(1)); }
    return out.join(' ');
  }
  var s = '<svg class="radar" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">';
  for(var ring = 5; ring >= 1; ring--) s += '<polygon points="' + ringPts(ring / 5) + '" fill="' + (ring === 5 ? '#e6e6e3' : 'none') + '" stroke="#c4c4c0" stroke-width="1"/>';
  for(i = 0; i < n; i++){ p = pt(i, 1); s += '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '" stroke="#d2d2ce" stroke-width="1"/>'; }
  s += '<polygon points="' + dataPts() + '" fill="rgba(22,40,63,.13)" stroke="' + DOC_NAVY + '" stroke-width="1.6"/>';
  bars.forEach(function(b, j){ var q = pt(j, Math.max(0, Math.min(5, b.v)) / 5); s += '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="2.8" fill="' + traitC(b) + '"/>'; });
  bars.forEach(function(b, j){ var q = pt(j, 1.34); s += '<text x="' + q[0].toFixed(1) + '" y="' + (q[1] + 3).toFixed(1) + '" text-anchor="middle" fill="' + traitC(b) + '">' + esc(traitS(b)) + '</text>'; });
  return s + '</svg>';
}
var DOC_THEME = { fonts:'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap',
  css:
  'body{background:#2b2b2b;margin:0;padding:28px;font-family:"IBM Plex Mono","Courier New",monospace;color:#262626}' +
  '.page{background:#f4f4f1;max-width:820px;margin:0 auto;box-shadow:0 0 50px rgba(0,0,0,.55);display:flex;flex-direction:column}' +
  '.strip{background:#16283f;color:#f2f2f0;padding:11px 36px;display:flex;justify-content:space-between;font-size:11px;letter-spacing:.22em;flex:none}' +
  '.bodycols{display:flex;flex:1;min-height:0;align-items:stretch}' +
  '.side{width:256px;flex:none;background:#ebebe8;border-right:1.5px solid #16283f;padding:22px 20px}' +
  '.side h3{font-size:11px;letter-spacing:.22em;font-weight:600;border-bottom:2px solid #16283f;padding-bottom:7px;margin:0 0 10px}' +
  '.blk{margin-bottom:18px}.blk:last-child{margin-bottom:4px}' +
  '.crow{font-size:11.5px;margin-bottom:9px}' +
  '.crow b{display:block;font-size:9.5px;letter-spacing:.16em;color:#595959;margin-bottom:2px;font-weight:600}' +
  '.crow span{display:block;border-bottom:1.5px dotted #16283f;padding-bottom:3px}' +
  '.trow{margin-bottom:3px}' +
  '.trow .dl{font-size:10.5px;font-weight:600;letter-spacing:.05em;margin-bottom:1px;line-height:1.2;text-transform:uppercase}' +
  '.dots{display:flex;gap:5px}.dots i{display:block;width:8px;height:8px;border-radius:50%;border:1.5px solid #b9b9b4}' +
  '.dots i.on{background:#16283f;border-color:#16283f}' +
  '.kv{font-size:12px;margin-top:7px}' +
  '.kv span{display:block;font-weight:600;letter-spacing:.1em;font-size:10px;text-transform:uppercase;color:#595959;margin-bottom:2px}' +
  '.kv i{font-style:normal;display:block;border-bottom:1.5px dotted #16283f;padding-bottom:3px}' +
  '.chartblk{text-align:center}' +
  '.radar text{font-family:"IBM Plex Mono","Courier New",monospace;font-size:8.5px;font-weight:600;letter-spacing:.05em}' +
  '.chartcap{font-size:8px;letter-spacing:.14em;color:#6a6a6a;text-align:center;margin-top:2px}' +
  '.main{flex:1;min-width:0;padding:24px 34px 28px}' +
  '.headband{padding:20px 36px 18px;border-bottom:2.5px solid #16283f}' +
  '.hbrow{display:flex;justify-content:space-between;align-items:flex-start;gap:26px}' +
  '.hbmain{min-width:0}' +
  '.ident{font-size:12px;color:#595959;margin-top:5px;letter-spacing:.05em}' +
  '.kick{font-size:10.5px;letter-spacing:.3em;color:#595959;font-weight:600}' +
  'h1{font-size:27px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;margin:5px 0 0}' +
  '.aka{font-size:12px;color:#6f6f6f;margin-top:3px}' +
  '.stamp{display:inline-block;border:2.5px solid #5e2129;color:#5e2129;padding:8px 18px;font-weight:600;letter-spacing:.18em;border-radius:3px;font-size:12px;margin-top:0;text-transform:uppercase;white-space:nowrap}' +
  '.meta{font-size:11.5px;letter-spacing:.08em;border-top:2px solid #16283f;border-bottom:1px solid #16283f;padding:8px 0;margin-top:14px;text-transform:uppercase;display:flex;justify-content:space-between;align-items:center;gap:22px}' +
  '.metaitems{min-width:0}' +
  '.meta .mv{border-bottom:1.5px dotted #16283f;padding-bottom:1px}' +
  '.sec{border-top:2px solid #16283f;margin-top:21px;padding-top:10px;break-inside:avoid}' +
  '.sec h2{font-size:12.5px;letter-spacing:.2em;margin:0 0 11px;font-weight:600}.sec h2 b{color:#16283f;font-weight:600}' +
  '.sbody{font-size:12.5px;line-height:1.75}.sbody p{margin:0 0 9px}' +
  'ul{margin:0;padding-left:19px;font-size:12.5px;line-height:1.75}ul.cols{column-count:2;column-gap:30px}' +
  '@page{size:Letter;margin:.55in;background:#f4f4f1;@top-right{content:"FILE COPY";font-family:"IBM Plex Mono","Courier New",monospace;font-size:8.5px;letter-spacing:.22em;color:#777772}@bottom-center{content:"PAGE " counter(page) " OF " counter(pages);font-family:"IBM Plex Mono","Courier New",monospace;font-size:8.5px;letter-spacing:.22em;color:#777772}}' +
  '@media print{' +
  'html{background:#f4f4f1}' +
  'body{background:#f4f4f1;padding:0}' +
  '.page{box-shadow:none;max-width:none;width:auto;display:block;background:#f4f4f1}' +
  '.bodycols{display:block}' +
  '.headband{padding:22px 36px 18px;break-inside:avoid}' +
  '.side{float:left;width:250px;margin:2px 24px 14px 0;padding:20px 18px;break-inside:avoid}' +
  '.main{margin-left:0;padding:22px 36px 12px;min-width:0}' +
  '.sec{break-inside:auto}' +
  '.sec h2{break-after:avoid;break-inside:avoid}' +
  '.sbody p{orphans:3;widows:3}' +
  'li{break-inside:avoid;orphans:2;widows:2}' +
  '.blk,.chartblk,.stamp,.meta,h1{break-inside:avoid}' +
  'h1{break-after:avoid}' +
  '*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}',
  render: function(T){
    var side = '';
    if(T.contact.length) side += '<div class="blk"><h3>CONTACT</h3>' + T.contact.map(function(it){
      return '<div class="crow"><b>' + esc(it.l) + '</b><span>' + docT(it.v) + '</span></div>'; }).join('') + '</div>';
    if(T.extras.length){
      side += '<div class="blk"><h3>DETAILS</h3>' + T.extras.map(function(x){
        return '<div class="kv"><span>' + esc(x.l) + '</span><i>' + docT(x.v) + '</i></div>'; }).join('') + '</div>';
    }
    if(T.bars.length){
      side += '<div class="blk"><h3>PROFILE RATINGS</h3>' + T.bars.map(function(b){
        return '<div class="trow"><div class="dl" style="color:' + traitC(b) + '">' + esc(b.l) + '</div>' + docDots(b) + '</div>'; }).join('');
      side += '</div>';
      var rad = docRadar(T.bars);
      if(rad) side += '<div class="blk chartblk">' + rad + '<div class="chartcap">BIG FIVE + EGO · SCALE 0–5</div></div>';
    }
    var secs = [];
    if(T.synBody) secs.push(['SYNOPSIS', '<div class="sbody"><p>' + docBR(T.synBody) + '</p></div>']);
    if(T.assoc.length) secs.push(['KNOWN ASSOCIATES', '<ul class="cols">' + T.assoc.map(function(n){ return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>']);
    if(T.notesText || T.fpText) secs.push(['FIELD NOTES', '<div class="sbody">' +
      (T.notesText ? '<p>' + docBR(T.notesText) + '</p>' : '') + (T.fpText ? '<p><b>Public footprint</b><br>' + docBR(T.fpText) + '</p>' : '') + '</div>']);
    if(T.evs.length) secs.push(['TIMELINE', '<ul>' + T.evs.map(function(o){
      return '<li><b>' + esc(o.date) + '</b> — ' + docT(o.summary) + (o.detail ? '<br>' + docT(o.detail) : '') + '</li>'; }).join('') + '</ul>']);
    var meta = [];
    if(T.rel) meta.push('<b class="mv">' + esc(T.rel) + '</b>');
    if(T.ctx) meta.push('<b class="mv">' + esc(T.ctx) + '</b>');
    if(T.knownSince) meta.push('<span class="mv">Known since ' + T.knownSince + '</span>');
    var stamp = '';
    if(T.tier){
      stamp = '<span class="stamp" style="border-color:' + DOC_MAROON + ';background:' + TIER_TINT + ';color:' + DOC_MAROON + '">' + esc(T.tier) + '</span>';
    }
    var ident = [];
    if(T.handle) ident.push(esc(T.handle));
    if(T.locCity) ident.push('Lives in ' + docT(T.locCity));
    if(T.locHome) ident.push('From ' + docT(T.locHome));
    var head = '<div class="headband"><div class="hbrow"><div class="hbmain">' +
      '<h1>' + esc(T.name) + '</h1>' +
      (T.aka ? '<div class="aka">also known as ' + esc(T.aka) + '</div>' : '') +
      (ident.length ? '<div class="ident">' + ident.join(' &nbsp;·&nbsp; ') + '</div>' : '') +
      '</div></div>' +
      ((meta.length || stamp) ? '<div class="meta"><span class="metaitems">' + meta.join(' &nbsp;·&nbsp; ') + '</span>' + stamp + '</div>' : '') + '</div>';
    var nmCss = String(T.name || '').toUpperCase().replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ');
    return '<style>@page{@top-left{content:"PERSONNEL FILE — ' + nmCss + '";font-family:"IBM Plex Mono","Courier New",monospace;font-size:8.5px;letter-spacing:.22em;color:#777772}}</style>' +
      '<div class="page"><div class="strip"><span>PERSONNEL FILE</span><span>FILE COPY</span></div>' +
      head +
      '<div class="bodycols">' + (side ? '<div class="side">' + side + '</div>' : '') + '<div class="main">' +
      secs.map(function(s, i){ return '<div class="sec"><h2><b>' + ('0' + (i + 1)).slice(-2) + '</b> &nbsp;' + s[0] + '</h2>' + s[1] + '</div>'; }).join('') +
      '</div></div></div>';
  } };

function doExport(di, mode){
  var e = D.directory[di]; if(!e) return;
  try{
    var html = buildDossierDoc(e);
    if(mode === 'view'){
      var u = URL.createObjectURL(new Blob([html], { type:'text/html' }));
      window.open(u, '_blank', 'noopener');
      setTimeout(function(){ URL.revokeObjectURL(u); }, 120000);
    } else {
      var blob = new Blob([html], { type:'text/html' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Dossier - ' + (dispName(e).replace(/[\\/:*?"<>|]/g, '').trim() || 'person') + '.html';
      document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      toast('Downloaded.');
    }
  }catch(x){ toast(mode === 'view' ? 'Could not open the document.' : 'Could not build the document.'); }
}

function personIsAka(e){ return pkey(e) === AKA_KEY; }

/* ============================================================
   8. views
   ============================================================ */
var S = {
  depth:0, route:{ name:'people', seg:[] }, ctx:null,
  ppl:{ q:'', status:'all', tier:'all', rel:'', group:'', ts:{ k:'name', d:1 }, side:null },
  prof:{ di:null, edit:{}, open:{}, evEdit:null, degEdit:null, skOpen:null, more:false },
  net:{ color:'tier', bg:false, sel:null, mode:(store('ncc_netmode') === '2d' ? '2d' : '3d') },
  fam:{ editing:null, focus:null, sheet:false, side:null },
  grp:{ kind:'groups', open:null, renaming:null },
  audit:null   /* Audit feeder wall state (visit only), built lazily by viewAudit */
};
/* Side panels (People counts, Family summary) start tucked; a panel's own
   open/closed choice (S.ppl.side / S.fam.side, null = tucked) is remembered
   for the visit. (The Minimal/Rich view mode was removed 2026-10-15; a
   stored ncc_view_mode value is simply never read anymore.) */
function sideOpen(st){ return st != null ? !!st : false; }
var PHI = 0; /* pending-render guard */

function toast(msg, opt){
  opt = opt || {};
  var wrap = $('#toasts'); if(!wrap) return;
  var t = document.createElement('div'); t.className = 'toast';
  t.innerHTML = '<span>' + esc(msg) + '</span>' + (opt.undo ? '<button type="button" data-act="undo">Undo</button>' : '');
  wrap.appendChild(t);
  requestAnimationFrame(function(){ t.classList.add('show'); });
  setTimeout(function(){ t.classList.remove('show'); setTimeout(function(){ t.remove(); }, 250); }, opt.undo ? 6500 : 3200);
  while(wrap.children.length > 3) wrap.firstChild.remove();
}
function avatar(e, size){
  var nm = dispName(e), c = tierCol(e);
  return '<span class="av av-' + (size || 'md') + '" style="--tc:' + c + '">' + esc((nm.replace(/^@/, '').trim().charAt(0) || '·').toUpperCase()) + '</span>';
}
function seg(k, opts, val, extra){
  return '<div class="seg" role="group">' + opts.map(function(o){
    var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : cap(o);
    return '<button type="button" class="' + (String(val) === String(v) ? 'on' : '') + '" data-act="set" data-k="' + k + '" data-v="' + esc(v) + '"' + (extra || '') + '>' + esc(l) + '</button>';
  }).join('') + '</div>';
}
function chip(label, cls){ return '<span class="chip ' + (cls || '') + '">' + esc(label) + '</span>'; }
function infoLine(e){
  return [tierName(e), cap(gv(e, 'relationship')), e.city].filter(Boolean).join(' · ');
}
function emptyState(title, body){ return '<div class="empty"><h3>' + esc(title) + '</h3><p>' + esc(body || '') + '</p></div>'; }

/* ---------- sheet (dialog on desktop, bottom sheet on phones) ---------- */
function openSheet(title, body, o){
  o = o || {};
  closeSheet();
  var w = $('#sheetwrap');
  w.innerHTML = '<div class="scrim" data-act="sheetx"></div><div class="sheet' + (o.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
    '<header><h2>' + esc(title) + '</h2><button type="button" class="ib" data-act="sheetx" aria-label="Close">' + ic('x', 18) + '</button></header>' +
    '<div class="sbody">' + body + '</div></div>';
  w.hidden = false; document.body.classList.add('sheet-open');
  S.sheetOnClose = o.onClose || null;
  var f = $('input:not([type=hidden]), textarea', w); if(f && o.focus !== false) f.focus();
}
function closeSheet(){
  var w = $('#sheetwrap'); if(!w || w.hidden) return;
  w.hidden = true; w.innerHTML = ''; document.body.classList.remove('sheet-open');
  var f = S.sheetOnClose; S.sheetOnClose = null; if(f) f();
}
function askEditKey(){
  openSheet('Edit key needed',
    '<p class="dim">The sheet rejected the last save. Enter the edit key (the EDIT_TOKEN from the Apps Script project). It is stored in this browser only.</p>' +
    '<input type="password" id="ekey" placeholder="Edit key" autocomplete="off">' +
    '<div class="row end"><button type="button" class="btn primary" data-act="savekey">Save and retry</button></div>',
    { onClose:function(){ OUT.auth = false; } });
}

/* ---------- global chrome ---------- */
var NAV = [
  { k:'people',  l:'People',  ic:'people' },
  { k:'audit',   l:'Audit',   ic:'target' },
  { k:'network', l:'Network', ic:'network' },
  { k:'family',  l:'Family',  ic:'tree' },
  { k:'groups',  l:'Groups',  ic:'groups' }
];
function activeNav(){
  var n = S.route.name;
  if(n === 'profile'){ var f = S.ctx && S.ctx.from; return NAV.some(function(x){ return x.k === f; }) ? f : 'people'; }
  return n;
}
function renderChrome(){
  var act = activeNav();
  var items = NAV.map(function(n){
    return '<a href="#/' + n.k + '" class="nv' + (act === n.k ? ' on' : '') + '" data-nav="' + n.k + '">' + ic(n.ic, 20) + '<span>' + n.l + '</span></a>';
  }).join('');
  $('#rail').innerHTML = '<a class="brand" href="#/people" aria-label="North Country Circle"><i></i><b>North Country Circle</b></a>' +
    '<div class="navlist">' + items + '</div>' +
    '<div class="railfoot"><a href="index.html" class="nv">' + ic('network', 20) + '<span>Visual map</span></a>' +
    '<a href="#/settings" class="nv' + (act === 'settings' ? ' on' : '') + '">' + ic('settings', 20) + '<span>Settings</span></a>' +
    '<small id="fresh">' + (D ? 'Data ' + esc(D.updated || '') : '') + '</small></div>';
  $('#tabs').innerHTML = items;
  var top = $('#top');
  var onProfile = S.route.name === 'profile';
  top.innerHTML =
    (onProfile ? '<button type="button" class="ib" data-act="back" aria-label="Back">' + ic('chevl', 20) + '</button>' : '<span class="logo-s"><i></i></span>') +
    '<div class="gsearch"><span class="gsi">' + ic('search', 16) + '</span><input id="gs" type="search" placeholder="Search people" autocomplete="off" aria-label="Search people" spellcheck="false"><kbd>/</kbd><div id="gsr" class="gsr" hidden></div></div>' +
    '<div class="topr">' +
    '<button type="button" class="ib" id="undob" data-act="undo" aria-label="Undo" title="Undo (Ctrl+Z)">' + ic('undo', 18) + '</button>' +
    '<button type="button" class="ib hide-s" id="redob" data-act="redo" aria-label="Redo" title="Redo (Ctrl+Shift+Z)">' + ic('redo', 18) + '</button>' +
    '<button type="button" class="syncp" id="sync" data-act="retry"></button>' +
    '<a href="#/settings" class="ib show-s" aria-label="Settings">' + ic('settings', 18) + '</a></div>';
  paintSync(); paintUndo();
}
function paintSync(){
  var p = $('#sync'); if(!p) return;
  var n = outPending(), txt, cls = 'ok';
  if(!n){ txt = 'Saved'; }
  else if(OUT.err){ txt = n + ' not saved · retrying'; cls = 'err'; }
  else if(OUT.busy){ txt = 'Saving'; cls = 'busy'; }
  else { txt = 'Unsaved'; cls = 'busy'; }
  p.className = 'syncp ' + cls; p.innerHTML = '<i></i>' + esc(txt);
  p.title = OUT.err ? 'Last error: ' + OUT.err + '. Tap to retry now.' : 'Every edit is stored in this browser first, then sent to the sheet.';
  var sp = $('#syncs'); if(sp) sp.textContent = txt;
}
function paintUndo(){
  var u = $('#undob'), r = $('#redob');
  if(u) u.disabled = !UNDO.stack.length;
  if(r) r.disabled = !UNDO.redo.length;
}

/* ---------- search ---------- */
function matchText(e){
  if(e._mt) return e._mt;
  e._mt = [dispName(e), effHandle(e), gv(e, 'specialty'), gv(e, 'companies'), gv(e, 'churches'), gv(e, 'universities'), gv(e, 'groups'), e.city || '', e.hometown || '',
    personIsAka(e) ? gv(e, 'also_known_as') : '', degreesOf(e).map(function(d){ return d.school + ' ' + d.major; }).join(' ')].join(' ').toLowerCase();
  return e._mt;
}
function searchPeople(q, limit, pool){
  q = String(q || '').trim().toLowerCase().replace(/^@/, '');
  if(!q) return [];
  var toks = q.split(/\s+/), out = [];
  (pool || people()).forEach(function(di){
    var e = D.directory[di], t = matchText(e), ok = true;
    for(var i = 0; i < toks.length; i++) if(t.indexOf(toks[i]) < 0){ ok = false; break; }
    if(!ok) return;
    var nm = dispName(e).toLowerCase();
    var s = nm === q ? 0 : nm.indexOf(q) === 0 ? 1 : nm.split(' ').some(function(w){ return w.indexOf(toks[0]) === 0; }) ? 2 : 3;
    out.push({ di:di, s:s });
  });
  out.sort(function(a, b){ return a.s - b.s || (D.directory[b.di].strength || 0) - (D.directory[a.di].strength || 0); });
  return out.slice(0, limit || 8).map(function(o){ return o.di; });
}
function paintSearch(){
  var inp = $('#gs'), box = $('#gsr'); if(!inp || !box) return;
  var q = inp.value.trim();
  if(!q){ box.hidden = true; box.innerHTML = ''; return; }
  var hits = searchPeople(q, 7);
  box.innerHTML = hits.map(function(di, i){
    var e = D.directory[di];
    return '<button type="button" class="gsi-row' + (i === 0 ? ' on' : '') + '" data-act="gsopen" data-di="' + di + '">' + avatar(e, 'sm') +
      '<span><b>' + esc(dispName(e)) + '</b><small>' + esc(infoLine(e) || (effHandle(e) ? '@' + effHandle(e) : '')) + '</small></span>' + '</button>';
  }).join('') + (hits.length ? '<button type="button" class="gsi-all" data-act="gsall">See all matches in People</button>' : '<div class="gsi-none">No one matches</div>');
  box.hidden = false;
}

/* ---------- router ---------- */
function parseRoute(){
  var h = (location.hash || '#/people').replace(/^#\/?/, '');
  var seg = h.split('/').filter(Boolean).map(function(s){ try{ return decodeURIComponent(s); }catch(x){ return s; } });
  var name = seg[0] || 'people';
  if(name === 'p') name = 'profile';
  if(['people','profile','network','family','groups','settings','audit'].indexOf(name) < 0) name = 'people';
  return { name:name, seg:seg.slice(1) };
}
function go(path, o){
  o = o || {};
  var url = '#/' + path;
  if(o.replace) history.replaceState({ d:S.depth }, '', url);
  else { S.depth++; history.pushState({ d:S.depth }, '', url); }
  render();
}
function back(fallback){
  if(S.depth > 0) history.back();
  else go(fallback || 'people', { replace:true });
}
addEventListener('popstate', function(ev){ S.depth = (ev.state && ev.state.d) || 0; render(); });
function openPerson(di, ctx, o){
  var e = D.directory[di]; if(!e) return;
  if(ctx) S.ctx = ctx; else if(!(o && o.keepCtx)) S.ctx = null;
  S.prof = { di:di, edit:{}, open:{}, evEdit:null, degEdit:null, skOpen:null, more:false };
  if(o && o.edit) S.prof.edit[o.edit] = true;
  go('p/' + encodeURIComponent(personId(e)));
}
function ctxFrom(label, dis, i, from){
  return { label:label, keys:dis.map(function(d){ return pkey(D.directory[d]); }), i:i, from:from };
}

var renderTimer = 0;
function render(){
  if(!D) return;
  cancelAnimationFrame(renderTimer);
  S.route = parseRoute();
  var v = $('#view'), n = S.route.name;
  closeSheet();
  document.body.setAttribute('data-view', n);
  /* skin 2026-10-15: route CHANGES earn a short entrance; same-route
     repaints (polls, quiet refresh, writes) stay instant */
  if(render._pv !== n){ render._pv = n; v.classList.remove('vin'); void v.offsetWidth; v.classList.add('vin'); clearTimeout(render._vt); render._vt = setTimeout(function(){ v.classList.remove('vin'); }, 380); }
  try{
    renderChrome();
    if(n === 'people') viewPeople(v);
    else if(n === 'profile') viewProfile(v);
    else if(n === 'network') viewNetwork(v);
    else if(n === 'family') viewFamily(v);
    else if(n === 'groups') viewGroups(v);
    else if(n === 'settings') viewSettings(v);
    else if(n === 'audit') viewAudit(v);
  }catch(err){
    v.innerHTML = '<div class="empty"><h3>Something broke on this screen</h3><p>' + esc(String(err && err.message || err)) + '</p><p><a href="#/people" class="btn">Go to People</a></p></div>';
    if(window.console) console.error(err);
  }
}
function afterWrite(di){
  /* undo buttons after any write; never re-render a view the user is typing in */
  paintUndo();
}
/* Silent background refresh (JD 2026-10-15): the changes feed has already
   swapped the new data into memory by the time this runs; the screen is
   updated quietly, in place, never blanked. While JD is mid-interaction —
   typing, a sheet or cell editor open, a profile section in edit mode, or
   an Audit card inside its 3-second pending window — the visual update
   defers and retries until the interaction ends. Scroll is preserved. */
var REF_PENDING = false;
function refreshBusy(){
  if(typing()) return true;
  var sw = $('#sheetwrap'); if(sw && !sw.hidden) return true;
  if(typeof PTED !== 'undefined' && PTED) return true;
  if(document.querySelector('.aud-card.aud-arm')) return true;
  var acs = $$('.aud-card');
  for(var ai2 = 0; ai2 < acs.length; ai2++){
    if(acs[ai2]._audDeb || acs[ai2]._audBlur) return true;   /* a commit decision is pending on this card */
    var ain = $('.aud-in', acs[ai2]);
    if(ain && ain.value.trim()) return true;   /* uncommitted text sitting in an Audit editor, focused or not */
  }
  if(S.route && S.route.name === 'profile' && S.prof && S.prof.edit && Object.keys(S.prof.edit).length) return true;
  return false;
}
function quietRefresh(){
  if(refreshBusy()){
    if(!REF_PENDING){ REF_PENDING = true; setTimeout(function(){ REF_PENDING = false; quietRefresh(); }, 1200); }
    return;
  }
  if(S.route && S.route.name === 'audit'){ audPaintCounts(); audPaintEmpty(); return; }  /* the wall keeps its cards; only the counter moves */
  var y = window.scrollY || 0, vel = $('#view'), vst = vel ? vel.scrollTop : 0;
  render();
  window.scrollTo(0, y);
  if(vel) vel.scrollTop = vst;   /* #view is the scroller in this layout */
}
window.__nccChanged = function(di){
  afterWrite(di);
  if(di === -1) quietRefresh();
};

/* ============================================================
   People — one list, one search, a few honest filters. No stat tiles, no pips, no fill bars.
   ============================================================ */
/* Organizations across churches/companies/universities, deduped in category order. */
function orgsOf(e){
  var orgs = [];
  ORG_CATS.forEach(function(c){ tagList(gv(e, c.k)).forEach(function(o){ if(orgs.indexOf(o) < 0) orgs.push(o); }); });
  return orgs;
}
/* People table sort (S.ppl.ts): keys are precomputed once per filter pass.
   Text columns sort A-Z with blanks last in BOTH directions; tier follows ring
   order (Vetted, Associate, Open, No tier yet); associates is numeric. Ties
   fall to name, then directory order, so the ordering is total. */
function pplSort(dis){
  var ts = S.ppl.ts || { k:'name', d:1 }, d = ts.d < 0 ? -1 : 1, K = {};
  dis.forEach(function(di){
    var e = D.directory[di], tr = TIER_RANK[tierOf(e)];
    K[di] = {
      name: dispName(e).toLowerCase(),
      tier: tr == null ? 3 : tr,
      loc: ptLocVal(e).toLowerCase(),
      orgs: orgsOf(e).join(' · ').toLowerCase(),
      assoc: knownAssociates(e).length,
      skills: tagList(gv(e, 'specialty')).join(', ').toLowerCase(),
      rel: cap(gv(e, 'relationship')).toLowerCase(),
      handle: ptHandle(e).toLowerCase(),
      groups: personGroups(e).join(', ').toLowerCase(),
      years: knownSinceYear(e),
      phone: gv(e, 'phone'),
      email: gv(e, 'email').toLowerCase(),
      updated: Date.parse(raw(e, 'updated_at')) || 0
    };
  });
  dis.sort(function(a, b){
    var ka = K[a], kb = K[b], r = 0;
    if(ts.k === 'tier') r = (ka.tier - kb.tier) * d;
    else if(ts.k === 'assoc') r = (ka.assoc - kb.assoc) * d;
    else if(ts.k === 'years' || ts.k === 'updated'){
      var na = ka[ts.k], nb = kb[ts.k];
      if(na && nb) r = (na - nb) * d; else if(na) r = -1; else if(nb) r = 1;
    }
    else if(ts.k === 'name') r = ka.name.localeCompare(kb.name) * d;
    else {
      var va = ka[ts.k], vb = kb[ts.k];
      if(va !== '' && vb !== '') r = va.localeCompare(vb) * d;
      else if(va === '' && vb !== '') r = 1;
      else if(va !== '' && vb === '') r = -1;
    }
    if(!r) r = ka.name.localeCompare(kb.name);
    return r || (a - b);
  });
}
function peopleFiltered(){
  var f = S.ppl, pool = people();
  var dis = f.q.trim() ? searchPeople(f.q, 9999, pool) : pool.slice();
  dis = dis.filter(function(di){
    var e = D.directory[di];
    if(f.tier !== 'all'){ var t = tierOf(e); if(f.tier === 'none' ? !!t : t !== f.tier) return false; }
    if(f.rel && e.relation !== f.rel) return false;
    if(f.group && personGroups(e).indexOf(f.group) < 0) return false;
    return true;
  });
  pplSort(dis);
  return dis;
}
/* Roster row's second line: only what the profile already has — tier chip,
   place, up to two orgs/schools, associate count, and a one-line snippet from
   the synopsis (or the field notes when there is no synopsis). Absent pieces
   are omitted, never placeholdered. */
function prowSnip(e){
  var s = String(gv(e, 'synopsis') || '').replace(/\s+/g, ' ').trim();
  if(!s){ var b = footprintOf(e).blocks; s = b.length ? String(b[0].text || '').replace(/\s+/g, ' ').trim() : ''; }
  return s.length > 90 ? s.slice(0, 90).trim() + '…' : s;
}
function prowMeta(e){
  var parts = [], t = tierOf(e);
  if(t && TIERS[t]) parts.push('<span class="ptier"><i style="background:' + TIERS[t].c + '"></i>' + TIERS[t].n + '</span>');
  var loc = e.city || e.hometown || '';
  if(loc) parts.push('<span>' + esc(loc) + '</span>');
  var orgs = [];
  ORG_CATS.forEach(function(c){ tagList(gv(e, c.k)).forEach(function(o){ if(orgs.indexOf(o) < 0) orgs.push(o); }); });
  orgs.slice(0, 2).forEach(function(o){ parts.push('<span>' + esc(o) + '</span>'); });
  var ka = knownAssociates(e).length;
  if(ka) parts.push('<span>' + ka + ' known associate' + (ka === 1 ? '' : 's') + '</span>');
  var snip = prowSnip(e);
  if(snip) parts.push('<span class="psnip">' + esc(snip) + '</span>');
  return parts.length ? '<small class="pmeta">' + parts.join('<span class="psep">·</span>') + '</small>' : '';
}
function prow(di, i){
  var e = D.directory[di];
  var sub = [cap(gv(e, 'relationship')), effHandle(e) ? '@' + effHandle(e) : ''].filter(Boolean).join(' · ');
  return '<button type="button" class="prow" data-act="popen" data-di="' + di + '" data-i="' + i + '">' + avatar(e, 'md') +
    '<span class="pn"><b>' + esc(dispName(e)) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + prowMeta(e) + '</span></button>';
}
/* People right column: filter shortcuts + counts by tier and group.
   Tucked until opened; S.ppl.side remembers an explicit open/close. */
function pplSideHTML(f){
  var tc = { vetted:0, associate:0, open:0, none:0 };
  people().forEach(function(di){ var t = tierOf(D.directory[di]); tc[(t === 'vetted' || t === 'associate' || t === 'open') ? t : 'none']++; });
  var tiers = [['vetted', 'Vetted', (TIERS.vetted || {}).c], ['associate', 'Associate', (TIERS.associate || {}).c], ['open', 'Open', (TIERS.open || {}).c], ['none', 'Untiered', RING_C[3]]];
  var gm = allGroups();
  var grows = Object.keys(gm).map(function(g){ return [g, gm[g].length]; }).sort(function(a, b){ return b[1] - a[1] || a[0].localeCompare(b[0]); }).slice(0, 14);
  return '<aside class="ppl-side" id="pplside"><div class="side-h"><h3>Counts</h3><button type="button" class="ib sm" data-act="pplside" aria-label="Close counts">' + ic('x', 15) + '</button></div>' +
    '<div class="side-sec"><h4>By tier</h4>' + tiers.map(function(t){
      return '<button type="button" class="srow' + (f.tier === t[0] ? ' on' : '') + '" data-act="pf" data-k="tier" data-v="' + t[0] + '"><i style="background:' + (t[2] || '#4b5468') + '"></i><span>' + t[1] + '</span><b>' + tc[t[0]] + '</b></button>';
    }).join('') + (f.tier !== 'all' ? '<button type="button" class="srow sub" data-act="pf" data-k="tier" data-v="all"><span>Any tier</span></button>' : '') + '</div>' +
    '<div class="side-sec"><h4>Groups</h4>' + grows.map(function(g){
      return '<button type="button" class="srow' + (f.group === g[0] ? ' on' : '') + '" data-act="pf" data-k="group" data-v="' + esc(g[0]) + '"><span>' + esc(g[0]) + '</span><b>' + g[1] + '</b></button>';
    }).join('') + (f.group ? '<button type="button" class="srow sub" data-act="pf" data-k="group" data-v=""><span>Any group</span></button>' : '') + '</div>' + '</aside>';
}
function viewPeople(v){
  ptEditClose();
  var f = S.ppl, groups = Object.keys(allGroups()).sort();
  function chips(key, opts, cur){
    return '<div class="chips" role="group">' + opts.map(function(o){
      return '<button type="button" class="fc' + (cur === o[0] ? ' on' : '') + '" data-act="pf" data-k="' + key + '" data-v="' + o[0] + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  v.innerHTML = '<div class="page people"><div class="pagehead"><div><h1 class="display">People</h1><p class="sub" id="pcount"></p></div></div>' +
    '<div class="ppl-cols"><div class="ppl-main">' +
    '<div class="toolbar"><label class="field"><span>' + ic('search', 16) + '</span><input id="pq" type="search" placeholder="Filter by name, school, employer, skill" value="' + esc(f.q) + '" autocomplete="off"></label>' +
    chips('tier', [['all', 'Any tier'], ['vetted', 'Vetted'], ['associate', 'Associate'], ['open', 'Open'], ['none', 'Untiered']], f.tier) +
    '<div class="tool-r">' +
    '<button type="button" class="btn ghost sm" data-act="morefilters">' + ic('filter', 14) + 'More' + ((f.rel || f.group) ? ' <em>' + ((f.rel ? 1 : 0) + (f.group ? 1 : 0)) + '</em>' : '') + '</button>' +
    '<button type="button" class="btn ghost sm" data-act="ptcols">' + ic('settings', 14) + 'Columns</button>' +
    '<button type="button" class="btn ghost sm" data-act="pplside" aria-expanded="' + (sideOpen(f.side) ? 'true' : 'false') + '">Counts</button></div></div>' +
    '<div class="plist" id="plist"></div></div>' +
    (sideOpen(f.side) ? pplSideHTML(f) : '') + '</div></div>';
  paintPeople();
  ptAttach();
}
/* People as a table: one row per person, sortable headers, managed columns
   (PT_ALL / ptCols further down: order + visibility persist on this device).
   Cells show only what the profile has; blanks stay blank. */
function ptheadHTML(){
  var ts = S.ppl.ts || { k:'name', d:1 };
  return '<thead><tr>' + ptVisibleCols().map(function(c){
    var on = ts.k === c.k;
    return '<th class="' + (c.num ? 'num' : '') + (on ? ' on' : '') + '" data-act="tsort" data-k="' + c.k + '" tabindex="0" aria-sort="' + (on ? (ts.d < 0 ? 'descending' : 'ascending') : 'none') + '" title="Sort by ' + c.label.toLowerCase() + '">' + c.label + '<span class="sarr" aria-hidden="true">' + (on ? (ts.d < 0 ? '▾' : '▴') : '') + '</span></th>';
  }).join('') + '</tr></thead>';
}
function ptierCell(e){
  var t = tierOf(e);
  if(t && TIERS[t]) return '<span class="ptier"><i style="background:' + TIERS[t].c + '"></i>' + TIERS[t].n + '</span>';
  return '<span class="ptier none"><i style="background:' + RING_C[3] + '"></i>No tier yet</span>';
}
function ptrowHTML(di, i){
  var e = D.directory[di];
  var tds = ptVisibleCols().map(function(c){
    var ed = PT_ED[c.k];
    return '<td class="c-' + c.k + (c.num ? ' num' : '') + '"' + (ed ? ' data-ed="' + ed + '" data-di="' + di + '" tabindex="0"' : '') + '>' + PTCELL[c.k](e, di) + '</td>';
  }).join('');
  return '<tr class="ptrow" data-act="popen" data-di="' + di + '" data-i="' + i + '" tabindex="0">' + tds + '</tr>';
}
function paintPeople(){
  var box = $('#plist'); if(!box) return;
  var dis = peopleFiltered();
  S.ppl.cur = dis;
  box.innerHTML = (dis.length ? '<div class="ptwrap"><table class="ptable">' + ptheadHTML() + '<tbody>' + dis.map(function(di, i){ return ptrowHTML(di, i); }).join('') + '</tbody></table></div>' : '') +
    (!dis.length ? emptyState('No one matches.', 'Loosen a filter or clear the search.') : '');
  var c = $('#pcount'); if(c) c.textContent = dis.length === people().length ? dis.length + ' people' : dis.length + ' of ' + people().length + ' people';
}
function openMoreFilters(){
  var f = S.ppl, groups = Object.keys(allGroups()).sort();
  openSheet('More filters',
    '<label class="lab">Instagram relationship</label>' + '<div class="chips">' + [['', 'Any'], ['mutual', 'Mutual'], ['following', 'Following'], ['follower', 'Follower']].map(function(o){
      return '<button type="button" class="fc' + (f.rel === o[0] ? ' on' : '') + '" data-act="pf2" data-k="rel" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>' +
    '<label class="lab">Group</label><div class="chips">' + [''].concat(groups).map(function(g){
      return '<button type="button" class="fc' + (f.group === g ? ' on' : '') + '" data-act="pf2" data-k="group" data-v="' + esc(g) + '">' + (g ? esc(g) : 'Any') + '</button>'; }).join('') + '</div>' +
    '<div class="row end"><button type="button" class="btn ghost" data-act="pclear">Clear all filters</button><button type="button" class="btn primary" data-act="sheetx">Done</button></div>', { focus:false });
}

/* ---------- People table: managed columns + in-place cell editing ----------
   Shift-click a cell (or long-press on touch) to edit it in place. Every save
   goes through the same write path as the profile editor: setField for plain
   text fields, txn + queuePatch for tier / tags / groups. Known associates is
   computed from the graph and is never editable; Handle and Last updated are
   identity / server-stamped and stay read-only too. Column order + visibility
   persist in localStorage (ncc_pt_cols). */
var PT_ALL = [
  { k:'name',     label:'Name' },
  { k:'tier',     label:'Tier' },
  { k:'loc',      label:'Location on file' },
  { k:'orgs',     label:'Organizations' },
  { k:'assoc',    label:'Known associates', num:true },
  { k:'skills',   label:'Skills' },
  { k:'rel',      label:'Relationship' },
  { k:'handle',   label:'Handle' },
  { k:'groups',   label:'Groups' },
  { k:'years',    label:'Years known', num:true },
  { k:'phone',    label:'Phone' },
  { k:'email',    label:'Email' },
  { k:'updated',  label:'Last updated', num:true }
];
var PT_DEF_ON = { name:1, tier:1, loc:1, orgs:1, assoc:1, skills:1 };
var PT_NUMDIR = { assoc:1, years:1, updated:1 };   /* first click on these sorts high-to-low */
var PT_ED = { name:'name', tier:'tier', loc:'loc', orgs:'orgs', skills:'skills', rel:'rel', groups:'groups', years:'years', phone:'phone', email:'email' };
var PT_SEED_TOWNS = ['Potsdam, NY','Canton, NY','Massena, NY','Norwood, NY','Norfolk, NY','Madrid, NY','Waddington, NY','Ogdensburg, NY','Gouverneur, NY','Lisbon, NY','Colton, NY','South Colton, NY','Parishville, NY','Hopkinton, NY','Brasher Falls, NY','Winthrop, NY','Hammond, NY','Heuvelton, NY','Hermon, NY','DeKalb Junction, NY','Rensselaer Falls, NY','Pierrepont, NY','Hannawa Falls, NY','West Potsdam, NY','West Stockholm, NY','Louisville, NY','Morristown, NY','Star Lake, NY','Cranberry Lake, NY','Edwards, NY','Russell, NY','Chase Mills, NY','North Lawrence, NY','Nicholville, NY','Lawrence, NY','Helena, NY','Raymondville, NY','Richville, NY','Fine, NY','Newton Falls, NY','Fort Jackson, NY','Malone, NY','Tupper Lake, NY','Saranac Lake, NY','Chateaugay, NY','Brushton, NY','St. Regis Falls, NY','Moira, NY','Bombay, NY','Fort Covington, NY','Hogansburg, NY','Paul Smiths, NY','Watertown, NY','Clayton, NY','Alexandria Bay, NY','Cape Vincent, NY','Theresa, NY','Philadelphia, NY','Evans Mills, NY','Adams, NY','Sackets Harbor, NY','Carthage, NY','Dexter, NY','Chaumont, NY','Lowville, NY','Croghan, NY','Turin, NY','Port Leyden, NY','Lyons Falls, NY','Copenhagen, NY','Plattsburgh, NY','Peru, NY','Chazy, NY','Rouses Point, NY','Dannemora, NY','Champlain, NY','Keeseville, NY','Inlet, NY','Old Forge, NY','Raquette Lake, NY','Eagle Bay, NY','Hauppauge, NY','Queens, NY','Farmingville, NY','Smithtown, NY','West Sayville, NY','Huntington, NY','Massapequa, NY'];
var PT_SEED_ORGS = {
  universities: ['SUNY Potsdam','Clarkson University','St. Lawrence University','SUNY Canton','Potsdam Central School','Hugh C. Williams Senior High School','Massena Central High School','Norwood-Norfolk Central School','Madrid-Waddington Central School','Ogdensburg Free Academy','Gouverneur Central School','Lisbon Central School','Colton-Pierrepont Central School','Parishville-Hopkinton Central School','St. Lawrence Central School','Edwards-Knox Central School','Hermon-DeKalb Central School','Clifton-Fine Central School','Hammond Central School','Heuvelton Central School','Morristown Central School'],
  companies: ['Canton-Potsdam Hospital','Claxton-Hepburn Medical Center','Massena Hospital'],
  churches: []
};
function ptHandle(e){ return effHandle(e); }
/* Location on file (Sheet column, JD 2026-10-15) is the person's single
   location: when set it wins over the derived city/hometown everywhere. */
function ptLocVal(e){ return gv(e, 'location_on_file') || gv(e, 'city') || gv(e, 'hometown') || ''; }
var PTCELL = {
  name: function(e){
    var sub = [cap(gv(e, 'relationship')), effHandle(e) ? '@' + effHandle(e) : ''].filter(Boolean).join(' · ');
    return '<div class="cname-in">' + avatar(e, 'md') + '<span class="pn"><b>' + esc(dispName(e)) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span></div>';
  },
  tier: function(e){ return ptierCell(e); },
  loc: function(e){ return esc(ptLocVal(e)); },
  orgs: function(e){ var o = orgsOf(e); return '<span class="clip" title="' + esc(o.join(', ')) + '">' + esc(o.slice(0, 2).join(', ')) + '</span>'; },
  assoc: function(e){ return String(knownAssociates(e).length); },
  skills: function(e){ var s = tagList(gv(e, 'specialty')); return '<span class="clip" title="' + esc(s.join(', ')) + '">' + esc(s.slice(0, 2).join(', ')) + '</span>'; },
  rel: function(e){ return esc(cap(gv(e, 'relationship'))); },
  handle: function(e){ var h = ptHandle(e); return h ? '@' + esc(h) : ''; },
  groups: function(e){ var g = personGroups(e); return '<span class="clip" title="' + esc(g.join(', ')) + '">' + esc(g.slice(0, 2).join(', ')) + '</span>'; },
  years: function(e){ var y = knownSinceYear(e); return y ? String(y) : ''; },
  phone: function(e){ var p = gv(e, 'phone'); return p ? esc(fmtPhone(p)) : ''; },
  email: function(e){ return esc(gv(e, 'email')); },
  updated: function(e){ var u = raw(e, 'updated_at'); return u ? esc(String(u).slice(0, 10)) : ''; }
};
/* column state: [{k, on}] in display order */
var PTC = null;
function ptCols(){
  if(PTC) return PTC;
  var saved = null;
  try{ saved = JSON.parse(store('ncc_pt_cols') || 'null'); }catch(x){}
  var out = [], seen = {};
  if(Array.isArray(saved)) saved.forEach(function(s){
    if(s && ptColDef(s.k) && !seen[s.k]){ seen[s.k] = 1; out.push({ k:s.k, on:!!s.on }); }
  });
  PT_ALL.forEach(function(c){ if(!seen[c.k]) out.push({ k:c.k, on:!!PT_DEF_ON[c.k] }); });
  if(!out.some(function(c){ return c.on; })) out[0].on = true;
  PTC = out;
  return out;
}
function ptColDef(k){ for(var i = 0; i < PT_ALL.length; i++) if(PT_ALL[i].k === k) return PT_ALL[i]; return null; }
function ptVisibleCols(){ return ptCols().filter(function(c){ return c.on; }).map(function(c){ return ptColDef(c.k); }); }
function ptSaveCols(){ store('ncc_pt_cols', JSON.stringify(ptCols())); }
function ptColsSheet(){
  var cols = ptCols(), onCount = cols.filter(function(c){ return c.on; }).length;
  openSheet('Columns',
    '<p class="note">Show, hide and reorder the table columns. The layout is remembered on this device.</p>' +
    cols.map(function(c, i){
      var def = ptColDef(c.k);
      return '<div class="ptcm-row"><span class="ptcm-name">' + esc(def.label) + '</span><span class="ptcm-btns">' +
        '<button type="button" class="ib sm" data-act="ptmv" data-k="' + c.k + '" data-d="-1" aria-label="Move ' + esc(def.label) + ' up"' + (i === 0 ? ' disabled' : '') + '>' + ic('chevu', 14) + '</button>' +
        '<button type="button" class="ib sm" data-act="ptmv" data-k="' + c.k + '" data-d="1" aria-label="Move ' + esc(def.label) + ' down"' + (i === cols.length - 1 ? ' disabled' : '') + '>' + ic('chev', 14) + '</button>' +
        '<button type="button" class="btn ghost sm' + (c.on ? ' on' : '') + '" data-act="ptvis" data-k="' + c.k + '"' + (c.on && onCount === 1 ? ' disabled' : '') + '>' + (c.on ? 'Shown' : 'Hidden') + '</button>' +
        '</span></div>';
    }).join('') +
    '<p class="note">Tip: Shift-click any cell (except Known associates, Handle and Last updated) to edit it in place. On a touch screen, press and hold the cell.</p>', { focus:false });
}
/* ----- autocomplete: live directory values first, seeded county values added ----- */
function ptDedupe(list){
  var seen = {}, out = [];
  list.forEach(function(x){ x = String(x || '').trim(); if(x && !seen[x.toLowerCase()]){ seen[x.toLowerCase()] = 1; out.push(x); } });
  return out;
}
/* ----- location normalization (JD 2026-10-15): one canonical "Town, ST" form.
   Mirrors _norm_loc in scripts/build_dossier_data.py so a value typed or picked
   in the table is normalized before it is queued, and the suggestion pool only
   ever offers normalized values. ----- */
var PT_STATE_CODES = {alabama:'AL',alaska:'AK',arizona:'AZ',arkansas:'AR',california:'CA',colorado:'CO',connecticut:'CT',delaware:'DE','district of columbia':'DC',florida:'FL',georgia:'GA',hawaii:'HI',idaho:'ID',illinois:'IL',indiana:'IN',iowa:'IA',kansas:'KS',kentucky:'KY',louisiana:'LA',maine:'ME',maryland:'MD',massachusetts:'MA',michigan:'MI',minnesota:'MN',mississippi:'MS',missouri:'MO',montana:'MT',nebraska:'NE',nevada:'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND',ohio:'OH',oklahoma:'OK',oregon:'OR',pennsylvania:'PA','rhode island':'RI','south carolina':'SC','south dakota':'SD',tennessee:'TN',texas:'TX',utah:'UT',vermont:'VT',virginia:'VA',washington:'WA','west virginia':'WV',wisconsin:'WI',wyoming:'WY','puerto rico':'PR',guam:'GU','american samoa':'AS','u.s. virgin islands':'VI','us virgin islands':'VI','northern mariana islands':'MP'};
var PT_STATE_CODE_SET = {}; Object.keys(PT_STATE_CODES).forEach(function(k){ PT_STATE_CODE_SET[PT_STATE_CODES[k]] = 1; });
function ptLocTitleWord(w){
  if(!w || w.indexOf('.') >= 0) return w;
  if(w === w.toUpperCase() || w === w.toLowerCase()){
    var lw = w.toLowerCase();
    if(lw.indexOf('mc') === 0 && lw.length > 2) return 'Mc' + lw.charAt(2).toUpperCase() + lw.slice(3);
    return lw.charAt(0).toUpperCase() + lw.slice(1);
  }
  return w;
}
function ptLocTown(s){
  var particles = {de:1, la:1, del:1, van:1, von:1, der:1, di:1, le:1, da:1, dos:1, das:1};
  return String(s || '').trim().split(' ').filter(Boolean).map(function(tok, ix){
    if(ix > 0 && particles[tok.toLowerCase()]) return tok.toLowerCase();
    return tok.split('-').map(ptLocTitleWord).join('-');
  }).join(' ');
}
function ptLocTail(seg){
  var s = String(seg || '').trim().replace(/^"+|"+$/g, '');
  s = s.replace(/\([^)]*\)/g, ' ');
  if(s.indexOf('(') >= 0) s = s.split('(')[0];
  s = s.replace(/"/g, '');
  s = s.replace(/\s+/g, ' ').trim().replace(/\.+$/, '').replace(/,+$/, '').trim();
  var low = s.toLowerCase();
  if(!s || low === 'not listed' || low === 'none' || low === 'n/a' || low === 'na' || low === 'unknown' || low === 'not available' || low === 'not specified' || s === '-' || low.indexOf('not listed') === 0) return '';
  if(s.indexOf(',') < 0){
    var mdc = s.match(/^(.+?)\s+D\.?C\.?$/i);
    if(mdc) return ptLocTown(mdc[1]) + ', DC';
    var m2 = s.match(/^(.+?)\s+([A-Za-z]{2})$/);
    if(m2 && PT_STATE_CODE_SET[m2[2].toUpperCase()]) return ptLocTown(m2[1]) + ', ' + m2[2].toUpperCase();
    var words = s.split(' ');
    for(var n = 3; n >= 1; n--){
      if(words.length > n){
        var sc = PT_STATE_CODES[words.slice(words.length - n).join(' ').toLowerCase()];
        if(sc) return ptLocTown(words.slice(0, words.length - n).join(' ')) + ', ' + sc;
      }
    }
    return null;
  }
  var town = ptLocTown(s.split(',')[0]);
  if(!town) return null;
  var segs = s.slice(s.indexOf(',') + 1).split(',').map(function(x){ return x.trim(); }).filter(Boolean);
  for(var j = 0; j < segs.length; j++){
    var code = PT_STATE_CODES[segs[j].toLowerCase()] || (segs[j].length === 2 && PT_STATE_CODE_SET[segs[j].toUpperCase()] ? segs[j].toUpperCase() : null);
    if(code) return town + ', ' + code;
  }
  return segs.length ? town + ', ' + ptLocTown(segs[segs.length - 1]) : null;
}
function ptNormLoc(raw, kind){
  var s = String(raw == null ? '' : raw).trim();
  if(!s) return '';
  var labeled = {}, firstLabelAt = -1, m;
  var re = /\b(current city|lives in|city|hometown|from)\s*:\s*([^;|]+)/gi;
  while((m = re.exec(s))){
    var lab = m[1].toLowerCase();
    if(!(lab in labeled)) labeled[lab] = m[2].trim();
    if(firstLabelAt < 0) firstLabelAt = m.index;
  }
  var cut = s.length;
  [';', '|'].forEach(function(sep){ var i = s.indexOf(sep); if(i >= 0 && i < cut) cut = i; });
  if(firstLabelAt >= 0 && firstLabelAt < cut) cut = firstLabelAt;
  var base = s.slice(0, cut).trim();
  var pref = kind === 'hometown' ? ['hometown', 'from'] : ['current city', 'city', 'lives in'];
  var cands = [];
  pref.forEach(function(p){ if(labeled[p]) cands.push(labeled[p]); });
  if(base) cands.push(base);
  for(var i = 0; i < cands.length; i++){
    var r = ptLocTail(cands[i]);
    if(r === null){
      var keep = cands[i].replace(/\([^)]*\)/g, ' ');
      if(keep.indexOf('(') >= 0) keep = keep.split('(')[0];
      return keep.replace(/\s+/g, ' ').trim().replace(/\.+$/, '').trim();
    }
    if(r === '') continue;
    return r;
  }
  return '';
}
function ptDedupeTowns(list){
  var out = ptDedupe(list), withState = {};
  out.forEach(function(x){ var i = x.indexOf(','); if(i > 0) withState[x.slice(0, i).trim().toLowerCase()] = 1; });
  return out.filter(function(x){ return x.indexOf(',') >= 0 || !withState[x.trim().toLowerCase()]; });
}
function ptSugList(kind, catK){
  if(kind === 'town'){
    var vals = [];
    D.directory.forEach(function(e){ var c = ptNormLoc(gv(e, 'city')), h = ptNormLoc(gv(e, 'hometown'), 'hometown'), lf = ptNormLoc(gv(e, 'location_on_file')); if(c) vals.push(c); if(h) vals.push(h); if(lf) vals.push(lf); });
    return ptDedupeTowns(vals.concat(PT_SEED_TOWNS.map(function(x){ return ptNormLoc(x); }))).sort(function(a, b){ return a.localeCompare(b); });
  }
  if(kind === 'org'){
    var ov = [];
    D.directory.forEach(function(e){ tagList(gv(e, catK)).forEach(function(x){ ov.push(x); }); });
    var cat = null; ORG_CATS.forEach(function(c){ if(c.k === catK) cat = c; });
    return ptDedupe(ov.concat(cat ? cat.options : []).concat(PT_SEED_ORGS[catK] || [])).sort(function(a, b){ return a.localeCompare(b); });
  }
  if(kind === 'skill'){
    var sv = [];
    D.directory.forEach(function(e){ tagList(gv(e, 'specialty')).forEach(function(x){ sv.push(x); }); });
    SKILL_TAXONOMY.forEach(function(g){ sv.push(g.cat); g.skills.forEach(function(s){ sv.push(s); }); });
    return ptDedupe(sv).sort(function(a, b){ return a.localeCompare(b); });
  }
  if(kind === 'year'){
    var ys = {};
    D.directory.forEach(function(e){ var y = knownSinceYear(e); if(y) ys[y] = 1; });
    return Object.keys(ys).sort(function(a, b){ return b - a; });
  }
  return [];
}
function ptAcWire(inp, list, onPick){
  var wrap = inp.parentNode, box = wrap ? $('.pted-ac', wrap) : null;
  if(!box) return;
  var hits = [], act = -1;
  function hide(){ box.hidden = true; box.innerHTML = ''; hits = []; act = -1; }
  function mark(){
    $$('.pted-aci', box).forEach(function(b, i){
      b.classList.toggle('on', i === act);
      if(i === act && b.scrollIntoView) b.scrollIntoView({ block:'nearest' });
    });
  }
  function pick(v){ onPick(v); hide(); }
  function show(){
    var q = inp.value.trim().toLowerCase();
    if(!q){ hide(); return; }
    hits = list.filter(function(x){ return x.toLowerCase().indexOf(q) >= 0; });
    hits.sort(function(a, b){
      var as = a.toLowerCase().indexOf(q) === 0 ? 0 : 1, bs = b.toLowerCase().indexOf(q) === 0 ? 0 : 1;
      return as - bs || a.localeCompare(b);
    });
    hits = hits.slice(0, 8);
    if(!hits.length){ hide(); return; }
    box.innerHTML = hits.map(function(h){ return '<button type="button" class="pted-aci" data-v="' + esc(h) + '" title="' + esc(h) + '">' + esc(h) + '</button>'; }).join('');
    box.hidden = false;
    act = 0;   /* first match pre-highlighted: Enter picks it */
    $$('.pted-aci', box).forEach(function(b, i){
      var fired = false;
      function go(ev){ if(fired) return; fired = true; ev.preventDefault(); pick(b.getAttribute('data-v')); }
      b.addEventListener('pointerdown', go);   /* lands before the input's blur on touch, so the pick always registers */
      b.addEventListener('mousedown', go);
      b.addEventListener('mouseenter', function(){ act = i; mark(); });
    });
    mark();
    ptEdFit();
  }
  inp.addEventListener('input', show);
  inp.addEventListener('focus', show);
  inp.addEventListener('blur', function(){ setTimeout(hide, 150); });
  /* keyboard, on the wrapper in capture phase so it runs before the field's
     own Enter/Escape handlers: arrows move the highlight, Enter picks the
     highlighted match, Escape closes the list (focus stays in the field),
     Tab just closes. When the list is closed nothing is intercepted. */
  wrap.addEventListener('keydown', function(ev){
    if(ev.target !== inp) return;
    var open = !box.hidden && hits.length > 0;
    if(ev.key === 'ArrowDown' || ev.key === 'ArrowUp'){
      ev.preventDefault(); ev.stopPropagation();
      if(!open){ show(); return; }
      act = (act + (ev.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length; mark();
    }
    else if(ev.key === 'Home' || ev.key === 'End'){
      if(open){ ev.preventDefault(); ev.stopPropagation(); act = ev.key === 'Home' ? 0 : hits.length - 1; mark(); }
    }
    else if(ev.key === 'Enter'){
      if(open && act >= 0){ ev.preventDefault(); ev.stopPropagation(); pick(hits[act]); }
    }
    else if(ev.key === 'Escape'){
      if(open){ ev.preventDefault(); ev.stopPropagation(); hide(); }
    }
    else if(ev.key === 'Tab'){ hide(); }
  }, true);
}
/* ----- the cell editor popover ----- */
var PTED = null;   /* { di, k, dirty, swallow } */
function ptEdFit(){
  var pop = $('#pted'); if(!pop) return;
  var r = pop.getBoundingClientRect();
  var x = Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8));
  var y = Math.max(8, Math.min(r.top, window.innerHeight - r.height - 8));
  pop.style.left = x + 'px'; pop.style.top = y + 'px';
}
function ptEditClose(){
  if(!PTED) return;
  var el = $('#pted'); if(el) el.remove();
  document.removeEventListener('mousedown', ptEdOutside, true);
  var dirty = PTED.dirty, kb = PTED.kb, cdi = PTED.di, ck = PTED.k, cell = PTED.cell;
  PTED = null;
  if(dirty) paintPeople();
  if(kb){   /* opened from the keyboard: hand focus back to the cell */
    var t = (cell && cell.isConnected) ? cell : null;
    if(!t){ var ed = PT_ED[ck]; if(ed) t = $('#plist td[data-di="' + cdi + '"][data-ed="' + ed + '"]'); }
    if(t) t.focus();
  }
}
function ptEdOutside(ev){ if(PTED && !(ev.target.closest && ev.target.closest('#pted'))) ptEditClose(); }
addEventListener('scroll', function(ev){ if(PTED && !(ev.target && ev.target.closest && ev.target.closest('#pted'))) ptEditClose(); }, true);
addEventListener('resize', function(){ ptEditClose(); });
function ptTextEd(v, ph){
  return '<div class="pted-add"><input id="pted-in" value="' + esc(v) + '" placeholder="' + esc(ph || '') + '" autocomplete="off"><div class="pted-ac" hidden></div></div>' +
    '<div class="pted-f"><button type="button" class="btn ghost sm" data-x="cancel">Cancel</button><button type="button" class="btn primary sm" data-x="save">Save</button></div>';
}
function ptChipEd(di, k, fieldK){
  var e = D.directory[di], cur = splitTags(gv(e, fieldK), ', ');
  return '<div class="tags">' + cur.map(function(x){
      return '<span class="tchip on">' + esc(x) + '<button type="button" data-rm="' + esc(x) + '" aria-label="Remove ' + esc(x) + '">' + ic('x', 11) + '</button></span>';
    }).join('') + '</div>' +
    '<div class="pted-add"><input class="pted-addin" data-cat="' + fieldK + '" placeholder="Add" autocomplete="off"><div class="pted-ac" hidden></div></div>';
}
function ptEdHTML(di, k){
  var e = D.directory[di];
  if(k === 'name') return '<div class="pted-h">Name</div>' + ptTextEd(dispName(e), 'Full name');
  if(k === 'tier'){
    var cur = tierOf(e);
    var opts = TIER_ORDER.map(function(t){ return [t, TIERS[t].n, TIERS[t].c]; }).concat([['', 'No tier yet', RING_C[3]]]);
    return '<div class="pted-h">Tier</div><div class="pted-opts">' + opts.map(function(o){
      return '<button type="button" class="pted-opt' + (cur === o[0] ? ' on' : '') + '" data-v="' + o[0] + '"><i style="background:' + o[2] + '"></i>' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  if(k === 'rel'){
    var rc = gv(e, 'relationship');
    var ropts = [['', 'Not set']].concat(REL_OPTS.map(function(r){ return [r, cap(r)]; }));
    return '<div class="pted-h">Relationship</div><div class="pted-opts">' + ropts.map(function(o){
      return '<button type="button" class="pted-opt' + (rc === o[0] ? ' on' : '') + '" data-v="' + o[0] + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  if(k === 'loc'){
    return '<div class="pted-h">Location on file</div><p class="pted-note">One location for this person — it replaces the Facebook-derived place everywhere. Clear it to go back to the derived place.</p>' + ptTextEd(gv(e, 'location_on_file'), ptLocVal(e) || 'Town');
  }
  if(k === 'years') return '<div class="pted-h">Known since</div>' + ptTextEd(knownSinceYear(e) ? String(knownSinceYear(e)) : '', 'Year, e.g. 2019');
  if(k === 'phone') return '<div class="pted-h">Phone</div>' + ptTextEd(gv(e, 'phone'), 'Phone number');
  if(k === 'email') return '<div class="pted-h">Email</div>' + ptTextEd(gv(e, 'email'), 'Email address');
  if(k === 'orgs'){
    return '<div class="pted-h">Organizations</div>' + ORG_CATS.map(function(c){
      return '<div class="pted-sec"><label class="lab">' + c.label + '</label>' + ptChipEd(di, k, c.k) + '</div>';
    }).join('') + '<div class="pted-f"><button type="button" class="btn primary sm" data-x="done">Done</button></div>';
  }
  if(k === 'skills'){
    return '<div class="pted-h">Skills</div>' + ptChipEd(di, k, 'specialty') +
      '<div class="pted-f"><button type="button" class="btn primary sm" data-x="done">Done</button></div>';
  }
  if(k === 'groups'){
    var mine = personGroups(e), all = Object.keys(allGroups()).sort();
    return '<div class="pted-h">Groups</div><div class="tags">' + all.map(function(g){
      return '<button type="button" class="tchip tog' + (mine.indexOf(g) >= 0 ? ' on' : '') + '" data-gtog="' + esc(g) + '">' + esc(g) + '</button>';
    }).join('') + '</div>' +
    '<div class="pted-add"><input id="pted-grpnew" placeholder="New group" autocomplete="off"></div>' +
    '<div class="pted-f"><button type="button" class="btn primary sm" data-x="done">Done</button></div>';
  }
  return '';
}
function ptTagsMutate(di, fieldK, mutate){
  var e = D.directory[di], arr = splitTags(gv(e, fieldK), ', ');
  arr = mutate(arr.slice());
  txn('Edit ' + fieldK, function(){ var o = {}; o[fieldK] = arr.join(', '); queuePatch(di, o); });
  if(PTED) PTED.dirty = true;
}
function ptEdRefresh(focusCat){
  if(!PTED) return;
  var pop = $('#pted'); if(!pop) return;
  pop.innerHTML = ptEdHTML(PTED.di, PTED.k);
  ptEdWire(pop, PTED.di, PTED.k);
  if(focusCat){ var inp = $('.pted-addin[data-cat="' + focusCat + '"]', pop); if(inp) inp.focus(); }
}
function ptCommitText(){
  if(!PTED) return;
  var di = PTED.di, k = PTED.k, inp = $('#pted-in'); if(!inp) return;
  var v = inp.value.trim(), e = D.directory[di];
  if(k === 'name'){
    if(!v || v === dispName(e)){ ptEditClose(); return; }
    var parts = v.split(/\s+/);
    setField(di, 'first_name', parts[0]);
    setField(di, 'last_name', parts.slice(1).join(' '));
  }
  else if(k === 'loc') setField(di, 'location_on_file', ptNormLoc(v));
  else if(k === 'years'){
    if(v && !audYearOk(v)){ inp.classList.add('bad'); inp.focus(); inp.select(); return; }
    setField(di, 'years_known', v);
  }
  else if(k === 'phone') setField(di, 'phone', v);
  else if(k === 'email') setField(di, 'email', v);
  if(PTED) PTED.dirty = true;
  ptEditClose();
}
function ptEdWire(pop, di, k){
  var cancel = $('[data-x="cancel"]', pop); if(cancel) cancel.addEventListener('click', function(){ ptEditClose(); });
  var done = $('[data-x="done"]', pop); if(done) done.addEventListener('click', function(){ ptEditClose(); });
  var save = $('[data-x="save"]', pop); if(save) save.addEventListener('click', function(){ ptCommitText(); });
  pop.addEventListener('keydown', function(ev){
    if(ev.key === 'Escape'){ ev.stopPropagation(); ptEditClose(); }
  });
  if(k === 'tier' || k === 'rel'){
    $$('.pted-opt', pop).forEach(function(b){
      b.addEventListener('click', function(){
        var v = b.getAttribute('data-v'), e = D.directory[di];
        if(k === 'tier') txn('Set tier', function(){ queuePatch(di, { tier:v }); });
        else {
          var cur = gv(e, 'relationship'), next = (v && v === cur) ? '' : v;
          txn('Set relationship', function(){ queuePatch(di, { relationship:next }); });
        }
        if(PTED) PTED.dirty = true;
        ptEditClose();
      });
    });
    return;
  }
  if(k === 'orgs' || k === 'skills'){
    $$('[data-rm]', pop).forEach(function(b){
      b.addEventListener('click', function(){
        var sec = b.closest('.pted-sec'), inp2 = sec ? $('.pted-addin', sec) : $('.pted-addin', pop);
        var fieldK = inp2 ? inp2.getAttribute('data-cat') : 'specialty', val = b.getAttribute('data-rm');
        ptTagsMutate(di, fieldK, function(a){ return a.filter(function(x){ return x !== val; }); });
        ptEdRefresh(fieldK);
      });
    });
    $$('.pted-addin', pop).forEach(function(inp){
      var fieldK = inp.getAttribute('data-cat');
      var list = ptSugList(k === 'orgs' ? 'org' : 'skill', fieldK);
      function addVal(val){
        val = String(val || '').trim(); if(!val) return;
        ptTagsMutate(di, fieldK, function(a){
          if(a.map(function(x){ return x.toLowerCase(); }).indexOf(val.toLowerCase()) < 0) a.push(val);
          return a;
        });
        ptEdRefresh(fieldK);
      }
      inp.addEventListener('keydown', function(ev){ if(ev.key === 'Enter'){ ev.preventDefault(); addVal(inp.value); } });
      ptAcWire(inp, list, addVal);
    });
    return;
  }
  if(k === 'groups'){
    $$('[data-gtog]', pop).forEach(function(b){
      b.addEventListener('click', function(){
        var g = b.getAttribute('data-gtog'), e = D.directory[di], gl = personGroups(e), gi = gl.indexOf(g);
        if(gi >= 0) gl.splice(gi, 1); else gl.push(g);
        txn('Edit groups', function(){ setPersonGroups(di, gl); });
        if(PTED) PTED.dirty = true;
        ptEdRefresh();
      });
    });
    var gn = $('#pted-grpnew', pop);
    if(gn) gn.addEventListener('keydown', function(ev){
      if(ev.key !== 'Enter') return;
      ev.preventDefault();
      var n = gn.value.trim(); if(!n) return;
      if(!allGroups()[n]){ GRP_EXTRA.push(n); store('ncc_groups_extra', JSON.stringify(GRP_EXTRA)); }
      var e = D.directory[di], gl = personGroups(e);
      if(gl.indexOf(n) < 0){ gl.push(n); txn('Edit groups', function(){ setPersonGroups(di, gl); }); if(PTED) PTED.dirty = true; }
      ptEdRefresh();
    });
    return;
  }
  /* single-value text editors */
  var inp = $('#pted-in', pop);
  if(inp){
    inp.addEventListener('input', function(){ inp.classList.remove('bad'); });
    inp.addEventListener('keydown', function(ev){ if(ev.key === 'Enter'){ ev.preventDefault(); ptCommitText(); } });
    if(k === 'loc') ptAcWire(inp, ptSugList('town'), function(v){ inp.value = v; inp.focus(); });
    else if(k === 'years') ptAcWire(inp, audYearList(), function(v){ inp.value = v; inp.focus(); });
  }
}
function ptEditOpen(di, k, cell, kb){
  ptEditClose();
  var e = D.directory[di]; if(!e) return;
  var pop = document.createElement('div');
  pop.id = 'pted'; pop.className = 'pted'; pop.setAttribute('role', 'dialog'); pop.tabIndex = -1;
  pop.innerHTML = ptEdHTML(di, k);
  pop.style.visibility = 'hidden';
  document.body.appendChild(pop);
  PTED = { di:di, k:k, dirty:false, swallow:false, cell:cell || null, kb:!!kb };
  document.addEventListener('mousedown', ptEdOutside, true);
  var r = cell.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  var x = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
  var y = r.bottom + 6;
  if(y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 6);
  pop.style.left = x + 'px'; pop.style.top = y + 'px'; pop.style.visibility = '';
  ptEdWire(pop, di, k);
  ptEdFit();
  var inp = $('input', pop);
  if(inp){ inp.focus(); if(inp.id === 'pted-in') inp.select(); }
  else pop.focus();
}
/* table gestures: shift-click edits; a plain click still opens the profile.
   Touch: press-and-hold (500ms, steady) opens the same editor and swallows
   the click that follows so the profile does not open underneath it. */
function ptAttach(){
  var box = $('#plist'); if(!box || box._ptw) return;
  box._ptw = 1;
  box.addEventListener('click', function(ev){
    if(PTED && PTED.swallow){ PTED.swallow = false; ev.stopPropagation(); ev.preventDefault(); return; }
    if(!ev.shiftKey) return;
    var td = ev.target.closest ? ev.target.closest('td') : null;
    if(!td || !td.closest('tr.ptrow')) return;
    ev.stopPropagation(); ev.preventDefault();
    if(td.getAttribute('data-ed')) ptEditOpen(+td.getAttribute('data-di'), td.getAttribute('data-ed'), td);
  }, true);
  /* keyboard: Enter/Space on an editable cell opens its editor; arrows walk
     the editable cells (left/right in reading order, up/down a row's worth) */
  box.addEventListener('keydown', function(ev){
    var td = ev.target.closest ? ev.target.closest('td[data-ed]') : null;
    if(!td || ev.target !== td) return;
    var k = ev.key;
    if(k === 'Enter' || k === ' '){
      ev.preventDefault(); ev.stopPropagation();
      ptEditOpen(+td.getAttribute('data-di'), td.getAttribute('data-ed'), td, true);
      return;
    }
    if(k === 'ArrowRight' || k === 'ArrowLeft' || k === 'ArrowDown' || k === 'ArrowUp'){
      ev.preventDefault();
      var cells = $$('td[data-ed]', box), i = cells.indexOf(td); if(i < 0) return;
      var per = $$('td[data-ed]', td.parentNode).length || 1;
      var step = k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : k === 'ArrowDown' ? per : -per;
      var n = cells[i + step]; if(n) n.focus();
    }
  });
  var lpT = null, lpX = 0, lpY = 0;
  box.addEventListener('pointerdown', function(ev){
    if(ev.pointerType !== 'touch') return;
    var td = ev.target.closest ? ev.target.closest('td[data-ed]') : null;
    if(!td) return;
    lpX = ev.clientX; lpY = ev.clientY;
    if(lpT) clearTimeout(lpT);
    lpT = setTimeout(function(){
      lpT = null;
      ptEditOpen(+td.getAttribute('data-di'), td.getAttribute('data-ed'), td);
      if(PTED){ PTED.swallow = true; setTimeout(function(){ if(PTED) PTED.swallow = false; }, 1200); }
    }, 500);
  });
  ['pointerup', 'pointercancel'].forEach(function(tn){
    box.addEventListener(tn, function(){ if(lpT){ clearTimeout(lpT); lpT = null; } });
  });
  box.addEventListener('pointermove', function(ev){
    if(lpT && (Math.abs(ev.clientX - lpX) > 10 || Math.abs(ev.clientY - lpY) > 10)){ clearTimeout(lpT); lpT = null; }
  });
}
/* ============================================================
   Profile — a page that opens up. Sections show a digest first; empty sections fold into one "Add" row.
   Edit is per section, in place; no global edit mode.
   ============================================================ */
function isInner(e){ var t = tierOf(e); return t === 'vetted' || t === 'associate'; }
/* Layout (JD 2026-10-15): Contact + Connections stack on the left; About leads
   the wide center; Relationship, Persona and Files condense into the right
   sidebar. ord doubles as the single-column (mobile) sequence: About, Contact,
   Connections, Relationship, Persona, Files, then the rest. */
var SECS = [
  { id:'identity',    t:'Contact',        col:'l', ord:2, w:['identity'] },
  { id:'about',       t:'About',          col:'c', ord:1, w:['onfile'] },
  { id:'connections', t:'Connections',    col:'l', ord:3, w:['connections'] },
  { id:'relationship',t:'Relationship',   col:'r', ord:4, w:['relationship'] },
  { id:'persona',     t:'Persona',        col:'r', ord:5, w:['ratings'] },
  { id:'files',       t:'Files',          col:'r', ord:6, w:['files'] },
  { id:'background',  t:'Background',     col:'c', ord:7, w:['background', 'education'] },
  { id:'timeline',    t:'Timeline',       col:'c', ord:8, w:['timeline'] }
];
function secDef(id){ return SECS.filter(function(s){ return s.id === id; })[0]; }
function secWaivedUI(e, id){ var d = secDef(id); return d.w.every(function(w){ return secWaived(e, w); }); }
function secHasContent(e, id){
  switch(id){
    case 'identity': return true;
    case 'relationship': return true;
    case 'about': return !!(gv(e, 'synopsis') || footprintOf(e).blocks.length);
    case 'background': return !!(gv(e, 'specialty') || ORG_CATS.some(function(c){ return tagList(gv(e, c.k)).length; }) || degreesOf(e).length || gv(e, 'highlights') || gv(e, 'achievements') || (e.languages || []).length);
    case 'connections': return !!(knownAssociates(e).length || famLinks(e).length);
    case 'timeline': return !!((e.events || []).length || connPhases(e).length);
    case 'files': return !!(e.files || []).length;
    case 'persona': return PERSONA.some(function(p){ return gv(e, p[0]) !== ''; });
  }
  return false;
}
function secShown(e, id){
  if(S.prof.edit[id]) return true;
  if(secWaivedUI(e, id)) return id !== 'persona';
  if(secHasContent(e, id)) return true;
  if(id === 'persona') return false;
  if(id === 'identity' || id === 'relationship' || id === 'about') return true;
  return isInner(e);   /* depth follows closeness: the long tail shows only what is there */
}

function viewProfile(v){
  var di = diFromId(S.route.seg[0]);
  if(di == null || !D.directory[di] || !liveEntry(D.directory[di])){
    v.innerHTML = '<div class="page">' + emptyState('That profile is not here.', 'It may have been merged or removed.') + '<p class="center"><a class="btn" href="#/people">Back to People</a></p></div>'; return;
  }
  if(S.prof.di !== di) S.prof = { di:di, edit:{}, open:{}, evEdit:null, degEdit:null, skOpen:null, more:false };
  var e = D.directory[di];
  var pager = '';
  if(S.ctx && S.ctx.keys){
    var i = S.ctx.keys.indexOf(pkey(e));
    if(i >= 0){
      pager = '<div class="pager"><button type="button" class="ib" data-act="ctxstep" data-d="-1" aria-label="Previous"' + (i === 0 ? ' disabled' : '') + '>' + ic('chevl', 18) + '</button>' +
        '<span>' + esc(S.ctx.label) + ' <b>' + (i + 1) + ' / ' + S.ctx.keys.length + '</b></span>' +
        '<button type="button" class="ib" data-act="ctxstep" data-d="1" aria-label="Next"' + (i === S.ctx.keys.length - 1 ? ' disabled' : '') + '>' + ic('chevr', 18) + '</button></div>';
    }
  }
  v.innerHTML = '<div class="page profile" data-di="' + di + '"><div class="ptop">' + pager + '<span class="sp"></span>' +
    '<div class="menu"><button type="button" class="ib" data-act="menu" aria-haspopup="true" aria-label="More actions">' + ic('dots', 20) + '</button>' +
    '<div class="menu-pop" hidden>' +
    '<button type="button" data-act="export" data-di="' + di + '">' + ic('download', 16) + 'Download dossier file</button>' +
    '<button type="button" data-act="viewdoc" data-di="' + di + '">' + ic('book', 16) + 'Open dossier in a new tab</button>' +
    '<button type="button" data-act="newdoc" data-di="' + di + '">' + ic('file', 16) + 'New Drive doc</button>' +
    '<button type="button" data-act="mergeopen" data-di="' + di + '">' + ic('merge', 16) + 'Merge with another profile…</button>' +
    '<hr><button type="button" class="danger" data-act="delperson" data-di="' + di + '">' + ic('trash', 16) + 'Remove from the circle</button></div></div></div>' +
    '<section id="p-hero" class="hero"></section>' +
    '<div class="pcols"><div class="pcol" id="pc-l"></div><div class="pcol" id="pc-c"></div><div class="pcol" id="pc-r"></div></div><div id="p-add"></div></div>';
  paintProfile(di);
}
function paintProfile(di){
  var e = D.directory[di];
  $('#p-hero').innerHTML = heroHTML(di);
  ['l', 'c', 'r'].forEach(function(col){
    var secs = SECS.filter(function(s){ return s.col === col && secShown(e, s.id); }).map(function(s){ return secHTML(di, s.id); }).join('');
    $('#pc-' + col).innerHTML = secs;
  });
  SECS.forEach(function(s){ var el = $('#sec-' + s.id); if(el) el.style.order = s.ord; });
  var hidden = SECS.filter(function(s){ return !secShown(e, s.id); });
  var legacy = ['relationship_type', 'sources', 'mentions'].filter(function(k){ return String(gv(e, k)).trim(); });
  $('#p-add').innerHTML = (hidden.length ? '<div class="addrow"><span>Add to this profile</span>' + hidden.map(function(s){
      return '<button type="button" class="btn ghost sm" data-act="secedit" data-sec="' + s.id + '">' + ic('plus', 13) + esc(s.id === 'persona' ? 'Rate' : s.t) + '</button>'; }).join('') + '</div>' : '') +
    (legacy.length ? '<details class="legacy"><summary>Legacy notes (read only)</summary>' + legacy.map(function(k){ return '<div><b>' + esc({ relationship_type:'Type', sources:'Sources', mentions:'Mentions' }[k]) + '</b><p>' + esc(gv(e, k)) + '</p></div>'; }).join('') + '</details>' : '');
}
function repaintSec(id){
  var di = S.prof.di, e = D.directory[di]; if(di == null) return;
  var el = $('#sec-' + id);
  if(!el){ paintProfile(di); return; }
  var wrap = document.createElement('div'); wrap.innerHTML = secHTML(di, id);
  var nu = wrap.firstChild; nu.style.order = secDef(id).ord;
  el.parentNode.insertBefore(nu, el); el.remove();
}
function repaintTop(){
  var di = S.prof.di; if(di == null || !$('#p-hero')) return;
  $('#p-hero').innerHTML = heroHTML(di);
}

function heroHTML(di){
  var e = D.directory[di], sub = [cap(gv(e, 'relationship')), cap(gv(e, 'context')), knownSinceYear(e) ? 'Known since ' + knownSinceYear(e) : ''].filter(Boolean).join(' · ');
  /* Location on file gets its own line under the name (JD 2026-10-15): resolved location_on_file -> city -> hometown, normalized; the @handle never renders in the hero (it lives in the Contact card). */
  var loc = ptNormLoc(ptLocVal(e));
  var ds = sortDegrees(degreesOf(e)).slice(0, 3).map(function(d){
    var bits = [d.degree, d.year ? yy(d.year) : ''].filter(Boolean).join(' ');
    return '<span class="dbadge">' + ic('cap', 12) + '<b>' + esc(schoolShort(d.school)) + '</b>' + (bits ? '<i>' + esc(bits) + '</i>' : '') + '</span>';
  }).join('');
  var cs = certsOf(e).slice(0, 2).map(function(c){ return '<span class="dbadge cert">' + ic('shield', 12) + '<i>' + esc(c) + '</i></span>'; }).join('');
  return avatar(e, 'xl') + '<div class="hmain"><h1 class="display" data-act="secedit" data-sec="identity" title="Tap to edit the name">' + esc(dispName(e)) + '<span class="hcue">' + ic('edit', 15) + '</span></h1>' +
    (loc ? '<p class="hloc">' + ic('pin', 13) + esc(loc) + '</p>' : '') +
    '<p class="hsub">' + esc(sub || 'Not yet classified') + '</p>' +
    ((ds || cs) ? '<div class="dbadges">' + ds + cs + '</div>' : '') + '</div>' +
    '<div class="hctl"><div class="qk"><label>Tier</label>' + seg('tier', TIER_ORDER.map(function(t){ return [t, TIERS[t].n]; }), tierOf(e), ' data-di="' + di + '"') + '</div>' +
    '<div class="qk"><label>Momentum</label>' + seg('momentum', [['-', MOM_ICONS['-'] + ' Cooling'], ['0', 'Steady'], ['+', '+ Warming']], momVal(e), ' data-di="' + di + '"') + '</div></div>';
}
/* ---------- section cards ---------- */
function secHTML(di, id){
  var e = D.directory[di], d = secDef(id), editing = !!S.prof.edit[id], waived = secWaivedUI(e, id);
  var acts = '';
  if(editing){
    acts = (id !== 'persona' ? '<label class="wv" title="Insufficient data: this section stops counting against the profile"><input type="checkbox" data-act="waive" data-di="' + di + '" data-sid="' + d.w.join(',') + '"' + (waived ? ' checked' : '') + '><span>Insufficient data</span></label>' : '') +
      '<button type="button" class="btn sm primary" data-act="secdone" data-sec="' + id + '">Done</button>';
  } else acts = '<button type="button" class="ib sm" data-act="secedit" data-sec="' + id + '" aria-label="Edit ' + d.t + '" title="Edit">' + ic('edit', 15) + '</button>';
  var body;
  if(waived && !editing){
    body = '<p class="dim waivedmsg">Waived: insufficient data. <button type="button" class="lnk" data-act="waive" data-di="' + di + '" data-sid="' + d.w.join(',') + '" data-off="1">Restore</button></p>';
  } else body = editing ? secEdit(di, id) : secView(di, id);
  return '<section class="card' + (editing ? ' editing' : '') + (waived ? ' waived' : '') + '" id="sec-' + id + '" data-sec="' + id + '"><header><h3>' + d.t + '</h3>' + secSummary(e, id) + '<span class="sp"></span>' + acts + '</header><div class="cbody">' + body + '</div></section>';
}
function secSummary(e, id){
  var n = 0;
  if(id === 'connections') n = knownAssociates(e).length + famLinks(e).length;
  else if(id === 'timeline') n = (e.events || []).length;
  else if(id === 'files') n = (e.files || []).length;
  return n ? '<em class="cnt">' + n + '</em>' : '';
}
function emptyPrompt(di, id, text){
  return '<button type="button" class="emptyp" data-act="secedit" data-sec="' + id + '">' + ic('plus', 14) + esc(text) + '</button>';
}
function chipsHTML(list, cls, icn){
  return '<div class="chips ro">' + list.map(function(s){ return '<span class="vchip ' + (cls || '') + '">' + (icn ? ic(icn, 12) : '') + esc(s) + '</span>'; }).join('') + '</div>';
}
function sourceChips(urls){
  return urls.map(function(u){ return /^https?:/i.test(u) ? '<a class="src" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(hostOf(u)) + ic('ext', 11) + '</a>' : '<span class="src plain">' + esc(u) + '</span>'; }).join('');
}
function secView(di, id){
  var e = D.directory[di];
  if(id === 'identity'){
    var rows = [];
    function r(icn, lab, val, note){ if(val) rows.push('<div class="irow"><span class="il">' + ic(icn, 15) + lab + '</span><div class="iv">' + val + (note ? ' <small class="derived">' + note + '</small>' : '') + '</div></div>'); }
    if(effHandle(e)) r('ig', 'Instagram', '<a class="iglink ' + (e.relation === 'mutual' ? 'mutual' : 'oneway') + '" href="' + igURL(effHandle(e)) + '" target="_blank" rel="noopener">@' + esc(effHandle(e)) + '</a>', e.relation ? RELN[e.relation] : '');
    if(e.fb_url) r('fb', 'Facebook', '<a class="iglink" href="' + esc(e.fb_url) + '" target="_blank" rel="noopener">' + (e.fb_handle ? '@' + esc(e.fb_handle) : 'Profile') + '</a>');
    if(personIsAka(e) && gv(e, 'also_known_as')) r('user', 'Also known as', '<b>' + esc(gv(e, 'also_known_as')) + '</b>');
    var ph = String(gv(e, 'phone')).split(',').map(function(x){ return x.trim(); }).filter(Boolean);
    if(ph.length) r('phone', 'Phone', ph.map(function(x){ var f = fmtPhone(x); return '<a href="tel:' + esc(f.replace(/[^\d+]/g, '')) + '">' + esc(f) + '</a>'; }).join(' '));
    var em = String(gv(e, 'email')).split(',').map(function(x){ return x.trim(); }).filter(Boolean);
    if(em.length) r('mail', 'Email', em.map(function(x){ return '<a href="mailto:' + esc(x) + '">' + esc(x) + '</a>'; }).join(' '), 'on file');
    r('pin', 'Lives in', esc(e.city || ''), 'from Facebook');
    r('pin', 'From', esc(e.hometown || ''), 'from Facebook');
    if((e.languages || []).length) r('book', 'Languages', e.languages.map(esc).join(', '), 'from subject file');
    return rows.length ? '<div class="irows">' + rows.join('') + '</div>' : '<p class="dim">No contact details yet.</p>' + emptyPrompt(di, id, 'Add a phone number');
  }
  if(id === 'relationship'){
    var tiles = [['Relationship', cap(gv(e, 'relationship'))], ['Context', cap(gv(e, 'context'))], ['Category', (CAT_OPTS.filter(function(c){ return c[0] === gv(e, 'category'); })[0] || ['', gv(e, 'category')])[1]],
      ['Known since', knownSinceYear(e) ? knownSinceYear(e) + ' (' + Math.max(0, new Date().getFullYear() - knownSinceYear(e)) + ' yrs)' : '']];
    var gs = personGroups(e);
    return '<div class="tiles">' + tiles.map(function(t){ return '<div class="tile"><small>' + t[0] + '</small><b' + (t[1] ? '' : ' class="dim"') + '>' + esc(t[1] || 'Not set') + '</b></div>'; }).join('') + '</div>' +
      (gs.length ? '<div class="sub-h">Groups</div><div class="chips ro">' + gs.map(function(g){ return '<a class="vchip link" href="#/groups/groups/' + encodeURIComponent(g) + '">' + esc(g) + '</a>'; }).join('') + '</div>' : '');
  }
  if(id === 'about'){
    var syn = gv(e, 'synopsis'), fp = footprintOf(e), out = '';
    if(syn){
      out += '<div class="narr">' + String(syn).split(/\n+/).map(function(line){
        var m = line.match(/^([A-Z][A-Za-z &\/'-]{1,28}):\s+(.*)$/);
        return m ? '<p><span class="lab">' + esc(m[1]) + '</span>' + esc(m[2]) + '</p>' : '<p>' + esc(line) + '</p>';
      }).join('') + '</div>';
    }
    if(fp.blocks.length){
      out += '<div class="sub-h">Web record <span class="conf ' + (fp.sourced ? 'ok' : fp.inferred ? 'inf' : 'no') + '">' + (fp.sourced ? 'Sourced' : fp.inferred ? 'Inferred' : 'No source') + '</span></div>' +
        fp.blocks.map(function(b){
          return '<div class="fpb ' + (b.urls.length ? 'ok' : 'no') + '"><p>' + esc(b.text) + '</p>' + (b.urls.length ? '<div class="srcs">' + sourceChips(b.urls) + '</div>' : '<div class="srcs"><span class="src none">No source attached</span></div>') + '</div>';
        }).join('');
    }
    return out || emptyPrompt(di, id, 'Write a synopsis');
  }
  if(id === 'background'){
    var out2 = '', sk = tagList(gv(e, 'specialty'));
    if(sk.length) out2 += '<div class="sub-h first">Skills</div>' + chipsHTML(sk, 'sk');
    var ds = sortDegrees(degreesOf(e));
    if(ds.length) out2 += '<div class="sub-h' + (out2 ? '' : ' first') + '">Education</div><div class="edulist">' + ds.map(function(d){
      var line = [d.degree, d.major].filter(Boolean).join(' · ');
      return '<div class="edu"><span>' + ic('cap', 15) + '</span><div><b>' + esc(d.school || 'School not set') + '</b>' + (line ? '<small>' + esc(line) + '</small>' : '') + (d.note ? '<small class="dim">' + esc(d.note) + '</small>' : '') + '</div>' + (d.year ? '<em>' + esc(d.year) + '</em>' : '') + '</div>';
    }).join('') + '</div>';
    var ach = honorsOf(e);
    if(ach.length) out2 += '<div class="sub-h">Honors</div>' + chipsHTML(ach, 'hon', 'award');
    var hl = parsePipe(gv(e, 'highlights'));
    if(hl.length) out2 += '<div class="sub-h">Highlights</div>' + chipsHTML(hl, 'hl');
    var orgs = '';
    ORG_CATS.forEach(function(c){ if(c.k === 'universities') return; tagList(gv(e, c.k)).forEach(function(o){ orgs += '<a class="vchip link" href="#/groups/' + c.k + '/' + encodeURIComponent(o) + '">' + ic(c.ic, 12) + esc(o) + '</a>'; }); });
    if(orgs) out2 += '<div class="sub-h">Organizations</div><div class="chips ro">' + orgs + '</div>';
    return out2 || emptyPrompt(di, id, 'Add skills, work, school');
  }
  if(id === 'connections'){
    var ka = knownAssociates(e), links = famLinks(e), out3 = '';
    var tree = familyMiniTree(di);
    if(tree) out3 += '<div class="sub-h first">Family</div>' + tree;
    else if(links.length) out3 += '<div class="sub-h first">Family</div>' + famListHTML(di, false);
    /* Default = the strongest 10 only (knownAssociates preserves the baked strength order); Show more / Show less toggles the full list (JD 2026-10-15). */
    if(ka.length) out3 += '<div class="sub-h' + (out3 ? '' : ' first') + '">Known associates <small>' + ka.length + ', always two-way</small></div><div class="chips ro">' + ka.slice(0, S.prof.open.assoc ? 999 : 10).map(function(nb){ return nbrChip(nb, false); }).join('') +
      (ka.length > 10 && !S.prof.open.assoc ? '<button type="button" class="vchip more" data-act="opentog" data-k="assoc">Show more \u00b7 +' + (ka.length - 10) + '</button>' : '') +
      (ka.length > 10 && S.prof.open.assoc ? '<button type="button" class="vchip more" data-act="opentog" data-k="assoc">Show less</button>' : '') + '</div>';
    out3 += '<div class="row"><a class="btn ghost sm" href="#/family" data-act="openfam" data-di="' + di + '">' + ic('tree', 14) + 'Open in Family</a><a class="btn ghost sm" href="#/network" data-act="shownet" data-di="' + di + '">' + ic('network', 14) + 'Show on Network</a></div>';
    return (ka.length || links.length) ? out3 : emptyPrompt(di, id, 'Add family or known associates');
  }
  if(id === 'timeline'){
    var evs = sortedEvents(e), ps = connPhases(e).slice().sort(function(a, b){ return String(a.f || '').localeCompare(String(b.f || '')); }), out4 = '';
    if(ps.length) out4 += '<div class="sub-h first">Phases</div><div class="phases">' + ps.map(function(p){
      return '<div class="ph"><b>' + esc(p.l || 'Untitled phase') + '</b><small>' + esc(ymLabel(p.f) + (p.t ? ' to ' + ymLabel(p.t) : ' to now')) + '</small>' + (p.n ? '<p>' + esc(p.n) + '</p>' : '') + '</div>';
    }).join('') + '</div>';
    if(evs.length) out4 += '<div class="sub-h' + (out4 ? '' : ' first') + '">Events</div><div class="tl">' + evs.slice(0, S.prof.open.ev ? 999 : 6).map(function(o){
      var ev = o.ev;
      return '<div class="ev"><i></i><time>' + esc(evDate(ev.date)) + (ev.init ? ' <em>' + (ev.init === 'me' ? 'I reached out' : 'They reached out') + '</em>' : '') + '</time><b>' + esc(ev.summary || '') + '</b>' + (ev.detail ? '<p>' + esc(ev.detail) + '</p>' : '') + '</div>';
    }).join('') + '</div>' + (evs.length > 6 && !S.prof.open.ev ? '<button type="button" class="btn ghost sm" data-act="opentog" data-k="ev">Show all ' + evs.length + ' events</button>' : '');
    return out4 || emptyPrompt(di, id, 'Add an event');
  }
  if(id === 'files'){
    var fs = e.files || [];
    return fs.length ? fs.map(function(f){
      var isDoc = f.kind === 'gdoc';
      return '<div class="file"><span>' + ic(isDoc ? 'file' : 'link', 17) + '</span><div><b>' + esc(f.name || 'Untitled') + '</b><small>' + (isDoc ? 'Google Doc' : 'Link') + (f.note ? ' · ' + esc(f.note) : '') + '</small></div>' +
        (f.url ? '<a class="btn ghost sm" href="' + esc(f.url) + '" target="_blank" rel="noopener">Open' + ic('ext', 12) + '</a>' : '') + '</div>';
    }).join('') : emptyPrompt(di, id, 'Attach a link or create a doc');
  }
  if(id === 'persona'){
    return '<div class="persona">' + PERSONA.map(function(p){
      var n = parseInt(gv(e, p[0]), 10) || 0;
      return '<div class="pt"><span>' + p[1] + '</span><div class="pb"><i style="width:' + (n * 20) + '%"></i></div><b>' + (n ? n + '/5' : 'Not rated') + '</b></div>';
    }).join('') + '</div>';
  }
  return '';
}
function nbrChip(nb, removable){
  var di = BYN[(nb.u || '').toLowerCase()];
  var label = di != null ? dispName(D.directory[di]) : nb.d || nb.u;
  var c = di != null ? tierCol(D.directory[di]) : '#4b5468';
  return '<span class="nchip' + (nb['new'] ? ' new' : '') + '" style="--tc:' + c + '">' +
    (di != null ? '<a href="#/p/' + encodeURIComponent(personId(D.directory[di])) + '" data-act="openp" data-di="' + di + '"><i></i>' + esc(label) + '</a>' : '<span><i></i>' + esc(label) + '</span>') +
    (removable ? '<button type="button" class="nx" data-act="assocrm" data-u="' + esc(nb.u) + '" aria-label="Remove">' + ic('x', 12) + '</button>' : '') + '</span>';
}
function famListHTML(di, editable){
  var e = D.directory[di], links = famLinks(e);
  return '<div class="famlist">' + links.map(function(l, i){
    var tdi = BYN[String(l[1] || '').toLowerCase()], label = tdi != null ? dispName(D.directory[tdi]) : l[1];
    return '<div class="fl"><span class="rel">' + esc(l[0]) + '</span>' + (tdi != null ? '<a href="#/p/' + encodeURIComponent(personId(D.directory[tdi])) + '" data-act="openp" data-di="' + tdi + '">' + esc(label) + '</a>' : '<span>' + esc(label) + '</span>') +
      (editable ? '<button type="button" class="nx" data-act="famrm" data-i="' + i + '" aria-label="Remove link">' + ic('x', 12) + '</button>' : '') + '</div>';
  }).join('') + '</div>';
}
function familyMiniTree(di){
  var e = D.directory[di], disp = famDisplay(), f = disp[di];
  if(!f) return '';
  function lab(arr){ return arr.map(function(x){ var t = D.directory[x.di]; return { di:x.di, label:dispName(t) }; }); }
  var P = lab(f.parents), SP = lab(f.spouses), C = lab(f.children), SB = lab(f.siblings);
  if(!P.length && !SP.length && !C.length && !SB.length) return '';
  function node(o, cls){
    return '<a class="fnode ' + cls + '" href="#/p/' + encodeURIComponent(personId(D.directory[o.di])) + '" data-act="openp" data-di="' + o.di + '"><span>' + esc(famInitials(o.label)) + '</span><small>' + esc(o.label) + '</small></a>';
  }
  var self = '<div class="fnode self"><span>' + esc(famInitials(dispName(e))) + '</span><small>' + esc(dispName(e)) + '</small></div>';
  return '<div class="ftree">' +
    (P.length ? '<div class="fr"><label>Parents</label><div>' + P.map(function(o){ return node(o, 'par'); }).join('') + '</div></div>' : '') +
    '<div class="fr"><label>' + (SP.length ? 'Self and spouse' : 'Self') + '</label><div>' + self + SP.map(function(o){ return node(o, 'sp'); }).join('') + '</div></div>' +
    (SB.length ? '<div class="fr"><label>Siblings</label><div>' + SB.map(function(o){ return node(o, 'sib'); }).join('') + '</div></div>' : '') +
    (C.length ? '<div class="fr"><label>Children</label><div>' + C.map(function(o){ return node(o, 'chi'); }).join('') + '</div></div>' : '') + '</div>';
}

/* ---------- section editors ---------- */
function tagEditor(di, k, sep, ph){
  var e = D.directory[di], cur = splitTags(gv(e, k), sep);
  return '<div class="tags" data-k="' + k + '" data-sep="' + esc(sep) + '">' + cur.map(function(x){
    return '<span class="tchip on">' + esc(x) + '<button type="button" data-act="tagrm" data-k="' + k + '" data-sep="' + esc(sep) + '" data-v="' + esc(x) + '" aria-label="Remove">' + ic('x', 11) + '</button></span>'; }).join('') +
    '<input class="tadd" data-k="' + k + '" data-sep="' + esc(sep) + '" placeholder="' + esc(ph) + '" autocomplete="off"></div>';
}
function pickEditor(di, k, options, ph){
  var e = D.directory[di], cur = tagList(gv(e, k)), all = options.concat(cur.filter(function(x){ return options.indexOf(x) < 0; }));
  return '<div class="tags">' + all.map(function(o){
    return '<button type="button" class="tchip tog' + (cur.indexOf(o) >= 0 ? ' on' : '') + '" data-act="tagtog" data-k="' + k + '" data-sep=", " data-v="' + esc(o) + '">' + esc(o) + '</button>'; }).join('') +
    '<input class="tadd" data-k="' + k + '" data-sep=", " placeholder="' + esc(ph || 'Add another') + '" autocomplete="off"></div>';
}
function skillFlow(di){
  var e = D.directory[di], cur = tagList(gv(e, 'specialty')), open = S.prof.skOpen;
  var h = SKILL_TAXONOMY.map(function(g){
    var items = [g.cat].concat(g.skills.filter(function(s){ return s !== g.cat; }));
    var n = items.filter(function(s){ return cur.indexOf(s) >= 0; }).length, isOpen = open === g.cat;
    return '<div class="skcat' + (isOpen ? ' open' : '') + '"><button type="button" class="skhead" data-act="skcat" data-cat="' + esc(g.cat) + '" aria-expanded="' + isOpen + '"><span>' + esc(g.cat) + '</span>' + (n ? '<em>' + n + '</em>' : '') + ic('chev', 13) + '</button>' +
      (isOpen ? '<div class="skpanel">' + items.map(function(s, i){ return '<button type="button" class="tchip tog' + (cur.indexOf(s) >= 0 ? ' on' : '') + '" data-act="tagtog" data-k="specialty" data-sep=", " data-v="' + esc(s) + '">' + esc(s) + (i === 0 ? ' <small>general</small>' : '') + '</button>'; }).join('') + '</div>' : '') + '</div>';
  }).join('');
  var others = cur.filter(function(s){ return !SKILL_PARENT[s]; });
  if(others.length) h += '<div class="skcat open"><div class="skhead static"><span>Other</span><em>' + others.length + '</em></div><div class="skpanel">' + others.map(function(s){ return '<button type="button" class="tchip tog on" data-act="tagtog" data-k="specialty" data-sep=", " data-v="' + esc(s) + '">' + esc(s) + '</button>'; }).join('') + '</div></div>';
  return '<div class="skflow">' + h + '</div>';
}
function lab(t, sub){ return '<label class="lab">' + esc(t) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</label>'; }
function secEdit(di, id){
  var e = D.directory[di];
  if(id === 'identity'){
    return lab('First name') + '<input data-pk="first_name" value="' + esc(gv(e, 'first_name')) + '" autocomplete="off">' +
      lab('Last name') + '<input data-pk="last_name" value="' + esc(gv(e, 'last_name')) + '" autocomplete="off">' +
      lab('Phone', 'Several numbers: separate with commas') + '<input data-pk="phone" inputmode="tel" value="' + esc(gv(e, 'phone')) + '" autocomplete="off">' +
      (personIsAka(e) ? lab('Also known as') + '<input data-pk="also_known_as" value="' + esc(gv(e, 'also_known_as')) + '" autocomplete="off">' : '') +
      '<p class="note">Instagram, Facebook, Lives in, From and Languages are derived and read only. Correct them at the source (the FB Profiles tab or a subject file).</p>' + secView(di, 'identity');
  }
  if(id === 'relationship'){
    var ksYear = knownSinceYear(e), thisY = new Date().getFullYear(), ksUsed = {};
    D.directory.forEach(function(x){ var y0 = knownSinceYear(x); if(y0) ksUsed[y0] = (ksUsed[y0] || 0) + 1; });
    var ksList = Object.keys(ksUsed).map(Number).sort(function(a, b){ return ksUsed[b] - ksUsed[a] || b - a; });
    var ksDl = ksList.map(function(y){ return '<option value="' + y + '">' + y + ' · ' + (thisY - y) + ' yrs</option>'; }).join('');
    var ksChips = '<button type="button" class="tchip ksy' + (ksYear ? '' : ' on') + '" data-act="kspick" data-y="">Not set</button>';
    for(var ky = thisY; ky >= 1990; ky--) ksChips += '<button type="button" class="tchip ksy' + (ksYear === ky ? ' on' : '') + '" data-act="kspick" data-y="' + ky + '">' + ky + '</button>';
    ksList.forEach(function(y){ if(y < 1990 || y > thisY) ksChips += '<button type="button" class="tchip ksy' + (ksYear === y ? ' on' : '') + '" data-act="kspick" data-y="' + y + '">' + y + '</button>'; });
    var gs = Object.keys(allGroups()).sort(), mine = personGroups(e);
    return lab('Relationship') + seg('relationship', REL_OPTS, gv(e, 'relationship'), ' data-di="' + di + '" data-sec="relationship"') +
      lab('Context') + seg('context', CTX_OPTS, gv(e, 'context'), ' data-di="' + di + '" data-sec="relationship"') +
      lab('Category') + seg('category', CAT_OPTS, gv(e, 'category'), ' data-di="' + di + '" data-sec="relationship"') +
      lab('Known since', 'Type a year (suggestions appear), or tap one') + '<input data-pk="years_known" id="ksin" inputmode="numeric" list="kslist" value="' + (ksYear || '') + '" placeholder="e.g. 2019" autocomplete="off"><datalist id="kslist">' + ksDl + '</datalist>' +
      '<div class="kschips">' + ksChips + '</div>' +
      lab('Groups') + '<div class="tags">' + gs.map(function(g){ return '<button type="button" class="tchip tog' + (mine.indexOf(g) >= 0 ? ' on' : '') + '" data-act="grptog" data-g="' + esc(g) + '">' + esc(g) + '</button>'; }).join('') +
      '<input class="tadd" data-grpnew placeholder="New group" autocomplete="off"></div>';
  }
  if(id === 'about'){
    return lab('Synopsis', 'One topic per line, starting with a label and a colon. Keep it general: facts, never intimate detail.') +
      '<textarea data-pk="synopsis" rows="6">' + esc(gv(e, 'synopsis')) + '</textarea>' +
      '<div class="row"><button type="button" class="btn ghost sm" data-act="tidy" data-di="' + di + '">' + ic('sparkle', 14) + 'Tidy with AI</button><span class="aimsg" id="aimsg"></span></div>' +
      lab('Web record', 'Prose, then a Sources line with the links. Text with no source reads as inferred.') +
      '<textarea data-pk="public_footprint" rows="6">' + esc(gv(e, 'public_footprint')) + '</textarea>';
  }
  if(id === 'background'){
    return lab('Skills') + tagEditor(di, 'specialty', ', ', 'Add a specific skill') + skillFlow(di) +
      ORG_CATS.filter(function(c){ return c.k !== 'universities'; }).map(function(c){ return lab(c.label) + pickEditor(di, c.k, c.options, 'Add another'); }).join('') +
      lab('Highlights') + tagEditor(di, 'highlights', ' | ', 'Key fact, e.g. NYSP trooper in Canton') +
      lab('Education') + degreesEditor(di) +
      lab('Honors') + tagEditor(di, 'achievements', ' | ', 'Award and year, e.g. Dean’s List 2020');
  }
  if(id === 'connections'){
    return lab('Known associates', 'Always two-way: adding or removing writes both profiles') +
      '<div class="chips">' + (knownAssociates(e).map(function(nb){ return nbrChip(nb, true); }).join('') || '<span class="dim">None mapped yet.</span>') + '</div>' +
      '<div class="finder"><input id="assocq" placeholder="Add a known associate: type a name" autocomplete="off"><div id="assocr" class="hits"></div></div>' +
      lab('Family', 'Traditional model: one spouse, bloodline trees') + famListHTML(di, true) +
      '<div class="famadd"><div class="seg" id="famrels">' + FAM_RELS.map(function(r){ return '<button type="button" class="' + (famRelDefault() === r ? 'on' : '') + '" data-act="famrel" data-v="' + r + '">' + cap(r) + '</button>'; }).join('') + '</div>' +
      '<div class="finder"><input id="famq" placeholder="Add family member: type a name" autocomplete="off"><div id="famr" class="hits"></div></div></div>';
  }
  if(id === 'timeline'){
    var cur = S.prof.evEdit != null ? (e.events || [])[S.prof.evEdit] : null;
    var rows = sortedEvents(e).map(function(o){
      return '<div class="evrow' + (S.prof.evEdit === o.i ? ' editing' : '') + '"><div><time>' + esc(evDate(o.ev.date)) + '</time><b>' + esc(o.ev.summary || '') + '</b></div>' +
        '<div class="ea"><button type="button" class="btn ghost sm" data-act="evedit" data-i="' + o.i + '">Edit</button><button type="button" class="btn ghost sm danger" data-act="evdel" data-i="' + o.i + '">Remove</button></div></div>';
    }).join('');
    cur = cur || {};
    var ps = connPhases(e);
    return (rows || '<p class="dim">No events yet.</p>') +
      '<div class="form"><h5>' + (S.prof.evEdit != null ? 'Edit event' : 'Add event') + '</h5>' +
      '<input type="date" id="ev-date" value="' + esc((cur.date && /^\d{4}-\d{2}-\d{2}$/.test(cur.date)) ? cur.date : todayStr()) + '">' +
      '<input id="ev-sum" placeholder="Headline, e.g. Started a new job" value="' + esc(cur.summary || '') + '" autocomplete="off">' +
      '<textarea id="ev-det" rows="2" placeholder="Details (optional)">' + esc(cur.detail || '') + '</textarea>' +
      '<div class="seg" id="ev-init">' + [['', 'Neither'], ['me', 'I reached out'], ['them', 'They reached out']].map(function(o){ return '<button type="button" data-act="evinit" data-v="' + o[0] + '" class="' + (String(cur.init || '') === o[0] ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</div>' +
      '<div class="row"><button type="button" class="btn primary sm" data-act="evsave">' + (S.prof.evEdit != null ? 'Update event' : 'Add to timeline') + '</button>' + (S.prof.evEdit != null ? '<button type="button" class="btn ghost sm" data-act="evcancel">Cancel</button>' : '') + '</div></div>' +
      lab('Phases', 'How the relationship changed over time') +
      '<div id="cprows">' + ps.map(function(p, i){ return phaseRow(p, i); }).join('') + '</div>' +
      '<div class="row"><button type="button" class="btn ghost sm" data-act="cpadd">' + ic('plus', 13) + 'Add phase</button></div>' +
      '<datalist id="cplabels">' + CP_LABELS.map(function(l){ return '<option value="' + esc(l) + '">'; }).join('') + '</datalist>';
  }
  if(id === 'files'){
    var fs = (e.files || []).map(function(f, i){
      return '<div class="evrow"><div><b>' + esc(f.name || 'Untitled') + '</b><small class="dim">' + esc(f.url || '') + '</small></div><div class="ea"><button type="button" class="btn ghost sm danger" data-act="fdel" data-i="' + i + '">Remove</button></div></div>';
    }).join('');
    return (fs || '<p class="dim">No files attached.</p>') + '<div class="form"><h5>Attach a link</h5><input id="f-name" placeholder="Name, e.g. Full journal record" autocomplete="off"><input id="f-url" placeholder="https://docs.google.com/…" autocomplete="off"><input id="f-note" placeholder="Note (optional)" autocomplete="off">' +
      '<div class="row"><button type="button" class="btn primary sm" data-act="fsave">' + ic('link', 13) + 'Attach</button><button type="button" class="btn ghost sm" data-act="newdoc" data-di="' + di + '">' + ic('plus', 13) + 'New Drive doc instead</button></div></div>';
  }
  if(id === 'persona'){
    return '<p class="note">Entered by you only. Blank is a valid, final answer. Nothing here is ever estimated.</p>' + PERSONA.map(function(p){
      var v = gv(e, p[0]);
      return '<div class="rate"><div><b>' + p[1] + '</b><small>' + p[2] + '</small></div><div class="dots">' + [1, 2, 3, 4, 5].map(function(n){
        return '<button type="button" class="' + (String(v) === String(n) ? 'on' : '') + '" data-act="persona" data-k="' + p[0] + '" data-v="' + n + '">' + n + '</button>'; }).join('') +
        '<button type="button" class="clr" data-act="persona" data-k="' + p[0] + '" data-v="" aria-label="Clear"' + (v ? '' : ' disabled') + '>' + ic('x', 12) + '</button></div></div>';
    }).join('');
  }
  return '';
}
function phaseRow(p, i){
  p = p || {}; var ongoing = !p.t;
  return '<div class="cprow" data-i="' + i + '"><div class="two"><input type="month" class="cp-f" value="' + esc(p.f || '') + '" aria-label="From"><input type="month" class="cp-t" value="' + esc(p.t || '') + '" aria-label="To"' + (ongoing ? ' disabled' : '') + '></div>' +
    '<label class="chk"><input type="checkbox" class="cp-now"' + (ongoing ? ' checked' : '') + '> Ongoing</label>' +
    '<input class="cp-l" list="cplabels" value="' + esc(p.l || '') + '" placeholder="Phase label" aria-label="Phase label" autocomplete="off">' +
    '<input class="cp-n" value="' + esc(p.n || '') + '" placeholder="Note (optional)" aria-label="Note" autocomplete="off">' +
    '<button type="button" class="btn ghost sm danger" data-act="cpdel">Remove</button></div>';
}
function degreesEditor(di){
  var e = D.directory[di], ds = parseArr(gv(e, 'degrees'));
  var rows = ds.map(function(d, i){ return { d:d, i:i }; }).sort(function(a, b){ return String(b.d.year || '').localeCompare(String(a.d.year || '')); }).map(function(o){
    var line = [o.d.degree, o.d.major, o.d.year].filter(Boolean).join(' · ');
    return '<div class="evrow' + (S.prof.degEdit === o.i ? ' editing' : '') + '"><div><b>' + esc(o.d.school || 'School not set') + '</b>' + (line ? '<small>' + esc(line) + '</small>' : '') + '</div>' +
      '<div class="ea"><button type="button" class="btn ghost sm" data-act="degedit" data-i="' + o.i + '">Edit</button><button type="button" class="btn ghost sm danger" data-act="degdel" data-i="' + o.i + '">Remove</button></div></div>';
  }).join('');
  var cur = (S.prof.degEdit != null && ds[S.prof.degEdit]) ? ds[S.prof.degEdit] : {};
  var known = !!SCHOOLS[cur.school], other = cur.school && !known;
  var sch = '<option value="">School</option>' + Object.keys(SCHOOLS).map(function(k){ return '<option' + (cur.school === k ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') + '<option value="__other"' + (other ? ' selected' : '') + '>Other school</option>';
  var dg = '<option value="">Degree</option>' + DEGREE_TYPES.map(function(k){ return '<option' + (cur.degree === k ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('');
  if(cur.degree && DEGREE_TYPES.indexOf(cur.degree) < 0) dg += '<option selected>' + esc(cur.degree) + '</option>';
  var yr = '<option value="">Year</option>'; for(var y = new Date().getFullYear() + 5; y >= 1950; y--) yr += '<option' + (String(cur.year) === String(y) ? ' selected' : '') + '>' + y + '</option>';
  return (rows || '<p class="dim">No degrees on file.</p>') + '<div class="form"><h5>' + (S.prof.degEdit != null ? 'Edit degree' : 'Add degree') + '</h5>' +
    '<div class="two"><select id="dd-school">' + sch + '</select><select id="dd-degree">' + dg + '</select></div>' +
    '<input id="dd-other" value="' + esc(other ? cur.school : '') + '" placeholder="Other school name (only if not in the list)" autocomplete="off">' +
    '<div class="two"><input id="dd-major" value="' + esc(cur.major || '') + '" placeholder="Major" autocomplete="off"><select id="dd-year">' + yr + '</select></div>' +
    '<input id="dd-note" value="' + esc(cur.note || '') + '" placeholder="Source or note (optional)" autocomplete="off">' +
    '<div class="row"><button type="button" class="btn primary sm" data-act="degsave">' + (S.prof.degEdit != null ? 'Update degree' : 'Add degree') + '</button>' + (S.prof.degEdit != null ? '<button type="button" class="btn ghost sm" data-act="degcancel">Cancel</button>' : '') + '</div></div>';
}

/* ============================================================
   Network — a map you read, not a control surface. Rings are tiers; color-by and the wider-circle
   toggle are the only controls. Tap a dot for a card; the card is the way out to the profile.
   ============================================================ */
var NET = { nodes:[], cam:{ x:0, y:0, z:1 }, cv:null, ctx:null, W:0, H:0, dpr:1, raf:0, ptr:{}, pinch:0, moved:false, dirty:true, bg:null, byDi:{}, rot:0, lastAct:0, lastTs:0, dvel:0, hoverDi:null };
/* Solar drift (design pass 2026-10-14; ramped spin 2026-10-14 evening;
   asymmetric tuning 2026-10-15): one revolution per ~156.5s at full speed
   (15% faster than the original 180s), and the angular velocity eases toward
   its target — full speed or zero — with an exponential ramp whose time
   constant depends on direction: stopping is aggressive (TAU_DOWN ≈ 0.4s, a
   hovered node brings the map firmly to rest) while starting is gentle
   (TAU_UP ≈ 2.8s, the spin spools back up gradually). The target is zero
   while a node is hovered, while the pointer is down, while a selection is
   framed, and for a short settle after any interaction. Hovering empty
   space does not pause it. Off entirely under prefers-reduced-motion. */
var REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
var DRIFT_RATE = Math.PI * 2 / 180 * 1.15;
var DRIFT_TAU_DOWN = 0.4, DRIFT_TAU_UP = 2.8, DRIFT_SETTLE = 1500;
function driftTarget(now){
  if(REDUCED_MOTION || S.net.sel != null || NET.hoverDi != null) return 0;
  if(Object.keys(NET.ptr).length) return 0;
  if(now - NET.lastAct < DRIFT_SETTLE) return 0;
  return DRIFT_RATE;
}
function netRotP(x, y){ var c = Math.cos(NET.rot), s = Math.sin(NET.rot); return [x * c - y * s, x * s + y * c]; }
function netBuild(){
  computeNewGain();
  var dir = D.directory, maxS = 1;
  dir.forEach(function(r){ if(r.strength > maxS) maxS = r.strength; });
  var list = people().filter(function(di){ return dir[di].has_graph !== false; })
    .sort(function(a, b){ return (dir[b].strength || 0) - (dir[a].strength || 0) || a - b; });
  var byRing = [[], [], [], []];
  list.forEach(function(di){ var t = TIER_RANK[tierOf(dir[di])]; byRing[t == null ? 3 : t].push(di); });
  var radii = [170, 310, 490, 640], spread = [16, 36, 50, 70];
  NET.nodes = []; NET.byDi = {};
  byRing.forEach(function(arr, ring){
    var n = arr.length;
    arr.forEach(function(di, k){
      var rng = mulberry32(di * 2654435761 % 2147483647);
      var ang = (k / Math.max(1, n)) * Math.PI * 2 + (rng() - 0.5) * 0.3 + ring * 0.7;
      var rad = radii[ring] + (rng() - 0.5) * 2 * spread[ring], r = dir[di];
      var nd = { di:di, ring:ring, x:Math.cos(ang) * rad, y:Math.sin(ang) * rad, r:2 + 3.6 * ((r.strength || 0) / maxS), nw:NEWGAIN[di] ? 1 : 0 };
      var gy = 1 - 2 * (k + 0.5) / Math.max(1, n), gr = Math.sqrt(Math.max(0, 1 - gy * gy)), th3 = k * 2.399963 + ring * 1.3 + (rng() - 0.5) * 0.25, rad3 = radii[ring] + (rng() - 0.5) * 2 * spread[ring];
      nd.x3 = Math.cos(th3) * gr * rad3; nd.y3 = gy * rad3 * 0.82; nd.z3 = Math.sin(th3) * gr * rad3;
      NET.nodes.push(nd); NET.byDi[di] = nd;
    });
  });
  NET.bg = null;
}
function netColor(nd){
  var e = D.directory[nd.di], m = S.net.color;
  if(m === 'relation') return RELC[e.relation] || '#4b5468';
  return RING_C[nd.ring];
}
function viewNetwork(v){
  var m3 = S.net.mode !== '2d';
  var legend = S.net.color === 'relation' ? [['mutual', 'Mutual'], ['following', 'Following'], ['follower', 'Follower']].map(function(x){ return [RELC[x[0]], x[1]]; })
    : TIER_ORDER.map(function(t){ return [TIERS[t].c, TIERS[t].n]; }).concat([[RING_C[3], 'No tier yet']]);
  function sg(k, opts, cur){ return '<div class="seg">' + opts.map(function(o){ return '<button type="button" data-act="' + k + '" data-v="' + o[0] + '" class="' + (cur === o[0] ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</div>'; }
  v.innerHTML = '<div class="page netpage"><div class="netbar"><div><h1 class="display">Network</h1><p class="sub">' + (m3 ? 'Drag to turn it. Closest people sit in the middle; each shell is a tier. Tap a dot for details.' : 'Closest in the middle. Each ring is a tier. Tap a dot for details.') + '</p></div>' +
    '<div class="netctl">' + sg('netmode', [['3d', '3D'], ['2d', '2D']], m3 ? '3d' : '2d') + sg('netcolor', [['tier', 'Tier'], ['relation', 'Relation']], S.net.color) +
    '<button type="button" class="btn ghost sm' + (S.net.bg ? ' on' : '') + '" data-act="netbg" aria-pressed="' + !!S.net.bg + '">Show wider circle</button></div></div>' +
    '<div class="netcols"><div class="netwrap"><canvas id="netcv" aria-label="Connection map"></canvas>' +
    '<div class="netlegend">' + legend.map(function(l){ return '<span><i style="background:' + l[0] + '"></i>' + l[1] + '</span>'; }).join('') + '</div>' +
    '<div class="netzoom"><button type="button" class="ib" data-act="netzoom" data-d="1" aria-label="Zoom in">' + ic('plus', 18) + '</button><button type="button" class="ib" data-act="netzoom" data-d="-1" aria-label="Zoom out">' + ic('minus', 18) + '</button><button type="button" class="ib" data-act="netfit" aria-label="Reset view">' + ic('target', 18) + '</button></div>' +
    '</div>' +
    '<aside class="netpanel" id="netpanel"><div id="netpcard" hidden></div><div class="netpstats" id="netpstats"></div></aside></div></div>';
  if(!NET.nodes.length || NET.stamp !== VER) { netBuild(); NET.stamp = VER; }
  NET.cv = $('#netcv'); NET.ctx = NET.cv.getContext('2d');
  NET.lastAct = performance.now() - 6000; NET.lastTs = 0; NET.dvel = 0; NET.hoverDi = null; N3.hover = null;
  netResize(); netFit();
  if(S.net.sel != null && NET.byDi[S.net.sel]){
    var nd = NET.byDi[S.net.sel];
    if(m3){ var rho3 = Math.hypot(nd.x3, nd.z3); if(rho3 > 0.001) N3.yaw = Math.atan2(nd.z3, nd.x3) + Math.PI / 2; N3.pitch = Math.max(-1.5, Math.min(1.5, Math.atan2(-nd.y3, Math.max(rho3, 0.001)))); N3.vy = 0; N3.vp = 0; N3.auto = false; }
    else { var rp0 = netRotP(nd.x, nd.y); NET.cam.x = rp0[0]; NET.cam.y = rp0[1]; NET.cam.z = Math.max(NET.cam.z, 1.6); }
  }
  netCard();
  var cv = NET.cv; NET.ptr = {}; NET.pinch = 0;
  cv.addEventListener('pointerdown', function(ev){
    cv.setPointerCapture(ev.pointerId);
    NET.lastAct = performance.now();
    NET.ptr[ev.pointerId] = { x:ev.clientX, y:ev.clientY }; NET.moved = false; N3.vy = 0; N3.vp = 0; N3.idle = 0;
    if(Object.keys(NET.ptr).length === 2) NET.pinch = netPinchDist();
  });
  cv.addEventListener('pointermove', function(ev){
    var p = NET.ptr[ev.pointerId];
    if(!p){
      var r0 = cv.getBoundingClientRect(), hx = ev.clientX - r0.left, hy = ev.clientY - r0.top;
      var h = S.net.mode === '2d' ? netHit(hx, hy) : net3Hit(hx, hy), hd = h ? h.di : null;
      if(hd !== NET.hoverDi){ NET.hoverDi = hd; if(S.net.mode !== '2d') N3.hover = hd; cv.style.cursor = h ? 'pointer' : 'grab'; }
      return;
    }
    var ks = Object.keys(NET.ptr);
    if(ks.length === 1){
      NET.lastAct = performance.now();
      var dx = ev.clientX - p.x, dy = ev.clientY - p.y;
      if(Math.abs(dx) + Math.abs(dy) > 3) NET.moved = true;
      if(S.net.mode === '2d'){ NET.cam.x -= dx / NET.cam.z; NET.cam.y -= dy / NET.cam.z; }
      else { N3.yaw -= dx * 0.0062; N3.pitch = Math.max(-1.5, Math.min(1.5, N3.pitch + dy * 0.0062)); N3.vy = -dx * 0.0062; N3.vp = dy * 0.0062; }
    }
    p.x = ev.clientX; p.y = ev.clientY;
    if(ks.length === 2){
      var d = netPinchDist();
      if(NET.pinch){ if(S.net.mode === '2d') NET.cam.z = Math.max(0.3, Math.min(4, NET.cam.z * d / NET.pinch)); else N3.zoom = Math.max(0.45, Math.min(3.5, N3.zoom * d / NET.pinch)); }
      NET.pinch = d; NET.moved = true;
    }
    NET.dirty = true;
  });
  function up(ev){
    NET.lastAct = performance.now();
    var had = NET.ptr[ev.pointerId]; delete NET.ptr[ev.pointerId]; NET.pinch = 0;
    if(had && !NET.moved && Object.keys(NET.ptr).length === 0){
      var r = cv.getBoundingClientRect(), n = S.net.mode === '2d' ? netHit(ev.clientX - r.left, ev.clientY - r.top) : net3Hit(ev.clientX - r.left, ev.clientY - r.top);
      S.net.sel = n ? n.di : null; N3.auto = !n; netCard(); NET.dirty = true;
    }
  }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', function(ev){
    ev.preventDefault(); NET.lastAct = performance.now();
    if(S.net.mode !== '2d'){ N3.zoom = Math.max(0.45, Math.min(3.5, N3.zoom * Math.exp(-ev.deltaY * 0.0012))); return; }
    var z2 = Math.max(0.3, Math.min(4, NET.cam.z * Math.exp(-ev.deltaY * 0.0011)));
    var r = cv.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
    var wx = (mx - NET.W / 2) / NET.cam.z + NET.cam.x, wy = (my - NET.H / 2) / NET.cam.z + NET.cam.y;
    NET.cam.z = z2; NET.cam.x = wx - (mx - NET.W / 2) / z2; NET.cam.y = wy - (my - NET.H / 2) / z2; NET.dirty = true;
  }, { passive:false });
  cv.addEventListener('pointerleave', function(){ NET.hoverDi = null; N3.hover = null; });
  cancelAnimationFrame(NET.raf);
  (function frame(ts){
    if(!document.body.contains(NET.cv) || document.body.getAttribute('data-view') !== 'network') return;
    var now = ts || 0, dt = NET.lastTs ? Math.min(0.05, Math.max(0, (now - NET.lastTs) / 1000)) : 0;
    NET.lastTs = now;
    if(dt > 0){
      var tg = driftTarget(now), kk = 1 - Math.exp(-dt / (tg < NET.dvel ? DRIFT_TAU_DOWN : DRIFT_TAU_UP));
      NET.dvel += (tg - NET.dvel) * kk;
      if(tg === 0 && NET.dvel < 1e-5) NET.dvel = 0;
    }
    if(S.net.mode === '2d'){
      if(NET.dvel){ NET.rot += NET.dvel * dt; NET.dirty = true; }
      if(NET.dirty){ netDraw(); NET.dirty = false; }
    } else {
      if(NET.dvel) N3.yaw += NET.dvel * dt;
      net3Draw(ts || 0);
    }
    NET.raf = requestAnimationFrame(frame);
  })();
}

/* ---------- 3D: a small software renderer on the canvas, no outside libraries ---------- */
var N3 = { yaw:0.6, pitch:0.38, vy:0, vp:0, zoom:1, auto:true, idle:0, hover:null, proj:[], glow:{}, bgPts:null, t:0 };
function glowSprite(col){
  var c = N3.glow[col]; if(c) return c;
  c = document.createElement('canvas'); c.width = c.height = 64;
  var g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, hexA(col, 1)); gr.addColorStop(0.28, hexA(col, 0.95)); gr.addColorStop(0.42, hexA(col, 0.35)); gr.addColorStop(1, hexA(col, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); N3.glow[col] = c; return c;
}
function n3Project(x, y, z){
  var cy = Math.cos(N3.yaw), sy = Math.sin(N3.yaw), cp = Math.cos(N3.pitch), sp = Math.sin(N3.pitch);
  var x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
  var y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
  var f = 950, k = f / (f + z2 + 120) * N3.base * N3.zoom;
  return { x:NET.W / 2 + x1 * k, y:NET.H / 2 + y2 * k, z:z2, k:k };
}
function net3Draw(ts){
  var ctx = NET.ctx, W = NET.W, H = NET.H, dpr = NET.dpr, t = ts / 1000;
  N3.base = Math.min(W, H) / 1500 * (W < 600 ? 1.15 : 1);
  if(!Object.keys(NET.ptr).length){
    N3.yaw += N3.vy; N3.pitch = Math.max(-1.5, Math.min(1.5, N3.pitch + N3.vp)); N3.vy *= 0.94; N3.vp *= 0.94;
    /* calm pass 2026-10-13: no idle auto-rotation — the map sits still until dragged */
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  var c0 = n3Project(0, 0, 0);
  /* tier shells: one tilted ring and one upright ring per shell */
  [170, 310, 490, 640].forEach(function(R, i){
    for(var pass = 0; pass < 2; pass++){
      ctx.beginPath();
      for(var a = 0; a <= 72; a++){
        var th = a / 72 * 6.2832, p = pass ? n3Project(Math.cos(th) * R, Math.sin(th) * R * 0.82, 0) : n3Project(Math.cos(th) * R, 0, Math.sin(th) * R);
        if(a) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
      }
      ctx.strokeStyle = hexA(RING_C[i], pass ? 0.05 : 0.12 - i * 0.014); ctx.lineWidth = 1; ctx.stroke();
    }
  });
  if(S.net.bg){
    if(!N3.bgPts){
      var ci = D.circle_index || [], pts = [];
      for(var i = 0; i < ci.length; i++){ var rng = mulberry32((i + 1) * 2246822519 % 2147483647), u = rng() * 2 - 1, th2 = rng() * 6.2832, rr = Math.sqrt(1 - u * u), rad = 760 + rng() * rng() * 1000; pts.push([Math.cos(th2) * rr * rad, u * rad * 0.82, Math.sin(th2) * rr * rad]); }
      N3.bgPts = pts;
    }
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    N3.bgPts.forEach(function(q){ var p = n3Project(q[0], q[1], q[2]); if(p.x > -2 && p.y > -2 && p.x < W + 2 && p.y < H + 2) ctx.fillRect(p.x, p.y, 1.4, 1.4); });
  }
  var sel = S.net.sel != null ? NET.byDi[S.net.sel] : null, hot = {};
  if(sel) knownAssociates(D.directory[sel.di]).forEach(function(nb){ var tt = BYN[(nb.u || '').toLowerCase()]; if(tt != null) hot[tt] = 1; });
  var proj = NET.nodes.map(function(n){ var p = n3Project(n.x3, n.y3, n.z3); p.n = n; return p; });
  N3.proj = proj;
  /* edges from the selected person */
  if(sel){
    var sp = proj[NET.nodes.indexOf(sel)];
    proj.forEach(function(p){
      if(!hot[p.n.di]) return;
      var g = ctx.createLinearGradient(sp.x, sp.y, p.x, p.y); g.addColorStop(0, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,.12)');
      ctx.strokeStyle = g; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    });
  }
  var order = proj.slice().sort(function(a, b){ return b.z - a.z; });
  var cDrawn = false;
  order.forEach(function(p){
    if(!cDrawn && p.z < 0){ cDrawn = true; n3Center(ctx, c0); }
    if(p.x < -20 || p.y < -20 || p.x > W + 20 || p.y > H + 20) return;
    var n = p.n, col = netColor(n), isSel = sel && sel.di === n.di;
    var depth = Math.max(0.28, Math.min(1, 1 - (p.z + 650) / 1500));
    var a = (sel && !isSel && !hot[n.di]) ? depth * 0.25 : depth;
    var rr = Math.max(1.6, n.r * p.k * 1.25 * (isSel ? 1.8 : 1));
    ctx.globalAlpha = a;
    if(n.nw){ ctx.globalAlpha = a * 0.425; var hs = rr * 5; ctx.drawImage(glowSprite(col), p.x - hs, p.y - hs, hs * 2, hs * 2); ctx.globalAlpha = a; }
    var gs = rr * 2.6; ctx.drawImage(glowSprite(col), p.x - gs, p.y - gs, gs * 2, gs * 2);
    if(isSel){ ctx.globalAlpha = 1; ctx.strokeStyle = '#e30613'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(p.x, p.y, rr + 4, 0, 6.2832); ctx.stroke(); }
  });
  if(!cDrawn) n3Center(ctx, c0);
  ctx.globalAlpha = 1;
  /* labels: selected and hovered only, so the sphere stays clean */
  [sel ? sel.di : null, N3.hover].forEach(function(di, i){
    if(di == null || (i === 1 && di === (sel && sel.di))) return;
    var p = proj[NET.nodes.indexOf(NET.byDi[di])]; if(!p) return;
    var nm = dispName(D.directory[di]); ctx.font = '600 12.5px Archivo,sans-serif';
    var w = ctx.measureText(nm).width + 18, x = Math.max(6, Math.min(W - w - 6, p.x - w / 2)), y = p.y - 34;
    ctx.fillStyle = 'rgba(10,10,10,.92)'; ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1;
    ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(x, y, w, 24, 2); else ctx.rect(x, y, w, 24); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f2f2f2'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(nm, x + 9, y + 12.5);
  });
}
function n3Center(ctx, c){
  var s = Math.max(9, 17 * c.k * 2.2), g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, s * 3.2);
  g.addColorStop(0, 'rgba(227,6,19,.5)'); g.addColorStop(1, 'rgba(227,6,19,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, s * 3.2, 0, 6.2832); ctx.fill();
  var g2 = ctx.createRadialGradient(c.x - s * .3, c.y - s * .35, 1, c.x, c.y, s);
  g2.addColorStop(0, '#e30613'); g2.addColorStop(1, '#e30613');
  ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(c.x, c.y, s, 0, 6.2832); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.font = '700 ' + Math.round(s * 0.9) + 'px Archivo,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('JD', c.x, c.y + 0.5);
}
function net3Hit(sx, sy){
  var best = null, bd = 1e9;
  N3.proj.forEach(function(p){
    var d = Math.hypot(p.x - sx, p.y - sy), lim = Math.max(10, p.n.r * p.k * 1.25 + 7);
    if(d < lim){ var sc = d + (p.z + 700) * 0.012; if(sc < bd){ bd = sc; best = p.n; } }
  });
  return best;
}

function netPinchDist(){ var k = Object.keys(NET.ptr).map(function(i){ return NET.ptr[i]; }); return k.length < 2 ? 0 : Math.hypot(k[0].x - k[1].x, k[0].y - k[1].y); }
function netResize(){
  var cv = NET.cv, r = cv.getBoundingClientRect(); NET.dpr = Math.min(2, window.devicePixelRatio || 1);
  NET.W = Math.max(200, r.width); NET.H = Math.max(200, r.height);
  cv.width = NET.W * NET.dpr; cv.height = NET.H * NET.dpr; NET.dirty = true;
}
function netFit(){ N3.zoom = 1; N3.pitch = 0.38; N3.auto = S.net.sel == null; NET.cam.x = 0; NET.cam.y = 0; NET.cam.z = Math.max(0.3, Math.min(1.4, Math.min(NET.W, NET.H) / (S.net.bg ? 1900 : 1450))); NET.rot = 0; NET.dirty = true; }
function w2s(x, y){ return [(x - NET.cam.x) * NET.cam.z + NET.W / 2, (y - NET.cam.y) * NET.cam.z + NET.H / 2]; }
function netHit(sx, sy){
  var wx = (sx - NET.W / 2) / NET.cam.z + NET.cam.x, wy = (sy - NET.H / 2) / NET.cam.z + NET.cam.y, best = null, bd = 1e9, lim = Math.max(8, 16 / NET.cam.z);
  /* undo the 2D drift rotation, so the hit lands on the node under the cursor */
  var rc = Math.cos(NET.rot), rs = Math.sin(NET.rot), qx = wx * rc + wy * rs, qy = -wx * rs + wy * rc;
  NET.nodes.forEach(function(n){ var d = Math.hypot(n.x - qx, n.y - qy); if(d < lim && d < bd){ bd = d; best = n; } });
  return best;
}
function netDraw(){
  var ctx = NET.ctx, z = NET.cam.z;
  ctx.setTransform(NET.dpr, 0, 0, NET.dpr, 0, 0); ctx.clearRect(0, 0, NET.W, NET.H);
  var c = w2s(0, 0);
  [170, 310, 490, 640].forEach(function(r, i){
    ctx.strokeStyle = hexA(RING_C[i], 0.15 - i * 0.02); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(c[0], c[1], r * z, 0, 6.2832); ctx.stroke();
  });
  if(S.net.bg){
    if(!NET.bg){
      var ci = D.circle_index || [], dots = [];
      for(var i = 0; i < ci.length; i++){ var rng = mulberry32((i + 1) * 2246822519 % 2147483647), ang = rng() * 6.2832, rad = 720 + rng() * rng() * 1100; dots.push([Math.cos(ang) * rad, Math.sin(ang) * rad]); }
      NET.bg = dots;
    }
    ctx.fillStyle = 'rgba(255,255,255,.13)';
    NET.bg.forEach(function(d){ var rp = netRotP(d[0], d[1]), p = w2s(rp[0], rp[1]); if(p[0] > -3 && p[1] > -3 && p[0] < NET.W + 3 && p[1] < NET.H + 3) ctx.fillRect(p[0], p[1], 1.5, 1.5); });
  }
  var sel = S.net.sel != null ? NET.byDi[S.net.sel] : null;
  if(sel){
    var se = D.directory[sel.di], sap = netRotP(sel.x, sel.y), a = w2s(sap[0], sap[1]);
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1;
    knownAssociates(se).forEach(function(nb){
      var t = BYN[(nb.u || '').toLowerCase()], nd = t != null ? NET.byDi[t] : null; if(!nd) return;
      var bp = netRotP(nd.x, nd.y), b = w2s(bp[0], bp[1]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    });
  }
  var fade = !!sel, hot = {};
  if(sel) knownAssociates(D.directory[sel.di]).forEach(function(nb){ var t = BYN[(nb.u || '').toLowerCase()]; if(t != null) hot[t] = 1; });
  NET.nodes.forEach(function(n){
    var rp = netRotP(n.x, n.y), p = w2s(rp[0], rp[1]); if(p[0] < -10 || p[1] < -10 || p[0] > NET.W + 10 || p[1] > NET.H + 10) return;
    var rr = n.r * Math.sqrt(z), col = netColor(n), isSel = sel && sel.di === n.di;
    ctx.globalAlpha = fade && !isSel && !hot[n.di] ? 0.28 : 1;
    if(n.nw){ ctx.fillStyle = hexA(col, 0.18); ctx.beginPath(); ctx.arc(p[0], p[1], rr + 5, 0, 6.2832); ctx.fill(); }
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p[0], p[1], rr, 0, 6.2832); ctx.fill();
    if(isSel){ ctx.strokeStyle = '#e30613'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(p[0], p[1], rr + 3.5, 0, 6.2832); ctx.stroke(); }
  });
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#e30613'; ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(7, 10 * Math.sqrt(z)), 0, 6.2832); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.font = '700 ' + Math.max(8, 10 * Math.sqrt(z)) + 'px Archivo,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('JD', c[0], c[1] + 0.5);
}
/* Map stats for the Network right panel. Display-only counts over what is on the map. */
function netStatsHTML(){
  var tc = {}, nw = 0;
  NET.nodes.forEach(function(n){ var t = tierOf(D.directory[n.di]) || 'none'; tc[t] = (tc[t] || 0) + 1; if(n.nw) nw++; });
  var rows = [['On the map', String(NET.nodes.length)]];
  TIER_ORDER.forEach(function(t){ if(tc[t]) rows.push([TIERS[t].n, String(tc[t]), TIERS[t].c]); });
  if(tc.none) rows.push(['No tier yet', String(tc.none), RING_C[3]]);
  if(nw) rows.push(['New connections', String(nw)]);
  if(S.net.bg) rows.push(['Wider circle', String((D.circle_index || []).length)]);
  return '<div class="side-h"><h3>Map</h3></div><div class="statrows">' +
    rows.map(function(r){ return '<div class="srow2"><span>' + (r[2] ? '<i class="sdot" style="background:' + r[2] + '"></i>' : '') + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('') + '</div>';
}
function netCard(){
  var panel = $('#netpanel'); if(!panel) return;
  var cardBox = $('#netpcard'), statBox = $('#netpstats'), cols = panel.parentNode;
  if(statBox) statBox.innerHTML = netStatsHTML();
  var di = S.net.sel;
  if(di == null || !D.directory[di]){
    if(cardBox){ cardBox.hidden = true; cardBox.innerHTML = ''; }
    if(cols) cols.classList.remove('sel');
  } else {
    var e = D.directory[di], ka = knownAssociates(e).length, inFam = !!famDisplay()[di];
    cardBox.hidden = false;
    cardBox.innerHTML = '<div class="nc-h">' + avatar(e, 'md') + '<div><b>' + esc(dispName(e)) + '</b><small>' + esc(infoLine(e) || (effHandle(e) ? '@' + effHandle(e) : '')) + '</small></div>' +
      '<button type="button" class="ib" data-act="netclose" aria-label="Close">' + ic('x', 16) + '</button></div>' +
      '<div class="nc-f"><span>' + ka + ' known associate' + (ka === 1 ? '' : 's') + (RELN[e.relation] ? ' · ' + RELN[e.relation] : '') + '</span><span class="sp"></span>' +
      (inFam ? '<button type="button" class="btn ghost sm" data-act="openfam" data-di="' + di + '">Family</button>' : '') +
      '<button type="button" class="btn primary sm" data-act="popen1" data-di="' + di + '">Open profile</button></div>';
    if(cols) cols.classList.add('sel');
  }
  /* the panel opening or closing changes the canvas size; refit the backing store */
  if(NET.cv && document.body.contains(NET.cv)) requestAnimationFrame(function(){ netResize(); });
}

/* ============================================================
   Family space — bloodline trees on one pannable canvas. The model code is unchanged; the camera is
   a plain transform with drag momentum, pinch and wheel zoom, and a glide to the focused person.
   ============================================================ */
var FAMV = { cam:{ x:0, y:0, z:1 }, vel:{ x:0, y:0 }, ptr:{}, pinch:0, moved:false, raf:0, lay:null, pos:{}, glide:null, el:null, hover:null, lastAct:0, dk:0, ph:0, off:null, draf:0, _driftApply:false };
/* Family right panel: tree summary + a row per tree (tap to jump to that tree). */
function famSideHTML(lay){
  var total = 0, big = null;
  lay.clusters.forEach(function(c){ total += c.tree.members.length; if(!big || c.tree.members.length > big.tree.members.length) big = c; });
  var rows = [['Trees', String(lay.clusters.length)], ['People in trees', String(total)]];
  if(big) rows.push(['Largest family', big.tree.title + ' · ' + big.tree.members.length]);
  var treeRows = lay.clusters.map(function(c){
    var rep = null;
    c.model.nodes.forEach(function(n){ if(rep == null && c.tree.blood[n.di]) rep = n.di; });
    if(rep == null && c.model.nodes.length) rep = c.model.nodes[0].di;
    return '<button type="button" class="srow' + (rep != null && S.fam.focus === rep ? ' on' : '') + '" data-act="famtree" data-di="' + rep + '"><span>' + esc(c.tree.title) + '</span><b>' + c.tree.members.length + '</b></button>';
  }).join('');
  return '<aside class="fampanel"><div class="side-h"><h3>Summary</h3><button type="button" class="ib sm" data-act="famside" aria-label="Close summary">' + ic('x', 15) + '</button></div>' +
    '<div class="statrows">' + rows.map(function(r){ return '<div class="srow2"><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>'; }).join('') + '</div>' +
    '<div class="side-sec"><h4>Trees</h4>' + treeRows + '</div></aside>';
}
function viewFamily(v){
  var disp = famDisplay(), ft = famTrees(disp), lay = famSpaceLayout(disp, ft);
  FAMV.lay = lay; FAMV.pos = {}; FAMV.hover = null; FAMV.off = null; FAMV.dk = 0;
  lay.clusters.forEach(function(c){
    c.model.nodes.forEach(function(n){ if(c.tree.blood[n.di] || !FAMV.pos[n.di]) FAMV.pos[n.di] = { x:c.ox + n.x + DFT.NW / 2, y:c.oy + n.y + DFT.CY, tree:c.tree.id }; });
  });
  if(!lay.clusters.length){ v.innerHTML = '<div class="page">' + emptyState('No family trees yet.', 'Add a parent, spouse, child or sibling from a profile and the tree appears here.') + '</div>'; return; }
  var svg = '<svg class="flines" width="' + lay.W + '" height="' + lay.H + '" viewBox="0 0 ' + lay.W + ' ' + lay.H + '">';
  lay.clusters.forEach(function(c){
    c.model.lines.forEach(function(l){ svg += '<line x1="' + (c.ox + l.x1) + '" y1="' + (c.oy + l.y1) + '" x2="' + (c.ox + l.x2) + '" y2="' + (c.oy + l.y2) + '"/>'; });
  });
  lay.links.forEach(function(l){ svg += '<path class="xlink" data-di="' + l.di + '" d="M' + l.x1 + ' ' + l.y1 + ' C' + l.x1 + ' ' + (l.y1 + 120) + ' ' + l.x2 + ' ' + (l.y2 - 120) + ' ' + l.x2 + ' ' + l.y2 + '"/>'; });
  svg += '</svg>';
  var html = '';
  lay.clusters.forEach(function(c){
    html += '<div class="ftitle" style="left:' + c.ox + 'px;top:' + c.labelY + 'px">' + esc(c.tree.title) + ' <small>' + c.tree.members.length + '</small></div>';
    c.model.nodes.forEach(function(n){
      var e = D.directory[n.di], st = c.model.styleOf(n.di), foc = S.fam.focus === n.di;
      html += '<button type="button" class="fn' + (foc ? ' foc' : '') + '" data-act="fnode" data-di="' + n.di + '" style="left:' + (c.ox + n.x) + 'px;top:' + (c.oy + n.y) + 'px;--fc:' + st.c + '"><span class="fc">' + esc(famInitials(dispName(e))) + '</span><b>' + esc(dispName(e)) + '</b><small>' + esc(st.cap) + '</small></button>';
    });
  });
  v.innerHTML = '<div class="page fampage"><div class="netbar"><div><h1 class="display">Family</h1><p class="sub">' + lay.trees.length + ' bloodline' + (lay.trees.length === 1 ? '' : 's') + '. Married-in spouses also appear in their own tree.</p></div>' +
    '<div class="netctl"><button type="button" class="btn ghost sm" data-act="famside" aria-expanded="' + (sideOpen(S.fam.side) ? 'true' : 'false') + '">Summary</button></div></div>' +
    '<div class="famcols"><div class="fspace" id="fspace"><div class="fworld" id="fworld" style="width:' + lay.W + 'px;height:' + lay.H + 'px">' + svg + html + '</div>' +
    '<div class="netzoom"><button type="button" class="ib" data-act="famzoom" data-d="1" aria-label="Zoom in">' + ic('plus', 18) + '</button><button type="button" class="ib" data-act="famzoom" data-d="-1" aria-label="Zoom out">' + ic('minus', 18) + '</button><button type="button" class="ib" data-act="famfit" aria-label="Fit all">' + ic('target', 18) + '</button></div>' +
    '<div class="netcard" id="famcard" hidden></div></div>' +
    (sideOpen(S.fam.side) ? famSideHTML(lay) : '') + '</div></div>';
  FAMV.el = $('#fspace');
  famFit();
  if(S.fam.focus != null && FAMV.pos[S.fam.focus]){ var p = FAMV.pos[S.fam.focus]; FAMV.cam = { x:p.x, y:p.y, z:0.9 }; famApply(); }
  famCard();
  var el = FAMV.el; FAMV.ptr = {}; FAMV.pinch = 0;
  el.addEventListener('pointerdown', function(ev){
    if(ev.target.closest('.netzoom, .netcard')) return;
    el.setPointerCapture(ev.pointerId); FAMV.ptr[ev.pointerId] = { x:ev.clientX, y:ev.clientY, t:ev.target }; FAMV.moved = false; FAMV.vel = { x:0, y:0 }; FAMV.glide = null;
    if(Object.keys(FAMV.ptr).length === 2) FAMV.pinch = famPinchDist();
  });
  el.addEventListener('pointermove', function(ev){
    var p = FAMV.ptr[ev.pointerId]; if(!p) return;
    var ks = Object.keys(FAMV.ptr);
    if(ks.length === 1){
      var dx = ev.clientX - p.x, dy = ev.clientY - p.y;
      if(Math.abs(dx) + Math.abs(dy) > 4) FAMV.moved = true;
      if(FAMV.moved){ FAMV.cam.x -= dx / FAMV.cam.z; FAMV.cam.y -= dy / FAMV.cam.z; FAMV.vel = { x:dx / FAMV.cam.z, y:dy / FAMV.cam.z }; famApply(); }
    }
    p.x = ev.clientX; p.y = ev.clientY;
    if(ks.length === 2){
      var d = famPinchDist(); if(FAMV.pinch) FAMV.cam.z = Math.max(0.2, Math.min(1.6, FAMV.cam.z * d / FAMV.pinch));
      FAMV.pinch = d; FAMV.moved = true; famApply();
    }
  });
  function fup(ev){
    var had = FAMV.ptr[ev.pointerId]; delete FAMV.ptr[ev.pointerId]; FAMV.pinch = 0;
    if(had && FAMV.moved && Object.keys(FAMV.ptr).length === 0) famCoast();
  }
  el.addEventListener('pointerup', fup); el.addEventListener('pointercancel', fup);
  el.addEventListener('wheel', function(ev){
    ev.preventDefault();
    var z0 = FAMV.cam.z, z2 = Math.max(0.2, Math.min(1.6, z0 * Math.exp(-ev.deltaY * 0.0011)));
    var r = el.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top, W = r.width, H = r.height;
    var wx = (mx - W / 2) / z0 + FAMV.cam.x, wy = (my - H / 2) / z0 + FAMV.cam.y;
    FAMV.cam.z = z2; FAMV.cam.x = wx - (mx - W / 2) / z2; FAMV.cam.y = wy - (my - H / 2) / z2; famApply();
  }, { passive:false });
  el.addEventListener('pointermove', function(){ FAMV._pmoveT = performance.now(); });
  el.addEventListener('pointerover', function(ev){
    var b = ev.target.closest ? ev.target.closest('.fn') : null, di = b ? +b.getAttribute('data-di') : null;
    if(di !== FAMV.hover){ FAMV.hover = di; if(di != null) FAMV._hoverT = performance.now(); famHi(); }
  });
  el.addEventListener('pointerout', function(ev){
    var to = ev.relatedTarget;
    if(to && to.closest && to.closest('.fn')) return;
    /* the idle drift can slide a node out from under a still cursor — that is
       the world moving, not the user leaving, so it does not clear the hover */
    if(FAMV._pmoveT && FAMV._hoverT && FAMV._pmoveT <= FAMV._hoverT) return;
    if(FAMV.hover != null){ FAMV.hover = null; famHi(); }
  });
  famDriftStart();
}
function famPinchDist(){ var k = Object.keys(FAMV.ptr).map(function(i){ return FAMV.ptr[i]; }); return k.length < 2 ? 0 : Math.hypot(k[0].x - k[1].x, k[0].y - k[1].y); }
function famApply(){
  var w = $('#fworld'), el = FAMV.el; if(!w || !el) return;
  if(!FAMV._driftApply) FAMV.lastAct = performance.now();
  var r = el.getBoundingClientRect(), z = FAMV.cam.z, o = FAMV.off || { x:0, y:0 };
  w.style.transform = 'translate(' + (r.width / 2 - FAMV.cam.x * z + o.x) + 'px,' + (r.height / 2 - FAMV.cam.y * z + o.y) + 'px) scale(' + z + ')';
}
function famFit(){
  var el = FAMV.el, lay = FAMV.lay; if(!el || !lay) return;
  var r = el.getBoundingClientRect();
  FAMV.cam = { x:lay.W / 2, y:lay.H / 2, z:Math.max(0.2, Math.min(1, Math.min(r.width / lay.W, r.height / lay.H) * 0.95)) };
  famApply();
}
function famCoast(){
  cancelAnimationFrame(FAMV.raf);
  (function step(){
    if(document.body.getAttribute('data-view') !== 'family') return;
    FAMV.vel.x *= 0.92; FAMV.vel.y *= 0.92;
    if(Math.abs(FAMV.vel.x) + Math.abs(FAMV.vel.y) < 0.15) return;
    FAMV.cam.x -= FAMV.vel.x; FAMV.cam.y -= FAMV.vel.y; famApply(); FAMV.raf = requestAnimationFrame(step);
  })();
}
function famGlide(di){
  var p = FAMV.pos[di]; if(!p) return;
  var from = { x:FAMV.cam.x, y:FAMV.cam.y, z:FAMV.cam.z }, to = { x:p.x, y:p.y, z:Math.max(0.7, FAMV.cam.z) }, t0 = performance.now();
  cancelAnimationFrame(FAMV.raf);
  (function step(now){
    var k = Math.min(1, ((now || performance.now()) - t0) / 420), ease = 1 - Math.pow(1 - k, 3);
    FAMV.cam = { x:from.x + (to.x - from.x) * ease, y:from.y + (to.y - from.y) * ease, z:from.z + (to.z - from.z) * ease }; famApply();
    if(k < 1) FAMV.raf = requestAnimationFrame(step);
  })();
}
function famCard(){
  var box = $('#famcard'); if(!box) return;
  var di = S.fam.focus;
  if(di == null || !D.directory[di]){ box.hidden = true; box.innerHTML = ''; return; }
  var e = D.directory[di], f = famDisplay()[di] || { parents:[], spouses:[], children:[], siblings:[] };
  var plural = function(n, w, ws){ return n ? n + ' ' + (n === 1 ? w : ws) : ''; };
  var bits = [plural(f.parents.length, 'parent', 'parents'), f.spouses.length ? 'spouse' : '', plural(f.children.length, 'child', 'children'), plural(f.siblings.length, 'sibling', 'siblings')].filter(Boolean);
  box.hidden = false;
  box.innerHTML = '<div class="nc-h">' + avatar(e, 'md') + '<div><b>' + esc(dispName(e)) + '</b><small>' + esc(bits.join(' · ') || 'No links') + '</small></div><span class="sp"></span>' +
    '<button type="button" class="ib" data-act="famclose" aria-label="Close">' + ic('x', 16) + '</button></div>' +
    '<div class="nc-f"><span class="sp"></span><button type="button" class="btn ghost sm" data-act="openedit" data-di="' + di + '" data-sec="connections">Edit links</button><button type="button" class="btn primary sm" data-act="popen1" data-di="' + di + '">Open profile</button></div>';
}
/* Hovering a person lights them and their direct family (parents, spouses,
   children, siblings) while the rest of the field dims back. A connector line
   lights when both of its ends land inside a lit person's padded box, which is
   where the tree geometry puts spouse links, drops, and sibling bars. */
function famHi(){
  var w = $('#fworld'); if(!w) return;
  var nodes = $$('.fn', w), lines = $$('.flines line', w), paths = $$('.flines .xlink', w), di = FAMV.hover;
  if(di == null || !D.directory[di]){
    w.classList.remove('fam-hov');
    nodes.forEach(function(n){ n.classList.remove('hl'); });
    lines.forEach(function(l){ l.classList.remove('hl'); });
    paths.forEach(function(p){ p.classList.remove('hl'); });
    return;
  }
  var f = famDisplay()[di] || { parents:[], spouses:[], children:[], siblings:[] }, set = {};
  set[di] = 1;
  ['parents', 'spouses', 'children', 'siblings'].forEach(function(k){ (f[k] || []).forEach(function(x){ set[x.di] = 1; }); });
  var boxes = [];
  nodes.forEach(function(n){
    var on = !!set[+n.getAttribute('data-di')];
    n.classList.toggle('hl', on);
    if(on) boxes.push({ x0:n.offsetLeft - 24, x1:n.offsetLeft + n.offsetWidth + 24, y0:n.offsetTop - 42, y1:n.offsetTop + n.offsetHeight + 42 });
  });
  function inBox(x, y){ for(var i = 0; i < boxes.length; i++){ var b = boxes[i]; if(x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return true; } return false; }
  lines.forEach(function(l){ l.classList.toggle('hl', inBox(+l.getAttribute('x1'), +l.getAttribute('y1')) && inBox(+l.getAttribute('x2'), +l.getAttribute('y2'))); });
  paths.forEach(function(p){ p.classList.toggle('hl', !!set[+p.getAttribute('data-di')]); });
  w.classList.add('fam-hov');
}
/* Idle drift for the family field: a slow pan (never a rotation — the trees
   must stay readable) that eases in and out with the same ramped feel as the
   maps. It runs only while nothing is hovered or held and the view has been
   quiet for a few seconds; famApply stamps lastAct on every real interaction
   (drag, wheel, glide, coast), so the drift never fights the user. */
function famDriftStart(){
  cancelAnimationFrame(FAMV.draf);
  var last = performance.now();
  (function tick(now){
    if(document.body.getAttribute('data-view') !== 'family' || !FAMV.el || !document.body.contains(FAMV.el)) return;
    now = now || performance.now();
    var dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    var idle = !REDUCED_MOTION && FAMV.hover == null && !Object.keys(FAMV.ptr).length && (now - (FAMV.lastAct || 0) > 4000);
    var tg = idle ? 1 : 0;
    FAMV.dk += (tg - FAMV.dk) * (1 - Math.exp(-dt / 1.4));
    if(FAMV.dk > 0.002 || FAMV.off){
      FAMV.ph += dt * (Math.PI * 2 / 240) * FAMV.dk;
      FAMV.off = { x:Math.sin(FAMV.ph) * 16 * FAMV.dk, y:Math.cos(FAMV.ph * 0.8) * 11 * FAMV.dk };
      FAMV._driftApply = true; famApply(); FAMV._driftApply = false;
      if(FAMV.dk <= 0.002 && tg === 0) FAMV.off = null;
    }
    FAMV.draf = requestAnimationFrame(tick);
  })(performance.now());
}

/* ============================================================
   Groups — your own groups plus churches, employers and schools, each with its people.
   ============================================================ */
var GKINDS = [['groups', 'Groups'], ['churches', 'Churches'], ['companies', 'Employers'], ['universities', 'Schools']];
function grpNamesFor(kind){
  if(kind === 'groups'){ var m = allGroups(); return Object.keys(m).sort().map(function(n){ return { n:n, c:m[n].length }; }); }
  return orgNames(kind).map(function(n){ return { n:n, c:orgMembers(kind, n).length }; }).filter(function(x){ return x.c > 0; }).sort(function(a, b){ return b.c - a.c || a.n.localeCompare(b.n); });
}
function viewGroups(v){
  var kind = S.route.seg[0] || 'groups', name = S.route.seg[1] || '';
  if(!GKINDS.some(function(k){ return k[0] === kind; })) kind = 'groups';
  var names = grpNamesFor(kind);
  var tabs = '<nav class="tabrow">' + GKINDS.map(function(k){ return '<a href="#/groups/' + k[0] + '" class="tab' + (k[0] === kind ? ' on' : '') + '">' + k[1] + '</a>'; }).join('') + '</nav>';
  var list = names.map(function(x){ return '<a href="#/groups/' + kind + '/' + encodeURIComponent(x.n) + '" class="grow' + (x.n === name ? ' on' : '') + '"><span>' + esc(x.n) + '</span><em>' + x.c + '</em></a>'; }).join('') || '<p class="dim pad">Nothing here yet.</p>';
  var add = kind === 'groups' ? '<div class="finder inline"><input id="gnew" placeholder="New group name" autocomplete="off"><button type="button" class="btn sm" data-act="gnew">Create</button></div>' : '';
  var detail = '';
  if(name){
    var mem = kind === 'groups' ? (allGroups()[name] || []) : orgMembers(kind, name);
    mem = mem.slice().sort(function(a, b){ return dispName(D.directory[a]).localeCompare(dispName(D.directory[b])); });
    detail = '<div class="gdet"><div class="gdh"><a class="ib backm" href="#/groups/' + kind + '" aria-label="Back to list">' + ic('chevl', 18) + '</a><div><h2>' + esc(name) + '</h2><small>' + mem.length + ' ' + (mem.length === 1 ? 'person' : 'people') + '</small></div><span class="sp"></span>' +
      (kind === 'groups' ? '<button type="button" class="btn ghost sm" data-act="grename" data-g="' + esc(name) + '">Rename</button><button type="button" class="btn ghost sm danger" data-act="gdelete" data-g="' + esc(name) + '">Delete</button>' : '') + '</div>' +
      (kind === 'groups' ? '<div class="finder"><input id="gaddq" data-g="' + esc(name) + '" placeholder="Add a person to this group" autocomplete="off"><div id="gaddr" class="hits"></div></div>' : '<p class="note">Membership comes from each profile’s Background section.</p>') +
      '<div class="plist">' + (mem.map(function(di, i){ var e = D.directory[di];
        return '<div class="prow static"><a class="prow-in" href="#/p/' + encodeURIComponent(personId(e)) + '" data-act="popen1" data-di="' + di + '">' + avatar(e, 'md') + '<span class="pn"><b>' + esc(dispName(e)) + '</b><small>' + esc(infoLine(e)) + '</small></span></a>' +
          (kind === 'groups' ? '<button type="button" class="ib" data-act="gmemrm" data-g="' + esc(name) + '" data-di="' + di + '" aria-label="Remove from group">' + ic('x', 16) + '</button>' : '') + '</div>'; }).join('') || '<p class="dim pad">No one yet.</p>') + '</div></div>';
  }
  v.innerHTML = '<div class="page groups' + (name ? ' has-detail' : '') + '"><div class="pagehead"><div><h1 class="display">Groups</h1><p class="sub">Where people overlap.</p></div></div>' + tabs +
    '<div class="ggrid"><aside class="glist">' + add + list + '</aside><section class="gmain">' + (detail || '<div class="empty"><h3>Pick one</h3><p>Choose a name on the left to see who is in it.</p></div>') + '</section></div></div>';
}
function groupRename(oldN, newN){
  newN = newN.trim(); if(!newN || newN === oldN) return;
  txn('Rename group', function(){
    (allGroups()[oldN] || []).forEach(function(di){
      var arr = personGroups(D.directory[di]).map(function(g){ return g === oldN ? newN : g; });
      setPersonGroups(di, arr.filter(function(g, i) { return arr.indexOf(g) === i; }));
    });
  });
  GRP_EXTRA = GRP_EXTRA.map(function(g){ return g === oldN ? newN : g; }); store('ncc_groups_extra', JSON.stringify(GRP_EXTRA));
}
function groupDelete(n){
  txn('Delete group', function(){ (allGroups()[n] || []).forEach(function(di){ setPersonGroups(di, personGroups(D.directory[di]).filter(function(g){ return g !== n; })); }); });
  GRP_EXTRA = GRP_EXTRA.filter(function(g){ return g !== n; }); store('ncc_groups_extra', JSON.stringify(GRP_EXTRA));
}

/* ============================================================
   Settings — only things that are settings: connection, AI assist, merged profiles, local data.
   Shortcuts are listed, not configurable.
   ============================================================ */
function viewSettings(v){
  var merged = [];
  D.directory.forEach(function(e, di){ var m = (e.profile || {}).merged_into; if(m && String(m).trim() && (e.profile || {}).deleted !== '1') merged.push(di); });
  v.innerHTML = '<div class="page settings"><div class="pagehead"><div><h1 class="display">Settings</h1><p class="sub">Data from ' + esc(D.updated || 'unknown') + '</p></div></div>' +
    '<section class="card"><header><h3>Connection</h3></header><div class="cbody">' +
    '<label class="lab">Edit key<small>Only needed if the Apps Script project has an EDIT_TOKEN. Kept in this browser.</small></label>' +
    '<input type="password" id="setedit" placeholder="Edit key" autocomplete="off" value="' + esc(getPw()) + '">' +
    '<div class="row"><span class="syncline"><b id="syncs"></b></span><span class="sp"></span><button type="button" class="btn ghost sm" data-act="retry">Send pending edits now</button></div></div></section>' +
    '<section class="card"><header><h3>AI assist</h3></header><div class="cbody">' +
    '<label class="lab">Tidy prompt<small>Sent to Gemini with your draft when you press Tidy with AI.</small></label><textarea id="setprompt" rows="7" placeholder="Loading"></textarea>' +
    '<label class="lab">Gemini API key<small>Stored in the sheet, server side only.</small></label><input type="password" id="setkey" placeholder="AIza" autocomplete="off">' +
    '<div class="row"><button type="button" class="btn primary sm" data-act="setsave">Save</button><button type="button" class="btn ghost sm" data-act="settest">Test</button><button type="button" class="btn ghost sm danger" data-act="setclear">Clear key</button><span id="setmsg" class="dim"></span></div></div></section>' +
    '<section class="card"><header><h3>Merged profiles</h3><em class="cnt">' + merged.length + '</em></header><div class="cbody">' +
    (merged.length ? '<p class="dim">Combined profiles stay in the sheet with a pointer to the survivor. Restoring one brings it back as its own profile.</p>' + merged.map(function(di){
      var e = D.directory[di], tgt = BYN[String(e.profile.merged_into).toLowerCase()];
      return '<div class="evrow"><div><b>' + esc(dispName(e)) + '</b><small>into ' + esc(tgt != null ? dispName(D.directory[tgt]) : e.profile.merged_into) + '</small></div><div class="ea"><button type="button" class="btn ghost sm" data-act="unmerge" data-di="' + di + '">Restore</button></div></div>';
    }).join('') : '<p class="dim">Nothing has been merged.</p>') + '</div></section>' +
    '<section class="card"><header><h3>Keyboard</h3></header><div class="cbody"><div class="keys"><kbd>/</kbd><span>Search</span><kbd>Esc</kbd><span>Close or go back</span><kbd>Ctrl Z</kbd><span>Undo</span></div></div></section></div>';
  paintSync();
  settingsCall('getsettings', { x:1 }, function(res){
    var p = $('#setprompt'), k = $('#setkey'), m = $('#setmsg'); if(!p) return;
    if(res && res.ok){ p.value = res.prompt || ''; k.placeholder = res.hasKey ? 'Key saved. Enter a new one to replace it.' : 'AIza'; }
    else if(m) m.textContent = 'Could not load: ' + ((res && res.error) || 'unknown');
  });
}
function settingsCall(kind, patch, cb){
  fetch(WEBAPP_URL, { method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' }, body:JSON.stringify({ password:getPw(), kind:kind, id:'settings', patch:patch }) })
    .then(function(r){ return r.json(); }).then(cb).catch(function(){ var m = $('#setmsg'); if(m) m.textContent = 'Network error.'; });
}

/* ============================================================
   Combine sheet (merge from a profile) and Drive doc sheet
   ============================================================ */
var MG = { a:null, b:null, surv:null };
function openMergeSheet(di){
  MG = { a:di, b:null, surv:null };
  openSheet('Merge with another profile', '<p class="dim">Pick the other profile of the same person. On the next step you choose which one stays; their details combine into it, nothing is deleted, and you can undo it.</p>' +
    '<div class="finder"><input id="mq" placeholder="Search for the other profile" autocomplete="off"><div id="mr" class="hits"></div></div>');
}
function mergeStep2(){
  var A = D.directory[MG.a], B = D.directory[MG.b];
  if(MG.surv == null) MG.surv = mergeRichness(B) > mergeRichness(A) ? MG.b : MG.a;
  var loser = MG.surv === MG.a ? MG.b : MG.a, pv = mergePreview(loser, MG.surv);
  var lines = [];
  if(pv.filled.length) lines.push('Fills blanks: ' + pv.filled.join(', '));
  if(pv.union.length) lines.push('Combines lists: ' + pv.union.join(', '));
  if(pv.appended.length) lines.push('Appends text: ' + pv.appended.join(', '));
  if(pv.carried.length) lines.push('Carries over: ' + pv.carried.join(', '));
  $('#sheetwrap .sbody').innerHTML = '<p class="dim">Choose which profile stays. The other one\'s details combine into it, and it stops showing as its own profile. Nothing is deleted, and you can undo this.</p>' + [MG.a, MG.b].map(function(di){
    var e = D.directory[di];
    return '<label class="dm' + (di === MG.surv ? ' on' : '') + '"><input type="radio" name="msv" data-act="msv" data-di="' + di + '"' + (di === MG.surv ? ' checked' : '') + '>' + avatar(e, 'sm') + '<span><b>' + esc(dispName(e)) + '</b><small>' + esc([effHandle(e) ? '@' + effHandle(e) : '', tierName(e), e.city].filter(Boolean).join(' · ')) + '</small></span></label>';
  }).join('') + '<div class="rb quiet"><h4>What moves over</h4>' + (lines.length ? '<ul class="issues">' + lines.map(function(l){ return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' : '<p>Nothing extra to carry over.</p>') + '</div>' +
    '<div class="row end"><button type="button" class="btn ghost" data-act="sheetx">Cancel</button><button type="button" class="btn primary" data-act="mergego">Merge into ' + esc(dispName(D.directory[MG.surv])) + '</button></div>';
}
function mergeMany(survDi, losers){
  var target = mergeTarget(survDi); if(!target) return false;
  txn('Combine profiles', function(){
    losers.forEach(function(l){
      queuePatch(l, { merged_into:target });
      if(raw(D.directory[l], 'review_flag') === 'duplicate') queuePatch(l, { review_flag:'' });
    });
    if(raw(D.directory[survDi], 'review_flag') === 'duplicate') queuePatch(survDi, { review_flag:'' });
  });
  return true;
}
/* Confirm step for the selective two-person merge from a duplicate group.
   Confirming queues exactly one patch: merged_into on the loser. */
function subjSlug(e){
  if(e.record && e.record.slug) return e.record.slug;
  return String(dispName(e)).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function openDocSheet(di){
  var e = D.directory[di]; if(!e) return;
  openSheet('New Drive doc', '<p class="dim">Creates a Google Doc in the North Country Circle Files folder and attaches it to ' + esc(dispName(e)) + '.</p>' +
    '<input id="dtitle" placeholder="Title, e.g. Full journal record" autocomplete="off"><div class="row end"><button type="button" class="btn primary" data-act="docgo" data-di="' + di + '">Create doc</button></div>');
}
function aiTidy(){
  var ta = $('textarea[data-pk="synopsis"]'), msg = $('#aimsg'), di = S.prof.di;
  var text = ta ? ta.value.trim() : '';
  if(!text){ if(msg) msg.textContent = 'Write something first.'; return; }
  if(msg) msg.textContent = 'Working';
  postKind('tidy', 'tidy', { text:text, mode:'synopsis' }, function(res){
    if(res.value){ ta.value = res.value; setField(di, 'synopsis', res.value); if(msg) msg.textContent = 'Done. Give it a read.'; }
    else if(msg) msg.textContent = 'Nothing came back.';
  }, function(err){ if(msg) msg.textContent = err; });
}

/* ============================================================
   Audit — a light feeder wall of quick wins. NOT the old audit suite:
   one random card per profile carrying ALL of that person's missing
   quick-win facts (indicator chips switch the editor in place), filled in
   seconds through the same write path as everywhere else (txn /
   queuePatch). There is NO save button: filling a gap while the person
   has more to go submits INSTANTLY; only the card's LAST remaining gap
   flashes for 3 seconds before it submits and retires the card (editing
   during the window restarts the countdown). Every submit is a normal
   undoable txn. "Done with them" finishes the person: every gap still
   open on the card is dismissed on this device (ncc_aud_skip) and never
   dealt again — and it beats an armed countdown, which never submits.
   Deck state lives in S.audit for the visit; the deck is rebuilt from
   the live directory, so a filled gap never deals again either.
   "Save for later" parks the person (ncc_aud_later: pkey -> the gap on
   show); parked people deal first and reopen on the noted category.
   Shift+Down finishes the person NOW (a complete current value submits
   first, the rest close out); Shift+Left is Save for later. A done chip
   reopens its editor (click it) and commits a fresh patch. Every Audit
   action posts a toast with a one-step Undo (AUD_LAST).
   MODES (JD 2026-10-15, gamified per Duolingo / Zooniverse / Anki
   patterns): a segmented switcher (ncc_aud_mode) picks Cards (this
   wall, the untouched default), Rapid Fire (one person + one gap
   center stage, instant saves — no countdown — streak + pace + an
   optional 2-minute Blitz with an end-of-round summary), Category
   Run (the wall deals a single chosen category), or Finish Line
   (the wall deals fewest-gaps-first and counts profiles finished).
   A settable daily goal bar tracks fills across all modes.
   ============================================================ */
var AUD_WALL = 12;
var AUD_GAPS = {
  tier:  { tag:'Tier',          short:'Tier',     prompt:'Tier not set' },
  loc:   { tag:'Location',      short:'Location', prompt:'No location on file' },
  rel:   { tag:'Relationship',  short:'Relation', prompt:'Relationship not set' },
  years: { tag:'Years known',   short:'Years',    prompt:'How long have you known them?' },
  phone: { tag:'Phone',         short:'Phone',    prompt:'No phone number' },
  orgs:  { tag:'Organizations', short:'Orgs',     prompt:'No organizations on file' },
  skills:{ tag:'Skills',        short:'Skills',   prompt:'No skills on file' }
};
function audGaps(e){
  var g = [];
  if(!tierOf(e)) g.push('tier');
  if(!ptLocVal(e)) g.push('loc');
  if(!gv(e, 'relationship')) g.push('rel');
  if(!knownSinceYear(e)) g.push('years');
  if(!gv(e, 'phone')) g.push('phone');
  if(!orgsOf(e).length) g.push('orgs');
  if(!tagList(gv(e, 'specialty')).length) g.push('skills');
  return g;
}
/* Persistent dismissals: { "pkey|gap": 1 } in localStorage ncc_aud_skip
   (same store() pattern as ncc_groups_extra). "Done with them" writes one
   entry per gap still open on the card, so none of them is dealt again. */
var AUD_DISMISS = (function(){ try{ return JSON.parse(store('ncc_aud_skip') || '{}') || {}; }catch(x){ return {}; } })();
function audPair(di, gap){ var e = D.directory[di]; return e ? pkey(e) + '|' + gap : ''; }
function audOpenGaps(di){
  return audGaps(D.directory[di]).filter(function(g){ return !AUD_DISMISS[audPair(di, g)]; });
}
/* Saved for later: { pkey: gap } in localStorage ncc_aud_later — the gap
   that was on show when JD parked the person, so the card reopens on it.
   Parked gaps stay OPEN (nothing is dismissed or submitted, so the
   quick-win counter keeps counting them); parked people deal first
   (audDeal) and leave the parked state when they land on the wall. */
var AUD_LATER = (function(){ try{ return JSON.parse(store('ncc_aud_later') || '{}') || {}; }catch(x){ return {}; } })();
function audLaterSave(){ store('ncc_aud_later', JSON.stringify(AUD_LATER)); }
function audLaterEntries(){
  var byPk = {};
  people().forEach(function(di){ byPk[pkey(D.directory[di])] = di; });
  var out = [];
  Object.keys(AUD_LATER).forEach(function(pk){
    var di = byPk[pk]; if(di == null) return;
    var g = audOpenGaps(di); if(!g.length) return;
    var cur = AUD_LATER[pk];
    out.push({ di:di, gaps:g.slice(), done:[], cur:(g.indexOf(cur) >= 0 ? cur : g[0]), vals:{}, parked:true, dropped:0 });
  });
  return out;
}
function audUnpark(pk){
  if(AUD_LATER[pk] !== undefined){ delete AUD_LATER[pk]; audLaterSave(); }
}
function audYearList(){
  var out = [], now = new Date().getFullYear();
  for(var y = now; y >= 1960; y--) out.push(String(y));
  return out;
}
function audYearOk(v){
  v = String(v || '').trim();
  if(!/^\d{4}$/.test(v)) return false;
  var n = +v;
  return n >= 1900 && n <= new Date().getFullYear();
}
function audRemaining(){
  var n = 0;
  people().forEach(function(di){ n += audOpenGaps(di).length; });
  return n;
}
function audDeal(){
  var A = S.audit, later = audLaterEntries(), parkedDis = {}, pool = [];
  later.forEach(function(x){ parkedDis[x.di] = 1; });
  people().forEach(function(di){
    if(parkedDis[di]) return;
    var g = audOpenGaps(di);
    if(g.length) pool.push({ di:di, gaps:g.slice(), done:[], cur:g[0], vals:{}, dropped:0 });
  });
  for(var i = pool.length - 1; i > 0; i--){
    var j = Math.floor(Math.random() * (i + 1)), t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  /* Saved-for-later people deal first, ahead of the random pool, and
     reopen on the category noted when they were parked (JD 2026-10-15). */
  var all = later.concat(pool);
  A.shown = all.slice(0, AUD_WALL);
  A.deck = all.slice(AUD_WALL);
  A.shown.forEach(function(x){ if(x.parked) audUnpark(pkey(D.directory[x.di])); });
}
var AUD_ORG_POOLS = null;
function audOrgPools(){
  if(AUD_ORG_POOLS) return AUD_ORG_POOLS;
  var cats = {};
  ORG_CATS.forEach(function(c){ cats[c.k] = ptSugList('org', c.k); });
  AUD_ORG_POOLS = cats;
  return cats;
}
function audOrgPool(){
  var cats = audOrgPools(), all = [];
  ORG_CATS.forEach(function(c){ all = all.concat(cats[c.k]); });
  return ptDedupe(all).sort(function(a, b){ return a.localeCompare(b); });
}
function audOrgCat(val){
  var want = String(val || '').toLowerCase(), cats = audOrgPools();
  var order = ['churches', 'universities', 'companies'];
  for(var i = 0; i < order.length; i++){
    var list = cats[order[i]];
    for(var j = 0; j < list.length; j++) if(list[j].toLowerCase() === want) return order[i];
  }
  return 'companies';
}
function audEdHTML(di, gap){
  var e = D.directory[di];
  if(gap === 'tier'){
    return '<div class="aud-opts">' + TIER_ORDER.map(function(t){
      return '<button type="button" class="fc aud-pick" data-act="audpick" data-v="' + t + '"><i style="background:' + TIERS[t].c + '"></i>' + TIERS[t].n + '</button>';
    }).join('') + '</div>';
  }
  if(gap === 'rel'){
    return '<div class="aud-opts">' + REL_OPTS.map(function(r){
      return '<button type="button" class="fc aud-pick" data-act="audpick" data-v="' + r + '">' + cap(r) + '</button>';
    }).join('') + '</div>';
  }
  if(gap === 'loc') return '<div class="pted-add"><input class="aud-in" placeholder="Town, ST — e.g. Potsdam, NY" autocomplete="off" spellcheck="false"><div class="pted-ac" hidden></div></div>';
  if(gap === 'years') return '<div class="pted-add"><input class="aud-in aud-year" inputmode="numeric" placeholder="Year, e.g. 2019" autocomplete="off" spellcheck="false"><div class="pted-ac" hidden></div></div>';
  if(gap === 'phone') return '<input class="aud-in" type="tel" placeholder="Phone number" autocomplete="off">';
  if(gap === 'orgs') return '<div class="pted-add"><input class="aud-in" placeholder="Add an organization" autocomplete="off" spellcheck="false"><div class="pted-ac" hidden></div></div>';
  if(gap === 'skills') return '<div class="pted-add"><input class="aud-in" placeholder="Add a skill" autocomplete="off" spellcheck="false"><div class="pted-ac" hidden></div></div>';
  return '';
}
function audEntry(di){
  if(!S.audit || !S.audit.shown) return null;
  for(var i = 0; i < S.audit.shown.length; i++) if(S.audit.shown[i].di === di) return S.audit.shown[i];
  return null;
}
function audChipsHTML(x){
  var done = x.done.map(function(g){
    var val = x.vals && x.vals[g] ? ': ' + x.vals[g] : '';
    return '<button type="button" class="aud-gchip done' + (g === x.cur ? ' editing' : '') + '" data-act="audreopen" data-gap="' + g + '" title="' + esc(AUD_GAPS[g].tag + val + ' filled in — click to edit') + '">✓ ' + AUD_GAPS[g].short + '</button>';
  }).join('');
  var open = x.gaps.map(function(g){
    return '<button type="button" class="aud-gchip' + (g === x.cur ? ' on' : '') + '" data-act="audgap" data-gap="' + g + '" aria-pressed="' + (g === x.cur ? 'true' : 'false') + '">' + AUD_GAPS[g].short + '</button>';
  }).join('');
  return done + open;
}
function audCardHTML(x, i){
  var di = x.di, gap = x.cur, e = D.directory[di], meta = AUD_GAPS[gap];
  var ctx = [cap(gv(e, 'relationship')), ptHandle(e) ? '@' + ptHandle(e) : '', ptLocVal(e)].filter(Boolean).join(' · ');
  return '<article class="aud-card" data-di="' + di + '" data-gap="' + gap + '" style="animation-delay:' + Math.min(i * 45, 405) + 'ms">' +
    '<div class="aud-top">' + avatar(e, 'md') +
    '<span class="pn"><button type="button" class="aud-name" data-act="audopen" data-di="' + di + '" title="Open profile">' + esc(dispName(e)) + '</button>' +
    (ctx ? '<small class="aud-ctx">' + esc(ctx) + '</small>' : '') + '</span></div>' +
    '<div class="aud-gaps" role="group" aria-label="Missing items for this person">' + audChipsHTML(x) + '</div>' +
    '<p class="aud-prompt"><span class="aud-tag">' + meta.tag + '</span><span class="aud-prompt-t">' + meta.prompt + '</span></p>' +
    '<div class="aud-ed">' + audEdHTML(di, gap) + '</div>' +
    '<div class="aud-foot"><span class="aud-cd" hidden><span class="aud-cdt">Saving in 3</span><span class="aud-bar"><i></i></span></span><span class="sp"></span>' +
    '<button type="button" class="aud-later" data-act="audpark" data-di="' + di + '" title="Park this person and come back to them later — nothing is saved or closed out">Save for later</button>' +
    '<button type="button" class="aud-skip" data-act="audskip" data-di="' + di + '" title="Finish this person: close out everything still open on this card, for good">Done with them</button></div></article>';
}
/* Switch a card's active gap in place: chips, prompt and editor swap
   without the card moving or resizing. Any armed countdown is cancelled,
   so a half-filled editor never submits after a switch. */
function audSetGap(card, gap){
  var di = +card.getAttribute('data-di'), x = audEntry(di);
  if(!x || x.gaps.indexOf(gap) < 0) return;
  var hadFocus = card.contains(document.activeElement);
  audDisarm(card);
  x.cur = gap;
  card.setAttribute('data-gap', gap);
  card.removeAttribute('data-pick');
  var box = $('.aud-gaps', card); if(box) box.innerHTML = audChipsHTML(x);
  var pr = $('.aud-prompt', card);
  if(pr) pr.innerHTML = '<span class="aud-tag">' + AUD_GAPS[gap].tag + '</span><span class="aud-prompt-t">' + AUD_GAPS[gap].prompt + '</span>';
  var ed = $('.aud-ed', card); if(ed) ed.innerHTML = audEdHTML(di, gap);
  audWireCard(card);
  if(hadFocus){ var f = $('.aud-in', card) || $('.aud-gchip.on', card); if(f) f.focus(); }
}
/* Repaint just a card's indicator chips (after a state change). */
function audPaintChips(card){
  var x = audEntry(+card.getAttribute('data-di')); if(!x) return;
  var box = $('.aud-gaps', card); if(box) box.innerHTML = audChipsHTML(x);
}
function audCardEl(di){ return $('.aud-card[data-di="' + di + '"]'); }
/* Clicking a DONE chip reopens that gap's editor, prefilled with the
   value on file (JD 2026-10-15). Committing writes a fresh undoable
   patch through audSave, like any other fill, and the chip returns to
   done. Only while the card is live on the wall. */
function audReopen(card, gap){
  if(card.classList.contains('aud-out') || card.classList.contains('aud-done')) return;
  var di = +card.getAttribute('data-di'), x = audEntry(di);
  if(!x || x.done.indexOf(gap) < 0 || x.cur === gap) return;
  var hadFocus = card.contains(document.activeElement);
  audDisarm(card);
  x.cur = gap;
  card.setAttribute('data-gap', gap);
  card.removeAttribute('data-pick');
  audPaintChips(card);
  var pr = $('.aud-prompt', card);
  if(pr) pr.innerHTML = '<span class="aud-tag">' + AUD_GAPS[gap].tag + '</span><span class="aud-prompt-t">' + AUD_GAPS[gap].prompt + '</span>';
  var ed = $('.aud-ed', card); if(ed) ed.innerHTML = audEdHTML(di, gap);
  var e = D.directory[di];
  if(gap === 'tier' || gap === 'rel'){
    var cur = gap === 'tier' ? tierOf(e) : gv(e, 'relationship');
    if(cur){
      card.setAttribute('data-pick', cur);
      $$('.aud-pick', card).forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-v') === cur); });
    }
  } else {
    var inp = $('.aud-in', card);
    if(inp) inp.value = (x.vals && x.vals[gap]) || (gap === 'loc' ? raw(e, 'location_on_file') : gap === 'years' ? gv(e, 'years_known') : gap === 'phone' ? gv(e, 'phone') : '');
  }
  audWireCard(card);
  if(hadFocus){ var f = $('.aud-in', card) || $('.aud-gchip.done.editing', card); if(f) f.focus(); }
}
/* ---- Audit action toast + one-step undo (JD 2026-10-15) ------------
   Every Audit action is announced in plain words at the bottom of the
   Audit view and is reversible: AUD_LAST describes the most recent one
   and the toast's Undo button reverses it — a value submission through
   the undo stack (the same machinery as the global Undo), a dismissal
   by restoring its ncc_aud_skip pairs, a park by un-parking. */
var AUD_LAST = null, AUD_TOAST_T = null;
function audLog(act){ AUD_LAST = act; }
function audToastShow(text){
  var box = $('#audtoast'); if(!box) return;
  box.innerHTML = '<span class="aud-toast-t">' + esc(text) + '</span>' + (AUD_LAST ? '<button type="button" class="aud-toast-u" data-act="audundo">Undo</button>' : '');
  box.hidden = false;
  box.classList.remove('show'); void box.offsetWidth; box.classList.add('show');
  clearTimeout(AUD_TOAST_T);
  AUD_TOAST_T = setTimeout(function(){ box.classList.remove('show'); box.hidden = true; AUD_LAST = null; }, 6000);
}
function audReverseEntry(entry){
  if(!entry) return;
  var i = UNDO.stack.lastIndexOf(entry);
  if(i < 0) return;   /* already undone, or rolled off the stack */
  UNDO.stack.splice(i, 1);
  applyEntry(entry, false);
  UNDO.redo.push(entry); paintUndo();
}
/* Put a person whose card has left the wall back at the front of the
   deck, so an undone action's card resurfaces instead of vanishing. */
function audRestock(di, preferGap){
  var A = S.audit; if(!A || !A.deck || audEntry(di)) return;
  for(var i = 0; i < A.deck.length; i++) if(A.deck[i].di === di) return;
  var g = audOpenGaps(di); if(!g.length) return;
  A.deck.unshift({ di:di, gaps:g.slice(), done:[], cur:(preferGap && g.indexOf(preferGap) >= 0 ? preferGap : g[0]), vals:{}, dropped:0 });
}
function audUndoLast(){
  var act = AUD_LAST; if(!act) return;
  AUD_LAST = null;
  clearTimeout(AUD_TOAST_T);
  var box = $('#audtoast'); if(box){ box.classList.remove('show'); box.hidden = true; }
  var x = audEntry(act.di), card = audCardEl(act.di);
  if(act.kind === 'save'){
    audReverseEntry(act.entry);
    if(S.audit) S.audit.done = Math.max(0, S.audit.done - 1);
    audNoteUnfill(act);
    if(x && card){
      x.done = x.done.filter(function(g){ return g !== act.gap; });
      if(x.gaps.indexOf(act.gap) < 0) x.gaps.splice(Math.min(act.gapIndex == null ? x.gaps.length : act.gapIndex, x.gaps.length), 0, act.gap);
      if(x.vals) delete x.vals[act.gap];
      audSetGap(card, act.gap);
    } else audRestock(act.di, act.gap);
  }
  else if(act.kind === 'reedit'){
    audReverseEntry(act.entry);
    if(x){ if(!x.vals) x.vals = {}; if(act.priorVal) x.vals[act.gap] = act.priorVal; else delete x.vals[act.gap]; if(card) audPaintChips(card); }
  }
  else if(act.kind === 'pass'){
    (act.pairs || []).forEach(function(p){ delete AUD_DISMISS[p]; });
    store('ncc_aud_skip', JSON.stringify(AUD_DISMISS));
    if(x && card){
      if(x.gaps.indexOf(act.gap) < 0) x.gaps.splice(Math.min(act.gapIndex == null ? x.gaps.length : act.gapIndex, x.gaps.length), 0, act.gap);
      if(x.dropped) x.dropped--;
      audSetGap(card, act.gap);
    } else audRestock(act.di, act.gap);
  }
  else if(act.kind === 'done'){
    (act.pairs || []).forEach(function(p){ delete AUD_DISMISS[p]; });
    store('ncc_aud_skip', JSON.stringify(AUD_DISMISS));
    if(act.submit){ audReverseEntry(act.submit.entry); if(S.audit) S.audit.done = Math.max(0, S.audit.done - 1); audNoteUnfill(act.submit); }
    audRestock(act.di, act.submit ? act.submit.gap : null);
  }
  else if(act.kind === 'park'){
    if(act.laterPrev === undefined) delete AUD_LATER[act.laterKey]; else AUD_LATER[act.laterKey] = act.laterPrev;
    audLaterSave();
    audRestock(act.di, act.gap);
  }
  audPaintCounts();
  toast('Undid the last Audit action.');
}
/* Save for later (JD 2026-10-15): park the person. The card leaves the
   wall and a fresh one feeds in; the gaps stay OPEN (nothing saved,
   nothing dismissed, the counter keeps counting them) and the category
   on show is noted, so the card reopens on it when it resurfaces. */
function audPark(card, kb){
  var di = +card.getAttribute('data-di'), x = audEntry(di);
  if(!x || card.classList.contains('aud-out') || card.classList.contains('aud-done')) return;
  var gap = card.getAttribute('data-gap');
  audDisarm(card);
  var pk = pkey(D.directory[di]), prev = AUD_LATER[pk];
  AUD_LATER[pk] = gap; audLaterSave();
  var text = 'Saved for later · reopens on ' + AUD_GAPS[gap].tag;
  audLog({ kind:'park', di:di, gap:gap, laterKey:pk, laterPrev:prev, text:text });
  audToastShow(text);
  audRetire(card, false, kb);
}
/* Finish this person NOW (JD 2026-10-15): the "Done with them" button
   and Shift+Down share this. With submitFirst (Shift+Down), a genuinely
   complete value on show submits immediately — no countdown, no wait —
   while a fragment is discarded, exactly as Done treats it. Every gap
   still open then closes out persistently (ncc_aud_skip) and the card
   retires. Beats an armed countdown: the disarm above cancels it, so a
   value submits only through this immediate write. */
function audFinish(card, kb, submitFirst){
  var di = +card.getAttribute('data-di'), x = audEntry(di);
  if(!x) return;
  var gap = card.getAttribute('data-gap');
  audDisarm(card);
  var r = null;
  if(submitFirst && audComplete(card)) r = audWriteValue(di, card, gap);
  if(r){
    if(x.done.indexOf(gap) < 0) x.done.push(gap);
    x.gaps = x.gaps.filter(function(g){ return g !== gap; });
    if(!x.vals) x.vals = {};
    x.vals[gap] = r.val;
    S.audit.done++;
    audNoteFill(di, gap);
  } else if(S.audit) S.audit.streak = 0;   /* closed out with no fill: streak ends */
  var pairs = [];
  x.gaps.forEach(function(g){ var p = audPair(di, g); AUD_DISMISS[p] = 1; pairs.push(p); });
  if(pairs.length) store('ncc_aud_skip', JSON.stringify(AUD_DISMISS));
  var n = pairs.length;
  x.gaps = [];
  var text = r ? ('Done · ' + r.val + ' saved' + (n ? ', ' + n + ' more closed out' : '')) : ('Done · ' + n + ' closed out for ' + dispName(D.directory[di]));
  audLog({ kind:'done', di:di, pairs:pairs, submit:r ? { entry:r.entry || null, gap:gap, val:r.val } : null, text:text });
  audToastShow(text);
  audRetire(card, !!r, kb);
}
/* Shift+Right inside a card (JD 2026-10-15): pass on the gap on show
   ("I just don't want to add a phone number"). The gap is closed out for
   good — the same per-pair ncc_aud_skip dismissal "Done with them" uses,
   for this one gap only — any half-typed value is discarded (never
   saved), an armed countdown is cancelled before it can submit, and the
   card advances to the person's next open gap with focus in its editor.
   On the card's LAST open gap it finishes the card instead: the gap is
   dismissed, the card retires, the next person feeds in, and focus moves
   to the new card's editor. */
function audPass(card){
  var di = +card.getAttribute('data-di'), x = audEntry(di);
  if(!x) return;
  var gap = card.getAttribute('data-gap');
  if(x.gaps.indexOf(gap) < 0) return;
  var gapIndex = x.gaps.indexOf(gap);
  if(S.audit) S.audit.streak = 0;   /* a pass breaks the fill streak */
  x.dropped = (x.dropped || 0) + 1;
  audDisarm(card);   /* countdown + typing debounce cancelled: nothing submits */
  var pair = audPair(di, gap);
  AUD_DISMISS[pair] = 1;
  store('ncc_aud_skip', JSON.stringify(AUD_DISMISS));
  x.gaps = x.gaps.filter(function(g){ return g !== gap; });
  var text = 'Passed · ' + AUD_GAPS[gap].tag + ' closed out';
  audLog({ kind:'pass', di:di, gap:gap, gapIndex:gapIndex, pairs:[pair], text:text });
  audToastShow(text);
  if(x.gaps.length){ audPaintCounts(); audSetGap(card, x.gaps[0]); return; }
  audRetire(card, false, true);
}
function audWireCard(card){
  var gap = card.getAttribute('data-gap'), inp = $('.aud-in', card);
  if(!inp) return;
  var list = gap === 'loc' ? ptSugList('town') : gap === 'skills' ? ptSugList('skill') : gap === 'orgs' ? audOrgPool() : gap === 'years' ? audYearList() : null;
  if(list) ptAcWire(inp, list, function(v){ inp.value = v; inp.focus(); audTryArm(card); });
  /* commit triggers (JD 2026-10-15): a suggestion pick or Enter submits
     what is typed, and a REAL blur (focus leaving the card) submits after
     a 250ms grace period, so a tap on a suggestion registers its pick
     first instead of the blur closing the editor underneath it. A pause
     in typing submits ONLY a value that is already complete for its
     field (audComplete): a half-typed word never submits, the editor
     never closes mid-composition, and keystrokes cancel any pending
     commit. Any edit while the countdown runs cancels it and re-enters
     this flow, so only the final value ever submits. */
  inp.addEventListener('input', function(){
    audDisarm(card);
    clearTimeout(card._audDeb);
    card._audDeb = setTimeout(function(){
      card._audDeb = null;
      if(audComplete(card)) audTryArm(card);   /* incomplete: keep composing, undisturbed */
    }, 900);
  });
  inp.addEventListener('focus', function(){
    if(card._audBlur){ clearTimeout(card._audBlur); card._audBlur = null; }
  });
  inp.addEventListener('blur', function(){
    if(card._audBlur) clearTimeout(card._audBlur);
    card._audBlur = setTimeout(function(){
      card._audBlur = null;
      if(!card.isConnected) return;
      var a = document.activeElement;
      if(a && card.contains(a)) return;   /* the pick refocused the field, or focus moved within this card: not a real blur */
      audTryArm(card);
    }, 250);
  });
  inp.addEventListener('keydown', function(ev){
    if(ev.key === 'Enter'){ ev.preventDefault(); audTryArm(card); }
  });
}
/* A card is submittable only with a complete value: a chip picked, a
   non-empty text field, or a plausible 4-digit year (1900–current). */
function audReady(card){
  var gap = card.getAttribute('data-gap');
  if(gap === 'tier' || gap === 'rel') return !!card.getAttribute('data-pick');
  if(gap === 'years'){ var yi = $('.aud-year', card); return !!(yi && audYearOk(yi.value)); }
  var inp = $('.aud-in', card);
  return !!(inp && inp.value.trim());
}
/* Pause-commit gate (JD 2026-10-15): a typed value counts as complete
   only when it is whole for its field — a location that exactly matches
   a suggestion or normalizes to a full "Town, ST", a plausible complete
   phone number, a valid 4-digit year, or a skills/orgs value that
   exactly matches a suggestion. Anything less is still being composed:
   it waits for Enter, a real blur, or an explicit suggestion pick. */
function audLocComplete(v){
  v = String(v || '').trim();
  if(!v) return false;
  var lv = v.toLowerCase(), list = ptSugList('town');
  for(var i = 0; i < list.length; i++) if(list[i].toLowerCase() === lv) return true;
  return /^.+, [A-Z]{2}$/.test(ptNormLoc(v));
}
function audPhoneOk(v){
  v = String(v || '').trim();
  if(!v || /[^0-9\s\-().+]/.test(v)) return false;
  var d = v.replace(/\D/g, '');
  return d.length === 10 || (d.length === 11 && d.charAt(0) === '1') || d.length === 7;
}
function audComplete(card){
  var gap = card.getAttribute('data-gap');
  if(gap === 'tier' || gap === 'rel') return !!card.getAttribute('data-pick');
  var inp = $('.aud-in', card);
  if(!inp) return false;
  var v = inp.value.trim();
  if(!v) return false;
  if(gap === 'years') return audYearOk(v);
  if(gap === 'loc') return audLocComplete(v);
  if(gap === 'phone') return audPhoneOk(v);
  if(gap === 'skills' || gap === 'orgs'){
    var list = gap === 'skills' ? ptSugList('skill') : audOrgPool(), lv = v.toLowerCase();
    for(var i = 0; i < list.length; i++) if(list[i].toLowerCase() === lv) return true;
    return false;
  }
  return false;
}
function audDisarm(card){
  if(card._audIv){ clearInterval(card._audIv); card._audIv = null; }
  if(card._audDeb){ clearTimeout(card._audDeb); card._audDeb = null; }
  if(card._audBlur){ clearTimeout(card._audBlur); card._audBlur = null; }
  card.classList.remove('aud-arm');
  var cd = $('.aud-cd', card); if(cd) cd.hidden = true;
}
/* Is the gap on show the card's LAST remaining one? (JD 2026-10-15)
   Judged at commit time against the person's gaps still open on the
   card: filling any earlier one submits instantly, and only completing
   the final one — the save that retires the card — gets the countdown. */
function audCardLast(card){
  var x = audEntry(+card.getAttribute('data-di'));
  return !x || x.gaps.length <= 1;
}
function audTryArm(card){
  if(!card.isConnected || card.classList.contains('aud-out') || card.classList.contains('aud-done')) return;
  if(!audReady(card)){ audDisarm(card); return; }
  var xArm = audEntry(+card.getAttribute('data-di'));
  var reeditArm = !!(xArm && xArm.done.indexOf(card.getAttribute('data-gap')) >= 0);
  /* Rapid Fire saves INSTANTLY, always (JD 2026-10-15): on a one-gap
     stage every save would be a "last gap", so the 3s countdown would
     kill the pace — the toast + Undo is the safety net instead. */
  var rapidArm = !!(S.audit && S.audit.mode === 'rapid');
  if(reeditArm || rapidArm || !audCardLast(card)){ audDisarm(card); audSave(+card.getAttribute('data-di'), card); return; }
  audDisarm(card);
  var cd = $('.aud-cd', card), cdt = $('.aud-cdt', card), bar = $('.aud-bar i', card);
  card.classList.add('aud-arm');
  if(cd) cd.hidden = false;
  var t0 = Date.now();
  function tick(){
    if(!card.isConnected){ audDisarm(card); return; }   /* navigated away: abandon quietly */
    var rem = 3000 - (Date.now() - t0);
    if(rem <= 0){ audDisarm(card); audSave(+card.getAttribute('data-di'), card); return; }
    if(cdt) cdt.textContent = 'Saving in ' + Math.ceil(rem / 1000);
    if(bar) bar.style.width = (rem / 30) + '%';
  }
  tick();
  card._audIv = setInterval(tick, 100);
}
function audNudge(card){
  card.classList.remove('aud-need'); void card.offsetWidth; card.classList.add('aud-need');
  var f = $('.aud-in', card); if(f) f.focus();
}
function audAddTag(di, fieldK, val){
  var e = D.directory[di], arr = splitTags(gv(e, fieldK), ', ');
  if(arr.map(function(x){ return x.toLowerCase(); }).indexOf(val.toLowerCase()) >= 0) return true;   /* already on file: counts as filled, no patch */
  arr.push(val);
  return txn('Edit ' + fieldK, function(){ var o = {}; o[fieldK] = arr.join(', '); queuePatch(di, o); });
}
/* Replace a tag added earlier this visit (a re-edited Orgs/Skills chip):
   the old value comes off its list and the new one goes on, in one txn. */
function audReplaceTag(di, oldK, newK, oldVal, newVal){
  var e = D.directory[di];
  return txn('Edit ' + newK, function(){
    if(oldK === newK){
      var arr = splitTags(gv(e, oldK), ', ').filter(function(x2){ return x2.toLowerCase() !== oldVal.toLowerCase(); });
      if(arr.map(function(x2){ return x2.toLowerCase(); }).indexOf(newVal.toLowerCase()) < 0) arr.push(newVal);
      var o = {}; o[newK] = arr.join(', '); queuePatch(di, o);
    } else {
      var a1 = splitTags(gv(e, oldK), ', ').filter(function(x2){ return x2.toLowerCase() !== oldVal.toLowerCase(); });
      var o1 = {}; o1[oldK] = a1.join(', '); queuePatch(di, o1);
      var a2 = splitTags(gv(e, newK), ', ');
      if(a2.map(function(x2){ return x2.toLowerCase(); }).indexOf(newVal.toLowerCase()) < 0) a2.push(newVal);
      var o2 = {}; o2[newK] = a2.join(', '); queuePatch(di, o2);
    }
  });
}
/* Write the value on show for a gap — the one patch-writing path behind
   audSave and Shift+Down's immediate submit. Returns { entry, val } or
   null when there is nothing complete to write. entry is the undo-stack
   entry for the write (null when the value was already on file and no
   patch was needed). */
function audWriteValue(di, card, gap){
  var e = D.directory[di]; if(!e) return null;
  if(gap === 'tier' || gap === 'rel'){
    var pick = card.getAttribute('data-pick');
    if(!pick) return null;
    var en = gap === 'tier' ? txn('Set tier', function(){ queuePatch(di, { tier:pick }); }) : txn('Set relationship', function(){ queuePatch(di, { relationship:pick }); });
    return { entry:en, val:gap === 'tier' ? (TIERS[pick] ? TIERS[pick].n : pick) : cap(pick) };
  }
  if(gap === 'loc'){
    var inp = $('.aud-in', card), v = inp ? inp.value.trim() : '';
    if(!v) return null;
    var nv = ptNormLoc(v);
    /* txn, not setField: an auto-submitted card must be undoable (JD) */
    return { entry:txn('Set location', function(){ queuePatch(di, { location_on_file:nv }); }), val:nv };
  }
  if(gap === 'years'){
    var yi = $('.aud-year', card), yv = yi ? yi.value.trim() : '';
    if(!audYearOk(yv)) return null;
    return { entry:txn('Set years known', function(){ queuePatch(di, { years_known:yv }); }), val:yv };
  }
  if(gap === 'phone'){
    var ip = $('.aud-in', card), pv = ip ? ip.value.trim() : '';
    if(!pv) return null;
    return { entry:txn('Set phone', function(){ queuePatch(di, { phone:pv }); }), val:pv };
  }
  if(gap === 'orgs'){
    var io = $('.aud-in', card), ov = io ? io.value.trim() : '';
    if(!ov) return null;
    var xo = audEntry(di), priorO = (xo && xo.done.indexOf(gap) >= 0 && xo.vals) ? xo.vals[gap] : '';
    if(priorO && priorO.toLowerCase() !== ov.toLowerCase())
      return { entry:audReplaceTag(di, audOrgCat(priorO), audOrgCat(ov), priorO, ov), val:ov };
    var ro = audAddTag(di, audOrgCat(ov), ov);
    return ro ? { entry:(ro === true ? null : ro), val:ov } : null;
  }
  if(gap === 'skills'){
    var is2 = $('.aud-in', card), sv = is2 ? is2.value.trim() : '';
    if(!sv) return null;
    var xs = audEntry(di), priorS = (xs && xs.done.indexOf(gap) >= 0 && xs.vals) ? xs.vals[gap] : '';
    if(priorS && priorS.toLowerCase() !== sv.toLowerCase())
      return { entry:audReplaceTag(di, 'specialty', 'specialty', priorS, sv), val:sv };
    var rs = audAddTag(di, 'specialty', sv);
    return rs ? { entry:(rs === true ? null : rs), val:sv } : null;
  }
  return null;
}
function audSave(di, card){
  var gap = card.getAttribute('data-gap'), e = D.directory[di];
  if(!e || +card.getAttribute('data-di') !== di) return;
  var x = audEntry(di);
  var reedit = !!(x && x.done.indexOf(gap) >= 0);
  var priorVal = (x && x.vals) ? x.vals[gap] : undefined;
  var gapIndex = x ? x.gaps.indexOf(gap) : -1;
  var r = audWriteValue(di, card, gap);
  if(!r){ audNudge(card); return; }
  if(x){
    var finProfile = false;
    if(!reedit){
      S.audit.done++;
      x.done.push(gap);
      x.gaps = x.gaps.filter(function(g){ return g !== gap; });
      audNoteFill(di, gap);
      /* Finish Line counts a profile only when every gap it carried
         was filled — none passed or closed out along the way. */
      finProfile = !x.gaps.length && !(x.dropped || 0);
      if(finProfile) S.audit.finished = (S.audit.finished || 0) + 1;
    }
    if(!x.vals) x.vals = {};
    x.vals[gap] = r.val;
    var text = (reedit ? 'Updated · ' : 'Saved · ') + AUD_GAPS[gap].tag + ' set to ' + r.val;
    audLog({ kind:reedit ? 'reedit' : 'save', di:di, gap:gap, gapIndex:gapIndex, entry:r.entry || null, priorVal:priorVal, val:r.val, text:text, blitz:!!(S.audit && S.audit.blitz), finishedProfile:finProfile });
    audToastShow(text);
    if(x.gaps.length){ audPaintCounts(); audSetGap(card, x.gaps[0]); return; }
  }
  audRetire(card, true);
}
function audRetire(card, saved, kbFocus){
  audDisarm(card);
  var A = S.audit, di = +card.getAttribute('data-di');
  var hadFocus = card.contains(document.activeElement);
  A.shown = A.shown.filter(function(x){ return x.di !== di; });
  function finish(){
    if(!card.isConnected) return;   /* the view was rebuilt mid-animation (mode switch, shuffle): do not feed a stale card into the new wall */
    card.remove();
    var nxt = A.deck.shift();
    if(nxt){
      A.shown.push(nxt);
      if(nxt.parked) audUnpark(pkey(D.directory[nxt.di]));   /* back on the wall: no longer parked */
      var grid = $('#audgrid');
      if(grid){
        var tmp = document.createElement('div');
        tmp.innerHTML = audCardHTML(nxt, 0);
        var nc = tmp.firstChild;
        grid.appendChild(nc);
        audWireCard(nc);
        if(hadFocus){ var nf = kbFocus ? ($('.aud-in', nc) || $('.aud-gchip.on', nc) || $('button, input', nc)) : $('button, input', nc); if(nf) nf.focus(); }
      }
    }
    audPaintCounts(); audPaintEmpty();
  }
  if(pvReducedMotion()){ finish(); return; }
  card.classList.add(saved ? 'aud-done' : 'aud-out');
  /* Rapid Fire keeps the swap under 150ms (Doherty threshold): the
     stage never sits empty long enough to break the rhythm. */
  setTimeout(finish, (S.audit && S.audit.mode === 'rapid') ? 120 : 310);
}
function audLaterPaint(){
  var b = $('#audlaterbtn'); if(!b) return;
  var n = audLaterEntries().length;
  b.hidden = !n;
  var s2 = $('#audlaterN'); if(s2) s2.textContent = n;
}
function audPaintCounts(){
  audLaterPaint(); audPaintGoal(); audPaintModeBar();
  var s = $('#audsub'); if(!s) return;
  var left = audRemaining(), done = S.audit ? S.audit.done : 0;
  s.textContent = left ? left.toLocaleString('en-US') + ' quick win' + (left === 1 ? '' : 's') + ' left' + (done ? ' · ' + done + ' filled in this visit' : '') : 'Nothing left to fill in';
}
function audPaintEmpty(){
  var box = $('#audempty'), grid = $('#audgrid');
  if(!box || !grid) return;
  if(grid.querySelector('.aud-card')){ box.innerHTML = ''; return; }
  if(S.audit && S.audit.blitzDone){ box.innerHTML = ''; return; }   /* the Blitz summary owns the stage */
  if(audMode() === 'cat' && !(S.audit && S.audit.cat)){ box.innerHTML = ''; return; }   /* waiting on a category pick */
  if(audRemaining() === 0) box.innerHTML = '<div class="aud-caught">' + ic('check', 26) + '<h3>All caught up</h3><p>Every profile has the basics filled in. Nice work.</p></div>';
  else box.innerHTML = '<div class="aud-caught">' + ic('target', 26) + '<h3>That is the whole deck</h3><p>Everything else is filled in or dismissed. Shuffle deals a fresh mix from what is left; dismissed items stay out for good.</p></div>';
}
/* ============================================================
   Audit modes + game layer (JD 2026-10-15). Researched patterns:
   Duolingo — a settable daily goal with a visible progress bar and
   milestone celebrations; Zooniverse — one subject, one task, instant
   advance; Anki — one card at a time, keyboard-first, honest session
   counters and an end-of-session summary; the goal-gradient effect
   (Hull 1932; Kivetz et al. 2006) — effort accelerates near a finish,
   which is exactly what Finish Line's fewest-gaps-first order and
   the goal bar exploit. Rejected: XP/levels/currency (nothing to
   spend it on — the real counts are the score), leagues (one user),
   hearts/penalties (contradicts undo-everything), cross-day streaks
   (JD fills ad hoc; a day streak would nag), sound and emoji (house
   rules). The streak lives inside the visit only.
   ============================================================ */
var AUD_MODES = [
  { k:'cards',  l:'Cards' },
  { k:'rapid',  l:'Rapid Fire' },
  { k:'cat',    l:'Category Run' },
  { k:'finish', l:'Finish Line' }
];
function audMode(){ var m = S.audit && S.audit.mode; return m === 'rapid' || m === 'cat' || m === 'finish' ? m : 'cards'; }
/* Daily goal (Duolingo pattern, minus the nagging): fills today vs a
   goal JD sets himself, persisted per calendar day. */
function audDay(){
  var t = new Date(), key = t.getFullYear() + '-' + (t.getMonth() + 1) + '-' + t.getDate(), d = null;
  try{ d = JSON.parse(store('ncc_aud_day') || 'null'); }catch(x){}
  if(!d || d.d !== key) d = { d:key, n:0, goal:25, met:false };
  if(!(d.goal >= 5)) d.goal = 25;
  return d;
}
function audDaySave(d){ store('ncc_aud_day', JSON.stringify(d)); }
function audPaintGoal(){
  var f = $('#audgoalfill'), t = $('#audgoalt'); if(!f || !t) return;
  var d = audDay();
  f.style.width = Math.min(100, Math.round(d.n / d.goal * 100)) + '%';
  f.classList.toggle('met', d.n >= d.goal);
  t.textContent = d.n + ' of ' + d.goal + ' filled today' + (d.n >= d.goal ? ' — goal reached' : '');
}
/* One real fill landed (a value written, never a re-edit): session
   tallies, the streak, the daily goal, milestone notes. Milestones go
   through the generic toast so they never clobber the Audit action
   toast and its Undo button. */
function audNoteFill(di, gap){
  var A = S.audit; if(!A) return;
  if(!A.fills) A.fills = [];
  A.fills.push(Date.now());
  A.streak = (A.streak || 0) + 1;
  if(A.streak > (A.best || 0)) A.best = A.streak;
  if(A.mode === 'cat' && gap){ if(!A.catDone) A.catDone = {}; A.catDone[gap] = (A.catDone[gap] || 0) + 1; }
  if(A.blitz){ A.blitz.fills++; if(A.streak > A.blitz.best) A.blitz.best = A.streak; }
  var d = audDay(); d.n++;
  var met = d.n >= d.goal && !d.met; if(met) d.met = true;
  audDaySave(d);
  if(met) toast('Goal reached — ' + d.goal + ' filled today. Everything after this is bonus.');
  else if(A.done > 0 && A.done % 10 === 0) toast('Milestone — ' + A.done + ' filled this session.');
  audPaintGoal();
}
/* Undo of a fill reverses its tallies (the value itself is reversed by
   the undo stack in audUndoLast). */
function audNoteUnfill(act){
  var A = S.audit; if(!A || !act) return;
  var d = audDay(); if(d.n > 0) d.n--; if(d.n < d.goal) d.met = false; audDaySave(d);
  if(A.fills && A.fills.length) A.fills.pop();
  if(act.blitz && A.blitz && A.blitz.fills > 0) A.blitz.fills--;
  if(act.finishedProfile && A.finished) A.finished--;
  audPaintGoal();
}
function audPace(){
  var A = S.audit; if(!A || !A.fills || A.fills.length < 5) return null;
  var cut = Date.now() - 60000, n = 0;
  for(var i = A.fills.length - 1; i >= 0; i--){ if(A.fills[i] >= cut) n++; else break; }
  return n;
}
function audCatCounts(){
  var out = {};
  Object.keys(AUD_GAPS).forEach(function(g){ out[g] = 0; });
  people().forEach(function(di){ audOpenGaps(di).forEach(function(g){ out[g]++; }); });
  return out;
}
/* Pool builders for the new modes. Cards' audDeal above is untouched;
   these share its entry shape and the parked-first rule. */
function audPoolEntries(){
  var later = audLaterEntries(), parkedDis = {}, pool = [];
  later.forEach(function(x){ parkedDis[x.di] = 1; });
  people().forEach(function(di){
    if(parkedDis[di]) return;
    var g = audOpenGaps(di);
    if(g.length) pool.push({ di:di, gaps:g.slice(), done:[], cur:g[0], vals:{}, dropped:0 });
  });
  return { later:later, pool:pool };
}
function audShuffleInPlace(a){
  for(var i = a.length - 1; i > 0; i--){ var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
}
function audDealRapid(){
  var A = S.audit, p = audPoolEntries();
  audShuffleInPlace(p.pool);
  var all = p.later.concat(p.pool);
  A.shown = all.slice(0, 1);
  A.deck = all.slice(1);
  A.shown.forEach(function(x){ if(x.parked) audUnpark(pkey(D.directory[x.di])); });
}
function audDealFinish(){
  var A = S.audit, p = audPoolEntries();
  audShuffleInPlace(p.pool);
  /* fewest gaps first; the shuffle underneath keeps ties random
     (Array.prototype.sort is stable) */
  p.pool.sort(function(a, b){ return a.gaps.length - b.gaps.length; });
  var all = p.later.concat(p.pool);
  A.shown = all.slice(0, AUD_WALL);
  A.deck = all.slice(AUD_WALL);
  A.shown.forEach(function(x){ if(x.parked) audUnpark(pkey(D.directory[x.di])); });
}
function audDealCat(){
  var A = S.audit, gap = A.cat, later = [], pool = [];
  if(!gap){ A.shown = []; A.deck = []; return; }
  people().forEach(function(di){
    if(audOpenGaps(di).indexOf(gap) < 0) return;
    var parked = AUD_LATER[pkey(D.directory[di])] !== undefined;
    var x = { di:di, gaps:[gap], done:[], cur:gap, vals:{}, dropped:0, parked:parked };
    (parked ? later : pool).push(x);
  });
  audShuffleInPlace(pool);
  var all = later.concat(pool);
  A.shown = all.slice(0, AUD_WALL);
  A.deck = all.slice(AUD_WALL);
  A.shown.forEach(function(x){ if(x.parked) audUnpark(pkey(D.directory[x.di])); });
}
function audDealMode(){
  var m = audMode();
  if(m === 'rapid') audDealRapid();
  else if(m === 'finish') audDealFinish();
  else if(m === 'cat') audDealCat();
  else audDeal();
}
function audSetMode(m){
  var A = S.audit; if(!A) return;
  audEndBlitz(true);
  A.mode = m; store('ncc_aud_mode', m);
  if(m !== 'cat') A.cat = null;
  A.blitzDone = null;
  A.shown = null;
  viewAudit($('#view'));
}
/* ---- Blitz: a 2-minute Rapid Fire round with an end-of-round
   summary (peak-end rule: the recap is what the round is remembered
   by). Fills during the round are counted on the blitz state. ---- */
function audStartBlitz(){
  var A = S.audit; if(!A) return;
  if(!audRemaining()){ toast('Nothing left to fill in.'); return; }
  if(A.blitzDone){ A.blitzDone = null; viewAudit($('#view')); }
  A.blitz = { ends:Date.now() + 120000, fills:0, best:(A.streak || 0) };
  if(A._blitzIv) clearInterval(A._blitzIv);
  A._blitzIv = setInterval(audBlitzTick, 250);
  audBlitzTick();
  audPaintModeBar();
}
function audBlitzTick(){
  var A = S.audit, b = A && A.blitz;
  if(!b){ if(A && A._blitzIv){ clearInterval(A._blitzIv); A._blitzIv = null; } return; }
  if(Date.now() >= b.ends){ audEndBlitz(false); return; }
  var el = $('#audblitz-t');
  if(el) el.textContent = 'Blitz ' + Math.max(1, Math.ceil((b.ends - Date.now()) / 1000)) + 's · ' + b.fills + ' filled';
}
function audEndBlitz(silent){
  var A = S.audit, b = A && A.blitz; if(!b) return;
  A.blitz = null;
  if(A._blitzIv){ clearInterval(A._blitzIv); A._blitzIv = null; }
  var bt = $('#audblitz-t'); if(bt) bt.textContent = '';
  if(silent) return;
  A.blitzDone = { fills:b.fills, best:b.best };
  var grid = $('#audgrid');
  if(grid) grid.innerHTML = '<div class="aud-caught aud-blitzsum"><h3>Blitz over</h3>' +
    '<p class="aud-blitzstats"><b>' + b.fills + '</b> fills · best streak <b>' + b.best + '</b> · <b>' + (b.fills / 2).toFixed(1) + '</b> per minute</p>' +
    '<p><button type="button" class="btn primary" data-act="audblitz">Go again</button> <button type="button" class="btn ghost" data-act="audblitzx">Back to Rapid Fire</button></p></div>';
  audPaintEmpty(); audPaintModeBar();
}
function audModesHTML(){
  var m = audMode();
  return '<div class="seg aud-modes" role="tablist" aria-label="Audit mode">' + AUD_MODES.map(function(x){
    return '<button type="button" role="tab" aria-selected="' + (x.k === m ? 'true' : 'false') + '" class="' + (x.k === m ? 'on' : '') + '" data-act="audmode" data-m="' + x.k + '">' + x.l + '</button>';
  }).join('') + '</div>';
}
function audModeBarHTML(){
  var A = S.audit, m = audMode();
  if(m === 'rapid'){
    return '<div class="aud-modebar"><span id="audstreak">Streak <b>0</b></span>' +
      '<span>Filled this session: <b id="audsessfill">0</b></span><span id="audpace"></span>' +
      '<span class="sp"></span><span id="audblitz-t" class="aud-blitz-t"></span>' +
      '<button type="button" class="btn ghost" data-act="audblitz" id="audblitzbtn">Start 2-minute Blitz</button></div>';
  }
  if(m === 'finish'){
    return '<div class="aud-modebar"><span>Profiles finished this session: <b id="audfin">0</b></span>' +
      '<span>Filled this session: <b id="audsessfill2">0</b></span>' +
      '<span class="dim">Fewest gaps first — clear people off the board.</span></div>';
  }
  if(m === 'cat'){
    var counts = audCatCounts();
    return '<div class="aud-catrow" role="group" aria-label="Pick a category">' + Object.keys(AUD_GAPS).map(function(g){
      return '<button type="button" class="aud-catbtn' + (A.cat === g ? ' on' : '') + '" data-act="audcat" data-g="' + g + '" aria-pressed="' + (A.cat === g ? 'true' : 'false') + '">' + AUD_GAPS[g].tag + ' <span class="aud-catn" id="audcatn-' + g + '">' + counts[g] + '</span></button>';
    }).join('') +
    '<button type="button" class="aud-catbtn" data-act="audcatall">All categories</button></div>' +
    '<p class="aud-catprog" id="audcatprog"></p>';
  }
  return '';
}
function audPaintCatProg(){
  var el = $('#audcatprog'); if(!el) return;
  var A = S.audit;
  if(!A.cat){ el.textContent = 'Pick a category — the wall deals only that one, person after person.'; return; }
  var counts = audCatCounts();
  Object.keys(AUD_GAPS).forEach(function(g){ var s = $('#audcatn-' + g); if(s) s.textContent = counts[g]; });
  var cleared = (A.catDone && A.catDone[A.cat]) || 0;
  el.textContent = AUD_GAPS[A.cat].tag + ': ' + counts[A.cat] + ' still open' + (cleared ? ' · ' + cleared + ' cleared this run' : '');
}
function audPaintModeBar(){
  var A = S.audit; if(!A) return;
  var m = audMode();
  if(m === 'rapid'){
    var st = $('#audstreak');
    if(st) st.innerHTML = 'Streak <b>' + (A.streak || 0) + '</b>' + (A.best ? ' · Best <b>' + A.best + '</b>' : '');
    var sf = $('#audsessfill'); if(sf) sf.textContent = A.done || 0;
    var pc = $('#audpace'); if(pc){ var p = audPace(); pc.textContent = p != null ? 'Pace: ' + p + ' in the last minute' : ''; pc.hidden = p == null; }
    var btn = $('#audblitzbtn'); if(btn) btn.hidden = !!A.blitz;
    var stack = $('#audstack'); if(stack) stack.classList.toggle('nopeek', !(A.deck && A.deck.length));
  }
  else if(m === 'finish'){
    var ff = $('#audfin'); if(ff) ff.textContent = A.finished || 0;
    var sf2 = $('#audsessfill2'); if(sf2) sf2.textContent = A.done || 0;
  }
  else if(m === 'cat'){ audPaintCatProg(); }
}

function viewAudit(v){
  if(!S.audit) S.audit = { done:0, shown:null, deck:null, mode:(store('ncc_aud_mode') || 'cards'), cat:null, streak:0, best:0, fills:[], finished:0, catDone:{}, blitz:null, blitzDone:null };
  if(['cards', 'rapid', 'cat', 'finish'].indexOf(S.audit.mode) < 0) S.audit.mode = 'cards';
  if(S.audit._paceIv){ clearInterval(S.audit._paceIv); S.audit._paceIv = null; }
  if(!S.audit.shown) audDealMode();
  var m = audMode();
  v.innerHTML = '<div class="page audit"><div class="pagehead"><div><h1 class="display">Audit</h1><p class="sub" id="audsub"></p></div>' +
    '<span class="aud-head-btns"><button type="button" class="btn ghost" data-act="audlater" id="audlaterbtn" hidden>' + ic('today', 15) + '<span>Saved for later (<span id="audlaterN">0</span>)</span></button>' +
    '<button type="button" class="btn ghost" data-act="audshuffle">' + ic('reset', 15) + '<span>Shuffle</span></button></span></div>' +
    '<div class="aud-tools">' + audModesHTML() +
    '<span class="aud-goal"><span class="aud-goal-l">Today\'s goal</span><span class="aud-goal-bar"><i id="audgoalfill"></i></span><span id="audgoalt"></span>' +
    '<button type="button" class="aud-goal-b" data-act="audgoal" data-d="-5" aria-label="Lower the goal by 5">−</button><button type="button" class="aud-goal-b" data-act="audgoal" data-d="5" aria-label="Raise the goal by 5">+</button></span></div>' +
    '<div id="audmodebar">' + audModeBarHTML() + '</div>' +
    (m === 'rapid'
      ? '<div class="aud-stage-wrap"><div class="aud-stack" id="audstack"><div class="aud-peek p2"></div><div class="aud-peek p1"></div><div class="aud-grid aud-stage" id="audgrid"></div></div></div>'
      : '<div class="aud-grid" id="audgrid"></div>') +
    '<div id="audempty"></div>' +
    '<div class="aud-toast" id="audtoast" hidden role="status"></div></div>';
  var grid = $('#audgrid');
  if(S.audit.blitzDone){
    grid.innerHTML = '<div class="aud-caught aud-blitzsum"><h3>Blitz over</h3>' +
      '<p class="aud-blitzstats"><b>' + S.audit.blitzDone.fills + '</b> fills · best streak <b>' + S.audit.blitzDone.best + '</b> · <b>' + (S.audit.blitzDone.fills / 2).toFixed(1) + '</b> per minute</p>' +
      '<p><button type="button" class="btn primary" data-act="audblitz">Go again</button> <button type="button" class="btn ghost" data-act="audblitzx">Back to Rapid Fire</button></p></div>';
  } else {
    grid.innerHTML = S.audit.shown.map(function(x, i){ return audCardHTML(x, i); }).join('');
    $$('.aud-card', grid).forEach(audWireCard);
  }
  if(m === 'rapid' && !pvReducedMotion()) S.audit._paceIv = setInterval(function(){ audPaintModeBar(); }, 5000);
  audPaintCounts(); audPaintEmpty();
}

/* ============================================================
   9. events — one delegated click handler, one input/change handler, one key handler
   ============================================================ */
function curDi(el){
  var d = el && el.getAttribute && el.getAttribute('data-di');
  if(d != null && d !== '') return +d;
  return S.route.name === 'profile' ? S.prof.di : null;
}
function refreshAfterStatus(){
  if(S.route.name === 'profile') repaintTop();
  afterWrite();
}
function ctxGo(di, j){
  S.ctx.i = j; S.prof = { di:di, edit:{}, open:{}, evEdit:null, degEdit:null, skOpen:null, more:false };
  history.replaceState({ d:S.depth }, '', '#/p/' + encodeURIComponent(personId(D.directory[di]))); render(); window.scrollTo(0, 0); var vw = $('#view'); if(vw) vw.scrollTop = 0;
}
function doSet(el){
  var di = curDi(el), k = el.getAttribute('data-k'), v = el.getAttribute('data-v'), e = D.directory[di];
  if(!e) return;
  var cur = String(k === 'tier' ? tierOf(e) : gv(e, k));
  var clearable = ['relationship', 'context', 'category'].indexOf(k) >= 0;
  var next = (clearable && cur === v) ? '' : v;
  txn('Set ' + k, function(){ queuePatch(di, (function(){ var o = {}; o[k] = next; return o; })()); });
  if(S.route.name === 'profile'){ repaintTop(); var sec = el.getAttribute('data-sec'); if(sec) repaintSec(sec); }
  afterWrite();
}
function saveTags(el, mutate){
  var k = el.getAttribute('data-k'), sep = el.getAttribute('data-sep') || ', ', di = S.prof.di, e = D.directory[di];
  var arr = splitTags(gv(e, k), sep); arr = mutate(arr);
  txn('Edit ' + k, function(){ queuePatch(di, (function(){ var o = {}; o[k] = arr.join(sep); return o; })()); });
  repaintSec('background'); repaintTop();
  var f = $('.tadd[data-k="' + k + '"]'); if(f) f.focus();
}
function readPhases(){
  return $$('#cprows .cprow').map(function(r){
    var now = $('.cp-now', r).checked, f = $('.cp-f', r).value, t = now ? '' : $('.cp-t', r).value;
    var o = { f:f, l:$('.cp-l', r).value.trim() }; if(t) o.t = t; var n = $('.cp-n', r).value.trim(); if(n) o.n = n; return o;
  }).filter(function(p){ return p.f || p.l; });
}
function savePhases(){ var di = S.prof.di; setField(di, 'conn_phases', JSON.stringify(readPhases())); }
function saveEvents(arr, label){ txn(label, function(){ queuePatch(S.prof.di, { events:JSON.stringify(arr) }); }); S.prof.evEdit = null; repaintSec('timeline'); }
function saveDegrees(arr, label){ txn(label, function(){ queuePatch(S.prof.di, { degrees:JSON.stringify(arr) }); }); S.prof.degEdit = null; repaintSec('background'); repaintTop(); }
function pickerHits(inp, boxId, act, exclude){
  var box = $(boxId); if(!box) return;
  var q = inp.value.trim();
  if(q.length < 2){ box.innerHTML = ''; return; }
  var hits = searchPeople(q, 6, people().filter(function(d){ return exclude.indexOf(d) < 0; }));
  box.innerHTML = hits.length ? hits.map(function(d){ return '<button type="button" class="hit" data-act="' + act + '" data-di="' + d + '" data-g="' + esc(inp.getAttribute('data-g') || '') + '">' + avatar(D.directory[d], 'sm') + '<span>' + esc(dispName(D.directory[d])) + '<small>' + esc(infoLine(D.directory[d])) + '</small></span></button>'; }).join('') : '<div class="hit none">No matches</div>';
}

function onClick(ev){
  var t = ev.target;
  if(!t.closest('.menu')) $$('.menu-pop').forEach(function(m){ m.hidden = true; });
  if(!t.closest('.gsearch')){ var gb = $('#gsr'); if(gb) gb.hidden = true; }
  var el = t.closest('[data-act]'); if(!el) return;
  if(el.tagName === 'INPUT') return;   /* checkboxes and radios are handled on change */
  var act = el.getAttribute('data-act'), di = curDi(el);
  if(el.tagName === 'A' && (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button === 1)) return;
  var prevent = true;
  switch(act){
    case 'sheetx': closeSheet(); break;
    case 'savekey': { var kv = ($('#ekey') || {}).value || ''; store('ncc_edit_key', kv.trim()); OUT.auth = false; closeSheet(); OUT.retry = 0; outKick(); toast('Key saved. Retrying.'); break; }
    case 'undo': doUndo(); refreshAfterUndo('undo'); break;
    case 'redo': doRedo(); refreshAfterUndo('redo'); break;
    case 'retry': OUT.retry = 0; OUT.err = ''; outKick(); paintSync(); break;
    case 'back': back(); break;
    case 'audpick': { var audC = el.closest('.aud-card'); if(audC){ audC.setAttribute('data-pick', el.getAttribute('data-v')); $$('.aud-pick', audC).forEach(function(b){ b.classList.toggle('on', b === el); }); audTryArm(audC); } break; }
    case 'audgap': { var audC4 = el.closest('.aud-card'); if(audC4){ var gTo = el.getAttribute('data-gap'); if(gTo && gTo !== audC4.getAttribute('data-gap')) audSetGap(audC4, gTo); } break; }
    case 'audskip': { var audC3 = el.closest('.aud-card'); if(audC3 && di != null && S.audit) audFinish(audC3, false, false); break; }
    case 'audpark': { var audC5 = el.closest('.aud-card'); if(audC5) audPark(audC5, false); break; }
    case 'audreopen': { var audC6 = el.closest('.aud-card'); if(audC6) audReopen(audC6, el.getAttribute('data-gap')); break; }
    case 'audundo': audUndoLast(); break;
    case 'audmode': if(S.audit) audSetMode(el.getAttribute('data-m')); break;
    case 'audcat': if(S.audit){ S.audit.cat = el.getAttribute('data-g'); S.audit.shown = null; viewAudit($('#view')); } break;
    case 'audcatall': if(S.audit) audSetMode('cards'); break;
    case 'audgoal': { var gd = audDay(); gd.goal = Math.max(5, Math.min(500, gd.goal + (+el.getAttribute('data-d')))); if(gd.n < gd.goal) gd.met = false; audDaySave(gd); audPaintGoal(); break; }
    case 'audblitz': audStartBlitz(); break;
    case 'audblitzx': if(S.audit){ S.audit.blitzDone = null; } viewAudit($('#view')); break;
    case 'audopen': if(di != null) openPerson(di); break;
    case 'audshuffle': if(S.audit){ S.audit.shown = null; } viewAudit($('#view')); break;
    case 'audlater': if(S.audit){ S.audit.shown = null; } viewAudit($('#view')); break;   /* redeal: saved-for-later people come first (audDeal) */
    case 'set': doSet(el); break;
    case 'kspick': setField(S.prof.di, 'years_known', el.getAttribute('data-y')); repaintSec('relationship'); break;
    case 'mergeopen': openMergeSheet(di); break;
    case 'mpick': MG.b = di; MG.surv = null; mergeStep2(); break;
    case 'mergego': {
      var lo = MG.surv === MG.a ? MG.b : MG.a; mergeMany(MG.surv, [lo]); closeSheet();
      toast('Merged ' + dispName(D.directory[lo]) + ' into ' + dispName(D.directory[MG.surv]) + '.', { undo:true });
      if(S.route.name === 'profile'){ if(lo === S.prof.di){ openPerson(MG.surv, null, { }); } else { paintProfile(S.prof.di); } } else refreshAfterStatus();
      break;
    }
    case 'unmerge': unmerge(di); toast('Restored.', { undo:true }); viewSettings($('#view')); break;
    case 'waive': {
      var sids = (el.getAttribute('data-sid') || '').split(',').filter(Boolean), on = el.getAttribute('data-off') ? false : true;
      txn(on ? 'Waive section' : 'Restore section', function(){ setWaivers(di, sids, on); });
      if(S.route.name === 'profile'){ paintProfile(S.prof.di); } else refreshAfterStatus();
      break;
    }
    case 'delperson': {
      var e1 = D.directory[di]; if(!e1) break;
      if(!confirm('Remove ' + dispName(e1) + ' from the circle?\n\nThey move to the Trash sheet and can be restored from there.')) break;
      txn('Remove ' + dispName(e1), function(){ queuePatch(di, { deleted:'1' }); });
      toast('Removed ' + dispName(e1) + '.', { undo:true });
      if(S.route.name === 'profile') back('people'); else refreshAfterStatus();
      break;
    }
    case 'openp': { ev.preventDefault(); openPerson(di, null, { keepCtx:S.route.name === 'profile' }); prevent = false; break; }
    case 'popen': { var cur = S.ppl.cur || []; openPerson(di, ctxFrom('People', cur, +el.getAttribute('data-i'), 'people')); break; }
    case 'popen1': openPerson(di, null); break;
    case 'gsopen': { var box = $('#gsr'); if(box) box.hidden = true; openPerson(di, null); break; }
    case 'gsall': { S.ppl.q = ($('#gs') || {}).value || ''; go('people'); break; }
    case 'openedit': openPerson(di, (S.route.name === 'profile' ? S.ctx : null), { edit:el.getAttribute('data-sec'), keepCtx:true }); landOn('#sec-' + el.getAttribute('data-sec'), { focus:true }); break;
    case 'openfam': S.fam.focus = di; go('family'); break;
    case 'shownet': S.net.sel = di; go('network'); break;
    case 'ctxstep': {
      var d = +el.getAttribute('data-d'), j = S.ctx.keys.indexOf(pkey(D.directory[S.prof.di])) + d, ni = PK2I[S.ctx.keys[j]];
      if(ni != null) ctxGo(ni, j); break;
    }
    /* people */
    case 'pf': S.ppl[el.getAttribute('data-k')] = el.getAttribute('data-v'); viewPeople($('#view')); break;
    case 'pf2': S.ppl[el.getAttribute('data-k')] = el.getAttribute('data-v'); openMoreFilters(); viewPeople($('#view')); break;
    case 'tsort': { var tk = el.getAttribute('data-k'); if(S.ppl.ts && S.ppl.ts.k === tk) S.ppl.ts.d = -S.ppl.ts.d; else S.ppl.ts = { k:tk, d:(PT_NUMDIR[tk] ? -1 : 1) }; paintPeople(); break; }
    case 'ptcols': ptColsSheet(); break;
    case 'ptvis': { var pvk = el.getAttribute('data-k'), pvc = null; ptCols().forEach(function(c){ if(c.k === pvk) pvc = c; }); if(pvc){ if(pvc.on && ptCols().filter(function(c){ return c.on; }).length === 1) break; pvc.on = !pvc.on; ptSaveCols(); paintPeople(); ptColsSheet(); var pvb = $('#sheetwrap [data-act="ptvis"][data-k="' + pvk + '"]'); if(pvb && !pvb.disabled) pvb.focus(); } break; }
    case 'ptmv': { var pmk = el.getAttribute('data-k'), pmd = +el.getAttribute('data-d'), parr = ptCols(), pmi = -1; parr.forEach(function(c, i){ if(c.k === pmk) pmi = i; }); var pmj = pmi + pmd; if(pmi >= 0 && pmj >= 0 && pmj < parr.length){ var ptmp = parr[pmi]; parr[pmi] = parr[pmj]; parr[pmj] = ptmp; ptSaveCols(); paintPeople(); ptColsSheet(); var pmb = $('#sheetwrap [data-act="ptmv"][data-k="' + pmk + '"][data-d="' + pmd + '"]'); if(!pmb || pmb.disabled) pmb = $('#sheetwrap [data-act="ptvis"][data-k="' + pmk + '"]'); if(pmb && !pmb.disabled) pmb.focus(); } break; }
    case 'morefilters': openMoreFilters(); break;
    case 'pclear': S.ppl = { q:'', status:'all', tier:'all', rel:'', group:'', ts:{ k:'name', d:1 }, side:S.ppl.side }; closeSheet(); viewPeople($('#view')); break;
    case 'pplside': S.ppl.side = !sideOpen(S.ppl.side); viewPeople($('#view')); break;
    /* profile chrome */
    case 'menu': { var mp = $('.menu-pop', el.parentNode); var was = mp.hidden; $$('.menu-pop').forEach(function(m){ m.hidden = true; }); mp.hidden = !was; if(!mp.hidden){ var mfb = $('button', mp); if(mfb) mfb.focus(); } break; }
    case 'export': $$('.menu-pop').forEach(function(m){ m.hidden = true; }); doExport(di, 'dl'); break;
    case 'viewdoc': $$('.menu-pop').forEach(function(m){ m.hidden = true; }); doExport(di, 'view'); break;
    case 'newdoc': $$('.menu-pop').forEach(function(m){ m.hidden = true; }); openDocSheet(di); break;
    case 'docgo': {
      var title = ($('#dtitle') || {}).value.trim(); if(!title){ toast('Title the doc first.'); break; }
      el.disabled = true;
      postKind('createdoc', subjSlug(D.directory[di]), { title:title }, function(res){
        if(!res.url){ el.disabled = false; toast('Doc creation failed.'); return; }
        var arr = (D.directory[di].files || []).slice(); arr.push({ name:res.name || title, kind:'gdoc', url:res.url });
        closeSheet(); txn('Attach doc', function(){ queuePatch(di, { files:JSON.stringify(arr) }); });
        if(S.route.name === 'profile'){ repaintSec('files'); if(!$('#sec-files')) paintProfile(di); } toast('Doc created and attached.');
      }, function(err){ el.disabled = false; toast(err + ' Not created.'); });
      break;
    }
    case 'opentog': { var kk = el.getAttribute('data-k'); S.prof.open[kk] = !S.prof.open[kk]; var osec = kk === 'ev' ? 'timeline' : 'connections'; repaintSec(osec); if(S.prof.open[kk]) landOn('#sec-' + osec); break; }
    case 'secedit': { var sid = el.getAttribute('data-sec'); S.prof.edit[sid] = true; if($('#sec-' + sid)) repaintSec(sid); else paintProfile(S.prof.di); landOn('#sec-' + sid, { focus:true }); break; }
    case 'secdone': { var sd = el.getAttribute('data-sec'); delete S.prof.edit[sd]; S.prof.evEdit = null; S.prof.degEdit = null; paintProfile(S.prof.di); break; }
    case 'tagrm': saveTags(el, function(a){ var v = el.getAttribute('data-v'); return a.filter(function(x){ return x !== v; }); }); break;
    case 'tagtog': saveTags(el, function(a){ var v = el.getAttribute('data-v'), i = a.indexOf(v); if(i >= 0) a.splice(i, 1); else a.push(v); return a; }); break;
    case 'skcat': { var c = el.getAttribute('data-cat'); S.prof.skOpen = S.prof.skOpen === c ? null : c; repaintSec('background'); break; }
    case 'grptog': { var g2 = el.getAttribute('data-g'), e2 = D.directory[S.prof.di], gl = personGroups(e2), gi = gl.indexOf(g2); if(gi >= 0) gl.splice(gi, 1); else gl.push(g2); txn('Edit groups', function(){ setPersonGroups(S.prof.di, gl); }); repaintSec('relationship'); break; }
    case 'persona': { var pk = el.getAttribute('data-k'), pv = el.getAttribute('data-v'); txn('Rate ' + pk, function(){ var o = {}; o[pk] = pv; queuePatch(S.prof.di, o); }); repaintSec('persona'); break; }
    case 'tidy': aiTidy(); break;
    case 'assocadd': { addAssociate(S.prof.di, di); repaintSec('connections'); break; }
    case 'assocrm': removeAssociate(S.prof.di, el.getAttribute('data-u')); repaintSec('connections'); break;
    case 'famrel': famRelSave(el.getAttribute('data-v')); $$('#famrels button').forEach(function(b){ b.classList.toggle('on', b === el); }); break;
    case 'famadd': { var msg = addFamily(S.prof.di, famRelDefault(), di); toast(msg || 'Added.', { undo:true }); repaintSec('connections'); repaintTop(); break; }
    case 'famrm': removeFamily(S.prof.di, +el.getAttribute('data-i')); repaintSec('connections'); repaintTop(); break;
    case 'evinit': $$('#ev-init button').forEach(function(b){ b.classList.toggle('on', b === el); }); break;
    case 'evedit': S.prof.evEdit = +el.getAttribute('data-i'); repaintSec('timeline'); break;
    case 'evcancel': S.prof.evEdit = null; repaintSec('timeline'); break;
    case 'evdel': { var evs = (D.directory[S.prof.di].events || []).slice(), i1 = +el.getAttribute('data-i'); if(!evs[i1] || !confirm('Remove this event?\n\n' + (evs[i1].summary || ''))) break; evs.splice(i1, 1); saveEvents(evs, 'Remove event'); break; }
    case 'evsave': {
      var sum = $('#ev-sum').value.trim(), dt = $('#ev-date').value; if(!sum){ toast('Write a headline first.'); break; }
      var ev = { date:dt || todayStr(), summary:sum }, det = $('#ev-det').value.trim(); if(det) ev.detail = det;
      var ib = $('#ev-init .on'); if(ib && ib.getAttribute('data-v')) ev.init = ib.getAttribute('data-v');
      var arr2 = (D.directory[S.prof.di].events || []).slice(); if(S.prof.evEdit != null && arr2[S.prof.evEdit]) arr2[S.prof.evEdit] = ev; else arr2.push(ev);
      saveEvents(arr2, S.prof.evEdit != null ? 'Edit event' : 'Add event'); break;
    }
    case 'cpadd': { var cr = document.createElement('div'); cr.innerHTML = phaseRow({}, $$('#cprows .cprow').length); $('#cprows').appendChild(cr.firstChild); break; }
    case 'cpdel': el.closest('.cprow').remove(); savePhases(); break;
    case 'fsave': {
      var nm = $('#f-name').value.trim(), url = $('#f-url').value.trim(), nt = $('#f-note').value.trim();
      if(!nm){ toast('Name the file first.'); break; } if(!url){ toast('Paste the link.'); break; }
      var f = { name:nm, kind:url.indexOf('docs.google.com') >= 0 ? 'gdoc' : 'link', url:url }; if(nt) f.note = nt;
      var fa = (D.directory[S.prof.di].files || []).slice(); fa.push(f);
      txn('Attach file', function(){ queuePatch(S.prof.di, { files:JSON.stringify(fa) }); }); repaintSec('files'); break;
    }
    case 'fdel': { var fl = (D.directory[S.prof.di].files || []).slice(), fi = +el.getAttribute('data-i'); if(!fl[fi] || !confirm('Remove this attachment?')) break; fl.splice(fi, 1); txn('Remove file', function(){ queuePatch(S.prof.di, { files:JSON.stringify(fl) }); }); repaintSec('files'); break; }
    case 'degedit': S.prof.degEdit = +el.getAttribute('data-i'); repaintSec('background'); break;
    case 'degcancel': S.prof.degEdit = null; repaintSec('background'); break;
    case 'degdel': { var da = parseArr(gv(D.directory[S.prof.di], 'degrees')).slice(), dI = +el.getAttribute('data-i'); if(!da[dI] || !confirm('Remove this degree?')) break; da.splice(dI, 1); saveDegrees(da, 'Remove degree'); break; }
    case 'degsave': {
      var sch = $('#dd-school').value, school = sch === '__other' ? $('#dd-other').value.trim() : sch;
      var degree = $('#dd-degree').value, major = $('#dd-major').value.trim(), year = $('#dd-year').value, note = $('#dd-note').value.trim();
      if(!school){ toast('Pick the school first.'); break; } if(!degree && !major && !year){ toast('Add a degree, major or year.'); break; }
      var dd = { school:school }; if(degree) dd.degree = degree; if(major) dd.major = major; if(year) dd.year = year; if(note) dd.note = note;
      var da2 = parseArr(gv(D.directory[S.prof.di], 'degrees')).slice(); if(S.prof.degEdit != null && da2[S.prof.degEdit]) da2[S.prof.degEdit] = dd; else da2.push(dd);
      saveDegrees(da2, 'Edit degree'); break;
    }
    /* network + family */
    case 'netcolor': S.net.color = el.getAttribute('data-v'); viewNetwork($('#view')); break;
    case 'famside': S.fam.side = !sideOpen(S.fam.side); viewFamily($('#view')); break;
    case 'famtree': S.fam.focus = di; viewFamily($('#view')); break;
    case 'netmode': S.net.mode = el.getAttribute('data-v') === '2d' ? '2d' : '3d'; store('ncc_netmode', S.net.mode); viewNetwork($('#view')); break;
    case 'netbg': S.net.bg = !S.net.bg; N3.bgPts = null; NET.bg = null; viewNetwork($('#view')); break;
    case 'netzoom': { var zf = +el.getAttribute('data-d') > 0 ? 1.3 : 1 / 1.3; if(S.net.mode === '2d'){ NET.cam.z = Math.max(0.3, Math.min(4, NET.cam.z * zf)); NET.dirty = true; } else N3.zoom = Math.max(0.45, Math.min(3.5, N3.zoom * zf)); break; }
    case 'netfit': netFit(); break;
    case 'netclose': S.net.sel = null; netCard(); NET.dirty = true; break;
    case 'fnode': { if(FAMV.moved) break; S.fam.focus = di; $$('.fn.foc').forEach(function(n){ n.classList.remove('foc'); }); el.classList.add('foc'); famCard(); famGlide(di); break; }
    case 'famclose': S.fam.focus = null; $$('.fn.foc').forEach(function(n){ n.classList.remove('foc'); }); famCard(); break;
    case 'famzoom': FAMV.cam.z = Math.max(0.2, Math.min(1.6, FAMV.cam.z * (+el.getAttribute('data-d') > 0 ? 1.25 : 0.8))); famApply(); break;
    case 'famfit': famFit(); break;
    /* groups */
    case 'gnew': { var gi2 = $('#gnew'), gn = gi2.value.trim(); if(!gn) break; if(!allGroups()[gn]){ GRP_EXTRA.push(gn); store('ncc_groups_extra', JSON.stringify(GRP_EXTRA)); } go('groups/groups/' + encodeURIComponent(gn)); break; }
    case 'grename': { var nn = prompt('Rename group', el.getAttribute('data-g')); if(nn){ groupRename(el.getAttribute('data-g'), nn); go('groups/groups/' + encodeURIComponent(nn.trim()), { replace:true }); } break; }
    case 'gdelete': { var gd = el.getAttribute('data-g'); if(!confirm('Delete the group "' + gd + '"?\n\nIt is removed from everyone in it. People stay.')) break; groupDelete(gd); toast('Group deleted.', { undo:true }); go('groups/groups', { replace:true }); break; }
    case 'gmemrm': { var gm = el.getAttribute('data-g'); txn('Remove from group', function(){ setPersonGroups(di, personGroups(D.directory[di]).filter(function(x){ return x !== gm; })); }); viewGroups($('#view')); break; }
    case 'gadd': { var ga = el.getAttribute('data-g'); txn('Add to group', function(){ var l = personGroups(D.directory[di]); if(l.indexOf(ga) < 0) l.push(ga); setPersonGroups(di, l); }); viewGroups($('#view')); break; }
    /* settings */
    case 'setsave': { var m = $('#setmsg'), patch = { prompt:$('#setprompt').value }, kv2 = $('#setkey').value; if(kv2) patch.gemini_key = kv2; m.textContent = 'Saving'; settingsCall('settings', patch, function(res){ m.textContent = (res && res.ok) ? 'Saved.' : 'Save failed: ' + ((res && res.error) || 'unknown'); }); break; }
    case 'settest': { var m2 = $('#setmsg'); m2.textContent = 'Testing'; settingsCall('testgemini', { x:1 }, function(res){ m2.textContent = (res && res.ok) ? 'Gemini replied: ' + res.reply : 'Test failed: ' + ((res && res.error) || 'unknown'); }); break; }
    case 'setclear': { var m3 = $('#setmsg'); m3.textContent = 'Clearing'; settingsCall('settings', { clear_key:true }, function(res){ m3.textContent = (res && res.ok) ? 'Key cleared.' : 'Clear failed.'; }); break; }
    default: prevent = false;
  }
  if(prevent && el.tagName === 'A' && act !== 'openp') ev.preventDefault();
}
function refreshAfterUndo(dir){
  var n = S.route.name;
  if(n === 'profile'){ if(D.directory[S.prof.di]) paintProfile(S.prof.di); }
  else if(n === 'people') paintPeople();
  else render();
  afterWrite();
}

function onInput(ev){
  var t = ev.target;
  if(t.id === 'gs'){ paintSearch(); return; }
  if(t.id === 'pq'){ S.ppl.q = t.value; paintPeople(); return; }
  if(t.id === 'assocq'){ var e = D.directory[S.prof.di]; pickerHits(t, '#assocr', 'assocadd', [S.prof.di].concat(knownAssociates(e).map(function(n){ return BYN[(n.u || '').toLowerCase()]; }))); return; }
  if(t.id === 'famq'){ pickerHits(t, '#famr', 'famadd', [S.prof.di]); return; }
  if(t.id === 'gaddq'){ var g = t.getAttribute('data-g'); pickerHits(t, '#gaddr', 'gadd', (allGroups()[g] || [])); return; }
  if(t.id === 'mq'){
    var q = t.value.trim(), box = $('#mr'); if(q.length < 2){ box.innerHTML = ''; return; }
    var hits = searchPeople(q, 6, people().filter(function(d){ return d !== MG.a; }));
    box.innerHTML = hits.length ? hits.map(function(d){ return '<button type="button" class="hit" data-act="mpick" data-di="' + d + '">' + avatar(D.directory[d], 'sm') + '<span>' + esc(dispName(D.directory[d])) + '<small>' + esc(infoLine(D.directory[d])) + '</small></span></button>'; }).join('') : '<div class="hit none">No matches</div>';
  }
}
function onChange(ev){
  var t = ev.target, act = t.getAttribute && t.getAttribute('data-act');
  if(t.id === 'setedit'){ store('ncc_edit_key', t.value.trim()); return; }
  if(act === 'waive' && t.type === 'checkbox'){
    var di = curDi(t), sids = t.getAttribute('data-sid').split(',');
    txn(t.checked ? 'Waive section' : 'Restore section', function(){ setWaivers(di, sids, t.checked); });
    paintProfile(S.prof.di); return;
  }
  if(act === 'msv'){ MG.surv = +t.getAttribute('data-di'); mergeStep2(); return; }
  if(t.hasAttribute && t.hasAttribute('data-pk')){
    var k = t.getAttribute('data-pk');
    setField(S.prof.di, k, (t.tagName === 'TEXTAREA') ? t.value : t.value.trim());
    if(k === 'first_name' || k === 'last_name') repaintTop();
    if(k === 'public_footprint' || k === 'synopsis') repaintTop();
    return;
  }
  if(t.classList && t.classList.contains('tadd')){ addTag(t); return; }
  if(t.hasAttribute && t.hasAttribute('data-grpnew')){
    var n = t.value.trim(); if(!n) return;
    if(!allGroups()[n]){ GRP_EXTRA.push(n); store('ncc_groups_extra', JSON.stringify(GRP_EXTRA)); }
    var gl = personGroups(D.directory[S.prof.di]); if(gl.indexOf(n) < 0) gl.push(n);
    txn('Edit groups', function(){ setPersonGroups(S.prof.di, gl); }); repaintSec('relationship'); return;
  }
  if(t.closest && t.closest('.cprow')){
    if(t.classList.contains('cp-now')){ var row = t.closest('.cprow'), tt = $('.cp-t', row); tt.disabled = t.checked; if(t.checked) tt.value = ''; }
    savePhases(); return;
  }
  if(t.id === 'dd-school'){ var o = $('#dd-other'); if(o) o.style.display = t.value === '__other' ? '' : 'none'; }
}
function addTag(t){
  var v = t.value.trim().replace(/[,|]+$/, ''); t.value = ''; if(!v) return;
  saveTags(t, function(a){ if(a.map(function(x){ return x.toLowerCase(); }).indexOf(v.toLowerCase()) < 0) a.push(v); return a; });
}
/* Keyboard navigation (JD 2026-10-15), registered BEFORE onKey so consumed
   keys never fall through to it: arrows/Home/End move through open menus
   and chip groups, Escape closes an open menu and returns focus to its
   toggle, sortable table headers activate with Enter/Space. Activation in
   chip groups stays Enter/Space (native button click); arrows only move. */
function onNavKey(ev){
  var t = ev.target;
  if(!t || !t.closest) return;
  var key = ev.key;
  /* Shift+Right inside an Audit card (JD 2026-10-15): pass on the gap on
     show. Checked first so it overrides text selection and chip-group
     arrow movement within card editors; anywhere else in the app
     Shift+Right keeps its normal text-selection behavior. */
  if(key === 'ArrowRight' && ev.shiftKey && !ev.ctrlKey && !ev.metaKey && !ev.altKey){
    var audCard = t.closest('.aud-card');
    if(audCard && S.route && S.route.name === 'audit'){
      ev.preventDefault(); ev.stopImmediatePropagation();
      audPass(audCard);
      return;
    }
  }
  /* Shift+Down / Shift+Left inside an Audit card (JD 2026-10-15):
     Shift+Down finishes the person NOW (a complete value on show
     submits immediately; the rest close out) and Shift+Left saves the
     person for later, noting the category on show. Checked before the
     chip-group handler below, so inside a card these arrows never just
     move focus or extend a text selection. */
  if(ev.shiftKey && !ev.ctrlKey && !ev.metaKey && !ev.altKey && (key === 'ArrowDown' || key === 'ArrowLeft')){
    var audCard2 = t.closest('.aud-card');
    if(audCard2 && S.route && S.route.name === 'audit'){
      ev.preventDefault(); ev.stopImmediatePropagation();
      if(key === 'ArrowDown') audFinish(audCard2, true, true); else audPark(audCard2, true);
      return;
    }
  }
  var pop = t.closest('.menu-pop');
  if(pop && !pop.hidden){
    var items = $$('button', pop).filter(function(b){ return !b.disabled; });
    if(key === 'Escape'){
      pop.hidden = true;
      var tg = pop.parentNode ? $('button[data-act="menu"]', pop.parentNode) : null;
      if(tg) tg.focus();
      ev.preventDefault(); ev.stopImmediatePropagation(); return;
    }
    if(key === 'Tab'){ pop.hidden = true; return; }
    if(key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End'){
      if(items.length){
        var i = items.indexOf(t);
        var n = key === 'Home' ? 0 : key === 'End' ? items.length - 1 : (i + (key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        if(items[n]) items[n].focus();
      }
      ev.preventDefault(); ev.stopImmediatePropagation(); return;
    }
    return;
  }
  if(t.tagName === 'TH' && t.getAttribute('data-act') === 'tsort' && (key === 'Enter' || key === ' ')){
    ev.preventDefault(); ev.stopImmediatePropagation(); t.click(); return;
  }
  if(t.tagName === 'BUTTON'){
    var grp = t.closest('.seg, .chips, .aud-opts, .aud-gaps, .pted-opts, .kschips');
    if(grp && (key === 'ArrowDown' || key === 'ArrowUp' || key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Home' || key === 'End')){
      var bs = $$('button', grp).filter(function(b){ return !b.disabled; });
      var j = bs.indexOf(t); if(j < 0) return;
      var m = key === 'Home' ? 0 : key === 'End' ? bs.length - 1 : (j + ((key === 'ArrowDown' || key === 'ArrowRight') ? 1 : -1) + bs.length) % bs.length;
      if(bs[m]) bs[m].focus();
      ev.preventDefault(); ev.stopImmediatePropagation();
    }
  }
}
function onKey(ev){
  var t = ev.target, tag = t.tagName, isField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  if(ev.key === 'Enter' && t.classList && t.classList.contains('tadd')){ ev.preventDefault(); addTag(t); return; }
  if((ev.key === 'Enter' || ev.key === ' ') && t.classList && t.classList.contains('dm') && t.classList.contains('pick')){ ev.preventDefault(); t.click(); return; }
  if((ev.key === 'Enter' || ev.key === ' ') && t.classList && t.classList.contains('ptrow')){ ev.preventDefault(); t.click(); return; }
  if(ev.key === 'Enter' && t.id === 'gnew'){ ev.preventDefault(); var b = $('[data-act="gnew"]'); if(b) b.click(); return; }
  if(ev.key === 'Enter' && t.id === 'dtitle'){ ev.preventDefault(); var d = $('[data-act="docgo"]'); if(d) d.click(); return; }
  if(ev.key === 'Enter' && t.id === 'ekey'){ ev.preventDefault(); var s = $('[data-act="savekey"]'); if(s) s.click(); return; }
  if(t.id === 'gs'){
    if(ev.key === 'Enter'){ ev.preventDefault(); var first = $('#gsr .gsi-row'); if(first) first.click(); else if(t.value.trim()){ S.ppl.q = t.value; go('people'); } }
    else if(ev.key === 'Escape'){ t.value = ''; paintSearch(); t.blur(); }
    return;
  }
  if(ev.key === 'Escape'){
    if(!$('#sheetwrap').hidden){ closeSheet(); return; }
    if(isField){ t.blur(); return; }
    if(S.route.name === 'audit' && S.audit && S.audit.mode === 'rapid'){ audSetMode('cards'); return; }
    if(S.route.name === 'profile'){ var open = Object.keys(S.prof.edit); if(open.length){ S.prof.edit = {}; paintProfile(S.prof.di); } else back('people'); }
    return;
  }
  if(isField) return;
  var mod = ev.ctrlKey || ev.metaKey;
  if(mod && (ev.key === 'z' || ev.key === 'Z')){ ev.preventDefault(); if(ev.shiftKey) doRedo(); else doUndo(); refreshAfterUndo(ev.shiftKey ? 'redo' : 'undo'); return; }
  if(mod && (ev.key === 'y' || ev.key === 'Y')){ ev.preventDefault(); doRedo(); refreshAfterUndo('redo'); return; }
  if(mod && (ev.key === 'k' || ev.key === 'K')){ ev.preventDefault(); var g = $('#gs'); if(g) g.focus(); return; }
  if(mod || ev.altKey) return;
  if(ev.key === '/'){ ev.preventDefault(); var gs = $('#gs'); if(gs) gs.focus(); return; }
}


/* ============================================================
   Presentation hooks. CALM PASS 2026-10-13: numbers and bars
   render at their final values, the progress ring is set in
   place instantly, and the loading skeleton is static. Nothing
   here writes data, touches the outbox, or changes any payload.
   ============================================================ */
function pvReducedMotion(){ return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
function skeletonHTML(note){
  /* SWISS MONO 2026-10-15: route-aware skeletons — the silhouette mirrors
     the surface the URL is about to show (Audit card grid, profile
     columns, map block, People rows). Static under reduced motion (CSS). */
  var h = (location.hash || '').toLowerCase(), body = '', i;
  if(h.indexOf('audit') >= 0){
    var cards = '';
    for(i = 0; i < 6; i++) cards += '<div class="skl sk-acard"></div>';
    body = '<div class="sk-grid">' + cards + '</div>';
  } else if(h.indexOf('/p/') >= 0){
    body = '<div class="skl sk-hero"></div><div class="sk-cols"><div class="skl"></div><div class="skl"></div><div class="skl"></div></div>';
  } else if(h.indexOf('network') >= 0 || h.indexOf('family') >= 0){
    body = '<div class="skl sk-big"></div>';
  } else {
    var rows = '';
    for(i = 0; i < 6; i++) rows += '<div class="skl-row"><span class="skl av"></span><span class="skl tx" style="width:' + (58 - (i % 3) * 8) + '%"></span><span class="skl tx s" style="width:22%"></span></div>';
    body = rows + '<div class="skl card"></div>';
  }
  return '<div class="page skel" aria-busy="true"><div class="skl head"></div>' + body +
    (note ? '<p class="dim center">' + esc(note) + '</p>' : '') + '</div>';
}

/* ============================================================
   10. boot
   ============================================================ */
function boot(){
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', onNavKey);
  document.addEventListener('keydown', onKey);
  addEventListener('resize', function(){ if(S.route.name === 'network' && NET.cv && document.body.contains(NET.cv)){ netResize(); } else if(S.route.name === 'family') famApply(); });
  $('#view').innerHTML = skeletonHTML();
  var tries = 0;
  (function attempt(){
    tries++;
    fetch('data/dossier.json', { cache:'no-store' })
      .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(d){
        D = d;
        D.directory.forEach(function(r, i){ BYN[(r.name || '').toLowerCase()] = i; normEntry(r); PK2I[pkey(r)] = i; });
        outLoad();
        try{ applyOutbox(); }catch(px){}
        computeNewGain();
        history.replaceState({ d:0 }, '', location.hash || '#/people');
        render();
        outKick(); fetchChanges();
      })
      .catch(function(err){
        if(tries < 4){ $('#view').innerHTML = skeletonHTML('Loading (retry ' + tries + ' of 3)'); setTimeout(attempt, 1200 * tries); }
        else $('#view').innerHTML = '<div class="page">' + emptyState('Could not load the data.', String(err && err.message || err)) + '<p class="center"><button type="button" class="btn" onclick="location.reload()">Retry</button></p></div>';
      });
  })();
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
