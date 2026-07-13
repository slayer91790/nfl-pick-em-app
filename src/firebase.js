import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebase web config is public by design (it ships in the JS bundle).
// Actual access control lives in firestore.rules — deploy those!
const firebaseConfig = {
  apiKey: "AIzaSyBBGnrgsHTTTmuCbkZeZZ7FPlkuRP3JGfI",
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

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export const signInWithGoogle = async () => {
  // Mobile browsers block/kill popups — use a full-page redirect there instead.
  if (isMobile) {
    try { await signInWithRedirect(auth, googleProvider); } // navigates away; auth completes on return
    catch (error) { console.error("Redirect sign-in failed", error); alert("Login Failed: " + error.message); }
    return null;
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') return null;
    if (error.code === 'auth/popup-blocked' || error.code === 'auth/operation-not-supported-in-this-environment') {
      // Popup blocked on desktop too? Fall back to redirect.
      try { await signInWithRedirect(auth, googleProvider); return null; }
      catch (e2) { console.error("Redirect fallback failed", e2); alert("Login Failed: " + e2.message); return null; }
    }
    console.error("Error signing in", error);
    alert("Login Failed: " + error.message);
    return null;
  }
};

// Completes a redirect sign-in when the browser returns to the app.
// Surfaces errors that would otherwise fail silently (the "blank flash" bug).
export const completeRedirectSignIn = async () => {
  try {
    await getRedirectResult(auth);
  } catch (error) {
    console.error("Redirect sign-in completion failed", error);
    alert("Login Failed: " + error.message);
  }
};
