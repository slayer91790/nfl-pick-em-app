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
  useEffect(() => { /* ... */ }, []);

  // 2. Login (UNCHANGED)
  useEffect(() => { /* ... */ }, [guestList]);

  // 3. Data Fetching (With Auto-Refresh)
  useEffect(() => {
    const fetchData = async () => {
      // ... (fetchData logic - unchanged) ...
    };
    const refreshInterval = setInterval(fetchData, 60000); 
    fetchData();
    return () => clearInterval(refreshInterval);
  }, [currentWeek, user]);

  // --- LOGIC ---
  const getCellColor = (pick, winner) => { /* ... */ return pick === winner ? '#28a745' : '#d9534f'; };
  const getDisplayName = (player) => { /* ... */ return player.userName; };
  const calculateStats = (gameId, team) => { /* ... */ return Math.round((pickCount / leaders.length) * 100); };
  
  // --- ACTIONS & ADMIN LOGIC ---
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
                const randomIndex = Math.floor(Math.random() * funnySounds.length);
                const soundToPlay = funnySounds[randomIndex];
                try { soundToPlay.currentTime = 0; soundToPlay.play(); } catch(e) {}
            }
        }
      }
    }
  };

  const submitPicks = async () => {
    // ... (Submit logic - same as before)
  };
  
  const toggleSelectUser = (userId) => { /* ... */ };
  const markSelectedPaid = async () => { /* ... */ };
  const submitAdminPicks = async () => { /* ... */ };
  const addGuest = async () => { /* ... */ };
  const removeGuest = async (email) => { /* ... */ };
  const togglePicksVisibility = async () => { /* ... */ };
  const resetPicks = async (userId) => { /* ... */ };

  // --- RENDER FUNCTION COMPONENT ---
  const renderGamePicks = (targetPicks, setTargetPicks, targetTiebreaker, setTargetTiebreaker, isReadOnly = false) => (
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
            
            {/* --- DASHBOARD --- */}
            {view === 'dashboard' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', maxWidth: '800px', margin: '0 auto' }}>
                {/* Scores */}
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
                {renderGamePicks(picks, setPicks, tiebreaker, setTiebreaker, false)}
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
                          } else { setAdminTargetPicks({}); setAdminTargetTiebreaker(""); }
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
      {/* Ticker (Final Section) */}
    </div>
  );
}

export default App;