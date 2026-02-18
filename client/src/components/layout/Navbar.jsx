import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { logout } from '../../services/authService';
import { toast } from 'react-toastify';
import { FaPills, FaUser, FaUserMd, FaSignOutAlt, FaHome } from 'react-icons/fa';
import './Navbar.css';

const Navbar = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    const { error } = await logout();
    if (error) {
      toast.error('Logout failed');
    } else {
      toast.success('Logged out successfully');
      navigate('/');
    }
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-brand">
          <FaPills className="brand-icon" />
          <span>MediCare Companion</span>
        </Link>
        
        <div className="navbar-menu">
          <Link to="/" className="navbar-link">
            <FaHome /> Home
          </Link>
          
          {user ? (
            <>
              <Link to="/patient-dashboard" className="navbar-link">
                <FaUser /> Patient
              </Link>
              <Link to="/caretaker-dashboard" className="navbar-link">
                <FaUserMd /> Caretaker
              </Link>
              <Link to="/medications" className="navbar-link">
                <FaPills /> Medications
              </Link>
              <button onClick={handleLogout} className="navbar-link btn-logout">
                <FaSignOutAlt /> Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="navbar-link">
                Login
              </Link>
              <Link to="/register" className="navbar-link btn-register">
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;

