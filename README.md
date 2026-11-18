# Home Budget

A free, mobile-first web app for a shared home budget for two people. It is based on the `NewBudget_sys` Google Sheet.
It is a static site written in plain HTML, CSS and JavaScript. There is no build step, no server and no dependencies. It is hosted for free on GitHub Pages
and can be installed on a phone ("Add to Home Screen"). It also works offline.

## Screens

| App screen | Sheet equivalent | What it does |
|---|---|---|
| **Home** | Top-right "at a glance" | Shows what is left this month, income vs expenses, how much is still to pay and each person's fair share. It also shows who paid what and who owes whom to even out, a category donut and the unpaid items. |
| **Month** | Bottom-right current expenses | Lists this month's expenses under To pay / Paid / All. Tap ✓ to mark an item paid (it moves to the back), tap the name to swap the payer, and tap a row to edit it. |
| **Add** | Top-left "Add to database" + left "Smart Recurring" | **Expense** form with quick-fill chips and autofill from past entries. **Income** per person, with "copy last month's income". **From last month** lets you pick last month's bills, adjust the amount or payer, and add them to this month. You can add an entry to any budget month, including last month. |
| **Stats** | Right-side detailed view / trend analyzer | Shows a 6/12/24-month trend and categories vs last month. Category drill-down shows top items, times bought, last and total amounts. It also has a who-paid-by-month table and a month-vs-month comparison. |
| **History** | `DB_Transactions` | Every transaction, with search and filters (type, status, month, category, payer) and month totals. |
| **Settings** (⚙) | `DB_Setup` | People, currency and categories. Import and export as CSV or JSON. |

Every screen has a month switcher at the top, and most have a row of quick stats.

## Data

* **Shared mode (recommended):** the app reads and writes the `DB_Transactions` tab of your Google Sheet
  through a small Apps Script in your own Google account, protected by a secret key.
  Setup: **[apps-script/SETUP.md](apps-script/SETUP.md)**. Each phone keeps a local copy and a queue of changes,
  so it is fast, works offline, and catches up later.
* **Local mode:** without a connection, data lives only in this browser (`localStorage`).
  Use **Settings → Export / Import** to back it up or move it. CSV import accepts the sheet's
  `DB_Transactions` download (`Active` = to pay, `Hidden`/`Inactive` = paid).

Code: `app/js/store.js` (local copy + change queue), `app/js/sync.js` (talks to the script),
`apps-script/Code.gs` (the script).

## Run locally

```bash
cd app && python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy (free)

1. Merge into `main`.
2. In GitHub go to **Settings → Pages → Source**, choose **GitHub Actions**, and save.
3. The workflow in `.github/workflows/pages.yml` publishes the `app/` folder to
   `https://<user>.github.io/<repo>/`.

GitHub Pages is free for public repositories. The code is public, but your budget data is **not** in the repo. If you want
the repo private, Cloudflare Pages or Netlify host private repos for free. Point them at the `app/` folder.

## Structure

```
apps-script/Code.gs, SETUP.md   Google Sheet backend + guide
app/
  index.html, manifest.webmanifest, sw.js, icons/
  css/styles.css
  js/app.js        router, shared actions
  js/store.js      data layer + storage adapter
  js/stats.js      calculations (pure)
  js/charts.js     tiny SVG charts
  js/csv.js        import/export
  js/sync.js       Google Sheet API client
  js/ui.js         shared components, edit sheet
  js/views/*.js    one file per screen
```
