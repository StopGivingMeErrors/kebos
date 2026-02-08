// src/firebase/firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAPx1N1By5KBHL8l-5QPDv0KJcGcI9b6g0",
  authDomain: "kebos-d63af.firebaseapp.com",
  projectId: "kebos-d63af",
  storageBucket: "kebos-d63af.firebasestorage.app",
  messagingSenderId: "949643546172",
  appId: "1:949643546172:web:f8d75687dd125f6a797d39",
  measurementId: "G-L6MY6RX2F1"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
