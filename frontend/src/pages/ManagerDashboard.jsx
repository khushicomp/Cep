import { useNavigate } from "react-router-dom";
import "./ManagerDashboard.css";
import DynamicEntryTable from "../components/DynamicEntryTable";
import { clearSession } from "../utils/auth";

function ManagerDashboard() {
  const navigate = useNavigate();
  const userStr = localStorage.getItem("user");
  const user = userStr ? JSON.parse(userStr) : null;
  const branchName = user?.branch_name || "Unknown Branch";
  const handleLogout = () => {
    if (!window.confirm("Are you sure you want to logout?")) return;
    clearSession();
    navigate("/");
  };

  return (
    <div className="manager-dashboard">
      {/* Sidebar */}
      <aside className="sidebar-manager">
        <div className="sidebar-header-akola">
            <img src="/images.png" alt="Akola Bank" className="sidebar-logo-akola" />
            <div className="sidebar-bank-name-akola">
                The Akola Urban<br />Co-operative Bank Ltd.
            </div>
            <div className="sidebar-tagline-akola">
                Efficiency. Transparency. Accountability.
            </div>
        </div>
        
        <div className="sidebar-user-info-akola">
            <strong>Welcome, Manager</strong>
            <div style={{fontSize: '0.85rem', opacity: 0.9, marginTop: '2px'}}>{branchName}</div>
        </div>

        <nav className="sidebar-nav-manager">
          <a href="#dashboard" className="nav-item-manager active" onClick={e => e.preventDefault()}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
            </svg>
            Dashboard
          </a>
        </nav>

        <div className="sidebar-footer-akola">
            <button className="logout-btn-akola" onClick={handleLogout}>
                🚪 Logout
            </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content-manager">
        {/* Header */}
        <header className="page-header-akola">
          <div>
            <h1>Welcome Manager</h1>
            <p>Daily Branch Reporting - {branchName}</p>
          </div>
          <div className="header-actions-manager">
            <button className="icon-button-manager">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" />
              </svg>
            </button>
          </div>
        </header>

        <DynamicEntryTable />

        {/* Footer */}
        <footer className="footer-akola">
            <div className="footer-content-akola">
                <div>
                    © 2026 The Akola Urban Co-operative Bank Ltd.
                </div>
            </div>
        </footer>
      </main>
    </div>
  );
}

export default ManagerDashboard;
