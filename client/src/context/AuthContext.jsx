import React, { createContext, useState, useEffect, useContext } from 'react';
import { onAuthChange, getCurrentUser } from '../services/authService';
import { toast } from 'react-toastify';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthChange((firebaseUser) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName || firebaseUser.email
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    // If unsubscribe is a function, return it for cleanup
    if (typeof unsubscribe === 'function') {
      return () => unsubscribe();
    }
    // If auth is not initialized, just set loading to false
    setLoading(false);
  }, []);

  const value = {
    user,
    loading
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

