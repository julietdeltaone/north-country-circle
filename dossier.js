/* North Country Circle — Dossier v6
   One front end, five destinations: Today (the work), People, Network, Family, Groups.
   The profile is a page, not a panel. Everything that writes goes through the same outbox as v5
   (see DATA-CONTRACT.md section 6): queuePatch -> localStorage -> batched POST -> Sheet.

   Layout of this file
     1. constants + helpers          5. reasons engine (what needs attention, and why)
     2. data access (gv, pkey ...)   6. family model + writes
     3. outbox + undo                7. merge
     4. waivers                      8. views: shell, router, Today, People, Profile, Network, Family, Groups, Settings
*/
(function(){
'use strict';

/* ============================================================
   1. constants + helpers
   ============================================================ */
var WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwZli1Dv07iWBpR3Oz4jD4imtNLN845jFDBnXIbtmT3sPGExsMlKFMQwt42FmrUdFBD/exec';

var TIERS = {
  vetted:   { n:'Vetted',    c:'#d6e2ff' },
  associate:{ n:'Associate', c:'#86a0d8' },
  open:     { n:'Open',      c:'#6f7a93' }
};
var TIER_ORDER = ['vetted', 'associate', 'open'];
var TIER_RANK = { vetted:0, associate:1, open:2 };
var RELC = { mutual:'#c78bd8', following:'#86a0d8', follower:'#7b869e' };
var RELN = { mutual:'Mutual', following:'Following', follower:'Follower' };
var STAT_C = { needs:'#e0a35a', checked:'#5fb7a5', waiting:'#6f7a93' };
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
function tierCol(e){ return (TIERS[tierOf(e)] || {}).c || '#4b5468'; }
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
function liveEntry(e){ var p = e.profile || {}; return p.deleted !== '1' && !(p.merged_into || '').trim(); }
function isChecked(e){ return (e.profile || {}).audit === 'audited'; }
function igURL(h){ return 'https://www.instagram.com/' + encodeURIComponent(String(h).replace(/^@/, '')) + '/'; }
function hasHandle(e){ return e.src !== 'contacts' && e.src !== 'subject' && !/^(ig|ct|sf|fdb):/.test(String(e.name || '')) && !!e.name; }
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
   5. reasons engine — what needs JD, in what order, and why.
      "Done" is a state (checked), not a field count. Persona is never a to-do: blank is final.
   ============================================================ */
var REASONS = {
  dup:     { l:'Possible duplicate',          pr:1,  tab:'dup',      s:'Duplicates' },
  family:  { l:'Family needs a look',         pr:2,  tab:'family',   s:'Family' },
  identity:{ l:'Identity needs a second signal', pr:3, tab:'identity', s:'Identity' },
  unsrc:   { l:'Inferred, not sourced',       pr:4,  tab:'unsrc',    s:'Sources' },
  missing: { l:'Flagged: missing info',       pr:5,  tab:'cleanup',  s:'Cleanup' },
  name:    { l:'Name incomplete',             pr:6,  tab:'cleanup',  s:'Cleanup' },
  biz:     { l:'Looks like a business',       pr:7,  tab:'cleanup',  s:'Cleanup' },
  fresh:   { l:'New this week, unclassified', pr:8,  tab:'fresh',    s:'New' },
  inner:   { l:'Inner circle, not yet checked', pr:9, tab:'inner',   s:'Inner circle' },
  spot:    { l:'Spot check',                  pr:10, tab:'spot',     s:'Spot check' },
  sweep:   { l:'Floor sweep',                 pr:11, tab:'sweep',    s:'Floor sweep' }
};
var TABS = [
  { k:'needs',    l:'Needs you' },
  { k:'dup',      l:'Duplicates' },
  { k:'identity', l:'Identity' },
  { k:'unsrc',    l:'Sources' },
  { k:'family',   l:'Family' },
  { k:'fresh',    l:'New' },
  { k:'cleanup',  l:'Cleanup' },
  { k:'inner',    l:'Inner circle' },
  { k:'spot',     l:'Spot check' },
  { k:'sweep',    l:'Floor sweep' }
];
var BIZ_RE = /\b(llc|inc|corp|co\.|company|church|bakery|grill|cantina|pizza|caf[eé]|studio|salon|barber|tattoo|photo|productions|realty|motors|auto|plumbing|electric|construction|landscap|farm|market|deli|pub|brewery|winery|hotel|motel|insurance|dental|clinic|school|university|college|ntc|cfc|ministr)\b/i;
var ADDR_RE = /\d+\s+[A-Za-z.]+\s+(st|street|ave|avenue|rd|road|blvd|ln|lane|dr|drive)\b|\bNY\b\s*\d{5}|\b\d{5}\b/;
function isBusiness(e){ var t = (String(e.display || '') + ' ' + String(e.name || '')).trim(); return BIZ_RE.test(t) || ADDR_RE.test(t); }
function nameOk(e){ return !!(String(gv(e, 'first_name')).trim() && String(gv(e, 'last_name')).trim()); }
function normDupName(s){ return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }

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

/* two independent signals beyond the name */
function identitySignals(e){
  var have = [], miss = [];
  function sig(ok, label){ (ok ? have : miss).push(label); }
  sig(!!(e.city || e.hometown), 'Place');
  sig(degreesOf(e).length > 0, 'School');
  sig(!!(tagList(gv(e, 'companies')).length || tagList(gv(e, 'churches')).length), 'Work or church');
  sig(!!(gv(e, 'phone') || e.fb_url), 'Phone or Facebook');
  sig(!!(gv(e, 'relationship') || gv(e, 'context') || gv(e, 'groups') || e.record), 'Connection to JD');
  sig(footprintOf(e).sourced, 'Sourced web record');
  return { have:have, miss:miss, n:have.length };
}
/* what an inner-circle profile is still missing (waived sections do not count; persona never does) */
function depthGaps(e){
  var g = [];
  function need(sid, ok, label){ if(!ok && !secWaived(e, sid)) g.push({ sid:sid, l:label }); }
  need('relationship', !!(gv(e, 'relationship') || gv(e, 'context')), 'Relationship');
  need('onfile', !!gv(e, 'synopsis'), 'Synopsis');
  need('background', !!(gv(e, 'specialty') || ORG_CATS.some(function(c){ return tagList(gv(e, c.k)).length; }) || degreesOf(e).length || gv(e, 'highlights')), 'Background');
  need('connections', !!(knownAssociates(e).length || famLinks(e).length), 'Connections');
  need('timeline', !!(e.events || []).length, 'Timeline');
  return g;
}
function familyIssues(di){
  var e = D.directory[di], links = famLinks(e), out = [];
  var sp = links.filter(function(l){ return l[0] === 'spouse'; });
  var par = links.filter(function(l){ return l[0] === 'parent'; });
  if(sp.length > 1) out.push('More than one spouse recorded');
  if(par.length > 2) out.push('More than two parents recorded');
  links.forEach(function(l){
    var tdi = BYN[String(l[1] || '').toLowerCase()];
    if(tdi == null){ out.push('Link to ' + l[1] + ' points at nobody in the directory'); return; }
    if(tdi === di){ out.push('Linked to themselves'); return; }
    var inv = FAM_INV_REL[l[0]], me = String(e.name || '').toLowerCase();
    var back = famLinks(D.directory[tdi]).some(function(x){ return x[0] === inv && String(x[1] || '').toLowerCase() === me; });
    if(!back) out.push(dispName(D.directory[tdi]) + ' does not list the matching ' + inv + ' link back');
  });
  return out;
}
var FAM_INV_REL = { parent:'child', child:'parent', spouse:'spouse', sibling:'sibling' };

function dupDismissed(){ try{ return JSON.parse(store('ncc_dupok') || '{}') || {}; }catch(x){ return {}; } }
function dupGroupKey(dis){ return dis.map(function(di){ return pkey(D.directory[di]); }).sort().join('|'); }
function dupPairKey(a, b){ var ka = pkey(D.directory[a]), kb = pkey(D.directory[b]); return ka < kb ? ka + '|' + kb : kb + '|' + ka; }
/* a pair counts as dismissed when its own pair key is stored, or when a legacy
   whole-group dismissal (a stored key listing both people) covers it */
function pairDismissed(a, b){
  var m = dupDismissed(), ka = pkey(D.directory[a]), kb = pkey(D.directory[b]);
  return Object.keys(m).some(function(k){ var parts = k.split('|'); return parts.indexOf(ka) >= 0 && parts.indexOf(kb) >= 0; });
}
function dismissDupPair(a, b){ var m = dupDismissed(); m[dupPairKey(a, b)] = 1; store('ncc_dupok', JSON.stringify(m)); VER++; }
function spotDone(){ try{ var o = JSON.parse(store('ncc_spot') || '{}') || {}; return o.w === weekKey() ? o.done || {} : {}; }catch(x){ return {}; } }
function markSpotDone(di){ var d = spotDone(); d[pkey(D.directory[di])] = 1; store('ncc_spot', JSON.stringify({ w:weekKey(), done:d })); VER++; }

var ST_CACHE = { ver:-1, st:null };
function getState(){
  if(ST_CACHE.ver === VER && ST_CACHE.st) return ST_CACHE.st;
  var list = people(), by = {}, counts = {}, dismissed = dupDismissed();
  /* same-name clusters, photo matches */
  var byName = {}, groups = [], inGroup = {};
  list.forEach(function(di){
    var k = normDupName(dispName(D.directory[di]));
    if(k.length >= 2) (byName[k] = byName[k] || []).push(di);
  });
  Object.keys(byName).forEach(function(k){ if(byName[k].length > 1) groups.push({ kind:'name', label:'Same name', dis:byName[k].slice() }); });
  var byHandle = {}; D.directory.forEach(function(r, di){ byHandle[String(r.name || '').toLowerCase()] = di; });
  (D.photo_merge || []).forEach(function(pm){
    var dis = [];
    (pm.keys || []).forEach(function(k){
      var di = byHandle[String(k).toLowerCase()];
      if(di !== undefined && liveEntry(D.directory[di]) && dis.indexOf(di) < 0) dis.push(di);
    });
    if(dis.length > 1) groups.push({ kind:'photo', label:'Same face ("' + pm.face + '")', dis:dis });
  });
  groups = groups.filter(function(g){
    if(!g.dis.some(function(di){ return !isChecked(D.directory[di]); })) return false;
    /* a group stays until every pair inside it has been marked different people */
    for(var a = 0; a < g.dis.length; a++) for(var b = a + 1; b < g.dis.length; b++) if(!pairDismissed(g.dis[a], g.dis[b])) return true;
    return false;
  });
  groups.forEach(function(g){ g.dis.forEach(function(di){ (inGroup[di] = inGroup[di] || []).push(g); }); });
  var spotSet = {}, checkedList = list.filter(function(di){ return isChecked(D.directory[di]); });
  var nSpot = checkedList.length >= 20 ? Math.max(3, Math.ceil(checkedList.length * 0.05)) : 0, wk = weekKey();
  checkedList.map(function(di){ return { di:di, h:hash32(wk + pkey(D.directory[di])) }; })
    .sort(function(a, b){ return a.h - b.h; }).slice(0, nSpot).forEach(function(o){ spotSet[o.di] = 1; });
  var sdone = spotDone();

  list.forEach(function(di){
    var e = D.directory[di], checked = isChecked(e), rs = [], det = {};
    if(!checked){
      if(inGroup[di]){ rs.push('dup'); det.dup = inGroup[di]; }
      else if(raw(e, 'review_flag') === 'duplicate'){ rs.push('dup'); det.dup = []; }
      var fi = familyIssues(di); if(fi.length){ rs.push('family'); det.family = fi; }
      if(!secWaived(e, 'identity')){ var sg = identitySignals(e); if(sg.n < 2){ rs.push('identity'); det.identity = sg; } }
      var fp = footprintOf(e);
      if(fp.blocks.length && !fp.sourced){ rs.push('unsrc'); det.unsrc = fp; }
      if(raw(e, 'review_flag') === 'missing_info'){ rs.push('missing'); }
      if(!nameOk(e)){ rs.push('name'); }
      if(isBusiness(e)){ rs.push('biz'); }
      if(NEWGAIN[di] && !tierOf(e) && !raw(e, 'relationship')){ rs.push('fresh'); }
      if(tierOf(e) === 'vetted' || tierOf(e) === 'associate'){ rs.push('inner'); det.inner = depthGaps(e); }
    } else if(spotSet[di] && !sdone[pkey(e)]){ rs.push('spot'); }
    var pr = 99;
    rs.forEach(function(c){ if(REASONS[c].pr < pr) pr = REASONS[c].pr; });
    var kind = checked ? (rs.length ? 'spot' : 'checked') : (rs.length ? 'needs' : 'sweep');
    if(!checked && !rs.length){ rs.push('sweep'); pr = REASONS.sweep.pr; }
    by[di] = { di:di, checked:checked, reasons:rs, detail:det, pr:pr, kind:kind };
    rs.forEach(function(c){ counts[c] = (counts[c] || 0) + 1; });
  });
  function cmp(a, b){
    if(a.pr !== b.pr) return a.pr - b.pr;
    var ea = D.directory[a.di], eb = D.directory[b.di];
    var ta = TIER_RANK[tierOf(ea)], tb = TIER_RANK[tierOf(eb)];
    ta = ta == null ? 3 : ta; tb = tb == null ? 3 : tb;
    if(ta !== tb) return ta - tb;
    return (eb.strength || 0) - (ea.strength || 0) || dispName(ea).localeCompare(dispName(eb));
  }
  var all = Object.keys(by).map(function(k){ return by[k]; });
  var st = { by:by, counts:counts, groups:groups, cmp:cmp,
    total:list.length,
    checkedN:all.filter(function(x){ return x.checked; }).length,
    needs:all.filter(function(x){ return x.kind === 'needs' || x.kind === 'spot'; }).sort(cmp),
    sweep:all.filter(function(x){ return x.kind === 'sweep'; }).sort(cmp) };
  ST_CACHE = { ver:VER, st:st };
  return st;
}
function queueFor(tab){
  var st = getState();
  if(tab === 'needs') return st.needs;
  if(tab === 'sweep') return st.sweep;
  var out = [];
  Object.keys(st.by).forEach(function(k){
    var x = st.by[k];
    if(x.checked && tab !== 'spot') return;
    if(x.reasons.some(function(c){ return REASONS[c].tab === tab; })) out.push(x);
  });
  return out.sort(st.cmp);
}
function tabCount(tab){
  var st = getState();
  if(tab === 'needs') return st.needs.length;
  if(tab === 'sweep') return st.sweep.length;
  return queueFor(tab).length;
}
function statusOf(di){
  var x = getState().by[di]; if(!x) return 'waiting';
  return x.checked ? (x.kind === 'spot' ? 'needs' : 'checked') : (x.kind === 'needs' ? 'needs' : 'waiting');
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
var FAM_GEN_COLORS = ['#86a0d8', '#b7a1e6', '#6fc2ae', '#d6e2ff', '#c78bd8'];
var FAM_SPOUSE_COLOR = '#c78bd8';
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
  var name = dispName(e), handle = hasHandle(e) ? '@' + (e.name || '') : '';
  var aka = personIsAka(e) ? gv(e, 'also_known_as') : '';
  var ds = todayStr();
  var bio = gv(e, 'synopsis');
  var classif = [gv(e, 'relationship'), gv(e, 'context'), tierName(e)].filter(Boolean).join(' · ');
  var orgs = [];
  ORG_CATS.forEach(function(cat){ tagList(gv(e, cat.k)).forEach(function(v){ orgs.push(v); }); });
  var contact = [];
  if(handle) contact.push('<span class="cl">Instagram</span> ' + esc(handle));
  if(gv(e, 'email')) contact.push('<span class="cl">Email</span> ' + esc(gv(e, 'email')));
  if(gv(e, 'phone')) contact.push('<span class="cl">Phone</span> ' + esc(gv(e, 'phone')));
  if(e.city) contact.push('<span class="cl">Lives in</span> ' + esc(e.city));
  if(e.hometown) contact.push('<span class="cl">From</span> ' + esc(e.hometown));
  if(orgs.length) contact.push('<span class="cl">Orgs</span> ' + esc(orgs.join(' · ')));
  var bars = PERSONA.map(function(p){
    var v = parseInt(gv(e, p[0]), 10), ok = !isNaN(v);
    var w = ok ? Math.max(0, Math.min(5, v)) / 5 * 100 : 0;
    return '<div class="brow"><span>' + esc(p[1]) + '</span><div class="bar"><i style="width:' + w + '%"></i></div><em>' + (ok ? v + '/5' : '—') + '</em></div>';
  }).join('');
  var extras = '';
  if(gv(e, 'specialty')) extras += '<div class="kv"><span class="cl">Skills</span> ' + esc(gv(e, 'specialty')) + '</div>';
  if(tierName(e)) extras += '<div class="kv"><span class="cl">Tier</span> ' + esc(tierName(e)) + '</div>';
  if(momVal(e)) extras += '<div class="kv"><span class="cl">Momentum</span> ' + esc(MOM_LABELS[momVal(e)]) + '</div>';
  degreesOf(e).forEach(function(d){ extras += '<div class="kv"><span class="cl">Degree</span> ' + esc([d.school, d.degree, d.major, d.year].filter(Boolean).join(' · ')) + '</div>'; });
  var assoc = knownAssociates(e).map(function(nb){
    var di = BYN[(nb.u || '').toLowerCase()];
    return '<li>' + esc(di != null ? dispName(D.directory[di]) : nb.d || nb.u) + '</li>';
  }).join('');
  var fp = gv(e, 'public_footprint'), notes = '';
  if(gv(e, 'notes')) notes += '<p>' + esc(gv(e, 'notes')).replace(/\n/g, '<br>') + '</p>';
  if(fp) notes += '<p><b>Public footprint</b><br>' + esc(fp).replace(/\n/g, '<br>') + '</p>';
  if(!notes) notes = '<p>—</p>';
  var evs = sortedEvents(e);
  var tl = evs.length ? '<ul class="assoc">' + evs.map(function(o){
    return '<li><b>' + esc(o.ev.date || '') + '</b> — ' + esc(o.ev.summary || '') + (o.ev.detail ? '<br>' + esc(o.ev.detail) : '') + '</li>';
  }).join('') + '</ul>' : '<div class="sbody"><p>—</p></div>';
  var initial = (name || '·').trim().charAt(0).toUpperCase();
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Dossier — ' + esc(name) + '</title><style>' +
  'body{background:#1b1e26;margin:0;padding:28px;font-family:Georgia,"Times New Roman",serif;color:#16181d}' +
  '.page{background:#f4f3ef;max-width:820px;margin:0 auto;box-shadow:0 0 50px rgba(0,0,0,.5)}' +
  '.banner{background:#14161c;color:#f4f3ef;padding:26px 48px 22px;display:flex;align-items:center;gap:22px}' +
  '.seal{flex:none;width:70px;height:70px;border-radius:50%;border:2px solid #86a0d8;display:flex;align-items:center;justify-content:center;font-size:32px;color:#86a0d8}' +
  '.kicker{font:600 10.5px/1 Helvetica,Arial,sans-serif;letter-spacing:.3em;color:#86a0d8;margin-bottom:8px}' +
  'h1{font-size:32px;margin:0;font-weight:400;letter-spacing:.01em}.aka{font:12px Helvetica,Arial,sans-serif;color:#9aa3b6;margin-top:4px}' +
  '.rule{height:3px;background:linear-gradient(90deg,#86a0d8 0%,#86a0d8 22%,transparent 22%)}.body{padding:30px 48px 44px}' +
  '.contact{font:13px/2 Helvetica,Arial,sans-serif;margin-bottom:4px}.cl{font:700 10px Helvetica,Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;margin-right:6px;color:#4b5468}' +
  '.meta{font:12px/1.8 Helvetica,Arial,sans-serif;color:#333;border-top:2px solid #14161c;border-bottom:1px solid #14161c;padding:9px 0;margin:14px 0 22px}' +
  '.sec{margin:0 0 20px}.slabel{font:700 11px Helvetica,Arial,sans-serif;letter-spacing:.16em;margin-bottom:8px}' +
  '.sbody{font-size:14px;line-height:1.65}.sbody p{margin:0 0 10px}' +
  '.brow{display:flex;align-items:center;gap:10px;margin-bottom:7px;font:11px Helvetica,Arial,sans-serif}.brow span{width:120px;letter-spacing:.06em;font-weight:700}' +
  '.brow .bar{flex:1;height:10px;border:1.5px solid #14161c}.brow .bar i{display:block;height:100%;background:#14161c}.brow em{font-style:normal;width:36px;text-align:right}' +
  '.kv{font-size:13px;margin:6px 0}.cols2{column-count:2;column-gap:30px}.cols2 .sec{break-inside:avoid;margin:0 0 18px}' +
  'ul.assoc{margin:0;padding-left:22px;font-size:13px;line-height:1.7}.foot{border-top:2px solid #14161c;margin-top:26px;padding-top:10px;font:11px Helvetica,Arial,sans-serif}' +
  '@media print{body{background:#fff;padding:0}.page{box-shadow:none;max-width:none}}' +
  '</style></head><body><div class="page"><div class="banner"><div class="seal">' + esc(initial) + '</div><div><div class="kicker">PERSONNEL DOSSIER</div><h1>' + esc(name) + '</h1>' +
  (aka ? '<div class="aka">also known as ' + esc(aka) + '</div>' : '') + '</div></div><div class="rule"></div><div class="body">' +
  (contact.length ? '<div class="contact">' + contact.join('<br>') + '</div>' : '') +
  '<div class="meta">Compiled ' + ds + (classif ? ' &nbsp;·&nbsp; ' + esc(classif) : '') + '</div>' +
  '<div class="sec"><div class="slabel">SYNOPSIS</div><div class="sbody">' + (bio ? '<p>' + esc(bio).replace(/\n/g, '<br>') + '</p>' : '<p>—</p>') + '</div></div>' +
  '<div class="cols2"><div class="sec"><div class="slabel">PROFILE RATINGS</div>' + bars + extras + '</div>' +
  '<div class="sec"><div class="slabel">KNOWN ASSOCIATES</div>' + (assoc ? '<ul class="assoc">' + assoc + '</ul>' : '<div class="sbody"><p>—</p></div>') + '</div>' +
  '<div class="sec"><div class="slabel">FIELD NOTES</div><div class="sbody">' + notes + '</div></div>' +
  '<div class="sec"><div class="slabel">TIMELINE</div><div class="sbody">' + tl + '</div></div></div>' +
  '<div class="foot">Compiled from the North Country Circle directory.</div></div></div></body></html>';
}
function personIsAka(e){ return pkey(e) === AKA_KEY; }

/* ============================================================
   8. views
   ============================================================ */
var S = {
  depth:0, route:{ name:'today', seg:[] }, ctx:null,
  today:{ i:0, surv:{}, dsel:{}, skipped:{}, lane:'', start:0, goal:10, fin:false },
  ppl:{ q:'', status:'all', tier:'all', rel:'', group:'', sort:'closest', limit:80 },
  prof:{ di:null, edit:{}, open:{}, evEdit:null, degEdit:null, skOpen:null, more:false },
  net:{ color:'tier', bg:false, sel:null, mode:(store('ncc_netmode') === '2d' ? '2d' : '3d') },
  fam:{ editing:null, focus:null, sheet:false },
  grp:{ kind:'groups', open:null, renaming:null }
};
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
function statusChip(di){
  var s = statusOf(di);
  return '<span class="st st-' + s + '">' + (s === 'checked' ? ic('check', 12) + 'Checked' : s === 'needs' ? 'Needs you' : 'Waiting') + '</span>';
}
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
  { k:'today',   l:'Today',   ic:'today' },
  { k:'people',  l:'People',  ic:'people' },
  { k:'network', l:'Network', ic:'network' },
  { k:'family',  l:'Family',  ic:'tree' },
  { k:'groups',  l:'Groups',  ic:'groups' }
];
function activeNav(){
  var n = S.route.name;
  if(n === 'profile') return S.ctx && S.ctx.from ? S.ctx.from : 'people';
  if(n === 'settings') return 'settings';
  return n;
}
function renderChrome(){
  var act = activeNav(), st = D ? getState() : null;
  var badge = st ? st.needs.length : 0;
  var items = NAV.map(function(n){
    return '<a href="#/' + n.k + '" class="nv' + (act === n.k ? ' on' : '') + '" data-nav="' + n.k + '">' + ic(n.ic, 20) + '<span>' + n.l + '</span>' +
      (n.k === 'today' && badge ? '<em>' + (badge > 999 ? '999+' : badge) + '</em>' : '') + '</a>';
  }).join('');
  $('#rail').innerHTML = '<a class="brand" href="#/today" aria-label="North Country Circle"><i></i><b>North Country Circle</b></a>' +
    '<div class="navlist">' + items + '</div>' +
    '<div class="railfoot"><a href="#/settings" class="nv' + (act === 'settings' ? ' on' : '') + '">' + ic('settings', 20) + '<span>Settings</span></a>' +
    '<small id="fresh">' + (D ? 'Data ' + esc(D.updated || '') : '') + '</small></div>';
  $('#tabs').innerHTML = items;
  var top = $('#top');
  var onProfile = S.route.name === 'profile';
  top.innerHTML =
    (onProfile ? '<button type="button" class="ib" data-act="back" aria-label="Back">' + ic('chevl', 20) + '</button>' : '<span class="logo-s"><i></i></span>') +
    '<div class="gsearch"><span class="gsi">' + ic('search', 16) + '</span><input id="gs" type="search" placeholder="Search people" autocomplete="off" aria-label="Search people" spellcheck="false"><kbd>/</kbd><div id="gsr" class="gsr" hidden></div></div>' +
    '<div class="topr"><button type="button" class="ib" id="undob" data-act="undo" aria-label="Undo" title="Undo (Ctrl+Z)">' + ic('undo', 18) + '</button>' +
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
  e._mt = [dispName(e), hasHandle(e) ? e.name : '', gv(e, 'specialty'), gv(e, 'companies'), gv(e, 'churches'), gv(e, 'universities'), gv(e, 'groups'), e.city || '', e.hometown || '',
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
      '<span><b>' + esc(dispName(e)) + '</b><small>' + esc(infoLine(e) || (hasHandle(e) ? '@' + e.name : '')) + '</small></span>' + statusChip(di) + '</button>';
  }).join('') + (hits.length ? '<button type="button" class="gsi-all" data-act="gsall">See all matches in People</button>' : '<div class="gsi-none">No one matches</div>');
  box.hidden = false;
}

