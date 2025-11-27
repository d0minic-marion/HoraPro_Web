import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { authFirebase } from '../connections/ConnFirebaseServices';
import './LoginPage.css';

/**
 * LoginPage Component
 * 
 * Provides authentication interface for admin users.
 * Validates credentials and checks for 'admin' role in custom claims.
 * Redirects to home page on successful login.
 */
function LoginPage() {
  const navigate = useNavigate();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Authenticate with Firebase
      const userCredential = await signInWithEmailAndPassword(
        authFirebase,
        email,
        password
      );

      // Get ID token with custom claims
      const idTokenResult = await userCredential.user.getIdTokenResult();
      const role = idTokenResult.claims.role;

      // Verify admin role
      if (role !== 'admin') {
        // Sign out non-admin users
        await authFirebase.signOut();
        setError('Access denied. Admin privileges required.');
        setLoading(false);
        return;
      }

      // Success - navigate to home
      console.log('Admin login successful:', userCredential.user.email);
      navigate('/home');

    } catch (err) {
      console.error('Login error:', err);
      
      // User-friendly error messages
      if (err.code === 'auth/invalid-credential') {
        setError('Invalid email or password');
      } else if (err.code === 'auth/user-not-found') {
        setError('No account found with this email');
      } else if (err.code === 'auth/wrong-password') {
        setError('Incorrect password');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please try again later.');
      } else if (err.code === 'auth/user-disabled') {
        setError('This account has been disabled');
      } else {
        setError('Login failed. Please try again.');
      }
      
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>HoraPro</h1>
          <p>Administrator Login</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
              disabled={loading}
              minLength={6}
            />
          </div>

          {error && (
            <div className="error-message">
              <span className="error-icon">⚠</span>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="login-footer">
          <p className="info-text">
            Only authorized administrators can access this system
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
