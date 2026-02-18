import React from 'react';
import { Link } from 'react-router-dom';
import { FaPills, FaFlask, FaSearch, FaShieldAlt, FaUserMd } from 'react-icons/fa';
import './Home.css';

const Home = () => {
  return (
    <div className="home">
      <div className="hero">
        <h1 className="hero-title">
          <FaPills /> Meds Buddy Check
        </h1>
        <p className="hero-subtitle">
          Your trusted companion for medication management and adherence tracking
        </p>
        <p style={{ marginTop: '10px', fontSize: '0.9rem', color: '#666' }}>
          Access both Patient and Caretaker views from the same account
        </p>
        <div className="hero-buttons">
          <Link to="/patient-dashboard" className="btn btn-primary btn-large">
            Patient Dashboard
          </Link>
          <Link to="/caretaker-dashboard" className="btn btn-secondary btn-large">
            Caretaker Dashboard
          </Link>
        </div>
      </div>

      <div className="features">
        <div className="card feature-card">
          <FaFlask className="feature-icon" />
          <h3>Drug Interaction Checker</h3>
          <p>Check for potential interactions between multiple medications to ensure your safety.</p>
        </div>
        <div className="card feature-card">
          <FaSearch className="feature-icon" />
          <h3>Medication Search</h3>
          <p>Search our comprehensive database of medications with detailed information.</p>
        </div>
        <div className="card feature-card">
          <FaShieldAlt className="feature-icon" />
          <h3>Food Interaction Checker</h3>
          <p>Discover potential interactions between medications and food items.</p>
        </div>
        <div className="card feature-card">
          <FaUserMd className="feature-icon" />
          <h3>Dual View Dashboard</h3>
          <p>Switch between Patient and Caretaker views from the same account. Track medications, set reminders, and manage adherence.</p>
        </div>
      </div>

      <div className="info-section">
        <div className="card">
          <h2>Why Use Meds Buddy Check?</h2>
          <ul className="info-list">
            <li>✓ Comprehensive medication database</li>
            <li>✓ Real-time interaction checking</li>
            <li>✓ Food-drug interaction warnings</li>
            <li>✓ Secure and private health tracking</li>
            <li>✓ Easy-to-use interface</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Home;

