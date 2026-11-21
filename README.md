# Home Budget

A free, mobile-first web app for a shared home budget for **one to six people**. It started from the `NewBudget_sys` Google Sheet.
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

Every screen has a compact month switcher at the top right, and most have a row of quick stats.
The selector at the top left (**All** or one person) narrows **Home, Month and Stats** to one person's expenses and income.
With two people it is a pair of pills; with three or more it is a button that opens a small menu.
"Spent vs income" shows everyone and turns green → orange → red as expenses approach and pass income.

The layout adapts to the number of people:
* **1 person:** nothing is ever assigned to a payer (no selector, no "paid by"), and "Still to pay" shows more rows.
* **2 people:** adds "fair share" and the "who paid more" line.
* **3–6 people:** more room for "Spent vs income"; no fair-share comparison.

Names are compared without notes in brackets, so "Chiria (cash)" and "Chiria" count as one expense in Stats and
in the quick-add / copy-from-last-month features. Expenses whose name contains a keyword (Joint, Cash, …) are
coloured everywhere; edit the keywords in **Settings → Highlight colours**.

## Data

* **Shared mode (recommended):** the app reads and writes a Google Sheet (`DB_Transactions` tab, plus an `App_Settings` tab
  for names, categories and colours) through a small Apps Script that lives in **your own** Google account and is protected
  by a secret key. Setup takes about 10 minutes: **[app/apps-script/SETUP.md](app/apps-script/SETUP.md)**.
  The app can copy the script for you with a fresh secret filled in, and **Share via…** invites other phones.
  Each phone keeps a local copy and a queue of changes, so it is fast, works offline and catches up later.
* **Local mode:** without a connection, data lives only in this browser (`localStorage`).
  Use **Settings → Export / Import** to back it up or move it.

Code: `app/js/store.js` (local copy, change queue, settings sync), `app/js/sync.js` (talks to the script),
`app/apps-script/Code.gs` (the script).

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
app/
  index.html, manifest.webmanifest, sw.js, icons/
  css/styles.css
  js/app.js        router, shared actions
  js/store.js      data layer + storage adapter
  js/stats.js      calculations (pure)
  js/charts.js     tiny SVG charts
  js/csv.js        import/export
  js/sync.js       Google Sheet API client, invite codes
  js/people-editor.js  1–6 people editor
  js/ui.js         shared components, edit sheet
  js/views/*.js    one file per screen
  apps-script/     Code.gs (Google Sheet backend) + SETUP.md
```
