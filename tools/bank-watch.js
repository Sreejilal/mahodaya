// BANK WATCH: once a day (.github/workflows/bank-watch.yml) this reads every bank
// page the site links to (each bank's credit card page, each card's own page,
// each loan rate page) and compares the fee, rate and offer lines, and the card
// links on the banks' card pages, with the last run. When something changed it
// writes a short report, which the workflow opens as a GitHub issue; GitHub
// emails it to the owner. It never changes the site: card data must match the
// bank's own page, so a person checks the page and updates the card.
//
// node tools/bank-watch.js <state.json> <out folder>
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const STATE = process.argv[2] || '.bank-watch/state.json';
const OUT = process.argv[3] || '.bank-watch-out';
const OWNER = '@Sreejilal';

// The site's own lists: const B in index.html, LOANS and BANKS in loans.html.
function literal(file, start) {
  const s = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const a = s.indexOf(start);
  if (a < 0) throw new Error(start + ' not found in ' + file);
  const open = s[a + start.length - 1], close = open === '[' ? '\n];' : '\n};';   // the list's own end, not a nested one
  const b = s.indexOf(close, a);
  return vm.runInNewContext('(' + s.slice(a + start.length - 1, b + 2) + ')');
}
const plain = t => String(t).replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&#8377;/g, '₹');

