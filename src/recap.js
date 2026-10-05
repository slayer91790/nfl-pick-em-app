// 📣 WEEK BREAKDOWN
// Exact "who can still win, and what has to happen", recomputed each time a game
// goes final. Every remaining outcome is enumerated (2^n for n open games), so the
// paths it names are real — not guesses. Plain functions, no React/Firebase, so a
// server job can reuse them later.

// Broadcast windows, judged on the NFL's own clock (Eastern) so a 1pm ET kickoff
// reads "Sun AM" for everyone, wherever they're watching from.
export const SLOTS = {
  tnf: { key: 'tnf', label: 'TNF' },
  am:  { key: 'am',  label: 'Sun AM' },
  pm:  { key: 'pm',  label: 'Sun PM' },
  snf: { key: 'snf', label: 'SNF' },
  mnf: { key: 'mnf', label: 'MNF' },
};

const ET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hourCycle: 'h23' });

export const getGameSlot = (game) => {
  if (!game?.date) return null;
  const parts = ET.formatToParts(new Date(game.date));
  const wd = parts.find(p => p.type === 'weekday')?.value;
  const hr = Number(parts.find(p => p.type === 'hour')?.value);
  if (wd === 'Sun') return hr >= 20 ? SLOTS.snf : hr >= 16 ? SLOTS.pm : SLOTS.am;
  if (wd === 'Mon') return SLOTS.mnf;
  if (wd === 'Thu' && hr >= 19) return SLOTS.tnf;
  // Thanksgiving afternoons, Black Friday, late-season Saturdays, a Wednesday opener
  return { key: 'other', label: hr >= 19 ? `${wd} Night` : wd };
};

// 4k scenarios, ~20ms. Past this it gets slow on phones, and paths through 13+ games
// aren't readable anyway — the breakdown shows up a few early games into Sunday.
const MAX_OPEN = 12;

const teamsOf = (g) => {
  const comp = g.competitions?.[0]?.competitors || [];
  return {
    away: comp.find(c => c.homeAway === 'away')?.team.abbreviation,
    home: comp.find(c => c.homeAway === 'home')?.team.abbreviation,
  };
};

