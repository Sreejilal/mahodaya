# Mahodaya Credit Solutions

Website: https://mahodayacredit.com

Free credit card and loan guidance in 6 languages. Visitors compare cards and loans, fill in a form, and the lead lands in the Google Sheet and the CRM.

## Folders

| Folder | What's in it |
|---|---|
| `site/` | The 3 pages you edit: `index.html` (cards), `loans.html`, `feedback.html` |
| `dist/` | The finished site, made by `node build.js`. This is what goes live. Never edit it by hand. |
| `google/` | Things that live in Google: the CRM (`crm/`) and the card list to import into a Sheet (`cards.csv`) |
| `tools/` | Bank watch: reads the bank websites every morning and opens an issue if a fee or card changed |

## Putting a change live

1. Edit a page in `site/`.
2. Run `node build.js`.
3. Commit and push. Cloudflare publishes `dist/` in about a minute.
4. Check the BUILD number at the bottom of the website.

The private settings (the Sheet link and its key) are in `.env`, which is never uploaded.
