# Bookends Strategic Cockpit — live, P&L-fed

A live version of the FY27 Scaling Up cockpit. The team **views** it; a few people **update** it
each month by feeding the Tally P&L. Hosted on the same GitHub Pages site as the brand dashboard.

## Links (once deployed)
- **View:**   https://vasuvekariyadome-design.github.io/bookends-dashboard/cockpit/
- **Update:** https://vasuvekariyadome-design.github.io/bookends-dashboard/cockpit/update.html

Both are passcode-gated (same team passcode as the brand dashboard). `noindex` — not searchable.

## The files
| File | What it is |
|------|------------|
| `index.html`  | The cockpit the team views. Reads `data.json`; renders all 9 tabs. |
| `update.html` | The monthly updater. Edits a month, parses an upload, publishes `data.json`. |
| `data.json`   | **The single source of truth.** Every number lives here. |

`index.html` also carries an embedded copy of the seed, so it still renders if `data.json` ever fails
to load. The live numbers always come from `data.json`.

## Monthly workflow (≈ 5 minutes)
1. Open **update.html**, enter the passcode.
2. **Step 1 — Month:** choose "➕ Add a new month", pick the calendar month, click **Load into form**.
   Budget pre-fills from last month; you just enter the actuals.
3. **Step 2 — Auto-fill (optional):** drop the month's Tally P&L (`.xlsx/.xls/.csv` or `.pdf`).
   - **Set "Numbers in the file are in" correctly** (Rupees / Thousands / Lakhs / Crores). The cockpit
     works in **₹ Lakhs**; the page converts for you. Tally usually exports in **Rupees**.
   - It best-effort matches lines and fills the green **Actual** cells. Rows it can't place are listed
     so you can enter them by hand.
4. **Step 3 — Review:** check every value against its label. Gross Profit, Total Opex and EBITDA
   compute automatically. The summary cards show COGS % and EBITDA margin live.
5. **Step 4 — Stamp:** your name + the date.
6. **Step 5 — Publish:** paste your GitHub token once → **Publish to GitHub**. The team sees the
   update within ~1 minute. (No token? Use **Download data.json** and upload it to the repo manually.)

What updates automatically when you publish: the month selector, the Budget-Variance tab, the
"biggest misses" list, the 3 financial KPI cards, and the scoreboard colours for Revenue, EBITDA %,
COGS % and Marketing %. The strategic tabs (Rocks, Risk Register, Cash Bridge, Portfolio) change
rarely — edit `data.json` directly or ask for a tweak.

## Creating the GitHub token (one-time, per editor)
1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new**.
2. **Resource owner:** your account. **Repository access:** *Only select repositories* → `bookends-dashboard`.
3. **Permissions → Repository permissions → Contents: Read and write**. (Nothing else needed.)
4. Generate, copy, paste it into update.html (Step 5). It's stored only in your browser, never committed.
   Fine-grained tokens expire — regenerate when it does.

## Passcodes
- **View + edit gate:** the existing team passcode (same SHA-256 hash as the brand dashboard).
  The real control on *who can publish* is the GitHub token — only holders of a write-token can change
  the live numbers; everyone else can look but not publish.
- To change the passcode: compute the SHA-256 of the new phrase and replace the `HASH` constant near
  the top of both `index.html` and `update.html`.

## Notes
- Currency is **₹ Lakhs** throughout `data.json` (e.g. `266.3` = ₹2.66 Cr).
- Never invent numbers — leave a line blank if you don't have it; the cockpit shows `—`.
- `data.json` is plain JSON; it can also be hand-edited in the GitHub web editor in a pinch.
