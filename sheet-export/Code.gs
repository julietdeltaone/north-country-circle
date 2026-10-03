/**
 * North Country Circle — Sheet to GitHub link.
 *
 * Pushes the Directory + People tabs to data/directory.json in the
 * julietdeltaone/north-country-circle repo, so the dashboard always reads
 * fresh data without any middleman.
 *
 * ONE-TIME SETUP (about 3 minutes):
 *  1. In this sheet: Extensions > Apps Script, paste this whole file, Save.
 *  2. GitHub: Settings > Developer settings > Personal access tokens >
 *     Fine-grained tokens > Generate new token. Give it Contents: Read and
 *     write on ONLY the north-country-circle repo. Copy the token.
 *  3. Back in Apps Script: Project Settings (gear icon) > Script Properties >
 *     Add property: GITHUB_TOKEN = <paste the token>. Save.
 *  4. In the editor, run setupCheck once and authorize. The log should say OK.
 *  5. Triggers (clock icon) > Add Trigger: exportToGitHub, Time-driven,
 *     Hour timer, Every 6 hours. Save.
 *
 * After that, any edit you make in the sheet lands in the repo (and on the
 * dashboard) within 6 hours — only when something actually changed.
 */

var OWNER = 'julietdeltaone';
var REPO = 'north-country-circle';
var BRANCH = 'main';
var PATH_IN_REPO = 'data/directory.json';
var SHEET_ID = '1cszoI0bE6N1GQU-9WPYu4Fm6xazC3Ev84G2ax5SFIn4';

function props() {
  return PropertiesService.getScriptProperties();
}

function githubHeaders() {
  var token = props().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('Set the GITHUB_TOKEN script property first (Project Settings > Script Properties).');
  return {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json'
  };
}

/** Run once to verify the token and sheet access. Check the log for OK. */
function setupCheck() {
  var headers = githubHeaders(); // throws if token missing
  var res = UrlFetchApp.fetch(
    'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + PATH_IN_REPO + '?ref=' + BRANCH,
    { method: 'get', headers: headers, muteHttpExceptions: true });
  Logger.log('GitHub read: HTTP ' + res.getResponseCode());
  var dir = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Directory');
  var people = SpreadsheetApp.openById(SHEET_ID).getSheetByName('People');
  Logger.log('Sheet tabs found: Directory=' + !!dir + ', People=' + !!people);
  Logger.log('OK — add the 6-hour trigger and you are linked.');
}

/** Build the exact JSON the dashboard reads. */
function buildPayload() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  function rowsOf(tab) {
    var sh = ss.getSheetByName(tab);
    if (!sh) return [];
    var vals = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 0), 5).getValues();
    return vals.filter(function(r) { return String(r[0]).trim() !== ''; });
  }
  var directory = rowsOf('Directory').map(function(r) {
    return {
      name: String(r[0]), display: String(r[1]),
      pieces: parseInt(r[2], 10) || 0,
      relation: String(r[3]), detail: String(r[4])
    };
  });
  var people = rowsOf('People').map(function(r) {
    return {
      person: String(r[0]), ig: String(r[1]), aka: String(r[2]),
      source: String(r[3]), mentions: String(r[4])
    };
  });
  return {
    updated: Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd HH:mm') + ' UTC',
    sheet_id: SHEET_ID,
    directory: directory,
    people: people
  };
}

/** Push to GitHub if the data changed since the last push. */
function exportToGitHub() {
  var headers = githubHeaders();
  var payload = buildPayload();
  var json = JSON.stringify(payload);
  // Hash only the data, not the timestamp — otherwise every run looks "changed".
  var dataOnly = JSON.stringify({ directory: payload.directory, people: payload.people });
  var hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, dataOnly, Utilities.Charset.UTF_8)
    .map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
  if (props().getProperty('LAST_HASH') === hash) {
    Logger.log('No changes since last push — skipping.');
    return;
  }
  var api = 'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + PATH_IN_REPO;
  var current = UrlFetchApp.fetch(api + '?ref=' + BRANCH, { method: 'get', headers: headers, muteHttpExceptions: true });
  if (current.getResponseCode() !== 200) {
    throw new Error('Could not read current file from GitHub: HTTP ' + current.getResponseCode());
  }
  var sha = JSON.parse(current.getContentText()).sha;
  var put = UrlFetchApp.fetch(api, {
    method: 'put',
    headers: headers,
    muteHttpExceptions: true,
    payload: JSON.stringify({
      message: 'directory sync from sheet',
      content: Utilities.base64Encode(json, Utilities.Charset.UTF_8),
      sha: sha,
      branch: BRANCH
    })
  });
  if (put.getResponseCode() !== 200 && put.getResponseCode() !== 201) {
    throw new Error('GitHub write failed: HTTP ' + put.getResponseCode() + ' ' + put.getContentText().slice(0, 200));
  }
  props().setProperty('LAST_HASH', hash);
  Logger.log('Pushed directory.json to GitHub (' + payload.directory.length + ' directory, ' +
    payload.people.length + ' people).');
}

