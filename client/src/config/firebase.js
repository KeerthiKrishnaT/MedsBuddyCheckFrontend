import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDUDwZYbmj-ks_NaDJE7YVK4H3D7Kz-wEc",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "meds-buddy-check.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "meds-buddy-check",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "meds-buddy-check.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "722899761246",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:722899761246:web:eb6924a24b12557064dccf"
};

const isConfigValid = 
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey !== 'your_api_key_here' &&
  firebaseConfig.apiKey.length > 10 &&
  firebaseConfig.projectId &&
  firebaseConfig.projectId !== 'your-project-id';

const usingFallback = !import.meta.env.VITE_FIREBASE_API_KEY;
if (usingFallback && isConfigValid) {
  console.warn('⚠️ Using fallback Firebase config. For production, create a .env file with your credentials.');
}

let app = null;
let auth = null;
let db = null;
let functions = null;
let storage = null;

if (isConfigValid) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    functions = getFunctions(app);
    storage = getStorage(app);
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
  }
} else {
  console.warn('Firebase not initialized - using mock objects. App will not function until .env is configured.');
}

export { auth, db, functions, storage };
export default app;

