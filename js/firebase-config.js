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
    updateDoc, 
    deleteDoc,      // 👈 تم الإضافة: للحذف
    writeBatch,     // 👈 تم الإضافة: للنشر الجماعي
    query,
    where,
    arrayUnion,
    arrayRemove, 
    serverTimestamp,
    increment       // 👈 تم الإضافة: للعدادات
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
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
    deleteDoc,    // 👈 تأكد من تصديرها
    writeBatch,   // 👈 تأكد من تصديرها
    query, 
    where, 
    arrayUnion, 
    arrayRemove, 
    serverTimestamp,
    increment,
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
};