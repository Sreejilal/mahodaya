// Mahodaya Credit Solutions - Build Script
// Usage: node build.js
// Reads .env, injects config into index.html and loans.html, writes both to dist/

const fs   = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('ERROR: .env file not found. Copy .env.example to .env and fill in your values.');
    process.exit(1);
  }
  const env = {};
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) return;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim();
    env[key] = val;
  });
  return env;
}

const env = loadEnv();
// Every page of the site. Each one goes to dist/ with the same settings filled in.
const PAGES = ['index.html', 'loans.html', 'feedback.html'];

PAGES.forEach(page => {
  if (!fs.existsSync(path.join(__dirname, page))) {
    console.error('ERROR: ' + page + ' not found in this folder.');
    process.exit(1);
  }
});

function build(page) {
  let html = fs.readFileSync(path.join(__dirname, page), 'utf8');
  console.log('\n' + page);

  // DSA link (4 occurrences in index.html)
  if (html.includes('YOUR_DSA_LINK_HERE')) {
    if (env.DSA_LINK && env.DSA_LINK !== 'YOUR_DSA_LINK_HERE') {
      html = html.split('YOUR_DSA_LINK_HERE').join(env.DSA_LINK);
      console.log('OK  DSA link injected');
    } else {
      console.warn('WARN DSA_LINK not set - the "Want an HDFC Bank card?" box stays hidden');
    }
  }

  // Google Analytics ID (2 occurrences per page)
  if (env.GA_ID && env.GA_ID !== 'G-XXXXXXXXXX') {
    html = html.split('G-XXXXXXXXXX').join(env.GA_ID);
    console.log('OK  Google Analytics ID injected');
  } else {
    console.warn('WARN GA_ID not set - Analytics will not track');
  }

  // Google Sheet URL for leads
  if (env.SHEET_URL) {
    html = html.replace(/sheetUrl:\s*'[^']*'/, "sheetUrl: '" + env.SHEET_URL + "'");
    console.log('OK  Leads sheet URL injected');
  }

  // Sheet secret key
  if (env.SHEET_KEY) {
    html = html.replace(/sheetKey:\s*'[^']*'/, "sheetKey: '" + env.SHEET_KEY + "'");
    console.log('OK  Sheet key injected');
  }

  // Cards sheet CSV link (index.html only)
  if (/cardsSheet:\s*''/.test(html)) {
    if (env.CARDS_SHEET_URL) {
      html = html.replace(/cardsSheet:\s*''/, "cardsSheet: '" + env.CARDS_SHEET_URL + "'");
      console.log('OK  Cards sheet URL injected');
    } else {
      console.warn('WARN CARDS_SHEET_URL not set - site will use the built-in card list');
    }
  }
  return html;
}

// Write output
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);
PAGES.forEach(page => fs.writeFileSync(path.join(distDir, page), build(page), 'utf8'));

console.log('\nBuilt: ' + PAGES.map(p => 'dist/' + p).join(', '));
console.log('Next:  drag the whole dist FOLDER onto Netlify Drop (not this project folder).');
console.log('       Every deploy replaces the whole site, so a single file would delete the other page.');
