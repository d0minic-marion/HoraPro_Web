
import './App.css';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import CreateUser from './components/CreateUser';
import AddSchedule from './components/AddSchdule'
import UserSchedule from './components/UserSchedule';
import { BrowserRouter, Route, Routes, Link, useLocation } from 'react-router-dom';

// Navigation component
function Navigation() {
  const location = useLocation();
  
  return (
    <nav className="nav-container">
      <div className="nav-content">
        <Link to="/" className="nav-brand">
          📅 Schedule Manager
        </Link>
        <div className="nav-links">
          <Link 
            to="/" 
            className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
          >
            👥 Create User
          </Link>
          <Link 
            to="/schedulizer" 
            className={`nav-link ${location.pathname === '/schedulizer' ? 'active' : ''}`}
          >
            📋 Manage Schedules
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
        <div className="container">
          <Routes>
            <Route path="/" element={<CreateUser />} />
            <Route path='/schedulizer' element={<AddSchedule />} />
            <Route path='/userschedule' element={<UserSchedule />} />
          </Routes>
        </div>
        <ToastContainer 
          position="top-right"
          autoClose={3000}
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
