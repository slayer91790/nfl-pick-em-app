import React, { useState, useEffect, useRef } from 'react';
import { signInWithGoogle, db, auth } from './firebase';
import { doc, setDoc, collection, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// ==========================================
// 🔒 SECURITY SETTINGS
// ==========================================
const ALLOWED_EMAILS = [
  "slayer91790@gmail.com",
  "antoniodanielvazquez@gmail.com",
  "crazynphat13@gmail.com",
  "friend1@example.com"
];

const PAST_STATS = [
  { name: "Albert",       score: 89, rank: 1, wins: 4 },
  { name: "Tony",         score: 83, rank: 2, wins: 1 },
  { name: "Andy",         score: 79, rank: 3, wins: 1 },
  { name: "Omar",         score: 77, rank: 4, wins: 1 },
  { name: "Luis",         score: 77, rank: 4, wins: 0 },
  { name: "Art",          score: 76, rank: 6, wins: 0 },
  { name: "Roman",        score: 71, rank: 7, wins: 0 },
  { name: "Tim",          score: 69, rank: 8, wins: 1 },
  { name: "Luis Solorio", score: 53, rank: 9, wins: 0 },
  { name: "Louis",        score: 34, rank: 10, wins: 0 }
];

function App() {
  const [user, setUser] = useState(null);
  const [accessDeniedEmail, setAccessDeniedEmail] = useState(null); // STOP THE LOOP
  const [loading, setLoading] = useState(true);
  const [games, setGames] = useState([]);
  const [picks, setPicks] = useState({});
  const [view, setView] = useState('dashboard'); 
  const [leaders, setLeaders] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(12);

  const audioRef = useRef(new Audio('/intro.mp3'));
  const funnyRef = useRef(new Audio('/funny.mp3'));

  // 1. Login Listener (ROBUST VERSION)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setLoading(true); // Start loading check
      
      if (currentUser) {
        // Force everything to lowercase to fix mismatch issues
        const email = currentUser.email.toLowerCase();
        const allowedList = ALLOWED_EMAILS.map(e => e.toLowerCase());

        if (allowedList.includes(email)) {
          setUser(currentUser);
          fetchLeaderboard(); 
          // Try audio
          try {
             audioRef.current.volume = 0.5;
             audioRef.current.play().catch(() => {});
          } catch (e) {}
        } else {
          // DO NOT SIGN OUT - Show the error screen instead
          setAccessDeniedEmail(currentUser.email);
        }
      }
      setLoading(false); // Done checking
    });
    return () => unsubscribe();
  }, []);

  // 2. Fetch Games
  useEffect(() => {
    const fetchGames = async () => {
      try {
        const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${currentWeek}&seasontype=2`);
        const data = await response.json();
        setGames(data.events);
      } catch (error) { console.error(error); }
    };
    fetchGames();
  }, [currentWeek]);

  const handleLogin = () => signInWithGoogle();

  const handleLogout = () => {
    auth.signOut();
    setUser(null);
    setAccessDeniedEmail(null);
    window.location.reload();
  };

  const selectTeam = (gameId, teamAbbr, oddsString) => {
    setPicks((prev) => ({ ...prev, [gameId]: teamAbbr }));
    if (oddsString && oddsString.includes(teamAbbr) && oddsString.includes('+')) {
      const number = parseFloat(oddsString.replace(/[^0-9.]/g, ''));
      if (number >= 9) {
        try {
          funnyRef.current.currentTime = 0;
          funnyRef.current.play();
        } catch(e) {}
      }
    }
  };

  const submitPicks = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, "picks_2025", user.uid), {
        userId: user.uid,
        userName: user.displayName,
        photo: user.photoURL,
        paid: false, 
        [`week${currentWeek}`]: picks,
        timestamp: new Date()
      }, { merge: true });
      alert("✅ Picks Saved Successfully!");
      fetchLeaderboard();     
    } catch (error) { alert("Error saving picks."); }
  };

  const fetchLeaderboard = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "picks_2025"));
      const loadedLeaders = [];
      querySnapshot.forEach((doc) => loadedLeaders.push(doc.data()));
      setLeaders(loadedLeaders);
    } catch (error) {}
  };

  // ==========================================
  // 🎨 RENDER
  // ==========================================

  // 1. ACCESS DENIED SCREEN (Debugging)
  if (accessDeniedEmail) {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212', color: 'white', flexDirection: 'column', padding: '20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '60px', margin: '0 0 20px 0' }}>🚫</h1>
        <h2 style={{ color: '#ff4444' }}>Access Denied</h2>
        <p>You are currently logged in as:</p>
        <div style={{ backgroundColor: '#333', padding: '10px 20px', borderRadius: '10px', margin: '10px 0', fontFamily: 'monospace', fontSize: '16px', border: '1px solid #555' }}>
          {accessDeniedEmail}
        </div>
        <p style={{ maxWidth: '400px', color: '#888' }}>This email is not in the Guest List code. Please send this screenshot to the admin.</p>
        <button onClick={handleLogout} style={{ marginTop: '20px', padding: '10px 20px', backgroundColor: 'white', color: 'black', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
          Log Out & Try Different Email
        </button>
      </div>
    );
  }

  // 2. LOADING SCREEN
  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212', color: 'white', flexDirection: 'column' }}>
        <div style={{ fontSize: '40px', marginBottom: '20px' }}>🏈</div>
        <h3>Connecting...</h3>
      </div>
    );
  }

  // 3. MAIN APP
  return (
    <div style={{ 
      fontFamily: 'Arial, sans-serif', 
      minHeight: '100vh', 
      color: 'white', 
      paddingBottom: '80px',
      backgroundImage: "linear-gradient(rgba(0,0,0,0.85), rgba(0,0,0,0.9)), url('/bg.jpg')",
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed'
    }}>
      
      {/* Header */}
      <div style={{ padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <h1 style={{ fontSize: '18px', margin: 0, color: '#fff' }}>🏈 Pick 'Em Pro</h1>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#ccc', display: 'none', sm: 'block' }}>{user.displayName}</span>
              <img src={user.photoURL} referrerPolicy="no-referrer" style={{ width: '35px', borderRadius: '50%', border: '2px solid #28a745' }} />
            </div>
            <button onClick={handleLogout} style={{ backgroundColor: '#d9534f', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '5px', fontSize: '12px', cursor: 'pointer' }}>Logout</button>
          </div>
        )}
      </div>

      {/* Login Screen */}
      {!user ? (
        <div style={{ textAlign: 'center', marginTop: '150px', padding: '20px' }}>
          <div style={{ fontSize: '60px', marginBottom: '20px' }}>🏈</div>
          <h2 style={{ fontSize: '28px', marginBottom: '10px' }}>Private League</h2>
          <p style={{ color: '#888', marginBottom: '40px' }}>Invitation Only • 2025 Season</p>
          <button onClick={handleLogin} style={{ padding: '15px 40px', fontSize: '18px', backgroundColor: '#4285F4', color: 'white', border: 'none', borderRadius: '50px', cursor: 'pointer', fontWeight: 'bold' }}>
            Enter League
          </button>
        </div>
      ) : (
        <>
          {/* Nav Tabs */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', margin: '20px 0' }}>
            <button onClick={() => setView('dashboard')} style={{ padding: '10px 30px', borderRadius: '30px', border: 'none', backgroundColor: view === 'dashboard' ? '#28a745' : '#333', color: 'white', fontWeight: 'bold', cursor: 'pointer', boxShadow: view === 'dashboard' ? '0 4px 15px rgba(40, 167, 69, 0.4)' : 'none' }}>Dashboard</button>
            <button onClick={() => setView('picks')} style={{ padding: '10px 30px', borderRadius: '30px', border: 'none', backgroundColor: view === 'picks' ? '#28a745' : '#333', color: 'white', fontWeight: 'bold', cursor: 'pointer', boxShadow: view === 'picks' ? '0 4px 15px rgba(40, 167, 69, 0.4)' : 'none' }}>Make Picks</button>
          </div>

          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <select value={currentWeek} onChange={(e) => setCurrentWeek(e.target.value)} style={{ padding: '8px 15px', borderRadius: '10px', backgroundColor: '#222', color: 'white', border: '1px solid #444', fontSize: '16px' }}>
              {[...Array(18)].map((_, i) => <option key={i+1} value={i+1}>Week {i+1}</option>)}
            </select>
          </div>

          <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 15px' }}>
            
            {view === 'dashboard' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#888', marginBottom: '10px', textTransform: 'uppercase' }}>Live Scores</div>
                  <div style={{ display: 'flex', gap: '15px', overflowX: 'auto', paddingBottom: '10px' }}>
                    {games.map(game => {
                       const home = game.competitions[0].competitors.find(c => c.homeAway === 'home');
                       const away = game.competitions[0].competitors.find(c => c.homeAway === 'away');
                       return (
                         <div key={game.id} style={{ minWidth: '200px', backgroundColor: '#1e1e1e', padding: '15px', borderRadius: '15px', border: '1px solid #333', flexShrink: 0 }}>
                           <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                             <span style={{fontWeight:'bold'}}>{away.team.abbreviation}</span>
                             <span style={{fontWeight:'bold'}}>{away.score}</span>
                           </div>
                           <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                             <span style={{fontWeight:'bold'}}>{home.team.abbreviation}</span>
                             <span style={{fontWeight:'bold'}}>{home.score}</span>
                           </div>
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
                      <a href="https://venmo.com/u/MrDoom" target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '10px', backgroundColor: 'white', color: '#11998e', padding: '8px 20px', borderRadius: '20px', textDecoration: 'none', fontWeight: 'bold', fontSize: '14px' }}>
                        Pay $10 to @MrDoom ↗
                      </a>
                   </div>
                   <div style={{ padding: '15px', borderBottom: '1px solid #333', fontWeight: 'bold', color: '#888', fontSize: '12px', textTransform: 'uppercase' }}>Current Week</div>
                   {leaders.map((player) => (
                      <div key={player.userId} style={{ padding: '20px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                          {player.photo && <img src={player.photo} referrerPolicy="no-referrer" style={{ width: '40px', borderRadius: '50%', border: '1px solid #555' }} />}
                          <div>
                            <div style={{ fontWeight: 'bold', color: 'white' }}>{player.userName} {player.paid && <span>✅</span>}</div>
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
                  <div style={{ padding: '15px', backgroundColor: '#333', fontWeight: 'bold', color: 'white', fontSize: '14px' }}>📜 Season Standings (Weeks 1-11)</div>
                  {PAST_STATS.map((stat, index) => (
                    <div key={index} style={{ padding: '15px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ width: '25px', height: '25px', borderRadius: '50%', backgroundColor: index === 0 ? '#FFD700' : '#444', color: index === 0 ? 'black' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px' }}>{stat.rank}</div>
                        <div style={{ fontWeight: 'bold', color: 'white' }}>{stat.name}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#28a745', fontWeight: 'bold' }}>{stat.score} Correct</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === 'picks' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
                {games.map((game) => {
                  const home = game.competitions[0].competitors.find(c => c.homeAway === 'home');
                  const away = game.competitions[0].competitors.find(c => c.homeAway === 'away');
                  const odds = game.competitions[0].odds && game.competitions[0].odds[0] ? game.competitions[0].odds[0].details : "";
                  const myPick = picks[game.id];
                  return (
                    <div key={game.id} style={{ backgroundColor: '#fff', borderRadius: '15px', overflow: 'hidden', color: 'black' }}>
                      <div style={{ backgroundColor: '#f0f0f0', padding: '8px', textAlign: 'center', fontSize: '11px', color: '#666', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', paddingLeft: '15px', paddingRight: '15px' }}>
                        <span>{game.status.type.shortDetail}</span>
                        <span style={{color: '#d9534f'}}>{odds}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '15px', alignItems: 'center' }}>
                        <div onClick={() => selectTeam(game.id, away.team.abbreviation, odds)} style={{ flex: 1, textAlign: 'center', cursor: 'pointer', border: myPick === away.team.abbreviation ? '2px solid #28a745' : '2px solid transparent', borderRadius: '10px', padding: '10px', backgroundColor: myPick === away.team.abbreviation ? '#e6fffa' : 'transparent' }}>
                          <img src={away.team.logo} style={{ width: '45px' }} />
                          <div style={{ fontWeight: 'bold', fontSize: '14px', marginTop: '5px' }}>{away.team.abbreviation}</div>
                        </div>
                        <div style={{ color: '#ccc', fontWeight: 'bold' }}>@</div>
                        <div onClick={() => selectTeam(game.id, home.team.abbreviation, odds)} style={{ flex: 1, textAlign: 'center', cursor: 'pointer', border: myPick === home.team.abbreviation ? '2px solid #28a745' : '2px solid transparent', borderRadius: '10px', padding: '10px', backgroundColor: myPick === home.team.abbreviation ? '#e6fffa' : 'transparent' }}>
                          <img src={home.team.logo} style={{ width: '45px' }} />
                          <div style={{ fontWeight: 'bold', fontSize: '14px', marginTop: '5px' }}>{home.team.abbreviation}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {Object.keys(picks).length > 0 && (
                  <button onClick={submitPicks} style={{ position: 'fixed', bottom: '25px', left: '50%', transform: 'translateX(-50%)', width: '80%', maxWidth: '400px', padding: '18px', backgroundColor: '#28a745', color: 'white', fontSize: '18px', fontWeight: 'bold', border: 'none', borderRadius: '50px', boxShadow: '0 5px 20px rgba(0,0,0,0.5)', cursor: 'pointer', zIndex: 100 }}>
                    Submit {Object.keys(picks).length} Picks
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default App;