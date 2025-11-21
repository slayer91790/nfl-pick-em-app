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

// Admin Emails (Can add/remove players & mark paid)
const ADMIN_EMAILS = [
  "slayer91790@gmail.com", 
  "antoniodanielvazquez@gmail.com"
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
  const [games, setGames] = useState([]);
  const [picks, setPicks] = useState({});
  const [view, setView] = useState('dashboard'); 
  const [leaders, setLeaders] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(12);
  const [isAdmin, setIsAdmin] = useState(false);
  const [news, setNews] = useState([]);
  const [guestList, setGuestList] = useState([]);
  const [newEmailInput, setNewEmailInput] = useState("");

  const audioRef = useRef(new Audio('/intro.mp3'));
  const funnyRef = useRef(new Audio('/funny.mp3'));

  // 1. Load Guest List from DB
  useEffect(() => {
    const loadConfig = async () => {
      const configRef = doc(db, "config", "settings");
      const docSnap = await getDoc(configRef);
      if (docSnap.exists()) {
        setGuestList(docSnap.data().allowedEmails || []);
      } else {
        await setDoc(configRef, { allowedEmails: [...ALLOWED_EMAILS] });
        setGuestList([...ALLOWED_EMAILS]);
      }
    };
    loadConfig();
  }, []);

  // 2. Login Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        const email = currentUser.email.toLowerCase();
        const isAllowed = guestList.some(e => e.toLowerCase() === email) || ADMIN_EMAILS.some(e => e.toLowerCase() === email);

        if (isAllowed) {
          setUser(currentUser);
          setIsAdmin(ADMIN_EMAILS.some(e => e.toLowerCase() === email));
          fetchLeaderboard();
          try { audioRef.current.volume = 0.5; audioRef.current.play().catch(() => {}); } catch (e) {}
        } else {
          alert(`🚫 Access Denied: ${email} is not on the guest list.`);
          auth.signOut();
        }
      } else {
        setUser(null);
      }
    });
    return () => unsubscribe();
  }, [guestList]);

  // 3. Fetch Games & News
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Games
        const gamesRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${currentWeek}&seasontype=2`);
        const gamesData = await gamesRes.json();
        setGames(gamesData.events || []);

        // News Ticker
        const newsRes = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/news');
        const newsData = await newsRes.json();
        setNews(newsData.articles || []);
      } catch (error) { console.error(error); }
    };
    fetchData();
  }, [currentWeek]);

  // --- ACTIONS ---
  const handleLogin = () => signInWithGoogle();
  const handleLogout = () => { auth.signOut(); window.location.reload(); };

  const selectTeam = (gameId, teamAbbr, oddsString) => {
    setPicks((prev) => ({ ...prev, [gameId]: teamAbbr }));
    if (oddsString && oddsString.includes(teamAbbr) && oddsString.includes('+')) {
      const number = parseFloat(oddsString.replace(/[^0-9.]/g, ''));
      if (number >= 9) {
        try { funnyRef.current.currentTime = 0; funnyRef.current.play(); } catch(e) {}
      }
    }
  };

  const submitPicks = async () => {
    if (!user) return;
    // Validation: Check if all games are picked
    if (Object.keys(picks).length < games.length) {
      alert(`❌ You have only picked ${Object.keys(picks).length} of ${games.length} games. Finish them all!`);
      return;
    }
    try {
      await setDoc(doc(db, "picks_2025", user.uid), {
        userId: user.uid,
        userName: user.displayName,
        photo: user.photoURL,
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
        const data = doc.data();
        if (data.paid === undefined) data.paid = false;
        loadedLeaders.push(data);
      });
      setLeaders(loadedLeaders);
    } catch (error) {}
  };

  // Admin Tools
  const addGuest = async () => {
    if (!newEmailInput) return;
    const email = newEmailInput.toLowerCase().trim();
    const configRef = doc(db, "config", "settings");
    await updateDoc(configRef, { allowedEmails: arrayUnion(email) });
    setGuestList(prev => [...prev, email]);
    setNewEmailInput("");
    
    // Send Email Invite Logic
    const subject = "You're invited to the NFL Pick 'Em League!";
    const body = `Join our league for Week ${currentWeek}!\n\nLink: https://nfl-picks-2025.netlify.app/\n\nRules:\n1. $10 Buy-in per week (Winner takes pot)\n2. Pick all games straight up (no spread)\n3. Submit before Thursday kickoff if possible.\n\nGood luck!`;
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const removeGuest = async (email) => {
    if (!window.confirm(`Remove ${email}?`)) return;
    const configRef = doc(db, "config", "settings");
    await updateDoc(configRef, { allowedEmails: arrayRemove(email) });
    setGuestList(prev => prev.filter(e => e !== email));
  };

  const togglePaid = async (userId, status) => {
    await updateDoc(doc(db, "picks_2025", userId), { paid: !status });
    fetchLeaderboard();
  };

  const resetPicks = async (userId) => {
    if (!window.confirm("Delete picks for this week?")) return;
    await updateDoc(doc(db, "picks_2025", userId), { [`week${currentWeek}`]: deleteField() });
    fetchLeaderboard();
  };

  // --- RENDER ---
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
            <button onClick={() => setView('matrix')} style={{ padding: '8px 20px', borderRadius: '30px', border: 'none', backgroundColor: view === 'matrix' ? '#28a745' : '#333', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>All Picks</button>
            {isAdmin && <button onClick={() => setView('admin')} style={{ padding: '8px 20px', borderRadius: '30px', border: '2px solid gold', backgroundColor: view === 'admin' ? 'gold' : 'transparent', color: view === 'admin' ? 'black' : 'gold', fontWeight: 'bold', cursor: 'pointer' }}>👑 Admin</button>}
          </div>

          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <select value={currentWeek} onChange={(e) => setCurrentWeek(e.target.value)} style={{ padding: '8px 15px', borderRadius: '10px', backgroundColor: '#222', color: 'white', border: '1px solid #444', fontSize: '16px' }}>
              {[...Array(18)].map((_, i) => <option key={i+1} value={i+1}>Week {i+1}</option>)}
            </select>
          </div>

          <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 15px' }}>
            
            {/* === VIEW 1: DASHBOARD === */}
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

            {/* === VIEW 2: MAKE PICKS === */}
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
                        <span>{game.status.type.shortDetail}</span><span style={{color: '#d9534f'}}>{odds}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '15px', alignItems: 'center' }}>
                        <div onClick={() => selectTeam(game.id, away.team.abbreviation, odds)} style={{ flex: 1, textAlign: 'center', cursor: 'pointer', border: myPick === away.team.abbreviation ? '2px solid #28a745' : '2px solid transparent', borderRadius: '10px', padding: '10px', backgroundColor: myPick === away.team.abbreviation ? '#e6fffa' : 'transparent' }}>
                          <img src={away.team.logo} style={{ width: '45px' }} /><div style={{ fontWeight: 'bold', fontSize: '14px', marginTop: '5px' }}>{away.team.abbreviation}</div>
                        </div>
                        <div style={{ color: '#ccc', fontWeight: 'bold' }}>@</div>
                        <div onClick={() => selectTeam(game.id, home.team.abbreviation, odds)} style={{ flex: 1, textAlign: 'center', cursor: 'pointer', border: myPick === home.team.abbreviation ? '2px solid #28a745' : '2px solid transparent', borderRadius: '10px', padding: '10px', backgroundColor: myPick === home.team.abbreviation ? '#e6fffa' : 'transparent' }}>
                          <img src={home.team.logo} style={{ width: '45px' }} /><div style={{ fontWeight: 'bold', fontSize: '14px', marginTop: '5px' }}>{home.team.abbreviation}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <button onClick={submitPicks} style={{ position: 'fixed', bottom: '25px', left: '50%', transform: 'translateX(-50%)', width: '80%', maxWidth: '400px', padding: '18px', backgroundColor: '#28a745', color: 'white', fontSize: '18px', fontWeight: 'bold', border: 'none', borderRadius: '50px', boxShadow: '0 5px 20px rgba(0,0,0,0.5)', cursor: 'pointer', zIndex: 100 }}>
                  Submit {Object.keys(picks).length} Picks
                </button>
              </div>
            )}

            {/* === VIEW 3: PICK MATRIX === */}
            {view === 'matrix' && (
              <div style={{ overflowX: 'auto', backgroundColor: '#1e1e1e', borderRadius: '15px', border: '1px solid #333', padding: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: 'white' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid #444', minWidth: '100px' }}>Player</th>
                      {games.map(g => {
                        const away = g.competitions[0].competitors.find(c => c.homeAway === 'away').team.abbreviation;
                        const home = g.competitions[0].competitors.find(c => c.homeAway === 'home').team.abbreviation;
                        return <th key={g.id} style={{ padding: '5px', borderBottom: '1px solid #444', minWidth: '60px' }}>{away}<br/>@<br/>{home}</th>
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {leaders.map(player => {
                      const playerPicks = player[`week${currentWeek}`] || {};
                      return (
                        <tr key={player.userId}>
                          <td style={{ padding: '10px', borderBottom: '1px solid #333', fontWeight: 'bold' }}>{player.userName}</td>
                          {games.map(g => (
                            <td key={g.id} style={{ padding: '10px', borderBottom: '1px solid #333', textAlign: 'center', color: playerPicks[g.id] ? '#28a745' : '#666' }}>
                              {playerPicks[g.id] || "-"}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* === ADMIN VIEW === */}
            {view === 'admin' && isAdmin && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '15px', border: '1px solid #333' }}>
                  <h3>👥 Manage Guest List</h3>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                    <input value={newEmailInput} onChange={(e) => setNewEmailInput(e.target.value)} placeholder="friend@gmail.com" style={{ flex: 1, padding: '10px', borderRadius: '5px', border: 'none' }} />
                    <button onClick={addGuest} style={{ backgroundColor: '#28a745', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '5px', cursor: 'pointer' }}>Add & Invite</button>
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
                <div style={{ backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '15px', border: '1px solid #333' }}>
                  <h3>💰 Manage Players</h3>
                  {leaders.map(player => (
                    <div key={player.userId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderBottom: '1px solid #444' }}>
                      <div style={{ fontWeight: 'bold' }}>{player.userName}</div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => togglePaid(player.userId, player.paid)} style={{ padding: '5px 10px', borderRadius: '5px', border: 'none', cursor: 'pointer', backgroundColor: player.paid ? '#28a745' : '#555', color: 'white' }}>{player.paid ? "PAID ✅" : "Mark Paid"}</button>
                        <button onClick={() => resetPicks(player.userId)} style={{ padding: '5px 10px', borderRadius: '5px', border: '1px solid #ff4444', cursor: 'pointer', backgroundColor: 'transparent', color: '#ff4444' }}>Reset Picks</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </>
      )}

      {/* News Ticker Footer */}
      {user && news.length > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, width: '100%', backgroundColor: '#000', color: 'white', borderTop: '2px solid #28a745', overflow: 'hidden', whiteSpace: 'nowrap', zIndex: 1000 }}>
          <div style={{ display: 'inline-block', padding: '10px', animation: 'ticker 30s linear infinite' }}>
            {news.map((n, i) => (
              <span key={i} style={{ marginRight: '50px', fontSize: '14px', fontWeight: 'bold' }}>🏈 {n.headline}</span>
            ))}
          </div>
          <style>{`@keyframes ticker { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }`}</style>
        </div>
      )}
    </div>
  );
}

export default App;