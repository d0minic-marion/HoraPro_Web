import { Link, useLocation} from "react-router-dom";
import HoraProLogo from "./logo/HoraProLogo.png"

function Navigation() {
  const location = useLocation();



  return (
    <nav className={`navbar navbar-expand-lg bg-body-tertiar`}>
      <div className="container-fluid">
        <div className="navbar-brand">
          <img src={HoraProLogo} alt="horaprologo" width={175} height={75} />
        </div>

          <div
            className="navbar-links"
            style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}
          >
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

          </div>
      </div>
    </nav>
  );
}

export default Navigation
