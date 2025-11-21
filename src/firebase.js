// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// --- YOUR CONFIG (DO NOT CHANGE THIS PART) ---
const firebaseConfig = {
  apiKey: "AIzaSyBBGnrgsHTTTmuCbkZeZZ7FPlkuRP3JGfI",            // Keep your existing key here
  authDomain: "nfl-pick-em-2025.firebaseapp.com", // Ensure this matches your project
  projectId: "nfl-pick-em-2025",
  storageBucket: "nfl-pick-em-2025.firebasestorage.app",
  messagingSenderId: "684455829730",       // Keep your existing ID
  appId: "1:684455829730:web:f7960aed3eb38ff8f73ebb"                    // Keep your existing ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

// --- THE FIX: USE REDIRECT INSTEAD OF POPUP ---
export const signInWithGoogle = async () => {
  try {
    await signInWithRedirect(auth, googleProvider);
    // The page will reload automatically.
    // We don't return anything here because the page refreshes.
  } catch (error) {
    console.error("Error signing in", error);
  }
};

// Helper to check login status after the redirect
export const checkRedirectLogin = async () => {
  try {
    const result = await getRedirectResult(auth);
    return result ? result.user : null;
  } catch (error) {
    console.error("Redirect error:", error);
    return null;
  }
};