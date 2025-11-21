import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// ===============================================================
// ⚠️ PASTE YOUR REAL KEYS HERE (If they aren't already)
// ===============================================================
const firebaseConfig = {
  apiKey: "AIzaSyBBGnrgsHTTTmuCbkZeZZ7FPlkuRP3JGfI", // <--- YOUR REAL KEY
  authDomain: "nfl-pick-em-2025.firebaseapp.com",
  projectId: "nfl-pick-em-2025",
  storageBucket: "nfl-pick-em-2025.firebasestorage.app",
  messagingSenderId: "684455829730",
  appId: "1:684455829730:web:f7960aed3eb38ff8f73ebb"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

// --- LOGIN FUNCTION ---
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in", error);
    alert("Login Failed: " + error.message);
    return null;
  }
};