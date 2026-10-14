# Pick 'Em Pro — project guide for Claude

Private NFL pick 'em league site for a group of friends. Owner: slayer91790 (founder
admin). Read this first; `README.md` has the player-facing rules and setup steps.

## Deploys — pushing to `main` IS shipping

- Hosted on **Netlify** at https://pickempro.netlify.app, wired to this GitHub repo.
  Every push/merge to `main` rebuilds and publishes the live site automatically.
- Feature work goes on a branch → PR → merge to `main`. Nothing reaches the site until
  it's on `main`. Tell the owner plainly whether a change is live or only on a branch.
- **`firestore.rules` is NOT deployed by Netlify.** Rule changes need
  `firebase deploy --only firestore:rules` run by the owner (project `nfl-pick-em-2025`).
  Say so whenever you change that file.
- Netlify env var `ANTHROPIC_API_KEY` powers The Booth (see below).

## Stack & files

React 19 + Vite 7 SPA, Firebase (Google sign-in + Firestore), ESPN's public API for
games/scores/odds/news, two Netlify Functions. No test suite — verify with
`npm run lint` and `npm run build` (run `npm ci` first in a fresh checkout).

| File | What's in it |
|---|---|
| `src/App.jsx` (~2,150 lines) | Essentially the whole app: state, data loading, scoring, all views, admin actions. Numbered `// --- N.` comments mark the effects; `// --- HELPERS ---`, `// --- ACTIONS ---`, `// --- ADMIN ACTIONS ---`, `// --- RENDER HELPERS ---` mark sections. |
| `src/recap.js` | Pure functions (no React/Firebase): broadcast-slot labels (TNF/Sun AM/…), the "How to Win" week breakdown (enumerates every remaining outcome, ≤12 open games), tiebreaker range text. |
| `src/firebase.js` | Firebase config (public by design) + Google sign-in (popup on desktop, redirect on mobile). `authDomain` is the Netlify domain. |
| `public/_redirects` | Proxies `/__/auth/*` to Firebase so sign-in is same-origin (fixes mobile login). |
| `firestore.rules` | The real security. Members-only reads, players write only their own doc, payment flags admin-only, Survivor picks lock at kickoff server-side. |
| `netlify/functions/booth.mts` | `POST /api/booth` — returns the cached roast or kicks off the writer. |
| `netlify/functions/booth-background.mts` | Background function that calls Claude to write the roast and saves it to Netlify Blobs. |
| `netlify/lib/booth.mts` | Shared Booth code: system prompt, membership check (via Firestore REST with the user's token), cache keys, `MAX_PER_WEEK = 40` cap. |
| `public/*.mp3`, `introclip.mp4` | Sound effects and the season intro video. |

## Season config (top of `src/App.jsx`)

`SEASON = 2026` (drives the `picks_2026` collection and ESPN `dates=` param),
`ENTRY_FEE = 10`, `DOUBLE_FEE_WEEK = 12` (Thanksgiving, $20), `SURVIVOR_FEE = 20`,
`SEASON_POT_FEE = 20`, `SEASON_KICKOFF`, `ADMIN_EMAILS` (founders — keep in sync with
`firestore.rules`). `LEGACY_WEEKLY_WINNERS` / `OLD_WEEKS` are a frozen 2025 archive and
only apply when `SEASON === 2025`. Season rollover checklist is in `README.md`.

## Data (Firestore)

- `config/settings` — `allowedEmails`, `adminEmails` (extra in-app admins), `nicknames`,
  `picksVisible`, `winners.<week>` (declared weekly winner name),
  `powerScores.<week>.<uid>`, `weekScores.<week>.<uid>` (snapshots written on finalize).
- `config/private` — `phones` (admins only).
- `picks_<season>/<uid>` — `week<N>` (map gameId → team abbr), `tiebreaker_week<N>`,
  `week<N>_submittedAt`, `paid_week<N>`, `prepaid_weekly`, `season_paid`,
  `survivor_optIn`, `survivor_week<N>` + `survivor_week<N>_lockAt`, `survivor_paid`.
  Docs with `userId` starting `guest_` are admin-created roster placeholders; they're
  hidden once that person signs in with a real account (and can be merged).

Game ids are ESPN event ids; picks are team abbreviations (`"KC"`).

## How the game works (and where in code)

- **Current week** is auto-detected from ESPN's scoreboard on load; the week selector
  changes `currentWeek`. Games for that week poll ESPN every 60s.
- A game's `winner` is the competitor ESPN flags `winner: true`. **A tie is final
  (`status.type.state === 'post'`) with no winner** — always test "is it over?" with the
  state, never with `!g.winner`. (Week 5 of 2026, NYG 27–WSH 27, broke the weekly
  winner exactly this way.)
- **Picks** lock per game at kickoff; everyone's pick for a game is revealed at kickoff
  (or all at once if an admin flips `picksVisible`).
- **Weekly winner** — `getDeclaredWinner()`: admin-finalized name wins outright;
  otherwise most correct picks once all games are final, with the **MNF tiebreaker**
  (closest guess to the combined score of the week's last-kicking-off game, over/under
  doesn't matter, equal distance stays a tie); or earlier if mathematically clinched.
- **Finalizing** (Admin → Weekly → finalize, `finalizeWeekWinner()`) writes
  `winners.<week>`, `powerScores.<week>`, `weekScores.<week>`. Only finalized weeks
  appear in the Winners page list, and season totals/Power Standings depend on these
  snapshots — so an un-finalized week is missing from season standings.
- **👑 Season Championship** — opt-in (`season_paid`); most correct picks all season:
  finalized `weekScores` + the live current week.
- **⚡ Power Points** (2026 trial, bragging rights) — favorite win 1, underdog 2, 7+ pt
  underdog 3. Uses `pregameLine` because ESPN drops the line after a game ends.
- **🛡️ Survivor** — one team per week, each team once per season; a loss or missed
  week eliminates; a tie survives. Picks lock at the team's kickoff (enforced in rules).
- **🆙 XP** — 100 per correct pick across the season, a level per 500 XP.
- **🎲 Win odds** — 2,000 seeded Monte Carlo sims of open games using the spread
  (normal model, σ 13.5) blended with live score/clock.
- **🎙️ The Booth** — after each final, the client sends anonymised week "facts" to
  `/api/booth`; Claude writes a 3–6 line R-rated roast, cached in Netlify Blobs per
  unique facts hash so every viewer shares one roast.

## Views

Tabs: 🚀 Kickoff (pre-season only), Dashboard (scores/news), Make Picks, All Picks
(matrix + odds + How to Win/Booth card), 🛡️ Survivor, Winners (weekly list, Season
Championship, Power Standings, XP), 👑 Admin (overview, weekly payments/finalize,
survivor, players/allowlist/nicknames/phones/admins, picks on behalf of players,
backup/restore). Dev-only mock mode: `npm run dev` then `http://localhost:5173/?preview`.
`?intro` replays the intro on any URL.

## Working conventions

- Keep the existing style: dense one-line helpers, emoji section markers, short "why"
  comments. Don't split `App.jsx` up unless asked.
- Commit messages are short, plain-English, user-facing titles (see `git log`).
- Can't reach ESPN or Firestore from the cloud sandbox; verify game facts via web
  search if needed, and say when something couldn't be checked against live data.
