/* Contacts Pro v6
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
/* App version — one number shared by both apps (Contacts Pro + explorer); scheme
   and changelog live in VERSION.md at the repo root. MAJOR = design era
   (3 = Clear glass), MINOR = feature batch, PATCH = fixes and small tweaks. */
var APP_VERSION = '3.39.0';

/* ---- Clear glass theme: mode x gradient scheme (V3.0.0) ----
   The boot script in the HTML head sets data-mode / data-scheme on
   <html> before first paint; this module renders the Theme section
   in the top bar and keeps it, the attributes and localStorage in
   sync. Keys: ncc_theme_mode / ncc_theme_scheme. */
var THEME_SCHEMES = ['bluegreen','slate'];
var THEME_NAMES = { bluegreen:'Blue / Green', slate:'Slate' };
function themeState(){
  var m = 'light', s = 'bluegreen';
  try {
    m = localStorage.getItem('ncc_theme_mode') === 'dark' ? 'dark' : 'light';
    s = localStorage.getItem('ncc_theme_scheme');
    if (THEME_SCHEMES.indexOf(s) < 0) s = 'bluegreen';
  } catch (e) {}
  return { mode: m, scheme: s };
}
function applyTheme(mode, scheme, save){
  var r = document.documentElement;
  r.classList.add('ncc-tfreeze');
  r.setAttribute('data-mode', mode);
  r.setAttribute('data-scheme', scheme);
  if (save !== false) {
    try { localStorage.setItem('ncc_theme_mode', mode); localStorage.setItem('ncc_theme_scheme', scheme); } catch (e) {}
  }
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', mode === 'dark' ? '#0a0e13' : '#e9eff4');
  paintTheme();
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ r.classList.remove('ncc-tfreeze'); }); });
}
function themeSecHTML(){
  var t = themeState();
  return '<button type="button" class="topen" data-topen aria-haspopup="dialog" aria-expanded="false" title="Theme: mode and gradient"><span class="tpdot" data-s="' + t.scheme + '"></span>Theme</button>';
}
function themePopHTML(){
  var t = themeState();
  var sws = THEME_SCHEMES.map(function(s){
    return '<button type="button" class="tpsw" data-tpscheme="' + s + '" data-s="' + s + '" aria-pressed="' + (t.scheme === s) + '"><span class="tpdot"></span><span class="tpn">' + THEME_NAMES[s] + '</span><span class="tpck" aria-hidden="true">✓</span></button>';
  }).join('');
  return '<div class="tpop-scrim" data-tpclose></div>' +
    '<div class="tpop-card" role="dialog" aria-modal="true" aria-label="Theme">' +
    '<div class="tpop-h"><span class="tpop-t">Theme</span><button type="button" class="tpop-x" data-tpclose aria-label="Close theme">×</button></div>' +
    '<div class="tpop-sub">Mode and gradient apply instantly and are remembered on this device.</div>' +
    '<div class="tpop-lab">Mode</div><div class="tpop-modes">' +
    '<button type="button" class="tpm" data-tpmode="light" aria-pressed="' + (t.mode === 'light') + '">Light</button>' +
    '<button type="button" class="tpm" data-tpmode="dark" aria-pressed="' + (t.mode === 'dark') + '">Dark</button></div>' +
    '<div class="tpop-lab">Gradient</div><div class="tpop-sws">' + sws + '</div></div>';
}
var TPOP_LAST = null;
function openThemePop(opener){
  var pop = document.getElementById('tpop');
  if (!pop) { pop = document.createElement('div'); pop.className = 'tpop'; pop.id = 'tpop'; document.body.appendChild(pop); }
  pop.innerHTML = themePopHTML();
  pop.hidden = false;
  TPOP_LAST = opener || document.querySelector('[data-topen]');
  var btn = document.querySelector('[data-topen]'); if (btn) btn.setAttribute('aria-expanded', 'true');
  var x = pop.querySelector('.tpop-x'); if (x) x.focus();
}
function closeThemePop(){
  var pop = document.getElementById('tpop');
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  var btn = document.querySelector('[data-topen]'); if (btn) btn.setAttribute('aria-expanded', 'false');
  if (TPOP_LAST && TPOP_LAST.focus) TPOP_LAST.focus();
  TPOP_LAST = null;
}
function paintTheme(){
  var t = themeState();
  var dot = document.querySelector('[data-topen] .tpdot');
  if (dot) dot.setAttribute('data-s', t.scheme);
  var modes = document.querySelectorAll('[data-tpmode]');
  for (var i = 0; i < modes.length; i++) modes[i].setAttribute('aria-pressed', String(modes[i].getAttribute('data-tpmode') === t.mode));
  var sws = document.querySelectorAll('[data-tpscheme]');
  for (var j = 0; j < sws.length; j++) sws[j].setAttribute('aria-pressed', String(sws[j].getAttribute('data-tpscheme') === t.scheme));
}
document.addEventListener('click', function(ev){
  var el = ev.target && ev.target.closest ? ev.target.closest('[data-topen],[data-tpmode],[data-tpscheme],[data-tpclose]') : null;
  if (!el) return;
  var t = themeState();
  if (el.hasAttribute('data-topen')) { openThemePop(el); return; }
  if (el.hasAttribute('data-tpclose')) { closeThemePop(); return; }
  if (el.hasAttribute('data-tpmode')) applyTheme(el.getAttribute('data-tpmode'), t.scheme);
  else if (el.hasAttribute('data-tpscheme')) applyTheme(t.mode, el.getAttribute('data-tpscheme'));
});
document.addEventListener('keydown', function(ev){
  if (ev.key !== 'Escape') return;
  var pop = document.getElementById('tpop');
  if (pop && !pop.hidden) { ev.stopPropagation(); closeThemePop(); }
});
/* Search dropdown: hovering a row moves the keyboard highlight to it,
   so mouse and arrows never point at different rows (UI arena 2026-10-29). */
document.addEventListener('mouseover', function(ev){
  var row = ev.target && ev.target.closest ? ev.target.closest('#gsr .gsi-row') : null;
  if(!row || row.classList.contains('on')) return;
  document.querySelectorAll('#gsr .gsi-row.on').forEach(function(r){ r.classList.remove('on'); });
  row.classList.add('on');
});

/* ---- Focus mode (V3.12.0) ----
   One global control hides the app chrome (rail, tabs, top bar) so
   the current view takes the whole window; Photos leans in further
   (edge-to-edge grid, chrome that auto-hides and returns on mouse
   move / tap — see phFocusChromeKick). Persisted like the theme
   keys: ncc_focus. The head boot script stamps data-focus on <html>
   before first paint; CSS keys off html[data-focus="1"]. Esc exits
   when no higher layer (pop, sheet, inspector) is open; a floating
   exit pill is always visible while focus is on. */
function focusOn(){ try { return localStorage.getItem('ncc_focus') === '1'; } catch (e) { return false; } }
function focusExitEl(){
  var x = document.getElementById('focusexit');
  if (!x) {
    x = document.createElement('button');
    x.type = 'button'; x.id = 'focusexit'; x.className = 'focusexit';
    x.innerHTML = ic('contract', 15) + '<span>Exit focus</span>';
    x.addEventListener('click', function(){ setFocus(false); });
    document.body.appendChild(x);
  }
  return x;
}
function applyFocus(on){
  document.documentElement.setAttribute('data-focus', on ? '1' : '0');
  var b = document.getElementById('focusb');
  if (b) { b.classList.toggle('on', !!on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  focusExitEl().hidden = !on;
}
function setFocus(on){
  try { localStorage.setItem('ncc_focus', on ? '1' : '0'); } catch (e) {}
  applyFocus(on);
  if (on && S.route && S.route.name === 'photos') phFocusChromeKick();
}
document.addEventListener('keydown', function(ev){
  if (ev.key !== 'Escape' || !focusOn()) return;
  if (document.querySelector('.phi-wrap, .phed-wrap, .ykb-wrap')) return;
  var sw = document.getElementById('sheetwrap');
  if (sw && !sw.hidden) return;
  var pop = document.getElementById('tpop');
  if (pop && !pop.hidden) return;
  setFocus(false);
});

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

/* one stroke family so every icon sits together */
var IC = {
  minus:'<path d="M5 12h14"/>', target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  expand:'<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  contract:'<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>',
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
  snap:'<path d="M12 3c-3 0-5 2.2-5 5.2V16l-1.7 2.4c-.3.4-.1.9.4 1l1.8.4c.3.1.5.3.5.6V21h1.9v-1.8l2.1 1.3 2.1-1.3V21H16v-.6c0-.3.2-.5.5-.6l1.8-.4c.5-.1.7-.6.4-1L17 16V8.2C17 5.2 15 3 12 3z"/><circle cx="9.7" cy="10" r=".4"/><circle cx="14.3" cy="10" r=".4"/>',
  sparkle:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  cap:'<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/><path d="M22 10v6"/>',
  pin:'<path d="M12 21s-7-5.4-7-11a7 7 0 0 1 14 0c0 5.6-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  briefcase:'<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  church:'<path d="M12 2v4M8 4h8"/><path d="M5 8 3 9v13h18V9l-2-1"/><path d="M9 22v-6h6v6"/>',
  award:'<circle cx="12" cy="8" r="6"/><path d="M15.5 13 17 22l-5-3-5 3 1.5-9"/>',
  help:'<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  home:'<path d="m3 11.5 9-8.5 9 8.5"/><path d="M5.5 10v10.5h13V10"/><path d="M9.8 20.5v-5.5h4.4v5.5"/>',
  skip:'<path d="m5 4 10 8-10 8zM19 5v14"/>',
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  star:'<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  book:'<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  camera:'<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>'
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
  { k:'churches',     label:'Churches',     ic:'church',    options:['Christian Fellowship Center','New Testament Church','Calvary Baptist'] },
  { k:'companies',    label:'Companies',    ic:'briefcase', options:['Rochester Regional Health','Clarkson University','Park Bros.'] },
  { k:'universities', label:'Universities', ic:'cap',       options:['Clarkson University','SUNY Potsdam','SUNY Canton','St. Lawrence University'] }
];
var SCHOOLS = {
  'Clarkson University':{ s:'Clarkson' }, 'SUNY Potsdam':{ s:'SUNY Potsdam' },
  'SUNY Canton':{ s:'SUNY Canton' }, 'St. Lawrence University':{ s:'SLU' }
};
/* ============================================================
   Canonical org/group registry (JD 2026-10-16)
   One alias -> canonical map covering churches / companies /
   universities / groups. Source of truth: the Sheet Settings key
   'org_registry', baked into dossier.json as D.org_registry by
   build_dossier_data.py (which normalizes baked values through it).
   In-app registrations (the Groups-view combine tool, genuinely new
   names typed into editors) are kept in a localStorage overlay
   (ncc_org_registry_v1 — the same durability pattern as GRP_EXTRA)
   and merged over the baked map; the profile rewrites themselves
   always go to the Sheet through the normal save path.
   regKey MUST mirror _reg_key in scripts/build_dossier_data.py.
   ============================================================ */
var ORGREG = { canon:{}, kinds:{}, aliases:{}, aliasDisp:{} };
function regKey(s){ return String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase().replace(/\.+$/, ''); }
function regOverlay(){ try{ return JSON.parse(store('ncc_org_registry_v1') || 'null') || {}; }catch(x){ return {}; } }
function regSaveOverlay(o){ store('ncc_org_registry_v1', JSON.stringify(o)); }
function regLoad(){
  ORGREG = { canon:{}, kinds:{}, aliases:{}, aliasDisp:{} };
  function eat(reg){
    if(!reg) return;
    Object.keys(reg.canonicals || {}).forEach(function(n){
      ORGREG.canon[regKey(n)] = n;
      ORGREG.kinds[regKey(n)] = (reg.canonicals[n] || {}).kinds || [];
    });
    Object.keys(reg.aliases || {}).forEach(function(a){
      ORGREG.aliases[regKey(a)] = reg.aliases[a];
      ORGREG.aliasDisp[regKey(a)] = a;
    });
  }
  eat(D && D.org_registry);
  eat(regOverlay());
  AUD_ORG_POOLS = null;
}
function regResolve(v){
  var k = regKey(v); if(!k) return null;
  if(ORGREG.canon[k]) return ORGREG.canon[k];
  return ORGREG.aliases[k] || null;
}
function regApply(v){ return regResolve(v) || v; }
function regCanonFor(kind){
  return Object.keys(ORGREG.kinds).filter(function(k){ return ORGREG.kinds[k].indexOf(kind) >= 0; }).map(function(k){ return ORGREG.canon[k]; });
}
function regAliasDisps(){
  return Object.keys(ORGREG.aliases).map(function(k){ return ORGREG.aliasDisp[k]; });
}
function regSugLabel(v){
  var r = regResolve(v);
  return (r && regKey(r) !== regKey(v)) ? v + ' \u2192 ' + r : v;
}
function regRegisterCanon(name, kind){
  name = String(name || '').trim(); if(!name) return;
  var o = regOverlay(); o.canonicals = o.canonicals || {}; o.aliases = o.aliases || {};
  var kinds = ((o.canonicals[name] || {}).kinds || ORGREG.kinds[regKey(name)] || []).slice();
  if(kind && kinds.indexOf(kind) < 0) kinds.push(kind);
  o.canonicals[name] = { kinds:kinds };
  regSaveOverlay(o); regLoad();
}
function regRegisterAlias(alias, canonical, kind){
  alias = String(alias || '').trim(); canonical = String(canonical || '').trim();
  if(!alias || !canonical || regKey(alias) === regKey(canonical)) return;
  var o = regOverlay(); o.canonicals = o.canonicals || {}; o.aliases = o.aliases || {};
  o.aliases[alias] = canonical;
  regSaveOverlay(o);
  regRegisterCanon(canonical, kind);
}
/* Org suggestions for one category: canonical names (data values
   resolved through the registry + the kind's registered canonicals)
   plus the alias spellings that resolve into this category, so an old
   variant typed into an editor surfaces as "Old Name -> Canonical". */
function ptOrgSug(catK){
  var base = ptSugList('org', catK), have = {};
  base.forEach(function(v){ have[v.toLowerCase()] = 1; });
  regAliasDisps().forEach(function(a){
    var r = regResolve(a);
    if(r && base.indexOf(r) >= 0 && !have[a.toLowerCase()]){ have[a.toLowerCase()] = 1; base.push(a); }
  });
  return base.sort(function(a, b){ return a.localeCompare(b); });
}

var DEGREE_TYPES = ['AA','AAS','AS','BA','BS','BFA','BBA','BTech','MA','MS','MBA','MEd','MPA','PhD','EdD','DPT','OTD','JD','MD','Certificate','Attended (no degree)','Other'];
var SKILL_TAXONOMY = [
  { cat:'Healthcare', skills:['Registered Nurse','Licensed Practical Nurse','Certified Nurse Aide','Nursing','Emergency Medical Technician','Emergency Medical Services','Physical Therapist','Occupational Therapist','Mental Health','Internal Medicine','Phlebotomy','Medical Assistant','Patient Experience','Patient Access','Healthcare Administration','Home Health Aide','Medical Technician'] },
  { cat:'Public Safety', skills:['Law Enforcement','Corrections','Security','Firefighter','Emergency Dispatcher','Border Patrol','Health and Safety'] },
  { cat:'Education', skills:['Teaching','Professor','Student Worker','Admissions','Tutor','Coach','Librarian','Mathematics','Interpreter'] },
  { cat:'Ministry', skills:['Pastor','Worship Leading'] },
  { cat:'Technology', skills:['Information Technology','Computer Science','Electrical Engineering','Civil Engineering','Mechanical Engineering','Environmental Engineering','Drones','Robotics'] },
  { cat:'Transportation', skills:['Airline Operations','Pilot','Taxi Driver','Truck Driver','Delivery Driver'] },
  { cat:'Food Service', skills:['Cook','Server','Bartender','Barista','Baking','Confectionery','Food Service'] },
  { cat:'Construction', skills:['Carpentry','Electrician','Plumber','HVAC','Welder','Mechanic','Construction'] },
  { cat:'Administration', skills:['Administration','Office Manager','Receptionist','Human Resources'] },
  { cat:'Business', skills:['Business Owner','Management','Marketing','Accounting','Banking','Real Estate','Finance','Insurance'] },
  { cat:'Sales', skills:['Retail','Car Sales','Sales'] },
  { cat:'Customer Service', skills:['Cashier','Front Desk'] },
  { cat:'Social Services', skills:['Social Work','Counselor','Case Manager','Childcare'] },
  { cat:'Agriculture', skills:['Farmer','Dairy Farmer','Farmhand','Veterinarian'] },
  { cat:'Creative Media', skills:['Photography','Videography','Content Creation','Graphic Design','Design','Writing'] },
  { cat:'Art', skills:['Art','Painting','Watercolor','Coloring','Quilting'] },
  { cat:'Music', skills:['Music','Singing','Guitar','Piano','Bass','Clarinet','Drums','Violin','Viola','Trumpet','Saxophone','Flute','Cello','Banjo','Ukulele','Harp','Choir','Songwriting','Music Production','DJ'] },
  { cat:'Military', skills:['42A','68W','Cavalry Scout'] },
  { cat:'Outdoors', skills:['Skiing','Golf','Running','Hiking','Horseback Riding','Ultimate Frisbee','Travel','Fishing','Hunting','Landscaping','Wrestling','Fitness'] }
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
var REL_OPTS = ['family','friend','coworker','military','client','professional','online','acquaintance','by association','other'];
var CTX_OPTS = ['work','professional','school','military','community','church','online','other'];
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
/* Military rank badge (JD 2026-10-22, V2.29.0; flag made subdued
   grayscale at JD's direction 2026-10-26): a small US flag + rank
   chip that follows anyone whose profile carries a rank (the Sheet's
   Rank column, baked as profile.rank — the 27th IBCT roster) everywhere
   their name renders. No rank, no chip: everyone else renders exactly
   as before. One helper (milBadge) + one CSS family (.milbadge). */
var MIL_FLAG = (function(){
  var s = '<svg class="milflag" viewBox="0 0 16 11" width="16" height="11" aria-hidden="true" focusable="false">' +
    '<rect width="16" height="11" fill="#cfcfc9"/>';
  for(var i = 0; i < 13; i += 2) s += '<rect y="' + (i * 11 / 13).toFixed(2) + '" width="16" height="' + (11 / 13).toFixed(2) + '" fill="#55565a"/>';
  s += '<rect width="7.4" height="' + (77 / 13).toFixed(2) + '" fill="#232326"/>';
  for(var r = 0; r < 5; r++) for(var c = 0; c < 4; c++)
    s += '<circle cx="' + (1.05 + c * 1.75).toFixed(2) + '" cy="' + (0.95 + r * 1.05).toFixed(2) + '" r="0.34" fill="#cfcfc9"/>';
  return s + '</svg>';
})();
function milRank(e){ var r = gv(e, 'rank'); return r ? r.trim().toUpperCase() : ''; }
function milBadge(e){
  var r = e ? milRank(e) : '';
  if(!r) return '';
  return '<span class="milbadge" title="Military rank: ' + esc(r) + '">' + MIL_FLAG + '<span class="milrank">' + esc(r) + '</span></span>';
}
function milBadgeName(name){
  var di = BYN[String(name || '').toLowerCase()];
  return di == null || !D.directory[di] ? '' : milBadge(D.directory[di]);
}
/* Rank seniority for the Groups sort-by-rank option (JD 2026-10-26):
   commissioned, then warrant, then enlisted; CSM over SGM and 1SG over
   MSG inside their grades. Lower index = more senior; unranked last. */
var MIL_RANK_ORDER = ['GEN','LTG','MG','BG','COL','LTC','MAJ','CPT','1LT','2LT','CDT','CW5','CW4','CW3','CW2','WO1','CSM','SGM','1SG','MSG','SFC','SSG','SGT','CPL','SPC','PFC','PV2','PVT'];
function milRankIdx(e){
  var r = milRank(e); if(!r) return 999;
  var i = MIL_RANK_ORDER.indexOf(r);
  return i < 0 ? 500 : i;
}
/* Branch rank lists + detection for the profile rank picker (JD
   2026-10-26): anyone in a military capacity gets a Rank dropdown on
   their profile, preloaded with the rank set of the branch they are
   marked under (their groups and orgs decide the branch). */
var MIL_RANKS = {
  ar: { label:'U.S. Army', ranks:['PVT','PV2','PFC','SPC','CPL','SGT','SSG','SFC','MSG','1SG','SGM','CSM','WO1','CW2','CW3','CW4','CW5','CDT','2LT','1LT','CPT','MAJ','LTC','COL','BG','MG','LTG','GEN'] },
  af: { label:'U.S. Air Force', ranks:['AB','Amn','A1C','SrA','SSgt','TSgt','MSgt','SMSgt','CMSgt','2d Lt','1st Lt','Capt','Maj','Lt Col','Col','Brig Gen','Maj Gen','Lt Gen','Gen'] },
  mc: { label:'U.S. Marine Corps', ranks:['Pvt','PFC','LCpl','Cpl','Sgt','SSgt','GySgt','MSgt','1stSgt','MGySgt','SgtMaj','WO','CWO2','CWO3','CWO4','CWO5','2ndLt','1stLt','Capt','Maj','LtCol','Col','BGen','MajGen','LtGen','Gen'] },
  nv: { label:'U.S. Navy', ranks:['SR','SA','SN','PO3','PO2','PO1','CPO','SCPO','MCPO','CWO2','CWO3','CWO4','CWO5','ENS','LTJG','LT','LCDR','CDR','CAPT','RDML','VADM','ADM'] },
  sf: { label:'U.S. Space Force', ranks:['Spc1','Spc2','Spc3','Spc4','Sgt','TSgt','MSgt','SMSgt','CMSgt','2d Lt','1st Lt','Capt','Maj','Lt Col','Col','Brig Gen','Maj Gen','Lt Gen','Gen'] },
  cg: { label:'U.S. Coast Guard', ranks:['SR','SA','SN','PO3','PO2','PO1','CPO','SCPO','MCPO','CWO2','CWO3','CWO4','ENS','LTJG','LT','LCDR','CDR','CAPT','RDML','VADM','ADM'] }
};
function milBranch(e){
  var hay = (personGroups(e) || []).concat(tagList(gv(e, 'companies')), tagList(gv(e, 'universities')), tagList(gv(e, 'churches'))).join(' ').toLowerCase();
  if(/space force/.test(hay)) return 'sf';
  if(/air force/.test(hay)) return 'af';
  if(/marine/.test(hay)) return 'mc';
  if(/coast guard/.test(hay)) return 'cg';
  if(/navy|naval/.test(hay)) return 'nv';
  if(/army|ibct|national guard/.test(hay)) return 'ar';
  return '';
}
function momVal(e){ var v = gv(e, 'momentum'); return (v === '-' || v === '+' || v === '0') ? v : ''; }
function knownSinceYear(e){
  var v = String(gv(e, 'years_known') || '').trim();
  if(!v) return 0;
  var n = parseInt(v, 10);
  if(n >= 1900 && n <= 2100) return n;
  if(n > 0 && n < 100) return new Date().getFullYear() - n;
  return 0;
}
var KS_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function ksParts(e){
  var v = String(gv(e, 'years_known') || '').trim();
  var m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(v);
  if(!m) return null;
  var y = +m[1]; if(y < 1900 || y > 2100) return null;
  var mo = m[2] ? +m[2] : 0, d = m[3] ? +m[3] : 0;
  if(mo > 12 || d > 31) return null;
  return { y:y, mo:mo, d:d };
}
function knownSinceLabel(e){
  var p = ksParts(e);
  if(p) return (p.mo ? KS_MONTHS[p.mo - 1] + (p.d ? ' ' + p.d + ', ' : ' ') : '') + p.y;
  var y = knownSinceYear(e); return y ? String(y) : '';
}
(function(){
  if(window.__kbdShift) return; window.__kbdShift = true;
  var set = function(on){ if(document.body) document.body.classList.toggle('kbd-shift', on); };
  document.addEventListener('keydown', function(ev){ if(ev.key === 'Shift') set(true); });
  /* Keyboard path for the Home activity band's clickable div rows
     (audit F23 pattern): focusable (tabindex=0); Enter/Space activates
     them like a click. Buttons and links keep their native path. */
  document.addEventListener('keydown', function(ev){
    if(ev.key !== 'Enter' && ev.key !== ' ') return;
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-act="hmgoto"]') : null;
    if(t && (t.tagName === 'BUTTON' || t.tagName === 'A')) t = null;
    if(!t) return;
    ev.preventDefault();
    t.dispatchEvent(new MouseEvent('click', { bubbles:true }));
  });
  document.addEventListener('keyup', function(ev){ if(ev.key === 'Shift') set(false); });
  window.addEventListener('blur', function(){ set(false); });
})();
function audXHTML(di){
  return '<button type="button" class="aud-x" data-act="auddel" data-di="' + di + '" title="Remove this person from the circle (Shift-click to skip the confirmation)" aria-label="Remove this person">' + ic('x', 13) + '</button>';
}
function liveEntry(e){ var p = e.profile || {}; return p.deleted !== '1' && p.audit !== 'trash' && !(p.merged_into || '').trim(); }
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
function isListed(e){ return liveEntry(e) && (e.has_graph !== false || (e.events || []).length || (e.files || []).length || !!e.record || !!(((e.profile || {}).display_name || e.display || '') + '').trim()); }
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
  var inferred = blocks.length > 0 && blocks.every(function(b){ return !b.urls.length && /^place association/i.test(b.text.replace(/^[•·\-*]\s*/, '')); });
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
var OUT = { items:[], busy:false, timer:null, retry:0, err:'', auth:false, kickedAt:0 };
/* Save Pool (V3.14.0): every queued change is a visible pool entry with a
   state (queued -> sending -> written to the Sheet, or stuck after repeated
   failures). POOL.log is the on-device journal of Sheet-confirmed writes:
   the endpoint answers per item only after the cell is written, so an ack
   means the value is hard-coded in the Sheet. The journal survives refresh
   so JD can see what actually landed, and a stuck item parks in the pool
   instead of silently wedging every change behind it. */
var POOL = { log:[], open:false };
var POOL_KEY = 'ncc_save_journal';
var POOL_MAX_TRIES = 5;
var POOL_TIMEOUT = 25000;
var OUT_KEY = 'ncc_outbox_v2';
var UNDO = { stack:[], redo:[], collect:null, suspend:false, lastKind:'' };

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
function poolLoad(){
  try{ POOL.log = JSON.parse(localStorage.getItem(POOL_KEY) || '[]'); if(!Array.isArray(POOL.log)) POOL.log = []; }catch(x){ POOL.log = []; }
  POOL.open = store('ncc_pool_open') === '1';
  if(POOL.open && document.body) document.body.classList.add('pool-open');
}
function poolSave(){ try{ localStorage.setItem(POOL_KEY, JSON.stringify(POOL.log.slice(0, 60))); }catch(x){} }
function poolName(id){ var di = (typeof diFromId === 'function') ? diFromId(id) : null; var e = (di != null && typeof D !== 'undefined' && D) ? D.directory[di] : null; return e ? dispName(e) : id; }
var POOL_LABELS = { companies:'Organizations', universities:'Universities', churches:'Churches', phone:'Phone', email:'Email', city:'Location', tier:'Tier', relationship:'Relationship', known_since:'Years Known', audit_dismissed:'Audit verdict', skills:'Skills', specialty:'Skills', groups:'Groups', council_staged:'Council decision', primary_photo:'Key photo', photo_order:'Photo order', photo_hidden:'Hidden photos', photo_review:'Photo review', photo_bad_reason:'Photo flag reason', display:'Name', display_name:'Name', first_name:'First name', last_name:'Last name', also_known_as:'Also known as', rank:'Rank', degrees:'Degrees', public_footprint:'Footprint', files:'Files', synopsis:'Synopsis', lima_charlie_notes:'Lima Charlie notes', merged_into:'Merged into', review_flag:'Review flag', last_contact:'Last known contact', last_contact_online:'Contact online', events:'Timeline' };
function poolFieldLabel(k){ return POOL_LABELS[k] || String(k).replace(/_/g, ' '); }
function poolValSummary(k, v){
  v = String(v == null ? '' : v);
  if(!v) return 'cleared';
  if(k === 'council_staged'){ try{ var q = JSON.parse(v); return q.length + ' decision' + (q.length === 1 ? '' : 's'); }catch(x){ return 'decision queue'; } }
  if(k === 'audit_dismissed') return 'dismissed: ' + v;
  return v.length > 40 ? v.slice(0, 40) + '\u2026' : v;
}
function poolNote(it){
  var srcv = it.sending || {};
  var fields = Object.keys(srcv);
  if(!fields.length) return;
  POOL.log.unshift({ t:Date.now(), id:it.id, name:poolName(it.id), fields:fields.map(function(k){ return { k:k, v:poolValSummary(k, srcv[k]) }; }) });
  if(POOL.log.length > 60) POOL.log.length = 60;
  poolSave();
}
function outStuck(){ return OUT.items.filter(function(it){ return it.stuck; }).length; }
function outFailItem(it, msg){
  it.patch = Object.assign({}, it.sending || {}, it.patch);
  it.sending = null;
  it.tries = (it.tries || 0) + 1;
  it.err = msg;
  if(it.tries >= POOL_MAX_TRIES && !it.stuck){
    it.stuck = msg;
    toast('A change for ' + poolName(it.id) + ' is stuck after ' + it.tries + ' tries. It is parked in the Save Pool. Everything else keeps saving.');
  }
}
function outPending(){ return OUT.items.filter(function(it){ return Object.keys(it.patch || {}).length || it.sending; }).length; }
/* Local-wins overlay (JD 2026-10-16): every value saved in the app is
   remembered here, keyed by profile + field, until a FRESH dataset
   (the baked snapshot at load, or a changes-feed row) actually shows
   it. The bake republishes only on the ~10-minute subject sync, and
   the outbox forgets a write once the endpoint acks it — without this
   overlay, a reload inside the lag window resurrected pre-save data:
   values flipped between saved and not saved and the Audit counts
   regressed. queuePatch (the one choke point for every write) notes
   each field here; the dataset intake points reconcile against it. */
var WINS = {}, WINS_KEY = 'ncc_local_wins', WINS_TTL = 7 * 24 * 3600 * 1000;
function winsLoad(){
  try{ WINS = JSON.parse(localStorage.getItem(WINS_KEY) || '{}') || {}; }catch(x){ WINS = {}; }
  if(!WINS || typeof WINS !== 'object' || Array.isArray(WINS)) WINS = {};
  winsPrune();
}
function winsSave(){ try{ localStorage.setItem(WINS_KEY, JSON.stringify(WINS)); }catch(x){} }
function winsPrune(){
  var cut = Date.now() - WINS_TTL, dirty = false;
  Object.keys(WINS).forEach(function(k){
    var f = WINS[k] || {};
    Object.keys(f).forEach(function(kk){ if(!f[kk] || !f[kk].t || f[kk].t < cut){ delete f[kk]; dirty = true; } });
    if(!Object.keys(f).length){ delete WINS[k]; dirty = true; }
  });
  if(dirty) winsSave();
}
function winsEq(a, b){ return String(a == null ? '' : a).trim().toLowerCase() === String(b == null ? '' : b).trim().toLowerCase(); }
function winsNote(key, patch){
  if(!key || !patch) return;
  var f = WINS[key] || (WINS[key] = {}), t = Date.now();
  Object.keys(patch).forEach(function(k){ f[k] = { v:patch[k], t:t }; });
  winsSave();
}
/* Re-apply one profile's surviving overlay fields over the live data. */
function winsApplyTo(di){
  var e = D && D.directory[di]; if(!e) return;
  var f = WINS[pkey(e)]; if(!f) return;
  var ch = null;
  Object.keys(f).forEach(function(k){ if(!winsEq((e.profile || {})[k], f[k].v)){ (ch = ch || {})[k] = f[k].v; } });
  if(ch) applyProfileEdit(e, ch);
}
function winsApplyAll(){ if(!D) return; Object.keys(WINS).forEach(function(k){ var di = PK2I[k]; if(di !== undefined) winsApplyTo(di); }); }
/* Retire the overlay fields a fresh dataset already shows.
   freshVal(pk, k) returns {found, val} read from the FRESH data,
   before any local re-application; profiles the fresh data does not
   cover must report found:false so their entries survive. */
function winsRetire(freshVal){
  var dirty = false;
  Object.keys(WINS).forEach(function(k){
    var f = WINS[k];
    Object.keys(f).forEach(function(kk){
      var r = freshVal(k, kk);
      if(r && r.found && winsEq(r.val, f[kk].v)){ delete f[kk]; dirty = true; }
    });
    if(!Object.keys(f).length){ delete WINS[k]; dirty = true; }
  });
  if(dirty) winsSave();
}
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
  winsNote(key, patch);
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
    UNDO.lastKind = 'txn';
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
  /* Undo honesty (UI arena 2026-10-29): if the newest change was a text
     edit, it is not on this stack — say so instead of popping an older,
     unrelated structural change. */
  if(UNDO.lastKind === 'text'){ UNDO.lastKind = ''; toast('That was a text edit. It is not on the undo stack — change it in the field.'); return; }
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
  UNDO.lastKind = 'text';
}
function outKick(){
  clearTimeout(OUT.timer);
  if(OUT.busy || OUT.auth) return;
  var batch = [];
  OUT.items.forEach(function(it){
    if(batch.length < 25 && !it.stuck && Object.keys(it.patch).length){ it.sending = it.patch; it.patch = {}; batch.push(it); }
  });
  if(!batch.length){ OUT.items = OUT.items.filter(function(it){ return Object.keys(it.patch).length || it.sending || it.stuck; }); outSave(); paintSync(); return; }
  if(!WEBAPP_URL){ batch.forEach(function(it){ it.patch = it.sending; it.sending = null; }); return; }
  OUT.busy = true; OUT.kickedAt = Date.now(); outSave(); paintSync();
  var ctrl = null, to = null;
  try{
    if(typeof AbortController !== 'undefined'){ ctrl = new AbortController(); to = setTimeout(function(){ try{ ctrl.abort(); }catch(x){} }, POOL_TIMEOUT); }
  }catch(x){ ctrl = null; to = null; }
  var opts = { method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' },
    body:JSON.stringify({ password:getPw(), kind:'batch', id:'batch', patch:{ items:batch.map(function(it){ return { id:it.id, patch:it.sending }; }) } }) };
  if(ctrl) opts.signal = ctrl.signal;
  fetch(WEBAPP_URL, opts).then(function(r){ return r.json(); }).then(function(res){
    if(to) clearTimeout(to);
    if(!res) throw new Error('empty response');
    var results = res.results || null;
    if(!res.ok && !results) throw new Error(res.error || 'unknown');
    var warn = [], made = [], failed = 0;
    batch.forEach(function(it, i){
      var r = results ? (results[i] || {}) : {};
      var itemOk = res.ok ? true : (r.ok === true);
      if(!itemOk){ failed++; outFailItem(it, r.error || res.error || 'rejected by the sheet'); return; }
      if(r.ignored && r.ignored.length) warn.push(r.ignored.join(', '));
      if(r.created) made.push(it.id);
      poolNote(it);
      it.tries = 0; it.stuck = ''; it.err = ''; it.sending = null;
    });
    OUT.busy = false;
    if(failed){ OUT.err = res.error || 'some changes were rejected'; if(/unauthorized/i.test(OUT.err)){ OUT.auth = true; askEditKey(); } }
    else { OUT.retry = 0; OUT.err = ''; }
    OUT.items = OUT.items.filter(function(it){ return Object.keys(it.patch).length || it.sending || it.stuck; });
    outSave(); paintSync();
    if(warn.length) toast('Some fields are not columns in the sheet and were skipped: ' + warn.join('; '));
    else if(made.length) toast('No sheet row matched ' + made[0] + '. A new row was created.');
    if(OUT.items.length) outKick();
  }).catch(function(err){
    if(to) clearTimeout(to);
    OUT.busy = false;
    var msg = (err && err.name === 'AbortError') ? 'timed out after 25s' : String(err && err.message || err);
    batch.forEach(function(it){ outFailItem(it, msg); });
    OUT.retry++; OUT.err = msg; outSave(); paintSync();
    if(/unauthorized/i.test(msg)){ OUT.auth = true; askEditKey(); return; }
    if(OUT.items.some(function(it){ return !it.stuck && Object.keys(it.patch).length; }))
      OUT.timer = setTimeout(outKick, Math.min(30000, 2000 * Math.pow(2, OUT.retry - 1)));
  });
}
addEventListener('online', function(){ OUT.retry = 0; outKick(); });
document.addEventListener('visibilitychange', function(){ if(!document.hidden && !OUT.auth){ OUT.retry = 0; outKick(); } });
addEventListener('storage', function(ev){ if(ev.key === OUT_KEY && !OUT.busy){ outLoad(); paintSync(); } });
/* watchdog: a send that somehow never settles unsticks itself, and a queue
   that somehow never got kicked gets kicked. Runs every 15s, costs nothing. */
setInterval(function(){
  if(OUT.auth) return;
  if(OUT.busy && OUT.kickedAt && Date.now() - OUT.kickedAt > 60000){ OUT.busy = false; OUT.err = 'a send stalled and was restarted'; outKick(); return; }
  if(!OUT.busy && OUT.items.some(function(it){ return !it.stuck && Object.keys(it.patch).length; }) && Date.now() - (OUT.kickedAt || 0) > 30000){ OUT.kickedAt = Date.now(); outKick(); }
}, 15000);
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
      var rowsByPk = {};
      (res.rows || []).forEach(function(row){ if(row && row.pkey) rowsByPk[row.pkey] = row.profile || {}; });
      /* Local-wins overlay (2026-10-16): fields this feed already
         shows are retired; the survivors are re-applied over the
         rows below, so a stale row can never un-show a saved value. */
      winsRetire(function(pk, k){
        var p = rowsByPk[pk]; if(!p || !(k in p)) return { found:false };
        return { found:true, val:p[k] };
      });
      var n = 0;
      (res.rows || []).forEach(function(row){
        var di = PK2I[row.pkey]; if(di === undefined || pend[row.pkey]) return;
        var ch = {};
        Object.keys(row.profile || {}).forEach(function(k){ ch[k] = row.profile[k]; });
        applyProfileEdit(D.directory[di], ch); n++;
      });
      Object.keys(rowsByPk).forEach(function(pk){ var di = PK2I[pk]; if(di !== undefined) winsApplyTo(di); });
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
  /* Inside the Lima Charlie fit view nothing may scroll (the page is
     clipped to one screen): highlight + focus only. */
  if(lcActive()){
    var el0 = typeof sel === 'string' ? $(sel) : sel;
    if(el0){
      el0.classList.remove('landed'); void el0.offsetWidth; el0.classList.add('landed');
      setTimeout(function(){ el0.classList.remove('landed'); }, 1400);
      if(opts.focus){ var f0 = el0.querySelector('input:not([type=hidden]), textarea, select'); if(f0) f0.focus({ preventScroll:true }); }
    }
    return;
  }
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
function personGroups(e){
  var seen = {}, out = [];
  splitTags(gv(e, 'groups'), ', ').forEach(function(g){ var c = regApply(g), k2 = regKey(c); if(c && !seen[k2]){ seen[k2] = 1; out.push(c); } });
  return out;
}
function allGroups(){
  var map = {};
  D.directory.forEach(function(e, di){ if(liveEntry(e)) personGroups(e).forEach(function(g){ (map[g] = map[g] || []).push(di); }); });
  GRP_EXTRA.forEach(function(g){ if(!map[g]) map[g] = []; });
  return map;
}
function setPersonGroups(di, arr){ queuePatch(di, { groups: arr.join(', ') }); }
function orgMembers(k, name){
  var out = [];
  D.directory.forEach(function(e, di){ if(liveEntry(e) && tagList(gv(e, k)).map(regApply).indexOf(name) >= 0) out.push(di); });
  return out.sort(function(a, b){ return dispName(D.directory[a]).localeCompare(dispName(D.directory[b])); });
}
function orgNames(k){
  var seen = {}, out = [], cat = ORG_CATS.filter(function(c){ return c.k === k; })[0];
  function push(o){ o = regApply(o); if(o && !seen[o]){ seen[o] = 1; out.push(o); } }
  if(cat) cat.options.forEach(push);
  regCanonFor(k).forEach(push);
  D.directory.forEach(function(e){ if(liveEntry(e)) tagList(gv(e, k)).forEach(push); });
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
    locCity:e.city || '', locHome:e.hometown || '', knownSince:knownSinceLabel(e),
    bars:bars, extras:extras, assoc:assocNames,
    notesText:gv(e, 'notes') ? String(gv(e, 'notes')) : '', fpText:fp ? String(fp) : '',
    evs:evs, tier:tierName(e), initial:(name || '·').trim().charAt(0).toUpperCase()
  };
  var th = DOC_THEME;
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Personnel File — ' + esc(name) + '</title>' +
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
      a.download = 'Personnel File - ' + (dispName(e).replace(/[\\/:*?"<>|]/g, '').trim() || 'person') + '.html';
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
  ppl:{ q:'', status:'all', tier:'all', rel:'', group:'', ts:{ k:'name', d:1 }, side:null, view:'list' },
  prof:{ di:null, edit:{}, open:{}, evEdit:null, degEdit:null, skOpen:null, more:false },
  net:{ sel:null, org:null, view:'2d' },
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
  var ae = document.activeElement;
  S.sheetReturn = null; closeSheet();
  S.sheetReturn = (ae && ae !== document.body && ae.focus) ? ae : null;
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
  var r = S.sheetReturn; S.sheetReturn = null;
  if(r && document.contains(r)){ try{ r.focus(); }catch(x){} }
}
function askEditKey(){ try{ poolClose(); }catch(x){}

  openSheet('Edit key needed',
    '<p class="dim">The sheet rejected the last save. Enter the edit key (the EDIT_TOKEN from the Apps Script project). It is stored in this browser only.</p>' +
    '<input type="password" id="ekey" placeholder="Edit key" autocomplete="off">' +
    '<div class="row end"><button type="button" class="btn primary" data-act="savekey">Save and retry</button></div>',
    { onClose:function(){ OUT.auth = false; } });
}

/* ---------- global chrome ---------- */
var NAV = [
  { k:'home',    l:'Home',    ic:'home' },
  { k:'people',  l:'People',  ic:'people' },
  { k:'audit',   l:'Audit',   ic:'target' },
  { k:'daily',   l:'Live Records', ic:'sparkle' },
  { k:'council', l:'Council', ic:'award' },
  { k:'lists',   l:'Master List', ic:'file' },
  { k:'photos',  l:'Photos', ic:'camera' },
  { k:'network', l:'Network', ic:'network' },
  { k:'family',  l:'Family',  ic:'tree' },
  { k:'groups',  l:'Groups',  ic:'groups' },
  { k:'sandbox', l:'Sandbox', ic:'shield' }
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
  var ffExit = ''; try{ if(localStorage.getItem('ncc_force_full') && window.innerWidth <= 899) ffExit = '<a href="#" class="nv" data-act="gomobile">' + ic('phone', 20) + '<span>Mobile version</span></a>'; }catch(x){}
  $('#rail').innerHTML = '<a class="brand" href="#/home" aria-label="Contacts Pro"><i></i><b>Contacts Pro</b></a>' +
    '<div class="navlist">' + items + '</div>' +
    '<div class="railfoot">' + ffExit +
    '<a href="#/settings" class="nv' + (act === 'settings' ? ' on' : '') + '">' + ic('settings', 20) + '<span>Settings</span></a>' +
    '<small id="fresh">' + (D ? 'Data ' + esc(D.updated || '') : '') + '</small></div>';
  /* NAV includes Home since V2.28.0, so the tabs are just the NAV items;
     a prepended Home button here rendered as a duplicate Home tab. The
     reset-and-go-home action stays on the top-bar house button. */
  $('#tabs').innerHTML = items;
  var top = $('#top');
  top.innerHTML =
    '<button type="button" class="ib homebtn" data-act="home" aria-label="Home" title="Home: the overview, with search and filters cleared">' + ic('home', 20) + '</button>' +
    '<button type="button" class="ib" data-act="topback" aria-label="Back" title="Back: one step — closes the top layer, leaves a runner, or returns to the previous view">' + ic('chevl', 20) + '</button>' +
    '<button type="button" class="ib" data-act="topfwd"' + (HIST[S.depth + 1] ? '' : ' disabled') + ' aria-label="Forward" title="' + (HIST[S.depth + 1] ? 'Forward to ' + esc(HIST[S.depth + 1].label) : 'Forward: nothing ahead — go Back first') + '">' + ic('chevr', 20) + '</button>' +
    '<div class="gsearch"><span class="gsi">' + ic('search', 16) + '</span><input id="gs" type="search" placeholder="Search people" autocomplete="off" aria-label="Search people" spellcheck="false"><kbd>/</kbd><div id="gsr" class="gsr" hidden></div></div>' +
    '<div class="topr">' +
    '<button type="button" class="ib" id="undob" data-act="undo" aria-label="Undo" title="Undo (Ctrl+Z)">' + ic('undo', 18) + '</button>' +
    '<button type="button" class="ib hide-s" id="redob" data-act="redo" aria-label="Redo" title="Redo (Ctrl+Shift+Z)">' + ic('redo', 18) + '</button>' +
    '<button type="button" class="syncp" id="sync" data-act="pool"></button>' +
    '<a href="#/settings" class="ib show-s" aria-label="Settings">' + ic('settings', 18) + '</a>' +
    '<button type="button" class="ib" id="focusb" data-act="focus" aria-label="Focus mode" aria-pressed="false" title="Focus mode: hide the sidebar and bars so the view fills the window (Esc exits)">' + ic('expand', 18) + '</button>' +
    themeSecHTML() +
    '<span class="ver" title="App version">V' + APP_VERSION + '</span></div>';
  paintSync(); paintUndo(); paintTheme(); applyFocus(focusOn());
}
function paintSync(){
  var p = $('#sync');
  var n = outPending(), stuck = outStuck(), txt, cls = 'ok';
  if(stuck){ txt = stuck + ' stuck \u00b7 Save Pool'; cls = 'err'; }
  else if(!n){ txt = 'Saved'; }
  else if(OUT.err){ txt = n + ' not saved \u00b7 retrying'; cls = 'err'; }
  else if(OUT.busy){ txt = 'Saving \u00b7 ' + n; cls = 'busy'; }
  else { txt = n + ' queued'; cls = 'busy'; }
  if(p){
    p.className = 'syncp ' + cls; p.innerHTML = '<i></i>' + esc(txt);
    p.title = stuck ? 'Some changes could not be written after repeated tries. Tap to open the Save Pool.' : (OUT.err ? 'Last error: ' + OUT.err + '. Tap to open the Save Pool.' : 'Save Pool: every change, tracked until the Sheet confirms it. Tap to open.');
  }
  var sp = $('#syncs'); if(sp) sp.textContent = txt;
  paintPool();
}
/* ---------- Save Pool drawer ---------- */
function poolEnsure(){
  if($('#pool')) return;
  var as = document.createElement('aside'); as.id = 'pool'; as.setAttribute('aria-label', 'Save pool');
  as.innerHTML = '<div class="pool-in"><div class="pool-hd"><b>Save Pool</b><span class="pool-sub" id="poolsub"></span><span class="sp"></span>' +
    '<button type="button" class="btn ghost sm" data-act="poolretry">Retry all</button>' +
    '<button type="button" class="btn ghost sm" data-act="poolclose">Close</button></div>' +
    '<div class="pool-note">A change sits here until the Sheet confirms the write, then it moves to Written to the Sheet below. Stuck changes park here with their error instead of blocking everything behind them. Nothing in this list is lost on refresh.</div>' +
    '<div id="poolbody"></div></div>';
  var app = $('#app'); (app || document.body).appendChild(as);
  document.addEventListener('keydown', function(ev){ if(ev.key === 'Escape' && POOL.open) poolClose(); });
}
function poolOpen(){ poolEnsure(); POOL.open = true; try{ store('ncc_pool_open', '1'); }catch(x){} document.body.classList.add('pool-open'); paintPool(); }
function poolClose(){ POOL.open = false; try{ store('ncc_pool_open', '0'); }catch(x){} document.body.classList.remove('pool-open'); }
function poolAge(t){ var s = Math.max(0, Math.round((Date.now() - t) / 1000)); if(s < 60) return s + 's ago'; var m = Math.round(s / 60); if(m < 60) return m + 'm ago'; return Math.round(m / 60) + 'h ago'; }
function poolItemRows(it){
  var srcv = Object.assign({}, it.sending || {}, it.patch || {});
  return Object.keys(srcv).map(function(k){ return '<div class="pool-f"><span>' + esc(poolFieldLabel(k)) + '</span><b>' + esc(poolValSummary(k, srcv[k])) + '</b></div>'; }).join('');
}
function paintPool(){
  var strip = $('#audpool');
  var n = outPending(), stuck = outStuck();
  if(strip){
    var last = POOL.log[0];
    strip.innerHTML = '<b>Save Pool</b><span class="' + (stuck ? 'bad' : n ? 'warn' : 'ok') + '">' + (stuck ? stuck + ' stuck' : n ? n + ' saving' : 'all saved') + '</span>' +
      (last ? '<span class="pool-last">Last in the Sheet: ' + esc(last.name) + ' \u00b7 ' + esc(last.fields.map(function(f){ return poolFieldLabel(f.k); }).join(', ')) + ' \u00b7 ' + poolAge(last.t) + '</span>' : '') +
      '<button type="button" class="btn ghost sm" data-act="pool">Open</button>';
  }
  if(!POOL.open) return;
  poolEnsure();
  var sub = $('#poolsub'); if(sub) sub.textContent = stuck ? stuck + ' stuck' : n ? n + ' in flight' : 'all saved';
  var body = $('#poolbody'); if(!body) return;
  var h = '';
  var stuckItems = OUT.items.filter(function(it){ return it.stuck; });
  var active = OUT.items.filter(function(it){ return !it.stuck && (Object.keys(it.patch || {}).length || it.sending); });
  if(stuckItems.length){
    h += '<div class="pool-sec bad">Needs attention</div>' + stuckItems.map(function(it){
      return '<div class="pool-it st-stuck"><div class="pool-nm"><i class="pdot st-stuck"></i>' + esc(poolName(it.id)) + '<span class="pool-st bad">Stuck \u00b7 ' + (it.tries || 0) + ' tries</span></div>' + poolItemRows(it) +
        '<div class="pool-err">' + esc(it.stuck || it.err || '') + '</div>' +
        '<div class="pool-btns"><button type="button" class="btn sm" data-act="poolretry1" data-id="' + esc(it.id) + '">Retry</button>' +
        '<button type="button" class="btn ghost sm" data-act="pooldrop" data-id="' + esc(it.id) + '">Discard change</button></div></div>';
    }).join('');
  }
  if(active.length){
    h += '<div class="pool-sec way">On its way to the Sheet</div>' + active.map(function(it){
      var sending = !!it.sending;
      return '<div class="pool-it ' + (sending ? 'st-sending' : 'st-queued') + '"><div class="pool-nm"><i class="pdot ' + (sending ? 'st-sending' : 'st-queued') + '"></i>' + esc(poolName(it.id)) + '<span class="pool-st ' + (sending ? 'busy' : '') + '">' + (sending ? 'Sending' : 'Queued') + '</span></div>' + poolItemRows(it) + '</div>';
    }).join('');
  }
  if(POOL.log.length){
    h += '<div class="pool-sec ok">Written to the Sheet</div>' + POOL.log.slice(0, 25).map(function(en, ix){
      return '<div class="pool-it done' + (ix === 0 ? ' fresh' : '') + '"><div class="pool-nm"><i class="pdot st-done"></i>' + esc(en.name) + '<span class="pool-st ok">' + poolAge(en.t) + '</span></div>' +
        en.fields.map(function(f){ return '<div class="pool-f"><span>' + esc(poolFieldLabel(f.k)) + '</span><b>' + esc(f.v) + '</b></div>'; }).join('') + '</div>';
    }).join('');
  }
  if(!h) h = '<div class="pool-empty">Pool is empty. Every change is in the Sheet.</div>';
  body.innerHTML = h;
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
/* Why a search row matched, when the match was not on the name itself
   (UI arena 2026-10-29): checks the same fields matchText() searches. */
function searchReason(e, q){
  var toks = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  var nm = dispName(e).toLowerCase();
  var miss = toks.filter(function(t){ return nm.indexOf(t) < 0; });
  if(!miss.length) return '';
  var fields = [
    ['Skill', gv(e, 'specialty')], ['Employer', gv(e, 'companies')],
    ['School', gv(e, 'universities')], ['Group', personGroups(e).join(', ')],
    ['Church', gv(e, 'churches')], ['Location', [ptLocVal(e), e.city || '', e.hometown || ''].filter(Boolean).join(', ')]
  ];
  for(var f = 0; f < fields.length; f++){
    var items = String(fields[f][1] || '').split(/[,;]/).map(function(s){ return s.trim(); }).filter(Boolean);
    for(var i = 0; i < items.length; i++){
      var it = items[i].toLowerCase();
      if(miss.some(function(t){ return it.indexOf(t) >= 0; })) return fields[f][0] + ' · ' + items[i];
    }
  }
  return '';
}
function paintSearch(){
  var inp = $('#gs'), box = $('#gsr'); if(!inp || !box) return;
  var q = inp.value.trim();
  if(!q){ box.hidden = true; box.innerHTML = ''; return; }
  var hits = searchPeople(q, 7);
  box.innerHTML = hits.map(function(di, i){
    var e = D.directory[di];
    var rsn = searchReason(e, q);
    return '<button type="button" class="gsi-row' + (i === 0 ? ' on' : '') + '" data-act="gsopen" data-di="' + di + '">' + avatar(e, 'sm') +
      '<span><b>' + esc(dispName(e)) + '</b>' + milBadge(e) + '<small>' + (rsn ? '<span class="gsr-rsn">' + esc(rsn) + '</span> · ' : '') + esc(infoLine(e) || (effHandle(e) ? '@' + effHandle(e) : '')) + '</small></span>' + '</button>';
  }).join('') + (hits.length ? '<button type="button" class="gsi-all" data-act="gsall">See all matches in People</button>' :
    '<div class="gsi-none">No one matches</div><button type="button" class="gsi-all" data-act="gsall">See in People</button><button type="button" class="gsi-all" data-act="gsclear">Clear search</button>');
  box.hidden = false;
}

/* ---------- router ---------- */
function parseRoute(){
  var h = (location.hash || '#/home').replace(/^#\/?/, '');
  var seg = h.split('/').filter(Boolean).map(function(s){ try{ return decodeURIComponent(s); }catch(x){ return s; } });
  var name = seg[0] || 'home';
  if(name === 'p') name = 'profile';
  if(['home','people','profile','network','family','groups','settings','audit','daily','photos','sandbox','council','lists'].indexOf(name) < 0) name = 'people';
  return { name:name, seg:seg.slice(1) };
}
function go(path, o){
  o = o || {};
  var url = '#/' + path;
  if(o.replace) history.replaceState({ d:S.depth }, '', url);
  else { S.depth++; history.pushState({ d:S.depth }, '', url); }
  histNote();
  render();
}
function back(fallback){
  if(S.depth > 0) history.back();
  else go(fallback || 'people', { replace:true });
}
/* ---------- View history labels + scroll restoration (V3.38.0) ----------
   HIST mirrors the history stack by depth: each entry knows its hash
   and a human label, so a Back control can say where it actually goes.
   NAVSCR remembers #view's scroll per depth; a popstate render restores
   it, so Back lands where you were, not at the top of the last view. */
var HIST = [], NAVSCR = {};
function histLabelFor(hash){
  var seg = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean).map(function(s){ try{ return decodeURIComponent(s); }catch(x){ return s; } });
  var n = seg[0] || 'home';
  if(n === 'p'){ var di = diFromId(seg[1]); return di != null && D && D.directory[di] ? dispName(D.directory[di]) : 'Profile'; }
  if(n === 'groups') return seg[2] || 'Groups';
  return { home:'Home', people:'People', network:'Network', family:'Family', photos:'Photos', daily:'Live Records', audit:'Audit', council:'Council', lists:'Master List', sandbox:'Sandbox', settings:'Settings' }[n] || 'Back';
}
function histNote(){
  HIST[S.depth] = { hash: location.hash, label: histLabelFor(location.hash) };
  HIST.length = S.depth + 1;
}
/* Persistent Back (JD 2026-10-27): one button in the top bar, every
   view, every scroll position. Each press peels exactly one layer:
   theme pop, batch modal, photo editor/inspector, the Home inspector
   drill stack (one drill level per press, then close), sheet, menu,
   search results; then an open Lima Charlie profile or a non-Cards
   audit mode returns to Audit home; then the real view history
   (history.back, in sync with the browser buttons); with an empty
   stack it lands on Home. Never a dead button. */
function topBack(){
  var pop = document.getElementById('tpop');
  if(pop && !pop.hidden){ closeThemePop(); return; }
  if(document.querySelector('.ykb-wrap')){ ykBatchClose(); return; }
  if(document.querySelector('.phed-wrap')){
    if(window.PHI && PHI.adj && PHI.adjClose) PHI.adjClose();
    else if(typeof ptEditClose === 'function') ptEditClose();
    else phInspClose(true);
    return;
  }
  if(document.querySelector('.phi-wrap')){ phInspClose(); return; }
  if(HMI){ if(HMI.stack.length > 1) hmiBack(); else hmiClose(); return; }
  var sw = document.getElementById('sheetwrap');
  if(sw && !sw.hidden){ closeSheet(); return; }
  var mp = document.querySelector('.menu-pop:not([hidden])');
  if(mp){ mp.hidden = true; return; }
  var gsr = document.getElementById('gsr');
  if(gsr && !gsr.hidden){ gsr.hidden = true; return; }
  if(S.route.name === 'audit' && S.audit){
    if(S.audit.lcOpen != null){ S.audit.lcOpen = null; viewAudit($('#view')); return; }
    if(audMode() !== 'cards'){ audSetMode('cards'); return; }
  }
  if(S.route.name === 'sandbox' && typeof SB !== 'undefined' && SB.tool && SB.tool !== 'home'){
    if(SB.tool === 'insights' && SB.ins && SB.ins.view){ go('sandbox/insights', { replace:true }); return; }
    go('sandbox', { replace:true }); return;
  }
  if(S.route.name === 'profile'){
    var fb = S.ctx && S.ctx.from ? S.ctx.from : 'people';
    if(fb === 'groups' && S.ctx && S.ctx.grp) fb = 'groups/' + S.ctx.grp;
    back(fb);
    return;
  }
  back('home');
}
/* Home (JD 2026-10-17): one tap from anywhere — including inside the
   Lima Charlie expanded view — back to the People landing in its
   default state. Clears TRANSIENT view state only: the global search
   text, the People search/filters/sort, the profile context and any
   open LC profile. Never touches user data: audit skips/laters,
   local-wins, the org registry overlay, pending Lima Charlie notes
   and the outbox all survive. */
function goHome(){
  closeThemePop();
  if(document.querySelector('.ykb-wrap')) ykBatchClose();
  if(document.querySelector('.phi-wrap')) phInspClose(true);
  if(HMI) hmiClose(true);
  closeSheet();
  $$('.menu-pop').forEach(function(m){ m.hidden = true; });
  S.ctx = null;
  if(S.audit) S.audit.lcOpen = null;
  S.ppl = { q:'', status:'all', tier:'all', rel:'', group:'', ts:{ k:'name', d:1 }, side:S.ppl.side, view:(S.ppl && S.ppl.view) || 'list' };
  go('home');   /* V2.28.0: the landing is the Home overview now; the state clearing above is unchanged */
}
addEventListener('popstate', function(ev){ S.depth = (ev.state && ev.state.d) || 0; S._pop = true; render(); });
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
/* ---------- Living background (JD 2026-10-29) ----------
   A fixed texture layer behind the glass: two soft scheme-tinted
   light fields over a faint survey grid. The fields drift at a
   fraction of the scroll (parallax), so the frosted cards read as
   glass over something real. Drift only; reduced-motion opts out. */
var BGFX = null;
function bgInit(){
  if(BGFX || !document.body) return;
  var d = document.createElement('div');
  d.id = 'bgfx'; d.setAttribute('aria-hidden', 'true');
  d.innerHTML = '<div class="bgf b1"></div><div class="bgf b2"></div>';
  document.body.insertBefore(d, document.body.firstChild);
  BGFX = d;
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var tick = false;
  function upd(){
    tick = false;
    var vw = document.getElementById('view');
    var y = (vw && vw.scrollTop) || window.scrollY || 0;
    BGFX.children[0].style.transform = 'translate3d(0,' + (y * -0.05) + 'px,0)';
    BGFX.children[1].style.transform = 'translate3d(0,' + (y * -0.11) + 'px,0)';
  }
  function onScr(){ if(!tick){ tick = true; requestAnimationFrame(upd); } }
  window.addEventListener('scroll', onScr, { passive:true });
  var vw2 = document.getElementById('view');
  if(vw2) vw2.addEventListener('scroll', onScr, { passive:true });
}
function render(){
  if(!D) return;
  bgInit();
  cancelAnimationFrame(renderTimer);
  S.route = parseRoute();
  var v = $('#view'), n = S.route.name;
  /* V3.13.0: a route CHANGE starts at the top. #view is a persistent
     scroller, so without this a forward navigation inherited the last
     view's scroll position and landed mid-page (JD's "pages jumping /
     weird navigation"). Same-route repaints (data loads, quiet
     refresh) keep the scroll exactly where it is. */
  var rk = n + '/' + (S.route.seg || []).join('/');
  var popped = !!S._pop; S._pop = false;
  if(!HIST[S.depth] || HIST[S.depth].hash !== location.hash) histNote();
  if(render._rk !== rk){
    if(v && render._rk != null) NAVSCR[render._depth || 0] = v.scrollTop;
    render._rk = rk;
    if(v) v.scrollTop = 0;
    window.scrollTo(0, 0);
    render._restore = popped ? (NAVSCR[S.depth || 0] || 0) : 0;
  }
  render._depth = S.depth;
  closeSheet();
  if(render._pv && render._pv !== n) phInspClose(true);
  if(HMI && n !== 'home') hmiClose(true);
  document.body.setAttribute('data-view', n);
  /* V3.30.0: the Models section (and only it) takes the full viewport;
     the attribute is restamped on every render so leaving restores the
     app frame exactly. */
  if(n === 'sandbox' && S.route.seg && S.route.seg[0] === 'models') document.body.setAttribute('data-mdl', '1');
  else document.body.removeAttribute('data-mdl');
  /* skin 2026-10-15: route CHANGES earn a short entrance; same-route
     repaints (polls, quiet refresh, writes) stay instant */
  if(render._pv !== n){ render._pv = n; v.classList.remove('vin'); void v.offsetWidth; v.classList.add('vin'); clearTimeout(render._vt); render._vt = setTimeout(function(){ v.classList.remove('vin'); }, 380); }
  try{
    renderChrome();
    if(n === 'home') viewHome(v);
    else if(n === 'people') viewPeople(v);
    else if(n === 'profile') viewProfile(v);
    else if(n === 'network') viewNetwork(v);
    else if(n === 'family') viewFamily(v);
    else if(n === 'groups') viewGroups(v);
    else if(n === 'settings') viewSettings(v);
    else if(n === 'audit') viewAudit(v);
    else if(n === 'daily') viewDaily(v);
    else if(n === 'photos') viewPhotos(v);
    else if(n === 'sandbox') viewSandbox(v);
    else if(n === 'council') viewCouncil(v);
    else if(n === 'lists') viewLists(v);
  }catch(err){
    v.innerHTML = '<div class="empty"><h3>Something broke on this screen</h3><p>' + esc(String(err && err.message || err)) + '</p><p><a href="#/people" class="btn">Go to People</a></p></div>';
    if(window.console) console.error(err);
  }
  paintPool();
  if(render._restore){ var vv = $('#view'); if(vv) vv.scrollTop = render._restore; render._restore = 0; }
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
      close: CLOSE_RANK[(gv(e, 'closeness') || '').toLowerCase()] || 0,
      handle: ptHandle(e).toLowerCase(),
      groups: personGroups(e).join(', ').toLowerCase(),
      years: knownSinceYear(e),
      phone: gv(e, 'phone'),
      email: gv(e, 'email').toLowerCase(),
      lastc: flexKey(gv(e, 'last_contact')) || 0,
      firstc: flexKey(firstContactOf(e)) || 0,
      msgs: (msgFor(e) || {}).n || 0
    };
  });
  dis.sort(function(a, b){
    var ka = K[a], kb = K[b], r = 0;
    if(ts.k === 'tier') r = (ka.tier - kb.tier) * d;
    else if(ts.k === 'assoc') r = (ka.assoc - kb.assoc) * d;
    else if(ts.k === 'msgs') r = (ka.msgs - kb.msgs) * d;
    else if(ts.k === 'years' || ts.k === 'close' || ts.k === 'lastc' || ts.k === 'firstc'){
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
    '<span class="pn"><b>' + esc(dispName(e)) + '</b>' + milBadge(e) + (sub ? '<small>' + esc(sub) + '</small>' : '') + prowMeta(e) + '</span></button>';
}
/* ============================================================
   TIMELINE — the shared time view (JD 2026-10-29).
   JD: anywhere the app sorts by time, the timeline is an option
   view — and not a default timeline. One component, three
   surfaces: People (the contact stream for the filtered roster),
   the Home Last contacts card, and a profile's own event log.
   Three zooms, each with its own layout language:
   · Week — seven day columns under big date numerals, today
     ringed; events are compact cards inside their day.
   · Month — an editorial rail: sticky day markers on a hairline,
     event rows flowing down the right side.
   · Year — month bands with ghost numerals, compact day rows.
   A density strip under the header draws the period's shape
   (events per day / per month) so the rhythm is visible before
   a single name is read. Dates carry their recorded precision:
   a month-only date never pretends to be a day — it lands in a
   "dated by month" group inside its month instead of on a
   fabricated day. Empty periods offer a jump to the nearest
   period that actually has something in it.
   Items: { k (ms, period start), prec ('d'|'m'|'y'), di, e, ev }
   ============================================================ */
var TL_MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var TL_MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var TL_DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
var TL_DOW3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var TL_SRC = { 'gmail-seed':'Email', 'ig-seed':'Instagram', 'messenger-seed':'Messenger', 'imessage-seed':'iMessage', 'lc':'Lima Charlie', 'field':'On file' };
function tlState(scope){
  if(scope === 'ppl'){ if(!S.tlPpl) S.tlPpl = { mode:'month', off:0, exp:{} }; return S.tlPpl; }
  if(scope === 'hm'){ if(!S.tlHm) S.tlHm = { mode:'month', off:0, exp:{} }; return S.tlHm; }
  if(!S.tlProf) S.tlProf = { mode:'year', off:0, exp:{} }; return S.tlProf;
}
function tlPrec(dateStr){
  var s = String(dateStr || '').trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'd';
  if(/^\d{4}-\d{2}$/.test(s)) return 'm';
  if(/^\d{4}$/.test(s)) return 'y';
  return null;
}
function tlPeriod(mode, off){
  var now = new Date(), t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if(mode === 'week'){
    var dow = (t0.getDay() + 6) % 7, st = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() - dow + off * 7);
    var en = new Date(st.getFullYear(), st.getMonth(), st.getDate() + 7), last = new Date(en.getTime() - 86400000);
    return { start:st.getTime(), end:en.getTime(), st:st,
      label: TL_MON3[st.getMonth()] + ' ' + st.getDate() + ' – ' + TL_MON3[last.getMonth()] + ' ' + last.getDate() + ', ' + last.getFullYear() };
  }
  if(mode === 'year'){
    var y = now.getFullYear() + off, st2 = new Date(y, 0, 1), en2 = new Date(y + 1, 0, 1);
    return { start:st2.getTime(), end:en2.getTime(), st:st2, label:String(y) };
  }
  var m0 = new Date(now.getFullYear(), now.getMonth() + off, 1), m1 = new Date(m0.getFullYear(), m0.getMonth() + 1, 1);
  return { start:m0.getTime(), end:m1.getTime(), st:m0, label:TL_MON[m0.getMonth()] + ' ' + m0.getFullYear() };
}
function tlRel(k){
  var now = new Date(), t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  var d = Math.round((t0 - new Date(new Date(k).getFullYear(), new Date(k).getMonth(), new Date(k).getDate()).getTime()) / 86400000);
  if(d === 0) return 'Today';
  if(d === 1) return 'Yesterday';
  if(d === -1) return 'Tomorrow';
  if(d > 1 && d < 7) return d + ' days ago';
  if(d >= 7 && d < 30) return Math.round(d / 7) + (Math.round(d / 7) === 1 ? ' week ago' : ' weeks ago');
  if(d < 0 && d > -7) return 'in ' + (-d) + ' days';
  if(d < 0) return 'in ' + Math.round(-d / 7) + ' weeks';
  return '';
}
function tlMeta(it){
  var ev = it.ev || {}, parts = [];
  if(ev.kind === 'contact') parts.push((ev.online ? 'Online contact' : 'Contact'));
  else if(ev.kind) parts.push(cap(ev.kind));
  var src = TL_SRC[ev.src || '']; if(src) parts.push(src);
  if(it.prec === 'm') parts.push('day not recorded');
  if(it.prec === 'y') parts.push('month not recorded');
  return parts.join(' · ');
}
function tlItemHTML(it, compact, link){
  var e = it.e, ev = it.ev || {};
  var sum = String(ev.summary || '').trim();
  var inner = avatar(e, 'sm') +
    '<span class="tl-evmain"><span class="tl-evname">' + esc(dispName(e)) + milBadge(e) + '</span>' +
    (sum ? '<span class="tl-evsum">' + esc(sum) + '</span>' : '') +
    '<span class="tl-evmeta">' + esc(tlMeta(it)) + '</span></span>' +
    '<span class="tl-evdot" style="background:' + tierCol(e) + '"></span>';
  if(link === false) return '<div class="tl-ev' + (compact ? ' compact' : '') + ' static">' + inner + '</div>';
  return '<button type="button" class="tl-ev' + (compact ? ' compact' : '') + '" data-act="popen" data-di="' + it.di + '">' + inner + '</button>';
}
function tlDensity(items, per){
  var buckets = [], n, i;
  if(per.mode === 'year'){ n = 12; for(i = 0; i < n; i++) buckets.push(0); items.forEach(function(it){ var d = new Date(it.k); if(it.k >= per.start && it.k < per.end) buckets[d.getMonth()]++; }); }
  else { n = Math.round((per.end - per.start) / 86400000); for(i = 0; i < n; i++) buckets.push(0); items.forEach(function(it){ if(it.k >= per.start && it.k < per.end && it.prec === 'd') buckets[Math.floor((it.k - per.start) / 86400000)]++; }); }
  var mx = Math.max.apply(null, buckets.concat([1]));
  var now = new Date(), t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return '<div class="tl-density" aria-hidden="true">' + buckets.map(function(c, ix){
    var isToday = per.mode !== 'year' && per.start + ix * 86400000 === t0;
    return '<span class="tl-dbar' + (isToday ? ' today' : '') + '" style="height:' + Math.max(8, Math.round(c / mx * 100)) + '%"></span>';
  }).join('') + '</div>';
}
function tlEmpty(scope, st, items, per){
  var prev = null, next = null;
  items.forEach(function(it){
    if(it.k < per.start && (!prev || it.k > prev.k)) prev = it;
    if(it.k >= per.end && (!next || it.k < next.k)) next = it;
  });
  function offFor(it){
    var d = new Date(it.k), now = new Date();
    if(st.mode === 'week'){
      var monday = function(x){ var t = new Date(x.getFullYear(), x.getMonth(), x.getDate()); return t.getTime() - ((t.getDay() + 6) % 7) * 86400000; };
      return Math.round((monday(d) - monday(now)) / 604800000);
    }
    if(st.mode === 'year') return d.getFullYear() - now.getFullYear();
    return (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
  }
  var h = '<div class="tl-empty"><p>Nothing logged in this ' + st.mode + '.</p><div class="tl-emptyj">';
  if(prev) h += '<button type="button" class="btn ghost sm" data-act="tljump" data-scope="' + scope + '" data-off="' + offFor(prev) + '">&larr; ' + esc(tlPeriod(st.mode, offFor(prev)).label) + '</button>';
  if(next) h += '<button type="button" class="btn ghost sm" data-act="tljump" data-scope="' + scope + '" data-off="' + offFor(next) + '">' + esc(tlPeriod(st.mode, offFor(next)).label) + ' &rarr;</button>';
  return h + '</div></div>';
}
function tlWeekBody(scope, st, items, per){
  var days = [];
  for(var i = 0; i < 7; i++){
    var ds = per.start + i * 86400000, de = ds + 86400000;
    days.push({ t:ds, items:items.filter(function(it){ return it.prec === 'd' && it.k >= ds && it.k < de; }) });
  }
  var now = new Date(), t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return '<div class="tl-week">' + days.map(function(d){
    var dt = new Date(d.t);
    return '<div class="tl-day' + (d.t === t0 ? ' today' : '') + '"><div class="tl-dayhead"><span class="tl-dow">' + TL_DOW3[dt.getDay()] + '</span><span class="tl-dnum">' + dt.getDate() + '</span>' + (d.t === t0 ? '<span class="tl-today">Today</span>' : '') + '</div>' +
      (d.items.length ? d.items.map(function(it){ return tlItemHTML(it, true, scope !== 'prof'); }).join('') : '<div class="tl-daynone">·</div>') + '</div>';
  }).join('') + '</div>';
}
function tlMonthBody(scope, st, items, per){
  var dayItems = items.filter(function(it){ return it.prec === 'd'; });
  var coarse = items.filter(function(it){ return it.prec !== 'd'; });
  var byDay = {};
  dayItems.forEach(function(it){ var d = new Date(it.k), key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); (byDay[key] = byDay[key] || { t:it.k, items:[] }).items.push(it); });
  var days = Object.keys(byDay).map(function(k){ return byDay[k]; }).sort(function(a, b){ return b.t - a.t; });
  var h = '<div class="tl-stream">';
  days.forEach(function(d){
    var dt = new Date(d.t);
    h += '<div class="tl-sday"><div class="tl-smark"><span class="tl-sdow">' + TL_DOW3[dt.getDay()] + '</span><span class="tl-snum">' + dt.getDate() + '</span><span class="tl-srel">' + esc(tlRel(d.t)) + '</span></div>' +
      '<div class="tl-sevs">' + d.items.map(function(it){ return tlItemHTML(it, false, scope !== 'prof'); }).join('') + '</div></div>';
  });
  if(coarse.length){
    h += '<div class="tl-sday coarse"><div class="tl-smark"><span class="tl-sdow">~</span><span class="tl-srel">dated by month</span></div>' +
      '<div class="tl-sevs">' + coarse.map(function(it){ return tlItemHTML(it, false, scope !== 'prof'); }).join('') + '</div></div>';
  }
  return h + '</div>';
}
function tlYearBody(scope, st, items, per){
  var h = '<div class="tl-year">';
  for(var m = 11; m >= 0; m--){
    var ms = new Date(per.st.getFullYear(), m, 1).getTime(), me = new Date(per.st.getFullYear(), m + 1, 1).getTime();
    var mi = items.filter(function(it){ return it.k >= ms && it.k < me; });
    if(!mi.length) continue;
    var expKey = per.st.getFullYear() + '-' + m, open = !!st.exp[expKey];
    var shown = open ? mi : mi.slice(0, 10);
    h += '<section class="tl-mband"><div class="tl-mhead"><span class="tl-mghost">' + (m + 1) + '</span><div><h4>' + TL_MON[m] + '</h4><em>' + mi.length + ' event' + (mi.length === 1 ? '' : 's') + '</em></div></div>' +
      '<div class="tl-mevs">' + shown.map(function(it){
        var dt = new Date(it.k);
        return '<div class="tl-yrow"><span class="tl-ydate">' + (it.prec === 'd' ? TL_MON3[dt.getMonth()] + ' ' + dt.getDate() : it.prec === 'm' ? TL_MON3[dt.getMonth()] + ' ·' : 'Year only') + '</span>' + tlItemHTML(it, true, scope !== 'prof') + '</div>';
      }).join('') + '</div>' +
      (mi.length > 10 ? '<button type="button" class="btn ghost sm tl-more" data-act="tlmore" data-scope="' + scope + '" data-k="' + expKey + '">' + (open ? 'Show less' : 'Show all ' + mi.length) + '</button>' : '') + '</section>';
  }
  return h + '</div>';
}
function tlShell(scope, items){
  var st = tlState(scope), per = tlPeriod(st.mode, st.off);
  var inPer = items.filter(function(it){ return it.k >= per.start && it.k < per.end; }).sort(function(a, b){
    if(b.k !== a.k) return b.k - a.k;
    return dispName(a.e).localeCompare(dispName(b.e));
  });
  var seg = [['week', 'Week'], ['month', 'Month'], ['year', 'Year']].map(function(o){
    return '<button type="button" data-act="tlmode" data-scope="' + scope + '" data-m="' + o[0] + '"' + (st.mode === o[0] ? ' class="on"' : '') + '>' + o[1] + '</button>';
  }).join('');
  var h = '<div class="tlx"><div class="tl-head"><div class="tl-title"><h3>' + esc(per.label) + '</h3>' +
    '<span class="tl-count">' + inPer.length + ' event' + (inPer.length === 1 ? '' : 's') + (st.off !== 0 ? '' : ' · current ' + st.mode) + '</span></div>' +
    '<div class="tl-nav"><button type="button" class="ib" data-act="tlnav" data-scope="' + scope + '" data-d="-1" aria-label="Previous ' + st.mode + '">' + ic('chevl', 16) + '</button>' +
    (st.off !== 0 ? '<button type="button" class="btn ghost sm" data-act="tlnav" data-scope="' + scope + '" data-d="0">Today</button>' : '') +
    '<button type="button" class="ib" data-act="tlnav" data-scope="' + scope + '" data-d="1" aria-label="Next ' + st.mode + '">' + ic('chevr', 16) + '</button>' +
    '<div class="seg tl-seg" role="group" aria-label="Timeline zoom">' + seg + '</div></div></div>' +
    tlDensity(inPer, per);
  if(!inPer.length) h += tlEmpty(scope, st, items, per);
  else if(st.mode === 'week') h += tlWeekBody(scope, st, inPer, per);
  else if(st.mode === 'month') h += tlMonthBody(scope, st, inPer, per);
  else h += tlYearBody(scope, st, inPer, per);
  return h + '</div>';
}
/* Contact-stream items for a roster slice: every contact event on
   file, plus one point for a person whose Last Contact stamp exists
   without any event behind it — so the timeline and the By-last-
   contact view always agree about who has been contacted. */
function tlContactItems(dis){
  var out = [];
  dis.forEach(function(di){
    var e = D.directory[di], has = false;
    (e.events || []).forEach(function(ev){
      if(!ev || ev.kind !== 'contact') return;
      var k = flexKey(ev.date), p = tlPrec(ev.date);
      if(k == null || !p) return;
      has = true;
      out.push({ k:k, prec:p, di:di, e:e, ev:ev });
    });
    if(!has){
      var v = String(gv(e, 'last_contact') || '').trim(), k2 = flexKey(v), p2 = tlPrec(v);
      if(k2 != null && p2) out.push({ k:k2, prec:p2, di:di, e:e, ev:{ kind:'contact', date:v, summary:'', online:lcOnline(e), src:'field' } });
    }
  });
  return out;
}
function tlRepaint(scope){
  if(scope === 'ppl') paintPeople();
  else if(scope === 'hm') viewHome($('#view'));
  else repaintSec('timeline');
}

/* People right column: filter shortcuts + counts by tier and group.
   Tucked until opened; S.ppl.side remembers an explicit open/close. */
function viewPeople(v){
  ptEditClose(); msgLoad();
  var f = S.ppl, groups = Object.keys(allGroups()).sort();
  function chips(key, opts, cur){
    return '<div class="chips" role="group">' + opts.map(function(o){
      return '<button type="button" class="fc' + (cur === o[0] ? ' on' : '') + '" data-act="pf" data-k="' + key + '" data-v="' + o[0] + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  /* Design cleanup (JD 2026-10-28): the toolbar lives INSIDE the hero
     banner now — search, tier chips and the More/Columns buttons sit
     in the banner's second row, so the table starts right under it. */
  v.innerHTML = '<div class="page people"><div class="pagehead"><div class="ppl-headrow"><div><h1 class="display">People</h1><p class="sub" id="pcount"></p></div>' +
    '<div class="seg ppl-viewseg" role="group" aria-label="People view"><button type="button" data-act="pplview" data-v="list"' + (f.view === 'list' ? ' class="on"' : '') + '>List</button><button type="button" data-act="pplview" data-v="recent"' + (f.view === 'recent' ? ' class="on"' : '') + '>By last contact</button><button type="button" data-act="pplview" data-v="reach"' + (f.view === 'reach' ? ' class="on"' : '') + '>Reach back out</button><button type="button" data-act="pplview" data-v="timeline"' + (f.view === 'timeline' ? ' class="on"' : '') + '>Timeline</button></div></div>' +
    '<div class="toolbar"><label class="field"><span>' + ic('search', 16) + '</span><input id="pq" type="search" placeholder="Filter by name, school, employer, skill" value="' + esc(f.q) + '" autocomplete="off"></label>' +
    chips('tier', [['all', 'Any tier'], ['vetted', 'Vetted'], ['associate', 'Associate'], ['open', 'Open'], ['none', 'Untiered']], f.tier) +
    '<div class="tool-r">' +
    '<button type="button" class="btn ghost sm" data-act="morefilters">' + ic('filter', 14) + 'More' + ((f.rel || f.group) ? ' <em>' + ((f.rel ? 1 : 0) + (f.group ? 1 : 0)) + '</em>' : '') + '</button>' +
    '<button type="button" class="btn ghost sm" data-act="ptcols">' + ic('settings', 14) + 'Columns</button>' +
    '</div></div></div>' +
    '<div class="ppl-cols"><div class="ppl-main">' +
    '<div class="plist" id="plist"></div></div>' +
    '</div></div>';
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
  var body = '';
  if(dis.length && S.ppl.view === 'timeline'){
    /* Timeline view (JD 2026-10-29): the contact stream for the
       filtered roster, in the shared timeline component. S.ppl.cur
       follows the visible order for pager context. */
    var items = tlContactItems(dis);
    S.ppl.cur = dis;
    box.innerHTML = tlShell('ppl', items);
    var tc = $('#pcount'); if(tc) tc.textContent = items.length + ' contact events on file';
    return;
  }
  if(dis.length && S.ppl.view === 'reach'){
    /* Reach back out (JD 2026-10-28): everyone with at least one contact
       event or a note on file, longest-quiet first (Last Contact
       oldest-first; a note-only person with no date sorts last). Built
       entirely from the existing filters and the flexible-date keys. */
    var reach = dis.filter(function(di){
      var e = D.directory[di];
      return !!lcNote(e).trim() || (e.events || []).some(function(ev){ return ev && ev.kind === 'contact'; });
    });
    function reachKey(di){
      var e = D.directory[di], k = flexKey(gv(e, 'last_contact'));
      if(k != null) return k;
      var m = null;
      (e.events || []).forEach(function(ev){
        if(ev && ev.kind === 'contact'){ var ek = flexKey(ev.date); if(ek != null && (m == null || ek > m)) m = ek; }
      });
      return m;
    }
    reach.sort(function(a, b){
      var ka = reachKey(a), kb = reachKey(b);
      if(ka == null && kb == null) return dispName(D.directory[a]).localeCompare(dispName(D.directory[b]));
      if(ka == null) return 1;
      if(kb == null) return -1;
      if(ka !== kb) return ka - kb;
      return dispName(D.directory[a]).localeCompare(dispName(D.directory[b]));
    });
    S.ppl.cur = reach;
    box.innerHTML = (reach.length
      ? '<div class="ptwrap"><table class="ptable">' + ptColgroupHTML() + ptheadHTML() + '<tbody>' + reach.map(function(di, i){ return ptrowHTML(di, i); }).join('') + '</tbody></table></div>'
      : emptyState('No one to reach back out to yet.', 'Log a contact or leave a note on a profile and they queue here, longest-quiet first.'));
    var rc = $('#pcount'); if(rc) rc.textContent = reach.length + ' to reach back out to';
    return;
  }
  if(dis.length && S.ppl.view === 'recent'){
    /* By-last-contact view: bucket the filtered roster, most recent first
       inside each bucket; the pager context follows the displayed order. */
    var byB = LC_BUCKETS.map(function(){ return []; });
    dis.forEach(function(di){ byB[lcBucket(D.directory[di])].push(di); });
    var ordered = [], rows = '';
    byB.forEach(function(mems, bi){
      if(!mems.length) return;
      mems.sort(function(a, b){
        var ka = flexKey(gv(D.directory[a], 'last_contact')) || 0, kb = flexKey(gv(D.directory[b], 'last_contact')) || 0;
        if(kb !== ka) return kb - ka;
        return dispName(D.directory[a]).localeCompare(dispName(D.directory[b]));
      });
      rows += '<tr class="ptgroup"><td colspan="' + ptVisibleCols().length + '">' + LC_BUCKETS[bi] + ' <span>' + mems.length + '</span></td></tr>';
      mems.forEach(function(di){ rows += ptrowHTML(di, ordered.length); ordered.push(di); });
    });
    S.ppl.cur = ordered;
    body = '<div class="ptwrap"><table class="ptable">' + ptColgroupHTML() + ptheadHTML() + '<tbody>' + rows + '</tbody></table></div>';
  } else {
    S.ppl.cur = dis;
    body = dis.length ? '<div class="ptwrap"><table class="ptable">' + ptColgroupHTML() + ptheadHTML() + '<tbody>' + dis.map(function(di, i){ return ptrowHTML(di, i); }).join('') + '</tbody></table></div>' : '';
  }
  box.innerHTML = body + (!dis.length ? '<div class="empty"><h3>No one matches.</h3><p>Loosen a filter or clear the search.</p><div class="row"><button type="button" class="btn sm" data-act="pclear">Clear search and filters</button></div></div>' : '');
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
  { k:'assoc',    label:'Associates', num:true },
  { k:'msgs',     label:'Correspondence', num:true },
  { k:'skills',   label:'Skills' },
  { k:'rel',      label:'Relationship' },
  { k:'close',    label:'Closeness' },
  { k:'handle',   label:'Handle' },
  { k:'groups',   label:'Groups' },
  { k:'years',    label:'Years known', num:true },
  { k:'phone',    label:'Phone' },
  { k:'email',    label:'Email' },
  { k:'lastc',    label:'Last contact', num:true },
  { k:'firstc',   label:'First contact', num:true }
];
var PT_DEF_ON = { name:1, tier:1, loc:1, orgs:1, assoc:1, msgs:1, skills:1, rel:1, lastc:1 };
var PT_NUMDIR = { assoc:1, msgs:1, years:1, close:1, lastc:1, firstc:1 };   /* first click on these sorts high-to-low */
var PT_ED = { name:'name', tier:'tier', loc:'loc', orgs:'orgs', skills:'skills', rel:'rel', close:'close', groups:'groups', years:'years', phone:'phone', email:'email' };
var PT_SEED_TOWNS = ['Potsdam, NY','Canton, NY','Massena, NY','Norwood, NY','Norfolk, NY','Madrid, NY','Waddington, NY','Ogdensburg, NY','Gouverneur, NY','Lisbon, NY','Colton, NY','South Colton, NY','Parishville, NY','Hopkinton, NY','Brasher Falls, NY','Winthrop, NY','Hammond, NY','Heuvelton, NY','Hermon, NY','DeKalb Junction, NY','Rensselaer Falls, NY','Pierrepont, NY','Hannawa Falls, NY','West Potsdam, NY','West Stockholm, NY','Louisville, NY','Morristown, NY','Star Lake, NY','Cranberry Lake, NY','Edwards, NY','Russell, NY','Chase Mills, NY','North Lawrence, NY','Nicholville, NY','Lawrence, NY','Helena, NY','Raymondville, NY','Richville, NY','Fine, NY','Newton Falls, NY','Fort Jackson, NY','Malone, NY','Tupper Lake, NY','Saranac Lake, NY','Chateaugay, NY','Brushton, NY','St. Regis Falls, NY','Moira, NY','Bombay, NY','Fort Covington, NY','Hogansburg, NY','Paul Smiths, NY','Watertown, NY','Clayton, NY','Alexandria Bay, NY','Cape Vincent, NY','Theresa, NY','Philadelphia, NY','Evans Mills, NY','Adams, NY','Sackets Harbor, NY','Carthage, NY','Dexter, NY','Chaumont, NY','Lowville, NY','Croghan, NY','Turin, NY','Port Leyden, NY','Lyons Falls, NY','Copenhagen, NY','Plattsburgh, NY','Peru, NY','Chazy, NY','Rouses Point, NY','Dannemora, NY','Champlain, NY','Keeseville, NY','Inlet, NY','Old Forge, NY','Raquette Lake, NY','Eagle Bay, NY','Hauppauge, NY','Queens, NY','Farmingville, NY','Smithtown, NY','West Sayville, NY','Huntington, NY','Massapequa, NY'];
var PT_SEED_ORGS = {
  universities: ['SUNY Potsdam','Clarkson University','St. Lawrence University','SUNY Canton','Potsdam Central School','Hugh C. Williams Senior High School','Massena Central High School','Norwood-Norfolk Central School','Madrid-Waddington Central School','Ogdensburg Free Academy','Gouverneur Central School','Lisbon Central School','Colton-Pierrepont Central School','Parishville-Hopkinton Central School','St. Lawrence Central School','Edwards-Knox Central School','Hermon-DeKalb Central School','Clifton-Fine Central School','Hammond Central School','Heuvelton Central School','Morristown Central School'],
  companies: ['Rochester Regional Health','Claxton-Hepburn Medical Center','Massena Hospital'],
  churches: []
};
function ptHandle(e){ return effHandle(e); }
/* Location on file (Sheet column, JD 2026-10-15) is the person's single
   location: when set it wins over the derived city/hometown everywhere. */
function ptLocVal(e){ return gv(e, 'location_on_file') || gv(e, 'city') || gv(e, 'hometown') || ''; }
var PTCELL = {
  name: function(e){
    /* JD 2026-10-28: names only — the relationship/handle sub-line
       moved to its own Relationship column, so rows are one line
       and thin. */
    return '<div class="cname-in">' + avatar(e, 'sm') + '<span class="pn"><b>' + esc(dispName(e)) + '</b>' + milBadge(e) + '</span></div>';
  },
  tier: function(e){ return ptierCell(e); },
  loc: function(e){ return esc(ptLocVal(e)); },
  orgs: function(e){ var o = orgsOf(e); return '<span class="clip" title="' + esc(o.join(', ')) + '">' + esc(o.slice(0, 2).join(', ')) + '</span>'; },
  assoc: function(e){ return String(knownAssociates(e).length); },
  /* Correspondence (JD 2026-10-29): one standard unit everywhere —
     the exported iMessage thread's message count. Blank until an
     export exists for the person; never an events count. */
  msgs: function(e){ var mf = msgFor(e); return mf ? '<span class="ptmsg">' + ic('mail', 13) + mf.n + '</span>' : ''; },
  skills: function(e){ var s = tagList(gv(e, 'specialty')); return '<span class="clip" title="' + esc(s.join(', ')) + '">' + esc(s.slice(0, 2).join(', ')) + '</span>'; },
  rel: function(e){ var s = [cap(gv(e, 'relationship')), effHandle(e) ? '@' + effHandle(e) : ''].filter(Boolean).join(' · '); return '<span class="clip" title="' + esc(s) + '">' + esc(s) + '</span>'; },
  close: function(e){ return esc(cap(gv(e, 'closeness'))); },
  handle: function(e){ var h = ptHandle(e); return h ? '@' + esc(h) : ''; },
  groups: function(e){ var g = personGroups(e); return '<span class="clip" title="' + esc(g.join(', ')) + '">' + esc(g.slice(0, 2).join(', ')) + '</span>'; },
  years: function(e){ var y = knownSinceYear(e); return y ? String(y) : ''; },
  phone: function(e){ var p = gv(e, 'phone'); return p ? esc(fmtPhone(p)) : ''; },
  email: function(e){ return esc(gv(e, 'email')); },
  lastc: function(e){ var v = String(gv(e, 'last_contact') || '').trim(); if(!v) return ''; return lcOnline(e) ? '<span class="ptlc onl">Online · ' + esc(lcLabel(e)) + '</span>' : '<span class="ptlc">' + esc(lcLabel(e)) + '</span>'; },
  firstc: function(e){ var v = firstContactOf(e); return v ? esc(lcDateLabel(v)) : ''; }
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
  /* JD 2026-10-28: the Relationship column turns ON once for saved
     column sets too (it carries the sub-line the Name cell dropped);
     the Columns sheet can hide it again afterwards. */
  if(!store('ncc_pt_rel_v1')){
    out.forEach(function(c){ if(c.k === 'rel') c.on = true; });
    store('ncc_pt_rel_v1', '1');
    store('ncc_pt_cols', JSON.stringify(out));
  }
  /* Same one-time turn-on for the Correspondence column (V3.33.0). */
  if(!store('ncc_pt_msgs_v1')){
    out.forEach(function(c){ if(c.k === 'msgs') c.on = true; });
    store('ncc_pt_msgs_v1', '1');
    store('ncc_pt_cols', JSON.stringify(out));
  }
  PTC = out;
  return out;
}
function ptColDef(k){ for(var i = 0; i < PT_ALL.length; i++) if(PT_ALL[i].k === k) return PT_ALL[i]; return null; }
function ptVisibleCols(){ return ptCols().filter(function(c){ return c.on; }).map(function(c){ return ptColDef(c.k); }); }
/* fixed-layout column shares (People pass 2026-10-28): the table is
   table-layout:fixed at 100% width, so these are proportions, not pixels —
   any visible set is rescaled to fill the row and nothing can push the
   table wider than its region. */
var PT_W = { name:19, tier:10, loc:12, orgs:14, assoc:8, msgs:9, skills:12, rel:11, close:8, handle:10, groups:13, years:7, phone:10, email:13, updated:9, lastc:13, firstc:12 };
function ptColgroupHTML(){ return '<colgroup>' + ptVisibleCols().map(function(c){ return '<col style="width:' + (PT_W[c.k] || 10) + '%">'; }).join('') + '</colgroup>'; }
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
    '<p class="note">Tip: Shift-click any cell (except Associates, Handle, Last contact and First contact) to edit it in place. On a touch screen, press and hold the cell.</p>', { focus:false });
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
    D.directory.forEach(function(e){ tagList(gv(e, catK)).forEach(function(x){ ov.push(regApply(x)); }); });
    var cat = null; ORG_CATS.forEach(function(c){ if(c.k === catK) cat = c; });
    return ptDedupe(ov.concat(cat ? cat.options : []).concat(PT_SEED_ORGS[catK] || []).concat(regCanonFor(catK))).sort(function(a, b){ return a.localeCompare(b); });
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
function ptAcWire(inp, list, onPick, opts){
  var wrap = inp.parentNode, box = wrap ? $('.pted-ac', wrap) : null;
  if(!box) return;
  var hits = [], act = -1;
  /* deliberate: true only after JD navigates the highlight himself
     (ArrowUp/ArrowDown/Home/End). The pre-highlight show() paints on
     the first match is PASSIVE — it is not a choice he made. */
  var deliberate = false;
  function hide(){ box.hidden = true; box.innerHTML = ''; hits = []; act = -1; deliberate = false; }
  function mark(){
    $$('.pted-aci', box).forEach(function(b, i){
      b.classList.toggle('on', i === act);
      if(i === act && b.scrollIntoView) b.scrollIntoView({ block:'nearest' });
    });
  }
  function pick(v){ onPick(opts && opts.resolve ? opts.resolve(v) : v); hide(); }
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
    box.innerHTML = hits.map(function(h){ var lb = (opts && opts.label) ? opts.label(h) : h; return '<button type="button" class="pted-aci" data-v="' + esc(h) + '" title="' + esc(lb) + '">' + esc(lb) + '</button>'; }).join('');
    box.hidden = false;
    act = 0;   /* first match pre-highlighted — PASSIVE until he arrows to a choice */
    deliberate = false;
    $$('.pted-aci', box).forEach(function(b, i){
      var fired = false;
      function go(ev){ if(fired) return; fired = true; ev.preventDefault(); pick(b.getAttribute('data-v')); }
      b.addEventListener('pointerdown', go);   /* lands before the input's blur on touch, so the pick always registers */
      b.addEventListener('mousedown', go);
      b.addEventListener('mouseenter', function(){ act = i; mark(); });
    });
    mark();
    ptEdFit();
    flip();
  }
  /* Flip the list UP when it would run past the bottom of the screen
     and there is more room above the field than below it — on a phone
     the editor often sits low, and a downward list ran off the fold
     (JD 2026-10-16: every suggestion visible, all the way down).
     Only the Audit card list is positioned to use the class. */
  function flip(){
    box.classList.remove('up');
    var r = box.getBoundingClientRect();
    if(r.bottom <= window.innerHeight - 4) return;
    var ir = inp.getBoundingClientRect();
    if(ir.top - 8 > window.innerHeight - ir.bottom) box.classList.add('up');
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
      act = (act + (ev.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length; deliberate = true; mark();
    }
    else if(ev.key === 'Home' || ev.key === 'End'){
      if(open){ ev.preventDefault(); ev.stopPropagation(); act = ev.key === 'Home' ? 0 : hits.length - 1; deliberate = true; mark(); }
    }
    else if(ev.key === 'Enter'){
      /* opts.enterPick may veto the Enter-pick (return false): the event
         then falls through to the field's own Enter handler instead of
         picking the highlighted match. Every Audit text editor uses it —
         a typed value commits only when IT is complete, never because
         Enter happened to pick the highlighted suggestion. The veto
         lifts for a DELIBERATE highlight: once JD has arrowed to the
         suggestion he wants, Enter is his pick, exactly like a click
         (JD 2026-10-16: "I arrow down to it, I hit Enter, and that
         enters it"). A passive pre-highlight is NOT a pick — typing
         "Po" and pressing Enter still commits nothing. */
      if(open && act >= 0 && (deliberate || !(opts && opts.enterPick && !opts.enterPick(hits[act])))){ ev.preventDefault(); ev.stopPropagation(); pick(hits[act]); }
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
  if(k === 'close'){
    var cc2 = gv(e, 'closeness');
    var copts = [['', 'Not set']].concat(CLOSE_OPTS.map(function(r){ return [r, cap(r)]; }));
    return '<div class="pted-h">Closeness</div><div class="pted-opts">' + copts.map(function(o){
      return '<button type="button" class="pted-opt' + (cc2 === o[0] ? ' on' : '') + '" data-v="' + o[0] + '">' + o[1] + '</button>';
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
  if(k === 'years') return '<div class="pted-h">Known since</div>' + ptTextEd(String(gv(e, 'years_known') || ''), 'Year, e.g. 2019, 2019-03 or 2019-03-14');
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
  if(k === 'tier' || k === 'rel' || k === 'close'){
    $$('.pted-opt', pop).forEach(function(b){
      b.addEventListener('click', function(){
        var v = b.getAttribute('data-v'), e = D.directory[di];
        if(k === 'tier') txn('Set tier', function(){ queuePatch(di, { tier:v }); });
        else if(k === 'close'){
          var curC = gv(e, 'closeness'), nextC = (v && v === curC) ? '' : v;
          txn('Set closeness', function(){ queuePatch(di, { closeness:nextC }); });
        }
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
      var list = k === 'orgs' ? ptOrgSug(fieldK) : ptSugList('skill', fieldK);
      function addVal(val){
        val = String(val || '').trim(); if(!val) return;
        if(k === 'orgs'){ val = regApply(val); val = orgPrefixComplete(val, fieldK); if(!ORGREG.canon[regKey(val)]) regRegisterCanon(val, fieldK); }
        ptTagsMutate(di, fieldK, function(a){
          if(a.map(function(x){ return x.toLowerCase(); }).indexOf(val.toLowerCase()) < 0) a.push(val);
          return a;
        });
        ptEdRefresh(fieldK);
      }
      inp.addEventListener('keydown', function(ev){ if(ev.key === 'Enter'){ ev.preventDefault(); addVal(inp.value); } });
      if(k === 'orgs') ptAcWire(inp, list, addVal, { label:regSugLabel, resolve:regApply });
      else ptAcWire(inp, list, addVal);
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
    if(gn){
      gn.addEventListener('keydown', function(ev){
        if(ev.key !== 'Enter') return;
        ev.preventDefault();
        var n = regApply(gn.value.trim()); if(!n) return;
        if(!allGroups()[n]){ GRP_EXTRA.push(n); store('ncc_groups_extra', JSON.stringify(GRP_EXTRA)); }
        if(!ORGREG.canon[regKey(n)]) regRegisterCanon(n, 'groups');
        var e = D.directory[di], gl = personGroups(e);
        if(gl.indexOf(n) < 0){ gl.push(n); txn('Edit groups', function(){ setPersonGroups(di, gl); }); if(PTED) PTED.dirty = true; }
        ptEdRefresh();
      });
      /* Existing-group autocomplete (JD 2026-10-27): a pick fills the
         box; the Enter handler above still does the commit, so typing
         a near-match no longer spawns a duplicate group. */
      var gnBox = document.createElement('div'); gnBox.className = 'pted-ac'; gnBox.hidden = true;
      gn.parentNode.appendChild(gnBox);
      ptAcWire(gn, ptDedupe(Object.keys(allGroups()).concat(regCanonFor('groups') || [])).sort(function(a, b){ return a.localeCompare(b); }),
        function(v){ gn.value = v; gn.focus(); });
    }
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
/* Layout (JD 2026-10-26 overnight sweep, audit F1/F24): two stacked
   movements — "About [Name]" holds everything that is just about the
   person; "Connection" holds everything about JD's tie to them. ord is
   the order inside the movement and therefore the single-column
   (mobile) sequence too (F2). wide sections span the movement grid. */
var SECS = [
  { id:'about',       t:'About',          mv:'a', ord:1, wide:1, w:['onfile'] },
  { id:'identity',    t:'Contact',        mv:'a', ord:2, w:['identity'] },
  { id:'background',  t:'Background',     mv:'a', ord:3, w:['background', 'education'] },
  { id:'persona',     t:'Persona',        mv:'a', ord:4, w:['ratings'] },
  { id:'files',       t:'Files',          mv:'a', ord:5, w:['files'] },
  { id:'business',    t:'Business Owner', mv:'a', ord:6, w:['business'] },
  { id:'relationship',t:'Relationship',   mv:'c', ord:1, w:['relationship'] },
  { id:'connections', t:'Connections',    mv:'c', ord:2, w:['connections'] },
  { id:'timeline',    t:'Timeline',       mv:'c', ord:3, wide:1, w:['timeline'] },
  { id:'lima',        t:'Lima Charlie note', mv:'c', ord:4, w:['lima'] }
];
function secDef(id){ return SECS.filter(function(s){ return s.id === id; })[0]; }
/* Rough content weight per section (V3.38.0): drives the adaptive sheet
   ratio and short-section pairing in paintProfile. Counts only — the
   layout heuristics never change what renders. */
function secSize(e, id){
  switch(id){
    case 'about': return (gv(e, 'synopsis') ? 3 : 0) + Math.min(6, footprintOf(e).blocks.length);
    case 'identity': return [effHandle(e), e.fb_url, (e.snap_handles || []).length, gv(e, 'also_known_as'), gv(e, 'location_on_file'), gv(e, 'phone'), gv(e, 'email'), e.city, e.hometown, (e.languages || []).length].filter(Boolean).length;
    case 'background': return Math.min(10, tagList(gv(e, 'specialty')).length + degreesOf(e).length + honorsOf(e).length + parsePipe(gv(e, 'highlights')).length + ORG_CATS.reduce(function(n, c){ return n + tagList(gv(e, c.k)).length; }, 0));
    case 'persona': return PERSONA.filter(function(p){ return (parseInt(gv(e, p[0]), 10) || 0) > 0; }).length;
    case 'files': return (e.files || []).length + (msgFor(e) ? 1 : 0);
    case 'business': return (e.businesses || []).length * 2;
    case 'relationship': return [tierOf(e), gv(e, 'relationship'), gv(e, 'context'), gv(e, 'category'), knownSinceLabel(e), momVal(e)].filter(Boolean).length + personGroups(e).length;
    case 'connections': return knownAssociates(e).length + famLinks(e).length;
    case 'timeline': return Math.min(12, (e.events || []).length) + connPhases(e).length * 2;
    case 'lima': return 3;
  }
  return 3;
}
function shortSec(it){ return it.size <= 4 && it.id !== 'about' && it.id !== 'files'; }
function secWaivedUI(e, id){ var d = secDef(id); return d.w.every(function(w){ return secWaived(e, w); }); }
function secHasContent(e, id){
  switch(id){
    case 'identity': return true;
    case 'relationship': return true;
    case 'about': return !!(gv(e, 'synopsis') || footprintOf(e).blocks.length);
    case 'background': return !!(gv(e, 'specialty') || ORG_CATS.some(function(c){ return tagList(gv(e, c.k)).length; }) || degreesOf(e).length || gv(e, 'highlights') || gv(e, 'achievements') || (e.languages || []).length);
    case 'connections': return !!(knownAssociates(e).length || famLinks(e).length);
    case 'timeline': return !!((e.events || []).length || connPhases(e).length);
    case 'files': return !!((e.files || []).length || msgFor(e));
    case 'business': return !!((e.businesses || []).length);
    case 'persona': return PERSONA.some(function(p){ return gv(e, p[0]) !== ''; });
  }
  return false;
}
function secShown(e, id){
  if(S.prof.edit[id]) return true;
  /* Lima Charlie note (JD 2026-10-17): the card exists on the profile only
     while a note is waiting (or its editor is open); with no note it folds
     into the "Add to this profile" row like any unfilled section. */
  if(id === 'lima') return !!lcNote(e).trim();
  /* Business Owner (JD 2026-10-27): a derived section — it exists only
     while the Business Pulse sidecar maps a business to this person. */
  if(id === 'business') return secHasContent(e, 'business');
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
  /* The crumb names where Back actually lands (V3.38.0): the previous
     history entry when there is one, else the context section. */
  var prevE = S.depth > 0 ? HIST[S.depth - 1] : null;
  var backTo = prevE && prevE.label ? prevE.label : (S.ctx && S.ctx.label ? S.ctx.label : 'People');
  var pager = '';
  if(S.ctx && S.ctx.keys){
    var i = S.ctx.keys.indexOf(pkey(e));
    if(i >= 0){
      pager = '<div class="pager"><button type="button" class="ib" data-act="ctxstep" data-d="-1" aria-label="Previous"' + (i === 0 ? ' disabled' : '') + '>' + ic('chevl', 18) + '</button>' +
        '<span>' + esc(S.ctx.label) + ' <b>' + (i + 1) + ' / ' + S.ctx.keys.length + '</b></span>' +
        '<button type="button" class="ib" data-act="ctxstep" data-d="1" aria-label="Next"' + (i === S.ctx.keys.length - 1 ? ' disabled' : '') + '>' + ic('chevr', 18) + '</button></div>';
    }
  }
  v.innerHTML = '<div class="page profile" data-di="' + di + '"><div class="ptop">' +
    '<div class="pback"><button type="button" class="ib" data-act="back" aria-label="Back">' + ic('chevl', 20) + '</button>' +
    '<button type="button" class="crumb" data-act="back" title="Back to ' + esc(backTo) + '">Back to ' + esc(backTo) + '</button>' +
    (HIST[S.depth + 1] ? '<button type="button" class="crumb fwd" data-act="fwd" title="Forward to ' + esc(HIST[S.depth + 1].label) + '">Forward to ' + esc(HIST[S.depth + 1].label) + ' ' + ic('chevr', 13) + '</button>' : '') + '</div>' + pager + '<span class="sp"></span>' +
    '<div class="menu"><button type="button" class="ib" data-act="menu" aria-haspopup="true" aria-label="More actions">' + ic('dots', 20) + '</button>' +
    '<div class="menu-pop" hidden>' +
    '<button type="button" data-act="export" data-di="' + di + '">' + ic('download', 16) + 'Download personnel file</button>' +
    '<button type="button" data-act="viewdoc" data-di="' + di + '">' + ic('book', 16) + 'Open personnel file in a new tab</button>' +
    '<button type="button" data-act="newdoc" data-di="' + di + '">' + ic('file', 16) + 'New Drive doc</button>' +
    '<button type="button" data-act="mergeopen" data-di="' + di + '">' + ic('merge', 16) + 'Merge with another profile…</button>' +
    '<hr><button type="button" class="danger" data-act="delperson" data-di="' + di + '">' + ic('trash', 16) + 'Remove from the circle</button></div></div></div>' +
    '<section id="p-hero" class="hero"></section><div id="p-lastline"></div>' +
    '<div class="psheets">' +
    '<div class="pmove sheet-a" id="pm-a"><div class="pmove-h"><span class="pmh-t">About ' + esc(dispName(e).split(' ')[0]) + '</span><span class="pmh-ln"></span><span class="pmh-n" id="pmn-a"></span></div><div class="pgrid" id="pmg-a"></div></div>' +
    '<div class="pmove sheet-c" id="pm-c"><div class="pmove-h"><span class="pmh-t">Connection</span><span class="pmh-ln"></span><span class="pmh-n" id="pmn-c"></span></div><div class="pgrid" id="pmg-c"></div></div>' +
    '</div><div id="p-add"></div></div>';
  paintProfile(di);
}
function paintProfile(di){
  if(lcActive() && S.audit.lcOpen === di){ lcRepaint(); return; }
  phLoad(); msgLoad();
  var e = D.directory[di];
  /* Wholesale repaint is the fallback path (audit F14): preserve the
     reader's place across it — scroll position survives a re-render. */
  var _sy = $('#p-hero') ? window.scrollY : null;
  $('#p-hero').innerHTML = heroHTML(di);
  var ll1 = $('#p-lastline'); if(ll1) ll1.innerHTML = lastLineHTML(di);
  var weights = { a:0, c:0 };
  ['a', 'c'].forEach(function(mv){
    var list = SECS.filter(function(s){ return s.mv === mv && secShown(e, s.id); })
      .sort(function(x, y){ return x.ord - y.ord; });
    list.forEach(function(s){ weights[mv] += secSize(e, s.id); });
    var secs;
    if(mv === 'a'){
      /* Adaptive packing (JD 2026-10-29): two short sections share a row
         instead of each taking a full-width band over dead space. */
      var items = list.map(function(s){ return { id:s.id, ord:s.ord, size:secSize(e, s.id), html:secHTML(di, s.id) }; });
      var out = [];
      for(var j = 0; j < items.length; j++){
        var nx = items[j + 1];
        if(nx && shortSec(items[j]) && shortSec(nx)){ out.push('<div class="bandrow" style="order:' + items[j].ord + '">' + items[j].html + nx.html + '</div>'); j++; }
        else out.push(items[j].html);
      }
      secs = out.join('');
    } else secs = list.map(function(s){ return secHTML(di, s.id); }).join('');
    var grid = $('#pmg-' + mv), wrap = $('#pm-' + mv);
    if(grid) grid.innerHTML = secs;
    if(wrap) wrap.style.display = secs ? '' : 'none';
  });
  var shEl = document.querySelector('.psheets');
  if(shEl){
    shEl.classList.remove('wide-a', 'wide-c');
    if(weights.c <= 6 && weights.a >= 10) shEl.classList.add('wide-a');
    else if(weights.c > weights.a) shEl.classList.add('wide-c');
  }
  SECS.forEach(function(s){ var el = $('#sec-' + s.id); if(el) el.style.order = s.ord; });
  /* Sheet header counts (Split Partitions, V3.37.0): the About sheet
     counts Synopsis and Web Record as separate sections when present. */
  var cntA = (gv(e, 'synopsis') ? 1 : 0) + (footprintOf(e).blocks.length ? 1 : 0) +
    ['identity', 'background', 'persona', 'files', 'business'].filter(function(id){ return secShown(e, id); }).length;
  var cntC = ['relationship', 'connections', 'timeline', 'lima'].filter(function(id){ return secShown(e, id); }).length;
  var na = $('#pmn-a'), nc2 = $('#pmn-c');
  if(na) na.textContent = cntA + (cntA === 1 ? ' SECTION' : ' SECTIONS');
  if(nc2) nc2.textContent = cntC + (cntC === 1 ? ' SECTION' : ' SECTIONS');
  if(_sy != null) window.scrollTo(0, _sy);
  var hidden = SECS.filter(function(s){ return s.id !== 'business' && !secShown(e, s.id); });
  var legacy = ['relationship_type', 'sources', 'mentions'].filter(function(k){ return String(gv(e, k)).trim(); });
  $('#p-add').innerHTML = (hidden.length ? '<div class="addrow"><span>Add to this profile</span>' + hidden.map(function(s){
      return '<button type="button" class="btn ghost sm" data-act="secedit" data-sec="' + s.id + '">' + ic('plus', 13) + esc(s.t) + '</button>'; }).join('') + '</div>' : '') +
    (legacy.length ? '<details class="legacy"><summary>Legacy notes (read only)</summary>' + legacy.map(function(k){ return '<div><b>' + esc({ relationship_type:'Type', sources:'Sources', mentions:'Mentions' }[k]) + '</b><p>' + esc(gv(e, k)) + '</p></div>'; }).join('') + '</details>' : '');
  profWireAc();
}
function repaintSec(id){
  var di = S.prof.di, e = D.directory[di]; if(di == null) return;
  if(lcActive() && S.audit.lcOpen === di){ lcRepaint(); return; }
  var el = $('#sec-' + id);
  if(!el){ paintProfile(di); return; }
  var wrap = document.createElement('div'); wrap.innerHTML = secHTML(di, id);
  var nu = wrap.firstChild; nu.style.order = secDef(id).ord;
  el.parentNode.insertBefore(nu, el); el.remove();
  profWireAc();
}
function repaintTop(){
  var di = S.prof.di; if(di == null) return;
  if(lcActive() && S.audit.lcOpen === di){ lcRepaint(); return; }
  if(!$('#p-hero')) return;
  $('#p-hero').innerHTML = heroHTML(di);
  var ll2 = $('#p-lastline'); if(ll2) ll2.innerHTML = lastLineHTML(di);
}

/* The latest filed contact event as one plain line under the hero
   (UI arena 2026-10-29: Teams B + C merged item). Exactly as filed —
   date label + the preserved thread sentence, no derivation, no card.
   The Log contact door at its end opens the existing Timeline editor. */
function lastLineHTML(di){
  var e = D.directory[di]; if(!e) return '';
  var cs = (e.events || []).filter(function(ev){ return ev && ev.kind === 'contact' && ev.date; })
    .sort(function(a, b){ return (flexKey(b.date) || 0) - (flexKey(a.date) || 0); });
  if(!cs.length) return '';
  var ev = cs[0];
  return '<span class="pll-when">' + esc(lcDateLabel(ev.date)) + '</span>' +
    (ev.summary ? '<span class="pll-sum">' + esc(briefClip(ev.summary, 170)) + '</span>' : '') +
    '<button type="button" class="pll-log" data-act="logcontact">Log contact</button>';
}
/* ---------- Entity pills (Split Partitions, V3.37.0) ----------
   Known places and organizations inside narrative text render as small
   color-coded pills. The dictionary is built ONLY from entities the
   profile itself defines (its org lists, degree schools, groups, places,
   plus org-registry aliases of those canonicals). Longest match wins;
   no guessing, no global lookup. Applied to: synopsis, web record,
   background highlights, relationship context, timeline notes. */
var PILL_IC = { place:'pin', employer:'briefcase', school:'cap', church:'church', group:'people' };
var PILL_TY = { place:'Place', employer:'Employer', school:'School', church:'Church', group:'Group' };
var US_STATES = { AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California', CO:'Colorado', CT:'Connecticut', DE:'Delaware', DC:'District of Columbia', FL:'Florida', GA:'Georgia', HI:'Hawaii', ID:'Idaho', IL:'Illinois', IN:'Indiana', IA:'Iowa', KS:'Kansas', KY:'Kentucky', LA:'Louisiana', ME:'Maine', MD:'Maryland', MA:'Massachusetts', MI:'Michigan', MN:'Minnesota', MS:'Mississippi', MO:'Missouri', MT:'Montana', NE:'Nebraska', NV:'Nevada', NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico', NY:'New York', NC:'North Carolina', ND:'North Dakota', OH:'Ohio', OK:'Oklahoma', OR:'Oregon', PA:'Pennsylvania', RI:'Rhode Island', SC:'South Carolina', SD:'South Dakota', TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont', VA:'Virginia', WA:'Washington', WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming' };
var PILL_CACHE = {};
function pillExpandPlace(pl){
  pl = String(pl || '').trim(); if(!pl) return [];
  var out = [pl], m = pl.match(/^(.+?),\s*([A-Za-z]{2})$/);
  if(m && US_STATES[m[2].toUpperCase()]){ out.push(m[1] + ', ' + US_STATES[m[2].toUpperCase()]); out.push(m[1]); }
  else { var m2 = pl.match(/^(.+?),\s*([A-Za-z ]+)$/); if(m2) out.push(m2[1]); }
  return out;
}
function pillDict(di){
  var e = D.directory[di]; if(!e) return null;
  var key = pkey(e);
  if(PILL_CACHE[key]) return PILL_CACHE[key];
  var ents = [], seen = {};
  function add(name, type, canon){
    name = String(name || '').trim(); if(name.length < 3) return;
    var k = name.toLowerCase(); if(seen[k]) return; seen[k] = 1;
    ents.push({ name:name, type:type, canon:canon || name });
  }
  tagList(gv(e, 'companies')).forEach(function(o){ add(o, 'employer'); });
  degreesOf(e).forEach(function(d){ add(d.school, 'school'); });
  tagList(gv(e, 'universities')).forEach(function(o){ add(o, 'school'); });
  tagList(gv(e, 'churches')).forEach(function(o){ add(o, 'church'); });
  personGroups(e).forEach(function(o){ add(o, 'group'); });
  var byCanon = {};
  ents.slice().forEach(function(x){ byCanon[regKey(x.canon)] = x; });
  Object.keys(ORGREG.aliases || {}).forEach(function(ak){
    var cx = byCanon[regKey(ORGREG.aliases[ak])];
    if(cx) add(ORGREG.aliasDisp[ak] || ak, cx.type, cx.canon);
  });
  [gv(e, 'location_on_file'), e.city, e.hometown].forEach(function(pl){
    pillExpandPlace(pl).forEach(function(v){ add(v, 'place', String(pl || '').trim()); });
  });
  if(!ents.length){ PILL_CACHE[key] = null; return null; }
  ents.sort(function(a, b){ return b.name.length - a.name.length; });
  var map = {};
  ents.forEach(function(x){ map[x.name.toLowerCase()] = x; });
  var rx = new RegExp('(?<![A-Za-z0-9-])(' + ents.map(function(x){ return x.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')(?![A-Za-z0-9-])', 'gi');
  PILL_CACHE[key] = { rx:rx, map:map };
  return PILL_CACHE[key];
}
function pillify(text, di){
  text = String(text == null ? '' : text); if(!text) return '';
  var pd = pillDict(di); if(!pd) return esc(text);
  var out = '', last = 0, m; pd.rx.lastIndex = 0;
  while((m = pd.rx.exec(text))){
    var ent = pd.map[m[1].toLowerCase()]; if(!ent) continue;
    /* A bare city name followed by another capitalized word is part of a
       longer proper name (Edwards Knox High School), not the place. */
    if(ent.type === 'place' && ent.name.indexOf(',') < 0 && /^\s+[A-Z]/.test(text.slice(m.index + m[1].length))) continue;
    var ttl = esc(PILL_TY[ent.type] + (ent.canon !== m[1] ? ' · ' + ent.canon : '')), inner = ic(PILL_IC[ent.type], 10) + esc(m[1]);
    out += esc(text.slice(last, m.index));
    if(ent.type === 'place'){
      out += '<button type="button" class="epill t-place" data-act="placeopen" data-city="' + esc(ent.canon.split(',')[0].trim()) + '" data-place="' + esc(ent.canon) + '" title="' + ttl + '">' + inner + '</button>';
    } else {
      var kind = { employer:'companies', school:'universities', church:'churches', group:'groups' }[ent.type];
      out += '<a class="epill t-' + ent.type + '" href="#/groups/' + kind + '/' + encodeURIComponent(ent.canon) + '" title="' + ttl + '">' + inner + '</a>';
    }
    last = m.index + m[1].length;
  }
  return out + esc(text.slice(last));
}
/* Place pills open a sheet of everyone filed under that place
   (V3.38.0): the place's own "profile" is its people. */
function placeOpen(city, place){
  var cl = String(city || '').toLowerCase(), hits = [];
  D.directory.forEach(function(x, xi){
    if(!liveEntry(x)) return;
    var cs = [x.city, x.hometown, gv(x, 'location_on_file')].map(function(s2){ return String(s2 || '').split(',')[0].trim().toLowerCase(); });
    if(cs.indexOf(cl) >= 0) hits.push(xi);
  });
  hits.sort(function(a, b){
    var sa = scoreFor(a), sb = scoreFor(b);
    return ((sb ? sb.score : 0) - (sa ? sa.score : 0)) || dispName(D.directory[a]).localeCompare(dispName(D.directory[b]));
  });
  var body = hits.length ? '<div class="plrows">' + hits.map(function(xi){
    var x = D.directory[xi], sub = [cap(gv(x, 'relationship')), cap(gv(x, 'context'))].filter(Boolean).join(' · ');
    return '<a class="plrow" href="#/p/' + encodeURIComponent(personId(x)) + '" data-act="openp" data-di="' + xi + '">' + avatar(x, 'sm') + '<span class="pl-main"><b>' + esc(dispName(x)) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' + ic('chevr', 15) + '</a>';
  }).join('') + '</div>' : '<p class="dim">No one is filed under ' + esc(place || city) + '.</p>';
  openSheet('People in ' + (place || city), body, { wide:true, focus:false });
}
/* ---------- Instrument header (Split Partitions, V3.37.0) ---------- */
function ringScoreSVG(v){
  var r = 25, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, v)) / 100);
  return '<svg class="ring" viewBox="0 0 64 64" width="62" height="62" aria-hidden="true"><circle cx="32" cy="32" r="' + r + '" fill="none" stroke="var(--ringtrk)" stroke-width="6"/>' +
    '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="#e30613" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 32 32)"/>' +
    '<text x="32" y="39" text-anchor="middle" class="ring-n">' + v + '</text></svg>';
}
function ringSecsSVG(pres){
  var cx = 32, cy = 32, r = 25, n = pres.length, step = 360 / n, gap = 5, out = '';
  function pol(a){ var t = (a - 90) * Math.PI / 180; return (cx + r * Math.cos(t)).toFixed(1) + ' ' + (cy + r * Math.sin(t)).toFixed(1); }
  for(var i = 0; i < n; i++){
    var a0 = i * step + gap / 2, a1 = (i + 1) * step - gap / 2;
    out += '<path d="M ' + pol(a0) + ' A ' + r + ' ' + r + ' 0 0 1 ' + pol(a1) + '" fill="none" stroke="' + (pres[i][2] ? pres[i][1] : 'var(--ringtrk)') + '" stroke-width="6.5"/>';
  }
  var cnt = pres.filter(function(p){ return p[2]; }).length;
  return '<svg class="ring" viewBox="0 0 64 64" width="62" height="62" aria-hidden="true">' + out +
    '<text x="32" y="37.5" text-anchor="middle" class="ring-s">' + cnt + '/' + n + '</text></svg>';
}
function profileSections(di){
  var e = D.directory[di];
  var hasContact = !!(effHandle(e) || e.fb_url || (e.snap_handles || []).length || gv(e, 'phone') || gv(e, 'email') || gv(e, 'location_on_file') || e.city || e.hometown || gv(e, 'also_known_as') || (e.languages || []).length);
  return [
    ['Synopsis', '#475569', !!gv(e, 'synopsis')],
    ['Web Record', '#d97706', footprintOf(e).blocks.length > 0],
    ['Contact', '#2563eb', hasContact],
    ['Background', '#7c3aed', secHasContent(e, 'background')],
    ['Persona', '#4d7c0f', secHasContent(e, 'persona')],
    ['Files', '#0d9488', secHasContent(e, 'files')],
    ['Connection', '#e30613', true]
  ];
}
function heroHTML(di){
  var e = D.directory[di];
  /* Location resolved location_on_file -> city -> hometown, normalized;
     the @handle never renders in the hero (it lives in the Contact card). */
  var loc = ptNormLoc(ptLocVal(e));
  var ds = sortDegrees(degreesOf(e)).slice(0, 3).map(function(d){
    var bits = [d.degree, d.year ? yy(d.year) : ''].filter(Boolean).join(' ');
    return '<span class="dbadge">' + ic('cap', 12) + '<b>' + esc(schoolShort(d.school)) + '</b>' + (bits ? '<i>' + esc(bits) + '</i>' : '') + '</span>';
  }).join('');
  var cs = certsOf(e).slice(0, 2).map(function(c){ return '<span class="dbadge cert">' + ic('shield', 12) + '<i>' + esc(c) + '</i></span>'; }).join('');
  function mi(lab, val){ return val ? '<div class="ih-mi"><small>' + lab + '</small><b>' + esc(val) + '</b></div>' : ''; }
  var meta = mi('Location', loc) + mi('Relationship', cap(gv(e, 'relationship'))) + mi('Context', cap(gv(e, 'context'))) +
    mi('Known since', knownSinceLabel(e)) + (lcLabel(e) ? mi(lcOnline(e) ? 'Last contact online' : 'Last contact', lcLabel(e)) : '');
  var ph = phHeroHTML(e);
  var sc = scoreFor(di), pres = profileSections(di);
  return '<div class="ih-id">' + (ph ? '' : avatar(e, 'xl')) +
    '<div class="ih-main"><h1 class="display" data-act="secedit" data-sec="identity" title="Tap to edit the name">' + esc(dispName(e)) + milBadge(e) + '<span class="hcue">' + ic('edit', 15) + '</span></h1>' +
    (meta ? '<div class="ih-meta">' + meta + '</div>' : '') +
    ((ds || cs) ? '<div class="hrow">' + ds + cs + '</div>' : '') + '</div></div>' +
    (ph ? '<div class="ih-photo">' + ph + '</div>' : '') +
    '<div class="ih-score">' + ringScoreSVG(sc ? sc.score : 0) + '<div class="ih-slab"><b>Score</b><span>of 100</span></div></div>' +
    '<div class="ih-secs">' + ringSecsSVG(pres) + '<div class="ih-legend">' + pres.map(function(p){
      return '<span class="lg' + (p[2] ? '' : ' off') + '"><i style="--lgc:' + p[1] + '"></i>' + p[0] + '</span>';
    }).join('') + '</div></div>';
}
/* ---------- Brief derivations (JD 2026-10-28; profile card retired
   V3.31.0, JD 2026-10-29) ----------
   briefOf() derives five lines from data already on file (in motion,
   last contact, ask-about, shared world, careful). The profile Brief
   card that rendered them is gone — profiles are a synopsis-led
   informational packet again, and JD infers the rest himself. The
   derivations stay: Home's Last contacts card builds its thread
   previews from them. Nothing is stored. */
var BRIEF_OPEN_RE = /left off|ask about|follow[\s-]?up/i;
var BRIEF_CARE_RE = /\b(died|death|passed away|funeral|obituar\w*|cancer|hospice|terminal)\b/i;
var BRIEF_MON = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
function briefTextDate(t){
  var m = String(t || '').match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i);
  if(m) return (+m[2]) * 100 + (BRIEF_MON[m[1].slice(0, 3).toLowerCase()] || 1);
  var y = String(t || '').match(/\b(19|20)\d{2}\b/);
  return y ? (+y[0]) * 100 + 1 : null;
}
function briefClean(t){ return String(t || '').replace(/\s*\([^()]*\)\s*$/, '').trim(); }
function briefSentence(text){
  var parts = String(text || '').split(/(?<=[.!?])\s+/);
  for(var i = 0; i < parts.length; i++){ if(BRIEF_OPEN_RE.test(parts[i])) return parts[i].trim(); }
  return '';
}
function briefClip(t, n){ t = String(t || '').trim(); return t.length > n ? t.slice(0, n - 1).trim() + '…' : t; }
var BRIEF_JD = undefined;
function briefJdGroups(){
  if(BRIEF_JD === undefined){
    BRIEF_JD = [];
    D.directory.forEach(function(x){ if(pkey(x) === 'ig:jdmeyers_') BRIEF_JD = personGroups(x); });
  }
  return BRIEF_JD;
}
function briefOf(e){
  var out = {};
  var evs = (e.events || []).filter(function(ev){ return ev && ev.date; });
  var contacts = evs.filter(function(ev){ return ev.kind === 'contact'; })
    .sort(function(a, b){ return (flexKey(b.date) || 0) - (flexKey(a.date) || 0); });
  var lastEv = contacts[0] || null;
  /* In motion: newest dated footprint item; else the latest Live Records
     change logged for this person; else the newest footprint block. */
  var blocks = footprintOf(e).blocks.map(function(b){ return b.text; }).filter(Boolean);
  /* A parsed block can hold several bullets (separated only by •), so
     split to single facts before dating — one bullet is one fact. */
  var items = [];
  blocks.forEach(function(t){
    String(t).split(/\s*•\s*/).forEach(function(s){ s = s.trim(); if(s) items.push(s); });
  });
  var motion = '', bestK = -1;
  items.forEach(function(t){ var k = briefTextDate(t); if(k != null && k > bestK){ bestK = k; motion = t; } });
  if(!motion && typeof CH !== 'undefined' && CH && CH.entries){
    var dn = dispName(e).toLowerCase();
    for(var ci = 0; ci < CH.entries.length; ci++){
      if(String(CH.entries[ci].name || '').toLowerCase() === dn){ motion = CH.entries[ci].what || ''; break; }
    }
  }
  if(!motion && items.length) motion = items[items.length - 1];
  if(motion) out.motion = briefClip(briefClean(motion), 180);
  /* Last contact: the newest contact event; else a waiting note; else the stamp. */
  var note = lcNote(e).trim();
  if(lastEv) out.last = lcDateLabel(lastEv.date) + (lastEv.summary ? ' — ' + briefClip(lastEv.summary, 140) : '');
  else if(note) out.last = 'Note waiting — ' + briefClip(note, 140);
  else if(String(gv(e, 'last_contact') || '').trim()) out.last = lcLabel(e);
  /* Ask about (deterministic): an open item in the latest note wins; then
     the in-motion item; then the most recent timeline event; then the
     first Interests chip. Provenance is tagged on the line. */
  var ask = '', prov = '';
  if(note){ var s1 = briefSentence(note); if(s1){ ask = s1; prov = 'from your last note'; } }
  if(!ask && lastEv && lastEv.summary){ var s2 = briefSentence(lastEv.summary); if(s2){ ask = s2; prov = 'from your last note'; } }
  if(!ask && out.motion){ ask = out.motion; prov = 'from their record'; }
  if(!ask && evs.length){
    var sev = sortedEvents(e)[0];
    if(sev && sev.ev.summary){ ask = briefClip(sev.ev.summary, 160); prov = 'from their record'; }
  }
  if(!ask){ var ints = tagList(gv(e, 'interests')); if(ints.length){ ask = ints[0]; prov = 'from their record'; } }
  if(ask) out.ask = { text: briefClip(ask, 180), prov: prov };
  /* Shared world: a group JD and this person are both in; else the known
     associate with the most recent activity on their own profile. */
  var shared = personGroups(e).filter(function(g){ return briefJdGroups().indexOf(g) >= 0; });
  if(shared.length) out.shared = 'Both in ' + shared[0];
  else {
    var ka = knownAssociates(e), bestA = null, bestAk = -1;
    ka.forEach(function(nb){
      var adi = BYN[(nb.u || '').toLowerCase()]; if(adi == null) return;
      var ae = D.directory[adi], k = flexKey(gv(ae, 'last_contact')) || 0;
      (ae.events || []).forEach(function(ev){ var ek = flexKey(ev.date) || 0; if(ek > k) k = ek; });
      if(k > bestAk){ bestAk = k; bestA = { di: adi, e: ae }; }
    });
    if(bestA) out.shared = { name: dispName(bestA.e), di: bestA.di };
    else if(ka.length){
      var fdi = BYN[(ka[0].u || '').toLowerCase()];
      out.shared = { name: ka[0].d || ka[0].u, di: fdi != null ? fdi : null };
    }
  }
  /* Careful: a death or serious-illness timeline event within ~2 years. */
  var nowD = new Date();
  var cutoff = new Date(nowD.getFullYear() - 2, nowD.getMonth(), nowD.getDate()).getTime();
  var care = null;
  evs.forEach(function(ev){
    if(ev.kind === 'contact') return;
    var k = flexKey(ev.date); if(k == null || k < cutoff) return;
    if(BRIEF_CARE_RE.test(String(ev.summary || '') + ' ' + String(ev.detail || ''))){
      if(!care || k > care.k) care = { k: k, ev: ev };
    }
  });
  if(care) out.careful = evDate(care.ev.date) + ' — ' + briefClip(care.ev.summary || '', 140);
  return out;
}
/* ---------- section cards ---------- */
function secHTML(di, id){
  var e = D.directory[di], d = secDef(id), editing = !!S.prof.edit[id], waived = secWaivedUI(e, id);
  var acts = '';
  if(editing){
    /* the Lima Charlie editor carries its own Save/Cancel in the body (Save
       is the only commit, exactly like the Audit deck's dock): no waive
       toggle and no header Done, so there is one obvious save path. */
    acts = id === 'lima' ? '' :
      (id !== 'persona' ? '<label class="wv" title="Insufficient data: this section stops counting against the profile"><input type="checkbox" data-act="waive" data-di="' + di + '" data-sid="' + d.w.join(',') + '"' + (waived ? ' checked' : '') + '><span>Insufficient data</span></label>' : '') +
      '<button type="button" class="btn sm primary" data-act="secdone" data-sec="' + id + '">Close</button>';
  } else acts = '<button type="button" class="ib sm" data-act="secedit" data-sec="' + id + '" aria-label="Edit ' + d.t + '" title="Edit">' + ic('edit', 15) + '</button>';
  var head = '<header><h3>' + d.t + '</h3>' + secSummary(e, id) + '<span class="sp"></span>' + acts + '</header>';
  var SPINE = { about:'About', identity:'Contact', background:'Background', persona:'Persona', files:'Files', business:'Business', relationship:'Relationship', connections:'Associates', timeline:'Timeline', lima:'Lima Charlie' };
  function band(cls, spine, inner){
    return '<div class="band ' + cls + '"><div class="spine"><span>' + spine + '</span></div><div class="band-in">' + inner + '</div></div>';
  }
  /* About renders as two bands (Synopsis / Web Record) in view mode
     (Split Partitions, V3.37.0); editing and waived states stay one band. */
  if(id === 'about' && !editing && !waived){
    var synH = aboutSynHTML(di), webH = aboutWebHTML(di);
    if(synH || webH){
      var inner = '';
      if(synH) inner += band('b-syn', 'Synopsis', head + '<div class="cbody">' + synH + '</div>');
      if(webH) inner += band('b-web', 'Web Record', (synH ? '' : head) + '<div class="cbody">' + webH + '</div>');
      return '<section class="card multi" id="sec-about" data-sec="about">' + inner + '</section>';
    }
  }
  var body;
  if(waived && !editing){
    body = '<p class="dim waivedmsg">Waived: insufficient data. <button type="button" class="lnk" data-act="waive" data-di="' + di + '" data-sid="' + d.w.join(',') + '" data-off="1">Restore</button></p>';
  } else body = editing ? secEdit(di, id) : secView(di, id);
  return '<section class="card bandwrap b-' + id + (editing ? ' editing' : '') + (waived ? ' waived' : '') + (d.wide ? ' wide' : '') + '" id="sec-' + id + '" data-sec="' + id + '">' +
    band('b-' + id, SPINE[id] || d.t, head + '<div class="cbody">' + body + '</div>') + '</section>';
}
function secSummary(e, id){
  if(id === 'lima') return lcNote(e).trim() ? '<span class="lc-mark" title="A Lima Charlie note is waiting on this profile">LC</span>' : '';
  var n = 0;
  if(id === 'connections') n = knownAssociates(e).length + famLinks(e).length;
  else if(id === 'timeline') n = (e.events || []).length;
  else if(id === 'files') n = (e.files || []).length + (msgFor(e) ? 1 : 0);
  else if(id === 'business') n = (e.businesses || []).length;
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
function aboutSynHTML(di){
  var e = D.directory[di], syn = gv(e, 'synopsis');
  if(!syn) return '';
  return '<div class="narr">' + String(syn).split(/\n+/).map(function(line){
    var m = line.match(/^([A-Z][A-Za-z &\/'-]{1,28}):\s+(.*)$/);
    return m ? '<p><span class="lab">' + esc(m[1]) + '</span>' + pillify(m[2], di) + '</p>' : '<p>' + pillify(line, di) + '</p>';
  }).join('') + '</div>';
}
function aboutWebHTML(di){
  var e = D.directory[di], fp = footprintOf(e);
  if(!fp.blocks.length) return '';
  var fsrc = (e.files || []).some(function(f){ return f && f.kind === 'source' && f.url; });
  var wrSourced = fp.sourced || fsrc;
  return '<div class="band-note"><span class="conf ' + (wrSourced ? 'ok' : fp.inferred ? 'inf' : 'no') + '">' + (wrSourced ? 'Sourced' : fp.inferred ? 'Inferred' : 'No source') + '</span></div>' +
    fp.blocks.map(function(b){
      /* JD 2026-10-29: the record reads as real bullet columns — five
         bullets per column, then a new column — not one text blob with
         in-text bullet separators. */
      var items = String(b.text).split(/\s*•\s*/).map(function(s){ return s.replace(/^[·\-*]\s*/, '').trim(); }).filter(Boolean);
      var body;
      if(items.length > 1){
        var cols = [];
        for(var ci = 0; ci < items.length; ci += 5) cols.push(items.slice(ci, ci + 5));
        body = '<div class="fpcols">' + cols.map(function(col){
          return '<ul class="fpcol">' + col.map(function(it){ return '<li>' + pillify(it, di) + '</li>'; }).join('') + '</ul>';
        }).join('') + '</div>';
      } else body = '<p>' + pillify(b.text, di) + '</p>';
      return '<div class="fpb ' + (b.urls.length || fsrc ? 'ok' : 'no') + '">' + body + (b.urls.length ? '<div class="srcs">' + sourceChips(b.urls) + '</div>' : (fsrc ? '' : '<div class="srcs"><span class="src none">No source attached</span></div>')) + '</div>';
    }).join('');
}
function secView(di, id){
  var e = D.directory[di];
  if(id === 'identity'){
    var rows = [];
    function r(icn, lab, val, note, half){ if(val) rows.push({ icn:icn, lab:lab, val:val, note:note, half:!!half }); }
    if(effHandle(e)) r('ig', 'Instagram', '<a class="iglink ' + (e.relation === 'mutual' ? 'mutual' : 'oneway') + '" href="' + igURL(effHandle(e)) + '" target="_blank" rel="noopener">@' + esc(effHandle(e)) + '</a>', e.relation ? RELN[e.relation] : '');
    if(e.fb_url) r('fb', 'Facebook', '<a class="iglink" href="' + esc(e.fb_url) + '" target="_blank" rel="noopener">' + (e.fb_handle ? '@' + esc(e.fb_handle) : 'Profile') + '</a>');
    if((e.snap_handles || []).length) r('snap', 'Snapchat', e.snap_handles.map(function(h){ return '<a class="iglink" href="https://www.snapchat.com/add/' + encodeURIComponent(h) + '" target="_blank" rel="noopener">@' + esc(h) + '</a>'; }).join(' '), e.snap_since ? 'online connection since ' + e.snap_since : '');
    if(personIsAka(e) && gv(e, 'also_known_as')) r('user', 'Also known as', '<b>' + esc(gv(e, 'also_known_as')) + '</b>', '', true);
    if(gv(e, 'location_on_file')) r('pin', 'Location', esc(ptNormLoc(gv(e, 'location_on_file'))), '', true);
    var ph = String(gv(e, 'phone')).split(',').map(function(x){ return x.trim(); }).filter(Boolean);
    if(ph.length) r('phone', 'Phone', ph.map(function(x){ var f = fmtPhone(x); return '<a href="tel:' + esc(f.replace(/[^\d+]/g, '')) + '">' + esc(f) + '</a>'; }).join(' '), '', true);
    var em = String(gv(e, 'email')).split(',').map(function(x){ return x.trim(); }).filter(Boolean);
    if(em.length) r('mail', 'Email', em.map(function(x){ return '<a href="mailto:' + esc(x) + '">' + esc(x) + '</a>'; }).join(' '), 'on file', true);
    r('pin', 'Lives in', esc(e.city || ''), 'from Facebook', true);
    r('pin', 'From', esc(e.hometown || ''), 'from Facebook', true);
    if((e.languages || []).length) r('book', 'Languages', e.languages.map(esc).join(', '), 'from subject file', true);
    function ifact(o, cls){ return '<div class="' + cls + '"><span class="il">' + ic(o.icn, 15) + o.lab + '</span><div class="iv">' + o.val + (o.note ? ' <small class="derived">' + o.note + '</small>' : '') + '</div></div>'; }
    /* Split Partitions (V3.37.0): one filled row per fact, aligned label
       column; Phone and Email lead when present. */
    var pri = rows.filter(function(o){ return o.lab === 'Phone' || o.lab === 'Email'; });
    var rest = rows.filter(function(o){ return o.lab !== 'Phone' && o.lab !== 'Email'; });
    var out = pri.concat(rest).map(function(o){ return ifact(o, 'irow'); }).join('');
    return rows.length ? '<div class="irows">' + out + '</div>' : '<p class="dim">No contact details yet.</p>' + emptyPrompt(di, id, 'Add a phone number');
  }
  if(id === 'business'){
    /* Business Owner (JD 2026-10-27): overview cards from the Business
       Pulse sidecar (entry.businesses, attached at bake). Read-only —
       the data lives in Business Pulse. */
    function brow(lab, val){ return val ? '<div class="biz-row"><span>' + lab + '</span><div>' + val + '</div></div>' : ''; }
    return (e.businesses || []).map(function(b){
      var meta = [b.town, b.county ? b.county + ' County' : '', b.specialty, b.est ? 'Est. ' + b.est : ''].filter(Boolean).join(' · ');
      var links = '';
      if(b.website) links += '<a class="iglink" href="' + esc(b.website_url || ('https://' + b.website)) + '" target="_blank" rel="noopener">' + esc(b.website) + '</a>';
      if(b.ig) links += (links ? ' ' : '') + '<a class="iglink" href="https://www.instagram.com/' + encodeURIComponent(b.ig) + '" target="_blank" rel="noopener">@' + esc(b.ig) + '</a>';
      var stats = [];
      if(b.rating) stats.push('Rated ' + b.rating + (b.reviews ? ' · ' + b.reviews + ' reviews' + (b.review_source ? ' (' + esc(b.review_source) + ')' : '') : ''));
      else if(b.reviews) stats.push(b.reviews + ' reviews' + (b.review_source ? ' (' + esc(b.review_source) + ')' : ''));
      if(b.followers) stats.push(Number(b.followers).toLocaleString('en-US') + ' Instagram followers');
      return '<div class="bizcard">' +
        '<div class="biz-h"><b>' + esc(b.name) + '</b>' + (b.status ? '<span class="vchip">' + esc(cap(b.status)) + '</span>' : '') + '</div>' +
        (meta ? '<div class="biz-meta">' + esc(meta) + '</div>' : '') +
        (links ? '<div class="biz-links">' + links + '</div>' : '') +
        brow('Services', esc(b.services || '')) +
        brow('Pricing', esc(b.pricing || '')) +
        (stats.length ? '<div class="biz-stats">' + stats.join(' · ') + '</div>' : '') +
        (b.note ? '<p class="biz-note">' + esc(b.note) + '</p>' : '') +
        '</div>';
    }).join('') + '<p class="note">Business data from Business Pulse; it refreshes with that roster.</p>';
  }
  if(id === 'relationship'){
    var tiles = [['Tier', tierOf(e) ? TIERS[tierOf(e)].n : ''], ['Relationship', cap(gv(e, 'relationship'))], ['Context', cap(gv(e, 'context'))], ['Category', (CAT_OPTS.filter(function(c){ return c[0] === gv(e, 'category'); })[0] || ['', gv(e, 'category')])[1]],
      ['Known since', knownSinceLabel(e) ? knownSinceLabel(e) + ' (' + Math.max(0, new Date().getFullYear() - knownSinceYear(e)) + ' yrs)' : ''], ['Momentum', momVal(e) ? MOM_LABELS[momVal(e)] : '']];
    var gs = personGroups(e);
    /* Rank picker (JD 2026-10-26): shown when the person is in a
       military capacity (branch detected from groups/orgs) or already
       carries a rank; the dropdown is preloaded with that branch's
       ranks. Picking one writes the Rank field immediately. */
    var brB = milBranch(e), curRank = milRank(e), rankCtl = '';
    if(brB || curRank){
      var rlist = (brB ? MIL_RANKS[brB].ranks : MIL_RANKS.ar.ranks).slice();
      if(curRank && rlist.indexOf(curRank) < 0) rlist.unshift(curRank);
      rankCtl = '<div class="sub-h">Rank' + (brB ? ' · ' + esc(MIL_RANKS[brB].label) : '') + '</div>' +
        '<select class="ranksel" data-act="ranksel" data-di="' + di + '" aria-label="Military rank">' +
        '<option value="">No rank</option>' +
        rlist.map(function(r){ return '<option value="' + esc(r) + '"' + (r === curRank ? ' selected' : '') + '>' + esc(r) + '</option>'; }).join('') + '</select>';
    }
    /* Empty tiles vanish (JD 2026-10-29 condense): a labeled tile with
       no value on file does not render at all; the Known-since tile
       survives on its Snapchat badge alone since the badge is content. */
    var shownTiles = tiles.filter(function(t){ return t[1] || (t[0] === 'Known since' && e.snap_since); });
    var relBody = (shownTiles.length ? '<div class="tiles">' + shownTiles.map(function(t){ var ocs = (t[0] === 'Known since' && e.snap_since) ? '<span class="ocs-badge">' + ic('snap', 11) + 'Online connection since ' + e.snap_since + '</span>' : ''; return '<div class="tile"><small>' + t[0] + '</small><b' + (t[1] ? '' : ' class="dim"') + '>' + (t[0] === 'Context' && t[1] ? pillify(t[1], di) : esc(t[1] || 'Not set')) + '</b>' + ocs + '</div>'; }).join('') + '</div>' : '') +
      (gs.length ? '<div class="sub-h">Groups</div><div class="chips ro">' + gs.map(function(g){ return '<a class="vchip link" href="#/groups/groups/' + encodeURIComponent(g) + '">' + esc(g) + '</a>'; }).join('') + '</div>' : '') + rankCtl;
    return relBody || emptyPrompt(di, id, 'Add relationship details');
  }
  if(id === 'about'){
    /* Synopsis-led order: the narrative packet leads; the web record
       follows as supporting material. In the profile view the two render
       as separate bands via aboutSynHTML/aboutWebHTML (see secHTML). */
    return (aboutSynHTML(di) + aboutWebHTML(di)) || emptyPrompt(di, id, 'Write a synopsis');
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
    if(hl.length){
      /* Three rows per column, then a new column (JD 2026-10-29). */
      var hlRows = hl.map(function(h){
        var m = String(h).match(/^([^:]{2,24}):\s*(.*)$/);
        return m ? '<div class="hlrow"><span class="hl-k">' + esc(m[1]) + '</span><div class="hl-v">' + pillify(m[2], di) + '</div></div>' :
          '<div class="hlrow"><div class="hl-v">' + pillify(h, di) + '</div></div>';
      });
      var hlCols = [];
      for(var hi = 0; hi < hlRows.length; hi += 3) hlCols.push(hlRows.slice(hi, hi + 3));
      out2 += '<div class="sub-h">Highlights</div><div class="hlcols">' + hlCols.map(function(col){ return '<div class="hlcol">' + col.join('') + '</div>'; }).join('') + '</div>';
    }
    var orgs = '';
    ORG_CATS.forEach(function(c){ if(c.k === 'universities') return; tagList(gv(e, c.k)).forEach(function(o){ orgs += '<a class="vchip link oc-' + c.k + '" href="#/groups/' + c.k + '/' + encodeURIComponent(o) + '">' + ic(c.ic, 12) + esc(o) + '</a>'; }); });
    if(orgs) out2 += '<div class="sub-h">Organizations</div><div class="chips ro">' + orgs + '</div>';
    return out2 || emptyPrompt(di, id, 'Add skills, work, school');
  }
  if(id === 'connections'){
    var ka = knownAssociates(e), links = famLinks(e), out3 = '';
    var tree = familyMiniTree(di);
    if(tree) out3 += '<div class="sub-h first">Family</div>' + tree;
    else if(links.length) out3 += '<div class="sub-h first">Family</div>' + famListHTML(di, false);
    /* Default = the strongest 10 only (knownAssociates preserves the baked strength order); Show more / Show less toggles the full list (JD 2026-10-15). */
    if(ka.length) out3 += '<div class="sub-h' + (out3 ? '' : ' first') + '">Known associates <small>' + ka.length + '</small></div><div class="chips ro">' + ka.slice(0, S.prof.open.assoc ? 999 : 10).map(function(nb){ return nbrChip(nb, false); }).join('') +
      (ka.length > 10 && !S.prof.open.assoc ? '<button type="button" class="vchip more" data-act="opentog" data-k="assoc">Show more \u00b7 +' + (ka.length - 10) + '</button>' : '') +
      (ka.length > 10 && S.prof.open.assoc ? '<button type="button" class="vchip more" data-act="opentog" data-k="assoc">Show less</button>' : '') + '</div>';
    out3 += '<div class="row"><a class="btn ghost sm" href="#/family" data-act="openfam" data-di="' + di + '">' + ic('tree', 14) + 'Open in Family</a><a class="btn ghost sm" href="#/network" data-act="shownet" data-di="' + di + '">' + ic('network', 14) + 'Show on Network</a></div>';
    return (ka.length || links.length) ? out3 : emptyPrompt(di, id, 'Add family or known associates');
  }
  if(id === 'timeline'){
    var evs = sortedEvents(e), ps = connPhases(e).slice().sort(function(a, b){ return String(a.f || '').localeCompare(String(b.f || '')); }), out4 = '<div class="tl-logrow"><button type="button" class="btn ghost sm" data-act="logcontact">' + ic('edit', 13) + 'Log contact</button></div>';
    if(ps.length) out4 += '<div class="sub-h first">Phases</div><div class="phases">' + ps.map(function(p){
      return '<div class="ph"><b>' + esc(p.l || 'Untitled phase') + '</b><small>' + esc(ymLabel(p.f) + (p.t ? ' to ' + ymLabel(p.t) : ' to now')) + '</small>' + (p.n ? '<p>' + pillify(p.n, di) + '</p>' : '') + '</div>';
    }).join('') + '</div>';
    if(evs.length){
      var tlVis = !!S.prof.tlVisual;
      out4 += '<div class="sub-h' + (out4 ? '' : ' first') + '">Events</div>' +
        '<div class="tl-secbar"><div class="seg" role="group" aria-label="Events view"><button type="button" data-act="tltog" data-v="list"' + (!tlVis ? ' class="on"' : '') + '>List</button><button type="button" data-act="tltog" data-v="visual"' + (tlVis ? ' class="on"' : '') + '>Timeline</button></div></div>';
      if(tlVis){
        var pitems = [];
        (e.events || []).forEach(function(ev){
          if(!ev) return;
          var k = flexKey(ev.date), p = tlPrec(ev.date);
          if(k == null || !p) return;
          pitems.push({ k:k, prec:p, di:di, e:e, ev:ev });
        });
        out4 += tlShell('prof', pitems);
      } else {
        out4 += '<div class="tl">' + evs.slice(0, S.prof.open.ev ? 999 : 6).map(function(o){
          var ev = o.ev;
          return '<div class="ev"><i></i><time>' + esc(ev.kind === 'contact' ? lcDateLabel(ev.date) : evDate(ev.date)) + (ev.init ? ' <em>' + (ev.init === 'me' ? 'I reached out' : 'They reached out') + '</em>' : '') + lcTag(ev) + '</time><b>' + pillify(ev.summary || '', di) + '</b>' + (ev.detail ? '<p>' + pillify(ev.detail, di) + '</p>' : '') + '</div>';
        }).join('') + '</div>' + (evs.length > 6 && !S.prof.open.ev ? '<button type="button" class="btn ghost sm" data-act="opentog" data-k="ev">Show all ' + evs.length + ' events</button>' : '');
      }
    }
    return evs.length || ps.length ? out4 : out4 + emptyPrompt(di, id, 'Add an event');
  }
  if(id === 'files'){
    var fs = e.files || [], mf = msgFor(e);
    var mrow = mf ? '<div class="file"><span>' + ic('mail', 17) + '</span><div><b>Correspondence</b><small>iMessage thread · ' + mf.n + ' messages · ' + esc(msgSpan(mf)) + (mf.group ? ' · may include group messages' : '') + '</small></div>' +
      '<button type="button" class="btn ghost sm" data-act="msgopen" data-di="' + di + '">Open</button></div>' : '';
    var frows = fs.map(function(f){
      var isDoc = f.kind === 'gdoc';
      return '<div class="file"><span>' + ic(isDoc ? 'file' : 'link', 17) + '</span><div><b>' + esc(f.name || 'Untitled') + '</b><small>' + (isDoc ? 'Google Doc' : (f.kind === 'source' ? 'Source' : 'Link')) + (f.note ? ' · ' + esc(f.note) : '') + '</small></div>' +
        (f.url ? '<a class="btn ghost sm" href="' + esc(f.url) + '" target="_blank" rel="noopener">Open' + ic('ext', 12) + '</a>' : '') + '</div>';
    }).join('');
    return mrow + (frows || (mf ? '' : emptyPrompt(di, id, 'Attach a link or create a doc')));
  }
  if(id === 'persona'){
    /* Unrated traits vanish in view (JD 2026-10-29 condense): the card
       exists only when at least one trait is rated (secShown), and it
       shows exactly the rated ones. The editor still offers all six. */
    return '<div class="persona">' + PERSONA.filter(function(p){ return (parseInt(gv(e, p[0]), 10) || 0) > 0; }).map(function(p){
      var n = parseInt(gv(e, p[0]), 10) || 0;
      return '<div class="pt"><span>' + p[1] + '</span><div class="psegs">' + [1, 2, 3, 4, 5].map(function(i){ return '<i class="' + (i <= n ? 'on' : '') + '"></i>'; }).join('') + '</div><b>' + n + '/5</b></div>';
    }).join('') + '</div>';
  }
  if(id === 'lima'){
    return '<p class="lc-note-txt">' + esc(lcNote(e)) + '</p>' +
      '<p class="dim">Waiting for Luna\'s next Lima Charlie run. She applies it, then clears it.</p>';
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
    return '<a class="fnode ' + cls + '" href="#/p/' + encodeURIComponent(personId(D.directory[o.di])) + '" data-act="openp" data-di="' + o.di + '"><span>' + esc(famInitials(o.label)) + '</span><small>' + esc(o.label) + '</small>' + milBadge(D.directory[o.di]) + '</a>';
  }
  var self = '<div class="fnode self"><span>' + esc(famInitials(dispName(e))) + '</span><small>' + esc(dispName(e)) + '</small>' + milBadge(e) + '</div>';
  return '<div class="ftree">' +
    (P.length ? '<div class="fr"><label>Parents</label><div>' + P.map(function(o){ return node(o, 'par'); }).join('') + '</div></div>' : '') +
    '<div class="fr"><label>' + (SP.length ? 'Spouse' : 'Self') + '</label><div>' + self + SP.map(function(o){ return node(o, 'sp'); }).join('') + '</div></div>' +
    (SB.length ? '<div class="fr"><label>Siblings</label><div>' + SB.map(function(o){ return node(o, 'sib'); }).join('') + '</div></div>' : '') +
    (C.length ? '<div class="fr"><label>Children</label><div>' + C.map(function(o){ return node(o, 'chi'); }).join('') + '</div></div>' : '') + '</div>';
}

/* ---------- section editors ---------- */
function tagEditor(di, k, sep, ph){
  var e = D.directory[di], cur = splitTags(gv(e, k), sep);
  return '<div class="tags" data-k="' + k + '" data-sep="' + esc(sep) + '">' + cur.map(function(x){
    return '<span class="tchip on">' + esc(x) + '<button type="button" data-act="tagrm" data-k="' + k + '" data-sep="' + esc(sep) + '" data-v="' + esc(x) + '" aria-label="Remove">' + ic('x', 11) + '</button></span>'; }).join('') +
    '<span class="pted-add"><input class="tadd" data-k="' + k + '" data-sep="' + esc(sep) + '" placeholder="' + esc(ph) + '" autocomplete="off"><div class="pted-ac" hidden></div></span></div>';
}
function pickEditor(di, k, options, ph){
  var e = D.directory[di], cur = tagList(gv(e, k)).map(regApply), all = options.concat(cur.filter(function(x){ return options.indexOf(x) < 0; }));
  return '<div class="tags">' + all.map(function(o){
    return '<button type="button" class="tchip tog' + (cur.indexOf(o) >= 0 ? ' on' : '') + '" data-act="tagtog" data-k="' + k + '" data-sep=", " data-v="' + esc(o) + '">' + esc(o) + '</button>'; }).join('') +
    '<span class="pted-add"><input class="tadd" data-k="' + k + '" data-sep=", " placeholder="' + esc(ph || 'Add another') + '" autocomplete="off"><div class="pted-ac" hidden></div></span></div>';
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
  if(id === 'business') return '<p class="note">Business Owner is derived from Business Pulse and read only here. Correct it in the Business Pulse roster.</p>' + secView(di, 'business');
  if(id === 'identity'){
    return lab('First name') + '<input data-pk="first_name" value="' + esc(gv(e, 'first_name')) + '" autocomplete="off">' +
      lab('Last name') + '<input data-pk="last_name" value="' + esc(gv(e, 'last_name')) + '" autocomplete="off">' +
      lab('Phone', 'Several numbers: separate with commas') + '<input data-pk="phone" inputmode="tel" value="' + esc(gv(e, 'phone')) + '" autocomplete="off">' +
      (personIsAka(e) ? lab('Also known as') + '<input data-pk="also_known_as" value="' + esc(gv(e, 'also_known_as')) + '" autocomplete="off">' : '') +
      lab('Location on file', 'One place for this person: it replaces the derived city/hometown everywhere it appears') + '<input data-pk="location_on_file" value="' + esc(gv(e, 'location_on_file')) + '" placeholder="Town, ST" autocomplete="off">' +
      '<p class="note">Instagram, Facebook, Snapchat, Lives in, From and Languages are derived and read only. Correct them at the source (the FB Profiles tab, the Snapchat data file, or a subject file).</p>' + secView(di, 'identity');
  }
  if(id === 'relationship'){
    var ksP0 = ksParts(e) || { y:0, mo:0, d:0 }, thisY = new Date().getFullYear();
    var ksYrs = ''; for(var ky2 = thisY; ky2 >= 1990; ky2--) ksYrs += '<option value="' + ky2 + '"' + (ksP0.y === ky2 ? ' selected' : '') + '>' + ky2 + '</option>';
    if(ksP0.y && (ksP0.y < 1990 || ksP0.y > thisY)) ksYrs = '<option value="' + ksP0.y + '" selected>' + ksP0.y + '</option>' + ksYrs;
    var ksMos = ''; KS_MONTHS.forEach(function(mn, ix){ ksMos += '<option value="' + (ix + 1) + '"' + (ksP0.mo === ix + 1 ? ' selected' : '') + '>' + mn + '</option>'; });
    var ksDim = ksP0.mo ? new Date(ksP0.y, ksP0.mo, 0).getDate() : 31, ksDas = '';
    for(var kd = 1; kd <= ksDim; kd++) ksDas += '<option value="' + kd + '"' + (ksP0.d === kd ? ' selected' : '') + '>' + kd + '</option>';
    var ksRaw = String(gv(e, 'years_known') || '').trim();
    var ksPrev = ksParts(e) ? (knownSinceLabel(e) + (ksP0.y ? ' \u00b7 ' + Math.max(0, thisY - ksP0.y) + ' yrs' : '')) : (ksRaw ? ksRaw : 'Not set');
    var ksRow = '<div class="ksrow">' +
      '<select class="kssel" data-act="kssel" data-part="y" data-di="' + di + '" aria-label="Known since: year"><option value="">Year</option>' + ksYrs + '</select>' +
      '<select class="kssel" data-act="kssel" data-part="m" data-di="' + di + '" aria-label="Known since: month"' + (ksP0.y ? '' : ' disabled') + '><option value="">Month</option>' + ksMos + '</select>' +
      '<select class="kssel" data-act="kssel" data-part="d" data-di="' + di + '" aria-label="Known since: day"' + (ksP0.mo ? '' : ' disabled') + '><option value="">Day</option>' + ksDas + '</select>' +
      '<span class="kslab">' + esc(ksPrev) + '</span></div>';
    var gs = Object.keys(allGroups()).sort(), mine = personGroups(e);
    return lab('Tier') + seg('tier', TIER_ORDER.map(function(t){ return [t, TIERS[t].n]; }), tierOf(e), ' data-di="' + di + '" data-sec="relationship"') +
      lab('Momentum') + seg('momentum', [['-', MOM_ICONS['-'] + ' Cooling'], ['0', 'Steady'], ['+', '+ Warming']], momVal(e), ' data-di="' + di + '" data-sec="relationship"') +
      lab('Relationship') + seg('relationship', REL_OPTS, gv(e, 'relationship'), ' data-di="' + di + '" data-sec="relationship"') +
      lab('Closeness') + seg('closeness', CLOSE_OPTS, gv(e, 'closeness'), ' data-di="' + di + '" data-sec="relationship"') +
      lab('Context') + seg('context', CTX_OPTS, gv(e, 'context'), ' data-di="' + di + '" data-sec="relationship"') +
      lab('Category') + seg('category', CAT_OPTS, gv(e, 'category'), ' data-di="' + di + '" data-sec="relationship"') +
      lab('Score pin', 'Optional: a fixed score from 0 to 100 that overrides the computed closeness score') + '<input data-pk="score_pin" type="number" min="0" max="100" step="1" value="' + esc(gv(e, 'score_pin')) + '" placeholder="Not pinned" autocomplete="off">' +
      lab('Known since', 'Pick the year, then the month and day if you know them') + ksRow +
      lab('Last known contact', 'Year, year-month, or a full date. Tick Online if it was not in person.') + '<div class="ksrow"><input data-pk="last_contact" value="' + esc(gv(e, 'last_contact')) + '" placeholder="e.g. 2026, 2026-10 or 2026-10-28" autocomplete="off" spellcheck="false"><label class="lc-onl"><input type="checkbox" data-act="lconline" data-di="' + di + '"' + (lcOnline(e) ? ' checked' : '') + '> Online</label><span class="kslab">' + esc(lcLabel(e) || 'Not set') + '</span></div>' +
      lab('Groups') + '<div class="tags">' + gs.map(function(g){ return '<button type="button" class="tchip tog' + (mine.indexOf(g) >= 0 ? ' on' : '') + '" data-act="grptog" data-g="' + esc(g) + '">' + esc(g) + '</button>'; }).join('') +
      '<span class="pted-add"><input class="tadd" data-grpnew placeholder="New group" autocomplete="off"><div class="pted-ac" hidden></div></span></div>';
  }
  if(id === 'about'){
    return lab('Synopsis', 'One topic per line, starting with a label and a colon. Keep it general: facts, never intimate detail.') +
      '<textarea data-pk="synopsis" rows="6">' + esc(gv(e, 'synopsis')) + '</textarea>' +
      '<div class="row"><button type="button" class="btn ghost sm" data-act="tidy" data-di="' + di + '">' + ic('sparkle', 14) + 'Tidy with AI</button><span class="aimsg" id="aimsg"></span></div>' +
      lab('Web record', 'Bullet points, one fact each, with the source name in parentheses. The source links themselves live under Files.') +
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
    return lab('Known associates', 'Adding or removing writes both profiles') +
      '<div class="chips">' + (knownAssociates(e).map(function(nb){ return nbrChip(nb, true); }).join('') || '<span class="dim">None mapped yet.</span>') + '</div>' +
      '<div class="finder"><input id="assocq" placeholder="Add a known associate: type a name" autocomplete="off"><div id="assocr" class="hits"></div></div>' +
      lab('Family', 'Traditional model: one spouse, bloodline trees') + famListHTML(di, true) +
      '<div class="famadd"><div class="seg" id="famrels">' + FAM_RELS.map(function(r){ return '<button type="button" class="' + (famRelDefault() === r ? 'on' : '') + '" data-act="famrel" data-v="' + r + '">' + cap(r) + '</button>'; }).join('') + '</div>' +
      '<div class="finder"><input id="famq" placeholder="Add family member: type a name" autocomplete="off"><div id="famr" class="hits"></div></div></div>';
  }
  if(id === 'timeline'){
    var cur = S.prof.evEdit != null ? (e.events || [])[S.prof.evEdit] : null;
    var rows = sortedEvents(e).map(function(o){
      return '<div class="evrow' + (S.prof.evEdit === o.i ? ' editing' : '') + '"><div><time>' + esc(o.ev.kind === 'contact' ? lcDateLabel(o.ev.date) : evDate(o.ev.date)) + '</time>' + lcTag(o.ev) + '<b>' + esc(o.ev.summary || '') + '</b></div>' +
        '<div class="ea"><button type="button" class="btn ghost sm" data-act="evedit" data-i="' + o.i + '">Edit</button><button type="button" class="btn ghost sm danger" data-act="evdel" data-i="' + o.i + '">Remove</button></div></div>';
    }).join('');
    cur = cur || {};
    var ps = connPhases(e);
    var lcForm = '<div class="form lcform"><h5>Log contact</h5>' +
      '<input id="lc-date" placeholder="Date: 2026, 2026-10 or 2026-10-28" autocomplete="off" spellcheck="false">' +
      '<input id="lc-sum" placeholder="One line: what happened" autocomplete="off">' +
      '<label class="lc-onl"><input type="checkbox" id="lc-online"> Online</label>' +
      '<div class="row"><button type="button" class="btn primary sm" data-act="lcadd">Add to log</button></div></div>';
    return lcForm + (rows || '<p class="dim">No events yet.</p>') +
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
  if(id === 'lima'){
    var lcur = lcNote(e);
    return lab('Note — where did you leave off?', 'Dictate every change for this profile. Nothing saves until you tap Save note.') +
      '<textarea id="plima-note" rows="4" placeholder="e.g. Moved to Canton. Works at Rochester Regional Health now. Known him since 2019. Add SUNY Potsdam.">' + esc(lcur) + '</textarea>' +
      '<div class="row"><button type="button" class="btn primary sm" data-act="plcsave">Save note</button>' +
      '<button type="button" class="btn ghost sm" data-act="secdone" data-sec="lima">Cancel</button>' +
      (lcur.trim() ? '<span class="dim">Clear the text and save to remove the note.</span>' : '') + '</div>';
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
   Closeness score (JD 2026-10-16, Method v2; canonical spec:
   your_files/ncc-closeness-score-method-v2-2026-10-16.md).
   score = 100 x sum(w_i * v_i over FILLED components) / sum(w_i
   over FILLED). A blank component is unknown, never zero: it drops
   out and the remaining weights rescale. An open tier and a
   "distant" rating are FILLED at value 0; a blank tier, an
   unmapped relationship, an unrated closeness and unknown years
   drop out. Mutual fabric is Adamic-Adar shared with JD (common
   known associates + shared canonical groups and organizations),
   percentile-ranked across the listed population, so it is
   defined for everyone and always filled. A Score Pin (Sheet
   column "Score Pin") wins over the computed score and survives
   recomputation. All weights and maps live in SCORE_CFG only.
   ============================================================ */
var CLOSE_OPTS = ['distant', 'less than close', 'close', 'especially close'];
var CLOSE_RANK = { 'distant':1, 'less than close':2, 'close':3, 'especially close':4 };
var SCORE_CFG = {
  weights: { closeness:40, tier:25, relationship:15, years:10, fabric:10 },
  closeness: { 'distant':0, 'less than close':0.33, 'close':0.67, 'especially close':1 },
  tier: { vetted:1, associate:0.5, open:0 },
  relationship: { family:1.0, friend:0.85, coworker:0.6, client:0.55, professional:0.5, acquaintance:0.35, 'by association':0.2, online:0.15 },
  yearsCap: 20
};
var SCORE_LABELS = { closeness:'Closeness', tier:'Tier', relationship:'Relationship', years:'Years', fabric:'Fabric' };
var SCORE_RADII = [160, 315, 485, 700, 920], SCORE_SPREAD = [14, 26, 40, 55, 70];
var SCORE_GUIDES = ['TOP 5', '6\u201315', '16\u201350', '51\u2013150', '150+'];
var SCORE = { ver:-1, byDi:null };
function scoreCompute(){
  var W = SCORE_CFG.weights, pop = people(), N = pop.length, byDi = {};
  /* JD's own entry anchors the shared-connection measurement. His
     handle is the identity: the baked entry's key flavor is sf:
     (subject file), so match the username itself, not a prefix. */
  var jdDi = null;
  pop.forEach(function(di){ var e0 = D.directory[di]; if(jdDi == null && ((e0.name || '') === 'jdmeyers_' || pkey(e0) === 'ig:jdmeyers_' || pkey(e0) === 'sf:jdmeyers_')) jdDi = di; });
  var jdAssoc = {}, jdGroups = {}, jdOrgs = {};
  if(jdDi != null){
    knownAssociates(D.directory[jdDi]).forEach(function(nb){ jdAssoc[(nb.u || '').toLowerCase()] = 1; });
    personGroups(D.directory[jdDi]).forEach(function(g){ jdGroups[g] = 1; });
    orgsOf(D.directory[jdDi]).forEach(function(o){ jdOrgs[regApply(o)] = 1; });
  }
  /* degrees across the population: a person's degree is their
     known-associate count; a group's or org's degree is its
     member count among the listed profiles */
  var gDeg = {}, oDeg = {};
  pop.forEach(function(di){
    var e = D.directory[di];
    personGroups(e).forEach(function(g){ gDeg[g] = (gDeg[g] || 0) + 1; });
    orgsOf(e).forEach(function(o){ var c = regApply(o); oDeg[c] = (oDeg[c] || 0) + 1; });
  });
  function aaOf(e){
    var sum = 0;
    knownAssociates(e).forEach(function(nb){
      var u = (nb.u || '').toLowerCase();
      if(!u || !jdAssoc[u]) return;
      var tdi = BYN[u]; if(tdi == null) return;
      var deg = knownAssociates(D.directory[tdi]).length;
      if(deg > 1) sum += 1 / Math.log(deg);
    });
    personGroups(e).forEach(function(g){ if(jdGroups[g] && gDeg[g] > 1) sum += 1 / Math.log(gDeg[g]); });
    orgsOf(e).forEach(function(o){ var c = regApply(o); if(jdOrgs[c] && oDeg[c] > 1) sum += 1 / Math.log(oDeg[c]); });
    return sum;
  }
  var aa = {};
  pop.forEach(function(di){ aa[di] = aaOf(D.directory[di]); });
  var sortedAA = pop.map(function(di){ return aa[di]; }).sort(function(a, b){ return a - b; });
  function pctOf(v){ /* proportion of the population strictly below v, over N-1 */
    var lo = 0, hi = sortedAA.length;
    while(lo < hi){ var mid = (lo + hi) >> 1; if(sortedAA[mid] < v) lo = mid + 1; else hi = mid; }
    return N > 1 ? lo / (N - 1) : 0;
  }
  pop.forEach(function(di){
    var e = D.directory[di], parts = [], blank = [], wsum = 0, vsum = 0;
    function add(k, filled, v){
      if(filled){ parts.push({ k:k, label:SCORE_LABELS[k], w:W[k], v:v }); wsum += W[k]; vsum += W[k] * v; }
      else blank.push(SCORE_LABELS[k]);
    }
    var cv = (gv(e, 'closeness') || '').toLowerCase();
    add('closeness', SCORE_CFG.closeness[cv] !== undefined, SCORE_CFG.closeness[cv] || 0);
    var tv = tierOf(e);
    add('tier', SCORE_CFG.tier[tv] !== undefined, SCORE_CFG.tier[tv] || 0);
    var rv = (gv(e, 'relationship') || '').toLowerCase();
    add('relationship', SCORE_CFG.relationship[rv] !== undefined, SCORE_CFG.relationship[rv] || 0);
    var sy = knownSinceYear(e);
    var yrs = sy ? Math.max(0, Math.min(SCORE_CFG.yearsCap, new Date().getFullYear() - sy)) : null;
    add('years', yrs != null, yrs != null ? Math.log(1 + yrs) / Math.log(1 + SCORE_CFG.yearsCap) : 0);
    add('fabric', true, pctOf(aa[di]));
    var computed = wsum ? Math.round(100 * vsum / wsum) : 0;
    var pin = parseFloat(gv(e, 'score_pin'));
    var pinned = isFinite(pin) && pin >= 0 && pin <= 100;
    byDi[di] = {
      score: pinned ? Math.round(pin) : computed, computed:computed, pinned:pinned,
      parts:parts, blank:blank, filledCount:parts.length,
      lowConf:parts.length <= 1, layer:0, rank:0
    };
  });
  /* Dunbar rank layers over the whole listed population (the same
     set netBuild maps — Design A put everyone on the map), so
     layer 1 always holds exactly 5 */
  var onMap = pop.slice();
  onMap.sort(function(a, b){ return (byDi[b].score - byDi[a].score) || (a - b); });
  onMap.forEach(function(di, i){
    byDi[di].rank = i + 1;
    byDi[di].layer = i < 5 ? 1 : i < 15 ? 2 : i < 50 ? 3 : i < 150 ? 4 : 5;
  });
  SCORE.byDi = byDi; SCORE.ver = VER;
  return byDi;
}
function scoreAll(){ if(SCORE.ver !== VER || !SCORE.byDi) scoreCompute(); return SCORE.byDi; }
function scoreFor(di){ var m = scoreAll(); return m[di] || null; }
function scoreBadgeHTML(di){
  /* The score shows as a plain badge (JD 2026-10-16): the number, plus
     a small "pinned" marker when a Score Pin is in force. No layer
     label and no arithmetic anywhere it appears. */
  var s = scoreFor(di); if(!s) return '';
  return '<span class="sc-badge" title="Closeness score"><b>' + s.score + '</b>' + (s.pinned ? '<i>pinned</i>' : '') + '</span>';
}
/* Node coordinates: one set per node — the Score layout (sx/sy).
   Display coordinates (dx/dy) hold the same values; there is no
   morph engine anymore because there is only one layout. nd.ring is
   always the TIER ring — netColor reads it, and tier owns color. */
function netP2(nd){ return [nd.dx, nd.dy]; }
function netLowConf(nd){ if(!SCORE.byDi) return false; var s = SCORE.byDi[nd.di]; return !!(s && s.lowConf); }

/* ============================================================
   Network — Design A (JD 2026-10-22). One picture: JD at the
   center, EVERYONE in the directory on a closeness ring around
   him (radius = Dunbar rank layer by closeness score), and
   organizations drawn as hubs on the spokes: each person's tie
   to JD routes through the hub of their largest organization,
   so the org structure rides the same lines. Ambient spokes are
   hairline texture; the focused person's (or organization's)
   route is full strength. One layout, two views: the flat 2D
   disc, or the 3D universe view (JD 2026-10-23) — the same
   people lifted onto closeness shells around JD, a free-
   floating sphere the reader orbits. Tap a dot for a card; tap a hub
   diamond (or its row in the panel) to focus an organization.
   Display-only: nothing here ever writes data.
   ============================================================ */
var NET = { nodes:[], hubs:[], cam:{ x:0, y:0, z:1 }, cv:null, ctx:null, W:0, H:0, dpr:1, raf:0, ptr:{}, pinch:0, moved:false, dirty:true, byDi:{}, hoverDi:null, cxOff:0, glide:null, hovEl:null, hovDi:null, _camInit:false, _panelFlag:false, view:'2d', rot:0, pitch:0.45, lastT:0, pulse:null };
var REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
/* Camera glide: the one motion the page still has. A glide moves
   camera values (pan / zoom / panel compensation) with the house
   ease; a hand on the map cancels it outright, and reduced motion
   makes every move instant. */
function netEase(p){ return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
var NET_CH = {
  c2x:function(v){ NET.cam.x = v; }, c2y:function(v){ NET.cam.y = v; },
  c2z:function(v){ NET.cam.z = v; }, cxoff:function(v){ NET.cxOff = v; },
  r3:function(v){ NET.rot = v; }, p3:function(v){ NET.pitch = v; }
};
var NET_CH_GET = {
  c2x:function(){ return NET.cam.x; }, c2y:function(){ return NET.cam.y; },
  c2z:function(){ return NET.cam.z; }, cxoff:function(){ return NET.cxOff; },
  r3:function(){ return NET.rot; }, p3:function(){ return NET.pitch; }
};
function netGlide(dur, to, onDone){
  if(REDUCED_MOTION || !dur){
    for(var k in to) NET_CH[k](to[k]);
    NET.glide = null; NET.dirty = true;
    if(onDone) onDone();
    return;
  }
  var from = {};
  for(var k2 in to) from[k2] = NET_CH_GET[k2]();
  NET.glide = { t0:performance.now(), dur:dur, from:from, to:to, onDone:onDone || null };
  NET.dirty = true;
}
function netGlideStep(now){
  var g = NET.glide; if(!g) return;
  var p = Math.min(1, (now - g.t0) / g.dur), e = netEase(p);
  for(var k in g.to) NET_CH[k](g.from[k] + (g.to[k] - g.from[k]) * e);
  NET.dirty = true;
  if(p >= 1){ NET.glide = null; if(g.onDone) g.onDone(); }
}
function netFitZ(){ return Math.max(0.3, Math.min(1.4, Math.min(NET.W, NET.H) / 2400)); }
function netFitNow(){
  NET.cam.x = 0; NET.cam.y = 0; NET.cam.z = netFitZ();
  NET.dirty = true;
}
/* Frame the selection, arrived at by glide instead of in one frame. */
function netFrameSel(){
  var nd = NET.byDi[S.net.sel]; if(!nd) return;
  if(NET.view === '3d'){ netFaceNode(nd, 450); return; }
  var p2 = netP2(nd);
  netGlide(450, { c2x:p2[0], c2y:p2[1], c2z:Math.max(NET.cam.z, 1.6) });
}
function netToggleFS(){
  if(document.fullscreenElement){ document.exitFullscreen(); return; }
  var pg = $('.netpage');
  if(pg && pg.requestFullscreen) pg.requestFullscreen();
}
function netViewportChange(){
  if(document.body.getAttribute('data-view') !== 'network' || !NET.cv || !document.body.contains(NET.cv)) return;
  netResize();
  var fb = $('[data-act="netfs"]');
  if(fb){ var fs = !!document.fullscreenElement; fb.classList.toggle('on', fs); fb.setAttribute('aria-pressed', fs ? 'true' : 'false'); }
}
document.addEventListener('fullscreenchange', netViewportChange);
addEventListener('resize', netViewportChange);
/* Canonical organizations + groups of a person — the same
   memberships the hub system is built from (registry-applied). */
function netOrgsOf(e){
  var out = [], seen = {};
  function push(nm){ if(nm && !seen[nm]){ seen[nm] = 1; out.push(nm); } }
  personGroups(e).forEach(push);
  orgsOf(e).forEach(function(o){ push(regApply(o)); });
  return out;
}
var HUB_MIN = 4;        /* an org/group needs this many on-map members to earn a hub */
var HUB_LABEL_MAX = 10; /* name plates: only the largest hubs get one */
function netBuild(){
  computeNewGain();
  var dir = D.directory, maxS = 1;
  dir.forEach(function(r){ if(r.strength > maxS) maxS = r.strength; });
  /* EVERYONE is on the map (Design A): the old has_graph filter
     silently hid 337 of the 669 listed people. People without
     graph data get a neutral dot size — presence first; emphasis
     is earned by data, never by exclusion. */
  var list = people().slice()
    .sort(function(a, b){ return (dir[b].strength || 0) - (dir[a].strength || 0) || a - b; });
  var ringOf = {};
  list.forEach(function(di){ var t = TIER_RANK[tierOf(dir[di])]; ringOf[di] = t == null ? 3 : t; });
  NET.nodes = []; NET.byDi = {};
  list.forEach(function(di){
    var r = dir[di];
    var ratio = r.has_graph === false ? 0.3 : (r.strength || 0) / maxS;
    var nd = { di:di, ring:ringOf[di], r:2 + 3.6 * ratio, nw:NEWGAIN[di] ? 1 : 0,
               orgs:netOrgsOf(r), primary:null, hub:null, sring:4, sx:0, sy:0, dx:0, dy:0 };
    NET.nodes.push(nd); NET.byDi[di] = nd;
  });
  /* Membership counts over the whole map decide which orgs earn
     hubs, and which hub is each person's main one (their largest
     qualifying organization; ties break alphabetically). */
  var counts = {};
  NET.nodes.forEach(function(nd){ nd.orgs.forEach(function(nm){ counts[nm] = (counts[nm] || 0) + 1; }); });
  NET.nodes.forEach(function(nd){
    var best = null;
    nd.orgs.forEach(function(nm){
      if(counts[nm] < HUB_MIN) return;
      if(!best || counts[nm] > counts[best] || (counts[nm] === counts[best] && nm < best)) best = nm;
    });
    nd.primary = best;
  });
  /* Score positions: Dunbar rank layers, radius = closeness.
     Within a layer, members are ordered by main organization
     (largest first), then by score, so org-mates land in
     contiguous soft sectors around the ring. Angle jitter is a
     fraction of the person's own slot, so sectors survive it. */
  var scAll = scoreAll(), byLayer = [[], [], [], [], []];
  NET.nodes.forEach(function(nd){ var s = scAll[nd.di]; byLayer[(s && s.layer ? s.layer : 5) - 1].push(nd); });
  byLayer.forEach(function(arr, layer){
    arr.sort(function(a, b){
      var ca = a.primary ? counts[a.primary] : 0, cb = b.primary ? counts[b.primary] : 0;
      if(cb !== ca) return cb - ca;
      var na = a.primary || '\uffff', nb = b.primary || '\uffff';
      if(na !== nb) return na < nb ? -1 : 1;
      return (scAll[b.di].score - scAll[a.di].score) || (a.di - b.di);
    });
    var n = arr.length, TAU = Math.PI * 2;
    /* Even spacing inside each org sector (JD 2026-10-22): a
       sector is the contiguous run of org-mates in the sorted
       ring; its span is its share of the circle, and each member
       sits at the center of an equal slot within that span.
       Jitter is capped at a quarter of a slot, so neighbours
       keep real air between them instead of clumping. */
    var k = 0;
    while(k < n){
      var j = k + 1;
      while(j < n && (arr[j].primary || '') === (arr[k].primary || '')) j++;
      var span = (j - k) / n * TAU, slot = span / (j - k), start = k / n * TAU;
      for(var m = k; m < j; m++){
        var nd2 = arr[m], rng = mulberry32((nd2.di + 7919) * 2654435761 % 2147483647);
        var ang = start + (m - k + 0.5) * slot + (rng() - 0.5) * slot * 0.25 + layer * 0.7;
        var rad = SCORE_RADII[layer] + (rng() - 0.5) * 2 * SCORE_SPREAD[layer];
        nd2.sring = layer; nd2.sx = nd2.dx = Math.cos(ang) * rad; nd2.sy = nd2.dy = Math.sin(ang) * rad;
        /* Universe (3D) position, derived from this same slot:
           longitude = the 2D sector angle (org wedges survive
           as longitude wedges), latitude = the member's place
           within its org run, spread over ±60°. The place is
           interleaved by the golden ratio rather than swept in
           order — a straight sweep draws each org as a diagonal
           ribbon across the sphere, while the interleave fills
           the wedge evenly, the way the flat ring fills its arc.
           The shell radius is exactly the layer's ring radius —
           no spread jitter — so each closeness layer is a clean
           sphere. Deterministic: a pure function of the run
           index, so these coordinates never change between loads. */
        var lat = (((m - k) * 0.61803398875) % 1 - 0.5) * 2.1, clat = Math.cos(lat), R3 = SCORE_RADII[layer];
        nd2.lat = lat; nd2.lon = ang;
        nd2.px = R3 * clat * Math.cos(ang); nd2.py = R3 * Math.sin(lat); nd2.pz = R3 * clat * Math.sin(ang);
      }
      k = j;
    }
  });
  /* Hubs: one per qualifying org, at the centroid of its members.
     A hub is furniture on the spokes — nobody moves for it. */
  var hubMap = {}, hubOrder = [];
  NET.nodes.forEach(function(nd){
    nd.orgs.forEach(function(nm){
      if(counts[nm] < HUB_MIN) return;
      var h = hubMap[nm]; if(!h){ h = hubMap[nm] = { name:nm, nds:[], x:0, y:0 }; hubOrder.push(h); }
      h.nds.push(nd);
    });
  });
  hubOrder.forEach(function(h){
    var sx = 0, sy = 0;
    h.nds.forEach(function(nd){ sx += nd.sx; sy += nd.sy; });
    h.x = sx / h.nds.length; h.y = sy / h.nds.length;
    /* 3D hub point: the mean of the members' sphere positions —
       the spherical centroid, pulled toward the center by the
       averaging exactly as the flat centroid sits inside its ring. */
    var ax = 0, ay = 0, az = 0;
    h.nds.forEach(function(nd){ ax += nd.px || 0; ay += nd.py || 0; az += nd.pz || 0; });
    h.px = ax / h.nds.length; h.py = ay / h.nds.length; h.pz = az / h.nds.length;
  });
  hubOrder.sort(function(a, b){ return b.nds.length - a.nds.length || a.name.localeCompare(b.name); });
  NET.hubs = hubOrder;
  NET.nodes.forEach(function(nd){ nd.hub = nd.primary ? hubMap[nd.primary] : null; });
  NET.dirty = true;
}
function netColor(nd){
  /* Tier owns color, always (JD's standing rule). */
  return RING_C[nd.ring];
}
function viewNetwork(v){
  var legend = TIER_ORDER.map(function(t){ return [TIERS[t].c, TIERS[t].n]; }).concat([[RING_C[3], 'No tier yet']]);
  S.net.view = '2d'; NET.view = '2d';
  /* Design cleanup (JD 2026-10-28): one clean bar — title, find,
     view, reset, full screen. The old grouped/kicker stack was a
     mess of nested rows (and unclosed tags). */
  v.innerHTML = '<div class="page netpage"><div class="netbar"><div><h1 class="display">Network</h1></div>' +
    '<div class="netctl">' +
    '<div class="netfind"><input id="netq" type="search" placeholder="Find person" autocomplete="off" aria-label="Find a person on the map" spellcheck="false"><div id="netfr" class="netfr" hidden></div></div>' +
    '<button type="button" class="btn ghost sm' + (S.net.view === '2d' ? ' on' : '') + '" data-act="netview" data-v="2d" aria-pressed="' + (S.net.view === '2d' ? 'true' : 'false') + '">2D</button>' +
    '<button type="button" class="btn ghost sm" data-act="netreset">Reset view</button>' +
    '<button type="button" class="btn ghost sm" data-act="netfs" aria-pressed="false">Full screen</button>' +
    '</div></div>' +
    '<div class="netcols"><div class="netwrap"><canvas id="netcv" aria-label="Connection map"></canvas>' +
    '<div class="netfocus" id="netfocus" hidden></div>' +
    '<div class="nethov" id="nethov" hidden></div>' +
    '<div class="netlegend" id="netlegend">' + legend.map(function(l){ return '<span><i style="background:' + l[0] + '"></i>' + l[1] + '</span>'; }).join('') + '</div>' +
    '<button type="button" class="netlegchip" data-act="netlegend" aria-expanded="false" aria-controls="netlegend">Legend</button>' +
    '<div class="netzoom"><button type="button" class="ib" data-act="netzoom" data-d="1" aria-label="Zoom in">' + ic('plus', 18) + '</button><button type="button" class="ib" data-act="netzoom" data-d="-1" aria-label="Zoom out">' + ic('minus', 18) + '</button><button type="button" class="ib" data-act="netfit" aria-label="Reset view">' + ic('target', 18) + '</button></div>' +
    '</div>' +
    '<aside class="netpanel" id="netpanel"><div class="netprail">' +
    '<button type="button" class="ib sm netpchev" data-act="netpanel" aria-expanded="true" aria-label="Collapse panel">' + ic('chevr', 16) + '</button>' +
    '<button type="button" class="netprail-orgs" data-act="netpanel" aria-label="Expand panel">Orgs</button></div>' +
    '<div class="netpbody"><div id="netpcard" hidden></div><div class="netporgs" id="netporgs"></div><div class="netpstats" id="netpstats"></div></div></aside></div></div>';
  /* Panel state on entry: the stored preference, except that
     arriving with a person selected always opens it — the
     selection card lives in the panel. */
  netSetPanel(S.net.sel != null ? true : netPanelOpen());
  if(!NET.nodes.length || NET.stamp !== VER) { netBuild(); NET.stamp = VER; }
  NET.cv = $('#netcv'); NET.ctx = NET.cv.getContext('2d'); NET.hovEl = $('#nethov'); NET.hovDi = null;
  NET.hoverDi = null; NET.glide = null; NET.cxOff = 0;
  netResize();
  /* The camera is never reset on entry: its live values are the
     remembered camera for the whole visit. First entry homes it. */
  if(!NET._camInit){ netFitNow(); NET._camInit = true; }
  if(S.net.sel != null && NET.byDi[S.net.sel]) netFrameSel();
  netCard();
  var cv = NET.cv; NET.ptr = {}; NET.pinch = 0;
  cv.addEventListener('pointerdown', function(ev){
    NET.glide = null; /* a hand on the map interrupts any camera glide */
    netHovHide();
    cv.setPointerCapture(ev.pointerId);
    NET.ptr[ev.pointerId] = { x:ev.clientX, y:ev.clientY }; NET.moved = false;
    if(Object.keys(NET.ptr).length === 2) NET.pinch = netPinchDist();
  });
  cv.addEventListener('pointermove', function(ev){
    var p = NET.ptr[ev.pointerId];
    if(!p){
      var r0 = cv.getBoundingClientRect(), hx = ev.clientX - r0.left, hy = ev.clientY - r0.top;
      var h = netHit(hx, hy), hd = h ? h.di : null;
      if(hd !== NET.hoverDi){ NET.hoverDi = hd; cv.style.cursor = h ? 'pointer' : 'grab'; NET.dirty = true; }
      netHovPaint(ev, h);
      return;
    }
    var ks = Object.keys(NET.ptr);
    if(ks.length === 1){
      var dx = ev.clientX - p.x, dy = ev.clientY - p.y;
      if(Math.abs(dx) + Math.abs(dy) > 3) NET.moved = true;
      if(NET.view === '3d'){ NET.rot -= dx * 0.005; NET.pitch = Math.max(-1.25, Math.min(1.25, NET.pitch - dy * 0.003)); }
      else { var sp = NET.spin || 0, sc = Math.cos(sp), ss = Math.sin(sp); NET.cam.x -= (dx * sc + dy * ss) / NET.cam.z; NET.cam.y -= (-dx * ss + dy * sc) / NET.cam.z; }
    }
    p.x = ev.clientX; p.y = ev.clientY;
    if(ks.length === 2){
      var d = netPinchDist();
      if(NET.pinch) NET.cam.z = Math.max(0.3, Math.min(4, NET.cam.z * d / NET.pinch));
      NET.pinch = d; NET.moved = true;
    }
    NET.dirty = true;
  });
  function up(ev){
    var had = NET.ptr[ev.pointerId]; delete NET.ptr[ev.pointerId]; NET.pinch = 0;
    if(had && !NET.moved && Object.keys(NET.ptr).length === 0){
      var r = cv.getBoundingClientRect(), sx = ev.clientX - r.left, sy = ev.clientY - r.top;
      var n = netHit(sx, sy);
      if(n){ S.net.sel = n.di; netSetPanel(true); }
      else {
        var hub = netHubHit(sx, sy);
        if(hub) S.net.org = (S.net.org === hub.name) ? null : hub.name;
        else S.net.sel = null;
      }
      netCard(); NET.dirty = true;
    }
  }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', function(ev){
    ev.preventDefault(); NET.glide = null;
    var z2 = Math.max(0.3, Math.min(4, NET.cam.z * Math.exp(-ev.deltaY * 0.0011)));
    if(NET.view === '3d'){ NET.cam.z = z2; NET.dirty = true; return; }
    var r = cv.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
    var w0 = s2w(mx, my);
    NET.cam.z = z2;
    var dx2 = (mx - NET.W / 2 - NET.cxOff) / z2, dy2 = (my - NET.H / 2) / z2, sp = NET.spin || 0, sc = Math.cos(sp), ss = Math.sin(sp);
    NET.cam.x = w0[0] - (dx2 * sc + dy2 * ss); NET.cam.y = w0[1] - (-dx2 * ss + dy2 * sc); NET.dirty = true;
  }, { passive:false });
  cv.addEventListener('pointerleave', function(){ NET.hoverDi = null; netHovHide(); NET.dirty = true; });
  cancelAnimationFrame(NET.raf);
  (function frame(){
    if(!document.body.contains(NET.cv) || document.body.getAttribute('data-view') !== 'network') return;
    var now = performance.now();
    /* 3D idle motion: the sphere yaws at one revolution per 90
       seconds. A hand on the map (any pointer down) or a camera
       glide in flight pauses it, and reduced motion holds the
       sphere still. */
    if(NET.view === '3d' && !REDUCED_MOTION && !NET.glide && !Object.keys(NET.ptr).length){
      var dt = Math.min(100, now - (NET.lastT || now));
      if(dt > 0){ NET.rot = (NET.rot + dt / 1000 * (Math.PI * 2 / 90)) % (Math.PI * 2); NET.dirty = true; }
    }
    /* 2D idle spin (JD 2026-10-28): same 90-second revolution,
       same pauses — a hand on the map, a glide, reduced motion. */
    if(NET.view === '2d' && !REDUCED_MOTION && !NET.glide && !Object.keys(NET.ptr).length){
      var dt2 = Math.min(100, now - (NET.lastT || now));
      if(dt2 > 0){ NET.spin = ((NET.spin || 0) + dt2 / 1000 * (Math.PI * 2 / 90)) % (Math.PI * 2); NET.dirty = true; }
    }
    NET.lastT = now;
    netGlideStep(now);
    /* Search pulse: keep redrawing while the found person's
       ring expands (900ms); reduced motion never starts one. */
    if(NET.pulse && !REDUCED_MOTION){ if(now - NET.pulse.t0 >= 900) NET.pulse = null; else NET.dirty = true; }
    if(NET.dirty){ netDraw(); NET.dirty = false; }
    NET.raf = requestAnimationFrame(frame);
  })();
}

/* ---------- Hover card: the explorer's floating card. It follows
   the cursor with an offset and flips near the edges, never takes
   pointer events, and shows on fine pointers only (touch keeps
   tap-to-select). Line one is the name, line two tier and closeness
   score, line three one fact. ---------- */
var NET_FINE = !!(window.matchMedia && window.matchMedia('(pointer:fine)').matches);
function netHovPaint(ev, nd){
  var el = NET.hovEl; if(!el) return;
  if(!NET_FINE || !nd || Object.keys(NET.ptr).length){ netHovHide(); return; }
  if(NET.hovDi !== nd.di){
    NET.hovDi = nd.di;
    var e = D.directory[nd.di], s = scoreFor(nd.di), f = flyFact(e);
    var sy = knownSinceYear(e), yrs = sy ? new Date().getFullYear() - sy : null;
    var ka = knownAssociates(e).length, rel = cap(gv(e, 'relationship') || '');
    el.innerHTML = '<b>' + esc(dispName(e)) + '</b>' + milBadge(e) +
      '<span class="nh-l2">' + esc(tierName(e) || 'No tier yet') + (s ? ' · Score ' + s.score : '') + (ka ? ' · ' + ka + ' associate' + (ka === 1 ? '' : 's') : '') + '</span>' +
      ((rel || yrs != null) ? '<span>' + esc([rel, yrs != null ? 'Known ' + yrs + ' yr' + (yrs === 1 ? '' : 's') : ''].filter(Boolean).join(' · ')) + '</span>' : '') +
      (nd.orgs.length ? '<span class="nh-orgs">' + esc(nd.orgs.join(', ')) + '</span>' : '') +
      (f ? '<span class="nh-l3">' + esc(f) + '</span>' : '');
  }
  var r = NET.cv.getBoundingClientRect();
  el.hidden = false;
  var x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 16, w = el.offsetWidth, h = el.offsetHeight;
  if(x + w > NET.W - 4) x = ev.clientX - r.left - w - 10;
  if(y + h > NET.H - 4) y = ev.clientY - r.top - h - 10;
  el.style.transform = 'translate3d(' + Math.max(2, x).toFixed(1) + 'px,' + Math.max(2, y).toFixed(1) + 'px,0)';
  el.classList.add('vis');
}
function netHovHide(){
  var el = NET.hovEl;
  if(el){ el.hidden = true; el.classList.remove('vis'); }
  NET.hovDi = null;
}
function flyFact(e){
  var loc = ptNormLoc(ptLocVal(e));
  return loc || cap(gv(e, 'relationship')) || cap(gv(e, 'context')) || (knownSinceYear(e) ? 'Known since ' + knownSinceYear(e) : '');
}

/* ---------- Hub labels: "NAME — N" orientation plates for the
   largest organizations on the map — the cluster-plate system,
   retargeted from cluster centroids to hub points (a hub IS its
   members' centroid, so the plate sits exactly on the diamond).
   Collision-resolved with real measured bounds: when two plates
   would overlap, the larger organization wins and the smaller
   drops out. The layer fades away as you zoom in, where
   orientation is no longer the question — except the focused
   organization's plate, which stays. Never takes pointer
   events; no person labels exist at any zoom (hard rule). ----- */


function netPinchDist(){ var k = Object.keys(NET.ptr).map(function(i){ return NET.ptr[i]; }); return k.length < 2 ? 0 : Math.hypot(k[0].x - k[1].x, k[0].y - k[1].y); }
function netResize(){
  var cv = NET.cv; if(!cv) return;
  var r = cv.getBoundingClientRect(); NET.dpr = Math.min(2, window.devicePixelRatio || 1);
  var ow = NET.W;
  NET.W = Math.max(200, r.width); NET.H = Math.max(200, r.height);
  cv.width = NET.W * NET.dpr; cv.height = NET.H * NET.dpr; NET.dirty = true;
  /* Selection panel compensation: when the panel's arrival is what
     changed the canvas width, glide the map center by the same amount,
     so content keeps its place on the page and shifts WITH the panel
     over 240ms instead of snapping sideways in one frame. */
  var pf = NET._panelFlag; NET._panelFlag = false;
  if(pf && ow && NET.W !== ow) netGlide(240, { cxoff:NET.cxOff + (ow - NET.W) / 2 });
}
function netFit(){
  /* Reset is a 450ms glide home, not a snap. */
  netGlide(450, { c2x:0, c2y:0, c2z:netFitZ() });
}
/* Reset view (V2.35.0): fitted default framing, and every focus
   cleared — organization, person, search text, pulse. In 3D the
   sphere's yaw and pitch also glide back to their defaults. Both
   controls labeled "Reset view" (toolbar button, zoom-cluster
   target icon) run this. */
function netResetView(){
  S.net.org = null; S.net.sel = null; NET.pulse = null;
  var nq = $('#netq'); if(nq) nq.value = '';
  var nb = $('#netfr'); if(nb) nb.hidden = true;
  if(NET.view === '3d'){
    netGlide(450, { c2x:0, c2y:0, c2z:netFitZ(), r3:NET.rot + netAngDelta(0 - NET.rot), p3:NETU_PITCH0 });
  } else netFit();
  netCard(); NET.dirty = true;
}
/* 2D projection with the idle spin (JD 2026-10-28): the flat map
   slowly rotates about the view center at the house rate (one
   revolution per 90 s), pausing under a hand, a glide, or reduced
   motion. Every 2D screen<->world conversion funnels through
   w2s/s2w, so drawing, picking, pan and zoom all stay in step. */
function w2s(x, y){
  var dx = x - NET.cam.x, dy = y - NET.cam.y, s = NET.spin || 0;
  if(s){ var c = Math.cos(s), sn = Math.sin(s), rx = dx * c - dy * sn; dy = dx * sn + dy * c; dx = rx; }
  return [dx * NET.cam.z + NET.W / 2 + NET.cxOff, dy * NET.cam.z + NET.H / 2];
}
function s2w(sx, sy){
  var dx = (sx - NET.W / 2 - NET.cxOff) / NET.cam.z, dy = (sy - NET.H / 2) / NET.cam.z, s = NET.spin || 0;
  if(s){ var c = Math.cos(s), sn = Math.sin(s); return [NET.cam.x + dx * c + dy * sn, NET.cam.y - dx * sn + dy * c]; }
  return [NET.cam.x + dx, NET.cam.y + dy];
}
/* ---------- 3D view: the universe (JD 2026-10-23). The Design
   A layout lifted onto spheres: every person sits on the
   closeness shell of their layer (netBuild stores px/py/pz —
   longitude from their 2D sector angle, latitude from their
   place in the org run), JD at the center, hubs at their
   members' spherical centroid. The camera orbits the sphere:
   NET.rot is yaw, NET.pitch is pitch, NET.cam.z dollies. The
   projection is the same hand-rolled perspective divide the
   old tilted disc used — no WebGL. The fourth return value is
   view depth (negative = the near side); draw order, alpha
   and picking all read it, and picking never reaches through
   the sphere to the far side. ---------- */
var NETU_F = 2300; /* perspective focal distance, world units */
var NETU_PITCH0 = 0.45; /* the default orbit pitch, radians */
function netP3U(x, y, z){
  var cA = Math.cos(NET.rot), sA = Math.sin(NET.rot), cB = Math.cos(NET.pitch), sB = Math.sin(NET.pitch);
  var xr = x * cA + z * sA, z1 = -x * sA + z * cA;
  var yr = y * cB - z1 * sB, zr = y * sB + z1 * cB;
  var ps = NETU_F / (NETU_F + zr);
  return [NET.W / 2 + NET.cxOff + xr * ps * NET.cam.z, NET.H / 2 - yr * ps * NET.cam.z, ps, zr];
}
/* Camera basis in world space (right, up) — the guide shells
   are drawn as the great circles facing the camera. */
function netCamBasis(){
  var cA = Math.cos(NET.rot), sA = Math.sin(NET.rot), cB = Math.cos(NET.pitch), sB = Math.sin(NET.pitch);
  return { r:[cA, sA * sB, -sA * cB], u:[0, cB, sB] };
}
/* Nearness from view depth: 1 at the closest point of the
   outermost shell, 0 at the farthest. */
function netNearF(d){ var f = 0.5 - d / 1840; return f < 0 ? 0 : f > 1 ? 1 : f; }
function netAngDelta(d){ var TAU = Math.PI * 2; while(d > Math.PI) d -= TAU; while(d < -Math.PI) d += TAU; return d; }
/* Turn the sphere so a person faces the camera, centered:
   yaw λ + π/2 and pitch −φ put their direction at the front
   (λ = their longitude, φ = their latitude). The yaw target
   is the equivalent angle nearest the current one, so the
   glide always takes the short way around. */
function netFaceNode(nd, dur){
  if(nd.px == null) return;
  var lam = Math.atan2(nd.pz, nd.px), phi = Math.atan2(nd.py, Math.hypot(nd.px, nd.pz));
  netGlide(dur == null ? 450 : dur, {
    r3:NET.rot + netAngDelta(lam + Math.PI / 2 - NET.rot),
    p3:-phi,
    c2z:Math.max(NET.cam.z, netFitZ() * 1.3)
  });
}
/* A hub's screen position in either view (hub plates, hub picking). */
function netHS(h){ if(NET.view === '3d'){ var p = netP3U(h.px, h.py, h.pz); return [p[0], p[1]]; } return w2s(h.x, h.y); }
function netHit(sx, sy){
  if(NET.view === '3d'){
    var best3 = null, bd3 = 1e9;
    NET.nodes.forEach(function(n){
      var p = netP3U(n.px, n.py, n.pz);
      if(p[3] >= 0) return; /* the far side is never clickable through the sphere */
      var d = Math.hypot(p[0] - sx, p[1] - sy), lim = Math.max(10, n.r * Math.sqrt(NET.cam.z) * p[2] + 7);
      if(d < lim && d < bd3){ bd3 = d; best3 = n; }
    });
    return best3;
  }
  var wp = s2w(sx, sy), wx = wp[0], wy = wp[1], best = null, bd = 1e9, lim = Math.max(8, 16 / NET.cam.z);
  NET.nodes.forEach(function(n){ var d = Math.hypot(n.dx - wx, n.dy - wy); if(d < lim && d < bd){ bd = d; best = n; } });
  return best;
}
function netHubHit(sx, sy){
  var best = null, bd = 1e9;
  NET.hubs.forEach(function(h){
    var s = netHS(h), d = Math.hypot(s[0] - sx, s[1] - sy);
    if(d < 13 && d < bd){ bd = d; best = h; }
  });
  return best;
}
function netInk(){ return document.documentElement.getAttribute('data-mode') === 'dark' ? '255,255,255' : '23,38,56'; }
function netDraw(){
  var ctx = NET.ctx, z = NET.cam.z, is3 = NET.view === '3d';
  ctx.setTransform(NET.dpr, 0, 0, NET.dpr, 0, 0); ctx.clearRect(0, 0, NET.W, NET.H);
  /* One projection for the whole frame: flat w2s in 2D; in 3D
     every node and hub projects once from its sphere position
     (netP3U — third value = perspective scale, fourth = view
     depth) and the rest of the frame reads the cached points. */
  var P = function(x, y){ var s = w2s(x, y); return [s[0], s[1], 1, 0]; };
  var NP, HP;
  if(is3){
    NET.nodes.forEach(function(n){ n._p = netP3U(n.px, n.py, n.pz); });
    NET.hubs.forEach(function(h){ h._p = netP3U(h.px, h.py, h.pz); });
    NP = function(n){ return n._p; };
    HP = function(h){ return h._p; };
  } else {
    NP = function(n){ return P(n.dx, n.dy); };
    HP = function(h){ return P(h.x, h.y); };
  }
  var c = is3 ? netP3U(0, 0, 0) : P(0, 0);
  /* Painter order in 3D: far side first (largest depth), so
     near dots and hubs draw over far ones. */
  var nodeOrder = NET.nodes, hubOrder = NET.hubs;
  if(is3){
    nodeOrder = NET.nodes.slice().sort(function(a, b){ return b._p[3] - a._p[3]; });
    hubOrder = NET.hubs.slice().sort(function(a, b){ return b._p[3] - a._p[3]; });
  }
  /* guide rings: the Dunbar layers, neutral strokes (tier keeps color), labeled */
  ctx.font = '600 10px Archivo, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  SCORE_RADII.forEach(function(r, i){
    ctx.strokeStyle = 'rgba(' + netInk() + ',0.10)'; ctx.lineWidth = 1;
    ctx.beginPath();
    if(is3){
      /* the shell's outline: the great circle of this closeness
         shell that faces the camera */
      var bs = netCamBasis();
      for(var a2 = 0; a2 <= 72; a2++){
        var t2 = a2 / 72 * 6.2832, co2 = Math.cos(t2), si2 = Math.sin(t2);
        var gp = netP3U(r * (co2 * bs.r[0] + si2 * bs.u[0]), r * (co2 * bs.r[1] + si2 * bs.u[1]), r * (co2 * bs.r[2] + si2 * bs.u[2]));
        if(a2 === 0) ctx.moveTo(gp[0], gp[1]); else ctx.lineTo(gp[0], gp[1]);
      }
    } else ctx.arc(c[0], c[1], r * z, 0, 6.2832);
    ctx.stroke();
    ctx.fillStyle = 'rgba(' + netInk() + ',0.42)';
    if(is3){ var lp = netP3U(r * bs.u[0], r * bs.u[1], r * bs.u[2]); ctx.fillText(SCORE_GUIDES[i], lp[0], lp[1] - 5); }
    else ctx.fillText(SCORE_GUIDES[i], c[0], c[1] - r * z - 5);
  });
  var sel = S.net.sel != null ? NET.byDi[S.net.sel] : null;
  var hov = NET.hoverDi != null ? NET.byDi[NET.hoverDi] : null;
  var focus = hov || sel;
  var orgF = null;
  if(S.net.org) for(var hi = 0; hi < NET.hubs.length; hi++) if(NET.hubs[hi].name === S.net.org){ orgF = NET.hubs[hi]; break; }
  function memberOf(nd, h){ return nd.orgs.indexOf(h.name) >= 0; }
  /* --- Spokes, tier one: ambient texture. Everyone's tie to JD
     is drawn, hairline-faint — JD -> hub -> member for org
     members, one direct line for everyone else. Center->hub
     segments are drawn once per hub, so the fan at the center is
     a few dozen lines instead of 669. Ambient spokes fade out
     past z = 1.2; the focus spokes below stay at any zoom. --- */
  var amb = z <= 1.2 ? 1 : Math.max(0, 1 - (z - 1.2) / 0.5);
  if(amb > 0){
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(' + netInk() + ',' + (0.10 * amb * (orgF ? 0.35 : 1)).toFixed(3) + ')';
    ctx.beginPath();
    NET.hubs.forEach(function(h){ var p = HP(h); ctx.moveTo(c[0], c[1]); ctx.lineTo(p[0], p[1]); });
    ctx.stroke();
    /* Member spokes: one batch in 2D; in 3D two batches, the
       far side at a fraction of the alpha, so depth reads in
       the lines as well as in the dots. */
    var spokeBatch = function(farSide, alpha){
      ctx.strokeStyle = 'rgba(' + netInk() + ',' + alpha.toFixed(3) + ')';
      ctx.beginPath();
      NET.nodes.forEach(function(n){
        var p = NP(n);
        if(is3 && (p[3] >= 0) !== farSide) return;
        if(p[0] < -80 || p[1] < -80 || p[0] > NET.W + 80 || p[1] > NET.H + 80) return;
        if(n.hub){ var hp = HP(n.hub); ctx.moveTo(hp[0], hp[1]); ctx.lineTo(p[0], p[1]); }
        else { ctx.moveTo(c[0], c[1]); ctx.lineTo(p[0], p[1]); }
      });
      ctx.stroke();
    };
    if(is3){ spokeBatch(true, 0.05 * amb * (orgF ? 0.3 : 1) * 0.4); spokeBatch(false, 0.05 * amb * (orgF ? 0.3 : 1)); }
    else spokeBatch(false, 0.05 * amb * (orgF ? 0.3 : 1));
  }
  /* --- Spokes, tier two: the focused organization's route at
     full strength — JD -> its hub, and the hub -> every member
     (membership, not just primary routing: a person in several
     orgs lights up under each of them). --- */
  if(orgF){
    var op = HP(orgF), of3 = is3 ? 0.35 + 0.65 * netNearF(op[3]) : 1;
    ctx.strokeStyle = 'rgba(' + netInk() + ',' + (0.55 * of3).toFixed(3) + ')'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(op[0], op[1]); ctx.stroke();
    ctx.strokeStyle = 'rgba(' + netInk() + ',' + (0.38 * of3).toFixed(3) + ')'; ctx.lineWidth = 1.1;
    ctx.beginPath();
    orgF.nds.forEach(function(n){
      var p = NP(n);
      if(p[0] < -80 || p[1] < -80 || p[0] > NET.W + 80 || p[1] > NET.H + 80) return;
      ctx.moveTo(op[0], op[1]); ctx.lineTo(p[0], p[1]);
    });
    ctx.stroke();
  }
  /* --- the selected person's known-associate edges (kept from
     the old map: the one transient line set that earned its ink) --- */
  var hot = {};
  if(sel){
    var se = D.directory[sel.di], a = NP(sel);
    ctx.strokeStyle = 'rgba(' + netInk() + ',.4)'; ctx.lineWidth = 1;
    knownAssociates(se).forEach(function(nb){
      var t = BYN[(nb.u || '').toLowerCase()], nd = t != null ? NET.byDi[t] : null; if(!nd) return;
      hot[t] = 1;
      var b = NP(nd); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    });
  }
  /* --- Spokes, tier two (person): the focused person's own
     route, full strength — through their hub when they have one. --- */
  if(focus){
    var fp = NP(focus);
    ctx.strokeStyle = 'rgba(' + netInk() + ',' + (is3 ? (0.9 * (0.45 + 0.55 * netNearF(fp[3]))).toFixed(3) : '0.9') + ')'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    if(focus.hub){ var fhp = HP(focus.hub); ctx.moveTo(c[0], c[1]); ctx.lineTo(fhp[0], fhp[1]); ctx.lineTo(fp[0], fp[1]); }
    else { ctx.moveTo(c[0], c[1]); ctx.lineTo(fp[0], fp[1]); }
    ctx.stroke();
  }
  /* --- hub diamonds --- */
  hubOrder.forEach(function(h){
    var p = HP(h);
    if(p[0] < -20 || p[1] < -20 || p[0] > NET.W + 20 || p[1] > NET.H + 20) return;
    var s = 4.5 * (is3 ? p[2] : 1), foc = orgF === h;
    ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(Math.PI / 4);
    if(is3) ctx.globalAlpha = 0.30 + 0.70 * netNearF(p[3]);
    ctx.fillStyle = foc ? '#e30613' : '#0a0a0a';
    ctx.strokeStyle = foc ? '#e30613' : 'rgba(' + netInk() + ',0.6)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.rect(-s, -s, s * 2, s * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  });
  /* --- people --- */
  nodeOrder.forEach(function(n){
    var p = NP(n);
    if(p[0] < -10 || p[1] < -10 || p[0] > NET.W + 10 || p[1] > NET.H + 10) return;
    var rr = n.r * Math.sqrt(z) * (is3 ? p[2] : 1), col = netColor(n), isSel = sel && sel.di === n.di;
    var al = 1;
    /* depth: the far side of the sphere reads dimmer */
    if(is3) al = 0.30 + 0.70 * netNearF(p[3]);
    if(orgF && !memberOf(n, orgF)) al = Math.min(al, 0.16);
    if(sel && !isSel && !hot[n.di]) al = Math.min(al, 0.28);
    if(netLowConf(n)) al *= 0.45;
    ctx.globalAlpha = al;
    if(n.nw){ ctx.fillStyle = hexA(col, 0.18); ctx.beginPath(); ctx.arc(p[0], p[1], rr + 5, 0, 6.2832); ctx.fill(); }
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p[0], p[1], rr, 0, 6.2832); ctx.fill();
    if(isSel){ ctx.strokeStyle = '#e30613'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(p[0], p[1], rr + 3.5, 0, 6.2832); ctx.stroke(); }
    /* Search-found pulse: one expanding ring over 900ms. */
    if(isSel && NET.pulse && NET.pulse.di === n.di && !REDUCED_MOTION){
      var pt = (performance.now() - NET.pulse.t0) / 900;
      if(pt >= 0 && pt < 1){ ctx.strokeStyle = 'rgba(227,6,19,' + (0.65 * (1 - pt)).toFixed(3) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], rr + 4 + pt * 16, 0, 6.2832); ctx.stroke(); }
    }
  });
  ctx.globalAlpha = 1;
  /* --- JD at the center --- */
  ctx.fillStyle = '#e30613'; ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(7, 10 * Math.sqrt(z)), 0, 6.2832); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.font = '700 ' + Math.max(8, 10 * Math.sqrt(z)) + 'px Archivo,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('JD', c[0], c[1] + 0.5);
  /* In 3D, a person turned to face the camera (search) sits at
     the exact screen center — the same point as JD's disc,
     which would swallow their dot. Redraw the selected person
     over the center disc (near side only; she was already drawn
     in the people pass, this only lifts her above JD). */
  if(is3 && sel){
    var sp3 = NP(sel);
    if(sp3[3] < 0){
      var sr3 = sel.r * Math.sqrt(z) * sp3[2];
      ctx.fillStyle = netColor(sel); ctx.beginPath(); ctx.arc(sp3[0], sp3[1], sr3, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = '#e30613'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(sp3[0], sp3[1], sr3 + 3.5, 0, 6.2832); ctx.stroke();
      if(NET.pulse && NET.pulse.di === sel.di && !REDUCED_MOTION){
        var pt3 = (performance.now() - NET.pulse.t0) / 900;
        if(pt3 >= 0 && pt3 < 1){ ctx.strokeStyle = 'rgba(227,6,19,' + (0.65 * (1 - pt3)).toFixed(3) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sp3[0], sp3[1], sr3 + 4 + pt3 * 16, 0, 6.2832); ctx.stroke(); }
      }
    }
  }
}
/* Map stats for the Network right panel. Display-only counts over what is on the map. */
function netStatsHTML(){
  var tc = {}, nw = 0;
  NET.nodes.forEach(function(n){ var t = tierOf(D.directory[n.di]) || 'none'; tc[t] = (tc[t] || 0) + 1; if(n.nw) nw++; });
  var rows = [['On the map', String(NET.nodes.length)]];
  TIER_ORDER.forEach(function(t){ if(tc[t]) rows.push([TIERS[t].n, String(tc[t]), TIERS[t].c]); });
  if(tc.none) rows.push(['No tier yet', String(tc.none), RING_C[3]]);
  var lc = [0, 0, 0, 0, 0];
  NET.nodes.forEach(function(n){ lc[n.sring || 0]++; });
  ['Layer 1 · top 5', 'Layer 2 · 6\u201315', 'Layer 3 · 16\u201350', 'Layer 4 · 51\u2013150', 'Layer 5 · 150+'].forEach(function(l, i){ if(lc[i]) rows.push([l, String(lc[i])]); });
  rows.push(['Organization hubs', String(NET.hubs.length)]);
  if(nw) rows.push(['New connections', String(nw)]);
  return '<div class="side-h"><h3>Map</h3></div><div class="statrows">' +
    rows.map(function(r){ return '<div class="srow2"><span>' + (r[2] ? '<i class="sdot" style="background:' + r[2] + '"></i>' : '') + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('') + '</div>';
}
/* The panel's organization index (Design C's list, as Design A's
   selector): every hub, ranked by member count. Selecting a row
   raises that organization on the map; "All" restores everyone. */
function netOrgsHTML(){
  if(!NET.hubs.length) return '';
  var rows = NET.hubs.slice(0, 30).map(function(h){
    return '<button type="button" class="netorg' + (S.net.org === h.name ? ' on' : '') + '" data-act="netorg" data-v="' + esc(h.name) + '"><span>' + esc(h.name) + '</span><b>' + h.nds.length + '</b></button>';
  }).join('');
  var more = NET.hubs.length > 30 ? '<p class="dim netorgmore">+ ' + (NET.hubs.length - 30) + ' smaller organizations \u2014 their hubs are on the map, unlabeled.</p>' : '';
  return '<div class="side-h"><h3>Organizations</h3></div><div class="netorgs">' +
    '<button type="button" class="netorg' + (!S.net.org ? ' on' : '') + '" data-act="netorg" data-v=""><span>All organizations</span><b>' + NET.nodes.length + '</b></button>' +
    rows + '</div>' + more;
}
function netCard(){
  var panel = $('#netpanel'); if(!panel) return;
  var cardBox = $('#netpcard'), statBox = $('#netpstats'), orgBox = $('#netporgs'), cols = panel.parentNode;
  if(orgBox) orgBox.innerHTML = netOrgsHTML();
  if(statBox) statBox.innerHTML = netStatsHTML();
  var di = S.net.sel;
  if(di == null || !D.directory[di]){
    if(cardBox){ cardBox.hidden = true; cardBox.innerHTML = ''; }
    if(cols) cols.classList.toggle('sel', !!S.net.org);
  } else {
    var e = D.directory[di], ka = knownAssociates(e).length, inFam = !!famDisplay()[di];
    var nd = NET.byDi[di], sc = scoreFor(di), sy = knownSinceYear(e), yrs = sy ? new Date().getFullYear() - sy : null;
    var drows = [['Tier', tierName(e) || 'No tier yet']];
    if(gv(e, 'relationship')) drows.push(['Relationship', cap(gv(e, 'relationship'))]);
    if(yrs != null) drows.push(['Years known', yrs + ' (since ' + sy + ')']);
    if(sc) drows.push(['Closeness score', String(sc.score)]);
    drows.push(['Known associates', String(ka)]);
    if(nd && nd.orgs.length) drows.push(['Organizations', nd.orgs.join(', ')]);
    drows.push(['Connections through', nd && nd.hub ? nd.hub.name : 'Direct to JD']);
    var detail = '<div class="statrows nc-rows">' + drows.map(function(r){ return '<div class="srow2"><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>'; }).join('') + '</div>';
    cardBox.hidden = false;
    cardBox.innerHTML = '<div class="nc-h">' + avatar(e, 'md') + '<div><b>' + esc(dispName(e)) + '</b>' + milBadge(e) + '<small>' + esc(infoLine(e) || (effHandle(e) ? '@' + effHandle(e) : '')) + '</small></div>' +
      '<button type="button" class="ib" data-act="netclose" aria-label="Close">' + ic('x', 16) + '</button></div>' +
      '<div class="nc-f"><span>' + ka + ' known associate' + (ka === 1 ? '' : 's') + (RELN[e.relation] ? ' · ' + RELN[e.relation] : '') + '</span><span class="sp"></span>' +
      (inFam ? '<button type="button" class="btn ghost sm" data-act="openfam" data-di="' + di + '">Family</button>' : '') +
      '<button type="button" class="btn primary sm" data-act="popen1" data-di="' + di + '">Open profile</button></div>' +
      detail +
      '<div class="nc-scb">' + scoreBadgeHTML(di) + '</div>';
    if(cols) cols.classList.add('sel');
  }
  /* the panel opening or closing changes the canvas size; refit the
     backing store, flagged so netResize can glide the compensation */
  if(NET.cv && document.body.contains(NET.cv)){ NET._panelFlag = true; requestAnimationFrame(function(){ netResize(); }); }
  netFocusPaint();
}

/* ---------- Network chrome (V2.35.0): collapsible panel,
   find-a-person, focus chips. Display-state only — the panel
   preference persists per device like the other view prefs. --- */
function netPanelOpen(){
  var v = store('ncc_netpanel');
  if(v === '1') return true;
  if(v === '0') return false;
  /* First run on this device: open on wide screens, collapsed
     on narrow ones (the <=899px layout where the panel is an
     overlay, not a column). */
  return window.innerWidth > 899;
}
function netSetPanel(open, glide){
  store('ncc_netpanel', open ? '1' : '0');
  var p = $('#netpanel'); if(!p) return;
  p.classList.toggle('closed', !open);
  var b = $('.netpchev', p);
  if(b){ b.setAttribute('aria-expanded', open ? 'true' : 'false'); b.setAttribute('aria-label', open ? 'Collapse panel' : 'Expand panel'); }
  /* Width change resizes the canvas; ride the same flagged
     compensation glide the selection card uses. */
  if(glide && NET.cv && document.body.contains(NET.cv)){ NET._panelFlag = true; requestAnimationFrame(function(){ netResize(); }); }
}
/* Focus chips over the map: what is focused, with a way out.
   Repainted by netCard, so every focus path (panel row, hub
   tap, Home arrival, selection) stays in sync. */
function netFocusPaint(){
  var f = $('#netfocus'); if(!f) return;
  var html = '';
  if(S.net.org) html += '<span class="nf-chip"><span class="nf-tx">Focused: <b>' + esc(S.net.org) + '</b></span><button type="button" class="ib sm" data-act="netfocusx" data-v="org" aria-label="Clear organization focus">' + ic('x', 14) + '</button></span>';
  if(S.net.sel != null && D.directory[S.net.sel]){
    var e = D.directory[S.net.sel];
    html += '<span class="nf-chip"><span class="nf-tx"><b>' + esc(dispName(e)) + '</b>' + milBadge(e) + '</span><button type="button" class="ib sm" data-act="netfocusx" data-v="sel" aria-label="Clear selection">' + ic('x', 14) + '</button></span>';
  }
  f.innerHTML = html; f.hidden = !html;
}
/* Find a person: name matches over the people actually on the
   map (searchPeople's ranking, filtered to NET.byDi). Picking
   selects the person, opens the panel card, and glides the
   camera to them with a one-shot ring pulse. */
function netPaintFind(){
  var inp = $('#netq'), box = $('#netfr'); if(!inp || !box) return;
  var q = inp.value.trim();
  if(!q){ box.hidden = true; box.innerHTML = ''; return; }
  var hits = searchPeople(q, 40).filter(function(di){ return !!NET.byDi[di]; }).slice(0, 7);
  box.innerHTML = hits.length ? hits.map(function(di, i){
    var e = D.directory[di], nd = NET.byDi[di];
    return '<button type="button" class="netf-row' + (i === 0 ? ' on' : '') + '" data-act="netfindpick" data-di="' + di + '">' + avatar(e, 'sm') +
      '<span class="netf-tx"><b>' + esc(dispName(e)) + '</b>' + milBadge(e) + '<small>' + esc(nd.primary || tierName(e) || 'No tier yet') + '</small></span></button>';
  }).join('') : '<div class="netfnone">No match</div>';
  box.hidden = false;
}
function netPickFind(di){
  var nd = NET.byDi[di]; if(!nd) return;
  var box = $('#netfr'); if(box) box.hidden = true;
  S.net.sel = di;
  netSetPanel(true);
  netCard();
  NET.pulse = REDUCED_MOTION ? null : { di:di, t0:performance.now() };
  if(NET.view === '3d'){ netFaceNode(nd, 300); return; }
  var p2 = netP2(nd);
  netGlide(300, { c2x:p2[0], c2y:p2[1], c2z:Math.max(NET.cam.z, 1.6) });
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
/* Family view (V3.12.0) — the generation list. JD found the old
   zoomable plane unreadable: hairline connectors, grayscale
   generation tints, labels that only read zoomed in, and a
   zoomed-out layout that was never proven. Three concepts were
   prototyped against the real trees (family-concepts.html): a tidy
   org-chart whose thickened connectors still became a thicket on
   the 29-person Daniels tree, a radial ring chart whose labels
   collided outright, and this list — the winner in both themes.
   Each bloodline is a section; generations are labeled blocks on a
   thick spine; siblings are clustered under their parents; couples
   render as one unit; and every relationship is written as text
   next to the name, so nothing needs zooming, panning or decoding.
   The data model is untouched (famDisplay + famTrees); the canvas
   helpers below stay for the profile mini-tree. */
var FAM_GENLAB = ['Roots', 'Children', 'Grandchildren', 'Great-grandchildren', 'Great-great-grandchildren'];
var FAM_SCROLL = false;
function famGensOf(disp, tree){
  var inT = {}; tree.members.forEach(function(di){ inT[di] = 1; });
  function rel(di, rk){ return ((disp[di] && disp[di][rk]) || []).map(function(x){ return x.di; }).filter(function(x){ return inT[x]; }); }
  var gen = {}, guard = 0, again = true;
  tree.members.forEach(function(di){ gen[di] = 0; });
  while(again && guard++ < 14){
    again = false;
    tree.members.forEach(function(di){
      rel(di, 'parents').forEach(function(p){ if(gen[di] <= gen[p]){ gen[di] = gen[p] + 1; again = true; } });
    });
    tree.members.forEach(function(di){
      rel(di, 'spouses').forEach(function(s){ if(!rel(s, 'parents').length && gen[s] !== gen[di]){ gen[s] = gen[di]; again = true; } });
    });
  }
  var byGen = {};
  tree.members.forEach(function(di){ (byGen[gen[di]] = byGen[gen[di]] || []).push(di); });
  return Object.keys(byGen).sort(function(a, b){ return a - b; }).map(function(g){ return { g:+g, members:byGen[g] }; });
}
function famRelCaption(disp, tree, di){
  var inT = {}; tree.members.forEach(function(x){ inT[x] = 1; });
  function rel(rk){ return ((disp[di] && disp[di][rk]) || []).filter(function(x){ return inT[x.di]; }); }
  var ps = rel('parents').map(function(x){ return dispName(D.directory[x.di]); });
  var sp = rel('spouses').map(function(x){ return dispName(D.directory[x.di]); });
  var ch = rel('children').length;
  var bits = [];
  if(ps.length) bits.push('child of ' + ps.join(' & '));
  if(sp.length) bits.push('married to ' + sp.join(', '));
  if(ch) bits.push(ch + (ch === 1 ? ' child' : ' children') + ' in this tree');
  if(!bits.length) bits.push(tree.blood[di] ? 'root of this line' : 'married in');
  return bits.join(' · ');
}
function famChipHTML(di){
  var e = D.directory[di];
  return '<button type="button" class="fchip' + (S.fam.focus === di ? ' foc' : '') + '" data-act="fnode" data-di="' + di + '">' + avatar(e, 'sm') + '<b>' + esc(dispName(e)) + '</b></button>';
}
function famGenHTML(disp, tree, G){
  var inGen = {}; G.members.forEach(function(di){ inGen[di] = 1; });
  function rel(di, rk){ return ((disp[di] && disp[di][rk]) || []).map(function(x){ return x.di; }); }
  /* sibling clusters: group by parent set (in-tree), biggest first */
  var groups = {}, order = [];
  G.members.forEach(function(di){
    var key = rel(di, 'parents').filter(function(p){ return tree.blood[p] || inGen[p]; }).sort(function(a, b){ return a - b; }).join('|');
    if(!groups[key]){ groups[key] = []; order.push(key); }
    groups[key].push(di);
  });
  order.sort(function(a, b){ return groups[b].length - groups[a].length || (a < b ? -1 : 1); });
  var used = {}, h = '';
  order.forEach(function(key){
    var ms = groups[key].filter(function(di){ return !used[di]; });
    if(!ms.length) return;
    if(key && groups[key].length >= 2){
      var pnames = key.split('|').map(function(p){ return dispName(D.directory[+p]); }).join(' & ');
      h += '<div class="fgrp-lab">Children of ' + esc(pnames) + '</div>';
    }
    ms.forEach(function(di){
      if(used[di]) return;
      var sp = rel(di, 'spouses').filter(function(s){ return inGen[s] && !used[s]; })[0];
      if(sp != null){
        used[di] = 1; used[sp] = 1;
        h += '<div class="fp-row"><span class="fcouple">' + famChipHTML(di) + '<span class="fmrg"><i></i>married<i></i></span>' + famChipHTML(sp) + '</span>' +
          '<span class="fp-rel">' + esc(famRelCaption(disp, tree, di)) + '</span></div>';
      } else {
        used[di] = 1;
        h += '<div class="fp-row">' + famChipHTML(di) + '<span class="fp-rel">' + esc(famRelCaption(disp, tree, di)) + '</span></div>';
      }
    });
  });
  return h;
}
function famIndexHTML(ft){
  var total = 0;
  ft.forEach(function(t){ total += t.members.length; });
  var rows = [['Trees', String(ft.length)], ['People in trees', String(total)]];
  if(ft.length) rows.push(['Largest family', ft[0].title + ' · ' + ft[0].members.length]);
  var treeRows = ft.map(function(t){
    var rep = t.roots && t.roots.length ? t.roots[0] : t.members[0];
    return '<button type="button" class="srow' + (S.fam.focus === rep ? ' on' : '') + '" data-act="famtree" data-di="' + rep + '"><span>' + esc(t.title) + '</span><b>' + t.members.length + '</b></button>';
  }).join('');
  return '<aside class="fampanel"><div class="side-h"><h3>Summary</h3><button type="button" class="ib sm" data-act="famside" aria-label="Close summary">' + ic('x', 15) + '</button></div>' +
    '<div class="statrows">' + rows.map(function(r){ return '<div class="srow2"><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>'; }).join('') + '</div>' +
    '<div class="side-sec"><h4>Trees</h4>' + treeRows + '</div></aside>';
}
function viewFamily(v){
  var disp = famDisplay(), ftRes = famTrees(disp), ft = ftRes.trees || [];
  FAMV.lay = null; FAMV.pos = {}; FAMV.hover = null; FAMV.el = null;
  if(!ft.length){ v.innerHTML = '<div class="page">' + emptyState('No family trees yet.', 'Add a parent, spouse, child or sibling from a profile and the tree appears here.') + '</div>'; return; }
  var total = 0; ft.forEach(function(t){ total += t.members.length; });
  var sections = ft.map(function(t){
    var gens = famGensOf(disp, t);
    var body = gens.map(function(G, gi){
      return '<div class="fgen"><div class="fgen-lab">Generation ' + (gi + 1) + '<span>' + esc(FAM_GENLAB[gi] || '') + '</span></div>' +
        '<div class="fgen-people">' + famGenHTML(disp, t, G) + '</div></div>';
    }).join('');
    return '<section class="ftree" id="' + esc(t.id) + '"><header class="ftree-h"><h2>' + esc(t.title) + '</h2><span class="ftree-n">' + t.members.length + ' people</span>' +
      ((t.spousesFrom && t.spousesFrom.length) ? '<span class="ftree-note">Married-in spouses also appear in ' + t.spousesFrom.map(function(x){ return esc(x.title); }).join(', ') + '</span>' : '') +
      '</header>' + body + '</section>';
  }).join('');
  v.innerHTML = '<div class="page fampage"><div class="netbar"><div><h1 class="display">Family</h1><p class="sub">' + ft.length + ' bloodline' + (ft.length === 1 ? '' : 's') + ' · ' + total + ' people. Generations read top to bottom; every relationship is written next to the name.</p></div>' +
    '<div class="netctl"><button type="button" class="btn ghost sm" data-act="famside" aria-expanded="' + (sideOpen(S.fam.side) ? 'true' : 'false') + '">Summary</button></div></div>' +
    '<div class="netcard famfocus" id="famcard" hidden></div>' +
    '<div class="famcols2"><div class="famlist">' + sections + '</div>' +
    (sideOpen(S.fam.side) ? famIndexHTML(ft) : '') + '</div></div>';
  famCard();
  if(FAM_SCROLL){
    FAM_SCROLL = false;
    var n = document.querySelector('.fchip[data-di="' + S.fam.focus + '"]');
    if(n) n.scrollIntoView({ block:'center' });
  }
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
  box.innerHTML = '<div class="nc-h">' + avatar(e, 'md') + '<div><b>' + esc(dispName(e)) + '</b>' + milBadge(e) + '<small>' + esc(bits.join(' · ') || 'No links') + '</small></div><span class="sp"></span>' +
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
/* Manage mode (JD 2026-10-16): tick several names in one kind and combine
   them into a surviving canonical. Every affected profile is rewritten
   through the normal save path inside one undoable txn, and each loser
   is registered as an alias of the survivor in the org registry. */
var GMGR = { on:false, sel:{} };
function grpCombine(kind, losers, target){
  target = regApply(String(target || '').trim());
  if(!target) return 0;
  losers = losers.filter(function(L){ return L && regKey(L) !== regKey(target); });
  if(!losers.length) return 0;
  var n = 0;
  if(kind === 'groups'){
    var hadMembers = losers.some(function(L){ return (allGroups()[L] || []).length > 0; });
    txn('Combine groups', function(){
      losers.forEach(function(L){
        (allGroups()[L] || []).forEach(function(di){
          var arr = personGroups(D.directory[di]).map(function(g){ return g === L ? target : g; });
          setPersonGroups(di, arr.filter(function(g, i){ return arr.indexOf(g) === i; }));
          n++;
        });
      });
    });
    GRP_EXTRA = GRP_EXTRA.filter(function(g){ return losers.indexOf(g) < 0; });
    if(!hadMembers && GRP_EXTRA.indexOf(target) < 0) GRP_EXTRA.push(target);
    store('ncc_groups_extra', JSON.stringify(GRP_EXTRA));
  } else {
    txn('Combine organizations', function(){
      losers.forEach(function(L){
        orgMembers(kind, L).forEach(function(di){
          var e = D.directory[di];
          var arr = tagList(gv(e, kind)).map(function(o){ return regApply(o) === L ? target : regApply(o); });
          var seen = {}, out = [];
          arr.forEach(function(o){ var lk = o.toLowerCase(); if(o && !seen[lk]){ seen[lk] = 1; out.push(o); } });
          var patch = {}; patch[kind] = out.join(', ');
          queuePatch(di, patch);
          n++;
        });
      });
    });
  }
  losers.forEach(function(L){ regRegisterAlias(L, target, kind); });
  return n;
}
function grpNamesFor(kind){
  if(kind === 'groups'){ var m = allGroups(); return Object.keys(m).sort().map(function(n){ return { n:n, c:m[n].length }; }); }
  return orgNames(kind).map(function(n){ return { n:n, c:orgMembers(kind, n).length }; }).filter(function(x){ return x.c > 0; }).sort(function(a, b){ return b.c - a.c || a.n.localeCompare(b.n); });
}
/* ============================================================
   Groups, rebuilt (V2.32.0) — a card grid you can scan: every
   group is a card with its size, a face stack (photos where on
   file, tier-colored initials otherwise) and a name preview;
   opening one gives the full member list. Membership still lives
   in each person's own 'groups' list (the Sheet auto-fill keeps
   org/family groups complete); every write still flows through
   setPersonGroups -> queuePatch. Manage mode (combine) ticks
   cards instead of rows; its semantics are unchanged.
   ============================================================ */
var GRPV = { q:'', mq:'', scrollY:null, detail:null, lastKind:'', lastName:'', sort:(typeof store === 'function' ? store('ncc_grp_sort_v1') : '') || 'name' };
function grpMembersOf(kind, name){
  var mem = kind === 'groups' ? (allGroups()[name] || []) : orgMembers(kind, name);
  return mem.slice().sort(function(a, b){ return dispName(D.directory[a]).localeCompare(dispName(D.directory[b])); });
}
function grpOrgValues(){
  var seen = {};
  D.directory.forEach(function(e){ if(!liveEntry(e)) return; ORG_CATS.forEach(function(c){ tagList(gv(e, c.k)).forEach(function(o){ seen[regApply(o)] = 1; }); }); });
  return seen;
}
/* the derivation signal shown on cards and detail headers: where
   this group's membership comes from (JD 2026-10-22 auto-fill) */
function grpSignal(kind, name){
  if(kind === 'churches') return 'From Churches on profiles';
  if(kind === 'companies') return 'From Employers on profiles';
  if(kind === 'universities') return 'From Schools on profiles';
  var canon = regResolve(name), kinds = canon ? (ORGREG.kinds[regKey(canon)] || []) : [];
  if(kinds.some(function(k){ return k === 'churches' || k === 'companies' || k === 'universities'; })) return 'From organization: ' + canon;
  if(grpOrgValues()[name]) return 'From organization: ' + name;
  if(/27th|ibct/i.test(name)) return 'From the 27th IBCT roster';
  if(/family/i.test(name)) return 'From family links';
  return 'Your group';
}
function grpFace(e, cls){
  var nm = dispName(e), letter = esc((nm.replace(/^@/, '').trim().charAt(0) || '·').toUpperCase());
  var idx = phIndex();
  if(idx){
    var p = idx[nm];
    if(p && p.photo_url && phReview()[String(p.name).toLowerCase()] !== 'rejected'){
      var f = phFrameFor(p.name, p);
      return '<span class="gface ' + (cls || '') + '" style="--tc:' + tierCol(e) + '"><span class="gini">' + letter + '</span><img src="' + esc(f.url || p.photo_url) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.opacity=\'0\'" style="' + phFrameStyle(p) + '"></span>';
    }
  }
  return '<span class="gface ini ' + (cls || '') + '" style="--tc:' + tierCol(e) + '">' + letter + '</span>';
}
function grpFaces(mems){
  return '<span class="gfaces">' + mems.slice(0, 5).map(function(di){ return grpFace(D.directory[di]); }).join('') + '</span>';
}
function grpCard(kind, x, mems){
  mems = mems || grpMembersOf(kind, x.n);
  var prev = mems.slice(0, 3).map(function(di){ return dispName(D.directory[di]); }).join(', ');
  if(mems.length > 3) prev += ' · +' + (mems.length - 3) + ' more';
  return '<a class="gcard" href="#/groups/' + kind + '/' + encodeURIComponent(x.n) + '" data-act="gcard">' +
    '<span class="gc-top"><h3>' + esc(x.n) + '</h3><span class="gc-n"><b>' + x.c + '</b><small>' + (x.c === 1 ? 'person' : 'people') + '</small></span></span>' +
    (x.c ? grpFaces(mems) : '<span class="gc-none">No members yet — open it to add people.</span>') +
    (prev ? '<span class="gc-prev">' + esc(prev) + '</span>' : '') +
    '<span class="gc-sig">' + esc(grpSignal(kind, x.n)) + '</span></a>';
}
function grpMgrCard(kind, x){
  var key = kind + '|' + x.n, on = !!GMGR.sel[key];
  return '<label class="gcard gmgr-c' + (on ? ' on' : '') + '"><span class="gc-top"><h3>' + esc(x.n) + '</h3><span class="gc-n"><b>' + x.c + '</b></span></span>' +
    '<span class="gc-pick"><input type="checkbox" data-gmsel="' + esc(key) + '"' + (on ? ' checked' : '') + '> ' + (on ? 'Selected to combine' : 'Tick to combine') + '</span></label>';
}
function grpCardsHTML(kind){
  var names = grpNamesFor(kind).slice().sort(function(a, b){ return b.c - a.c || a.n.localeCompare(b.n); });
  var q = GRPV.q.trim().toLowerCase();
  if(q) names = names.filter(function(x){ return x.n.toLowerCase().indexOf(q) >= 0; });
  if(GMGR.on) return names.length ? '<div class="gcards">' + names.map(function(x){ return grpMgrCard(kind, x); }).join('') + '</div>' : '<p class="dim pad">No names match.</p>';
  var full = names.filter(function(x){ return x.c > 0; }), zero = names.filter(function(x){ return x.c === 0; });
  var h = '';
  if(full.length) h += '<div class="gcards">' + full.map(function(x){ return grpCard(kind, x); }).join('') + '</div>';
  if(zero.length) h += '<h4 class="gc-sech">No members yet</h4><div class="gcards">' + zero.map(function(x){ return grpCard(kind, x, []); }).join('') + '</div>';
  if(!h) h = q ? '<div class="empty"><h3>No matches</h3><p>No group name matches &ldquo;' + esc(GRPV.q.trim()) + '&rdquo;.</p></div>' : emptyState('Nothing here yet', 'Groups show up here once someone is in one.');
  return h;
}
function grpPaintCards(){
  var box = $('#gcards'); if(!box) return;
  var kind = S.route.seg[0] || 'groups';
  if(!GKINDS.some(function(k){ return k[0] === kind; })) kind = 'groups';
  box.innerHTML = grpCardsHTML(kind);
}
function grpMemberRow(kind, name, di){
  var e = D.directory[di];
  return '<div class="prow static"><a class="prow-in" href="#/p/' + encodeURIComponent(personId(e)) + '" data-act="gopen" data-di="' + di + '">' + grpFace(e, 'lg') +
    '<span class="pn"><b>' + esc(dispName(e)) + '</b> ' + milBadge(e) + '<small>' + esc(infoLine(e)) + '</small></span>' +
    '<i class="gtdot" style="background:' + tierCol(e) + '" title="' + esc(tierName(e) || 'No tier') + '"></i></a>' +
    (kind === 'groups' ? '<button type="button" class="ib" data-act="gmemrm" data-g="' + esc(name) + '" data-di="' + di + '" aria-label="Remove from group">' + ic('x', 16) + '</button>' : '') + '</div>';
}
function grpPaintMembers(){
  var box = $('#gmlist'); if(!box || !GRPV.detail) return;
  var kind = GRPV.detail.kind, name = GRPV.detail.name;
  var mem = grpMembersOf(kind, name);
  if(GRPV.sort === 'rank') mem = mem.slice().sort(function(a, b){
    var d = milRankIdx(D.directory[a]) - milRankIdx(D.directory[b]);
    return d || dispName(D.directory[a]).localeCompare(dispName(D.directory[b]));
  });
  var q = GRPV.mq.trim().toLowerCase();
  var shown = q ? mem.filter(function(di){ return dispName(D.directory[di]).toLowerCase().indexOf(q) >= 0; }) : mem;
  GRPV.shown = shown;   /* the exact on-screen order — gopen builds the profile context from it */
  box.innerHTML = shown.length ? shown.map(function(di){ return grpMemberRow(kind, name, di); }).join('') : '<p class="dim pad">' + (mem.length ? 'No one in this group matches.' : 'No one yet.') + '</p>';
  var cnt = $('#gmcount'); if(cnt) cnt.textContent = q ? shown.length + ' of ' + mem.length : String(mem.length);
}
/* Group detail side column (V3.12.0): the facts about the group
   itself, beside the member list instead of above it — derivation,
   tier mix, photo coverage, where members are, and the other
   affiliations they share (the indirect-connection signal). All
   computed live from the same membership grpMembersOf returns. */
function grpDetailSide(kind, name, mem){
  var kindLab = (GKINDS.filter(function(k){ return k[0] === kind; })[0] || [])[1] || kind;
  var tiers = {}, towns = {}, shared = {}, withPh = 0;
  var idx = phIndex();
  mem.forEach(function(di){
    var e = D.directory[di];
    var t = tierName(e) || 'No tier'; tiers[t] = (tiers[t] || 0) + 1;
    var tw = e.city || ''; if(tw) towns[tw] = (towns[tw] || 0) + 1;
    if(idx){ var p = idx[dispName(e)]; if(p && p.photo_url) withPh++; }
    var seen = {};
    orgsOf(e).concat(personGroups(e)).forEach(function(o){
      if(o === name || seen[o]) return; seen[o] = 1; shared[o] = (shared[o] || 0) + 1;
    });
  });
  function topList(obj, n, min){
    return Object.keys(obj).filter(function(k){ return obj[k] >= (min || 1); })
      .sort(function(a, b){ return obj[b] - obj[a] || a.localeCompare(b); }).slice(0, n);
  }
  var canon = regResolve(name);
  var aliases = Object.keys(ORGREG.aliases || {}).filter(function(a){ return ORGREG.aliases[a] === (canon || name) && regKey(a) !== regKey(name); })
    .map(function(a){ return ORGREG.aliasDisp[a] || a; });
  var maxT = Math.max.apply(null, Object.keys(tiers).map(function(k){ return tiers[k]; }).concat([1]));
  var h = '<section class="card gside"><header><h3>About this ' + (kind === 'groups' ? 'group' : 'list') + '</h3></header><div class="cbody">' +
    '<div class="gside-row"><span>Type</span><b>' + esc(kindLab) + '</b></div>' +
    '<div class="gside-row"><span>Members</span><b>' + mem.length + '</b></div>' +
    '<div class="gside-row"><span>With a photo</span><b>' + withPh + ' of ' + mem.length + '</b></div>' +
    '<div class="gside-row"><span>Comes from</span><b>' + esc(grpSignal(kind, name)) + '</b></div>' +
    (canon && canon !== name ? '<div class="gside-row"><span>Canonical name</span><b>' + esc(canon) + '</b></div>' : '') +
    (aliases.length ? '<div class="gside-row"><span>Also filed as</span><b>' + aliases.map(esc).join(', ') + '</b></div>' : '') +
    (mem.length ? '<div class="gside-faces">' + grpFaces(mem.slice(0, 10)) + '</div>' : '') +
    '</div></section>';
  if(mem.length > 1){
    h += '<section class="card gside"><header><h3>Composition</h3></header><div class="cbody">' +
      '<div class="gside-lab">Tier mix</div>' +
      topList(tiers, 4).map(function(t){
        return '<div class="gside-bar"><span>' + esc(t) + '</span><div class="gside-track"><div class="gside-fill" style="width:' + Math.round(100 * tiers[t] / maxT) + '%"></div></div><b>' + tiers[t] + '</b></div>';
      }).join('');
    var tw = topList(towns, 5);
    if(tw.length) h += '<div class="gside-lab">Where they are</div>' + tw.map(function(t){
      return '<div class="gside-row"><span>' + esc(t) + '</span><b>' + towns[t] + '</b></div>';
    }).join('');
    var sh = topList(shared, 6, 2);
    if(sh.length) h += '<div class="gside-lab">Members also share</div>' + sh.map(function(s2){
      return '<div class="gside-row"><span>' + esc(s2) + '</span><b>' + shared[s2] + ' members</b></div>';
    }).join('');
    h += '</div></section>';
  }
  return h;
}
function viewGroups(v){
  var kind = S.route.seg[0] || 'groups', name = S.route.seg[1] || '';
  if(!GKINDS.some(function(k){ return k[0] === kind; })) kind = 'groups';
  if(kind !== GRPV.lastKind || name !== GRPV.lastName){ GRPV.mq = ''; }
  GRPV.lastKind = kind; GRPV.lastName = name;
  try{ phLoad(); }catch(x){}
  var tabs = '<nav class="tabrow" aria-label="Group kinds">' + GKINDS.map(function(k){ return '<a href="#/groups/' + k[0] + '" class="tab' + (k[0] === kind ? ' on' : '') + '">' + k[1] + '</a>'; }).join('') + '</nav>';
  /* Design cleanup (JD 2026-10-28): tabs and search live INSIDE the
     banner — the old stack of head + tab row + tool row ate the top
     of the page before any group appeared. */
  var headTop = '<div class="pagehead"><div class="grp-headrow"><div><h1 class="display">Groups</h1><p class="sub">Where people overlap.</p></div><span class="sp"></span><button type="button" class="btn ghost sm" data-act="gmgr">' + (GMGR.on ? 'Done' : 'Manage') + '</button></div>';
  var head = headTop + tabs + '</div>';
  if(name){
    GRPV.detail = { kind:kind, name:name };
    var mem = grpMembersOf(kind, name);
    var hasRanks = mem.some(function(di){ return !!milRank(D.directory[di]); });
    v.innerHTML = '<div class="page groups">' + head + '<div class="gdet">' +
      '<div class="gdh"><a class="ib backm" href="#/groups/' + kind + '" aria-label="Back to groups">' + ic('chevl', 18) + '</a>' +
      '<div><h2>' + esc(name) + '</h2><small><span id="gmcount">' + mem.length + '</span> ' + (mem.length === 1 ? 'person' : 'people') + ' &middot; ' + esc(grpSignal(kind, name)) + '</small></div><span class="sp"></span>' +
      (kind === 'groups' ? '<button type="button" class="btn ghost sm" data-act="grename" data-g="' + esc(name) + '">Rename</button><button type="button" class="btn ghost sm danger" data-act="gdelete" data-g="' + esc(name) + '">Delete</button>' : '') + '</div>' +
      '<div class="gdet-main">' +
      '<div class="gtools"><label class="gsearchbox">' + ic('search', 15) + '<input id="gmq" placeholder="Search members" autocomplete="off" value="' + esc(GRPV.mq) + '"></label>' +
      (hasRanks ? '<span class="gsort"><span>Sort</span>' + [['name', 'Name'], ['rank', 'Rank']].map(function(s){ return '<button type="button" class="phcolbtn' + (GRPV.sort === s[0] ? ' on' : '') + '" data-act="grpsort" data-s="' + s[0] + '">' + s[1] + '</button>'; }).join('') + '</span>' : '') + '</div>' +
      (kind === 'groups' ? '<div class="finder"><input id="gaddq" data-g="' + esc(name) + '" placeholder="Add a person to this group" autocomplete="off"><div id="gaddr" class="hits"></div></div>' : '<p class="note">Membership comes from each profile’s Background section.</p>') +
      '<div class="plist" id="gmlist"></div></div>' +
      '<aside class="gdet-side">' + grpDetailSide(kind, name, mem) + '</aside>' +
      '</div></div>';
    grpPaintMembers();
    return;
  }
  GRPV.detail = null;
  var names = grpNamesFor(kind);
  var selCount = names.filter(function(x){ return GMGR.sel[kind + '|' + x.n]; }).length;
  var mgr = '';
  if(GMGR.on){
    mgr = '<div class="gmgr"><p class="gmgr-h">Tick the cards to merge, type or pick the surviving name, then combine. Ticked names stay on file as aliases of the survivor, so old spellings keep resolving to it.</p>' +
      '<div class="finder inline"><input id="gmgrt" list="gmgrdl" placeholder="Surviving name" autocomplete="off"><datalist id="gmgrdl">' + names.map(function(x){ return '<option value="' + esc(x.n) + '">'; }).join('') + '</datalist></div>' +
      '<div class="gmgr-row2"><button type="button" class="btn sm primary" data-act="gmgrgo" data-k="' + kind + '"' + (selCount ? '' : ' disabled') + '>Combine ' + selCount + ' selected</button>' +
      (selCount ? '<button type="button" class="btn ghost sm" data-act="gmgrclear">Clear</button>' : '') + '</div></div>';
  }
  var add = kind === 'groups' && !GMGR.on ? '<div class="finder inline gnewrow"><input id="gnew" placeholder="New group name" autocomplete="off"><button type="button" class="btn sm" data-act="gnew">Create</button></div>' : '';
  var listHead = headTop + '<div class="grp-toolsrow">' + tabs +
    '<label class="gsearchbox">' + ic('search', 15) + '<input id="gq" placeholder="Search groups" autocomplete="off" value="' + esc(GRPV.q) + '"></label>' +
    '<span class="dim gcount">' + names.length + ' ' + (kind === 'groups' ? 'groups' : 'names') + ' &middot; sorted by size</span></div></div>';
  v.innerHTML = '<div class="page groups">' + listHead + mgr + add +
    '<div id="gcards">' + grpCardsHTML(kind) + '</div></div>';
  if(GRPV.scrollY != null){ var y = GRPV.scrollY; GRPV.scrollY = null; requestAnimationFrame(function(){ var vw = $('#view'); if(vw) vw.scrollTop = y; }); }
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

/* ============================================================
   Home (JD 2026-10-22, V2.28.0): the overview landing. JD
   picked the merge from the preview set: Shape of the Network
   (config 3) on top, then the Network map preview (5),
   Coverage & Gaps (4), Photos (6), Organizations & Groups (7),
   with What's New (2) as a sticky activity rail on the right.
   Every number is computed at runtime from the app's own data
   (the directory, data/photos.json, data/changes.json,
   data/daily-ten.json) — nothing is baked in. Read-only:
   nothing here writes data.
   ============================================================ */
var HM_MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function hmFmtD(iso){
  if(!iso) return '';
  var p = String(iso).split('-');
  if(p.length === 2) return HM_MON[parseInt(p[1], 10) - 1] + ' ' + p[0];
  if(p.length < 3) return String(iso);
  return HM_MON[parseInt(p[1], 10) - 1] + ' ' + parseInt(p[2], 10) + ', ' + p[0];
}
function hmDiOf(name){ var di = BYN[String(name || '').toLowerCase()]; return di == null ? null : di; }
/* Daily-ten brief entries carry prefixed keys ('ig:user', 'sf:slug',
   'ct:Full Name') while BYN is keyed by the bare directory name plus
   display names — resolve a brief entry through the raw key, the
   prefix-stripped key, then its display name, so nobody is dropped
   or rendered as an unlinked fallback. */
function hmDtDi(x){
  if(x == null) return null;
  var nm = typeof x === 'object' ? x.name : x;
  var di = hmDiOf(nm);
  if(di == null && nm && String(nm).indexOf(':') > 0) di = hmDiOf(String(nm).split(':').slice(1).join(':'));
  if(di == null && typeof x === 'object' && x.display) di = hmDiOf(x.display);
  return di;
}
/* ============================================================
   Home — Command Deck (JD 2026-10-27, V2.55.0): the concept-1
   layout made real and live-wired. KPI strip across the top,
   two segmented mix bars, proportional bar rankings, a Known
   Since + Coverage row, then the activity band (What's New,
   the Live Records brief, the change log). EVERY tile, bar,
   segment and row is a button opening the Home inspector
   (below) — the old right rail is gone, and everything the
   rail showed now lives in the inspectors. Below the deck,
   the settled extras stay folded in: the Photos wall (tiles
   open the photo inspector) and the Network miniature.
   Numbers are computed at runtime from the app's own data —
   nothing baked in — and rendered at their final values:
   no count-ups, no grow-ins, clicks never move the page.
   Read-only: Home never writes data.
   ============================================================ */
function hmFmtN(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function hmCount(map, label){
  var k = label.toLowerCase();
  if(!map[k]) map[k] = { c:0, forms:{} };
  map[k].c++;
  map[k].forms[label] = (map[k].forms[label] || 0) + 1;
}
function hmSortTop(entries, n){
  return entries.sort(function(a, b){ return b.c - a.c || a.label.localeCompare(b.label); }).slice(0, n);
}
function hmFormsTop(map, n, capIt){
  var entries = Object.keys(map).map(function(k){
    var m = map[k], best = '', bc = -1;
    Object.keys(m.forms).forEach(function(f){ if(m.forms[f] > bc){ bc = m.forms[f]; best = f; } });
    return { label: capIt ? cap(best) : best, key: k, c: m.c };
  });
  return hmSortTop(entries, n);
}
function hmPlainTop(counts, n){
  return hmSortTop(Object.keys(counts).map(function(k){ return { label:k, key:k, c:counts[k] }; }), n);
}
function fmtIsoD(iso){
  if(!iso) return '';
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], p = String(iso).split('-');
  return MON[parseInt(p[1], 10) - 1] + ' ' + parseInt(p[2], 10) + ', ' + p[0];
}

/* --- the deck's one data pass: every aggregate Home shows,
   computed once per mount from the listed people --- */
var HM_TRAITS = [['openness','Openness'],['conscientiousness','Conscientiousness'],['extraversion','Extraversion'],['agreeableness','Agreeableness'],['neuroticism','Neuroticism'],['ego','Ego']];
var HM_TRAIT_FIELD = { Openness:'openness', Conscientiousness:'conscientiousness', Extraversion:'extraversion', Agreeableness:'agreeableness', Neuroticism:'neuroticism', Ego:'ego' };
var HM_DECK = null, HM_PD = null;
function hmDeckData(pop){
  var N = pop.length;
  var tierCounts = { vetted:0, associate:0, open:0, none:0 };
  var curY = new Date().getFullYear(), yr = {}, yrMax = 0, preN = 0, lastY = curY, undated = 0;
  var towns = {}, rels = {}, relBlank = 0, orgCounts = {}, skills = {}, groupCounts = {};
  var fpCounts = {}, fpPeople = 0, fpTotal = 0, locN = 0, phoneN = 0;
  var tPts = {}, tSumF = {}, tN = {}, pRated = 0, totPts = 0;
  pop.forEach(function(di){
    var e = D.directory[di], t = tierOf(e);
    if(t === 'vetted') tierCounts.vetted++; else if(t === 'associate') tierCounts.associate++; else if(t === 'open') tierCounts.open++; else tierCounts.none++;
    var y = knownSinceYear(e);
    if(!y) undated++;
    else if(y < 2010){ preN++; if(preN > yrMax) yrMax = preN; }
    else { yr[y] = (yr[y] || 0) + 1; if(yr[y] > yrMax) yrMax = yr[y]; if(y > lastY) lastY = y; }
    var loc = ptLocVal(e);
    if(loc) locN++;
    var town = loc ? loc.split(',')[0].trim() : '';
    if(town) hmCount(towns, town);
    var rv = String(gv(e, 'relationship') || '').trim();
    if(rv) hmCount(rels, rv); else relBlank++;
    var seen = {};
    ORG_CATS.forEach(function(c){ tagList(gv(e, c.k)).forEach(function(o){ var cn = regApply(o); if(cn && !seen[cn]){ seen[cn] = 1; orgCounts[cn] = (orgCounts[cn] || 0) + 1; } }); });
    tagList(gv(e, 'specialty')).forEach(function(s){ hmCount(skills, s); });
    personGroups(e).forEach(function(g){ groupCounts[g] = (groupCounts[g] || 0) + 1; });
    if(String(gv(e, 'phone') || '').trim()) phoneN++;
    var fpn = String(gv(e, 'public_footprint') || '').split('\n').filter(function(b){ return b.trim(); }).length;
    if(fpn){ fpPeople++; fpTotal += fpn; fpCounts[dispName(e)] = fpn; }
    var any = false;
    HM_TRAITS.forEach(function(tr){
      var v = parseInt(gv(e, tr[0]), 10);
      if(!(v >= 1 && v <= 5)) return;
      any = true;
      tPts[tr[1]] = (tPts[tr[1]] || 0) + v;
      tSumF[tr[0]] = (tSumF[tr[0]] || 0) + v; tN[tr[0]] = (tN[tr[0]] || 0) + 1;
      totPts += v;
    });
    if(any) pRated++;
  });
  var yrEntries = [{ label:'Before 2010', c:preN }], yy;
  for(yy = 2010; yy <= lastY; yy++) yrEntries.push({ label:String(yy), c:yr[yy] || 0 });
  return { N:N, tierCounts:tierCounts, towns:towns, rels:rels, relBlank:relBlank, orgCounts:orgCounts,
    skills:skills, groupCounts:groupCounts, fpCounts:fpCounts, fpPeople:fpPeople, fpTotal:fpTotal,
    locN:locN, phoneN:phoneN, yrEntries:yrEntries, yrMax:yrMax, undated:undated, dated:N - undated,
    tPts:tPts, tSumF:tSumF, tN:tN, pRated:pRated, totPts:totPts };
}
function hmDeck(){ if(!HM_DECK) HM_DECK = hmDeckData(people()); return HM_DECK; }
function hmDeckPhotos(){
  var st = statsOf();
  var most = [], totalPhotos = 0, multi = 0, igNames = [];
  if(PH && PH.people){
    PH.people.forEach(function(p){
      if(!phHasPhoto(p)) return;
      var n = phAllPhotos(p).length;
      totalPhotos += n;
      if(n > 1) multi++;
      most.push({ name:p.name, n:n });
      if(String(p.type || '').indexOf('Instagram') >= 0) igNames.push(p.name);
    });
    most.sort(function(a, b){ return b.n - a.n || a.name.localeCompare(b.name); });
  }
  return { onFile:st.photosOnFile, missing:st.photosMissing, entries:st.photoEntries, ig:st.igPhotos, totalPhotos:totalPhotos, multi:multi, most:most, igNames:igNames };
}
function hmPd(){ if(!HM_PD) HM_PD = hmDeckPhotos(); return HM_PD; }

/* --- deck renderers --- */
var HM_GRAY = ['#f2f2f2','#b5b5b5','#7d7d7d','#4a4a4a','#3a3a3a','#2b2b2b','#1f1f1f','#171717','#121212'];
function hmKpi(k, value, label, sub){
  return '<button type="button" class="hmk-kpi" data-act="hmikpi" data-k="' + k + '">' +
    '<span class="hmk-v">' + value + '</span><span class="hmk-l">' + label + '</span>' +
    (sub ? '<span class="hmk-s">' + sub + '</span>' : '') + '</button>';
}
function hmBarRow(kind, key, label, c, max, hot){
  var pct = c > 0 && max > 0 ? Math.max(2, Math.round(1000 * c / max) / 10) : 0;
  return '<button type="button" class="hm-bar" data-act="hmiopen" data-kind="' + kind + '" data-key="' + esc(key) + '" data-label="' + esc(label) + '">' +
    '<span class="hm-bl">' + esc(label) + '</span><span class="hm-tr"><span class="hm-fill' + (hot ? ' hot' : '') + '" style="width:' + pct + '%"></span></span>' +
    '<span class="hm-bv">' + c + '</span></button>';
}
function hmRankCard(title, inner, cnt){
  return '<section class="card hm-blk"><header><h3>' + esc(title) + '</h3>' + (cnt ? '<em class="cnt">' + esc(cnt) + '</em>' : '') + '</header><div class="cbody">' + inner + '</div></section>';
}
function hmMoreBtn(attrs, label){
  return '<button type="button" class="hm-more" ' + attrs + '>' + label + '</button>';
}
function hmMixInner(title, segs, total){
  var bar = segs.filter(function(s){ return s.c > 0; }).map(function(s){
    return '<button type="button" class="hm-seg" data-act="hmiopen" data-kind="' + s.kind + '" data-key="' + esc(s.key) + '" data-label="' + esc(s.label) + '" style="width:' + (100 * s.c / total) + '%;background:' + s.col + '" title="' + esc(s.label) + ' \u00b7 ' + s.c + '" aria-label="' + esc(s.label) + ', ' + s.c + ' people"></button>';
  }).join('');
  var leg = segs.map(function(s){
    return '<button type="button" class="hm-legrow" data-act="hmiopen" data-kind="' + s.kind + '" data-key="' + esc(s.key) + '" data-label="' + esc(s.label) + '">' +
      '<span class="hm-dldot" style="background:' + s.col + '"></span><span class="hm-dll">' + esc(s.label) + '</span><b>' + s.c + '</b>' +
      '<span class="hm-dlp">' + (total ? Math.round(100 * s.c / total) : 0) + '%</span></button>';
  }).join('');
  return '<header><h3>' + esc(title) + '</h3></header><div class="cbody">' +
    '<div class="hm-segbar">' + bar + '</div><div class="hm-legs">' + leg + '</div></div>';
}
function hmMixCard(title, segs, total){
  return '<section class="card hm-blk">' + hmMixInner(title, segs, total) + '</section>';
}
/* --- Home Shape card (JD 2026-10-28, V3.26.0 consolidation): tier
   mix, relationship mix and the network line in ONE card instead of
   three stacked surfaces. --- */
function hmShapeCard(dd, tierSegs, relSegs, N){
  netBuild();
  var seg = [
    { l:'Vetted', c:dd.tierCounts.vetted, col:(TIERS.vetted || {}).c || 'var(--seg-0)' },
    { l:'Associate', c:dd.tierCounts.associate, col:(TIERS.associate || {}).c || 'var(--seg-1)' },
    { l:'Open', c:dd.tierCounts.open, col:(TIERS.open || {}).c || 'var(--seg-2)' },
    { l:'No tier yet', c:dd.tierCounts.none, col:RING_C[3] }
  ];
  return '<section class="card hm-blk"><div class="hm-shapegrid">' +
    '<div class="hm-shapehalf">' + hmMixInner('Tier mix', tierSegs, N) + '</div>' +
    '<div class="hm-shapehalf">' + hmMixInner('Relationship mix', relSegs, N) + '</div></div>' +
    '<div class="hm-ns-row hm-shape-net">' +
    '<span class="hm-ns-t">Network</span>' +
    seg.map(function(s){ return '<span class="hm-ns-seg"><i style="background:' + s.col + '"></i>' + s.l + ' <b>' + s.c + '</b></span>'; }).join('') +
    '<span class="hm-ns-seg dim">' + NET.nodes.length + ' on the map &middot; ' + NET.hubs.length + ' hubs</span>' +
    '<span class="sp"></span><a class="hma-link" href="#/network">Open Network ' + ic('arrow', 12) + '</a>' +
    '</div></section>';
}
/* --- Home Rankings (V3.26.0 consolidation): the five leader boards
   as columns of ONE card, top 5 each. --- */
function hmRanksCard(cols){
  return '<section class="card hm-blk"><header><h3>Rankings</h3></header><div class="cbody"><div class="hm-rankgrid">' +
    cols.map(function(c){
      return '<div class="hm-rankcol"><h4>' + esc(c.title) + '</h4>' + c.rows + (c.more || '') + '</div>';
    }).join('') + '</div></div></section>';
}
function hmYearsCard(dd){
  var cols = dd.yrEntries.map(function(t){
    var h = dd.yrMax > 0 && t.c > 0 ? Math.max(4, Math.round(1000 * t.c / dd.yrMax) / 10) : 0;
    return '<button type="button" class="hm-ycol" data-act="hmiopen" data-kind="years" data-key="' + esc(t.label) + '" data-label="' + esc(t.label) + '" title="' + esc(t.label) + ' \u00b7 ' + t.c + '">' +
      '<span class="hm-ycv">' + (t.c || '') + '</span><span class="hm-ybar"><span style="height:' + h + '%"></span></span>' +
      '<span class="hm-ycl">' + (t.label === 'Before 2010' ? 'pre-\u201910' : '\u2019' + t.label.slice(2)) + '</span></button>';
  }).join('');
  return '<section class="card hm-blk"><header><h3>Known since</h3><em class="cnt">' + dd.dated + ' of ' + dd.N + ' dated</em></header><div class="cbody">' +
    '<div class="hm-ycols">' + cols + '</div>' +
    (dd.undated ? hmMoreBtn('data-act="hmikpi" data-k="dated"', dd.undated + ' with no start year on file \u2014 see the summary') : '') +
    '</div></section>';
}
function hmCovRow(label, num, den, attrs){
  var pct = den > 0 ? Math.round(1000 * num / den) / 10 : 0;
  return '<button type="button" class="hm-covrow" ' + attrs + '><span class="hm-covl">' + esc(label) + '</span>' +
    '<span class="hm-ptr2"><i style="width:' + Math.max(1.5, pct) + '%"></i></span>' +
    '<span class="hm-covv">' + num + ' / ' + den + ' \u00b7 ' + Math.round(pct) + '%</span></button>';
}
function hmGapRow(label, n, attrs){
  return '<button type="button" class="hm-gaprow" ' + attrs + '><span>' + esc(label) + '</span><span class="hm-gn">' + n + '</span></button>';
}
function hmCoverageCard(dd, pd){
  var N = dd.N, rows = '', gaps = '';
  rows += hmCovRow('Public footprint', dd.fpPeople, N, 'data-act="hmikpi" data-k="footprint"');
  rows += hmCovRow('Photos on file', pd.onFile, N, 'data-act="hmikpi" data-k="photos"');
  if(DT && DT.coverage) rows += hmCovRow('Live Records rotation', DT.coverage.checked_total, DT.coverage.of, 'data-act="hmiopen" data-kind="liverec"');
  rows += hmCovRow('Location on file', dd.locN, N, 'data-act="hmikpi" data-k="located"');
  rows += hmCovRow('Known since dated', dd.dated, N, 'data-act="hmikpi" data-k="dated"');
  rows += hmCovRow('Phone numbers filed', dd.phoneN, N, 'data-act="hmiopen" data-kind="withphone" data-label="Phone on file"');
  rows += hmCovRow('Persona rated', dd.pRated, N, 'data-act="hmivlist" data-vk="persona"');
  if(DT && DT.coverage && DT.coverage.of - DT.coverage.checked_total > 0)
    gaps += hmGapRow('Not yet checked by Live Records', DT.coverage.of - DT.coverage.checked_total, 'data-act="hmiopen" data-kind="liverec"');
  gaps += hmGapRow('No location on file', N - dd.locN, 'data-act="hmiopen" data-kind="noloc" data-label="No location on file"');
  gaps += hmGapRow('No photo yet', pd.missing, 'data-act="hmiopen" data-kind="nophoto" data-label="No photo yet"');
  gaps += hmGapRow('No phone number', N - dd.phoneN, 'data-act="hmiopen" data-kind="nophone" data-label="No phone number"');
  gaps += hmGapRow('No start year', dd.undated, 'data-act="hmiopen" data-kind="missingyrs" data-label="No start year"');
  gaps += hmGapRow('Relationship untyped', dd.relBlank, 'data-act="hmiopen" data-kind="rel" data-key="Unspecified" data-label="Unspecified"');
  return '<section class="card hm-blk"><header><h3>Coverage &amp; gaps</h3></header><div class="cbody"><div class="hm-cov">' +
    '<div>' + rows + '</div><div><h4>Biggest gaps</h4>' + gaps + '</div>' +
    '</div></div></section>';
}

/* --- the activity band: the old What's New rail, laid flat.
   Change rows open the person's profile; grouped rows expand
   in place (chgToggle) with member rows that open profiles;
   Live Records filed rows open the filed person's profile. --- */
function hmaRow(c, act){
  var di = hmDiOf(c.name);
  var inner = '<div class="chg-name"><b>' + esc(c.name) + '</b></div>' +
    '<p class="chg-what">' + esc(c.what || '') + '</p>' +
    '<div class="chg-src">' + (c.url ? '<a data-act="extlink" href="' + esc(c.url) + '" target="_blank" rel="noopener">' + esc(c.source || 'source') + ' ' + ic('ext', 10) + '</a>' : esc(c.source || '')) +
    (c.source_date ? ' \u00b7 source ' + esc(hmFmtD(c.source_date)) : '') +
    (c.filed ? '<span class="chg-filed">Filed ' + esc(hmFmtD(c.filed)) + '</span>' : '') + '</div>' + novBar(c.novelty);
  if(di == null) return '<div class="chg">' + inner + '</div>';
  return '<div class="chg hma-click" data-act="' + (act || 'hmgoto') + '" data-di="' + di + '" role="button" tabindex="0" title="Open ' + esc(c.name) + '\u2019s profile">' + inner + '</div>';
}
function hmaGroupRow(g, act){
  var c = g.first, sd = c.source_date, uniform = true;
  g.items.forEach(function(x){ if(x.source_date !== sd) uniform = false; });
  var members = g.items.map(function(x){ return hmaRow(x, act); }).join('');
  return '<div class="chg-grp">' +
    '<button type="button" class="chg-grp-h" data-act="chggrp" aria-expanded="false">' +
    '<span class="chg-cnt">' + g.items.length + '</span>' +
    '<span class="chg-grp-main"><span class="chg-grp-what">' + esc(c.what || '') + '</span>' +
    '<span class="chg-src">' + esc(c.source || '') + (uniform && sd ? ' \u00b7 source ' + esc(hmFmtD(sd)) : '') +
    (c.filed ? '<span class="chg-filed">Filed ' + esc(hmFmtD(c.filed)) + '</span>' : '') + '</span></span>' +
    '<span class="chg-chev">' + ic('chev', 14) + '</span></button>' +
    '<div class="chg-members"><div class="chg-members-in">' + members + '</div></div></div>';
}
function hmaFactRow(f, x, act){
  var di = hmDiOf(f.name);
  var inner = '<span class="hma-fname">' + esc(f.display || f.name) + (x.fresh ? '<span class="hma-tag">New</span>' : '') + '</span>' +
    '<span class="hma-fact">' + esc(x.text) + '</span>' +
    '<span class="hma-fsrc">' + (x.url ? '<a data-act="extlink" href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.source || 'source') + ' ' + ic('ext', 10) + '</a>' : esc(x.source || '')) +
    (x.published ? ' \u00b7 published ' + esc(hmFmtD(x.published)) : '') + '</span>' + novBar(x.novelty);
  if(di == null) return '<div class="hma-frow">' + inner + '</div>';
  return '<button type="button" class="hma-frow" data-act="' + (act || 'hmgoto') + '" data-di="' + di + '" title="Open ' + esc(f.display || f.name) + '\u2019s profile">' + inner + '</button>';
}
function hmActivity(){
  var out = '<section class="card hm-blk hm-act"><header><h3>What&rsquo;s new</h3>' + (DT && DT.date ? '<em class="cnt">' + esc(hmFmtD(DT.date)) + '</em>' : '') + '</header><div class="cbody">';
  var freshF = null, freshX = null;
  if(DT && DT.filed) DT.filed.forEach(function(f){ (f.facts || []).forEach(function(x){ if(x.fresh && !freshX){ freshF = f; freshX = x; } }); });
  if(freshF){
    var fdi = hmDiOf(freshF.name);
    var hero = '<div class="hma-hk">New record \u2014 past 3 weeks</div>' +
      '<div class="hma-hname">' + esc(freshF.display || freshF.name) + '</div>' +
      '<p class="hma-hfact">' + esc(freshX.text) + (freshX.url ? ' <a data-act="extlink" href="' + esc(freshX.url) + '" target="_blank" rel="noopener">' + esc(freshX.source || 'source') + ' ' + ic('ext', 11) + '</a>' : '') + '</p>' +
      '<div class="hma-hmeta">' + (freshX.published ? 'Published ' + esc(hmFmtD(freshX.published)) + ' \u00b7 ' : '') + 'Filed ' + esc(hmFmtD(DT.date)) + '</div>';
    out += fdi == null ? '<div class="hma-hero">' + hero + '</div>'
      : '<div class="hma-hero hma-click" data-act="hmgoto" data-di="' + fdi + '" role="button" tabindex="0" title="Open ' + esc(freshF.display || freshF.name) + '\u2019s profile">' + hero + '</div>';
  }
  out += '<div class="hma-counters">' +
    '<button type="button" class="hma-counter" data-act="hmiopen" data-kind="changes"><b>' + (CH && CH.entries ? CH.entries.length : '&mdash;') + '</b><span>Changes logged</span></button>' +
    '<button type="button" class="hma-counter" data-act="hmiopen" data-kind="liverec"><b>' + (DT && DT.coverage ? DT.coverage.checked_total + '<small> / ' + DT.coverage.of + '</small>' : '&mdash;') + '</b><span>Checked this rotation</span></button>' +
    '<button type="button" class="hma-counter" data-act="hmiopen" data-kind="liverec"><b>' + (DT && DT.checked ? DT.checked.length : '&mdash;') + '</b><span>Checked in latest brief</span></button>' +
    '</div>';
  if(DT && DT.filed && DT.filed.length){
    out += '<div class="hma-sec"><span>Live Records \u2014 filed in the latest brief</span></div>';
    DT.filed.forEach(function(f){ (f.facts || []).forEach(function(x){ out += hmaFactRow(f, x); }); });
  }
  if(DT && DT.next_up && DT.next_up.length){
    out += '<div class="hma-sec"><span>Next up in the rotation</span></div><div class="hma-nextup">' +
      DT.next_up.map(function(nm){
        var label = nm && nm.display ? nm.display : nm;
        var di = hmDtDi(nm);
        return di == null ? '<span class="hma-nchip">' + esc(label) + '</span>'
          : '<button type="button" class="hma-nchip" data-act="hmgoto" data-di="' + di + '">' + esc(label) + '</button>';
      }).join('') + '</div>';
  }
  out += '<div class="hma-sec"><span>Change log</span>' + (CH && CH.entries ? '<em>' + CH.entries.length + '</em>' : '') + '</div>';
  if(CH && CH.entries && CH.entries.length){
    out += chgRows(CH.entries).slice(0, 8).map(function(g){
      return g.items.length > 1 ? hmaGroupRow(g) : hmaRow(g.first);
    }).join('');
    out += '<a class="hma-link" href="#/daily">Open Live Records ' + ic('arrow', 12) + '</a>';
  } else {
    out += '<p class="dim">' + (CH ? 'No changes logged yet.' : 'Loading the change log&hellip;') + '</p>';
  }
  return out + '</div></section>';
}

/* ============================================================
   Home inspector (JD 2026-10-27, V2.55.0): the pop-up behind
   every click on Home, in the same modal idiom as the photo
   inspector and the Years Known batch panel — centered, Esc /
   backdrop / X close, focus returns to the opener. Read-only:
   it navigates (to a profile, a group, the audit, Live
   Records) and never writes. Drill-downs stack (a town inside
   Located, a person card inside Footprint) with a back button.
   ============================================================ */
var HMI = null;      /* {stack:[{title, sub, html}], prevFocus} */
var HMI_INDEX = {};  /* member lists computed once per Home mount (audit F16 pattern) */
function hmiOpen(title, sub, html, opener){
  if(HMI) hmiClose(true);
  HMI = { stack:[{ title:title, sub:sub || '', html:html }], prevFocus: opener || document.activeElement };
  hmiKeysInit();
  hmiRender();
  var xb = document.querySelector('.hmi-wrap [data-act="hmix"]'); if(xb) xb.focus();
}
function hmiShow(title, sub, html, opener){
  if(HMI){ HMI.stack.push({ title:title, sub:sub || '', html:html }); hmiRender(); var b = document.querySelector('.hmi-wrap .hmi-body'); if(b) b.scrollTop = 0; }
  else hmiOpen(title, sub, html, opener);
}
function hmiBack(){
  if(!HMI || HMI.stack.length < 2) return;
  HMI.stack.pop(); hmiRender();
}
function hmiRender(){
  var old = document.querySelector('.hmi-wrap'); if(old) old.remove();
  if(!HMI){ if(!document.querySelector('.phi-wrap') && !document.querySelector('.ykb-wrap') && !document.querySelector('.phed-wrap')) document.body.classList.remove('sheet-open'); return; }
  var s = HMI.stack[HMI.stack.length - 1];
  var ov = document.createElement('div');
  ov.className = 'hmi-wrap'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', s.title);
  ov.innerHTML = '<div class="hmi-scrim" data-act="hmix"></div>' +
    '<div class="hmi"><div class="hmi-h">' +
    (HMI.stack.length > 1 ? '<button type="button" class="ib" data-act="hmiback" aria-label="Back">' + ic('chevl', 16) + '</button>' : '') +
    '<div class="hmi-t"><b>' + esc(s.title) + '</b>' + (s.sub ? '<span>' + esc(s.sub) + '</span>' : '') + '</div>' +
    '<span class="sp"></span><button type="button" class="ib" data-act="hmix" aria-label="Close">' + ic('x', 16) + '</button></div>' +
    '<div class="hmi-body">' + s.html + '</div></div>';
  document.body.appendChild(ov);
  document.body.classList.add('sheet-open');
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ ov.classList.add('open'); }); });
}
function hmiClose(instant){
  var ov = document.querySelector('.hmi-wrap');
  var pf = HMI && HMI.prevFocus;
  HMI = null;
  if(ov){ if(instant) ov.remove(); else { ov.classList.remove('open'); setTimeout(function(){ ov.remove(); }, 240); } }
  if(!document.querySelector('.phi-wrap') && !document.querySelector('.ykb-wrap') && !document.querySelector('.phed-wrap')) document.body.classList.remove('sheet-open');
  if(pf && document.contains(pf) && pf.focus) pf.focus();
}
function hmiKeysInit(){
  if(window.__hmiKeys) return; window.__hmiKeys = true;
  document.addEventListener('keydown', function(ev){
    if(!HMI) return;
    if(ev.key === 'Escape'){ hmiClose(); ev.preventDefault(); ev.stopPropagation(); }
  }, true);
}

/* --- inspector pieces --- */
function hmiAvatar(di){
  var e = D.directory[di], idx = phIndex(), p = idx ? idx[dispName(e)] : null;
  if(p && p.photo_url && phAllPhotos(p).length) return '<span class="hmi-av"><img src="' + esc(phFrameFor(p.name, p).url || p.photo_url) + '" alt="" loading="lazy" referrerpolicy="no-referrer" style="' + phFrameStyle(p) + '"></span>';
  return avatar(e, 'sm');
}
function hmiTierTag(e){
  var t = tierOf(e);
  return t ? '<span class="hmi-tier t-' + esc(t) + '">' + esc(cap(t)) + '</span>' : '';
}
function hmiRow(di, valHTML){
  var e = D.directory[di];
  var town = (ptLocVal(e) || '').split(',')[0] || '';
  var y = knownSinceYear(e), ys = y ? 'known ' + (new Date().getFullYear() - y) + 'y' : '';
  var meta = [town, cap(gv(e, 'relationship')), ys].filter(Boolean).join(' \u00b7 ');
  return '<button type="button" class="hmi-row" data-act="hmiperson" data-di="' + di + '">' + hmiAvatar(di) +
    '<span class="hmi-main"><span class="hmi-nm">' + esc(dispName(e)) + milBadge(e) + '</span>' +
    (meta ? '<span class="hmi-meta">' + esc(meta) + '</span>' : '') + '</span>' +
    (valHTML || '') + '</button>';
}
function hmiStatsHTML(rows){
  var total = D.directory.length, mix = {};
  rows.forEach(function(r){ var t = tierOf(D.directory[r.di]) || 'open'; mix[t] = (mix[t] || 0) + 1; });
  var mixTxt = ['vetted', 'associate', 'open'].filter(function(t){ return mix[t]; }).map(function(t){ return mix[t] + ' ' + t; }).join(' \u00b7 ');
  return '<div class="hmi-stats"><div class="hmi-stat"><b>' + rows.length + '</b><span>' + (rows.length === 1 ? 'person' : 'people') + '</span></div>' +
    '<div class="hmi-stat"><b>' + (total ? Math.round(rows.length / total * 100) : 0) + '%</b><span>of network</span></div></div>' +
    (mixTxt ? '<p class="hmi-mix">' + esc(mixTxt) + '</p>' : '');
}
function hmiRowsHTML(kind, rows, cap){
  cap = cap || 150;
  var list = rows.slice(0, cap).map(function(r){
    var val = '';
    if(kind === 'persona' && r.val != null) val = '<span class="hmi-val"><span class="hmi-bar"><i style="width:' + (r.val * 20) + '%"></i></span>' + r.val + '</span>';
    else if(kind === 'withphone' && r.val) val = '<span class="hmi-phone">' + esc(fmtPhone(r.val)) + '</span>';
    else val = hmiTierTag(D.directory[r.di]);
    return hmiRow(r.di, val);
  }).join('');
  return '<div class="hmi-rows">' + (list || '<p class="dim">No one here yet.</p>') + '</div>' +
    (rows.length > cap ? '<p class="dim hmi-more2">+ ' + (rows.length - cap) + ' more \u2014 refine from the People view.</p>' : '');
}
function hmiRows(kind, key){
  var ck = kind + '|' + key;
  if(HMI_INDEX[ck]) return HMI_INDEX[ck];
  var rows = [];
  function push(di, val){ rows.push({ di:di, val:(val == null ? null : val) }); }
  var pop = people();
  if(kind === 'tier'){
    pop.forEach(function(di){ if((tierOf(D.directory[di]) || 'none') === key) push(di); });
  } else if(kind === 'rel'){
    pop.forEach(function(di){ var e = D.directory[di]; if((cap(gv(e, 'relationship')) || 'Unspecified') === key) push(di); });
  } else if(kind === 'town'){
    pop.forEach(function(di){ var t = (ptLocVal(D.directory[di]) || '').split(',')[0].trim().toLowerCase(); if(t && t === key) push(di); });
  } else if(kind === 'skill'){
    pop.forEach(function(di){ var e = D.directory[di]; if(tagList(gv(e, 'specialty')).some(function(s){ return s.toLowerCase() === key; })) push(di); });
  } else if(kind === 'org'){
    pop.forEach(function(di){ var e = D.directory[di]; if(ORG_CATS.some(function(c){ return tagList(gv(e, c.k)).some(function(o){ return regApply(o) === key; }); })) push(di); });
  } else if(kind === 'orgpair'){
    var ab = key.split('\u0001');
    pop.forEach(function(di){ var e = D.directory[di];
      function has(nm){ return ORG_CATS.some(function(c){ return tagList(gv(e, c.k)).some(function(o){ return regApply(o) === nm; }); }); }
      if(has(ab[0]) && has(ab[1])) push(di); });
  } else if(kind === 'group'){
    pop.forEach(function(di){ if(personGroups(D.directory[di]).indexOf(key) >= 0) push(di); });
  } else if(kind === 'years'){
    pop.forEach(function(di){ var y = knownSinceYear(D.directory[di]); if(!y) return; var lab = y < 2010 ? 'Before 2010' : String(y); if(lab === key) push(di); });
  } else if(kind === 'decade'){
    var lo = key === 'pre2010' ? 0 : key === '2010s' ? 2010 : 2020, hi = key === 'pre2010' ? 2009 : key === '2010s' ? 2019 : 2100;
    pop.forEach(function(di){ var y = knownSinceYear(D.directory[di]); if(y && y >= lo && y <= hi) push(di); });
  } else if(kind === 'persona'){
    var tf = HM_TRAIT_FIELD[key];
    if(tf) pop.forEach(function(di){ var v = parseInt(gv(D.directory[di], tf), 10); if(v >= 1 && v <= 5) push(di, v); });
  } else if(kind === 'missingyrs'){
    pop.forEach(function(di){ if(!knownSinceYear(D.directory[di])) push(di); });
  } else if(kind === 'noloc'){
    pop.forEach(function(di){ if(!ptLocVal(D.directory[di])) push(di); });
  } else if(kind === 'nophone'){
    pop.forEach(function(di){ if(!String(gv(D.directory[di], 'phone') || '').trim()) push(di); });
  } else if(kind === 'withphone'){
    pop.forEach(function(di){ var ph = String(gv(D.directory[di], 'phone') || '').trim(); if(ph) push(di, ph); });
  } else if(kind === 'nophoto'){
    var idx = phIndex();
    pop.forEach(function(di){ var e = D.directory[di]; var p = idx ? idx[dispName(e)] : null; if(!p || !phHasPhoto(p)) push(di); });
  }
  rows.sort(function(a, b){
    var an = dispName(D.directory[a.di]), bn = dispName(D.directory[b.di]);
    if(kind === 'persona') return (b.val || 0) - (a.val || 0) || an.localeCompare(bn);
    return an.localeCompare(bn);
  });
  HMI_INDEX[ck] = rows;
  return rows;
}
var HMI_TITLES = { tier:'Tier', persona:'Persona makeup', years:'Known since', decade:'Known since', town:'Where they are', rel:'Relationship', org:'Organization', orgpair:'Organizations', skill:'Skill', group:'Group', missingyrs:'Known since', noloc:'Location', nophone:'Phone', withphone:'Phone', nophoto:'Photos' };
function hmiOpenList(kind, key, label, opener){
  var rows = hmiRows(kind, key);
  var body = hmiStatsHTML(rows) + hmiRowsHTML(kind, rows);
  if(kind === 'group') body += '<div class="hmi-actions"><button type="button" class="btn primary sm" data-act="hmigroup" data-g="' + esc(key) + '">Open group</button></div>';
  hmiShow(HMI_TITLES[kind] || 'People', label || key, body, opener);
}
function hmiKrow(label, c, max, attrs){
  var pct = c > 0 && max > 0 ? Math.max(2, Math.round(1000 * c / max) / 10) : 0;
  return '<button type="button" class="hmi-krow" ' + attrs + '><span class="hmi-klab">' + esc(label) + '</span>' +
    '<span class="hmi-ptr"><i style="width:' + pct + '%"></i></span><b>' + c + '</b></button>';
}
function hmiValueList(vk, opener){
  var dd = hmDeck(), rows = [], title = '', sub = '';
  if(vk === 'town'){ title = 'Where they are'; sub = 'All towns'; rows = hmFormsTop(dd.towns, 999).map(function(t){ return { label:t.label, key:t.key, c:t.c, kind:'town' }; }); }
  else if(vk === 'skill'){ title = 'Skills'; sub = 'All skills'; rows = hmFormsTop(dd.skills, 999, true).map(function(t){ return { label:t.label, key:t.key, c:t.c, kind:'skill' }; }); }
  else if(vk === 'org'){ title = 'Organizations'; sub = 'All organizations'; rows = hmPlainTop(dd.orgCounts, 999).map(function(t){ return { label:t.label, key:t.key, c:t.c, kind:'org' }; }); }
  else if(vk === 'group'){ title = 'Groups'; sub = 'All groups'; rows = hmPlainTop(dd.groupCounts, 999).map(function(t){ return { label:t.label, key:t.key, c:t.c, kind:'group' }; }); }
  else if(vk === 'persona'){ title = 'Persona makeup'; sub = 'Rated traits';
    rows = HM_TRAITS.map(function(t){ return { label:t[1], key:t[1], c:(dd.tPts[t[1]] || 0), kind:'persona', note: dd.tN[t[0]] ? 'avg ' + (dd.tSumF[t[0]] / dd.tN[t[0]]).toFixed(1) + ' \u00b7 ' + dd.tN[t[0]] + ' rated' : 'not rated' }; })
      .sort(function(a, b){ return b.c - a.c; }); }
  else return;
  var max = rows.length ? rows[0].c : 0, CAP = 120;
  var body;
  if(vk === 'persona') body = rows.map(function(r){
    return '<button type="button" class="hmi-krow" data-act="hmiopen" data-kind="persona" data-key="' + esc(r.key) + '" data-label="' + esc(r.label) + '"><span class="hmi-klab">' + esc(r.label) + '</span><span class="hmi-knote">' + esc(r.note || '') + '</span><span class="hmi-ptr"><i style="width:' + (max > 0 ? Math.max(2, Math.round(1000 * r.c / max) / 10) : 0) + '%"></i></span><b>' + r.c + '</b></button>';
  }).join('');
  else body = rows.slice(0, CAP).map(function(r){
    return hmiKrow(r.label, r.c, max, 'data-act="hmiopen" data-kind="' + r.kind + '" data-key="' + esc(r.key) + '" data-label="' + esc(r.label) + '"');
  }).join('');
  if(rows.length > CAP) body += '<p class="dim hmi-more2">+ ' + (rows.length - CAP) + ' more.</p>';
  hmiShow(title, sub, body, opener);
}

/* --- KPI inspectors --- */
function hmiKpi(k, opener){
  var dd = hmDeck(), pd = hmPd(), N = dd.N;
  if(k === 'people'){
    var trows = [['vetted','Vetted',dd.tierCounts.vetted],['associate','Associate',dd.tierCounts.associate],['open','Open',dd.tierCounts.open],['none','No tier yet',dd.tierCounts.none]].map(function(t){
      return hmiKrow(t[1], t[2], N, 'data-act="hmiopen" data-kind="tier" data-key="' + t[0] + '" data-label="' + t[1] + '"');
    }).join('');
    var rrows = hmFormsTop(dd.rels, 12, true).map(function(t){
      return hmiKrow(t.label, t.c, N, 'data-act="hmiopen" data-kind="rel" data-key="' + esc(t.label) + '" data-label="' + esc(t.label) + '"');
    }).join('');
    if(dd.relBlank) rrows += hmiKrow('Unspecified', dd.relBlank, N, 'data-act="hmiopen" data-kind="rel" data-key="Unspecified" data-label="Unspecified"');
    var cov = [['Located', dd.locN, 'located'],['Dated', dd.dated, 'dated'],['Photos on file', pd.onFile, 'photos'],['Footprint coverage', dd.fpPeople, 'footprint']].map(function(c){
      return hmiKrow(c[0], c[1], N, 'data-act="hmikpi" data-k="' + c[2] + '"');
    }).join('');
    hmiShow('People', hmFmtN(N) + ' in the directory',
      '<div class="hmi-sec">Tier</div>' + trows + '<div class="hmi-sec">Relationship</div>' + rrows + '<div class="hmi-sec">Coverage</div>' + cov, opener);
  }
  else if(k === 'footprint'){
    var top = hmPlainTop(dd.fpCounts, 15);
    var max = top.length ? top[0].c : 0;
    var body = '<div class="hmi-stats"><div class="hmi-stat"><b>' + hmFmtN(dd.fpTotal) + '</b><span>facts on file</span></div>' +
      '<div class="hmi-stat"><b>' + dd.fpPeople + '</b><span>people covered</span></div>' +
      '<div class="hmi-stat"><b>' + (N ? Math.round(100 * dd.fpPeople / N) : 0) + '%</b><span>of network</span></div>' +
      '<div class="hmi-stat"><b>' + (dd.fpPeople ? (dd.fpTotal / dd.fpPeople).toFixed(1) : '0') + '</b><span>avg per person</span></div></div>' +
      '<div class="hmi-sec">Most documented</div>' +
      top.map(function(t){ return hmiKrow(t.label, t.c, max, 'data-act="hmiopen" data-kind="footprint" data-key="' + esc(t.label) + '"'); }).join('');
    hmiShow('Public footprint', hmFmtN(dd.fpTotal) + ' facts \u00b7 ' + dd.fpPeople + ' people', body, opener);
  }
  else if(k === 'photos'){
    var body2 = '<div class="hmi-stats"><div class="hmi-stat"><b>' + pd.onFile + '</b><span>people with photos</span></div>' +
      '<div class="hmi-stat"><b>' + pd.totalPhotos + '</b><span>photos total</span></div>' +
      '<div class="hmi-stat"><b>' + pd.missing + '</b><span>no photo yet</span></div>' +
      '<div class="hmi-stat"><b>' + pd.multi + '</b><span>with 2+ photos</span></div></div>' +
      '<div class="hmi-sec">Most photographed</div>' +
      (pd.most.slice(0, 15).map(function(m){
        var di = hmDiOf(m.name); if(di == null) return '';
        return hmiRow(di, '<span class="hmi-chip">' + m.n + (m.n === 1 ? ' photo' : ' photos') + '</span>');
      }).join('') || '<p class="dim">No photos on file yet.</p>') +
      '<div class="hmi-sec">Sources</div>' +
      hmiKrow('From Instagram', pd.igNames.length, pd.onFile || 1, 'data-act="hmiopen" data-kind="igsrc" data-label="From Instagram"') +
      '<p class="hmi-note dim">Photos on the Home wall and the Photos page open the photo inspector, where each photo can be keyed, reordered, adjusted or removed.</p>';
    hmiShow('Photos', pd.onFile + ' people \u00b7 ' + pd.totalPhotos + ' photos', body2, opener);
  }
  else if(k === 'located'){
    var trows2 = hmFormsTop(dd.towns, 999);
    var max2 = trows2.length ? trows2[0].c : 0;
    var body3 = '<div class="hmi-stats"><div class="hmi-stat"><b>' + dd.locN + '</b><span>located</span></div>' +
      '<div class="hmi-stat"><b>' + trows2.length + '</b><span>towns</span></div>' +
      '<div class="hmi-stat"><b>' + (N - dd.locN) + '</b><span>no location</span></div></div>' +
      '<div class="hmi-sec">Towns</div>' +
      trows2.map(function(t){ return hmiKrow(t.label, t.c, max2, 'data-act="hmiopen" data-kind="town" data-key="' + esc(t.key) + '" data-label="' + esc(t.label) + '"'); }).join('') +
      '<div class="hmi-actions"><button type="button" class="btn ghost sm" data-act="hmiopen" data-kind="noloc" data-label="No location on file">See who has no location</button></div>';
    hmiShow('Located', dd.locN + ' people \u00b7 ' + trows2.length + ' towns', body3, opener);
  }
  else if(k === 'dated'){
    var pre = 0, d10 = 0, d20 = 0;
    dd.yrEntries.forEach(function(t){
      if(t.label === 'Before 2010') pre += t.c;
      else { var y = parseInt(t.label, 10); if(y < 2020) d10 += t.c; else d20 += t.c; }
    });
    var dmax = Math.max(pre, d10, d20, 1);
    var miss = hmiRows('missingyrs', '');
    var body4 = '<div class="hmi-stats"><div class="hmi-stat"><b>' + dd.dated + '</b><span>dated</span></div>' +
      '<div class="hmi-stat"><b>' + dd.undated + '</b><span>missing a year</span></div>' +
      '<div class="hmi-stat"><b>' + (N ? Math.round(100 * dd.dated / N) : 0) + '%</b><span>of network dated</span></div></div>' +
      '<div class="hmi-sec">By decade</div>' +
      hmiKrow('Before 2010', pre, dmax, 'data-act="hmiopen" data-kind="decade" data-key="pre2010" data-label="Before 2010"') +
      hmiKrow('2010 \u2013 2019', d10, dmax, 'data-act="hmiopen" data-kind="decade" data-key="2010s" data-label="2010 \u2013 2019"') +
      hmiKrow('2020 \u2013 today', d20, dmax, 'data-act="hmiopen" data-kind="decade" data-key="2020s" data-label="2020 \u2013 today"') +
      '<div class="hmi-sec">Still missing a year</div>' +
      '<p class="hmi-note dim">' + dd.undated + ' people have no start year on file. The Years Known audit works through them one at a time, with presets and batch assign.</p>' +
      '<div class="hmi-actions"><button type="button" class="btn primary sm" data-act="hmiaudit">Open the Years Known audit</button></div>' +
      hmiRowsHTML('missingyrs', miss, 40);
    hmiShow('Known since', dd.dated + ' dated \u00b7 ' + dd.undated + ' missing', body4, opener);
  }
}
function hmiFootprint(name, opener){
  var di = hmDiOf(name); if(di == null) return;
  var e = D.directory[di];
  var facts = String(gv(e, 'public_footprint') || '').split('\n').filter(function(b){ return b.trim(); });
  var meta = [tierName(e), (ptLocVal(e) || '').split(',')[0] || '', cap(gv(e, 'relationship')) || ''].filter(Boolean).join(' \u00b7 ');
  var body = '<div class="hmi-pcard">' + hmiAvatar(di) + '<div><div class="hmi-pname">' + esc(dispName(e)) + milBadge(e) + '</div>' +
    (meta ? '<div class="hmi-meta">' + esc(meta) + '</div>' : '') +
    '<div class="hmi-meta">' + facts.length + ' public facts on file</div></div></div>' +
    '<div class="hmi-facts">' + facts.map(function(f){ return '<p>' + esc(f.replace(/^\u2022\s*/, '')) + '</p>'; }).join('') + '</div>' +
    '<div class="hmi-actions"><button type="button" class="btn primary sm" data-act="hmiperson" data-di="' + di + '">Open full profile</button></div>';
  hmiShow('Public footprint', dispName(e), body, opener);
}
function hmiLiveRecords(opener){
  if(!DT || DT.empty || !DT.checked){ hmiShow('Live Records', '', '<p class="dim">No Live Records brief has landed yet.</p>', opener); return; }
  var body = '<div class="hmi-stats">' +
    '<div class="hmi-stat"><b>' + (DT.coverage ? DT.coverage.checked_total + ' / ' + DT.coverage.of : '&mdash;') + '</b><span>rotation checked</span></div>' +
    '<div class="hmi-stat"><b>' + DT.checked.length + '</b><span>checked in latest brief</span></div>' +
    '<div class="hmi-stat"><b>' + (DT.filed ? DT.filed.length : 0) + '</b><span>updated in latest brief</span></div></div>';
  if(DT.filed && DT.filed.length){
    body += '<div class="hmi-sec">Filed ' + esc(hmFmtD(DT.date)) + '</div>';
    DT.filed.forEach(function(f){ (f.facts || []).forEach(function(x){ body += hmaFactRow(f, x, 'hmiperson'); }); });
  }
  body += '<div class="hmi-sec">Checked in the latest brief</div><div class="hmi-rows">' +
    DT.checked.map(function(nm){
      var di = hmDtDi(nm); if(di == null) return '';
      return hmiRow(di, hmiTierTag(D.directory[di]));
    }).join('') + '</div>';
  if(DT.next_up && DT.next_up.length){
    body += '<div class="hmi-sec">Next up</div><div class="hmi-rows">' +
      DT.next_up.map(function(nm){ var di = hmDtDi(nm); if(di == null) return ''; return hmiRow(di, hmiTierTag(D.directory[di])); }).join('') + '</div>';
  }
  body += '<div class="hmi-actions"><button type="button" class="btn primary sm" data-act="hmidaily">Open Live Records</button></div>';
  hmiShow('Live Records', hmFmtD(DT.date), body, opener);
}
function hmiChanges(opener){
  if(!CH || !CH.entries || !CH.entries.length){ hmiShow('Change log', '', '<p class="dim">No changes logged yet.</p>', opener); return; }
  var body = '<div class="hmi-stats"><div class="hmi-stat"><b>' + CH.entries.length + '</b><span>changes logged</span></div>' +
    '<div class="hmi-stat"><b>' + esc(hmFmtD(CH.entries[0].filed)) + '</b><span>latest filed</span></div></div>' +
    '<div class="hmi-sec">Most recent</div>' +
    CH.entries.slice(0, 30).map(function(c){ return hmaRow(c, 'hmiperson'); }).join('') +
    '<div class="hmi-actions"><button type="button" class="btn ghost sm" data-act="hmidaily">Open Live Records</button></div>';
  hmiShow('Change log', CH.entries.length + ' entries', body, opener);
}
function hmiDispatchOpen(el){
  var kind = el.getAttribute('data-kind'), key = el.getAttribute('data-key'), label = el.getAttribute('data-label');
  if(kind === 'footprint'){ hmiFootprint(key, el); return; }
  if(kind === 'liverec'){ hmiLiveRecords(el); return; }
  if(kind === 'changes'){ hmiChanges(el); return; }
  if(kind === 'igsrc'){
    var pd = hmPd();
    var rows = [];
    pd.igNames.forEach(function(nm){ var di = hmDiOf(nm); if(di != null) rows.push({ di:di, val:null }); });
    var body = hmiStatsHTML(rows) + '<div class="hmi-rows">' + rows.map(function(r){
      var m = pd.most.filter(function(x){ return x.name === dispName(D.directory[r.di]); })[0];
      return hmiRow(r.di, '<span class="hmi-chip">' + (m ? m.n : 1) + (m && m.n === 1 ? ' photo' : ' photos') + '</span>');
    }).join('') + '</div>';
    hmiShow('Photos', 'From Instagram', body, el);
    return;
  }
  if(kind === 'orgpair'){
    var ka = el.getAttribute('data-ka'), kb = el.getAttribute('data-kb');
    hmiOpenList('orgpair', ka + '\u0001' + kb, ka + ' + ' + kb, el);
    return;
  }
  hmiOpenList(kind, key, label, el);
}

/* --- Config 5: the Network, in miniature. Same layout the
   Network view computes (netBuild: score rings, org hubs at
   member centroids, tier colors), drawn as one SVG. The whole
   plotted group drifts at the Network 3D view's rate (one
   revolution per 90 s); hub name plates counter-rotate so
   they stay upright. Hover pauses the drift. --- */
var HM_NET_RAF = 0;
var HM_DATES = store('ncc_hm_dates') === '1';   /* Home Photos "Added" dates: collapsed by default, toggle in the card header (JD 2026-10-26) */
function hmNetCard(){
  netBuild();
  var parts = [], rot = [], i;
  for(i = 0; i < SCORE_RADII.length; i++){
    parts.push('<circle cx="0" cy="0" r="' + SCORE_RADII[i] + '" class="hm-ring"/>');
    parts.push('<text class="hm-guide" x="14" y="' + (-SCORE_RADII[i] + 32) + '">' + esc(SCORE_GUIDES[i]) + '</text>');
  }
  NET.hubs.forEach(function(h){ rot.push('<line class="hm-hubspoke" x1="0" y1="0" x2="' + h.x.toFixed(1) + '" y2="' + h.y.toFixed(1) + '"/>'); });
  NET.hubs.slice(0, 6).forEach(function(h){ h.nds.forEach(function(nd){ rot.push('<line class="hm-spoke" x1="' + h.x.toFixed(1) + '" y1="' + h.y.toFixed(1) + '" x2="' + nd.sx.toFixed(1) + '" y2="' + nd.sy.toFixed(1) + '"/>'); }); });
  NET.nodes.forEach(function(nd){ rot.push('<circle class="hm-node" cx="' + nd.sx.toFixed(1) + '" cy="' + nd.sy.toFixed(1) + '" r="' + (nd.r * 2.6).toFixed(1) + '" fill="' + netColor(nd) + '"/>'); });
  NET.hubs.forEach(function(h){
    rot.push('<rect class="hm-hubmark" x="' + (h.x - 9).toFixed(1) + '" y="' + (h.y - 9).toFixed(1) + '" width="18" height="18" transform="rotate(45 ' + h.x.toFixed(1) + ' ' + h.y.toFixed(1) + ')"/>');
  });
  NET.hubs.slice(0, 5).forEach(function(h){
    rot.push('<text class="hm-hublabel" data-hx="' + h.x.toFixed(1) + '" data-hy="' + h.y.toFixed(1) + '" x="' + h.x.toFixed(1) + '" y="' + (h.y - 26).toFixed(1) + '" text-anchor="middle">' + esc(h.name) + '</text>');
  });
  var svg = '<svg class="hm-netsvg" viewBox="-1040 -1040 2080 2080" role="img" aria-label="Network preview: everyone in the directory on closeness rings around JD">' +
    parts.join('') + '<g class="hm-rot">' + rot.join('') + '</g>' +
    '<circle cx="0" cy="0" r="17" class="hm-jddot"/><text class="hm-jd" x="0" y="64" text-anchor="middle">JD</text></svg>';
  var orgRows = NET.hubs.slice(0, 8).map(function(h){
    return '<button type="button" class="hm-org" data-act="hmorg" data-v="' + esc(h.name) + '"><span>' + esc(h.name) + '</span><b data-hmn="' + h.nds.length + '">' + h.nds.length + '</b></button>';
  }).join('');
  return '<section class="card hm-blk"><header><h3>Network</h3><em class="cnt">' + NET.nodes.length + ' on the map &middot; ' + NET.hubs.length + ' hubs</em></header><div class="cbody">' +
    '<div class="hm-netgrid"><a class="hm-netlink" href="#/network" aria-label="Open the full Network">' + svg + '</a>' +
    '<div><h4>Organizations &mdash; tap to focus</h4><div class="hm-orgs">' + orgRows + '</div>' +
    '<p class="dim hm-note">Everyone in the directory on closeness rings; each tie routes through the person&rsquo;s largest organization. Tap the map for the full Network.</p></div></div>' +
    '</div></section>';
}
function hmNetDrift(){
  cancelAnimationFrame(HM_NET_RAF);
  var g = $('.hm-rot'), svg = $('.hm-netsvg');
  if(!g || !svg || REDUCED_MOTION) return;
  var labels = $$('.hm-hublabel', svg), paused = false, ang = 0, last = performance.now();
  svg.addEventListener('pointerenter', function(){ paused = true; });
  svg.addEventListener('pointerleave', function(){ paused = false; });
  function frame(now){
    if(!document.body.contains(g) || S.route.name !== 'home') return;
    var dt = now - last; last = now;
    if(!paused) ang = (ang + dt * 0.004) % 360;   /* 0.004 deg/ms = one revolution per 90 s, the Network 3D drift rate */
    g.setAttribute('transform', 'rotate(' + ang.toFixed(2) + ')');
    for(var i = 0; i < labels.length; i++) labels[i].setAttribute('transform', 'rotate(' + (-ang).toFixed(2) + ' ' + labels[i].getAttribute('data-hx') + ' ' + labels[i].getAttribute('data-hy') + ')');
    HM_NET_RAF = requestAnimationFrame(frame);
  }
  HM_NET_RAF = requestAnimationFrame(frame);
}
/* --- Config 6: Photos. "On file" mirrors the Photos view's
   own rule (a URL plus a confirmed / likely / possible grade,
   minus anything JD rejected). The wall leads with the most
   recently filed photos — the change log's order — then by
   grade, the same ordering the Photos page opens with. --- */
/* Audit F19: one canonical source for the counts every view shows.
   Photo counts use the Photos page's own definition (phHasPhoto over
   all tracked entries) so Home and Photos can never disagree. */
function statsOf(){
  var st = { people: people().length, photosOnFile: 0, photosMissing: 0, photoEntries: 0, igPhotos: 0 };
  if(PH && PH.people){
    var all = phAllEntries(), withPh = all.filter(phHasPhoto);
    st.photoEntries = all.length;
    st.photosOnFile = withPh.length;
    st.photosMissing = all.length - withPh.length;
    withPh.forEach(function(p){ if(String(p.type || '').indexOf('Instagram') >= 0) st.igPhotos++; });
  }
  return st;
}
function hmPhotoStats(){
  if(!PH || !PH.people) return { ok:false };
  var REV = phReview();
  function revOf(p){ return REV[String(p.name || '').toLowerCase()] || ''; }
  var counts = { no_photo:0, no_source:0, auth_only:0 };
  PH.people.forEach(function(p){ if(counts[p.status] != null) counts[p.status]++; });
  var found = PH.people.filter(function(p){ return p.photo_url && (p.status === 'confirmed' || p.status === 'likely' || p.status === 'possible') && revOf(p) !== 'rejected'; });
  var chRank = {};
  if(CH && CH.entries) CH.entries.forEach(function(c, i){ var k = String(c.name || '').toLowerCase(); if(chRank[k] == null) chRank[k] = i; });
  var gradeR = { confirmed:0, likely:1, possible:2 };
  var wall = found.slice().sort(function(a, b){
    var ca = chRank[String(a.name).toLowerCase()], cb = chRank[String(b.name).toLowerCase()];
    if(ca != null || cb != null){ if(ca == null) return 1; if(cb == null) return -1; if(ca !== cb) return ca - cb; }
    return (gradeR[a.status] - gradeR[b.status]) || a.name.localeCompare(b.name);
  }).slice(0, 17);
  var _st = statsOf();
  return { ok:true, onFile:_st.photosOnFile, noPhoto:_st.photosMissing, checked:PH.people.length, total:PH.total || PH.people.length, ig:_st.igPhotos, wall:wall, updated:PH.updated || '', unchecked:phAllEntries().filter(function(p){ return p.status === 'unchecked'; }).length };
}
function hmPhotosCard(ph){
  if(!ph.ok) return '<section class="card hm-blk"><header><h3>Photos</h3></header><div class="cbody"><p class="dim">' + (PH ? 'No photo data yet.' : 'Loading photo data&hellip;') + '</p></div></section>';
  var kpis = '<div class="hm-kpis">' +
    '<button type="button" class="hm-kpi" data-act="hmikpi" data-k="photos"><div class="hm-kn">' + ph.onFile + '</div><div class="hm-kl">Photos on file</div></button>' +
    '<button type="button" class="hm-kpi" data-act="hmiopen" data-kind="nophoto" data-label="No photo yet"><div class="hm-kn">' + ph.noPhoto + '</div><div class="hm-kl">No photo yet</div></button>' +
    '<button type="button" class="hm-kpi" data-act="hmikpi" data-k="photos"><div class="hm-kn">' + ph.checked + '<small> / ' + ph.total + '</small></div><div class="hm-kl">Profiles checked</div></button>' +
    '<button type="button" class="hm-kpi" data-act="hmiopen" data-kind="igsrc" data-label="From Instagram"><div class="hm-kn">' + ph.ig + '</div><div class="hm-kl">From Instagram</div></button></div>';
  var tiles = ph.wall.map(function(p){
    /* V3.13.0: the photo IS the tile — it fills the frame and the
       frame's rounded corners clip the image itself; the name rides
       on the photo as a caption scrim, part of the same surface.
       (Was: square photo block stacked on a separate name bar, so
       the glass radius rounded the bar and left the photo square.) */
    return '<a class="hm-tile" href="#/photos" title="' + esc(p.name) + '" data-act="phinsp" data-pname="' + esc(p.name) + '"><img src="' + esc(phFrameFor(p.name, p).url || p.photo_url) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" style="' + phFrameStyle(p) + '"><span class="hm-tcap"><span class="hm-tn">' + esc(p.name) + '</span>' + milBadgeName(p.name) + (phAddedLabel(p) ? '<small class="hm-td">' + phAddedLabel(p) + '</small>' : '') + '</span></a>';
  }).join('');
  tiles += '<button type="button" class="hm-tile miss" data-act="hmiopen" data-kind="nophoto" data-label="No photo yet"><b>' + ph.noPhoto + '</b><span>still missing a photo</span></button>';
  return '<section class="card hm-blk' + (HM_DATES ? ' hm-showdates' : '') + '"><header><h3>Photos</h3><em class="cnt">' + (ph.updated ? 'Updated ' + esc(fmtIsoD(ph.updated)) : 'recently filed first') + (ph.unchecked ? ' · ' + ph.unchecked + ' not yet checked' : '') + '</em><span class="sp"></span><button type="button" class="btn ghost sm" data-act="hmdates">' + (HM_DATES ? 'Hide added dates' : 'Show added dates') + '</button></header><div class="cbody">' + kpis +
    '<div class="hm-tiles">' + tiles + '</div></div></section>';
}

/* --- Config 2: What's New, the activity rail --- */
/* --- Home: Last contacts (JD 2026-10-28). Home should have JD ready:
   who he last talked to, what was left open, and who has gone quiet
   longest — with the actual thread previews, not just dates. Built
   from the briefOf derivations. --- */
function hmLastKey(e){
  var k = flexKey(gv(e, 'last_contact'));
  (e.events || []).forEach(function(ev){
    if(ev && ev.kind === 'contact'){ var ek = flexKey(ev.date); if(ek != null && (k == null || ek > k)) k = ek; }
  });
  return k;
}
function hmContactsCard(){
  var rows = people().map(function(di){
    return { di:di, e:D.directory[di], k:hmLastKey(D.directory[di]) };
  }).filter(function(r){ return r.k != null; });
  var recent = rows.slice().sort(function(a, b){ return b.k - a.k; }).slice(0, 6);
  var quiet = rows.slice().sort(function(a, b){ return a.k - b.k; }).slice(0, 5);
  function row(r, mode){
    var b = briefOf(r.e);
    var when = lcDateLabel(new Date(r.k).getFullYear() + '-' + ('0' + (new Date(r.k).getMonth() + 1)).slice(-2) + '-' + ('0' + new Date(r.k).getDate()).slice(-2));
    var prev = '';
    if(mode === 'recent') prev = b.last ? briefClip(b.last.replace(/^[^\u2014]*\u2014\s*/, ''), 110) : '';
    if(!prev && b.ask) prev = 'Ask about: ' + b.ask.text;
    return '<button type="button" class="hm-lcrow" data-act="hmgoto" data-di="' + r.di + '">' +
      avatar(r.e, 'sm') + '<span class="hm-lcmain"><span class="hm-lcname">' + esc(dispName(r.e)) + '</span>' +
      (prev ? '<span class="hm-lcprev">' + esc(prev) + '</span>' : '') + '</span>' +
      '<span class="hm-lcwhen">' + esc(when) + '</span></button>';
  }
  var tlOn = S.hmTlView === 'timeline';
  return '<section class="card hm-blk"><header><h3>Last contacts</h3><em class="cnt">' + rows.length + ' with contact on file</em><span class="sp"></span>' +
    '<div class="seg hm-tlseg" role="group" aria-label="Last contacts view"><button type="button" data-act="hmtlview" data-v="list"' + (!tlOn ? ' class="on"' : '') + '>List</button><button type="button" data-act="hmtlview" data-v="timeline"' + (tlOn ? ' class="on"' : '') + '>Timeline</button></div>' +
    '<a class="hma-link" href="#/people">Reach back out ' + ic('arrow', 12) + '</a></header><div class="cbody">' +
    (tlOn ? tlShell('hm', tlContactItems(people()))
      : '<div class="hm-lc-cols"><div><h4>Most recent</h4>' + recent.map(function(r){ return row(r, 'recent'); }).join('') + '</div>' +
        '<div><h4>Quiet the longest</h4>' + quiet.map(function(r){ return row(r, 'quiet'); }).join('') + '</div></div>') +
    '</div></section>';
}
/* --- Home: Network at a glance (JD 2026-10-28) — the full map
   preview is gone from Home; what stays is one color-coded line:
   the tier mix (the "knows" colors) plus hub count. --- */
function hmNetStrip(dd){
  netBuild();
  var seg = [
    { l:'Vetted', c:dd.tierCounts.vetted, col:(TIERS.vetted || {}).c || 'var(--seg-0)' },
    { l:'Associate', c:dd.tierCounts.associate, col:(TIERS.associate || {}).c || 'var(--seg-1)' },
    { l:'Open', c:dd.tierCounts.open, col:(TIERS.open || {}).c || 'var(--seg-2)' },
    { l:'No tier yet', c:dd.tierCounts.none, col:RING_C[3] }
  ];
  return '<section class="card hm-blk hm-netstrip"><div class="cbody"><div class="hm-ns-row">' +
    '<span class="hm-ns-t">Network</span>' +
    seg.map(function(s){ return '<span class="hm-ns-seg"><i style="background:' + s.col + '"></i>' + s.l + ' <b>' + s.c + '</b></span>'; }).join('') +
    '<span class="hm-ns-seg dim">' + NET.nodes.length + ' on the map &middot; ' + NET.hubs.length + ' hubs</span>' +
    '<span class="sp"></span><a class="hma-link" href="#/network">Open Network ' + ic('arrow', 12) + '</a>' +
    '</div></div></section>';
}
function viewHome(v){
  phLoad(); dtLoad(); chLoad();
  var pop = people(), N = pop.length;
  var ph = hmPhotoStats();
  HM_DECK = hmDeckData(pop); HM_PD = hmDeckPhotos(); HMI_INDEX = {};
  if(HMI) hmiClose(true);
  var dd = HM_DECK, pd = HM_PD;
  var tierSegs = [
    { label:'Vetted', key:'vetted', kind:'tier', c:dd.tierCounts.vetted, col:'var(--seg-0)' },
    { label:'Associate', key:'associate', kind:'tier', c:dd.tierCounts.associate, col:'var(--seg-1)' },
    { label:'Open', key:'open', kind:'tier', c:dd.tierCounts.open, col:'var(--seg-2)' },
    { label:'No tier yet', key:'none', kind:'tier', c:dd.tierCounts.none, col:'var(--seg-4)' }
  ];
  var relSegs = hmFormsTop(dd.rels, 12, true).map(function(t, i){
    return { label:t.label, key:t.label, kind:'rel', c:t.c, col:'var(--seg-' + (i % 9) + ')' };
  });
  if(dd.relBlank) relSegs.push({ label:'Untyped', key:'Unspecified', kind:'rel', c:dd.relBlank, col:'var(--seg-8)' });
  var townsTop = hmFormsTop(dd.towns, 8), townMax = townsTop.length ? townsTop[0].c : 0;
  var skillsTop = hmFormsTop(dd.skills, 8, true), skillMax = skillsTop.length ? skillsTop[0].c : 0;
  var groupsTop = hmPlainTop(dd.groupCounts, 8), groupMax = groupsTop.length ? groupsTop[0].c : 0;
  var orgsTop = hmPlainTop(dd.orgCounts, 8), orgMax = orgsTop.length ? orgsTop[0].c : 0;
  var fpTop = hmPlainTop(dd.fpCounts, 8), fpMax = fpTop.length ? fpTop[0].c : 0;
  /* V3.26.0 consolidation (JD): the KPI strip rides inside the
     banner, the two mixes + network line are one Shape card, and
     the five leader boards are one Rankings card — three surfaces
     where there were nine, so the content starts at the top. */
  v.innerHTML = '<div class="page hm"><div class="hm-layout"><div class="hm-main"><div class="pagehead"><div><h1 class="display">Home</h1>' +
    '<p class="sub">The whole circle at a glance: who you last talked to, its shape, and what changed lately. Everything opens a closer look.</p></div>' +
    '<div class="hmk-strip">' +
    hmKpi('people', hmFmtN(N), 'People', 'in the directory') +
    hmKpi('footprint', hmFmtN(dd.fpTotal), 'Footprint facts', 'across ' + dd.fpPeople + ' people') +
    hmKpi('photos', pd.onFile, 'Photos on file', hmFmtN(pd.totalPhotos) + ' photos total') +
    hmKpi('located', dd.locN, 'Located', Object.keys(dd.towns).length + ' towns on file') +
    hmKpi('dated', dd.dated, 'Known since', dd.undated + ' still missing a year') +
    '</div></div>' +
    hmShapeCard(dd, tierSegs, relSegs, N) +
    hmContactsCard() +
    hmRanksCard([
      { title:'Where they are', rows: townsTop.slice(0, 5).map(function(t, ix){ return hmBarRow('town', t.key, t.label, t.c, townMax, ix === 0); }).join(''),
        more: Object.keys(dd.towns).length > 5 ? hmMoreBtn('data-act="hmikpi" data-k="located"', '+' + (Object.keys(dd.towns).length - 5) + ' more towns') : '' },
      { title:'Skills', rows: skillsTop.slice(0, 5).map(function(t){ return hmBarRow('skill', t.key, t.label, t.c, skillMax); }).join(''),
        more: Object.keys(dd.skills).length > 5 ? hmMoreBtn('data-act="hmivlist" data-vk="skill"', '+' + (Object.keys(dd.skills).length - 5) + ' more skills') : '' },
      { title:'Groups', rows: groupsTop.slice(0, 5).map(function(t){ return hmBarRow('group', t.key, t.label, t.c, groupMax); }).join(''),
        more: Object.keys(dd.groupCounts).length > 5 ? hmMoreBtn('data-act="hmivlist" data-vk="group"', '+' + (Object.keys(dd.groupCounts).length - 5) + ' more groups') : '' },
      { title:'Organizations', rows: orgsTop.slice(0, 5).map(function(t){ return hmBarRow('org', t.key, t.label, t.c, orgMax); }).join(''),
        more: Object.keys(dd.orgCounts).length > 5 ? hmMoreBtn('data-act="hmivlist" data-vk="org"', '+' + (Object.keys(dd.orgCounts).length - 5) + ' more organizations') : '' },
      { title:'Footprint leaders', rows: fpTop.slice(0, 5).map(function(t){ return hmBarRow('footprint', t.key, t.label, t.c, fpMax); }).join(''),
        more: hmMoreBtn('data-act="hmikpi" data-k="footprint"', 'All footprint coverage') }
    ]) +
    '<div class="hm-years-slim">' + hmYearsCard(dd) + '</div>' +
    '</div><aside class="hm-rail">' + hmActivity() + '</aside></div></div>';
}

/* ============================================================
   Daily Ten (JD 2026-10-19): the currency routine's brief.
   Every morning Luna checks 25 profiles against the public
   record and files the strongest verified updates into the
   Sheet automatically. This view renders the latest brief
   (data/daily-ten.json, written by the routine); read-only.
   ============================================================ */
/* One dispatcher for async data arrivals (audit F11): every loader
   repaints through here, so a new view joins one list, not three. */
function repaintForData(kind){
  var r = S.route.name;
  if(kind === 'msg'){
    /* Correspondence data landing mid-profile: rebuild the profile so
       the Files section appears, unless JD is mid-edit (the entry
       shows on the next natural render instead). On People it fills
       the Correspondence column in place. */
    if($('#p-hero') && !Object.keys(S.prof.edit || {}).some(function(k){ return S.prof.edit[k]; })) render();
    else if(r === 'people' && $('#plist')) paintPeople();
    return;
  }
  if(kind === 'ph'){
    if(r === 'photos' || r === 'audit' || r === 'home') render();
    else if(r === 'groups'){ grpPaintCards(); grpPaintMembers(); }
    else if($('#p-hero')) repaintTop();
  } else if(r === 'daily' || r === 'home') render();
}
var DT = null, DT_LOADING = false;
function dtLoad(){
  if(DT || DT_LOADING) return;
  DT_LOADING = true;
  fetch('data/daily-ten.json', { cache:'no-cache' })
    .then(function(r){ if(!r.ok) throw new Error('none'); return r.json(); })
    .then(function(d){ DT = d; DT_LOADING = false; repaintForData('dt'); })
    .catch(function(){ DT = { empty:true }; DT_LOADING = false; repaintForData('dt'); });
}
var CH = null, CH_LOADING = false;
function chLoad(){
  if(CH || CH_LOADING) return;
  CH_LOADING = true;
  fetch('data/changes.json', { cache:'no-cache' })
    .then(function(r){ if(!r.ok) throw new Error('none'); return r.json(); })
    .then(function(d){ CH = d; CH_LOADING = false; repaintForData('ch'); })
    .catch(function(){ CH = { entries:[] }; CH_LOADING = false; repaintForData('ch'); });
}
/* --- Change-log grouping (JD 2026-10-22): Apple-style batching.
   Entries sharing a filed date, a normalized "what" (the person's
   own name stripped out, so "Instagram profile picture filed."
   is one kind of event no matter whose it was) and a source
   collapse into a single expandable row with a count chip, so a
   bulk run reads as one line instead of hundreds. Render layer
   only: changes.json is untouched and every counter still counts
   individual entries. Groups order by their newest entry (the
   list is newest-first, so first appearance wins); members keep
   their order inside the group. --- */
function chgNormWhat(c){
  var w = String(c.what || ''), nm = String(c.name || '');
  if(nm) w = w.split(nm).join(' ');
  return w.replace(/\s+/g, ' ').trim().toLowerCase();
}
function chgGroupKey(c){ return String(c.filed || '') + '|' + chgNormWhat(c) + '|' + String(c.source || ''); }
function chgRows(entries){
  var order = [], byKey = {};
  (entries || []).forEach(function(c){
    var k = chgGroupKey(c);
    if(!byKey[k]){ byKey[k] = { key:k, first:c, items:[] }; order.push(byKey[k]); }
    byKey[k].items.push(c);
  });
  return order;
}
/* Novelty traffic light (JD 2026-10-26): a subtle horizontal bar on
   filed facts — green = new information that was not on the profile,
   yellow = expands on something similar already there, red = near-
   duplicate that needs a look. Unlabeled; the title carries the
   meaning on hover. Unclassified entries render nothing. */
function novBar(n){
  if(n === 'new') return '<span class="novbar nov-new" title="New information: not on the profile before"></span>';
  if(n === 'expands') return '<span class="novbar nov-exp" title="Expands on something already on the profile"></span>';
  if(n === 'redundant') return '<span class="novbar nov-red" title="Near-duplicate: may already be filed — worth a look"></span>';
  return '';
}
function chgEntryRow(c, linkFn, fmtFn, cls, style){
  return '<div class="chg' + (cls ? ' ' + cls : '') + '"' + (style || '') + '><div class="chg-name">' + linkFn(c.name) + '</div>' +
    '<p class="chg-what">' + esc(c.what || '') + '</p>' +
    '<div class="chg-src">' + (c.url ? '<a href="' + esc(c.url) + '" target="_blank" rel="noopener">' + esc(c.source || 'source') + ' ' + ic('ext', 10) + '</a>' : esc(c.source || '')) +
    (c.source_date ? ' &middot; source ' + esc(fmtFn(c.source_date)) : '') +
    (c.filed ? '<span class="chg-filed">Filed ' + esc(fmtFn(c.filed)) + '</span>' : '') + '</div>' + novBar(c.novelty) + '</div>';
}
function chgGroupRow(g, linkFn, fmtFn, cls, style){
  var c = g.first, sd = c.source_date, uniform = true;
  g.items.forEach(function(x){ if(x.source_date !== sd) uniform = false; });
  var members = g.items.map(function(x){ return chgEntryRow(x, linkFn, fmtFn); }).join('');
  return '<div class="chg-grp' + (cls ? ' ' + cls : '') + '"' + (style || '') + '>' +
    '<button type="button" class="chg-grp-h" data-act="chggrp" aria-expanded="false">' +
    '<span class="chg-cnt">' + g.items.length + '</span>' +
    '<span class="chg-grp-main"><span class="chg-grp-what">' + esc(c.what || '') + '</span>' +
    '<span class="chg-src">' + esc(c.source || '') + (uniform && sd ? ' &middot; source ' + esc(fmtFn(sd)) : '') +
    (c.filed ? '<span class="chg-filed">Filed ' + esc(fmtFn(c.filed)) + '</span>' : '') + '</span></span>' +
    '<span class="chg-chev">' + ic('chev', 14) + '</span></button>' +
    '<div class="chg-members"><div class="chg-members-in">' + members + '</div></div></div>';
}
function chgToggle(el){
  var wrap = el.closest('.chg-grp'); if(!wrap) return;
  var rail = el.closest('.hm-rail, .dtrail') || document;
  var wasOpen = wrap.classList.contains('open');
  $$('.chg-grp.open', rail).forEach(function(g){ g.classList.remove('open'); var b = $('.chg-grp-h', g); if(b) b.setAttribute('aria-expanded', 'false'); });
  if(!wasOpen){ wrap.classList.add('open'); el.setAttribute('aria-expanded', 'true'); }
}
function dtAnimate(){
  /* Numbers render at their final values in the markup (UI arena
     2026-10-29 — the 800ms count-up from literal 0 could be misread at a
     glance on the trust surface). Only the ring/bar settle remains. */
  setTimeout(function(){
    var ring = document.querySelector('.asring-fg');
    if(ring) ring.style.strokeDashoffset = ring.getAttribute('data-off');
    var bar = document.querySelector('.asbar-fill');
    if(bar) bar.style.width = bar.getAttribute('data-w');
  }, 40);
}
function viewDaily(v){
  dtLoad(); chLoad();
  var head = '<div class="page asearch lr"><div class="pagehead"><div><h1 class="display">Live Records</h1></div></div>';
  if(!DT){
    v.innerHTML = head + '<div class="asskel"><div class="skl-top"><div class="skl hero"></div><div class="skl"></div></div><div class="skl-grid"><div class="skl"></div><div class="skl"></div><div class="skl"></div><div class="skl"></div></div><div class="skl"></div></div></div>';
    return;
  }
  if(DT.empty || !DT.date){ v.innerHTML = head + '<section class="card"><div class="cbody"><p class="dim">No brief yet. The first one lands tomorrow morning.</p></div></section></div>'; return; }
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function fmtD(iso){ if(!iso) return ''; var p = String(iso).split('-'); return MON[parseInt(p[1], 10) - 1] + ' ' + parseInt(p[2], 10) + ', ' + p[0]; }
  function daysBetween(a, b){ return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
  var filedNames = {};
  (DT.filed || []).forEach(function(f){ filedNames[String(f.name || '').toLowerCase()] = 1; });
  function diOf(name){ var di = BYN[String(name || '').toLowerCase()]; return di == null ? null : di; }
  function personLink(name, display){
    var di = diOf(name);
    var label = esc(display || name || '');
    if(di == null) return '<b>' + label + '</b>';
    return '<a href="#/p/' + encodeURIComponent(personId(D.directory[di])) + '" data-act="openp" data-di="' + di + '"><b>' + label + '</b></a>' + milBadge(D.directory[di]);
  }
  function factLine(x){
    return esc(x.text) + (x.url ? ' <a class="assrc" href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.source || 'source') + ' ' + ic('ext', 11) + '</a>' : ' <span class="dim">(' + esc(x.source || '') + ')</span>') + novBar(x.novelty);
  }
  /* --- New records (JD 2026-10-28 cleanup): every fresh find from the
     past 3 weeks gets its own compact card — at 150 checks a day there
     are several, so the single hero is gone. --- */
  var freshList = [];
  (DT.filed || []).forEach(function(f){ (f.facts || []).forEach(function(x){ if(x.fresh) freshList.push({ f:f, x:x }); }); });
  var freshF = freshList.length ? freshList[0].f : null;
  var newCards = '';
  if(freshList.length){
    var shown = freshList.slice(0, 8);
    newCards = '<div class="assec-t asanim" style="--d:60ms">NEW RECORDS &mdash; PAST 3 WEEKS <em class="cnt">' + freshList.length + '</em></div>' +
      '<div class="lrnew-grid">' + shown.map(function(it, i){
        var di = diOf(it.f.name), e = di != null ? D.directory[di] : null;
        return '<section class="card lrnew asanim" style="--d:' + (80 + i * 50) + 'ms"><div class="cbody">' +
          '<div class="lrnew-h">' + (e ? avatar(e, 'md') : '') + '<div class="lrnew-name">' + personLink(it.f.name, it.f.display) +
          (it.x.published ? '<small class="dim">Published ' + esc(fmtD(it.x.published)) + '</small>' : '') + '</div>' +
          '<span class="dtnew">NEW</span></div>' +
          '<p class="lrnew-fact">' + factLine(it.x) + '</p></div></section>';
      }).join('') + '</div>' +
      (freshList.length > shown.length ? '<p class="dim lrnew-more">+ ' + (freshList.length - shown.length) + ' more in the updated records below.</p>' : '');
  }
  /* --- Workflow strip (JD 2026-10-28 cleanup): the whole landing in
     one band. Counts first; who was checked lives in a dropdown on
     the checked card. Data liveliness is color-coded by the age of
     each profile's last check (DT.freshness, written by the routine
     from its rotation state): green <= 7 days, yellow-green 8-30,
     amber 31-90, red over 90, gray never checked. --- */
  var covPct = DT.coverage ? Math.round(1000 * DT.coverage.checked_total / Math.max(1, DT.coverage.of)) / 10 : 0;
  var C = 2 * Math.PI * 34;
  var ringOff = (C * (1 - covPct / 100)).toFixed(1);
  var FR = DT.freshness || null;
  var frBar = '';
  if(FR){
    var frSegs = [
      { k:'d7',    l:'Checked \u2264 7 days ago',  c:'#2f9e44' },
      { k:'d30',   l:'8\u201330 days ago',        c:'#8ab324' },
      { k:'d90',   l:'31\u201390 days ago',       c:'#d9a404' },
      { k:'older', l:'Over 90 days ago',          c:'#e30613' },
      { k:'never', l:'Never checked',             c:'#6b7280' }
    ];
    var frTot = frSegs.reduce(function(s, g){ return s + (FR[g.k] || 0); }, 0) || 1;
    frBar = '<div class="lrfr"><div class="lrfr-h"><span>DATA FRESHNESS</span>' +
      (FR.oldest ? '<span class="dim">Oldest check ' + esc(fmtD(FR.oldest)) + '</span>' : '') + '</div>' +
      '<div class="lrfr-bar">' + frSegs.map(function(g){
        var n = FR[g.k] || 0; if(!n) return '';
        return '<span class="lrfr-seg" style="width:' + (100 * n / frTot) + '%;background:' + g.c + '" title="' + g.l + ' \u00b7 ' + n + '"></span>';
      }).join('') + '</div>' +
      '<div class="lrfr-leg">' + frSegs.map(function(g){
        return '<span><i style="background:' + g.c + '"></i>' + g.l + ' <b>' + (FR[g.k] || 0) + '</b></span>';
      }).join('') + '</div></div>';
  }
  var stats = '<section class="card lrflow asanim" style="--d:0ms"><div class="cbody"><div class="asstats">' +
    '<div class="asstat"><span class="asstat-ic">' + ic('search', 16) + '</span><b class="asnum">' + (DT.checked || []).length + '</b><span>Checked today</span></div>' +
    '<div class="asstat"><span class="asstat-ic">' + ic('sparkle', 16) + '</span><b class="asnum">' + (DT.filed || []).length + '</b><span>Updated records</span></div>' +
    '<div class="asstat"><span class="asstat-ic">' + ic('sparkle', 16) + '</span><b class="asnum">' + freshList.length + '</b><span>New records</span></div>' +
    '<div class="asstat asstat-ring"><svg class="asring" width="62" height="62" viewBox="0 0 84 84"><circle class="asring-bg" cx="42" cy="42" r="34"/><circle class="asring-fg" cx="42" cy="42" r="34" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '" data-off="' + ringOff + '"/><text class="asring-t" x="42" y="48" text-anchor="middle">' + Math.round(covPct) + '%</text></svg><div><b>' + (DT.coverage ? DT.coverage.checked_total + ' / ' + DT.coverage.of : '&mdash;') + '</b><span>Checked this cycle</span></div></div>' +
    '<div class="asstat"><span class="asstat-ic">' + ic('calendar', 16) + '</span><b>' + esc(fmtD(DT.date)) + '</b><span>Latest brief</span></div>' +
    '</div>' + frBar + '</div></section>';
  /* --- Updated packets --- */
  var cards = (DT.filed || []).length ? (DT.filed || []).map(function(f, i){
    var di = diOf(f.name), e = di != null ? D.directory[di] : null;
    var facts = (f.facts || []).map(function(x, j){
      return '<div class="asfact"><span class="asfact-n">' + ('0' + (j + 1)).slice(-2) + '</span><p>' + factLine(x) + (x.fresh ? ' <span class="dtnew">NEW</span>' : '') + '</p></div>';
    }).join('');
    return '<section class="card dtperson asanim" style="--d:' + (140 + i * 70) + 'ms"><div class="cbody">' +
      '<div class="dtp-head">' + (e ? avatar(e, 'md') : '') + '<div class="dtp-name">' + personLink(f.name, f.display) +
      '<small class="dim">' + (e ? esc(infoLine(e)) : '') + '</small></div>' +
      '<span class="asfiled-cnt">' + (f.facts || []).length + ' filed</span></div>' + facts + '</div></section>';
  }).join('') : '<section class="card asfull asanim" style="--d:140ms"><div class="cbody"><p class="dim">Nothing new worth filing today. Everyone checked is current.</p></div></section>';
  /* --- Checked, with outcomes --- */
  var updNames = {}, curNames = [];
  (DT.checked || []).forEach(function(c){
    if(filedNames[String(c.name || '').toLowerCase()]) updNames[String(c.name || '').toLowerCase()] = c; else curNames.push(c);
  });
  var updList = Object.keys(updNames).map(function(k){ return updNames[k]; });
  function chip(c, kind){
    var di = diOf(c.name);
    var inner = (di != null ? avatar(D.directory[di], 'sm') : '') + '<span>' + esc(c.display || c.name) + '</span>' + (di != null ? milBadge(D.directory[di]) : '') + (kind === 'upd' ? ic('sparkle', 12) : ic('check', 12));
    if(di == null) return '<span class="aschip ' + kind + '">' + inner + '</span>';
    return '<a class="aschip ' + kind + '" href="#/p/' + encodeURIComponent(personId(D.directory[di])) + '" data-act="openp" data-di="' + di + '">' + inner + '</a>';
  }
  /* Checked today, consolidated (JD 2026-10-28): the count is the
     headline; the names live in one dropdown. No "confirmed current"
     section — checked-with-nothing-new is just the remainder. */
  var allChecked = (DT.checked || []).slice().sort(function(a, b){
    var au = filedNames[String(a.name || '').toLowerCase()] ? 0 : 1, bu = filedNames[String(b.name || '').toLowerCase()] ? 0 : 1;
    if(au !== bu) return au - bu;
    return String(a.display || a.name).localeCompare(String(b.display || b.name));
  });
  var checkedCard = '<section class="card asanim" style="--d:' + (140 + (DT.filed || []).length * 70 + 60) + 'ms"><header><h3>Checked today</h3><em class="cnt">' + (DT.checked || []).length + '</em></header><div class="cbody">' +
    '<div class="lrchk-line"><b>' + updList.length + '</b> updated <span class="dim">&middot;</span> <b>' + curNames.length + '</b> checked, nothing new' +
    (typeof DT.unchecked_remaining === 'number' ? ' <span class="dim">&middot;</span> ' + DT.unchecked_remaining + ' not yet checked this cycle' : '') + '</div>' +
    ((DT.checked || []).length ? '<details class="lrdrop"><summary>Who was checked <span class="dim">(' + (DT.checked || []).length + ')</span></summary>' +
      '<div class="aschips">' + allChecked.map(function(c){ return chip(c, filedNames[String(c.name || '').toLowerCase()] ? 'upd' : 'cur'); }).join('') + '</div></details>' : '') +
    '</div></section>';
  var updHead = (DT.filed || []).length ? '<div class="assec-t asanim" style="--d:120ms">UPDATED RECORDS</div>' : '';
  /* The old currency strip is gone (JD 2026-10-28): its date lives in
     the workflow strip, and "next in the rotation" named people the
     landing doesn't need — only the not-yet-checked count remains,
     on the checked card. */
  /* --- Change log rail (JD 2026-10-22): every amendment from the photo/info passes, with the date of its source --- */
  function fmtSrc(iso){
    if(!iso) return '';
    var p = String(iso).split('-');
    if(p.length === 2) return MON[parseInt(p[1], 10) - 1] + ' ' + p[0];
    return fmtD(iso);
  }
  var rail = '';
  if(CH && CH.entries && CH.entries.length){
    var citems = chgRows(CH.entries).map(function(g){
      return g.items.length > 1 ? chgGroupRow(g, personLink, fmtSrc) : chgEntryRow(g.first, personLink, fmtSrc);
    }).join('');
    rail = '<aside class="dtrail"><div class="dtrail-h"><span>CHANGE LOG' + (CH.updated ? '<span class="dtrail-upd">Updated ' + esc(fmtD(CH.updated)) + '</span>' : '') + '</span><em class="cnt">' + CH.entries.length + '</em></div><div class="dtrail-list">' + citems + '</div></aside>';
  }
  v.innerHTML = head + '<div class="dtwrap"><div class="dtmain">' + stats + newCards + updHead + '<div class="asgrid">' + cards + '</div>' + checkedCard + '</div>' + rail + '</div></div>';
  dtAnimate();
}

/* ============================================================
   Photos on File (JD 2026-10-22): every profile's on-file Source
   links are checked for photos; each photo is QC'd from page
   context only (caption / alt text / roster / profile context —
   no facial recognition) and graded confirmed / likely /
   possible. People with no usable photo or no checkable source
   are listed too, so coverage is honest. Data: data/photos.json,
   written by the Photos on File batches; read-only here.
   ============================================================ */
var PH = null, PH_LOADING = false;
var PH_COLS = Math.min(12, Math.max(3, parseInt(store('ncc_photos_cols_v1') || '10', 10) || 10));
var PH_SORT = store('ncc_photos_sort_v1') || 'grade';
var PH_SDIR = store('ncc_photos_sdir_v1') === 'desc' ? -1 : 1;
var PH_FILT = store('ncc_photos_filter_v1') || 'all';
var PH_QUERY = '';
var PH_LIST = [];   /* photos-page entries in current display order (sections flattened) */
/* Audit F13: every photo write routes its cache upkeep through here —
   the name index is derived from PH and is rebuilt lazily after any
   write; key/order/hidden caches are updated by their write fns and
   re-derived from the bake on the next phLoad. */
function phInvalidate(){ PH_BY_NAME = null; }
function phLoad(){
  if(PH || PH_LOADING) return;
  PH_LOADING = true;
  fetch('data/photos.json', { cache:'no-cache' })
    .then(function(r){ if(!r.ok) throw new Error('none'); return r.json(); })
    .then(function(d){ PH = d; phInvalidate(); PH_LOADING = false; repaintForData('ph'); })
    .catch(function(){ PH = { empty:true }; PH_LOADING = false; repaintForData('ph'); });
}

/* ============================================================
   Correspondence (JD 2026-10-29): JD's iMessage threads from his
   own contents exports, baked by scripts/build_messages.py into
   data/messages.json, keyed by lowercase display name (the same
   lookup photos.json uses). messages.json is the storage
   repository: the profile Files section gains a Correspondence
   entry per person with a thread, and the window displays the
   thread's enriched narrative only (JD 2026-10-29) — the verbatim
   messages are never rendered. The exports do not mark group
   threads; mf.group carries the filing record's group-suspected
   flag and the window says so.
   ============================================================ */
var MSG = null, MSG_LOADING = false;
function msgLoad(){
  if(MSG || MSG_LOADING) return;
  MSG_LOADING = true;
  fetch('data/messages.json', { cache:'no-cache' })
    .then(function(r){ if(!r.ok) throw new Error('none'); return r.json(); })
    .then(function(d){ MSG = d; MSG_LOADING = false; repaintForData('msg'); })
    .catch(function(){ MSG = { empty:true }; MSG_LOADING = false; });
}
function msgFor(e){
  if(!MSG || !MSG.people) return null;
  return MSG.people[String(dispName(e)).toLowerCase()] || null;
}
var MSG_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var MSG_MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var MSG_DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function msgMonYr(dstr){ var p = String(dstr || '').split('-'); return p.length < 2 ? '' : MSG_MON[+p[1] - 1] + ' ' + p[0]; }
function msgSpan(mf){ var a = msgMonYr(mf.first), b = msgMonYr(mf.last); return a === b ? a : a + ' – ' + b; }
function msgDayLabel(dstr){
  var p = String(dstr || '').split('-').map(Number);
  if(p.length < 3) return String(dstr || '');
  return MSG_DAY[new Date(p[0], p[1] - 1, p[2]).getDay()] + ', ' + MSG_MONL[p[1] - 1] + ' ' + p[2] + ', ' + p[0];
}
function msgTimeLabel(ts){
  var t = String(ts || '').slice(11, 16).split(':');
  if(t.length < 2 || t[0] === '') return '';
  var h = +t[0], ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return h + ':' + t[1] + ' ' + ap;
}
function openCorrespondence(di){
  var e = D.directory[di], mf = msgFor(e); if(!mf) return;
  var name = dispName(e);
  /* Narrative only (JD 2026-10-29): the window shows the thread's
     filed report — the imessage-report events on the profile, in
     date order. The verbatim messages stay in messages.json as the
     storage repository and are never displayed. A thread with no
     narrative filed yet says so plainly. */
  var narr = (e.events || []).filter(function(ev){ return ev && ev.src === 'imessage-report' && ev.date; })
    .sort(function(a, b){ return (flexKey(a.date) || 0) - (flexKey(b.date) || 0); });
  var head = '<p class="dim msg-head">iMessage thread · ' + mf.n + ' messages · ' + esc(msgSpan(mf)) +
    (mf.group ? '<br><span class="msg-warn">This thread may include group messages, so the narrative is worded to hold either way.</span>' : '') + '</p>';
  var body = narr.length
    ? '<div class="tl msg-tl">' + narr.map(function(ev){
        return '<div class="ev"><i></i><time>' + esc(evDate(ev.date)) + '</time><b>' + esc(ev.summary || '') + '</b>' + (ev.detail ? '<p>' + esc(ev.detail) + '</p>' : '') + '</div>';
      }).join('') + '</div>'
    : '<p class="dim">No narrative has been filed for this thread yet. The raw thread (' + mf.n + ' messages) is held in storage.</p>';
  openSheet('Correspondence — ' + name, head + body, { wide:true, focus:false });
}

function phDiByName(name){
  var k = String(name || '').toLowerCase();
  return people().find(function(di){ return String(dispName(D.directory[di])).toLowerCase() === k; });
}
function phSyncPerson(name, rev, reason){
  var di = phDiByName(name); if(di === undefined) return;
  var e = D.directory[di], patch = {};
  if(rev !== null && rev !== undefined && String(gv(e, 'photo_review') || '') !== rev) patch.photo_review = rev;
  if(reason !== null && reason !== undefined && String(gv(e, 'photo_bad_reason') || '') !== reason) patch.photo_bad_reason = reason;
  if(Object.keys(patch).length) queuePatch(di, patch);
}
/* Photo verdicts persist server-side too (JD 2026-10-26): the baked
   photo_review / photo_bad_reason profile fields are the cross-device
   base; this browser's localStorage overlays them within the sync lag. */
function phReview(){
  var out = {};
  if(D) D.directory.forEach(function(e){ var v = String(gv(e, 'photo_review') || '').trim(); if(v) out[String(dispName(e)).toLowerCase()] = v; });
  try{ var loc = JSON.parse(store('ncc_photos_review_v1') || '{}') || {}; Object.keys(loc).forEach(function(k){ out[k] = loc[k]; }); }catch(x){}
  return out;
}
function phSetVerdict(name, val, reason){
  if(!name) return;
  var adv = null;
  if(S.route.name === 'audit' && S.audit && audMode() === 'photos'){
    var q0 = phaQueue(phaState().filter), i0 = q0.findIndex(function(p){ return p.name === name; });
    if(i0 >= 0) adv = (q0[i0 + 1] || q0[i0 - 1] || {}).name || null;
  }
  var loc = {}; try{ loc = JSON.parse(store('ncc_photos_review_v1') || '{}') || {}; }catch(x){}
  var k = String(name).toLowerCase();
  if(val) loc[k] = val; else delete loc[k];
  store('ncc_photos_review_v1', JSON.stringify(loc));
  var bm2 = {}; try{ bm2 = JSON.parse(store('ncc_photos_badreason_v1') || '{}') || {}; }catch(x){}
  if(reason !== undefined){ if(reason) bm2[k] = reason; else delete bm2[k]; store('ncc_photos_badreason_v1', JSON.stringify(bm2)); }
  else if(!val || val === 'confirmed'){ if(bm2[k]){ delete bm2[k]; store('ncc_photos_badreason_v1', JSON.stringify(bm2)); } reason = ''; }
  phSyncPerson(name, val || '', reason === undefined ? null : (reason || ''));
  if(S.route.name === 'photos') viewPhotos($('#view'));
  else if(S.route.name === 'audit' && S.audit && audMode() === 'photos'){ if(adv && val && val !== 'bad') phaState().cur = adv; viewAudit($('#view')); }
}
function phSetReview(name, val){ phSetVerdict(name, val, undefined); }

/* ---------- profile photos: framing store + hero + editor (JD 2026-10-22) ---------- */
var PH_BY_NAME = null;
function phIndex(){
  if(!PH || !PH.people) return null;
  if(!PH_BY_NAME){
    PH_BY_NAME = {};
    PH.people.forEach(function(p){ if(p.photo_url) PH_BY_NAME[p.name] = p; });
  }
  return PH_BY_NAME;
}
function phFrames(){
  try{ return JSON.parse(store('ncc_photos_frame_v1') || '{}') || {}; }catch(x){ return {}; }
}
function phFrameFor(name, p){
  p = p || (phIndex() || {})[name];
  var f = { z:1, x:50, y:22, url:null };
  if(p){
    if(p.focus){ var m = String(p.focus).match(/([\d.]+)%\s+([\d.]+)%/); if(m){ f.x = +m[1]; f.y = +m[2]; } }
    if(p.zoom) f.z = +p.zoom;
    f.url = p.photo_url;
  }
  var s = phFrames()[String(name).toLowerCase()];
  if(s){ if(s.z) f.z = +s.z; if(s.x != null) f.x = +s.x; if(s.y != null) f.y = +s.y; if(s.url) f.url = s.url; }
  var ku = phKeyMap()[String(name).toLowerCase()];
  if(ku && p && phAllPhotos(p).some(function(x){ return x.url === ku; })) f.url = ku;
  var hidF = phHiddenFor(name);
  if(hidF.length && p && hidF.indexOf(f.url) >= 0) f.url = phKeyUrl(p);
  return f;
}
var PH_KEY = null;   /* display name (lowercase) -> key photo url, from the baked primary_photo field */
function phKeyMap(){
  if(PH_KEY) return PH_KEY;
  PH_KEY = {};
  if(typeof D !== 'undefined' && D) D.directory.forEach(function(e){ var u = String(gv(e, 'primary_photo') || '').trim(); if(u) PH_KEY[String(dispName(e)).toLowerCase()] = u; });
  return PH_KEY;
}
var PH_ORDER = null;   /* display name (lowercase) -> [urls] from the baked photo_order field */
function phOrderMap(){
  if(PH_ORDER) return PH_ORDER;
  PH_ORDER = {};
  if(typeof D !== 'undefined' && D) D.directory.forEach(function(e){
    var raw = String(gv(e, 'photo_order') || '').trim();
    if(raw){ try{ var arr = JSON.parse(raw); if(Array.isArray(arr) && arr.length) PH_ORDER[String(dispName(e)).toLowerCase()] = arr; }catch(x){} }
  });
  return PH_ORDER;
}
var PH_HIDDEN = null;   /* display name (lowercase) -> [urls] removed in the photo editor */
function phHiddenMap(){
  if(PH_HIDDEN) return PH_HIDDEN;
  PH_HIDDEN = {};
  if(typeof D !== 'undefined' && D) D.directory.forEach(function(e){
    var raw = String(gv(e, 'photo_hidden') || '').trim();
    if(raw){ try{ var arr = JSON.parse(raw); if(Array.isArray(arr) && arr.length) PH_HIDDEN[String(dispName(e)).toLowerCase()] = arr; }catch(x){} }
  });
  return PH_HIDDEN;
}
function phHiddenFor(name){ return phHiddenMap()[String(name || '').toLowerCase()] || []; }
function phKeyUrl(p){
  if(!p || !p.photo_url) return p ? p.photo_url : null;
  var vis = phAllPhotos(p);
  if(!vis.length) return p.photo_url;
  var u = phKeyMap()[String(p.name).toLowerCase()];
  if(u && vis.some(function(x){ return x.url === u; })) return u;
  return vis[0].url;
}
function phApplyKey(name, url){
  var di = phDiOf(name); if(di == null) return false;
  txn('Set key photo', function(){ queuePatch(di, { primary_photo: url }); });
  phInvalidate();
  if(!PH_KEY) PH_KEY = {};
  PH_KEY[String(name).toLowerCase()] = url;
  var p = (phIndex() || {})[name];
  if(p){ var f = phFrameFor(name, p); phFrameSet(name, { z:f.z, x:f.x, y:f.y, url: url }); }
  return true;
}

function phFrameSet(name, fr){
  var all = phFrames();
  all[String(name).toLowerCase()] = { z:fr.z, x:Math.round(fr.x), y:Math.round(fr.y), url:fr.url || undefined };
  store('ncc_photos_frame_v1', JSON.stringify(all));
}
function phFrameStyle(p){
  var f = phFrameFor(p.name, p);
  return 'object-position:' + f.x + '% ' + f.y + '%;' + (f.z && f.z !== 1 ? 'transform-origin:' + f.x + '% ' + f.y + '%;transform:scale(' + f.z + ')' : '');
}
/* Glanceable photo currency (JD 2026-10-26): when the photo was
   added — exact date where the change log records it, otherwise the
   Photos on File census month. */
function phAddedLabel(p){
  if(!p || !p.photo_url) return '';
  if(p.added) return 'Added ' + fmtIsoD(p.added);
  if(p.added_approx) return 'Added ' + p.added_approx;
  return '';
}
var PH_NEW_DAYS = 21;
function phAddedTs(p){
  if(!p || !p.photo_url) return 0;
  if(p.added){ var t = Date.parse(p.added); if(!isNaN(t)) return t; }
  if(p.added_approx){ var t2 = Date.parse('1 ' + p.added_approx); if(!isNaN(t2)) return t2; }
  return 0;
}
function phIsNew(p){
  if(!p || !p.added || !p.photo_url) return false;
  var t = Date.parse(p.added); if(isNaN(t)) return false;
  return (Date.now() - t) <= PH_NEW_DAYS * 864e5 && t <= Date.now() + 864e5;
}
function phNewCount(all){ return all.filter(phIsNew).length; }
function phHeroHTML(e){
  var idx = phIndex(); if(!idx) return '';
  var p = idx[dispName(e)]; if(!p || !p.photo_url) return '';
  if(phReview()[String(p.name).toLowerCase()] === 'rejected') return '';
  phSwipeInit(); phKeysInit();
  var photos = phAllPhotos(p), key = String(p.name).toLowerCase();
  var cur = PH_HERO_IDX[key];
  if(cur == null){
    var f0 = phFrameFor(p.name, p), fu = f0.url || p.photo_url; cur = 0;
    photos.forEach(function(ph, i){ if(ph.url === fu) cur = i; });
    PH_HERO_IDX[key] = cur;
  }
  cur = Math.max(0, Math.min(photos.length - 1, cur));
  var nav = photos.length > 1 ? '<div class="hphoto-nav"><button type="button" data-act="heroph" data-d="-1" data-pname="' + esc(p.name) + '" aria-label="Previous photo">&lsaquo;</button>' +
    '<span class="phdots">' + photos.map(function(ph, i){ return '<button type="button" class="phdot' + (i === cur ? ' on' : '') + '" data-act="herodot" data-i="' + i + '" data-pname="' + esc(p.name) + '" aria-label="Photo ' + (i + 1) + '"></button>'; }).join('') + '</span>' +
    '<button type="button" data-act="heroph" data-d="1" data-pname="' + esc(p.name) + '" aria-label="Next photo">&rsaquo;</button></div>' : '';
  var verdict = '';
  if((p.status === 'possible' || p.status === 'likely') && phReview()[key] !== 'confirmed'){
    verdict = '<div class="hphoto-verdict"><span class="phbadge ' + (p.status === 'likely' ? 'lik' : 'poss') + '">' + p.status.toUpperCase() + ' — UNVALIDATED</span>' +
      '<button type="button" class="btn sm primary" data-act="phconfirm" data-pname="' + esc(p.name) + '">Validate</button>' +
      '<button type="button" class="btn sm ghost" data-act="phrejectq" data-pname="' + esc(p.name) + '">Reject</button></div>';
  }
  return '<div class="hphoto" data-pname="' + esc(p.name) + '"><span class="hphoto-box" data-act="phinsp" data-pname="' + esc(p.name) + '" role="button" tabindex="0" title="Open the photo inspector"><img src="' + esc(photos[cur].url) + '" alt="' + esc(p.name) + '" referrerpolicy="no-referrer" style="' + phFrameStyleFor(p, photos[cur].url) + '"></span>' +
    nav + '</div>' + verdict;
}
/* Framing editor core. Two mounts: the standalone overlay (Photo
   Audit's Adjust button) and in place of the photo inside the
   inspector (opts.mount). Framing itself is device-local
   (phFrameSet) — no Sheet write either way. */
function phEditor(name, opts){
  opts = opts || {};
  var idx = phIndex(); var p = idx && idx[name]; if(!p) return null;
  var photos = phAllPhotos(p, true);
  var urls = photos.map(function(x){ return x.url; });
  var f0 = phFrameFor(name, p);
  var cur = { z:f0.z, x:f0.x, y:f0.y, url:f0.url || p.photo_url };
  var startUrl = opts.startUrl || window.__phedStart;
  if(startUrl){ window.__phedStart = null; if(urls.indexOf(startUrl) >= 0 && startUrl !== cur.url) cur = { z:1, x:50, y:22, url:startUrl }; }
  var inner = '<div class="phed-stage"><img draggable="false" referrerpolicy="no-referrer" alt=""></div>' +
    '<div class="phed-ctl"><label class="phed-zoom">Zoom <input type="range" min="1" max="3" step="0.01"></label>' +
    (urls.length > 1 ? '<div class="phed-thumbs">' + urls.map(function(u, i){ return '<button type="button" data-u="' + esc(u) + '">Photo ' + (i + 1) + '</button>'; }).join('') + '</div>' : '') +
    '<p class="dim">Drag the photo to pan it. Your framing saves on this device and applies in the profile header and the Photos section.</p>' +
    '<div class="row end"><button type="button" class="btn ghost" data-reset>Reset</button><span class="sp"></span><button type="button" class="btn" data-cancel>Cancel</button><button type="button" class="btn primary" data-save>Save framing</button></div></div>';
  var root, ov = null;
  if(opts.mount){ root = opts.mount; root.innerHTML = inner; }
  else {
    ov = document.createElement('div');
    ov.className = 'phed-wrap';
    ov.innerHTML = '<div class="phed"><header><h3>Photo \u2014 ' + esc(name) + '</h3><button type="button" class="ib" data-x aria-label="Close">' + ic('x', 18) + '</button></header>' + inner + '</div>';
    document.body.appendChild(ov);
    document.body.classList.add('sheet-open');
    root = ov;
  }
  var img = root.querySelector('.phed-stage img'), stage = root.querySelector('.phed-stage'), rng = root.querySelector('input[type=range]');
  function apply(){
    img.src = cur.url;
    img.style.objectPosition = cur.x + '% ' + cur.y + '%';
    img.style.transformOrigin = cur.x + '% ' + cur.y + '%';
    img.style.transform = 'scale(' + cur.z + ')';
    rng.value = cur.z;
    root.querySelectorAll('.phed-thumbs button').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-u') === cur.url); });
  }
  rng.addEventListener('input', function(){ cur.z = +rng.value; apply(); });
  root.querySelectorAll('.phed-thumbs button').forEach(function(b){ b.addEventListener('click', function(){ cur.url = b.getAttribute('data-u'); apply(); }); });
  var drag = null;
  stage.addEventListener('pointerdown', function(ev){ drag = { x:ev.clientX, y:ev.clientY, fx:cur.x, fy:cur.y }; stage.setPointerCapture(ev.pointerId); });
  stage.addEventListener('pointermove', function(ev){
    if(!drag) return;
    var r = stage.getBoundingClientRect();
    cur.x = Math.min(100, Math.max(0, drag.fx - (ev.clientX - drag.x) / r.width * 100));
    cur.y = Math.min(100, Math.max(0, drag.fy - (ev.clientY - drag.y) / r.height * 100));
    apply();
  });
  stage.addEventListener('pointerup', function(){ drag = null; });
  var _pfEd = document.activeElement;
  function close(saved){
    if(ov){ ov.remove(); document.body.classList.remove('sheet-open'); if(_pfEd && _pfEd.focus) _pfEd.focus(); }
    if(opts.done) opts.done(saved);
  }
  if(ov){
    ov.querySelector('[data-x]').addEventListener('click', function(){ close(false); });
    ov.addEventListener('click', function(ev){ if(ev.target === ov) close(false); });
    var _xbEd = root.querySelector('[data-cancel]'); if(_xbEd) _xbEd.focus();
  }
  root.querySelector('[data-cancel]').addEventListener('click', function(){ close(false); });
  root.querySelector('[data-reset]').addEventListener('click', function(){ cur = { z:(p.zoom || 1), x:50, y:22, url:p.photo_url }; if(p.focus){ var m = String(p.focus).match(/([\d.]+)%\s+([\d.]+)%/); if(m){ cur.x = +m[1]; cur.y = +m[2]; } } apply(); });
  root.querySelector('[data-save]').addEventListener('click', function(){
    phFrameSet(name, cur); close(true);
    if(!opts.mount){
      if($('#p-hero')) repaintTop();
      if(S.route.name === 'photos') viewPhotos($('#view'));
    }
  });
  apply();
  return { close:function(){ close(false); } };
}

/* ============================================================
   Photo Audit (JD 2026-10-22): a dedicated Audit mode — the
   review desk. The Photos page is view-only; every verdict
   (confirm / bad photo / reject / undo) lives here, in a
   purpose-built three-column desk: queue, stage, details.
   ============================================================ */
function phaState(){ var A = S.audit; if(!A) return { filter:'todo', cur:null }; if(!A.pha) A.pha = { filter:'todo', cur:null }; return A.pha; }
function phaAll(){ if(!PH || !PH.people) return []; return PH.people.filter(function(p){ return p.photo_url && (p.status === 'confirmed' || p.status === 'likely' || p.status === 'possible'); }); }
function phaRev(p){ return phReview()[String(p.name || '').toLowerCase()] || ''; }
function phaCounts(){
  var c = { todo:0, confirmed:0, bad:0, rejected:0, possible:0 };
  phaAll().forEach(function(p){ var r = phaRev(p); if(r === 'confirmed') c.confirmed++; else if(r === 'bad') c.bad++; else if(r === 'rejected') c.rejected++; else c.todo++; if(p.status === 'possible' && r !== 'rejected') c.possible++; });
  return c;
}
function phaQueue(f){
  var all = phaAll(), rank = { possible:0, likely:1, confirmed:2 }, q;
  if(f === 'possible') q = all.filter(function(p){ return p.status === 'possible' && phaRev(p) !== 'rejected'; });
  else if(f === 'bad') q = all.filter(function(p){ return phaRev(p) === 'bad'; });
  else if(f === 'rejected') q = (PH ? PH.people : []).filter(function(p){ return p.photo_url && phaRev(p) === 'rejected'; });
  else if(f === 'confirmed') q = all.filter(function(p){ return phaRev(p) === 'confirmed'; });
  else if(f === 'all') q = all.slice();
  else q = all.filter(function(p){ return !phaRev(p); });
  q.sort(function(a, b){ return (rank[a.status] - rank[b.status]) || a.name.localeCompare(b.name); });
  return q;
}
/* Verdict taxonomy (JD 2026-10-28): a plain "Reject" taught the
   system nothing. Every negative verdict now carries WHY, and the
   why decides what happens next —
   · Wrong person: the candidate is discarded, the hunt for a real
     photo of them continues.
   · No person (pet / object / landscape / empty scene): the lead
     is a dead end, recorded on the profile so future sweeps know
     this person has no photo from that lead and never re-serve it.
   · Bad photo: it IS them, just unusable (younger / group / blurry)
     — keep looking for a better one.
   Reasons persist through photo_bad_reason exactly like the bad
   reasons always have. */
var PHA_REASONS = [ ['younger', 'Younger photo'], ['group', 'Group shot'], ['blurry', 'Blurry / low quality'], ['other', 'Other'] ];
var PHA_REJ_REASONS = [ ['wrong-person', 'Wrong person'], ['no-person', 'No person in it'], ['pet', 'Pet'], ['object', 'Object / logo'], ['landscape', 'Landscape / scene'] ];
function phBadReasons(){
  var out = {};
  if(D) D.directory.forEach(function(e){ var v = String(gv(e, 'photo_bad_reason') || '').trim(); if(v) out[String(dispName(e)).toLowerCase()] = v; });
  try{ var loc = JSON.parse(store('ncc_photos_badreason_v1') || '{}') || {}; Object.keys(loc).forEach(function(k){ out[k] = loc[k]; }); }catch(x){}
  return out;
}
function phBadReason(name){ return phBadReasons()[String(name || '').toLowerCase()] || ''; }
function phReasonLabel(r){ var all = PHA_REASONS.concat(PHA_REJ_REASONS); for(var i = 0; i < all.length; i++) if(all[i][0] === r) return all[i][1]; return ''; }
function phIsNoPerson(r){ return r === 'no-person' || r === 'pet' || r === 'object' || r === 'landscape'; }
function phSetBadReason(name, r){
  var m = {}; try{ m = JSON.parse(store('ncc_photos_badreason_v1') || '{}') || {}; }catch(x){}
  var k = String(name).toLowerCase();
  if(r) m[k] = r; else delete m[k];
  store('ncc_photos_badreason_v1', JSON.stringify(m));
  phSyncPerson(name, null, r || '');
  phaRender();
}
function phClearVerdict(name){
  var k = String(name).toLowerCase();
  var loc = {}; try{ loc = JSON.parse(store('ncc_photos_review_v1') || '{}') || {}; }catch(x){}
  delete loc[k]; store('ncc_photos_review_v1', JSON.stringify(loc));
  var m = {}; try{ m = JSON.parse(store('ncc_photos_badreason_v1') || '{}') || {}; }catch(x){}
  if(m[k]){ delete m[k]; store('ncc_photos_badreason_v1', JSON.stringify(m)); }
  phSyncPerson(name, '', '');
  phaState().cur = name;
  viewAudit($('#view'));
}
function phaRender(){
  var w = $('#phawrap'); if(!w) return;
  phLoad();
  if(!PH){ w.innerHTML = '<p class="dim">Loading photo data&hellip;</p>'; return; }
  if(PH.empty || !PH.people){ w.innerHTML = '<p class="dim">No photo data yet.</p>'; return; }
  var st = phaState(), c = phaCounts();
  var filters = [ ['todo', 'To review', c.todo], ['possible', 'Possible grade', c.possible], ['bad', 'Bad photo', c.bad], ['confirmed', 'Confirmed', c.confirmed], ['rejected', 'Rejected', c.rejected], ['all', 'All photos', phaAll().length] ];
  var q = phaQueue(st.filter);
  var idx = q.findIndex(function(p){ return p.name === st.cur; });
  var p = idx >= 0 ? q[idx] : null;
  if(!p && st.cur){ var ap = phaAll().filter(function(x){ return x.name === st.cur; })[0]; if(ap) p = ap; }
  if(!p && q.length){ st.cur = q[0].name; p = q[0]; idx = 0; }
  var chips = filters.map(function(f){ return '<button type="button" class="pha-chip' + (st.filter === f[0] ? ' on' : '') + '" data-act="phafilter" data-f="' + f[0] + '">' + f[1] + ' <b>' + f[2] + '</b></button>'; }).join('');
  var list = q.map(function(x){ var r = phaRev(x); var tag = r === 'bad' ? 'BAD' + (phBadReason(x.name) ? ' · ' + phBadReason(x.name).toUpperCase() : '') : r === 'confirmed' ? 'OK' : r === 'rejected' ? 'REJ' + (phBadReason(x.name) ? ' · ' + phBadReason(x.name).toUpperCase() : '') : x.status === 'confirmed' ? 'C' : x.status === 'likely' ? 'L' : 'P'; return '<button type="button" class="pha-item' + (p && x.name === p.name ? ' on' : '') + '" data-act="phacur" data-pname="' + esc(x.name) + '"><span>' + esc(x.name) + '</span><em>' + tag + '</em></button>'; }).join('');
  var view, main;
  if(p){
    var di = BYN[String(p.name).toLowerCase()]; if(di == null) di = null;
    var e = di != null ? D.directory[di] : null;
    var rev = phaRev(p);
    var reason = phBadReason(p.name);
    var badge = rev === 'bad' ? '<span class="phbadge bad">BAD PHOTO' + (reason ? ' — ' + esc(phReasonLabel(reason)).toUpperCase() : '') + '</span>' : rev === 'confirmed' ? '<span class="phbadge conf">CONFIRMED BY YOU</span>' : rev === 'rejected' ? '<span class="phbadge poss">REJECTED' + (reason ? ' — ' + esc(phReasonLabel(reason)).toUpperCase() : '') + '</span>' : p.status === 'confirmed' ? '<span class="phbadge conf">CONFIRMED</span>' : p.status === 'likely' ? '<span class="phbadge lik">LIKELY</span>' : '<span class="phbadge poss">POSSIBLE</span>';
    var curUrl = phFrameFor(p.name, p).url || p.photo_url;
    var thumbs = (p.also && p.also.length) ? '<div class="pha-alts">' + [p.photo_url].concat(p.also.map(function(a){ return a.url; })).map(function(u){ return '<button type="button" class="pha-alt' + (u === curUrl ? ' on' : '') + '" data-act="phaalt" data-pname="' + esc(p.name) + '" data-u="' + esc(u) + '"><img src="' + esc(u) + '" alt="" loading="lazy" referrerpolicy="no-referrer"></button>'; }).join('') + '</div>' : '';
    view = '<div class="pha-view"><span class="phimg pha-img"><img src="' + esc(curUrl) + '" alt="' + esc(p.name) + '" referrerpolicy="no-referrer" style="' + phFrameStyle(p) + '"><span class="phthirds on"></span></span>' + thumbs +
      '<div class="pha-name">' + (e ? '<a href="#/p/' + encodeURIComponent(personId(e)) + '" data-act="openp" data-di="' + di + '"><b>' + esc(p.name) + '</b></a>' : '<b>' + esc(p.name) + '</b>') + (e ? milBadge(e) : '') + badge + (e ? audXHTML(di) : '') + '</div>' +
      '<div class="pha-pos">' + (idx >= 0 ? '<span class="ahn-s">' + (idx + 1) + ' of ' + q.length + '</span> in this queue' : 'Outside this queue') + ' &middot; ' + esc(p.type || 'photo') + '</div>' +
      '<p class="ph-ev">' + esc(p.evidence || '') + '</p>' +
      (p.source_page ? '<p><a class="assrc" href="' + esc(p.source_page) + '" target="_blank" rel="noopener">Source page ' + ic('ext', 11) + '</a></p>' : '') +
      '</div>';
    var stateLine = rev === 'confirmed' ? '<span class="phok">' + ic('check', 14) + ' Confirmed by you</span>'
      : rev === 'bad' ? '<span class="phok bad">Bad photo &mdash; it is them, but unusable. Keep looking for a better one.</span>'
      : rev === 'rejected' && reason === 'wrong-person' ? '<span class="phok bad">Wrong person &mdash; discarded. We keep looking for a real photo of them.</span>'
      : rev === 'rejected' && phIsNoPerson(reason) ? '<span class="phok bad">Not a photo of them &mdash; noted on their record. They stay on the needs-photo list and this lead won&rsquo;t be served again.</span>'
      : rev === 'rejected' ? '<span class="phok bad">Rejected by you</span>'
      : '<span class="dim">No verdict yet</span>';
    var reasonRow = rev === 'bad' ? '<div class="pha-reasons"><span class="pha-rlabel">Why bad:</span>' + PHA_REASONS.map(function(r){ return '<button type="button" class="pha-rchip' + (reason === r[0] ? ' on' : '') + '" data-act="phareason" data-pname="' + esc(p.name) + '" data-r="' + r[0] + '">' + r[1] + '</button>'; }).join('') + '</div>'
      : rev === 'rejected' ? '<div class="pha-reasons"><span class="pha-rlabel">Why rejected:</span>' + PHA_REJ_REASONS.map(function(r){ return '<button type="button" class="pha-rchip' + (reason === r[0] ? ' on' : '') + '" data-act="phareason" data-pname="' + esc(p.name) + '" data-r="' + r[0] + '">' + r[1] + '</button>'; }).join('') + '</div>' : '';
    var controls = '<div class="pha-controls">' +
      '<div class="pha-crow">' + stateLine + '<span class="sp"></span>' +
      '<button type="button" class="btn ghost sm" data-act="phanav" data-d="-1">&larr; Prev</button>' +
      '<button type="button" class="btn ghost sm" data-act="phanav" data-d="1">Skip &rarr;</button></div>' +
      '<div class="pha-crow big">' +
      '<button type="button" class="btn primary pha-big" data-act="phconfirm" data-pname="' + esc(p.name) + '">' + ic('check', 15) + ' Confirm</button>' +
      '<button type="button" class="btn pha-big' + (rev === 'rejected' && reason === 'wrong-person' ? ' onbad' : '') + '" data-act="phwrong" data-pname="' + esc(p.name) + '">Wrong person</button>' +
      '<button type="button" class="btn pha-big' + (rev === 'bad' ? ' onbad' : '') + '" data-act="phbad" data-pname="' + esc(p.name) + '">Bad photo</button>' +
      '<button type="button" class="btn ghost pha-big' + (rev === 'rejected' && phIsNoPerson(reason) ? ' onbad' : '') + '" data-act="phnoperson" data-pname="' + esc(p.name) + '">No person</button></div>' +
      reasonRow +
      '<div class="pha-crow">' +
      (rev ? '<button type="button" class="btn ghost sm" data-act="phareaudit" data-pname="' + esc(p.name) + '">Re-audit</button><button type="button" class="btn ghost sm" data-act="phundo" data-pname="' + esc(p.name) + '">Undo verdict</button>' : '') +
      '<button type="button" class="btn ghost sm" data-act="phadjust" data-pname="' + esc(p.name) + '">Adjust photo</button>' +
      (e ? '<a class="btn ghost sm" href="#/p/' + encodeURIComponent(personId(e)) + '" data-act="openp" data-di="' + di + '">Open profile</a>' : '') +
      '</div></div>';
    main = '<div class="pha-main"><div class="pha-chips">' + chips + '</div>' + controls + '<div class="pha-qgrid">' + (list || '<p class="dim">Queue is empty.</p>') + '</div></div>';
  } else {
    view = '<div class="pha-view"><div class="pha-none">' + ic('check', 30) + '<p>This queue is clear.</p></div></div>';
    main = '<div class="pha-main"><div class="pha-chips">' + chips + '</div><div class="pha-qgrid"><p class="dim">Nothing here. Pick another queue above.</p></div></div>';
  }
  w.innerHTML = '<div class="pha">' + view + main + '</div>';
  phaKeys();
}
function phaNav(d){
  var st = phaState(), q = phaQueue(st.filter); if(!q.length) return;
  var i = q.findIndex(function(p){ return p.name === st.cur; });
  i = Math.min(q.length - 1, Math.max(0, (i < 0 ? 0 : i) + d));
  st.cur = q[i].name; phaRender();
}
function phaKeys(){
  if(window.__phaKeys) return; window.__phaKeys = true;
  document.addEventListener('keydown', function(ev){
    if(S.route.name !== 'audit' || !S.audit || audMode() !== 'photos') return;
    var t = ev.target; if(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if(document.body.classList.contains('sheet-open')) return;
    var st = phaState(); if(!st.cur) return;
    var k = ev.key;
    if(k === 'ArrowRight'){ phaNav(1); ev.preventDefault(); }
    else if(k === 'ArrowLeft'){ phaNav(-1); ev.preventDefault(); }
    else if(k === 'c' || k === 'C') phSetReview(st.cur, 'confirmed');
    else if(k === 'b' || k === 'B') phSetReview(st.cur, 'bad');
    else if(k === 'w' || k === 'W') phSetVerdict(st.cur, 'rejected', 'wrong-person');
    else if(k === 'n' || k === 'N') phSetVerdict(st.cur, 'rejected', 'no-person');
    else if(k === 'x' || k === 'X') phSetVerdict(st.cur, 'rejected', 'wrong-person');
    else if(k === 'u' || k === 'U') phSetReview(st.cur, null);
    else if(k === 'a' || k === 'A') phEditor(st.cur);
    else if(k >= '1' && k <= '7'){ var cp = (phIndex() || {})[st.cur]; if(cp){ var rv = phaRev(cp); var lst = rv === 'bad' ? PHA_REASONS : rv === 'rejected' ? PHA_REJ_REASONS : null; if(lst && lst[+k - 1]) phSetBadReason(st.cur, lst[+k - 1][0]); } }
  });
}

/* ============================================================
   Photos page (rework, JD 2026-10-22): the grid IS the page.
   JD's complaints about the old layout: a viewer pinned in the
   header whether you wanted it or not, navigation that made no
   sense, and a sort that reordered without explaining itself.
   Now: everything renders (no chunking, no Show more — lazy
   images + content-visibility carry the weight), the sort
   SECTIONS the grid under labeled headers with counts, a left
   rail filters by counted buckets, and clicking a card opens
   the photo inspector (JD 2026-10-27) in a pop-up that leaves
   the grid and its exact scroll position untouched. Reviewing
   still lives in Photo Audit.
   ============================================================ */
function phDiOf(name){ var di = BYN[String(name || '').toLowerCase()]; return di == null ? null : di; }
function phEntryOf(p){ var di = phDiOf(p.name); return di != null ? D.directory[di] : null; }
function phRevOf(p){ return phReview()[String(p.name || '').toLowerCase()] || ''; }
/* The Possible queue (JD 2026-10-29): every photo whose identity is only
   suspected — graded possible or likely at filing — and not yet ruled on
   by JD. These live in the Possible photos section on the Photos page
   (and as a verdict bar on the profile) until he validates or rejects. */
function phSuspects(){
  if(!PH || !PH.people) return [];
  return PH.people.filter(function(p){
    if(!p.photo_url || (p.status !== 'possible' && p.status !== 'likely')) return false;
    var r = phRevOf(p);
    return r !== 'confirmed' && r !== 'rejected';
  });
}
function phHasPhoto(p){ return !!p.photo_url && phRevOf(p) !== 'rejected' && phAllPhotos(p).length > 0; }
function phStartYearOf(p){ var e = phEntryOf(p); return e ? knownSinceYear(e) : 0; }
function phYearsCountOf(p){ var y = phStartYearOf(p); return y ? new Date().getFullYear() - y : -1; }
function phOrgOf(p){ var e = phEntryOf(p); if(!e) return ''; var o = orgsOf(e); return o.length ? regApply(o[0]) : ''; }
function phTakenOf(o){ return (o && (o.taken || o.source_date || o.photo_date)) || null; }
function phAllPhotos(p, raw){
  if(!p || !p.photo_url) return [];
  var list = [{url: p.photo_url, note: '', sp: p.source_page || null, taken: phTakenOf(p)}];
  (p.also || []).forEach(function(a){ if(a && a.url) list.push({url: a.url, note: a.note || '', sp: a.source_page || null, taken: phTakenOf(a)}); });
  var ord = phOrderMap()[String(p.name || '').toLowerCase()];
  if(ord && ord.length){
    var pos = {}; ord.forEach(function(u, i){ pos[u] = i; });
    list = list.map(function(x, i){ return { x:x, i:i }; })
      .sort(function(a, b){ var pa = pos[a.x.url] != null ? pos[a.x.url] : 1000 + a.i, pb = pos[b.x.url] != null ? pos[b.x.url] : 1000 + b.i; return pa - pb; })
      .map(function(w){ return w.x; });
  }
  if(!raw){ var hid = phHiddenFor(p.name); if(hid.length) list = list.filter(function(x){ return hid.indexOf(x.url) < 0; }); }
  return list;
}
function phFrameStyleFor(p, url){
  var f = phFrameFor(p.name, p);
  if((f.url || p.photo_url) === url) return 'object-position:' + f.x + '% ' + f.y + '%;transform-origin:' + f.x + '% ' + f.y + '%;transform:scale(' + f.z + ')';
  return 'object-position:50% 22%;';
}
var PH_HERO_IDX = {};
function phHeroPaint(name){
  var idx = phIndex(); var p = idx && idx[name]; if(!p) return;
  var photos = phAllPhotos(p); if(photos.length < 2) return;
  var cur = Math.max(0, Math.min(photos.length - 1, PH_HERO_IDX[String(p.name).toLowerCase()] || 0));
  document.querySelectorAll('.hphoto').forEach(function(el){
    if(el.getAttribute('data-pname') !== p.name) return;
    var img = el.querySelector('.hphoto-box img');
    if(img){ img.src = photos[cur].url; img.setAttribute('style', phFrameStyleFor(p, photos[cur].url)); }
    el.querySelectorAll('.phdot').forEach(function(d, i){ d.classList.toggle('on', i === cur); });
  });
}
function phHeroStep(name, d){
  var idx = phIndex(); var p = idx && idx[name]; if(!p) return;
  var n = phAllPhotos(p).length; if(n < 2) return;
  var key = String(p.name).toLowerCase();
  PH_HERO_IDX[key] = ((PH_HERO_IDX[key] || 0) + d + n) % n;
  phHeroPaint(name);
}
function phSwipeInit(){
  if(window.__phSwipe) return; window.__phSwipe = true;
  var sx = null, sy = null, tgt = null;
  document.addEventListener('touchstart', function(ev){
    if(!ev.touches || ev.touches.length !== 1) return;
    var t = ev.target; if(!t || !t.closest) return;
    if(t.closest('.hphoto-box')) tgt = 'hero';
    else if(t.closest('.phi-stage')) tgt = 'viewer';
    else return;
    sx = ev.touches[0].clientX; sy = ev.touches[0].clientY;
  }, {passive: true});
  document.addEventListener('touchend', function(ev){
    if(sx == null || !tgt) return;
    var c = ev.changedTouches && ev.changedTouches[0];
    var kind = tgt, x0 = sx, y0 = sy; sx = null; sy = null; tgt = null;
    if(!c) return;
    var dx = c.clientX - x0, dy = c.clientY - y0;
    if(Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if(kind === 'hero'){
      var h = document.querySelector('.hphoto');
      if(h) phHeroStep(h.getAttribute('data-pname'), dx < 0 ? 1 : -1);
    } else phiStep(dx < 0 ? 1 : -1);
  }, {passive: true});
}
function phKeysInit(){
  if(window.__phKeys) return; window.__phKeys = true;
  document.addEventListener('keydown', function(ev){
    var t = ev.target; if(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if(PHI){
      if(document.querySelector('.phed-wrap')) return;   /* standalone framing editor sits above everything */
      if(ev.key === 'Escape'){ if(PHI.adj && PHI.adjClose) PHI.adjClose(); else phInspClose(); ev.preventDefault(); return; }
      if(PHI.adj) return;
      if(ev.key === 'ArrowRight'){ phiStep(1); ev.preventDefault(); }
      else if(ev.key === 'ArrowLeft'){ phiStep(-1); ev.preventDefault(); }
      return;
    }
    if(ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    if(S.route.name === 'profile' && !document.body.classList.contains('sheet-open')){
      var h = document.querySelector('.hphoto');
      if(h){ phHeroStep(h.getAttribute('data-pname'), ev.key === 'ArrowRight' ? 1 : -1); ev.preventDefault(); }
    }
  });
}
function phAllEntries(){
  /* the checked set from photos.json, plus anyone in the directory the
     batches have not reached yet (status 'unchecked') so the page
     covers the whole directory, not just the checked slice */
  var out = [], seen = {};
  (PH.people || []).forEach(function(p){ out.push(p); seen[String(p.name || '').toLowerCase()] = 1; });
  people().forEach(function(di){
    var nm = dispName(D.directory[di]);
    if(nm && !seen[nm.toLowerCase()]) out.push({ name:nm, status:'unchecked', photo_url:null, evidence:'', source_page:null, type:null, also:[] });
  });
  return out;
}
function phTopOrgs(all){
  var c = {};
  all.forEach(function(p){ var o = phOrgOf(p); if(o) c[o] = (c[o] || 0) + 1; });
  return Object.keys(c).map(function(o){ return { name:o, n:c[o] }; }).sort(function(a, b){ return b.n - a.n || a.name.localeCompare(b.name); }).slice(0, 8);
}
function phFiltered(all){
  return all.filter(function(p){
    if(PH_FILT === 'photo' && !phHasPhoto(p)) return false;
    if(PH_FILT === 'new' && !phIsNew(p)) return false;
    if(PH_FILT === 'multi' && phAllPhotos(p).length < 2) return false;
    if(PH_FILT === 'nophoto' && phHasPhoto(p)) return false;
    if(PH_FILT.indexOf('tier:') === 0){ var e = phEntryOf(p); if((e ? tierOf(e) : '') !== PH_FILT.slice(5)) return false; }
    if(PH_FILT.indexOf('org:') === 0 && phOrgOf(p) !== PH_FILT.slice(4)) return false;
    if(PH_QUERY && String(p.name).toLowerCase().indexOf(PH_QUERY.trim().toLowerCase()) < 0) return false;
    return true;
  });
}
function phGradeRank(p){
  if(!phHasPhoto(p)) return 3;
  if(phRevOf(p) === 'confirmed') return 0;
  var gr = { confirmed:0, likely:1, possible:2 };
  return gr[p.status] != null ? gr[p.status] : 2;
}
function phGradeLabel(p){
  if(!phHasPhoto(p)) return 'No photo';
  if(phRevOf(p) === 'confirmed' || p.status === 'confirmed') return 'Confirmed';
  return p.status === 'likely' ? 'Likely' : 'Possible';
}
function phSortList(list){
  list.sort(function(a, b){
    var c = 0;
    if(PH_SORT === 'name') c = a.name.localeCompare(b.name);
    else if(PH_SORT === 'org'){ var oa = phOrgOf(a), ob = phOrgOf(b); c = ((oa === '' ? 1 : 0) - (ob === '' ? 1 : 0)) || oa.localeCompare(ob) || a.name.localeCompare(b.name); }
    else if(PH_SORT === 'years') c = (phYearsCountOf(b) - phYearsCountOf(a)) || a.name.localeCompare(b.name);
    else if(PH_SORT === 'newest') c = (phAddedTs(b) - phAddedTs(a)) || a.name.localeCompare(b.name);
    else if(PH_SORT === 'tier'){ var tr = { vetted:0, associate:1, open:2 }; var ea = phEntryOf(a), eb = phEntryOf(b); var ta = tr[ea ? tierOf(ea) : ''], tb = tr[eb ? tierOf(eb) : '']; c = ((ta == null ? 3 : ta) - (tb == null ? 3 : tb)) || a.name.localeCompare(b.name); }
    else c = (phGradeRank(a) - phGradeRank(b)) || a.name.localeCompare(b.name);
    return PH_SDIR < 0 ? -c : c;
  });
  return list;
}
function phSections(list){
  /* group the sorted list into labeled sections so the sort explains
     itself; section order falls out of the sort (direction included) */
  var secs = [], map = {};
  function sec(label){
    if(!map[label]){ map[label] = { label:label, items:[] }; secs.push(map[label]); }
    return map[label];
  }
  list.forEach(function(p){
    var label = '';
    if(PH_SORT === 'org') label = phOrgOf(p) || 'No organization';
    else if(PH_SORT === 'years'){ var y = phStartYearOf(p); label = y ? (Math.floor(y / 10) * 10) + 's' : 'Unknown'; }
    else if(PH_SORT === 'tier'){ var e = phEntryOf(p), t = e ? tierOf(e) : ''; label = t ? TIERS[t].n : 'No tier'; }
    else if(PH_SORT === 'grade') label = phGradeLabel(p);
    else if(PH_SORT === 'newest') label = p.added ? fmtIsoD(p.added) : (p.added_approx ? 'Added ' + p.added_approx : 'No date recorded');
    if(PH_SORT === 'name'){ if(!secs.length) sec(''); secs[0].items.push(p); }
    else sec(label).items.push(p);
  });
  return secs;
}
function phCard(p){
  var sel = PHI && PHI.name.toLowerCase() === String(p.name).toLowerCase();
  /* V3.13.0: same single-surface design as the Home wall — the photo
     fills the card, the rounded corners clip the image, and the name
     is a caption scrim on the photo, not a separate bar under it. */
  if(phHasPhoto(p)){
    return '<section class="card phcard' + (sel ? ' sel' : '') + '" data-act="phsel" data-pname="' + esc(p.name) + '" title="' + esc(p.name) + '"><span class="phimg"><img src="' + esc(phFrameFor(p.name, p).url || p.photo_url) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" style="' + phFrameStyle(p) + '"><span class="phthirds"></span></span>' +
      '<div class="phnm"><b>' + esc(p.name) + '</b>' + milBadgeName(p.name) + '</div></section>';
  }
  return '<section class="card phcard noph' + (sel ? ' sel' : '') + '" data-act="phsel" data-pname="' + esc(p.name) + '" title="' + esc(p.name) + '"><span class="phimg phnoimg">' + ic('camera', 22) + '<em>NO PHOTO</em></span>' +
    '<div class="phnm"><b>' + esc(p.name) + '</b>' + milBadgeName(p.name) + '</div></section>';
}
function phPaintList(){
  var box = $('#phlist'); if(!box || !PH || !PH.people) return;
  var list = phSortList(phFiltered(phAllEntries()));
  PH_LIST = list;
  var cnt = $('#phcount');
  if(cnt) cnt.innerHTML = '<b>' + list.length + '</b> ' + (list.length === 1 ? 'person' : 'people') + ' &middot; <b>' + list.filter(phHasPhoto).length + '</b> with photos';
  $$('#view [data-act="phfilt"]').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-f') === PH_FILT); });
  $$('#view [data-act="phsort"]').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-s') === PH_SORT); });
  $$('#view [data-act="phcols"]').forEach(function(b){ b.classList.toggle('on', +b.getAttribute('data-n') === PH_COLS); });
  var sd = $('#phsdirbtn'); if(sd) sd.innerHTML = PH_SDIR < 0 ? '&darr;' : '&uarr;';
  if(!list.length){ box.innerHTML = '<section class="card"><div class="cbody"><p class="dim">Nobody matches this filter.</p></div></section>'; return; }
  box.innerHTML = phSections(list).map(function(s){
    var withPh = s.items.filter(phHasPhoto).length;
    var head = s.label ? '<div class="phsec-h"><h3>' + esc(s.label) + '</h3><span>' + s.items.length + (s.items.length === 1 ? ' person' : ' people') + (withPh < s.items.length ? ' &middot; ' + withPh + ' with photos' : '') + '</span></div>' : '';
    return head + '<div class="phgrid' + (PH_COLS >= 8 ? ' dense' : '') + '" style="--phcols:' + PH_COLS + '">' + s.items.map(phCard).join('') + '</div>';
  }).join('');
  phMarkSel();
}
function phMarkSel(){
  $$('.phcard').forEach(function(c){
    c.classList.toggle('sel', !!PHI && (c.getAttribute('data-pname') || '').toLowerCase() === PHI.name.toLowerCase());
  });
}

/* ============================================================
   Photo inspector (JD 2026-10-27): ONE pop-up for every photo
   surface. Clicking any photo — Photos grid, profile hero,
   Home wall — opens the same centered inspector: the photo
   large on the left, everything known about it plus every tool
   (key / reorder / adjust / remove / restore) in the panel on
   the right, and a filmstrip along the bottom. This replaces
   the V2.51 slide-over viewer and the separate photo manager;
   the normal views now show the photo and the name only. All
   writes keep the existing Sheet paths: primary_photo (BE),
   photo_order (BF), photo_hidden (BG). Esc, the backdrop, or
   Done closes it; focus returns to whatever opened it.
   ============================================================ */
var PHI = null;   /* {name, vis:[photo], idx, showHidden, viewHid:url|null, confirmDel, dirty, adj, adjClose, prevFocus} */
function phiEntry(name){ return (phIndex() || {})[name] || null; }
function phiHidden(name){
  var p = phiEntry(name); if(!p) return [];
  var hid = phHiddenFor(name);
  return phAllPhotos(p, true).filter(function(x){ return hid.indexOf(x.url) >= 0; });
}
function phiCur(){
  if(!PHI) return null;
  if(PHI.viewHid){
    var h = phiHidden(PHI.name).filter(function(x){ return x.url === PHI.viewHid; })[0];
    if(h) return h;
    PHI.viewHid = null;
  }
  return PHI.vis[PHI.idx] || null;
}
function phInspOpen(name, startIdx){
  var p = phiEntry(name); if(!p || !p.photo_url) return;
  if(PHI) phInspClose(true);
  PHI = { name:name, vis:phAllPhotos(p), idx:0, showHidden:false, viewHid:null, confirmDel:false, dirty:false, adj:false, adjClose:null, prevFocus:document.activeElement };
  var ku = phKeyUrl(p), ki = PHI.vis.findIndex(function(x){ return x.url === ku; });
  PHI.idx = ki > 0 ? ki : 0;
  if(startIdx != null && PHI.vis[startIdx]) PHI.idx = startIdx;
  phSwipeInit(); phKeysInit();
  phiRender();
  var xb = document.querySelector('.phi-wrap [data-act="phix"]'); if(xb) xb.focus();
}
function phiHost(u){
  if(!u) return '';
  try{ return new URL(u).hostname.replace(/^www\./, ''); }catch(x){ return ''; }
}
function phiRender(){
  var old = document.querySelector('.phi-wrap'); if(old) old.remove();
  if(!PHI){ if(!document.querySelector('.phed-wrap')) document.body.classList.remove('sheet-open'); phMarkSel(); return; }
  var p = phiEntry(PHI.name);
  if(!p){ PHI = null; phiRender(); return; }
  var di = phDiOf(PHI.name), e = di != null ? D.directory[di] : null;
  var hid = phiHidden(PHI.name);
  PHI.idx = Math.max(0, Math.min(PHI.vis.length - 1, PHI.idx));
  var cur = phiCur();
  var viewingHid = !!(cur && PHI.viewHid && cur.url === PHI.viewHid);
  var keyU = phKeyUrl(p), isKey = !!(cur && !viewingHid && keyU && cur.url === keyU);
  var stage;
  if(PHI.adj) stage = '<div class="phi-stage phi-adjstage" id="phiadj"></div>';
  else if(cur) stage = '<div class="phi-stage"><img src="' + esc(cur.url) + '" alt="' + esc(PHI.name) + '" referrerpolicy="no-referrer" style="' + phFrameStyleFor(p, cur.url) + '">' + (viewingHid ? '<span class="phbadge hid phi-hidbadge">HIDDEN</span>' : '') + '</div>';
  else stage = '<div class="phi-stage phi-noph">' + ic('camera', 34) + '<em>NO PHOTO ON FILE</em></div>';
  var rows = '';
  if(PHI.vis.length) rows += '<div class="phi-srow"><span>Position</span><b>' + (viewingHid ? 'Hidden' : (PHI.idx + 1) + ' of ' + PHI.vis.length) + '</b></div>';
  rows += '<div class="phi-srow"><span>Photos</span><b>' + PHI.vis.length + (hid.length ? ' + ' + hid.length + ' hidden' : '') + '</b></div>';
  if(p.added) rows += '<div class="phi-srow"><span>Date added</span><b>' + esc(fmtIsoD(p.added)) + '</b></div>';
  else if(p.added_approx) rows += '<div class="phi-srow"><span>Date added</span><b>' + esc(p.added_approx) + '</b></div>';
  if(cur && cur.taken) rows += '<div class="phi-srow"><span>Source photo date</span><b>' + esc(cur.taken) + '</b></div>';
  var sp = (cur && cur.sp) || p.source_page;
  if(sp) rows += '<div class="phi-srow"><span>Source</span><b><a href="' + esc(sp) + '" target="_blank" rel="noopener">' + esc(phiHost(sp) || 'Source page') + '</a></b></div>';
  if(p.type) rows += '<div class="phi-srow"><span>Type</span><b>' + esc(p.type) + '</b></div>';
  var rev = phRevOf(p), reason = phBadReason(PHI.name);
  var badge = rev === 'bad' ? '<span class="phbadge bad">BAD PHOTO' + (reason ? ' &mdash; ' + esc(phReasonLabel(reason)).toUpperCase() : '') + '</span>'
    : rev === 'confirmed' ? '<span class="phbadge conf">CONFIRMED BY YOU</span>'
    : rev === 'rejected' ? '<span class="phbadge poss">REJECTED</span>'
    : p.status === 'confirmed' ? '<span class="phbadge conf">CONFIRMED</span>'
    : p.status === 'likely' ? '<span class="phbadge lik">LIKELY</span>'
    : p.status === 'possible' ? '<span class="phbadge poss">POSSIBLE</span>' : '';
  var info = '<div class="phi-badges">' + badge + (isKey ? '<span class="phbadge key">KEY PHOTO</span>' : '') + (viewingHid ? '<span class="phbadge hid">HIDDEN</span>' : '') + '</div>' +
    (cur && cur.note ? '<p class="phi-note">' + esc(cur.note) + '</p>' : '') +
    (p.evidence ? '<p class="phi-ev">' + esc(p.evidence) + '</p>' : '');
  var tools = '';
  if(cur && !PHI.adj){
    if(viewingHid){
      tools = '<div class="phi-tools"><button type="button" class="btn primary sm" data-act="phirestore" data-u="' + esc(cur.url) + '">Restore this photo</button>' +
        '<button type="button" class="btn ghost sm" data-act="phiback">Back to photos</button></div>';
    } else {
      tools = '<div class="phi-tools">' +
        (isKey ? '' : '<button type="button" class="btn ghost sm" data-act="phikey">Set as key</button>') +
        '<button type="button" class="btn ghost sm" data-act="phimove" data-d="-1"' + (PHI.idx === 0 ? ' disabled' : '') + '>&larr; Move</button>' +
        '<button type="button" class="btn ghost sm" data-act="phimove" data-d="1"' + (PHI.idx === PHI.vis.length - 1 ? ' disabled' : '') + '>Move &rarr;</button>' +
        '<button type="button" class="btn ghost sm" data-act="phiadj">Adjust</button>' +
        (PHI.confirmDel
          ? '<button type="button" class="btn danger sm" data-act="phidel">Remove this photo?</button><button type="button" class="btn ghost sm" data-act="phidelx">Keep</button>'
          : '<button type="button" class="btn ghost sm danger" data-act="phidelq">Remove</button>') +
        '</div>';
    }
  }
  var hidSec = '';
  if(hid.length){
    hidSec = '<div class="phi-hidsec"><button type="button" class="phi-hidtog" data-act="phihidtog">Hidden (' + hid.length + ')' + (PHI.showHidden ? ' &minus;' : ' +') + '</button>' +
      (PHI.showHidden ? '<div class="phi-hidlist">' + hid.map(function(x){
        return '<div class="phi-hidrow' + (PHI.viewHid === x.url ? ' on' : '') + '"><button type="button" class="phi-hidth" data-act="phihprev" data-u="' + esc(x.url) + '" aria-label="Preview hidden photo"><img src="' + esc(x.url) + '" alt="" loading="lazy" referrerpolicy="no-referrer"></button><span class="dim">Hidden everywhere</span><span class="sp"></span><button type="button" class="btn ghost sm" data-act="phirestore" data-u="' + esc(x.url) + '">Restore</button></div>';
      }).join('') + '</div>' : '') + '</div>';
  }
  var foot = '<div class="phi-foot"><span class="dim">' + (PHI.dirty ? 'Order changed \u2014 not saved yet' : PHI.vis.length + (PHI.vis.length === 1 ? ' photo' : ' photos')) + '</span><span class="sp"></span>' +
    (PHI.dirty ? '<button type="button" class="btn primary sm" data-act="phisave">Save order</button>' : '') +
    '<button type="button" class="btn ghost sm" data-act="phix">Done</button></div>';
  var strip = (!PHI.adj && PHI.vis.length > 1) ? '<div class="phi-strip">' + PHI.vis.map(function(x, i){
      return '<button type="button" class="phi-th' + (i === PHI.idx && !viewingHid ? ' on' : '') + '" data-act="phidot" data-i="' + i + '" aria-label="Photo ' + (i + 1) + '"><img src="' + esc(x.url) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' + (keyU && x.url === keyU ? '<span class="phi-kdot" title="Key photo"></span>' : '') + '<span class="phi-tn">' + (i + 1) + '</span></button>';
    }).join('') + '</div>' : '';
  var ov = document.createElement('div');
  ov.className = 'phi-wrap'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Photo inspector');
  ov.innerHTML = '<div class="phi-scrim" data-act="phix"></div>' +
    '<div class="phi"><div class="phi-top"><div class="phi-left">' + stage + '</div>' +
    '<aside class="phi-pan"><div class="phi-h"><b>' + esc(PHI.name) + '</b>' + milBadgeName(PHI.name) + '<span class="sp"></span><button type="button" class="ib" data-act="phix" aria-label="Close">' + ic('x', 16) + '</button></div>' +
    (e ? '<a class="phi-openp" href="#/p/' + encodeURIComponent(personId(e)) + '" data-act="openp" data-di="' + di + '">Open profile</a>' : '') +
    '<div class="phi-stats">' + rows + '</div>' + info + tools + hidSec + foot +
    '</aside></div>' + strip + '</div>';
  document.body.appendChild(ov);
  document.body.classList.add('sheet-open');
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ ov.classList.add('open'); }); });
  phMarkSel();
  if(PHI.adj){
    var mnt = document.getElementById('phiadj');
    var startU = cur ? cur.url : null;
    var r = phEditor(PHI.name, { mount:mnt, startUrl:startU, done:function(){
      if(!PHI) return;
      PHI.adj = false; PHI.adjClose = null; phiRender();
      if($('#p-hero')) repaintTop();
      if(S.route.name === 'photos') phPaintList();
    }});
    PHI.adjClose = r && r.close;
  }
}
function phiStep(d){
  if(!PHI || PHI.adj) return;
  if(PHI.viewHid){
    var hid = phiHidden(PHI.name); if(hid.length < 2) return;
    var i = hid.findIndex(function(x){ return x.url === PHI.viewHid; });
    i = ((i < 0 ? 0 : i) + d + hid.length) % hid.length;
    PHI.viewHid = hid[i].url; PHI.confirmDel = false; phiRender(); return;
  }
  var n = PHI.vis.length; if(n < 2) return;
  PHI.idx = ((PHI.idx + d) + n) % n; PHI.confirmDel = false; phiRender();
}
function phiGo(i){
  if(!PHI || PHI.adj) return;
  PHI.viewHid = null;
  PHI.idx = Math.max(0, Math.min(PHI.vis.length - 1, i));
  PHI.confirmDel = false; phiRender();
}
function phiMove(d){
  if(!PHI || PHI.viewHid || PHI.adj) return;
  var j = PHI.idx + d; if(j < 0 || j >= PHI.vis.length) return;
  var t = PHI.vis[PHI.idx]; PHI.vis[PHI.idx] = PHI.vis[j]; PHI.vis[j] = t;
  PHI.idx = j; PHI.dirty = true; PHI.confirmDel = false; phiRender();
}
function phiPatchHidden(name, hid){
  var di = phDiOf(name); if(di == null) return;
  phInvalidate();
  txn(hid.length ? 'Remove photo' : 'Restore photo', function(){ queuePatch(di, { photo_hidden: hid.length ? JSON.stringify(hid) : '' }); });
  if(!PH_HIDDEN) PH_HIDDEN = {};
  if(hid.length) PH_HIDDEN[String(name).toLowerCase()] = hid; else delete PH_HIDDEN[String(name).toLowerCase()];
}
function phiAfterEdit(){
  if(S.route.name === 'photos') phPaintList();
  if($('#p-hero')) repaintTop();
}
function phiRemove(){
  if(!PHI || PHI.viewHid) return;
  var cur = PHI.vis[PHI.idx]; if(!cur) return;
  phiPatchHidden(PHI.name, phHiddenFor(PHI.name).concat([cur.url]));
  PHI.vis.splice(PHI.idx, 1);
  PHI.idx = Math.max(0, Math.min(PHI.vis.length - 1, PHI.idx));
  PHI.confirmDel = false;
  phiRender(); phiAfterEdit();
}
function phiRestore(url){
  if(!PHI) return;
  phiPatchHidden(PHI.name, phHiddenFor(PHI.name).filter(function(u){ return u !== url; }));
  var p = phiEntry(PHI.name), fresh = phAllPhotos(p);
  if(PHI.dirty){
    var have = {}; PHI.vis.forEach(function(x){ have[x.url] = 1; });
    fresh.forEach(function(x){ if(!have[x.url]) PHI.vis.push(x); });
  } else PHI.vis = fresh;
  PHI.viewHid = null;
  var ni = PHI.vis.findIndex(function(x){ return x.url === url; });
  if(ni >= 0) PHI.idx = ni;
  PHI.confirmDel = false;
  phiRender(); phiAfterEdit();
}
function phiSaveOrder(){
  if(!PHI || !PHI.dirty) return;
  var di = phDiOf(PHI.name); if(di == null) return;
  var urls = PHI.vis.map(function(x){ return x.url; });
  phInvalidate();
  txn('Save photo order', function(){ queuePatch(di, { photo_order: JSON.stringify(urls) }); });
  if(!PH_ORDER) PH_ORDER = {};
  PH_ORDER[String(PHI.name).toLowerCase()] = urls;
  PHI.dirty = false; phiRender(); phiAfterEdit();
}
function phInspClose(instant){
  var ov = document.querySelector('.phi-wrap');
  var pf = PHI && PHI.prevFocus;
  PHI = null;
  if(ov){ if(instant) ov.remove(); else { ov.classList.remove('open'); setTimeout(function(){ ov.remove(); }, 240); } }
  if(!document.querySelector('.phed-wrap')) document.body.classList.remove('sheet-open');
  if(pf && pf.focus) pf.focus();
  phMarkSel();
}

function viewPhotos(v){
  phLoad();
  var head = '<div class="pagehead phhead"><div><h1 class="display">Photos</h1></div></div>';
  if(!PH){
    v.innerHTML = '<div class="page asearch">' + head + '<div class="asskel"><div class="skl-grid"><div class="skl"></div><div class="skl"></div><div class="skl"></div><div class="skl"></div></div></div></div>';
    return;
  }
  if(PH.empty || !PH.people){ v.innerHTML = '<div class="page asearch">' + head + '<section class="card"><div class="cbody"><p class="dim">No photo checks yet. The first batch lands today.</p></div></section></div>'; return; }
  var all = phAllEntries();
  var withPh = all.filter(phHasPhoto).length;
  var unchecked = all.filter(function(p){ return p.status === 'unchecked'; }).length;
  /* Design cleanup (JD 2026-10-28): the stats ride in the banner as
     one compact line, and every control fits in ONE toolbar row —
     Tier/Organizations tuck behind Filters. The photos are the hero;
     the grid gets the reclaimed height. */
  var headFull = '<div class="pagehead phhead"><div><h1 class="display">Photos</h1></div><div class="ph-headstats">' +
    '<span class="phst">' + ic('camera', 13) + '<b>' + (PH.total || PH.people.length) + '</b> checked</span>' +
    '<span class="phst">' + ic('check', 13) + '<b>' + withPh + '</b> on file</span>' +
    '<span class="phst">' + ic('search', 13) + '<b>' + (all.length - withPh) + '</b> no photo yet</span>' +
    (PH.updated ? '<span class="phst">' + ic('calendar', 13) + 'Updated <b>' + esc(fmtIsoD(PH.updated)) + '</b></span>' : '') +
    (unchecked ? '<span class="phst">' + ic('search', 13) + '<b>' + unchecked + '</b> not yet checked</span>' : '') +
    (phNewCount(all) ? '<span class="phst">' + ic('sparkle', 13) + '<b>' + phNewCount(all) + '</b> new in the last 3 weeks</span>' : '') +
    '</div></div>';
  var tierN = { vetted:0, associate:0, open:0, '':0 };
  all.forEach(function(p){ var e = phEntryOf(p); var t = e ? tierOf(e) : ''; if(tierN[t] == null) tierN[t] = 0; tierN[t]++; });
  function fbtn(f, label, n){ return '<button type="button" class="ph-fbtn' + (PH_FILT === f ? ' on' : '') + '" data-act="phfilt" data-f="' + esc(f) + '"><span>' + esc(label) + '</span><b>' + n + '</b></button>'; }
  /* V3.13.0 — first principles (JD): the Photos page carried TWO
     sidebars on the left at once (the app rail + this page's own
     filter rail), and the rail ate a quarter of the grid's width in
     every mode. Filters are controls, not content: they now live in
     ONE bar above the grid — search, Show, Tier, Organizations as
     labeled chip groups — and the grid takes the full width. The
     inspector remains the single side surface, inside its modal. */
  var sortHtml = '<span class="phcols-ctl phsort-ctl"><span>Sort</span>' + [['grade', 'Grade'], ['newest', 'Newest'], ['name', 'Name'], ['org', 'Organization'], ['years', 'Years known'], ['tier', 'Tier']].map(function(s){ return '<button type="button" class="phcolbtn' + (PH_SORT === s[0] ? ' on' : '') + '" data-act="phsort" data-s="' + s[0] + '">' + s[1] + '</button>'; }).join('') + '<button type="button" class="phcolbtn" id="phsdirbtn" data-act="phsdir" title="Reverse the sort direction">' + (PH_SDIR < 0 ? '&darr;' : '&uarr;') + '</button></span>';
  var colsHtml = '<span class="phcols-ctl"><span>Per row</span>' + [5, 8, 10, 12].map(function(n){ return '<button type="button" class="phcolbtn' + (PH_COLS === n ? ' on' : '') + '" data-act="phcols" data-n="' + n + '">' + n + '</button>'; }).join('') + '</span>';
  var rail = '<div class="phtoolbar">' +
    '<div class="phtb-row"><input id="phq" type="search" placeholder="Search names" autocomplete="off" value="' + esc(PH_QUERY) + '">' +
    '<span class="phtb-group"><span class="phtb-lab">Show</span>' +
    fbtn('all', 'All', all.length) + fbtn('photo', 'With photo', withPh) + fbtn('new', 'New photos', phNewCount(all)) + fbtn('multi', 'Multiple photos', all.filter(function(p){ return phAllPhotos(p).length > 1; }).length) + fbtn('nophoto', 'No photo yet', all.length - withPh) +
    '</span>' +
    '<button type="button" class="phcolbtn" data-act="phmore" aria-expanded="false">Filters</button>' +
    '<span class="sp"></span><span class="ph-count" id="phcount"></span>' + sortHtml + colsHtml +
    '</div>' +
    '<div class="phtb-row" id="phtb-more" hidden><span class="phtb-group"><span class="phtb-lab">Tier</span>' +
    fbtn('tier:vetted', 'Vetted', tierN.vetted) + fbtn('tier:associate', 'Associate', tierN.associate) + fbtn('tier:open', 'Open', tierN.open) + fbtn('tier:', 'No tier', tierN['']) +
    '</span><span class="phtb-group"><span class="phtb-lab">Organizations</span>' +
    phTopOrgs(all).map(function(o){ return fbtn('org:' + o.name, o.name, o.n); }).join('') +
    '</span></div></div>';
  var main = '<div class="ph-main"><div id="phlist"></div></div>';
  var sus = phSuspects();
  var possHtml = sus.length ? '<section class="ph-poss"><div class="ph-poss-h"><h3>Possible photos</h3><span>Unconfirmed photos, waiting on your call. <b>' + sus.length + '</b> to review</span></div>' +
    sus.map(function(p){
      return '<div class="ph-poss-row"><button type="button" class="ph-poss-th" data-act="phinsp" data-pname="' + esc(p.name) + '" title="Open the photo inspector"><img src="' + esc(p.photo_url) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer"></button>' +
        '<div class="ph-poss-mid"><b>' + esc(p.name) + '</b><span class="phbadge ' + (p.status === 'likely' ? 'lik' : 'poss') + '">' + p.status.toUpperCase() + '</span>' +
        (p.evidence ? '<small>' + esc(briefClip(p.evidence, 150)) + '</small>' : '') + '</div>' +
        '<div class="ph-poss-act"><button type="button" class="btn sm primary" data-act="phconfirm" data-pname="' + esc(p.name) + '">Validate</button>' +
        '<button type="button" class="btn sm ghost" data-act="phrejectq" data-pname="' + esc(p.name) + '">Reject</button></div></div>';
    }).join('') + '</section>' : '';
  v.innerHTML = '<div class="page asearch pg-photos">' + headFull + possHtml + '<div class="ph-layout2">' + rail + main + '</div></div>';
  phPaintList();
  if(PHI) phiRender();
  phFocusChromeArm();
}
/* Focus mode on Photos (V3.12.0): while focus is on, the page's own
   chrome (head, stats strip, filter rail, sort bar) fades away after
   ~2.6s without a pointer move and returns on the next move / tap,
   so the grid runs edge-to-edge, photo to photo. The inspector is
   already a full overlay; focus stretches it edge-to-edge in CSS. */
var PH_FOCUS_T = 0;
function phFocusChromeKick(){
  var pg = document.querySelector('.pg-photos'); if(!pg) return;
  pg.classList.remove('ph-idle');
  clearTimeout(PH_FOCUS_T);
  PH_FOCUS_T = setTimeout(function(){
    var p2 = document.querySelector('.pg-photos');
    if(p2 && focusOn() && S.route && S.route.name === 'photos') p2.classList.add('ph-idle');
  }, 2600);
}
function phFocusChromeArm(){
  var pg = document.querySelector('.pg-photos'); if(!pg || !focusOn()) return;
  pg.addEventListener('pointermove', phFocusChromeKick);
  pg.addEventListener('pointerdown', phFocusChromeKick);
  phFocusChromeKick();
}
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
      return '<div class="evrow"><div><b>' + esc(dispName(e)) + '</b>' + milBadge(e) + '<small>into ' + esc(tgt != null ? dispName(D.directory[tgt]) : e.profile.merged_into) + '</small></div><div class="ea"><button type="button" class="btn ghost sm" data-act="unmerge" data-di="' + di + '">Restore</button></div></div>';
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
    return '<label class="dm' + (di === MG.surv ? ' on' : '') + '"><input type="radio" name="msv" data-act="msv" data-di="' + di + '"' + (di === MG.surv ? ' checked' : '') + '>' + avatar(e, 'sm') + '<span><b>' + esc(dispName(e)) + '</b>' + milBadge(e) + '<small>' + esc([effHandle(e) ? '@' + effHandle(e) : '', tierName(e), e.city].filter(Boolean).join(' · ')) + '</small></span></label>';
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
  lastc: { tag:'Last contact',  short:'Contact',  prompt:'When was the last contact with them?' },
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
  if(!String(gv(e, 'last_contact') || '').trim()) g.push('lastc');
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
/* Server-side audit state (JD 2026-10-26): dismissals used to live
   ONLY in this browser's localStorage, so audited gaps (phones he
   passed on, photos he already judged) resurrected on any other
   browser, profile, or storage reset. Dismissals now also persist
   per person in the Sheet (audit_dismissed = comma list of gap ids)
   through the normal outbox, and the baked value counts as dismissed
   on every device. localStorage remains as the within-lag cache. */
function audDismissedServer(di){
  return String(gv(D.directory[di], 'audit_dismissed') || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
}
function audDismissSyncPerson(di){
  var e = D.directory[di]; if(!e) return;
  var pk = pkey(e), list = [];
  Object.keys(AUD_DISMISS).forEach(function(p){ var ix = p.lastIndexOf('|'); if(p.slice(0, ix) === pk) list.push(p.slice(ix + 1)); });
  list.sort();
  var want = list.join(',');
  if(String(gv(e, 'audit_dismissed') || '') !== want) queuePatch(di, { audit_dismissed: want });
}
function audDismissSyncPairs(pairs){
  var seen = {};
  (pairs || []).forEach(function(p){ var ix = p.lastIndexOf('|'); var di = PK2I[p.slice(0, ix)]; if(di !== undefined && !seen[di]){ seen[di] = 1; audDismissSyncPerson(di); } });
}
function audOpenGaps(di){
  var srv = audDismissedServer(di);
  return audGaps(D.directory[di]).filter(function(g){ return !AUD_DISMISS[audPair(di, g)] && srv.indexOf(g) < 0; });
}
/* One-time migration: seed the local dismissal store from the baked
   server values, then push every locally-held dismissal and photo
   verdict up through the outbox so this browser's audit history
   becomes permanent and visible on every device. */
function auditStateMigrate(){
  if(store('ncc_state_migrated_v1')) return;
  D.directory.forEach(function(e, di){ audDismissedServer(di).forEach(function(g){ AUD_DISMISS[audPair(di, g)] = 1; }); });
  store('ncc_aud_skip', JSON.stringify(AUD_DISMISS));
  var touched = {};
  Object.keys(AUD_DISMISS).forEach(function(p){ var ix = p.lastIndexOf('|'); var di = PK2I[p.slice(0, ix)]; if(di !== undefined) touched[di] = 1; });
  Object.keys(touched).forEach(function(di){ audDismissSyncPerson(+di); });
  var r = {}; try{ r = JSON.parse(store('ncc_photos_review_v1') || '{}') || {}; }catch(x){}
  Object.keys(r).forEach(function(k){ if(r[k]) phSyncPerson(k, r[k], null); });
  var bm = {}; try{ bm = JSON.parse(store('ncc_photos_badreason_v1') || '{}') || {}; }catch(x){}
  Object.keys(bm).forEach(function(k){ if(bm[k]) phSyncPerson(k, null, bm[k]); });
  store('ncc_state_migrated_v1', '1');
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
  var m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(v);
  if(!m) return false;
  var n = +m[1];
  if(n < 1900 || n > new Date().getFullYear()) return false;
  if(m[2] && (+m[2] < 1 || +m[2] > 12)) return false;
  if(m[3] && (+m[3] < 1 || +m[3] > 31)) return false;
  return true;
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
  all = all.concat(regAliasDisps());
  return ptDedupe(all).sort(function(a, b){ return a.localeCompare(b); });
}
function audOrgCat(val){
  val = regApply(String(val || ''));
  var want = val.toLowerCase(), cats = audOrgPools();
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
  if(gap === 'years') return '<div class="pted-add"><input class="aud-in aud-year" inputmode="text" placeholder="Year, e.g. 2019, 2019-03 or 2019-03-14" autocomplete="off" spellcheck="false"><div class="pted-ac" hidden></div></div>';
  if(gap === 'lastc') return '<div class="pted-add"><input class="aud-in aud-year" inputmode="text" placeholder="Year, e.g. 2026, 2026-10 or 2026-10-28" autocomplete="off" spellcheck="false"><div class="pted-ac" hidden></div></div><label class="aud-onlrow"><input type="checkbox" class="aud-onl"> Online</label>';
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
    '<span class="pn"><span class="pn-row"><button type="button" class="aud-name" data-act="audopen" data-di="' + di + '" title="Open profile">' + esc(dispName(e)) + '</button>' + milBadge(e) + '</span>' +
    (ctx ? '<small class="aud-ctx">' + esc(ctx) + '</small>' : '') + '</span>' + audXHTML(di) + '</div>' +
    '<div class="aud-gaps" role="group" aria-label="Missing items for this person">' + audChipsHTML(x) + '</div>' +
    '<p class="aud-prompt"><span class="aud-tag">' + meta.tag + '</span><span class="aud-prompt-t">' + meta.prompt + '</span></p>' +
    '<div class="aud-ed">' + audEdHTML(di, gap) + '</div>' +
    '<div class="aud-foot"><span class="aud-cd"><span class="aud-cdt">Saving in 3</span><span class="aud-bar"><i></i></span></span><span class="sp"></span>' +
    '<button type="button" class="aud-later" data-act="audpark" data-di="' + di + '" title="Park this person and come back to them later — nothing is saved or closed out">Save for later</button>' +
    '<button type="button" class="aud-skip" data-act="audskip" data-di="' + di + '" title="Finish this person: close out everything still open on this card, for good">Done with them</button></div></article>';
}
/* Switch a card's active gap in place: chips, prompt and editor swap
   without the card moving or resizing. Any armed countdown is cancelled,
   so a half-filled editor never submits after a switch. */
/* Positional stability (JD 2026-10-16): the Audit wall is a row of
   independent column stacks (see audBuildWall), and a wall card that
   changes content in place keeps the height it had — shorter content
   just leaves quiet space at the card's bottom, so the cards below
   it in its column never shift. Taller content takes its natural
   height (only the cards below it in its own column shift, by
   exactly the excess). Stage cards are exempt — the stage wrap
   locks that footprint. */
function audPinH(card){
  if(!card || (S.audit && S.audit.mode === 'rapid')) return null;
  return card.offsetHeight || null;
}
function audHoldH(card, h){
  if(!card || !h) return;
  if(card.offsetHeight <= h) card.style.height = h + 'px';
}
function audSetGap(card, gap){
  var di = +card.getAttribute('data-di'), x = audEntry(di);
  if(!x || x.gaps.indexOf(gap) < 0) return;
  var pinH = audPinH(card);
  var hadFocus = card.contains(document.activeElement);
  audDisarm(card);
  audFinalizeStacks(card);   /* switching gaps closes out a stacked orgs/skills gap (values already on file) */
  x.cur = gap;
  card.setAttribute('data-gap', gap);
  card.removeAttribute('data-pick');
  var box = $('.aud-gaps', card); if(box) box.innerHTML = audChipsHTML(x);
  var pr = $('.aud-prompt', card);
  if(pr) pr.innerHTML = '<span class="aud-tag">' + AUD_GAPS[gap].tag + '</span><span class="aud-prompt-t">' + AUD_GAPS[gap].prompt + '</span>';
  var ed = $('.aud-ed', card); if(ed) ed.innerHTML = audEdHTML(di, gap);
  audWireCard(card);
  audHoldH(card, pinH);
  if(hadFocus) audFocusEditor(card);
}
/* Repaint just a card's indicator chips (after a state change). */
function audPaintChips(card){
  var x = audEntry(+card.getAttribute('data-di')); if(!x) return;
  var pinH = audPinH(card);
  var box = $('.aud-gaps', card); if(box) box.innerHTML = audChipsHTML(x);
  audHoldH(card, pinH);
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
  var pinH = audPinH(card);
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
  audHoldH(card, pinH);
  if(hadFocus) audFocusEditor(card);
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
    audDismissSyncPairs(act.pairs);
    if(x && card){
      if(x.gaps.indexOf(act.gap) < 0) x.gaps.splice(Math.min(act.gapIndex == null ? x.gaps.length : act.gapIndex, x.gaps.length), 0, act.gap);
      if(x.dropped) x.dropped--;
      audSetGap(card, act.gap);
    } else audRestock(act.di, act.gap);
  }
  else if(act.kind === 'bulkpass'){
    /* restore every pair the bulk close-out wrote, then redeal so the
       phone gaps are back on the wall exactly as before */
    (act.pairs || []).forEach(function(p){ delete AUD_DISMISS[p]; });
    store('ncc_aud_skip', JSON.stringify(AUD_DISMISS));
    audDismissSyncPairs(act.pairs);
    if(S.audit){ S.audit.shown = null; viewAudit($('#view')); }
  }
  else if(act.kind === 'done'){
    (act.pairs || []).forEach(function(p){ delete AUD_DISMISS[p]; });
    store('ncc_aud_skip', JSON.stringify(AUD_DISMISS));
    audDismissSyncPairs(act.pairs);
    if(act.submit){ audReverseEntry(act.submit.entry); if(S.audit) S.audit.done = Math.max(0, S.audit.done - 1); audNoteUnfill(act.submit); }
    audRestock(act.di, act.submit ? act.submit.gap : null);
  }
  else if(act.kind === 'park'){
    if(act.laterPrev === undefined) delete AUD_LATER[act.laterKey]; else AUD_LATER[act.laterKey] = act.laterPrev;
    audLaterSave();
    audRestock(act.di, act.gap);
  }
  else if(act.kind === 'stack'){
    /* reverse one stacked add: the field value comes off the profile,
       the stack list forgets it, and the fill counters unwind only
       when it was the gap's FIRST add (the one that counted). The
       card keeps the orgs/skills editor, ready for more. */
    audReverseEntry(act.entry);
    if(act.first){
      if(S.audit) S.audit.done = Math.max(0, S.audit.done - 1);
      audNoteUnfill(act);
    }
    if(x){
      if(x.stack && x.stack[act.gap]){
        var sv = act.val.toLowerCase();
        x.stack[act.gap] = x.stack[act.gap].filter(function(s2){ return s2.toLowerCase() !== sv; });
        if(!x.stack[act.gap].length) delete x.stack[act.gap];
      }
      if(x.vals){ if(x.stack && x.stack[act.gap]) x.vals[act.gap] = x.stack[act.gap].join(', '); else delete x.vals[act.gap]; }
      if(card) audPaintChips(card);
    }
  }
  else if(act.kind === 'skip'){
    /* deal the skipped card straight back (Rapid Fire swaps the
       stage; elsewhere it just returns to the front of the deck) */
    if(S.audit){
      var sq = null;
      for(var qi = 0; qi < S.audit.deck.length; qi++) if(S.audit.deck[qi].di === act.di){ sq = S.audit.deck[qi]; break; }
      if(sq){
        S.audit.deck.splice(S.audit.deck.indexOf(sq), 1); S.audit.deck.unshift(sq);
      }
    }
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
  audFinalizeStacks(card);   /* a stacked gap is already filled — parking must not re-open it later */
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
  audFinalizeStacks(card);   /* stacked values are already on file — Done must not dismiss that gap below */
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
  if(pairs.length) audDismissSyncPairs(pairs);
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
  audFinalizeStacks(card);   /* a stacked gap was FILLED, never passed: finalize it, don't dismiss it */
  if(x.gaps.indexOf(gap) < 0) return;
  var gapIndex = x.gaps.indexOf(gap);
  if(S.audit) S.audit.streak = 0;   /* a pass breaks the fill streak */
  x.dropped = (x.dropped || 0) + 1;
  audDisarm(card);   /* countdown + typing debounce cancelled: nothing submits */
  var pair = audPair(di, gap);
  AUD_DISMISS[pair] = 1;
  store('ncc_aud_skip', JSON.stringify(AUD_DISMISS));
  audDismissSyncPerson(di);
  x.gaps = x.gaps.filter(function(g){ return g !== gap; });
  var text = 'Passed · ' + AUD_GAPS[gap].tag + ' closed out';
  audLog({ kind:'pass', di:di, gap:gap, gapIndex:gapIndex, pairs:[pair], text:text });
  audToastShow(text);
  if(x.gaps.length){ audPaintCounts(); audSetGap(card, x.gaps[0]); return; }
  audRetire(card, false, true);
}
/* ---- Bulk phone close-out (JD 2026-10-16) --------------------------
   "If I don't have them here, I don't have them at all, so just close
   out the rest for contacts." One confirmed action closes the phone
   gap for every profile whose phone gap is still open, through the
   SAME dismissal store as a manual pass (ncc_aud_skip pairs), so the
   feeder treats them identically and the toast's Undo restores every
   pair at once. Dismissals live in that store: Profiles column O is
   the audit-era status field (keep / needs_audit / audited / trash,
   read by liveEntry) and cannot carry per-gap dismissals. */
function audBulkPhone(){
  var A = S.audit; if(!A) return;
  var targets = people().filter(function(di){ return audOpenGaps(di).indexOf('phone') >= 0; });
  if(!targets.length){ toast('No open phone gaps — everyone is already closed out.'); return; }
  if(!confirm('Close out the phone gap for ' + targets.length + ' ' + (targets.length === 1 ? 'person' : 'people') + '?\n\nUse this when you have no number for them and are not going to get one. Their other gaps stay open, and you can undo this from the toast right after.')) return;
  var pairs = targets.map(function(di){ return audPair(di, 'phone'); });
  pairs.forEach(function(p){ AUD_DISMISS[p] = 1; });
  store('ncc_aud_skip', JSON.stringify(AUD_DISMISS));
  targets.forEach(function(di){ audDismissSyncPerson(di); });
  var text = 'Phone gaps closed out · ' + targets.length + ' ' + (targets.length === 1 ? 'person' : 'people');
  A.shown = null;
  viewAudit($('#view'));
  audLog({ kind:'bulkpass', di:targets[0], gap:'phone', pairs:pairs, text:text });
  audToastShow(text);
}
/* Orgs / skills commit gestures (JD 2026-10-16, late): these two
   editors are ENTER/PICK-ONLY in every mode, so an explicit commit
   gesture — Enter, or a suggestion pick — saves INSTANTLY here: no
   arm, no Cards/Finish-Line last-gap countdown. Every other gap
   keeps the mode's normal arm path via audTryArm. */
function audCommitGesture(card){
  var gap = card.getAttribute('data-gap');
  if(gap === 'orgs' || gap === 'skills'){ audDisarm(card); audSave(+card.getAttribute('data-di'), card); return; }
  audTryArm(card);
}
function audWireCard(card){
  var gap = card.getAttribute('data-gap'), inp = $('.aud-in', card);
  if(!inp) return;
  var list = gap === 'loc' ? ptSugList('town') : gap === 'skills' ? ptSugList('skill') : gap === 'orgs' ? audOrgPool() : gap === 'years' ? audYearList() : null;
  if(list) ptAcWire(inp, list, function(v){ inp.value = v; inp.focus(); audCommitGesture(card); },
    gap === 'orgs' ? { label:regSugLabel, resolve:regApply }
    /* ORGS split from the veto (JD 2026-10-27): an org value comes from
       a known pool, so Enter accepts the highlighted completion — that
       IS the intent when typing a fragment of a known org ("roch" ->
       Rochester Regional Health). With the veto, Enter fell through to
       audEnterKey and filed the raw fragment, which is exactly how the
       directory filled with truncated orgs. When the list is closed
       (no suggestions), Enter still reaches audEnterKey and commits the
       typed value as a genuinely new org. The veto below stays for
       years / loc / skills: there the TYPED text is the data, and
       Enter must reach the field's own handler (audEnterKey), which
       applies the completeness gates to what was actually typed —
       UNLESS JD has deliberately arrowed to a suggestion, in which
       case ptAcWire treats Enter as the pick it is (see ptAcWire's
       "deliberate" flag). Without this veto, typing the fragment "Po"
       and pressing Enter committed the dropdown's passively
       pre-highlighted "Pomona, CA": a value JD never typed and never
       chose. A dropdown pick by mouse/touch commits as a deliberate
       choice too; only the passive pre-highlight is gated. */
    : (gap === 'years' || gap === 'loc' || gap === 'skills') ? { enterPick:function(){ return false; } }
    : null);
  /* commit triggers (JD 2026-10-15): a suggestion pick or Enter submits
     what is typed, and a REAL blur (focus leaving the card) submits after
     a 250ms grace period, so a tap on a suggestion registers its pick
     first instead of the blur closing the editor underneath it. A pause
     in typing submits ONLY a value that is already complete for its
     field (audComplete): a half-typed word never submits, the editor
     never closes mid-composition, and keystrokes cancel any pending
     commit. Any edit while the countdown runs cancels it and re-enters
     this flow, so only the final value ever submits.
     YEARS ARE ENTER-ONLY (JD 2026-10-16): typing in the years combo
     never arms or commits, however complete the value looks — the
     pause commit and the blur commit both skip years outright, because
     a finished-looking year is just four keystrokes, not consent. A
     typed year saves only on Enter (audEnterKey, no countdown).
     ORGS / SKILLS ARE ENTER/PICK-ONLY (JD 2026-10-16, late): the same
     timed paths are closed for these two editors in EVERY mode — no
     typing-pause arm, no blur arm, and no last-gap countdown — because
     a pause mid-word ("CFC P…") filed the fragment before Enter was
     ever pressed. Enter and suggestion picks commit instantly via
     audCommitGesture; nothing else can submit these two fields. */
  inp.addEventListener('input', function(){
    audDisarm(card);
    if(gap === 'years' || gap === 'orgs' || gap === 'skills') return;
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
      if(gap === 'years' || gap === 'orgs' || gap === 'skills') return;   /* Enter/pick-only: never blur-committed */
      audTryArm(card);
    }, 250);
  });
  inp.addEventListener('keydown', function(ev){
    if(ev.key === 'Enter'){ ev.preventDefault(); audEnterKey(card); }
  });
}
/* ============ keyboard flow (JD 2026-10-16) ============
   Rapid Fire (and Category Run, which shares this editor path) runs
   from the keyboard: Enter commits a complete value and the next
   editor takes focus; Shift+Right commits-or-skips-for-now;
   Shift+Left deals the previous card back. Cards / Finish Line keep
   their mouse-first semantics (countdowns, permanent pass,
   save-for-later) untouched. */
/* The two "flow" modes — saves are instant there and the keyboard
   rules below apply. Mirrors the instant-arm grouping in audTryArm. */
function audFlowMode(){ return !!(S.audit && (S.audit.mode === 'rapid' || S.audit.mode === 'cat')); }

/* The editor focus target inside a card: the text field when the gap
   has one, else the first pick chip (tier / relationship), else the
   active gap chip. Focus must NEVER land on the card's name button —
   that was the second half of the years bug: after a save, the next
   card's name button took focus because it is the card's first
   button and the fallback target was "first button or input". */
function audEditorEl(card){
  return $('.aud-in', card) || $('.aud-pick', card) || $('.aud-gchip.on', card) || $('button, input', card);
}
function audFocusEditor(card){ var f = card && audEditorEl(card); if(f) f.focus({ preventScroll:true }); return f; }

/* Enter inside an Audit text editor. Enter is the explicit
   confirmation, so it commits ONLY a complete value — the audComplete
   gates decide, and a fragment never commits (it just nudges).
   - years: commits the typed year directly, in EVERY mode, with no
     countdown (Enter replaces the countdown as the confirmation).
   - orgs / skills: a value commits AND closes the gap out, exactly
     like a single-value field (JD 2026-10-16 — the flow modes' "add
     and stay" stacking was overruled; Enter means done), and commits
     INSTANTLY in every mode — these editors are enter/pick-only, so
     Enter never arms the Cards/Finish-Line countdown (JD 2026-10-16,
     late). Enter on an EMPTY field in the flow modes advances
     instead (audAdvanceFrom).
   - everything else: the mode's normal arm path, unchanged. */
function audEnterKey(card){
  var gap = card.getAttribute('data-gap');
  if(gap === 'years'){
    if(audComplete(card)){ audDisarm(card); audSave(+card.getAttribute('data-di'), card); }
    else audNudge(card);
    return;
  }
  var inp = $('.aud-in', card), v = inp ? inp.value.trim() : '';
  if(gap === 'orgs' || gap === 'skills'){
    if(v){ audCommitGesture(card); return; }            /* commit it — INSTANTLY, no countdown in any mode; audSave closes the gap out */
    if(audFlowMode()){ audAdvanceFrom(card); return; }   /* empty Enter advances in the flow modes */
    audNudge(card); return;
  }
  if(!audComplete(card)){ audNudge(card); return; }      /* fragment: never commits */
  audTryArm(card);
}

/* Close out a stacked multi-value gap: the values are already on
   file; this is the card bookkeeping that moves the gap to done.
   Returns true when a stack was finalized. Safe to call anywhere —
   no stack, no-op. NOTE (JD 2026-10-16, evening): commits no longer
   stack (audSave closes orgs/skills out on the commit gesture), so
   in a fresh session this never fires; it stays as the safety net
   for stack state left by a pre-fix session and for its callers
   (gap switch, park, Done, pass, advance), which remain correct
   either way. */
function audFinalizeStacks(card){
  var x = audEntry(+card.getAttribute('data-di'));
  if(!x || !x.stack) return false;
  var did = false;
  Object.keys(x.stack).forEach(function(g){
    if(x.gaps.indexOf(g) >= 0){
      x.gaps = x.gaps.filter(function(q){ return q !== g; });
      if(x.done.indexOf(g) < 0) x.done.push(g);
      did = true;
    }
  });
  if(did) audPaintChips(card);
  return did;
}

/* Flow-mode advance with nothing (new) to commit on the current gap:
   finalize a pending stack if there is one (retire as a fill when the
   person is complete, else move to their next gap); with no stack,
   skip the card for now — it deals again later this visit. */
function audAdvanceFrom(card){
  var di = +card.getAttribute('data-di'), x = audEntry(di);
  if(!x) return;
  var had = audFinalizeStacks(card);
  if(had && x.gaps.length){ audPaintCounts(); audSetGap(card, x.gaps[0]); return; }
  if(had){ audRetire(card, true, true); return; }
  audSkipNow(card);
}

/* Prefill a re-shown card whose current gap was already FILLED this
   visit (Shift+Left deals these back): the same value restoration
   audReopen does, without entering re-edit state. */
function audPrefillDone(card, x){
  var gap = x.cur, e = D.directory[x.di];
  if(gap === 'tier' || gap === 'rel'){
    var cur = gap === 'tier' ? tierOf(e) : gv(e, 'relationship');
    if(cur){
      card.setAttribute('data-pick', cur);
      $$('.aud-pick', card).forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-v') === cur); });
    }
  } else if(gap === 'loc' || gap === 'years' || gap === 'phone'){
    var inp = $('.aud-in', card);
    if(inp) inp.value = (x.vals && x.vals[gap]) || (gap === 'loc' ? raw(e, 'location_on_file') : gv(e, gap === 'years' ? 'years_known' : 'phone'));
  }
}

/* Render one specific entry onto the stage and put focus in its
   editor: skip-for-now deals the deck front through here, Shift+Left
   deals history back. Wires the card and restores a filled gap's
   editor. In Category Run the card appends to the wall like any
   other dealt card. */
function audStageRender(x){
  var A = S.audit, grid = $('#audgrid');
  if(!grid || !x) return null;
  var ix = A.deck.indexOf(x); if(ix >= 0) A.deck.splice(ix, 1);
  if(A.shown.indexOf(x) < 0) A.shown.push(x);
  if(x.parked) audUnpark(pkey(D.directory[x.di]));
  if(x.gaps.indexOf(x.cur) < 0 && x.done.indexOf(x.cur) < 0) x.cur = x.gaps[0] || x.done[x.done.length - 1];
  var tmp = document.createElement('div');
  tmp.innerHTML = audCardHTML(x, 0);
  var nc = tmp.firstChild;
  grid.appendChild(nc);
  audWireCard(nc);
  if(x.done.indexOf(x.cur) >= 0) audPrefillDone(nc, x);
  /* Stage footprint lock (JD 2026-10-16): the wrap never shrinks
     below the tallest stage card dealt this session, so a swap can
     never change the page height around the stage. */
  var wrap = grid.closest ? grid.closest('.aud-stage-wrap') : null;
  if(wrap){
    var wh = wrap.offsetHeight;
    if(!A._stageH || wh > A._stageH) A._stageH = wh;
    wrap.style.minHeight = A._stageH + 'px';
  }
  audFocusEditor(nc);
  audPaintCounts(); audPaintEmpty();
  return nc;
}

/* Swap the Rapid Fire stage to a specific entry: the current entry
   returns to the FRONT of the deck (it deals again on the next
   advance, untouched), the target takes the stage. */

/* Skip for now (flow modes): the card leaves the stage with NO
   dismissal — its entry goes to the BACK of the deck and deals again
   later this visit. A stacked gap finalizes first (its values are
   already on file). One-step undoable like everything else in Audit.
   Rapid Fire also records the card in stage history, so Shift+Left
   can deal it straight back. */
function audSkipNow(card){
  var A = S.audit, di = +card.getAttribute('data-di'), x = audEntry(di);
  if(!x) return;
  audFinalizeStacks(card);
  audDisarm(card);
  A.streak = 0;
  A.shown = A.shown.filter(function(y){ return y.di !== di; });
  if(audMode() === 'rapid'){
    if(!A.hist) A.hist = [];
    A.hist = A.hist.filter(function(h){ return h.di !== di; });
    A.hist.push(x);
    if(A.hist.length > 50) A.hist.shift();
  }
  card.remove();
  if(A.deck.length){
    A.deck.push(x);
    audLog({ kind:'skip', di:di, text:'Skipped for now · deals again later' });
    audToastShow('Skipped for now · deals again later');
    audStageRender(A.deck.shift());
  } else {
    audStageRender(x);
    audToastShow('Only card in the deck — it stays.');
  }
  audPaintCounts(); audPaintEmpty();
}

/* Shift+Right in Rapid Fire (JD 2026-10-16): advance with the
   keyboard. A complete value on show commits first — a FOCUSED pick
   chip counts as the pending pick, and a complete org/skill value
   adds and then advances — otherwise the card is skipped for now
   (never the permanent pass; Cards mode keeps that, see onNavKey). */

/* Shift+Left in Rapid Fire (JD 2026-10-16): deal the previous card
   back, its editor focused. Entries with nothing left to show (no
   open gap and nothing filled this visit) are passed over; the
   current card returns to the front of the deck. */

/* A card is submittable only with a complete value: a chip picked, a
   non-empty text field, or a plausible 4-digit year (1900–current). */
function audReady(card){
  var gap = card.getAttribute('data-gap');
  if(gap === 'tier' || gap === 'rel') return !!card.getAttribute('data-pick');
  if(gap === 'years'){ var yi = $('.aud-year', card); return !!(yi && audYearOk(yi.value)); }
  if(gap === 'lastc'){ var li2 = $('.aud-year', card); return !!(li2 && audYearOk(li2.value)); }
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
  if(gap === 'lastc') return audYearOk(v);
  if(gap === 'loc') return audLocComplete(v);
  if(gap === 'phone') return audPhoneOk(v);
  if(gap === 'skills' || gap === 'orgs'){
    var list = gap === 'skills' ? ptSugList('skill') : audOrgPool(), lv = v.toLowerCase();
    for(var i = 0; i < list.length; i++) if(list[i].toLowerCase() === lv) return true;
    if(gap === 'orgs' && regResolve(v)) return true;
    return false;
  }
  return false;
}
function audDisarm(card){
  if(card._audIv){ clearInterval(card._audIv); card._audIv = null; }
  if(card._audDeb){ clearTimeout(card._audDeb); card._audDeb = null; }
  if(card._audBlur){ clearTimeout(card._audBlur); card._audBlur = null; }
  card.classList.remove('aud-arm');   /* the countdown span hides with the class (its space stays reserved) */
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
     kill the pace — the toast + Undo is the safety net instead.
     Category Run is instant too (JD 2026-10-16): once a value is
     confirmed entered it commits immediately, last gap included. */
  var instantArm = !!(S.audit && (S.audit.mode === 'rapid' || S.audit.mode === 'cat'));
  if(reeditArm || instantArm || !audCardLast(card)){ audDisarm(card); audSave(+card.getAttribute('data-di'), card); return; }
  audDisarm(card);
  var cdt = $('.aud-cdt', card), bar = $('.aud-bar i', card);
  card.classList.add('aud-arm');   /* .aud-arm reveals the countdown span (space already reserved) */
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
  var f = $('.aud-in', card); if(f) f.focus({ preventScroll:true });
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
  if(gap === 'lastc'){
    var li3 = $('.aud-year', card), lv3 = li3 ? li3.value.trim() : '';
    if(!audYearOk(lv3)) return null;
    var lo3 = $('.aud-onl', card), onv3 = lo3 && lo3.checked ? 'yes' : '';
    return { entry:txn('Set last contact', function(){ queuePatch(di, { last_contact:lv3, last_contact_online:onv3 }); }), val: lv3 + (onv3 ? ' (online)' : '') };
  }
  if(gap === 'phone'){
    var ip = $('.aud-in', card), pv = ip ? ip.value.trim() : '';
    if(!pv) return null;
    return { entry:txn('Set phone', function(){ queuePatch(di, { phone:pv }); }), val:pv };
  }
  if(gap === 'orgs'){
    var io = $('.aud-in', card), ov = io ? regApply(io.value.trim()) : '';
    if(!ov) return null;
    ov = orgPrefixComplete(ov, null);   /* choke point: picked or typed, a fragment of one known org files as that org */
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
  /* Orgs / skills commit like every other field, in EVERY mode
     (JD 2026-10-16, evening — this OVERRULES the flow-mode stacking
     shipped the same morning): an Enter or a suggestion pick writes
     the value and CLOSES the gap out through the one-shot path below;
     the card moves on exactly as it does for years or relationship.
     The morning's "add and stay" stack left the gap open with only a
     toast as evidence, which read as "nothing happened" — Enter means
     done. Adding another value is the done chip's re-edit, as with
     any other filled gap. audFinalizeStacks stays as an inert safety
     net for any stack state a pre-fix session left behind. */
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
  audPaintChips(card);   /* the done chip carrying the just-saved value is visible on the card as it leaves — the save is seen, not just toasted */
  audRetire(card, true);
}
function audRetire(card, saved, kbFocus){
  audDisarm(card);
  var A = S.audit, di = +card.getAttribute('data-di');
  var xOut = audEntry(di);
  var hadFocus = card.contains(document.activeElement);
  A.shown = A.shown.filter(function(x){ return x.di !== di; });
  function finish(){
    if(!card.isConnected) return;   /* the view was rebuilt mid-animation (mode switch, shuffle): do not feed a stale card into the new wall */
    /* Replacement-in-place (JD 2026-10-16): the dealt card takes the
       DEPARTED card's slot — same DOM position, same height — so the
       wall's height sequence is unchanged, no bystander moves, and
       focus lands in the new card's editor without scrolling. */
    var sib = card.nextElementSibling, prev = card.previousElementSibling, depH = card.offsetHeight, colEl = card.parentNode;
    var allC = $$('.aud-card'), ci = -1;
    for(var i2 = 0; i2 < allC.length; i2++) if(allC[i2] === card) ci = i2;
    var domNext = ci >= 0 ? (allC[ci + 1] || null) : null, domPrev = ci >= 0 ? (allC[ci - 1] || null) : null;
    card.remove();
    /* Rapid Fire stage history (JD 2026-10-16): every card that
       leaves the stage is remembered, most recent last, so
       Shift+Left can deal the previous card back. */
    if(xOut && audMode() === 'rapid'){
      if(!A.hist) A.hist = [];
      A.hist = A.hist.filter(function(h){ return h.di !== di; });
      A.hist.push(xOut);
      if(A.hist.length > 50) A.hist.shift();
    }
    var nxt = A.deck.shift();
    if(nxt){
      A.shown.push(nxt);
      if(nxt.parked) audUnpark(pkey(D.directory[nxt.di]));   /* back on the wall: no longer parked */
      var grid = $('#audgrid');
      if(grid && colEl){
        var tmp = document.createElement('div');
        tmp.innerHTML = audCardHTML(nxt, 0);
        var nc = tmp.firstChild;
        if(sib && sib.parentNode === colEl) colEl.insertBefore(nc, sib); else colEl.appendChild(nc);
        audWireCard(nc);
        if(depH && nc.offsetHeight <= depH) nc.style.height = depH + 'px';
        /* Keyboard flows (and the flow modes generally) land focus
           in the DEALT card's editor — never on its name button, and
           never by scrolling the view to it. Cards / Finish Line
           keep the old rule for pure-mouse retirements (focus only
           follows when the card had it). */
        if(hadFocus || audFlowMode()){ var nf = (kbFocus || audFlowMode()) ? audEditorEl(nc) : $('button, input', nc); if(nf) nf.focus({ preventScroll:true }); }
      }
    }
    /* Flow modes on a wall (Category Run deals its whole lane at
       once, so often no fresh card feeds in): a retired card must not
       strand focus on <body> — hand it to the card that slid into the
       departed slot (the former next sibling, else the previous
       one), never to the first card on the wall. */
    if(!nxt && audFlowMode() && hadFocus){
      var rest = (sib && sib.classList && sib.classList.contains('aud-card')) ? sib
        : (prev && prev.classList && prev.classList.contains('aud-card')) ? prev
        : (domNext && domNext.isConnected) ? domNext
        : (domPrev && domPrev.isConnected) ? domPrev : null;
      if(rest) audFocusEditor(rest);
    }
    audPaintCounts(); audPaintEmpty();
  }
  if(pvReducedMotion()){ finish(); return; }
  card.classList.add(saved ? 'aud-done' : 'aud-out');
  /* The flow modes keep the swap under 150ms (Doherty threshold):
     the stage never sits empty long enough to break the rhythm, and
     a Category Run Enter chain lands in the dealt card at once. */
  setTimeout(finish, audFlowMode() ? 120 : 310);
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
  s.innerHTML = left ? '<span class="ahn">' + left.toLocaleString('en-US') + '</span> quick win' + (left === 1 ? '' : 's') + ' left' + (done ? ' &middot; <span class="ahn-s">' + done + '</span> filled in this visit' : '') : 'Nothing left to fill in';
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
  { k:'years',  l:'Years Known' },
  { k:'lima',   l:'Lima Charlie' },
  { k:'photos', l:'Photo Audit' }
];
function audMode(){ var m = S.audit && S.audit.mode; return m === 'lima' || m === 'photos' || m === 'years' ? m : 'cards'; }
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
  t.innerHTML = '<span class="ahn-s">' + d.n + '</span> of ' + d.goal + ' filled today' + (d.n >= d.goal ? ' — goal reached' : '');
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
function audDealMode(){
  var m = audMode();
  if(m === 'lima') lcEnsureDeck();
  else if(m === 'photos'){ /* the photo desk manages its own queue */ }
  else if(m === 'years'){ /* the Years Known runner manages its own queue */ }
  else audDeal();
}
function audSetMode(m){
  var A = S.audit; if(!A) return;
  audEndBlitz(true);
  A.mode = m; store('ncc_aud_mode', m);
  if(m !== 'cat') A.cat = null;
  if(m !== 'lima') A.lcOpen = null;
  A.blitzDone = null;
  A.shown = null;
  viewAudit($('#view'));
}
/* ---- Blitz: a 2-minute Rapid Fire round with an end-of-round
   summary (peak-end rule: the recap is what the round is remembered
   by). Fills during the round are counted on the blitz state. ---- */
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
  if(m === 'lima'){
    var np = lcPendingCount();
    return '<div class="aud-modebar"><span><b id="lcpend">' + np + '</b> note' + (np === 1 ? '' : 's') + ' waiting for the next Lima Charlie run</span></div>';
  }
  if(m === 'photos'){
    phLoad();
    var pc = phaCounts();
    return '<div class="aud-modebar"><span><b>' + pc.todo + '</b> to review</span><span><b>' + pc.confirmed + '</b> confirmed</span><span><b>' + pc.bad + '</b> flagged bad</span><span><b>' + pc.rejected + '</b> rejected</span>' +
      '<span class="sp"></span><span class="dim">Keys: &larr; &rarr; move &middot; C confirm &middot; W wrong person &middot; B bad photo &middot; N no person &middot; U undo &middot; A adjust &middot; 1&ndash;7 reason</span></div>';
  }
  return '<div class="aud-modebar"><button type="button" class="btn ghost sm" data-act="audbulkphone">Mark all phone gaps done</button></div>';
}
function audPaintModeBar(){
  var A = S.audit; if(!A) return;
  var m = audMode();
  if(m === 'lima'){ var lp = $('#lcpend'); if(lp) lp.textContent = lcPendingCount(); }
}

/* ============================================================
   Lima Charlie (JD 2026-10-16): a fifth Audit mode for whole-
   profile voice dictation. A deck of four random profiles (any
   listed profile — not gap-driven); Shuffle deals four fresh
   ones. Opening a card shows the ENTIRE profile at once, scaled
   to fit the screen with no scrolling (Persona ratings
   included), plus one note box. JD dictates every change he
   wants into the note; Save writes it through the one save path
   (queuePatch, field lima_charlie_notes -> Sheet column BG
   "Lima Charlie Notes"). Luna's daily Lima Charlie run reads
   the notes, applies the edits and clears them; a card whose
   profile has a note waiting carries an LC marker. The note box
   is a dictation surface: nothing auto-submits, arms or counts
   down — Save is the only commit.
   ============================================================ */
function lcNote(e){ return String(gv(e, 'lima_charlie_notes') || ''); }
function lcPendingCount(){
  var n = 0;
  people().forEach(function(di){ if(lcNote(D.directory[di]).trim()) n++; });
  return n;
}
function lcDealFresh(){
  var A = S.audit, pool = people().slice(), cur = A.lcDeck || [];
  audShuffleInPlace(pool);
  var fresh = pool.filter(function(di){ return cur.indexOf(di) < 0; });
  if(fresh.length < 4) fresh = pool;
  A.lcDeck = fresh.slice(0, 4);
}
function lcEnsureDeck(){
  var A = S.audit;
  if(!A.lcDeck || !A.lcDeck.length) lcDealFresh();
}
function lcShuffleDeck(){
  var A = S.audit; if(!A) return;
  A.lcOpen = null;
  lcDealFresh();
  viewAudit($('#view'));
}
function lcDeckCardHTML(di){
  var e = D.directory[di], note = lcNote(e).trim();
  var line2 = [infoLine(e), ptLocVal(e)].filter(Boolean).join(' · ');
  var orgs = orgsOf(e).slice(0, 2).join(' · ');
  return '<span class="lc-wrap"><button type="button" class="lc-card" data-act="lcopen" data-di="' + di + '">' +
    '<span class="lc-card-top">' + avatar(e, 'md') + (note ? '<span class="lc-mark" title="A Lima Charlie note is waiting on this profile">LC</span>' : '') + '</span>' +
    '<span class="lc-card-name">' + esc(dispName(e)) + milBadge(e) + '</span>' +
    (line2 ? '<span class="lc-card-line">' + esc(line2) + '</span>' : '') +
    (orgs ? '<span class="lc-card-line dim">' + esc(orgs) + '</span>' : '') +
    (note ? '<span class="lc-card-note">' + esc(note.length > 90 ? note.slice(0, 90) + '…' : note) + '</span>' : '') +
    '</button>' + audXHTML(di) + '</span>';
}
function lcRender(){
  var wrap = $('#lcwrap'); if(!wrap) return;
  lcEnsureDeck();
  wrap.innerHTML = '<div class="lc-deck">' + S.audit.lcDeck.map(lcDeckCardHTML).join('') + '</div>' +
    '<div class="lc-deckbar"><button type="button" class="btn primary" data-act="lcshuffle">' + ic('reset', 15) + '<span>Shuffle</span></button>' +
    '<span class="dim">Four at a time, anyone in the directory. Tap a card for the whole profile on one screen.</span></div>';
}
/* The whole profile on one screen, built from the profile's OWN
   section cards (JD 2026-10-17, V2.8.2): every value the profile
   shows is here, and every value the profile can edit can be edited
   in place — the same section editors, the same queuePatch save
   path, the same nothing-saves-early rules. Sections render in the
   profile's own column arrangement and never fold away here (the
   fit zoom is what keeps it to one screen). The Lima Charlie note
   itself stays in the dock below, so the profile's own lima card
   is not duplicated. While this view is open, S.prof points at the
   open person (lcRenderOpen keeps it so), which is what lets the
   shared editors work untouched. */
function lcOpenHTML(di){
  var e = D.directory[di];
  var head = '<div class="lc-head">' + avatar(e, 'lg') + '<div class="lc-hmain"><h2 class="display">' + esc(dispName(e)) + milBadge(e) + '</h2>' +
    '<p class="lc-hsub">' + esc([infoLine(e), ptNormLoc(ptLocVal(e))].filter(Boolean).join(' · ') || 'Not yet classified') + '</p></div>' +
    '<div class="lc-hscore">' + scoreBadgeHTML(di) + '</div></div>';
  function grpSecs(ids){
    return ids.map(function(id){ return secHTML(di, id); }).join('');
  }
  return head + '<div class="lc-cols"><div class="lc-col">' + grpSecs(['identity', 'relationship']) + '</div><div class="lc-col">' + grpSecs(['about', 'background']) + '</div><div class="lc-col">' + grpSecs(['persona', 'files', 'connections', 'timeline']) + '</div></div>';
}
/* Is the Lima Charlie expanded view the live screen right now? The
   shared profile painters check this and re-render the LC view
   instead of the (absent) profile page. */
function lcActive(){ return !!(S.route && S.route.name === 'audit' && S.audit && audMode() === 'lima' && S.audit.lcOpen != null && $('#lcfit')); }
function lcFitSoon(){ lcFit(); requestAnimationFrame(function(){ lcFit(); }); }
/* Rebuild the open LC profile in place (after any direct edit):
   same sections, same edit states (they live in S.prof), dock name
   refreshed, fit recalculated. The note draft in the dock is NOT
   touched — it only ever changes by typing or by Save note. */
function lcRepaint(){
  var fit = $('#lcfit'); if(!fit || !S.audit || S.audit.lcOpen == null) return;
  var di = S.audit.lcOpen, e = D.directory[di]; if(!e) return;
  fit.innerHTML = lcOpenHTML(di);
  var dn = $('.lc-dockname');
  if(dn) dn.innerHTML = esc(dispName(e)) + milBadge(e) + (lcNote(e).trim() ? ' <span class="lc-mark">LC note waiting</span>' : '');
  lcFitSoon();
  profWireAc();
}
/* Fit-to-screen: the profile block is laid out at natural size,
   then scaled down (CSS zoom, so layout and visuals agree) to
   fit the space above the note dock exactly. The page itself
   never scrolls in this view: the container is sized to the
   visible viewport and clipped. */
var LC_FIT_WATCH = false;
function lcFit(){
  var page = $('#lcpage'), wrap = $('#lcfitwrap'), fit = $('#lcfit'), dock = $('#lcdock');
  if(!page || !wrap || !fit || !dock) return;
  var top = $('#top'), view = $('#view'), app = $('#app');
  var chromH = 0, padV = 56, appPadB = 0;
  if(top && top.offsetParent !== null) chromH += top.getBoundingClientRect().height;
  if(view){ var vcs = getComputedStyle(view); padV = (parseFloat(vcs.paddingTop) || 0) + (parseFloat(vcs.paddingBottom) || 0); }
  if(app) appPadB = parseFloat(getComputedStyle(app).paddingBottom) || 0;
  var availH = Math.max(240, window.innerHeight - chromH - padV - appPadB);
  var pcs = getComputedStyle(page);
  var pgPadV = (parseFloat(pcs.paddingTop) || 0) + (parseFloat(pcs.paddingBottom) || 0);
  var pgPadH = (parseFloat(pcs.paddingLeft) || 0) + (parseFloat(pcs.paddingRight) || 0);
  var availW = (page.clientWidth - pgPadH) || (window.innerWidth - 32);
  page.style.height = availH + 'px';
  fit.style.zoom = '';
  wrap.style.width = ''; wrap.style.height = '';
  var natW = fit.offsetWidth, natH = fit.offsetHeight;
  var dockH = dock.offsetHeight;
  var roomH = Math.max(120, availH - pgPadV - dockH - 24);
  var s = Math.min(1, availW / Math.max(1, natW), roomH / Math.max(1, natH));
  if(s < 1) fit.style.zoom = s;
  wrap.style.width = Math.ceil(natW * s) + 'px';
  wrap.style.height = Math.ceil(natH * s) + 'px';   /* arithmetic: offsetHeight ignores zoom */
  /* one feedback pass: if the assembled page still measures tall
     (gap/padding drift), shrink the scale to match exactly */
  var over = page.scrollHeight;
  if(over > availH - 2 && s > 0.05){
    s = s * (Math.max(120, availH - 4) / over);
    fit.style.zoom = s;
    wrap.style.width = Math.ceil(natW * s) + 'px';
    wrap.style.height = Math.ceil(natH * s) + 'px';
  }
  /* final correction against the wrap's OWN overflow (V2.8.2): text
     laid out under zoom quantizes to device pixels, so the rendered
     block can stand taller than natH x s — with the section cards
     in here that reached ~30px, and the wrap would clip the bottom
     card. If the spill fits the room, the wrap grows into it; if
     not, the zoom (never the wrap) shrinks by the measured excess,
     which is roughly constant in rendered pixels. */
  for(var fi = 0; fi < 3 && s > 0.05; fi++){
    var wR = wrap.scrollHeight, wH = wrap.clientHeight;
    if(!(wR > wH + 1)) break;
    if(wR <= roomH){ wrap.style.height = wR + 'px'; break; }
    var wQ = wR - natH * s;
    var s2 = Math.max(0.05, (roomH - wQ) / Math.max(1, natH));
    if(s2 >= s) break;
    s = s2;
    fit.style.zoom = s;
    wrap.style.width = Math.ceil(natW * s) + 'px';
    wrap.style.height = roomH + 'px';
  }
}
function lcRenderOpen(v){
  var A = S.audit, di = A.lcOpen, e = D.directory[di];
  if(!e){ A.lcOpen = null; viewAudit(v); return; }
  /* The shared profile editors key off S.prof: point it at the open
     person (fresh edit state on first open; preserved across
     re-renders of the same person so an open editor survives). */
  if(!S.prof || S.prof.di !== di) S.prof = { di:di, edit:{}, open:{}, evEdit:null, degEdit:null, skOpen:null, more:false };
  var note = lcNote(e);
  /* An unsaved note draft survives re-renders (undo refresh, quiet
     data refresh): the dock field is only ever reset by Save. */
  var oldTa = $('#lcnote'), draft = oldTa ? oldTa.value : null;
  v.innerHTML = '<div class="page lc-page" id="lcpage">' +
    '<div class="lc-fitwrap" id="lcfitwrap"><div class="lc-fit" id="lcfit">' + lcOpenHTML(di) + '</div></div>' +
    '<div class="lc-dock" id="lcdock">' +
      '<div class="lc-dockrow"><button type="button" class="btn ghost" data-act="lcback">' + ic('chevl', 15) + '<span>Back to the deck</span></button>' +
      '<span class="lc-dockname">' + esc(dispName(e)) + milBadge(e) + (note.trim() ? ' <span class="lc-mark">LC note waiting</span>' : '') + '</span><span class="sp"></span>' +
      '<button type="button" class="btn primary" data-act="lcsave">Save note</button></div>' +
      '<label class="lc-notelab" for="lcnote">Lima Charlie note — dictate every change for this profile. Luna applies it on the next run, then clears it.</label>' +
      '<textarea id="lcnote" rows="3" placeholder="e.g. Moved to Canton. Works at Rochester Regional Health now. Known him since 2019. Add SUNY Potsdam.">' + esc(draft != null ? draft : note) + '</textarea>' +
    '</div></div>';
  lcFit();
  requestAnimationFrame(function(){ lcFit(); });   /* re-fit once webfonts settle */
  setTimeout(function(){ lcFit(); }, 450);         /* final settle pass (no-op once closed) */
  if(!LC_FIT_WATCH){
    LC_FIT_WATCH = true;
    addEventListener('resize', function(){
      if(S.route && S.route.name === 'audit' && audMode() === 'lima' && S.audit && S.audit.lcOpen != null) lcFit();
    });
  }
}
/* Save is the ONLY commit for a Lima Charlie note (JD 2026-10-16):
   no debounce, no countdown, no blur save. Writes through the one
   save path; the local-wins overlay carries it until the Sheet
   bake catches up, like every other field. */
/* The one Lima Charlie commit, shared by the Audit deck and the
   profile note box (JD 2026-10-17): same txn, same patch key, same
   toast — a note saved anywhere behaves identically everywhere. */
function lcCommitNote(di, val){
  var had = lcNote(D.directory[di]).trim();
  txn('Lima Charlie note', function(){ queuePatch(di, { lima_charlie_notes: val }); });
  toast(val.trim() ? (had ? 'Note updated. Luna will apply it on the next Lima Charlie run.' : 'Note saved. Luna will apply it on the next Lima Charlie run.') : 'Note cleared.');
}
function lcSaveNote(){
  var A = S.audit; if(!A || A.lcOpen == null) return;
  var di = A.lcOpen, ta = $('#lcnote'); if(!ta) return;
  var val = ta.value;
  A.lcOpen = null;
  lcCommitNote(di, val);
  viewAudit($('#view'));
}
/* Profile-side save (JD 2026-10-17): the note box on the person's own
   profile. Save tap only — the textarea never arms, debounces or
   submits on blur, exactly like the deck. */
function plcSaveNote(){
  var di = S.prof.di, ta = $('#plima-note'); if(di == null || !ta) return;
  var val = ta.value;
  delete S.prof.edit.lima;
  lcCommitNote(di, val);
  paintProfile(di);
}

/* Wall columns (JD 2026-10-16): the wall is K independent column
   stacks — K from the wall's width at the old multicol measure
   (a 318px column + 16px gutter). Cards are dealt shortest-column-
   first by measured height. A card leaving or arriving touches only
   its own column; the survivors cannot rebalance (CSS multicol
   rebalanced the whole wall on every change — the original jump). */
function audColCount(grid){
  var w = (grid && grid.clientWidth) || 318;
  return Math.max(1, Math.floor((w + 16) / 334));
}
function audBuildWall(grid){
  var A = S.audit; if(!grid || !A || !A.shown) return;
  var k = audColCount(grid), cols = [];
  grid.innerHTML = '';
  for(var i = 0; i < k; i++){
    var c = document.createElement('div');
    c.className = 'aud-col';
    grid.appendChild(c); cols.push(c);
  }
  A.shown.forEach(function(x, i){
    var tmp = document.createElement('div');
    tmp.innerHTML = audCardHTML(x, i);
    var nc = tmp.firstChild;
    var tgt = cols[0];
    for(var j = 1; j < cols.length; j++) if(cols[j].offsetHeight < tgt.offsetHeight) tgt = cols[j];
    tgt.appendChild(nc);
    audWireCard(nc);
  });
}
/* On a viewport resize that changes the column count, re-deal the
   EXISTING card nodes (values, wiring and focus ride along — nothing
   is re-rendered). Never while JD is mid-interaction: the flex
   columns just breathe until he is done. */
var AUD_COL_WATCH = false;
function audWatchCols(){
  if(AUD_COL_WATCH) return; AUD_COL_WATCH = true;
  var t = null;
  addEventListener('resize', function(){
    clearTimeout(t);
    t = setTimeout(function(){
      if(!S.route || S.route.name !== 'audit' || audMode() === 'rapid') return;
      var grid = $('#audgrid'); if(!grid) return;
      var cols = $$('.aud-col', grid), k = audColCount(grid);
      if(!cols.length || cols.length === k || refreshBusy()) return;
      var cards = $$('.aud-card', grid);
      grid.innerHTML = '';
      var fresh = [];
      for(var i = 0; i < k; i++){ var c = document.createElement('div'); c.className = 'aud-col'; grid.appendChild(c); fresh.push(c); }
      cards.forEach(function(nc){
        var tgt = fresh[0];
        for(var j = 1; j < fresh.length; j++) if(fresh[j].offsetHeight < tgt.offsetHeight) tgt = fresh[j];
        tgt.appendChild(nc);
      });
    }, 180);
  });
}

/* ============================================================
   Years Known run (JD 2026-10-26): a full-screen, one-contact-at-a-
   time runner for the Known Since field. Expanded year / month /
   day lists with full keyboard control: Up/Down move, Left/Right
   or Tab switch column, digits type the value (4-digit years jump
   ahead a column), Enter saves and moves on, S skips, Backspace
   clears a segment, Esc leaves. Saves ride setField, the same path
   as every other editor. The queue runs missing-years first. */
var YK = null;
function ykQueue(){
  var miss = [], have = [];
  /* A years gap JD already dismissed ("Done with them") stays closed here
     too — the runner used to ignore audit_dismissed entirely, so a
     dismissed person kept resurfacing in this queue (JD 2026-10-27). */
  people().forEach(function(di){
    if(audDismissedServer(di).indexOf('years') >= 0 || AUD_DISMISS[audPair(di, 'years')]) return;
    (knownSinceYear(D.directory[di]) ? have : miss).push(di);
  });
  var byName = function(a, b){ return dispName(D.directory[a]).localeCompare(dispName(D.directory[b])); };
  miss.sort(byName); have.sort(byName);
  return miss.concat(have);
}
function ykState(){
  if(!YK) YK = { q: ykQueue(), i: 0, col: 0, y: 0, m: 0, d: 0, buf: '', bufT: 0, saved: 0 };
  return YK;
}
function ykLoad(){
  var st = ykState(), e = D.directory[st.q[st.i]];
  var p = e ? ksParts(e) : null;
  st.y = p ? p.y : 0; st.m = p ? p.mo : 0; st.d = p ? p.d : 0; st.buf = '';
}
function ykCols(){
  var curY = new Date().getFullYear(), yrs = [{ v: 0, l: 'Not set' }];
  for(var y = curY; y >= 1990; y--) yrs.push({ v: y, l: String(y) });
  var mons = [{ v: 0, l: '—' }]; KS_MONTHS.forEach(function(mn, ix){ mons.push({ v: ix + 1, l: mn }); });
  var days = [{ v: 0, l: '—' }]; for(var d = 1; d <= 31; d++) days.push({ v: d, l: String(d) });
  return [yrs, mons, days];
}
function ykVal(){
  var st = ykState();
  if(!st.y) return '';
  var dim = [31, (st.y % 4 === 0 && (st.y % 100 !== 0 || st.y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var d = st.d; if(st.m && d > dim[st.m - 1]) d = dim[st.m - 1];
  return String(st.y) + (st.m ? '-' + String(st.m).padStart(2, '0') + (d ? '-' + String(d).padStart(2, '0') : '') : '');
}
function ykRender(){
  var w = $('#ykwrap'); if(!w) return;
  var st = ykState();
  if(!st.q.length){ w.innerHTML = '<div class="aud-caught"><h3>Nobody in the directory</h3></div>'; return; }
  if(st.i >= st.q.length){
    w.innerHTML = '<div class="aud-caught">' + ic('check', 26) + '<h3>Run complete</h3><p><span class="ahn-s">' + st.saved + '</span> saved this run. Everyone has had a pass.</p><p><button type="button" class="btn primary" data-act="ykrestart">Start over</button></p></div>' + ykToolsHTML();
    ykWirePresetEdit(w);
    return;
  }
  var di = st.q[st.i], e = D.directory[di];
  var missing = st.q.filter(function(x){ return !knownSinceYear(D.directory[x]); }).length;
  var cols = ykCols(), sel = [st.y, st.m, st.d], heads = ['Year', 'Month', 'Day'];
  var colsHTML = cols.map(function(items, ci){
    return '<div class="yk-col' + (st.col === ci ? ' focus' : '') + '"><h4>' + heads[ci] + '</h4><div class="yk-list" data-col="' + ci + '">' +
      items.map(function(it){ return '<button type="button" class="yk-it' + (sel[ci] === it.v ? ' on' : '') + '" data-act="ykpick" data-c="' + ci + '" data-v="' + it.v + '">' + esc(it.l) + '</button>'; }).join('') + '</div></div>';
  }).join('');
  var nv = ykVal();
  w.innerHTML = '<div class="yk">' +
    '<div class="yk-head">' + avatar(e, 'lg') + '<div class="yk-who"><button type="button" class="aud-name yk-name" data-act="audopen" data-di="' + di + '">' + esc(dispName(e)) + '</button>' +
    '<p class="dim yk-cur">On file: ' + (knownSinceLabel(e) || 'not set') + ' &middot; Will save: <b>' + (nv ? esc(knownSinceLabel({ profile: { years_known: nv } })) : 'not set') + '</b></p>' +
    '<p class="dim yk-prog">Person <span class="ahn-s">' + (st.i + 1) + '</span> of ' + st.q.length + ' &middot; <span class="ahn-s">' + missing + '</span> still missing a year &middot; <span class="ahn-s">' + st.saved + '</span> saved this run</p>' + ykToolsHTML() + '</div></div>' +
    '<div class="yk-cols">' + colsHTML + '</div>' +
    '<div class="yk-foot"><button type="button" class="btn ghost" data-act="ykskip">Skip (S)</button><button type="button" class="btn primary" data-act="yksave">Save &amp; next (Enter)</button>' +
    '<span class="dim yk-keys">Up/Down move &middot; Left/Right column &middot; type digits to jump &middot; Backspace clears &middot; Esc exits</span></div></div>';
  var on = w.querySelector('.yk-col.focus .yk-it.on');
  if(on) on.scrollIntoView({ block: 'nearest' });
  ykWirePresetEdit(w);
}
function ykWirePresetEdit(w){
  if(YK_EDIT == null) return;
  var inp = (w || document).querySelector('#ykpe');
  if(!inp) return;
  inp.focus(); inp.select();
  inp.addEventListener('keydown', function(ev){
    if(ev.key === 'Enter'){ ykPresetEditCommit(); ev.preventDefault(); }
    else if(ev.key === 'Escape'){ YK_EDIT = null; ykRender(); ev.preventDefault(); }
    ev.stopPropagation();
  });
}
function ykAdvance(){ var st = ykState(); st.i++; st.col = 0; if(st.i < st.q.length) ykLoad(); ykRender(); }
function ykSave(){
  var st = ykState(); if(st.i >= st.q.length) return;
  var di = st.q[st.i], e = D.directory[di], v = ykVal();
  if(String(gv(e, 'years_known') || '') !== v){ setField(di, 'years_known', v); st.saved++; }
  ykAdvance();
}
function ykKeysInit(){
  if(window.__ykKeys) return; window.__ykKeys = true;
  document.addEventListener('keydown', function(ev){
    if(S.route.name !== 'audit' || !S.audit || audMode() !== 'years') return;
    if(document.body.classList.contains('sheet-open')) return;
    var t = ev.target; if(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    var st = ykState(); if(st.i >= st.q.length) return;
    var cols = ykCols(), items = cols[st.col], sel = [st.y, st.m, st.d][st.col];
    var ix = items.findIndex(function(it){ return it.v === sel; }); if(ix < 0) ix = 0;
    var set = function(v){ if(st.col === 0) st.y = v; else if(st.col === 1) st.m = v; else st.d = v; };
    var k = ev.key;
    if(k === 'ArrowDown'){ set(items[Math.min(items.length - 1, ix + 1)].v); st.buf = ''; ykRender(); ev.preventDefault(); }
    else if(k === 'ArrowUp'){ set(items[Math.max(0, ix - 1)].v); st.buf = ''; ykRender(); ev.preventDefault(); }
    else if(k === 'ArrowRight' || (k === 'Tab' && !ev.shiftKey)){ st.col = (st.col + 1) % 3; st.buf = ''; ykRender(); ev.preventDefault(); }
    else if(k === 'ArrowLeft' || (k === 'Tab' && ev.shiftKey)){ st.col = (st.col + 2) % 3; st.buf = ''; ykRender(); ev.preventDefault(); }
    else if(k === 'Home'){ set(items[0].v); st.buf = ''; ykRender(); ev.preventDefault(); }
    else if(k === 'End'){ set(items[items.length - 1].v); st.buf = ''; ykRender(); ev.preventDefault(); }
    else if(k === 'PageDown'){ set(items[Math.min(items.length - 1, ix + 10)].v); st.buf = ''; ykRender(); ev.preventDefault(); }
    else if(k === 'PageUp'){ set(items[Math.max(0, ix - 10)].v); st.buf = ''; ykRender(); ev.preventDefault(); }
    else if(k === 'Enter'){ ykSave(); ev.preventDefault(); }
    else if(k === 'Backspace' || k === 'Delete'){ set(0); st.buf = ''; ykRender(); ev.preventDefault(); }
    else if(k === 'Escape'){ audSetMode('cards'); ev.preventDefault(); }
    else if((k === 's' || k === 'S') && !ev.metaKey && !ev.ctrlKey){ ykAdvance(); ev.preventDefault(); }
    else if(/^[0-9]$/.test(k)){
      var now = Date.now(); if(now - st.bufT > 900) st.buf = '';
      st.buf += k; st.bufT = now;
      var num = parseInt(st.buf, 10);
      var hit = items.find(function(it){ return it.v === num; });
      if(hit){ set(hit.v); if(st.buf.length >= (st.col === 0 ? 4 : 2)){ st.col = Math.min(2, st.col + 1); st.buf = ''; } }
      ykRender(); ev.preventDefault();
    }
    else if(st.col === 1 && /^[a-zA-Z]$/.test(k)){
      var hits = items.filter(function(it){ return it.v > 0 && it.l.toLowerCase().indexOf(k.toLowerCase()) === 0; });
      if(hits.length){ var cur = hits.findIndex(function(it){ return it.v === st.m; }); set(hits[(cur + 1) % hits.length].v); ykRender(); ev.preventDefault(); }
    }
  });
}

/* ============================================================
   Years Known tools (JD 2026-10-27): preset dates + batch
   assign, living in the runner's header. Presets persist in
   localStorage like the app's other remembered UI state. A
   preset click is a pick: it applies the date to the current
   person and saves through ykSave/setField, the mode's
   standard path. Batch assign writes Known Since for a whole
   selection at once (overwrite included — that is the point
   for cohort corrections), also via setField.
   ============================================================ */
var YK_EDIT = null;   /* index of the preset being edited inline */
var YK_DEL = null;    /* index of the preset awaiting a delete confirm */
function ykDateVal(s){
  /* the Known Since field's own accepted formats: YYYY, YYYY-MM,
     YYYY-MM-DD (same ranges ksParts reads back) */
  s = String(s || '').trim();
  var m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(s);
  if(!m) return null;
  var y = +m[1]; if(y < 1900 || y > 2100) return null;
  var mo = m[2] ? +m[2] : 0, d = m[3] ? +m[3] : 0;
  if(mo > 12 || d > 31) return null;
  if(mo && d){
    var dim = [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
    if(d > dim) return null;
  }
  return s;
}
function ykLabelOf(v){ return knownSinceLabel({ profile:{ years_known: v } }); }
/* Last known contact (JD 2026-10-28): a typable flexible date (year,
   year-month, or full date — same grammar as years_known) plus a binary
   online tick. Contact history itself lives in the events stream as
   kind:'contact' entries; the field is the headline the hero shows. */
function lcLabel(e){ var v = String(gv(e, 'last_contact') || '').trim(); return v ? ykLabelOf(v) : ''; }
function lcOnline(e){ return String(gv(e, 'last_contact_online') || '').trim().toLowerCase() === 'yes'; }
function lcDateLabel(d){ return d ? ykLabelOf(String(d)) : ''; }
function lcGlobe(sz){ return '<svg class="lc-globe" width="' + (sz || 12) + '" height="' + (sz || 12) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" role="img" aria-label="Online"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 3.9 5.7 3.9 9s-1.4 6.4-3.9 9c-2.5-2.6-3.9-5.7-3.9-9S9.5 5.6 12 3z"/></svg>'; }
function lcTag(ev){ return ev.kind === 'contact' ? ' <span class="lc-tag">' + (ev.online ? lcGlobe(11) : '') + 'Contact</span>' : ''; }
/* flexible-date sort key (People pass 2026-10-28): the START of the stated
   period in ms — 2026 counts from Jan 1, 2026-10 from Oct 1 — or null when
   the value is not a parseable flexible date. */
function flexKey(v){
  var m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(v || '').trim());
  if(!m) return null;
  var y = +m[1]; if(y < 1900 || y > 2100) return null;
  var mo = m[2] ? +m[2] : 1, d = m[3] ? +m[3] : 1;
  if(mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(y, mo - 1, d).getTime();
}
/* First known contact (JD 2026-10-28): the Sheet's First Contact value when
   set, else the earliest contact event on file. Returns the stored string. */
function firstContactOf(e){
  var bk = String(gv(e, 'first_contact') || '').trim();
  if(bk) return bk;
  var best = '', bk2 = null;
  (e.events || []).forEach(function(ev){
    if(!ev || ev.kind !== 'contact' || !ev.date) return;
    var k = flexKey(ev.date);
    if(k == null) return;
    if(bk2 == null || k < bk2){ bk2 = k; best = String(ev.date); }
  });
  return best;
}
/* Recency buckets for the By-last-contact view: rolling windows ending
   today (week <= 7d, month <= 31d, quarter <= 92d, year <= 366d). */
var LC_BUCKETS = ['This week', 'This month', 'This quarter', 'This year', 'Over a year', 'No contact logged'];
function lcBucket(e){
  var k = flexKey(gv(e, 'last_contact'));
  if(k == null) return 5;
  var now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  var days = Math.floor((start - k) / 86400000);
  if(days <= 7) return 0;
  if(days <= 31) return 1;
  if(days <= 92) return 2;
  if(days <= 366) return 3;
  return 4;
}
function ykPresets(){
  try{ var a = JSON.parse(store('ncc_yk_presets') || '[]'); return Array.isArray(a) ? a.filter(function(x){ return !!ykDateVal(x); }) : []; }catch(x){ return []; }
}
function ykSetPresets(a){ store('ncc_yk_presets', JSON.stringify(a)); }
function ykToolsHTML(){
  var ps = ykPresets(), v = ykVal();
  var chips = ps.map(function(pv, i){
    if(YK_EDIT === i){
      return '<span class="yk-chip editing"><input id="ykpe" type="text" value="' + esc(pv) + '" size="11" autocomplete="off" aria-label="Edit preset date"><button type="button" class="yk-chipb ok" data-act="ykpesave" title="Save preset">' + ic('check', 12) + '</button><button type="button" class="yk-chipb" data-act="ykpecancel" title="Cancel">' + ic('x', 12) + '</button></span>';
    }
    if(YK_DEL === i){
      return '<span class="yk-chip confirm"><span class="yk-chil">Delete ' + esc(ykLabelOf(pv)) + '?</span><button type="button" class="yk-chipb danger" data-act="ykpedel" data-i="' + i + '">Delete</button><button type="button" class="yk-chipb" data-act="ykpedelx">Keep</button></span>';
    }
    return '<span class="yk-chip"><button type="button" class="yk-chipb main" data-act="ykpreset" data-i="' + i + '" title="Apply this date to the current person and save">' + esc(ykLabelOf(pv)) + '</button><button type="button" class="yk-chipb icob" data-act="ykpeedit" data-i="' + i + '" title="Edit preset">' + ic('edit', 11) + '</button><button type="button" class="yk-chipb icob" data-act="ykpedel" data-i="' + i + '" title="Delete preset">' + ic('x', 11) + '</button></span>';
  }).join('');
  var canAdd = !!v && ps.indexOf(v) < 0;
  return '<div class="yk-tools"><span class="yk-tools-l">Presets</span>' + chips +
    '<button type="button" class="btn ghost sm" data-act="ykpeadd"' + (canAdd ? '' : ' disabled') + '>Save as preset</button>' +
    '<span class="sp"></span><button type="button" class="btn ghost sm" data-act="ykbatch">Batch assign</button></div>';
}
function ykPresetApply(i){
  var v = ykPresets()[i]; if(!v) return;
  var p = ksParts({ profile:{ years_known: v } }); if(!p) return;
  var st = ykState(); st.y = p.y; st.m = p.mo; st.d = p.d; st.buf = '';
  ykSave();
}
function ykPresetEditCommit(){
  var inp = document.querySelector('#ykpe'); if(!inp || YK_EDIT == null) return;
  var v = ykDateVal(inp.value);
  if(!v){ inp.classList.add('bad'); inp.focus(); return; }
  var a = ykPresets();
  a[YK_EDIT] = v;
  a = a.filter(function(x, ix){ return a.indexOf(x) === ix; });
  ykSetPresets(a); YK_EDIT = null; ykRender();
}

/* ---------- Batch assign panel ---------- */
var YKB = null;   /* {date, q, sel:{di:true}, prevFocus, done:{saved, fails, v}|null} */
function ykBatchGroups(){
  var map = {};
  people().forEach(function(di){ personGroups(D.directory[di]).forEach(function(g){ (map[g] = map[g] || []).push(di); }); });
  return Object.keys(map).sort(function(a, b){ return a.localeCompare(b); }).map(function(g){ return { name:g, dis:map[g] }; });
}
function ykBatchResults(){
  if(!YKB) return [];
  var q = YKB.q.trim().toLowerCase();
  return people().filter(function(di){ return !q || dispName(D.directory[di]).toLowerCase().indexOf(q) >= 0; });
}
function ykBatchOpen(opener){
  if(YKB) ykBatchClose(true);
  YKB = { date:'', q:'', sel:{}, prevFocus: opener || document.activeElement, done:null };
  var groups = ykBatchGroups();
  var ov = document.createElement('div');
  ov.className = 'ykb-wrap'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Batch assign Known Since');
  ov.innerHTML = '<div class="ykb-scrim" data-act="ykbx"></div>' +
    '<div class="ykb"><div class="ykb-h"><b>Batch assign &mdash; Known Since</b><span class="sp"></span><button type="button" class="ib" data-act="ykbx" aria-label="Close">' + ic('x', 16) + '</button></div>' +
    '<div class="ykb-row"><label class="ykb-lab">Date <input id="ykbdate" type="text" placeholder="YYYY, YYYY-MM, or YYYY-MM-DD" autocomplete="off"></label><span id="ykbdateok" class="dim"></span></div>' +
    '<div class="ykb-row"><input id="ykbq" type="search" placeholder="Search names" autocomplete="off">' +
    '<select id="ykbgrp" aria-label="Select all in group"><option value="">Select all in group&hellip;</option>' + groups.map(function(g){ return '<option value="' + esc(g.name) + '">' + esc(g.name) + ' (' + g.dis.length + ')</option>'; }).join('') + '</select></div>' +
    '<div class="ykb-bar"><button type="button" class="btn ghost sm" data-act="ykball">Select all results</button><button type="button" class="btn ghost sm" data-act="ykbclear">Clear</button><span id="ykbcount" class="dim"></span></div>' +
    '<div class="ykb-list" id="ykblist"></div>' +
    '<p id="ykbconfirm" class="ykb-confirm"></p><div id="ykbdone"></div>' +
    '<div class="ykb-foot"><span class="sp"></span><button type="button" class="btn ghost" data-act="ykbx">Cancel</button><button type="button" class="btn primary" data-act="ykbassign" id="ykbassignbtn" disabled>Assign</button></div></div>';
  document.body.appendChild(ov);
  document.body.classList.add('sheet-open');
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ ov.classList.add('open'); }); });
  var dInp = ov.querySelector('#ykbdate'), qInp = ov.querySelector('#ykbq'), gSel = ov.querySelector('#ykbgrp');
  dInp.addEventListener('input', function(){ YKB.date = dInp.value; YKB.done = null; ykBatchPaintMeta(); });
  qInp.addEventListener('input', function(){ YKB.q = qInp.value; ykBatchPaintList(); });
  gSel.addEventListener('change', function(){
    if(!gSel.value) return;
    var g = ykBatchGroups().filter(function(x){ return x.name === gSel.value; })[0];
    if(g) g.dis.forEach(function(di){ YKB.sel[di] = true; });
    gSel.value = '';
    ykBatchPaintList();
  });
  ov.querySelector('#ykblist').addEventListener('change', function(ev){
    var cb = ev.target; if(!cb || cb.type !== 'checkbox') return;
    var di = +cb.getAttribute('data-di');
    if(cb.checked) YKB.sel[di] = true; else delete YKB.sel[di];
    ykBatchPaintMeta();
  });
  ykBatchPaintList();
  dInp.focus();
  ykBatchKeysInit();
}
function ykBatchPaintList(){
  var box = document.getElementById('ykblist'); if(!box || !YKB) return;
  var res = ykBatchResults(), CAP = 300;
  var html = res.slice(0, CAP).map(function(di){
    var e = D.directory[di], gs = personGroups(e);
    return '<label class="ykb-it"><input type="checkbox" data-di="' + di + '"' + (YKB.sel[di] ? ' checked' : '') + '><span class="ykb-nm">' + esc(dispName(e)) + '</span><span class="ykb-ks">' + (knownSinceLabel(e) || 'not set') + '</span>' + (gs.length ? '<span class="ykb-grp">' + esc(gs.join(', ')) + '</span>' : '') + '</label>';
  }).join('');
  if(!res.length) html = '<p class="dim ykb-none">No names match.</p>';
  else if(res.length > CAP) html += '<p class="dim ykb-none">Showing ' + CAP + ' of ' + res.length + ' &mdash; refine the search to see the rest. Select all results still covers all ' + res.length + '.</p>';
  box.innerHTML = html;
  ykBatchPaintMeta();
}
function ykBatchPaintMeta(){
  if(!YKB) return;
  var dis = Object.keys(YKB.sel).filter(function(k){ return YKB.sel[k]; });
  var blank = 0, over = 0;
  dis.forEach(function(k){ var e = D.directory[k]; if(e && String(gv(e, 'years_known') || '').trim()) over++; else blank++; });
  var cnt = document.getElementById('ykbcount'); if(cnt) cnt.textContent = dis.length + ' selected';
  var v = ykDateVal(YKB.date);
  var ok = document.getElementById('ykbdateok');
  if(ok){ ok.textContent = YKB.date.trim() ? (v ? ykLabelOf(v) : 'Not a valid date') : ''; ok.classList.toggle('bad', !!YKB.date.trim() && !v); }
  var cf = document.getElementById('ykbconfirm');
  if(cf) cf.innerHTML = (v && dis.length) ? 'Assign <b>' + esc(ykLabelOf(v)) + '</b> to <b>' + dis.length + '</b> ' + (dis.length === 1 ? 'person' : 'people') + ' &mdash; ' + blank + (blank === 1 ? ' has' : ' have') + ' no date yet, ' + over + ' will be overwritten.' : '';
  var btn = document.getElementById('ykbassignbtn'); if(btn) btn.disabled = !(v && dis.length);
  var dn = document.getElementById('ykbdone');
  if(dn){
    if(YKB.done){
      dn.innerHTML = '<p class="ykb-done">' + ic('check', 14) + ' Saved ' + YKB.done.saved + ' with ' + esc(ykLabelOf(YKB.done.v)) + '.' + (YKB.done.fails.length ? ' ' + YKB.done.fails.length + ' failed:' : '') + '</p>' +
        (YKB.done.fails.length ? '<ul class="ykb-fails">' + YKB.done.fails.map(function(f){ return '<li>' + esc(f.name) + ' &mdash; ' + esc(f.why) + '</li>'; }).join('') + '</ul>' : '');
    } else dn.innerHTML = '';
  }
}
function ykBatchRun(){
  if(!YKB) return;
  var v = ykDateVal(YKB.date); if(!v) return;
  var dis = Object.keys(YKB.sel).filter(function(k){ return YKB.sel[k]; });
  var saved = 0, fails = [];
  dis.forEach(function(k){
    var di = +k, e = D.directory[di];
    if(!e){ fails.push({ name:'Person #' + k, why:'not in the directory' }); return; }
    try{ setField(di, 'years_known', v); saved++; }
    catch(err){ fails.push({ name: dispName(e), why: String((err && err.message) || err) }); }
  });
  YKB.done = { saved: saved, fails: fails, v: v };
  ykBatchPaintMeta(); ykBatchPaintList();
  ykRender();
}
function ykBatchClose(instant){
  var ov = document.querySelector('.ykb-wrap');
  var pf = YKB && YKB.prevFocus;
  YKB = null;
  if(ov){ if(instant) ov.remove(); else { ov.classList.remove('open'); setTimeout(function(){ ov.remove(); }, 240); } }
  if(!document.querySelector('.phi-wrap') && !document.querySelector('.phed-wrap')) document.body.classList.remove('sheet-open');
  if(pf && document.contains(pf) && pf.focus) pf.focus();
  else { var nb = document.querySelector('[data-act="ykbatch"]'); if(nb) nb.focus(); }
}
function ykBatchKeysInit(){
  if(window.__ykbKeys) return; window.__ykbKeys = true;
  document.addEventListener('keydown', function(ev){
    if(!YKB) return;
    if(ev.key === 'Escape'){ ykBatchClose(); ev.preventDefault(); ev.stopPropagation(); }
  }, true);
}

function viewAudit(v){
  if(!S.audit) S.audit = { done:0, shown:null, deck:null, mode:(store('ncc_aud_mode') || 'cards'), cat:null, streak:0, best:0, fills:[], finished:0, catDone:{}, blitz:null, blitzDone:null, lcDeck:null, lcOpen:null };
  if(['cards', 'lima', 'photos', 'years'].indexOf(S.audit.mode) < 0) S.audit.mode = 'cards';
  if(S.audit._paceIv){ clearInterval(S.audit._paceIv); S.audit._paceIv = null; }
  if(!S.audit.shown) audDealMode();
  var m = audMode();
  var ykMissN = people().filter(function(di){ return !knownSinceYear(D.directory[di]) && audDismissedServer(di).indexOf('years') < 0 && !AUD_DISMISS[audPair(di, 'years')]; }).length;
  if(m === 'lima' && S.audit.lcOpen != null && D.directory[S.audit.lcOpen]){ lcRenderOpen(v); return; }
  /* Design cleanup (JD 2026-10-28): modes, goal and the mode bar move
     INTO the hero banner; the deck starts right under it. */
  v.innerHTML = '<div class="page audit"><div class="pagehead"><div class="aud-headrow"><div><h1 class="display">Audit</h1><p class="sub" id="audsub"></p></div>' +
    '<span class="aud-head-btns"><button type="button" class="btn ghost" data-act="audlater" id="audlaterbtn" hidden>' + ic('today', 15) + '<span>Saved for later (<span id="audlaterN">0</span>)</span></button>' +
    '<button type="button" class="btn ghost" data-act="audshuffle">' + ic('reset', 15) + '<span>Shuffle</span></button></span></div>' +
    '<div class="aud-tools">' + audModesHTML() +
    '<span class="aud-goal"><span class="aud-goal-l">Today\'s goal</span><span class="aud-goal-bar"><i id="audgoalfill"></i></span><span id="audgoalt"></span>' +
    '<button type="button" class="aud-goal-b" data-act="audgoal" data-d="-5" aria-label="Lower the goal by 5">−</button><button type="button" class="aud-goal-b" data-act="audgoal" data-d="5" aria-label="Raise the goal by 5">+</button></span></div>' +
    '<div id="audmodebar">' + audModeBarHTML() + '</div></div>' +
    '<div id="audpool" class="audpool"></div>' +
    (m === 'years' ? '' : '<button type="button" class="aud-ykstrip" data-act="audmode" data-m="years">' + ic('calendar', 15) + '<span class="aud-ykstrip-t"><b>Years Known</b><small>One person at a time \u2014 big year, month and day lists, keyboard friendly</small></span><span class="sp"></span><span class="aud-ykstrip-n">' + ykMissN + ' missing a year</span><span class="aud-ykstrip-go">Open &rarr;</span></button>') +
    (m === 'rapid'
      ? '<div class="aud-stage-wrap"><div class="aud-stack" id="audstack"><div class="aud-peek p2"></div><div class="aud-peek p1"></div><div class="aud-grid aud-stage" id="audgrid"></div></div></div>'
      : m === 'lima' ? '<div id="lcwrap"></div>' : m === 'photos' ? '<div id="phawrap"></div>' : m === 'years' ? '<div id="ykwrap"></div>' : '<div class="aud-grid" id="audgrid"></div>') +
    '<div id="audempty"></div>' +
    '<div class="aud-toast" id="audtoast" hidden role="status"></div></div>';
  var grid = $('#audgrid');
  if(m === 'lima'){ lcRender(); }
  else if(m === 'photos'){ phaRender(); }
  else if(m === 'years'){ if(!YK) ykLoad(); ykKeysInit(); ykRender(); }
  else if(S.audit.blitzDone){
    grid.innerHTML = '<div class="aud-caught aud-blitzsum"><h3>Blitz over</h3>' +
      '<p class="aud-blitzstats"><b>' + S.audit.blitzDone.fills + '</b> fills · best streak <b>' + S.audit.blitzDone.best + '</b> · <b>' + (S.audit.blitzDone.fills / 2).toFixed(1) + '</b> per minute</p>' +
      '<p><button type="button" class="btn primary" data-act="audblitz">Go again</button> <button type="button" class="btn ghost" data-act="audblitzx">Back to Rapid Fire</button></p></div>';
  } else if(m === 'rapid') {
    grid.innerHTML = S.audit.shown.map(function(x, i){ return audCardHTML(x, i); }).join('');
    $$('.aud-card', grid).forEach(audWireCard);
    /* Rapid Fire opens with the keyboard live (JD 2026-10-16): focus
       the stage card's editor on render, unless focus is already
       inside it (a re-render under the user's hands must not yank
       the caret — quietRefresh defers those rebuilds anyway). */
    var fc = $('.aud-card', grid);
    if(fc && !fc.contains(document.activeElement)) audFocusEditor(fc);
  } else {
    audBuildWall(grid);
    audWatchCols();
  }
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
  history.replaceState({ d:S.depth }, '', '#/p/' + encodeURIComponent(personId(D.directory[di]))); histNote(); render(); window.scrollTo(0, 0); var vw = $('#view'); if(vw) vw.scrollTop = 0;
}
function doSet(el){
  var di = curDi(el), k = el.getAttribute('data-k'), v = el.getAttribute('data-v'), e = D.directory[di];
  if(!e) return;
  var cur = String(k === 'tier' ? tierOf(e) : gv(e, k));
  var clearable = ['relationship', 'context', 'category', 'closeness'].indexOf(k) >= 0;
  var next = (clearable && cur === v) ? '' : v;
  txn('Set ' + k, function(){ queuePatch(di, (function(){ var o = {}; o[k] = next; return o; })()); });
  if(S.route.name === 'profile'){ repaintTop(); var sec = el.getAttribute('data-sec'); if(sec) repaintSec(sec); }
  else if(lcActive() && di === S.audit.lcOpen) lcRepaint();
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
  box.innerHTML = hits.length ? hits.map(function(d){ return '<button type="button" class="hit" data-act="' + act + '" data-di="' + d + '" data-g="' + esc(inp.getAttribute('data-g') || '') + '">' + avatar(D.directory[d], 'sm') + '<span>' + esc(dispName(D.directory[d])) + milBadge(D.directory[d]) + '<small>' + esc(infoLine(D.directory[d])) + '</small></span></button>'; }).join('') : '<div class="hit none">No matches</div>';
}

function onClick(ev){
  var t = ev.target;
  if(!t.closest('.menu')) $$('.menu-pop').forEach(function(m){ m.hidden = true; });
  if(!t.closest('.gsearch')){ var gb = $('#gsr'); if(gb) gb.hidden = true; }
  if(!t.closest('.netfind')){ var nb = $('#netfr'); if(nb) nb.hidden = true; }
  var el = t.closest('[data-act]'); if(!el) return;
  if(el.tagName === 'INPUT') return;   /* checkboxes and radios are handled on change */
  var act = el.getAttribute('data-act'), di = curDi(el);
  if(el.tagName === 'A' && (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button === 1)) return;
  var prevent = true;
  switch(act){
    case 'cn-stage': cnStage(el.getAttribute('data-flag'), el.getAttribute('data-action')); break;
    case 'cn-now': cnDoNow(el.getAttribute('data-flag'), el.getAttribute('data-action')); break;
    case 'cn-unstage': cnUnstage(el.getAttribute('data-flag'), el.getAttribute('data-action')); break;
    case 'cn-exec-all': cnExecAll(); break;
    case 'cn-clear': cnClearStaged(); break;
    case 'sheetx': closeSheet(); break;
    case 'savekey': { var kv = ($('#ekey') || {}).value || ''; store('ncc_edit_key', kv.trim()); OUT.auth = false; closeSheet(); OUT.retry = 0; outKick(); toast('Key saved. Retrying.'); break; }
    case 'undo': doUndo(); refreshAfterUndo('undo'); break;
    case 'redo': doRedo(); refreshAfterUndo('redo'); break;
    case 'retry': OUT.retry = 0; OUT.err = ''; outKick(); paintSync(); break;
    case 'pool': poolOpen(); break;
    case 'poolclose': poolClose(); break;
    case 'poolretry': OUT.items.forEach(function(x){ x.tries = 0; x.stuck = ''; }); OUT.retry = 0; OUT.err = ''; outKick(); paintSync(); break;
    case 'poolretry1': { var prid = el.getAttribute('data-id'); OUT.items.forEach(function(x){ if(x.id === prid){ x.tries = 0; x.stuck = ''; x.err = ''; } }); OUT.retry = 0; OUT.err = ''; outKick(); paintSync(); break; }
    case 'pooldrop': { var pdid = el.getAttribute('data-id'); if(el.getAttribute('data-armed')){ OUT.items = OUT.items.filter(function(x){ return x.id !== pdid; }); outSave(); paintSync(); toast('Change discarded. It never reached the Sheet.'); } else { el.setAttribute('data-armed', '1'); el.textContent = 'Tap again to discard'; } break; }
    case 'mlx': { var mk = el.getAttribute('data-key'); MLV.open = (MLV.open === mk) ? null : mk; mlRender(); break; }
    case 'mlopen': { var mdis = MLV.shown.length ? MLV.shown : [di]; if(mdis.indexOf(di) < 0) mdis = [di]; openPerson(di, ctxFrom('Master List', mdis, mdis.indexOf(di), 'lists')); break; }
    case 'mlrm': { var rke = taxEntities().ents[el.getAttribute('data-key')]; if(rke) mlRemoveMember(rke, +(el.getAttribute('data-di'))); break; }
    case 'mlfind': { var fke = taxEntities().ents[el.getAttribute('data-key')]; var fdet = el.closest('.ml-det'); var fin = fdet ? fdet.querySelector('.ml-add-in') : null; var fres = fdet ? fdet.querySelector('.ml-res') : null;
      if(fke && fin && fres){ var fq = fin.value.trim().toLowerCase(); var hits = [];
        if(fq) D.directory.forEach(function(e2, d2){ if(dispName(e2).toLowerCase().indexOf(fq) >= 0 && fke.direct.indexOf(d2) < 0) hits.push(d2); });
        fres.innerHTML = hits.slice(0, 8).map(function(d2){ return '<button type="button" class="btn sm ml-hit" data-act="mladd" data-key="' + esc(fke.key) + '" data-di="' + d2 + '">' + esc(dispName(D.directory[d2])) + '</button>'; }).join('') || '<span class="ml-none">No matches who are not already in.</span>';
      } break; }
    case 'mladd': { var ake = taxEntities().ents[el.getAttribute('data-key')]; if(ake) mlAddMember(ake, +(el.getAttribute('data-di'))); break; }
    case 'mlmore': { var msec = el.getAttribute('data-sec'); MLV.more[msec] = !MLV.more[msec]; mlRender(); break; }
    case 'chggrp': chgToggle(el); break;
    case 'phconfirm': { phSetReview(el.getAttribute('data-pname'), 'confirmed'); if(S.route.name === 'profile') repaintTop(); break; }
    case 'phadjust': phEditor(el.getAttribute('data-pname')); break;
    case 'phinsp': { var _pn = el.getAttribute('data-pname'); phInspOpen(_pn, PH_HERO_IDX[String(_pn || '').toLowerCase()]); break; }
    case 'phix': phInspClose(); break;
    case 'phidot': if(PHI && !PHI.adj) phiGo(parseInt(el.getAttribute('data-i'), 10) || 0); break;
    case 'phikey': if(PHI && !PHI.viewHid && phiCur()){ if(phApplyKey(PHI.name, phiCur().url)){ phiRender(); phiAfterEdit(); } } break;
    case 'phimove': if(PHI) phiMove(parseInt(el.getAttribute('data-d'), 10) || 0); break;
    case 'phiadj': if(PHI && !PHI.viewHid && phiCur()){ PHI.adj = true; PHI.confirmDel = false; phiRender(); } break;
    case 'phidelq': if(PHI){ PHI.confirmDel = true; phiRender(); } break;
    case 'phidelx': if(PHI){ PHI.confirmDel = false; phiRender(); } break;
    case 'phidel': phiRemove(); break;
    case 'phihidtog': if(PHI){ PHI.showHidden = !PHI.showHidden; phiRender(); } break;
    case 'phihprev': if(PHI){ PHI.viewHid = el.getAttribute('data-u'); PHI.showHidden = true; PHI.confirmDel = false; phiRender(); } break;
    case 'phiback': if(PHI){ PHI.viewHid = null; phiRender(); } break;
    case 'phirestore': phiRestore(el.getAttribute('data-u')); break;
    case 'phisave': phiSaveOrder(); break;
    case 'heroph': phHeroStep(el.getAttribute('data-pname'), parseInt(el.getAttribute('data-d'), 10) || 1); break;
    case 'herodot': (function(){ var idx2 = phIndex(), pp = idx2 && idx2[el.getAttribute('data-pname')]; if(pp){ PH_HERO_IDX[String(pp.name).toLowerCase()] = parseInt(el.getAttribute('data-i'), 10) || 0; phHeroPaint(pp.name); } })(); break;
    case 'phreject': phSetVerdict(el.getAttribute('data-pname'), 'rejected', 'wrong-person'); break;
    case 'phrejectq': { var pn2 = el.getAttribute('data-pname'); phSetVerdict(pn2, 'rejected', ''); if(S.route.name === 'profile') repaintTop(); break; }
    case 'phwrong': phSetVerdict(el.getAttribute('data-pname'), 'rejected', 'wrong-person'); break;
    case 'phnoperson': phSetVerdict(el.getAttribute('data-pname'), 'rejected', 'no-person'); break;
    case 'phundo': phSetReview(el.getAttribute('data-pname'), null); break;
    case 'phbad': phSetReview(el.getAttribute('data-pname'), 'bad'); break;
    case 'phfilt': PH_FILT = el.getAttribute('data-f') || 'all'; store('ncc_photos_filter_v1', PH_FILT); phPaintList(); break;
    case 'phmore': { var pm2 = $('#phtb-more'); if(pm2){ pm2.hidden = !pm2.hidden; el.setAttribute('aria-expanded', String(!pm2.hidden)); el.classList.toggle('on', !pm2.hidden); } break; }
    case 'phafilter': phaState().filter = el.getAttribute('data-f') || 'todo'; phaState().cur = null; viewAudit($('#view')); break;
    case 'phacur': phaState().cur = el.getAttribute('data-pname'); phaRender(); break;
    case 'phanav': phaNav(parseInt(el.getAttribute('data-d'), 10) || 1); break;
    case 'phaalt': { var anm = el.getAttribute('data-pname'); var afr = phFrameFor(anm); afr.url = el.getAttribute('data-u'); phFrameSet(anm, afr); phaRender(); break; }
    case 'phareason': phSetBadReason(el.getAttribute('data-pname'), el.getAttribute('data-r')); break;
    case 'phareaudit': phClearVerdict(el.getAttribute('data-pname')); break;
    case 'phsel': phInspOpen(el.getAttribute('data-pname')); break;
    case 'phcols': PH_COLS = parseInt(el.getAttribute('data-n'), 10) || 12; store('ncc_photos_cols_v1', String(PH_COLS)); phPaintList(); break;
    case 'phsort': PH_SORT = el.getAttribute('data-s') || 'grade'; store('ncc_photos_sort_v1', PH_SORT); phPaintList(); break;
    case 'grpsort': GRPV.sort = el.getAttribute('data-s') || 'name'; store('ncc_grp_sort_v1', GRPV.sort); render(); break;
    case 'phsdir': PH_SDIR = PH_SDIR < 0 ? 1 : -1; store('ncc_photos_sdir_v1', PH_SDIR < 0 ? 'desc' : 'asc'); phPaintList(); break;
    case 'back': { var bfb = S.ctx && S.ctx.from ? S.ctx.from : 'people'; if(bfb === 'groups' && S.ctx && S.ctx.grp) bfb = 'groups/' + S.ctx.grp; back(bfb); break; }
    case 'focus': setFocus(!focusOn()); break;
    case 'topback': topBack(); break;
    case 'topfwd': if(HIST[S.depth + 1]) history.forward(); break;
    case 'fwd': if(HIST[S.depth + 1]) history.forward(); break;
    case 'home': goHome(); break;
    case 'audpick': { var audC = el.closest('.aud-card'); if(audC){ audC.setAttribute('data-pick', el.getAttribute('data-v')); $$('.aud-pick', audC).forEach(function(b){ b.classList.toggle('on', b === el); }); audTryArm(audC); } break; }
    case 'audgap': { var audC4 = el.closest('.aud-card'); if(audC4){ var gTo = el.getAttribute('data-gap'); if(gTo && gTo !== audC4.getAttribute('data-gap')) audSetGap(audC4, gTo); } break; }
    case 'audskip': { var audC3 = el.closest('.aud-card'); if(audC3 && di != null && S.audit) audFinish(audC3, false, false); break; }
    case 'audpark': { var audC5 = el.closest('.aud-card'); if(audC5) audPark(audC5, false); break; }
    case 'audreopen': { var audC6 = el.closest('.aud-card'); if(audC6) audReopen(audC6, el.getAttribute('data-gap')); break; }
    case 'audundo': audUndoLast(); break;
    case 'audmode': if(S.audit) audSetMode(el.getAttribute('data-m')); break;
    case 'audcat': if(S.audit){ S.audit.cat = el.getAttribute('data-g'); S.audit.shown = null; viewAudit($('#view')); } break;
    case 'audcatall': if(S.audit) audSetMode('cards'); break;
    case 'audbulkphone': audBulkPhone(); break;
    case 'audgoal': { var gd = audDay(); gd.goal = Math.max(5, Math.min(500, gd.goal + (+el.getAttribute('data-d')))); if(gd.n < gd.goal) gd.met = false; audDaySave(gd); audPaintGoal(); break; }
    case 'audopen': if(di != null){ var aw = (S.audit && S.audit.shown) ? S.audit.shown.map(function(x){ return x.di; }) : []; openPerson(di, aw.length ? ctxFrom('Audit', aw, aw.indexOf(di), 'audit') : null); } break;
    case 'audshuffle': if(S.audit){ if(audMode() === 'lima'){ lcShuffleDeck(); break; } S.audit.shown = null; } viewAudit($('#view')); break;
    case 'audlater': if(S.audit){ S.audit.shown = null; } viewAudit($('#view')); break;   /* redeal: saved-for-later people come first (audDeal) */
    case 'lcopen': if(di != null && S.audit && audMode() === 'lima'){ S.audit.lcOpen = di; viewAudit($('#view')); } break;
    case 'lcback': if(S.audit){ S.audit.lcOpen = null; viewAudit($('#view')); } break;
    case 'lcshuffle': if(S.audit) lcShuffleDeck(); break;
    case 'lcsave': if(S.audit) lcSaveNote(); break;
    case 'plcsave': plcSaveNote(); break;
    case 'set': doSet(el); break;
    case 'hmiopen': hmiDispatchOpen(el); break;
    case 'hmivlist': hmiValueList(el.getAttribute('data-vk'), el); break;
    case 'hmikpi': hmiKpi(el.getAttribute('data-k'), el); break;
    case 'hmix': hmiClose(); break;
    case 'hmiback': hmiBack(); break;
    case 'hmiperson': { var hpdi = curDi(el); hmiClose(true); if(hpdi != null) openPerson(hpdi); break; }
    case 'hmgoto': if(di != null) openPerson(di); break;
    case 'hmigroup': hmiClose(true); go('groups/groups/' + encodeURIComponent(el.getAttribute('data-g'))); break;
    case 'hmiaudit': hmiClose(true); store('ncc_aud_mode', 'years'); if(S.audit){ S.audit.mode = 'years'; S.audit.shown = null; } go('audit'); break;
    case 'hmidaily': hmiClose(true); go('daily'); break;
    case 'extlink': prevent = false; break;
    case 'kspick': { var ky2 = el.getAttribute('data-y'); var curv = String(gv(D.directory[S.prof.di], 'years_known') || ''); var suf = /^\d{4}(-.*)$/.exec(curv); setField(S.prof.di, 'years_known', ky2 ? ky2 + (suf ? suf[1] : '') : ''); repaintSec('relationship'); break; }
    case 'kspickm': { var km2 = parseInt(el.getAttribute('data-m'), 10) || 0; var kp2 = ksParts(D.directory[S.prof.di]); if(!kp2){ toast('Pick a year first'); break; } setField(S.prof.di, 'years_known', String(kp2.y) + (km2 ? '-' + String(km2).padStart(2, '0') + (kp2.d ? '-' + String(kp2.d).padStart(2, '0') : '') : '')); repaintSec('relationship'); break; }
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
      if(S.route.name === 'profile'){ paintProfile(S.prof.di); } else if(lcActive()) lcRepaint(); else refreshAfterStatus();
      break;
    }
    case 'auddel': {
      var de2 = D.directory[di]; if(!de2) break;
      if(!ev.shiftKey && !confirm('Remove ' + dispName(de2) + ' from the circle?\n\nThey move to the Trash sheet and can be restored from there. (Shift-click the X to skip this confirmation.)')) break;
      txn('Remove ' + dispName(de2), function(){ queuePatch(di, { deleted:'1' }); });
      toast('Removed ' + dispName(de2) + '.', { undo:true });
      var acd = el.closest('.aud-card');
      if(acd) audRetire(acd, false);
      else if(audMode() === 'photos'){ phaState().cur = null; viewAudit($('#view')); }
      else if(lcActive()) lcRepaint();
      else refreshAfterStatus();
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
    case 'popen1': { var nw = (typeof NET !== 'undefined' && NET.nodes && NET.nodes.length) ? NET.nodes.map(function(n){ return n.di; }) : []; if(nw.indexOf(di) < 0) nw = people(); openPerson(di, nw.length ? ctxFrom('Network', nw, nw.indexOf(di), 'network') : null); break; }
    case 'gsopen': { var box = $('#gsr'); if(box) box.hidden = true; var gw = (S.ppl.cur && S.ppl.cur.length) ? S.ppl.cur : []; if(gw.indexOf(di) < 0) gw = people(); openPerson(di, ctxFrom('People', gw, gw.indexOf(di), 'people')); break; }
    case 'gopen': { var gmem = (GRPV.shown && GRPV.shown.length) ? GRPV.shown : (GRPV.detail ? grpMembersOf(GRPV.detail.kind, GRPV.detail.name) : []); if(gmem.indexOf(di) < 0) gmem = [di]; var gctx = ctxFrom(GRPV.detail ? GRPV.detail.name : 'Groups', gmem, gmem.indexOf(di), 'groups'); if(GRPV.detail) gctx.grp = GRPV.detail.kind + '/' + encodeURIComponent(GRPV.detail.name); openPerson(di, gctx); break; }
    case 'gsall': { S.ppl.q = ($('#gs') || {}).value || ''; go('people'); break; }
    case 'gsclear': { var gi = $('#gs'); if(gi){ gi.value = ''; paintSearch(); gi.focus(); } break; }
    case 'logcontact': { S.prof.edit.timeline = true; if($('#sec-timeline')) repaintSec('timeline'); else paintProfile(S.prof.di);
      setTimeout(function(){ var s = $('#lc-sum'); if(s){ s.focus(); try{ s.scrollIntoView({ block:'center' }); }catch(x){} } }, 30); break; }
    case 'gomobile': { try{ localStorage.removeItem('ncc_force_full'); }catch(x){} location.href = 'contacts-mobile.html'; break; }
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
    case 'pclear': S.ppl = { q:'', status:'all', tier:'all', rel:'', group:'', ts:{ k:'name', d:1 }, side:S.ppl.side, view:S.ppl.view }; closeSheet(); viewPeople($('#view')); break;
    case 'pplview': { var pvv = el.getAttribute('data-v'); S.ppl.view = (pvv === 'recent' || pvv === 'reach' || pvv === 'timeline') ? pvv : 'list'; viewPeople($('#view')); break; }
    case 'tlmode': { var tls1 = tlState(el.getAttribute('data-scope')); tls1.mode = el.getAttribute('data-m'); tls1.off = 0; tls1.exp = {}; tlRepaint(el.getAttribute('data-scope')); break; }
    case 'hmtlview': S.hmTlView = el.getAttribute('data-v') === 'timeline' ? 'timeline' : 'list'; viewHome($('#view')); break;
    case 'tltog': S.prof.tlVisual = el.getAttribute('data-v') === 'visual'; repaintSec('timeline'); break;
    case 'tlnav': { var tls2 = tlState(el.getAttribute('data-scope')), tld = +el.getAttribute('data-d'); tls2.off = tld === 0 ? 0 : tls2.off + tld; tlRepaint(el.getAttribute('data-scope')); break; }
    case 'tljump': { var tls3 = tlState(el.getAttribute('data-scope')); tls3.off = +el.getAttribute('data-off'); tlRepaint(el.getAttribute('data-scope')); break; }
    case 'tlmore': { var tls4 = tlState(el.getAttribute('data-scope')), tlk = el.getAttribute('data-k'); tls4.exp[tlk] = !tls4.exp[tlk]; tlRepaint(el.getAttribute('data-scope')); break; }
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
      var oldEv = S.prof.evEdit != null ? (D.directory[S.prof.di].events || [])[S.prof.evEdit] : null;
      if(oldEv && oldEv.kind) ev.kind = oldEv.kind;
      if(oldEv && oldEv.online) ev.online = true;
      var ib = $('#ev-init .on'); if(ib && ib.getAttribute('data-v')) ev.init = ib.getAttribute('data-v');
      var arr2 = (D.directory[S.prof.di].events || []).slice(); if(S.prof.evEdit != null && arr2[S.prof.evEdit]) arr2[S.prof.evEdit] = ev; else arr2.push(ev);
      saveEvents(arr2, S.prof.evEdit != null ? 'Edit event' : 'Add event'); break;
    }
    case 'lcadd': {
      var ld = $('#lc-date').value.trim(), lsum = $('#lc-sum').value.trim(), lon = $('#lc-online').checked;
      if(!lsum){ toast('Write the one line first.'); break; }
      if(ld && !audYearOk(ld)){ toast('Date needs a year, a year-month, or a full date.'); break; }
      var ldate = ld || todayStr();
      var lev = { date:ldate, summary:lsum, kind:'contact' }; if(lon) lev.online = true;
      var larr = (D.directory[S.prof.di].events || []).slice(); larr.push(lev);
      txn('Log contact', function(){ queuePatch(S.prof.di, { events:JSON.stringify(larr) }); });
      var curLc = String(gv(D.directory[S.prof.di], 'last_contact') || '').trim();
      if(!curLc || ldate >= curLc){ setField(S.prof.di, 'last_contact', ldate); setField(S.prof.di, 'last_contact_online', lon ? 'yes' : ''); }
      repaintSec('timeline'); repaintTop(); break;
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
    case 'msgopen': openCorrespondence(+el.getAttribute('data-di')); break;
    case 'placeopen': placeOpen(el.getAttribute('data-city'), el.getAttribute('data-place')); break;
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
    case 'famside': S.fam.side = !sideOpen(S.fam.side); viewFamily($('#view')); break;
    case 'famtree': S.fam.focus = di; FAM_SCROLL = true; viewFamily($('#view')); break;
    case 'netorg': { var ov = el.getAttribute('data-v'); S.net.org = ov && ov !== S.net.org ? ov : null; netCard(); NET.dirty = true; break; }
    case 'netpanel': { var pn = $('#netpanel'); if(pn) netSetPanel(pn.classList.contains('closed'), true); NET.dirty = true; break; }
    case 'netfindpick': netPickFind(di); break;
    case 'netreset': netResetView(); break;
    case 'netfocusx': { var fx = el.getAttribute('data-v'); if(fx === 'org') S.net.org = null; else S.net.sel = null; netCard(); NET.dirty = true; break; }
    case 'hmorg': { var hn = el.getAttribute('data-v'); S.net.org = hn || null; S.net.sel = null; go('network'); break; }
    case 'hmdates': HM_DATES = !HM_DATES; store('ncc_hm_dates', HM_DATES ? '1' : '0'); render(); break;
    case 'ykpick': { var yst = ykState(); yst.col = +el.getAttribute('data-c'); var yvv = +el.getAttribute('data-v'); if(yst.col === 0) yst.y = yvv; else if(yst.col === 1) yst.m = yvv; else yst.d = yvv; yst.buf = ''; ykRender(); break; }
    case 'ykpreset': ykPresetApply(+el.getAttribute('data-i')); break;
    case 'ykpeadd': { var _pv = ykVal(); if(_pv && ykPresets().indexOf(_pv) < 0){ var _pa = ykPresets(); _pa.push(_pv); ykSetPresets(_pa); } ykRender(); break; }
    case 'ykpeedit': YK_EDIT = +el.getAttribute('data-i'); YK_DEL = null; ykRender(); break;
    case 'ykpesave': ykPresetEditCommit(); break;
    case 'ykpecancel': YK_EDIT = null; ykRender(); break;
    case 'ykpedel': { var _pi = +el.getAttribute('data-i'); if(YK_DEL === _pi){ var _pd = ykPresets(); _pd.splice(_pi, 1); ykSetPresets(_pd); YK_DEL = null; } else YK_DEL = _pi; ykRender(); break; }
    case 'ykpedelx': YK_DEL = null; ykRender(); break;
    case 'ykbatch': ykBatchOpen(el); break;
    case 'ykbx': ykBatchClose(); break;
    case 'ykball': if(YKB){ ykBatchResults().forEach(function(di){ YKB.sel[di] = true; }); ykBatchPaintList(); } break;
    case 'ykbclear': if(YKB){ YKB.sel = {}; YKB.done = null; ykBatchPaintList(); } break;
    case 'ykbassign': ykBatchRun(); break;
    case 'yksave': ykSave(); break;
    case 'ykskip': ykAdvance(); break;
    case 'ykrestart': YK = null; ykLoad(); ykRender(); break;
    case 'netfs': netToggleFS(); break;
    case 'netlegend': { var lg = $('#netlegend'); if(lg){ var lgo = lg.classList.toggle('open'); el.setAttribute('aria-expanded', lgo ? 'true' : 'false'); } break; }
    case 'netzoom': { var zf = +el.getAttribute('data-d') > 0 ? 1.3 : 1 / 1.3; netGlide(200, { c2z:Math.max(0.3, Math.min(4, NET.cam.z * zf)) }); break; }
    case 'netfit': netResetView(); break;
    case 'netclose': S.net.sel = null; netCard(); NET.dirty = true; break;
    case 'fnode': { if(FAMV.moved) break; S.fam.focus = di; $$('.fn.foc').forEach(function(n){ n.classList.remove('foc'); }); el.classList.add('foc'); famCard(); famGlide(di); break; }
    case 'famclose': S.fam.focus = null; $$('.fn.foc').forEach(function(n){ n.classList.remove('foc'); }); famCard(); break;
    case 'famzoom': FAMV.cam.z = Math.max(0.2, Math.min(1.6, FAMV.cam.z * (+el.getAttribute('data-d') > 0 ? 1.25 : 0.8))); famApply(); break;
    case 'famfit': famFit(); break;
    /* groups */
    case 'gcard': { var gvw = $('#view'); GRPV.scrollY = gvw ? gvw.scrollTop : 0; prevent = false; break; }
    case 'gmgr': GMGR.on = !GMGR.on; if(!GMGR.on) GMGR.sel = {}; render(); break;
    case 'gmgrclear': GMGR.sel = {}; render(); break;
    case 'gmgrgo': {
      var gk2 = el.getAttribute('data-k'), tin = $('#gmgrt'), tgt = tin ? tin.value : '';
      if(!String(tgt || '').trim()){ toast('Type or pick the surviving name first.'); break; }
      var losers2 = Object.keys(GMGR.sel).filter(function(key){ return key.indexOf(gk2 + '|') === 0; }).map(function(key){ return key.slice(gk2.length + 1); });
      var cnt2 = grpCombine(gk2, losers2, tgt);
      GMGR.sel = {};
      toast('Combined into ' + regApply(tgt) + ' \u00b7 ' + cnt2 + ' profiles updated', { undo:true });
      go('groups/' + gk2 + '/' + encodeURIComponent(regApply(tgt)), { replace:true });
      break;
    }
    case 'gnew': { var gi2 = $('#gnew'), gn = regApply(gi2.value.trim()); if(!gn) break; if(!allGroups()[gn]){ GRP_EXTRA.push(gn); store('ncc_groups_extra', JSON.stringify(GRP_EXTRA)); } if(!ORGREG.canon[regKey(gn)]) regRegisterCanon(gn, 'groups'); go('groups/groups/' + encodeURIComponent(gn)); break; }
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

var DEB_T = {};
function debPaint(k, fn){ clearTimeout(DEB_T[k]); DEB_T[k] = setTimeout(fn, 120); }
function onInput(ev){
  var t = ev.target;
  if(t.id === 'gs'){ debPaint('gs', paintSearch); return; }
  if(t.id === 'netq'){ netPaintFind(); return; }
  if(t.id === 'pq'){ S.ppl.q = t.value; debPaint('pq', paintPeople); return; }
  if(t.id === 'phq'){ PH_QUERY = t.value; debPaint('phq', phPaintList); return; }
  if(t.id === 'assocq'){ var e = D.directory[S.prof.di]; pickerHits(t, '#assocr', 'assocadd', [S.prof.di].concat(knownAssociates(e).map(function(n){ return BYN[(n.u || '').toLowerCase()]; }))); return; }
  if(t.id === 'famq'){ pickerHits(t, '#famr', 'famadd', [S.prof.di]); return; }
  if(t.id === 'gaddq'){ var g = t.getAttribute('data-g'); pickerHits(t, '#gaddr', 'gadd', (allGroups()[g] || [])); return; }
  if(t.id === 'gq'){ GRPV.q = t.value; debPaint('gq', grpPaintCards); return; }
  if(t.id === 'gmq'){ GRPV.mq = t.value; debPaint('gmq', grpPaintMembers); return; }
  if(t.id === 'mq'){
    var q = t.value.trim(), box = $('#mr'); if(q.length < 2){ box.innerHTML = ''; return; }
    var hits = searchPeople(q, 6, people().filter(function(d){ return d !== MG.a; }));
    box.innerHTML = hits.length ? hits.map(function(d){ return '<button type="button" class="hit" data-act="mpick" data-di="' + d + '">' + avatar(D.directory[d], 'sm') + '<span>' + esc(dispName(D.directory[d])) + milBadge(D.directory[d]) + '<small>' + esc(infoLine(D.directory[d])) + '</small></span></button>'; }).join('') : '<div class="hit none">No matches</div>';
  }
}
function onChange(ev){
  var t = ev.target, act = t.getAttribute && t.getAttribute('data-act');
  if(t.hasAttribute && t.hasAttribute('data-gmsel')){
    var gmkey = t.getAttribute('data-gmsel');
    if(t.checked) GMGR.sel[gmkey] = 1; else delete GMGR.sel[gmkey];
    render(); return;
  }
  if(t.id === 'setedit'){ store('ncc_edit_key', t.value.trim()); return; }
  if(act === 'waive' && t.type === 'checkbox'){
    var di = curDi(t), sids = t.getAttribute('data-sid').split(',');
    txn(t.checked ? 'Waive section' : 'Restore section', function(){ setWaivers(di, sids, t.checked); });
    paintProfile(S.prof.di); return;
  }
  if(act === 'msv'){ MG.surv = +t.getAttribute('data-di'); mergeStep2(); return; }
  if(act === 'ranksel'){
    var rdi = +t.getAttribute('data-di'), rv = t.value;
    txn(rv ? 'Set rank' : 'Clear rank', function(){ queuePatch(rdi, { rank: rv }); });
    paintProfile(rdi); return;
  }
  if(act === 'lconline'){
    setField(S.prof.di, 'last_contact_online', t.checked ? 'yes' : '');
    repaintSec('relationship'); repaintTop();
    return;
  }
  if(act === 'kssel'){
    var kdi = +t.getAttribute('data-di'), ke = D.directory[kdi]; if(!ke) return;
    var kp = ksParts(ke) || { y:0, mo:0, d:0 }, kpart = t.getAttribute('data-part'), kvv = +t.value || 0;
    if(kpart === 'y') kp.y = kvv; else if(kpart === 'm') kp.mo = kvv; else kp.d = kvv;
    if(!kp.y){ kp.mo = 0; kp.d = 0; }
    if(!kp.mo) kp.d = 0;
    if(kp.mo && kp.d){ var kdim = new Date(kp.y, kp.mo, 0).getDate(); if(kp.d > kdim) kp.d = kdim; }
    var knv = !kp.y ? '' : String(kp.y) + (kp.mo ? '-' + String(kp.mo).padStart(2, '0') + (kp.d ? '-' + String(kp.d).padStart(2, '0') : '') : '');
    if(String(gv(ke, 'years_known') || '') !== knv) setField(kdi, 'years_known', knv);
    repaintSec('relationship');
    return;
  }
  if(t.hasAttribute && t.hasAttribute('data-pk')){
    var k = t.getAttribute('data-pk');
    var pkV = (t.tagName === 'TEXTAREA') ? t.value : t.value.trim();
    if(k === 'location_on_file') pkV = ptNormLoc(pkV);   /* same normalization the table + Audit editors write */
    if(k === 'years_known' && pkV && !audYearOk(pkV)){ toast('Known since needs a year, or year-month, or a full date: 2019, 2019-03, 2019-03-14.'); repaintSec('relationship'); return; }
    if(k === 'last_contact' && pkV && !audYearOk(pkV)){ toast('Last known contact needs a year, or year-month, or a full date: 2026, 2026-10, 2026-10-28.'); repaintSec('relationship'); return; }
    setField(S.prof.di, k, pkV);
    if(k === 'first_name' || k === 'last_name') repaintTop();
    if(k === 'public_footprint' || k === 'synopsis') repaintTop();
    return;
  }
  if(t.hasAttribute && t.hasAttribute('data-grpnew')){ grpNewCommit(t); return; }
  if(t.classList && t.classList.contains('tadd')){ addTag(t); return; }
  if(t.closest && t.closest('.cprow')){
    if(t.classList.contains('cp-now')){ var row = t.closest('.cprow'), tt = $('.cp-t', row); tt.disabled = t.checked; if(t.checked) tt.value = ''; }
    savePhases(); return;
  }
  if(t.id === 'dd-school'){ var o = $('#dd-other'); if(o) o.style.display = t.value === '__other' ? '' : 'none'; }
}
/* New-group commit from the profile editor's group box. This MUST be
   checked BEFORE the generic .tadd path in onChange/onKey: the input
   carries the tadd class (styling) but no data-k, and the tadd path
   routed the typed name into a patch field literally named "null" —
   the group silently never existed (proven Oct 27, 2026: an outbox
   patch {"null": "ZZ Test Group"}; the input cleared as if saved). */
function grpNewCommit(t){
  var n = regApply(t.value.trim()); if(!n) return;
  if(!allGroups()[n]){ GRP_EXTRA.push(n); store('ncc_groups_extra', JSON.stringify(GRP_EXTRA)); }
  if(!ORGREG.canon[regKey(n)]) regRegisterCanon(n, 'groups');
  var di = S.prof.di; if(di == null) return;
  var gl = personGroups(D.directory[di]); if(gl.indexOf(n) < 0) gl.push(n);
  txn('Edit groups', function(){ setPersonGroups(di, gl); }); repaintSec('relationship');
}
/* Fragment completion for org values (JD 2026-10-27): a typed value that
   is not itself a known org but is the unambiguous prefix of exactly one
   known org resolves to that org — "roch" -> Rochester Regional Health,
   "clarkson" -> Clarkson University, "SUNY can" -> SUNY Canton. Safety
   net under every commit path with no live dropdown (the profile
   editor's blur/change commit): a fragment of a known org can no
   longer be filed as-is. Ambiguous prefixes ("park" -> Park Bros. /
   Parkway Ford) and unknown values pass through untouched — genuinely
   new orgs still file exactly as typed. */
function orgPrefixComplete(v, tk){
  var lv = String(v || '').toLowerCase();
  if(lv.length < 3) return v;
  var pools = tk ? [ptSugList('org', tk)]
    : ORG_CATS.map(function(c){ return ptSugList('org', c.k); });
  var exact = false, hits = [], seen = {};
  pools.forEach(function(pool){ pool.forEach(function(x){
    /* Candidates are compared by their CANONICAL form: alias spellings
       of the same org collapse into one hit, and the fragment itself
       (still live on other profiles, in no registry) never counts as
       an exact match that would block its own completion. */
    var cx = regApply(x), lx = x.toLowerCase(), lc = cx.toLowerCase();
    if(lx === lv && ORGREG.canon[regKey(cx)]) exact = true;
    else if(lc !== lv && (lx.indexOf(lv) === 0 || lc.indexOf(lv) === 0) && !seen[lc]){ seen[lc] = 1; hits.push(cx); }
  }); });
  if(exact) return v;
  if(hits.length !== 1){
    /* Several values share the prefix ("clark" -> Clarkson University /
       Clarkson Security): if exactly one is a registered CANONICAL org,
       that is the completion — canonicals are the filing targets, the
       rest are raw directory values. ("park" likewise lands on the
       canonical Park Bros., not the raw value Parkway Ford.) */
    var can = hits.filter(function(h){ return !!ORGREG.canon[regKey(h)]; });
    return can.length === 1 ? can[0] : v;
  }
  return hits[0];
}
function addTag(t){
  var v = t.value.trim().replace(/[,|]+$/, ''); t.value = ''; if(!v) return;
  var tk = t.getAttribute('data-k');
  if(!tk) return;   /* a tag input with no field is a wiring bug — never patch a "null" field */
  if(ORG_CATS.some(function(c){ return c.k === tk; })){ v = regApply(v); v = orgPrefixComplete(v, tk); if(!ORGREG.canon[regKey(v)]) regRegisterCanon(v, tk); }
  saveTags(t, function(a){ if(a.map(function(x){ return x.toLowerCase(); }).indexOf(v.toLowerCase()) < 0) a.push(v); return a; });
}
/* Autocomplete for the profile editor's free-text tag inputs (JD
   2026-10-27): the .tadd boxes had NO suggestion dropdown at all —
   Enter, and even a plain blur, filed whatever fragment was typed.
   Wires the same ptAcWire dropdown the table and Audit editors use:
   a pick fills the input (org/skill picks also commit, like Enter),
   and Enter with the list open selects the highlighted suggestion.
   The new-group box gets a fill-only dropdown of existing groups, so a
   near-match is one tap away instead of a duplicate group. */
function profWireAc(){
  $$('#view .tadd').forEach(function(inp){
    if(inp._acw) return;
    var isGrp = inp.hasAttribute('data-grpnew'), k = inp.getAttribute('data-k');
    if(!isGrp && !k) return;
    var isOrg = !isGrp && ORG_CATS.some(function(c){ return c.k === k; });
    if(!isGrp && !isOrg && k !== 'specialty') return;
    if(!$('.pted-ac', inp.parentNode)) return;
    inp._acw = 1;
    if(isGrp){
      ptAcWire(inp, ptDedupe(Object.keys(allGroups()).concat(regCanonFor('groups') || [])).sort(function(a, b){ return a.localeCompare(b); }),
        function(v){ inp.value = v; inp.focus(); });
    } else if(isOrg){
      ptAcWire(inp, ptOrgSug(k), function(v){ inp.value = v; addTag(inp); }, { label:regSugLabel, resolve:regApply });
    } else {
      ptAcWire(inp, ptSugList('skill'), function(v){ inp.value = v; addTag(inp); });
    }
  });
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
     Shift+Right keeps its normal text-selection behavior.
     RAPID FIRE diverges (JD 2026-10-16): Shift+Right is the keyboard
     advance there — commit a complete pending value, else skip the
     card for now (it deals again later; NOT the permanent pass). */
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
     move focus or extend a text selection.
     RAPID FIRE diverges (JD 2026-10-16): Shift+Left deals the
     PREVIOUS card back instead of parking; Shift+Down is unchanged. */
  if(ev.shiftKey && !ev.ctrlKey && !ev.metaKey && !ev.altKey && (key === 'ArrowDown' || key === 'ArrowLeft')){
    var audCard2 = t.closest('.aud-card');
    if(audCard2 && S.route && S.route.name === 'audit'){
      ev.preventDefault(); ev.stopImmediatePropagation();
      if(key === 'ArrowDown') audFinish(audCard2, true, true);
      else audPark(audCard2, true);
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
  if(ev.key === 'Enter' && t.hasAttribute && t.hasAttribute('data-grpnew')){ ev.preventDefault(); grpNewCommit(t); return; }
  if(ev.key === 'Enter' && t.classList && t.classList.contains('tadd')){ ev.preventDefault(); addTag(t); return; }
  if((ev.key === 'Enter' || ev.key === ' ') && t.classList && t.classList.contains('dm') && t.classList.contains('pick')){ ev.preventDefault(); t.click(); return; }
  if((ev.key === 'Enter' || ev.key === ' ') && t.classList && t.classList.contains('ptrow')){ ev.preventDefault(); t.click(); return; }
  if(ev.key === 'Enter' && t.id === 'gnew'){ ev.preventDefault(); var b = $('[data-act="gnew"]'); if(b) b.click(); return; }
  if(ev.key === 'Enter' && t.id === 'dtitle'){ ev.preventDefault(); var d = $('[data-act="docgo"]'); if(d) d.click(); return; }
  if(ev.key === 'Enter' && t.id === 'ekey'){ ev.preventDefault(); var s = $('[data-act="savekey"]'); if(s) s.click(); return; }
  if(t.id === 'netq'){
    if(ev.key === 'Enter'){ ev.preventDefault(); var nf1 = $('#netfr .netf-row'); if(nf1) nf1.click(); }
    else if(ev.key === 'Escape'){ t.value = ''; var nb3 = $('#netfr'); if(nb3) nb3.hidden = true; t.blur(); }
    return;
  }
  if(t.id === 'gs'){
    if(ev.key === 'Enter'){ ev.preventDefault(); var first = $('#gsr .gsi-row.on') || $('#gsr .gsi-row'); if(first) first.click(); else if(t.value.trim()){ S.ppl.q = t.value; go('people'); } }
    else if(ev.key === 'ArrowDown' || ev.key === 'ArrowUp'){
      var rows = Array.prototype.slice.call(document.querySelectorAll('#gsr .gsi-row'));
      if(rows.length){ ev.preventDefault(); var ci = rows.findIndex(function(r){ return r.classList.contains('on'); });
        var ni = ev.key === 'ArrowDown' ? Math.min(rows.length - 1, ci + 1) : Math.max(0, ci - 1);
        rows.forEach(function(r, j){ r.classList.toggle('on', j === ni); }); }
    }
    else if(ev.key === 'Escape'){ t.value = ''; paintSearch(); t.blur(); }
    return;
  }
  if(ev.key === 'Escape'){
    if(!$('#sheetwrap').hidden){ closeSheet(); return; }
    if(isField){ t.blur(); return; }
    if(S.route.name === 'audit' && S.audit && S.audit.lcOpen != null){
      if(S.prof && Object.keys(S.prof.edit).length){ S.prof.edit = {}; S.prof.evEdit = null; S.prof.degEdit = null; lcRepaint(); }
      else { S.audit.lcOpen = null; viewAudit($('#view')); }
      return;
    }
    if(S.route.name === 'audit' && S.audit && S.audit.mode === 'rapid'){ audSetMode('cards'); return; }
    if(S.route.name === 'profile'){ var open = Object.keys(S.prof.edit); if(open.length){ var lastSec = open[open.length - 1]; delete S.prof.edit[lastSec]; if(lastSec === 'timeline'){ S.prof.evEdit = null; } if(!Object.keys(S.prof.edit).length){ S.prof.degEdit = null; } paintProfile(S.prof.di); } else back('people'); }
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
  } else if(h === '' || h === '#/' || h.indexOf('home') >= 0){
    body = '<div class="skl sk-big"></div><div class="sk-cols"><div class="skl"></div><div class="skl"></div><div class="skl"></div></div>';
  } else {
    var rows = '';
    for(i = 0; i < 6; i++) rows += '<div class="skl-row"><span class="skl av"></span><span class="skl tx" style="width:' + (58 - (i % 3) * 8) + '%"></span><span class="skl tx s" style="width:22%"></span></div>';
    body = rows + '<div class="skl card"></div>';
  }
  return '<div class="page skel" aria-busy="true"><div class="skl head"></div>' + body +
    (note ? '<p class="dim center">' + esc(note) + '</p>' : '') + '</div>';
}


/* ============================================================
   9b. SANDBOX (V3.4.0) — the admin workbench. Read-only tools
   compute from the baked data already in the app plus the raw
   sidecar files; write tools go through the established paths
   (queuePatch/outbox for profile fields, the same batch endpoint
   for row creates) or queue an op for scripts/sandbox_ops.py.
   Every write is confirmed first and written to the action log
   (localStorage, exported into site/data/sandbox-log.json by
   the ops script; server-side entries are read back from there).
   ============================================================ */
var SB = {
  ready:false, loading:null,
  photos:null, dt:null, changes:null, trash:null, snap:null, recon:null, serverLog:null, orgreg:null, council:null, prof:null, spool:null, discData:null,
  tool:'home', labtab:null,
  pf:{ field:'all', grade:'all', sel:null, tab:'accuracy', asel:null },
  pool:{ src:'seed', seedId:'cfc', optKind:'groups', optName:'', picks:[], qid:'volunteer', qtext:'', cats:null,
         obsDi:null, obsName:'', obDate:'', obEvent:'', obBeh:'', obCat:'action', obCatX:'', obAlt:'',
         prEvent:'', prDate:'', prPerson:'', outNote:{} },
  grid:{ q:'', sort:'name', dir:1, view:'all', cols:null },
  sel:{},                       /* pkey -> di, bulk selection from the grid */
  raw:{ which:'snapchat', q:'' },
  rep:{ tab:'coverage' },
  ins:{ view:null },
  dsc:{ q:'', sel:null },
  integ:{ tab:'recon', dead:null, deadBusy:false },
  lab:{ a:null, b:null, path:null, mutual:null, bridges:null },
  play:{},
  mg:{ a:null, b:null, surv:'a', picks:{}, plan:null },
  dg:{ tab:'delete', one:null, bulkField:'tier', bulkVal:'', bulkCat:'companies', bulkName:'', dry:null },
  lg:{ filter:'all' }
};
/* V3.10.0 IA: the Sandbox has exactly three jobs — LOOK at the data,
   PLAY with it in labs, FIX it with admin tools. The home screen is a
   hero dashboard + three zones of large tiles; there is no rail. */
/* V3.13.0 order (JD: prioritize what goes where): the everyday work
   first — Data grid, Insights, Discovery trails — then Raw data,
   then Play, then Fix. */
var SB_TOOLS = [
  { k:'grid',     z:'Look', t:'Data grid',    d:'Every person, one row. Sort, filter, save views, export CSV, bulk-select.', ic:'people' },
  { k:'insights', z:'Look', t:'Insights',     d:'Seven named checks, each on its own page: coverage, sources, freshness, reconciliation, duplicates, orphans, photo links.', ic:'spark' },
  { k:'discovery', z:'Look', t:'Discovery trails', d:'How each person was found — the searches, routes and anchors behind every photo and fact, and which methods actually produce finds.', ic:'search' },
  { k:'raw',      z:'Look', t:'Raw data',     d:'The baked sidecar files themselves: Snapchat, photos, changes, Trash, registry, council, labs.', ic:'search' },
  { k:'lab',      z:'Play', t:'The Lab',      d:'Experiments on the live data: paths & bridges and the Suspect Pool. Read-only.', ic:'network' },
  { k:'profiling', z:'Play', t:'Profiling inferences', d:'The inductive lab, promoted out of the Lab: Luna\u2019s blind Persona expectations vs JD\u2019s ratings — headline accuracy first, cohorts second, evidence on drill-in. Read-only.', ic:'eye' },
  { k:'merge',    z:'Fix',  t:'Merge studio', d:'Combine two profiles field by field. Combine, never overwrite.', ic:'merge' },
  { k:'danger',   z:'Fix',  t:'Danger area',  d:'Delete, restore, purge, bulk edit, rename, re-key, rebuild.', ic:'trash' },
  { k:'log',      z:'Fix',  t:'Action log',   d:'Every Sandbox write, before → after, with undo and the ops export.', ic:'check' }
];
var SB_LABS = [
  { k:'paths',   t:'Paths & bridges', d:'Find how two people connect — shortest path through known associates and family, mutual connections, and the bridge people who hold the circle together.' },
  { k:'pool',    t:'Suspect Pool', d:'The disciplined thought experiment: an exact pool, one yes/no behavioral question, observable behavior only, a pre-registered prediction. On-device only.' },
];
function sbZoneOf(tool){ return ({ grid:'Look', insights:'Look', discovery:'Look', raw:'Look', lab:'Play', profiling:'Play', merge:'Fix', danger:'Fix', log:'Fix' })[tool] || ''; }
function sbLabTab(){
  if(SB.labtab == null) SB.labtab = sbStore('ncc_sbx_labtab') || 'paths';
  if(!SB_LABS.some(function(l){ return l.k === SB.labtab; })) SB.labtab = 'paths';
  return SB.labtab;
}
function sbStore(k, v){ try{ if(v === undefined){ var s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } localStorage.setItem(k, JSON.stringify(v)); }catch(x){ return null; } }
function sbLogGet(){ return sbStore('ncc_sbx_log') || []; }
function sbOpsGet(){ return sbStore('ncc_sbx_ops') || []; }
function sbLogAdd(entry){
  entry.id = 'sb' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  entry.ts = new Date().toISOString();
  var log = sbLogGet(); log.unshift(entry); sbStore('ncc_sbx_log', log.slice(0, 300));
  (entry.queuedOps || []).forEach(function(op){ var q = sbOpsGet(); q.push(op); sbStore('ncc_sbx_ops', q); });
  return entry;
}
function sbFetch(name, key){
  return fetch('data/' + name + '?v=' + APP_VERSION).then(function(r){ return r.ok ? r.json() : null; })
    .then(function(j){ SB[key] = j; }).catch(function(){ SB[key] = null; });
}
function sbEnsure(){
  if(SB.ready) return Promise.resolve();
  if(SB.loading) return SB.loading;
  SB.loading = Promise.all([
    sbFetch('photos.json', 'photos'), sbFetch('daily-ten.json', 'dt'),
    sbFetch('changes.json', 'changes'), sbFetch('trash.json', 'trash'),
    sbFetch('snapchat.json', 'snap'), sbFetch('recon.json', 'recon'),
    sbFetch('sandbox-log.json', 'serverLog'), sbFetch('org-registry.json', 'orgreg'),
    sbFetch('council.json', 'council'), sbFetch('profiling.json', 'prof'),
    sbFetch('suspect-pool.json', 'spool'), sbFetch('discovery.json', 'discData'), sbFetch('taxonomy.json', 'tax')
  ]).then(function(){ SB.ready = true; SB.loading = null; if(S.route.name === 'sandbox') render(); });
  return SB.loading;
}
function sbPhotoByName(){
  var m = {};
  ((SB.photos && SB.photos.people) || []).forEach(function(p){ m[String(p.name || '').trim().toLowerCase()] = p; });
  return m;
}
function sbPhotoCount(p){
  if(!p) return 0;
  var n = p.photo_url ? 1 : 0;
  return n + ((p.also || []).length);
}
function sbFootCount(e){
  var t = String(gv(e, 'public_footprint') || '').trim();
  if(!t) return 0;
  return t.split('\n').filter(function(x){ return x.trim(); }).length;
}
function sbYear(v){
  var m = String(v || '').match(/(19|20)\d\d/);
  return m ? +m[0] : null;
}
function sbTrashKeys(){
  var s = {};
  var list = Array.isArray(SB.trash) ? SB.trash : ((SB.trash && SB.trash.people) || []);
  list.forEach(function(p){ var k = typeof p === 'string' ? p : (p && p.key); if(k) s[k] = 1; });
  return s;
}
/* adjacency for the connection lab: Known associates + family + close_add */
function sbAdj(){
  if(SB._adj) return SB._adj;
  var adj = {};
  function add(a, b, rel){ if(a == null || b == null || a === b) return; (adj[a] = adj[a] || {})[b] = rel; (adj[b] = adj[b] || {})[a] = rel; }
  D.directory.forEach(function(e, di){
    if(!liveEntry(e)) return;
    (e.neighbors || []).forEach(function(n){ var t = BYN[String(n.u || '').toLowerCase()]; if(t != null) add(di, t, 'associate'); });
    famLinks(e).forEach(function(l){ var t = BYN[String(l[1] || '').toLowerCase()]; if(t != null) add(di, t, l[0] || 'family'); });
    splitTags(gv(e, 'close_add'), ', ').forEach(function(nm){ var t = BYN[nm.toLowerCase()]; if(t != null) add(di, t, 'associate'); });
  });
  SB._adj = adj;
  return adj;
}
function sbPersonPicker(id, label, val){
  return '<div class="sb-pick"><label>' + esc(label) + '</label>' +
    '<input type="text" data-sbi="pickq" data-pick="' + id + '" placeholder="Type a name…" value="' + esc(val || '') + '" autocomplete="off">' +
    '<div class="sb-pickres" id="pick-' + id + '"></div></div>';
}
function sbOpenProfile(di){ var e = D.directory[di]; if(e) go('p/' + encodeURIComponent(personId(e))); }
function sbConfirm(title, bodyHtml, okLabel, danger){
  openSheet(title, '<div class="sb-confirm">' + bodyHtml + '</div>' +
    '<div class="sb-confrow"><button type="button" class="btn ghost" data-sb="sheetx">Cancel</button>' +
    '<button type="button" class="btn ' + (danger ? 'danger2' : 'primary') + '" data-sb="confirmok">' + esc(okLabel || 'Confirm') + '</button></div>', { wide:true });
}
function sbDownload(name, text, mime){
  var b = new Blob([text], { type: mime || 'text/plain' }), u = URL.createObjectURL(b);
  var a = document.createElement('a'); a.href = u; a.download = name; a.click();
  setTimeout(function(){ URL.revokeObjectURL(u); }, 4000);
}
/* direct batch POST to the same endpoint the outbox flush uses — for row
   creates (restore / new profile / re-key), where no directory index exists */
function sbPostBatch(items){
  /* the exact envelope the outbox flush uses: {password, kind:'batch', id:'batch', patch:{items}} */
  return fetch(WEBAPP_URL, { method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' },
    body: JSON.stringify({ password:getPw(), kind:'batch', id:'batch', patch:{ items: items } }) })
    .then(function(r){ return r.json(); })
    .then(function(res){ return !!(res && res.ok); })
    .catch(function(){ return false; });
}

function viewSandbox(v){
  var seg = (S.route.seg && S.route.seg[0]) || 'home';
  /* V3.10.0 routes: the old thirteen destinations consolidate to eight.
     Pre-3.10 deep links keep working as aliases into the new surfaces. */
  if(seg === 'reports' || seg === 'integ') SB.tool = 'insights';
  else if(seg === 'prof' || seg === 'profiling') SB.tool = 'profiling';
  else if(seg === 'pool'){ SB.tool = 'lab'; SB.labtab = 'pool'; }
  else if(seg === 'play'){ SB.tool = 'lab'; SB.labtab = 'visuals'; }
  else SB.tool = seg;
  if(SB.tool === 'lab' && S.route.seg && S.route.seg[1]) SB.labtab = S.route.seg[1];
  if(SB.tool === 'insights'){
    var iv = (S.route.seg && S.route.seg[1]) || null;
    SB.ins.view = SB_INSIGHTS.some(function(x){ return x.k === iv; }) ? iv : null;
  }
  if(SB.tool === 'models'){
    /* V3.30.0 (JD 2026-10-29): the Models section is full screen,
       edge-to-edge — the one deliberate exception to the in-frame
       Sandbox rule. It renders straight into #view on its own data
       (models.json), independent of the Sandbox sidecar load. */
    v.innerHTML = mdlView();
    mdlAfterRender();
    mdlEnsure();
    return;
  }
  if(!SB.ready){
    v.innerHTML = sbShell('<div class="sb-wrap"><div class="empty"><h3>Sandbox</h3><p>Loading the sidecar data…</p></div></div>');
    sbEnsure();
    return;
  }
  var fn = { home:sbHome, grid:sbGrid, raw:sbRaw, insights:sbInsights, discovery:sbDiscovery,
             profiling:function(){ return '<div class="sb-labwrap t-prof">' + sbProf() + '</div>'; },
             lab:sbLabTool, merge:sbMerge, danger:sbDanger, log:sbLogView }[SB.tool] || sbHome;
  if(!({ home:1, grid:1, raw:1, insights:1, discovery:1, profiling:1, lab:1, merge:1, danger:1, log:1 })[SB.tool]) SB.tool = 'home';
  v.innerHTML = sbShell('<div class="sb-wrap">' + fn() + '</div>');
  sbAfterRender();
}
/* Full-screen Sandbox (JD 2026-10-27; IA regraded V3.10.0): the
   workbench takes the whole viewport (body[data-view="sandbox"] hides
   the dossier rail/top/tabs in CSS). Chrome is ONE slim top bar —
   Back (data-act topback: tool -> Sandbox home -> previous view),
   Home (data-act home), the Sandbox wordmark, and the current zone.
   There is no rail: navigation lives on the home screen. SB state is
   module-level, so tool state survives entering and leaving. */
function sbShell(inner){
  /* JD 2026-10-28: no separate Sandbox chrome anymore — the view
     lives in the app's own frame (rail + top bar stay put), and the
     tool nav is the in-page column. The old full-screen shell with
     its own top bar made the Sandbox feel like a different app. */
  return '<div class="sb-shell t-' + esc(SB.tool) + '"><div class="sb-body">' + sbNav() + '<div class="sb-canvas">' + inner + '</div></div></div>';
}
/* V3.13.0 — the Sandbox gets a real left column (JD: "still all
   concentrated to the center... I'm clicking on things like the Lab
   and it's right in the center, not looking like anything useful").
   The column is the map of the whole workbench: zones, then tools
   with a one-line purpose under each, and — for the tool you are in —
   its children listed before you ever have to enter them (Insights'
   eight checks, the Lab's three labs). The canvas beside it runs
   edge-to-edge; the old 1240px centered wrap is gone. */
function sbNav(){
  var h = '<nav class="sb-nav" aria-label="Sandbox tools">';
  h += '<a class="sb-navhome' + (SB.tool === 'home' ? ' on' : '') + '" href="#/sandbox"><span class="sb-nav-t">Home</span><span class="sb-nav-d">What is active, and the index of every tool.</span></a>';
  ['Look', 'Play', 'Fix'].forEach(function(z){
    h += '<div class="sb-nav-z">' + esc(z) + '</div>';
    SB_TOOLS.filter(function(t){ return t.z === z; }).forEach(function(t){
      var on = SB.tool === t.k;
      h += '<a class="sb-navitem' + (on ? ' on' : '') + '" href="#/sandbox/' + t.k + '"><span class="sb-nav-t">' + esc(t.t) + '</span><span class="sb-nav-d">' + esc(t.d) + '</span></a>';
      if(on && t.k === 'insights'){
        h += '<div class="sb-navkids">' + SB_INSIGHTS.map(function(x){
          return '<a class="sb-navkid' + (SB.ins.view === x.k ? ' on' : '') + '" href="#/sandbox/insights/' + x.k + '">' + esc(x.t) + '</a>';
        }).join('') + '</div>';
      }
      if(on && t.k === 'lab'){
        h += '<div class="sb-navkids">' + SB_LABS.map(function(l){
          return '<a class="sb-navkid' + (sbLabTab() === l.k ? ' on' : '') + '" href="#/sandbox/lab/' + l.k + '">' + esc(l.t) + '</a>';
        }).join('') + '</div>';
      }
    });
  });
  h += '<div class="sb-nav-z">Boards</div>' +
    '<a class="sb-navitem" href="#/council"><span class="sb-nav-t">Council \u2192</span><span class="sb-nav-d">The Contacts Pro Council board — flags, theories, your rulings. Lives outside the Sandbox.</span></a>';
  return h + '</nav>';
}
/* One template for every tool page: title + zone chip + purpose line. */
function sbHead(title, sub){
  var z = sbZoneOf(SB.tool);
  return '<div class="sb-head"><div class="sb-headrow"><h2>' + esc(title) + '</h2>' +
    (z ? '<span class="sb-zonechip">' + esc(z) + '</span>' : '') + '</div><p>' + esc(sub || '') + '</p></div>';
}
function sbKpi(n, l){ return '<div class="sb-kpi"><div class="sb-kpin">' + esc(String(n)) + '</div><div class="sb-kpil">' + esc(l) + '</div></div>'; }
/* Open integrity findings, counted exactly (the Insights sections cap
   their display lists at 60; this counter does not). */
function sbFindingsCount(){
  var ok = sbStore('ncc_sbx_dupok') || {};
  var n = sbDupPairs().filter(function(p){ return !ok[[pkey(D.directory[p.a]), pkey(D.directory[p.b])].sort().join('|')]; }).length;
  var names = {};
  D.directory.forEach(function(e){ names[String(e.name || '').toLowerCase()] = 1; });
  D.directory.forEach(function(e){
    if(!liveEntry(e)) return;
    (e.neighbors || []).forEach(function(nb){ if(!names[String(nb.u || '').toLowerCase()]) n++; });
    splitTags(gv(e, 'close_add'), ', ').forEach(function(nm){ if(BYN[nm.toLowerCase()] == null) n++; });
    famLinks(e).forEach(function(l){ if(BYN[String(l[1] || '').toLowerCase()] == null) n++; });
    if(/[A-Z\s]/.test(e.name || '') && !/^ct:/.test(e.name)) n++;
  });
  var tk = sbTrashKeys();
  D.directory.forEach(function(e){ if(liveEntry(e) && tk[pkey(e)]) n++; });
  return n;
}
function sbLogToday(){
  var ds = new Date().toDateString(), n = 0;
  sbLogGet().forEach(function(e){ if(e.ts && new Date(e.ts).toDateString() === ds) n++; });
  ((SB.serverLog && SB.serverLog.entries) || []).forEach(function(e){ if(e.ts && new Date(e.ts).toDateString() === ds) n++; });
  return n;
}
function sbHome(){
  var ppl = people().length;
  /* usable-photo people, counted the same way Insights counts them
     (photo sidecar name-matched onto listed people) so the numbers
     agree on every surface */
  var phn = sbPhotoByName();
  var conf = people().filter(function(di){ var p = phn[dispName(D.directory[di]).toLowerCase()]; return !!(p && p.photo_url && (p.status === 'confirmed' || p.status === 'likely')); }).length;
  var pct = ppl ? Math.round(100 * conf / ppl) : 0;
  var h = '<p class="sb-compact">' + ppl + ' people in the directory \u00b7 ' + pct + '% with a usable photo \u00b7 ' +
    Object.keys(sbTrashKeys()).length + ' keys in Trash \u00b7 ' + sbOpsGet().length + ' ops queued</p>';
  /* Tile grid (JD 2026-10-28, V3.27.0): the landing is compact
     tiles — icon, name, one line, live state with a dot — grouped
     under Look / Play / Fix. Active surfaces pin as wide tiles on
     top. Same destinations and state strings as the old index;
     only the presentation changed. */
  function tile(href, t, d, s, icn, tone, wide){
    return '<a class="sb-tile' + (wide ? ' wide' : '') + '" href="' + href + '"><span class="sb-tile-ic">' + ic(icn, 17) + '</span>' +
      '<span class="sb-tile-main"><span class="sb-tile-t">' + esc(t) + '</span><span class="sb-tile-d">' + d + '</span>' +
      (s ? '<span class="sb-tile-s"><i class="sb-dot ' + (tone || 'dim') + '"></i>' + esc(s) + '</span>' : '') + '</span></a>';
  }
  /* Active: the surfaces with live state or an ongoing purpose,
     pinned as wide tiles. Everything else files into the grid. */
  var pr = SB.spool && SB.spool.default_experiment && SB.spool.default_experiment.prediction;
  var spState = pr ? ('Open prediction: ' + esc(pr.predicted_name || '') + ' \u2014 ' + esc(pr.event || '') + (pr.event_date ? ', ' + esc(pr.event_date) : '') + ' \u00b7 ' + esc(pr.status || '')) : 'The pre-registered prediction tracker.';
  var pf = SB.prof || {}, acc = pf.accuracy || {};
  var pfState = acc.overall ? (Math.round((acc.overall.agree_rate || 0) * 100) + '% blind accuracy \u00b7 ' + (acc.test_set_n || 0) + ' tested \u00b7 ' + (pf.conclusions || []).length + ' graded conclusions') : 'Blind Persona expectations vs JD\u2019s ratings.';
  h += '<div class="sb-group">Active</div><div class="sb-tiles active">' +
    tile('#/sandbox/lab/pool', 'Suspect Pool', spState, pr ? 'Prediction open' : 'Tracker', 'target', pr ? 'amber' : 'dim', true) +
    tile('#/sandbox/profiling', 'Profiling inferences', pfState, acc.overall ? 'Graded' : 'Lab', 'eye', acc.overall ? 'green' : 'dim', true) +
    '</div>';
  /* The index: every remaining tool as a tile in its zone group. */
  var findN = sbFindingsCount(), dupN = sbDupPairs().length, logN = sbLogToday();
  var stats = {
    grid: { s: ppl + ' rows', tone: 'green' },
    raw: { s: Object.keys(SB_RAW_META).length + ' sidecar files', tone: 'dim' },
    insights: { s: findN + ' open findings', tone: findN ? 'amber' : 'green' },
    discovery: { s: SB.discData ? (SB.discData.coverage ? SB.discData.coverage.documented + ' documented trails' : '') : '', tone: 'dim' },
    lab: { s: '2 labs', tone: 'dim' },
    merge: { s: dupN + ' candidate pairs', tone: dupN ? 'amber' : 'green' },
    danger: { s: Object.keys(sbTrashKeys()).length + ' keys in Trash', tone: 'dim' },
    log: { s: logN + ' entries today', tone: logN ? 'green' : 'dim' }
  };
  [['Look', ['grid', 'insights', 'discovery', 'raw']],
   ['Play', ['lab']],
   ['Fix', ['merge', 'danger', 'log']]].forEach(function(g){
    h += '<div class="sb-group">' + g[0] + '</div><div class="sb-tiles">';
    g[1].forEach(function(k){
      var t = SB_TOOLS.filter(function(x){ return x.k === k; })[0];
      if(t) h += tile('#/sandbox/' + t.k, t.t, esc(t.d), (stats[t.k] || {}).s || '', t.ic, (stats[t.k] || {}).tone, false);
    });
    h += '</div>';
  });
  h += '<div class="sb-group">Boards</div><div class="sb-tiles">' +
    tile('#/council', 'Council', 'The Contacts Pro Council board \u2014 flags, theories, your rulings. Lives outside the Sandbox.', 'Board', 'check', 'dim', false) +
    tile('#/sandbox/models', 'Models', 'What the numbers can tell you \u2014 who you are about to lose touch with, who is most likely to have news, and which profiles might be the same person twice.', 'Full screen', 'spark', 'dim', false) +
    '</div>';
  return h;
}
function sbAfterRender(){
  var t = SB.tool;
  if(t === 'lab' && sbLabTab() === 'paths' && SB.lab.bridges === 'pending') sbComputeBridges();
  if(t === 'insights' && SB.integ.deadBusy && !SB.integ._deadRun){ SB.integ._deadRun = true; sbRunDead(); }
}


/* ============================================================
   9c. MODELS (V3.30.0, JD 2026-10-29) — a full-screen, edge-to-edge
   section of the Sandbox. Three read-only models, computed at build
   time by scripts/build_models.py into data/models.json (fetched
   no-store, like photos.json); the browser only renders. Each model
   is a chapter: the plain-language question as the headline, the
   chart, the ranked answer, a how-it-works diagram, and an accuracy
   strip that reports a real backtest or says plainly that the
   history is not there yet. Nothing here writes anything.
   ============================================================ */
var MDL = { data:null, loading:null };
function mdlEnsure(){
  if(MDL.data || MDL.loading) return;
  MDL.loading = fetch('data/models.json', { cache:'no-cache' })
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(j){ MDL.data = j; MDL.loading = null;
      if(S.route.name === 'sandbox' && SB.tool === 'models') render(); })
    .catch(function(){ MDL.loading = null; });
}
function mdlPerson(pid, name){
  return '<a class="mdl-name" href="#/p/' + encodeURIComponent(pid) + '">' + esc(name) + '</a>';
}
function mdlBar(label, pct, val, tone){
  return '<div class="mdl-bar-row"><span class="mdl-bar-l">' + esc(label) + '</span>' +
    '<span class="mdl-bar-track"><span class="mdl-fill' + (tone ? ' ' + tone : '') + '" style="--w:' + Math.max(0, Math.min(100, pct)) + '%"></span></span>' +
    '<span class="mdl-bar-v">' + esc(val) + '</span></div>';
}
function mdlSteps(steps){
  return '<div class="mdl-steps">' + steps.map(function(s, i){
    return (i ? '<span class="mdl-arrow" aria-hidden="true">&#8594;</span>' : '') +
      '<div class="mdl-step"><span class="mdl-step-n">' + (i + 1) + '</span>' +
      '<b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></div>';
  }).join('') + '</div>';
}
function mdlAcc(big, label, note){
  return '<div class="mdl-acc mdl-rev"><div class="mdl-acc-big">' + big + '</div>' +
    '<div class="mdl-acc-body"><div class="mdl-acc-l">How often has it been right?</div>' +
    '<b>' + esc(label) + '</b><p>' + esc(note) + '</p></div></div>';
}
function mdlChapter(no, kick, q, headline, inner){
  return '<section class="mdl-chapter mdl-rev"><div class="mdl-ch-head">' +
    '<div class="mdl-ch-no">' + no + '</div><div><div class="mdl-kick">' + esc(kick) + '</div>' +
    '<h2 class="mdl-q">' + esc(q) + '</h2><p class="mdl-headline">' + esc(headline) + '</p></div></div>' +
    inner + '</section>';
}

/* --- chapter 1: losing touch ------------------------------------ */
function mdlRhythmSVG(e, genISO){
  var dates = (e.dates || []).map(function(s){ return Date.parse(s); }).filter(function(x){ return !isNaN(x); });
  if(dates.length < 2) return '';
  var today = Date.parse(genISO), t0 = Math.min(dates[0], today), t1 = today;
  var span = Math.max(1, t1 - t0), W = 560, H = 34, y = 17;
  function X(t){ return 8 + (t - t0) / span * (W - 16); }
  var last = dates[dates.length - 1];
  var due = last + e.median_days * 864e5;
  var s = '<svg class="mdl-rhythm" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">';
  s += '<line x1="8" y1="' + y + '" x2="' + (W - 8) + '" y2="' + y + '" class="mdl-rl-base"/>';
  if(due < t1) s += '<line x1="' + X(due) + '" y1="5" x2="' + X(due) + '" y2="' + (H - 5) + '" class="mdl-rl-due"/>';
  dates.forEach(function(d){ s += '<circle cx="' + X(d) + '" cy="' + y + '" r="4" class="mdl-rl-dot"/>'; });
  s += '<circle cx="' + X(t1) + '" cy="' + y + '" r="3" class="mdl-rl-now"/></svg>';
  return s;
}
function mdlCadence(c, gen){
  var h = '';
  /* the answer, ranked */
  h += '<div class="mdl-grid2"><div class="mdl-panel"><h3 class="mdl-ph">Most overdue first</h3>';
  c.ranked.slice(0, 10).forEach(function(e, i){
    h += '<div class="mdl-prow"><span class="mdl-rank">' + (i + 1) + '</span>' +
      '<span class="mdl-pmain">' + mdlPerson(e.pid, e.name) +
      '<small>You normally talk ' + esc(e.rhythm) + ' &middot; last contact ' + esc(e.last_label) + '</small></span>' +
      '<span class="mdl-meter"><span class="mdl-fill bad" style="--w:' + Math.min(100, e.overdue / 4 * 100) + '%"></span></span>' +
      '<span class="mdl-oval">' + (e.overdue >= 1 ? e.overdue.toFixed(1) + '&times; overdue' : 'on rhythm') + '</span></div>';
  });
  h += '<p class="mdl-note">Overdue is measured against each person&rsquo;s own rhythm, not a universal clock. ' +
    c.coverage.with_stamp + ' people carry a last-contact stamp; only the ' + c.coverage.with_rhythm +
    ' above have 3 or more dated contacts, enough to learn a rhythm from.</p></div>';
  /* the chart */
  var maxd = Math.max.apply(null, c.distribution.map(function(d){ return d.count; }).concat([1]));
  h += '<div class="mdl-panel"><h3 class="mdl-ph">Where everyone with a rhythm stands</h3>' +
    c.distribution.map(function(d){ return mdlBar(d.label, d.count / maxd * 100, d.count + (d.count === 1 ? ' person' : ' people')); }).join('') +
    '<div class="mdl-split"><div><b>' + c.rhythm_split.steady + '</b><span>run on a rhythm &mdash; their gaps land within a fairly steady band</span></div>' +
    '<div><b>' + c.rhythm_split.scattered + '</b><span>are all over the place &mdash; no steady gap to be overdue against</span></div></div></div></div>';
  /* rhythm diagrams for the five most overdue */
  h += '<div class="mdl-panel mdl-rev"><h3 class="mdl-ph">Their rhythms, drawn to scale</h3>' +
    '<p class="mdl-note">Each dot is a real contact. The red line is when the next one fell due. The white dot is today.</p>';
  c.ranked.slice(0, 5).forEach(function(e){
    h += '<div class="mdl-rrow"><span class="mdl-rname">' + mdlPerson(e.pid, e.name) + '</span>' + mdlRhythmSVG(e, gen) +
      '<span class="mdl-rmeta">' + esc(e.rhythm) + '</span></div>';
  });
  h += '</div>';
  h += '<h3 class="mdl-sh">How it works</h3>' + mdlSteps([
    ['Read the contact log', 'Every dated contact on every profile: messages, calls, in-person, all of it.'],
    ['Learn each rhythm', 'For anyone with 3 or more contacts, take the middle gap between them. That is their normal.'],
    ['Measure today against it', 'Days since the last contact, divided by their normal gap. Over 1.0 means past due.'],
    ['Rank, never nag', 'The list is a nudge for you. Nothing is sent, scheduled, or written anywhere.']
  ]);
  var bt = c.backtest;
  h += bt.rate != null
    ? mdlAcc(Math.round(bt.rate * 100) + '%', 'Called the return window ' + bt.hits + ' times out of ' + bt.n + ' in backtesting.', bt.note + ' A small test set, so read it as a hint, not a verdict.')
    : mdlAcc('&mdash;', 'Not enough history to test yet.', bt.note);
  /* stamp-only recency, kept separate */
  if(c.recent && c.recent.length){
    h += '<div class="mdl-panel mdl-rev"><h3 class="mdl-ph">Quiet the longest &mdash; stamp only, no rhythm learned</h3>' +
      '<p class="mdl-note">These profiles have a last-contact stamp but fewer than 3 dated contacts, so there is no rhythm to judge against. Plain recency only.</p><div class="mdl-chips">' +
      c.recent.slice(0, 24).map(function(e){ return '<span class="mdl-chip">' + mdlPerson(e.pid, e.name) + '<small>' + esc(e.last_label) + '</small></span>'; }).join('') + '</div></div>';
  }
  return mdlChapter('01', 'Model one \u00b7 cadence', c.question, c.headline, h);
}

/* --- chapter 2: who has news ------------------------------------ */
function mdlNews(n){
  var h = '';
  var maxr = Math.max.apply(null, n.segments.map(function(s){ return s.rate; }).concat([0.01]));
  h += '<div class="mdl-grid2"><div class="mdl-panel"><h3 class="mdl-ph">What makes someone likely to have news?</h3>' +
    n.segments.map(function(s){
      return mdlBar(s.label, s.rate / maxr * 100,
        Math.round(s.rate * 100) + '%' + (s.lift ? ' \u00b7 ' + s.lift + '\u00d7' : ''),
        s.rate >= n.sample.base_rate ? '' : 'dim');
    }).join('') +
    '<p class="mdl-note">Each rate is the share of checks inside that group that produced a filing, over ' + n.sample.checks + ' labeled checks; the &times; compares it with the overall rate. Groups overlap &mdash; one person can sit in several.</p></div>';
  h += '<div class="mdl-panel"><h3 class="mdl-ph">The next names in the rotation, reordered</h3>';
  n.next_up.forEach(function(e, i){
    h += '<div class="mdl-prow"><span class="mdl-rank">' + (i + 1) + '</span>' +
      '<span class="mdl-pmain">' + mdlPerson(e.pid, e.name) +
      (e.why.length ? '<small>' + esc(e.why.join(' \u00b7 ')) + '</small>' : '<small>No strong signals either way</small>') + '</span>' +
      '<span class="mdl-meter"><span class="mdl-fill" style="--w:' + e.score + '%"></span></span>' +
      '<span class="mdl-oval">' + e.score + ' / 100</span></div>';
  });
  h += '<p class="mdl-note">The score is the model&rsquo;s estimate that a check turns up a fileable finding, learned from the labeled history. Expected yield at the current pace: about <b>' + n.expected_per_run + ' findings per 75-check run</b>.</p></div></div>';
  h += '<h3 class="mdl-sh">How it works</h3>' + mdlSteps([
    ['Label the past', 'Every Live Records run already records who was checked and who produced a filing. That is the training set.'],
    ['Compare groups', 'Athletics ties, employers, schools, how much is already on file &mdash; each group gets its own hit rate.'],
    ['Score the queue', 'A person inherits the rates of the groups they sit in, blended into one number.'],
    ['Reorder, never skip', 'The rotation still checks everyone. The model only decides who goes first.']
  ]);
  if(n.holdout){
    h += mdlAcc(n.holdout.top_rate > n.holdout.rest_rate ? Math.round(n.holdout.top_rate * 100) + ' vs ' + Math.round(n.holdout.rest_rate * 100) : '&mdash;',
      'On checks the model had never seen, its top half produced findings at ' + Math.round(n.holdout.top_rate * 100) + ' in 100, against ' + Math.round(n.holdout.rest_rate * 100) + ' in 100 for the bottom half.',
      n.holdout.note + ' Only ' + n.holdout.test_findings + ' findings landed in the test window, so treat the edge as early evidence, not proof. Sample so far: ' + n.sample.runs + ' runs, ' + n.sample.checks + ' checks, ' + n.sample.findings + ' findings.');
  } else {
    h += mdlAcc('&mdash;', 'Still collecting.', 'With ' + n.sample.checks + ' labeled checks across ' + n.sample.runs + ' runs, the history is too thin for an honest holdout test. The rates above are real counts; the ranking is a first read and is labeled as such until the sample grows.');
  }
  return mdlChapter('02', 'Model two \u00b7 Live Records yield', n.question, n.headline, h);
}

/* --- chapter 3: same person twice ------------------------------- */
function mdlPairs(p){
  var h = '<div class="mdl-pairs">';
  p.candidates.forEach(function(c){
    h += '<div class="mdl-pair mdl-rev"><div class="mdl-pair-top"><span class="mdl-pair-names">' +
      mdlPerson(c.a_pid, c.a) + '<span class="mdl-x">&times;</span>' + mdlPerson(c.b_pid, c.b) + '</span>' +
      '<span class="mdl-score"><b>' + c.score + '</b><small>match score</small></span></div>' +
      '<span class="mdl-meter wide"><span class="mdl-fill warn" style="--w:' + c.score + '%"></span></span>' +
      '<ul class="mdl-reasons">' + c.reasons.map(function(r){ return '<li>' + esc(r) + '</li>'; }).join('') + '</ul></div>';
  });
  h += '</div>';
  if(!p.candidates.length) h += '<div class="mdl-panel"><p class="mdl-note">No pair currently scores high enough to be worth your time.</p></div>';
  h += '<h3 class="mdl-sh">How it works</h3>' + mdlSteps([
    ['Compare every pair', 'Names, also-known-as names, phone numbers, employers, schools, churches, shared associates.'],
    ['Add up the evidence', 'Each match adds points: a shared phone number is heavy, a shared last name alone is light.'],
    ['Show the reasons', 'Every candidate lists exactly why it scored. No black box, no hidden merge.'],
    ['You rule', 'The scorer never merges anything. Deciding is the Council&rsquo;s and yours.']
  ]);
  h += mdlAcc('0', 'Ruled-apart pairs re-served as open candidates.', p.check +
    ' The pairs most likely to be families &mdash; same last name, same church, same people around them &mdash; are exactly what this list surfaces, which is why it shows its reasons instead of acting.');
  if(p.ruled_apart && p.ruled_apart.length){
    h += '<div class="mdl-ruled mdl-rev"><h3 class="mdl-ph">Already ruled: two people</h3>' +
      p.ruled_apart.map(function(r){ return '<p><b>' + esc(r.a) + '</b> and <b>' + esc(r.b) + '</b> &mdash; ' + esc(r.note) + '</p>'; }).join('') + '</div>';
  }
  return mdlChapter('03', 'Model three \u00b7 record linkage', p.question, p.headline, h);
}

/* --- the section -------------------------------------------------- */
function mdlView(){
  var top = '<div class="mdl-top"><a class="mdl-back" href="#/sandbox">&#8592; Sandbox</a>' +
    '<span class="mdl-brand">Models</span><span class="mdl-topsub">Sandbox &middot; read-only</span></div>';
  if(!MDL.data){
    return '<div class="mdl">' + top + '<div class="mdl-load"><div class="mdl-load-t">Running the numbers&hellip;</div>' +
      '<p>The models are computed ahead of time; this is just the file on its way.</p></div></div>';
  }
  var m = MDL.data, s = m.summary;
  var stats = [
    [s.directory, 'people in the directory'],
    [s.with_rhythm, 'with a contact rhythm'],
    [s.labeled_checks, 'labeled Live Records checks'],
    [s.pair_candidates, 'candidate duplicate pairs']
  ];
  var h = '<div class="mdl">' + top + '<div class="mdl-scroll">';
  h += '<header class="mdl-hero"><div class="mdl-kick">The Sandbox &middot; Models</div>' +
    '<h1 class="mdl-title">What the numbers<br>can tell you.</h1>' +
    '<p class="mdl-sub">Three small models over the data this app already keeps. Each one answers one plain question, ' +
    'shows its work, and reports how often it has been right. Nothing here writes, sends, or merges anything.</p>' +
    '<div class="mdl-stats">' + stats.map(function(x){
      return '<div class="mdl-stat"><b data-cu="' + x[0] + '">0</b><span>' + esc(x[1]) + '</span></div>';
    }).join('') + '</div>' +
    '<nav class="mdl-toc"><button type="button" data-mdljump="mdl-c1">01 &middot; Losing touch</button><button type="button" data-mdljump="mdl-c2">02 &middot; Who has news</button><button type="button" data-mdljump="mdl-c3">03 &middot; Same person twice</button></nav></header>';
  h += '<div id="mdl-c1">' + mdlCadence(m.cadence, m.generated) + '</div>';
  h += '<div id="mdl-c2">' + mdlNews(m.news) + '</div>';
  h += '<div id="mdl-c3">' + mdlPairs(m.pairs) + '</div>';
  h += '<footer class="mdl-foot">Computed ' + esc(m.generated) + ' by the models build from the live directory, the contact log, and the Live Records run history. ' +
    'Rebuilt with the site; the numbers move when the data does.</footer>';
  return h + '</div></div>';
}
function mdlAfterRender(){
  var root = document.querySelector('.mdl');
  if(!root) return;
  root.querySelectorAll('[data-mdljump]').forEach(function(b){
    b.addEventListener('click', function(){
      var t = document.getElementById(b.getAttribute('data-mdljump'));
      if(t) t.scrollIntoView({ behavior:'smooth', block:'start' });
    });
  });
  /* count-up hero numbers */
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.querySelectorAll('[data-cu]').forEach(function(el){
    var target = parseInt(el.getAttribute('data-cu'), 10) || 0;
    if(reduce){ el.textContent = target; return; }
    var t0 = null;
    function tick(ts){
      if(!t0) t0 = ts;
      var k = Math.min(1, (ts - t0) / 900);
      el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
      if(k < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  /* reveal on scroll (bars animate via the .in class) */
  var els = root.querySelectorAll('.mdl-rev, .mdl-chapter');
  if(reduce || !('IntersectionObserver' in window)){
    els.forEach(function(el){ el.classList.add('in'); });
    return;
  }
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(en){ if(en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { root: root.querySelector('.mdl-scroll'), threshold: 0.08 });
  els.forEach(function(el){ io.observe(el); });
}

/* ---------------- 1. data grid ---------------- */
var SB_COLS = [
  { k:'name', l:'Name', v:function(e){ return dispName(e); } },
  { k:'key', l:'Key', v:function(e){ return pkey(e); } },
  { k:'tier', l:'Tier', v:function(e){ return tierName(e); } },
  { k:'rel', l:'Relationship', v:function(e){ return gv(e, 'relationship') || ''; } },
  { k:'years', l:'Known since', v:function(e){ return gv(e, 'years_known') || ''; }, n:function(e){ return sbYear(gv(e, 'years_known')) || 9999; } },
  { k:'lastc', l:'Last contact', v:function(e){ return gv(e, 'last_contact') || ''; }, n:function(e){ return sbYear(gv(e, 'last_contact')) || 9999; } },
  { k:'snap', l:'Snapchat', v:function(e){ return (e.snap_handles || []).map(function(x){ return '@' + x; }).join(' '); } },
  { k:'online', l:'Online since', v:function(e){ return e.snap_since ? String(e.snap_since) : ''; }, n:function(e){ return e.snap_since || 9999; } },
  { k:'ig', l:'Instagram', v:function(e){ return effHandle(e) ? '@' + effHandle(e) : ''; } },
  { k:'fb', l:'Facebook', v:function(e){ return e.fb_handle || ''; } },
  { k:'email', l:'Email', v:function(e){ return gv(e, 'email') || ''; } },
  { k:'phone', l:'Phone', v:function(e){ return gv(e, 'phone') || ''; } },
  { k:'orgs', l:'Organizations', v:function(e){ return orgsOf(e).join(', '); } },
  { k:'groups', l:'Groups', v:function(e){ return personGroups(e).join(', '); } },
  { k:'town', l:'Town', v:function(e){ return e.city || gv(e, 'location_on_file') || ''; } },
  { k:'photo', l:'Photo', v:function(e, ph){ var p = ph[dispName(e).toLowerCase()]; return p ? (p.status || '') + (sbPhotoCount(p) > 1 ? ' ×' + sbPhotoCount(p) : '') : '—'; } },
  { k:'foot', l:'Footprint facts', v:function(e){ return String(sbFootCount(e)); }, n:function(e){ return sbFootCount(e); } },
  { k:'conn', l:'Connections', v:function(e){ return String((e.neighbors || []).length); }, n:function(e){ return (e.neighbors || []).length; } },
  { k:'close', l:'Closeness', v:function(e, ph, sc){ var s = sc[e._di]; return s ? String(s.total) : ''; }, n:function(e, ph, sc){ var s = sc[e._di]; return s ? s.total : -1; } }
];
var SB_VIEWS = {
  all:{ l:'Everyone', f:function(){ return true; } },
  snap:{ l:'Has Snapchat data', f:function(e){ return !!(e.snap_handles && e.snap_handles.length); } },
  nophoto:{ l:'No usable photo', f:function(e, ph){ var p = ph[dispName(e).toLowerCase()]; return !(p && p.photo_url && (p.status === 'confirmed' || p.status === 'likely')); } },
  army:{ l:'Army', f:function(e){ return personGroups(e).indexOf('U.S. Army') >= 0 || !!gv(e, 'rank'); } },
  noknown:{ l:'No Known Since', f:function(e){ return !String(gv(e, 'years_known') || '').trim(); } },
  shells:{ l:'Shells (no footprint, no connections)', f:function(e){ return !sbFootCount(e) && !(e.neighbors || []).length; } }
};
function sbGridCols(){
  if(SB.grid.cols) return SB.grid.cols;
  var saved = sbStore('ncc_sbx_grid');
  var cols = {};
  SB_COLS.forEach(function(c){ cols[c.k] = !(saved && saved[c.k] === 0); });
  if(!saved){ ['email', 'phone', 'fb'].forEach(function(k){ cols[k] = false; }); }
  SB.grid.cols = cols;
  return cols;
}
function sbSavedViews(){ return sbStore('ncc_sbx_views') || {}; }
function sbGridRows(){
  var ph = sbPhotoByName(), sc = scoreAll(), q = SB.grid.q.toLowerCase();
  var vkey = SB.grid.view;
  if(vkey.indexOf('saved:') === 0){ var d0 = sbSavedViews()[vkey.slice(6)]; vkey = d0 ? (d0.view || 'all') : 'all'; }
  var vf = SB_VIEWS[vkey] || SB_VIEWS.all;
  var rows = [];
  D.directory.forEach(function(e, di){
    if(!liveEntry(e)) return;
    e._di = di;
    if(!vf.f(e, ph)) return;
    if(q){
      var hay = (dispName(e) + ' ' + pkey(e) + ' ' + (e.snap_handles || []).join(' ') + ' ' + orgsOf(e).join(' ') + ' ' + (e.city || '')).toLowerCase();
      if(hay.indexOf(q) < 0) return;
    }
    rows.push(e);
  });
  var col = SB_COLS.filter(function(c){ return c.k === SB.grid.sort; })[0] || SB_COLS[0];
  rows.sort(function(a, b){
    var va = col.n ? col.n(a, ph, sc) : String(col.v(a, ph, sc)).toLowerCase();
    var vb = col.n ? col.n(b, ph, sc) : String(col.v(b, ph, sc)).toLowerCase();
    return (va < vb ? -1 : va > vb ? 1 : 0) * SB.grid.dir;
  });
  return { rows:rows, ph:ph, sc:sc };
}
function sbGrid(){
  var cols = sbGridCols();
  var vis = SB_COLS.filter(function(c){ return cols[c.k]; });
  var got = sbGridRows(), rows = got.rows;
  var selN = Object.keys(SB.sel).length;
  var h = sbHead('Data grid', 'Every person as one row. Click a header to sort; click a row to open the profile. Nothing here writes until you send a selection to the Danger area.');
  h += '<div class="sb-toolbar"><input type="text" data-sbi="gridq" placeholder="Filter by name, key, handle, org, town…" value="' + esc(SB.grid.q) + '">' +
    '<select data-sbi="gridview">' + Object.keys(SB_VIEWS).map(function(k){ return '<option value="' + k + '"' + (SB.grid.view === k ? ' selected' : '') + '>' + SB_VIEWS[k].l + '</option>'; }).join('') +
    Object.keys(sbSavedViews()).map(function(nm){ return '<option value="saved:' + esc(nm) + '"' + (SB.grid.view === 'saved:' + nm ? ' selected' : '') + '>Saved: ' + esc(nm) + '</option>'; }).join('') + '</select>' +
    '<button type="button" class="btn ghost sm" data-sb="gridviewsave">Save view</button>' +
    '<button type="button" class="btn ghost sm" data-sb="gridcols">Columns</button>' +
    '<button type="button" class="btn ghost sm" data-sb="gridcsv">Export CSV</button>' +
    '<span class="sb-count">' + rows.length + ' rows</span></div>';
  if(selN) h += '<div class="sb-selbar"><b>' + selN + ' selected</b><button type="button" class="btn danger2 sm" data-sb="seltodanger">Send to Danger area</button><button type="button" class="btn ghost sm" data-sb="selclear">Clear selection</button></div>';
  h += '<div class="sb-tablewrap"><table class="sb-table"><thead><tr><th class="sb-ck"></th>' +
    vis.map(function(c){ return '<th data-sb="gridsort" data-k="' + c.k + '">' + esc(c.l) + (SB.grid.sort === c.k ? (SB.grid.dir > 0 ? ' ↑' : ' ↓') : '') + '</th>'; }).join('') + '</tr></thead><tbody>';
  rows.slice(0, 800).forEach(function(e){
    var di = e._di, pk = pkey(e);
    h += '<tr><td class="sb-ck"><input type="checkbox" data-sbi="gridsel" data-di="' + di + '"' + (SB.sel[pk] ? ' checked' : '') + '></td>';
    vis.forEach(function(c, ci){
      var val = c.v(e, got.ph, got.sc);
      h += '<td' + (ci === 0 ? ' class="sb-namecell" data-sb="gridopen" data-di="' + di + '"' : '') + '>' + esc(val) + '</td>';
    });
    h += '</tr>';
  });
  h += '</tbody></table></div>';
  if(rows.length > 800) h += '<p class="sb-note">Showing the first 800 of ' + rows.length + ' — narrow the filter to see the rest.</p>';
  return h;
}
function sbGridCsv(){
  var cols = sbGridCols(), vis = SB_COLS.filter(function(c){ return cols[c.k]; });
  var got = sbGridRows();
  function q(s){ s = String(s == null ? '' : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  var out = [vis.map(function(c){ return q(c.l); }).join(',')];
  got.rows.forEach(function(e){ out.push(vis.map(function(c){ return q(c.v(e, got.ph, got.sc)); }).join(',')); });
  sbDownload('sandbox-grid.csv', out.join('\n'), 'text/csv');
  toast('CSV exported — ' + got.rows.length + ' rows');
}

/* ---------------- 2. raw viewers ---------------- */
var SB_RAW_META = {
  snapchat:{ l:'Snapchat sidecar', f:'snapchat.json' }, photos:{ l:'Photos', f:'photos.json' },
  daily:{ l:'Live Records (daily-ten)', f:'daily-ten.json' }, changes:{ l:'Change log', f:'changes.json' },
  trash:{ l:'Trash / blocklist', f:'trash.json' }, orgreg:{ l:'Org registry', f:'org-registry.json' },
  log:{ l:'Sandbox action log (server)', f:'sandbox-log.json' },
  council:{ l:'Council', f:'council.json' },
  profiling:{ l:'Profiling inferences', f:'profiling.json' },
  suspect:{ l:'Suspect Pool', f:'suspect-pool.json' }
};
function sbRaw(){
  var w = SB.raw.which, q = SB.raw.q.toLowerCase();
  var h = sbHead('Raw data', 'The baked sidecar files, as they sit on disk. Read-only.');
  h += '<div class="sb-toolbar">' + Object.keys(SB_RAW_META).map(function(k){
    return '<button type="button" class="btn sm ' + (w === k ? 'primary' : 'ghost') + '" data-sb="rawtab" data-k="' + k + '">' + esc(SB_RAW_META[k].l) + '</button>';
  }).join('') + '<input type="text" data-sbi="rawq" placeholder="Filter…" value="' + esc(SB.raw.q) + '"></div>';
  function tbl(head, rowsHtml){ return '<div class="sb-tablewrap"><table class="sb-table"><thead><tr>' + head.map(function(x){ return '<th>' + esc(x) + '</th>'; }).join('') + '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>'; }
  if(w === 'snapchat' && SB.snap){
    var ks = Object.keys(SB.snap.people || {}).sort();
    h += '<p class="sb-note">' + ks.length + ' people · file updated ' + esc(SB.snap.updated || '') + '</p>' + tbl(['Key', 'Name', 'Handles', 'Online since'],
      ks.filter(function(k){ return !q || (k + ' ' + (SB.snap.people[k].name || '')).toLowerCase().indexOf(q) >= 0; }).map(function(k){
        var p = SB.snap.people[k];
        return '<tr><td>' + esc(k) + '</td><td>' + esc(p.name || '') + '</td><td>' + esc((p.handles || []).map(function(x){ return '@' + x; }).join(' ')) + '</td><td>' + esc(p.since_date || String(p.since || '')) + '</td></tr>';
      }).join(''));
  }
  else if(w === 'photos' && SB.photos){
    var pp = SB.photos.people || [];
    h += '<p class="sb-note">' + pp.length + ' people · ' + esc(SB.photos.updated || '') + '</p>' + tbl(['Name', 'Status', 'Type', 'Photos', 'Host', 'Added'],
      pp.filter(function(p){ return !q || String(p.name || '').toLowerCase().indexOf(q) >= 0; }).map(function(p){
        var host = ''; try{ host = new URL(p.photo_url).hostname; }catch(x){}
        return '<tr><td>' + esc(p.name || '') + '</td><td>' + esc(p.status || '') + '</td><td>' + esc(p.type || '') + '</td><td>' + sbPhotoCount(p) + '</td><td>' + esc(host) + '</td><td>' + esc(p.added || p.added_approx || '') + '</td></tr>';
      }).join(''));
  }
  else if(w === 'daily' && SB.dt){
    var dt = SB.dt;
    h += '<p class="sb-note">Brief date ' + esc(dt.date || '') + ' · coverage ' + esc(String((dt.coverage || {}).checked_total || 0)) + ' of ' + esc(String((dt.coverage || {}).of || 0)) + ' in the last ' + esc(String((dt.coverage || {}).window_days || 30)) + ' days · fresh: ' + esc((dt.fresh || {}).headline || 'none') + '</p>';
    h += '<h3 class="sb-h3">Checked in this brief (' + (dt.checked || []).length + ')</h3>' + tbl(['Key', 'Name'],
      (dt.checked || []).map(function(c){ return '<tr><td>' + esc(c.name || '') + '</td><td>' + esc(c.display || '') + '</td></tr>'; }).join(''));
    h += '<h3 class="sb-h3">Filed (' + (dt.filed || []).length + ')</h3>' + tbl(['Name', 'Facts'],
      (dt.filed || []).map(function(f2){ return '<tr><td>' + esc(f2.display || '') + '</td><td>' + esc((f2.facts || []).map(function(x){ return x.text; }).join(' · ')) + '</td></tr>'; }).join(''));
    h += '<h3 class="sb-h3">Next up (' + (dt.next_up || []).length + ')</h3>' + tbl(['Key', 'Name'],
      (dt.next_up || []).map(function(c){ return '<tr><td>' + esc(c.name || '') + '</td><td>' + esc(c.display || '') + '</td></tr>'; }).join(''));
  }
  else if(w === 'changes' && SB.changes){
    var es = (SB.changes.entries || []).slice().reverse();
    h += '<p class="sb-note">' + es.length + ' entries</p>' + tbl(['Filed', 'Name', 'What', 'Source'],
      es.filter(function(e2){ return !q || (e2.name + ' ' + e2.what).toLowerCase().indexOf(q) >= 0; }).slice(0, 400).map(function(e2){
        return '<tr><td>' + esc(e2.filed || '') + '</td><td>' + esc(e2.name || '') + '</td><td>' + esc(e2.what || '') + '</td><td>' + esc(e2.source || '') + '</td></tr>';
      }).join(''));
  }
  else if(w === 'trash'){
    var tk = sbTrashKeys(), keys = Object.keys(tk).sort();
    h += '<p class="sb-note">' + keys.length + ' keys. Trash is the archive AND the build blocklist — a key here keeps its person out of the directory.</p>' + tbl(['Key'],
      keys.filter(function(k){ return !q || k.indexOf(q) >= 0; }).map(function(k){ return '<tr><td>' + esc(k) + '</td></tr>'; }).join(''));
  }
  else if(w === 'orgreg' && SB.orgreg){
    var can = SB.orgreg.canonicals || {}, al = SB.orgreg.aliases || {};
    h += '<h3 class="sb-h3">Canonicals (' + Object.keys(can).length + ')</h3>' + tbl(['Category', 'Canonical'],
      Object.keys(can).sort().map(function(k){ return '<tr><td>' + esc(k) + '</td><td>' + esc((can[k] || []).join(', ')) + '</td></tr>'; }).join(''));
    h += '<h3 class="sb-h3">Aliases (' + Object.keys(al).length + ')</h3>' + tbl(['Alias', 'Canonical'],
      Object.keys(al).sort().map(function(k){ return '<tr><td>' + esc(k) + '</td><td>' + esc(al[k]) + '</td></tr>'; }).join(''));
  }
  else if(w === 'log'){
    var se = (SB.serverLog && SB.serverLog.entries) || [];
    h += '<p class="sb-note">' + se.length + ' server-side entries (written by sandbox_ops.py). Your in-browser entries live in the Action log tool.</p>' + tbl(['When', 'Type', 'Detail'],
      se.slice().reverse().map(function(e2){ return '<tr><td>' + esc(String(e2.ts || '').slice(0, 10)) + '</td><td>' + esc(e2.type || e2.op || '') + '</td><td>' + esc(e2.detail || e2.title || '') + '</td></tr>'; }).join(''));
  }
  else if(w === 'council' && SB.council){
    var cn = SB.council;
    h += '<p class="sb-note">Adopted ' + esc(cn.adopted || '') + ' · updated ' + esc(cn.updated || '') + ' · budget: ' + esc(String((cn.budget || {}).used_pct != null ? (cn.budget || {}).used_pct : '—')) + '% used (read ' + esc((cn.budget || {}).read_at || '') + ')</p>';
    h += tbl(['Role', 'Status', 'Next run'],
      (cn.roster || []).map(function(r){ return '<tr><td>' + esc(r.name || '') + '</td><td>' + esc(r.status || '') + '</td><td>' + esc(r.next_run || '') + '</td></tr>'; }).join(''));
    h += '<h3 class="sb-h3">Open flags (' + (cn.flags || []).filter(function(f){ return String(f.status || '').indexOf('Closed') !== 0; }).length + ')</h3>';
    h += (cn.flags || []).length ? tbl(['Date', 'From', 'Flag'], (cn.flags || []).map(function(f){ return '<tr><td>' + esc(f.date || '') + '</td><td>' + esc(f.from || '') + '</td><td>' + esc(f.title || '') + '</td></tr>'; }).join(''))
      : '<p class="sb-note">Nothing waiting on JD.</p>';
  }
  else if(w === 'profiling' && SB.prof){
    var pf = SB.prof, cov = pf.coverage || {};
    h += '<p class="sb-note">Run of ' + esc(pf.generated || '') + ' · lens: ' + esc(pf.lens || '') + ' · ' + (cov.with_field || 0) + ' people with a stated field, ' + (cov.with_field_and_persona || 0) + ' of them Persona-rated · ' + (pf.conclusions || []).length + ' graded conclusions · ' + (pf.lines || []).length + ' cross-field lines. Lab only — nothing in this file is filed to a profile.</p>';
    h += tbl(['Field cohort', 'People', 'Persona-rated', 'Conclusions'],
      (pf.cohorts || []).map(function(c){ return '<tr><td>' + esc(c.field) + '</td><td>' + c.n + '</td><td>' + c.n_persona + '</td><td>' + (c.conclusion_ids || []).length + '</td></tr>'; }).join(''));
  }
  else if(w === 'suspect' && SB.spool){
    var sp = SB.spool, ex = sp.default_experiment || {};
    h += '<p class="sb-note">Generated ' + esc(sp.generated || '') + ' · ' + (sp.directory_n || 0) + ' people in the directory · ' + Object.keys(sp.people_evidence || {}).length + ' with on-file behavior evidence · default experiment: ' + esc(ex.pool_name || '') + ' — ' + ((ex.funnel || []).map(function(f){ return f.n; }).join(' → ')) + ' · shortlist of ' + (ex.shortlist || []).length + '. A shortlist, not a conclusion.</p>';
    h += '<h3 class="sb-h3">Behavior categories (demographics are banned by construction)</h3>' + tbl(['Category', 'In directory', 'Evidence rule'],
      (sp.categories || []).map(function(c){ return '<tr><td>' + esc(c.name || '') + '</td><td>' + (c.directory_n || 0) + '</td><td>' + esc(c.evidence_rule || '') + '</td></tr>'; }).join(''));
    h += '<h3 class="sb-h3">Seed pools</h3>' + tbl(['Pool', 'Members', 'Supported'],
      (sp.pools || []).map(function(p){ return '<tr><td>' + esc(p.name || '') + '</td><td>' + (p.supported ? (p.members || []).length : '—') + '</td><td>' + (p.supported ? 'yes' : 'no — see the Suspect Pool tool') + '</td></tr>'; }).join(''));
  }
  else h += '<div class="empty"><h3>Not loaded</h3><p>That file could not be read.</p></div>';
  return h;
}


/* ---------------- 3. reports ---------------- */
function sbPersonRows(dis, cap){
  var show = dis.slice(0, cap || 120);
  var h = '<div class="sb-plist">' + show.map(function(di){
    var e = D.directory[di];
    return '<button type="button" class="sb-prow" data-sb="openprof" data-di="' + di + '">' + avatar(e, 'sm') +
      '<span class="sb-pname">' + esc(dispName(e)) + '</span><span class="sb-pmeta">' + esc(infoLine(e)) + '</span></button>';
  }).join('') + '</div>';
  if(dis.length > show.length) h += '<p class="sb-note">…and ' + (dis.length - show.length) + ' more (use the Data grid to see them all).</p>';
  return h;
}
/* V3.10.0: Reports + Integrity are ONE tool, Insights — one scroll,
   sectioned. sbRepBlock returns one old Reports tab's body; the four
   sbInteg* sections keep their original render logic untouched. */
function sbRepBlock(tab){
  var h = '';
  var ph = sbPhotoByName();
  var listed = [];
  D.directory.forEach(function(e, di){ if(liveEntry(e)) listed.push(di); });
  function gapCard(title, test){
    var missing = listed.filter(function(di){ return !test(D.directory[di], di); });
    var pct = listed.length ? Math.round(100 * (listed.length - missing.length) / listed.length) : 0;
    return '<div class="sb-card2"><div class="sb-card2-t">' + esc(title) + '</div>' +
      '<div class="sb-bar"><span style="width:' + pct + '%"></span></div>' +
      '<div class="sb-card2-n">' + (listed.length - missing.length) + ' of ' + listed.length + ' have it · ' + missing.length + ' missing</div>' +
      (missing.length ? '<details class="sb-det"><summary>See who is missing it</summary>' + sbPersonRows(missing) + '</details>' : '<p class="sb-note">Complete.</p>') + '</div>';
  }
  if(tab === 'coverage'){
    h += '<div class="sb-grid2">' +
      gapCard('Usable photo (confirmed / likely)', function(e){ var p = ph[dispName(e).toLowerCase()]; return !!(p && p.photo_url && (p.status === 'confirmed' || p.status === 'likely')); }) +
      gapCard('Known Since', function(e){ return !!String(gv(e, 'years_known') || '').trim(); }) +
      gapCard('Any organization', function(e){ return orgsOf(e).length > 0; }) +
      gapCard('Town on file', function(e){ return !!(e.city || gv(e, 'location_on_file')); }) +
      gapCard('At least one connection', function(e){ return (e.neighbors || []).length > 0 || famLinks(e).length > 0; }) +
      gapCard('Footprint facts', function(e){ return sbFootCount(e) > 0; }) +
      '</div>';
  }
  else if(tab === 'sources'){
    h += '<div class="sb-grid2">' +
      gapCard('Snapchat handle', function(e){ return !!(e.snap_handles && e.snap_handles.length); }) +
      gapCard('Instagram handle', function(e){ return !!effHandle(e); }) +
      gapCard('Facebook link', function(e){ return !!e.fb_url; }) +
      gapCard('Email', function(e){ return !!gv(e, 'email'); }) +
      gapCard('Phone', function(e){ return !!gv(e, 'phone'); }) +
      gapCard('Any of Snapchat / Instagram / Facebook', function(e){ return !!((e.snap_handles && e.snap_handles.length) || effHandle(e) || e.fb_url); }) +
      '</div>';
  }
  else if(tab === 'stale'){
    var dt = SB.dt || {};
    var checkedKeys = {};
    (dt.checked || []).forEach(function(c){ checkedKeys[String(c.name || '').toLowerCase()] = 1; });
    var checkedDis = listed.filter(function(di){ var e = D.directory[di]; return checkedKeys[pkey(e).toLowerCase()] || checkedKeys[String(e.name || '').toLowerCase()]; });
    var notChecked = listed.filter(function(di){ return checkedDis.indexOf(di) < 0; });
    /* V3.13.0: the name lists fold away — the verdict above carries
       the answer; the lists are evidence, opened on demand. */
    var nextDis = (dt.next_up || []).map(function(c){ var di = PK2I[String(c.name || '').toLowerCase()]; if(di == null) di = BYN[String(c.name || '').toLowerCase()]; return di; }).filter(function(x){ return x != null; });
    h += '<div class="sb-grid2"><div class="sb-card2"><div class="sb-card2-t">Latest brief</div>' +
      '<div class="sb-card2-n">' + esc(dt.date || '—') + ' · coverage ' + esc(String((dt.coverage || {}).checked_total || 0)) + ' of ' + esc(String((dt.coverage || {}).of || 0)) + ' checked in the last ' + esc(String((dt.coverage || {}).window_days || 30)) + ' days · ' + esc(String(dt.unchecked_remaining || 0)) + ' unchecked in the rotation</div>' +
      '<details class="sb-det"><summary>Checked in the latest brief (' + checkedDis.length + ')</summary>' + sbPersonRows(checkedDis, 200) + '</details>' +
      '</div><div class="sb-card2"><div class="sb-card2-t">The rotation queue</div>' +
      '<details class="sb-det"><summary>Next up in the rotation (' + nextDis.length + ')</summary>' + sbPersonRows(nextDis, 200) + '</details>' +
      '<details class="sb-det"><summary>Not in the latest brief\u2019s checked set (' + notChecked.length + ')</summary>' +
      '<p class="sb-note">The rotation covers everyone about monthly; per-person last-checked dates live in the routine\u2019s state file, not the bake, so this list is \u201cnot checked in the most recent brief\u201d rather than a true 30-day staleness measure.</p>' +
      sbPersonRows(notChecked, 300) + '</details></div></div>';
  }
    return h;
}

/* ---------------- 4. insights (layered since V3.12.0) ----------------
   JD: the old Insights page was eight reports "slapped on one page —
   just names and dropdowns", so nothing could be found. Now it is a
   parent with eight named children: the index says in plain language
   what each check is FOR and shows one live number; each child page
   carries exactly one report, with a sub-nav strip to move between
   siblings without going back up. Routes: #/sandbox/insights (index)
   and #/sandbox/insights/<child>. Back peels child -> index -> home. */
var SB_INSIGHTS = [
  { k:'coverage', t:'Coverage', sec:'Coverage gaps',
    d:'Who is missing what — no usable photo, no Known Since, no footprint, no connections. The gap lists, one click from the profile.' },
  { k:'sources', t:'Sources', sec:'Source coverage',
    d:'Where the record comes from — which sidecars and sources actually cover which people, so a thin source is visible before it is trusted.' },
  { k:'stale', t:'Freshness', sec:'Live Records staleness',
    d:'How current the directory is — when each person was last re-checked by Live Records, and who has gone longest without a check.' },
  { k:'recon', t:'Count reconciliation', sec:'Integrity — count reconciliation',
    d:'Why the numbers differ: Sheet rows vs baked directory vs the app\u2019s people count, reconciled key by key so nobody is missing or double-counted.' },
  { k:'dup', t:'Duplicate hunter', sec:'Integrity — duplicate hunter',
    d:'Candidate duplicate pairs — same or similar names, or a shared phone, email or handle. This is also the Merge studio\u2019s queue.' },
  { k:'orphan', t:'Orphans & malformed', sec:'Integrity — orphans & malformed',
    d:'Links pointing nowhere, names that don\u2019t resolve, malformed entries and shell profiles — the residue that quietly breaks other views.' },
  { k:'photolinks', t:'Photo link check', sec:'Integrity — photo links',
    d:'Fetches every filed photo URL and lists the ones that no longer respond, so dead photos are found before JD finds them.' }
];
function sbInsStat(k){
  try {
    if(k === 'coverage'){
      var phn = sbPhotoByName();
      var conf = people().filter(function(di){ var p = phn[dispName(D.directory[di]).toLowerCase()]; return !!(p && p.photo_url && (p.status === 'confirmed' || p.status === 'likely')); }).length;
      return (people().length - conf) + ' without a usable photo';
    }
    if(k === 'sources') return Object.keys(SB_RAW_META).length + ' baked sidecars';
    if(k === 'stale') return (SB.dt && typeof SB.dt.unchecked_remaining === 'number') ? SB.dt.unchecked_remaining + ' not yet checked this cycle' : 'rotation state';
    if(k === 'recon') return (SB.recon && SB.recon.verdict) ? SB.recon.verdict : 'Sheet vs bake';
    if(k === 'dup') return sbDupPairs().length + ' candidate pairs';
    if(k === 'orphan') return 'links, names, shells';
    if(k === 'photolinks') return ((SB.photos && SB.photos.people) || []).filter(function(p){ return p.photo_url; }).length + ' filed URLs';
  } catch(x) {}
  return '';
}
/* V3.13.0 (JD: Insights children were "a row of sheets and numbers
   and messy information" — he couldn't tell what a page was FOR).
   Every child now LEADS with the answer: one plain-language verdict
   sentence + the two or three numbers that decide it, then the
   supporting detail below. If the verdict says nothing needs
   attention, the detail is there to check, not to dig through. */
function sbInsVerdict(k){
  var ppl = people().length, chips = [], main = '', sub = '';
  function chip(l, v){ chips.push('<span class="sb-vchip"><b>' + esc(String(v)) + '</b> ' + esc(l) + '</span>'); }
  try {
    if(k === 'coverage'){
      var phn = sbPhotoByName(), noPh = 0, noY = 0, noOrg = 0, noConn = 0;
      people().forEach(function(di){ var e = D.directory[di]; var p = phn[dispName(e).toLowerCase()];
        if(!(p && p.photo_url && (p.status === 'confirmed' || p.status === 'likely'))) noPh++;
        if(!String(gv(e, 'years_known') || '').trim()) noY++;
        if(!orgsOf(e).length) noOrg++;
        if(!(e.neighbors || []).length && !famLinks(e).length) noConn++; });
      var worst = [['a usable photo', noPh], ['Known Since', noY], ['any organization', noOrg], ['any connection', noConn]].sort(function(a, b){ return b[1] - a[1]; })[0];
      main = noPh === 0 && noY === 0 && noOrg === 0 ? 'Coverage is complete \u2014 every listed person has the basics.' :
        'The widest gap is ' + worst[0] + ': ' + worst[1] + ' of ' + ppl + ' people are missing it.';
      sub = 'Each card below is one gap, with the full list of who is missing it one click away.';
      chip('without a usable photo', noPh); chip('without Known Since', noY); chip('without any org', noOrg);
    } else if(k === 'sources'){
      var sN = 0, iN = 0, fN = 0, noneN = 0;
      people().forEach(function(di){ var e = D.directory[di]; var s = !!(e.snap_handles && e.snap_handles.length), i = !!effHandle(e), f = !!e.fb_url;
        if(s) sN++; if(i) iN++; if(f) fN++; if(!s && !i && !f) noneN++; });
      main = noneN ? noneN + ' people have none of the three social sources \u2014 they are reachable only by web research or email.' :
        'Every listed person carries at least one social source.';
      sub = 'Where the record comes from, source by source \u2014 a thin source is visible here before it gets trusted elsewhere.';
      chip('Snapchat', sN); chip('Instagram', iN); chip('Facebook', fN);
    } else if(k === 'stale'){
      var dt = SB.dt || {}, cov = dt.coverage || {};
      main = 'Live Records has checked ' + (cov.checked_total || 0) + ' of ' + (cov.of || ppl) + ' people in the current cycle' +
        (dt.unchecked_remaining ? '; ' + dt.unchecked_remaining + ' are still waiting for their turn.' : ' \u2014 the rotation is fully caught up.');
      sub = 'Who was checked in the latest brief, who is next, and who has not been reached yet \u2014 the lists are folded away below.';
      chip('checked this cycle', cov.checked_total || 0); chip('unchecked', dt.unchecked_remaining || 0);
    }  else if(k === 'recon'){
      var r = SB.recon || {};
      main = r.verdict ? esc(r.verdict) + '.' : 'Sheet rows vs the baked directory, reconciled key by key.';
      sub = 'Every differing key is explained below \u2014 nobody is missing and nobody is double-counted.';
      if(r.sheet) chip('keyed Sheet rows', r.sheet.keyed_rows); chip('people in the app', ppl);
    } else if(k === 'dup'){
      var n = sbDupPairs().length;
      main = n ? n + ' candidate pairs are open \u2014 each is either a merge waiting to happen or a \u201cnot duplicates\u201d ruling.' : 'No candidate duplicate pairs are open.';
      sub = 'This list is also the Merge studio\u2019s queue.';
      chip('open pairs', n);
    } else if(k === 'orphan'){
      main = 'Links that point nowhere, names that don\u2019t resolve, and shell profiles \u2014 the residue that quietly breaks other views.';
      sub = 'Each row opens the profile that carries the problem.';
      chip('open findings (all integrity)', sbFindingsCount());
    } else if(k === 'photolinks'){
      var n2 = ((SB.photos && SB.photos.people) || []).filter(function(p){ return p.photo_url; }).length;
      main = n2 + ' filed photo URLs. The check runs from this browser, so a host that blocks cross-origin reads reports as \u201cno response\u201d \u2014 suspects, not verdicts.';
      sub = 'A confirmed 404 is certainly dead; everything else deserves a second look before it is touched.';
      chip('filed URLs', n2);
    }
  } catch(x) { main = ''; }
  if(!main) return '';
  return '<div class="sb-verdict"><div class="sb-verdict-t">The short answer</div><p class="sb-verdict-m">' + main + '</p>' +
    (sub ? '<p class="sb-verdict-s">' + esc(sub) + '</p>' : '') +
    (chips.length ? '<div class="sb-vchips">' + chips.join('') + '</div>' : '') + '</div>';
}
function sbInsights(){
  var cur = SB_INSIGHTS.filter(function(x){ return x.k === SB.ins.view; })[0] || null;
  if(!cur){
    var h = sbHead('Insights', 'Eight checks on the directory\u2019s health, each on its own page. Pick the question you are asking — every page says what it is for and opens the profiles it names.');
    h += '<div class="sb-insgrid">' + SB_INSIGHTS.map(function(x){
      return '<a class="sb-card" href="#/sandbox/insights/' + x.k + '"><span class="sb-card-t">' + esc(x.t) + '</span>' +
        '<span class="sb-card-d">' + esc(x.d) + '</span>' +
        '<span class="sb-card-s">' + esc(sbInsStat(x.k)) + '</span></a>';
    }).join('') + '</div>';
    return h;
  }
  var h = sbHead(cur.t, cur.d);
  h += '<div class="sb-toolbar sb-insnav"><a class="btn sm ghost" href="#/sandbox/insights">All insights</a>' +
    SB_INSIGHTS.map(function(x){
      return '<a class="btn sm ' + (x.k === cur.k ? 'primary' : 'ghost') + '" href="#/sandbox/insights/' + x.k + '">' + esc(x.t) + '</a>';
    }).join('') + '</div>';
  h += sbInsVerdict(cur.k);
  h += '<div class="sb-sec">' + cur.sec + '</div>';
  if(cur.k === 'coverage') h += sbRepBlock('coverage');
  else if(cur.k === 'sources') h += sbRepBlock('sources');
  else if(cur.k === 'stale') h += sbRepBlock('stale');
  else if(cur.k === 'recon') h += sbIntegRecon();
  else if(cur.k === 'dup') h += sbIntegDup();
  else if(cur.k === 'orphan') h += sbIntegOrphan();
  else if(cur.k === 'photolinks') h += sbIntegPhotos();
  return h;
}
function sbIntegRecon(){
  var r = SB.recon;
  /* live recompute of the app side */
  var pkSeen = {}, dups = {};
  D.directory.forEach(function(e){ var k = pkey(e); if(pkSeen[k]) (dups[k] = dups[k] || [pkSeen[k]]).push(e.name); pkSeen[k] = e.name; });
  var h = '<div class="sb-card2"><div class="sb-card2-t">Live recompute (this browser, right now)</div>' +
    '<div class="sb-card2-n">Directory entries: <b>' + D.directory.length + '</b> · people() count: <b>' + people().length + '</b> · unique app keys: <b>' + Object.keys(pkSeen).length + '</b>' +
    (Object.keys(dups).length ? ' · shared keys: ' + Object.keys(dups).map(function(k){ return '<b>' + esc(k) + '</b> (' + dups[k].map(esc).join(', ') + ')'; }).join('; ') : ' · no shared keys') + '</div></div>';
  if(!r) return h + '<div class="empty"><h3>recon.json not loaded</h3><p>Run scripts/sandbox_recon.py and push, or queue a recon op from the Danger area.</p></div>';
  var run = null;
  h += '<div class="sb-card2"><div class="sb-card2-t">Sheet vs bake — the waterfall <span class="sb-verdict">' + esc(r.verdict || '') + '</span></div>' +
    '<p class="sb-note">Generated ' + esc(r.generated_at || '') + ' by scripts/sandbox_recon.py (fresh Sheet read). Bake updated ' + esc((r.bake || {}).updated || '') + '.</p>' +
    '<table class="sb-table sb-wf"><tbody>' + (r.waterfall || []).map(function(w){
      var left;
      if(w.equals){ run = w.count; left = '<b>' + w.count + '</b>'; }
      else if(run == null){ run = w.count; left = '<b>' + w.count + '</b>'; }
      else { run += w.count; left = (w.count > 0 ? '+' : '') + w.count + ' → ' + run; }
      return '<tr><td>' + esc(w.label) + (w.detail ? '<div class="sb-wfd">' + esc(w.detail) + '</div>' : '') +
        (w.keys && w.keys.length ? '<div class="sb-wfk">' + w.keys.map(esc).join(' · ') + '</div>' : '') +
        '</td><td class="sb-wfn">' + left + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  if((r.explained || []).length){
    h += '<div class="sb-card2"><div class="sb-card2-t">Every differing key, explained</div>' + (r.explained || []).map(function(x){
      return '<div class="sb-expl"><b>' + esc(x.key) + '</b><span>' + esc(x.reason) + '</span></div>';
    }).join('') + '</div>';
  }
  h += '<div class="sb-card2"><div class="sb-card2-t">The short answer</div><p class="sb-note" style="font-size:13px">The Sheet holds ' +
    esc(String((r.sheet || {}).keyed_rows || '')) + ' keyed profile rows. Three are folded into survivors by merges, one (ig:test_deploy_check) is a leftover deploy-check row the bake never turns into a person, and JD\u2019s own profile (ig:jdmeyers_) attaches to his graph entry, whose app key computes as sf:jdmeyers_ — a key it shares with a malformed twin row, which is why 733 people answer to 732 unique keys. Nothing is missing and nobody is double-counted in people().</p></div>';
  return h;
}
function sbDupPairs(){
  var byName = {}, pairs = [], seenPair = {};
  function addPair(a, b, why){
    if(a === b) return;
    var k = [pkey(D.directory[a]), pkey(D.directory[b])].sort().join('|') + '|' + why;
    if(seenPair[k]) return; seenPair[k] = 1; pairs.push({ a:a, b:b, why:why });
  }
  D.directory.forEach(function(e, di){
    if(!liveEntry(e)) return;
    var nm = dispName(e).toLowerCase();
    (byName[nm] = byName[nm] || []).push(di);
  });
  Object.keys(byName).forEach(function(nm){ var g = byName[nm]; for(var i = 0; i < g.length; i++) for(var j = i + 1; j < g.length; j++) addPair(g[i], g[j], 'same name'); });
  /* same surname + same first initial, different full name */
  var bySig = {};
  D.directory.forEach(function(e, di){
    if(!liveEntry(e)) return;
    var parts = dispName(e).toLowerCase().split(/\s+/).filter(Boolean);
    if(parts.length < 2) return;
    var sig = parts[parts.length - 1] + '|' + parts[0].charAt(0);
    (bySig[sig] = bySig[sig] || []).push(di);
  });
  Object.keys(bySig).forEach(function(sig){
    var g = bySig[sig];
    for(var i = 0; i < g.length; i++) for(var j = i + 1; j < g.length; j++)
      if(dispName(D.directory[g[i]]).toLowerCase() !== dispName(D.directory[g[j]]).toLowerCase()) addPair(g[i], g[j], 'similar name');
  });
  /* shared identifiers */
  [['phone', function(e){ var p = String(gv(e, 'phone') || '').replace(/\D/g, ''); return p.length >= 7 ? p.slice(-10) : ''; }, 'same phone'],
   ['email', function(e){ return String(gv(e, 'email') || '').split(',')[0].trim().toLowerCase(); }, 'same email'],
   ['ig', function(e){ return effHandle(e).toLowerCase(); }, 'same Instagram'],
   ['snap', function(e){ return (e.snap_handles || []).map(function(x){ return x.toLowerCase(); }); }, 'same Snapchat']]
  .forEach(function(spec){
    var map = {};
    D.directory.forEach(function(e, di){
      if(!liveEntry(e)) return;
      var vals = spec[1](e); if(!Array.isArray(vals)) vals = [vals];
      vals.forEach(function(val){ if(val) (map[val] = map[val] || []).push(di); });
    });
    Object.keys(map).forEach(function(val){ var g = map[val]; for(var i = 0; i < g.length; i++) for(var j = i + 1; j < g.length; j++) addPair(g[i], g[j], spec[2]); });
  });
  return pairs;
}
function sbIntegDup(){
  var ok = sbStore('ncc_sbx_dupok') || {};
  var pairs = sbDupPairs().filter(function(p){
    return !ok[[pkey(D.directory[p.a]), pkey(D.directory[p.b])].sort().join('|')];
  });
  var h = '<div class="sb-card2"><div class="sb-card2-t">Candidate duplicate pairs (' + pairs.length + ')</div>' +
    '<p class="sb-note">Same or similar names, or a shared phone / email / Instagram / Snapchat identifier. This is also the Merge studio\u2019s queue. \u201cNot duplicates\u201d is remembered on this device.</p>';
  if(!pairs.length) h += '<p class="sb-note">No unresolved candidate pairs.</p>';
  pairs.slice(0, 80).forEach(function(p, i){
    var A = D.directory[p.a], B = D.directory[p.b];
    h += '<div class="sb-pair"><div class="sb-pair-why">' + esc(p.why) + '</div>' +
      '<button type="button" class="sb-prow" data-sb="openprof" data-di="' + p.a + '">' + avatar(A, 'sm') + '<span class="sb-pname">' + esc(dispName(A)) + '</span><span class="sb-pmeta">' + esc(pkey(A)) + '</span></button>' +
      '<span class="sb-pair-x">×</span>' +
      '<button type="button" class="sb-prow" data-sb="openprof" data-di="' + p.b + '">' + avatar(B, 'sm') + '<span class="sb-pname">' + esc(dispName(B)) + '</span><span class="sb-pmeta">' + esc(pkey(B)) + '</span></button>' +
      '<span class="sb-pair-btns"><button type="button" class="btn primary sm" data-sb="pairmerge" data-a="' + p.a + '" data-b="' + p.b + '">Merge →</button>' +
      '<button type="button" class="btn ghost sm" data-sb="pairnotdup" data-a="' + p.a + '" data-b="' + p.b + '">Not duplicates</button></span></div>';
  });
  return h + '</div>';
}
function sbIntegOrphan(){
  var names = {};
  D.directory.forEach(function(e){ names[String(e.name || '').toLowerCase()] = 1; });
  var orphN = [], orphC = [], orphF = [];
  D.directory.forEach(function(e, di){
    if(!liveEntry(e)) return;
    (e.neighbors || []).forEach(function(n){ if(!names[String(n.u || '').toLowerCase()] && orphN.length < 60) orphN.push({ di:di, what:'@' + n.u }); });
    splitTags(gv(e, 'close_add'), ', ').forEach(function(nm){ if(BYN[nm.toLowerCase()] == null && orphC.length < 60) orphC.push({ di:di, what:nm }); });
    famLinks(e).forEach(function(l){ if(BYN[String(l[1] || '').toLowerCase()] == null && orphF.length < 60) orphF.push({ di:di, what:String(l[1]) }); });
  });
  function block(title, items, note){
    return '<div class="sb-card2"><div class="sb-card2-t">' + esc(title) + ' (' + items.length + (items.length >= 60 ? '+' : '') + ')</div><p class="sb-note">' + esc(note) + '</p>' +
      (items.length ? '<div class="sb-plist">' + items.map(function(x){
        return '<button type="button" class="sb-prow" data-sb="openprof" data-di="' + x.di + '"><span class="sb-pname">' + esc(dispName(D.directory[x.di])) + '</span><span class="sb-pmeta">→ ' + esc(x.what) + '</span></button>';
      }).join('') + '</div>' : '<p class="sb-note">None.</p>') + '</div>';
  }
  var tk = sbTrashKeys(), overlap = [];
  D.directory.forEach(function(e, di){ if(liveEntry(e) && tk[pkey(e)]) overlap.push(di); });
  var malformed = [];
  D.directory.forEach(function(e, di){ if(/[A-Z\s]/.test(e.name || '') && !/^ct:/.test(e.name)) malformed.push({ di:di, what:e.name }); });
  var snapOrph = [];
  if(SB.snap) Object.keys(SB.snap.people || {}).forEach(function(k){ if(PK2I[k.toLowerCase()] == null) snapOrph.push(k); });
  var phNames = {};
  D.directory.forEach(function(e){ phNames[dispName(e).toLowerCase()] = 1; });
  var photoOrph = ((SB.photos && SB.photos.people) || []).filter(function(p){ return !phNames[String(p.name || '').toLowerCase()]; }).map(function(p){ return p.name; });
  var shells = [];
  D.directory.forEach(function(e, di){ if(liveEntry(e) && !sbFootCount(e) && !(e.neighbors || []).length && !(e.record && e.record.body)) shells.push(di); });
  var grpMap = allGroups(), emptyGroups = Object.keys(grpMap).filter(function(g){ return !grpMap[g].length; });
  var h = '<div class="sb-grid2">' +
    block('Associate links pointing nowhere', orphN, 'Graph neighbors whose username has no directory entry (they left the graph or were renamed).') +
    block('Close-add names that don\u2019t resolve', orphC, 'Names in \u201cclose associates\u201d that match no profile — typos and name changes land here.') +
    block('Family links that don\u2019t resolve', orphF, 'Family entries whose target key matches no profile.') +
    block('Malformed entry names', malformed.slice(0, 60), 'Directory names carrying capitals or spaces (contact entries are exempt).') +
    '</div>';
  h += '<div class="sb-card2"><div class="sb-card2-t">Cross-checks</div>' +
    '<div class="sb-expl"><b>Live keys also in Trash</b><span>' + (overlap.length ? overlap.map(function(di){ return esc(pkey(D.directory[di])); }).join(', ') : 'none — the blocklist and the directory agree') + '</span></div>' +
    '<div class="sb-expl"><b>Snapchat sidecar entries with no profile</b><span>' + (snapOrph.length ? snapOrph.map(esc).join(', ') : 'none') + '</span></div>' +
    '<div class="sb-expl"><b>Photo entries with no matching profile</b><span>' + (photoOrph.length ? photoOrph.slice(0, 30).map(esc).join(', ') + (photoOrph.length > 30 ? ' …' : '') : 'none') + '</span></div>' +
    '<div class="sb-expl"><b>Empty groups</b><span>' + (emptyGroups.length ? emptyGroups.map(esc).join(', ') : 'none') + '</span></div>' +
    '<div class="sb-expl"><b>Shell profiles</b><span>' + shells.length + ' listed people with no footprint, no connections and no written record' + (shells.length ? ' — ' + shells.slice(0, 20).map(function(di){ return esc(dispName(D.directory[di])); }).join(', ') : '') + '</span></div></div>';
  return h;
}
function sbIntegPhotos(){
  var pp = ((SB.photos && SB.photos.people) || []).filter(function(p){ return p.photo_url; });
  var h = '<div class="sb-card2"><div class="sb-card2-t">Photo link check (' + pp.length + ' filed URLs)</div>' +
    '<p class="sb-note">Fetches every filed photo URL from this browser. \u201cNo response\u201d means the host didn\u2019t answer OR it blocks cross-origin reads (CORS) — either way Contacts Pro can\u2019t display it, but only a confirmed 404 is certainly dead, so treat the list as suspects, not verdicts.</p>';
  if(SB.integ.deadBusy) h += '<p class="sb-note">Checking… ' + (SB.integ.deadDone || 0) + ' / ' + pp.length + '</p>';
  else if(SB.integ.dead){
    var bad = SB.integ.dead;
    h += '<p class="sb-note">' + (pp.length - bad.length) + ' responded · ' + bad.length + ' gave no response:</p><div class="sb-plist">' +
      bad.slice(0, 80).map(function(x){ return '<span class="sb-prow sb-static"><span class="sb-pname">' + esc(x.name) + '</span><span class="sb-pmeta">' + esc(x.host) + '</span></span>'; }).join('') + '</div>';
  }
  else h += '<button type="button" class="btn primary" data-sb="deadcheck">Run the check</button>';
  return h + '</div>';
}
function sbRunDead(){
  var pp = ((SB.photos && SB.photos.people) || []).filter(function(p){ return p.photo_url; });
  var bad = [], i = 0; SB.integ.deadDone = 0;
  function next(){
    if(S.route.name !== 'sandbox' || SB.tool !== 'insights'){ SB.integ.deadBusy = false; SB.integ._deadRun = false; return; }
    if(i >= pp.length){ SB.integ.dead = bad; SB.integ.deadBusy = false; SB.integ._deadRun = false; if(SB.ins.view === 'photolinks') render(); return; }
    var p = pp[i++];
    var host = ''; try{ host = new URL(p.photo_url).hostname; }catch(x){}
    fetch(p.photo_url, { method:'GET', mode:'no-cors' }).then(function(){ SB.integ.deadDone++; }).catch(function(){ bad.push({ name:p.name, host:host }); SB.integ.deadDone++; })
      .then(function(){ if(i % 12 === 0 && SB.ins.view === 'photolinks') render(); next(); });
  }
  var workers = []; for(var w = 0; w < 6; w++) workers.push(next());
}


/* ---------------- 4b. Discovery trails (V3.13.0, JD) ----------------
   "How did you FIND these people?" — the reverse engineering of every
   find: what was searched, which route produced the photo or the
   facts, the identity anchors that made it fileable, and what failed
   first. Built by scripts/build_discovery.py from the REAL records
   only (photos.json evidence, the council photo hunts, the email /
   Snapchat / web-research filing records, the change log). A person
   with no documented trail says so — nothing is reconstructed or
   invented here. The header ranks the routes by documented yield so
   JD can see which methods actually produce finds. */
function sbDiscTrail(name){ var d = SB.discData; if(!d || !d.people) return null; return d.people[String(name || '').toLowerCase()] || null; }
function sbDiscRows(){
  var q = (SB.dsc.q || '').trim().toLowerCase();
  var dis = people().slice().sort(function(a, b){ return dispName(D.directory[a]).localeCompare(dispName(D.directory[b])); });
  var out = [];
  dis.forEach(function(di){
    var e = D.directory[di], nm = dispName(e);
    if(q && nm.toLowerCase().indexOf(q) < 0) return;
    var tr = sbDiscTrail(nm);
    var kinds = tr ? tr.trails.map(function(t){ return t.kind; }).filter(function(v, i, a){ return a.indexOf(v) === i; }) : [];
    out.push('<button type="button" class="sb-drow' + (SB.dsc.sel === nm.toLowerCase() ? ' on' : '') + '" data-sb="discsel" data-k="' + esc(nm.toLowerCase()) + '">' +
      '<span class="sb-dname">' + esc(nm) + '</span>' +
      (tr ? '<span class="sb-dkinds">' + kinds.map(function(k){ return '<span class="sb-dkind">' + esc(k) + '</span>'; }).join('') + '</span>'
          : '<span class="sb-dnone">No documented trail</span>') + '</button>');
  });
  return out.length ? out.join('') : '<p class="sb-note" style="padding:10px">Nobody matches that search.</p>';
}
function sbDiscDetail(){
  var nm = SB.dsc.sel;
  if(!nm) return '<div class="sb-card2"><div class="sb-card2-t">Pick a person</div><p class="sb-note">The list on the left is the whole directory. People with a documented discovery trail carry chips; select anyone to see how they were found — or that no trail is documented yet.</p></div>';
  var di = BYN[nm]; var e = di != null ? D.directory[di] : null;
  var name = e ? dispName(e) : nm;
  var tr = sbDiscTrail(name);
  var h = '<div class="sb-card2"><div class="sb-card2-t">' + esc(name) + '</div>' +
    (e ? '<p class="sb-note">' + esc(infoLine(e) || '') + '</p><p><button type="button" class="btn sm ghost" data-sb="openprof" data-di="' + di + '">Open profile</button></p>' : '');
  if(!tr || !tr.trails.length){
    return h + '<div class="sb-dempty"><b>No documented trail yet.</b><p>This person entered the directory without a recorded search story — no photo hunt, filing record, or research-batch entry names them. When a future pass documents how they were found, the trail will appear here.</p></div></div>';
  }
  h += tr.trails.map(function(t){
    var s = '<div class="sb-dtrail"><div class="sb-dtrail-h"><span class="sb-dkind big">' + esc(t.kind) + '</span><b>' + esc(t.route) + '</b>' +
      (t.status ? '<span class="sb-dstatus">' + esc(t.status) + '</span>' : '') +
      (t.date ? '<span class="sb-ddate">' + esc(t.date) + '</span>' : '') + '</div>';
    if(t.summary) s += '<p class="sb-dsum">' + esc(t.summary) + '</p>';
    if(t.failed && t.failed.length) s += '<div class="sb-dfail"><span>What didn\u2019t work first</span><ul>' + t.failed.map(function(f){ return '<li>' + esc(f) + '</li>'; }).join('') + '</ul></div>';
    var meta = [];
    if(t.source) meta.push('<a href="' + esc(t.source) + '" target="_blank" rel="noopener">Source page</a>');
    if(t.record) meta.push('<span>Record: ' + esc(t.record) + '</span>');
    if(meta.length) s += '<div class="sb-dmeta">' + meta.join(' · ') + '</div>';
    return s + '</div>';
  }).join('');
  return h + '</div>';
}
function sbDiscovery(){
  var d = SB.discData;
  var h = sbHead('Discovery trails', 'How each person was found — the route that produced their photo or facts, the anchors behind it, and what failed first. Built only from the written records; no trail is reconstructed after the fact.');
  if(!d){
    return h + '<div class="empty"><h3>discovery.json not loaded</h3><p>Run scripts/build_discovery.py and push. It reads the filing records and photo evidence — it never invents a search.</p></div>';
  }
  var cov = d.coverage || {};
  h += '<div class="sb-verdict"><div class="sb-verdict-t">Which methods actually produce finds</div>' +
    '<p class="sb-verdict-m">Documented trails exist for ' + (cov.documented || 0) + ' of the ' + people().length + ' people in the directory. The routes below are ranked by confirmed photo finds on file.</p>' +
    '<div class="sb-meths">' + (d.methods || []).slice(0, 7).map(function(m){
      var mx = Math.max.apply(null, (d.methods || []).map(function(x){ return x.confirmed || 0; }).concat([1]));
      return '<div class="sb-meth"><span class="sb-meth-l">' + esc(m.route) + '</span><span class="sb-meth-bar"><span style="width:' + Math.round(100 * (m.confirmed || 0) / mx) + '%"></span></span><span class="sb-meth-n">' + (m.confirmed || 0) + ' confirmed' + (m.possible ? ' · ' + m.possible + ' possible' : '') + '</span></div>';
    }).join('') + '</div>' +
    ((d.hunt_stats || []).length ? '<p class="sb-verdict-s">' + d.hunt_stats.map(function(s){ return esc(s); }).join(' ') + '</p>' : '') + '</div>';
  if(SB.dsc.sel == null){
    var first = people().map(function(di){ return dispName(D.directory[di]); }).filter(function(nm){ return !!sbDiscTrail(nm); }).sort()[0];
    if(first) SB.dsc.sel = first.toLowerCase();
  }
  h += '<div class="sb-disc"><div class="sb-dlistwrap"><input type="search" data-sbi="discq" placeholder="Search names\u2026" autocomplete="off" value="' + esc(SB.dsc.q || '') + '">' +
    '<div class="sb-dlist" id="disclist">' + sbDiscRows() + '</div></div>' +
    '<div class="sb-dpanel" id="discpanel">' + sbDiscDetail() + '</div></div>';
  return h;
}
function sbDiscPaintList(){
  var box = document.getElementById('disclist'); if(box) box.innerHTML = sbDiscRows();
  var pan = document.getElementById('discpanel'); if(pan) pan.innerHTML = sbDiscDetail();
}

/* ---------------- 5. The Lab (V3.10.0): connection lab, profiling,
   suspect pool and playground under one tab bar. Tabs are buttons, not
   history layers — Back from any tab goes to Sandbox home. Each lab
   keeps its own state, storage keys and sidecars; only the shell is new. */
function sbLabTool(){
  var tab = sbLabTab();
  var cur = SB_LABS.filter(function(l){ return l.k === tab; })[0] || SB_LABS[0];
  var h = sbHead('The Lab', 'Experiments on the live data. Read-only — nothing in the Lab writes to a profile. Profiling inferences has its own home now, one level up in Play.');
  h += '<div class="sb-toolbar sb-labtabs">' + SB_LABS.map(function(l){
    return '<button type="button" class="btn sm ' + (tab === l.k ? 'primary' : 'ghost') + '" data-sb="labtab" data-k="' + l.k + '">' + esc(l.t) + '</button>';
  }).join('') + '</div>';
  h += '<p class="sb-labsub"><b>' + esc(cur.t) + '.</b> ' + esc(cur.d || '') + '</p>';
  var fn = { paths:sbLab, pool:sbPool }[tab] || sbLab;
  SB._inLab = true;
  var body = fn();
  SB._inLab = false;
  return h + '<div class="sb-labwrap t-' + esc(tab) + '">' + body + '</div>';
}

function sbLab(){
  var h = SB._inLab ? '' : sbHead('Connection lab', 'Paths, mutuals and the indirect connections — the shared employers, schools and groups that quietly tie the circle together.');
  h += '<div class="sb-card2"><div class="sb-card2-t">Path finder & mutual connections</div>' +
    '<div class="sb-pickrow">' + sbPersonPicker('labA', 'Person A', SB.lab.aName || '') + sbPersonPicker('labB', 'Person B', SB.lab.bName || '') +
    '<button type="button" class="btn primary" data-sb="labgo">Find path + mutuals</button></div>' +
    '<div id="labout">' + sbLabOut() + '</div></div>';
  /* indirect connections */
  var shared = {};
  D.directory.forEach(function(e, di){
    if(!liveEntry(e)) return;
    orgsOf(e).forEach(function(o){ (shared['org · ' + o] = shared['org · ' + o] || []).push(di); });
    personGroups(e).forEach(function(g){ (shared['group · ' + g] = shared['group · ' + g] || []).push(di); });
  });
  var keys = Object.keys(shared).filter(function(k){ return shared[k].length >= 2; }).sort(function(a, b){ return shared[b].length - shared[a].length; });
  h += '<div class="sb-card2"><div class="sb-card2-t">Indirect connections — shared organizations & groups (' + keys.length + ')</div>' +
    '<p class="sb-note">Ranked by how many profiles each one links. This is the SVPC pattern: one page or employer quietly connecting people who may never have met on paper.</p>';
  keys.slice(0, 40).forEach(function(k, i){
    var members = shared[k];
    h += '<details class="sb-det"><summary>' + esc(k) + ' — links ' + members.length + ' profiles</summary>' + sbPersonRows(members, 60) + '</details>';
  });
  h += '</div>';
  /* bridges */
  h += '<div class="sb-card2"><div class="sb-card2-t">Bridge ranking</div>' +
    '<p class="sb-note">Betweenness centrality over the Known-associates graph as baked (associates + family + close-add). An approximation — computed in your browser on the visible graph, so private or unfiled ties don\u2019t count.</p>';
  if(SB.lab.bridges === 'pending') h += '<p class="sb-note">Computing…</p>';
  else if(Array.isArray(SB.lab.bridges)){
    h += '<div class="sb-plist">' + SB.lab.bridges.map(function(x, i){
      return '<button type="button" class="sb-prow" data-sb="openprof" data-di="' + x.di + '"><span class="sb-rank">' + (i + 1) + '</span>' + avatar(D.directory[x.di], 'sm') + '<span class="sb-pname">' + esc(dispName(D.directory[x.di])) + '</span><span class="sb-pmeta">score ' + x.score.toFixed(1) + ' · ' + x.deg + ' connections</span></button>';
    }).join('') + '</div>';
  }
  else h += '<button type="button" class="btn ghost" data-sb="bridges">Compute bridge ranking</button>';
  return h + '</div>';
}
function sbLabOut(){
  var L = SB.lab;
  if(L.a == null || L.b == null) return '<p class="sb-note">Pick two people to see the shortest path between them and who they both know.</p>';
  var A = D.directory[L.a], B = D.directory[L.b];
  var h = '';
  if(L.path === null) h += '<p class="sb-note">No path through filed connections between ' + esc(dispName(A)) + ' and ' + esc(dispName(B)) + '.</p>';
  else if(L.path){
    h += '<div class="sb-path">' + L.path.map(function(step, i){
      return (i ? '<span class="sb-path-rel">— ' + esc(step.rel) + ' →</span>' : '') +
        '<button type="button" class="sb-path-p" data-sb="openprof" data-di="' + step.di + '">' + esc(dispName(D.directory[step.di])) + '</button>';
    }).join('') + '</div><p class="sb-note">' + (L.path.length - 1) + ' hop' + (L.path.length === 2 ? '' : 's') + ' apart.</p>';
  }
  if(L.mutual && L.mutual.length) h += '<div class="sb-card2-t" style="margin-top:12px">Mutual connections (' + L.mutual.length + ')</div>' + sbPersonRows(L.mutual, 60);
  else if(L.mutual) h += '<p class="sb-note">No mutual connections on file.</p>';
  return h;
}
function sbLabRun(){
  var adj = sbAdj(), a = SB.lab.a, b = SB.lab.b;
  if(a == null || b == null){ toast('Pick both people first'); return; }
  /* BFS */
  var prev = {}, rel = {}, seen = {}, queue = [a]; seen[a] = 1; prev[a] = null;
  while(queue.length){
    var cur = queue.shift();
    if(cur === b) break;
    Object.keys(adj[cur] || {}).forEach(function(k){
      var nb = +k;
      if(!seen[nb]){ seen[nb] = 1; prev[nb] = cur; rel[nb] = adj[cur][k]; queue.push(nb); }
    });
  }
  if(!seen[b]) SB.lab.path = null;
  else {
    var path = [], cur2 = b;
    while(cur2 != null){ path.unshift({ di:cur2, rel: rel[cur2] || '' }); cur2 = prev[cur2]; }
    SB.lab.path = path;
  }
  var aa = adj[a] || {}, bb = adj[b] || {};
  SB.lab.mutual = Object.keys(aa).filter(function(k){ return bb[k] != null; }).map(Number)
    .sort(function(x, y){ return dispName(D.directory[x]).localeCompare(dispName(D.directory[y])); });
  render();
}
function sbComputeBridges(){
  var adj = sbAdj();
  var nodes = Object.keys(adj).map(Number);
  var cb = {}; nodes.forEach(function(n){ cb[n] = 0; });
  /* Brandes' algorithm on the unweighted undirected graph */
  nodes.forEach(function(s){
    var stack = [], pred = {}, sigma = {}, dist = {}, delta = {};
    nodes.forEach(function(n){ sigma[n] = 0; dist[n] = -1; delta[n] = 0; pred[n] = []; });
    sigma[s] = 1; dist[s] = 0;
    var queue = [s];
    while(queue.length){
      var v = queue.shift(); stack.push(v);
      Object.keys(adj[v] || {}).forEach(function(k){
        var w = +k;
        if(dist[w] < 0){ dist[w] = dist[v] + 1; queue.push(w); }
        if(dist[w] === dist[v] + 1){ sigma[w] += sigma[v]; pred[w].push(v); }
      });
    }
    while(stack.length){
      var w2 = stack.pop();
      pred[w2].forEach(function(v2){ delta[v2] += (sigma[v2] / sigma[w2]) * (1 + delta[w2]); });
      if(w2 !== s) cb[w2] += delta[w2];
    }
  });
  SB.lab.bridges = nodes.map(function(n){ return { di:n, score:cb[n] / 2, deg:Object.keys(adj[n]).length }; })
    .sort(function(a, b){ return b.score - a.score; }).slice(0, 25);
  if(S.route.name === 'sandbox' && SB.tool === 'lab' && sbLabTab() === 'paths') render();
}

/* ---------------- 9. playground shelf ---------------- */


/* ---------------- 6+7. merge studio ---------------- */
var SB_MFIELDS = ['first_name', 'last_name', 'display_name', 'relationship', 'relationship_type', 'context', 'category',
  'tier', 'momentum', 'rank', 'years_known', 'phone', 'email', 'location_on_file', 'closeness', 'score_pin',
  'specialty', 'interests', 'churches', 'companies', 'universities', 'groups', 'close_add', 'close_hide',
  'highlights', 'achievements', 'also_known_as', 'chips', 'degrees', 'waivers', 'mentions', 'shared_interests', 'sources',
  'synopsis', 'public_footprint', 'lima_charlie_notes', 'events', 'files', 'family',
  'openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism', 'ego',
  'audit', 'review_flag', 'audit_dismissed', 'photo_review', 'photo_bad_reason', 'primary_photo', 'photo_order', 'photo_hidden', 'conn_phases'];
var SB_M_UNION = { specialty:1, interests:1, churches:1, companies:1, universities:1, groups:1, close_add:1, close_hide:1, highlights:1, achievements:1, also_known_as:1, chips:1, degrees:1, waivers:1 };
var SB_M_APPEND = { synopsis:1, public_footprint:1 };
var SB_M_JSON = { events:1, files:1, family:1 };
function sbMClass(f){ return SB_M_UNION[f] ? 'union' : SB_M_APPEND[f] ? 'append' : SB_M_JSON[f] ? 'json' : 'single'; }
function sbMVal(e, f){
  if(SB_M_JSON[f]){
    try{ var arr = JSON.parse(raw(e, f) || '[]'); return Array.isArray(arr) ? arr.length + ' item' + (arr.length === 1 ? '' : 's') : String(raw(e, f) || '').slice(0, 60); }
    catch(x){ return String(raw(e, f) || '').slice(0, 60); }
  }
  var v = String(gv(e, f) || '');
  return v.length > 90 ? v.slice(0, 90) + '…' : v;
}
function sbMerge(){
  var h = sbHead('Merge studio', 'Combine, never overwrite. Lists union, narratives append, single values keep the survivor\u2019s with blanks filled — unless you pick otherwise, field by field. Connections re-point both directions; Known Since keeps the earlier year; the Snapchat badge keeps the earlier year; the loser\u2019s full record is archived in the action log.');
  /* queue */
  var ok = sbStore('ncc_sbx_dupok') || {};
  var pairs = sbDupPairs().filter(function(p){ return !ok[[pkey(D.directory[p.a]), pkey(D.directory[p.b])].sort().join('|')]; });
  h += '<div class="sb-card2"><div class="sb-card2-t">Merge queue — from the duplicate hunter (' + pairs.length + ')</div>';
  if(!pairs.length) h += '<p class="sb-note">No unresolved candidate pairs. You can still merge any two profiles below.</p>';
  pairs.slice(0, 30).forEach(function(p){
    h += '<div class="sb-pair"><div class="sb-pair-why">' + esc(p.why) + '</div><span class="sb-pname">' + esc(dispName(D.directory[p.a])) + '</span><span class="sb-pair-x">×</span><span class="sb-pname">' + esc(dispName(D.directory[p.b])) + '</span>' +
      '<span class="sb-pair-btns"><button type="button" class="btn primary sm" data-sb="pairmerge" data-a="' + p.a + '" data-b="' + p.b + '">Open in studio</button></span></div>';
  });
  h += '</div>';
  /* studio */
  var M = SB.mg;
  h += '<div class="sb-card2"><div class="sb-card2-t">Studio</div>' +
    '<div class="sb-pickrow">' + sbPersonPicker('mgA', 'Profile A', M.aName || '') + sbPersonPicker('mgB', 'Profile B', M.bName || '') + '</div>';
  if(M.a != null && M.b != null){
    var A = D.directory[M.a], B = D.directory[M.b];
    h += '<div class="sb-survrow"><span>Survivor (the profile that stays):</span>' +
      '<button type="button" class="btn sm ' + (M.surv === 'a' ? 'primary' : 'ghost') + '" data-sb="mgsurv" data-v="a">' + esc(dispName(A)) + '</button>' +
      '<button type="button" class="btn sm ' + (M.surv === 'b' ? 'primary' : 'ghost') + '" data-sb="mgsurv" data-v="b">' + esc(dispName(B)) + '</button></div>';
    h += sbMgDiff();
  } else h += '<p class="sb-note">Pick both profiles to see the field-by-field diff.</p>';
  return h + '</div>';
}
function sbMgPair(){
  var M = SB.mg;
  var survDi = M.surv === 'a' ? M.a : M.b, loserDi = M.surv === 'a' ? M.b : M.a;
  return { survDi:survDi, loserDi:loserDi, S:D.directory[survDi], L:D.directory[loserDi] };
}
function sbMgDiff(){
  var pr = sbMgPair(), S = pr.S, L = pr.L, M = SB.mg;
  var rows = '';
  SB_MFIELDS.forEach(function(f){
    var sv = String(raw(S, f) || ''), lv = String(raw(L, f) || '');
    var sgv = String(gv(S, f) || ''), lgv = String(gv(L, f) || '');
    if(!sv.trim() && !lv.trim() && !sgv.trim() && !lgv.trim()) return;
    var cls = sbMClass(f);
    var pick = M.picks[f] || (f === 'years_known' ? 'earlier' : (cls === 'single' ? 'surv' : 'combined'));
    var opts;
    if(f === 'years_known') opts = [['earlier', 'Earlier year'], ['surv', 'Survivor'], ['other', 'Other']];
    else if(cls === 'single') opts = [['surv', 'Survivor'], ['other', 'Other']];
    else opts = [['combined', 'Combined'], ['surv', 'Survivor only'], ['other', 'Other only']];
    rows += '<tr><td class="sb-mf">' + esc(f.replace(/_/g, ' ')) + '<span class="sb-mcls">' + cls + '</span></td>' +
      '<td>' + esc(sbMVal(S, f)) + '</td><td>' + esc(sbMVal(L, f)) + '</td>' +
      '<td><div class="seg sb-seg">' + opts.map(function(o){
        return '<button type="button" class="' + (pick === o[0] ? 'on' : '') + '" data-sb="mgpick" data-f="' + f + '" data-v="' + o[0] + '">' + o[1] + '</button>';
      }).join('') + '</div></td></tr>';
  });
  var extras = [];
  if((S.snap_handles && S.snap_handles.length) || (L.snap_handles && L.snap_handles.length))
    extras.push('Snapchat: handles combine, earlier online-since year wins (' + esc((L.snap_handles || []).join(', ')) + ' / ' + esc((S.snap_handles || []).join(', ')) + ') — applied by the queued sidecar op.');
  var ph = sbPhotoByName();
  if(ph[dispName(S).toLowerCase()] || ph[dispName(L).toLowerCase()]) extras.push('Photos: both people have photo entries — a combine op is queued for the ops script (best status becomes the key photo).');
  if(famLinks(L).length || famLinks(S).length) extras.push('Family links and close-associates pointing at the loser are re-pointed to the survivor (both directions).');
  return '<table class="sb-table sb-mtable"><thead><tr><th>Field</th><th>Survivor — ' + esc(dispName(S)) + '</th><th>Other — ' + esc(dispName(L)) + '</th><th>Result</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    (extras.length ? '<div class="sb-extras">' + extras.map(function(x){ return '<p>' + x + '</p>'; }).join('') + '</div>' : '') +
    '<div class="sb-confrow"><button type="button" class="btn primary" data-sb="mgplan">Review the merge summary</button></div>';
}
function sbMgBuildPlan(){
  var pr = sbMgPair(), S = pr.S, L = pr.L, M = SB.mg;
  var wS = {}, wL = {};
  SB_MFIELDS.forEach(function(f){ wS[f] = String(raw(S, f) || ''); wL[f] = String(raw(L, f) || ''); });
  SB_MFIELDS.forEach(function(f){
    var cls = sbMClass(f), pick = M.picks[f] || (f === 'years_known' ? 'earlier' : (cls === 'single' ? 'surv' : 'combined'));
    if(wS[f] === wL[f] && f !== 'years_known') return;
    if(cls === 'union'){
      if(pick === 'surv') wL[f] = '';
      else if(pick === 'other') wS[f] = '';
    } else if(cls === 'append'){
      if(pick === 'surv') wL[f] = '';
      else if(pick === 'other'){ wS[f] = wL[f]; wL[f] = ''; }
    } else if(cls === 'json'){
      if(pick === 'surv') wL[f] = '';
      else if(pick === 'other') wS[f] = '';
    } else if(f === 'years_known'){
      var sy = sbYear(wS[f]), ly = sbYear(wL[f]);
      if(pick === 'other' || (pick === 'earlier' && ly && (!sy || ly < sy))) wS[f] = wL[f];
    } else if(pick === 'other'){
      wS[f] = String(gv(L, f) || wL[f]);
    }
  });
  /* the two must not end up listing each other as a close associate */
  function stripName(val, name){
    return splitTags(val, ', ').filter(function(x){ return x.toLowerCase() !== name.toLowerCase(); }).join(', ');
  }
  wS.close_add = stripName(wS.close_add || '', dispName(L)); wS.close_hide = stripName(wS.close_hide || '', dispName(L));
  wL.close_add = stripName(wL.close_add || '', dispName(S)); wL.close_hide = stripName(wL.close_hide || '', dispName(S));
  var preWrites = [];
  SB_MFIELDS.forEach(function(f){
    if(wS[f] !== String(raw(S, f) || '')) preWrites.push({ di:pr.survDi, who:'survivor', field:f, from:String(raw(S, f) || ''), to:wS[f] });
    if(wL[f] !== String(raw(L, f) || '')) preWrites.push({ di:pr.loserDi, who:'loser', field:f, from:String(raw(L, f) || ''), to:wL[f] });
  });
  /* re-point third parties */
  var loserNames = {};
  [String(L.name || '').toLowerCase(), pkey(L).toLowerCase(), dispName(L).toLowerCase(), String(L.name || '').toLowerCase().replace(/^(ig|ct|sf|fdb):/, '')].forEach(function(x){ if(x) loserNames[x] = 1; });
  var survNameKey = String(S.name || '').toLowerCase();
  var repoints = [];
  D.directory.forEach(function(e, di){
    if(di === pr.survDi || di === pr.loserDi || !liveEntry(e)) return;
    var patch = {}, notes = [];
    var fam = famLinks(e), famHit = false;
    var newFam = fam.map(function(l){
      if(loserNames[String(l[1] || '').toLowerCase()]){ famHit = true; return [l[0], survNameKey]; }
      return l;
    });
    if(famHit){
      var seenF = {}, ded = [];
      newFam.forEach(function(l){ var k = l[0] + '|' + l[1]; if(!seenF[k]){ seenF[k] = 1; ded.push(l); } });
      patch.family = JSON.stringify(ded); notes.push('family link');
    }
    ['close_add', 'close_hide'].forEach(function(cf){
      var names = splitTags(gv(e, cf), ', ');
      if(names.some(function(n){ return n.toLowerCase() === dispName(L).toLowerCase(); })){
        var rep = names.map(function(n){ return n.toLowerCase() === dispName(L).toLowerCase() ? dispName(S) : n; });
        var seenC = {}, dedC = [];
        rep.forEach(function(n){ if(!seenC[n.toLowerCase()]){ seenC[n.toLowerCase()] = 1; dedC.push(n); } });
        patch[cf] = dedC.join(', '); notes.push(cf.replace('_', ' '));
      }
    });
    if(Object.keys(patch).length) repoints.push({ di:di, name:dispName(e), patch:patch, notes:notes });
  });
  /* sidecar ops */
  var ops = [], sk = pkey(S), lk = pkey(L);
  var sHas = SB.snap && SB.snap.people && SB.snap.people[sk], lHas = SB.snap && SB.snap.people && SB.snap.people[lk];
  if(sHas && lHas) ops.push({ op:'snapmerge', survivor_key:sk, loser_key:lk });
  else if(lHas) ops.push({ op:'snaprename', old_key:lk, new_key:sk });
  var ph = sbPhotoByName(), sPh = ph[dispName(S).toLowerCase()], lPh = ph[dispName(L).toLowerCase()];
  if(sPh && lPh) ops.push({ op:'photomerge', survivor_name:dispName(S), loser_name:dispName(L) });
  else if(lPh) ops.push({ op:'photorename', old_name:dispName(L), new_name:dispName(S) });
  return { survDi:pr.survDi, loserDi:pr.loserDi, preWrites:preWrites, repoints:repoints, ops:ops,
           mergedInto: mergeTarget(pr.survDi),
           archive:{ loser:{ key:lk, name:dispName(L), entry_name:L.name, profile:Object.assign({}, L.profile || {}) },
                     survivor:{ key:sk, name:dispName(S) } } };
}
function sbMgSummaryHtml(plan){
  var S = D.directory[plan.survDi], L = D.directory[plan.loserDi];
  var h = '<p><b>' + esc(dispName(L)) + '</b> merges into <b>' + esc(dispName(S)) + '</b>. The loser\u2019s profile is archived in full in the action log, its row is marked merged (the bake folds it into the survivor on the next sync), and Settings keeps an unmerge path.</p>';
  if(plan.preWrites.length){
    h += '<h4>Field adjustments before the fold</h4><ul class="sb-ul">' + plan.preWrites.map(function(pw){
      return '<li>' + esc(pw.who) + ' · ' + esc(pw.field.replace(/_/g, ' ')) + ': ' + esc(String(pw.from).slice(0, 60) || '(blank)') + ' → ' + esc(String(pw.to).slice(0, 60) || '(cleared)') + '</li>';
    }).join('') + '</ul>';
  } else h += '<p>No field adjustments — the standard combine produces exactly the picks you made.</p>';
  if(plan.repoints.length) h += '<h4>Connections re-pointed (' + plan.repoints.length + ' people)</h4><ul class="sb-ul">' + plan.repoints.map(function(r){ return '<li>' + esc(r.name) + ' — ' + esc(r.notes.join(', ')) + '</li>'; }).join('') + '</ul>';
  if(plan.ops.length) h += '<h4>Queued for sandbox_ops.py</h4><ul class="sb-ul">' + plan.ops.map(function(o){ return '<li>' + esc(o.op) + ' — ' + esc(o.survivor_key || o.old_key || o.survivor_name || '') + '</li>'; }).join('') + '</ul><p class="sb-note">Sidecar files (snapchat.json, photos.json) are repo files the browser cannot write; export the ops from the Action log and run the script, or leave them — the next ops run picks them up.</p>';
  h += '<p class="sb-note">Everything else combines at bake time: lists union, synopsis and footprint append, blanks fill from the loser.</p>';
  return h;
}
function sbMgExecute(plan){
  var S = D.directory[plan.survDi], L = D.directory[plan.loserDi];
  txn('Sandbox merge', function(){
    plan.preWrites.forEach(function(pw){ var p = {}; p[pw.field] = pw.to; queuePatch(pw.di, p); });
    plan.repoints.forEach(function(r){ queuePatch(r.di, r.patch); });
    queuePatch(plan.loserDi, { merged_into: plan.mergedInto });
  });
  var entry = sbLogAdd({ type:'merge', title:'Merged ' + dispName(L) + ' into ' + dispName(S),
    detail: plan.preWrites.length + ' field adjustment(s), ' + plan.repoints.length + ' connection re-point(s)',
    archive: plan.archive, queuedOps: plan.ops,
    undo:{ kind:'unmerge', loserKey: plan.archive.loser.key, survKey: plan.archive.survivor.key } });
  toast('Merged — ' + dispName(L) + ' now folds into ' + dispName(S));
  closeSheet();
  SB.mg = { a:null, b:null, surv:'a', picks:{}, plan:null };
  sbOpenProfile(plan.survDi);
  return entry;
}


/* ---------------- 7. danger area ---------------- */
SB.pick = {};
function sbSelDis(){
  return Object.keys(SB.sel).map(function(k){ return SB.sel[k]; }).filter(function(di){ return D.directory[di] && liveEntry(D.directory[di]); });
}
function sbDanger(){
  var tab = SB.dg.tab;
  var h = sbHead('Danger area', 'Every operation here asks first, shows exactly who it touches, and writes an action-log entry. Deletes ride the app\u2019s own path (a deleted flag the 10-minute sync sweeps into Trash); restores and purges that need the Trash tab or a repo file are queued for scripts/sandbox_ops.py.');
  h += '<div class="sb-toolbar">' + [['delete', 'Delete'], ['restore', 'Restore & purge'], ['bulk', 'Bulk edit'], ['rename', 'Rename'], ['rekey', 'Re-key'], ['create', 'New profile'], ['rebuild', 'Rebuild']].map(function(t){
    return '<button type="button" class="btn sm ' + (tab === t[0] ? 'primary' : 'ghost') + '" data-sb="dgtab" data-k="' + t[0] + '">' + t[1] + '</button>';
  }).join('') + '</div>';
  if(tab === 'delete') h += sbDgDelete();
  else if(tab === 'restore') h += sbDgRestore();
  else if(tab === 'bulk') h += sbDgBulk();
  else if(tab === 'rename') h += sbDgRename();
  else if(tab === 'rekey') h += sbDgRekey();
  else if(tab === 'create') h += sbDgCreate();
  else if(tab === 'rebuild') h += sbDgRebuild();
  return h;
}
function sbDgDelete(){
  var dis = sbSelDis();
  var h = '<div class="sb-card2"><div class="sb-card2-t">Delete to Trash</div>';
  if(dis.length){
    h += '<p class="sb-note">' + dis.length + ' people selected in the Data grid:</p>' + sbPersonRows(dis, 200) +
      '<div class="sb-confrow"><button type="button" class="btn danger2" data-sb="delreview">Review delete…</button></div>';
  } else {
    h += sbPersonPicker('dgOne', 'Or pick one person', (SB.pick.dgOne || {}).name || '');
    if(SB.dg.one != null){
      h += sbPersonRows([SB.dg.one], 1) + '<div class="sb-confrow"><button type="button" class="btn danger2" data-sb="delreview1">Review delete…</button></div>';
    } else h += '<p class="sb-note">Bulk deletes start in the Data grid (tick the boxes, then \u201cSend to Danger area\u201d).</p>';
  }
  return h + '</div>';
}
function sbDoDelete(dis){
  var archives = dis.map(function(di){
    var e = D.directory[di];
    return { key:pkey(e), name:dispName(e), entry_name:e.name, profile:Object.assign({}, e.profile || {}) };
  });
  txn('Sandbox delete', function(){ dis.forEach(function(di){ queuePatch(di, { deleted:'1' }); }); });
  sbLogAdd({ type:'delete', title:'Deleted ' + dis.length + ' profile' + (dis.length === 1 ? '' : 's') + ' to Trash',
    detail: archives.map(function(a){ return a.name; }).join(', '), archives:archives,
    undo:{ kind:'undelete', keys:archives.map(function(a){ return a.key; }) } });
  SB.sel = {};
  toast(dis.length + ' deleted — the sync sweeps them into Trash within ~10 minutes');
  render();
}
function sbDgRestore(){
  var h = '<div class="sb-card2"><div class="sb-card2-t">Restore from Sandbox archives</div>' +
    '<p class="sb-note">Deletes and merges done here carry the full profile in the action log, so they can be brought back. If the row is still in Profiles, restore is instant; if the sync already swept it to Trash, restore re-creates the row and queues the Trash removal.</p>';
  var arch = [];
  sbLogGet().forEach(function(en){
    (en.archives || []).forEach(function(a){ arch.push({ entry:en, a:a }); });
    if(en.archive && en.archive.loser) arch.push({ entry:en, a:en.archive.loser });
  });
  if(!arch.length) h += '<p class="sb-note">No archived profiles yet.</p>';
  arch.slice(0, 40).forEach(function(x){
    var di = PK2I[String(x.a.key || '').toLowerCase()];
    var state = di == null ? 'row swept to Trash (or never landed)' : (String(raw(D.directory[di], 'merged_into') || '').trim() ? 'merged into ' + raw(D.directory[di], 'merged_into') : (String(raw(D.directory[di], 'deleted') || '') === '1' ? 'flagged deleted, still in Profiles' : 'currently live'));
    h += '<div class="sb-pair"><span class="sb-pname">' + esc(x.a.name) + '</span><span class="sb-pmeta">' + esc(x.a.key) + ' · ' + esc(state) + '</span>' +
      '<span class="sb-pair-btns"><button type="button" class="btn primary sm" data-sb="restorearch" data-key="' + esc(x.a.key) + '">Restore</button></span></div>';
  });
  h += '</div>';
  var tk = sbTrashKeys(), keys = Object.keys(tk).sort();
  var q = (SB.dg.trashQ || '').toLowerCase();
  var shown = keys.filter(function(k){ return !q || k.indexOf(q) >= 0; });
  h += '<div class="sb-card2"><div class="sb-card2-t">Trash — all ' + keys.length + ' keys</div>' +
    '<p class="sb-note">Pre-existing Trash entries carry no profile data in the app, so their restore runs through the ops script (it reads the Trash row itself). Purge is permanent: it removes the key from Trash AND from the build blocklist.</p>' +
    '<div class="sb-toolbar"><input type="text" data-sbi="trashq" placeholder="Filter keys…" value="' + esc(SB.dg.trashQ || '') + '"></div>' +
    shown.slice(0, 100).map(function(k){
      return '<div class="sb-pair"><span class="sb-pname sb-mono">' + esc(k) + '</span><span class="sb-pair-btns">' +
        '<button type="button" class="btn ghost sm" data-sb="trashrestore" data-key="' + esc(k) + '">Queue restore</button>' +
        '<button type="button" class="btn danger2 sm" data-sb="trashpurge" data-key="' + esc(k) + '">Purge…</button></span></div>';
    }).join('') + (shown.length > 100 ? '<p class="sb-note">…and ' + (shown.length - 100) + ' more — filter to narrow.</p>' : '') + '</div>';
  return h;
}
function sbRestoreArchived(key){
  var found = null;
  sbLogGet().forEach(function(en){
    (en.archives || []).concat(en.archive && en.archive.loser ? [en.archive.loser] : []).forEach(function(a){ if(a.key === key) found = a; });
  });
  if(!found){ toast('Archive not found for ' + key); return; }
  var di = PK2I[key.toLowerCase()];
  if(di != null){
    var e = D.directory[di], patch = {};
    if(String(raw(e, 'merged_into') || '').trim()) patch.merged_into = '';
    if(String(raw(e, 'deleted') || '') === '1') patch.deleted = '';
    if(!Object.keys(patch).length){ toast(found.name + ' is already live'); return; }
    txn('Sandbox restore', function(){ queuePatch(di, patch); });
    sbLogAdd({ type:'restore', title:'Restored ' + found.name, detail:'Cleared ' + Object.keys(patch).join(' + ') + ' on ' + key });
    toast('Restored ' + found.name);
    render();
    return;
  }
  var prof = {};
  Object.keys(found.profile || {}).forEach(function(k){
    if(['key', 'merged_into', 'deleted', 'updated_at'].indexOf(k) < 0) prof[k] = found.profile[k];
  });
  prof.merged_into = ''; prof.deleted = '';
  var ops = [];
  if(sbTrashKeys()[key]) ops.push({ op:'trashremove', key:key });
  sbPostBatch([{ id:key, patch:prof }]).then(function(ok){
    sbLogAdd({ type:'restore', title:'Re-created ' + found.name + ' in Profiles', detail:key + (ops.length ? ' · Trash removal queued' : ''), queuedOps:ops });
    toast(ok ? 'Restore sent — ' + found.name + ' returns on the next bake' + (ops.length ? ' (after the queued Trash removal runs)' : '') : 'Restore POST failed');
    render();
  });
}
function sbDgBulk(){
  var dis = sbSelDis();
  var h = '<div class="sb-card2"><div class="sb-card2-t">Bulk edit</div>';
  if(!dis.length) return h + '<p class="sb-note">No selection. Tick people in the Data grid first — bulk edit applies one change to everyone ticked.</p></div>';
  var B = SB.dg;
  h += '<p class="sb-note">' + dis.length + ' people selected.</p><div class="sb-formrow">' +
    '<select data-sbi="bulkfield">' + [['tier', 'Set tier'], ['addgroup', 'Add group'], ['delgroup', 'Remove group'], ['addorg', 'Add organization'], ['delorg', 'Remove organization']].map(function(o){ return '<option value="' + o[0] + '"' + (B.bulkField === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>';
  if(B.bulkField === 'tier') h += '<select data-sbi="bulkval">' + ['vetted', 'associate', 'open', ''].map(function(t){ return '<option value="' + t + '"' + (B.bulkVal === t ? ' selected' : '') + '>' + (t || '(blank)') + '</option>'; }).join('') + '</select>';
  else if(B.bulkField === 'addorg' || B.bulkField === 'delorg') h += '<select data-sbi="bulkcat">' + ORG_CATS.map(function(c){ return '<option value="' + c.k + '"' + (B.bulkCat === c.k ? ' selected' : '') + '>' + esc(c.label || c.k) + '</option>'; }).join('') + '</select><input type="text" data-sbi="bulkname" placeholder="Organization name" value="' + esc(B.bulkName) + '">';
  else h += '<input type="text" data-sbi="bulkname" placeholder="Group name" value="' + esc(B.bulkName) + '">';
  h += '<button type="button" class="btn ghost" data-sb="bulkdry">Dry run</button></div>';
  if(B.dry){
    h += '<div class="sb-dry"><div class="sb-card2-t">Dry run — ' + B.dry.length + ' people touched</div>' +
      B.dry.slice(0, 120).map(function(d){ return '<div class="sb-expl"><b>' + esc(d.name) + '</b><span>' + esc(d.field) + ': ' + esc(d.from || '(blank)') + ' → ' + esc(d.to || '(blank)') + '</span></div>'; }).join('') +
      '<div class="sb-confrow"><button type="button" class="btn primary" data-sb="bulkexec">Apply to all ' + B.dry.length + '</button></div></div>';
  }
  return h + '</div>';
}
function sbBulkCompute(){
  var dis = sbSelDis(), B = SB.dg, out = [];
  dis.forEach(function(di){
    var e = D.directory[di], patch = null, field = '', from = '', to = '';
    if(B.bulkField === 'tier'){ field = 'tier'; from = String(raw(e, 'tier') || ''); to = B.bulkVal; patch = { tier:to }; }
    else if(B.bulkField === 'addgroup' || B.bulkField === 'delgroup'){
      field = 'groups'; var cur = personGroups(e);
      var has = cur.some(function(g){ return g.toLowerCase() === B.bulkName.toLowerCase(); });
      var nxt = B.bulkField === 'addgroup' ? (has ? cur : cur.concat([B.bulkName])) : cur.filter(function(g){ return g.toLowerCase() !== B.bulkName.toLowerCase(); });
      from = cur.join(', '); to = nxt.join(', '); patch = { groups:to };
    } else {
      field = B.bulkCat; var cur2 = tagList(gv(e, B.bulkCat));
      var has2 = cur2.some(function(g){ return g.toLowerCase() === B.bulkName.toLowerCase(); });
      var nxt2 = B.bulkField === 'addorg' ? (has2 ? cur2 : cur2.concat([B.bulkName])) : cur2.filter(function(g){ return g.toLowerCase() !== B.bulkName.toLowerCase(); });
      from = cur2.join(', '); to = nxt2.join(', '); var p2 = {}; p2[B.bulkCat] = to; patch = p2;
    }
    if(patch && from !== to) out.push({ di:di, name:dispName(e), key:pkey(e), field:field, from:from, to:to, patch:patch });
  });
  return out;
}
function sbDgRename(){
  var h = '<div class="sb-card2"><div class="sb-card2-t">Rename</div>' + sbPersonPicker('rnOne', 'Person', (SB.pick.rnOne || {}).name || '');
  var di = SB.dg.rnDi;
  if(di == null) return h + '<p class="sb-note">Renaming rewrites first/last/display name, then propagates: close-associate name references and family links that use the display name are re-pointed, and the photos file (keyed by name) gets a queued rename op. Group memberships and the profile key do not change.</p></div>';
  var e = D.directory[di];
  if(SB.dg.rnFirst == null){ SB.dg.rnFirst = gv(e, 'first_name') || ''; SB.dg.rnLast = gv(e, 'last_name') || ''; }
  h += '<div class="sb-formrow"><input type="text" data-sbi="rnfirst" value="' + esc(SB.dg.rnFirst) + '" placeholder="First name"><input type="text" data-sbi="rnlast" value="' + esc(SB.dg.rnLast) + '" placeholder="Last name">' +
    '<button type="button" class="btn ghost" data-sb="rnscan">Scan propagation</button></div>';
  if(SB.dg.rnScan) h += '<div class="sb-dry">' + SB.dg.rnScan + '<div class="sb-confrow"><button type="button" class="btn primary" data-sb="rnexec">Review rename…</button></div></div>';
  return h + '</div>';
}
function sbRenameScan(di){
  var e = D.directory[di], oldName = dispName(e), entryKey = String(e.name || '').toLowerCase();
  var famRefs = 0, closeRefs = 0;
  D.directory.forEach(function(x, xi){
    if(xi === di || !liveEntry(x)) return;
    famLinks(x).forEach(function(l){ var t = String(l[1] || '').toLowerCase(); if(t === entryKey || t === oldName.toLowerCase()) famRefs++; });
    ['close_add', 'close_hide'].forEach(function(cf){ splitTags(gv(x, cf), ', ').forEach(function(n){ if(n.toLowerCase() === oldName.toLowerCase()) closeRefs++; }); });
  });
  var ph = sbPhotoByName()[oldName.toLowerCase()];
  return { famRefs:famRefs, closeRefs:closeRefs, hasPhoto:!!ph, oldName:oldName };
}
function sbDgRekey(){
  var h = '<div class="sb-card2"><div class="sb-card2-t">Re-key</div>' + sbPersonPicker('rkOne', 'Person', (SB.pick.rkOne || {}).name || '');
  var di = SB.dg.rkDi;
  if(di == null) return h + '<p class="sb-note">Re-keying mints a new Profiles row under the new key with a copy of every field, re-points any merged_into references, then deletes the old row (it sweeps to Trash, which also retires the old key). The Snapchat sidecar follows via a queued op. Use it for malformed keys — the classic case is the sf:jdmeyers_ twin.</p></div>';
  var e = D.directory[di];
  h += '<p class="sb-note">Current key: <b class="sb-mono">' + esc(pkey(e)) + '</b> (entry name <span class="sb-mono">' + esc(e.name) + '</span>)</p>' +
    '<div class="sb-formrow"><input type="text" data-sbi="rknew" placeholder="new-key (e.g. sf:jane-doe)" value="' + esc(SB.dg.rkNew || '') + '" style="min-width:260px">' +
    '<button type="button" class="btn danger2" data-sb="rkexec">Review re-key…</button></div>' +
    '<p class="sb-note">Prefixes: ig: needs a graph node or family links to stay visible; sf:/fdb: rows always mint an entry; ct: needs a phone contact. The new row is created immediately; the old row\u2019s delete rides the outbox.</p>';
  return h + '</div>';
}
function sbDgCreate(){
  return '<div class="sb-card2"><div class="sb-card2-t">New profile</div>' +
    '<p class="sb-note">Creates a Profiles row through the same batch endpoint the app writes with. An sf: key always mints a directory entry at the next bake (~10 minutes).</p>' +
    '<div class="sb-formrow"><input type="text" data-sbi="crfirst" placeholder="First name" value="' + esc(SB.dg.crFirst || '') + '">' +
    '<input type="text" data-sbi="crlast" placeholder="Last name" value="' + esc(SB.dg.crLast || '') + '">' +
    '<input type="text" data-sbi="crkey" placeholder="Key (blank = sf: slug)" value="' + esc(SB.dg.crKey || '') + '" style="min-width:220px">' +
    '<select data-sbi="crtier">' + ['open', 'associate', 'vetted'].map(function(t){ return '<option value="' + t + '"' + (SB.dg.crTier === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>' +
    '<button type="button" class="btn primary" data-sb="createexec">Create profile</button></div></div>';
}
function sbDgRebuild(){
  return '<div class="sb-card2"><div class="sb-card2-t">Rebuild & repush</div>' +
    '<p class="sb-note">The browser cannot run the sync — but the 10-minute subject sync rebuilds and republishes everything on its own, so most Sandbox writes are live within ~10 minutes without any rebuild. When you want it now, queue a rebuild op and run the ops file, or run the sync directly:</p>' +
    '<p class="sb-mono sb-code">python3 scripts/sync_subjects.py</p>' +
    '<div class="sb-confrow"><button type="button" class="btn ghost" data-sb="rebuildq">Queue rebuild op</button>' +
    '<button type="button" class="btn ghost" data-sb="reconq">Queue fresh reconciliation</button></div>' +
    '<p class="sb-note">Queued ops: ' + sbOpsGet().length + ' waiting — export them from the Action log.</p></div>';
}


/* ---------------- 10. action log ---------------- */
function sbLogView(){
  var local = sbLogGet();
  var server = ((SB.serverLog && SB.serverLog.entries) || []).map(function(e){
    return { ts:e.ts, type:e.type || 'ops', title:(e.op ? e.op + ' — ' : '') + (e.detail || ''), detail:e.detail || '', server:true, ok:e.ok };
  });
  var all = local.concat(server).sort(function(a, b){ return String(b.ts).localeCompare(String(a.ts)); });
  var f = SB.lg.filter;
  if(f !== 'all') all = all.filter(function(e){ return e.type === f; });
  var h = sbHead('Action log', 'Every Sandbox write, with before → after detail. This browser\u2019s entries persist in local storage; ops outcomes land in site/data/sandbox-log.json and appear here after a push. Export the queued ops to run them.');
  h += '<div class="sb-toolbar"><select data-sbi="logfilter">' + ['all', 'merge', 'delete', 'restore', 'bulk', 'rename', 'rekey', 'create', 'ops', 'rebuild', 'recon'].map(function(t){ return '<option value="' + t + '"' + (f === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>' +
    '<button type="button" class="btn ghost sm" data-sb="opexport">Export ops file (' + sbOpsGet().length + ' queued)</button>' +
    '<button type="button" class="btn ghost sm" data-sb="logexport">Download full log</button>' +
    (sbOpsGet().length ? '<button type="button" class="btn ghost sm" data-sb="opclear">Clear exported queue</button>' : '') + '</div>';
  if(!all.length) h += '<div class="empty"><h3>Nothing logged yet</h3><p>Writes from the Merge studio and the Danger area land here.</p></div>';
  all.slice(0, 120).forEach(function(e){
    h += '<div class="sb-logrow"><div class="sb-logmain"><span class="sb-logtype ' + esc(e.type || '') + '">' + esc(e.type || '') + '</span>' +
      '<span class="sb-logtitle">' + esc(e.title || e.detail || '') + '</span>' +
      '<span class="sb-logts">' + esc(String(e.ts || '').replace('T', ' ').slice(0, 16)) + (e.server ? ' · server' : '') + '</span></div>' +
      (e.detail && e.detail !== e.title ? '<div class="sb-logdet">' + esc(e.detail) + '</div>' : '') +
      ((e.queuedOps && e.queuedOps.length) ? '<div class="sb-logdet">Queued: ' + e.queuedOps.map(function(o){ return esc(o.op); }).join(', ') + '</div>' : '') +
      '<div class="sb-logbtns">' +
      (e.undo && !e.server ? '<button type="button" class="btn ghost sm" data-sb="logundo" data-id="' + esc(e.id) + '">Undo</button>' : '') +
      '<details class="sb-det"><summary>Detail</summary><pre class="sb-pre">' + esc(JSON.stringify(e, null, 1)).slice(0, 4000) + '</pre></details></div></div>';
  });
  return h;
}
function sbLogUndo(id){
  var en = sbLogGet().filter(function(e){ return e.id === id; })[0];
  if(!en || !en.undo){ toast('Nothing to undo on that entry'); return; }
  var u = en.undo;
  if(u.kind === 'unmerge'){
    var di = PK2I[String(u.loserKey || '').toLowerCase()];
    if(di == null){ toast('The loser profile is not in the current bake — restore it from the archive instead'); return; }
    txn('Undo merge', function(){ queuePatch(di, { merged_into:'' }); });
    sbLogAdd({ type:'restore', title:'Undid merge — ' + u.loserKey + ' stands alone again', detail:'Field adjustments made before the fold are NOT auto-restored; the full pre-merge record is in the merge entry\u2019s archive.' });
    toast('Unmerge sent');
  } else if(u.kind === 'undelete'){
    var n = 0;
    txn('Undo delete', function(){ (u.keys || []).forEach(function(k){ var d2 = PK2I[k.toLowerCase()]; if(d2 != null){ queuePatch(d2, { deleted:'' }); n++; } }); });
    sbLogAdd({ type:'restore', title:'Undid delete for ' + n + ' profile(s)', detail:(u.keys || []).join(', ') });
    toast(n ? 'Delete undone for ' + n : 'Those rows already left Profiles — restore from the archive instead');
  } else if(u.kind === 'bulk'){
    var n2 = 0;
    txn('Undo bulk edit', function(){ (u.items || []).forEach(function(it){ var d3 = PK2I[it.key.toLowerCase()]; if(d3 != null){ var p = {}; p[it.field] = it.before; queuePatch(d3, p); n2++; } }); });
    sbLogAdd({ type:'bulk', title:'Undid a bulk edit (' + n2 + ' people)', detail:'' });
    toast('Bulk edit undone for ' + n2);
  } else if(u.kind === 'rename'){
    var d4 = PK2I[String(u.key || '').toLowerCase()];
    if(d4 == null){ toast('Profile not in the current bake'); return; }
    txn('Undo rename', function(){
      queuePatch(d4, { first_name:u.before.first_name, last_name:u.before.last_name, display_name:u.before.display_name });
      (u.referrers || []).forEach(function(r){ var d5 = PK2I[r.key.toLowerCase()]; if(d5 != null) queuePatch(d5, r.patch); });
    });
    sbLogAdd({ type:'rename', title:'Undid rename of ' + u.key, detail:'Back to ' + u.before.display_name });
    toast('Rename undone');
  }
  render();
}

/* ---------------- 11. Council Command Center (V3.11.0) ----------------
   JD 2026-10-27: the Council is a TOP-LEVEL section, not a Sandbox
   tool, and it is ACTIVE, not a report. Open flags are the hero: every
   flag carries Luna's theory (graded Tentative / Probable / Strong,
   inductive-profiler discipline), the evidence behind it, and action
   buttons. Clicking an action STAGES it; "Do now" executes it
   immediately. Information and actions are visually separate zones of
   every card.
   STAGING IS DURABLE: the staged queue is a JSON array in the Profiles
   column "Council Staged" (BH) on JD's own row (ig:jdmeyers_), written
   through the same Apps Script batch endpoint as every other edit (the
   deployed endpoint resolves patch fields against the Profiles header
   row by name — the Location-on-file precedent; no endpoint change).
   Luna's council passes (weekly cycle cron + on-demand) read that one
   cell via the Sheets API; the bake carries it (council_staged in
   PROFILE_FIELDS, sync range widened to BH) so the board renders the
   live queue after any reload. council.json stays the directors'
   snapshot (theories / evidence / findings); the queue cell is the
   live workflow state layered over it. LocalStorage alone was
   rejected: server-side passes cannot see it. */
var CN_ORDER = ['photos', 'ux', 'content', 'resource', 'progress', 'ops'];
var CN_DEPT_NAMES = { photos:'Photos', ux:'UX', content:'Content', resource:'Resource', progress:'Progress', ops:'Operations' };
var CN = null, CN_PROF = null;
var CN_LOADING = false, CN_PROF_LOADING = false;
/* V3.12.0 lag fix — the worst offender in the intuitive-pass hunt.
   The old cnProfLoad fired its callback SYNCHRONOUSLY once
   profiles.json was cached, and the callback is render(): every
   council repaint (each Stage click, each nav back) recursed
   render -> viewCouncil -> cnLoad -> cnProfLoad -> render until
   the call stack gave out — 2,636 DOM rebuilds and ~8s of main
   thread for one tap, measured. Callbacks now queue and fire once,
   from the async completion only, matching phLoad/dtLoad/chLoad. */
var CN_PROF_CBS = [];
function cnProfLoad(cb){
  if(CN_PROF) return;
  if(cb) CN_PROF_CBS.push(cb);
  if(CN_PROF_LOADING) return;
  CN_PROF_LOADING = true;
  fetch('data/profiles.json', { cache:'no-cache' })
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(rows){ CN_PROF_LOADING = false; CN_PROF = rows; cnProfFlush(); })
    .catch(function(){ CN_PROF_LOADING = false; cnProfFlush(); });
}
function cnProfFlush(){
  var cbs = CN_PROF_CBS.splice(0);
  cbs.forEach(function(f){ if(f) f(); });
}
function cnLoad(){
  cnProfLoad(function(){ if(S.route && S.route.name === 'council') render(); });
  if(CN || CN_LOADING) return;
  CN_LOADING = true;
  if(typeof SB !== 'undefined' && SB.council) CN = SB.council;
  fetch('data/council.json', { cache:'no-cache' })
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(d){ CN_LOADING = false; if(d) CN = d; if(S.route && S.route.name === 'council') render(); })
    .catch(function(){ CN_LOADING = false; });
}
function cnDi(key){
  if(!D || !D.directory) return -1;
  for(var i = 0; i < D.directory.length; i++) if(pkey(D.directory[i]) === key) return i;
  return -1;
}
/* The staged queue lives on JD's Sheet row ig:jdmeyers_ — addressed BY
   KEY, never through the directory: JD has two directory entries
   (ig:jdmeyers_ at Sheet row 314 and an sf:jdmeyers_ shell at row 673)
   and pkey() resolves BOTH to 'sf:jdmeyers_', so a directory patch
   would land on the wrong row and the read would never find it. Reads
   come from the baked profiles.json (the same row Luna's passes read
   in the Sheet); writes go through the batch endpoint by id. CN_Q is
   the in-tab copy, set on every save so the board reflects staging
   immediately. */
var CN_Q = null;
function cnQueue(){
  if(CN_Q) return CN_Q;
  if(CN_PROF && CN_PROF.length){
    var ci = CN_PROF[0].indexOf('Council Staged');
    if(ci >= 0) for(var i = 1; i < CN_PROF.length; i++){
      if(CN_PROF[i][0] === 'ig:jdmeyers_'){
        try{ var q = JSON.parse(CN_PROF[i][ci] || '[]'); CN_Q = Array.isArray(q) ? q : []; }
        catch(x){ CN_Q = []; }
        return CN_Q;
      }
    }
  }
  return [];
}
/* Optimistic staging (V3.12.0, JD: "when I hit one of the action
   buttons, it's immediate"): the tap paints FIRST — CN_Q is the
   board's truth and cnRepaint is synchronous — and the Sheet write
   runs behind it. If the write fails, the pre-tap queue is restored
   and repainted (a visible rollback) with a failure toast: the
   board never sits showing a state the Sheet refused. The payload
   is unchanged: the same single batch item, addressed by key to
   ig:jdmeyers_. A rollback is skipped when a newer save has already
   superseded this one (queues are cumulative snapshots). */
var CN_SAVE_SEQ = 0;
function cnSaveQueue(q, prevQ, failMsg){
  CN_Q = q;
  var seq = ++CN_SAVE_SEQ;
  return sbPostBatch([{ id:'ig:jdmeyers_', patch:{ council_staged: JSON.stringify(q) } }])
    .then(function(ok){
      if(ok) return true;
      if(seq === CN_SAVE_SEQ && prevQ){ CN_Q = prevQ; cnRepaint(); }
      toast(failMsg || 'Staging write did not land — the board was rolled back to what the Sheet holds');
      return false;
    });
}
function cnRepaint(){
  var v = $('#view'); if(!v || !S.route || S.route.name !== 'council') return;
  var y = window.scrollY; viewCouncil(v); window.scrollTo(0, y);
}
function cnFlag(id){
  return ((CN && CN.flags) || []).filter(function(f){ return f.id === id; })[0] || null;
}
function cnAction(flagId, actionId){
  var f = cnFlag(flagId); if(!f) return null;
  return (f.actions || []).filter(function(a){ return a.id === actionId; })[0] || null;
}
function cnFlagState(f, q){
  var done = q.some(function(e){ return e.flag === f.id && e.state === 'done' && (e.kind === 'fix' || e.kind === 'decision' || e.kind === 'merge'); });
  if(f.state === 'closed' || done) return 'closed';
  return q.some(function(e){ return e.flag === f.id && e.state === 'staged'; }) ? 'staged' : 'open';
}
function cnToday(iso){
  return iso && new Date(iso).toDateString() === new Date().toDateString();
}
/* ---- staging ---- */
function cnStage(flagId, actionId){
  var act = cnAction(flagId, actionId); if(!act) return;
  var prev = cnQueue().slice();
  if(prev.some(function(e){ return e.flag === flagId && e.action === actionId && e.state === 'staged'; })) return;
  var q = prev.concat([{ flag:flagId, action:actionId, label:act.label, kind:act.kind,
    patches:act.patches || undefined, merge:act.merge || undefined,
    state:'staged', ts:new Date().toISOString(), by:'board' }]);
  cnSaveQueue(q, prev);
  toast('Staged — Luna picks this up on the next council pass');
  cnRepaint();
}
function cnUnstage(flagId, actionId){
  var prev = cnQueue().slice();
  var q = prev.filter(function(e){ return !(e.flag === flagId && e.action === actionId && e.state === 'staged'); });
  cnSaveQueue(q, prev); toast('Removed from the staged queue'); cnRepaint();
}
function cnClearStaged(){
  var prev = cnQueue().slice();
  var q = prev.filter(function(e){ return e.state !== 'staged'; });
  cnSaveQueue(q, prev); toast('Staged queue cleared'); cnRepaint();
}
/* ---- execution ---- */
function cnFieldVal(key, field){
  var di = cnDi(key);
  if(di >= 0) return gv(D.directory[di], field);
  if(CN_PROF && CN_PROF.length){
    var norm = function(s){ return String(s || '').toLowerCase().replace(/_/g, ' '); }, ci = -1;
    for(var j = 0; j < CN_PROF[0].length; j++) if(norm(CN_PROF[0][j]) === norm(field)) ci = j;
    if(ci < 0) return null;
    for(var i = 1; i < CN_PROF.length; i++) if(CN_PROF[i][0] === key) return CN_PROF[i][ci] || '';
  }
  return null;
}
/* Value equality for council patch matching: tolerant of case, spacing,
   and phone formatting. A patch spec written as bare digits ("5183178734")
   must match the stored formatted value ("518-317-8734") — the Oct 28
   execute-all failure: remove/replace specs silently matched nothing and
   the nv===cur shortcut below reported them as applied. */
function cnValEq(a, b){
  var x = String(a == null ? '' : a).trim().replace(/\s+/g, ' ').toLowerCase();
  var y = String(b == null ? '' : b).trim().replace(/\s+/g, ' ').toLowerCase();
  if(x === y) return true;
  var dx = x.replace(/\D/g, ''), dy = y.replace(/\D/g, '');
  if(dx.length >= 7 && dy.length >= 7){
    if(dx.length === 11 && dx.charAt(0) === '1') dx = dx.slice(1);
    if(dy.length === 11 && dy.charAt(0) === '1') dy = dy.slice(1);
    return dx === dy;
  }
  return false;
}
function cnApplyPatch(p){
  var cur = cnFieldVal(p.key, p.field); if(cur == null) return false;
  var nv = cur;
  if(p.op === 'set') nv = p.value;
  else{
    var a = tagList(cur);
    if(p.op === 'add'){ if(!a.some(function(x){ return cnValEq(x, p.value); })) a.push(p.value); }
    else if(p.op === 'remove'){ a = a.filter(function(x){ return !cnValEq(x, p.value); }); }
    else if(p.op === 'replace'){ a = a.map(function(x){ return cnValEq(x, p.from) ? p.to : x; }); }
    else return false;
    nv = a.join(', ');
  }
  if(nv === cur) return true;   /* already in the desired state — counts as applied */
  var patch = {}; patch[p.field] = nv;
  var di = cnDi(p.key);
  if(di >= 0){ queuePatch(di, patch); return true; }
  /* Folded rows (merged_into) have no directory index — write by key
     through the batch endpoint and AWAIT its ack: a rejected write
     must surface as a failure, never as a done entry. (sbPostBatch
     resolves true/false rather than rejecting.) */
  return sbPostBatch([{ id:p.key, patch:patch }]).then(function(ok){ return !!ok; });
}
function cnExecEntries(entries, cb){
  var needProf = entries.some(function(e){
    return (e.patches || []).some(function(p){ return cnDi(p.key) < 0; });
  });
  var run = function(){
    var failed = [], jobs = [];
    entries.forEach(function(e){
      (e.patches || []).forEach(function(p){
        var r = cnApplyPatch(p);
        if(r && typeof r.then === 'function') jobs.push(r.then(function(ok){ if(!ok) failed.push(e.flag + ':' + p.key); }));
        else if(!r) failed.push(e.flag + ':' + p.key);
      });
    });
    Promise.all(jobs).then(function(){ cb && cb({ ok:!failed.length, failed:failed }); });
  };
  if(needProf && !CN_PROF) cnProfLoad(run);
  else run();
}
function cnMarkDone(q, entry, outcome){
  for(var i = 0; i < q.length; i++)
    if(q[i].flag === entry.flag && q[i].action === entry.action && q[i].state === 'staged'){ q.splice(i, 1); break; }
  q.push({ flag:entry.flag, action:entry.action, label:entry.label, kind:entry.kind,
    state:'done', ts:new Date().toISOString(), by:'board', outcome:outcome });
  return q;
}
function cnDoNow(flagId, actionId){
  var act = cnAction(flagId, actionId); if(!act) return;
  if(act.kind === 'merge'){ cnStage(flagId, actionId); cnOpenMerge(act); return; }
  if(act.kind === 'task'){ cnStage(flagId, actionId); return; }
  var entry = { flag:flagId, action:actionId, label:act.label, kind:act.kind, patches:act.patches || [] };
  /* optimistic: the flag flips to decided on tap; the execution
     itself still runs through cnExecEntries with its acks awaited
     exactly as before — a failure rolls the board back and the flag
     reopens, it is never left fake-done */
  var prev = cnQueue().slice();
  CN_Q = cnMarkDone(prev.slice(), entry, 'Executed from the board');
  cnRepaint();
  cnExecEntries([entry], function(res){
    if(!res.ok){
      CN_Q = cnQueue().filter(function(e){ return !(e.flag === flagId && e.action === actionId && e.state === 'done'); });
      cnRepaint();
      toast('Execution hit a problem on ' + res.failed.join(', ') + ' — rolled back, the flag is open again');
      return;
    }
    cnSaveQueue(cnQueue(), prev, 'Executed, but recording it in the queue failed — Luna will reconcile from the Sheet');
    toast('Executed — Luna verifies it against the Sheet on the next pass');
    cnRepaint();
  });
}
function cnExecAll(){
  var q = cnQueue();
  var exec = q.filter(function(e){ return e.state === 'staged' && (e.kind === 'fix' || e.kind === 'decision'); });
  if(!exec.length){ toast('Nothing executable is staged — tasks and merges stay queued for Luna / the Merge studio'); return; }
  var prev = q.slice(), oq = prev.slice();
  exec.forEach(function(e){ oq = cnMarkDone(oq, e, 'Executed from the board (execute all)'); });
  CN_Q = oq; cnRepaint();
  cnExecEntries(exec, function(res){
    if(!res.ok){
      /* roll the failed entries back to staged so the work is not
         lost and the board never shows them done */
      var badFlags = {};
      res.failed.forEach(function(f){ badFlags[String(f).split(':')[0]] = 1; });
      var rq = cnQueue().filter(function(e){
        return !(e.state === 'done' && badFlags[e.flag] && exec.some(function(x){ return x.flag === e.flag && x.action === e.action; }));
      });
      exec.forEach(function(e){
        if(badFlags[e.flag]) rq.push({ flag:e.flag, action:e.action, label:e.label, kind:e.kind, patches:e.patches || undefined, merge:e.merge || undefined, state:'staged', ts:e.ts || new Date().toISOString(), by:'board' });
      });
      cnSaveQueue(rq, prev);
      cnRepaint();
      toast('Executed with problems on ' + res.failed.join(', ') + ' — those are back in the staged queue');
      return;
    }
    cnSaveQueue(cnQueue(), prev);
    toast('Executed ' + exec.length + ' staged action' + (exec.length === 1 ? '' : 's'));
    cnRepaint();
  });
}
function cnOpenMerge(act){
  var m = act.merge || {};
  var sDi = cnDi(m.survivor), lDi = cnDi(m.loser);
  if(sDi < 0 || lDi < 0){ toast('Merge pair not found in the directory'); return; }
  SB.tool = 'merge';
  SB.mg = { a:sDi, b:lDi, surv:'a', aName:dispName(D.directory[sDi]), bName:dispName(D.directory[lDi]), picks:{} };
  location.hash = '#/sandbox/merge';
}
/* ---- rendering ---- */
function cnKindLabel(k){
  return String(k || '').replace(/-/g, ' ').replace(/^./, function(c){ return c.toUpperCase(); });
}
function cnFlagCard(f, q){
  var st = cnFlagState(f, q);
  var stagedIds = {};
  q.forEach(function(e){ if(e.flag === f.id && e.state === 'staged') stagedIds[e.action] = 1; });
  var h = '<article class="cnc-flag" id="cnf-' + esc(f.id) + '">';
  h += '<div class="cnc-finfo">' +
    '<div class="cnc-fhead"><span class="cnc-pri p' + (f.priority || 3) + '">P' + (f.priority || 3) + '</span>' +
    '<h3>' + esc(f.title || '') + '</h3></div>' +
    '<div class="cnc-fmeta"><span class="cnc-kind">' + esc(cnKindLabel(f.kind)) + '</span>' +
    '<span class="cnc-fdir">' + esc(CN_DEPT_NAMES[f.director] || f.director || '') + ' Director</span>' +
    '<span class="cnc-fdate">' + esc(f.date || '') + '</span></div>';
  if(f.ruling) h += '<div class="cnc-ruling"><b>JD’s ruling</b>' + esc(f.ruling) + '</div>';
  if(f.theory){
    h += '<div class="cnc-theory"><div class="cnc-thead"><span class="pf-grade g-' +
      esc(String(f.theory.grade || '').toLowerCase()) + '">' + esc(f.theory.grade || '') + ' theory</span>' +
      '<span class="cnc-tlab">Luna’s read</span></div>' +
      '<p>' + esc(f.theory.text || '') + '</p>' +
      (f.theory.falsifier ? '<p class="cnc-fals"><b>Would change the read:</b> ' + esc(f.theory.falsifier) + '</p>' : '') + '</div>';
  }
  if(f.evidence && f.evidence.length){
    h += '<div class="cnc-ev"><div class="cnc-evlab">Evidence</div><ol>' +
      f.evidence.map(function(e){ return '<li>' + esc(e) + '</li>'; }).join('') + '</ol></div>';
  }
  h += '</div><div class="cnc-facts"><div class="cnc-alab">Actions — click stages it for Luna’s next pass</div>';
  (f.actions || []).forEach(function(a){
    h += '<div class="cnc-actrow' + (stagedIds[a.id] ? ' is-staged' : '') + '">' +
      '<div class="cnc-actlab"><b>' + esc(a.label || '') + '</b>' +
      (a.note ? '<span>' + esc(a.note) + '</span>' : '') + '</div><div class="cnc-actbtns">';
    if(stagedIds[a.id]){
      h += '<span class="cnc-stagedchip">' + ic('check', 12) + ' Staged</span>';
      if(a.kind === 'fix' || a.kind === 'decision' || a.kind === 'merge')
        h += '<button type="button" class="btn primary sm" data-act="cn-now" data-flag="' + esc(f.id) + '" data-action="' + esc(a.id) + '">Do now</button>';
      h += '<button type="button" class="btn ghost sm" data-act="cn-unstage" data-flag="' + esc(f.id) + '" data-action="' + esc(a.id) + '">Unstage</button>';
    } else {
      h += '<button type="button" class="btn sm cnc-stagebtn" data-act="cn-stage" data-flag="' + esc(f.id) + '" data-action="' + esc(a.id) + '">Stage</button>';
      if(a.kind === 'merge')
        h += '<button type="button" class="btn primary sm" data-act="cn-now" data-flag="' + esc(f.id) + '" data-action="' + esc(a.id) + '">Open in Merge studio</button>';
      else if(a.kind !== 'task')
        h += '<button type="button" class="btn primary sm" data-act="cn-now" data-flag="' + esc(f.id) + '" data-action="' + esc(a.id) + '">Do now</button>';
    }
    h += '</div></div>';
  });
  h += '</div></article>';
  return h;
}
function cnDeptGraphic(key, cn, q){
  if(key === 'photos'){
    var txt = ((cn.findings || {}).photos || []).map(function(e){ return (e.title || '') + ' ' + (e.summary || ''); }).join(' ');
    var m = txt.match(/(\d+)\s+of\s+(\d+)/);
    if(m){
      var pct = Math.round(100 * (+m[1]) / (+m[2])), c = 2 * Math.PI * 26;
      return '<svg class="cnc-ring" viewBox="0 0 64 64" role="img" aria-label="Photo coverage ' + pct + '%">' +
        '<circle cx="32" cy="32" r="26" class="cnc-ring-bg"></circle>' +
        '<circle cx="32" cy="32" r="26" class="cnc-ring-fg" stroke-dasharray="' + (c * pct / 100).toFixed(1) + ' ' + c.toFixed(1) + '"></circle>' +
        '<text x="32" y="37" class="cnc-ring-t">' + pct + '%</text></svg>' +
        '<div class="cnc-gcap">' + esc(m[1]) + ' of ' + esc(m[2]) + ' people<br>name-matched photos</div>';
    }
  }
  if(key === 'resource'){
    var b = cn.budget || {};
    return '<div class="cn-bar cnc-pace"><div class="cn-bar-pace" style="left:' + (b.expected_pct || 0) + '%"></div>' +
      '<div class="cn-bar-fill" style="width:' + Math.min(100, b.used_pct || 0) + '%"></div></div>' +
      '<div class="cnc-gcap"><b>' + (b.used_pct != null ? b.used_pct + '%' : '—') + '</b> used · even pace ~' +
      (b.expected_pct != null ? b.expected_pct : '—') + '%<br>' + esc(b.verdict || '') + '</div>';
  }
  if(key === 'progress'){
    var open = 0, staged = 0, done = 0;
    (cn.flags || []).forEach(function(f){
      var s = cnFlagState(f, q);
      if(s === 'closed') done++; else if(s === 'staged') staged++; else open++;
    });
    var tot = Math.max(1, open + staged + done);
    return '<div class="cnc-funnel">' +
      [['Needs JD', open, 'amb'], ['Staged', staged, 'blu'], ['Decided / done', done, 'grn']].map(function(r){
        return '<div class="cnc-frow2"><span>' + r[0] + '</span><div class="cnc-ftrack"><div class="cnc-ffill ' + r[2] + '" style="width:' + Math.round(100 * r[1] / tot) + '%"></div></div><b>' + r[1] + '</b></div>';
      }).join('') + '</div><div class="cnc-gcap">Flag funnel — live from this board</div>';
  }
  if(key === 'content'){
    var counts = {};
    (cn.flags || []).forEach(function(f){ if(cnFlagState(f, q) === 'open') counts[f.kind] = (counts[f.kind] || 0) + 1; });
    var ks = Object.keys(counts);
    return '<div class="cnc-kindchips">' + (ks.length ? ks.map(function(k){
      return '<span class="cnc-kchip"><b>' + counts[k] + '</b> ' + esc(cnKindLabel(k)) + '</span>';
    }).join('') : '<span class="cnc-kchip"><b>0</b> open</span>') + '</div>' +
    '<div class="cnc-gcap">Open flags by kind</div>';
  }
  if(key === 'ops'){
    return '<div class="cnc-kindchips">' + (cn.roster || []).map(function(r){
      return '<span class="cnc-kchip"><span class="cnc-dot ' + (/watch|attention/i.test(r.status || '') ? 'amb' : 'grn') + '"></span>' + esc(CN_DEPT_NAMES[r.key] || r.name || '') + '</span>';
    }).join('') + '</div><div class="cnc-gcap">Directorate status at a glance</div>';
  }
  /* ux + fallback: latest finding date as the stat */
  var es = ((cn.findings || {})[key] || []);
  return '<div class="cnc-bignum">' + es.length + '</div><div class="cnc-gcap">findings on file' +
    (es[0] && es[0].date ? '<br>latest ' + esc(es[0].date) : '') + '</div>';
}
/* Field reports (V3.12.0): each department section opens with its
   director's own field report — current strategy, what's working,
   the barriers, and what they're stuck on — so JD can think through
   the problem, not just the findings. The text lives in council.json
   (field_reports, one block per department, refreshed by council
   runs from the working logs); nothing is hardcoded here. */
function cnFieldReport(key, cn){
  var fr = ((cn.field_reports || {})[key]) || null;
  if(!fr) return '';
  function row(lab, txt, cls){
    return txt ? '<div class="cnc-fr-row ' + cls + '"><span class="cnc-fr-lab">' + lab + '</span><p>' + esc(txt) + '</p></div>' : '';
  }
  return '<div class="cnc-fr"><div class="cnc-fr-h">Field report — ' + esc(CN_DEPT_NAMES[key] || key) + ' Director</div>' +
    row('Strategy', fr.strategy, 's') + row('Working', fr.working, 'w') +
    row('Barriers', fr.barriers, 'b') + row('Stuck on', fr.stuck, 'k') + '</div>';
}
/* ============================================================
   Master List (JD 2026-10-28, V3.16.0)
   One registry over churches / companies / universities / groups /
   skills. Structure (types, parents, added entities) comes from the
   Sheet Settings key 'taxonomy', baked to data/taxonomy.json and
   merged with the on-device overlay ncc_taxonomy_v1 (the same
   pattern as the org registry overlay). Two edge kinds: 'part'
   (membership counts up into the parent) and 'runby' (a link only,
   no count-up: CFA is run by CFC, its people are not CFC people).
   Membership edits, renames and merges write to the Sheet through
   queuePatch like every other edit in the app.
   ============================================================ */
var TAX = { cache: null, cacheVer: -1 };
var MLV = { q: '', open: null, more: {}, shown: [] };
var TAX_KINDS = ['churches', 'companies', 'universities', 'groups', 'specialty'];
var TAX_PRIMARY = { church: 'churches', university: 'universities', business: 'companies', military: 'companies', program: 'companies', list: 'groups', skill: 'specialty', other: 'companies' };
var TAX_TYPES = [['church', 'Church'], ['university', 'University'], ['business', 'Business / employer'], ['military', 'Military'], ['program', 'Program'], ['list', 'My list'], ['skill', 'Skill'], ['other', 'Other organization']];

function taxOverlay(){ try{ return JSON.parse(store('ncc_taxonomy_v1') || 'null') || {}; }catch(x){ return {}; } }
function taxSaveOverlay(o){ store('ncc_taxonomy_v1', JSON.stringify(o)); TAX.cache = null; }
function taxStruct(){
  var base = (typeof SB !== 'undefined' && SB && SB.tax) || {};
  var ov = taxOverlay();
  var ren = ov.renames || {};
  function rk(n){ return ren[n] || n; }
  var types = {}, parents = {}, cats = {}, added = [], noparent = {};
  Object.keys(base.types || {}).forEach(function(n){ types[rk(n)] = base.types[n]; });
  Object.keys(ov.types || {}).forEach(function(n){ types[n] = ov.types[n]; });
  Object.keys(base.cats || {}).forEach(function(n){ cats[rk(n)] = base.cats[n]; });
  Object.keys(base.parents || {}).forEach(function(n){ parents[rk(n)] = { p: rk(base.parents[n].p), edge: base.parents[n].edge || 'part' }; });
  Object.keys(ov.parents || {}).forEach(function(n){
    if(ov.parents[n]) parents[n] = ov.parents[n]; else { delete parents[n]; noparent[n] = true; }
  });
  (base.added || []).forEach(function(a){ added.push({ name: rk(a.name), kinds: (a.kinds || []).slice() }); });
  (ov.added || []).forEach(function(a){ if(!added.some(function(x){ return regKey(x.name) === regKey(a.name); })) added.push(a); });
  (ov.killed || []).forEach(function(n){ added = added.filter(function(a){ return regKey(a.name) !== regKey(n); }); });
  return { types: types, parents: parents, cats: cats, added: added, noparent: noparent };
}

function taxEntities(){
  if(TAX.cache && TAX.cacheVer === VER) return TAX.cache;
  var st = taxStruct();
  var ents = {};
  function ensure(name){
    var k = regKey(name); if(!k) return null;
    if(!ents[k]) ents[k] = { key: k, name: name, kinds: {}, mem: {}, cat: false, added: false, direct: [], total: 0, kids: [] };
    return ents[k];
  }
  D.directory.forEach(function(e, di){
    TAX_KINDS.forEach(function(kind){
      tagList(gv(e, kind)).forEach(function(val){
        var ent = ensure(regApply(val)); if(!ent) return;
        ent.kinds[kind] = true;
        (ent.mem[kind] = ent.mem[kind] || {})[di] = true;
      });
    });
  });
  st.added.forEach(function(a){ var ent = ensure(a.name); if(ent){ ent.added = true; (a.kinds || []).forEach(function(kd){ ent.kinds[kd] = true; }); } });
  Object.keys(st.cats).forEach(function(n){ var ent = ensure(n); if(ent){ ent.cat = true; ent.type = 'category'; } });
  Object.keys(ents).forEach(function(k){
    var ent = ents[k];
    if(!ent.cat){
      ent.type = st.types[ent.name] ||
        (ent.kinds.churches ? 'church' :
         ent.kinds.universities ? 'university' :
         (ent.kinds.specialty && !ent.kinds.companies && !ent.kinds.groups && !ent.kinds.churches && !ent.kinds.universities) ? 'skill' :
         (ent.kinds.groups && !ent.kinds.companies && !ent.kinds.churches && !ent.kinds.universities) ? 'list' : 'business');
      var par = st.parents[ent.name];
      if(st.noparent[ent.name]){ ent.parent = null; }
      else if(par && ents[regKey(par.p)]){ ent.parent = regKey(par.p); ent.edge = par.edge || 'part'; }
      else if(ent.type === 'church'){ ent.parent = regKey('Church'); ent.edge = 'part'; }
      else if(ent.type === 'university'){ ent.parent = regKey('University'); ent.edge = 'part'; }
    }
    var dm = {};
    TAX_KINDS.forEach(function(kind){ Object.keys(ent.mem[kind] || {}).forEach(function(di){ dm[di] = true; }); });
    ent.direct = Object.keys(dm).map(Number).sort(function(a, b){ return a - b; });
  });
  var kids = {};
  Object.keys(ents).forEach(function(k){ var e2 = ents[k]; if(e2.parent && ents[e2.parent]) (kids[e2.parent] = kids[e2.parent] || []).push(k); });
  function totalOf(k, seen){
    var ent = ents[k]; if(!ent) return {};
    var out = {};
    ent.direct.forEach(function(di){ out[di] = true; });
    (kids[k] || []).forEach(function(ck){
      if(seen[ck] || ents[ck].edge !== 'part') return;
      seen[ck] = true;
      var sub = totalOf(ck, seen);
      Object.keys(sub).forEach(function(di){ out[di] = true; });
    });
    return out;
  }
  Object.keys(ents).forEach(function(k){ ents[k].kids = kids[k] || []; ents[k].total = Object.keys(totalOf(k, {})).length; ents[k].totalSet = totalOf(k, {}); });
  TAX.cache = { ents: ents, st: st };
  TAX.cacheVer = VER;
  return TAX.cache;
}

function mlPrimaryKind(ent){
  var pk = TAX_PRIMARY[ent.type] || 'companies';
  if(ent.kinds[pk]) return pk;
  for(var i = 0; i < TAX_KINDS.length; i++) if(ent.kinds[TAX_KINDS[i]]) return TAX_KINDS[i];
  return pk;
}
function mlPatchObj(kind, val){ var p = {}; p[kind] = val; return p; }
function mlRender(){
  var sv = $('#view'), st = sv ? sv.scrollTop : 0;
  render();
  requestAnimationFrame(function(){ var s2 = $('#view'); if(s2) s2.scrollTop = st; });
}
/* apply fn to every cell value of ent's members, across all five fields.
   fn(value) returns the replacement, the same value, or null to drop it. */
function mlRewrite(ent, fn, label){
  txn(label || 'Master List edit', function(){
    ent.direct.forEach(function(di){
      var e = D.directory[di]; if(!e) return;
      TAX_KINDS.forEach(function(kind){
        var cur = gv(e, kind); if(!cur) return;
        var out = [], changed = false;
        tagList(cur).forEach(function(val){
          var nv = fn(val);
          if(nv === null){ changed = true; return; }
          if(nv !== val) changed = true;
          if(out.indexOf(nv) < 0) out.push(nv);
        });
        if(changed) queuePatch(di, mlPatchObj(kind, out.join(', ')));
      });
    });
  });
}
function mlIsEnt(val, ent){ return regKey(regApply(val)) === ent.key; }

function mlAddMember(ent, di){
  var e = D.directory[di]; if(!e) return;
  var already = TAX_KINDS.some(function(kind){ return tagList(gv(e, kind)).some(function(val){ return mlIsEnt(val, ent); }); });
  if(already) return;
  var kind = mlPrimaryKind(ent);
  var list = tagList(gv(e, kind)); list.push(ent.name);
  txn('Add to ' + ent.name, function(){ queuePatch(di, mlPatchObj(kind, list.join(', '))); });
  mlRender();
}
function mlRemoveMember(ent, di){
  var e = D.directory[di]; if(!e) return;
  txn('Remove from ' + ent.name, function(){
    TAX_KINDS.forEach(function(kind){
      var cur = gv(e, kind); if(!cur) return;
      var list = tagList(cur);
      var out = list.filter(function(val){ return !mlIsEnt(val, ent); });
      if(out.length !== list.length) queuePatch(di, mlPatchObj(kind, out.join(', ')));
    });
  });
  mlRender();
}
function mlRename(ent, newName){
  newName = String(newName || '').trim();
  if(!newName || regKey(newName) === ent.key) return;
  var T = taxEntities();
  if(T.ents[regKey(newName)]){ toast('That name already exists. Use Merge instead.'); return; }
  mlRewrite(ent, function(val){ return mlIsEnt(val, ent) ? newName : val; }, 'Rename ' + ent.name);
  var ov = taxOverlay();
  ov.renames = ov.renames || {};
  ov.renames[ent.name] = newName;
  ['types', 'parents'].forEach(function(sec){
    if(ov[sec]){
      var nxt = {};
      Object.keys(ov[sec]).forEach(function(n){
        var v = ov[sec][n];
        if(sec === 'parents' && v && v.p === ent.name) v = { p: newName, edge: v.edge };
        nxt[n === ent.name ? newName : n] = v;
      });
      ov[sec] = nxt;
    }
  });
  if(ov.added) ov.added.forEach(function(a){ if(regKey(a.name) === ent.key) a.name = newName; });
  taxSaveOverlay(ov);
  regRegisterCanon(newName, mlPrimaryKind(ent));
  MLV.open = regKey(newName);
  toast('Renamed to ' + newName + '. The new name is saving to the Sheet.');
  mlRender();
}
function mlMerge(loser, winner){
  if(!loser || !winner || loser.key === winner.key) return;
  mlRewrite(loser, function(val){ return mlIsEnt(val, loser) ? winner.name : val; }, 'Merge ' + loser.name + ' into ' + winner.name);
  regRegisterAlias(loser.name, winner.name);
  var ov = taxOverlay();
  ov.parents = ov.parents || {}; ov.types = ov.types || {};
  var T = taxEntities();
  loser.kids.forEach(function(ck){
    var ch = T.ents[ck];
    if(ch) ov.parents[ch.name] = { p: winner.name, edge: ch.edge || 'part' };
  });
  if(!ov.parents[winner.name] && taxStruct().parents[loser.name]) ov.parents[winner.name] = taxStruct().parents[loser.name];
  delete ov.parents[loser.name]; delete ov.types[loser.name];
  if(ov.added) ov.added = ov.added.filter(function(a){ return regKey(a.name) !== loser.key; });
  if(loser.added && !(ov.added || []).some(function(a){ return regKey(a.name) === loser.key; })){
    ov.killed = ov.killed || []; if(ov.killed.indexOf(loser.name) < 0) ov.killed.push(loser.name);
  }
  taxSaveOverlay(ov);
  MLV.open = winner.key;
  toast(loser.name + ' merged into ' + winner.name + '. Saving to the Sheet.');
  mlRender();
}
function mlSetParent(ent, parentName, edge){
  var ov = taxOverlay();
  ov.parents = ov.parents || {};
  if(!parentName) ov.parents[ent.name] = null;
  else ov.parents[ent.name] = { p: parentName, edge: edge || 'part' };
  taxSaveOverlay(ov);
  mlRender();
}
function mlSetType(ent, type){
  var ov = taxOverlay();
  ov.types = ov.types || {};
  ov.types[ent.name] = type;
  taxSaveOverlay(ov);
  mlRender();
}
function mlDelete(ent){
  var ov = taxOverlay();
  if(ov.added) ov.added = ov.added.filter(function(a){ return regKey(a.name) !== ent.key; });
  if(ent.added){ ov.killed = ov.killed || []; if(ov.killed.indexOf(ent.name) < 0) ov.killed.push(ent.name); }
  if(ov.types) delete ov.types[ent.name];
  if(ov.parents) delete ov.parents[ent.name];
  taxSaveOverlay(ov);
  if(GRP_EXTRA.indexOf(ent.name) >= 0){ GRP_EXTRA = GRP_EXTRA.filter(function(g){ return g !== ent.name; }); store('ncc_groups_extra', JSON.stringify(GRP_EXTRA)); }
  if(MLV.open === ent.key) MLV.open = null;
  toast(ent.name + ' removed from the Master List.');
  mlRender();
}
function mlNew(name, type){
  name = String(name || '').trim(); if(!name) return;
  var T = taxEntities();
  if(T.ents[regKey(name)]){ MLV.open = regKey(name); mlRender(); toast(name + ' is already on the list.'); return; }
  var kind = TAX_PRIMARY[type] || 'companies';
  var ov = taxOverlay();
  ov.added = ov.added || []; ov.types = ov.types || {};
  ov.added.push({ name: name, kinds: [kind] });
  ov.types[name] = type;
  taxSaveOverlay(ov);
  regRegisterCanon(name, kind);
  if(kind === 'groups' && GRP_EXTRA.indexOf(name) < 0){ GRP_EXTRA.push(name); store('ncc_groups_extra', JSON.stringify(GRP_EXTRA)); }
  MLV.open = regKey(name);
  toast(name + ' added. Now add people to it.');
  mlRender();
}
function mlSuspects(ents){
  var list = Object.keys(ents).map(function(k){ return ents[k]; }).filter(function(e){ return !e.cat; });
  var out = [], seen = {};
  function lev(a, b){
    if(Math.abs(a.length - b.length) > 2) return 99;
    var d = [], i, j;
    for(i = 0; i <= a.length; i++) d.push([i]);
    for(j = 0; j <= b.length; j++) d[0][j] = j;
    for(i = 1; i <= a.length; i++) for(j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  function normCU(n){ return regKey(n).replace(/college/g, 'university'); }
  for(var i = 0; i < list.length; i++) for(var j = i + 1; j < list.length; j++){
    var a = list[i], b = list[j], why = null;
    if(normCU(a.name) === normCU(b.name) && a.key !== b.key) why = 'same place, old and new name';
    else if(a.key.indexOf(b.key + ' ') === 0 || b.key.indexOf(a.key + ' ') === 0) why = 'one name is the start of the other';
    else if(a.type === 'skill' && b.type === 'skill' && ((/teach/i.test(a.name) && /teach/i.test(b.name)) || ((/teach/i.test(a.name) || a.name === 'Education') && (/teach/i.test(b.name) || b.name === 'Education')))) why = 'same skill, two wordings';
    else if(a.key.length >= 7 && b.key.length >= 7 && a.key.slice(0, 3) === b.key.slice(0, 3) && lev(a.key, b.key) <= 2) why = 'names are nearly the same';
    if(why){
      var id = [a.key, b.key].sort().join('|');
      if(!seen[id]){ seen[id] = true; out.push({ a: a, b: b, why: why }); }
    }
  }
  return out.slice(0, 12);
}

function mlRow(ent, depth){
  var open = MLV.open === ent.key;
  var typeLabel = ent.cat ? 'Category' : (TAX_TYPES.filter(function(t){ return t[0] === ent.type; })[0] || ['', ent.type])[1];
  var ct = ent.direct.length + ' people';
  if(ent.cat) ct = ent.total + ' people in total';
  else if(ent.total !== ent.direct.length) ct += ' · ' + ent.total + ' counting everything inside';
  if(!ent.direct.length && !ent.kids.length) ct = 'empty for now';
  var h = '<div class="ml-row' + (open ? ' open' : '') + '" style="margin-left:' + (depth * 22) + 'px">' +
    '<button type="button" class="ml-tog" data-act="mlx" data-key="' + esc(ent.key) + '">' + (open ? '▾' : '▸') + '</button>' +
    '<div class="ml-main"><div class="ml-nm">' + esc(ent.name) +
    '<span class="ml-chip">' + esc(typeLabel) + '</span>' +
    (ent.edge === 'runby' ? '<span class="ml-chip runby">run by ' + esc((taxEntities().ents[ent.parent] || {}).name || 'its parent') + '</span>' : '') +
    (ent.added ? '<span class="ml-chip">new</span>' : '') +
    '</div><div class="ml-ct">' + ct + '</div></div></div>';
  if(open) h += mlDetail(ent, depth);
  return h;
}
function mlDetail(ent, depth){
  var T = taxEntities();
  MLV.shown = ent.direct.slice();
  var mem = ent.direct.map(function(di){
    var e = D.directory[di];
    return '<div class="ml-mem"><a href="#/p/' + encodeURIComponent(personId(e)) + '" data-act="mlopen" data-di="' + di + '">' + esc(dispName(e)) + '</a>' +
      '<button type="button" class="ml-x" data-act="mlrm" data-key="' + esc(ent.key) + '" data-di="' + di + '" title="Remove from ' + esc(ent.name) + '">×</button></div>';
  }).join('');
  var h = '<div class="ml-det" style="margin-left:' + (depth * 22 + 14) + 'px" data-ent="' + esc(ent.key) + '">' +
    '<div class="ml-mems">' + (mem || '<div class="ml-none">Nobody is in this one yet. Add people below.</div>') + '</div>' +
    '<div class="ml-tools">' +
      '<div class="ml-tool"><label>Add people</label><div class="ml-inline"><input type="text" class="ml-add-in" placeholder="Type a name"><button type="button" class="btn sm" data-act="mlfind" data-key="' + esc(ent.key) + '">Find</button></div><div class="ml-res"></div></div>' +
    '</div></div>';
  return h;
}
function mlTree(ents, rootKeys, q){
  var out = [];
  function walk(k, depth, seen){
    if(seen[k] || depth > 6) return;
    seen[k] = true;
    var ent = ents[k]; if(!ent) return;
    if(!q || ent.name.toLowerCase().indexOf(q) >= 0) out.push(mlRow(ent, q ? 0 : depth));
    var kids = ent.kids.slice().sort(function(a, b){ return (ents[b].total - ents[a].total) || ents[a].name.localeCompare(ents[b].name); });
    kids.forEach(function(ck){ walk(ck, depth + 1, seen); });
  }
  rootKeys.forEach(function(k){ walk(k, 0, {}); });
  return out.join('');
}
function viewLists(v){
  if(!SB.ready){
    v.innerHTML = '<div class="page"><div class="empty"><h3>Master List</h3><p>Loading…</p></div></div>';
    sbEnsure().then(function(){ if(S.route.name === 'lists') render(); });
    return;
  }
  var T = taxEntities(), ents = T.ents;
  var q = MLV.q.trim().toLowerCase();
  function rootOf(ent){
    var cur = ent, seen = {};
    while(cur && cur.parent && ents[cur.parent] && !seen[cur.key]){ seen[cur.key] = true; cur = ents[cur.parent]; }
    return cur;
  }
  function sectionOf(ent){
    if(ent.type === 'skill') return 'skills';
    var r = rootOf(ent);
    if(r.cat) return r.name === 'Church' ? 'churches' : r.name === 'University' ? 'universities' : r.name === 'Military' ? 'military' : 'biz';
    return r.type === 'list' ? 'lists' : 'biz';
  }
  var secs = { churches: [], universities: [], military: [], biz: [], lists: [], skills: [] };
  Object.keys(ents).forEach(function(k){
    var ent = ents[k];
    if(ent.cat && ['Church', 'University', 'Military'].indexOf(ent.name) < 0) return;
    if(ent.parent && ents[ent.parent] && ent.type !== 'skill' && ents[ent.parent].name !== 'University') return;   /* rendered under its parent; University children form the flat Universities section */
    secs[sectionOf(ent)].push(k);
  });
  /* skills grouped by their taxonomy category */
  var skillCats = {};
  Object.keys(ents).forEach(function(k){
    var ent = ents[k];
    if(ent.type !== 'skill') return;
    var c = SKILL_PARENT[ent.name] || 'Other skills';
    (skillCats[c] = skillCats[c] || []).push(ent);
  });
  var nEnt = Object.keys(ents).filter(function(k){ return !ents[k].cat; }).length;
  var h = '<div class="page ml"><header class="ml-hd"><h2>Master List</h2>' +
    '<p class="ml-sub">Every organization, group, and skill in one place. ' + nEnt + ' names. Tap a name to see its people and add or remove them. Renames, merges, and nesting go through Luna so they land clean.</p>' +
    '<div class="ml-bar"><input type="text" id="mlq" placeholder="Search names" value="' + esc(MLV.q) + '"></div></header>' +
    '<datalist id="ml-names">' + Object.keys(ents).filter(function(k){ return !ents[k].cat; }).map(function(k){ return '<option value="' + esc(ents[k].name) + '">'; }).join('') + '</datalist>' +
    '<div id="mlsecs">';
  function secBlock(id, title, inner){
    if(!inner) return '';
    return '<section class="ml-sec"><h3>' + title + '</h3>' + inner + '</section>';
  }
  function flatTree(keys){
    var roots = keys.filter(function(k){ return !ents[k].cat; }).slice().sort(function(a, b){ return (ents[b].total - ents[a].total) || ents[a].name.localeCompare(ents[b].name); });
    if(q) return roots.map(function(k){ return mlTree(ents, [k], q); }).join('');
    var big = roots.filter(function(k){ return ents[k].total >= 3; });
    var shown = MLV.more[keys] ? roots : (big.length ? big : roots.slice(0, 5));
    var out = shown.map(function(k){ return mlTree(ents, [k], ''); }).join('');
    if(roots.length > shown.length || MLV.more[keys]) out += '<button type="button" class="btn ghost sm ml-more" data-act="mlmore" data-sec="' + keys + '">' + (MLV.more[keys] ? 'Show fewer' : 'Show all ' + roots.length + ' (including 1-2 people)') + '</button>';
    return out;
  }
  h += secBlock('churches', 'Churches', mlTree(ents, [regKey('Church')], q));
  h += secBlock('universities', 'Universities', flatTree(secs.universities));
  h += secBlock('military', 'Military', mlTree(ents, [regKey('Military')], q));
  h += secBlock('biz', 'Businesses and other organizations', flatTree(secs.biz));
  h += secBlock('lists', 'My lists', flatTree(secs.lists));
  var sk = '';
  Object.keys(skillCats).sort(function(a, b){ return a.localeCompare(b); }).forEach(function(c){
    var members = skillCats[c];
    if(q && !members.some(function(e){ return e.name.toLowerCase().indexOf(q) >= 0; }) && c.toLowerCase().indexOf(q) < 0) return;
    var tot = {};
    members.forEach(function(e){ e.direct.forEach(function(di){ tot[di] = true; }); });
    sk += '<div class="ml-skillcat"><div class="ml-skillcat-h">' + esc(c) + '<span>' + Object.keys(tot).length + ' people</span></div>' +
      members.sort(function(a, b){ return (b.direct.length - a.direct.length) || a.name.localeCompare(b.name); }).map(function(e){ return mlRow(e, 0); }).join('') + '</div>';
  });
  h += secBlock('skills', 'Skills', sk);
  if(q && h.indexOf('ml-row') < 0) h += '<div class="ml-none" style="padding:18px 2px">No names match "' + esc(MLV.q.trim()) + '".</div>';
  h += '</div></div>';
  v.innerHTML = h;
  var qi = v.querySelector('#mlq');
  if(qi) qi.addEventListener('input', function(){
    MLV.q = qi.value;
    clearTimeout(MLV._qt);
    MLV._qt = setTimeout(mlRenderKeepSearch, 220);
  });
}
function mlRenderKeepSearch(){
  var sv = $('#view'), st = sv ? sv.scrollTop : 0;
  render();
  requestAnimationFrame(function(){
    var s2 = $('#view'); if(s2) s2.scrollTop = st;
    var qi = document.querySelector('#mlq');
    if(qi){ qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
  });
}


function viewCouncil(v){
  cnLoad();
  if(!CN){
    v.innerHTML = '<div class="cnc"><div class="empty"><h3>Council</h3><p>Loading the council board…</p></div></div>';
    return;
  }
  var cn = CN, q = cnQueue();
  var flags = (cn.flags || []).slice().sort(function(a, b){ return (a.priority || 3) - (b.priority || 3); });
  var open = flags.filter(function(f){ return cnFlagState(f, q) === 'open'; });
  var stagedOnly = flags.filter(function(f){ return cnFlagState(f, q) === 'staged'; });
  var closed = flags.filter(function(f){ return cnFlagState(f, q) === 'closed'; });
  var stagedEntries = q.filter(function(e){ return e.state === 'staged'; });
  var doneToday = q.filter(function(e){ return e.state === 'done' && cnToday(e.ts); }).length;
  var h = '<div class="cnc">';
  /* ---- hero: open flags action queue ---- */
  h += '<header class="cnc-hero"><div class="cnc-herotop"><div>' +
    '<div class="cnc-eyebrow">Contacts Pro Council · Command Center</div>' +
    '<h2>Open flags</h2>' +
    '<p class="cnc-sub">Every flag carries Luna’s theory, the evidence, and the fix. Stage an action and it lands on the next council pass — or do it now. Snapshot ' + esc(cn.updated || '') + '.</p></div>' +
    '<div class="cnc-strip">' +
    '<div class="cnc-stat amb"><b>' + open.length + '</b><span>Needs JD</span></div>' +
    '<div class="cnc-stat blu"><b>' + stagedEntries.length + '</b><span>Staged</span></div>' +
    '<div class="cnc-stat grn"><b>' + doneToday + '</b><span>Executed today</span></div>' +
    '</div></div>';
  /* Activity pulse (JD 2026-10-28): the board must show what Luna
     is actually doing, not just static text — the latest pass,
     up top where the queue lives. */
  var lastRun = (cn.runs || [])[0];
  if(lastRun){
    h += '<div class="cnc-pulse"><span class="cnc-pdot"></span><span>Latest pass &middot; <b>' + esc(lastRun.title || '') + '</b>' + (lastRun.outcome ? ' &mdash; ' + esc(lastRun.outcome) : '') + ' &middot; ' + esc(lastRun.date || '') + '</span></div>';
  }
  if(stagedEntries.length){
    h += '<div class="cnc-queuebar"><span class="cnc-qlab">' + ic('check', 13) + ' Staged queue</span>' +
      '<span class="cnc-qitems">' + stagedEntries.map(function(e){ return esc(e.label); }).join(' · ') + '</span>' +
      '<span class="cnc-qbtns"><button type="button" class="btn primary sm" data-act="cn-exec-all">Execute all now</button>' +
      '<button type="button" class="btn ghost sm" data-act="cn-clear">Clear</button></span></div>';
  }
  h += '</header>';
  h += '<section class="cnc-flags">';
  var hero = open.concat(stagedOnly);
  h += hero.length ? hero.map(function(f){ return cnFlagCard(f, q); }).join('')
    : '<div class="empty"><h3>Nothing waiting on JD</h3><p>Every flag is decided or staged. New flags appear here when a director stages something only JD can rule on.</p></div>';
  h += '</section>';
  /* ---- departments ---- */
  h += '<section class="cnc-depts"><h2 class="cnc-h2">Departments</h2><div class="cnc-dgrid">';
  CN_ORDER.forEach(function(key){
    var r = (cn.roster || []).filter(function(x){ return x.key === key; })[0] || {};
    var es = ((cn.findings || {})[key] || []);
    var latest = es[0];
    var fr = cnFieldReport(key, cn);
    h += '<article class="cnc-dept d-' + key + '"><div class="cnc-dhead"><span class="sb-card-ic">' + ic(r.icon || 'shield', 18) + '</span>' +
      '<h3>' + esc(CN_DEPT_NAMES[key] || r.name || key) + '</h3>' +
      '<span class="cnc-dstatus">' + esc(r.status || '') + '</span></div>' +
      (latest ? '<div class="cnc-dlatest"><div class="cnc-dllab">Latest · ' + esc(latest.date || '') + '</div>' +
        '<b>' + esc(latest.title || '') + '</b><p>' + esc(latest.summary || '') + '</p></div>' : '<p class="sb-note">No findings yet.</p>') +
      '<div class="cnc-dgraph">' + cnDeptGraphic(key, cn, q) + '</div>' +
      '<div class="cnc-druns">Last: ' + esc(r.last_run || '—') + ' · Next: ' + esc(r.next_run || '—') + '</div>' +
      (fr ? '<details class="cnc-frd"><summary>Field report</summary>' + fr + '</details>' : '') + '</article>';
  });
  h += '</div></section>';
  /* ---- runs ---- */
  var runs = cn.runs || [];
  if(runs.length){
    h += '<section class="cnc-runs"><h2 class="cnc-h2">Run history</h2><div class="cnc-runlist">' +
      runs.slice(0, 8).map(function(r2){
        return '<div class="cn-frow"><span class="cn-fdate">' + esc(r2.date || '') + '</span>' +
          '<span class="cn-fmain"><b>' + esc(r2.title || '') + '</b>' + (r2.outcome ? ' — ' + esc(r2.outcome) : '') + '</span></div>';
      }).join('') + '</div></section>';
  }
  /* ---- decided ---- */
  h += '<details class="cnc-decided"><summary>Decided (' + closed.length + ') — settled law</summary><div class="cnc-dlist">';
  h += closed.length ? closed.map(function(f){
    var res = q.filter(function(e){ return e.flag === f.id && e.state === 'done'; })[0];
    return '<div class="cnc-drow"><b>' + esc(f.title || '') + '</b>' +
      ((f.ruling || f.resolution) ? '<p>' + esc(f.ruling || f.resolution) + '</p>' : '') +
      (res ? '<p class="cnc-dres">Resolved from the board ' + esc(String(res.ts || '').slice(0, 10)) + ' — ' + esc(res.label || '') + (res.outcome ? ' (' + esc(res.outcome) + ')' : '') + '</p>' : '') + '</div>';
  }).join('') : '<p class="sb-note">No closed flags yet.</p>';
  h += '</div></details>';
  h += '</div>';
  v.innerHTML = h;
}

/* ---------------- 12. profiling inferences (V3.7.0) ----------------
   JD's lab (2026-10-27): cross-reference on-file data into graded
   hypotheses under the inductive-profiler skill — conclusions cite
   their observations, carry a grade, a falsifier, and a scope.
   DISPLAY-ONLY by construction: this view reads the static sidecar
   site/data/profiling.json (written by scripts/build_profiling.py
   from the baked dossier data) and contains no write path at all —
   no queuePatch, no outbox, no ops. Nothing here is ever filed to
   a profile or written to the Sheet. */
var PF_TRAITS = [['openness', 'Openness'], ['conscientiousness', 'Conscientiousness'],
  ['extraversion', 'Extraversion'], ['agreeableness', 'Agreeableness'],
  ['neuroticism', 'Neuroticism'], ['ego', 'Ego']];
function pfGradeChip(g){
  return '<span class="pf-grade g-' + esc(String(g || '').toLowerCase()) + '">' + esc(g || '') + '</span>';
}
function pfVerdictChip(v){
  var cls = v === 'AGREES' ? 'v-agree' : v === 'DIVERGES' ? 'v-diverge' : (v === 'WITHIN RANGE' ? 'v-range' : 'v-none');
  return '<span class="pf-verdict ' + cls + '">' + esc(v || '') + '</span>';
}
function sbProfConclusionCard(c, byId){
  var h = '<div class="sb-card2 pf-cc">' +
    '<div class="pf-chead">' + pfGradeChip(c.grade) +
    '<span class="pf-cfield">' + esc(c.field || '') + ' · ' + esc((PF_TRAITS.filter(function(t){ return t[0] === c.trait; })[0] || [])[1] || c.trait || '') + '</span>' +
    '<span class="pf-cmeta">' + (c.n_support || 0) + ' supporting · ' + (c.n_contra || 0) + ' contradicting · ' + (c.n_rated || 0) + ' rated</span></div>' +
    '<p class="pf-concl"><b>Conclusion:</b> ' + esc(c.conclusion || '') + '</p>' +
    '<div class="pf-sec"><b>Evidence</b><ol class="pf-ev">' +
    (c.evidence || []).map(function(e2){ return '<li>' + esc(e2) + '</li>'; }).join('') + '</ol></div>' +
    '<p class="pf-sec"><b>Falsifier:</b> ' + esc(c.falsifier || '') + '</p>' +
    '<p class="pf-sec"><b>Scope:</b> ' + esc(c.scope || '') + '</p></div>';
  return h;
}
function sbProf(){
  var h = SB._inLab ? '' : sbHead('Profiling inferences', 'A cross-reference lab. Hypotheses are built by inductive reasoning from Contacts Pro\u2019s own data and graded against JD\u2019s Persona inputs \u2014 then left here, unfiled, to be argued with.');
  var pf = SB.prof;
  if(!pf) return h + '<div class="empty"><h3>profiling.json not loaded</h3><p>The lab run could not be read. It ships with the site as data/profiling.json and is regenerated by scripts/build_profiling.py.</p></div>';
  var cov = pf.coverage || {}, cs = pf.crosscheck_summary || {};
  h += '<div class="pf-banner"><b>Lab only</b> \u2014 graded hypotheses from on-file data. Nothing here is filed to profiles, and nothing here writes anywhere. ' +
    'Run of ' + esc(pf.generated || '') + '.' + (SB.pf.tab === 'cohort' ? ' Method: ' + esc(pf.method || '') : '') + '</div>';
  var pfTab = SB.pf.tab || 'accuracy';
  h += '<div class="sb-toolbar pf-tabs">' +
    '<button type="button" class="btn sm ' + (pfTab === 'accuracy' ? 'primary' : 'ghost') + '" data-sb="pftab" data-k="accuracy">Persona accuracy check</button>' +
    '<button type="button" class="btn sm ' + (pfTab === 'cohort' ? 'primary' : 'ghost') + '" data-sb="pftab" data-k="cohort">Cohort clustering \u2014 JD\u2019s ratings vs JD\u2019s ratings</button>' +
    '<span class="sb-note">' + (pfTab === 'cohort' ? 'Run 1: cohort conclusions drawn from JD\u2019s ratings, checked against the same ratings.' : 'Run 2: blind expectations, formed without JD\u2019s ratings, checked against them.') + '</span></div>';
  if(pfTab !== 'cohort') return h + sbProfAccuracy();
  h += '<div class="sb-kpis cn-kpis">' +
    sbKpi(cov.with_field != null ? cov.with_field : '—', 'people with a stated field of study') +
    sbKpi(cov.with_field_and_persona != null ? cov.with_field_and_persona : '—', 'of those, with Persona ratings to test against') +
    sbKpi(cov.persona_rated_total != null ? cov.persona_rated_total : '—', 'people Persona-rated in the directory') +
    sbKpi((pf.conclusions || []).length, 'graded conclusions this run') +
    sbKpi((pf.lines || []).length, 'cross-field lines') +
    '</div>';
  /* conclusion filters */
  var concl = pf.conclusions || [];
  var fieldsWith = [];
  concl.forEach(function(c){ if(fieldsWith.indexOf(c.field) < 0) fieldsWith.push(c.field); });
  fieldsWith.sort();
  var F = SB.pf.field, G = SB.pf.grade;
  h += '<h3 class="sb-h3">Cohort conclusions</h3><div class="sb-toolbar">' +
    '<button type="button" class="btn sm ' + (F === 'all' ? 'primary' : 'ghost') + '" data-sb="pffield" data-k="all">All fields</button>' +
    fieldsWith.map(function(f){ return '<button type="button" class="btn sm ' + (F === f ? 'primary' : 'ghost') + '" data-sb="pffield" data-k="' + esc(f) + '">' + esc(f) + '</button>'; }).join('') +
    '</div><div class="sb-toolbar">' +
    ['all', 'Tentative', 'Probable', 'Strong'].map(function(g){ return '<button type="button" class="btn sm ' + (G === g ? 'primary' : 'ghost') + '" data-sb="pfgrade" data-k="' + g + '">' + (g === 'all' ? 'All grades' : g) + '</button>'; }).join('') +
    '</div>';
  var shown = concl.filter(function(c){ return (F === 'all' || c.field === F) && (G === 'all' || c.grade === G); });
  if(!concl.length) h += '<div class="sb-card2"><p class="sb-note">No conclusions this run \u2014 no cohort cleared the evidence bar. That is a valid run under the method.</p></div>';
  else if(!shown.length) h += '<div class="sb-card2"><p class="sb-note">No conclusions match that filter.</p></div>';
  else h += shown.map(function(c){ return sbProfConclusionCard(c); }).join('');
  if((pf.thin_cohorts || []).length)
    h += '<p class="sb-note">Not concluded \u2014 cohorts too thin to grade (fewer than 2 Persona-rated members, or no consistent direction): ' +
      (pf.thin_cohorts || []).map(esc).join(', ') + '.</p>';
  /* people cross-check */
  h += '<h3 class="sb-h3">People cross-check</h3><div class="sb-card2">' +
    '<p class="sb-card2-n">Pick a person with a stated field. Their card shows the observations on file, the cohort conclusions that apply to them, and how JD\u2019s own Persona ratings for them line up, trait by trait.</p>' +
    '<div class="sb-pick"><label>Person</label>' +
    '<input type="text" data-sbi="pfq" placeholder="Type a name\u2026" value="" autocomplete="off">' +
    '<div class="sb-pickres" id="pfres"></div></div>' +
    '<div id="pfperson">' + sbProfPerson() + '</div></div>';
  /* cross-check summary */
  h += '<h3 class="sb-h3">Cross-check summary</h3><div class="sb-card2">' +
    '<p class="cn-verdict">' + (cs.agrees || 0) + ' trait ratings agree with their cohort conclusion \u00b7 ' + (cs.diverges || 0) + ' diverge.</p>' +
    ((cs.sharpest_divergences || []).length ?
      '<div class="pf-sec"><b>Sharpest divergences</b>' + (cs.sharpest_divergences || []).map(function(s2){
        return '<div class="cn-frow"><span class="cn-fmain"><b>' + esc(s2.name || '') + '</b> \u2014 ' + esc(s2.field || '') + ' \u00b7 ' +
          esc((PF_TRAITS.filter(function(t){ return t[0] === s2.trait; })[0] || [])[1] || s2.trait || '') + ': rated ' + esc(s2.value) +
          ' against a cohort prediction of ' + esc(s2.predicted || '') + ' (directory mean ' + esc(s2.directory_mean) + ')</span></div>';
      }).join('') + '</div>' : '<p class="sb-note">No divergences this run.</p>') + '</div>';
  /* lines */
  h += '<h3 class="sb-h3">Lines \u2014 cross-field convergences</h3>';
  if((pf.lines || []).length){
    h += (pf.lines || []).map(function(l){
      return '<div class="sb-card2"><div class="pf-chead"><span class="pf-cfield">' +
        esc((PF_TRAITS.filter(function(t){ return t[0] === l.trait; })[0] || [])[1] || l.trait || '') + ' \u00b7 ' + esc(l.direction || '') + '</span>' +
        '<span class="pf-cmeta">' + (l.fields || []).length + ' fields converge</span></div>' +
        '<p class="pf-concl">' + (l.fields || []).map(esc).join(' \u00b7 ') + '</p>' +
        '<p class="pf-sec">' + esc(l.note || '') + '</p></div>';
    }).join('');
  } else h += '<div class="sb-card2"><p class="sb-note">No cross-field lines in this run \u2014 no two field cohorts converge on the same trait in the same direction.</p></div>';
  return h;
}
function sbProfPerson(){
  var pf = SB.prof, key = SB.pf.sel;
  if(!pf) return '';
  if(!key) return '<p class="sb-note">No one picked yet. Only people with a stated field of study appear in the search \u2014 ' + ((pf.coverage || {}).with_field || 0) + ' of them this run.</p>';
  var v = (pf.people || {})[key];
  if(!v) return '<p class="sb-note">That person has no stated field of study on file, so the lab has nothing to test.</p>';
  var byId = {};
  (pf.conclusions || []).forEach(function(c){ byId[c.id] = c; });
  var h = '<div class="pf-person">' +
    '<div class="pf-phead"><b>' + esc(v.name || '') + '</b>' +
    '<span class="chip">' + esc(v.field || '') + (v.degree_level ? ' \u00b7 ' + esc(v.degree_level) : '') + '</span>' +
    (v.fields && v.fields.length > 1 ? '<span class="sb-note">also on file: ' + v.fields.slice(1).map(esc).join(', ') + '</span>' : '') +
    '<button type="button" class="btn sm ghost" data-sb="pfclear">Clear</button></div>';
  h += '<div class="pf-sec"><b>Observations on file</b><ul class="pf-obs">' +
    (v.degree_evidence || []).map(function(e2){ return '<li><span class="pf-src">' + esc(e2.source || '') + '</span> ' + esc(e2.snippet || '') + '</li>'; }).join('') +
    (v.orgs && v.orgs.length ? '<li><span class="pf-src">Organizations</span> ' + v.orgs.map(esc).join(', ') + '</li>' : '') +
    (v.groups && v.groups.length ? '<li><span class="pf-src">Groups</span> ' + v.groups.map(esc).join(', ') + '</li>' : '') +
    '</ul></div>';
  h += '<div class="pf-sec"><b>Persona cross-check</b> <span class="sb-note">JD\u2019s ratings, exactly as entered; the verdict tests each against the cohort conclusion for that trait.</span>' +
    '<div class="sb-tablewrap"><table class="sb-table pf-ptable"><thead><tr><th>Trait</th><th>JD\u2019s rating</th><th>Cohort prediction</th><th>Verdict</th></tr></thead><tbody>' +
    PF_TRAITS.map(function(t){
      var cc = (v.crosscheck || {})[t[0]] || {};
      return '<tr><td>' + t[1] + '</td><td>' + (cc.value != null ? esc(cc.value) + ' / 5' : '<span class="sb-note">not rated</span>') + '</td>' +
        '<td>' + (cc.predicted ? esc(cc.predicted) + ' than directory mean ' + esc(((pf.directory_means || {})[t[0]] != null ? pf.directory_means[t[0]] : '—')) : '<span class="sb-note">no conclusion</span>') + '</td>' +
        '<td>' + pfVerdictChip(cc.verdict || 'NO PERSONA ON FILE') + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';
  var applies = (v.applies || []).map(function(id){ return byId[id]; }).filter(Boolean);
  h += '<div class="pf-sec"><b>Applies to them</b>' +
    (applies.length ? applies.map(function(c){
      return '<div class="pf-apply">' + pfGradeChip(c.grade) + '<span>' + esc(c.conclusion || '') + '</span></div>';
    }).join('') : '<p class="sb-note">No cohort conclusion covers this person \u2014 their cohort is too thin to grade, or no trait showed a consistent direction.</p>') + '</div>';
  return h + '</div>';
}


/* ------- profiling inferences, run 2: PERSONA ACCURACY CHECK -------
   JD's actual design (correction, 2026-10-27): degrees are known facts.
   For the test set (stated field AND a Persona rating), Luna formed an
   expected Persona profile BLIND — from pass1_input.json, which holds
   only non-Persona evidence (an assertion in
   scripts/build_profiling_accuracy.py guarantees no Persona field name
   appears in it) — and saved the expectations BEFORE any rating was
   loaded. Pass 2 compared mechanically: AGREE |expected - JD| <= 1,
   DIVERGE >= 2. This view renders pf.accuracy from the sidecar; like
   the cohort view it has no write path at all. */
function pfAccChip(v){
  var cls = v === 'AGREE' ? 'v-agree' : v === 'DIVERGE' ? 'v-diverge' : 'v-none';
  return '<span class="pf-verdict ' + cls + '">' + esc(v || '') + '</span>';
}
function pfTraitLabel(t0){
  var hit = PF_TRAITS.filter(function(t){ return t[0] === t0; })[0];
  return hit ? hit[1] : (t0 || '');
}
function sbProfAccCard(c){
  var kindL = { 'headline':'Headline \u2014 the accuracy question', 'trait':'Trait agreement',
    'trait-bias':'Trait bias', 'field-bias':'Field bias' }[c.kind] || c.kind || '';
  var where = c.field ? esc(c.field) + ' \u00b7 ' + esc(pfTraitLabel(c.trait)) :
    (c.trait ? esc(pfTraitLabel(c.trait)) : 'All traits');
  return '<div class="sb-card2 pf-cc">' +
    '<div class="pf-chead">' + pfGradeChip(c.grade) +
    '<span class="pf-cfield">' + esc(kindL) + '</span>' +
    '<span class="pf-cmeta">' + esc(where) + ' \u00b7 n = ' + (c.n_tested || 0) + ' compared</span></div>' +
    '<p class="pf-concl"><b>Conclusion:</b> ' + esc(c.conclusion || '') + '</p>' +
    '<div class="pf-sec"><b>Evidence</b><ol class="pf-ev">' +
    (c.evidence || []).map(function(e2){ return '<li>' + esc(e2) + '</li>'; }).join('') + '</ol></div>' +
    '<p class="pf-sec"><b>Falsifier:</b> ' + esc(c.falsifier || '') + '</p>' +
    '<p class="pf-sec"><b>Scope:</b> ' + esc(c.scope || '') + '</p></div>';
}
function sbProfAccuracy(){
  var pf = SB.prof, ac = pf && pf.accuracy;
  if(!ac) return '<div class="empty"><h3>accuracy block not loaded</h3><p>The Persona accuracy check has not been merged into profiling.json yet. It is produced by scripts/build_profiling_accuracy.py (pass1, expectations, pass2).</p></div>';
  var ov = ac.overall || {}, bl = ac.blindness || {};
  var h = '<div class="sb-card2"><p class="sb-card2-n">' + esc(ac.method || '') + '</p>' +
    '<p class="sb-note">Blindness, enforced by the build: ' + esc(bl.assertions || '') +
    ' Expectations saved at ' + esc(bl.expectations_saved_at || '') + ' (file mtime ' + esc(bl.expectations_file_mtime || '') + '), before pass 2 loaded any rating. Artifacts: ' + esc(bl.pass1_artifact || '') + ' \u00b7 ' + esc(bl.expectations_artifact || '') + '.</p></div>';
  h += '<div class="sb-kpis cn-kpis">' +
    sbKpi(ac.test_set_n != null ? ac.test_set_n : '\u2014', 'people in the test set (field + a Persona rating)') +
    sbKpi((ov.agree || 0) + ' / ' + (ov.tested || 0), 'trait judgments agree (expected vs JD, within 1)') +
    sbKpi(ov.agree_rate != null ? Math.round(ov.agree_rate * 100) + '%' : '\u2014', 'overall agreement rate') +
    sbKpi(ov.diverge || 0, 'divergences (2+ points apart)') +
    sbKpi(ov.mean_signed_diff != null ? ((ov.mean_signed_diff > 0 ? '+' : '') + ov.mean_signed_diff) : '\u2014', 'mean signed difference (JD - expected)') +
    '</div>';
  h += '<p class="sb-note">Signed difference = JD\u2019s rating minus Luna\u2019s blind expectation. Negative means the blind expectation ran higher than JD rated.</p>';
  /* per-trait agreement bars */
  h += '<h3 class="sb-h3">Agreement by trait</h3><div class="sb-card2">' +
    PF_TRAITS.map(function(t){
      var pt = (ac.per_trait || {})[t[0]] || {};
      if(!pt.tested) return '<div class="pf-abar"><span class="pf-at">' + t[1] + '</span><span class="sb-note">no compared judgments</span></div>';
      var pct = Math.round((pt.agree_rate || 0) * 100);
      return '<div class="pf-abar"><span class="pf-at">' + t[1] + '</span>' +
        '<span class="pf-atrack"><span class="pf-afill" style="width:' + pct + '%"></span></span>' +
        '<span class="pf-acounts">' + pt.agree + '/' + pt.tested + ' agree \u00b7 ' + pct + '% \u00b7 mean diff ' +
        (pt.mean_signed_diff > 0 ? '+' : '') + pt.mean_signed_diff + '</span></div>';
    }).join('') + '</div>';
  /* conclusions */
  h += '<h3 class="sb-h3">Conclusions \u2014 how accurate are JD\u2019s inputs?</h3>';
  if((ac.conclusions || []).length) h += ac.conclusions.map(sbProfAccCard).join('');
  else h += '<div class="sb-card2"><p class="sb-note">No conclusions \u2014 no aggregate pattern cleared the evidence bar. That is a valid run under the method.</p></div>';
  /* sharpest divergences */
  h += '<h3 class="sb-h3">Sharpest divergences</h3><div class="sb-card2">';
  if((ac.sharpest_divergences || []).length){
    h += ac.sharpest_divergences.map(function(s2){
      return '<div class="cn-frow"><span class="cn-fmain"><b>' + esc(s2.name || '') + '</b> \u2014 ' + esc(s2.field || '') + ' \u00b7 ' +
        esc(pfTraitLabel(s2.trait)) + ': Luna expected <b>' + esc(s2.expected) + '</b>, JD rated <b>' + esc(s2.jd) + '</b> (' +
        (s2.diff > 0 ? '+' : '') + esc(s2.diff) + ')</span>' +
        '<span class="sb-note">Basis (' + esc(s2.expectation_grade || '') + '): ' + esc(s2.basis || '') + '</span></div>';
    }).join('');
  } else h += '<p class="sb-note">No divergences \u2014 every compared judgment landed within 1 point.</p>';
  h += '</div>';
  /* per-person cards */
  h += '<h3 class="sb-h3">Person by person</h3><div class="sb-card2">' +
    '<p class="sb-card2-n">Pick anyone in the test set. Their card shows Luna\u2019s blind expectation for each trait (with the basis and grade it was formed under), JD\u2019s rating exactly as entered, and the mechanical verdict.</p>' +
    '<div class="sb-pick"><label>Person</label>' +
    '<input type="text" data-sbi="pfaq" placeholder="Type a name\u2026" value="" autocomplete="off">' +
    '<div class="sb-pickres" id="pfares"></div></div>' +
    '<div id="pfaperson">' + sbProfAccPerson() + '</div></div>';
  return h;
}
function sbProfAccPerson(){
  var pf = SB.prof, ac = pf && pf.accuracy, key = SB.pf.asel;
  if(!ac) return '';
  if(!key) return '<p class="sb-note">No one picked yet. The test set is ' + (ac.test_set_n || 0) + ' people \u2014 everyone with both a stated field of study and at least one Persona rating.</p>';
  var v = (ac.per_person || []).filter(function(x){ return x.key === key; })[0];
  if(!v) return '<p class="sb-note">That person is not in the accuracy test set (no stated field, or no Persona rating on file).</p>';
  var h = '<div class="pf-person">' +
    '<div class="pf-phead"><b>' + esc(v.name || '') + '</b>' +
    '<span class="chip">' + esc(v.field || '') + (v.degree_level ? ' \u00b7 ' + esc(v.degree_level) : '') + '</span>' +
    '<button type="button" class="btn sm ghost" data-sb="pfaclear">Clear</button></div>';
  h += '<div class="sb-tablewrap"><table class="sb-table pf-ptable"><thead><tr><th>Trait</th><th>Luna\u2019s blind expectation</th><th>JD\u2019s rating</th><th>Verdict</th></tr></thead><tbody>' +
    PF_TRAITS.map(function(t){
      var r = (v.traits || {})[t[0]];
      if(!r) return '<tr><td>' + t[1] + '</td><td colspan="3"><span class="sb-note">no expectation formed, not rated</span></td></tr>';
      return '<tr><td>' + t[1] + '</td>' +
        '<td>' + (r.expected != null ? esc(r.expected) + ' / 5 ' + pfGradeChip(r.grade || '') : '<span class="sb-note">no expectation</span>') + '</td>' +
        '<td>' + (r.jd != null ? esc(r.jd) + ' / 5' : '<span class="sb-note">not rated</span>') + '</td>' +
        '<td>' + pfAccChip(r.verdict || '') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  var withBasis = PF_TRAITS.filter(function(t){ var r = (v.traits || {})[t[0]]; return r && r.basis; });
  if(withBasis.length){
    h += '<div class="pf-sec"><b>Why Luna expected that</b><ul class="pf-obs">' +
      withBasis.map(function(t){
        var r = v.traits[t[0]];
        return '<li><span class="pf-src">' + t[1] + '</span> ' + esc(r.basis || '') + '</li>';
      }).join('') + '</ul></div>';
  }
  return h + '</div>';
}

/* ---------------- 13. suspect pool (V3.9.0) ----------------
   JD's thought experiment (2026-10-27, from his criminal-justice
   coursework): define the pool exactly, ask a yes/no question, filter
   by OBSERVABLE BEHAVIOR categories only — demographics are banned by
   construction, the category library in the sidecar holds behavior
   patterns each tied to a real on-file snippet — weigh by base rate,
   and CHECK the result with a registered prediction. The funnel and
   the engine's first experiment render from the static sidecar
   site/data/suspect-pool.json (scripts/build_suspect_pool.py).
   The observation log and prediction tracker live ON THIS DEVICE
   ONLY (localStorage ncc_sbx_spool, the same pattern as the Sandbox
   action log): nothing here is filed to a profile, queued to the
   outbox, or written to the Sheet — browsing and logging create no
   outbox entry. Survivors of a funnel are a shortlist, not a
   conclusion, and are labeled that way everywhere they appear. */
function spStoreGet(){
  var s = sbStore('ncc_sbx_spool');
  if(!s || typeof s !== 'object') s = { obs:[], preds:[], prereg:{}, added:{} };
  if(!Array.isArray(s.obs)) s.obs = [];
  if(!Array.isArray(s.preds)) s.preds = [];
  if(!s.prereg) s.prereg = {};
  if(!s.added) s.added = {};
  return s;
}
function spStoreSave(s){ sbStore('ncc_sbx_spool', s); }
var SP_K2DI = null;
function spK2DI(){
  if(SP_K2DI) return SP_K2DI;
  var m = {};
  D.directory.forEach(function(e, di){ if(liveEntry(e)) m[pkey(e)] = di; });
  SP_K2DI = m;
  return m;
}
function spName(k){ return (SB.spool && (SB.spool.names || {})[k]) || k; }
function spEv(k){ return (SB.spool && (SB.spool.people_evidence || {})[k]) || {}; }
function spCat(id){ return ((SB.spool && SB.spool.categories) || []).filter(function(c){ return c.id === id; })[0] || { id:id, name:id }; }
function spToday(){ return new Date().toISOString().slice(0, 10); }
function spSeedMirror(){
  var ex = SB.spool && SB.spool.default_experiment, pr = ex && ex.prediction;
  if(!pr) return;
  var s = spStoreGet();
  if(s.preds.some(function(p){ return p.id === pr.id; })) return;
  s.preds.unshift({ id:pr.id, seeded:true, registered:pr.registered, event:pr.event,
    eventDate:pr.event_date, personKey:pr.predicted_key, personName:pr.predicted_name,
    question:pr.question, cats:(ex.categories || []).slice(), basis:pr.basis || [],
    predictedText:pr.predicted_text || '', status:'PENDING OUTCOME', outcomeNote:'', outcomeAt:'' });
  spStoreSave(s);
}
function spPoolInfo(){
  var P = SB.pool, sp = SB.spool;
  if(P.src === 'seed'){
    var p = (sp.pools || []).filter(function(x){ return x.id === P.seedId; })[0];
    if(!p) return { desc:'', keys:[], supported:false, reason:'Pool not found in the sidecar.' };
    return { desc:p.name + ' — ' + p.definition, keys:(p.members || []).slice(),
             supported:!!p.supported, reason:p.unsupported_reason || '', pool:p };
  }
  if(P.src === 'opt'){
    var opts = ((sp.pool_options || {})[P.optKind] || []);
    var o = opts.filter(function(x){ return x.name === P.optName; })[0] || opts[0];
    if(!o) return { desc:'No ' + P.optKind + ' options in the sidecar.', keys:[], supported:true, reason:'' };
    SB.pool.optName = o.name;
    return { desc:o.name + ' (' + P.optKind + ') — everyone in the directory carrying it', keys:(o.keys || []).slice(), supported:true, reason:'' };
  }
  return { desc:'Hand-picked set (' + P.picks.length + ' picked)', keys:P.picks.slice(), supported:true, reason:'' };
}
function spQuestion(){
  var P = SB.pool;
  if((P.qtext || '').trim()) return P.qtext.trim();
  var q = ((SB.spool && SB.spool.questions) || []).filter(function(x){ return x.id === P.qid; })[0];
  return q ? q.text : '';
}
function spComboKey(info){
  var P = SB.pool;
  var pk = P.src === 'seed' ? 'seed:' + P.seedId : P.src === 'opt' ? 'opt:' + P.optKind + ':' + (P.optName || '') : 'custom:' + P.picks.slice().sort().join(',');
  return pk + '|' + spQuestion();
}
function spCurCats(){
  var P = SB.pool;
  var lib = ((SB.spool && SB.spool.categories) || []).map(function(c){ return c.id; });
  var want = P.cats || ((SB.spool.default_experiment || {}).categories || ['role', 'action', 'recurrence']);
  return lib.filter(function(id){ return want.indexOf(id) >= 0; });
}
function spFunnel(keys, cats){
  var stages = [{ label:'Pool', keys:keys.slice() }];
  var cur = keys;
  cats.forEach(function(c){
    cur = cur.filter(function(k){ return !!spEv(k)[c]; });
    stages.push({ label:spCat(c).name, cat:c, keys:cur.slice() });
  });
  return stages;
}
function spObsApprox(k, cats){
  var seen = {}, ctx = {}, n = 0;
  cats.forEach(function(c){
    (spEv(k)[c] || []).forEach(function(h){
      var t = String(h.snippet || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      ctx[h.src] = 1;
      if(!seen[t]){ seen[t] = 1; n++; }
    });
  });
  return { n:n, contexts:Object.keys(ctx).length };
}
function spGradeApprox(k, cats){
  var o = spObsApprox(k, cats);
  if(o.n >= 5 && o.contexts >= 3) return 'Strong';
  if(o.n >= 3) return 'Probable';
  if(o.n >= 1) return 'Tentative';
  return null;
}
function spHitStats(preds){
  var res = preds.filter(function(p){ return p.status === 'HIT' || p.status === 'MISS'; });
  var hits = res.filter(function(p){ return p.status === 'HIT'; }).length;
  return { resolved:res.length, hits:hits, rate:res.length ? Math.round(100 * hits / res.length) : null };
}
function sbPool(){
  var h = SB._inLab ? '' : sbHead('Suspect Pool', 'The thought experiment from JD\u2019s coursework: narrow a pool by observable behavior, weigh every trait by how rare it is, then check the result with a prediction. A shortlist, never a conclusion.');
  var sp = SB.spool;
  if(!sp) return h + '<div class="empty"><h3>suspect-pool.json not loaded</h3><p>The lab data could not be read. It ships with the site as data/suspect-pool.json and is regenerated by scripts/build_suspect_pool.py.</p></div>';
  spSeedMirror();
  var store = spStoreGet();
  var ex = sp.default_experiment || {};
  var hs = spHitStats(store.preds);
  h += '<div class="pf-banner"><b>A thought experiment, kept honest.</b> ' + esc(sp.method || '') + '</div>';
  h += '<p class="sb-note">The observation log and prediction tracker below live <b>on this device only</b> — nothing in this tool is filed to a profile, queued, or written to the Sheet.</p>';
  h += '<div class="sb-kpis cn-kpis">' +
    sbKpi(sp.directory_n != null ? sp.directory_n : '—', 'people in the directory (the widest pool)') +
    sbKpi((ex.shortlist || []).length, 'on the first experiment\u2019s shortlist') +
    sbKpi(store.obs.length, 'observations logged on this device') +
    sbKpi(store.preds.filter(function(p){ return p.status === 'PENDING OUTCOME'; }).length, 'predictions awaiting an outcome') +
    sbKpi(hs.rate != null ? hs.rate + '%' : '—', 'prediction hit rate (' + hs.hits + ' of ' + hs.resolved + ' resolved; unclear excluded)') +
    '</div>';

  /* ---- the first experiment (engine record, verbatim) ---- */
  h += '<h3 class="sb-h3">The first experiment — as the engine ran it</h3>';
  h += '<div class="sb-card2"><p class="sb-card2-n"><b>Pool:</b> ' + esc(ex.pool_name || '') + ' — ' + esc(ex.pool_definition || '') + '</p>' +
    '<p class="sp-q">\u201C' + esc(ex.question || '') + '\u201D</p>' +
    '<p class="sb-note">Categories pre-registered ' + esc(ex.categories_registered || '') + ', before scoring: ' +
    (ex.categories || []).map(function(c){ return esc(spCat(c).name); }).join(' · ') + '. ' + esc(ex.categories_note || '') + '</p>' +
    '<div class="sp-funnel">' + (ex.funnel || []).map(function(f, i){
      var pct = (ex.funnel[0] && ex.funnel[0].n) ? Math.round(100 * f.n / ex.funnel[0].n) : 0;
      return '<div class="sp-frow"><span class="sp-fl">' + esc(f.stage || '') + '</span>' +
        '<span class="sp-fbar"><i style="width:' + Math.max(pct, 2) + '%"></i></span>' +
        '<span class="sp-fn">' + f.n + '</span></div>';
    }).join('') + '</div>' +
    '<p class="sb-note">Base rates in this pool: ' + (ex.categories || []).map(function(c){
      var br = (ex.base_rates || {})[c] || {};
      return esc(spCat(c).name) + ' — ' + (br.n || 0) + ' of ' + ((ex.funnel || [])[0] || {}).n + ' (' + (br.pct || 0) + '%)' + (br.barely_narrows ? ' — barely narrows, consider dropping' : '');
    }).join(' · ') + '.</p></div>';
  h += '<p class="sp-shortlabel">' + esc(ex.shortlist_label || 'A shortlist, not a conclusion') + ' — ' + (ex.shortlist || []).length + ' of ' + (((ex.funnel || [])[0] || {}).n || 0) + ' pass every filter</p>';
  h += (ex.shortlist || []).map(function(s2){
    var di = spK2DI()[s2.key];
    var ev = Object.keys(s2.evidence || {}).map(function(c){
      var hits = s2.evidence[c] || [];
      if(!hits.length) return '';
      return '<div class="pf-sec"><b>' + esc(spCat(c).name) + '</b><ul class="pf-obs">' +
        hits.map(function(x){ return '<li><span class="pf-src">' + esc(x.src || '') + '</span> ' + esc(x.snippet || '') + '</li>'; }).join('') + '</ul></div>';
    }).join('');
    return '<div class="sb-card2 pf-cc"><div class="pf-chead">' + pfGradeChip(s2.grade || '') +
      (di != null ? '<button type="button" class="btn sm ghost" data-sb="openprof" data-di="' + di + '">' + esc(s2.name || '') + '</button>' : '<span class="pf-cfield">' + esc(s2.name || '') + '</span>') +
      '<span class="pf-cmeta">' + (s2.observations || 0) + ' on-file observations · ' + (s2.contexts || 0) + ' contexts</span></div>' +
      (s2.presence_note ? '<p class="sb-note">' + esc(s2.presence_note) + '</p>' : '') + ev +
      '<p class="pf-sec"><b>Falsifier:</b> ' + esc(s2.falsifier || '') + '</p>' +
      '<p class="pf-sec"><b>Scope:</b> ' + esc(s2.scope || '') + '</p></div>';
  }).join('');
  if((ex.honesty_notes || []).length)
    h += '<div class="sb-card2"><div class="sb-card2-t">Where the data refused — stated, not papered over</div>' +
      ex.honesty_notes.map(function(n2){ return '<p class="cn-auth">' + esc(n2) + '</p>'; }).join('') + '</div>';

  /* ---- run your own ---- */
  h += '<h3 class="sb-h3">Run your own</h3>';
  h += sbPoolRun(store);

  /* ---- observation log ---- */
  h += '<h3 class="sb-h3">Observation log</h3><div class="sb-card2">' +
    '<p class="sb-card2-n">The method\u2019s paper log: date, event, person, behavior, the category it supports — and an <b>alternative explanation</b> (schedule, money, circumstance, mood). An entry cannot be saved without one. On this device only.</p>' +
    '<div class="sb-formrow"><label>Date <input type="date" data-sbi="spobdate" value="' + esc(SB.pool.obDate || spToday()) + '"></label>' +
    '<label>Event <input type="text" data-sbi="spobevent" placeholder="e.g. CFC Sunday gathering" value="' + esc(SB.pool.obEvent || '') + '"></label></div>' +
    '<div class="sb-pick"><label>Person</label><input type="text" data-sbi="spobq" placeholder="Type a name\u2026" value="' + esc(SB.pool.obsName || '') + '" autocomplete="off">' +
    '<div class="sb-pickres" id="spobres"></div></div>' +
    '<div class="sb-formrow"><label>Behavior observed <input type="text" data-sbi="spobbeh" placeholder="What they actually did" value="' + esc(SB.pool.obBeh || '') + '"></label></div>' +
    '<div class="sb-formrow"><label>Category it supports <select data-sbi="spobcat">' +
      (sp.categories || []).map(function(c){ return '<option value="' + esc(c.id) + '"' + (SB.pool.obCat === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') +
      '<option value="custom"' + (SB.pool.obCat === 'custom' ? ' selected' : '') + '>A new category (name it)</option></select></label>' +
    (SB.pool.obCat === 'custom' ? '<label>New category <input type="text" data-sbi="spobcatx" placeholder="Behavior only — demographics are banned" value="' + esc(SB.pool.obCatX || '') + '"></label>' : '') + '</div>' +
    '<div class="sb-formrow"><label>Alternative explanation (required) <input type="text" data-sbi="spobalt" placeholder="A non-character explanation: schedule, money, circumstance, mood\u2026" value="' + esc(SB.pool.obAlt || '') + '"></label></div>' +
    '<div class="sb-formrow"><button type="button" class="btn primary" data-sb="spobsave">Save observation</button>' +
    '<span class="sb-note">' + store.obs.length + ' logged on this device. Logged observations are your own record — they do not change anyone\u2019s profile.</span></div>' +
    (store.obs.length ? store.obs.slice(0, 60).map(function(o){
      return '<div class="cn-frow"><span class="cn-fdate">' + esc(o.date || '') + '</span>' +
        '<span class="cn-fmain"><b>' + esc(o.personName || '') + '</b> — ' + esc(o.behavior || '') +
        ' <span class="chip">' + esc(o.categoryName || o.category || '') + '</span>' +
        '<span class="sb-note">Event: ' + esc(o.event || '—') + ' · Alternative: ' + esc(o.alt || '') + '</span></span>' +
        '<button type="button" class="btn sm ghost" data-sb="spobdel" data-id="' + esc(o.id) + '">Delete</button></div>';
    }).join('') : '<p class="sb-note">No observations logged yet. The method says: log behaviors for a while before trusting any category.</p>') +
    '</div>';

  /* ---- prediction tracker ---- */
  h += '<h3 class="sb-h3">Prediction tracker — the check that keeps it honest</h3><div class="sb-card2">' +
    '<p class="sb-card2-n">Register a prediction <b>before</b> the event, from the current shortlist above. Mark the outcome after. Hit rate counts hits and misses; \u201Cunclear\u201D is excluded.</p>' +
    sbPoolPredForm(store) +
    (function(){
      var per = (sp.categories || []).map(function(c){
        var sub = store.preds.filter(function(p){ return (p.cats || []).indexOf(c.id) >= 0; });
        var st = spHitStats(sub);
        return st.resolved ? esc(c.name) + ': ' + st.hits + '/' + st.resolved + ' (' + st.rate + '%)' : null;
      }).filter(Boolean);
      return per.length ? '<p class="sb-note">Hit rate by category — ' + per.join(' · ') + '.</p>' : '';
    })() +
    (store.preds.length ? store.preds.map(function(p){ return sbPoolPredCard(p); }).join('') : '<p class="sb-note">No predictions registered yet.</p>') +
    '</div>';

  /* ---- pitfalls ---- */
  h += '<h3 class="sb-h3">The pitfalls — from the method document</h3><div class="sb-cards">' +
    (sp.pitfalls || []).map(function(p){ return '<div class="sb-card2"><div class="sb-card2-t">' + esc(p.t || '') + '</div><p class="sb-card2-n">' + esc(p.d || '') + '</p></div>'; }).join('') + '</div>';
  return h;
}
function sbPoolRun(store){
  var sp = SB.spool, P = SB.pool;
  var info = spPoolInfo();
  var q = spQuestion();
  var cats = spCurCats();
  var combo = spComboKey(info);
  var prereg = store.prereg[combo];
  if(!prereg){
    prereg = { poolDesc:info.desc, question:q, cats:cats.slice(), at:spToday() };
    store.prereg[combo] = prereg;
    spStoreSave(store);
  }
  var h = '<div class="sb-card2">';
  /* pool picker */
  h += '<div class="sb-card2-t">1 · The pool — defined exactly, or the results are vague</div>' +
    '<div class="sb-toolbar">' +
    [['seed', 'Seed pools'], ['opt', 'By group / church / employer'], ['custom', 'Hand-picked set']].map(function(x){
      return '<button type="button" class="btn sm ' + (P.src === x[0] ? 'primary' : 'ghost') + '" data-sb="spsrc" data-k="' + x[0] + '">' + x[1] + '</button>';
    }).join('') + '</div>';
  if(P.src === 'seed'){
    h += '<div class="sb-toolbar">' + (sp.pools || []).map(function(p){
      return '<button type="button" class="btn sm ' + (P.seedId === p.id ? 'primary' : 'ghost') + '" data-sb="spseed" data-k="' + esc(p.id) + '">' + esc(p.name) + (p.supported ? ' (' + (p.members || []).length + ')' : ' — unsupported') + '</button>';
    }).join('') + '</div>';
  } else if(P.src === 'opt'){
    h += '<div class="sb-toolbar">' + [['groups', 'Groups'], ['churches', 'Churches'], ['companies', 'Employers']].map(function(x){
      return '<button type="button" class="btn sm ' + (P.optKind === x[0] ? 'primary' : 'ghost') + '" data-sb="spokind" data-k="' + x[0] + '">' + x[1] + '</button>';
    }).join('') +
    '<select data-sbi="spoptsel">' + (((sp.pool_options || {})[P.optKind] || []).map(function(o){
      return '<option value="' + esc(o.name) + '"' + (info.desc.indexOf(o.name) === 0 ? ' selected' : '') + '>' + esc(o.name) + ' (' + o.n + ')</option>';
    }).join('')) + '</select></div>';
  } else {
    h += '<div class="sb-pick"><label>Pick people</label><input type="text" data-sbi="sppickq" placeholder="Type a name\u2026" value="" autocomplete="off">' +
      '<div class="sb-pickres" id="sppickres"></div></div>' +
      (P.picks.length ? '<div class="sb-toolbar">' + P.picks.map(function(k){
        return '<span class="chip">' + esc(spName(k)) + ' <button type="button" class="btn sm ghost" data-sb="sppickrm" data-k="' + esc(k) + '">×</button></span>';
      }).join('') + '</div>' : '<p class="sb-note">No one picked yet.</p>');
  }
  h += '<p class="sb-note"><b>Pool:</b> ' + esc(info.desc) + ' — <b>' + info.keys.length + ' people</b>.</p>';
  if(!info.supported){
    h += '<div class="pf-banner"><b>This pool cannot be defined from Contacts Pro.</b> ' + esc(info.reason) + '</div>';
    var mm = (info.pool && info.pool.mention_only_members) || [];
    if(mm.length) h += '<p class="sb-note">Mention-only profiles (not a roster): ' + mm.map(function(m){ return esc(m.name); }).join(', ') + '.</p>';
    return h + '</div>';
  }
  /* question */
  h += '<div class="sb-card2-t">2 · The question — yes or no, low stakes first</div>' +
    '<div class="sb-toolbar">' + (sp.questions || []).map(function(x){
      return '<button type="button" class="btn sm ' + (P.qid === x.id && !(P.qtext || '').trim() ? 'primary' : 'ghost') + '" data-sb="spq" data-k="' + esc(x.id) + '">' + esc(x.text) + '</button>';
    }).join('') + '</div>' +
    '<div class="sb-formrow"><label>Or your own question <input type="text" data-sbi="spqtext" placeholder="Type a yes/no question\u2026" value="' + esc(P.qtext || '') + '"></label></div>';
  var selQ = (sp.questions || []).filter(function(x){ return x.id === P.qid; })[0];
  if(selQ && !(P.qtext || '').trim() && selQ.evidence_status) h += '<p class="sb-note">' + esc(selQ.evidence_status) + '</p>';
  h += '<p class="sp-q">\u201C' + esc(q) + '\u201D</p>';
  /* categories */
  var loggedByCat = {};
  store.obs.forEach(function(o){ if(info.keys.indexOf(o.personKey) >= 0){ var ck = o.category || ''; loggedByCat[ck] = (loggedByCat[ck] || 0) + 1; } });
  h += '<div class="sb-card2-t">3 · Categories — observable behavior only (demographics are banned)</div>' +
    '<p class="sb-note">Pre-registered for this pool + question on ' + esc(prereg.at) + ' with: ' + prereg.cats.map(function(c){ return esc(spCat(c).name); }).join(' · ') + '. A category switched on after that is stamped <b>added after results</b> — the method\u2019s rule, applied literally.</p>' +
    '<div class="sb-cards">' + (sp.categories || []).map(function(c){
      var on = cats.indexOf(c.id) >= 0;
      var inPool = info.keys.filter(function(k){ return !!spEv(k)[c.id]; }).length;
      var pct = info.keys.length ? Math.round(100 * inPool / info.keys.length) : 0;
      var added = on && prereg.cats.indexOf(c.id) < 0;
      return '<div class="sb-card2 sp-cat' + (on ? ' on' : '') + '"><div class="pf-chead"><b>' + esc(c.name) + '</b>' +
        '<button type="button" class="btn sm ' + (on ? 'primary' : 'ghost') + '" data-sb="spcat" data-k="' + esc(c.id) + '">' + (on ? 'Filtering' : 'Add filter') + '</button></div>' +
        '<p class="sb-card2-n">' + esc(c.definition) + '</p>' +
        '<p class="sb-note">Base rate in this pool: ' + inPool + ' of ' + info.keys.length + ' (' + pct + '%)' +
        (pct > 85 ? ' — <b>barely narrows the pool; the method says consider dropping it</b>' : '') +
        ' · ' + (loggedByCat[c.id] || 0) + ' logged observations in this pool' +
        (inPool < 3 ? ' · <b>small sample: under 3 on-file observations in this pool</b>' : '') +
        (added ? ' · <b>added after results</b> (pre-registration was ' + esc(prereg.at) + ')' : '') + '</p>' +
        '<p class="sb-note">' + esc(c.evidence_rule) + '</p></div>';
    }).join('') + '</div>';
  /* funnel */
  var stages = spFunnel(info.keys, cats);
  var poolN = info.keys.length || 1;
  h += '<div class="sb-card2-t">4 · The funnel — each filter removes people</div>' +
    '<div class="sp-funnel">' + stages.map(function(f, i){
      var pct = Math.round(100 * f.keys.length / poolN);
      return '<div class="sp-frow"><span class="sp-fl">' + (i === 0 ? 'Pool' : 'After: ' + esc(f.label)) + '</span>' +
        '<span class="sp-fbar"><i style="width:' + Math.max(pct, 2) + '%"></i></span>' +
        '<span class="sp-fn">' + f.keys.length + '</span></div>';
    }).join('') + '</div>';
  var surv = stages[stages.length - 1].keys;
  h += '<p class="sp-shortlabel">A shortlist, not a conclusion — ' + surv.length + ' of ' + info.keys.length + ' pass every filter</p>';
  if(!cats.length) h += '<p class="sb-note">No categories selected — switch on at least one filter.</p>';
  else if(!surv.length) h += '<p class="sb-note">Nobody passes every filter. That is a result: either the pool, the question, or the categories need rethinking — the method says revisit, not force it.</p>';
  else h += surv.map(function(k){
    var di = spK2DI()[k], o = spObsApprox(k, cats), g = spGradeApprox(k, cats);
    var per = cats.map(function(c){ return esc(spCat(c).name) + ': ' + ((spEv(k)[c] || []).length); }).join(' · ');
    return '<div class="cn-frow"><span class="cn-fmain">' +
      (di != null ? '<button type="button" class="btn sm ghost" data-sb="openprof" data-di="' + di + '">' + esc(spName(k)) + '</button>' : '<b>' + esc(spName(k)) + '</b>') +
      ' — ' + o.n + ' on-file observations across ' + o.contexts + ' contexts (' + per + ')</span>' +
      (g ? pfGradeChip(g) : '') + '</div>';
  }).join('');
  h += '<p class="sb-note">Pool size ' + info.keys.length + ' · observations behind this funnel: ' +
    info.keys.reduce(function(a, k){ return a + spObsApprox(k, cats).n; }, 0) + ' on-file, across the selected categories. ' +
    'Grades follow the inductive-profiler rule — Tentative 1–2 observations, Probable 3+, Strong 5+ across 3+ contexts — and describe the recorded pattern only.</p>';
  return h + '</div>';
}
function sbPoolPredForm(store){
  var info = spPoolInfo();
  var cats = spCurCats();
  var stages = spFunnel(info.keys, cats);
  var surv = info.supported ? stages[stages.length - 1].keys : [];
  var h = '<div class="sb-formrow"><label>Event <input type="text" data-sbi="sppredevent" placeholder="e.g. CFC Canton Sunday gathering" value="' + esc(SB.pool.prEvent || '') + '"></label>' +
    '<label>Date <input type="date" data-sbi="sppreddate" value="' + esc(SB.pool.prDate || '') + '"></label>' +
    '<label>Predicted person <select data-sbi="sppredperson">' +
    (surv.length ? surv.map(function(k){ return '<option value="' + esc(k) + '"' + (SB.pool.prPerson === k ? ' selected' : '') + '>' + esc(spName(k)) + '</option>'; }).join('') : '<option value="">— shortlist is empty —</option>') +
    '</select></label>' +
    '<button type="button" class="btn primary" data-sb="sppredsave">Register prediction</button></div>' +
    '<p class="sb-note">The pick list is the current shortlist from \u201CRun your own\u201D — predictions are drawn from the shortlist, registered before the event, and never edited afterward; only the outcome gets marked.</p>';
  return h;
}
function sbPoolPredCard(p){
  var chip = p.status === 'PENDING OUTCOME' ? '<span class="pf-verdict v-none">PENDING OUTCOME</span>'
    : p.status === 'HIT' ? '<span class="pf-verdict v-agree">HIT</span>'
    : p.status === 'MISS' ? '<span class="pf-verdict v-diverge">MISS</span>' : '<span class="pf-verdict v-range">UNCLEAR</span>';
  var h = '<div class="cn-frow"><span class="cn-fmain"><b>' + esc(p.personName || '') + '</b> — ' + esc(p.event || '') +
    (p.eventDate ? ' · ' + esc(p.eventDate) : '') + '<br><span class="sb-note">' + esc(p.predictedText || ('Predicted: among the first to act on \u201C' + (p.question || '') + '\u201D')) + '</span>' +
    (p.basis && p.basis.length ? '<span class="sb-note">Basis: ' + p.basis.map(esc).join(' · ') + '</span>' : '') +
    '<span class="sb-note">Registered ' + esc(p.registered || '') + (p.seeded ? ' (seeded by the engine\u2019s first experiment)' : '') + ' · categories: ' + (p.cats || []).map(function(c){ return esc(spCat(c).name); }).join(' · ') + '</span>' +
    (p.status !== 'PENDING OUTCOME' ? '<span class="sb-note">Outcome marked ' + esc(p.outcomeAt || '') + (p.outcomeNote ? ' — ' + esc(p.outcomeNote) : '') + '</span>' : '') +
    '</span>' + chip + '</div>';
  if(p.status === 'PENDING OUTCOME'){
    h += '<div class="sb-formrow"><label>Outcome note <input type="text" data-sbi="spoutnote" data-id="' + esc(p.id) + '" placeholder="What actually happened\u2026" value="' + esc((SB.pool.outNote || {})[p.id] || '') + '"></label>' +
      '<button type="button" class="btn sm primary" data-sb="spout" data-id="' + esc(p.id) + '" data-k="HIT">It happened (hit)</button>' +
      '<button type="button" class="btn sm ghost" data-sb="spout" data-id="' + esc(p.id) + '" data-k="MISS">It did not (miss)</button>' +
      '<button type="button" class="btn sm ghost" data-sb="spout" data-id="' + esc(p.id) + '" data-k="UNCLEAR">Unclear</button></div>';
  }
  return h;
}

/* ---------------- sandbox events (own delegation; data-sb) ---------------- */
var SB_CONFIRM = null;
function sbConfirm2(title, body, okLabel, danger, fn){ SB_CONFIRM = fn; sbConfirm(title, body, okLabel, danger); }
document.addEventListener('click', function(ev){
  var t = ev.target.closest ? ev.target.closest('[data-sb]') : null;
  if(!t) return;
  var act = t.getAttribute('data-sb');
  function R(){ render(); }
  if(act === 'sheetx'){ closeSheet(); }
  else if(act === 'confirmok'){ var f = SB_CONFIRM; SB_CONFIRM = null; closeSheet(); if(f) f(); }
  else if(act === 'openprof'){ sbOpenProfile(+t.getAttribute('data-di')); }
  else if(act === 'gridopen'){ sbOpenProfile(+t.getAttribute('data-di')); }
  else if(act === 'gridcols'){
    var cols = sbGridCols();
    openSheet('Grid columns', '<div class="sb-colchecks">' + SB_COLS.map(function(c){
      return '<label><input type="checkbox" data-sbi="gridcol" data-k="' + c.k + '"' + (cols[c.k] ? ' checked' : '') + '> ' + esc(c.l) + '</label>';
    }).join('') + '</div>', {});
  }
  else if(act === 'gridcsv'){ sbGridCsv(); }
  else if(act === 'gridviewsave'){
    openSheet('Save this view', '<p class="sb-note">Saves the current preset, filter text, columns and sort on this device.</p>' +
      '<div class="sb-formrow"><input type="text" data-sbi="gvname" placeholder="View name" value="">' +
      '<button type="button" class="btn primary" data-sb="gridviewsaveok">Save view</button></div>', {});
  }
  else if(act === 'gridviewsaveok'){
    var nm = (SB.gvName || '').trim();
    if(!nm){ toast('Name the view first'); return; }
    var all = sbSavedViews();
    all[nm] = { view: SB.grid.view.indexOf('saved:') === 0 ? 'all' : SB.grid.view, q: SB.grid.q, cols: sbGridCols(), sort: SB.grid.sort, dir: SB.grid.dir };
    sbStore('ncc_sbx_views', all);
    SB.grid.view = 'saved:' + nm;
    closeSheet(); toast('View saved'); R();
  }
  else if(act === 'gridsort'){
    var k = t.getAttribute('data-k');
    if(SB.grid.sort === k) SB.grid.dir *= -1; else { SB.grid.sort = k; SB.grid.dir = 1; }
    sbGridRefresh();
  }
  else if(act === 'seltodanger'){ SB.dg.tab = 'delete'; go('sandbox/danger'); }
  else if(act === 'selclear'){ SB.sel = {}; R(); }
  else if(act === 'rawtab'){ SB.raw.which = t.getAttribute('data-k'); R(); }
  else if(act === 'reptab'){ SB.rep.tab = t.getAttribute('data-k'); R(); }
  else if(act === 'pffield'){ SB.pf.field = t.getAttribute('data-k'); R(); }
  else if(act === 'pfgrade'){ SB.pf.grade = t.getAttribute('data-k'); R(); }
  else if(act === 'pfclear'){ SB.pf.sel = null; R(); }
  else if(act === 'pftab'){ SB.pf.tab = t.getAttribute('data-k'); R(); }
  else if(act === 'labtab'){ SB.labtab = t.getAttribute('data-k'); sbStore('ncc_sbx_labtab', SB.labtab); R(); }
    else if(act === 'discsel'){ SB.dsc.sel = t.getAttribute('data-k'); sbDiscPaintList(); var dl = document.querySelector('.sb-dlist'); var on = dl && dl.querySelector('.sb-drow.on'); if(on) on.scrollIntoView({ block:'nearest' }); }
  else if(act === 'pfasel'){ SB.pf.asel = t.getAttribute('data-k'); R(); }
  else if(act === 'pfaclear'){ SB.pf.asel = null; R(); }
  else if(act === 'pfsel'){ SB.pf.sel = t.getAttribute('data-k'); R(); }
  /* suspect pool — all state is on-device (localStorage ncc_sbx_spool);
     none of these actions touch the outbox, queuePatch, or the Sheet */
  else if(act === 'spsrc'){ SB.pool.src = t.getAttribute('data-k'); R(); }
  else if(act === 'spseed'){ SB.pool.seedId = t.getAttribute('data-k'); SB.pool.src = 'seed'; R(); }
  else if(act === 'spokind'){ SB.pool.optKind = t.getAttribute('data-k'); SB.pool.optName = ''; R(); }
  else if(act === 'spq'){ SB.pool.qid = t.getAttribute('data-k'); SB.pool.qtext = ''; R(); }
  else if(act === 'spcat'){
    var cid = t.getAttribute('data-k'), cur = spCurCats().slice();
    var ix = cur.indexOf(cid);
    if(ix >= 0) cur.splice(ix, 1); else cur.push(cid);
    SB.pool.cats = cur; R();
  }
  else if(act === 'sppickadd'){
    var pdi = +t.getAttribute('data-di'), pk2 = pkey(D.directory[pdi]);
    if(SB.pool.picks.indexOf(pk2) < 0) SB.pool.picks.push(pk2);
    var pres = document.getElementById('sppickres'); if(pres) pres.innerHTML = '';
    R();
  }
  else if(act === 'sppickrm'){
    var rk = t.getAttribute('data-k');
    SB.pool.picks = SB.pool.picks.filter(function(x){ return x !== rk; }); R();
  }
  else if(act === 'spobpick'){
    var odi = +t.getAttribute('data-di');
    SB.pool.obsDi = odi; SB.pool.obsName = dispName(D.directory[odi]);
    var ores = document.getElementById('spobres'); if(ores) ores.innerHTML = '';
    var oinp = document.querySelector('input[data-sbi="spobq"]'); if(oinp) oinp.value = SB.pool.obsName;
  }
  else if(act === 'spobsave'){
    var st1 = spStoreGet(), P1 = SB.pool;
    var catName = P1.obCat === 'custom' ? (P1.obCatX || '').trim() : (spCat(P1.obCat).name || P1.obCat);
    if(P1.obsDi == null){ toast('Pick the person first'); return; }
    if(!(P1.obBeh || '').trim()){ toast('Describe the behavior observed'); return; }
    if(P1.obCat === 'custom' && !catName){ toast('Name the new category'); return; }
    if(!(P1.obAlt || '').trim()){ toast('An alternative explanation is required — schedule, money, circumstance, mood'); return; }
    st1.obs.unshift({ id:'sp' + Date.now().toString(36), ts:new Date().toISOString(),
      date:P1.obDate || spToday(), event:(P1.obEvent || '').trim(),
      personKey:pkey(D.directory[P1.obsDi]), personName:SB.pool.obsName || dispName(D.directory[P1.obsDi]),
      behavior:P1.obBeh.trim(), category:(P1.obCat === 'custom' ? 'custom' : P1.obCat), categoryName:catName,
      alt:P1.obAlt.trim() });
    spStoreSave(st1);
    SB.pool.obBeh = ''; SB.pool.obAlt = ''; SB.pool.obsDi = null; SB.pool.obsName = '';
    toast('Observation logged on this device'); R();
  }
  else if(act === 'spobdel'){
    var st2 = spStoreGet(), did = t.getAttribute('data-id');
    st2.obs = st2.obs.filter(function(o){ return o.id !== did; });
    spStoreSave(st2); R();
  }
  else if(act === 'sppredsave'){
    var st3 = spStoreGet(), P3 = SB.pool;
    var info3 = spPoolInfo(), cats3 = spCurCats();
    var stages3 = spFunnel(info3.keys, cats3), surv3 = info3.supported ? stages3[stages3.length - 1].keys : [];
    var pk3 = P3.prPerson && surv3.indexOf(P3.prPerson) >= 0 ? P3.prPerson : surv3[0];
    if(!(P3.prEvent || '').trim()){ toast('Name the event first'); return; }
    if(!pk3){ toast('The current shortlist is empty — a prediction needs a shortlist to draw from'); return; }
    st3.preds.unshift({ id:'sp' + Date.now().toString(36) + 'p', ts:new Date().toISOString(),
      registered:spToday(), event:P3.prEvent.trim(), eventDate:P3.prDate || '',
      personKey:pk3, personName:spName(pk3), question:spQuestion(), cats:cats3.slice(),
      basis:['Shortlist survivor in the current run: pool ' + info3.keys.length + ' narrowed to ' + surv3.length + ' by ' + cats3.map(function(c){ return spCat(c).name; }).join(' · ') + '.'],
      predictedText:'', status:'PENDING OUTCOME', outcomeNote:'', outcomeAt:'' });
    spStoreSave(st3);
    SB.pool.prEvent = ''; SB.pool.prDate = ''; SB.pool.prPerson = '';
    toast('Prediction registered — mark the outcome after the event'); R();
  }
  else if(act === 'spout'){
    var st4 = spStoreGet(), oid = t.getAttribute('data-id'), res4 = t.getAttribute('data-k');
    var pr4 = st4.preds.filter(function(p){ return p.id === oid; })[0];
    if(pr4 && pr4.status === 'PENDING OUTCOME'){
      pr4.status = res4; pr4.outcomeAt = spToday();
      pr4.outcomeNote = (SB.pool.outNote || {})[oid] || '';
      spStoreSave(st4);
    }
    R();
  }
  else if(act === 'integtab'){ SB.integ.tab = t.getAttribute('data-k'); R(); }
  else if(act === 'dgtab'){ SB.dg.tab = t.getAttribute('data-k'); SB.dg.dry = null; R(); }
  else if(act === 'pairmerge'){
    SB.mg = { a:+t.getAttribute('data-a'), b:+t.getAttribute('data-b'), surv:'a', picks:{}, plan:null,
      aName:dispName(D.directory[+t.getAttribute('data-a')]), bName:dispName(D.directory[+t.getAttribute('data-b')]) };
    SB.pick.mgA = { di:SB.mg.a, name:SB.mg.aName }; SB.pick.mgB = { di:SB.mg.b, name:SB.mg.bName };
    if(S.route.name === 'sandbox' && SB.tool === 'merge') R(); else go('sandbox/merge');
  }
  else if(act === 'pairnotdup'){
    var ok = sbStore('ncc_sbx_dupok') || {};
    ok[[pkey(D.directory[+t.getAttribute('data-a')]), pkey(D.directory[+t.getAttribute('data-b')])].sort().join('|')] = 1;
    sbStore('ncc_sbx_dupok', ok); toast('Marked not duplicates'); R();
  }
  else if(act === 'deadcheck'){ SB.integ.deadBusy = true; SB.integ.dead = null; R(); }
  else if(act === 'pickset'){
    var pid = t.getAttribute('data-pick'), di = +t.getAttribute('data-di'), nm = dispName(D.directory[di]);
    SB.pick[pid] = { di:di, name:nm };
    if(pid === 'labA'){ SB.lab.a = di; SB.lab.aName = nm; SB.lab.path = undefined; SB.lab.mutual = null; }
    if(pid === 'labB'){ SB.lab.b = di; SB.lab.bName = nm; SB.lab.path = undefined; SB.lab.mutual = null; }
    if(pid === 'mgA'){ SB.mg.a = di; SB.mg.aName = nm; SB.mg.picks = {}; }
    if(pid === 'mgB'){ SB.mg.b = di; SB.mg.bName = nm; SB.mg.picks = {}; }
    if(pid === 'dgOne') SB.dg.one = di;
    if(pid === 'rnOne'){ SB.dg.rnDi = di; SB.dg.rnFirst = null; SB.dg.rnScan = null; }
    if(pid === 'rkOne') SB.dg.rkDi = di;
    var res = document.getElementById('pick-' + pid); if(res) res.innerHTML = '';
    var inp = document.querySelector('input[data-pick="' + pid + '"]'); if(inp) inp.value = nm;
    if(pid === 'mgA' || pid === 'mgB' || pid === 'rnOne' || pid === 'rkOne' || pid === 'dgOne') R();
  }
  else if(act === 'labgo'){ sbLabRun(); }
  else if(act === 'bridges'){ SB.lab.bridges = 'pending'; R(); }
  else if(act === 'mgsurv'){ SB.mg.surv = t.getAttribute('data-v'); SB.mg.picks = {}; R(); }
  else if(act === 'mgpick'){ SB.mg.picks[t.getAttribute('data-f')] = t.getAttribute('data-v'); R(); }
  else if(act === 'mgplan'){
    var plan = sbMgBuildPlan(); SB.mg.plan = plan;
    sbConfirm2('Merge summary — read before executing', sbMgSummaryHtml(plan), 'Execute merge', false, function(){ sbMgExecute(SB.mg.plan); });
  }
  else if(act === 'delreview' || act === 'delreview1'){
    var dis = act === 'delreview' ? sbSelDis() : (SB.dg.one != null ? [SB.dg.one] : []);
    if(!dis.length){ toast('Nobody selected'); return; }
    sbConfirm2('Delete ' + dis.length + ' profile' + (dis.length === 1 ? '' : 's') + ' to Trash?',
      '<p>These profiles get the deleted flag now; the 10-minute sync moves their rows into the Trash tab (which also blocklists their keys). Their full records are archived in the action log first, and Restore lives in the Danger area.</p><ul class="sb-ul">' +
      dis.map(function(d2){ return '<li>' + esc(dispName(D.directory[d2])) + ' <span class="sb-mono">' + esc(pkey(D.directory[d2])) + '</span></li>'; }).join('') + '</ul>',
      'Delete ' + dis.length, true, function(){ sbDoDelete(dis); });
  }
  else if(act === 'restorearch'){ sbRestoreArchived(t.getAttribute('data-key')); }
  else if(act === 'trashrestore'){
    var key = t.getAttribute('data-key');
    sbLogAdd({ type:'restore', title:'Queued restore of ' + key, detail:'Runs via sandbox_ops.py (reads the Trash row, maps it back into Profiles by header name, deletes the Trash row).', queuedOps:[{ op:'restore', key:key }] });
    toast('Restore queued — export the ops from the Action log'); R();
  }
  else if(act === 'trashpurge'){
    var key2 = t.getAttribute('data-key');
    sbConfirm2('Purge ' + key2 + ' permanently?',
      '<p>Purging removes this key from the Trash tab AND from the build blocklist — the graph or contacts can resurrect this person on the next build.</p><p>There is no undo. The purge itself runs via sandbox_ops.py.</p>',
      'Queue purge', true, function(){
        sbLogAdd({ type:'delete', title:'Queued purge of ' + key2, detail:'Permanent removal from Trash + blocklist, via sandbox_ops.py.', queuedOps:[{ op:'purge', key:key2 }] });
        toast('Purge queued'); R();
      });
  }
  else if(act === 'bulkdry'){
    if(!SB.dg.bulkName && SB.dg.bulkField !== 'tier'){ toast('Name the group / organization first'); return; }
    SB.dg.dry = sbBulkCompute();
    if(!SB.dg.dry.length) toast('That change touches nobody (already in that state)');
    R();
  }
  else if(act === 'bulkexec'){
    var dry = SB.dg.dry || [];
    sbConfirm2('Apply this bulk edit to ' + dry.length + ' people?',
      '<ul class="sb-ul">' + dry.slice(0, 60).map(function(d){ return '<li>' + esc(d.name) + ' — ' + esc(d.field) + ': ' + esc(d.from || '(blank)') + ' → ' + esc(d.to || '(blank)') + '</li>'; }).join('') + '</ul>',
      'Apply', false, function(){
        txn('Sandbox bulk edit', function(){ dry.forEach(function(d){ queuePatch(d.di, d.patch); }); });
        sbLogAdd({ type:'bulk', title:'Bulk edit: ' + SB.dg.bulkField + ' on ' + dry.length + ' people',
          detail:dry.map(function(d){ return d.name + ' (' + d.field + ': ' + (d.from || 'blank') + ' → ' + (d.to || 'blank') + ')'; }).join('; '),
          undo:{ kind:'bulk', items:dry.map(function(d){ return { key:d.key, field:d.field, before:d.from }; }) } });
        SB.dg.dry = null; toast('Bulk edit sent for ' + dry.length); R();
      });
  }
  else if(act === 'rnscan'){
    if(SB.dg.rnDi == null){ toast('Pick a person first'); return; }
    var sc = sbRenameScan(SB.dg.rnDi);
    SB.dg.rnScanData = sc;
    SB.dg.rnScan = '<p><b>' + esc(sc.oldName) + '</b> → <b>' + esc(((SB.dg.rnFirst || '') + ' ' + (SB.dg.rnLast || '')).trim()) + '</b></p>' +
      '<p class="sb-note">Propagation: ' + sc.famRefs + ' family link(s) reference this person, ' + sc.closeRefs + ' close-associate name reference(s) will be re-pointed' + (sc.hasPhoto ? ', and a photos entry under the old name gets a queued rename op' : '') + '. The Snapchat sidecar is keyed by profile key, which does not change.</p>';
    R();
  }
  else if(act === 'rnexec'){
    var di2 = SB.dg.rnDi, e2 = D.directory[di2];
    var before = { first_name:String(raw(e2, 'first_name') || ''), last_name:String(raw(e2, 'last_name') || ''), display_name:String(raw(e2, 'display_name') || '') };
    var nf = (SB.dg.rnFirst || '').trim(), nl = (SB.dg.rnLast || '').trim(), full = (nf + ' ' + nl).trim();
    if(!full){ toast('Enter the new name'); return; }
    var sc2 = SB.dg.rnScanData || sbRenameScan(di2);
    sbConfirm2('Rename ' + sc2.oldName + ' → ' + full + '?',
      '<p>First/last/display name change on the profile, plus re-pointing ' + sc2.closeRefs + ' close-associate reference(s) and any family links that use the display name.' + (sc2.hasPhoto ? ' A photos rename op is queued.' : '') + '</p>',
      'Rename', false, function(){
        var referrers = [];
        txn('Sandbox rename', function(){
          queuePatch(di2, { first_name:nf, last_name:nl, display_name:full });
          D.directory.forEach(function(x, xi){
            if(xi === di2 || !liveEntry(x)) return;
            var patch = {}, changed = false;
            ['close_add', 'close_hide'].forEach(function(cf){
              var names = splitTags(gv(x, cf), ', ');
              if(names.some(function(n){ return n.toLowerCase() === sc2.oldName.toLowerCase(); })){
                patch[cf] = names.map(function(n){ return n.toLowerCase() === sc2.oldName.toLowerCase() ? full : n; }).join(', '); changed = true;
              }
            });
            var fam = famLinks(x), famHit = false;
            var newFam = fam.map(function(l){ if(String(l[1] || '').toLowerCase() === sc2.oldName.toLowerCase()){ famHit = true; return [l[0], full.toLowerCase()]; } return l; });
            if(famHit){ patch.family = JSON.stringify(newFam); changed = true; }
            if(changed){
              var beforePatch = {};
              Object.keys(patch).forEach(function(k){ beforePatch[k] = String(raw(x, k) || ''); });
              queuePatch(xi, patch);
              referrers.push({ key:pkey(x), patch:beforePatch });
            }
          });
        });
        var ops = sc2.hasPhoto ? [{ op:'photorename', old_name:sc2.oldName, new_name:full }] : [];
        sbLogAdd({ type:'rename', title:'Renamed ' + sc2.oldName + ' → ' + full, detail:referrers.length + ' referrer(s) re-pointed', queuedOps:ops,
          undo:{ kind:'rename', key:pkey(e2), before:before, referrers:referrers.map(function(r){ return { key:r.key, patch:r.patch }; }) } });
        SB.dg.rnFirst = null; SB.dg.rnScan = null; toast('Rename sent'); R();
      });
  }
  else if(act === 'rkexec'){
    var di3 = SB.dg.rkDi; if(di3 == null){ toast('Pick a person first'); return; }
    var e3 = D.directory[di3], nk = String(SB.dg.rkNew || '').trim().toLowerCase();
    if(!/^(ig|ct|sf|fdb):.+/.test(nk)){ toast('New key needs an ig:/ct:/sf:/fdb: prefix'); return; }
    if(PK2I[nk] != null){ toast('That key is already in use'); return; }
    sbConfirm2('Re-key ' + dispName(e3) + '?',
      '<p>Old key <span class="sb-mono">' + esc(pkey(e3)) + '</span> → new key <span class="sb-mono">' + esc(nk) + '</span>.</p><ul class="sb-ul"><li>A new Profiles row is created under the new key with a copy of every field.</li><li>Any merged_into references to the old entry are re-pointed.</li><li>The old row is flagged deleted and sweeps to Trash (retiring the old key).</li><li>The Snapchat sidecar re-key is queued for the ops script.</li></ul>',
      'Re-key', true, function(){
        var prof = {};
        SB_MFIELDS.forEach(function(f){ var val = String(raw(e3, f) || ''); if(val) prof[f] = val; });
        prof.display_name = String(raw(e3, 'display_name') || dispName(e3)); prof.merged_into = ''; prof.deleted = '';
        sbPostBatch([{ id:nk, patch:prof }]).then(function(ok){
          if(!ok){ toast('Row create failed — nothing else was touched'); return; }
          var oldTarget = mergeTarget(di3), refs = 0;
          txn('Sandbox re-key', function(){
            D.directory.forEach(function(x, xi){ if(xi !== di3 && String(raw(x, 'merged_into') || '').trim().toLowerCase() === oldTarget){ queuePatch(xi, { merged_into:nk }); refs++; } });
            queuePatch(di3, { deleted:'1' });
          });
          var ops = (SB.snap && SB.snap.people && SB.snap.people[pkey(e3)]) ? [{ op:'snaprename', old_key:pkey(e3), new_key:nk }] : [];
          sbLogAdd({ type:'rekey', title:'Re-keyed ' + dispName(e3) + ': ' + pkey(e3) + ' → ' + nk, detail:refs + ' merged_into reference(s) re-pointed; old row flagged deleted', queuedOps:ops });
          toast('Re-key sent — the new row lands on the next bake'); R();
        });
      });
  }
  else if(act === 'createexec'){
    var fn = (SB.dg.crFirst || '').trim(), ln = (SB.dg.crLast || '').trim();
    if(!fn && !ln){ toast('Enter a name'); return; }
    var full2 = (fn + ' ' + ln).trim();
    var key = String(SB.dg.crKey || '').trim().toLowerCase() || ('sf:' + full2.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    if(PK2I[key] != null){ toast('That key already exists'); return; }
    sbConfirm2('Create profile for ' + full2 + '?', '<p>Key <span class="sb-mono">' + esc(key) + '</span>, tier ' + esc(SB.dg.crTier || 'open') + '. The row is created through the batch endpoint; the person appears at the next bake (~10 minutes).</p>', 'Create', false, function(){
      sbPostBatch([{ id:key, patch:{ first_name:fn, last_name:ln, display_name:full2, display:full2, tier:SB.dg.crTier || 'open' } }]).then(function(ok){
        sbLogAdd({ type:'create', title:'Created profile ' + full2, detail:key });
        toast(ok ? 'Profile create sent' : 'Create POST failed'); R();
      });
    });
  }
  else if(act === 'rebuildq'){
    sbLogAdd({ type:'rebuild', title:'Queued a rebuild + repush', detail:'Runs sync_subjects.py via sandbox_ops.py.', queuedOps:[{ op:'rebuild' }] });
    toast('Rebuild queued'); R();
  }
  else if(act === 'reconq'){
    sbLogAdd({ type:'recon', title:'Queued a fresh reconciliation', detail:'Runs sandbox_recon.py via sandbox_ops.py.', queuedOps:[{ op:'recon' }] });
    toast('Reconciliation queued'); R();
  }
  else if(act === 'logundo'){ sbLogUndo(t.getAttribute('data-id')); }
  else if(act === 'opexport'){
    sbDownload('sandbox-ops.json', JSON.stringify({ ops: sbOpsGet() }, null, 1), 'application/json');
    toast('Ops file downloaded — run: python3 scripts/sandbox_ops.py sandbox-ops.json --push');
  }
  else if(act === 'opclear'){
    sbConfirm2('Clear the queued ops?', '<p>Only clear after sandbox_ops.py has run them — the log entries keep the record either way.</p>', 'Clear queue', true, function(){ sbStore('ncc_sbx_ops', []); toast('Queue cleared'); R(); });
  }
  else if(act === 'logexport'){
    sbDownload('sandbox-log-export.json', JSON.stringify({ entries: sbLogGet(), ops: sbOpsGet() }, null, 1), 'application/json');
  }
});
document.addEventListener('change', function(ev){
  var t = ev.target.closest ? ev.target.closest('[data-sbi]') : null;
  if(!t) return;
  var k = t.getAttribute('data-sbi');
  if(k === 'gridsel'){
    var di = +t.getAttribute('data-di'), pk = pkey(D.directory[di]);
    if(t.checked) SB.sel[pk] = di; else delete SB.sel[pk];
    sbGridRefresh();
  }
  else if(k === 'gridview'){
    if(t.value.indexOf('saved:') === 0){
      var def = sbSavedViews()[t.value.slice(6)];
      if(def){ SB.grid.q = def.q || ''; SB.grid.cols = def.cols || null; SB.grid.sort = def.sort || 'name'; SB.grid.dir = def.dir || 1; }
    }
    SB.grid.view = t.value;
    sbGridRefresh();
  }
  else if(k === 'gridcol'){ var cols = sbGridCols(); cols[t.getAttribute('data-k')] = t.checked; sbStore('ncc_sbx_grid', cols); sbGridRefresh(); }
  else if(k === 'bulkfield'){ SB.dg.bulkField = t.value; SB.dg.dry = null; render(); }
  else if(k === 'bulkval'){ SB.dg.bulkVal = t.value; SB.dg.dry = null; }
  else if(k === 'bulkcat'){ SB.dg.bulkCat = t.value; SB.dg.dry = null; }
  else if(k === 'logfilter'){ SB.lg.filter = t.value; render(); }
  else if(k === 'crtier'){ SB.dg.crTier = t.value; }
  else if(k === 'spoptsel'){ SB.pool.optName = t.value; SB.pool.src = 'opt'; render(); }
  else if(k === 'spobcat'){ SB.pool.obCat = t.value; render(); }
  else if(k === 'spobdate'){ SB.pool.obDate = t.value; }
  else if(k === 'sppredperson'){ SB.pool.prPerson = t.value; }
  else if(k === 'sppreddate'){ SB.pool.prDate = t.value; }
});
var SB_DEB = null;
document.addEventListener('input', function(ev){
  var t = ev.target.closest ? ev.target.closest('[data-sbi]') : null;
  if(!t) return;
  var k = t.getAttribute('data-sbi');
  if(k === 'gridq'){ SB.grid.q = t.value; clearTimeout(SB_DEB); SB_DEB = setTimeout(sbGridRefresh, 250); }
  else if(k === 'discq'){ SB.dsc.q = t.value; clearTimeout(SB_DEB); SB_DEB = setTimeout(sbDiscPaintList, 200); }
  else if(k === 'rawq'){ SB.raw.q = t.value; clearTimeout(SB_DEB); SB_DEB = setTimeout(function(){ if(S.route.name === 'sandbox') sbRenderKeepFocus('rawq'); }, 400); }
  else if(k === 'trashq'){ SB.dg.trashQ = t.value; clearTimeout(SB_DEB); SB_DEB = setTimeout(function(){ if(S.route.name === 'sandbox') sbRenderKeepFocus('trashq'); }, 400); }
  else if(k === 'pfq'){
    var res2 = document.getElementById('pfres');
    if(!res2 || !SB.prof) return;
    var q2 = t.value.trim().toLowerCase();
    if(q2.length < 2){ res2.innerHTML = ''; return; }
    var hits2 = Object.keys(SB.prof.people || {}).filter(function(kk){
      var v2 = SB.prof.people[kk];
      return (v2.name || '').toLowerCase().indexOf(q2) >= 0 || (v2.field || '').toLowerCase().indexOf(q2) >= 0;
    }).sort(function(a, b){ return (SB.prof.people[a].name || '').localeCompare(SB.prof.people[b].name || ''); }).slice(0, 8);
    res2.innerHTML = hits2.length ? hits2.map(function(kk){
      var v2 = SB.prof.people[kk];
      return '<button type="button" class="sb-pickitem" data-sb="pfsel" data-k="' + esc(kk) + '">' + esc(v2.name || '') + '<span>' + esc(v2.field || '') + (v2.degree_level ? ' \u00b7 ' + esc(v2.degree_level) : '') + '</span></button>';
    }).join('') : '<p class="sb-note">No one with a stated field matches that.</p>';
  }
  else if(k === 'spobq'){
    SB.pool.obsName = t.value; SB.pool.obsDi = null;
    var ores2 = document.getElementById('spobres');
    if(!ores2) return;
    var oq = t.value.trim();
    if(oq.length < 2){ ores2.innerHTML = ''; return; }
    var ohits = searchPeople(oq).slice(0, 8);
    ores2.innerHTML = ohits.map(function(di){
      var e = D.directory[di];
      return '<button type="button" class="sb-pickitem" data-sb="spobpick" data-di="' + di + '">' + esc(dispName(e)) + '<span>' + esc(infoLine(e)) + '</span></button>';
    }).join('');
  }
  else if(k === 'sppickq'){
    var pres2 = document.getElementById('sppickres');
    if(!pres2) return;
    var pq = t.value.trim();
    if(pq.length < 2){ pres2.innerHTML = ''; return; }
    var phits = searchPeople(pq).slice(0, 8);
    pres2.innerHTML = phits.map(function(di){
      var e = D.directory[di];
      return '<button type="button" class="sb-pickitem" data-sb="sppickadd" data-di="' + di + '">' + esc(dispName(e)) + '<span>' + esc(infoLine(e)) + '</span></button>';
    }).join('');
  }
  else if(k === 'spobdate'){ SB.pool.obDate = t.value; }
  else if(k === 'spobevent'){ SB.pool.obEvent = t.value; }
  else if(k === 'spobbeh'){ SB.pool.obBeh = t.value; }
  else if(k === 'spobcatx'){ SB.pool.obCatX = t.value; }
  else if(k === 'spobalt'){ SB.pool.obAlt = t.value; }
  else if(k === 'spqtext'){
    SB.pool.qtext = t.value;
    clearTimeout(SB_DEB);
    SB_DEB = setTimeout(function(){ if(S.route.name === 'sandbox' && SB.tool === 'lab' && SB.labtab === 'pool') sbRenderKeepFocus('spqtext'); }, 450);
  }
  else if(k === 'sppredevent'){ SB.pool.prEvent = t.value; }
  else if(k === 'spoutnote'){ SB.pool.outNote[t.getAttribute('data-id')] = t.value; }
  else if(k === 'pfaq'){
    var resa = document.getElementById('pfares');
    if(!resa || !SB.prof || !SB.prof.accuracy) return;
    var qa = t.value.trim().toLowerCase();
    if(qa.length < 2){ resa.innerHTML = ''; return; }
    var hitsa = (SB.prof.accuracy.per_person || []).filter(function(v3){
      return (v3.name || '').toLowerCase().indexOf(qa) >= 0 || (v3.field || '').toLowerCase().indexOf(qa) >= 0;
    }).slice(0, 8);
    resa.innerHTML = hitsa.length ? hitsa.map(function(v3){
      return '<button type="button" class="sb-pickitem" data-sb="pfasel" data-k="' + esc(v3.key) + '">' + esc(v3.name || '') + '<span>' + esc(v3.field || '') + (v3.degree_level ? ' \u00b7 ' + esc(v3.degree_level) : '') + '</span></button>';
    }).join('') : '<p class="sb-note">No one in the accuracy test set matches that.</p>';
  }
  else if(k === 'pickq'){
    var pid = t.getAttribute('data-pick'), res = document.getElementById('pick-' + pid);
    if(!res) return;
    var q = t.value.trim();
    if(q.length < 2){ res.innerHTML = ''; return; }
    var hits = searchPeople(q).slice(0, 8);
    res.innerHTML = hits.map(function(di){
      var e = D.directory[di];
      return '<button type="button" class="sb-pickitem" data-sb="pickset" data-pick="' + pid + '" data-di="' + di + '">' + esc(dispName(e)) + '<span>' + esc(infoLine(e)) + '</span></button>';
    }).join('');
  }
  else if(k === 'bulkname'){ SB.dg.bulkName = t.value; SB.dg.dry = null; }
  else if(k === 'rnfirst'){ SB.dg.rnFirst = t.value; }
  else if(k === 'rnlast'){ SB.dg.rnLast = t.value; }
  else if(k === 'rknew'){ SB.dg.rkNew = t.value; }
  else if(k === 'crfirst'){ SB.dg.crFirst = t.value; }
  else if(k === 'crlast'){ SB.dg.crLast = t.value; }
  else if(k === 'crkey'){ SB.dg.crKey = t.value; }
  else if(k === 'gvname'){ SB.gvName = t.value; }
});
function sbGridRefresh(){
  if(S.route.name !== 'sandbox' || SB.tool !== 'grid') return;
  var v = $('#view'); if(!v) return;
  v.innerHTML = sbShell('<div class="sb-wrap">' + sbGrid() + '</div>');
  var inp = v.querySelector('[data-sbi="gridq"]');
  if(inp && SB.grid.q){ inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
}
/* Audit sweep 2026-10-28: a full render() for a filter keystroke rebuilt
   #view and dropped the caret (focus fell to BODY), so typing after the
   debounce pause went nowhere. Same restore pattern as sbGridRefresh /
   mlRenderKeepSearch: re-focus the same [data-sbi] input, caret at end. */
function sbRenderKeepFocus(k){
  render();
  var inp = document.querySelector('[data-sbi="' + k + '"]');
  if(inp){ inp.focus(); try{ inp.setSelectionRange(inp.value.length, inp.value.length); }catch(x){} }
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
    fetch('data/dossier.json', { cache:'no-cache' })
      .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(d){
        D = d;
        /* Bake self-check (audit F20): if a build drops the profile field
           list, every profile quietly loses its sections. Warn loudly. */
        (function(){ try {
          var e0 = (D.directory || []).find(function(x){ return x.profile && x.profile.synopsis; }) || (D.directory || [])[0];
          var want = ['relationship','synopsis','public_footprint','events','files','tier','first_name','groups'];
          var miss = e0 && e0.profile ? want.filter(function(k){ return !(k in e0.profile); }) : want;
          if(miss.length) console.warn('[bake] dossier.json profiles are missing fields:', miss.join(', '));
        } catch(_e){} })();
        regLoad();
        D.directory.forEach(function(r, i){ BYN[(r.name || '').toLowerCase()] = i; var dn = String(((r.profile || {}).display_name || r.display || '')).toLowerCase(); if(dn && !(dn in BYN)) BYN[dn] = i; normEntry(r); PK2I[pkey(r)] = i; });
        outLoad(); winsLoad(); poolLoad();
        /* Local-wins overlay vs the fresh bake (2026-10-16): retire
           what the bake already shows, then the outbox and the
           overlay's survivors re-apply on top — a value JD saved can
           never vanish just because the bake has not caught up. */
        winsRetire(function(pk, k){
          var di = PK2I[pk]; if(di === undefined) return { found:false };
          var e = D.directory[di]; return { found:true, val:(e.profile || {})[k] };
        });
        try{ applyOutbox(); }catch(px){}
        winsApplyAll();
        try{ auditStateMigrate(); }catch(mx){}
        computeNewGain();
        history.replaceState({ d:0 }, '', location.hash || '#/home');
        render();
        outKick(); fetchChanges();
      })
      .catch(function(err){
        if(tries < 4){ $('#view').innerHTML = skeletonHTML('Loading (retry ' + tries + ' of 3)'); setTimeout(attempt, 1200 * tries); }
        else $('#view').innerHTML = '<div class="page">' + emptyState('Could not load the data.', String(err && err.message || err)) + '<p class="center"><button type="button" class="btn" onclick="location.reload()">Retry</button></p></div>';
      });
  })();
}
/* read-only inspection handle for the black-box harnesses (the app is
   an IIFE; without this, camera/selection state is unmeasurable) */
window.__NCC__ = { NET:NET, S:S, scoreFor:scoreFor, dispName:dispName };
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

/* ============================================================
   Depth pass (V3.1.0): parallax planes. Builds the mid plane
   (#plxmid: glow blobs, rings, one giant faint numeral) and
   drifts the scene + mid plane against the #view scroll —
   damped, transform-only, rAF-throttled, passive. Distances
   asymptote at -58px (scene) / -108px (mid) across a page
   scroll. Under prefers-reduced-motion nothing is set and the
   CSS flattens both layers. The numeral mirrors the Home
   People KPI when Home is on screen; hidden elsewhere.
   ============================================================ */
(function(){
  var mid = document.createElement('div');
  mid.id = 'plxmid'; mid.setAttribute('aria-hidden', 'true');
  mid.innerHTML = '<div class="plx-blob plx-b1"></div><div class="plx-blob plx-b2"></div>' +
    '<div class="plx-ring plx-r1"></div><div class="plx-ring plx-r2"></div><div class="plx-num"></div>';
  document.body.appendChild(mid);
  var num = mid.querySelector('.plx-num');
  function numSync(){
    var v = document.querySelector('.hm .hmk-strip .hmk-kpi .hmk-v');
    var t = v ? (v.textContent || '').trim() : '';
    if(t){ if(num.textContent !== t) num.textContent = t; num.classList.add('on'); }
    else num.classList.remove('on');
  }
  numSync();
  var view = document.getElementById('view');
  if(window.MutationObserver && view){
    var nt = null;
    new MutationObserver(function(){ if(nt) return; nt = setTimeout(function(){ nt = null; numSync(); }, 150); })
      .observe(view, { childList: true });
  }
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  if(mq && mq.matches) return;
  var ticking = false;
  function upd(){
    ticking = false;
    var S = Math.max(view ? view.scrollTop : 0, window.scrollY || 0);
    var k = 1 - Math.exp(-S / 850);
    var r = document.documentElement.style;
    r.setProperty('--plx-bg', (-58 * k).toFixed(1) + 'px');
    r.setProperty('--plx-mid', (-108 * k).toFixed(1) + 'px');
  }
  function onScroll(){ if(!ticking){ ticking = true; requestAnimationFrame(upd); } }
  if(view) view.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  upd();
})();
