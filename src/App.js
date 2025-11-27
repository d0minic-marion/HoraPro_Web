import './App.css';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import 'react-big-calendar/lib/css/react-big-calendar.css';

import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';

import CreateUserPage from './pages/CreateUserPage';
import AddSchedule from './components/AddSchdule';
import UserSchedule from './components/UserSchedule';
import EditProfilePage from './pages/EditProfilePage';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';

import Navigation from './components/navbar';

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          {/* Redirect root to login */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          
          {/* Public route: Login */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected admin routes */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Navigation />
                <div className="page-wrapper">
                  <Routes>
                    {/* Home -> CreateUserPage (overtime settings + create employee) */}
                    <Route path="/home" element={<CreateUserPage />} />

                    {/* Scheduler / global view */}
                    <Route path="/schedulizer" element={<AddSchedule />} />

                    {/* Individual user schedule page */}
                    <Route path="/userschedule" element={<UserSchedule />} />
                    
                    {/* Edit profile page (no nav link; direct route only) */}
                    <Route path="/editprofile/:userId" element={<EditProfilePage />} />
                  </Routes>
                </div>
              </ProtectedRoute>
            }
          />
        </Routes>

        <ToastContainer
          position="top-right"
          autoClose={4000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
        />
      </BrowserRouter>
    </div>
  );
}

export default App;
