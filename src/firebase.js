// src/firebase.js

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// (Optional) Only keep analytics if you really need it
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyA9CIpx1vu8fKU9PGxpB-n7dJr6U3e3v1k",
  authDomain: "factory-vision-df62e.firebaseapp.com",
  projectId: "factory-vision-df62e",
  storageBucket: "factory-vision-df62e.firebasestorage.app",
  messagingSenderId: "203661136137",
  appId: "1:203661136137:web:47643d4662b723fbc6c3d8",
  measurementId: "G-CD05GFLX06"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Firestore database (this is what your warehouse uses)
export const db = getFirestore(app);

// Optional analytics
export const analytics = getAnalytics(app);

