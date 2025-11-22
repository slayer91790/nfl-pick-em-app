import React, { useState, useEffect, useRef } from 'react';
import { signInWithGoogle, db, auth } from './firebase';
import { doc, setDoc, collection, getDocs, updateDoc, deleteField, getDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// ==========================================
// 🔒 CONFIG & DATA
// ==========================================
const ALLOWED_EMAILS = [
  "slayer91790@gmail.com", "antoniodanielvazquez@gmail.com", "crazynphat13@gmail.com", "friend1@example.com"
];

const ADMIN_EMAILS = [
  "slayer91790@gmail.com", 
  "antoniodanielvazquez@gmail.com"
];

const PAST_STATS = [
  { name: "Albert", score: 89, rank: 1, wins: 4 }, { name: "Tony", score: 83, rank: 2, wins: 1 }, { name: "Omar", score: 83, rank: 2, wins: 1 }, 
  { name: "Andy", score: 79, rank: 4, wins: 1 }, { name: "Luis", score: 77, rank: 5, wins: 0 }, { name: "Art", score: 76, rank: 6, wins: 0 },
  { name: "Roman", score: 71, rank: 7, wins: 0 }, { name: "Tim", score: 69, rank: 8, wins: 0 }, { name: "Luis Solorio", score: 53, rank: 9, wins: 0 }, 
  { name: "Louis", score: 34, rank: 10, wins: 0 }
];

const OLD_WEEKS = {
  3: { games: "BUF,MIN,PIT,PHI,TB,WSH,ATL,JAX,GB,IND,LAC,SEA,SF,CHI,KC,DET".split(",").map((w,i)=>({id:String(i), shortName:`G${i+1}`, winner:w})), picks: [] },
  4: { games: "SEA,PIT,ATL,BUF,DET,NE,LAC,PHI,HOU,LAR,JAX,KC,LV,GB,MIA,DEN".split(",").map((w,i)=>({id:String(i), shortName:`G${i+1}`, winner:w})), picks: [] },
  5: { games: "LAR,MIN,IND,NO,DAL,DEN,CAR,HOU,TEN,TB,WSH,DET,NE,JAX".split(",").map((w,i)=>({id:String(i), shortName:`G${i+1}`, winner:w})), picks: [] },
  6: { games: "PHI,DEN,IND,LAC,PIT,TB,DAL,SEA,BAL,TEN,NE,GB,DET,BUF,CHI".split(",").map((w,i)=>({id:String(i), shortName:`G${i+1}`, winner:w})), picks: [] },
  7: { games: "CIN,LAR,KC,PHI,CAR,MIA,NE,IND,DEN,GB,WSH,ATL,DET,SEA".split(",").map((w,i)=>({id:String(i), shortName:`G${i+1}`, winner:w})), picks: [] },
  8: { games: "LAC,NE,PHI,BUF,BAL,HOU,ATL,CIN,TB,IND,DEN,GB,KC".split(",").map((w,i)=>({id:String(i), shortName:`G${i+1}`, winner:w})), picks: [] },
  9: { games: "BAL,NE,SF,IND,DEN,CHI,MIN,GB,LAC,JAX,LAR,BUF,SEA,DAL".split(",").map((w,i)=>({id:String(i), shortName:`G${i+1}`, winner:w})), picks: [] },
  10: { games: [{ id: '1', shortName: 'LV@DEN', winner: 'DEN', away: 'LV', home: 'DEN' },{ id: '2', shortName: 'ATL@IND', winner: 'IND', away: 'ATL', home: 'IND' },{ id: '3', shortName: 'BUF@MIA', winner: 'BUF', away: 'BUF', home: 'MIA' },{ id: '4', shortName: 'BAL@MIN', winner: 'BAL', away: 'BAL', home: 'MIN' },{ id: '5', shortName: 'CLE@NYJ', winner: 'CLE', away: 'CLE', home: 'NYJ' },{ id: '6', shortName: 'NE@TB', winner: 'NE', away: 'NE', home: 'TB' },{ id: '7', shortName: 'NO@CAR', winner: 'NO', away: 'NO', home: 'CAR' },{ id: '8', shortName: 'JAX@HOU', winner: 'JAX', away: 'JAX', home: 'HOU' },{ id: '9', shortName: 'NYG@CHI', winner: 'NYG', away: 'NYG', home: 'CHI' },{ id: '10', shortName: 'ARI@SEA', winner: 'ARI', away: 'ARI', home: 'SEA' },{ id: '11', shortName: 'LAR@SF', winner: 'LAR', away: 'LAR', home: 'SF' },{ id: '12', shortName: 'DET@WSH', winner: 'DET', away: 'DET', home: 'WSH' },{ id: '13', shortName: 'PIT@LAC', winner: 'PIT', away: 'PIT', home: 'LAC' },{ id: '14', shortName: 'PHI@GB', winner: 'PHI', away: 'PHI', home: 'GB' }], picks: [{ name: "Albert", score: 11, picks: ['DEN','IND','BUF','BAL','NYJ','NE','CAR','HOU','CHI','SEA','LAR','DET','PIT','PHI'] },{ name: "Andy", score: 8, picks: ['DEN','IND','BUF','MIN','CLE','TB','CAR','JAX','CHI','SEA','LAR','DET','LAC','PHI'] },{ name: "Art", score: 7, picks: ['LV','IND','BUF','BAL','CLE','TB','CAR','JAX','CHI','SEA','SF','DET','LAC','PHI'] },{ name: "Louis", score: 9, picks: ['DEN','IND','BUF','MIN','NYJ','NE','CAR','JAX','CHI','SEA','LAR','DET','PIT','PHI'] },{ name: "Luis", score: 8, picks: ['DEN','IND','BUF','MIN','CLE','NE','CAR','JAX','CHI','SEA','LAR','DET','LAC','GB'] },{ name: "Luis Solorio", score: 8, picks: ['DEN','IND','BUF','BAL','CLE','NE','CAR','JAX','CHI','SEA','LAR','DET','LAC','GB'] },{ name: "Omar", score: 7, picks: ['DEN','IND','BUF','BAL','NYJ','TB','CAR','HOU','NYG','ARI','SF','DET','LAC','GB'] },{ name: "Roman", score: 9, picks: ['DEN','IND','BUF','BAL','CLE','TB','CAR','JAX','CHI','SEA','LAR','DET','LAC','PHI'] },{ name: "Tim", score: 5, picks: ['DEN','ATL','BUF','MIN','CLE','TB','NO','HOU','NYG','SEA','SF','DET','PIT','GB'] },{ name: "Tony", score: 7, picks: ['DEN','IND','BUF','MIN','CLE','NE','CAR','JAX','CHI','SEA','LAR','DET','PIT','GB'] }] }
};

function App() {
  const [user, setUser] = useState(null);
  const [games, setGames] = useState([]);
  const [picks, setPicks] = useState({});
  const [tiebreaker, setTiebreaker] = useState(""); 
  const [view, setView] = useState('dashboard'); 
  const [leaders, setLeaders] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(12);
  const [isAdmin, setIsAdmin] = useState(false);
  const [news, setNews] = useState([]);
  
  // Settings & Admin States
  const [guestList, setGuestList] = useState([]);
  const [nicknames, setNicknames] = useState({});
  const [newEmailInput, setNewEmailInput] = useState("");
  const [newNicknameInput, setNewNicknameInput] = useState("");
  const [picksVisible, setPicksVisible] = useState(false); 
  const [selectedPaidUsers, setSelectedPaidUsers] = useState([]);
  const [adminTargetUser, setAdminTargetUser] = useState(null); 
  const [adminTargetPicks, setAdminTargetPicks] = useState({});
  const [adminTargetTiebreaker, setAdminTargetTiebreaker] = useState("");

  // Refs & Helpers
  const introRef = useRef(new Audio('/intro.mp3'));
  const funnySoundsRef = useRef(FUNNY_SOUND_FILES.map(file => new Audio(file))); 
  const sanitizeEmail = (email) => email.replace(/\./g, '_');
  
  // --- CONFIG & LOGIN ---
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        const email = currentUser.email.toLowerCase();
        const isAllowed = guestList.some(e => e.toLowerCase() === email) || ADMIN_EMAILS.some(e => e.toLowerCase() === email);

        if (isAllowed) {
          setUser(currentUser);
          setIsAdmin(ADMIN_EMAILS.some(e => e.toLowerCase() === email));
        } else { alert(`🚫 Access Denied: Your email is not on the guest list.`); auth.signOut(); }
      } else { setUser(null); }
    });
    return () => unsubscribe();
  }, [guestList]);

  // --- 2. DATA FETCHING (Auto-Refresh) ---
  useEffect(() => {
    const fetchData = async () => {
      const weekNum = Number(currentWeek);

      // ARCHIVE MODE
      if (OLD_WEEKS[weekNum]) {
        const archive = OLD_WEEKS[weekNum];
        setGames(archive.games.map((g, i) => ({ id: g.id || String(i), status: { type: { shortDetail: 'Final' } }, winner: g.winner, competitions: [{ competitors: [{ homeAway: 'home', team: { abbreviation: g.home || g.winner, logo: '' }, score: g.winner===g.home?'W':'-' },{ homeAway: 'away', team: { abbreviation: g.away || '', logo: '' }, score: g.winner===g.away?'W':'-' }] }] })));
        setLeaders(archive.picks.length > 0 ? archive.picks.map(p => ({ userName: p.name, userId: p.name, paid: true, [`week${currentWeek}`]: p.picks ? p.picks.reduce((acc, pick, i) => ({ ...acc, [archive.games[i].id || String(i)]: pick }), {}) : {} })) : []);
        return; 
      }

      // LIVE MODE
      try {
        const gamesRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${currentWeek}&seasontype=2`);
        const gamesData = await gamesRes.json();
        const processedGames = (gamesData.events || []).map(g => {
            const winner = g.competitions[0].competitors.find(c => c.winner === true)?.team.abbreviation;
            return { ...g, winner };
        });
        setGames(processedGames);
        
        const querySnapshot = await getDocs(collection(db, "picks_2025"));
        const loadedLeaders = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.paid === undefined) data.paid = false;
          loadedLeaders.push(data);
        });
        setLeaders(loadedLeaders);

        const newsRes = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/news');
        const newsData = await newsRes.json();
        setNews(newsData.articles || []);
      } catch (error) { console.error(error); }
    };
    
    // 🏆 AUTO-REFRESH IMPLEMENTATION 🏆
    const refreshInterval = setInterval(fetchData, 60000); 
    fetchData();

    return () => clearInterval(refreshInterval);
  }, [currentWeek, user]);

  // --- LOGIC ---
  const calculateStats = (gameId, team) => {
    if (!leaders.length) return 0;
    const pickCount = leaders.filter(p => p[`week${currentWeek}`] && p[`week${currentWeek}`][gameId] === team).length;
    return Math.round((pickCount / leaders.length) * 100);
  };

  const getCellColor = (pick, winner) => {
    if (!pick) return '#666'; 
    if (!winner) return '#fff'; 
    return pick === winner ? '#28a745' : '#d9534f'; 
  };

  const getDisplayName = (player) => {
    return player.userName;
  };

  // --- ACTIONS ---
  const handleLogin = () => signInWithGoogle();
  const handleLogout = () => { auth.signOut(); window.location.reload(); };

  const selectTeam = (gameId, teamAbbr, oddsString, targetPicksState, setTargetPicksState) => {
    const setPicksFunc = setTargetPicksState || setPicks;
    setPicksFunc((prev) => ({ ...prev, [gameId]: teamAbbr }));
    
    if (oddsString && (oddsString.includes('+') || oddsString.includes('-'))) {
      const match = oddsString.match(/([A-Z]{2,3})\s*([+-]?)(\d+\.?\d*)/); 
      
      if (match) {
        const [full, teamInOdds, sign, num] = match;
        const magnitude = parseFloat(num);
        
        if (magnitude >= 8) {
            if ((sign === '-' && teamAbbr !== teamInOdds) || (sign === '+' && teamAbbr === teamInOdds)) { 
                const sounds = funnySoundsRef.current;
                const randomIndex = Math.floor(Math.random() * sounds.length);
                const soundToPlay = sounds[randomIndex];
                try {
                  soundToPlay.currentTime = 0; 
                  soundToPlay.play();
                } catch(e) {}
            }
        }
      }
    }
  };

  const submitPicks = async () => {
    if (!user) return;
    if (Object.keys(picks).length < games.length) { alert(`Incomplete Picks!`); return; }
    if (!tiebreaker) { alert("Please enter a Tiebreaker Score"); return; }
    try {
      await setDoc(doc(db, "picks_2025", user.uid), {
        userId: user.uid, userName: user.displayName, photo: user.photoURL,
        [`week${currentWeek}`]: picks, tiebreaker, timestamp: new Date()
      }, { merge: true });
      alert("✅ Picks Saved!");
      window.location.reload();
    } catch (error) { alert("Error"); }
  };
  
  // --- ADMIN ACTIONS ---
  const toggleSelectUser = (userId) => {
    setSelectedPaidUsers(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
  };

  const markSelectedPaid = async () => {
    if (selectedPaidUsers.length === 0) return;
    if (!window.confirm(`Mark ${selectedPaidUsers.length} users as Paid for Week ${currentWeek}?`)) return;

    try {
      const batch = db.batch();
      for (const userId of selectedPaidUsers) {
        const userRef = doc(db, "picks_2025", userId);
        batch.update(userRef, { paid: true });
      }
      await batch.commit();
      alert(`✅ ${selectedPaidUsers.length} users marked as paid!`);
      setSelectedPaidUsers([]);
      window.location.reload(); 
    } catch (error) {
      console.error("Batch update failed:", error);
      alert("Error marking users as paid.");
    }
  };
  
  const submitAdminPicks = async () => {
    if (!adminTargetUser) { alert("Please select a user."); return; }
    if (Object.keys(adminTargetPicks).length < games.length) { alert(`Incomplete Picks for ${adminTargetUser.userName}!`); return; }
    if (!adminTargetTiebreaker) { alert("Please enter a Tiebreaker Score"); return; }
    
    if (!window.confirm(`SUBMIT PICKS for ${adminTargetUser.userName} for Week ${currentWeek}?`)) return;

    try {
      await setDoc(doc(db, "picks_2025", adminTargetUser.userId), {
        userId: adminTargetUser.userId, userName: adminTargetUser.userName, photo: adminTargetUser.photo,
        [`week${currentWeek}`]: adminTargetPicks, tiebreaker: adminTargetTiebreaker, timestamp: new Date()
      }, { merge: true });
      alert(`✅ Picks Saved for ${adminTargetUser.userName}!`);
      window.location.reload();
    } catch (error) { 
      alert("Error submitting admin picks."); 
    }
  };
  
  // ... (Other admin functions - unchanged)

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', color: 'white', paddingBottom: '80px', backgroundImage: "linear-gradient(rgba(0,0,0,0.85), rgba(0,0,0,0.9)), url('/bg.jpg')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      
      {/* Header */}
      <div style={{ padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <h1 style={{ fontSize: '18px', margin: 0, color: '#fff' }}>🏈 Pick 'Em Pro</h1>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <img src={user.photoURL} referrerPolicy="no-referrer" style={{ width: '35px', borderRadius: '50%', border: '2px solid #28a745' }} />
            <button onClick={handleLogout} style={{ backgroundColor: '#d9534f', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '5px', fontSize: '12px', cursor: 'pointer' }}>Logout</button>
          </div>
        )}
      </div>

      {!user ? (
        <div style={{ textAlign: 'center', marginTop: '150px' }}>
          <button onClick={handleLogin} style={{ padding: '15px 40px', fontSize: '18px', backgroundColor: '#4285F4', color: 'white', border: 'none', borderRadius: '50px', cursor: 'pointer', fontWeight: 'bold' }}>Enter League</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', margin: '20px 0', flexWrap: 'wrap' }}>
            <button onClick={() => setView('dashboard')} style={{ padding: '8px 20px', borderRadius: '30px', border: 'none', backgroundColor: view === 'dashboard' ? '#28a745' : '#333', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>Dashboard</button>
            <button onClick={() => setView('picks')} style={{ padding: '8px 20px', borderRadius: '30px', border: 'none', backgroundColor: view === 'picks' ? '#28a745' : '#333', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>Make Picks</button>
            <button onClick={() => setView('matrix')} style={{ padding: '8px 20px', borderRadius: '30px', border: 'none', backgroundColor: view === 'matrix' ? '#28a745' : '#333', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>All Picks</button>
            {isAdmin && <button onClick={() => setView('admin')} style={{ padding: '8px 20px', borderRadius: '30px', border: '2px solid gold', backgroundColor: view === 'admin' ? 'gold' : 'transparent', color: view === 'admin' ? 'black' : 'gold', fontWeight: 'bold', cursor: 'pointer' }}>👑 Admin</button>}
          </div>

          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <select value={currentWeek} onChange={(e) => setCurrentWeek(e.target.value)} style={{ padding: '8px 15px', borderRadius: '10px', backgroundColor: '#222', color: 'white', border: '1px solid #444', fontSize: '16px' }}>
              {[...Array(18)].map((_, i) => <option key={i+1} value={i+1}>Week {i+1}</option>)}
            </select>
          </div>

          <div style={{ maxWidth: '100%', overflowX: 'auto', padding: '0 15px' }}>
            
            {/* === DASHBOARD === */}
            {view === 'dashboard' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', maxWidth: '800px', margin: '0 auto' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#888', marginBottom: '10px', textTransform: 'uppercase' }}>Live Scores</div>
                  <div style={{ display: 'flex', gap: '15px', overflowX: 'auto', paddingBottom: '10px' }}>
                    {games.map(game => {
                       const home = game.competitions[0].competitors.find(c => c.homeAway === 'home');
                       const away = game.competitions[0].competitors.find(c => c.homeAway === 'away');
                       if (!home || !away) return null;
                       return (
                         <div key={game.id} style={{ minWidth: '200px', backgroundColor: '#1e1e1e', padding: '15px', borderRadius: '15px', border: '1px solid #333', flexShrink: 0 }}>
                           <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}><span style={{fontWeight:'bold'}}>{away.team.abbreviation}</span><span style={{fontWeight:'bold'}}>{away.score}</span></div>
                           <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}><span style={{fontWeight:'bold'}}>{home.team.abbreviation}</span><span style={{fontWeight:'bold'}}>{home.score}</span></div>
                           <div style={{ fontSize: '10px', color: '#28a745' }}>{game.status.type.shortDetail}</div>
                         </div>
                       )
                    })}
                  </div>
                </div>

                <div style={{ backgroundColor: '#1e1e1e', borderRadius: '15px', overflow: 'hidden', border: '1px solid #333' }}>
                   <div style={{ background: 'linear-gradient(90deg, #11998e, #38ef7d)', padding: '20px', textAlign: 'center', color: '#fff' }}>
                      <h2 style={{ margin: 0, fontSize: '28px' }}>🏆 Pot: ${leaders.length * 10}</h2>
                      <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.9 }}>Week {currentWeek} Pool</p>
                      <a href="https://venmo.com/u/MrDoom" target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '10px', backgroundColor: 'white', color: '#11998e', padding: '8px 20px', borderRadius: '20px', textDecoration: 'none', fontWeight: 'bold', fontSize: '14px' }}>Pay $10 to @MrDoom ↗</a>
                   </div>
                   <div style={{ padding: '15px', borderBottom: '1px solid #333', fontWeight: 'bold', color: '#888', fontSize: '12px', textTransform: 'uppercase' }}>Leaderboard</div>
                   {leaders.map((player) => (
                      <div key={player.userId} style={{ padding: '20px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                          {player.photo && <img src={player.photo} referrerPolicy="no-referrer" style={{ width: '40px', borderRadius: '50%', border: '1px solid #555' }} />}
                          <div>
                            <div style={{ fontWeight: 'bold', color: 'white' }}>{getDisplayName(player)} {player.paid && <span>✅</span>}</div>
                            {!player.paid && <div style={{ fontSize: '10px', color: '#ff4444' }}>UNPAID</div>}
                          </div>
                        </div>
                        <div style={{ backgroundColor: '#28a745', color: 'white', padding: '5px 12px', borderRadius: '15px', fontSize: '12px', fontWeight: 'bold' }}>
                          {player[`week${currentWeek}`] ? Object.keys(player[`week${currentWeek}`]).length : 0} Picks
                        </div>
                      </div>
                   ))}
                </div>

                <div style={{ backgroundColor: '#1e1e1e', borderRadius: '15px', overflow: 'hidden', border: '1px solid #333' }}>
                  <div style={{ padding: '15px', backgroundColor: '#333', fontWeight: 'bold', color: 'white', fontSize: '14px' }}>📜 Season Standings (Weeks 3-11)</div>
                  {PAST_STATS.map((stat, index) => (
                    <div key={index} style={{ padding: '15px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ width: '25px', height: '25px', borderRadius: '50%', backgroundColor: stat.rank===1?'#FFD700':'#444', color: stat.rank===1?'black':'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px' }}>{stat.rank}</div>
                        <div style={{ fontWeight: 'bold', color: 'white' }}>{stat.name}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}><div style={{ color: '#28a745', fontWeight: 'bold' }}>{stat.score} Correct</div></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* === PICKS === */}
            {view === 'picks' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px', maxWidth: '800px', margin: '0 auto' }}>
                {games.map((game) => {
                  const home = game.competitions[0].competitors.find(c => c.homeAway === 'home');
                  const away = game.competitions[0].competitors.find(c => c.homeAway === 'away');
                  const odds = game.competitions[0].odds && game.competitions[0].odds[0] ? game.competitions[0].odds[0].details : "";
                  const myPick = picks[game.id];
                  return (
                    <div key={game.id} style={{ backgroundColor: '#fff', borderRadius: '15px', overflow: 'hidden', color: 'black' }}>
                      <div style={{ backgroundColor: '#f0f0f0', padding: '8px', textAlign: 'center', fontSize: '11px', color: '#666', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', paddingLeft: '15px', paddingRight: '15px' }}>
                        <span>{game.status.type.shortDetail}</span><span style={{color: '#d9534f'}}>{odds}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '15px', alignItems: 'center' }}>
                        <div onClick={() => selectTeam(game.id, away.team.abbreviation, odds, picks, setPicks)} style={{ flex: 1, textAlign: 'center', cursor: 'pointer', border: myPick === away.team.abbreviation ? '2px solid #28a745' : '2px solid transparent', borderRadius: '10px', padding: '10px', backgroundColor: myPick === away.team.abbreviation ? '#e6fffa' : 'transparent' }}><img src={away.team.logo} style={{ width: '45px' }} /><div style={{ fontWeight: 'bold', fontSize: '14px' }}>{away.team.abbreviation}</div></div>
                        <div style={{ color: '#ccc', fontWeight: 'bold' }}>@</div>
                        <div onClick={() => selectTeam(game.id, home.team.abbreviation, odds, picks, setPicks)} style={{ flex: 1, textAlign: 'center', cursor: 'pointer', border: myPick === home.team.abbreviation ? '2px solid #28a745' : '2px solid transparent', borderRadius: '10px', padding: '10px', backgroundColor: myPick === home.team.abbreviation ? '#e6fffa' : 'transparent' }}><img src={home.team.logo} style={{ width: '45px' }} /><div style={{ fontWeight: 'bold', fontSize: '14px' }}>{home.team.abbreviation}</div></div>
                      </div>
                    </div>
                  );
                })}
                <div style={{ gridColumn: '1 / -1', backgroundColor: '#333', padding: '20px', borderRadius: '15px', textAlign: 'center' }}>
                  <h3>Tiebreaker: MNF Score</h3>
                  <input type="number" value={tiebreaker} onChange={(e) => setTiebreaker(e.target.value)} placeholder="e.g. 45" style={{ padding: '10px', borderRadius: '5px', border: 'none', fontSize: '20px', width: '100px', textAlign: 'center' }} />
                </div>
                <button onClick={submitPicks} style={{ position: 'fixed', bottom: '25px', left: '50%', transform: 'translateX(-50%)', width: '80%', maxWidth: '400px', padding: '18px', backgroundColor: Object.keys(picks).length === games.length && tiebreaker ? '#28a745' : '#555', color: 'white', fontSize: '18px', fontWeight: 'bold', border: 'none', borderRadius: '50px', boxShadow: '0 5px 20px rgba(0,0,0,0.5)', cursor: Object.keys(picks).length === games.length && tiebreaker ? 'pointer' : 'not-allowed', zIndex: 100 }}>{Object.keys(picks).length === games.length ? "Submit All Picks" : `Pick ${games.length - Object.keys(picks).length} More`}</button>
              </div>
            )}

            {/* === MATRIX === */}
            {view === 'matrix' && (
              <div style={{ overflowX: 'auto', backgroundColor: '#1e1e1e', borderRadius: '15px', border: '1px solid #333', padding: '10px', margin: '0 auto' }}>
                <div style={{textAlign:'center', padding:'10px', color: '#888', fontWeight:'bold'}}>{Number(currentWeek) < 12 || picksVisible ? "✅ PICKS REVEALED" : "🔒 PICKS HIDDEN"}</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: 'white' }}>
                  <thead><tr><th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid #444', minWidth: '100px', position: 'sticky', left: 0, backgroundColor: '#1e1e1e' }}>Player</th>{games.map(g => { const away = g.competitions[0].competitors.find(c => c.homeAway === 'away')?.team.abbreviation; return <th key={g.id} style={{ padding: '5px', borderBottom: '1px solid #444', minWidth: '40px' }}>{away}</th> })}</tr></thead>
                  <tbody>
                    {leaders.map(player => {
                      const playerPicks = player[`week${currentWeek}`] || {};
                      const showPicks = Number(currentWeek) < 12 ? true : (picksVisible || isAdmin || player.userId === user.uid);
                      return (
                        <tr key={player.userId}>
                          <td style={{ padding: '10px', borderBottom: '1px solid #333', fontWeight: 'bold', position: 'sticky', left: 0, backgroundColor: '#1e1e1e' }}>{player.userName}</td>
                          {games.map(g => {
                            const pick = playerPicks[g.id];
                            const color = Number(currentWeek) < 12 ? getCellColor(pick, g.winner) : (showPicks && pick ? (g.winner ? getCellColor(pick, g.winner) : 'white') : '#666');
                            return <td key={g.id} style={{ padding: '10px', borderBottom: '1px solid #333', textAlign: 'center', backgroundColor: showPicks ? color : 'transparent', color: showPicks && (pick === g.winner || !g.winner) ? 'black' : 'white' }}>{showPicks ? (pick || "-") : "🔒"}</td>
                          })}
                          <td style={{ padding: '10px', borderBottom: '1px solid #333', textAlign: 'center' }}>{showPicks ? (player.tiebreaker || "-") : "🔒"}</td>
                        </tr>
                      )
                    })}
                    <tr style={{ backgroundColor: '#333' }}>
                      <td style={{ padding: '10px', fontWeight: 'bold', position: 'sticky', left: 0, backgroundColor: '#333' }}>% Picked</td>
                      {games.map(g => { const awayAbbr = g.competitions[0].competitors.find(c => c.homeAway === 'away')?.team.abbreviation; return <td key={g.id} style={{ padding: '10px', textAlign: 'center', fontSize: '10px' }}>{calculateStats(g.id, awayAbbr)}%</td> })}
                      <td></td>
                    </tr>
                    <tr style={{ backgroundColor: 'black', borderTop: '2px solid #444' }}>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#28a745', position: 'sticky', left: 0, backgroundColor: 'black' }}>WINNER</td>
                      {games.map(g => <td key={g.id} style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', color: '#28a745' }}>{g.winner || "-"}</td>)}
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* === ADMIN === */}
            {view === 'admin' && isAdmin && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '800px', margin: '0 auto' }}>
                <div style={{ backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '15px', border: '1px solid #333', textAlign: 'center' }}><h3>⚙️ Game Control</h3><button onClick={togglePicksVisibility} style={{ padding: '15px 30px', borderRadius: '5px', border: 'none', cursor: 'pointer', backgroundColor: picksVisible ? '#d9534f' : '#28a745', color: 'white', fontSize: '18px', fontWeight: 'bold' }}>{picksVisible ? "🔒 HIDE PICKS" : "🔓 REVEAL PICKS"}</button></div>
                
                {/* 1. MULTI-SELECT PAID */}
                <div style={{ backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '15px', border: '1px solid #333' }}>
                  <h3>💰 Manage Payments (Week {currentWeek})</h3>
                  <div style={{ marginBottom: '15px', textAlign: 'center' }}>
                      <button onClick={markSelectedPaid} disabled={selectedPaidUsers.length === 0} style={{ backgroundColor: selectedPaidUsers.length > 0 ? '#28a745' : '#555', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '5px', cursor: selectedPaidUsers.length > 0 ? 'pointer' : 'not-allowed', width: '100%', fontWeight: 'bold' }}>
                          Mark {selectedPaidUsers.length} Selected as Paid
                      </button>
                  </div>
                  {leaders.map(player => (
                    <div key={player.userId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderBottom: '1px solid #444', backgroundColor: selectedPaidUsers.includes(player.userId) ? '#333' : 'transparent' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <input type="checkbox" checked={selectedPaidUsers.includes(player.userId)} onChange={() => toggleSelectUser(player.userId)} style={{ width: '20px', height: '20px' }} />
                          <div style={{ fontWeight: 'bold' }}>{player.userName} {player.paid && <span>✅</span>}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => resetPicks(player.userId)} style={{ padding: '5px 10px', borderRadius: '5px', border: '1px solid #ff4444', cursor: 'pointer', backgroundColor: 'transparent', color: '#ff4444' }}>Reset Picks</button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 2. ADMIN PICK ENTRY */}
                <div style={{ backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '15px', border: '1px solid #333' }}>
                  <h3>✍️ Admin Pick Entry</h3>
                  <div style={{ marginBottom: '15px' }}>
                      <select onChange={(e) => {
                          const userObj = leaders.find(l => l.userId === e.target.value);
                          setAdminTargetUser(userObj);
                          if (userObj) {
                            const currentPicks = userObj[`week${currentWeek}`] || {};
                            setAdminTargetPicks(currentPicks);
                            setAdminTargetTiebreaker(userObj.tiebreaker || "");
                          } else {
                            setAdminTargetPicks({}); setAdminTargetTiebreaker("");
                          }
                      }} style={{ padding: '10px', borderRadius: '5px', border: 'none', width: '100%' }}>
                          <option value="">-- Select Player to Edit Picks For --</option>
                          {leaders.map(p => <option key={p.userId} value={p.userId}>{p.userName}</option>)}
                      </select>
                  </div>
                  {adminTargetUser && (
                      <>
                          <p style={{ fontWeight: 'bold', color: '#28a745', textAlign: 'center' }}>Editing Picks for: {adminTargetUser.userName}</p>
                          {renderGamePicks(adminTargetPicks, setAdminTargetPicks, adminTargetTiebreaker, setAdminTargetTiebreaker, false)}
                          <button onClick={submitAdminPicks} style={{ marginTop: '20px', padding: '15px 30px', borderRadius: '5px', border: 'none', cursor: 'pointer', backgroundColor: '#28a745', color: 'white', fontSize: '18px', fontWeight: 'bold', width: '100%' }}>
                              Submit Picks for {adminTargetUser.userName}
                          </button>
                      </>
                  )}
                </div>

                {/* 3. GUEST LIST */}
                <div style={{ backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '15px', border: '1px solid #333' }}>
                  <h3>👥 Guest List</h3>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', gap: '10px' }}><input value={newEmailInput} onChange={(e) => setNewEmailInput(e.target.value)} placeholder="Email" style={{ flex: 2, padding: '10px', borderRadius: '5px', border: 'none' }} /><input value={newNicknameInput} onChange={(e) => setNewNicknameInput(e.target.value)} placeholder="Nickname" style={{ flex: 1, padding: '10px', borderRadius: '5px', border: 'none' }} /></div>
                    <button onClick={addGuest} style={{ backgroundColor: '#28a745', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '5px', cursor: 'pointer', width: '100%' }}>Add</button>
                  </div>
                  {guestList.map(email => <div key={email} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', backgroundColor: '#333', borderRadius: '5px', marginBottom: '5px' }}><div><span style={{color: 'white'}}>{email}</span>{nicknames[sanitizeEmail(email)] && <span style={{marginLeft: '10px', color: '#28a745', fontWeight:'bold'}}>({nicknames[sanitizeEmail(email)]})</span>}</div><button onClick={() => removeGuest(email)} style={{ color: '#ff4444', background: 'none', border: 'none', cursor: 'pointer' }}>X</button></div>)}
                </div>
              </div>
            )}
          </div>
        </>
      )}
      {/* Ticker */}
      {user && news.length > 0 && <div style={{ position: 'fixed', bottom: 0, left: 0, width: '100%', backgroundColor: '#000', color: 'white', borderTop: '2px solid #28a745', overflow: 'hidden', whiteSpace: 'nowrap', zIndex: 1000 }}><div style={{ display: 'inline-block', padding: '10px', animation: 'ticker 30s linear infinite' }}>{news.map((n, i) => <span key={i} style={{ marginRight: '50px', fontSize: '14px', fontWeight: 'bold' }}>🏈 {n.headline}</span>)}</div><style>{`@keyframes ticker { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }`}</style></div>}
    </div>
  );
}

export default App;