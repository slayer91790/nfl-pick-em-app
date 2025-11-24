import React, { useState, useEffect, useRef, useMemo } from 'react';
import { signInWithGoogle, db, auth } from './firebase';
import { doc, setDoc, collection, getDocs, updateDoc, deleteField, getDoc, arrayUnion, arrayRemove, writeBatch } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// --- CONFIG & DATA ---
const ALLOWED_EMAILS = [
  "slayer91790@gmail.com", "antoniodanielvazquez@gmail.com", "crazynphat13@gmail.com", "friend1@example.com"
];
const ADMIN_EMAILS = ["slayer91790@gmail.com", "antoniodanielvazquez@gmail.com"];

const PAST_STATS = [
  { name: "Albert", score: 89 }, { name: "Tony", score: 83 }, { name: "Omar", score: 83 }, 
  { name: "Andy", score: 79 }, { name: "Luis", score: 77 }, { name: "Art", score: 76 },
  { name: "Roman", score: 71 }, { name: "Tim", score: 69 }, { name: "Luis Solorio", score: 53 }, 
  { name: "Louis", score: 34 }
];

// Static History (Week 12 removed so we can prove auto-detection works)
const WEEKLY_WINNERS = [
  { week: 3, winner: "Omar" }, { week: 4, winner: "Luis" }, { week: 5, winner: "Albert" }, { week: 6, winner: "Roman" }, { week: 7, winner: "Albert" }, 
  { week: 8, winner: "Albert" }, { week: 9, winner: "Andy" }, { week: 10, winner: "Albert" }, { week: 11, winner: "Albert" }
];

const OLD_WEEKS = {
  3: { games: "BUF,MIN,PIT,PHI,TB,WSH,ATL,JAX,GB,IND,LAC,SEA,SF,CHI,KC,DET".split(",").map((w,i)=>({id:String(i), shortName:`G${i+1}`, winner:w})), picks: [] },
  4: { games: "SEA,PIT,ATL,BUF,DET,NE,LAC,PHI,HOU,LAR,JAX,KC,LV,GB,MIA,DEN".split(",").map((w,i)=>({id:String(i), shortName:`G${i+1}`, winner:w})), picks: [] },
  5: { games: "LAR,MIN,IND,NO,DAL,DEN,CAR,HOU,TEN,TB,WSH,DET,NE,JAX".split(",").map((w,i)=>({id:String(i), shortName:`G${i+1}`, winner:w})), picks: [] },
  10: { games: [{ id: '1', shortName: 'LV@DEN', winner: 'DEN', away: 'LV', home: 'DEN' },{ id: '2', shortName: 'ATL@IND', winner: 'IND', away: 'ATL', home: 'IND' },{ id: '3', shortName: 'BUF@MIA', winner: 'BUF', away: 'BUF', home: 'MIA' },{ id: '4', shortName: 'BAL@MIN', winner: 'BAL', away: 'BAL', home: 'MIN' },{ id: '5', shortName: 'CLE@NYJ', winner: 'CLE', away: 'CLE', home: 'NYJ' },{ id: '6', shortName: 'NE@TB', winner: 'NE', away: 'NE', home: 'TB' },{ id: '7', shortName: 'NO@CAR', winner: 'NO', away: 'NO', home: 'CAR' },{ id: '8', shortName: 'JAX@HOU', winner: 'JAX', away: 'JAX', home: 'HOU' },{ id: '9', shortName: 'NYG@CHI', winner: 'NYG', away: 'NYG', home: 'CHI' },{ id: '10', shortName: 'ARI@SEA', winner: 'ARI', away: 'ARI', home: 'SEA' },{ id: '11', shortName: 'LAR@SF', winner: 'LAR', away: 'LAR', home: 'SF' },{ id: '12', shortName: 'DET@WSH', winner: 'DET', away: 'DET', home: 'WSH' },{ id: '13', shortName: 'PIT@LAC', winner: 'PIT', away: 'PIT', home: 'LAC' },{ id: '14', shortName: 'PHI@GB', winner: 'PHI', away: 'PHI', home: 'GB' }], picks: [{ name: "Albert", score: 11, picks: ['DEN','IND','BUF','BAL','NYJ','NE','CAR','HOU','CHI','SEA','LAR','DET','PIT','PHI'] },{ name: "Andy", score: 8, picks: ['DEN','IND','BUF','MIN','CLE','TB','CAR','JAX','CHI','SEA','LAR','DET','LAC','PHI'] },{ name: "Art", score: 7, picks: ['LV','IND','BUF','BAL','CLE','TB','CAR','JAX','CHI','SEA','SF','DET','LAC','PHI'] }] }
};

const FUNNY_SOUND_FILES = ['/funny.mp3', '/ack.mp3', '/huh.mp3'];