const listJoin = (xs) => xs.length <= 1 ? (xs[0] || '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

// 🎯 TIEBREAKER — closest guess to the last MNF game's combined score wins, over or
// under doesn't matter (31 beats 42 on a 35 total: 4 off vs 7 off). Equal distance
// stays a tie. Returns which totals each guess takes, lowest first:
// [{ names, tb, lo, hi }] (hi null = and up) plus any dead-heat totals.
// entries: [{ name, tb }] — tb as typed; blanks can't win a tiebreak.
export const tiebreakRanges = (entries) => {
  const byTb = new Map();
  const missing = [];
  entries.forEach(e => {
    const tb = parseInt(e.tb, 10);
    if (isNaN(tb)) missing.push(e.name);
    else byTb.set(tb, [...(byTb.get(tb) || []), e.name]);
  });
  const vals = [...byTb.keys()].sort((a, b) => a - b);
  const ranges = vals.map((tb, i) => ({
    names: byTb.get(tb),
    tb,
    lo: i === 0 ? 0 : Math.floor((vals[i - 1] + tb) / 2) + 1,
    hi: i === vals.length - 1 ? null : Math.ceil((tb + vals[i + 1]) / 2) - 1,
  }));
  // Guesses an even distance apart leave one total smack in the middle: still tied.
  const deadHeats = vals.slice(1)
    .map((tb, i) => ({ total: (vals[i] + tb) / 2, names: [...byTb.get(vals[i]), ...byTb.get(tb)] }))
    .filter(d => Number.isInteger(d.total));
  return { ranges, deadHeats, missing };
};

export const rangeLabel = ({ lo, hi }) => hi === null ? `${lo} or more` : lo === 0 ? `${hi} or less` : lo === hi ? `exactly ${lo}` : `${lo}–${hi}`;

// "Ana (31) wins on a total of 36 or less, Bob (42) on 37 or more; exactly 37 stays tied."
export const tiebreakText = ({ ranges, deadHeats, missing }) => {
  if (!ranges.length) return 'Nobody entered a tiebreaker — it stays a tie.';
  const who = (r) => `${listJoin(r.names)} (${r.tb})`;
  const parts = ranges.length === 1
    ? [`${who(ranges[0])} ${ranges[0].names.length > 1 ? 'share the same number — still tied whatever the total' : 'is the only one with a tiebreaker in — wins it'}`]
    : ranges.map((r, i) => `${who(r)} ${i === 0 ? 'wins on a total of ' : 'on '}${rangeLabel(r)}${r.names.length > 1 ? ' (still tied with each other)' : ''}`);
  let text = `${parts.join(', ')}.`;
  if (deadHeats.length) text += ` A total of exactly ${listJoin(deadHeats.map(d => String(d.total))).replace(/ and (?=\d+$)/, ' or ')} lands dead even — still tied.`;
  if (missing.length) text += ` ${listJoin(missing)} never entered one, so can't win a tiebreak.`;
  return text;
};

// players: [{ userId, name, picks: { [gameId]: abbr }, tb? }]
// pregameProb(game, abbr): chance abbr wins, from the line alone
// Final games are settled; the rest — games in progress included — are priced off
// their pre-game line, so the breakdown only changes when a game goes final.
export const analyzeWeek = ({ games, players, pregameProb }) => {
  const decided = games.filter(g => g.status?.type?.state === 'post');
  if (!decided.length || !players.length) return null; // nothing to break down yet
  const open = games.filter(g => g.status?.type?.state !== 'post')
    .sort((a, b) => new Date(a.date) - new Date(b.date)); // ESPN's order isn't chronological
  const n = open.length;

  const base = players.map(p => decided.filter(g => g.winner && p.picks[g.id] === g.winner).length);
  const topBase = Math.max(...base);
  const openInfo = open.map(g => ({ id: g.id, ...teamsOf(g), slot: getGameSlot(g) }));
  openInfo.forEach((o, j) => { o.pAway = o.away ? pregameProb(open[j], o.away) : 0.5; });

  const headline = n === 0
    ? 'Every game is final.'
    : `${n} game${n === 1 ? '' : 's'} left (${listJoin([...new Set(openInfo.map(o => o.slot?.label).filter(Boolean))])}).`;
  if (n > MAX_OPEN) return { headline, lines: [], out: [], ties: [], pending: n - MAX_OPEN };

  // Enumerate every way the open games can go. Bit j set = away team wins game j.
  const scen = [];
  const pWin = new Array(players.length).fill(0);
  for (let mask = 0; mask < (1 << n); mask++) {
    let prob = 1;
    const totals = base.slice();
    for (let j = 0; j < n; j++) {
      const o = openInfo[j];
      const awayWins = (mask >> j) & 1;
      prob *= awayWins ? o.pAway : 1 - o.pAway;
      const winner = awayWins ? o.away : o.home;
      for (let i = 0; i < players.length; i++) if (players[i].picks[o.id] === winner) totals[i]++;
    }
    const max = Math.max(...totals);
    const top = [];
    for (let i = 0; i < totals.length; i++) if (totals[i] === max) top.push(i);
    top.forEach(i => { pWin[i] += prob / top.length; }); // ties split, same as the Win % column
    scen.push({ mask, prob, top });
  }

  const alive = players.map((_, i) => scen.some(s => s.top.includes(i)));
  // Only games the survivors disagree on can move the standings between them.
  const relevant = openInfo.map((o, j) => j).filter(j => {
    const picked = new Set(players.filter((_, i) => alive[i]).map(p => p.picks[openInfo[j].id] || '—'));
    return picked.size > 1;
  });
  const outcome = (j, bit) => {
    const o = openInfo[j];
    return bit ? `${o.away} over ${o.home}` : `${o.home} over ${o.away}`;
  };
  const describe = (mask, js) => js.map(j => outcome(j, (mask >> j) & 1));
  const matchup = (j) => `${openInfo[j].away}@${openInfo[j].home}`;
  const pickOf = (i, j) => players[i].picks[openInfo[j].id];
  const hits = (i, j, s) => pickOf(i, j) === (((s.mask >> j) & 1) ? openInfo[j].away : openInfo[j].home);
  const pctText = (x) => x > 0.995 ? '99%' : x < 0.005 ? '<1%' : `${Math.round(x * 100)}%`;
  const soleWin = (s, i) => s.top.length === 1 && s.top[0] === i;

  // 🎯 Every way the week can end tied at the top — who ties, what has to happen, and
  // which MNF totals break it for whom. Likeliest first.
  const tieGroups = new Map();
  scen.filter(s => s.top.length > 1).forEach(s => {
    const key = s.top.join(',');
    const g = tieGroups.get(key) || { key, top: s.top, prob: 0, list: [] };
    g.prob += s.prob;
    g.list.push(s);
    tieGroups.set(key, g);
  });
  const ties = [...tieGroups.values()].sort((a, b) => b.prob - a.prob).slice(0, 4).map(g => {
    const bit = (j) => (g.list[0].mask >> j) & 1;
    const fixed = relevant.filter(j => g.list.every(s => ((s.mask >> j) & 1) === bit(j)));
    // Do those results alone guarantee this tie, or do other games also have to fall right?
    const sure = scen.filter(s => fixed.every(j => ((s.mask >> j) & 1) === bit(j))).every(s => s.top.join(',') === g.key);
    const when = n === 0 ? 'As it stands'
      : !fixed.length && sure ? 'Whatever happens'
      : fixed.length && fixed.length <= 3 ? `${sure ? 'If' : 'Possible if'} ${listJoin(describe(g.list[0].mask, fixed))}`
      : null;
    const tb = tiebreakRanges(g.top.map(i => ({ name: players[i].name, tb: players[i].tb })));
    return { names: g.top.map(i => players[i].name), pct: g.prob, when, ...tb, text: tiebreakText(tb) };
  });

  const lines = players.map((p, i) => {
    if (!alive[i]) return null;
    const behind = topBase - base[i];
    const tiedAtTop = base.filter(b => b === topBase).length > 1;
    const standing = behind > 0 ? `${behind} back at ${base[i]}` : tiedAtTop ? `tied for the lead at ${base[i]}` : `leads with ${base[i]}`;

    const wins = scen.filter(s => s.top.includes(i));
    const outright = wins.filter(s => s.top.length === 1);
    const parts = [];
    if (n === 0) {
      parts.push(outright.length ? 'Wins the week.' : 'Tied at the top — the MNF tiebreaker decides it.');
    } else if (outright.length === scen.length) {
      parts.push('Has it locked up.');
    } else if (!relevant.length) {
      // Everyone still alive has the same picks left, so the standings are frozen.
      const others = players.filter((_, k) => k !== i && alive[k]).map(q => q.name);
      parts.push(`Locked in a tie with ${listJoin(others)} — same picks the rest of the way, so the MNF tiebreaker decides it.`);
    } else {
      // Outcomes present in every scenario where this player finishes on top.
      const must = relevant.filter(j => {
        const bit = (wins[0].mask >> j) & 1;
        return wins.every(s => ((s.mask >> j) & 1) === bit);
      });
      const withMust = scen.filter(s => must.every(j => ((s.mask >> j) & 1) === ((wins[0].mask >> j) & 1)));
      const mustList = describe(wins[0].mask, must);
      // Win every remaining pick that matters and still finish alone on top?
      const mine = relevant.filter(j => pickOf(i, j));
      const hitAll = scen.filter(s => mine.every(j => hits(i, j, s)));
      const controls = mine.length > 0 && hitAll.length > 0 && hitAll.every(s => soleWin(s, i));

      const tieOnly = !outright.length;
      const best = wins.reduce((a, b) => (b.prob > a.prob ? b : a));
      const extra = describe(best.mask, relevant.filter(j => !must.includes(j)));
      const controlsText = mine.length <= 3
        ? `Controls their own destiny: wins outright if ${listJoin(mine.map(j => pickOf(i, j)))} ${mine.length === 1 ? 'wins' : mine.length === 2 ? 'both win' : 'all win'}.`
        : `Controls their own destiny: wins outright if all ${mine.length} picks that matter hit.`;

      if (must.length && withMust.every(s => soleWin(s, i))) {
        parts.push(`Wins outright if ${listJoin(mustList)}.`);
      } else if (must.length && withMust.every(s => s.top.includes(i))) {
        parts.push(tieOnly
          ? `Forces a tie for the top if ${listJoin(mustList)} — then it's down to the MNF tiebreaker.`
          : `Finishes on top if ${listJoin(mustList)} — outright or into the tiebreaker.`);
      } else if (must.length && behind > 0) {
        // Chasers: the must-wins are the headline — usually where they split with the leader.
        parts.push(`Needs ${listJoin(mustList)}.`);
        if (controls) parts.push("Hit every other pick too and it's an outright win.");
        else if (extra.length) parts.push(`Then needs help — likeliest path adds ${listJoin(extra)}.`);
      } else {
        parts.push(controls ? controlsText
          : extra.length > 4 ? `Needs to win most of the ${extra.length} games where the contenders split.`
          : extra.length ? `Likeliest path: ${listJoin(extra)}.`
          : 'Needs the other results to break right.');
        if (must.length) parts.push(`Can't survive without ${listJoin(mustList)}.`);
      }
      if (tieOnly && !parts.some(t => t.includes('tiebreaker'))) parts.push('Best case is a tie, settled by the MNF tiebreaker.');

      // Front-runners: name the closest threat and exactly where the two split.
      // A rival with the same remaining picks can only ever tie, so the real threat
      // is the likeliest winner who actually differs somewhere.
      if (behind === 0) {
        const others = players.map((_, k) => k).filter(k => k !== i && alive[k]).sort((a, b) => pWin[b] - pWin[a]);
        const splitWith = (k) => relevant.filter(j => pickOf(i, j) !== pickOf(k, j));
        const twins = others.filter(k => !splitWith(k).length);
        const rival = others.find(k => splitWith(k).length);
        if (rival !== undefined) {
          const split = splitWith(rival);
          parts.push(split.length <= 3
            ? `Biggest threat: ${players[rival].name} (${pctText(pWin[rival])}) — they split on ${listJoin(split.map(matchup))}.`
            : `Biggest threat: ${players[rival].name} (${pctText(pWin[rival])}) — they split on ${split.length} games.`);
        }
        if (twins.length) parts.push(`Same picks as ${listJoin(twins.map(k => players[k].name))} the rest of the way.`);
      }
    }
    const Standing = `${standing[0].toUpperCase()}${standing.slice(1)}.`;
    // standing is safe to show any time; text names results in unplayed games, which
    // gives away picks until they're revealed.
    return { userId: p.userId, name: p.name, pct: pWin[i], standing: Standing, text: `${Standing} ${parts.join(' ')}` };
  }).filter(Boolean).sort((a, b) => b.pct - a.pct);

  const out = players.filter((_, i) => !alive[i]).map(p => p.name);
  return { headline, lines, out, ties };
};
