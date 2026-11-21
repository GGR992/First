# Connect the app to your own Google Sheet

One-time setup, about **10 minutes, on a computer**. Afterwards everyone you invite sees the same budget
on their phone. It is free, and the data stays in **your** Google account.

> **How privacy works.** A tiny script runs inside your Google account and is the only thing that can touch
> your sheet. It only answers requests that carry your **secret key**. Only the people you invite get that key.
> The app's code on GitHub contains no keys and no data.

You need: a Google account, and a computer for the setup (phones can use the app afterwards).

---

## A. First person: create the sheet and the script

### 1. Create a blank Google Sheet
Open **https://sheets.new** and give it a name, e.g. `Our Budget`.
(You don't need to add anything: the app creates the tabs it needs.)

### 2. Open the script editor
In the sheet: **Extensions → Apps Script**. A new tab opens. Select everything in the editor and delete it.

### 3. Copy the script from the app (secret included)
On your phone or computer, open the app → **⚙ Settings → Shared Google Sheet** → tap **Copy script**.
This copies the full script **with a fresh secret key already filled in**.

Paste it into the editor (replace everything) and click **💾 Save**.

> No clipboard? The app shows the script in a box instead: tap inside it, select all, copy.

### 4. Publish it as a web app
1. Click the blue **Deploy** button → **New deployment**.
2. Click the **⚙ gear** next to "Select type" → **Web app**.
3. Set **Execute as: Me** and **Who has access: Anyone**.
   *(The secret key keeps everyone else out. "Anyone" only means the app can reach it.)*
4. Click **Deploy**, then **Authorize access** and choose your account.
   Google shows **"Google hasn't verified this app"**. That is normal for your own script:
   click **Advanced → Go to … (unsafe) → Allow**.
5. Copy the **Web app URL** (it ends with `/exec`).

### 5. Connect the app
Back in the app (**⚙ Settings → Shared Google Sheet**), paste the **Web app URL** (the secret is already there) and tap **Connect**.
You should see "Connected" and a green **✓ Synced** at the top.

---

## B. Invite the others (family, friends, partner)

On a connected phone: **⚙ Settings → Share via…** and send the invitation with any app
(WhatsApp, Messenger, e-mail, SMS…). The message contains a **link** and a **code**.

On the other person's phone:
1. Open the link in the normal browser (Safari / Chrome). Tap **OK** and they are connected.
2. **If the link opens inside the messaging app** (a small in-app browser) the budget would be set up
   *there* and not in the browser or home-screen app they actually use. In that case copy the **code**
   (it starts with `BUDGET-`), open the app in the normal browser, and paste it into
   **Join an existing shared budget** (on the first screen, or **⚙ Settings**).
3. Optional: add the app to the home screen (Safari: Share → *Add to Home Screen*; Chrome: ⋮ → *Install app*).

Names, categories and colours are stored in the sheet too, so every phone shows the same people.

**To remove someone's access** (e.g. a lost phone): open the script, change the `SECRET` text, save, redeploy
(see *Updating the script* below), then connect the phones that should keep access again.

---

## C. Updating the script
When a new version of the app needs a newer script (for example to share names and categories between phones):

1. Open the sheet → **Extensions → Apps Script**.
2. Copy your current `SECRET` line (and `SHEET_ID` if you made a standalone script).
3. Replace all the code with the current one: **⚙ Settings → Copy script** in the app (use the same secret:
   paste your secret into the Secret box *before* tapping Copy), or copy it from
   [`Code.gs`](./Code.gs).
4. Make sure the `SECRET` (and `SHEET_ID`) lines have your values. **Save 💾**.
5. **Deploy → Manage deployments → ✏️ (pencil) → Version: New version → Deploy.**
   The URL stays the same, so the phones keep working.

If a phone says **"older version"** under Shared Google Sheet, the script has not been updated yet.
The app still works; only names and categories are not shared.

---

## D. Already have a sheet with data?
You can use an existing spreadsheet instead of a blank one. It needs a tab called **`DB_Transactions`** with columns
`Date | Month | Description | Category | Amount | Payer | Type | ID | Status`
(`Active` = still to pay, `Hidden`/`Inactive` = paid; `Type` is `Expense` or `Income`).
Create the script from inside that sheet (Extensions → Apps Script) as in part A.
If the script is **not** created from inside the sheet, also fill in `SHEET_ID`
(the long part of the sheet's address between `/d/` and `/edit` — the whole thing, no `…`)
**in the Apps Script editor only, never in the GitHub file.**

The script only reads and writes columns A–I of `DB_Transactions` and its own `App_Settings` tab. Other tabs are never touched.

---

## Troubleshooting

| Message | What to do |
|---|---|
| **Wrong secret key** | The secret in the script and in the app differ. Paste the same one in both. If you changed the script, deploy a **new version** (part C, step 5). |
| **Could not reach the Google Sheet script** | The URL must end with `/exec`, and **Who has access** must be **Anyone**. |
| **Illegal spreadsheet id** | `SHEET_ID` is incomplete. Use the whole ID, or leave the placeholder when the script was created from inside the sheet. |
| **No spreadsheet: create this script from inside the sheet** | The script is standalone: either create it from the sheet (Extensions → Apps Script) or fill in `SHEET_ID`. |
| **Authorization / "unverified app"** | Normal for your own script: Advanced → Go to … → Allow. |
| Names don't show on the other phone | Update the script (part C). |
