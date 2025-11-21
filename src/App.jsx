import React, { useState, useEffect, useRef } from 'react';
import { signInWithGoogle, db, auth } from './firebase';
import { doc, setDoc, collection, getDocs } from 'firebase/firestore';

// ==========================================
// 🔒 SECURITY SETTINGS
// Only emails in this list can access the app.
// Add your friends' Google emails here.
// ==========================================
const ALLOWED_EMAILS = [
  "slayer91790@gmail.com",  // <--- REPLACE THIS WITH YOUR EMAIL
  "antoniodanielvazquez@gmail.com",
  "friend2@example.com"
];

function App() {
  // --- STATE VARIABLES (The App's Memory) ---
  const [user, setUser] = useState(null);
  const [games, setGames] = useState([]);
  const [picks, setPicks] = useState({});
  const [view, setView] = useState('home'); // Options: 'home', 'picks', 'leaderboard'
  const [leaders, setLeaders] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(12); // Default to Week 12

  // Audio Player (Points to public/intro.mp3)
  const audioRef = useRef(new Audio('/intro.mp3'));

  // 1. Fetch NFL Schedule from ESPN
  useEffect(() => {
    const fetchGames = async () => {
      try {
        // Fetches data dynamically based on the selected week
        const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${currentWeek}&seasontype=2`);
        const data = await response.json();
        setGames(data.events);
      } catch (error) {
        console.error("Error fetching games:", error);
      }
    };
    fetchGames();
  }, [currentWeek]);

  // 2. Handle Login + Security + Audio
  const handleLogin = async () => {
    const loggedInUser = await signInWithGoogle();
    
    if (loggedInUser) {
      // Check if email is allowed
      if (ALLOWED_EMAILS.includes(loggedInUser.email)) {
        setUser(loggedInUser);
        
        // Play the intro song
        try {
          audioRef.current.volume = 0.5; 
          audioRef.current.play();
        } catch (e) {
          console.log("Audio could not play automatically (browser blocked it).");
        }
      } else {
        // If not on the list, kick them out
        alert("🚫 ACCESS DENIED: You are not on the guest list.");
        auth.signOut();
      }
    }
  };

  // 3. Handle Picking a Team
  const selectTeam = (gameId, teamAbbr) => {
    setPicks((prev) => ({
      ...prev,
      [gameId]: teamAbbr
    }));
  };

  // 4. Save Picks to Database
  const submitPicks = async () => {
    if (!user) return;
    try {
      // Saves to: picks_2025 -> userID -> week12
      await setDoc(doc(db, "picks_2025", user.uid), {
        userId: user.uid,
        userName: user.displayName,
        photo: user.photoURL,
        [`week${currentWeek}`]: picks, // Saves specifically for this week
        timestamp: new Date()
      }, { merge: true });

      alert("✅ Picks Saved Successfully!");
      setView('leaderboard'); // Auto-switch to leaderboard
      fetchLeaderboard();     // Refresh data
    } catch (error) {
      console.error("Error saving picks:", error);
      alert("Error saving picks. Check console.");
    }
  };

  // 5. Read Leaderboard Data
  const fetchLeaderboard = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "picks_2025"));
      const loadedLeaders = [];
      querySnapshot.forEach((doc) => {
        loadedLeaders.push(doc.data());
      });
      setLeaders(loadedLeaders);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
    }
  };

  // Refresh leaderboard when clicking that tab
  useEffect(() => {
    if (view === 'leaderboard') {
      fetchLeaderboard();
    }
  }, [view]);

  // ==========================================
  // 🎨 THE VISUALS (RENDER)
  // ==========================================
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', backgroundColor: '#121212', minHeight: '100vh', color: 'white', paddingBottom: '80px' }}>
      
      {/* --- TOP HEADER --- */}
      <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333' }}>
        <h1 style={{ fontSize: '18px', margin: 0, color: '#fff' }}>🏈 Pick 'Em Pro</h1>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: '#ccc' }}>{user.displayName}</span>
            <img src={user.photoURL} referrerPolicy="no-referrer" style={{ width: '35px', borderRadius: '50%', border: '2px solid #28a745' }} />
          </div>
        )}
      </div>

      {/* --- LOGIN SCREEN (If not logged in) --- */}
      {!user ? (
        <div style={{ textAlign: 'center', marginTop: '150px', padding: '20px' }}>
          <div style={{ fontSize: '60px', marginBottom: '20px' }}>🏈</div>
          <h2 style={{ fontSize: '28px', marginBottom: '10px' }}>Private League</h2>
          <p style={{ color: '#888', marginBottom: '40px' }}>Invitation Only • 2025 Season</p>
          <button 
            onClick={handleLogin} 
            style={{ padding: '15px 40px', fontSize: '18px', backgroundColor: '#4285F4', color: 'white', border: 'none', borderRadius: '50px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(66, 133, 244, 0.4)' }}>
            Enter League
          </button>
        </div>
      ) : (
        <>
          {/* --- NAVIGATION TABS --- */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', margin: '20px 0' }}>
            <button onClick={() => setView('home')} style={{ padding: '8px 20px', borderRadius: '20px', border: 'none', backgroundColor: view === 'home' ? '#28a745' : '#333', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>Home</button>
            <button onClick={() => setView('picks')} style={{ padding: '8px 20px', borderRadius: '20px', border: 'none', backgroundColor: view === 'picks' ? '#28a745' : '#333', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>Picks</button>
            <button onClick={() => setView('leaderboard')} style={{ padding: '8px 20px', borderRadius: '20px', border: 'none', backgroundColor: view === 'leaderboard' ? '#28a745' : '#333', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>Standings</button>
          </div>

          {/* --- WEEK SELECTOR (Only on Home/Picks) --- */}
          {view !== 'leaderboard' && (
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <select 
                value={currentWeek} 
                onChange={(e) => setCurrentWeek(e.target.value)}
                style={{ padding: '8px 15px', borderRadius: '10px', backgroundColor: '#222', color: 'white', border: '1px solid #444', fontSize: '16px' }}
              >
                {[...Array(18)].map((_, i) => <option key={i+1} value={i+1}>Week {i+1}</option>)}
              </select>
            </div>
          )}

          <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 15px' }}>
            
            {/* --- VIEW 1: HOME / SCOREBOARD --- */}
            {view === 'home' && (
              <div>
                <div style={{ textAlign: 'center', marginBottom: '30px', padding: '30px', background: 'linear-gradient(135deg, #222, #111)', borderRadius: '20px', border: '1px solid #333' }}>
                  <h2 style={{ margin: 0, fontSize: '24px', color: '#28a745' }}>Welcome Back!</h2>
                  <p style={{ color: '#888', marginTop: '5px' }}>Live Scores for Week {currentWeek}</p>
                </div>
                
                <div style={{ display: 'grid', gap: '15px' }}>
                  {games.map(game => {
                    const home = game.competitions[0].competitors.find(c => c.homeAway === 'home');
                    const away = game.competitions[0].competitors.find(c => c.homeAway === 'away');
                    return (
                      <div key={game.id} style={{ backgroundColor: '#1e1e1e', padding: '15px', borderRadius: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #333' }}>
                        <div style={{ textAlign: 'center', width: '60px' }}>
                          <img src={away.team.logo} style={{ width: '35px' }} />
                          <div style={{ fontWeight: 'bold', fontSize: '18px', marginTop: '5px' }}>{away.score || 0}</div>
                        </div>
                        <div style={{ textAlign: 'center', fontSize: '12px', color: '#666' }}>
                          <div style={{ color: '#888', marginBottom: '5px' }}>{game.status.type.shortDetail}</div>
                          <div>VS</div>
                        </div>
                        <div style={{ textAlign: 'center', width: '60px' }}>
                          <img src={home.team.logo} style={{ width: '35px' }} />
                          <div style={{ fontWeight: 'bold', fontSize: '18px', marginTop: '5px' }}>{home.score || 0}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* --- VIEW 2: MAKE PICKS --- */}
            {view === 'picks' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
                {games.map((game) => {
                  const home = game.competitions[0].competitors.find(c => c.homeAway === 'home');
                  const away = game.competitions[0].competitors.find(c => c.homeAway === 'away');
                  const myPick = picks[game.id];

                  return (
                    <div key={game.id} style={{ backgroundColor: '#fff', borderRadius: '15px', overflow: 'hidden', color: 'black' }}>
                      <div style={{ backgroundColor: '#f0f0f0', padding: '8px', textAlign: 'center', fontSize: '11px', color: '#666', fontWeight: 'bold' }}>
                        {game.status.type.shortDetail}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '15px', alignItems: 'center' }}>
                        
                        {/* Away Team */}
                        <div 
                          onClick={() => selectTeam(game.id, away.team.abbreviation)}
                          style={{ flex: 1, textAlign: 'center', cursor: 'pointer', border: myPick === away.team.abbreviation ? '2px solid #28a745' : '2px solid transparent', borderRadius: '10px', padding: '10px', backgroundColor: myPick === away.team.abbreviation ? '#e6fffa' : 'transparent', transition: 'all 0.2s' }}>
                          <img src={away.team.logo} style={{ width: '45px' }} />
                          <div style={{ fontWeight: 'bold', fontSize: '14px', marginTop: '5px' }}>{away.team.abbreviation}</div>
                        </div>
                        
                        <div style={{ color: '#ccc', fontWeight: 'bold' }}>@</div>

                        {/* Home Team */}
                        <div 
                          onClick={() => selectTeam(game.id, home.team.abbreviation)}
                          style={{ flex: 1, textAlign: 'center', cursor: 'pointer', border: myPick === home.team.abbreviation ? '2px solid #28a745' : '2px solid transparent', borderRadius: '10px', padding: '10px', backgroundColor: myPick === home.team.abbreviation ? '#e6fffa' : 'transparent', transition: 'all 0.2s' }}>
                          <img src={home.team.logo} style={{ width: '45px' }} />
                          <div style={{ fontWeight: 'bold', fontSize: '14px', marginTop: '5px' }}>{home.team.abbreviation}</div>
                        </div>
                      
                      </div>
                    </div>
                  );
                })}
                {/* Submit Button */}
                {Object.keys(picks).length > 0 && (
                  <button onClick={submitPicks} style={{ position: 'fixed', bottom: '25px', left: '50%', transform: 'translateX(-50%)', width: '80%', maxWidth: '400px', padding: '18px', backgroundColor: '#28a745', color: 'white', fontSize: '18px', fontWeight: 'bold', border: 'none', borderRadius: '50px', boxShadow: '0 5px 20px rgba(0,0,0,0.5)', cursor: 'pointer', zIndex: 100 }}>
                    Submit {Object.keys(picks).length} Picks
                  </button>
                )}
              </div>
            )}

            {/* --- VIEW 3: LEADERBOARD --- */}
            {view === 'leaderboard' && (
              <div style={{ backgroundColor: '#1e1e1e', borderRadius: '15px', overflow: 'hidden', border: '1px solid #333' }}>
                 <div style={{ padding: '15px', borderBottom: '1px solid #333', fontWeight: 'bold', color: '#888', fontSize: '12px', textTransform: 'uppercase' }}>
                    League Standings
                 </div>
                 {leaders.map((player) => (
                    <div key={player.userId} style={{ padding: '20px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        {player.photo && <img src={player.photo} referrerPolicy="no-referrer" style={{ width: '40px', borderRadius: '50%', border: '1px solid #555' }} />}
                        <div>
                          <div style={{ fontWeight: 'bold', color: 'white' }}>{player.userName}</div>
                          <div style={{ fontSize: '12px', color: '#666' }}>Week {currentWeek} Submitted</div>
                        </div>
                      </div>
                      <div style={{ backgroundColor: '#28a745', color: 'white', padding: '5px 12px', borderRadius: '15px', fontSize: '12px', fontWeight: 'bold' }}>
                        {player[`week${currentWeek}`] ? Object.keys(player[`week${currentWeek}`]).length : 0} Picks
                      </div>
                    </div>
                 ))}
                 {leaders.length === 0 && (
                   <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>No picks submitted for this week yet.</div>
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