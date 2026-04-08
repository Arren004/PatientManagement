// ============================================
// FIREBASE CONFIG - Khởi tạo Firebase
// ============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAoHIM_hP5-7Vb7Ox6q10I0EwRV5U4f6-E",
  authDomain: "deliveryrobot-2026.firebaseapp.com",
  projectId: "deliveryrobot-2026",
  storageBucket: "deliveryrobot-2026.firebasestorage.app",
  messagingSenderId: "383290927460",
  appId: "1:383290927460:web:d7f9ff32ea12087ea7b271",
  measurementId: "G-LX08NQ77BJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
let analytics = null;
try {
  analytics = getAnalytics(app);
} catch (error) {
  console.warn("[Firebase] Analytics is disabled in this environment:", error?.message || error);
}
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db, analytics };