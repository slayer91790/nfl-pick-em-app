# 🏈 Pick 'Em Pro

A private NFL pick 'em league app for friends. React + Vite frontend, Firebase (Google
sign-in + Firestore), live scores/odds/news from ESPN's public API.

## How it works

- **Members** sign in with Google. Only emails on the allowlist (managed by admins in-app)
  get in. Each week they pick a winner for every game plus an MNF total-score tiebreaker.
- **Pick locking**: each game locks at its kickoff; a submission is final once saved.
  Everyone's pick for a game is revealed automatically once that game kicks off.
- **Winner**: highest correct count when all games are final (MNF tiebreaker breaks ties),
  or earlier if mathematically clinched. Admins can also finalize a winner manually.
- **Admins** manage the guest list, enter picks on behalf of players, track weekly
  payments, and reveal all picks manually if needed.

## Security model (important!)

All real access control lives in **`firestore.rules`** — the client-side checks are
convenience only. The rules enforce:

- Only signed-in, allowlisted members can read league data.
- Players can write **only their own** picks doc and can never touch `paid_week*` flags.
- League config and payment flags are admin-only (admin emails are hardcoded in the rules —
  keep them in sync with `ADMIN_EMAILS` in `src/App.jsx`).
- Phone numbers live in `config/private`, readable by admins only.

**Deploy the rules** (one-time setup, and after any rules change):

```
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

Until the rules are deployed, the database is only as protected as whatever rules are
currently active in the Firebase console — check them.

## Season rollover checklist (e.g. 2025 → 2026)

1. In `src/App.jsx`, change `const SEASON = 2025` to the new year. That switches the
   Firestore collection to `picks_2026`, keeps 2025 history archived, and the current
   week auto-detects from ESPN.
2. Optionally move last season's declared winners from `config/settings.winners` into
   the archive constants if you want them shown historically.
3. Done — the allowlist, nicknames, and phones carry over automatically.

## Development

```
npm install
npm run dev
```

**Design preview**: open `http://localhost:5173/?preview` while the dev server is running
to see every view (including admin) with mock players and real ESPN game data — no login
or Firebase needed. Preview mode is stripped from production builds.

## Data layout (Firestore)

| Path | Contents | Writable by |
|---|---|---|
| `config/settings` | `allowedEmails`, `nicknames`, `winners`, `picksVisible` | admins |
| `config/private` | `phones` (keyed by email with `.` → `_`) | admins |
| `picks_<season>/<uid>` | `week<N>` picks map, `tiebreaker_week<N>`, `week<N>_submittedAt`, `paid_week<N>` | owner (except paid flags), admins |
