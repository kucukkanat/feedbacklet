# Feedbacklet — Plan

Bookmarklet that lets anyone send feedback / bug reports about any web app, end-to-end
encrypted to a single admin over Nostr. Static site on GitHub Pages hosts the widget,
the bookmarklet generator and the admin inbox.

## Decisions (from interview)
| Topic | Decision |
|---|---|
| Stack | Vite + vanilla TypeScript, `nostr-tools`, `html2canvas-pro` |
| Delivery | Tiny `javascript:` loader with embedded config → loads `feedbacklet.js` from GH Pages |
| Screenshot | DOM render (html2canvas-pro), visible viewport, downscaled JPEG |
| Large payloads | gzip + base64, split into ≤16 KB chunks, each chunk its own gift wrap |
| Admin keys | Create (12-word NIP-06 mnemonic, shows words + nsec); sign in with nsec only; key kept in sessionStorage |
| Manage | Status + tags, filters/search, multi-project, JSON/CSV export, cross-device sync (NIP-78, self-encrypted) |
| Recipients | Single admin pubkey |
| Bug data | Basics, console logs & errors (from load time on), storage key names (values opt-in), selection + element picker |
| Relays | Configurable; defaults damus / nos.lol / primal |
| Replies | One-way, anonymous |
| Style | Clean minimal light |

## Protocol
1. Reporter builds a JSON payload → gzip → base64.
2. Fresh throw-away key `S` per report. Payload split into chunks; each chunk is a rumor
   (`kind 1991`, tags `r=<reportId>`, `chunk=<i>,<n>`, `project=<id>`), sealed (kind 13) by `S`
   and gift wrapped (kind 1059) by a random key, `p`-tagged to the admin (NIP-59, NIP-44).
3. Relays only see random-key kind-1059 events with jittered timestamps addressed to the admin.
4. Admin fetches `{kinds:[1059], #p:[admin]}`, unwraps, verifies all chunks share the same
   seal pubkey, reassembles, decompresses, stores in IndexedDB.
5. Admin state (status/tags/deleted/projects/relays) → `kind 30078` `d=feedbacklet/state`,
   NIP-44 encrypted to self. Last-write-wins per report.

## Layout
- `src/shared` – protocol, config/bookmarklet builder
- `src/widget` – the injected widget (Shadow DOM modal, collectors, picker, screenshot, sender)
- `src/site` – landing + generator pages
- `src/admin` – admin inbox app
- `.github/workflows/pages.yml` – build & deploy

## Known limits
- Sites with strict CSP (`script-src`/`connect-src`) can block the loader or relay websockets.
- Console logs only captured after the bookmarklet first runs on the page.
- DOM screenshots are approximations (cross-origin images/iframes may be blank).
