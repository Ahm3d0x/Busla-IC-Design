// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    addDoc,
    setDoc, 
    getDoc, 
    getDocs,
    runTransaction,
    updateDoc, 
    deleteDoc,      
    writeBatch,     
    query,
    orderBy, 
    limit,
    where,
    arrayUnion,
    arrayRemove, 
    serverTimestamp,
    increment       
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    sendEmailVerification, 
    updateProfile,  
    sendPasswordResetEmail, 
    EmailAuthProvider,
    reauthenticateWithCredential,
    signOut 
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAsN0YsS3PFIbi-vRp1GK5SiqPqXGeUkG4",
    authDomain: "busla-digital-ic.firebaseapp.com",
    projectId: "busla-digital-ic",
    storageBucket: "busla-digital-ic.firebasestorage.app",
    messagingSenderId: "1052649073663",
    appId: "1:1052649073663"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { 
    auth, 
    db, 
    collection, 
    doc, 
    addDoc, 
    setDoc, 
    getDoc, 
    getDocs, 
    updateDoc, 
    deleteDoc,    
    writeBatch,   
    query, 
    where, 
    orderBy,
    limit,
    arrayUnion, 
    arrayRemove, 
    runTransaction,
    serverTimestamp,
    increment,
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    sendEmailVerification, 
    updateProfile,  
    EmailAuthProvider,
    reauthenticateWithCredential,
    signOut 
};