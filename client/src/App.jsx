import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Navbar from './components/layout/Navbar.jsx';
import Home from './components/pages/Home.jsx';
import Login from './components/auth/Login.jsx';
import Register from './components/auth/Register.jsx';

const PatientDashboard = lazy(() => import('./components/pages/PatientDashboard.jsx'));
const CaretakerDashboard = lazy(() => import('./components/pages/CaretakerDashboard.jsx'));
const MedicationList = lazy(() => import('./components/medications/MedicationList.jsx'));

import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import './App.css';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="loading">Loading...</div>;
  }
  
  return user ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <AuthProvider>
      <Router
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true
        }}
      >
        <div className="App">
          <Navbar />
          <div className="container">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route 
                path="/patient-dashboard" 
                element={
                  <PrivateRoute>
                    <Suspense fallback={<div className="loading">Loading dashboard...</div>}>
                      <PatientDashboard />
                    </Suspense>
                  </PrivateRoute>
                } 
              />
              <Route 
                path="/caretaker-dashboard" 
                element={
                  <PrivateRoute>
                    <Suspense fallback={<div className="loading">Loading dashboard...</div>}>
                      <CaretakerDashboard />
                    </Suspense>
                  </PrivateRoute>
                } 
              />
              <Route 
                path="/medications" 
                element={
                  <PrivateRoute>
                    <Suspense fallback={<div className="loading">Loading medications...</div>}>
                      <MedicationList />
                    </Suspense>
                  </PrivateRoute>
                } 
              />
            </Routes>
          </div>
          <ToastContainer 
            position="top-right" 
            autoClose={3000}
            limit={3}
            newestOnTop={true}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
          />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
