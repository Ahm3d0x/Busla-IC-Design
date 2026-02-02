// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

// إعدادات مشروعك
const firebaseConfig = {
    apiKey: "AIzaSyAsN0YsS3PFIbi-vRp1GK5SiqPqXGeUkG4",
    authDomain: "busla-digital-ic.firebaseapp.com",
    projectId: "busla-digital-ic",
    storageBucket: "busla-digital-ic.firebasestorage.app",
    messagingSenderId: "1052649073663",
    appId: "1:1052649073663:web:92dc69e9fe2046936155ca"
};

// تهيئة التطبيق
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// تصدير الأدوات لباقي الملفات
export { db, auth, collection, doc, setDoc, getDoc, updateDoc, serverTimestamp, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut };