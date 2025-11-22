import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  10: { games: [{ id: '1', shortName: 'LV@DEN', winner: 'DEN', away: 'LV', home: 'DEN' },{ id: '2', shortName: 'ATL@IND', winner: 'IND', away: 'ATL', home: 'IND' },{ id: '3', shortName: 'BUF@MIA', winner: 'BUF', away: 'BUF', home: 'MIA' },{ id: '4', shortName: 'BAL@MIN', winner: 'BAL', away: 'BAL', home: 'MIN' },{ id: '5', shortName: 'CLE@NYJ', winner: 'CLE', away: 'CLE', home: 'NYJ' },{ id: '6', shortName: 'NE@TB', winner: 'NE', away: 'NE', home: 'TB' },{ id: '7', shortName: 'NO@CAR', winner: 'NO', away: 'NO', home: 'CAR' },{ id: '8', shortName: 'JAX@HOU', winner: 'JAX', away: 'JAX', home: 'HOU' },{ id: '9', shortName: 'NYG@CHI', winner: 'NYG', away: 'NYG', home: 'CHI' },{ id: '10', shortName: 'ARI@SEA', winner: 'ARI', away: 'ARI', home: 'SEA' },{ id: '11', shortName: 'LAR@SF', winner: 'LAR', away: 'LAR', home: 'SF' },{ id: '12', shortName: 'DET@WSH', winner: 'DET', away: 'DET', home: 'WSH' },{ id: '13', shortName: 'PIT@LAC', winner: 'PIT', away: 'PIT', home: 'LAC' },{ id: '14', shortName: 'PHI@GB', winner: 'PHI', away: 'PHI', home: 'GB' }], picks: [{ name: "Albert", score: 11, picks: ['DEN','IND','BUF','BAL','NYJ','NE','CAR','HOU','CHI','SEA','LAR','DET','PIT','PHI'] },{ name: "Andy", score: 8, picks: ['DEN','IND','BUF','MIN','CLE','TB','CAR','JAX','CHI','SEA','LAR','DET','LAC','PHI'] },{ name: "Art", score: 7, picks: ['LV','IND','BUF','BAL','CLE','TB','CAR','JAX','CHI','SEA','SF','DET','LAC','PHI'] },{ name: "Louis", score: 9, picks: ['DEN','IND','BUF','MIN','NYJ','NE','CAR','JAX','CHI','SEA','LAR','DET','PIT','PHI'] },{ name: "Luis", score: 8, picks: ['DEN','IND','BUF','MIN','CLE','NE','CAR','JAX','CHI','SEA','LAR','DET','LAC','GB'] },{ name: "Luis Solorio", score: 8, picks: ['DEN','IND','BUF','BAL','CLE','NE','CAR','JAX','CHI','SEA','LAR','DET','LAC','GB'] },{ name: "Omar", score: 7, picks: ['DEN','IND','BUF','BAL','NYJ','TB','CAR','HOU','NYG','ARI','SF','DET','LAC','GB'] },{ name: "Roman", score: 9, picks: ['DEN','IND','BUF','BAL','CLE','TB','CAR','JAX','CHI','SEA','LAR','DET','LAC','PHI'] },{ name: "Tim", score: 5, picks: ['DEN','ATL','BUF','MIN','CLE','TB','NO','HOU','NYG','SEA','SF','DET','PIT','GB'] },{ name: "Tony", score: 7, picks: ['DEN','IND','BUF','MIN','CLE','NE','CAR','JAX','CHI','SEA','LAR','DET','PIT','GB'] }] }
};

const FUNNY_SOUND_FILES = ['/funny.mp3', '/ack.mp3', '/huh.mp3']; // Rotation pool

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

  // Refs & Audio
  const introRef = useRef(new Audio('/intro.mp3'));
  const funnySounds = useMemo(() => FUNNY_SOUND_FILES.map(file => new Audio(file)), []); 
  const sanitizeEmail = (email) => email.replace(/\./g, '_');

  // 1. Load Config (UNCHANGED)
  useEffect(() => {
    // ...
  }, []);

  // 2. Login (UNCHANGED)
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

  // 3. Data Fetching (With Auto-Refresh)
  useEffect(() => {
    const fetchData = async () => {
      const weekNum = Number(currentWeek);

      // ARCHIVE MODE
      if (OLD_WEEKS[weekNum]) {
        const archive = OLD_WEEKS[weekNum];
        // ... (Archived games/leaders logic - same as before)
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
    
    const refreshInterval = setInterval(fetchData, 60000); 
    fetchData();

    return () => clearInterval(refreshInterval);
  }, [currentWeek, user]);

  // --- LOGIC ---
  const getCellColor = (pick, winner) => {
    if (!pick) return '#666'; 
    if (!winner) return '#fff'; 
    return pick === winner ? '#28a745' : '#d9534f'; 
  };
  const getDisplayName = (player) => { return player.userName; };
  const calculateStats = (gameId, team) => {
    if (!leaders.length) return 0;
    const pickCount = leaders.filter(p => p[`week${currentWeek}`] && p[`week${currentWeek}`][gameId] === team).length;
    return Math.round((pickCount / leaders.length) * 100);
  };

  // --- ACTIONS ---
  const handleLogin = () => signInWithGoogle();
  const handleLogout = () => { auth.signOut(); window.location.reload(); };

  const selectTeam = (gameId, teamAbbr, oddsString, targetPicksState, setTargetPicksState) => {
    const setPicksFunc = setTargetPicksState || setPicks;
    setPicksFunc((prev) => ({ ...prev, [gameId]: teamAbbr }));
    
    // Funny Sound Logic
    if (oddsString && (oddsString.includes('+') || oddsString.includes('-'))) {
      const match = oddsString.match(/([A-Z]{2,3})\s*([+-]?)(\d+\.?\d*)/); 
      
      if (match) {
        const [full, teamInOdds, sign, num] = match;
        const magnitude = parseFloat(num);
        
        if (magnitude >= 8) {
            if ((sign === '-' && teamAbbr !== teamInOdds) || (sign === '+' && teamAbbr === teamInOdds)) { 
                const randomIndex = Math.floor(Math.random() * funnySounds.length);
                const soundToPlay = funnySounds[randomIndex];
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
  const toggleSelectUser = (userId) => { /* ... */ };
  const markSelectedPaid = async () => { /* ... */ };
  const submitAdminPicks = async () => { /* ... */ };
  const addGuest = async () => { /* ... */ };
  const removeGuest = async (email) => { /* ... */ };
  const togglePicksVisibility = async () => { /* ... */ };
  const resetPicks = async (userId) => { /* ... */ };

  // --- RENDER FUNCTIONS ---
  const renderGamePicks = (targetPicks, setTargetPicks, targetTiebreaker, setTargetTiebreaker, isReadOnly = false) => (
    // ... (Game card rendering JSX) ...
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px', maxWidth: '800px', margin: '0 auto' }}>
        {games.map((game) => {
          const home = game.competitions[0].competitors.find(c => c.homeAway === 'home');
          const away = game.competitions[0].competitors.find(c => c.homeAway === 'away');
          if (!home || !away) return null;
          
          const odds = game.competitions[0].odds && game.competitions[0].odds[0] ? game.competitions[0].odds[0].details : "";
          const myPick = targetPicks[game.id];
          const select = () => selectTeam(game.id, away.team.abbreviation, odds, targetPicks, setTargetPicks);
          const selectHome = () => selectTeam(game.id, home.team.abbreviation, odds, targetPicks, setTargetPicks);
          
          return (
            <div key={game.id} style={{ backgroundColor: '#fff', borderRadius: '15px', overflow: 'hidden', color: 'black' }}>
              <div style={{ backgroundColor: '#f0f0f0', padding: '8px', textAlign: 'center', fontSize: '11px', color: '#666', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', paddingLeft: '15px', paddingRight: '15px' }}>
                <span>{game.status.type.shortDetail}</span><span style={{color: '#d9534f'}}>{odds}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '15px', alignItems: 'center' }}>
                <div onClick={isReadOnly ? null : select} style={{ flex: 1, textAlign: 'center', cursor: isReadOnly ? 'default' : 'pointer', border: myPick === away.team.abbreviation ? '2px solid #28a745' : '2px solid transparent', borderRadius: '10px', padding: '10px', backgroundColor: myPick === away.team.abbreviation ? '#e6fffa' : 'transparent' }}><img src={away.team.logo} style={{ width: '45px' }} /><div style={{ fontWeight: 'bold', fontSize: '14px' }}>{away.team.abbreviation}</div></div>
                <div style={{ color: '#ccc', fontWeight: 'bold' }}>@</div>
                <div onClick={isReadOnly ? null : selectHome} style={{ flex: 1, textAlign: 'center', cursor: isReadOnly ? 'default' : 'pointer', border: myPick === home.team.abbreviation ? '2px solid #28a745' : '2px solid transparent', borderRadius: '10px', padding: '10px', backgroundColor: myPick === home.team.abbreviation ? '#e6fffa' : 'transparent' }}><img src={home.team.logo} style={{ width: '45px' }} /><div style={{ fontWeight: 'bold', fontSize: '14px' }}>{home.team.abbreviation}</div></div>
              </div>
            </div>
          );
        })}
        <div style={{ gridColumn: '1 / -1', backgroundColor: '#333', padding: '20px', borderRadius: '15px', textAlign: 'center' }}>
          <h3>Tiebreaker: MNF Score</h3>
          <input type="number" value={targetTiebreaker} onChange={isReadOnly ? null : (e) => setTargetTiebreaker(e.target.value)} placeholder="e.g. 45" style={{ padding: '10px', borderRadius: '5px', border: 'none', fontSize: '20px', width: '100px', textAlign: 'center' }} readOnly={isReadOnly} />
        </div>
    </div>
  );

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', color: 'white', paddingBottom: '80px', backgroundImage: "linear-gradient(rgba(0,0,0,0.85), rgba(0,0,0,0.9)), url('/bg.jpg')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      
      {/* Header (Skipped for brevity) */}
      {/* Login Screen (Skipped for brevity) */}
      
      {/* --- CONTENT START --- */}
      {user && (
        <>
          {/* Nav Tabs (Skipped for brevity) */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', margin: '20px 0', flexWrap: 'wrap' }}>
            <button onClick={() => setView('dashboard')} style={{ padding: '8px 20px', borderRadius: '30px', border: 'none', backgroundColor: view === 'dashboard' ? '#28a745' : '#333', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>Dashboard</button>
            <button onClick={() => setView('picks')} style={{ padding: '8px 20px', borderRadius: '30px', border: 'none', backgroundColor: view === 'picks' ? '#28a745' : '#333', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>Make Picks</button>
            <button onClick={() => setView('matrix')} style={{ padding: '8px 20px', borderRadius: '30px', border: 'none', backgroundColor: view === 'matrix' ? '#28a745' : '#333', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>All Picks</button>
            {isAdmin && <button onClick={() => setView('admin')} style={{ padding: '8px 20px', borderRadius: '30px', border: '2px solid gold', backgroundColor: view === 'admin' ? 'gold' : 'transparent', color: view === 'admin' ? 'black' : 'gold', fontWeight: 'bold', cursor: 'pointer' }}>👑 Admin</button>}
          </div>

          {/* Week Selector (Skipped for brevity) */}
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <select value={currentWeek} onChange={(e) => setCurrentWeek(e.target.value)} style={{ padding: '8px 15px', borderRadius: '10px', backgroundColor: '#222', color: 'white', border: '1px solid #444', fontSize: '16px' }}>
              {[...Array(18)].map((_, i) => <option key={i+1} value={i+1}>Week {i+1}</option>)}
            </select>
          </div>

          {/* CONTENT VIEWS */}
          <div style={{ maxWidth: '100%', overflowX: 'auto', padding: '0 15px' }}>
            
            {/* VIEW: PICKS */}
            {view === 'picks' && (
              <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 15px' }}>
                  {renderGamePicks(picks, setPicks, tiebreaker, setTiebreaker, false)}
                  <button onClick={submitPicks} style={{ position: 'fixed', bottom: '25px', left: '50%', transform: 'translateX(-50%)', width: '80%', maxWidth: '400px', padding: '18px', backgroundColor: Object.keys(picks).length === games.length && tiebreaker ? '#28a745' : '#555', color: 'white', fontSize: '18px', fontWeight: 'bold', border: 'none', borderRadius: '50px', boxShadow: '0 5px 20px rgba(0,0,0,0.5)', cursor: Object.keys(picks).length === games.length && tiebreaker ? 'pointer' : 'not-allowed', zIndex: 100 }}>{Object.keys(picks).length === games.length ? "Submit All Picks" : `Pick ${games.length - Object.keys(picks).length} More`}</button>
              </div>
            )}
            
            {/* VIEW: ADMIN */}
            {view === 'admin' && isAdmin && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '800px', margin: '0 auto' }}>
                {/* ... (Admin Content) ... */}
                <div style={{ backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '15px', border: '1px solid #333', textAlign: 'center' }}><h3>⚙️ Game Control</h3><button onClick={togglePicksVisibility} style={{ padding: '15px 30px', borderRadius: '5px', border: 'none', cursor: 'pointer', backgroundColor: picksVisible ? '#d9534f' : '#28a745', color: 'white', fontSize: '18px', fontWeight: 'bold' }}>{picksVisible ? "🔒 HIDE PICKS" : "🔓 REVEAL PICKS"}</button></div>
                <div style={{ backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '15px', border: '1px solid #333' }}>
                  <h3>💰 Manage Payments (Week {currentWeek})</h3>
                  <div style={{ marginBottom: '15px', textAlign: 'center' }}>
                      <button onClick={markSelectedPaid} disabled={selectedPaidUsers.length === 0} style={{ backgroundColor: selectedPaidUsers.length > 0 ? '#28a745' : '#555', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '5px', cursor: selectedPaidUsers.length > 0 ? 'pointer' : 'not-allowed', width: '100%', fontWeight: 'bold' }}>
                          Mark {selectedPaidUsers.length} Selected as Paid
                      </button>
                  </div>
                  {/* ... (Player list with checkboxes) ... */}
                </div>
                {/* ... (Admin Pick Entry) ... */}
              </div>
            )}
            
            {/* ... (Dashboard and Matrix views - omitted for brevity) ... */}
          </div>
        </>
      )}
      {/* Ticker (Skipped for brevity) */}
    </div>
  );
}

export default App;