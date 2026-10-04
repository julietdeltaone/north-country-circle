/* Connections — pairwise preference ranking (Elo).
   Standalone: shares only data/dossier.json with the dossier project.
   Ratings persist in localStorage, keyed by the person's stable `name` field,
   so newcomers to the directory slot in at 1500 automatically — no reset needed. */
(function(){
'use strict';
var LS = 'ncc_rank_v1';
var K = 32, START = 1500;
var store = { r: {}, n: 0, seen: {} };
try {
  var s = JSON.parse(localStorage.getItem(LS) || 'null');
  if (s && s.r) store = s;
} catch (e) {}

function save(){ try { localStorage.setItem(LS, JSON.stringify(store)); } catch (e) {} }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

var PEOPLE = [];   // {key, display, sub, initial}
var byKey = {};

function pkey(e){ return e.name || e.display || ''; }
function psub(e){
  if (e.src === 'contacts') return 'phone contact';
  if (e.src === 'subject') return 'subject file';
  return '@' + (e.name || '');
}
function rating(k){ var v = store.r[k]; return v ? v[0] : START; }
function comps(k){ var v = store.r[k]; return v ? (v[1] + v[2]) : 0; }

function recordWin(winner, loser){
  var rw = rating(winner), rl = rating(loser);
  var ew = 1 / (1 + Math.pow(10, (rl - rw) / 400));
  var el = 1 / (1 + Math.pow(10, (rw - rl) / 400));
  var W = store.r[winner] || (store.r[winner] = [START, 0, 0]);
  var L = store.r[loser]  || (store.r[loser]  = [START, 0, 0]);
  W[0] = Math.round(rw + K * (1 - ew)); W[1]++;
  L[0] = Math.round(rl + K * (0 - el)); L[2]++;
  store.n++;
  store.seen[[winner, loser].sort().join('|')] = 1;
  save();
}

function pickPair(){
  if (PEOPLE.length < 2) return null;
  // A: random from the least-compared third (newcomers surface first)
  var pool = PEOPLE.slice().sort(function(a, b){ return comps(a.key) - comps(b.key); });
  var cut = Math.max(2, Math.floor(pool.length / 3));
  var A = pool[Math.floor(Math.random() * cut)];
  // B: closest rating to A that A hasn't faced yet
  var ra = rating(A.key);
  var cands = PEOPLE.filter(function(p){
    if (p.key === A.key) return false;
    return !store.seen[[p.key, A.key].sort().join('|')];
  });
  if (!cands.length) cands = PEOPLE.filter(function(p){ return p.key !== A.key; });
  cands.sort(function(a, b){ return Math.abs(rating(a.key) - ra) - Math.abs(rating(b.key) - ra); });
  var B = cands[Math.floor(Math.random() * Math.min(cands.length, 12))];
  return Math.random() < 0.5 ? [A, B] : [B, A];
}

function cardHTML(p){
  return '<button class="pcard" data-k="' + esc(p.key) + '">' +
    '<span class="pava">' + esc(p.initial) + '</span>' +
    '<span class="pname">' + esc(p.display) + '</span>' +
    '<span class="psub">' + esc(p.sub) + '</span></button>';
}

var cur = null;
function renderVote(){
  cur = pickPair();
  var box = document.getElementById('cards');
  if (!cur) { box.innerHTML = '<p class="dim">Nobody to rank yet.</p>'; return; }
  box.innerHTML = cardHTML(cur[0]) + '<span class="vs">vs</span>' + cardHTML(cur[1]);
  var btns = box.querySelectorAll('.pcard');
  for (var i = 0; i < btns.length; i++) {
    (function(el, won){
      el.addEventListener('click', function(){
        recordWin(won ? cur[0].key : cur[1].key, won ? cur[1].key : cur[0].key);
        el.classList.add('picked');
        setTimeout(renderVote, 180);
        updateCount();
      });
    })(btns[i], i === 0);
  }
}

function rowHTML(p, i){
  var v = store.r[p.key], r = v ? v[0] : START;
  var wl = v ? (v[1] + 'W · ' + v[2] + 'L') : 'unranked';
  return '<div class="brow"><span class="brank">' + (i + 1) + '</span>' +
    '<span class="bava">' + esc(p.initial) + '</span>' +
    '<span class="bname">' + esc(p.display) + '<i>' + esc(p.sub) + '</i></span>' +
    '<span class="brating">' + r + '</span><span class="bwl">' + esc(wl) + '</span></div>';
}

function renderBoard(){
  var ranked = PEOPLE.filter(function(p){ return comps(p.key) > 0; });
  ranked.sort(function(a, b){ return rating(b.key) - rating(a.key); });
  document.getElementById('top10').innerHTML =
    ranked.slice(0, 10).map(rowHTML).join('') || '<p class="dim">No picks yet.</p>';
  document.getElementById('bot10').innerHTML =
    ranked.slice(-10).reverse().map(rowHTML).join('') || '<p class="dim">No picks yet.</p>';
}

function updateCount(){
  var ranked = 0;
  for (var k in store.r) if (store.r[k][1] + store.r[k][2] > 0) ranked++;
  var togo = PEOPLE.length - ranked;
  document.getElementById('count').textContent =
    store.n + (store.n === 1 ? ' pick' : ' picks') + ' · ' + togo + ' to go';
}

function show(id){
  var vs = document.querySelectorAll('.view');
  for (var i = 0; i < vs.length; i++) vs[i].classList.remove('on');
  document.getElementById(id).classList.add('on');
}

function boot(){
  document.getElementById('btn-board').addEventListener('click', function(){ renderBoard(); show('board'); });
  document.getElementById('btn-back').addEventListener('click', function(){ show('vote'); });
  document.getElementById('btn-skip').addEventListener('click', renderVote);
  document.getElementById('btn-reset').addEventListener('click', function(){
    if (confirm('Reset all rankings? This clears every pick.')) {
      store = { r: {}, n: 0, seen: {} }; save(); renderVote(); updateCount();
    }
  });
  fetch('data/dossier.json', { cache: 'no-store' })
    .then(function(r){ return r.json(); })
    .then(function(d){
      (d.directory || []).forEach(function(e){
        var k = pkey(e);
        if (!k || byKey[k]) return;
        var p = { key: k, display: e.display || e.name || k,
                  sub: psub(e),
                  initial: String(e.display || e.name || '?').trim().charAt(0).toUpperCase() };
        byKey[k] = p; PEOPLE.push(p);
      });
      // drop stored ratings for people no longer in the directory (kept silently otherwise)
      renderVote(); updateCount();
    })
    .catch(function(){
      document.getElementById('cards').innerHTML = '<p class="dim">Could not load the directory.</p>';
    });
}
document.addEventListener('DOMContentLoaded', boot);
})();
