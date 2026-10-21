# Money Log

Personal income and expense log with two independent accounts, built as a Progressive Web App for iPhone. Every entry is added manually. Offline, no account, no tracking. Data stays on your device.

## Features

- **Two accounts** (default names "Account 1" and "Account 2", renamable). Swipe left/right to switch, tap the account names at the top, or use the **Add** and **Add 2** tabs.
- Each account has its own entries, balance, opening balance, budgets, categories and payment methods
- Log income and expenses: amount (EUR), category, payment method, optional note, date and time (backdating allowed)
- History by month, filter by All / Expenses / Income, edit or delete any entry
- Stats: income, expenses and net per month, category breakdown, daily expenses chart, 6-month trend
- Monthly budgets per expense category, with near-budget (80%) and over-budget warnings
- Custom month start day (1-28), e.g. payday to payday (shared by both accounts)
- Dark and light theme
- Export CSV (both accounts, with an `account` column), export and import JSON backup

## Install on iPhone

1. Host the files over HTTPS (GitHub Pages: Settings > Pages > Deploy from branch > `main` / root).
2. Open `https://<username>.github.io/<repo>/` in **Safari**.
3. Tap Share > **Add to Home Screen**.

## Upgrading from the single-account version

Replace the files in the same repo and reopen the app. Your existing entries, opening balance, budgets, categories and payment methods move into **Account 1** automatically. Account 2 starts empty. The old data is left untouched in storage as a safety copy. Export a backup before upgrading anyway.

Old single-account JSON backups can still be imported; they go into Account 1.

## Data and privacy

- Entries are stored in the browser's `localStorage` on your device (key `mny.v2`). Nothing is sent anywhere.
- Clearing Safari website data deletes your entries. Use **Settings > Export backup (JSON)** regularly.
- Move to a new phone: export a backup on the old one, import it on the new one.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell |
| `app.js` | All logic and views |
| `styles.css` | Styling, dark and light themes |
| `sw.js` | Service worker (offline support) |
| `manifest.webmanifest` | Home Screen install metadata |
| `icon-*.png` | App icons |

## Updating

Replace the files in the repo and reopen the app. The service worker tries the network first, so changes should appear after one or two opens.

## Limitations

- Single currency (EUR), no transfers between the two accounts (log one expense and one income manually).
- No PIN or Face ID lock. Anyone with access to your unlocked phone can open the app.
- No sync between devices; use backup and import.