/* ============================================================================
 * DASHBOARD EDIT API — lets the dossier page's Edit button write back.
 *
 * DEPLOY (one time): Deploy > New deployment > Web app >
 *   Execute as: Me. Who has access: Anyone. Deploy, copy the /exec URL.
 * Paste that URL into dossier.js as WEBAPP_URL.
 *
 * POST JSON: { password, kind, id, patch }
 *   kind 'subject'   -> id = slug.  Updates the Subject Files tab row and
 *                       data/subjects/<slug>.json in the repo.
 *   kind 'directory' -> id = username. Updates the Directory tab row.
 *   kind 'friends'   -> id = full name. Updates the Friends Database tab row.
 *
 * The password is a soft barrier (same as the dashboard's redaction wall),
 * not real access control — it keeps casual visitors out.
 * ========================================================================== */

var EDIT_PASSWORD = 'admin';

/** Column maps: field name -> 1-indexed column in each tab. */
var SUBJECT_COLS = { slug:1, name:2, category:3, role:4, period:5, standing:6,
  description:7, bio:8, chips:9, sources:10, closeness_tier:11, fdb_standing:12,
  trajectory:13, years_known:14, shared_interests:15, groups:16,
  personal_context:17, relationship_type:18, phone:19,
  public_footprint:20, notes:21 };

/** The 15-point schema + audit + enrichment. Cols are 1-based. */
var PROFILE_COLS = { key:1, display:2, relationship:3, context:4, closeness:5,
  specialty:6, interests:7, charisma:8, competence:9, intellect:10, creativity:11,
  reliability:12, reputation:13, assertiveness:14, ego:15,
  last_note_date:16, last_note:17, audit:18, enriched:19, enriched_value:20,
  enriched_at:21, notes:22, churches:23, companies:24, universities:25,
  phone:26, email:27, org:28, display_name:29, review_flag:30, deleted:31,
  close_add:32, close_hide:33 };
var DIRECTORY_COLS = { name:1, display:2, pieces:3, relation:4, detail:5 };
var FRIENDS_COLS = { 'Name':1, 'Relationship Type':2, 'Groups / Contexts':3,
  'Closeness Tier':4, 'State':5, 'Standing':6, 'Trajectory':7,
  'Personal Context':8, 'Shared Interests':9, 'Years Known':10,
  'Phone':11, 'Text':12, 'Files & media':13 };

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var kind = body.kind, id = String(body.id || ''), patch = body.patch || {};
    if (kind === 'getsettings') {
      return jsonOut({ ok: true,
        prompt: getSetting_('enrich_prompt', '') || ENRICH_PROMPT,
        hasKey: !!(getSetting_('gemini_key', '') || PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY')) });
    }
    if (!id || !patch || Object.keys(patch).length === 0) {
      return jsonOut({ ok: false, error: 'missing id or patch' });
    }
    if (kind === 'subject') {
      updateTabRow('Subject Files', SUBJECT_COLS, id, patch);
      updateSubjectFile(id, patch);
    } else if (kind === 'directory') {
      updateTabRow('Directory', DIRECTORY_COLS, id, patch);
    } else if (kind === 'friends') {
      updateTabRow('Friends Database', FRIENDS_COLS, id, patch);
    } else if (kind === 'profile') {
      updateTabRow('Profiles', PROFILE_COLS, id, patch);
    } else if (kind === 'enrich') {
      return jsonOut(doEnrich(id, patch));
    } else if (kind === 'settings') {
      if (patch.prompt !== undefined) setSetting_('enrich_prompt', String(patch.prompt));
      if (patch.gemini_key) setSetting_('gemini_key', String(patch.gemini_key));
      if (patch.clear_key) setSetting_('gemini_key', '');
      return jsonOut({ ok: true });
    } else if (kind === 'parseprofile') {
      var pkey2 = getSetting_('gemini_key', '') || PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '';
      if (!pkey2) return jsonOut({ ok: false, error: 'no Gemini API key — add one in Settings (gear icon)' });
      var ptext = String((patch && patch.text) || '').slice(0, 2000);
      if (!ptext.trim()) return jsonOut({ ok: false, error: 'describe the person first' });
      var pprompt = 'You are a data entry assistant. Extract the fields below from the description. ' +
        'Return ONLY valid JSON with any of these keys (omit any field not clearly mentioned): ' +
        'relationship (one of: family, friend, coworker, acquaintance, other), ' +
        'context (one of: work, school, military, community, church, online, other), ' +
        'closeness, charisma, competence, intellect, creativity, reliability, reputation, assertiveness, ego (each an integer 1-5; convert number words to digits), ' +
        'specialty (short phrase, e.g. job or role), ' +
        'interests (comma-separated list), ' +
        'churches, companies, universities (comma-separated; when the person clearly belongs to a known one, use its exact name — known churches: CFC Potsdam, CFC Canton, CFC Madrid, NTC, Calvary Baptist; known companies: Rochester Regional Health, Clarkson University, Park Bros.; known universities: SUNY Canton, SUNY Potsdam, St. Lawrence University, Clarkson University). ' +
        'Description: ' + ptext;
      var pparts = callGemini(pprompt, pkey2);
      var praw = pparts.map(function(pt) { return pt.text || ''; }).join('').replace(/```json|```/g, '');
      var pm = praw.match(/\{[\s\S]*\}/);
      if (!pm) throw new Error('could not parse that — try simpler wording');
      return jsonOut({ ok: true, fields: JSON.parse(pm[0]) });
    } else if (kind === 'exportdossier') {
      return jsonOut(exportDossier(id, patch));
    } else if (kind === 'testgemini') {
      var apiKey = getSetting_('gemini_key', '') || PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '';
      if (!apiKey) return jsonOut({ ok: false, error: 'no Gemini API key — paste one above and save' });
      var parts = callGemini('Reply with exactly: GEMINI ONLINE', apiKey);
      var text = parts.map(function(pt) { return pt.text || ''; }).join('').trim();
      return jsonOut({ ok: true, reply: text });
    } else {
      return jsonOut({ ok: false, error: 'unknown kind' });
    }
    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err).slice(0, 200) });
  }
}

