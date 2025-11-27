import { Link, useLocation, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { authFirebase } from "../connections/ConnFirebaseServices";
import HoraProLogo from "./logo/HoraProLogo.png"

function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut(authFirebase);
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <nav className={`navbar navbar-expand-lg bg-body-tertiar`}>
      <div className="container-fluid" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="navbar-brand">
          <img src={HoraProLogo} alt="horaprologo" width={175} height={75} />
        </div>

        <div
          className="navbar-links"
          style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}
        >
          <Link
            to="/home"
            className={`nav-link ${location.pathname === '/home' ? 'nav-link-active' : ''}`}
          >
            Create User
          </Link>

          <Link
            to="/schedulizer"
            className={`nav-link ${location.pathname === '/schedulizer' ? 'nav-link-active' : ''}`}
          >
            Scheduler
          </Link>
        </div>

        <button
          onClick={handleLogout}
          style={{
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.5rem 1.5rem',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.2s ease-in-out',
            boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
            marginRight: '1.5rem'
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#dc2626';
            e.target.style.boxShadow = '0 4px 6px -1px rgb(0 0 0 / 0.1)';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = '#ef4444';
            e.target.style.boxShadow = '0 1px 2px 0 rgb(0 0 0 / 0.05)';
          }}
        >
          Logout
        </button>
      </div>
    </nav>
  );
}

export default Navigation
