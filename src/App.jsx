import React, { useState, useEffect, useRef } from 'react';
import { signInWithGoogle, db, auth } from './firebase';
import { doc, setDoc, collection, getDocs, updateDoc, deleteField, getDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// ==========================================
// 👑 ADMINS ONLY (Hardcoded for safety)
// Add your email and your co-manager's email here.
// ==========================================
const ADMIN_EMAILS = [
  "slayer91790@gmail.com", 
  "antoniodanielvazquez@gmail.com" // Add Co-Manager here
];

// ==========================================
// 📊 HISTORY
// ==========================================
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
  // --- STATE ---
  const [user, setUser] = useState(null);
  const [games, setGames] = useState([]);
  const [picks, setPicks] = useState({});
  const [view, setView] = useState('dashboard'); 
  const [leaders, setLeaders] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(12);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Guest List State (From Database)
  const [guestList, setGuestList] = useState([]);
  const [newEmailInput, setNewEmailInput] = useState("");

  const audioRef = useRef(new Audio('/intro.mp3'));
  const funnyRef = useRef(new Audio('/funny.mp3'));

  // --- INITIALIZATION: Load Guest List from DB ---
  useEffect(() => {
    const loadConfig = async () => {
      const configRef = doc(db, "config", "settings");
      const docSnap = await getDoc(configRef);
      
      if (docSnap.exists()) {
        setGuestList(docSnap.data().allowedEmails || []);
      } else {
        // First time setup: Seed DB with admins if empty
        const initialList = [...ADMIN_EMAILS]; 
        await setDoc(configRef, { allowedEmails: initialList });
        setGuestList(initialList);
      }
    };
    loadConfig();
  }, []);

  // --- LOGIN LISTENER ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        const email = currentUser.email.toLowerCase();
        
        // Check if they are in the loaded guest list OR are a hardcoded admin
        const isAllowed = guestList.some(e => e.toLowerCase() === email) || ADMIN_EMAILS.some(e => e.toLowerCase() === email);

        if (isAllowed) {
          setUser(currentUser);
          setIsAdmin(ADMIN_EMAILS.some(e => e.toLowerCase() === email)); // Set Admin Mode
          fetchLeaderboard();
          try {
             audioRef.current.volume = 0.5;
             audioRef.current.play().catch(() => {});
          } catch (e) {}
        } else {
          alert(`🚫 Access Denied: ${email} is not on the guest list.`);
          auth.signOut();
        }
      } else {
        setUser(null);
        setIsAdmin(false);
      }
    });
    return () => unsubscribe();
  }, [guestList]); // Re-run if guest list changes

  // --- FETCH GAMES ---
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

  // --- ADMIN ACTIONS ---
  const addGuest = async () => {
    if (!newEmailInput) return;
    const emailToAdd = newEmailInput.toLowerCase().trim();
    const configRef = doc(db, "config", "settings");
    
    await updateDoc(configRef, { allowedEmails: arrayUnion(emailToAdd) });
    setGuestList(prev => [...prev, emailToAdd]); // Update local state
    setNewEmailInput("");
    alert(`Added ${emailToAdd}`);
  };

  const removeGuest = async (emailToRemove) => {
    if (!window.confirm(`Remove ${emailToRemove}?`)) return;
    const configRef = doc(db, "config", "settings");
    await updateDoc(configRef, { allowedEmails: arrayRemove(emailToRemove) });
    setGuestList(prev => prev.filter(e => e !== emailToRemove));
  };

  const togglePaid = async (userId, currentStatus) => {
    const userRef = doc(db, "picks_2025", userId);
    await updateDoc(userRef, { paid: !currentStatus });
    fetchLeaderboard(); // Refresh UI
  };

  const resetPicks = async (userId) => {
    if (!window.confirm("Are you sure? This will DELETE their picks for this week.")) return;
    const userRef = doc(db, "picks_2025", userId);
    await updateDoc(userRef, { [`week${currentWeek}`]: deleteField() });
    fetchLeaderboard();
    alert("Picks wiped.");
  };

  // --- STANDARD ACTIONS ---
  const handleLogin = () => signInWithGoogle();
  const handleLogout = () => { auth.signOut(); window.location.reload(); };

  const selectTeam = (gameId, teamAbbr, oddsString) => {
    setPicks((prev) => ({ ...prev, [gameId]: teamAbbr }));
    // Funny sound logic
    if (oddsString && oddsString.includes(teamAbbr) && oddsString.includes('+')) {
      const number = parseFloat(oddsString.replace(/[^0-9.]/g, ''));
      if (number >= 9) {
        try { funnyRef.current.currentTime = 0; funnyRef.current.play(); } catch(e) {}
      }
    }
  };

  const submitPicks = async () => {
    if (!user) return;
    
    // 1. VALIDATION: Must pick all games
    const totalGames = games.length;
    const myPickCount = Object.keys(picks).length;
    
    if (myPickCount < totalGames) {
      alert(`❌ INCOMPLETE: You have only picked ${myPickCount} of ${totalGames} games. You must pick them all!`);
      return; // Stop here
    }

    try {
      await setDoc(doc(db, "picks_2025", user.uid), {
        userId: user.uid,
        userName: user.displayName,
        photo: user.photoURL,
        // Don't overwrite paid status if it exists
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
      querySnapshot.forEach((doc) => {
        // Ensure paid status defaults to false if missing
        const data = doc.data();
        if (data.paid === undefined) data.paid = false;
        loadedLeaders.push(data);
      });
      setLeaders(loadedLeaders);
    } catch (error) {}
  };

  // ==========================================
  // 🎨 RENDER
  // ==========================================
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', color: 'white', paddingBottom: '80px', backgroundImage: "linear-gradient(rgba(0,0,0,0.85), rgba(0,0,0,0.9)), url('/bg.jpg')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      
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
          <button onClick={handleLogin} style={{ padding: '15px 40px', fontSize: '18px', backgroundColor: '#4285F4', color: 'white', border: 'none', borderRadius: '50px', cursor: 'pointer', fontWeight: 'bold' }}>Enter League</button>
        </div>
      ) : (
        <>
          {/* Nav Tabs */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', margin: '20px 0', flexWrap: 'wrap' }}>
            <button onClick={() => setView('dashboard')} style={{ padding: '8px 20px', borderRadius: '30px', border: 'none', backgroundColor: view === 'dashboard' ? '#28a745' : '#333', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>Dashboard</button>
            <button onClick={() => setView('picks')} style={{ padding: '8px 20px', borderRadius: '30px', border: 'none', backgroundColor: view === 'picks' ? '#28a745' : '#333', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>Make Picks</button>
            {/* ADMIN TAB (Only Visible to Admins) */}
            {isAdmin && (
              <button onClick={() => setView('admin')} style={{ padding: '8px 20px', borderRadius: '30px', border: '2px solid gold', backgroundColor: view === 'admin' ? 'gold' : 'transparent', color: view === 'admin' ? 'black' : 'gold', fontWeight: 'bold', cursor: 'pointer' }}>👑 Admin</button>
            )}
          </div>

          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <select value={currentWeek} onChange={(e) => setCurrentWeek(e.target.value)} style={{ padding: '8px 15px', borderRadius: '10px', backgroundColor: '#222', color: 'white', border: '1px solid #444', fontSize: '16px' }}>
              {[...Array(18)].map((_, i) => <option key={i+1} value={i+1}>Week {i+1}</option>)}
            </select>
          </div>

          <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 15px' }}>
            
            {/* === ADMIN VIEW === */}
            {view === 'admin' && isAdmin && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* 1. MANAGE GUESTS */}
                <div style={{ backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '15px', border: '1px solid #333' }}>
                  <h3>👥 Manage Guest List</h3>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                    <input 
                      value={newEmailInput}
                      onChange={(e) => setNewEmailInput(e.target.value)}
                      placeholder="friend@gmail.com"
                      style={{ flex: 1, padding: '10px', borderRadius: '5px', border: 'none' }}
                    />
                    <button onClick={addGuest} style={{ backgroundColor: '#28a745', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '5px', cursor: 'pointer' }}>Add</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {guestList.map(email => (
                      <div key={email} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', backgroundColor: '#333', borderRadius: '5px' }}>
                        <span>{email}</span>
                        <button onClick={() => removeGuest(email)} style={{ color: '#ff4444', background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. MANAGE PLAYERS (Paid/Reset) */}
                <div style={{ backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '15px', border: '1px solid #333' }}>
                  <h3>💰 Manage Players & Picks (Week {currentWeek})</h3>
                  {leaders.map(player => (
                    <div key={player.userId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderBottom: '1px solid #444' }}>
                      <div style={{ fontWeight: 'bold' }}>{player.userName}</div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        {/* PAID TOGGLE */}
                        <button 
                          onClick={() => togglePaid(player.userId, player.paid)}
                          style={{ padding: '5px 10px', borderRadius: '5px', border: 'none', cursor: 'pointer', backgroundColor: player.paid ? '#28a745' : '#555', color: 'white' }}>
                          {player.paid ? "PAID ✅" : "Mark Paid"}
                        </button>
                        {/* RESET PICKS */}
                        <button 
                          onClick={() => resetPicks(player.userId)}
                          style={{ padding: '5px 10px', borderRadius: '5px', border: '1px solid #ff4444', cursor: 'pointer', backgroundColor: 'transparent', color: '#ff4444' }}>
                          Reset Picks
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* === DASHBOARD VIEW === */}
            {view === 'dashboard' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                {/* ... (Live Scores - Same as before) ... */}
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
                {/* Historical Stats */}
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

            {/* === PICKS VIEW === */}
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
                {/* Submit Button (Validation Logic Added) */}
                <button onClick={submitPicks} style={{ position: 'fixed', bottom: '25px', left: '50%', transform: 'translateX(-50%)', width: '80%', maxWidth: '400px', padding: '18px', backgroundColor: Object.keys(picks).length === games.length ? '#28a745' : '#555', color: 'white', fontSize: '18px', fontWeight: 'bold', border: 'none', borderRadius: '50px', boxShadow: '0 5px 20px rgba(0,0,0,0.5)', cursor: Object.keys(picks).length === games.length ? 'pointer' : 'not-allowed', zIndex: 100 }}>
                  {Object.keys(picks).length === games.length ? "Submit All Picks" : `Pick ${games.length - Object.keys(picks).length} More`}
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