import { useEffect, useState } from "react";
import axios from "axios";
import CountUp from "react-countup";
import { useNavigate } from "react-router-dom";
import "./AdminDashboard.css";
import AdminBusinessReports from "../components/AdminBusinessReports";
import AdminBusinessAnalytics from "../components/AdminBusinessAnalytics";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";

import { Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
);

function AdminDashboard() {
  const [branches, setBranches] = useState([]);
  const [weeklyData, setWeeklyData] = useState([]);
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "MANAGER", branch_id: "" });
  const [activeTab, setActiveTab] = useState("daily_reports");

  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const handleLogout = () => {
    if (!window.confirm("Are you sure you want to logout?")) return;
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/");
  };

  useEffect(() => {
    fetchBranches();
    fetchWeeklyTrend();
    fetchMonthlyData();
  }, []);

  const fetchBranches = async () => {
    try {
      const res = await axios.get(
        "http://localhost:5000/api/reports/all-branches",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setBranches(res.data);
    } catch (err) {
      console.error("Error fetching branches:", err);
    }
  };

  const fetchWeeklyTrend = async () => {
    try {
      const res = await axios.get(
        "http://localhost:5000/api/reports/weekly-trend",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setWeeklyData(res.data);
    } catch (err) {
      console.error("Error fetching weekly trend:", err);
    }
  };

  const [monthlyData, setMonthlyData] = useState([]);

const fetchMonthlyData = async () => {
  try {
    const res = await axios.get(
      "http://localhost:5000/api/reports/admin/monthly",
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    setMonthlyData(res.data);
  } catch (err) {
    console.error(err);
  }
};

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(
        "http://localhost:5000/api/users/create",
        newUser,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      alert(`User created successfully!\nDefault password: ${res.data.user.defaultPassword}`);
      setNewUser({ name: "", email: "", role: "MANAGER", branch_id: "" });
    } catch (err) {
      alert(err.response?.data?.message || "Error creating user");
    }
  };


  // Calculate totals
  const totalTasks = branches.reduce(
    (sum, b) => sum + (b.total_tasks || 0),
    0
  );

  const completedTasks = branches.reduce(
    (sum, b) => sum + (b.completed_tasks || 0),
    0
  );

  const avgCompletion =
    totalTasks === 0
      ? 0
      : Number(((completedTasks / totalTasks) * 100).toFixed(2));

  // Bar Chart Data
  const barData = {
    labels: weeklyData.map((item) => item.day),
    datasets: [
      {
        label: "Completed Tasks",
        data: weeklyData.map((item) => item.completed_tasks),
        backgroundColor: "#ff7733",
        borderRadius: 8,
        hoverBackgroundColor: "#ff5511",
      },
    ],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 1500, easing: "easeInOutQuart" },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        padding: 12,
        titleFont: { size: 14, weight: "600" },
        bodyFont: { size: 13 },
        borderColor: "#ff7733",
        borderWidth: 1,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: "rgba(0, 0, 0, 0.05)",
          drawBorder: false,
        },
        ticks: {
          font: { size: 12 },
          color: "#64748b",
        },
      },
      x: {
        grid: {
          display: false,
        },
        ticks: {
          font: { size: 12 },
          color: "#64748b",
        },
      },
    },
  };

  // Doughnut Chart Data
  const doughnutData = {
    labels: branches.map((b) => b.branch_name),
    datasets: [
      {
        data: branches.map((b) => b.total_tasks),
        backgroundColor: [
          "#7c3aed",
          "#ff7733",
          "#f59e0b",
          "#10b981",
          "#3b82f6",
        ],
        borderWidth: 0,
        hoverOffset: 10,
      },
    ],
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 1500, easing: "easeInOutQuart" },
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          padding: 15,
          font: { size: 13, weight: "500" },
          color: "#475569",
          usePointStyle: true,
          pointStyle: "circle",
        },
      },
      tooltip: {
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        padding: 12,
        titleFont: { size: 14, weight: "600" },
        bodyFont: { size: 13 },
        borderColor: "#7c3aed",
        borderWidth: 1,
      },
    },
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
            <strong>Welcome, Admin</strong>
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
            <h1>Welcome Head Office</h1>
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
          <button 
            className={`tab ${activeTab === 'employee_tasks' ? 'active' : ''}`}
            onClick={() => setActiveTab('employee_tasks')}
          >
            Employee Tasks
          </button>
        </div>

        {activeTab === 'daily_reports' && <AdminBusinessReports token={token} />}
        {activeTab === 'analytics' && <AdminBusinessAnalytics token={token} />}
        {activeTab === 'employee_tasks' && (
          <>
        {/* Add User Section */}
        <div className="section-card" style={{ backgroundColor: "#fff", padding: "20px", borderRadius: "12px", marginBottom: "20px", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "15px", color: "#1e293b" }}>Create New User</h2>
          <form onSubmit={handleAddUser} style={{ display: "flex", gap: "15px", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1", minWidth: "150px" }}>
              <label style={{ display: "block", marginBottom: "5px", fontSize: "0.9rem", color: "#64748b" }}>Name</label>
              <input type="text" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} required style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #e2e8f0" }} />
            </div>
            <div style={{ flex: "1", minWidth: "150px" }}>
              <label style={{ display: "block", marginBottom: "5px", fontSize: "0.9rem", color: "#64748b" }}>Email</label>
              <input type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} required style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #e2e8f0" }} />
            </div>
            <div style={{ flex: "1", minWidth: "150px" }}>
              <label style={{ display: "block", marginBottom: "5px", fontSize: "0.9rem", color: "#64748b" }}>Role</label>
              <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})} required style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <option value="MANAGER">Manager</option>
                <option value="EMPLOYEE">Employee</option>
              </select>
            </div>
            <div style={{ flex: "1", minWidth: "150px" }}>
              <label style={{ display: "block", marginBottom: "5px", fontSize: "0.9rem", color: "#64748b" }}>Branch</label>
              <select value={newUser.branch_id} onChange={e => setNewUser({...newUser, branch_id: e.target.value})} required style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <option value="">Select Branch...</option>
                {branches.map(b => (
                  <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
                ))}
              </select>
            </div>
            <button type="submit" style={{ padding: "10px 20px", backgroundColor: "#7c3aed", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600", height: "42px" }}>
              Create User
            </button>
          </form>
        </div>

        {/* KPI Cards */}
        <div className="kpi-grid">
          <div className="kpi-card card-purple">
            <div className="kpi-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            </div>
            <div className="kpi-content">
              <h3 className="kpi-label">Total Tasks Completed</h3>
              <p className="kpi-value">
                <CountUp end={completedTasks} duration={1.5} />
              </p>
              <p className="kpi-branch">Pune Branch</p>
            </div>
          </div>

          <div className="kpi-card card-orange">
            <div className="kpi-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
              </svg>
            </div>
            <div className="kpi-content">
              <h3 className="kpi-label">Avg Completion Time</h3>
              <p className="kpi-value">37 mins</p>
              <p className="kpi-branch">Pune Branch</p>
            </div>
          </div>

          <div className="kpi-card card-yellow">
            <div className="kpi-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" />
              </svg>
            </div>
            <div className="kpi-content">
              <h3 className="kpi-label">Productivity Score</h3>
              <p className="kpi-value">
                <CountUp end={avgCompletion} duration={1.5} />%
              </p>
              <p className="kpi-branch">Pune Branch</p>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="charts-grid">
          <div className="chart-card">
            <div className="chart-header">
              <h3 className="chart-title">Weekly Task Completion</h3>
              <button className="chart-action">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                </svg>
              </button>
            </div>
            <div className="chart-container">
              <Bar data={barData} options={barOptions} />
            </div>
            <div className="chart-footer">
              <button className="chart-nav-btn">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                </svg>
              </button>
              <span className="chart-period">Weekly Completion</span>
              <button className="chart-nav-btn">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                </svg>
              </button>
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-header">
              <h3 className="chart-title">Branch Task Distribution</h3>
              <button className="chart-action">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                </svg>
              </button>
            </div>
            <div className="chart-container doughnut-container">
              <Doughnut data={doughnutData} options={doughnutOptions} />
            </div>
          </div>
        </div>

        {/* Monthly Reports Table */}
        <div className="table-card">
          <div className="table-header">
            <h3 className="table-title">Monthly Consolidated Reports</h3>
            <button className="download-btn">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
              </svg>
              Download Report
            </button>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Tasks Completed</th>
                  <th>Avg Time Taken</th>
                  <th>Productivity Score</th>
                </tr>
              </thead>
              <tbody>
  {monthlyData.length === 0 ? (
    <tr>
      <td colSpan="4" style={{ textAlign: "center" }}>
        No data available
      </td>
    </tr>
  ) : (
    monthlyData.map((item, index) => (
      <tr key={index}>
        <td>{item.month}</td>

        <td className="highlight">
          {item.completed_tasks}
        </td>

        <td>
          {item.avg_time ? `${item.avg_time} mins` : "--"}
        </td>

        <td>
          <span className="badge badge-success">
            {item.productivity_score || "--"}%
          </span>
        </td>
      </tr>
    ))
  )}
</tbody>
            </table>
          </div>
          <div className="table-footer">
            <button className="pagination-btn">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
              </svg>
            </button>
            <span className="pagination-text">Page 1 of 1</span>
            <button className="pagination-btn">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
              </svg>
            </button>
          </div>
        </div>
          </>
        )}

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
