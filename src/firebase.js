// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// REPLACE THIS PART WITH YOUR REAL KEYS FROM THE WEBSITE
const firebaseConfig = {
  apiKey: "AIzaSyBBGnrgsHTTTmuCbkZeZZ7FPlkuRP3JGfI",
  authDomain: "nfl-pick-em-2025.firebaseapp.com",
  projectId: "nfl-pick-em-2025",
  storageBucket: "nfl-pick-em-2025.firebasestorage.app",
  messagingSenderId: "684455829730",
  appId: "1:684455829730:web:f7960aed3eb38ff8f73ebb"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export the tools we need
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

// A simple login function we can use anywhere
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in", error);
  }
};