import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { authFirebase } from '../connections/ConnFirebaseServices';

/**
 * ProtectedRoute Component
 * 
 * Wraps admin routes to ensure only authenticated admin users can access.
 * Checks for valid authentication and 'admin' role in custom claims.
 * 
 * Usage:
 * <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
 */
function ProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Subscribe to auth state changes
    const unsubscribe = onAuthStateChanged(authFirebase, async (user) => {
      if (user) {
        try {
          // Get ID token with custom claims
          const idTokenResult = await user.getIdTokenResult();
          const role = idTokenResult.claims.role;
          
          // Check if user has admin role
          if (role === 'admin') {
            setIsAdmin(true);
          } else {
            console.warn('User authenticated but not admin:', user.email);
            setIsAdmin(false);
            // Sign out non-admin users
            await authFirebase.signOut();
          }
        } catch (error) {
          console.error('Error checking admin role:', error);
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }
      
      setLoading(false);
    });

    // Cleanup subscription
    return () => unsubscribe();
  }, []);

  // Show loading state
  if (loading) {
    return (
      <div style={loadingStyles.container}>
        <div style={loadingStyles.spinner}></div>
        <p style={loadingStyles.text}>Loading...</p>
      </div>
    );
  }

  // Redirect to login if not admin
  if (!isAdmin) {
    return <Navigate to="/login" replace />;
  }

  // Render protected content
  return children;
}

// Inline styles for loading state
const loadingStyles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#f5f5f5'
  },
  spinner: {
    width: '50px',
    height: '50px',
    border: '5px solid #e0e0e0',
    borderTop: '5px solid #667eea',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  text: {
    marginTop: '16px',
    color: '#666',
    fontSize: '16px'
  }
};

// Add spinner animation to document
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

export default ProtectedRoute;