/* ---------- router ---------- */
function parseRoute(){
  var h = location.hash.replace(/^#\/?/, ''), qs = '';
  var qi = h.indexOf('?'); if(qi >= 0){ qs = h.slice(qi + 1); h = h.slice(0, qi); }
  var seg = h.split('/').filter(Boolean).map(function(x){ try{ return decodeURIComponent(x); }catch(e){ return x; } });
  var name = seg[0] || 'today';
  if(name === 'p') name = 'profile';
  if(['today','people','profile','network','family','groups','settings'].indexOf(name) < 0) name = 'today';
  return { name:name, seg:seg.slice(1), qs:qs };
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
  else go(fallback || 'today', { replace:true });
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
  try{
    renderChrome();
    if(n === 'today') viewToday(v);
    else if(n === 'people') viewPeople(v);
    else if(n === 'profile') viewProfile(v);
    else if(n === 'network') viewNetwork(v);
    else if(n === 'family') viewFamily(v);
    else if(n === 'groups') viewGroups(v);
    else if(n === 'settings') viewSettings(v);
  }catch(err){
    v.innerHTML = '<div class="empty"><h3>Something broke on this screen</h3><p>' + esc(String(err && err.message || err)) + '</p><p><a href="#/today" class="btn">Go to Today</a></p></div>';
    if(window.console) console.error(err);
  }
  previewFx(n);
}
function afterWrite(di){
  /* chrome badge + any list that depends on status; never re-render a view the user is typing in */
  var st = getState();
  $$('.nv[data-nav="today"]').forEach(function(a){
    var em = $('em', a);
    if(!st.needs.length){ if(em) em.remove(); return; }
    if(!em){ em = document.createElement('em'); a.appendChild(em); }
    em.textContent = st.needs.length > 999 ? '999+' : st.needs.length;
  });
  paintUndo();
}
window.__nccChanged = function(di){
  afterWrite(di);
  if(di === -1 && !typing() && $('#sheetwrap').hidden) render();
};

/* ============================================================
   Today — the work. Queue by reason on the left, one actionable card on the right.
   ============================================================ */
/* ============================================================
   Today — two levels. HOME says in plain words what is waiting and lets you start a short
   session. A LANE shows one person at a time, with a clear "Done" and a count of how far you are.
   ============================================================ */
var LANES = [
  { k:'needs',    t:'Your next people',     d:'Everyone who needs you, most important first.', ic:'today',   h:'#d6e2ff', home:false },
  { k:'dup',      t:'Possible duplicates',  d:'These might be the same person twice. Pick the two that match and merge them, or say they are different people.', ic:'merge', h:'#b7a1e6' },
  { k:'identity', t:'Who is this?',         d:'Not enough on file to be sure who they are. Add a place, school, job or link, or say nothing more exists.', ic:'user', h:'#86a0d8' },
  { k:'unsrc',    t:'Needs a source',       d:'Web details with no link behind them. Add where they came from, or remove them.', ic:'link', h:'#d6a8e6' },
  { k:'family',   t:'Family links',         d:'Family links that do not line up, like two spouses or a link that only goes one way.', ic:'tree', h:'#e0a35a' },
  { k:'fresh',    t:'New this week',        d:'Just showed up in your network. Tap a tier and how you know them.', ic:'sparkle', h:'#c7d5f6' },
  { k:'cleanup',  t:'Cleanup',              d:'Incomplete names, business-looking names, and profiles you flagged.', ic:'edit', h:'#98a2b6' },
  { k:'inner',    t:'Close circle gaps',    d:'Vetted and associate people who still have detail missing.', ic:'star', h:'#9fb8ea' },
  { k:'spot',     t:'Spot check',           d:'A few finished profiles picked at random this week. Confirm they are still right.', ic:'eye', h:'#7fb5d6' },
  { k:'sweep',    t:'Quick once-over',      d:'No flags at all. Skim and confirm. Lowest priority.', ic:'shield', h:'#6f7a93' }
];
function laneDef(k){ return LANES.filter(function(l){ return l.k === k; })[0]; }
var SESSION_SIZE = 10;

function ringHTML(frac, size, stroke){
  var r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return '<svg class="ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">' +
    '<defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d6e2ff"/><stop offset="1" stop-color="#6d8fe0"/></linearGradient></defs>' +
    '<circle class="ring-bg" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-width="' + stroke + '"/>' +
    '<circle class="ring-fg" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-width="' + stroke + '" stroke-dasharray="' + c + '" stroke-dashoffset="' + c + '" data-off="' + (c * (1 - Math.max(0.004, Math.min(1, frac)))) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/></svg>';
}
function viewToday(v){
  var lane = S.route.seg[0] || '';
  if(lane && !laneDef(lane)) lane = '';
  if(!lane) return viewTodayHome(v);
  return viewLane(v, lane);
}
function viewTodayHome(v){
  var st = getState(), needs = st.needs.length, wait = st.sweep.length, done = st.checkedN, tot = st.total || 1;
  var pct = Math.round(done / tot * 1000) / 10;
  var lanes = LANES.filter(function(l){ return l.k !== 'needs' && l.k !== 'sweep'; });
  var counts = {}, max = 1;
  lanes.concat([laneDef('sweep')]).forEach(function(l){ counts[l.k] = tabCount(l.k); if(counts[l.k] > max) max = counts[l.k]; });
  var live = lanes.filter(function(l){ return counts[l.k] > 0; }), clear = lanes.filter(function(l){ return counts[l.k] === 0; });
  function card(l, quiet, i){
    return '<a href="#/today/' + l.k + '" class="lane' + (quiet ? ' quiet' : '') + '" data-act="lane" data-lane="' + l.k + '" style="--h:' + l.h + ';--i:' + i + '">' +
      '<span class="lane-ic">' + ic(l.ic, 20) + '</span>' +
      '<span class="lane-n cu" data-n="' + counts[l.k] + '">' + counts[l.k] + '</span>' +
      '<b class="lane-t">' + esc(l.t) + '</b><span class="lane-d">' + esc(l.d) + '</span>' +
      '<span class="lane-bar"><i style="width:' + Math.max(4, counts[l.k] / max * 100) + '%"></i></span>' +
      '<span class="lane-go">Start ' + ic('arrow', 14) + '</span></a>';
  }
  var head;
  if(!needs && !wait){
    head = '<div class="hhead"><h1 class="display">All caught up</h1><p class="sub">Everyone is marked done. New people and a weekly spot check will show up here.</p></div>';
  } else {
    head = '<div class="hhead"><h1 class="display">Today</h1><p class="sub"><b class="cu" data-n="' + needs + '">' + needs + '</b> ' + (needs === 1 ? 'person needs' : 'people need') + ' a look. Work through them ' + SESSION_SIZE + ' at a time, most important first. ' +
      (wait ? '<b class="cu" data-n="' + wait + '">' + wait + '</b> more have no flags and only need a quick once-over.' : '') + '</p>' +
      (needs ? '<div class="row"><a class="btn primary lg" href="#/today/needs" data-act="lane" data-lane="needs">Start the next ' + Math.min(SESSION_SIZE, needs) + ' ' + ic('arrow', 16) + '</a></div>' : '') + '</div>';
  }
  v.innerHTML = '<div class="page todayhome"><section class="thero">' + head +
    '<div class="tring" title="' + done + ' of ' + st.total + ' done">' + ringHTML(done / tot, 148, 10) +
    '<div class="tring-c"><b><span class="cu" data-n="' + done + '">' + done + '</span></b><small>of ' + st.total + ' done</small></div></div></section>' +
    (live.length ? '<h2 class="sect">Or pick a kind of work</h2><div class="lanes">' + live.map(function(l, i){ return card(l, false, i); }).join('') + (counts.sweep ? card(laneDef('sweep'), true, live.length) : '') + '</div>'
      : (counts.sweep ? '<h2 class="sect">Lowest priority</h2><div class="lanes">' + card(laneDef('sweep'), true, 0) + '</div>' : '')) +
    (clear.length && live.length ? '<p class="clearline">' + ic('check', 14) + 'Nothing waiting in: ' + clear.map(function(l){ return esc(l.t); }).join(', ') + '.</p>' : '') + '</div>';
}
function startSession(lane){
  var n = tabCount(lane);
  S.today.lane = lane; S.today.i = 0; S.today.start = n; S.today.goal = Math.min(SESSION_SIZE, n); S.today.fin = false;
}
function viewLane(v, lane){
  var def = laneDef(lane), q = queueFor(lane);
  if(S.today.lane !== lane) startSession(lane);
  if(S.today.i >= q.length) S.today.i = Math.max(0, q.length - 1);
  v.innerHTML = '<div class="page lanepage"><div class="lhead"><a class="backlink" href="#/today" data-act="lanehome">' + ic('chevl', 16) + 'Today</a>' +
    '<h1 class="display">' + esc(def.t) + '</h1><p class="sub">' + esc(def.d) + '</p><div class="sess" id="sess"></div></div>' +
    '<div class="focus"><section class="qcard" id="qcard"></section><aside class="upnext" id="qlist"></aside></div></div>';
  paintQueue(lane);
}
function sessMeter(q){
  var el = $('#sess'); if(!el) return;
  var handled = Math.max(0, S.today.start - q.length), goal = Math.max(1, S.today.goal), shown = Math.min(handled, goal);
  el.innerHTML = '<div class="sbar"><i style="width:' + Math.min(100, shown / goal * 100) + '%"></i></div>' +
    '<small><b>' + shown + '</b> of ' + goal + ' this session' + ' · ' + q.length + ' left here</small>';
}
function paintQueue(tab){
  var q = queueFor(tab), list = $('#qlist'), card = $('#qcard');
  if(!list || !card) return;
  var i = S.today.i = Math.max(0, Math.min(q.length - 1, S.today.i));
  var handled = Math.max(0, S.today.start - q.length);
  if(!S.today.fin && S.today.goal > 0 && handled >= S.today.goal && q.length > 0) S.today.fin = true;
  sessMeter(q);
  var def = laneDef(tab) || laneDef('needs');
  if(!q.length){
    list.innerHTML = '';
    card.innerHTML = '<div class="done-card"><div class="done-ic">' + ic('check', 30) + '</div><h2>' + (handled ? 'Lane clear' : 'Nothing here') + '</h2><p>' + (handled ? 'You handled ' + handled + ' in this lane. Nice and tidy.' : 'There is nothing in this lane right now.') + '</p>' +
      '<div class="row"><a class="btn primary" href="#/today" data-act="lanehome">Back to Today</a></div></div>';
    return;
  }
  if(S.today.fin){
    list.innerHTML = '';
    card.innerHTML = '<div class="done-card"><div class="done-ic">' + ic('check', 30) + '</div><h2>' + S.today.goal + ' done</h2><p>' + q.length + ' left in this lane. Keep going while you are on a roll, or stop here. Everything you did is already saved.</p>' +
      '<div class="row"><button type="button" class="btn primary lg" data-act="sessmore">Do ' + Math.min(SESSION_SIZE, q.length) + ' more</button><a class="btn ghost" href="#/today" data-act="lanehome">Back to Today</a></div></div>';
    return;
  }
  card.innerHTML = reviewCard(q[i], tab, i, q.length);
  var nxt = q.slice(i + 1, i + 6).map(function(x, k){
    var e = D.directory[x.di], r = tab === 'needs' || tab === 'sweep' ? x.reasons[0] : (x.reasons.filter(function(c){ return REASONS[c].tab === tab; })[0] || x.reasons[0]);
    return '<button type="button" class="qrow" data-act="qpick" data-i="' + (i + 1 + k) + '">' + avatar(e, 'sm') + '<span class="qn"><b>' + esc(dispName(e)) + '</b><small>' + esc(REASONS[r].l) + '</small></span></button>';
  }).join('');
  list.innerHTML = '<div class="qhead">Up next</div>' + (nxt || '<p class="dim pad">This is the last one.</p>') +
    '<button type="button" class="btn ghost sm wide" data-act="seeall">See all ' + q.length + ' in this lane</button>';
}
function openLaneList(){
  var tab = S.route.seg[0] || 'needs', q = queueFor(tab);
  openSheet('All ' + q.length + ' in this lane', '<div class="plist flat">' + q.slice(0, 400).map(function(x, k){
    var e = D.directory[x.di];
    return '<button type="button" class="prow" data-act="qpick" data-i="' + k + '">' + avatar(e, 'sm') + '<span class="pn"><b>' + esc(dispName(e)) + '</b><small>' + esc(REASONS[x.reasons[0]].l) + '</small></span></button>';
  }).join('') + (q.length > 400 ? '<p class="dim pad">Showing the first 400.</p>' : '') + '</div>', { focus:false });
}

function factsHTML(e){
  var rows = [];
  function row(icn, label, val){ if(val) rows.push('<div class="fact"><span>' + ic(icn, 14) + label + '</span><div>' + val + '</div></div>'); }
  row('pin', 'Lives in', e.city ? esc(e.city) : '');
  row('pin', 'From', e.hometown ? esc(e.hometown) : '');
  row('cap', 'School', degreesOf(e).slice(0, 2).map(function(d){ return esc(schoolShort(d.school) + (d.degree ? ' ' + d.degree : '') + (d.year ? ' ' + yy(d.year) : '')); }).join(', '));
  row('briefcase', 'Work', tagList(gv(e, 'companies')).map(esc).join(', '));
  row('church', 'Church', tagList(gv(e, 'churches')).map(esc).join(', '));
  var links = [];
  if(hasHandle(e)) links.push('<a href="' + igURL(e.name) + '" target="_blank" rel="noopener">Instagram ' + ic('ext', 11) + '</a>');
  if(e.fb_url) links.push('<a href="' + esc(e.fb_url) + '" target="_blank" rel="noopener">Facebook ' + ic('ext', 11) + '</a>');
  if(gv(e, 'phone')) links.push(esc(fmtPhone(String(gv(e, 'phone')).split(',')[0])));
  row('link', 'Reach', links.join(' <i class="sep"></i> '));
  var ks = knownSinceYear(e); row('calendar', 'Known since', ks ? String(ks) : '');
  var fp = footprintOf(e);
  if(fp.blocks.length){
    var tx = fp.blocks[0].text; if(tx.length > 240) tx = tx.slice(0, 240).trim() + '…';
    row('file', 'Web record', '<span class="conf ' + (fp.sourced ? 'ok' : fp.inferred ? 'inf' : 'no') + '">' + (fp.sourced ? 'Sourced' : fp.inferred ? 'Inferred' : 'No source') + '</span> ' + esc(tx));
  }
  var syn = gv(e, 'synopsis');
  if(syn){ var s2 = syn.length > 200 ? syn.slice(0, 200).trim() + '…' : syn; row('book', 'Synopsis', esc(s2)); }
  return rows.length ? '<div class="facts">' + rows.join('') + '</div>' : '<p class="dim">Nothing on file beyond the name.</p>';
}
function dupMemberLine(m){
  var me = D.directory[m];
  return [hasHandle(me) ? '@' + me.name : String(me.name).split(':')[0], tierName(me), me.city, isChecked(me) ? 'checked' : ''].filter(Boolean).join(' · ');
}
/* Selective merge: tap exactly two profiles in the group, then merge just
   those two. The rest of the group stays untouched and re-evaluates. */
function dupBlock(x, di){
  var e = D.directory[di], gs = x.detail.dup || [];
  if(!gs.length){
    return '<div class="rb"><h4>' + esc(REASONS.dup.l) + '</h4><p>This profile is flagged as a possible duplicate, but no matching name or face turned up. Merge it with the other entry by hand, or clear the flag.</p>' +
      '<div class="row"><button type="button" class="btn" data-act="mergeopen" data-di="' + di + '">' + ic('merge', 15) + 'Find the other profile and merge</button>' +
      '<button type="button" class="btn ghost" data-act="clearflag" data-di="' + di + '">Clear flag — not a duplicate</button></div></div>';
  }
  return gs.map(function(g, gi){
    var key = dupGroupKey(g.dis);
    var sel = (S.today.dsel[key] || []).filter(function(d){ return g.dis.indexOf(d) >= 0; });
    S.today.dsel[key] = sel;
    var gone = sel.length === 2 && pairDismissed(sel[0], sel[1]);
    var mems = g.dis.map(function(m){
      var me = D.directory[m], on = sel.indexOf(m) >= 0;
      return '<div class="dm pick' + (on ? ' on' : '') + (m === di ? ' me' : '') + '" role="button" tabindex="0" aria-pressed="' + (on ? 'true' : 'false') + '" data-act="dupsel" data-key="' + esc(key) + '" data-di="' + m + '">' +
        '<span class="dmc">' + (on ? ic('check', 13) : '') + '</span>' + avatar(me, 'sm') +
        '<span><b>' + esc(dispName(me)) + (m === di ? ' <em>this one</em>' : '') + '</b><small>' + esc(dupMemberLine(m)) + '</small></span>' +
        '<a href="#/p/' + encodeURIComponent(personId(me)) + '" class="dl" data-act="openp" data-di="' + m + '" title="Open profile">' + ic('ext', 14) + '</a></div>';
    }).join('');
    var hint = sel.length === 0 ? 'Tap two profiles that are the same person. Only those two merge — everyone else here keeps their own profile.'
      : sel.length === 1 ? 'One picked. Now tap the other profile of the same person.'
      : gone ? 'You marked these two as different people before, so they can\'t be merged. Unselect one and pick a different pair.'
      : 'Two picked. Merging combines their details into the one that stays. Nothing is deleted, and you can undo it.';
    var ready = sel.length === 2 && !gone;
    return '<div class="rb"><h4>' + esc(REASONS.dup.l) + ' <small>' + esc(g.label) + '</small></h4>' +
      '<p>Same person twice, or two different people who look alike? Twins and same-name people are common — nothing merges unless you pick two and confirm.</p>' +
      '<div class="dms">' + mems + '</div>' +
      '<p class="hint">' + hint + '</p>' +
      '<div class="row"><button type="button" class="btn primary" data-act="dupmerge" data-key="' + esc(key) + '" data-gi="' + gi + '"' + (ready ? '' : ' disabled') + '>' + ic('merge', 15) + 'Merge these two</button>' +
      '<button type="button" class="btn ghost" data-act="notdup2" data-key="' + esc(key) + '" data-gi="' + gi + '"' + (ready ? '' : ' disabled') + '>These two are different people</button></div></div>';
  }).join('');
}
function reasonBlocks(x, di, tab){
  var e = D.directory[di], out = [];
  var order = x.reasons.slice().sort(function(a, b){
    var ta = REASONS[a].tab === tab ? -1 : 0, tb = REASONS[b].tab === tab ? -1 : 0;
    return (ta - tb) || (REASONS[a].pr - REASONS[b].pr);
  });
  order.forEach(function(c){
    if(c === 'dup') out.push(dupBlock(x, di));
    else if(c === 'identity'){
      var sg = x.detail.identity || identitySignals(e);
      out.push('<div class="rb"><h4>' + esc(REASONS.identity.l) + ' <small>' + sg.n + ' of 2 signals</small></h4>' +
        '<p>Two independent signals beyond the name: place, school, work or church, contact, a connection to you, or a sourced web record. Fix it or waive it honestly.</p>' +
        '<div class="sigs">' + sg.have.map(function(s){ return '<span class="sig on">' + ic('check', 12) + esc(s) + '</span>'; }).join('') + sg.miss.map(function(s){ return '<span class="sig">' + esc(s) + '</span>'; }).join('') + '</div>' +
        '<div class="row"><button type="button" class="btn" data-act="openedit" data-di="' + di + '" data-sec="identity">Open profile to add detail</button>' +
        '<button type="button" class="btn ghost" data-act="waive" data-di="' + di + '" data-sid="identity">Waive — not enough data exists</button></div></div>');
    }
    else if(c === 'unsrc'){
      var fp = footprintOf(e);
      out.push('<div class="rb"><h4>' + esc(REASONS.unsrc.l) + '</h4><p>The web record has no source attached, so it reads as inferred. Source it, remove it, or accept it by marking this person checked.</p>' +
        '<div class="row"><button type="button" class="btn" data-act="openedit" data-di="' + di + '" data-sec="about">Open profile to add a source</button>' +
        '<button type="button" class="btn ghost" data-act="rmfootprint" data-di="' + di + '">Remove the unsourced text</button></div></div>');
    }
    else if(c === 'family'){
      out.push('<div class="rb"><h4>' + esc(REASONS.family.l) + '</h4><ul class="issues">' + (x.detail.family || []).map(function(s){ return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' +
        '<div class="row"><a class="btn" href="#/family" data-act="openfam" data-di="' + di + '">Open in Family</a>' +
        '<button type="button" class="btn ghost" data-act="openedit" data-di="' + di + '" data-sec="connections">Edit family links</button></div></div>');
    }
    else if(c === 'missing'){
      out.push('<div class="rb"><h4>' + esc(REASONS.missing.l) + '</h4><p>You flagged this profile as missing information.</p>' +
        '<div class="row"><button type="button" class="btn ghost" data-act="clearflag" data-di="' + di + '">Clear flag</button></div></div>');
    }
    else if(c === 'name'){
      out.push('<div class="rb"><h4>' + esc(REASONS.name.l) + '</h4><p>Names show as First Last. Handles never stand in for a name.</p>' +
        '<div class="row two"><input data-nm="first_name" data-di="' + di + '" value="' + esc(gv(e, 'first_name')) + '" placeholder="First name" autocomplete="off">' +
        '<input data-nm="last_name" data-di="' + di + '" value="' + esc(gv(e, 'last_name')) + '" placeholder="Last name" autocomplete="off"></div>' +
        '<p class="hint">Each field saves on its own when you tap out of it.</p></div>');
    }
    else if(c === 'biz'){
      out.push('<div class="rb"><h4>' + esc(REASONS.biz.l) + '</h4><p>The name reads like a business or an address rather than a person.</p>' +
        '<div class="row"><button type="button" class="btn danger" data-act="delperson" data-di="' + di + '">' + ic('trash', 15) + 'Remove from the circle</button></div></div>');
    }
    else if(c === 'fresh'){
      out.push('<div class="rb"><h4>' + esc(REASONS.fresh.l) + '</h4><p>Showed up in the graph in the last week and has no tier or relationship yet. Classify below.</p></div>');
    }
    else if(c === 'inner'){
      var gaps = x.detail.inner || [];
      out.push('<div class="rb"><h4>' + esc(REASONS.inner.l) + (gaps.length ? ' <small>' + gaps.length + ' gap' + (gaps.length === 1 ? '' : 's') + '</small>' : '') + '</h4>' +
        '<p>' + (gaps.length ? 'Inner circle gets full detail. Tap a gap to fill it, or waive it as insufficient data.' : 'Detail is complete for this tier.') + '</p>' +
        (gaps.length ? '<div class="sigs">' + gaps.map(function(g){ return '<button type="button" class="sig btnsig" data-act="openedit" data-di="' + di + '" data-sec="' + ({ onfile:'about', relationship:'relationship', background:'background', connections:'connections', timeline:'timeline' }[g.sid]) + '">' + esc(g.l) + '</button>'; }).join('') + '</div>' : '') + '</div>');
    }
    else if(c === 'spot'){
      out.push('<div class="rb"><h4>' + esc(REASONS.spot.l) + '</h4><p>Picked at random this week to keep the whole directory statistically re-verified. Is everything here still right?</p>' +
        '<div class="row"><button type="button" class="btn primary" data-act="spotok" data-di="' + di + '">' + ic('check', 15) + 'Still correct</button>' +
        '<button type="button" class="btn ghost" data-act="reopen" data-di="' + di + '">Reopen for a full check</button></div></div>');
    }
    else if(c === 'sweep'){
      out.push('<div class="rb quiet"><h4>' + esc(REASONS.sweep.l) + '</h4><p>No flags. This is the baseline once-over: identity, no foreign content, no duplicate, one sourced anchor fact. Then it is done.</p></div>');
    }
  });
  return out.join('');
}
function reviewCard(x, tab, i, n){
  var di = x.di, e = D.directory[di];
  var spot = x.kind === 'spot';
  var unclassified = !tierOf(e) || !gv(e, 'relationship');
  return '<article class="rc" data-di="' + di + '">' +
    '<header>' + avatar(e, 'lg') + '<div class="rh"><h2><a href="#/p/' + encodeURIComponent(personId(e)) + '" data-act="openp" data-di="' + di + '">' + esc(dispName(e)) + '</a></h2>' +
    '<p class="meta">' + esc([tierName(e), cap(gv(e, 'relationship')), cap(gv(e, 'context'))].filter(Boolean).join(' · ') || (hasHandle(e) ? '@' + e.name : 'Not classified yet')) + '</p></div>' +
    '<div class="rn">' + (i + 1) + ' of ' + n + '</div></header>' +
    '<div class="rbs">' + reasonBlocks(x, di, tab) + '</div>' +
    '<section class="rsec"><h5>What is on file</h5>' + factsHTML(e) + '</section>' +
    '<details class="rsec quick"' + (unclassified ? ' open' : '') + '><summary>' + (unclassified ? 'Set tier and relationship' : 'Change tier, relationship or momentum') + '</summary><p class="hint">Tap a value to set it. It saves right away, and you can change it any time.</p>' +
    '<div class="qk"><label>Tier</label>' + seg('tier', TIER_ORDER.map(function(t){ return [t, TIERS[t].n]; }), tierOf(e), ' data-di="' + di + '"') + '</div>' +
    '<div class="qk"><label>Relationship</label>' + seg('relationship', REL_OPTS, gv(e, 'relationship'), ' data-di="' + di + '"') + '</div>' +
    '<div class="qk"><label>Momentum</label>' + seg('momentum', [['-', 'Cooling'], ['0', 'Steady'], ['+', 'Warming']], momVal(e), ' data-di="' + di + '"') + '</div></details>' +
    '<footer class="rfoot"><button type="button" class="btn ghost" data-act="qskip">' + ic('skip', 15) + 'Skip for now</button>' +
    '<a class="btn ghost" href="#/p/' + encodeURIComponent(personId(e)) + '" data-act="openp" data-di="' + di + '">Open full profile</a><span class="sp"></span>' +
    (spot ? '' : '<button type="button" class="btn primary lg" data-act="check" data-di="' + di + '" data-adv="1">' + ic('check', 16) + 'Done, next person</button>') + '</footer>' +
    (spot ? '' : '<p class="hint foothint">Done takes them off your list and nothing is deleted. You can undo it right after.</p>') + '</article>';
}

/* ============================================================
   People — one list, one search, a few honest filters. No stat tiles, no pips, no fill bars.
   ============================================================ */
function peopleFiltered(){
  var f = S.ppl, pool = people();
  var dis = f.q.trim() ? searchPeople(f.q, 9999, pool) : pool.slice();
  var st = getState();
  dis = dis.filter(function(di){
    var e = D.directory[di];
    if(f.status !== 'all'){ var s = statusOf(di); if(s !== f.status) return false; }
    if(f.tier !== 'all'){ var t = tierOf(e); if(f.tier === 'none' ? !!t : t !== f.tier) return false; }
    if(f.rel && e.relation !== f.rel) return false;
    if(f.group && personGroups(e).indexOf(f.group) < 0) return false;
    return true;
  });
  if(!f.q.trim() || f.sort !== 'closest'){
    if(f.sort === 'name') dis.sort(function(a, b){ return dispName(D.directory[a]).localeCompare(dispName(D.directory[b])); });
    else if(f.sort === 'recent') dis.sort(function(a, b){ return (Date.parse(raw(D.directory[b], 'updated_at')) || 0) - (Date.parse(raw(D.directory[a], 'updated_at')) || 0); });
    else if(f.sort === 'tier') dis.sort(function(a, b){
      var ta = TIER_RANK[tierOf(D.directory[a])], tb = TIER_RANK[tierOf(D.directory[b])];
      ta = ta == null ? 3 : ta; tb = tb == null ? 3 : tb;
      return ta - tb || (D.directory[b].strength || 0) - (D.directory[a].strength || 0);
    });
    else dis.sort(function(a, b){ return (D.directory[b].strength || 0) - (D.directory[a].strength || 0); });
  }
  return dis;
}
function prow(di, i){
  var e = D.directory[di], s = statusOf(di), x = getState().by[di];
  var why = s === 'needs' && x && x.reasons.length ? '<span class="why">' + esc(REASONS[x.reasons[0]].s) + '</span>' : '';
  return '<button type="button" class="prow" data-act="popen" data-di="' + di + '" data-i="' + i + '">' + avatar(e, 'md') +
    '<span class="pn"><b>' + esc(dispName(e)) + '</b><small>' + esc(infoLine(e) || (hasHandle(e) ? '@' + e.name : '')) + '</small></span>' + why +
    '<span class="stm st-' + s + '" title="' + (s === 'checked' ? 'Checked' : s === 'needs' ? 'Needs you' : 'Waiting') + '">' + (s === 'checked' ? ic('check', 14) : '<i></i>') + '</span></button>';
}
function viewPeople(v){
  var f = S.ppl, groups = Object.keys(allGroups()).sort();
  function chips(key, opts, cur){
    return '<div class="chips" role="group">' + opts.map(function(o){
      return '<button type="button" class="fc' + (cur === o[0] ? ' on' : '') + '" data-act="pf" data-k="' + key + '" data-v="' + o[0] + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  v.innerHTML = '<div class="page people"><div class="pagehead"><div><h1 class="display">People</h1><p class="sub" id="pcount"></p></div></div>' +
    '<div class="toolbar"><label class="field"><span>' + ic('search', 16) + '</span><input id="pq" type="search" placeholder="Filter by name, school, employer, skill" value="' + esc(f.q) + '" autocomplete="off"></label>' +
    chips('status', [['all', 'Everyone'], ['needs', 'Needs you'], ['waiting', 'Waiting'], ['checked', 'Checked']], f.status) +
    chips('tier', [['all', 'Any tier'], ['vetted', 'Vetted'], ['associate', 'Associate'], ['open', 'Open'], ['none', 'Untiered']], f.tier) +
    '<div class="tool-r"><select id="psort" aria-label="Sort">' + [['closest', 'Closest first'], ['name', 'A to Z'], ['tier', 'By tier'], ['recent', 'Recently edited']].map(function(o){ return '<option value="' + o[0] + '"' + (f.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
    '<button type="button" class="btn ghost sm" data-act="morefilters">' + ic('filter', 14) + 'More' + ((f.rel || f.group) ? ' <em>' + ((f.rel ? 1 : 0) + (f.group ? 1 : 0)) + '</em>' : '') + '</button></div></div>' +
    '<div class="plist" id="plist"></div></div>';
  paintPeople();
}
function paintPeople(){
  var box = $('#plist'); if(!box) return;
  var dis = peopleFiltered(), f = S.ppl;
  S.ppl.cur = dis;
  var shown = dis.slice(0, f.limit);
  box.innerHTML = shown.map(function(di, i){ return prow(di, i); }).join('') +
    (dis.length > shown.length ? '<button type="button" class="btn ghost more" data-act="pmore">Show ' + Math.min(100, dis.length - shown.length) + ' more (' + (dis.length - shown.length) + ' left)</button>' : '') +
    (!dis.length ? emptyState('No one matches.', 'Loosen a filter or clear the search.') : '');
  var c = $('#pcount'); if(c) c.textContent = dis.length === getState().total ? dis.length + ' people' : dis.length + ' of ' + getState().total + ' people';
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

/* ============================================================
   Profile — a page that opens up. Sections show a digest first; empty sections fold into one "Add" row.
   Edit is per section, in place; no global edit mode.
   ============================================================ */
function isInner(e){ var t = tierOf(e); return t === 'vetted' || t === 'associate'; }
var SECS = [
  { id:'identity',    t:'Contact',        col:'b', ord:1, w:['identity'] },
  { id:'relationship',t:'Relationship',   col:'b', ord:2, w:['relationship'] },
  { id:'about',       t:'About',          col:'a', ord:3, w:['onfile'] },
  { id:'background',  t:'Background',     col:'b', ord:4, w:['background', 'education'] },
  { id:'connections', t:'Connections',    col:'a', ord:5, w:['connections'] },
  { id:'timeline',    t:'Timeline',       col:'a', ord:6, w:['timeline'] },
  { id:'files',       t:'Files',          col:'b', ord:7, w:['files'] },
  { id:'persona',     t:'Persona',        col:'b', ord:8, w:['ratings'] }
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
    '<section id="p-hero" class="hero"></section><section id="p-banner"></section>' +
    '<div class="pgrid"><div class="pcol" id="pc-a"></div><div class="pcol" id="pc-b"></div></div><div id="p-add"></div></div>';
  paintProfile(di);
}
function paintProfile(di){
  var e = D.directory[di];
  $('#p-hero').innerHTML = heroHTML(di);
  $('#p-banner').innerHTML = bannerHTML(di);
  ['a', 'b'].forEach(function(col){
    $('#pc-' + col).innerHTML = SECS.filter(function(s){ return s.col === col && secShown(e, s.id); }).map(function(s){ return secHTML(di, s.id); }).join('');
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
  $('#p-banner').innerHTML = bannerHTML(di);
}

function heroHTML(di){
  var e = D.directory[di], sub = [cap(gv(e, 'relationship')), cap(gv(e, 'context')), knownSinceYear(e) ? 'Known since ' + knownSinceYear(e) : '', e.city].filter(Boolean).join(' · ');
  var ds = sortDegrees(degreesOf(e)).slice(0, 3).map(function(d){
    var bits = [d.degree, d.year ? yy(d.year) : ''].filter(Boolean).join(' ');
    return '<span class="dbadge">' + ic('cap', 12) + '<b>' + esc(schoolShort(d.school)) + '</b>' + (bits ? '<i>' + esc(bits) + '</i>' : '') + '</span>';
  }).join('');
  var cs = certsOf(e).slice(0, 2).map(function(c){ return '<span class="dbadge cert">' + ic('shield', 12) + '<i>' + esc(c) + '</i></span>'; }).join('');
  return avatar(e, 'xl') + '<div class="hmain"><h1 class="display" data-act="secedit" data-sec="identity" title="Tap to edit the name">' + esc(dispName(e)) + '<span class="hcue">' + ic('edit', 15) + '</span></h1>' +
    '<p class="hsub">' + esc(sub || (hasHandle(e) ? '@' + e.name : 'Not yet classified')) + '</p>' +
    ((ds || cs) ? '<div class="dbadges">' + ds + cs + '</div>' : '') + '</div>' +
    '<div class="hctl"><div class="qk"><label>Tier</label>' + seg('tier', TIER_ORDER.map(function(t){ return [t, TIERS[t].n]; }), tierOf(e), ' data-di="' + di + '"') + '</div>' +
    '<div class="qk"><label>Momentum</label>' + seg('momentum', [['-', MOM_ICONS['-'] + ' Cooling'], ['0', 'Steady'], ['+', '+ Warming']], momVal(e), ' data-di="' + di + '"') + '</div></div>';
}
function bannerHTML(di){
  var e = D.directory[di], x = getState().by[di];
  if(!x) return '';
  if(x.checked){
    var spot = x.kind === 'spot';
    return '<div class="banner ok"><span class="bi">' + ic('check', 18) + '</span><div><b>Checked</b><small>' + (spot ? 'Picked for this week’s spot check.' : 'Done at its tier. Empty fields are fine.') + '</small></div>' +
      '<span class="sp"></span>' + (spot ? '<button type="button" class="btn" data-act="spotok" data-di="' + di + '">Still correct</button>' : '') +
      '<button type="button" class="btn ghost" data-act="reopen" data-di="' + di + '">Not done — reopen</button></div>';
  }
  var real = x.reasons.filter(function(c){ return c !== 'sweep'; });
  /* one Done button per banner: it either finishes here or, when you arrived
     from a queue, moves you to the next person in it */
  var doneBtn = (S.ctx && S.ctx.keys)
    ? '<button type="button" class="btn primary" data-act="check" data-di="' + di + '" data-adv="1">' + ic('check', 15) + 'Done — next person</button>'
    : '<button type="button" class="btn primary" data-act="check" data-di="' + di + '">' + ic('check', 15) + 'Done — I\'ve checked this</button>';
  if(!real.length){
    return '<div class="banner"><span class="bi q">' + ic('shield', 18) + '</span><div><b>Waiting for the floor sweep</b><small>No flags. Checked once it clears identity, duplicates and one sourced anchor fact.</small></div><span class="sp"></span>' + doneBtn + '</div>';
  }
  var open = S.prof.bannerOpen !== false;
  return '<div class="banner needs"><div class="bh"><span class="bi">' + ic('shield', 18) + '</span><div><b>Needs you</b><small>' + real.map(function(c){ return esc(REASONS[c].l); }).join(' · ') + '</small></div><span class="sp"></span>' +
    '<button type="button" class="btn ghost sm" data-act="bantog">' + (open ? 'Hide' : 'Show') + ' details</button>' + doneBtn + '</div>' +
    (open ? '<div class="rbs">' + reasonBlocks(x, di, '') + '</div>' : '') + '</div>';
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
    if(hasHandle(e)) r('ig', 'Instagram', '<a class="iglink ' + (e.relation === 'mutual' ? 'mutual' : 'oneway') + '" href="' + igURL(e.name) + '" target="_blank" rel="noopener">@' + esc(e.name) + '</a>', e.relation ? RELN[e.relation] : '');
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
    if(ka.length) out3 += '<div class="sub-h' + (out3 ? '' : ' first') + '">Known associates <small>' + ka.length + ', always two-way</small></div><div class="chips ro">' + ka.slice(0, S.prof.open.assoc ? 999 : 18).map(function(nb){ return nbrChip(nb, false); }).join('') +
      (ka.length > 18 && !S.prof.open.assoc ? '<button type="button" class="vchip more" data-act="opentog" data-k="assoc">+' + (ka.length - 18) + ' more</button>' : '') + '</div>';
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
var NET = { nodes:[], cam:{ x:0, y:0, z:1 }, cv:null, ctx:null, W:0, H:0, dpr:1, raf:0, ptr:{}, pinch:0, moved:false, dirty:true, bg:null, byDi:{} };
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
  if(m === 'status') return STAT_C[statusOf(nd.di)] || '#4b5468';
  return tierOf(e) ? tierCol(e) : '#4b5468';
}
function viewNetwork(v){
  var m3 = S.net.mode !== '2d';
  var legend = S.net.color === 'relation' ? [['mutual', 'Mutual'], ['following', 'Following'], ['follower', 'Follower']].map(function(x){ return [RELC[x[0]], x[1]]; })
    : S.net.color === 'status' ? [[STAT_C.needs, 'Needs you'], [STAT_C.waiting, 'Waiting'], [STAT_C.checked, 'Done']]
    : TIER_ORDER.map(function(t){ return [TIERS[t].c, TIERS[t].n]; }).concat([['#4b5468', 'No tier yet']]);
  function sg(k, opts, cur){ return '<div class="seg">' + opts.map(function(o){ return '<button type="button" data-act="' + k + '" data-v="' + o[0] + '" class="' + (cur === o[0] ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</div>'; }
  v.innerHTML = '<div class="page netpage"><div class="netbar"><div><h1 class="display">Network</h1><p class="sub">' + (m3 ? 'Drag to turn it. Closest people sit in the middle; each shell is a tier. Tap a dot for details.' : 'Closest in the middle. Each ring is a tier. Tap a dot for details.') + '</p></div>' +
    '<div class="netctl">' + sg('netmode', [['3d', '3D'], ['2d', '2D']], m3 ? '3d' : '2d') + sg('netcolor', [['tier', 'Tier'], ['relation', 'Relation'], ['status', 'Status']], S.net.color) +
    '<button type="button" class="btn ghost sm' + (S.net.bg ? ' on' : '') + '" data-act="netbg" aria-pressed="' + !!S.net.bg + '">Show wider circle</button></div></div>' +
    '<div class="netwrap"><canvas id="netcv" aria-label="Connection map"></canvas>' +
    '<div class="netlegend">' + legend.map(function(l){ return '<span><i style="background:' + l[0] + '"></i>' + l[1] + '</span>'; }).join('') + '</div>' +
    '<div class="netzoom"><button type="button" class="ib" data-act="netzoom" data-d="1" aria-label="Zoom in">' + ic('plus', 18) + '</button><button type="button" class="ib" data-act="netzoom" data-d="-1" aria-label="Zoom out">' + ic('minus', 18) + '</button><button type="button" class="ib" data-act="netfit" aria-label="Reset view">' + ic('target', 18) + '</button></div>' +
    '<div class="netcard" id="netcard" hidden></div></div></div>';
  if(!NET.nodes.length || NET.stamp !== VER) { netBuild(); NET.stamp = VER; }
  NET.cv = $('#netcv'); NET.ctx = NET.cv.getContext('2d');
  netResize(); netFit();
  if(S.net.sel != null && NET.byDi[S.net.sel]){
    var nd = NET.byDi[S.net.sel];
    if(m3){ N3.yaw = -Math.atan2(nd.x3, nd.z3); N3.pitch = 0.25; N3.auto = false; }
    else { NET.cam.x = nd.x; NET.cam.y = nd.y; NET.cam.z = Math.max(NET.cam.z, 1.6); }
  }
  netCard();
  var cv = NET.cv; NET.ptr = {}; NET.pinch = 0;
  cv.addEventListener('pointerdown', function(ev){
    cv.setPointerCapture(ev.pointerId);
    NET.ptr[ev.pointerId] = { x:ev.clientX, y:ev.clientY }; NET.moved = false; N3.vy = 0; N3.vp = 0; N3.idle = 0;
    if(Object.keys(NET.ptr).length === 2) NET.pinch = netPinchDist();
  });
  cv.addEventListener('pointermove', function(ev){
    var p = NET.ptr[ev.pointerId];
    if(!p){ if(S.net.mode !== '2d'){ var r0 = cv.getBoundingClientRect(), h = net3Hit(ev.clientX - r0.left, ev.clientY - r0.top); var hd = h ? h.di : null; if(hd !== N3.hover){ N3.hover = hd; cv.style.cursor = h ? 'pointer' : 'grab'; } } return; }
    var ks = Object.keys(NET.ptr);
    if(ks.length === 1){
      var dx = ev.clientX - p.x, dy = ev.clientY - p.y;
      if(Math.abs(dx) + Math.abs(dy) > 3) NET.moved = true;
      if(S.net.mode === '2d'){ NET.cam.x -= dx / NET.cam.z; NET.cam.y -= dy / NET.cam.z; }
      else { N3.yaw += dx * 0.0062; N3.pitch = Math.max(-1.2, Math.min(1.2, N3.pitch + dy * 0.0062)); N3.vy = dx * 0.0062; N3.vp = dy * 0.0062; }
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
    var had = NET.ptr[ev.pointerId]; delete NET.ptr[ev.pointerId]; NET.pinch = 0;
    if(had && !NET.moved && Object.keys(NET.ptr).length === 0){
      var r = cv.getBoundingClientRect(), n = S.net.mode === '2d' ? netHit(ev.clientX - r.left, ev.clientY - r.top) : net3Hit(ev.clientX - r.left, ev.clientY - r.top);
      S.net.sel = n ? n.di : null; N3.auto = !n; netCard(); NET.dirty = true;
    }
  }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', function(ev){
    ev.preventDefault();
    if(S.net.mode !== '2d'){ N3.zoom = Math.max(0.45, Math.min(3.5, N3.zoom * Math.exp(-ev.deltaY * 0.0012))); return; }
    var z2 = Math.max(0.3, Math.min(4, NET.cam.z * Math.exp(-ev.deltaY * 0.0011)));
    var r = cv.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
    var wx = (mx - NET.W / 2) / NET.cam.z + NET.cam.x, wy = (my - NET.H / 2) / NET.cam.z + NET.cam.y;
    NET.cam.z = z2; NET.cam.x = wx - (mx - NET.W / 2) / z2; NET.cam.y = wy - (my - NET.H / 2) / z2; NET.dirty = true;
  }, { passive:false });
  cancelAnimationFrame(NET.raf);
  (function frame(ts){
    if(!document.body.contains(NET.cv) || document.body.getAttribute('data-view') !== 'network') return;
    if(S.net.mode === '2d'){ if(NET.dirty){ netDraw(); NET.dirty = false; } }
    else net3Draw(ts || 0);
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
    N3.yaw += N3.vy; N3.pitch = Math.max(-1.2, Math.min(1.2, N3.pitch + N3.vp)); N3.vy *= 0.94; N3.vp *= 0.94;
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
      ctx.strokeStyle = 'rgba(150,172,225,' + (pass ? 0.05 : 0.10 - i * 0.012) + ')'; ctx.lineWidth = 1; ctx.stroke();
    }
  });
  if(S.net.bg){
    if(!N3.bgPts){
      var ci = D.circle_index || [], pts = [];
      for(var i = 0; i < ci.length; i++){ var rng = mulberry32((i + 1) * 2246822519 % 2147483647), u = rng() * 2 - 1, th2 = rng() * 6.2832, rr = Math.sqrt(1 - u * u), rad = 760 + rng() * rng() * 1000; pts.push([Math.cos(th2) * rr * rad, u * rad * 0.82, Math.sin(th2) * rr * rad]); }
      N3.bgPts = pts;
    }
    ctx.fillStyle = 'rgba(150,165,200,.22)';
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
      var g = ctx.createLinearGradient(sp.x, sp.y, p.x, p.y); g.addColorStop(0, 'rgba(214,226,255,.75)'); g.addColorStop(1, 'rgba(214,226,255,.12)');
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
    if(isSel){ ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(p.x, p.y, rr + 4, 0, 6.2832); ctx.stroke(); }
  });
  if(!cDrawn) n3Center(ctx, c0);
  ctx.globalAlpha = 1;
  /* labels: selected and hovered only, so the sphere stays clean */
  [sel ? sel.di : null, N3.hover].forEach(function(di, i){
    if(di == null || (i === 1 && di === (sel && sel.di))) return;
    var p = proj[NET.nodes.indexOf(NET.byDi[di])]; if(!p) return;
    var nm = dispName(D.directory[di]); ctx.font = '600 12.5px Inter,sans-serif';
    var w = ctx.measureText(nm).width + 18, x = Math.max(6, Math.min(W - w - 6, p.x - w / 2)), y = p.y - 34;
    ctx.fillStyle = 'rgba(14,19,30,.9)'; ctx.strokeStyle = 'rgba(214,226,255,.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(x, y, w, 24, 12); else ctx.rect(x, y, w, 24); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8ecf5'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(nm, x + 9, y + 12.5);
  });
}
function n3Center(ctx, c){
  var s = Math.max(9, 17 * c.k * 2.2), g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, s * 3.2);
  g.addColorStop(0, 'rgba(230,238,255,.55)'); g.addColorStop(1, 'rgba(230,238,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, s * 3.2, 0, 6.2832); ctx.fill();
  var g2 = ctx.createRadialGradient(c.x - s * .3, c.y - s * .35, 1, c.x, c.y, s);
  g2.addColorStop(0, '#ffffff'); g2.addColorStop(1, '#a9bdf0');
  ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(c.x, c.y, s, 0, 6.2832); ctx.fill();
  ctx.fillStyle = '#0a0d14'; ctx.font = '700 ' + Math.round(s * 0.9) + 'px Inter,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('JD', c.x, c.y + 0.5);
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
function netFit(){ N3.zoom = 1; N3.pitch = 0.38; N3.auto = S.net.sel == null; NET.cam.x = 0; NET.cam.y = 0; NET.cam.z = Math.max(0.3, Math.min(1.4, Math.min(NET.W, NET.H) / (S.net.bg ? 1900 : 1450))); NET.dirty = true; }
function w2s(x, y){ return [(x - NET.cam.x) * NET.cam.z + NET.W / 2, (y - NET.cam.y) * NET.cam.z + NET.H / 2]; }
function netHit(sx, sy){
  var wx = (sx - NET.W / 2) / NET.cam.z + NET.cam.x, wy = (sy - NET.H / 2) / NET.cam.z + NET.cam.y, best = null, bd = 1e9, lim = Math.max(8, 16 / NET.cam.z);
  NET.nodes.forEach(function(n){ var d = Math.hypot(n.x - wx, n.y - wy); if(d < lim && d < bd){ bd = d; best = n; } });
  return best;
}
function netDraw(){
  var ctx = NET.ctx, z = NET.cam.z;
  ctx.setTransform(NET.dpr, 0, 0, NET.dpr, 0, 0); ctx.clearRect(0, 0, NET.W, NET.H);
  var c = w2s(0, 0);
  [170, 310, 490, 640].forEach(function(r, i){
    ctx.strokeStyle = 'rgba(160,175,205,' + (0.10 - i * 0.015) + ')'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(c[0], c[1], r * z, 0, 6.2832); ctx.stroke();
  });
  if(S.net.bg){
    if(!NET.bg){
      var ci = D.circle_index || [], dots = [];
      for(var i = 0; i < ci.length; i++){ var rng = mulberry32((i + 1) * 2246822519 % 2147483647), ang = rng() * 6.2832, rad = 720 + rng() * rng() * 1100; dots.push([Math.cos(ang) * rad, Math.sin(ang) * rad]); }
      NET.bg = dots;
    }
    ctx.fillStyle = 'rgba(150,160,185,.2)';
    NET.bg.forEach(function(d){ var p = w2s(d[0], d[1]); if(p[0] > -3 && p[1] > -3 && p[0] < NET.W + 3 && p[1] < NET.H + 3) ctx.fillRect(p[0], p[1], 1.5, 1.5); });
  }
  var sel = S.net.sel != null ? NET.byDi[S.net.sel] : null;
  if(sel){
    var se = D.directory[sel.di], a = w2s(sel.x, sel.y);
    ctx.strokeStyle = 'rgba(214,226,255,.35)'; ctx.lineWidth = 1;
    knownAssociates(se).forEach(function(nb){
      var t = BYN[(nb.u || '').toLowerCase()], nd = t != null ? NET.byDi[t] : null; if(!nd) return;
      var b = w2s(nd.x, nd.y); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    });
  }
  var fade = !!sel, hot = {};
  if(sel) knownAssociates(D.directory[sel.di]).forEach(function(nb){ var t = BYN[(nb.u || '').toLowerCase()]; if(t != null) hot[t] = 1; });
  NET.nodes.forEach(function(n){
    var p = w2s(n.x, n.y); if(p[0] < -10 || p[1] < -10 || p[0] > NET.W + 10 || p[1] > NET.H + 10) return;
    var rr = n.r * Math.sqrt(z), col = netColor(n), isSel = sel && sel.di === n.di;
    ctx.globalAlpha = fade && !isSel && !hot[n.di] ? 0.28 : 1;
    if(n.nw){ ctx.fillStyle = hexA(col, 0.18); ctx.beginPath(); ctx.arc(p[0], p[1], rr + 5, 0, 6.2832); ctx.fill(); }
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p[0], p[1], rr, 0, 6.2832); ctx.fill();
    if(isSel){ ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(p[0], p[1], rr + 3.5, 0, 6.2832); ctx.stroke(); }
  });
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#e8ecf5'; ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(7, 10 * Math.sqrt(z)), 0, 6.2832); ctx.fill();
  ctx.fillStyle = '#0a0d14'; ctx.font = '700 ' + Math.max(8, 10 * Math.sqrt(z)) + 'px Inter,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('JD', c[0], c[1] + 0.5);
}
function netCard(){
  var box = $('#netcard'); if(!box) return;
  var di = S.net.sel;
  if(di == null || !D.directory[di]){ box.hidden = true; box.innerHTML = ''; return; }
  var e = D.directory[di], ka = knownAssociates(e).length, inFam = !!famDisplay()[di];
  box.hidden = false;
  box.innerHTML = '<div class="nc-h">' + avatar(e, 'md') + '<div><b>' + esc(dispName(e)) + '</b><small>' + esc(infoLine(e) || (hasHandle(e) ? '@' + e.name : '')) + '</small></div>' + statusChip(di) +
    '<button type="button" class="ib" data-act="netclose" aria-label="Close">' + ic('x', 16) + '</button></div>' +
    '<div class="nc-f"><span>' + ka + ' known associate' + (ka === 1 ? '' : 's') + (RELN[e.relation] ? ' · ' + RELN[e.relation] : '') + '</span><span class="sp"></span>' +
    (inFam ? '<button type="button" class="btn ghost sm" data-act="openfam" data-di="' + di + '">Family</button>' : '') +
    '<button type="button" class="btn primary sm" data-act="popen1" data-di="' + di + '">Open profile</button></div>';
}

/* ============================================================
   Family space — bloodline trees on one pannable canvas. The model code is unchanged; the camera is
   a plain transform with drag momentum, pinch and wheel zoom, and a glide to the focused person.
   ============================================================ */
var FAMV = { cam:{ x:0, y:0, z:1 }, vel:{ x:0, y:0 }, ptr:{}, pinch:0, moved:false, raf:0, lay:null, pos:{}, glide:null, el:null };
function viewFamily(v){
  var disp = famDisplay(), ft = famTrees(disp), lay = famSpaceLayout(disp, ft);
  FAMV.lay = lay; FAMV.pos = {};
  lay.clusters.forEach(function(c){
    c.model.nodes.forEach(function(n){ if(c.tree.blood[n.di] || !FAMV.pos[n.di]) FAMV.pos[n.di] = { x:c.ox + n.x + DFT.NW / 2, y:c.oy + n.y + DFT.CY, tree:c.tree.id }; });
  });
  if(!lay.clusters.length){ v.innerHTML = '<div class="page">' + emptyState('No family trees yet.', 'Add a parent, spouse, child or sibling from a profile and the tree appears here.') + '</div>'; return; }
  var svg = '<svg class="flines" width="' + lay.W + '" height="' + lay.H + '" viewBox="0 0 ' + lay.W + ' ' + lay.H + '">';
  lay.clusters.forEach(function(c){
    c.model.lines.forEach(function(l){ svg += '<line x1="' + (c.ox + l.x1) + '" y1="' + (c.oy + l.y1) + '" x2="' + (c.ox + l.x2) + '" y2="' + (c.oy + l.y2) + '"/>'; });
  });
  lay.links.forEach(function(l){ svg += '<path class="xlink" d="M' + l.x1 + ' ' + l.y1 + ' C' + l.x1 + ' ' + (l.y1 + 120) + ' ' + l.x2 + ' ' + (l.y2 - 120) + ' ' + l.x2 + ' ' + l.y2 + '"/>'; });
  svg += '</svg>';
  var html = '';
  lay.clusters.forEach(function(c){
    html += '<div class="ftitle" style="left:' + c.ox + 'px;top:' + c.labelY + 'px">' + esc(c.tree.title) + ' <small>' + c.tree.members.length + '</small></div>';
    c.model.nodes.forEach(function(n){
      var e = D.directory[n.di], st = c.model.styleOf(n.di), foc = S.fam.focus === n.di;
      html += '<button type="button" class="fn' + (foc ? ' foc' : '') + '" data-act="fnode" data-di="' + n.di + '" style="left:' + (c.ox + n.x) + 'px;top:' + (c.oy + n.y) + 'px;--fc:' + st.c + '"><span class="fc">' + esc(famInitials(dispName(e))) + '</span><b>' + esc(dispName(e)) + '</b><small>' + esc(st.cap) + '</small></button>';
    });
  });
  v.innerHTML = '<div class="page fampage"><div class="netbar"><div><h1 class="display">Family</h1><p class="sub">' + lay.trees.length + ' bloodline' + (lay.trees.length === 1 ? '' : 's') + '. Married-in spouses also appear in their own tree.</p></div></div>' +
    '<div class="fspace" id="fspace"><div class="fworld" id="fworld" style="width:' + lay.W + 'px;height:' + lay.H + 'px">' + svg + html + '</div>' +
    '<div class="netzoom"><button type="button" class="ib" data-act="famzoom" data-d="1" aria-label="Zoom in">' + ic('plus', 18) + '</button><button type="button" class="ib" data-act="famzoom" data-d="-1" aria-label="Zoom out">' + ic('minus', 18) + '</button><button type="button" class="ib" data-act="famfit" aria-label="Fit all">' + ic('target', 18) + '</button></div>' +
    '<div class="netcard" id="famcard" hidden></div></div></div>';
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
}
function famPinchDist(){ var k = Object.keys(FAMV.ptr).map(function(i){ return FAMV.ptr[i]; }); return k.length < 2 ? 0 : Math.hypot(k[0].x - k[1].x, k[0].y - k[1].y); }
function famApply(){
  var w = $('#fworld'), el = FAMV.el; if(!w || !el) return;
  var r = el.getBoundingClientRect(), z = FAMV.cam.z;
  w.style.transform = 'translate(' + (r.width / 2 - FAMV.cam.x * z) + 'px,' + (r.height / 2 - FAMV.cam.y * z) + 'px) scale(' + z + ')';
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
   The review queue lives on Today. Shortcuts are listed, not configurable.
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
    '<section class="card"><header><h3>On this device</h3></header><div class="cbody"><p class="dim">Two review states live only in this browser: duplicate pairs you marked as different people, and this week’s spot checks.</p>' +
    '<div class="row"><button type="button" class="btn ghost sm" data-act="rstlocal">Reset them</button></div></div></section>' +
    '<section class="card"><header><h3>Keyboard</h3></header><div class="cbody"><div class="keys"><kbd>/</kbd><span>Search</span><kbd>J</kbd><kbd>K</kbd><span>Next or previous in the queue</span><kbd>C</kbd><span>Mark checked</span><kbd>Esc</kbd><span>Close or go back</span><kbd>Ctrl Z</kbd><span>Undo</span></div></div></section></div>';
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
    return '<label class="dm' + (di === MG.surv ? ' on' : '') + '"><input type="radio" name="msv" data-act="msv" data-di="' + di + '"' + (di === MG.surv ? ' checked' : '') + '>' + avatar(e, 'sm') + '<span><b>' + esc(dispName(e)) + '</b><small>' + esc([hasHandle(e) ? '@' + e.name : '', tierName(e), e.city].filter(Boolean).join(' · ')) + '</small></span></label>';
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
var DMG = { a:null, b:null, surv:null };
function openDupMerge(a, b){
  DMG = { a:a, b:b, surv: mergeRichness(D.directory[b]) > mergeRichness(D.directory[a]) ? b : a };
  openSheet('Merge these two', dupMergeBody());
}
function dupMergeBody(){
  var loser = DMG.surv === DMG.a ? DMG.b : DMG.a, L = D.directory[loser], Sv = D.directory[DMG.surv];
  var pv = mergePreview(loser, DMG.surv), lines = [];
  if(pv.filled.length) lines.push('Fills in blanks on ' + dispName(Sv) + ': ' + pv.filled.join(', '));
  if(pv.union.length) lines.push('Combines lists: ' + pv.union.join(', '));
  if(pv.appended.length) lines.push('Adds text: ' + pv.appended.join(', '));
  if(pv.carried.length) lines.push('Carries over: ' + pv.carried.join(', '));
  return '<p class="dim">Which profile stays? The one with more on file is picked for you — tap the other one if you want it to stay instead.</p><div class="dms">' +
    [DMG.a, DMG.b].map(function(di){
      var e = D.directory[di];
      return '<label class="dm' + (di === DMG.surv ? ' on' : '') + '"><input type="radio" name="dsv" data-act="dmsv" data-di="' + di + '"' + (di === DMG.surv ? ' checked' : '') + '>' + avatar(e, 'sm') + '<span><b>' + esc(dispName(e)) + '</b><small>' + esc(dupMemberLine(di)) + '</small></span></label>';
    }).join('') + '</div>' +
    '<div class="rb quiet"><h4>What happens</h4><p>Their details combine into <b>' + esc(dispName(Sv)) + '</b>. Nothing is deleted; <b>' + esc(dispName(L)) + '</b> stops showing as its own profile. You can undo this, or restore ' + esc(dispName(L)) + ' later in Settings.</p>' +
    (lines.length ? '<ul class="issues">' + lines.map(function(l){ return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' : '<p>Nothing extra to carry over.</p>') + '</div>' +
    '<div class="row end"><button type="button" class="btn ghost" data-act="sheetx">Cancel</button><button type="button" class="btn primary" data-act="dupgo">Merge into ' + esc(dispName(Sv)) + '</button></div>';
}
function refreshDupMerge(){ var b = $('#sheetwrap .sbody'); if(b) b.innerHTML = dupMergeBody(); }
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
   9. events — one delegated click handler, one input/change handler, one key handler
   ============================================================ */
function curDi(el){
  var d = el && el.getAttribute && el.getAttribute('data-di');
  if(d != null && d !== '') return +d;
  return S.route.name === 'profile' ? S.prof.di : null;
}
function curTab(){ return S.route.seg[0] || 'needs'; }
function refreshAfterStatus(){
  var n = S.route.name;
  if(n === 'today'){ if(S.route.seg[0]) paintQueue(curTab()); else viewToday($('#view')); }
  else if(n === 'profile') repaintTop();
  afterWrite();
}
function todayCtx(di){
  if(S.route.name !== 'today') return null;
  var tab = curTab(), q = queueFor(tab), i = 0;
  q.forEach(function(x, k){ if(x.di === di) i = k; });
  return ctxFrom((TABS.filter(function(t){ return t.k === tab; })[0] || {}).l || 'Queue', q.map(function(x){ return x.di; }), i, 'today');
}
function nextInCtx(di){
  if(!S.ctx) return false;
  var k = pkey(D.directory[di]), i = S.ctx.keys.indexOf(k);
  for(var j = i + 1; j < S.ctx.keys.length; j++){
    var ni = PK2I[S.ctx.keys[j]];
    if(ni != null && liveEntry(D.directory[ni]) && !isChecked(D.directory[ni])){ ctxGo(ni, j); return true; }
  }
  return false;
}
function ctxGo(di, j){
  S.ctx.i = j; S.prof = { di:di, edit:{}, open:{}, evEdit:null, degEdit:null, skOpen:null, more:false };
  history.replaceState({ d:S.depth }, '', '#/p/' + encodeURIComponent(personId(D.directory[di]))); render(); window.scrollTo(0, 0); var vw = $('#view'); if(vw) vw.scrollTop = 0;
}
function markChecked(di, adv){
  var e = D.directory[di]; if(!e) return;
  var wasProfile = S.route.name === 'profile';
  txn('Mark ' + dispName(e) + ' checked', function(){ queuePatch(di, { audit:'audited' }); });
  toast(dispName(e) + ' marked done.', { undo:true });
  if(wasProfile && adv){ if(!nextInCtx(di)){ if(S.ctx && S.ctx.from === 'today') back('today'); else repaintTop(); } return; }
  /* calm pass 2026-10-13: no exit slide — the next person simply replaces this one */
  refreshAfterStatus();
}
function doSet(el){
  var di = curDi(el), k = el.getAttribute('data-k'), v = el.getAttribute('data-v'), e = D.directory[di];
  if(!e) return;
  var cur = String(k === 'tier' ? tierOf(e) : gv(e, k));
  var clearable = ['relationship', 'context', 'category'].indexOf(k) >= 0;
  var next = (clearable && cur === v) ? '' : v;
  txn('Set ' + k, function(){ queuePatch(di, (function(){ var o = {}; o[k] = next; return o; })()); });
  if(S.route.name === 'today') paintQueue(curTab());
  else if(S.route.name === 'profile'){ repaintTop(); var sec = el.getAttribute('data-sec'); if(sec) repaintSec(sec); }
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
    case 'undo': doUndo(); refreshAfterUndo(); break;
    case 'redo': doRedo(); refreshAfterUndo(); break;
    case 'retry': OUT.retry = 0; OUT.err = ''; outKick(); paintSync(); break;
    case 'back': back(); break;
    case 'set': doSet(el); break;
    case 'kspick': setField(S.prof.di, 'years_known', el.getAttribute('data-y')); repaintSec('relationship'); break;
    case 'check': markChecked(di, el.getAttribute('data-adv') === '1'); break;
    case 'reopen': txn('Reopen', function(){ queuePatch(di, { audit:'' }); }); toast('Reopened.', { undo:true }); refreshAfterStatus(); break;
    case 'spotok': markSpotDone(di); toast('Spot check recorded.'); if(S.route.name === 'profile') repaintTop(); else refreshAfterStatus(); afterWrite(); break;
    case 'qpick': closeSheet(); S.today.i = +el.getAttribute('data-i'); paintQueue(curTab()); if(innerWidth < 900){ var qc = $('#qcard'); if(qc) qc.scrollIntoView({ behavior:'smooth', block:'start' }); } break;
    case 'qskip': { var ql = queueFor(curTab()).length; S.today.i = ql ? (S.today.i + 1) % ql : 0; paintQueue(curTab()); break; }
    case 'lane': ev.preventDefault(); startSession(el.getAttribute('data-lane')); go('today/' + el.getAttribute('data-lane')); prevent = false; break;
    case 'lanehome': ev.preventDefault(); go('today'); prevent = false; break;
    case 'sessmore': S.today.start = tabCount(curTab()); S.today.goal = Math.min(SESSION_SIZE, S.today.start); S.today.fin = false; paintQueue(curTab()); break;
    case 'seeall': openLaneList(); break;
    case 'dupsel': {
      var dk = el.getAttribute('data-key'), dsel = (S.today.dsel[dk] || []).slice(), dix = dsel.indexOf(di);
      if(dix >= 0) dsel.splice(dix, 1);
      else if(dsel.length >= 2){ toast('Only two at a time — a merge combines exactly two profiles. Unselect one first.'); break; }
      else dsel.push(di);
      S.today.dsel[dk] = dsel; paintQueue(curTab()); break;
    }
    case 'dupmerge': {
      var q1 = queueFor(curTab())[S.today.i], g1 = q1 && (q1.detail.dup || [])[+el.getAttribute('data-gi')]; if(!g1) break;
      var s1 = (S.today.dsel[el.getAttribute('data-key')] || []).filter(function(d){ return g1.dis.indexOf(d) >= 0; });
      if(s1.length !== 2) break;
      openDupMerge(s1[0], s1[1]); break;
    }
    case 'notdup2': {
      var qd = queueFor(curTab())[S.today.i], gd = qd && (qd.detail.dup || [])[+el.getAttribute('data-gi')]; if(!gd) break;
      var sd = (S.today.dsel[el.getAttribute('data-key')] || []).filter(function(d){ return gd.dis.indexOf(d) >= 0; });
      if(sd.length !== 2) break;
      dismissDupPair(sd[0], sd[1]); S.today.dsel[el.getAttribute('data-key')] = [];
      toast(dispName(D.directory[sd[0]]) + ' and ' + dispName(D.directory[sd[1]]) + ' marked as different people. They won\'t be paired up again.');
      refreshAfterStatus(); break;
    }
    case 'dupgo': {
      var lo2 = DMG.surv === DMG.a ? DMG.b : DMG.a, sv2 = DMG.surv;
      var ln2 = dispName(D.directory[lo2]), sn2 = dispName(D.directory[sv2]);
      txn('Merge ' + ln2 + ' into ' + sn2, function(){ queuePatch(lo2, { merged_into:mergeTarget(sv2) }); });
      DMG = { a:null, b:null, surv:null };
      closeSheet(); toast('Merged ' + ln2 + ' into ' + sn2 + '.', { undo:true }); refreshAfterStatus(); break;
    }
    case 'mergeopen': openMergeSheet(di); break;
    case 'mpick': MG.b = di; MG.surv = null; mergeStep2(); break;
    case 'mergego': {
      var lo = MG.surv === MG.a ? MG.b : MG.a; mergeMany(MG.surv, [lo]); closeSheet();
      toast('Merged ' + dispName(D.directory[lo]) + ' into ' + dispName(D.directory[MG.surv]) + '.', { undo:true });
      if(S.route.name === 'profile'){ if(lo === S.prof.di){ openPerson(MG.surv, null, { }); } else { paintProfile(S.prof.di); } } else refreshAfterStatus();
      break;
    }
    case 'unmerge': unmerge(di); toast('Restored.', { undo:true }); viewSettings($('#view')); break;
    case 'clearflag': txn('Clear flag', function(){ queuePatch(di, { review_flag:'' }); }); refreshAfterStatus(); break;
    case 'waive': {
      var sids = (el.getAttribute('data-sid') || '').split(',').filter(Boolean), on = el.getAttribute('data-off') ? false : true;
      txn(on ? 'Waive section' : 'Restore section', function(){ setWaivers(di, sids, on); });
      if(S.route.name === 'profile'){ paintProfile(S.prof.di); } else refreshAfterStatus();
      break;
    }
    case 'rmfootprint': {
      var e0 = D.directory[di], keep = footprintOf(e0).blocks.filter(function(b){ return b.urls.length; });
      if(!confirm('Remove the web-record text that has no source?')) break;
      txn('Remove unsourced text', function(){ queuePatch(di, { public_footprint:keep.map(function(b){ return b.text + '\nSources: ' + b.urls.join('; '); }).join('\n\n') }); });
      refreshAfterStatus(); break;
    }
    case 'delperson': {
      var e1 = D.directory[di]; if(!e1) break;
      if(!confirm('Remove ' + dispName(e1) + ' from the circle?\n\nThey move to the Trash sheet and can be restored from there.')) break;
      txn('Remove ' + dispName(e1), function(){ queuePatch(di, { deleted:'1' }); });
      toast('Removed ' + dispName(e1) + '.', { undo:true });
      if(S.route.name === 'profile') back('people'); else refreshAfterStatus();
      break;
    }
    case 'openp': { ev.preventDefault(); openPerson(di, todayCtx(di), { keepCtx:S.route.name === 'profile' }); prevent = false; break; }
    case 'popen': { var cur = S.ppl.cur || []; openPerson(di, ctxFrom('People', cur, +el.getAttribute('data-i'), 'people')); break; }
    case 'popen1': openPerson(di, null); break;
    case 'gsopen': { var box = $('#gsr'); if(box) box.hidden = true; openPerson(di, null); break; }
    case 'gsall': { S.ppl.q = ($('#gs') || {}).value || ''; S.ppl.limit = 80; go('people'); break; }
    case 'openedit': openPerson(di, todayCtx(di) || (S.route.name === 'profile' ? S.ctx : null), { edit:el.getAttribute('data-sec'), keepCtx:true }); break;
    case 'openfam': S.fam.focus = di; go('family'); break;
    case 'shownet': S.net.sel = di; go('network'); break;
    case 'ctxstep': {
      var d = +el.getAttribute('data-d'), j = S.ctx.keys.indexOf(pkey(D.directory[S.prof.di])) + d, ni = PK2I[S.ctx.keys[j]];
      if(ni != null) ctxGo(ni, j); break;
    }
    /* people */
    case 'pf': S.ppl[el.getAttribute('data-k')] = el.getAttribute('data-v'); S.ppl.limit = 80; viewPeople($('#view')); break;
    case 'pf2': S.ppl[el.getAttribute('data-k')] = el.getAttribute('data-v'); S.ppl.limit = 80; openMoreFilters(); viewPeople($('#view')); break;
    case 'pmore': S.ppl.limit += 100; paintPeople(); break;
    case 'morefilters': openMoreFilters(); break;
    case 'pclear': S.ppl = { q:'', status:'all', tier:'all', rel:'', group:'', sort:'closest', limit:80 }; closeSheet(); viewPeople($('#view')); break;
    /* profile chrome */
    case 'menu': { var mp = $('.menu-pop', el.parentNode); var was = mp.hidden; $$('.menu-pop').forEach(function(m){ m.hidden = true; }); mp.hidden = !was; break; }
    case 'export': { try{ var blob = new Blob([buildDossierDoc(D.directory[di])], { type:'text/html' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Dossier - ' + (dispName(D.directory[di]).replace(/[\\/:*?"<>|]/g, '').trim() || 'person') + '.html'; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 4000); toast('Downloaded.'); }catch(x){ toast('Could not build the document.'); } $$('.menu-pop').forEach(function(m){ m.hidden = true; }); break; }
    case 'viewdoc': { try{ var u = URL.createObjectURL(new Blob([buildDossierDoc(D.directory[di])], { type:'text/html' })); window.open(u, '_blank', 'noopener'); setTimeout(function(){ URL.revokeObjectURL(u); }, 120000); }catch(x){ toast('Could not open the document.'); } $$('.menu-pop').forEach(function(m){ m.hidden = true; }); break; }
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
    case 'bantog': S.prof.bannerOpen = !(S.prof.bannerOpen !== false); repaintTop(); break;
    case 'opentog': { var kk = el.getAttribute('data-k'); S.prof.open[kk] = !S.prof.open[kk]; repaintSec(kk === 'ev' ? 'timeline' : 'connections'); break; }
    case 'secedit': { var sid = el.getAttribute('data-sec'); S.prof.edit[sid] = true; if($('#sec-' + sid)) repaintSec(sid); else paintProfile(S.prof.di); var sc = $('#sec-' + sid); if(sc) sc.scrollIntoView({ block:'nearest', behavior:'smooth' }); break; }
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
    case 'rstlocal': store('ncc_dupok', '{}'); store('ncc_spot', '{}'); VER++; toast('Reset.'); afterWrite(); break;
    default: prevent = false;
  }
  if(prevent && el.tagName === 'A' && act !== 'openp') ev.preventDefault();
}
function refreshAfterUndo(){
  var n = S.route.name;
  if(n === 'profile'){ if(D.directory[S.prof.di]) paintProfile(S.prof.di); }
  else if(n === 'today') { refreshAfterStatus(); }
  else if(n === 'people') paintPeople();
  else render();
  afterWrite();
}

function onInput(ev){
  var t = ev.target;
  if(t.id === 'gs'){ paintSearch(); return; }
  if(t.id === 'pq'){ S.ppl.q = t.value; S.ppl.limit = 80; paintPeople(); return; }
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
  if(t.id === 'psort'){ S.ppl.sort = t.value; paintPeople(); return; }
  if(t.id === 'setedit'){ store('ncc_edit_key', t.value.trim()); return; }
  if(act === 'waive' && t.type === 'checkbox'){
    var di = curDi(t), sids = t.getAttribute('data-sid').split(',');
    txn(t.checked ? 'Waive section' : 'Restore section', function(){ setWaivers(di, sids, t.checked); });
    paintProfile(S.prof.di); return;
  }
  if(act === 'dmsv'){ DMG.surv = +t.getAttribute('data-di'); refreshDupMerge(); return; }
  if(act === 'msv'){ MG.surv = +t.getAttribute('data-di'); mergeStep2(); return; }
  if(t.hasAttribute && t.hasAttribute('data-nm')){
    setField(+t.getAttribute('data-di'), t.getAttribute('data-nm'), t.value.trim());
    var e = D.directory[+t.getAttribute('data-di')]; if(e){ e.display = ''; }
    refreshAfterStatus(); return;
  }
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
function onKey(ev){
  var t = ev.target, tag = t.tagName, isField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  if(ev.key === 'Enter' && t.classList && t.classList.contains('tadd')){ ev.preventDefault(); addTag(t); return; }
  if((ev.key === 'Enter' || ev.key === ' ') && t.classList && t.classList.contains('dm') && t.classList.contains('pick')){ ev.preventDefault(); t.click(); return; }
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
    if(S.route.name === 'profile'){ var open = Object.keys(S.prof.edit); if(open.length){ S.prof.edit = {}; paintProfile(S.prof.di); } else back('people'); }
    return;
  }
  if(isField) return;
  var mod = ev.ctrlKey || ev.metaKey;
  if(mod && (ev.key === 'z' || ev.key === 'Z')){ ev.preventDefault(); if(ev.shiftKey) doRedo(); else doUndo(); refreshAfterUndo(); return; }
  if(mod && (ev.key === 'y' || ev.key === 'Y')){ ev.preventDefault(); doRedo(); refreshAfterUndo(); return; }
  if(mod && (ev.key === 'k' || ev.key === 'K')){ ev.preventDefault(); var g = $('#gs'); if(g) g.focus(); return; }
  if(mod || ev.altKey) return;
  if(ev.key === '/'){ ev.preventDefault(); var gs = $('#gs'); if(gs) gs.focus(); return; }
  if(S.route.name === 'today' && S.route.seg[0]){
    var ql = queueFor(curTab()).length;
    if(ev.key === 'j' && ql){ S.today.i = (S.today.i + 1) % ql; paintQueue(curTab()); }
    else if(ev.key === 'k' && ql){ S.today.i = (S.today.i - 1 + ql) % ql; paintQueue(curTab()); }
    else if(ev.key === 'c' && S.route.seg[0]){ var x = queueFor(curTab())[S.today.i]; if(x && x.kind !== 'spot') markChecked(x.di, true); }
  } else if(S.route.name === 'profile' && ev.key === 'c'){
    var xs = getState().by[S.prof.di]; if(xs && !xs.checked) markChecked(S.prof.di, true);
  }
}


/* ============================================================
   Presentation hooks. CALM PASS 2026-10-13: numbers and bars
   render at their final values, the progress ring is set in
   place instantly, and the loading skeleton is static. Nothing
   here writes data, touches the outbox, or changes any payload.
   ============================================================ */
function pvReducedMotion(){ return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
function skeletonHTML(note){
  var rows = '';
  for(var i = 0; i < 3; i++) rows += '<div class="skl-row"><span class="skl av"></span><span class="skl tx" style="width:' + (58 - i * 8) + '%"></span><span class="skl tx s" style="width:22%"></span></div>';
  return '<div class="page skel" aria-busy="true"><div class="skl head"></div>' + rows +
    '<div class="skl card"></div>' + (note ? '<p class="dim center">' + esc(note) + '</p>' : '') + '</div>';
}
function previewFx(n){
  if(n !== 'today' && n !== 'network') return;
  /* set the Today progress ring straight to its final value — no sweep */
  $$('.ring-fg').forEach(function(r){ r.style.strokeDashoffset = r.getAttribute('data-off'); });
}

/* ============================================================
   10. boot
   ============================================================ */
function boot(){
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
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
        history.replaceState({ d:0 }, '', location.hash || '#/today');
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
