import React, { useState, useEffect, useRef } from 'react';
import { signInWithGoogle, db, auth } from './firebase';
import { doc, setDoc, collection, getDocs, updateDoc, deleteField, getDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// ==========================================
// 🔒 CONFIG
// ==========================================
const ALLOWED_EMAILS = [
  "slayer91790@gmail.com",
  "antoniodanielvazquez@gmail.com",
  "crazynphat13@gmail.com",
  "friend1@example.com"
];

const ADMIN_EMAILS = [
  "slayer91790@gmail.com", 
  "antoniodanielvazquez@gmail.com"
];

const PAST_STATS = [
  { name: "Albert",       score: 89, rank: 1, wins: 4 },
  { name: "Tony",         score: 83, rank: 2, wins: 1 },
  { name: "Omar",         score: 83, rank: 2, wins: 1 },
  { name: "Andy",         score: 79, rank: 4, wins: 1 },
  { name: "Luis",         score: 77, rank: 5, wins: 0 },
  { name: "Art",          score: 76, rank: 6, wins: 0 },
  { name: "Roman",        score: 71, rank: 7, wins: 0 },
  { name: "Tim",          score: 69, rank: 8, wins: 0 },
  { name: "Luis Solorio", score: 53, rank: 9, wins: 0 },
  { name: "Louis",        score: 34, rank: 10, wins: 0 }
];

// OLD WEEKS ARCHIVE (Simplified for display)
const OLD_WEEKS = {
  10: {
    games: [
      { id: '1', shortName: 'LV@DEN', winner: 'DEN', away: 'LV' }, { id: '2', shortName: 'ATL@IND', winner: 'IND', away: 'ATL' },
      { id: '3', shortName: 'BUF@MIA', winner: 'BUF', away: 'BUF' }, { id: '4', shortName: 'BAL@MIN', winner: 'BAL', away: 'BAL' },
      { id: '5', shortName: 'CLE@NYJ', winner: 'CLE', away: 'CLE' }, { id: '6', shortName: 'NE@TB', winner: 'NE', away: 'NE' },
      { id: '7', shortName: 'NO@CAR', winner: 'NO', away: 'NO' }, { id: '8', shortName: 'JAX@HOU', winner: 'JAX', away: 'JAX' },
      { id: '9', shortName: 'NYG@CHI', winner: 'NYG', away: 'NYG' }, { id: '10', shortName: 'ARI@SEA', winner: 'ARI', away: 'ARI' },
      { id: '11', shortName: 'LAR@SF', winner: 'LAR', away: 'LAR' }, { id: '12', shortName: 'DET@WSH', winner: 'DET', away: 'DET' },
      { id: '13', shortName: 'PIT@LAC', winner: 'PIT', away: 'PIT' }, { id: '14', shortName: 'PHI@GB', winner: 'PHI', away: 'PHI' }
    ],
    picks: [
      { name: "Albert", score: 11, picks: ['DEN','IND','BUF','BAL','NYJ','NE','CAR','HOU','CHI','SEA','LAR','DET','PIT','PHI'] },
      { name: "Andy", score: 8, picks: ['DEN','IND','BUF','MIN','CLE','TB','CAR','JAX','CHI','SEA','LAR','DET','LAC','PHI'] },
      { name: "Art", score: 7, picks: ['LV','IND','BUF','BAL','CLE','TB','CAR','JAX','CHI','SEA','SF','DET','LAC','PHI'] },
      { name: "Louis", score: 9, picks: ['DEN','IND','BUF','MIN','NYJ','NE','CAR','JAX','CHI','SEA','LAR','DET','PIT','PHI'] },
      { name: "Luis", score: 8, picks: ['DEN','IND','BUF','MIN','CLE','NE','CAR','JAX','CHI','SEA','LAR','DET','LAC','GB'] },
      { name: "Luis Solorio", score: 8, picks: ['DEN','IND','BUF','BAL','CLE','NE','CAR','JAX','CHI','SEA','LAR','DET','LAC','GB'] },
      { name: "Omar", score: 7, picks: ['DEN','IND','BUF','BAL','NYJ','TB','CAR','HOU','NYG','ARI','SF','DET','LAC','GB'] },
      { name: "Roman", score: 9, picks: ['DEN','IND','BUF','BAL','CLE','TB','CAR','JAX','CHI','SEA','LAR','DET','LAC','PHI'] },
      { name: "Tim", score: 5, picks: ['DEN','ATL','BUF','MIN','CLE','TB','NO','HOU','NYG','SEA','SF','DET','PIT','GB'] },
      { name: "Tony", score: 7, picks: ['DEN','IND','BUF','MIN','CLE','NE','CAR','JAX','CHI','SEA','LAR','DET','PIT','GB'] }
    ]
  }
};

function App() {
  const [user, setUser] = useState(null);
  const [games, setGames] = useState([]);
  const [picks, setPicks] = useState({});
  const [tiebreaker, setTiebreaker] = useState(""); // MNF Score
  const [view, setView] = useState('dashboard'); 
  const [leaders, setLeaders] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(12);
  const [isAdmin, setIsAdmin] = useState(false);
  const [news, setNews] = useState([]);
  
  const [guestList, setGuestList] = useState([]);
  const [nicknames, setNicknames] = useState({});
  const [picksVisible, setPicksVisible] = useState(false); 

  const audioRef = useRef(new Audio('/intro.mp3'));
  const funnyRef = useRef(new Audio('/funny.mp3'));
  const musicPlayedRef = useRef(false);
  const sanitizeEmail = (email) => email.replace(/\./g, '_');

  // 1. Load Config
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
    };
    loadConfig();
  }, []);

  // 2. Login
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        const email = currentUser.email.toLowerCase();
        const isAllowed = guestList.some(e => e.toLowerCase() === email) || ADMIN_EMAILS.some(e => e.toLowerCase() === email);

        if (isAllowed) {
          setUser(currentUser);
          setIsAdmin(ADMIN_EMAILS.some(e => e.toLowerCase() === email));
          if (!musicPlayedRef.current) { try { audioRef.current.volume = 0.5; audioRef.current.play().catch(()=>{}); musicPlayedRef.current = true; } catch (e) {} }
        } else { alert(`🚫 Access Denied`); auth.signOut(); }
      } else { setUser(null); }
    });
    return () => unsubscribe();
  }, [guestList]);

  // 3. Data Fetching
  useEffect(() => {
    const fetchData = async () => {
      // ARCHIVE MODE
      if (OLD_WEEKS[currentWeek]) {
        const archive = OLD_WEEKS[currentWeek];
        setGames(archive.games.map((g, i) => ({
          id: g.id || String(i),
          status: { type: { shortDetail: 'Final' } },
          winner: g.winner, // Store winner for comparison
          competitions: [{
            competitors: [
              { homeAway: 'home', team: { abbreviation: g.home || g.winner }, score: g.winner===g.home?'W':'-' },
              { homeAway: 'away', team: { abbreviation: g.away || '' }, score: '' }
            ]
          }]
        })));
        setLeaders(archive.picks.length > 0 ? archive.picks.map(p => ({
          userName: p.name, userId: p.name,
          [`week${currentWeek}`]: p.picks ? p.picks.reduce((acc, pick, i) => ({ ...acc, [archive.games[i].id || String(i)]: pick }), {}) : {}
        })) : []);
        return; 
      }

      // LIVE MODE
      try {
        const gamesRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${currentWeek}&seasontype=2`);
        const gamesData = await gamesRes.json();
        
        // Add "Winner" field to live games for easy checking
        const processedGames = (gamesData.events || []).map(g => {
            const winner = g.competitions[0].competitors.find(c => c.winner === true)?.team.abbreviation;
            return { ...g, winner }; // Store winner at top level
        });
        setGames(processedGames);
        
        const querySnapshot = await getDocs(collection(db, "picks_2025"));
        const loadedLeaders = [];
        querySnapshot.forEach((doc) => loadedLeaders.push(doc.data()));
        setLeaders(loadedLeaders);

        const newsRes = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/news');
        const newsData = await newsRes.json();
        setNews(newsData.articles || []);
      } catch (error) { console.error(error); }
    };
    fetchData();
  }, [currentWeek, user]);

  // --- LOGIC: Calculate Stats ---
  const calculateStats = (gameId, team) => {
    // Count how many people picked this team
    if (!leaders.length) return 0;
    const pickCount = leaders.filter(p => p[`week${currentWeek}`] && p[`week${currentWeek}`][gameId] === team).length;
    return Math.round((pickCount / leaders.length) * 100);
  };

  const getCellColor = (pick, winner) => {
    if (!pick) return '#666'; // No pick
    if (!winner) return '#fff'; // Game hasn't finished
    return pick === winner ? '#28a745' : '#d9534f'; // Green vs Red
  };

  // --- ACTIONS ---
  const handleLogin = () => signInWithGoogle();
  const handleLogout = () => { auth.signOut(); window.location.reload(); };
  const selectTeam = (gameId, teamAbbr, oddsString) => {
    setPicks((prev) => ({ ...prev, [gameId]: teamAbbr }));
    if (oddsString && oddsString.includes(teamAbbr) && oddsString.includes('+')) {
      const number = parseFloat(oddsString.replace(/[^0-9.]/g, ''));
      if (number >= 8) { try { funnyRef.current.currentTime = 0; funnyRef.current.play(); } catch(e) {} }
    }
  };
  const submitPicks = async () => {
    if (!user) return;
    if (Object.keys(picks).length < games.length) { alert(`Incomplete Picks!`); return; }
    if (!tiebreaker) { alert("Please enter a Tiebreaker Score (Total Points for MNF)"); return; }
    try {
      await setDoc(doc(db, "picks_2025", user.uid), {
        userId: user.uid, userName: user.displayName, photo: user.photoURL,
        [`week${currentWeek}`]: picks, tiebreaker, timestamp: new Date()
      }, { merge: true });
      alert("✅ Picks Saved!");
      window.location.reload();
    } catch (error) { alert("Error"); }
  };

  // ... (Admin Tools omitted for brevity, same as before) ...
  const togglePicksVisibility = async () => { const newState = !picksVisible; await updateDoc(doc(db, "config", "settings"), { picksVisible: newState }); setPicksVisible(newState); window.location.reload(); };

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', color: 'white', paddingBottom: '80px', backgroundImage: "linear-gradient(rgba(0,0,0,0.85), rgba(0,0,0,0.9)), url('/bg.jpg')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      {/* Header & Login Screen (Same as before) */}
      {/* ... */}
      
      {user && (
        <>
          {/* Tabs & Week Selector (Same as before) */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', margin: '20px 0', flexWrap: 'wrap' }}>
            <button onClick={() => setView('dashboard')} style={{ padding: '8px 20px', borderRadius: '30px', border: 'none', backgroundColor: view === 'dashboard' ? '#28a745' : '#333', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>Dashboard</button>
            <button onClick={() => setView('picks')} style={{ padding: '8px 20px', borderRadius: '30px', border: 'none', backgroundColor: view === 'picks' ? '#28a745' : '#333', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>Make Picks</button>
            <button onClick={() => setView('matrix')} style={{ padding: '8px 20px', borderRadius: '30px', border: 'none', backgroundColor: view === 'matrix' ? '#28a745' : '#333', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>All Picks</button>
            {isAdmin && <button onClick={() => setView('admin')} style={{ padding: '8px 20px', borderRadius: '30px', border: '2px solid gold', backgroundColor: view === 'admin' ? 'gold' : 'transparent', color: view === 'admin' ? 'black' : 'gold', fontWeight: 'bold', cursor: 'pointer' }}>👑 Admin</button>}
          </div>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <select value={currentWeek} onChange={(e) => setCurrentWeek(e.target.value)} style={{ padding: '8px 15px', borderRadius: '10px', backgroundColor: '#222', color: 'white', border: '1px solid #444', fontSize: '16px' }}>{[...Array(18)].map((_, i) => <option key={i+1} value={i+1}>Week {i+1}</option>)}</select>
          </div>

          <div style={{ maxWidth: '100%', overflowX: 'auto', padding: '0 15px' }}> {/* Full Width for Matrix */}
            
            {/* === VIEW 3: MATRIX (The Big Update) === */}
            {view === 'matrix' && (
              <div style={{ backgroundColor: '#1e1e1e', borderRadius: '15px', border: '1px solid #333', padding: '10px' }}>
                <div style={{textAlign:'center', padding:'10px', color: '#888', fontWeight:'bold'}}>{picksVisible ? "✅ PICKS REVEALED" : "🔒 PICKS HIDDEN"}</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: 'white' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid #444', minWidth: '100px', position: 'sticky', left: 0, backgroundColor: '#1e1e1e' }}>Player</th>
                      {games.map(g => {
                         const away = g.competitions[0].competitors.find(c => c.homeAway === 'away').team.abbreviation; 
                         return <th key={g.id} style={{ padding: '5px', borderBottom: '1px solid #444', minWidth: '40px' }}>{away}</th> 
                      })}
                      <th style={{ padding: '5px', borderBottom: '1px solid #444' }}>Tiebrk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaders.map(player => {
                      const playerPicks = player[`week${currentWeek}`] || {};
                      const showPicks = OLD_WEEKS[currentWeek] ? true : (picksVisible || isAdmin || player.userId === user.uid);
                      return (
                        <tr key={player.userId}>
                          <td style={{ padding: '10px', borderBottom: '1px solid #333', fontWeight: 'bold', position: 'sticky', left: 0, backgroundColor: '#1e1e1e' }}>{player.userName}</td>
                          {games.map(g => {
                            const pick = playerPicks[g.id];
                            const color = OLD_WEEKS[currentWeek] ? getCellColor(pick, g.winner) : (showPicks && pick ? (g.winner ? getCellColor(pick, g.winner) : 'white') : '#666');
                            return (
                              <td key={g.id} style={{ padding: '10px', borderBottom: '1px solid #333', textAlign: 'center', backgroundColor: showPicks ? color : 'transparent', color: showPicks && (pick === g.winner || !g.winner) ? 'black' : 'white' }}>
                                {showPicks ? (pick || "-") : "🔒"}
                              </td>
                            )
                          })}
                          <td style={{ padding: '10px', borderBottom: '1px solid #333', textAlign: 'center' }}>{showPicks ? (player.tiebreaker || "-") : "🔒"}</td>
                        </tr>
                      )
                    })}
                    
                    {/* PREFERRED ROW (% Picked) */}
                    <tr style={{ backgroundColor: '#333' }}>
                      <td style={{ padding: '10px', fontWeight: 'bold', position: 'sticky', left: 0, backgroundColor: '#333' }}>% Picked</td>
                      {games.map(g => {
                         const away = g.competitions[0].competitors.find(c => c.homeAway === 'away').team.abbreviation;
                         return (
                           <td key={g.id} style={{ padding: '10px', textAlign: 'center', fontSize: '10px' }}>
                             {calculateStats(g.id, away)}%
                           </td>
                         )
                      })}
                      <td></td>
                    </tr>

                    {/* OUTCOME ROW (Winners) */}
                    <tr style={{ backgroundColor: 'black', borderTop: '2px solid #444' }}>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#28a745', position: 'sticky', left: 0, backgroundColor: 'black' }}>WINNER</td>
                      {games.map(g => (
                        <td key={g.id} style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', color: '#28a745' }}>
                          {g.winner || "-"}
                        </td>
                      ))}
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* === MAKE PICKS (With Tiebreaker Input) === */}
            {view === 'picks' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
                {/* ... (Game Cards - Same as before) ... */}
                {games.map((game) => (
                    <div key={game.id} style={{ backgroundColor: '#fff', borderRadius: '15px', overflow: 'hidden', color: 'black' }}>
                      {/* ... */}
                      {/* (Keep your existing game card code here) */}
                      <div style={{ backgroundColor: '#f0f0f0', padding: '8px', textAlign: 'center', fontSize: '11px', color: '#666', fontWeight: 'bold' }}>{game.status.type.shortDetail}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '15px', alignItems: 'center' }}>
                        <div onClick={() => selectTeam(game.id, game.competitions[0].competitors[1].team.abbreviation, "")} style={{ flex: 1, textAlign: 'center', cursor: 'pointer', border: picks[game.id] === game.competitions[0].competitors[1].team.abbreviation ? '2px solid #28a745' : '2px solid transparent', borderRadius: '10px', padding: '10px', backgroundColor: picks[game.id] === game.competitions[0].competitors[1].team.abbreviation ? '#e6fffa' : 'transparent' }}><img src={game.competitions[0].competitors[1].team.logo} style={{ width: '45px' }} /><div style={{ fontWeight: 'bold', fontSize: '14px' }}>{game.competitions[0].competitors[1].team.abbreviation}</div></div>
                        <div style={{ color: '#ccc', fontWeight: 'bold' }}>@</div>
                        <div onClick={() => selectTeam(game.id, game.competitions[0].competitors[0].team.abbreviation, "")} style={{ flex: 1, textAlign: 'center', cursor: 'pointer', border: picks[game.id] === game.competitions[0].competitors[0].team.abbreviation ? '2px solid #28a745' : '2px solid transparent', borderRadius: '10px', padding: '10px', backgroundColor: picks[game.id] === game.competitions[0].competitors[0].team.abbreviation ? '#e6fffa' : 'transparent' }}><img src={game.competitions[0].competitors[0].team.logo} style={{ width: '45px' }} /><div style={{ fontWeight: 'bold', fontSize: '14px' }}>{game.competitions[0].competitors[0].team.abbreviation}</div></div>
                      </div>
                    </div>
                ))}
                
                {/* TIEBREAKER INPUT */}
                <div style={{ backgroundColor: '#333', padding: '20px', borderRadius: '15px', textAlign: 'center', gridColumn: '1 / -1' }}>
                  <h3>Tiebreaker: MNF Total Score</h3>
                  <p style={{ fontSize: '12px', color: '#ccc' }}>Guess the total combined points of the final Monday Night game.</p>
                  <input 
                    type="number" 
                    value={tiebreaker} 
                    onChange={(e) => setTiebreaker(e.target.value)} 
                    placeholder="e.g. 45" 
                    style={{ padding: '10px', borderRadius: '5px', border: 'none', fontSize: '20px', width: '100px', textAlign: 'center' }} 
                  />
                </div>

                <button onClick={submitPicks} style={{ position: 'fixed', bottom: '25px', left: '50%', transform: 'translateX(-50%)', width: '80%', maxWidth: '400px', padding: '18px', backgroundColor: Object.keys(picks).length === games.length && tiebreaker ? '#28a745' : '#555', color: 'white', fontSize: '18px', fontWeight: 'bold', border: 'none', borderRadius: '50px', boxShadow: '0 5px 20px rgba(0,0,0,0.5)', cursor: Object.keys(picks).length === games.length && tiebreaker ? 'pointer' : 'not-allowed', zIndex: 100 }}>
                  Submit Picks
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default App;