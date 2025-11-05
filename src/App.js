import './App.css';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import 'react-big-calendar/lib/css/react-big-calendar.css';

import { BrowserRouter, Route, Routes, Link, useLocation } from 'react-router-dom';

import CreateUserPage from './pages/CreateUserPage';
import AddSchedule from './components/AddSchdule';
import UserSchedule from './components/UserSchedule';

// Navigation bar (kept same visual style)
function Navigation() {
  const location = useLocation();

  return (
    <nav className="nav-container">
      <div className="nav-inner">
        <div className="nav-left">
          <span className="app-title">Shift / Schedule Admin</span>
        </div>

        <div className="nav-links">
          <Link
            to="/"
            className={`nav-link ${location.pathname === '/' ? 'nav-link-active' : ''}`}
          >
            Create User
          </Link>

          <Link
            to="/schedulizer"
            className={`nav-link ${location.pathname === '/schedulizer' ? 'nav-link-active' : ''}`}
          >
            Scheduler
          </Link>

          <Link
            to="/userschedule"
            className={`nav-link ${location.pathname === '/userschedule' ? 'nav-link-active' : ''}`}
          >
            User Schedule
          </Link>
        </div>
      </div>
    </nav>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Navigation />

        <div className="page-wrapper">
          <Routes>
            {/* Home → CreateUserPage (overtime settings + create employee) */}
            <Route path="/" element={<CreateUserPage />} />

            {/* Scheduler / global view */}
            <Route path="/schedulizer" element={<AddSchedule />} />

            {/* Individual user schedule page */}
            <Route path="/userschedule" element={<UserSchedule />} />
          </Routes>
        </div>

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
