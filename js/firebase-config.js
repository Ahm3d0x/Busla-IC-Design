// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    addDoc,      // Added for creating new documents (like team requests)
    setDoc, 
    getDoc, 
    getDocs,     // Added for querying collections
    updateDoc, 
    query,       // Added for filtering
    where,       // Added for filtering conditions
    arrayUnion, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAsN0YsS3PFIbi-vRp1GK5SiqPqXGeUkG4",
    authDomain: "busla-digital-ic.firebaseapp.com",
    projectId: "busla-digital-ic",
    storageBucket: "busla-digital-ic.firebasestorage.app",
    messagingSenderId: "1052649073663",
    appId: "1:1052649073663:web:92dc69e9fe2046936155ca"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Export all necessary functions for other modules
export { 
    db, 
    auth, 
    collection, 
    doc, 
    addDoc, 
    setDoc, 
    getDoc, 
    getDocs, 
    updateDoc, 
    query, 
    where, 
    arrayUnion, 
    serverTimestamp, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
};