import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminDashboard.css";
import AdminBusinessReports from "../components/AdminBusinessReports";
import AdminBusinessAnalytics from "../components/AdminBusinessAnalytics";
import { clearSession } from "../utils/auth";

function AdminDashboard() {
  const isHeadOffice = localStorage.getItem("role") === "HEAD_OFFICE";
  const [activeTab, setActiveTab] = useState("daily_reports");
  const navigate = useNavigate();
  const handleLogout = () => {
    if (!window.confirm("Are you sure you want to logout?")) return;
    clearSession();
    navigate("/");
  };

  return (
    <div className="admin-dashboard">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
            <img src="/images.png" alt="Akola Bank" className="sidebar-logo" />
            <div className="sidebar-bank-name">
                The Akola Urban<br />Co-operative Bank Ltd.
            </div>
            <div className="sidebar-tagline">
                Efficiency. Transparency. Accountability.
            </div>
        </div>
        
        <div className="sidebar-user-info">
            <strong>Welcome, {isHeadOffice ? "Head Office" : "Admin"}</strong>
            <div style={{fontSize: '0.85rem', opacity: 0.9, marginTop: '2px'}}>Head Office</div>
        </div>

        <nav className="sidebar-nav">
          <a href="#dashboard" className={`nav-item ${activeTab !== 'analytics' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('daily_reports'); }}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
            </svg>
            Dashboard
          </a>
          <a href="#reports" className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('analytics'); }}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
            </svg>
            Reports
          </a>
        </nav>

        <div className="sidebar-footer">
            <button className="sidebar-menu-item" onClick={handleLogout} style={{background: 'transparent', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', color: 'white'}}>
                🚪 Logout
            </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Header */}
        <header className="page-header">
          <div>
            <h1>Welcome {isHeadOffice ? "Head Office" : "Admin"}</h1>
            <p>Branch Performance Overview</p>
          </div>
          <div className="header-actions">
            <button className="icon-button">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" />
              </svg>
            </button>
          </div>
        </header>

        {/* Custom Tabs */}
        <div className="tab-navigation">
          <button 
            className={`tab ${activeTab === 'daily_reports' ? 'active' : ''}`}
            onClick={() => setActiveTab('daily_reports')}
          >
            Daily Business Reports
          </button>
          <button 
            className={`tab ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            Branch Analytics
          </button>
        </div>
        {activeTab === 'daily_reports' && <AdminBusinessReports />}
        {activeTab === 'analytics' && <AdminBusinessAnalytics />}

        {/* Footer */}
        <footer className="footer">
            <div className="footer-content">
                <div>
                    © 2026 The Akola Urban Co-operative Bank Ltd.
                </div>
            </div>
        </footer>
      </main>
    </div>
  );
}

export default AdminDashboard;
