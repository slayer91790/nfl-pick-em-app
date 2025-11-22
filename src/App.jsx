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
  const funnySounds = useMemo(() => FUNNY_SOUND_FILES.map(file => new Audio(file)), []); // FIX: Use useMemo
  const sanitizeEmail = (email) => email.replace(/\./g, '_');

  // 1. Load Config (UNCHANGED)
  useEffect(() => {
    // ...
  }, []);

  // 2. Login (INTRO SONG REMOVED)
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
        // ... (Archive logic - setGames and setLeaders) ...
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
        querySnapshot.forEach((doc) => loadedLeaders.push(doc.data()));
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

  // --- ACTIONS & LOGIC ---
  const getCellColor = (pick, winner) => { /* ... */ };
  const getDisplayName = (player) => { /* ... */ return player.userName; };
  const calculateStats = (gameId, team) => { /* ... */ };

  const handleLogin = () => signInWithGoogle();
  const handleLogout = () => { auth.signOut(); window.location.reload(); };

  // 🔊 FIXED: Smart Team Selection (Rotation Logic)
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
  // ... (Full Admin functions for Paid, Reset, Add Guest, etc.) ...
  
  // --- RENDER (Skipping login screen JSX) ---
  if (!user) {
    // ... Login Screen JSX ...
    return (<div style={{textAlign: 'center', marginTop: '150px'}}><button onClick={handleLogin}>Enter League</button></div>); 
  }

  return (
    // ... Full Render JSX ...
  );
}

export default App;