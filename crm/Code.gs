/* Mahodaya CRM, running on Google Apps Script.

   Website leads already land in the "Leads" tab of your leads spreadsheet
   (the website's own script writes them). This web app shows that same tab
   as a phone-first CRM, so every new lead is in the CRM on its own: nothing
   to copy across, and nothing leaves your Google account.

   SETUP (once):
   1. Put your leads spreadsheet's ID in SHEET_ID below. The ID is the long
      part of the sheet's address, between /d/ and /edit.
   2. Deploy > New deployment > Web app.
      Execute as: Me. Who has access: Only myself.
   3. Open the web app address on your phone and add it to the home screen.

   The CRM adds its own columns (Product, Bank wanted, Eligibility and so on)
   at the end of the Leads tab the first time it opens. It never changes the
   columns the website writes, so the website's script keeps working. */

const SHEET_ID = 'PASTE_YOUR_SPREADSHEET_ID_HERE';
const TAB = 'Leads';

// Lead field -> column header in the Leads tab. The first name is the one the
// CRM writes if the column is missing; any of the names is accepted.
const COLS = {
  createdAt:   ['Received', 'Timestamp', 'Date'],
  name:        ['Name'],
  mobile:      ['Mobile', 'Phone', 'Mobile number'],
  age:         ['Age'],
  city:        ['City'],
  income:      ['Income', 'Monthly income'],
  employment:  ['Employment', 'Employment type'],
  language:    ['Language', 'Preferred language'],
  spend:       ['Spends on', 'Spend', 'Spends most on'],
  pageLang:    ['Page language'],
  source:      ['Source'],
  stage:       ['Stage'],
  followUp:    ['Next follow-up', 'Follow-up', 'Follow up date'],
  notes:       ['Notes'],
  product:     ['Product'],
  bank:        ['Bank wanted', 'Bank'],
  bankCat:     ['Bank category'],
  card:        ['Card or scheme'],
  loanAmount:  ['Loan amount'],
  tenure:      ['Tenure (months)'],
  eligibility: ['Eligibility'],
  salary:      ['Net salary'],
  panLast4:    ['PAN last 4'],
  fee:         ['Processing fee'],
  payout:      ['Payout received'],
  referredBy:  ['Referred by'],
  bonus:       ['Referral bonus'],
  feedbackAsked: ['Feedback asked'],
  updatedAt:   ['Updated'],
  id:          ['CRM ID']
};
// What the CRM may change on an existing lead. What the visitor sent from the
// website (income, language, spends on, when it arrived) is kept as sent.
const EDITABLE = ['name', 'mobile', 'age', 'city', 'employment', 'stage', 'followUp', 'notes',
  'product', 'bank', 'bankCat', 'card', 'loanAmount', 'tenure', 'eligibility', 'salary',
  'panLast4', 'fee', 'payout', 'referredBy', 'bonus', 'feedbackAsked'];