/** Professional composite assessment prompt. The model acts as a professional
    profiler: it weighs the scored social metrics the way practitioners do and
    returns one new derived value (a 0-100 composite + a 2-sentence read). */
var ENRICH_PROMPT = [
  'You are a copy editor for a private personal directory.',
  'Below is a draft bio. Clean it up and standardize it:',
  'fix grammar and flow, keep it to one tight paragraph (3-5 sentences),',
  'neutral third-person tone, no flattery, no invented details.',
  'Preserve every factual claim from the draft — do not add new facts.',
  'Return ONLY the cleaned paragraph — no headings, no quotes, no JSON.',
  'Draft:'
].join('\n');

function readProfileRow(key) {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Profiles');
  var last = sh.getLastRow();
  var keys = sh.getRange(2, 1, Math.max(last - 1, 0), 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0]).trim() === key) {
      var vals = sh.getRange(i + 2, 1, 1, 33).getValues()[0];
      return { row: i + 2, vals: vals };
    }
  }
  throw new Error('profile not found: ' + key);
}

function doEnrich(id, patch) {
  var apiKey = getSetting_('gemini_key', '') || PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '';
  if (!apiKey) throw new Error('no Gemini API key \u2014 add one in Settings (gear icon)');
  var promptBase = getSetting_('enrich_prompt', '') || ENRICH_PROMPT;
  var draft = String((patch && patch.draft) || '').slice(0, 2000).trim();
  if (!draft) throw new Error('write your draft bio first');
  var found = readProfileRow(id);
  if (!found) throw new Error('profile row not found: ' + id);
  var prompt = promptBase + '\n' + draft;
  var parts = callGemini(prompt, apiKey);
  var bio = parts.map(function(pt) { return pt.text || ''; }).join('').replace(/```/g, '').trim();
  if (!bio) throw new Error('gemini returned nothing usable');
  var stamp = Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd');
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Profiles');
  sh.getRange(found.row, PROFILE_COLS.enriched).setValue(1);
  sh.getRange(found.row, PROFILE_COLS.enriched_value).setValue(bio);
  sh.getRange(found.row, PROFILE_COLS.enriched_at).setValue(stamp);
  return { ok: true, value: bio, at: stamp };
}

/** Server-side settings (Settings tab, col A = key, col B = value). Auto-created. */
function settingsSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName('Settings');
  if (!sh) {
    sh = ss.insertSheet('Settings');
    sh.getRange(1, 1, 1, 2).setValues([['key', 'value']]);
  }
  return sh;
}
function getSetting_(k, fb) {
  var sh = settingsSheet_();
  var n = sh.getLastRow() - 1;
  if (n < 1) return fb;
  var vals = sh.getRange(2, 1, n, 2).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === k) return vals[i][1];
  }
  return fb;
}
function setSetting_(k, v) {
  var sh = settingsSheet_();
  var n = sh.getLastRow() - 1;
  var vals = n > 0 ? sh.getRange(2, 1, n, 1).getValues() : [];
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === k) { sh.getRange(i + 2, 2).setValue(v); return; }
  }
  sh.appendRow([k, v]);
}

/** Friendly landing for the one-time authorization visit. */
function doGet() {
  return jsonOut({ ok: true, service: 'north-country-circle edit api' });
}

/* ---------- Gemini (future AI parsing) ----------
   Put the key in: Apps Script editor > Project Settings > Script Properties
   as GEMINI_API_KEY. Never in the HTML page. */
function geminiKey() {
  return PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '';
}
function callGemini(prompt, apiKey) {
  var key = apiKey || geminiKey();
  if (!key) throw new Error('GEMINI_API_KEY not set in Script Properties');
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';
  var opts = {
    method: 'post', contentType: 'application/json',
    headers: { 'x-goog-api-key': key },
    payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' } }),
    muteHttpExceptions: true
  };
  var res = null, code = 0, body = '';
  for (var attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) Utilities.sleep(8000);
    res = UrlFetchApp.fetch(url, opts);
    code = res.getResponseCode(); body = res.getContentText();
    if (code !== 503 && code !== 429) break;
  }
  if (code !== 200) {
    var msg = body.slice(0, 200);
    try { msg = JSON.parse(body).error.message || msg; } catch (x) {}
    throw new Error('Gemini API error ' + code + ': ' + msg);
  }
  var data = JSON.parse(body);
  return (((data.candidates || [])[0] || {}).content || {}).parts || [];
}

/** Export: save a generated dossier document to the Drive folder. */
function dossierFolder_() {
  var it = DriveApp.getFoldersByName('North Country Circle Dossiers');
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder('North Country Circle Dossiers');
}
function exportDossier(id, patch) {
  var html = String((patch && patch.html) || '');
  var name = String((patch && patch.filename) || 'dossier.html').replace(/[\\/:*?"<>|]/g, '').slice(0, 120) || 'dossier.html';
  if (!html) throw new Error('nothing to export');
  var folder = dossierFolder_();
  var file = null;
  var it = folder.getFilesByName(name);
  if (it.hasNext()) { file = it.next(); file.setContent(html); }
  else { file = folder.createFile(name, html, 'text/html'); }
  return { ok: true, url: file.getUrl(), name: name };
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Update one row (matched by key column 1) in a sheet tab. */
function updateTabRow(tab, colMap, id, patch) {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(tab);
  if (!sh) throw new Error('tab not found: ' + tab);
  var last = sh.getLastRow();
  var keys = sh.getRange(2, 1, Math.max(last - 1, 0), 1).getValues();
  var row = -1;
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0]).trim() === id) { row = i + 2; break; }
  }
  if (row < 0) throw new Error('row not found in ' + tab + ': ' + id);
  Object.keys(patch).forEach(function(field) {
    var col = colMap[field];
    if (!col) return; // unknown field: ignore
    sh.getRange(row, col).setValue(patch[field]);
  });
}

/** Apply the same patch to data/subjects/<slug>.json in the repo. */
function updateSubjectFile(slug, patch) {
  var headers = githubHeaders();
  var path = 'data/subjects/' + slug + '.json';
  var api = 'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + path;
  var cur = UrlFetchApp.fetch(api + '?ref=' + BRANCH,
    { method: 'get', headers: headers, muteHttpExceptions: true });
  if (cur.getResponseCode() !== 200) throw new Error('subject file not found: ' + slug);
  var curJson = JSON.parse(cur.getContentText());
  var obj = JSON.parse(Utilities.newBlob(Utilities.base64Decode(curJson.content)).getDataAsString());
  var fdb = obj.friendsdb || {};
  Object.keys(patch).forEach(function(field) {
    var v = patch[field];
    if (field === 'chips') {
      // "type: label; type: label" -> [{type, label}]
      obj.chips = String(v).split(';').map(function(part) {
        var bits = part.split(':');
        var t = bits.shift().trim();
        return { type: t, label: bits.join(':').trim() };
      }).filter(function(c) { return c.label; });
    } else if (['closeness_tier','fdb_standing','trajectory','years_known',
                'shared_interests','groups','personal_context',
                'relationship_type','phone'].indexOf(field) >= 0) {
      fdb[field === 'fdb_standing' ? 'standing' : field] = v;
    } else if (SUBJECT_COLS[field]) {
      obj[field] = v;
    }
  });
  if (Object.keys(fdb).length) obj.friendsdb = fdb;
  var put = UrlFetchApp.fetch(api, {
    method: 'put', headers: headers, muteHttpExceptions: true,
    payload: JSON.stringify({
      message: 'subject update from dashboard: ' + slug,
      content: Utilities.base64Encode(JSON.stringify(obj, null, 2) + '\n', Utilities.Charset.UTF_8),
      sha: curJson.sha, branch: BRANCH
    })
  });
  if (put.getResponseCode() !== 200 && put.getResponseCode() !== 201) {
    throw new Error('GitHub subject write failed: HTTP ' + put.getResponseCode());
  }
}