function pagesToWatch() {
  const B = literal('index.html', 'const B=[');
  const LOANS = literal('loans.html', 'const LOANS = {'), BANKS = literal('loans.html', 'const BANKS = {');
  const TYPE = {pl: 'Personal loan', hl: 'Home loan', cl: 'Car loan', bl: 'Business loan'};
  const by = new Map();
  const add = (url, what, list) => {
    if (!/^https?:\/\//.test(url || '')) return;
    const p = by.get(url) || {url, what: [], list: false};
    if (!p.what.includes(what)) p.what.push(what);
    p.list = p.list || list;
    by.set(url, p);
  };
  for (const bank of B) {
    add(bank.root, bank.name + ': credit cards', true);
    for (const c of bank.cards) if (c.url) add(c.url, bank.name + ': ' + plain(c.n), false);
  }
  for (const t of Object.keys(LOANS)) for (const r of LOANS[t]) add(r.u, (BANKS[r.b] || {n: r.b}).n + ': ' + TYPE[t], false);
  return [...by.values()];
}

async function fetchPage(url) {
  const res = await fetch(url, {
    redirect: 'follow', signal: AbortSignal.timeout(30000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 MahodayaBankWatch/1.0 (+https://mahodaya.netlify.app)',
      'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-IN,en;q=0.9'
    }
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

// The lines that matter: fees, rates, offers, eligibility. Plus, on a bank's
// card page, the links to its cards, so a new card shows up as a new link.
// whole words: "interested" in a live "335,848 PEOPLE ARE INTERESTED" counter is not interest
const KEEP = /₹|\brs\.?\s?\d|%|\bfees?\b|joining|annual|renewal|waive|reward|cash ?back|lounge|\boffers?\b|\binterest\b|\brates?\b|eligib|\bincome\b|salary|launch|introducing/i;
const SKIP_LINK = /apply|login|faq|terms|tnc|blog|news|mitc|\.pdf$|compare|calculator|locator|contact|track/;
function fingerprint(html, base, list) {
  const out = new Set();
  if (list) for (const m of html.matchAll(/href\s*=\s*["']([^"'#?]+)/gi)) {
    let u; try { u = new URL(m[1].replace(/&amp;/g, '&'), base); } catch (e) { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    const p = (u.hostname.replace(/^www\./, '') + u.pathname).toLowerCase().replace(/\/+$/, '').replace(/\.html?$/, '');
    if (/credit-?cards?\/[a-z0-9-]+|-credit-card/.test(p) && !SKIP_LINK.test(p)) out.add('Card link: ' + p);
  }
  const text = html
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>|<\/(p|li|div|h[1-6]|tr|td|th|dt|dd|section|article|button|a)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#8377;|&#x20b9;|&rupee;/gi, '₹')
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&[a-z]+;/gi, ' ');
  for (let line of text.split('\n')) {
    line = line.replace(/\s+/g, ' ').trim();
    // a number, or a real sentence: menu words like "FD Interest Rates" are on every page and say nothing
    const real = /\d/.test(line) || line.split(' ').length >= 5;
    if (real && line.length >= 6 && line.length <= 300 && KEEP.test(line)) out.add(line);
  }
  return [...out].sort();
}

function section(p, added, removed) {
  const cap = (list, n = 12) => list.slice(0, n).map(l => '- ' + l).join('\n') + (list.length > n ? `\n- ...and ${list.length - n} more` : '');
  return `### ${p.what.join(' / ')}\n${p.url}\n\n` +
    (added.length ? `**New on the page:**\n${cap(added)}\n\n` : '') +
    (removed.length ? `**Gone from the page:**\n${cap(removed)}\n\n` : '');
}

(async () => {
  fs.mkdirSync(path.dirname(STATE), {recursive: true});
  fs.rmSync(OUT, {recursive: true, force: true});
  fs.mkdirSync(OUT, {recursive: true});
  let state = {pages: {}};
  try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) {}
  const first = !Object.keys(state.pages).length;
  const pages = pagesToWatch();
  const changed = [], unreadable = [], thin = [], read = [];

  for (const p of pages) {
    const old = state.pages[p.url];
    let lines;
    try {
      lines = fingerprint(await fetchPage(p.url), p.url, p.list);
      // an empty answer from a page that had content is a blocked visit, not a page wiped clean
      if (lines.length < 3 && old && old.lines && old.lines.length >= 3) throw new Error('page came back empty');
    }
    catch (e) {
      const fails = ((old && old.fails) || 0) + 1;
      state.pages[p.url] = Object.assign({}, old, {fails});
      if (fails === 3) unreadable.push(p);      // reported once, on the third day in a row
      console.log('cannot read', p.url, e.cause ? e.cause.code || e.message : e.message);
      continue;
    }
    if (lines.length < 3) thin.push(p);        // built by the browser: nothing for us to compare
    read.push(p);
    if (old && old.lines) {
      const was = new Set(old.lines), now = new Set(lines);
      const added = lines.filter(l => !was.has(l)), removed = old.lines.filter(l => !now.has(l));
      if (added.length || removed.length) changed.push(section(p, added, removed));
    }
    state.pages[p.url] = {lines, fails: 0, checked: new Date().toISOString().slice(0, 10)};
    console.log('read', lines.length + ' lines', p.url);
  }
  // pages the site no longer links to
  const live = new Set(pages.map(p => p.url));
  for (const u of Object.keys(state.pages)) if (!live.has(u)) delete state.pages[u];
  fs.writeFileSync(STATE, JSON.stringify(state));

  const day = new Date().toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata'});
  const list = ps => ps.map(p => `- ${p.what.join(' / ')}: ${p.url}`).join('\n');
  let title = '', body = '';
  if (first) {
    title = `Bank watch is on (${day})`;
    body = `${OWNER} the bank watch is running. Every morning it reads ${pages.length} bank pages the site links to, and opens an issue like this one (GitHub emails it to you) when a fee, rate, offer or card list changes.\n\n` +
      `It never changes the site by itself. When it reports a change, open the bank's page, and if a card or rate changed, tell Claude to update it.\n\n` +
      `**Read today: ${read.length - thin.length} pages.**\n\n` +
      (thin.length ? `**These ${thin.length} pages are built by the bank's own code in the browser, so the watch sees nothing on them** (check them yourself now and then):\n${list(thin)}\n\n` : '') +
      (pages.length - read.length ? `**These ${pages.length - read.length} pages refused the watch today** (some banks block automatic visits; it keeps trying):\n${list(pages.filter(p => !read.includes(p)))}\n` : '');
  } else if (changed.length || unreadable.length) {
    title = `Bank pages changed (${day}): ${changed.length} page${changed.length === 1 ? '' : 's'}`;
    body = `${OWNER} ${changed.length ? 'these bank pages changed since the last check' : 'nothing changed, but some pages could not be read'}. **The site has not been changed.** ` +
      `Open each page, and if a fee, rate or card really changed, tell Claude "update the cards from the bank watch issue".\n\n` +
      changed.join('\n') +
      (unreadable.length ? `\n**Could not be read 3 days running** (the bank may have moved the page; the site's link may be broken):\n${list(unreadable)}\n` : '');
  }
  if (title) {
    fs.writeFileSync(path.join(OUT, 'title.txt'), title);
    fs.writeFileSync(path.join(OUT, 'report.md'), body);
  }
  console.log(`\n${pages.length} pages, ${read.length} read (${thin.length} with nothing to compare), ${changed.length} changed. ${title ? 'Report written.' : 'No report.'}`);
})().catch(e => { console.error(e); process.exit(1); });