const DATE_ONLY = ['followUp', 'feedbackAsked'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Mahodaya CRM')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------- called from the page ---------- */

function listLeads() {
  return withLock_(function () {
    const sh = sheet_(), col = cols_(sh), last = sh.getLastRow();
    if (last < 2) return [];
    const tz = book_().getSpreadsheetTimeZone();
    const vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
    const out = [];
    let ids = null;   // only rewritten when a row needed an ID
    vals.forEach(function (r, i) {
      const l = {};
      Object.keys(col).forEach(function (k) { l[k] = out_(k, r[col[k] - 1], tz); });
      if (!l.name && !l.mobile) return;   // an empty row
      if (!l.id) {
        if (!ids) ids = vals.map(function (row) { return [row[col.id - 1]]; });
        l.id = newId_();
        ids[i][0] = l.id;
      }
      out.push(l);
    });
    if (ids) sh.getRange(2, col.id, ids.length, 1).setValues(ids);
    return out;
  });
}

function saveLead(id, d) {
  return withLock_(function () {
    const sh = sheet_(), col = cols_(sh), row = findRow_(sh, col, id);
    if (!row) throw new Error('That lead is no longer in the sheet. Tap Refresh.');
    const rng = sh.getRange(row, 1, 1, sh.getLastColumn()), vals = rng.getValues()[0];
    Object.keys(d || {}).forEach(function (k) {
      if (col[k] && EDITABLE.indexOf(k) > -1) vals[col[k] - 1] = in_(k, d[k]);
    });
    vals[col.updatedAt - 1] = new Date();
    rng.setValues([vals]);
    return true;
  });
}

function addLead(d) {
  return withLock_(function () {
    const sh = sheet_(), col = cols_(sh);
    const id = newId_();
    sh.appendRow(rowFor_(sh, col, d, id));
    return id;
  });
}

// Bulk add from pasted CSV. A mobile number already in the sheet is skipped.
function importLeads(list) {
  return withLock_(function () {
    const sh = sheet_(), col = cols_(sh), last = sh.getLastRow();
    const have = {};
    if (last >= 2) sh.getRange(2, col.mobile, last - 1, 1).getValues().forEach(function (r) { have[digits10_(r[0])] = 1; });
    let added = 0, skipped = 0;
    const rows = [];
    (list || []).forEach(function (d) {
      const m = digits10_(d.mobile);
      if (!d.name || (m && have[m])) { skipped++; return; }
      if (m) have[m] = 1;
      rows.push(rowFor_(sh, col, d, newId_()));
      added++;
    });
    if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    return {added: added, skipped: skipped};
  });
}

function deleteLead(id) {
  return withLock_(function () {
    const sh = sheet_(), col = cols_(sh), row = findRow_(sh, col, id);
    if (!row) throw new Error('That lead is no longer in the sheet. Tap Refresh.');
    sh.deleteRow(row);
    return true;
  });
}

function getSheetUrl() {
  return book_().getUrl();
}

/* ---------- helpers ---------- */

function book_() {
  if (SHEET_ID.indexOf('PASTE') === 0) throw new Error('Put your spreadsheet ID in SHEET_ID at the top of Code.gs, then deploy again.');
  return SpreadsheetApp.openById(SHEET_ID);
}

function sheet_() {
  const sh = book_().getSheetByName(TAB);
  if (!sh) throw new Error('No tab called "' + TAB + '" in that spreadsheet.');
  return sh;
}

function norm_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

// Field -> column number (1-based). Adds any CRM column that is missing.
function cols_(sh) {
  const width = Math.max(sh.getLastColumn(), 1);
  const head = sh.getRange(1, 1, 1, width).getValues()[0];
  const at = {};
  head.forEach(function (h, i) { const n = norm_(h); if (n && !at[n]) at[n] = i + 1; });
  let next = head.some(function (h) { return String(h).trim(); }) ? width + 1 : 1;
  const out = {};
  Object.keys(COLS).forEach(function (k) {
    let c = 0;
    COLS[k].forEach(function (name) { if (!c && at[norm_(name)]) c = at[norm_(name)]; });
    if (!c) {
      c = next++;
      sh.getRange(1, c).setValue(COLS[k][0]).setFontWeight('bold');
      at[norm_(COLS[k][0])] = c;
    }
    out[k] = c;
  });
  return out;
}

function findRow_(sh, col, id) {
  const last = sh.getLastRow();
  if (last < 2 || !id) return 0;
  const ids = sh.getRange(2, col.id, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}

function rowFor_(sh, col, d, id) {
  const row = [];
  for (let i = 0; i < sh.getLastColumn(); i++) row.push('');
  Object.keys(d || {}).forEach(function (k) { if (col[k]) row[col[k] - 1] = in_(k, d[k]); });
  row[col.id - 1] = id;
  row[col.createdAt - 1] = new Date();
  row[col.updatedAt - 1] = new Date();
  if (!d || !d.source) row[col.source - 1] = 'CRM';
  if (!d || !d.stage) row[col.stage - 1] = 'New';
  return row;
}

// Sheet cell -> plain text for the page (the page cannot receive Date objects).
function out_(k, v, tz) {
  if (v === '' || v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, tz, DATE_ONLY.indexOf(k) > -1 ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm:ss");
  }
  if (k === 'mobile') return digits10_(v);
  return String(v);
}

// Page value -> sheet cell.
function in_(k, v) {
  if (v === null || v === undefined) return '';
  let s = String(v).trim();
  if (k === 'mobile') return digits10_(s);   // plain 10 digits: a leading + shows #ERROR! in Sheets
  if (DATE_ONLY.indexOf(k) > -1) return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  if (/^[=+\-@]/.test(s)) s = "'" + s;      // typed text never becomes a formula
  return s;
}

function digits10_(v) {
  const d = String(v === null || v === undefined ? '' : v).replace(/\D/g, '');
  return d.length === 12 && d.indexOf('91') === 0 ? d.slice(2) : d;
}

function newId_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 10); }

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