function App() {
  const [user, setUser] = useState(null);
  const [games, setGames] = useState([]);
  const [picks, setPicks] = useState({});
  const [tiebreaker, setTiebreaker] = useState(""); 
  const [view, setView] = useState('dashboard'); 
  const [leaders, setLeaders] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(12); // Ensure this matches the week you want to view
  const [isAdmin, setIsAdmin] = useState(false);
  const [news, setNews] = useState([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  
  const [guestList, setGuestList] = useState([]);
  const [nicknames, setNicknames] = useState({});
  const [newEmailInput, setNewEmailInput] = useState("");
  const [newNicknameInput, setNewNicknameInput] = useState("");
  const [picksVisible, setPicksVisible] = useState(false); 
  const [selectedPaidUsers, setSelectedPaidUsers] = useState([]);
  const [adminTargetUser, setAdminTargetUser] = useState(null); 
  const [adminTargetPicks, setAdminTargetPicks] = useState({});
  const [adminTargetTiebreaker, setAdminTargetTiebreaker] = useState("");
  const [configLoaded, setConfigLoaded] = useState(false);

  const introRef = useRef(new Audio('/intro.mp3'));
  const funnySounds = useMemo(() => FUNNY_SOUND_FILES.map(file => new Audio(file)), []); 
  const musicPlayedRef = useRef(false);
  const sanitizeEmail = (email) => email.replace(/\./g, '_');

  // --- 1. Load Config ---
  useEffect(() => {
    const loadConfig = async () => {
      const configRef = doc(db, "config", "settings");
      const docSnap = await getDoc(configRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setGuestList(data.allowedEmails || []);
        setNicknames(data.nicknames || {});
        setPicksVisible(data.picksVisible || false); 
      } else {
        await setDoc(configRef, { allowedEmails: [...ALLOWED_EMAILS], nicknames: {}, picksVisible: false });
        setGuestList([...ALLOWED_EMAILS]);
      }
      setConfigLoaded(true);
    };
    loadConfig();
  }, []);

  // --- 2. Auth Listener ---
  useEffect(() => {
    if (!configLoaded) return; 
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        const email = currentUser.email.toLowerCase();
        const isAllowed = guestList.some(e => e.toLowerCase() === email) || ADMIN_EMAILS.some(e => e.toLowerCase() === email);
        if (isAllowed) {
          setUser(currentUser);
          setIsAdmin(ADMIN_EMAILS.some(e => e.toLowerCase() === email));
          if (!musicPlayedRef.current) { try { introRef.current.volume = 0.5; introRef.current.play().catch(() => {}); musicPlayedRef.current = true; } catch (e) {} }
        } else { alert(`🚫 Access Denied`); auth.signOut(); }
      } else { setUser(null); }
    });
    return () => unsubscribe();
  }, [configLoaded, guestList]);

  // --- 3. Data Fetching ---
  useEffect(() => {
    const fetchData = async () => {
      const weekNum = Number(currentWeek);
      if (OLD_WEEKS[weekNum]) {
        const archive = OLD_WEEKS[weekNum];
        setGames(archive.games.map((g, i) => ({ 
            id: g.id || String(i), 
            status: { type: { shortDetail: 'Final' } }, 
            winner: g.winner, 
            competitions: [{ competitors: [
                { homeAway: 'home', team: { abbreviation: g.home || g.winner, logo: '' }, score: g.winner===g.home?'W':'-' },
                { homeAway: 'away', team: { abbreviation: g.away || 'OPP', logo: '' }, score: g.winner===g.away?'W':'-' }
            ] }] 
        })));
        setLeaders(archive.picks.length > 0 ? archive.picks.map(p => ({ userName: p.name, userId: p.name, paid: true, [`week${currentWeek}`]: p.picks.reduce((acc, pick, i) => ({ ...acc, [archive.games[i].id || String(i)]: pick }), {}) })) : []);
        return; 
      }
      try {
        const gamesRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${currentWeek}&seasontype=2`);
        const gamesData = await gamesRes.json();
        const processedGames = (gamesData.events || []).map(g => {
            // FIX: Robust Winner Detection (Score Check)
            const comp = g.competitions[0];
            const home = comp.competitors.find(c => c.homeAway === 'home');
            const away = comp.competitors.find(c => c.homeAway === 'away');
            
            let winner = comp.competitors.find(c => c.winner === true)?.team.abbreviation;
            
            // Fallback: If no explicit winner tag, check scores if Final
            if (!winner && g.status.type.completed) {
                const homeScore = parseInt(home.score);
                const awayScore = parseInt(away.score);
                if (homeScore > awayScore) winner = home.team.abbreviation;
                else if (awayScore > homeScore) winner = away.team.abbreviation;
            }

            const odds = g.competitions[0].odds && g.competitions[0].odds[0] ? g.competitions[0].odds[0].details : "";
            return { ...g, winner, oddsString: odds };
        });
        setGames(processedGames);
        
        const querySnapshot = await getDocs(collection(db, "picks_2025"));
        const loadedLeaders = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          loadedLeaders.push(data);
        });
        setLeaders(loadedLeaders);

        if (user) {
            const myEntry = loadedLeaders.find(l => l.userId === user.uid);
            if (myEntry && myEntry[`week${currentWeek}`]) {
                setHasSubmitted(true);
                setPicks(myEntry[`week${currentWeek}`]);
                setTiebreaker(myEntry.tiebreaker || "");
            } else { setHasSubmitted(false); }
        }
        const newsRes = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/news');
        const newsData = await newsRes.json();
        setNews(newsData.articles || []);
      } catch (error) { console.error("API Error", error); }
    };
    const refreshInterval = setInterval(fetchData, 60000); 
    fetchData();
    return () => clearInterval(refreshInterval);
  }, [currentWeek, user]);

  // --- HELPERS ---
  const getDisplayName = (player) => nicknames[sanitizeEmail(player.userId)] || nicknames[player.userId] || player.userName || "Player";
  const getCellColor = (pick, winner) => { if (!pick) return '#666'; if (!winner) return '#fff'; return pick === winner ? '#28a745' : '#d9534f'; };
  const calculateStats = (gameId, team) => {
    if (!leaders.length) return 0;
    let pickCount = 0;
    leaders.forEach((player) => { const weekPicks = player[`week${currentWeek}`] || {}; if (weekPicks[gameId] === team) pickCount += 1; });
    return Math.round((pickCount / leaders.length) * 100);
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

  // Total Season Wins: Use hardcoded PAST + Live
  const getTotalSeasonWins = (player) => {
      const pastData = PAST_STATS.find(p => p.name === getDisplayName(player));
      const pastScore = pastData ? pastData.score : 0;
      // NOTE: In a real DB we would sum up all week fields.
      // Here we assume we are VIEWING Week 12 (or current) so we add that score.
      // If user switches dropdown to Week 13, this "Live" score will be 0 until games start.
      return pastScore + getCorrectCountForPlayer(player);
  };

  // 🔥 CLINCHING LOGIC
  const getWinProbability = (player, allPlayers) => {
      if (!games.length) return 0;
      const correct = getCorrectCountForPlayer(player);
      const remaining = games.filter(g => !g.winner).length;
      const maxPossible = correct + remaining;
      
      const leaderScore = Math.max(0, ...allPlayers.map(p => getCorrectCountForPlayer(p)));
      
      if (maxPossible < leaderScore) return 0; 
      if (remaining === 0) return correct === leaderScore ? 100 : 0;

      const pointsBehind = leaderScore - correct;
      if (pointsBehind === 0) return 60; 
      if (pointsBehind === 1) return 30;
      return 10; 
  };
  
  const getDeclaredWinner = () => {
      if (games.length === 0) return null;
      const winner = leaders.find(p => getWinProbability(p, leaders) === 100);
      // If multiple people tied at 100% (finished games), use tiebreaker logic visually (not implemented fully here)
      return winner;
  };

  const getSimilarSelections = () => {
    if (!picks || Object.keys(picks).length === 0) return [];
    return leaders.filter(p => p.userId !== user.uid).map(player => {
        const theirPicks = player[`week${currentWeek}`] || {};
        let diff = 0;
        games.forEach(g => { if (picks[g.id] && theirPicks[g.id] && picks[g.id] !== theirPicks[g.id]) diff++; });
        return { name: getDisplayName(player), diff };
    }).sort((a, b) => a.diff - b.diff);
  };

  // --- ACTIONS ---
  const handleLogin = async () => { try { await signInWithGoogle(); } catch (e) { console.error(e); } };
  const handleLogout = () => { auth.signOut(); window.location.reload(); };

  const selectTeam = (gameId, teamAbbr, oddsString, targetPicksState, setTargetPicksState) => {
    if (hasSubmitted && !setTargetPicksState) return;
    const setPicksFunc = setTargetPicksState || setPicks;
    setPicksFunc((prev) => ({ ...prev, [gameId]: teamAbbr }));
    if (oddsString && (oddsString.includes('+') || oddsString.includes('-'))) {
      const match = oddsString.match(/([A-Z]{2,3})\s*([+-]?)(\d+\.?\d*)/); 
      if (match) {
        const [full, teamInOdds, sign, num] = match;
        const magnitude = parseFloat(num);
        if (magnitude >= 8) {
            if ((sign === '-' && teamAbbr !== teamInOdds) || (sign === '+' && teamAbbr === teamInOdds)) { 
                const randomIndex = Math.floor(Math.random() * funnySounds.length);
                try { funnySounds[randomIndex].currentTime = 0; funnySounds[randomIndex].play(); } catch(e) {}
            }
        }
      }
    }
  };

  const submitPicks = async () => {
    if (!user) return;
    if (Object.keys(picks).length < games.length) { alert(`Incomplete! ${Object.keys(picks).length}/${games.length} picked.`); return; }
    if (!tiebreaker) { alert("Enter Tiebreaker Score"); return; }
    try {
      await setDoc(doc(db, "picks_2025", user.uid), {
        userId: user.uid, userName: user.displayName, photo: user.photoURL,
        [`week${currentWeek}`]: picks, tiebreaker, timestamp: new Date()
      }, { merge: true });
      alert("✅ Picks Saved!"); setHasSubmitted(true); window.location.reload();
    } catch (error) { alert("Error"); }
  };
  
  // --- ADMIN ACTIONS ---
  const toggleSelectUser = (userId) => { setSelectedPaidUsers(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]); };
  const toggleSelectAll = () => { if (selectedPaidUsers.length === leaders.length) { setSelectedPaidUsers([]); } else { setSelectedPaidUsers(leaders.map(l => l.userId)); } };

  const markSelectedPaid = async () => {
    if (!selectedPaidUsers.length) return;
    try {
      const batch = writeBatch(db);
      selectedPaidUsers.forEach((uid) => { batch.update(doc(db, "picks_2025", uid), { [`paid_week${currentWeek}`]: true }); });
      await batch.commit();
      alert(`✅ Users Paid!`); setSelectedPaidUsers([]); window.location.reload(); 
    } catch (e) { alert("Error"); }
  };
  const toggleWeekPayment = async (userId, weekNum, currentStatus) => {
     const ref = doc(db, "picks_2025", userId);
     await updateDoc(ref, { [`paid_week${weekNum}`]: !currentStatus });
     setLeaders(prev => prev.map(player => {
         if (player.userId === userId) { return { ...player, [`paid_week${weekNum}`]: !currentStatus }; }
         return player;
     }));
  };
  const submitAdminPicks = async () => {
    if (!adminTargetUser) return;
    await setDoc(doc(db, "picks_2025", adminTargetUser.userId), {
        userId: adminTargetUser.userId, userName: adminTargetUser.userName, photo: adminTargetUser.photo,
        [`week${currentWeek}`]: adminTargetPicks, tiebreaker: adminTargetTiebreaker, timestamp: new Date()
      }, { merge: true });
      alert(`✅ Saved for ${adminTargetUser.userName}!`); window.location.reload();
  };
  const addGuest = async () => {
    if (!newEmailInput) return;
    const email = newEmailInput.toLowerCase().trim();
    await updateDoc(doc(db, "config", "settings"), { allowedEmails: arrayUnion(email), [`nicknames.${sanitizeEmail(email)}`]: newNicknameInput.trim() });
    alert(`✅ Added ${email}`); window.location.reload();
  };
  const removeGuest = async (email) => { if (window.confirm("Remove?")) await updateDoc(doc(db, "config", "settings"), { allowedEmails: arrayRemove(email) }); window.location.reload(); };
  const togglePicksVisibility = async () => { const newState = !picksVisible; await updateDoc(doc(db, "config", "settings"), { picksVisible: newState }); setPicksVisible(newState); window.location.reload(); };
  const resetPicks = async (userId) => { if (window.confirm("Reset?")) await updateDoc(doc(db, "picks_2025", userId), { [`week${currentWeek}`]: deleteField(), tiebreaker: deleteField() }); window.location.reload(); };

  // --- RENDER HELPERS ---
  const renderPicksGrid = (targetPicks, setTargetPicks, targetTiebreaker, setTargetTiebreaker, isReadOnly = false) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px', maxWidth: '800px', margin: '0 auto' }}>
        {games.map((game) => {
          const home = game.competitions[0].competitors.find(c => c.homeAway === 'home');
          const away = game.competitions[0].competitors.find(c => c.homeAway === 'away');
          if (!home || !away) return null;
          const odds = game.oddsString || ""; 
          const myPick = targetPicks[game.id];
          const select = () => selectTeam(game.id, away.team.abbreviation, odds, targetPicks, setTargetPicks);
          const selectHome = () => selectTeam(game.id, home.team.abbreviation, odds, targetPicks, setTargetPicks);
          const isLocked = hasSubmitted && !setTargetPicks && !isReadOnly;
          
          return (
            <div key={game.id} style={{ backgroundColor: '#fff', borderRadius: '15px', overflow: 'hidden', color: 'black', opacity: isLocked ? 0.5 : 1 }}>
              <div style={{ backgroundColor: '#f0f0f0', padding: '8px', textAlign: 'center', fontSize: '11px', color: '#666', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', paddingLeft: '15px', paddingRight: '15px' }}><span>{game.status.type.shortDetail}</span><span style={{color: '#d9534f'}}>{odds}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '15px', alignItems: 'center' }}>
                <div onClick={isReadOnly || isLocked ? null : select} style={{ flex: 1, textAlign: 'center', cursor: isReadOnly || isLocked ? 'default' : 'pointer', border: myPick === away.team.abbreviation ? '2px solid #28a745' : '2px solid transparent', borderRadius: '10px', padding: '10px', backgroundColor: myPick === away.team.abbreviation ? '#e6fffa' : 'transparent' }}><img src={away.team.logo} style={{ width: '45px' }} /><div style={{ fontWeight: 'bold', fontSize: '14px' }}>{away.team.abbreviation}</div></div>
                <div style={{ color: '#ccc', fontWeight: 'bold' }}>@</div>
                <div onClick={isReadOnly || isLocked ? null : selectHome} style={{ flex: 1, textAlign: 'center', cursor: isReadOnly || isLocked ? 'default' : 'pointer', border: myPick === home.team.abbreviation ? '2px solid #28a745' : '2px solid transparent', borderRadius: '10px', padding: '10px', backgroundColor: myPick === home.team.abbreviation ? '#e6fffa' : 'transparent' }}><img src={home.team.logo} style={{ width: '45px' }} /><div style={{ fontWeight: 'bold', fontSize: '14px' }}>{home.team.abbreviation}</div></div>
              </div>
            </div>
          );
        })}
        <div style={{ gridColumn: '1 / -1', backgroundColor: '#333', padding: '20px', borderRadius: '15px', textAlign: 'center' }}>
          <h3>Tiebreaker: MNF Score</h3>
          <input type="number" value={targetTiebreaker} onChange={isReadOnly || (hasSubmitted && !setTargetTiebreaker) ? null : (e) => setTargetTiebreaker(e.target.value)} placeholder="e.g. 45" style={{ padding: '10px', borderRadius: '5px', border: 'none', fontSize: '20px', width: '100px', textAlign: 'center' }} readOnly={isReadOnly || (hasSubmitted && !setTargetTiebreaker)} />
        </div>
    </div>
  );

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', color: 'white', paddingBottom: '80px', backgroundImage: "linear-gradient(rgba(0,0,0,0.85), rgba(0,0,0,0.9)), url('/bg.jpg')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      <div style={{ padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <h1 style={{ fontSize: '18px', margin: 0, color: '#fff' }}>🏈 Pick 'Em Pro</h1>
        {user && ( <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}><img src={user.photoURL} referrerPolicy="no-referrer" style={{ width: '35px', borderRadius: '50%', border: '2px solid #28a745' }} /><button onClick={handleLogout} style={{ backgroundColor: '#d9534f', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '5px', fontSize: '12px', cursor: 'pointer' }}>Logout</button></div> )}
      </div>
      {!user ? ( <div style={{ textAlign: 'center', marginTop: '150px' }}><button onClick={handleLogin} style={{ padding: '15px 40px', fontSize: '18px', backgroundColor: '#4285F4', color: 'white', border: 'none', borderRadius: '50px', cursor: 'pointer', fontWeight: 'bold' }}>Enter League</button></div> ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', margin: '20px 0', flexWrap: 'wrap' }}>
            <button onClick={() => setView('dashboard')} style={{ padding: '8px 20px', borderRadius: '30px', border: 'none', backgroundColor: view === 'dashboard' ? '#28a745' : '#333', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>Dashboard</button>
            <button onClick={() => setView('picks')} style={{ padding: '8px 20px', borderRadius: '30px', border: hasSubmitted ? '2px solid #28a745' : 'none', backgroundColor: view === 'picks' ? '#28a745' : '#333', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>{hasSubmitted ? "✅ My Picks" : "Make Picks"}</button>
            <button onClick={() => setView('matrix')} style={{ padding: '8px 20px', borderRadius: '30px', border: 'none', backgroundColor: view === 'matrix' ? '#28a745' : '#333', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>All Picks</button>
            <button onClick={() => setView('projections')} style={{ padding: '8px 20px', borderRadius: '30px', border: 'none', backgroundColor: view === 'projections' ? '#28a745' : '#333', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>Projections</button>
            <button onClick={() => setView('winners')} style={{ padding: '8px 20px', borderRadius: '30px', border: 'none', backgroundColor: view === 'winners' ? '#28a745' : '#333', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>Winners</button>
            {isAdmin && <button onClick={() => setView('admin')} style={{ padding: '8px 20px', borderRadius: '30px', border: '2px solid gold', backgroundColor: view === 'admin' ? 'gold' : 'transparent', color: view === 'admin' ? 'black' : 'gold', fontWeight: 'bold', cursor: 'pointer' }}>👑 Admin</button>}
          </div>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}><select value={currentWeek} onChange={(e) => setCurrentWeek(e.target.value)} style={{ padding: '8px 15px', borderRadius: '10px', backgroundColor: '#222', color: 'white', border: '1px solid #444', fontSize: '16px' }}>{[...Array(18)].map((_, i) => <option key={i+1} value={i+1}>Week {i+1}</option>)}</select></div>
          <div style={{ maxWidth: '100%', overflowX: 'auto', padding: '0 15px' }}>
            
            {/* === DASHBOARD === */}
            {view === 'dashboard' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', maxWidth: '800px', margin: '0 auto' }}>
                <div><div style={{ fontSize: '14px', fontWeight: 'bold', color: '#888', marginBottom: '10px', textTransform: 'uppercase' }}>Live Scores</div><div style={{ display: 'flex', gap: '15px', overflowX: 'auto', paddingBottom: '10px' }}>{games.map((game) => { const home = game.competitions[0].competitors.find(c => c.homeAway === 'home'); const away = game.competitions[0].competitors.find(c => c.homeAway === 'away'); if (!home || !away) return null; return (<div key={game.id} style={{ minWidth: '200px', backgroundColor: '#1e1e1e', padding: '15px', borderRadius: '15px', border: '1px solid #333', flexShrink: 0 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}><span style={{fontWeight:'bold'}}>{away.team.abbreviation}</span><span style={{fontWeight:'bold'}}>{away.score}</span></div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}><span style={{fontWeight:'bold'}}>{home.team.abbreviation}</span><span style={{fontWeight:'bold'}}>{home.score}</span></div><div style={{ fontSize: '10px', color: '#28a745' }}>{game.status.type.shortDetail}</div></div>) })}</div></div>
                
                <div style={{ backgroundColor: '#1e1e1e', borderRadius: '15px', overflow: 'hidden', border: '1px solid #333' }}>
                   <div style={{ padding: '15px', borderBottom: '1px solid #333', fontWeight: 'bold', color: '#888', fontSize: '12px', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}><span>Player Status (Week {currentWeek})</span><span>Paid / Picked</span></div>
                   {leaders.map((player) => {
                      const weekPicks = player[`week${currentWeek}`] ? Object.keys(player[`week${currentWeek}`]).length : 0;
                      const isPaid = player[`paid_week${currentWeek}`] === true;
                      return (
                      <div key={player.userId} style={{ padding: '20px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                          {player.photo && <img src={player.photo} referrerPolicy="no-referrer" style={{ width: '40px', borderRadius: '50%', border: '1px solid #555' }} />}
                          <div style={{ fontWeight: 'bold', color: 'white' }}>{getDisplayName(player)}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                            <div style={{ backgroundColor: isPaid ? '#28a745' : '#d9534f', padding:'4px 8px', borderRadius:'5px', fontSize:'10px', fontWeight:'bold' }}>{isPaid ? 'PAID' : 'UNPAID'}</div>
                            <div style={{ color: weekPicks > 0 ? '#28a745' : '#666', fontSize: '20px' }}>{weekPicks > 0 ? '✅' : '⏳'}</div>
                        </div>
                      </div>
                   )})}
                </div>
                
                {/* Total Season Standings on Dashboard */}
                <div style={{ backgroundColor: '#1e1e1e', borderRadius: '15px', overflow: 'hidden', border: '1px solid #333' }}>
                  <div style={{ padding: '15px', backgroundColor: '#333', fontWeight: 'bold', color: 'white', fontSize: '14px' }}>🏆 Full Season Leaderboard (Live)</div>
                  {leaders.sort((a,b) => getTotalSeasonWins(b) - getTotalSeasonWins(a)).map((player, index) => (
                    <div key={player.userId} style={{ padding: '20px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                         <div style={{ width: '25px', height: '25px', borderRadius: '50%', backgroundColor: index===0?'gold':'#444', color: index===0?'black':'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px' }}>{index+1}</div>
                         <div style={{ fontWeight: 'bold', color: 'white' }}>{getDisplayName(player)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}><div style={{ color: '#28a745', fontWeight: 'bold' }}>{getTotalSeasonWins(player)} Correct</div></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* === PROJECTIONS === */}
            {view === 'projections' && (
                <div style={{ maxWidth: '800px', margin: '0 auto', backgroundColor: '#1e1e1e', borderRadius: '15px', border: '1px solid #333', overflow:'hidden' }}>
                     {getDeclaredWinner() && (
                         <div style={{ backgroundColor: '#28a745', padding: '20px', textAlign: 'center', color: 'white' }}>
                             <div style={{fontSize:'30px'}}>🏆 WINNER DECLARED 🏆</div>
                             <h1 style={{margin:'10px 0'}}>{getDisplayName(getDeclaredWinner())}</h1>
                             <p>100% Probability to Win Week {currentWeek}</p>
                         </div>
                     )}
                     <div style={{ padding: '15px', backgroundColor: '#333', fontWeight: 'bold', color: 'white', fontSize: '14px' }}>📈 Live Win Probability (Week {currentWeek})</div>
                     <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: 'white' }}>
                        <thead><tr><th style={{textAlign:'left', padding:'15px'}}>Player</th><th>Current</th><th>Projected</th><th>Win %</th></tr></thead>
                        <tbody>
                            {leaders.sort((a,b) => getWinProbability(b, leaders) - getWinProbability(a, leaders)).map(p => {
                                const prob = getWinProbability(p, leaders);
                                return (
                                    <tr key={p.userId} style={{ borderTop: '1px solid #444' }}>
                                        <td style={{ padding: '15px', fontWeight: 'bold' }}>{getDisplayName(p)}</td>
                                        <td style={{ textAlign: 'center', color: '#28a745', fontWeight:'bold' }}>{getCorrectCountForPlayer(p)}</td>
                                        <td style={{ textAlign: 'center' }}>{getProjectedWins(p)}</td>
                                        <td style={{ textAlign: 'center', fontWeight:'bold', color: prob > 50 ? '#28a745' : (prob === 0 ? '#666' : 'gold') }}>{prob === 100 ? "🏆 CLINCHED" : (prob === 0 ? "❌ ELIM" : `${prob}%`)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                     </table>
                </div>
            )}

            {/* === MATRIX === */}
            {view === 'matrix' && (
              <div style={{ overflowX: 'auto', backgroundColor: '#1e1e1e', borderRadius: '15px', border: '1px solid #333', padding: '10px', margin: '0 auto' }}>
                <div style={{ padding: '15px', backgroundColor: '#444', fontWeight: 'bold', color: 'white', fontSize: '14px', marginBottom: '10px' }}>🔗 Similar Selections</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>{getSimilarSelections().map((sim, i) => (<div key={i} style={{ backgroundColor: '#333', padding: '8px', borderRadius: '5px', fontSize: '12px', flex: '1 1 40%', border: '1px solid #555' }}><span style={{ fontWeight: 'bold', color: '#28a745' }}>{sim.diff} Diff:</span> {sim.name}</div>))}</div>
                <div style={{textAlign:'center', padding:'10px', color: '#888', fontWeight:'bold'}}>{Number(currentWeek) < 12 || picksVisible ? "✅ PICKS REVEALED" : "🔒 PICKS HIDDEN"}</div>
                {/* Matrix Table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: 'white' }}>
                  <thead><tr><th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid #444', minWidth: '100px', position: 'sticky', left: 0, backgroundColor: '#1e1e1e' }}>Player</th>{games.map(g => { const away = g.competitions[0].competitors.find(c => c.homeAway === 'away')?.team.abbreviation; return <th key={g.id} style={{ padding: '5px', borderBottom: '1px solid #444', minWidth: '40px' }}>{away}</th> })}<th style={{ padding: '5px', borderBottom: '1px solid #444' }}>Tie</th><th style={{ padding: '5px', borderBottom: '1px solid #444' }}>Correct</th><th style={{ padding: '5px', borderBottom: '1px solid #444', color:'gold' }}>Proj</th></tr></thead>
                  <tbody>
                    {leaders.map(player => {
                      const playerPicks = player[`week${currentWeek}`] || {};
                      const showPicks = Number(currentWeek) < 12 || picksVisible || isAdmin || (user && player.userId === user.uid);
                      return (
                        <tr key={player.userId}>
                          <td style={{ padding: '10px', borderBottom: '1px solid #333', fontWeight: 'bold', position: 'sticky', left: 0, backgroundColor: '#1e1e1e' }}>{getDisplayName(player)}</td>
                          {games.map(g => {
                            const pick = playerPicks[g.id];
                            const color = Number(currentWeek) < 12 ? getCellColor(pick, g.winner) : (showPicks && pick ? (g.winner ? getCellColor(pick, g.winner) : 'white') : '#666');
                            return <td key={g.id} style={{ padding: '10px', borderBottom: '1px solid #333', textAlign: 'center', backgroundColor: showPicks ? color : 'transparent', color: showPicks && (pick === g.winner || !g.winner) ? 'black' : 'white' }}>{showPicks ? (pick || "-") : "🔒"}</td>
                          })}
                          <td style={{ padding: '10px', borderBottom: '1px solid #333', textAlign: 'center' }}>{showPicks ? (player.tiebreaker || "-") : "🔒"}</td>
                          <td style={{ padding: '10px', borderBottom: '1px solid #333', textAlign: 'center', color: '#28a745', fontWeight:'bold' }}>{getCorrectCountForPlayer(player)}</td>
                          <td style={{ padding: '10px', borderBottom: '1px solid #333', textAlign: 'center', color: 'gold' }}>{getProjectedWins(player)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* === WEEKLY WINNERS === */}
            {view === 'winners' && (
                <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '30px' }}>
                    <div style={{ backgroundColor: '#1e1e1e', borderRadius: '15px', border: '1px solid #333', padding:'20px' }}>
                        {/* LIVE WINNER BANNER */}
                        {getDeclaredWinner() && Number(currentWeek) >= 12 && (
                             <div style={{ backgroundColor: '#28a745', padding: '15px', textAlign: 'center', color: 'white', borderRadius:'10px', marginBottom:'20px' }}>
                                 <div style={{fontSize:'20px'}}>🏆 WEEK {currentWeek} WINNER 🏆</div>
                                 <h1 style={{margin:'10px 0'}}>{getDisplayName(getDeclaredWinner())}</h1>
                             </div>
                        )}
                        <h3 style={{ textAlign:'center', marginTop:0, color:'gold' }}>🏅 Weekly Winners</h3>
                        {WEEKLY_WINNERS.map(w => (
                            <div key={w.week} style={{ display:'flex', justifyContent:'space-between', padding:'15px', borderBottom:'1px solid #333' }}>
                                <span style={{color:'#888', fontWeight:'bold'}}>Week {w.week}</span>
                                <span style={{fontWeight:'bold', fontSize:'16px'}}>{w.winner}</span>
                            </div>
                        ))}
                    </div>
                    
                    {/* Full Season Leaderboard */}
                    <div style={{ backgroundColor: '#1e1e1e', borderRadius: '15px', overflow: 'hidden', border: '1px solid #333' }}>
                      <div style={{ padding: '15px', backgroundColor: '#333', fontWeight: 'bold', color: 'white', fontSize: '14px', textAlign:'center' }}>🏆 Full Season Leaderboard (Live)</div>
                      {leaders.sort((a,b) => getTotalSeasonWins(b) - getTotalSeasonWins(a)).map((player, index) => (
                        <div key={player.userId} style={{ padding: '20px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                             <div style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: index===0?'gold':(index===1?'silver':(index===2?'#cd7f32':'#444')), color: index<3?'black':'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '14px' }}>{index+1}</div>
                             <div style={{ fontWeight: 'bold', color: 'white', fontSize:'16px' }}>{getDisplayName(player)}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}><div style={{ color: '#28a745', fontWeight: 'bold', fontSize:'18px' }}>{getTotalSeasonWins(player)} Wins</div></div>
                        </div>
                      ))}
                    </div>
                </div>
            )}

            {/* === PICKS === */}
            {view === 'picks' && (
              <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 15px' }}>
                {renderPicksGrid(picks, setPicks, tiebreaker, setTiebreaker, false)}
                <button onClick={hasSubmitted ? null : submitPicks} style={{ position: 'fixed', bottom: '25px', left: '50%', transform: 'translateX(-50%)', width: '80%', maxWidth: '400px', padding: '18px', backgroundColor: hasSubmitted ? '#888' : (Object.keys(picks).length === games.length && tiebreaker ? '#28a745' : '#555'), color: 'white', fontSize: '18px', fontWeight: 'bold', border: 'none', borderRadius: '50px', boxShadow: '0 5px 20px rgba(0,0,0,0.5)', cursor: hasSubmitted ? 'default' : (Object.keys(picks).length === games.length && tiebreaker ? 'pointer' : 'not-allowed'), zIndex: 100 }}>
                    {hasSubmitted ? "✅ Picks Submitted (Locked)" : (Object.keys(picks).length === games.length ? "Submit All Picks" : `Pick ${games.length - Object.keys(picks).length} More`)}
                </button>
              </div>
            )}

            {/* === ADMIN === */}
            {view === 'admin' && isAdmin && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '800px', margin: '0 auto' }}>
                 <div style={{ backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '15px', border: '1px solid #333', textAlign: 'center' }}>
                    <h3>📊 Weekly Stats</h3>
                    <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                        <div>📝 Submitted: <span style={{color:'#28a745', fontWeight:'bold'}}>{leaders.filter(l => l[`week${currentWeek}`]).length} / {leaders.length}</span></div>
                        <div>💰 Paid: <span style={{color:'#28a745', fontWeight:'bold'}}>{leaders.filter(l => l[`paid_week${currentWeek}`] === true).length} / {leaders.length}</span></div>
                        <div>🏆 Pot: <span style={{color:'gold', fontWeight:'bold'}}>${leaders.length * 10}</span></div>
                    </div>
                 </div>

                <div style={{ backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '15px', border: '1px solid #333', textAlign: 'center' }}><h3>⚙️ Game Control</h3><button onClick={togglePicksVisibility} style={{ padding: '15px 30px', borderRadius: '5px', border: 'none', cursor: 'pointer', backgroundColor: picksVisible ? '#d9534f' : '#28a745', color: 'white', fontSize: '18px', fontWeight: 'bold' }}>{picksVisible ? "✅ Picks are Visible" : "⚠ Waiting for Kickoff? Click to Reveal"}</button></div>
                
                {/* 💸 PAYMENT MATRIX */}
                <div style={{ overflowX: 'auto', backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '15px', border: '1px solid #333' }}>
                  <h3>💸 Season Payment Matrix</h3>
                  <div style={{marginBottom:'15px', textAlign:'center'}}>
                      <button onClick={() => toggleSelectAll()} style={{ marginRight:'10px', padding:'8px 15px', borderRadius:'5px', border:'1px solid #666', background:'transparent', color:'white', cursor:'pointer' }}>{selectedPaidUsers.length === leaders.length ? "Deselect All" : "Select All (Current Week)"}</button>
                      <button onClick={markSelectedPaid} disabled={selectedPaidUsers.length === 0} style={{ backgroundColor: selectedPaidUsers.length > 0 ? '#28a745' : '#555', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: selectedPaidUsers.length > 0 ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}>Mark Selected as Paid</button>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: 'white' }}>
                    <thead><tr><th style={{textAlign:'left', padding:'10px'}}>Player</th>{[12,13,14,15,16,17,18].map(w => <th key={w} style={{padding:'10px'}}>W{w}</th>)}</tr></thead>
                    <tbody>
                      {leaders.map(player => (
                        <tr key={player.userId} style={{ borderTop: '1px solid #444' }}>
                          <td style={{ padding: '10px', fontWeight: 'bold', display:'flex', alignItems:'center', gap:'10px' }}>
                              <input type="checkbox" checked={selectedPaidUsers.includes(player.userId)} onChange={() => toggleSelectUser(player.userId)} />
                              {getDisplayName(player)}
                          </td>
                          {[12,13,14,15,16,17,18].map(w => {
                            const isPaid = player[`paid_week${w}`] === true;
                            return (
                              <td key={w} style={{ textAlign: 'center', padding: '10px' }}>
                                <button onClick={() => toggleWeekPayment(player.userId, w, isPaid)} style={{ cursor: 'pointer', border: 'none', borderRadius: '5px', padding: '5px 10px', backgroundColor: isPaid ? '#28a745' : '#555', color: 'white' }}>{isPaid ? '$' : '-'}</button>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Admin Pick Entry & Guest List */}
                <div style={{ backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '15px', border: '1px solid #333' }}><h3>✍️ Admin Pick Entry</h3><select onChange={(e) => { const userObj = leaders.find(l => l.userId === e.target.value); setAdminTargetUser(userObj); if (userObj) { setAdminTargetPicks(userObj[`week${currentWeek}`] || {}); setAdminTargetTiebreaker(userObj.tiebreaker || ""); } else { setAdminTargetPicks({}); setAdminTargetTiebreaker(""); } }} style={{ padding: '10px', borderRadius: '5px', width: '100%' }}><option value="">-- Select Player --</option>{leaders.map(p => <option key={p.userId} value={p.userId}>{getDisplayName(p)}</option>)}</select>{adminTargetUser && <>{renderPicksGrid(adminTargetPicks, setAdminTargetPicks, adminTargetTiebreaker, setAdminTargetTiebreaker, true)}<button onClick={submitAdminPicks} style={{ marginTop: '20px', padding: '15px', backgroundColor: '#28a745', color: 'white', width: '100%', border: 'none', borderRadius: '5px' }}>Submit for {getDisplayName(adminTargetUser)}</button></>}</div>
                <div style={{ backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '15px', border: '1px solid #333' }}><h3>👥 Guest List</h3><div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}><input value={newEmailInput} onChange={(e) => setNewEmailInput(e.target.value)} placeholder="Email" style={{ flex: 2, padding: '10px', borderRadius: '5px' }} /><input value={newNicknameInput} onChange={(e) => setNewNicknameInput(e.target.value)} placeholder="Nickname" style={{ flex: 1, padding: '10px', borderRadius: '5px' }} /><button onClick={addGuest} style={{ backgroundColor: '#28a745', color: 'white', border: 'none', padding: '10px', borderRadius: '5px' }}>Add</button></div>{guestList.map(email => <div key={email} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid #333' }}><div><span style={{color: 'white'}}>{email}</span>{nicknames[sanitizeEmail(email)] && <span style={{marginLeft: '10px', color: '#28a745'}}>({nicknames[sanitizeEmail(email)]})</span>}</div><button onClick={() => removeGuest(email)} style={{ color: '#ff4444', background: 'none', border: 'none' }}>X</button></div>)}</div>
              </div>
            )}
          </div>
        </>
      )}
      {user && news.length > 0 && <div style={{ position: 'fixed', bottom: 0, left: 0, width: '100%', backgroundColor: '#000', color: 'white', borderTop: '2px solid #28a745', overflow: 'hidden', whiteSpace: 'nowrap', zIndex: 1000 }}><div style={{ display: 'inline-block', padding: '10px', animation: 'ticker 30s linear infinite' }}>{news.map((n, i) => <span key={i} style={{ marginRight: '50px', fontSize: '14px', fontWeight: 'bold' }}>🏈 {n.headline}</span>)}</div><style>{`@keyframes ticker { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }`}</style></div>}
    </div>
  );
}

export default App;