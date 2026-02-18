import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { auth } from '../config/firebase';

if (!auth) {
  console.error('Firebase Auth is not initialized. Please configure your .env file.');
}

export const signUp = async (email, password, name) => {
  if (!auth) {
    return { user: null, error: 'Firebase Auth is not initialized. Please check your .env file.' };
  }
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCredential.user, { displayName: name });
    return { user: userCredential.user, error: null };
  } catch (error) {
    console.error('Firebase Auth Error:', {
      code: error.code,
      message: error.message,
      fullError: error
    });
    
    let errorMessage = error.message;
    // Provide helpful error messages
    if (error.code === 'auth/operation-not-allowed') {
      errorMessage = 'Email/Password authentication is not enabled. Please enable it in Firebase Console > Authentication > Sign-in method.';
    } else if (error.code === 'auth/weak-password') {
      errorMessage = 'Password is too weak. Please use a stronger password.';
    } else if (error.code === 'auth/email-already-in-use') {
      errorMessage = 'This email is already registered. Please login instead.';
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = 'Invalid email address.';
    } else if (error.code === 'auth/invalid-api-key') {
      errorMessage = 'Invalid API key. Please check your Firebase configuration. The API key might be restricted.';
    } else if (error.code === 'auth/network-request-failed') {
      errorMessage = 'Network error. Please check your internet connection.';
    }
    return { user: null, error: errorMessage };
  }
};

export const signIn = async (email, password) => {
  if (!auth) {
    return { user: null, error: 'Firebase Auth is not initialized. Please check your .env file.' };
  }
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { user: userCredential.user, error: null };
  } catch (error) {
    let errorMessage = error.message;
    if (error.code === 'auth/operation-not-allowed') {
      errorMessage = 'Email/Password authentication is not enabled. Please enable it in Firebase Console > Authentication > Sign-in method.';
    } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
      errorMessage = 'Invalid email or password.';
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = 'Invalid email address.';
    }
    return { user: null, error: errorMessage };
  }
};

export const logout = async () => {
  if (!auth) {
    return { error: 'Firebase Auth is not initialized. Please check your .env file.' };
  }
  try {
    await signOut(auth);
    return { error: null };
  } catch (error) {
    return { error: error.message };
  }
};

export const getCurrentUser = () => {
  return auth ? auth.currentUser : null;
};

export const onAuthChange = (callback) => {
  if (!auth) {
    console.warn('Firebase Auth is not initialized. Auth state changes will not work.');
    // Return a function that does nothing (unsubscribe)
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
};

