# Money Log

Personal income and expense log with three independent accounts and transfers between them, built as a Progressive Web App for iPhone. Every entry is added manually. Offline, no account, no tracking. Data stays on your device.

## Features

- **Summary tab** (the app opens on it): total balance across all accounts, each account's balance, and total spent this month with income and net. "Month" follows the start day set in Settings. Transfers between accounts are not counted as spending or income.
- **Three accounts** (default names "Account 1", "Account 2" and "Cash", all renamable). Swipe left/right to switch, or tap the account names at the top of any screen.
- Each account has its own entries, balance, opening balance, budgets, categories and payment methods
- **Transfers between accounts**: on the Add screen choose Transfer, pick From and To, enter the amount. Both balances update. Transfers are shown in History (with their own filter) but are **not counted** as income or expenses in totals, budgets or stats.
- Log income and expenses: amount (EUR), category, payment method, optional note, date and time (backdating allowed)
- History by month, filter by All / Expenses / Income / Transfers, edit or delete any entry or transfer
- Stats: income, expenses and net per month, category breakdown, daily expenses chart, 6-month trend
- Monthly budgets per expense category, with near-budget (80%) and over-budget warnings
- Custom month start day (1-28), e.g. payday to payday (shared by all accounts)
- Dark and light theme
- Export CSV (all accounts and transfers, with `account` and `transfer_to` columns), export and import JSON backup

## Install on iPhone

1. Host the files over HTTPS (GitHub Pages: Settings > Pages > Deploy from branch > `main` / root).
2. Open `https://<username>.github.io/<repo>/` in **Safari**.
3. Tap Share > **Add to Home Screen**.

## Upgrading from an older version

Replace the files in the same repo and reopen the app. Existing data is migrated automatically:

- From the two-account version: both accounts keep their entries and settings; Cash is added empty.
- From the original single-account version: everything goes into Account 1.

The previous stored data is left untouched as a safety copy. Export a backup before upgrading anyway. Older JSON backups can still be imported.

## Data and privacy

- Entries are stored in the browser's `localStorage` on your device (key `mny.v3`). Nothing is sent anywhere.
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

- Single currency (EUR).
- No PIN or Face ID lock. Anyone with access to your unlocked phone can open the app.
- No sync between devices; use backup and import.
- Fixed number of accounts (three).
