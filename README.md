# ✦ Feedbacklet

A bookmarklet that lets anyone send **feedback** or **bug reports** about any web app,
**end-to-end encrypted** to a single admin over **Nostr** (NIP-59 gift wrap + NIP-44).

- **Widget** (`feedbacklet.js`): feedback or bug report, optional name, mood, screenshot,
  element picker, browser/device info, console logs & errors, storage names (values opt-in).
  Each data type can be switched off and previewed before sending.
- **Generator** (`generator.html`): configure admin npub, project, relays, accent; drag the
  bookmarklet, copy an embed snippet, or share a prefilled generator link with testers.
- **Admin inbox** (`admin.html`): create a key (12-word NIP-06 backup + nsec) or sign in with an nsec, decrypt
  reports locally, statuses, tags, projects, search, JSON/CSV export, encrypted cross-device
  sync of workflow state (NIP-78).

See [PLAN.md](PLAN.md) for the protocol and design decisions.

## Develop

```sh
npm install
npm run dev        # site + admin at http://localhost:5173 ("Test it on this page" works in dev)
npm run build      # dist/ incl. dist/feedbacklet.js
npm run typecheck
```

## Deploy

Push to `main`; `.github/workflows/pages.yml` builds and deploys `dist/` to GitHub Pages.
Enable it once under *Settings → Pages → Source: GitHub Actions*.

## Limits

- Sites with a strict Content-Security-Policy may block the script or relay WebSockets.
- Console output is only captured after the bookmarklet first runs on a page.
- Screenshots are DOM renders (html2canvas-pro); cross-origin images/iframes may be blank.
