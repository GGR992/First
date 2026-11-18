# Connect the app to your Google Sheet (one-time, ~10 minutes)

When you finish, the app reads and writes the **DB_Transactions** tab of your shared spreadsheet,
and both phones see the same data. Do this **once, on a computer**, signed in to the Google account
that **owns** the spreadsheet.

How it stays private: a small script runs in *your* Google account. It is the only thing that can
touch the sheet, and it answers only requests that carry your secret key. Only you two
have the link and the key.

---

## Step 0 – Make a backup of the spreadsheet (recommended)

Open the spreadsheet → **File → Make a copy** → name it e.g. `NewBudget_sys BACKUP`.

## Step 1 – Get two things ready

1. **The spreadsheet ID.** In the spreadsheet's address bar, the URL looks like
   `https://docs.google.com/spreadsheets/d/`**`11aBNk…d-0Q`**`/edit…`
   Copy the long part between `/d/` and `/edit`.
2. **A secret key.** Open the app → **⚙ Settings → Shared Google Sheet → Generate**.
   It fills in a random secret **and copies it**. Paste it into a note for a moment.
   Keep the app open on that screen.

## Step 2 – Create the script

1. Go to **https://script.google.com** → click **New project** (top left).
2. Click **Untitled project** at the top and rename it to `Budget API`.
3. In the editor, select everything in `Code.gs` and delete it.
4. Open [`Code.gs` from this repo](./Code.gs), click the **Copy raw file** button (two squares icon,
   top right of the code), and paste it into the editor.
5. Near the top, fill in your two values between the quotes:
   ```js
   const SHEET_ID = '11aBNk…d-0Q';           // from Step 1.1
   const SECRET = 'the-secret-from-the-app'; // from Step 1.2
   ```
6. Click the **💾 Save** icon (or Ctrl+S).

## Step 3 – Publish it as a web app

1. Click the blue **Deploy** button (top right) → **New deployment**.
2. Click the **⚙ gear** next to "Select type" → choose **Web app**.
3. Fill in:
   - **Description:** `v1`
   - **Execute as:** **Me (your email)**
   - **Who has access:** **Anyone**. This is required so the app can reach it; the secret key keeps everyone else out.
4. Click **Deploy**.
5. Click **Authorize access** → choose your Google account.
   - You'll see **"Google hasn't verified this app"**. This is normal for your own scripts.
     Click **Advanced** → **Go to Budget API (unsafe)** → **Allow**.
6. Copy the **Web app URL** (it ends with `/exec`) → **Done**.

## Step 4 – Connect the app

1. In the app: **⚙ Settings → Shared Google Sheet**.
2. Paste the **Web app URL**. The secret is already filled in from Step 1.2. If not, paste it.
3. Tap **Connect**. You should see "Connected · N transactions loaded" and a green **✓ Synced** at the top.

## Step 5 – Connect your wife's phone

1. On the connected device: **⚙ Settings → Invite the other phone**.
2. Send the link to her **in a private chat** (it contains the secret).
3. She opens it on her phone, taps **OK**, and she's connected.
   She can then add it to her home screen (Safari: Share → Add to Home Screen).

---

## How it works day to day

* Every add / edit / mark-paid / payer swap / delete is saved on the phone immediately and sent to the sheet
  within a second or two. The pill at the top shows **↑ Saving… → ✓ Synced**.
* Changes from the other phone (or typed directly in the sheet) appear when you open the app,
  when you tap the **✓ Synced** pill, and every 2 minutes while the app is open.
* No internet? Changes are kept on the phone (**⚠ … waiting**) and sent automatically later.
* Rows are written in the sheet's own format: `Active` = still to pay, `Hidden` = paid,
  so your HOME tab keeps working. Only columns A–I of DB_Transactions are touched.

## Troubleshooting

| Message in the app | Fix |
|---|---|
| **Wrong secret key** | The `SECRET` in the script and in the app differ. Fix one, then (if you changed the script) redeploy – see below. |
| **Could not reach the Google Sheet script** | Check the URL ends with `/exec` and that **Who has access** is **Anyone**. |
| **Tab "DB_Transactions" not found** | The tab was renamed; change `const TAB = …` in the script and redeploy. |

**Changing the script later** (new version from this repo, or new secret):
**Deploy → Manage deployments → ✏️ (pencil) → Version: New version → Deploy**.
The URL stays the same, so the phones keep working.

**Revoking access** (e.g. a lost phone): change `SECRET` in the script, redeploy as above,
then reconnect your phones with the new secret.
