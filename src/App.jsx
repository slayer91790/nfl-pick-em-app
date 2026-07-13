import React, { useState, useEffect, useRef, useMemo } from 'react';
import { signInWithGoogle, db, auth } from './firebase';
import { doc, setDoc, collection, updateDoc, deleteField, getDoc, arrayUnion, arrayRemove, writeBatch, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// --- SEASON CONFIGURATION ---
// 👉 To roll over to a new season, change SEASON below. Everything else
// (Firestore collection, week detection, archives) follows automatically.
const SEASON = 2026;
const PICKS_COLLECTION = `picks_${SEASON}`;
const ENTRY_FEE = 10;
const DOUBLE_FEE_WEEK = 12; // Thanksgiving "Double Gobble" week ($20) — Nov 26, 2026 is NFL Week 12; re-check each season!
const SURVIVOR_FEE = 20;    // 🛡️ Survivor Pool: optional, one-time entry for the whole season

// Admins — keep in sync with the list in firestore.rules
const ADMIN_EMAILS = ["slayer91790@gmail.com", "antoniodanielvazquez@gmail.com"];

// Design preview: dev-only mock mode so the UI can be viewed without logging in.
// Run `npm run dev` and open http://localhost:5173/?preview  (stripped from prod builds)
const PREVIEW = import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('preview');

// --- 2025 ARCHIVE (frozen history; ignored for other seasons) ---
const LEGACY_WEEKLY_WINNERS = SEASON === 2025 ? [
  { week: 3, winner: "Omar" }, { week: 4, winner: "Luis" }, { week: 5, winner: "Albert" },
  { week: 6, winner: "Roman" }, { week: 7, winner: "Albert" }, { week: 8, winner: "Albert" },
  { week: 9, winner: "Andy" }, { week: 10, winner: "Albert" }, { week: 11, winner: "Albert" },
  { week: 12, winner: "Albert Holguin" },
  { week: 13, winner: "Timothy Anguiano" }
] : [];

const OLD_WEEKS = SEASON === 2025 ? {
  3: { games: "BUF,MIN,PIT,PHI,TB,WSH,ATL,JAX,GB,IND,LAC,SEA,SF,CHI,KC,DET".split(",").map((w,i)=>({id:String(i), shortName:`G${i+1}`, winner:w})), picks: [] },
  10: { games: [{ id: '1', shortName: 'LV@DEN', winner: 'DEN', away: 'LV', home: 'DEN' },{ id: '2', shortName: 'ATL@IND', winner: 'IND', away: 'ATL', home: 'IND' },{ id: '3', shortName: 'BUF@MIA', winner: 'BUF', away: 'BUF', home: 'MIA' },{ id: '4', shortName: 'BAL@MIN', winner: 'BAL', away: 'BAL', home: 'MIN' },{ id: '5', shortName: 'CLE@NYJ', winner: 'CLE', away: 'CLE', home: 'NYJ' },{ id: '6', shortName: 'NE@TB', winner: 'NE', away: 'NE', home: 'TB' },{ id: '7', shortName: 'NO@CAR', winner: 'NO', away: 'NO', home: 'CAR' },{ id: '8', shortName: 'JAX@HOU', winner: 'JAX', away: 'JAX', home: 'HOU' },{ id: '9', shortName: 'NYG@CHI', winner: 'NYG', away: 'NYG', home: 'CHI' },{ id: '10', shortName: 'ARI@SEA', winner: 'ARI', away: 'ARI', home: 'SEA' },{ id: '11', shortName: 'LAR@SF', winner: 'LAR', away: 'LAR', home: 'SF' },{ id: '12', shortName: 'DET@WSH', winner: 'DET', away: 'DET', home: 'WSH' },{ id: '13', shortName: 'PIT@LAC', winner: 'PIT', away: 'PIT', home: 'LAC' },{ id: '14', shortName: 'PHI@GB', winner: 'PHI', away: 'PHI', home: 'GB' }], picks: [] }
} : {};

// 🔊 SOUNDS
const FUNNY_SOUND_FILES = ['/funny.mp3', '/ack.mp3', '/huh.mp3', '/fart.mp3'];

const isAdminEmail = (email) => !!email && ADMIN_EMAILS.some(e => e.toLowerCase() === email.toLowerCase());
const sanitizeEmail = (email) => email ? email.replace(/\./g, '_') : "";

const Avatar = ({ src, name, size = 38 }) => src
  ? <img src={src} alt="" referrerPolicy="no-referrer" className="avatar" style={{ width: size, height: size }} />
  : <div className="avatar-fallback" style={{ width: size, height: size }}>{(name || '?').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}</div>;

// 🎉 Hand-rolled confetti burst: 14 CSS particles fanned out via custom properties
const CONFETTI_COLORS = ['#00e589', '#ffc94d', '#4f8cff', '#ff5c6c', '#ffffff'];
const ConfettiBurst = () => (
  <span className="confetti-burst" aria-hidden="true">
    {Array.from({ length: 14 }, (_, i) => {
      const angle = (i / 14) * 2 * Math.PI;
      const dist = 42 + (i % 3) * 24;
      return <i key={i} style={{
        '--dx': `${Math.round(Math.cos(angle) * dist)}px`,
        '--dy': `${Math.round(Math.sin(angle) * dist - 34)}px`,
        background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        animationDelay: `${(i % 4) * 45}ms`
      }} />;
    })}
  </span>
);

function App() {
  const [user, setUser] = useState(null);
  const [allowed, setAllowed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [games, setGames] = useState([]);
  const [news, setNews] = useState([]);
  const [leaders, setLeaders] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [view, setView] = useState('dashboard');

  const [picks, setPicks] = useState({});
  const [tiebreaker, setTiebreaker] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const [guestList, setGuestList] = useState([]);
  const [nicknames, setNicknames] = useState({});
  const [phoneNumbers, setPhoneNumbers] = useState({}); // admin-only (config/private)
  const [databaseWinners, setDatabaseWinners] = useState({});
  const [picksVisible, setPicksVisible] = useState(false);
  const [powerScores, setPowerScores] = useState({});   // ⚡ finalized odds-weighted scores per week (config)
  const [pastResults, setPastResults] = useState({});   // 🛡️ { week: { winners:[], ties:[] } } for Survivor eliminations

  const [newEmailInput, setNewEmailInput] = useState("");
  const [newNicknameInput, setNewNicknameInput] = useState("");
  const [newPhoneInput, setNewPhoneInput] = useState("");
  const [selectedPaidUsers, setSelectedPaidUsers] = useState([]);

  const [adminTargetUser, setAdminTargetUser] = useState(null);
  const [adminTargetPicks, setAdminTargetPicks] = useState({});
  const [adminTargetTiebreaker, setAdminTargetTiebreaker] = useState("");
  const [adminProfileEmail, setAdminProfileEmail] = useState("");
  const [adminProfilePhone, setAdminProfilePhone] = useState("");

  const [skullPop, setSkullPop] = useState(null); // 💀 { gameId, side } — synced to the underdog sound
  const skullTimerRef = useRef(null);
  const [rowFx, setRowFx] = useState({});         // 🎉 { userId: 'confetti' | 'shake' } when a game goes final
  const prevWinnersRef = useRef({});              // last-seen winner per game id, to spot newly-final games
  const rowFxTimerRef = useRef(null);
  const [weekScores, setWeekScores] = useState({}); // config: finalized correct-counts per week (feeds XP)
  const standingRowRefs = useRef(new Map());      // 🏁 FLIP rank-swap animation on the standings
  const prevRowTopsRef = useRef(new Map());

  const legacyPhonesRef = useRef(null); // phones found in config/settings (pre-migration)
  const fetchedWeeksRef = useRef(new Set()); // past weeks already fetched for Survivor results

  // 🔊 Audio Logic (Shuffle Bag)
  const introRef = useRef(new Audio('/intro.mp3'));
  const funnySounds = useMemo(() => FUNNY_SOUND_FILES.map(file => new Audio(file)), []);
  const soundQueueRef = useRef([]);
  const musicPlayedRef = useRef(false);

  // --- 1. Auth listener ---
  useEffect(() => {
    if (PREVIEW) {
      setUser({ uid: 'preview-me', displayName: 'Luis S.', email: ADMIN_EMAILS[0], photoURL: '' });
      setAllowed(true);
      setIsAdmin(true);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) { setAllowed(false); setIsAdmin(false); }
    });
    return () => unsubscribe();
  }, []);

  // --- 2. League config (live) + allowlist gate ---
  useEffect(() => {
    if (!user || PREVIEW) return;
    const configRef = doc(db, "config", "settings");
    const unsubscribe = onSnapshot(configRef, async (snap) => {
      if (!snap.exists()) {
        if (isAdminEmail(user.email)) {
          await setDoc(configRef, { allowedEmails: [], nicknames: {}, winners: {}, picksVisible: false });
        } else {
          alert("🚫 Access Denied"); auth.signOut();
        }
        return;
      }
      const data = snap.data();
      setGuestList(data.allowedEmails || []);
      setNicknames(data.nicknames || {});
      setDatabaseWinners(data.winners || {});
      setPicksVisible(data.picksVisible || false);
      setPowerScores(data.powerScores || {});
      setWeekScores(data.weekScores || {});
      if (data.phones) legacyPhonesRef.current = data.phones;

      const email = user.email.toLowerCase();
      const ok = isAdminEmail(email) || (data.allowedEmails || []).some(e => e.toLowerCase() === email);
      if (!ok) { alert("🚫 Access Denied"); auth.signOut(); return; }

      setAllowed(true);
      setIsAdmin(isAdminEmail(email));
      if (!musicPlayedRef.current) {
        musicPlayedRef.current = true;
        try { introRef.current.volume = 0.5; introRef.current.play().catch(() => {}); } catch { /* autoplay blocked */ }
      }
    }, (err) => {
      console.error("Config load failed", err);
      alert("Could not load league settings. If this persists, check the Firestore rules deployment.");
    });
    return () => unsubscribe();
  }, [user]);

  // --- 3. Picks collection (live — replaces polling + page reloads) ---
  useEffect(() => {
    if (!allowed || PREVIEW) { if (!PREVIEW) setLeaders([]); return; }
    const unsubscribe = onSnapshot(collection(db, PICKS_COLLECTION), (snap) => {
      setLeaders(snap.docs.map(d => d.data()));
    }, (err) => console.error("Picks listener failed", err));
    return () => unsubscribe();
  }, [allowed]);

  // --- 3b. Preview mode: fabricate a league from live ESPN games ---
  useEffect(() => {
    if (!PREVIEW || !games.length) return;
    const names = ['Luis S.', 'Albert H.', 'Osvaldo S.', 'Art V.', 'Roman G.', 'Timothy A.', 'Andy R.', 'Louis G.'];
    setLeaders(names.map((n, idx) => {
      const weekPicks = {};
      games.forEach((g, i) => {
        const comp = g.competitions[0].competitors;
        weekPicks[g.id] = comp[(idx + i) % 2]?.team.abbreviation;
      });
      const firstGame = games[idx % games.length];
      return {
        userId: idx === 0 ? 'preview-me' : `preview-${idx}`,
        userName: n, photo: '',
        [`week${currentWeek}`]: weekPicks,
        [`tiebreaker_week${currentWeek}`]: String(38 + idx * 3),
        [`paid_week${currentWeek}`]: idx % 3 !== 0,
        survivor_optIn: idx < 6,
        survivor_paid: idx < 6 && idx % 2 === 0,
        [`survivor_week${currentWeek}`]: idx < 6 ? weekPicks[firstGame.id] : undefined
      };
    }));
    const uid = (i) => i === 0 ? 'preview-me' : `preview-${i}`;
    setPowerScores({ [currentWeek]: Object.fromEntries(names.map((_, i) => [uid(i), 22 - i * 2])) });
    setWeekScores({ 101: Object.fromEntries(names.map((_, i) => [uid(i), 12 - i])), 102: Object.fromEntries(names.map((_, i) => [uid(i), 11 - i])) });
  }, [games, currentWeek]);

  // --- 4. Phones (admin-only doc, with one-time migration from config/settings) ---
  useEffect(() => {
    if (!allowed || !isAdmin || PREVIEW) return;
    const privateRef = doc(db, "config", "private");
    const migrate = async () => {
      const snap = await getDoc(privateRef);
      if (!snap.exists()) {
        await setDoc(privateRef, { phones: legacyPhonesRef.current || {} });
        if (legacyPhonesRef.current) {
          await updateDoc(doc(db, "config", "settings"), { phones: deleteField() });
        }
      }
    };
    migrate().catch((e) => console.error("Phone migration failed", e));
    const unsubscribe = onSnapshot(privateRef, (snap) => {
      setPhoneNumbers(snap.exists() ? (snap.data().phones || {}) : {});
    }, (err) => console.error("Private config listener failed", err));
    return () => unsubscribe();
  }, [allowed, isAdmin]);

  // --- 4b. Past weeks' winners (fetched once per week, for Survivor eliminations) ---
  useEffect(() => {
    if (!allowed && !PREVIEW) return;
    let cancelled = false;
    const load = async () => {
      for (let w = 1; w < currentWeek; w++) {
        if (fetchedWeeksRef.current.has(w)) continue;
        fetchedWeeksRef.current.add(w);
        try {
          const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${w}&seasontype=2&dates=${SEASON}`);
          const data = await res.json();
          const winners = [], ties = [];
          (data.events || []).forEach(g => {
            const comp = g.competitions?.[0]?.competitors || [];
            const win = comp.find(c => c.winner === true);
            if (win) winners.push(win.team.abbreviation);
            else if (g.status?.type?.state === 'post') comp.forEach(c => ties.push(c.team.abbreviation));
          });
          if (!cancelled) setPastResults(prev => ({ ...prev, [w]: { winners, ties } }));
        } catch { fetchedWeeksRef.current.delete(w); /* retry next time */ }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [allowed, currentWeek]);

  // --- 5. Auto-detect the current NFL week on load ---
  useEffect(() => {
    const detectWeek = async () => {
      try {
        const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
        const data = await res.json();
        if (data?.season?.type === 2 && data?.week?.number) setCurrentWeek(Number(data.week.number));
      } catch { /* offseason or API hiccup — stay on week 1 */ }
    };
    detectWeek();
  }, []);

  // --- 6. Reset local pick state when changing weeks ---
  useEffect(() => {
    setHasSubmitted(false);
    setPicks({});
    setTiebreaker("");
    prevWinnersRef.current = {}; // don't fire confetti/shake across week switches
    setRowFx({});
  }, [currentWeek]);

  // --- 6b. 🎉 Confetti / 😖 shake when a game flips to final (from the live ESPN poll) ---
  useEffect(() => {
    if (!games.length) return;
    const prev = prevWinnersRef.current;
    const hadBaseline = Object.keys(prev).length > 0;
    const newlyFinal = games.filter(g => g.winner && prev[g.id] === null);
    prevWinnersRef.current = Object.fromEntries(games.map(g => [g.id, g.winner || null]));
    if (!hadBaseline || !newlyFinal.length) return;
    const fx = {};
    newlyFinal.forEach(g => {
      leaders.forEach(p => {
        const pick = (p[`week${currentWeek}`] || {})[g.id];
        if (!pick) return;
        if (pick === g.winner) fx[p.userId] = 'confetti';           // a win always celebrates…
        else if (fx[p.userId] !== 'confetti') fx[p.userId] = 'shake'; // …and outranks a same-tick loss
      });
    });
    if (Object.keys(fx).length) {
      setRowFx(fx);
      clearTimeout(rowFxTimerRef.current);
      rowFxTimerRef.current = setTimeout(() => setRowFx({}), 1600);
    }
  }, [games, leaders, currentWeek]);

  // --- 6c. 🏁 FLIP rank-swap animation: rows glide to new standings positions ---
  useEffect(() => {
    const prevTops = prevRowTopsRef.current;
    standingRowRefs.current.forEach((el, uid) => {
      if (!el || !el.isConnected) return;
      const top = el.getBoundingClientRect().top;
      const oldTop = prevTops.get(uid);
      if (oldTop !== undefined && Math.abs(oldTop - top) > 4) {
        el.style.transition = 'none';
        el.style.transform = `translateY(${oldTop - top}px)`;
        requestAnimationFrame(() => {
          el.style.transition = 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)';
          el.style.transform = 'translateY(0)';
        });
      }
      prevTops.set(uid, top);
    });
  }); // intentionally no deps: re-measure after every render

  // --- 7. Hydrate my submitted picks from the live data ---
  useEffect(() => {
    if (!user) return;
    const mine = leaders.find(l => l.userId === user.uid);
    const dbPicks = mine ? mine[`week${currentWeek}`] : null;
    if (dbPicks && Object.keys(dbPicks).length > 0) {
      setPicks(dbPicks);
      setTiebreaker(getTiebreakerFor(mine, currentWeek) ?? "");
      setHasSubmitted(true);
    }
  }, [leaders, currentWeek, user]);

  // --- 8. ESPN games + news (poll every 60s for live scores) ---
  useEffect(() => {
    const fetchData = async () => {
      if (OLD_WEEKS[currentWeek]) {
        const archive = OLD_WEEKS[currentWeek];
        setGames(archive.games.map((g, i) => ({
            id: g.id || String(i),
            status: { type: { shortDetail: 'Final', state: 'post' } },
            winner: g.winner,
            competitions: [{ competitors: [
                { homeAway: 'home', team: { abbreviation: g.home || g.winner, logo: '' }, score: g.winner===g.home?'W':'-' },
                { homeAway: 'away', team: { abbreviation: g.away || 'OPP', logo: '' }, score: g.winner===g.away?'W':'-' }
            ] }]
        })));
        return;
      }
      try {
        const gamesRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${currentWeek}&seasontype=2&dates=${SEASON}`);
        const gamesData = await gamesRes.json();
        const processedGames = (gamesData.events || []).map(g => {
            const winner = g.competitions[0].competitors.find(c => c.winner === true)?.team.abbreviation;
            const odds = g.competitions[0].odds && g.competitions[0].odds[0] ? g.competitions[0].odds[0].details : "";
            return { ...g, winner, oddsString: odds };
        });
        setGames(processedGames);

        const newsRes = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/news');
        const newsData = await newsRes.json();
        setNews(newsData.articles || []);
      } catch (error) { console.error("API Error", error); }
    };
    const refreshInterval = setInterval(fetchData, 60000);
    fetchData();
    return () => clearInterval(refreshInterval);
  }, [currentWeek]);

  // --- HELPERS ---
  const getWeeklyFee = () => (currentWeek === DOUBLE_FEE_WEEK ? 20 : ENTRY_FEE);
  const getWeekEntrants = () => leaders.filter(l => l[`week${currentWeek}`] && Object.keys(l[`week${currentWeek}`]).length > 0);
  const getCurrentPot = () => getWeekEntrants().length * getWeeklyFee();
  const getDisplayName = (player) => nicknames[sanitizeEmail(player.userId)] || nicknames[player.userId] || player.userName || "Player";

  // A game locks at kickoff — no picking it after it starts.
  const isGameLocked = (game) => {
    const state = game.status?.type?.state;
    if (state && state !== 'pre') return true;
    if (game.date) return new Date(game.date) <= new Date();
    return false;
  };
  const getUnlockedGames = () => games.filter(g => !isGameLocked(g));

  // Per-week tiebreaker (falls back to the old single field for 2025 history)
  const getTiebreakerFor = (player, week) => {
    if (!player) return undefined;
    const val = player[`tiebreaker_week${week}`];
    return val !== undefined ? val : player.tiebreaker;
  };

  const getCorrectCountForPlayer = (player) => {
    const weekPicks = player[`week${currentWeek}`] || {};
    let correct = 0;
    games.forEach((game) => { if (game.winner && weekPicks[game.id] === game.winner) correct++; });
    return correct;
  };
  const getProjectedWins = (player) => {
    let score = getCorrectCountForPlayer(player);
    games.forEach(g => {
        if (g.status.type.shortDetail !== 'Final' && g.oddsString && g.oddsString.includes('-')) {
             const favTeam = g.oddsString.split(' ')[0];
             const weekPicks = player[`week${currentWeek}`] || {};
             if (weekPicks[g.id] === favTeam) score++;
        }
    });
    return score;
  };

  // 🔥 Current streak: consecutive correct picks in kickoff order, counting back
  // from the most recent finished game (unfinished games don't break the run).
  const getCurrentStreak = (player) => {
    const weekPicks = player[`week${currentWeek}`] || {};
    const ordered = [...games].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    let streak = 0;
    for (let i = ordered.length - 1; i >= 0; i--) {
      const g = ordered[i];
      if (!g.winner) continue;
      if (weekPicks[g.id] === g.winner) streak++;
      else break;
    }
    return streak;
  };

  // 🆙 XP: 100 per correct pick across the season (finalized weeks + live current week).
  // Every 500 XP = 1 level.
  const getXpInfo = (player) => {
    let correct = 0;
    Object.entries(weekScores).forEach(([w, map]) => {
      if (Number(w) !== currentWeek) correct += (map && map[player.userId]) || 0;
    });
    correct += getCorrectCountForPlayer(player);
    const xp = correct * 100;
    return { xp, level: Math.floor(xp / 500) + 1, progress: (xp % 500) / 500 };
  };

  // ⚡ POWER POINTS (experimental 2026): same picks, odds-weighted scoring.
  // Win with a favorite = 1 pt · underdog by less than 7 = 2 pts · 7+ point underdog = 3 pts.
  const getPickPointValue = (game, pick) => {
    if (!pick) return 0;
    const match = (game.oddsString || "").match(/([A-Z]{2,3})\s*-(\d+\.?\d*)/); // ESPN details, e.g. "KC -7.5"
    if (!match) return 1; // pick'em or no line posted
    const [, favTeam, numStr] = match;
    if (pick === favTeam) return 1;
    return parseFloat(numStr) >= 7 ? 3 : 2;
  };
  const getPowerPointsForPlayer = (player) => {
    const weekPicks = player[`week${currentWeek}`] || {};
    let pts = 0;
    games.forEach(g => { if (g.winner && weekPicks[g.id] === g.winner) pts += getPickPointValue(g, weekPicks[g.id]); });
    return pts;
  };
  const getSeasonPowerStandings = () => {
    const totals = {};
    Object.values(powerScores).forEach(weekMap => {
      Object.entries(weekMap || {}).forEach(([uid, pts]) => { totals[uid] = (totals[uid] || 0) + pts; });
    });
    return Object.entries(totals)
      .map(([uid, pts]) => ({ uid, pts, player: leaders.find(l => l.userId === uid) }))
      .filter(e => e.player)
      .sort((a, b) => b.pts - a.pts);
  };

  // 🛡️ SURVIVOR POOL
  const findGameForTeam = (abbr) => games.find(g => (g.competitions?.[0]?.competitors || []).some(c => c.team.abbreviation === abbr));
  const getSurvivorPlayers = () => leaders.filter(l => l.survivor_optIn === true);
  const getSurvivorState = (player) => {
    if (!player || player.survivor_optIn !== true) return { joined: false, alive: false, teamsUsed: [], eliminatedWeek: null, currentPick: null };
    const teamsUsed = [];
    let alive = true, eliminatedWeek = null;
    for (let w = 1; w <= currentWeek; w++) {
      const pick = player[`survivor_week${w}`];
      if (pick) teamsUsed.push(pick);
      if (w < currentWeek) {
        if (!pick) { alive = false; eliminatedWeek = w; break; } // missed a week = out
        const results = pastResults[w];
        if (!results) continue; // results still loading — assume alive for now
        if (!results.winners.includes(pick) && !results.ties.includes(pick)) { alive = false; eliminatedWeek = w; break; }
      } else if (pick) {
        const g = findGameForTeam(pick);
        if (g && g.winner && g.winner !== pick) { alive = false; eliminatedWeek = w; } // lost live this week
        // win, tie, or still playing → alive
      }
    }
    return { joined: true, alive, eliminatedWeek, teamsUsed, currentPick: player[`survivor_week${currentWeek}`] || null };
  };

  // Monday Night game = latest kickoff of the week; total only counts once it's final
  const getMnfGame = () => {
    if (!games.length) return null;
    return [...games].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))[games.length - 1];
  };
  const getMnfActualTotal = () => {
    const g = getMnfGame();
    if (!g || g.status?.type?.state !== 'post') return null;
    const scores = (g.competitions?.[0]?.competitors || []).map(c => parseInt(c.score, 10));
    if (scores.length < 2 || scores.some(isNaN)) return null;
    return scores.reduce((a, b) => a + b, 0);
  };

  // 🔥 GAP PENALTY MATH (Dominant Leader Logic)
  const getWinProbability = (player, allPlayers) => {
      if (!games.length) return 0;
      const correct = getCorrectCountForPlayer(player);
      const remaining = games.filter(g => !g.winner).length;
      const leaderScore = Math.max(0, ...allPlayers.map(p => getCorrectCountForPlayer(p)));
      const maxPossible = correct + remaining;

      if (maxPossible < leaderScore) return 0; // Eliminated

      const bestProjection = Math.max(0, ...allPlayers.map(p => {
          const pCorrect = getCorrectCountForPlayer(p);
          if ((pCorrect + remaining) < leaderScore) return 0; // Ignore eliminated
          return getProjectedWins(p);
      }));

      // Gap weight: every projected point behind the best cuts the chance in half
      const calculateWeight = (p) => {
          const pCorrect = getCorrectCountForPlayer(p);
          if ((pCorrect + remaining) < leaderScore) return 0;
          const gap = Math.max(0, bestProjection - getProjectedWins(p));
          return 100 / Math.pow(2, gap);
      };

      const myWeight = calculateWeight(player);
      if (myWeight === 0) return 0;

      let totalWeight = 0;
      allPlayers.forEach(p => { totalWeight += calculateWeight(p); });

      return Math.round((myWeight / totalWeight) * 100);
  };

  // A winner is only declared when it's real: admin-finalized, all games final,
  // or mathematically clinched — never from a rounded 100% probability.
  const getDeclaredWinner = () => {
      if (!games.length || !leaders.length) return null;
      if (databaseWinners[currentWeek]) return { userName: databaseWinners[currentWeek], userId: 'db' };

      const scored = leaders.map(p => ({ p, correct: getCorrectCountForPlayer(p) }));
      const remaining = games.filter(g => !g.winner).length;
      const top = Math.max(...scored.map(s => s.correct));
      const contenders = scored.filter(s => s.correct === top);

      if (remaining === 0) {
          if (contenders.length === 1) return contenders[0].p;
          const actualTotal = getMnfActualTotal();
          if (actualTotal !== null) {
              const withDist = contenders.map(c => {
                  const tb = parseInt(getTiebreakerFor(c.p, currentWeek), 10);
                  return { ...c, dist: isNaN(tb) ? Infinity : Math.abs(tb - actualTotal) };
              });
              const best = Math.min(...withDist.map(c => c.dist));
              const closest = withDist.filter(c => c.dist === best);
              if (closest.length === 1 && best !== Infinity) return closest[0].p;
          }
          return { userName: "Multiple Winners (Tie)", userId: 'tie' };
      }

      // Mid-week: only if the leader can no longer be caught
      if (contenders.length === 1) {
          const secondBest = Math.max(0, ...scored.filter(s => s.p !== contenders[0].p).map(s => s.correct));
          if (top > secondBest + remaining) return contenders[0].p;
      }
      return null;
  };

  const getSimilarSelections = () => {
    if (!user || !picks || Object.keys(picks).length === 0) return [];
    return leaders.filter(p => p.userId !== user.uid).map(player => {
        const theirPicks = player[`week${currentWeek}`] || {};
        let diff = 0;
        games.forEach(g => { if (picks[g.id] && theirPicks[g.id] && picks[g.id] !== theirPicks[g.id]) diff++; });
        return { name: getDisplayName(player), diff };
    }).sort((a, b) => a.diff - b.diff);
  };

  const getCombinedWeeklyWinners = () => {
      const history = [...LEGACY_WEEKLY_WINNERS];
      Object.keys(databaseWinners).forEach(week => {
          if (!history.find(h => h.week === Number(week))) {
              history.push({ week: Number(week), winner: databaseWinners[week] });
          }
      });
      return history.sort((a, b) => a.week - b.week);
  };

  // --- ACTIONS ---
  const handleLogin = async () => { try { await signInWithGoogle(); } catch (e) { console.error(e); } };
  const handleLogout = () => { auth.signOut(); setView('dashboard'); };

  const selectTeam = (game, teamAbbr, targetPicksState, setTargetPicksState, adminMode = false) => {
    if (!adminMode) {
      if (hasSubmitted) return;
      if (isGameLocked(game)) return; // kickoff has passed — pick locked
    }
    const setPicksFunc = setTargetPicksState || setPicks;
    setPicksFunc((prev) => ({ ...prev, [game.id]: teamAbbr }));

    const oddsString = game.oddsString || "";
    if (oddsString && (oddsString.includes('+') || oddsString.includes('-'))) {
      const match = oddsString.match(/([A-Z]{2,3})\s*([+-]?)(\d+\.?\d*)/);
      if (match) {
        const [, teamInOdds, sign, num] = match;
        const magnitude = parseFloat(num);
        if (magnitude >= 8) {
            let isUnderdogPick = false;
            if (sign === '-' && teamAbbr !== teamInOdds) isUnderdogPick = true;
            if (sign === '+' && teamAbbr === teamInOdds) isUnderdogPick = true;

            if (isUnderdogPick) {
                // 💀 Skull pop synced with the funny sound
                setSkullPop({ gameId: game.id, side: teamAbbr });
                clearTimeout(skullTimerRef.current);
                skullTimerRef.current = setTimeout(() => setSkullPop(null), 1200);

                // 🃏 SHUFFLE BAG LOGIC
                let queue = soundQueueRef.current;
                if (queue.length === 0) {
                    queue = Array.from({ length: funnySounds.length }, (_, i) => i);
                    for (let i = queue.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [queue[i], queue[j]] = [queue[j], queue[i]];
                    }
                    soundQueueRef.current = queue;
                }
                const indexToPlay = queue.pop();
                try {
                    funnySounds[indexToPlay].currentTime = 0;
                    funnySounds[indexToPlay].play();
                } catch { /* audio not ready */ }
            }
        }
      }
    }
  };

  const submitPicks = async () => {
    if (!user) return;
    const unlocked = getUnlockedGames();
    const missingUnlocked = unlocked.filter(g => !picks[g.id]);
    if (missingUnlocked.length > 0) { alert(`Incomplete! ${missingUnlocked.length} game(s) still need a pick.`); return; }
    if (!tiebreaker) { alert("Enter Tiebreaker Score"); return; }
    const missedGames = games.filter(g => isGameLocked(g) && !picks[g.id]).length;
    if (missedGames > 0 && !window.confirm(`${missedGames} game(s) already kicked off and can't be picked. Submit anyway?`)) return;
    try {
      await setDoc(doc(db, PICKS_COLLECTION, user.uid), {
        userId: user.uid, userName: user.displayName, photo: user.photoURL, email: user.email,
        [`week${currentWeek}`]: picks,
        [`tiebreaker_week${currentWeek}`]: tiebreaker,
        [`week${currentWeek}_submittedAt`]: serverTimestamp()
      }, { merge: true });
      alert("✅ Picks Saved!");
      setHasSubmitted(true);
    } catch (error) { console.error(error); alert("Error saving picks: " + error.message); }
  };

  // --- SURVIVOR ACTIONS ---
  const joinSurvivor = async () => {
    if (!user) return;
    if (!window.confirm(`Join the Survivor Pool? One-time $${SURVIVOR_FEE} entry (pay on Venmo).\n\nPick ONE team each week — win and you survive, lose and you're out. Each team can only be used once all season.`)) return;
    try {
      await setDoc(doc(db, PICKS_COLLECTION, user.uid), {
        userId: user.uid, userName: user.displayName, photo: user.photoURL, email: user.email,
        survivor_optIn: true
      }, { merge: true });
    } catch (e) { console.error(e); alert("Error: " + e.message); }
  };
  const pickSurvivorTeam = async (game, abbr) => {
    if (!user) return;
    const me = leaders.find(l => l.userId === user.uid);
    const state = getSurvivorState(me);
    if (!state.joined || !state.alive) return;
    if (isGameLocked(game)) { alert("That game already kicked off."); return; }
    if (state.currentPick) {
      const curGame = findGameForTeam(state.currentPick);
      if (curGame && isGameLocked(curGame)) { alert("Your pick is locked — that team's game already started."); return; }
    }
    const usedBefore = state.teamsUsed.filter(t => t !== state.currentPick);
    if (usedBefore.includes(abbr)) { alert(`You already used ${abbr} this season.`); return; }
    if (!window.confirm(`Use ${abbr} for Week ${currentWeek}? You won't be able to pick them again this season.`)) return;
    try {
      await setDoc(doc(db, PICKS_COLLECTION, user.uid), {
        userId: user.uid, userName: user.displayName, photo: user.photoURL, email: user.email,
        [`survivor_week${currentWeek}`]: abbr,
        [`survivor_week${currentWeek}_pickedAt`]: serverTimestamp()
      }, { merge: true });
    } catch (e) { console.error(e); alert("Error: " + e.message); }
  };

  // --- ADMIN ACTIONS ---
  const toggleSurvivorPaid = async (userId, currentStatus) => {
     try {
       await updateDoc(doc(db, PICKS_COLLECTION, userId), { survivor_paid: !currentStatus });
     } catch (e) { console.error(e); alert("Error: " + e.message); }
  };
  const toggleSelectUser = (userId) => { setSelectedPaidUsers(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]); };
  const toggleSelectAll = () => { if (selectedPaidUsers.length === leaders.length) { setSelectedPaidUsers([]); } else { setSelectedPaidUsers(leaders.map(l => l.userId)); } };

  const markSelectedPaid = async () => {
    if (!selectedPaidUsers.length) return;
    try {
      const batch = writeBatch(db);
      selectedPaidUsers.forEach((uid) => { batch.update(doc(db, PICKS_COLLECTION, uid), { [`paid_week${currentWeek}`]: true }); });
      await batch.commit();
      setSelectedPaidUsers([]);
    } catch (e) { console.error(e); alert("Error marking paid: " + e.message); }
  };
  const toggleWeekPayment = async (userId, weekNum, currentStatus) => {
     try {
       await updateDoc(doc(db, PICKS_COLLECTION, userId), { [`paid_week${weekNum}`]: !currentStatus });
     } catch (e) { console.error(e); alert("Error: " + e.message); }
  };
  const submitAdminPicks = async () => {
    if (!adminTargetUser) return;
    try {
      await setDoc(doc(db, PICKS_COLLECTION, adminTargetUser.userId), {
          userId: adminTargetUser.userId, userName: adminTargetUser.userName, photo: adminTargetUser.photo || null,
          [`week${currentWeek}`]: adminTargetPicks,
          [`tiebreaker_week${currentWeek}`]: adminTargetTiebreaker,
          [`week${currentWeek}_submittedAt`]: serverTimestamp(),
          [`week${currentWeek}_enteredBy`]: user.email
        }, { merge: true });
      alert(`✅ Saved for ${getDisplayName(adminTargetUser)}!`);
    } catch (e) { console.error(e); alert("Error: " + e.message); }
  };
  const updateGuestPhone = async () => {
     if (!adminProfileEmail) return;
     try {
       await setDoc(doc(db, "config", "private"), { phones: { [sanitizeEmail(adminProfileEmail)]: adminProfilePhone } }, { merge: true });
       alert(`✅ Updated phone for ${adminProfileEmail}`);
       setAdminProfileEmail(""); setAdminProfilePhone("");
     } catch (e) { console.error(e); alert("Error: " + e.message); }
  };
  const finalizeWeekWinner = async () => {
      const winner = getDeclaredWinner();
      if (!winner) { alert("No winner calculated yet."); return; }
      const name = getDisplayName(winner);
      if (!window.confirm(`Declare ${name} as Week ${currentWeek} Winner?`)) return;
      await updateDoc(doc(db, "config", "settings"), {
        [`winners.${currentWeek}`]: name,
        // snapshot this week's ⚡ Power Points so season standings survive ESPN odds disappearing
        [`powerScores.${currentWeek}`]: Object.fromEntries(leaders.map(p => [p.userId, getPowerPointsForPlayer(p)])),
        // snapshot correct counts too — feeds the season 🆙 XP / level system
        [`weekScores.${currentWeek}`]: Object.fromEntries(leaders.map(p => [p.userId, getCorrectCountForPlayer(p)]))
      });
      alert("✅ Winner Saved!");
  };
  const addGuest = async () => {
    if (!newEmailInput) return;
    const email = newEmailInput.toLowerCase().trim();
    const nickname = newNicknameInput.trim();
    const phone = newPhoneInput.trim();
    try {
      await updateDoc(doc(db, "config", "settings"), {
          allowedEmails: arrayUnion(email),
          [`nicknames.${sanitizeEmail(email)}`]: nickname
      });
      if (phone) {
        await setDoc(doc(db, "config", "private"), { phones: { [sanitizeEmail(email)]: phone } }, { merge: true });
      }
      setNewEmailInput(""); setNewNicknameInput(""); setNewPhoneInput("");
      alert(`✅ Added ${email}`);
    } catch (e) { console.error(e); alert("Error: " + e.message); }
  };
  const removeGuest = async (email) => {
    if (!window.confirm(`Remove ${email}?`)) return;
    try {
      await updateDoc(doc(db, "config", "settings"), {
          allowedEmails: arrayRemove(email),
          [`nicknames.${sanitizeEmail(email)}`]: deleteField()
      });
      await updateDoc(doc(db, "config", "private"), { [`phones.${sanitizeEmail(email)}`]: deleteField() }).catch(() => {});
    } catch (e) { console.error(e); alert("Error: " + e.message); }
  };
  const togglePicksVisibility = async () => {
    await updateDoc(doc(db, "config", "settings"), { picksVisible: !picksVisible });
  };
  const resetPicks = async (userId) => {
    if (!window.confirm("Reset this player's picks for the week?")) return;
    await updateDoc(doc(db, PICKS_COLLECTION, userId), {
      [`week${currentWeek}`]: deleteField(),
      [`tiebreaker_week${currentWeek}`]: deleteField()
    });
  };

  // --- RENDER HELPERS ---
  const renderPicksGrid = (targetPicks, setTargetPicks, targetTiebreaker, setTargetTiebreaker, adminMode = false) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '14px', maxWidth: '820px', margin: '0 auto' }}>
        {games.map((game, i) => {
          const home = game.competitions[0].competitors.find(c => c.homeAway === 'home');
          const away = game.competitions[0].competitors.find(c => c.homeAway === 'away');
          if (!home || !away) return null;
          const odds = game.oddsString || "";
          const myPick = targetPicks[game.id];
          const locked = !adminMode && (hasSubmitted || isGameLocked(game));
          const pickTeam = (abbr) => selectTeam(game, abbr, targetPicks, setTargetPicks, adminMode);
          const tile = (side) => {
            const abbr = side.team.abbreviation;
            const ptVal = getPickPointValue(game, abbr);
            return (
              <div
                className={`team-tile ${myPick === abbr ? 'selected' : ''} ${locked ? 'noclick' : ''}`}
                onClick={locked ? undefined : () => pickTeam(abbr)}
              >
                {side.team.logo ? <img src={side.team.logo} alt={abbr} /> : <div className="team-logo-fallback">🏈</div>}
                <div>{abbr}</div>
                {odds && <span className={`pt-badge ${ptVal === 3 ? 'pt3' : ptVal === 2 ? 'pt2' : ''}`}>⚡{ptVal}</span>}
                {skullPop && skullPop.gameId === game.id && skullPop.side === abbr && <span className="skull-pop">💀</span>}
              </div>
            );
          };
          return (
            <div key={game.id} className={`game-card ${locked ? 'locked' : ''}`} style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}>
              <div className="game-card-top">
                <span>{isGameLocked(game) && !adminMode ? '🔒 ' : ''}{game.status.type.shortDetail}</span>
                <span className="odds">{odds}</span>
              </div>
              <div className="game-card-teams">
                {tile(away)}
                <div className="vs">@</div>
                {tile(home)}
              </div>
            </div>
          );
        })}
        <div className="glass tb-card">
          <h3 style={{ margin: '0 0 12px 0' }}>Tiebreaker · MNF Total</h3>
          <input type="number" className="tb-input" value={targetTiebreaker} onChange={(e) => { if (adminMode || !hasSubmitted) setTargetTiebreaker(e.target.value); }} placeholder="45" readOnly={!adminMode && hasSubmitted} />
        </div>
    </div>
  );

  const declaredWinner = getDeclaredWinner();
  const mnfActualTotal = getMnfActualTotal();
  const mnfLocked = games.length > 0 && isGameLocked(getMnfGame());

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '110px' }}>
      <header className="topbar">
        <div className="logo">🏈 <span>Pick 'Em <em>Pro</em></span><span className="season-chip">{SEASON} Season</span></div>
        {user && allowed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Avatar src={user.photoURL} name={user.displayName} size={34} />
            <button className="btn btn-danger" style={{ padding: '6px 14px', fontSize: '12px' }} onClick={handleLogout}>Logout</button>
          </div>
        )}
      </header>

      {!user || !allowed ? (
        <div className="hero">
          <div className="hero-ball">🏈</div>
          <h1 className="hero-title">Pick 'Em <span>Pro</span></h1>
          <p className="hero-sub">Weekly NFL picks · One pot · Bragging rights included</p>
          <button className="cta" onClick={handleLogin}>Enter League</button>
        </div>
      ) : (
        <>
          <nav className="tabs">
            <button className={`tab ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>Dashboard</button>
            <button className={`tab ${view === 'picks' ? 'active' : ''}`} onClick={() => setView('picks')}>{hasSubmitted ? "✅ My Picks" : "Make Picks"}</button>
            <button className={`tab ${view === 'matrix' ? 'active' : ''}`} onClick={() => setView('matrix')}>All Picks</button>
            <button className={`tab ${view === 'survivor' ? 'active' : ''}`} onClick={() => setView('survivor')}>🛡️ Survivor</button>
            <button className={`tab ${view === 'winners' ? 'active' : ''}`} onClick={() => setView('winners')}>Winners</button>
            {isAdmin && <button className={`tab admin ${view === 'admin' ? 'active' : ''}`} onClick={() => setView('admin')}>👑 Admin</button>}
          </nav>
          <div style={{ textAlign: 'center', margin: '14px 0 22px 0' }}>
            <select className="select" value={currentWeek} onChange={(e) => setCurrentWeek(Number(e.target.value))}>
              {[...Array(18)].map((_, i) => <option key={i+1} value={i+1}>Week {i+1}</option>)}
            </select>
          </div>

          <main style={{ maxWidth: '900px', margin: '0 auto', padding: '0 16px' }}>

            {/* === DASHBOARD === */}
            {view === 'dashboard' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                <div>
                  <div className="section-label">Live Scores</div>
                  <div className="score-strip">
                    {games.map((game) => {
                      const home = game.competitions[0].competitors.find(c => c.homeAway === 'home');
                      const away = game.competitions[0].competitors.find(c => c.homeAway === 'away');
                      if (!home || !away) return null;
                      const state = game.status?.type?.state;
                      return (
                        <div key={game.id} className="score-card">
                          <div className="score-row"><span>{away.team.abbreviation}</span><span style={{ color: game.winner === away.team.abbreviation ? 'var(--accent)' : 'inherit' }}>{away.score}</span></div>
                          <div className="score-row"><span>{home.team.abbreviation}</span><span style={{ color: game.winner === home.team.abbreviation ? 'var(--accent)' : 'inherit' }}>{home.score}</span></div>
                          <div className={`score-status ${state === 'in' ? 'live' : ''}`}>{state === 'in' && <span className="live-dot" />}{game.status.type.shortDetail}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* POT */}
                <div className="pot-card">
                  <div className="pot-label">Week {currentWeek} Pot</div>
                  <div className="pot-amount">${getCurrentPot()}</div>
                  <div className="pot-sub">{getWeekEntrants().length} players in · ${getWeeklyFee()} entry{currentWeek === DOUBLE_FEE_WEEK ? ' · 🦃 Double Gobble Week' : ''}</div>
                  <a className="btn btn-gold" style={{ textDecoration: 'none', display: 'inline-block' }} href="https://venmo.com/u/MrDoom" target="_blank" rel="noreferrer">Pay ${getWeeklyFee()} on Venmo ↗</a>
                </div>

                {/* RULES */}
                <div className="glass" style={{ padding: '20px 22px' }}>
                  <h3 style={{ margin: '0 0 12px 0', color: 'var(--muted)', fontSize: '15px' }}>📜 League Rules</h3>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--muted)', lineHeight: 1.8 }}>
                    <li>Each game locks at its kickoff — no picks after a game starts.</li>
                    <li>Thanksgiving Week (Week {DOUBLE_FEE_WEEK}) fee is $20 (Double Gobble Week).</li>
                    <li>Tiebreaker: guess the total score of the Monday Night game.</li>
                    <li>No changes after submission.</li>
                  </ul>
                </div>

                {/* PLAYER STATUS */}
                <div className="glass" style={{ overflow: 'hidden' }}>
                  <div className="row" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <span className="section-label" style={{ margin: 0 }}>Player Status · Week {currentWeek}</span>
                    <span className="section-label" style={{ margin: 0 }}>Paid / Picked</span>
                  </div>
                  {leaders.map((player) => {
                    const weekPicks = player[`week${currentWeek}`] ? Object.keys(player[`week${currentWeek}`]).length : 0;
                    const isPaid = player[`paid_week${currentWeek}`] === true;
                    const streak = getCurrentStreak(player);
                    const fx = rowFx[player.userId];
                    return (
                      <div key={player.userId} className={`row ${fx === 'shake' ? 'fx-shake' : ''}`} style={{ position: 'relative' }}>
                        {fx === 'confetti' && <ConfettiBurst />}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <Avatar src={player.photo} name={getDisplayName(player)} />
                          <div style={{ fontWeight: 700 }}>
                            {getDisplayName(player)}
                            {streak >= 2 && <span className="streak-badge" style={{ marginLeft: '8px' }}>🔥 {streak} in a row</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <span className={`pill ${isPaid ? 'pill-green' : 'pill-red'}`}>{isPaid ? 'PAID' : 'UNPAID'}</span>
                          <span style={{ fontSize: '18px' }}>{weekPicks > 0 ? '✅' : '⏳'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* === MATRIX (ALL PICKS + WIN %) === */}
            {view === 'matrix' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {getSimilarSelections().length > 0 && (
                  <div>
                    <div className="section-label">🔗 Similar Selections</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {getSimilarSelections().map((sim, i) => (
                        <div key={i} className="glass" style={{ padding: '8px 14px', borderRadius: '12px', fontSize: '12px' }}>
                          <span style={{ fontWeight: 800, color: 'var(--accent)' }}>{sim.diff} diff</span>&nbsp;· {sim.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="glass" style={{ padding: '14px', overflowX: 'auto' }}>
                  <div style={{ textAlign: 'center', padding: '4px 0 12px 0', color: 'var(--muted)', fontSize: '12px', fontWeight: 700, letterSpacing: '1px' }}>
                    {picksVisible ? "✅ ALL PICKS REVEALED" : "🔒 PICKS REVEAL PER GAME AT KICKOFF"}
                  </div>
                  <table className="matrix-table">
                    <thead><tr>
                      <th className="matrix-sticky">Player</th>
                      {games.map(g => { const away = g.competitions[0].competitors.find(c => c.homeAway === 'away')?.team.abbreviation; return <th key={g.id}>{away}</th> })}
                      <th>Tie</th><th>Correct</th><th style={{ color: 'var(--blue)' }}>⚡Pwr</th><th style={{ color: 'var(--gold)' }}>Proj</th><th style={{ color: 'var(--accent)' }}>Win %</th>
                    </tr></thead>
                    <tbody>
                      {[...leaders].sort((a,b) => getCorrectCountForPlayer(b) - getCorrectCountForPlayer(a)).map(player => {
                        const playerPicks = player[`week${currentWeek}`] || {};
                        const isSelf = user && player.userId === user.uid;
                        const prob = getWinProbability(player, leaders);
                        const isDeclared = declaredWinner && declaredWinner.userId === player.userId;
                        const playerTb = getTiebreakerFor(player, currentWeek);
                        const showTb = picksVisible || isAdmin || isSelf || mnfLocked;
                        return (
                          <tr key={player.userId}>
                            <td className="matrix-sticky">{isDeclared ? '🏆 ' : ''}{getDisplayName(player)}</td>
                            {games.map(g => {
                              const pick = playerPicks[g.id];
                              // A pick is visible once its game kicks off (or admin reveal / your own row)
                              const showPick = picksVisible || isAdmin || isSelf || isGameLocked(g);
                              let cls = 'cell-hidden', label = '🔒';
                              if (showPick) {
                                label = pick || '–';
                                cls = !pick ? 'cell-hidden' : !g.winner ? 'cell-pending' : pick === g.winner ? 'cell-correct' : 'cell-wrong';
                              }
                              return <td key={g.id}><span className={`cell-chip ${cls}`}>{label}</span></td>;
                            })}
                            <td>
                              {showTb ? (playerTb || "–") : "🔒"}
                              {showTb && playerTb && mnfActualTotal !== null && !isNaN(parseInt(playerTb, 10)) && (
                                <span style={{ fontSize: '10px', color: 'var(--muted)', display: 'block' }}>({Math.abs(parseInt(playerTb, 10) - mnfActualTotal)} off)</span>
                              )}
                            </td>
                            <td style={{ color: 'var(--accent)', fontWeight: 800 }}>{getCorrectCountForPlayer(player)}</td>
                            <td style={{ color: 'var(--blue)', fontWeight: 800 }}>{getPowerPointsForPlayer(player)}</td>
                            <td style={{ color: 'var(--gold)', fontWeight: 700 }}>{getProjectedWins(player)}</td>
                            <td style={{ fontWeight: 800, color: prob > 0 ? 'var(--accent)' : 'var(--muted)' }}>
                              {isDeclared ? "🏆" : prob === 0 ? "❌" : prob >= 100 ? "99%" : `${prob}%`}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* === WEEKLY WINNERS === */}
            {view === 'winners' && (
              <div style={{ maxWidth: '640px', margin: '0 auto' }}>
                {declaredWinner && (
                  <div className="winner-banner">
                    <div className="label">🏆 Week {currentWeek} Winner 🏆</div>
                    <div className="name">{getDisplayName(declaredWinner)}</div>
                  </div>
                )}
                <div className="glass" style={{ overflow: 'hidden' }}>
                  <div className="row" style={{ background: 'rgba(255,255,255,0.03)', justifyContent: 'center' }}>
                    <span className="section-label" style={{ margin: 0, color: 'var(--gold)' }}>🏅 Weekly Winners</span>
                  </div>
                  {getCombinedWeeklyWinners().length === 0 && <div style={{ padding: '18px', textAlign: 'center', color: 'var(--muted)' }}>No winners yet — season starts soon 🏈</div>}
                  {getCombinedWeeklyWinners().map(w => (
                    <div key={w.week} className="row">
                      <span style={{ color: 'var(--muted)', fontWeight: 700, fontSize: '13px' }}>Week {w.week}</span>
                      <span style={{ fontWeight: 800, fontSize: '15px' }}>{w.winner}</span>
                    </div>
                  ))}
                </div>

                {/* ⚡ POWER STANDINGS (experimental parallel game) */}
                <div className="glass" style={{ overflow: 'hidden', marginTop: '20px' }}>
                  <div className="row" style={{ background: 'rgba(255,255,255,0.03)', justifyContent: 'center' }}>
                    <span className="section-label" style={{ margin: 0, color: 'var(--blue)' }}>⚡ Power Standings · Trial Season</span>
                  </div>
                  <div style={{ padding: '10px 18px 0 18px', fontSize: '11px', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.6 }}>
                    Same weekly picks, scored by risk: favorite win = 1 pt · underdog win = 2 pts · 7+ point underdog win = 3 pts. Bragging rights only this year.
                  </div>
                  {getSeasonPowerStandings().length === 0
                    ? <div style={{ padding: '18px', textAlign: 'center', color: 'var(--muted)' }}>Standings appear after the first week is finalized.</div>
                    : getSeasonPowerStandings().map((e, i) => {
                      const xpInfo = getXpInfo(e.player);
                      return (
                        <div key={e.uid} className="row standing-row" ref={el => { if (el) standingRowRefs.current.set(e.uid, el); else standingRowRefs.current.delete(e.uid); }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ color: 'var(--muted)', fontWeight: 700, width: '22px' }}>{i + 1}.</span>
                            <div>
                              <div style={{ fontWeight: 700 }}>
                                {getDisplayName(e.player)}
                                <span className="pill pill-gold" style={{ marginLeft: '8px' }}>LV {xpInfo.level}</span>
                              </div>
                              <div className="xp-bar"><div className="xp-fill" style={{ width: `${Math.round(xpInfo.progress * 100)}%` }} /></div>
                              <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>{xpInfo.xp} XP · {500 - (xpInfo.xp % 500)} to LV {xpInfo.level + 1}</div>
                            </div>
                          </div>
                          <span style={{ fontWeight: 800, color: 'var(--blue)' }}>⚡ {e.pts}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* === 🛡️ SURVIVOR POOL === */}
            {view === 'survivor' && (() => {
              const me = user ? leaders.find(l => l.userId === user.uid) : null;
              const myState = getSurvivorState(me);
              const pool = getSurvivorPlayers();
              const aliveCount = pool.filter(p => getSurvivorState(p).alive).length;
              const usedBefore = myState.teamsUsed.filter(t => t !== myState.currentPick);
              const myPickGame = myState.currentPick ? findGameForTeam(myState.currentPick) : null;
              const myPickLocked = myPickGame ? isGameLocked(myPickGame) : false;
              const canPick = myState.joined && myState.alive && !myPickLocked;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div className="pot-card" style={{ borderColor: 'rgba(255,201,77,0.4)' }}>
                    <div className="pot-label" style={{ color: 'var(--gold)' }}>🛡️ Survivor Pool · Optional Side Game</div>
                    <div className="pot-amount">${pool.length * SURVIVOR_FEE}</div>
                    <div className="pot-sub">{pool.length} entered · {aliveCount} alive · ${SURVIVOR_FEE} one-time entry · last one standing takes all</div>
                    {!myState.joined
                      ? <button className="btn btn-gold" style={{ fontSize: '15px', padding: '13px 28px' }} onClick={joinSurvivor}>Join Survivor Pool (${SURVIVOR_FEE})</button>
                      : <span className={`pill ${myState.alive ? 'pill-green' : 'pill-red'}`} style={{ fontSize: '13px', padding: '8px 18px' }}>{myState.alive ? '💪 YOU ARE ALIVE' : `💀 ELIMINATED · WEEK ${myState.eliminatedWeek}`}</span>}
                  </div>

                  <div className="glass" style={{ padding: '18px 22px' }}>
                    <h3 style={{ margin: '0 0 10px 0', color: 'var(--muted)', fontSize: '14px' }}>How it works</h3>
                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--muted)', lineHeight: 1.8 }}>
                      <li>Pick ONE team to win each week. Win → survive. Lose → out.</li>
                      <li>Each team can only be used ONCE all season — spend the big favorites wisely.</li>
                      <li>Miss a week and you're out. Join before Week 1 kickoff.</li>
                      <li>You can switch your pick until your chosen team's game kicks off. Picks reveal at kickoff.</li>
                      <li>If multiple players survive Week 18, the pot splits.</li>
                    </ul>
                  </div>

                  {myState.joined && myState.alive && games.length > 0 && (
                    <div>
                      <div className="section-label">
                        {myState.currentPick
                          ? `Week ${currentWeek} pick: ${myState.currentPick}${myPickLocked ? ' 🔒 locked in' : ' — tap another team to switch'}`
                          : `Pick your Week ${currentWeek} team`}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '14px' }}>
                        {games.map(game => {
                          const home = game.competitions[0].competitors.find(c => c.homeAway === 'home');
                          const away = game.competitions[0].competitors.find(c => c.homeAway === 'away');
                          if (!home || !away) return null;
                          const locked = isGameLocked(game);
                          const tile = (side) => {
                            const abbr = side.team.abbreviation;
                            const used = usedBefore.includes(abbr);
                            const isSel = myState.currentPick === abbr;
                            const clickable = canPick && !locked && !used;
                            return (
                              <div className={`team-tile ${isSel ? 'selected-gold' : ''} ${used ? 'used' : ''} ${clickable ? '' : 'noclick'}`} onClick={clickable ? () => pickSurvivorTeam(game, abbr) : undefined}>
                                {side.team.logo ? <img src={side.team.logo} alt={abbr} /> : <div className="team-logo-fallback">🏈</div>}
                                <div>{abbr}</div>
                                {used && <span className="pt-badge">USED</span>}
                              </div>
                            );
                          };
                          return (
                            <div key={game.id} className={`game-card ${locked ? 'locked' : ''}`}>
                              <div className="game-card-top">
                                <span>{locked ? '🔒 ' : ''}{game.status.type.shortDetail}</span>
                                <span className="odds">{game.oddsString || ""}</span>
                              </div>
                              <div className="game-card-teams">
                                {tile(away)}
                                <div className="vs">@</div>
                                {tile(home)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Survivor board */}
                  <div className="glass" style={{ overflow: 'hidden' }}>
                    <div className="row" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <span className="section-label" style={{ margin: 0 }}>Survivor Board</span>
                      <span className="section-label" style={{ margin: 0 }}>Week {currentWeek} Pick</span>
                    </div>
                    {pool.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>Nobody has joined yet — be the first 🛡️</div>}
                    {[...pool].sort((a, b) => (getSurvivorState(b).alive ? 1 : 0) - (getSurvivorState(a).alive ? 1 : 0)).map(p => {
                      const st = getSurvivorState(p);
                      const isSelf = user && p.userId === user.uid;
                      const pickGame = st.currentPick ? findGameForTeam(st.currentPick) : null;
                      const showPick = picksVisible || isAdmin || isSelf || (pickGame && isGameLocked(pickGame));
                      const shownUsed = st.teamsUsed.filter(t => showPick || t !== st.currentPick);
                      return (
                        <div key={p.userId} className="row">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Avatar src={p.photo} name={getDisplayName(p)} />
                            <div>
                              <div style={{ fontWeight: 700 }}>{getDisplayName(p)}{p.survivor_paid !== true && <span className="pill pill-red" style={{ marginLeft: '8px' }}>UNPAID</span>}</div>
                              {shownUsed.length > 0 && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Used: {shownUsed.join(' · ')}</div>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontWeight: 800 }}>{st.currentPick ? (showPick ? st.currentPick : '🔒') : '—'}</span>
                            <span className={`pill ${st.alive ? 'pill-green' : 'pill-red'}`}>{st.alive ? 'ALIVE' : `OUT W${st.eliminatedWeek}`}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* === PICKS === */}
            {view === 'picks' && (
              <div>
                {(() => {
                  const me = user ? leaders.find(l => l.userId === user.uid) : null;
                  const streak = me ? getCurrentStreak(me) : 0;
                  return streak >= 2 && (
                    <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                      <span className="streak-badge" style={{ fontSize: '13px', padding: '6px 16px' }}>🔥 {streak} in a row — keep it rolling!</span>
                    </div>
                  );
                })()}
                {renderPicksGrid(picks, setPicks, tiebreaker, setTiebreaker, false)}
                {(() => {
                  const remaining = getUnlockedGames().filter(g => !picks[g.id]).length;
                  const ready = remaining === 0 && tiebreaker;
                  const cls = hasSubmitted ? 'submit-fab done' : ready ? 'submit-fab' : 'submit-fab disabled';
                  return (
                    <button className={cls} onClick={hasSubmitted ? undefined : submitPicks}>
                      {hasSubmitted ? "✅ Picks Locked In" : (remaining === 0 ? "Submit All Picks" : `Pick ${remaining} More`)}
                    </button>
                  );
                })()}
              </div>
            )}

            {/* === ADMIN === */}
            {view === 'admin' && isAdmin && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                 <div className="glass" style={{ padding: '20px', textAlign: 'center' }}>
                    <h3 style={{ marginTop: 0 }}>📊 Weekly Stats</h3>
                    <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: '10px', fontSize: '14px' }}>
                        <div>📝 Submitted: <span style={{ color: 'var(--accent)', fontWeight: 800 }}>{getWeekEntrants().length} / {leaders.length}</span></div>
                        <div>💰 Paid: <span style={{ color: 'var(--accent)', fontWeight: 800 }}>{leaders.filter(l => l[`paid_week${currentWeek}`] === true).length} / {leaders.length}</span></div>
                        <div>🏆 Pot: <span style={{ color: 'var(--gold)', fontWeight: 800 }}>${getCurrentPot()}</span></div>
                    </div>
                 </div>

                 <div className="glass" style={{ padding: '20px', textAlign: 'center' }}>
                   <h3 style={{ marginTop: 0 }}>⚙️ Game Control</h3>
                   <button className={picksVisible ? 'btn btn-danger' : 'btn btn-green'} onClick={togglePicksVisibility} style={{ fontSize: '15px', padding: '13px 26px' }}>
                     {picksVisible ? "✅ All Picks Visible — Click to Hide" : "🔒 Auto-Reveal at Kickoff — Click to Reveal All"}
                   </button>
                 </div>

                 <div className="glass" style={{ padding: '20px', textAlign: 'center' }}>
                   <h3 style={{ marginTop: 0 }}>🏆 Finalize Winner</h3>
                   <button className="btn btn-gold" onClick={finalizeWeekWinner} style={{ fontSize: '15px', padding: '13px 26px' }}>Finalize Week {currentWeek} Winner</button>
                 </div>

                {/* 💸 PAYMENT MATRIX */}
                <div className="glass" style={{ padding: '20px', overflowX: 'auto' }}>
                  <h3 style={{ marginTop: 0 }}>💸 Season Payment Matrix</h3>
                  <div style={{ marginBottom: '15px', textAlign: 'center', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button className="btn btn-ghost" onClick={() => toggleSelectAll()}>{selectedPaidUsers.length === leaders.length ? "Deselect All" : "Select All (Current Week)"}</button>
                      <button className="btn btn-green" onClick={markSelectedPaid} disabled={selectedPaidUsers.length === 0}>Mark Selected as Paid</button>
                  </div>
                  <table className="matrix-table">
                    <thead><tr><th className="matrix-sticky">Player</th><th style={{ color: 'var(--gold)' }}>🛡️SURV</th>{[...Array(18)].map((_, i) => i + 1).map(w => <th key={w}>W{w}</th>)}</tr></thead>
                    <tbody>
                      {leaders.map(player => (
                        <tr key={player.userId}>
                          <td className="matrix-sticky">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                              <input type="checkbox" checked={selectedPaidUsers.includes(player.userId)} onChange={() => toggleSelectUser(player.userId)} />
                              {getDisplayName(player)}
                            </label>
                          </td>
                          <td>
                            {player.survivor_optIn === true
                              ? <button onClick={() => toggleSurvivorPaid(player.userId, player.survivor_paid === true)} className="cell-chip" style={{ cursor: 'pointer', border: 'none', background: player.survivor_paid === true ? 'var(--gold-dim)' : 'rgba(255,255,255,0.05)', color: player.survivor_paid === true ? 'var(--gold)' : 'var(--muted)' }}>{player.survivor_paid === true ? '$' : '–'}</button>
                              : <span style={{ color: 'var(--muted)' }}>·</span>}
                          </td>
                          {[...Array(18)].map((_, i) => i + 1).map(w => {
                            const isPaid = player[`paid_week${w}`] === true;
                            return (
                              <td key={w}>
                                <button onClick={() => toggleWeekPayment(player.userId, w, isPaid)} className={`cell-chip ${isPaid ? 'cell-correct' : 'cell-hidden'}`} style={{ cursor: 'pointer', border: 'none', background: isPaid ? 'var(--accent-dim)' : 'rgba(255,255,255,0.05)' }}>{isPaid ? '$' : '–'}</button>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Admin Pick Entry */}
                <div className="glass" style={{ padding: '20px' }}>
                  <h3 style={{ marginTop: 0 }}>✍️ Admin Pick Entry</h3>
                  <select className="select" style={{ width: '100%' }} onChange={(e) => { const userObj = leaders.find(l => l.userId === e.target.value); setAdminTargetUser(userObj || null); if (userObj) { setAdminTargetPicks(userObj[`week${currentWeek}`] || {}); setAdminTargetTiebreaker(getTiebreakerFor(userObj, currentWeek) || ""); } else { setAdminTargetPicks({}); setAdminTargetTiebreaker(""); } }}>
                    <option value="">-- Select Player --</option>
                    {leaders.map(p => <option key={p.userId} value={p.userId}>{getDisplayName(p)}</option>)}
                  </select>
                  {adminTargetUser && <>
                    <div style={{ margin: '16px 0' }}>{renderPicksGrid(adminTargetPicks, setAdminTargetPicks, adminTargetTiebreaker, setAdminTargetTiebreaker, true)}</div>
                    <button className="btn btn-green" style={{ width: '100%', padding: '14px' }} onClick={submitAdminPicks}>Submit for {getDisplayName(adminTargetUser)}</button>
                    <button className="btn btn-danger" style={{ width: '100%', padding: '12px', marginTop: '10px' }} onClick={() => resetPicks(adminTargetUser.userId)}>Reset Week {currentWeek} Picks for {getDisplayName(adminTargetUser)}</button>
                  </>}
                </div>

                {/* Update Phone */}
                <div className="glass" style={{ padding: '20px' }}>
                  <h3 style={{ marginTop: 0 }}>✏️ Update Member Phone</h3>
                  <select className="select" style={{ width: '100%', marginBottom: '14px' }} value={adminProfileEmail} onChange={(e) => { setAdminProfileEmail(e.target.value); setAdminProfilePhone(phoneNumbers[sanitizeEmail(e.target.value)] || ""); }}>
                      <option value="">-- Select Member --</option>
                      {guestList.map(email => <option key={email} value={email}>{nicknames[sanitizeEmail(email)] ? `${nicknames[sanitizeEmail(email)]} (${email})` : email}</option>)}
                  </select>
                  {adminProfileEmail && (
                      <div style={{ display: 'flex', gap: '10px' }}>
                          <input className="input" style={{ flex: 1 }} value={adminProfilePhone} onChange={(e) => setAdminProfilePhone(e.target.value)} placeholder="Phone Number" />
                          <button className="btn btn-green" onClick={updateGuestPhone}>Update</button>
                      </div>
                  )}
                </div>

                {/* Guest list */}
                <div className="glass" style={{ padding: '20px' }}>
                  <h3 style={{ marginTop: 0 }}>👥 Guest List</h3>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input className="input" style={{ flex: 2 }} value={newEmailInput} onChange={(e) => setNewEmailInput(e.target.value)} placeholder="Email" />
                      <input className="input" style={{ flex: 1 }} value={newNicknameInput} onChange={(e) => setNewNicknameInput(e.target.value)} placeholder="Nickname" />
                    </div>
                    <input className="input" value={newPhoneInput} onChange={(e) => setNewPhoneInput(e.target.value)} placeholder="Phone (+15551234567)" />
                    <button className="btn btn-green" style={{ width: '100%', padding: '12px' }} onClick={addGuest}>Add Member</button>
                  </div>
                  {guestList.map(email => (
                    <div key={email} className="row" style={{ padding: '12px 4px' }}>
                      <div>
                        <span>{email}</span>
                        {nicknames[sanitizeEmail(email)] && <span style={{ marginLeft: '10px', color: 'var(--accent)' }}>({nicknames[sanitizeEmail(email)]})</span>}
                        {phoneNumbers[sanitizeEmail(email)] && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>📞 {phoneNumbers[sanitizeEmail(email)]}</div>}
                      </div>
                      <button className="btn btn-danger" style={{ padding: '5px 12px', fontSize: '12px' }} onClick={() => removeGuest(email)}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </main>
        </>
      )}

      {/* 🟢 NEWS TICKER */}
      <div className="ticker">
        <div className="ticker-tag"><span className="live-dot" />NFL Wire</div>
        <div className="ticker-track">
          {news.length > 0 ? news.map((n, i) => <span key={i}>🏈 {n.headline}</span>) : <span>Loading NFL news…</span>}
        </div>
      </div>
    </div>
  );
}

export default App;
