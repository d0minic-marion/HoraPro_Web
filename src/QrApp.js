import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import QrDisplayPage from './pages/QrDisplayPage';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';

/**
 * QrApp Component
 * 
 * Standalone app for QR Display mode (npm run start:qr).
 * Requires admin authentication to prevent unauthorized access.
 * Only authenticated admins can display the QR code.
 */
const QrApp = () => (
  <div className="qr-app">
    <BrowserRouter>
      <Routes>
        {/* Public route: Login */}
        <Route path="/login" element={<LoginPage />} />
        
        {/* Protected route: QR Display */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <QrDisplayPage />
            </ProtectedRoute>
          }
        />
        
        {/* Redirect all other routes to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </div>
);

export default QrApp;
