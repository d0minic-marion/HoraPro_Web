import './App.css';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import 'react-big-calendar/lib/css/react-big-calendar.css';

import { BrowserRouter, Route, Routes } from 'react-router-dom';

import CreateUserPage from './pages/CreateUserPage';
import AddSchedule from './components/AddSchdule';
import UserSchedule from './components/UserSchedule';

//importation de bootstrap
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";

import Navigation from './components/navbar';

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
