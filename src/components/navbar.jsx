import { Link, useLocation} from "react-router-dom";
import HoraProLogo from "./logo/HoraProLogo.png"

function Navigation() {
  const location = useLocation();



  return (
    <nav className="navbar navbar-expand-lg bg-body-tertiary">
      <div className="container-fluid">
        <div className="navbar-brand">
          <img src={HoraProLogo} alt="horaprologo" width={175} height={150} />
        </div>

          <button 
            className="navbar-toggler" 
            type="button" 
            data-bs-toggle="collapse" 
            data-bs-target="#navbarScroll" 
            aria-controls="navbarScroll" 
            aria-expanded="false" 
            aria-label="Toggle navigation">

            <span className="navbar-toggler-icon"></span>
          </button>       

          <div className="collapse navbar-collapse" id="navbarScroll" >
            <ul className="navbar-nav me-auto my-2 my-lg-0 narbar-nav-scroll">
              
              <li className="nav-item"> 
                <Link to="/" className={`nav-link ${location.pathname === '/' ? 'nav-link-active' : ''}`}>
                  Create User
                </Link>
              </li>

              <li className="nav-item">
                <Link to="/schedulizer" className={`nav-link ${location.pathname === '/schedulizer' ? 'nav-link-active' : ''}`}>
                  Scheduler
                </Link>
              </li>

              <li className="nav-item">
                <Link to="/userschedule" className={`nav-link ${location.pathname === '/userschedule' ? 'nav-link-active' : ''}`}>
                  User Schedule
                </Link>
              </li>

            </ul>            
        </div>
      </div>
    </nav>
  );
}

export default Navigation