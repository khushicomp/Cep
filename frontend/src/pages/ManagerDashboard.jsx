import { useEffect, useState } from "react";
import axios from "axios";
import CountUp from "react-countup";
import "./ManagerDashboard.css";
import DynamicEntryTable from "../components/DynamicEntryTable";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
} from "chart.js";

import { Bar, Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend
);

function ManagerDashboard() {
  const [employees, setEmployees] = useState([]);
  const [taskName, setTaskName] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [report, setReport] = useState(null);
  const [weeklyData, setWeeklyData] = useState([]);
  const [recentTasks, setRecentTasks] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [activeTab, setActiveTab] = useState("daily_entry");

  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newEmployeeEmail, setNewEmployeeEmail] = useState("");

  const token = localStorage.getItem("token");

  useEffect(() => {
    fetchEmployees();
    fetchBranchReport();
    fetchWeeklyTrend();
    fetchRecentTasks(1);
  }, []);

  useEffect(() => {
    if (currentPage > 0) {
      fetchRecentTasks(currentPage);
    }
  }, [currentPage]);

  const fetchEmployees = async () => {
    try {
      const res = await axios.get(
        "http://localhost:5000/api/reports/branch-employees",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setEmployees(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchBranchReport = async () => {
    try {
      const res = await axios.get(
        "http://localhost:5000/api/reports/branch",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setReport(res.data);
    } catch (err) {
      console.error(err);
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
      console.error(err);
    }
  };

  const fetchRecentTasks = async (page = 1) => {
    try {
      const res = await axios.get(
        `http://localhost:5000/api/tasks/recent?page=${page}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      
      // Handle both response formats
      if (res.data.tasks) {
        // Paginated response
        setRecentTasks(res.data.tasks || []);
        setCurrentPage(res.data.currentPage || 1);
        setTotalPages(res.data.totalPages || 1);
      } else if (Array.isArray(res.data)) {
        // Simple array response
        setRecentTasks(res.data);
        setCurrentPage(1);
        setTotalPages(1);
      } else {
        setRecentTasks([]);
        setCurrentPage(1);
        setTotalPages(1);
      }
    } catch (err) {
      console.error("Error fetching recent tasks:", err);
      setRecentTasks([]);
      setCurrentPage(1);
      setTotalPages(1);
    }
  };

  const handleAssign = async (e) => {
    e.preventDefault();

    if (!taskName || !selectedEmployee) {
      alert("Please fill all fields");
      return;
    }

    try {
      await axios.post(
        "http://localhost:5000/api/tasks/assign",
        {
          task_name: taskName,
          assigned_to: selectedEmployee,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      alert("Task assigned successfully!");
      setTaskName("");
      setSelectedEmployee("");

      fetchBranchReport();
      fetchWeeklyTrend();
      fetchRecentTasks(currentPage);
    } catch (err) {
      alert("Error assigning task");
      console.error(err);
    }
  };

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (!newEmployeeName || !newEmployeeEmail) {
      alert("Please fill all fields");
      return;
    }
    
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const branch_id = payload.branch_id;

      const res = await axios.post(
        "http://localhost:5000/api/users/create",
        {
          name: newEmployeeName,
          email: newEmployeeEmail,
          role: "EMPLOYEE",
          branch_id
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      alert(`Employee created successfully!\nDefault password: ${res.data.user.defaultPassword}`);
      setNewEmployeeName("");
      setNewEmployeeEmail("");
      fetchEmployees(); // Refresh employee list
    } catch (err) {
      alert(err.response?.data?.message || "Error creating employee");
    }
  };

  const barData = report
    ? {
        labels: ["Total Tasks", "Completed", "Pending"],
        datasets: [
          {
            label: "Branch Stats",
            data: [
              report.total_tasks,
              report.completed_tasks,
              report.total_tasks - report.completed_tasks,
            ],
            backgroundColor: ["#7c3aed", "#10b981", "#ff7733"],
            borderRadius: 8,
            hoverBackgroundColor: ["#6d28d9", "#059669", "#ff5511"],
          },
        ],
      }
    : null;

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
        borderColor: "#7c3aed",
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

  const lineData = {
    labels: weeklyData.map((d) => d.day),
    datasets: [
      {
        label: "Completed Tasks",
        data: weeklyData.map((d) => d.completed_tasks),
        borderColor: "#ff7733",
        backgroundColor: "rgba(255, 119, 51, 0.1)",
        tension: 0.4,
        fill: true,
        pointBackgroundColor: "#ff7733",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      },
    ],
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 1500, easing: "easeInOutQuart" },
    plugins: {
      legend: {
        display: true,
        position: "top",
        labels: {
          font: { size: 13, weight: "500" },
          color: "#475569",
          usePointStyle: true,
        },
      },
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

  const getStatusColor = (status) => {
    if (!status) return "status-pending-mgr";
    
    switch (status.toLowerCase().replace('_', ' ')) {
      case "completed":
        return "status-completed-mgr";
      case "in progress":
      case "in_progress":
        return "status-progress-mgr";
      case "pending":
        return "status-pending-mgr";
      default:
        return "status-pending-mgr";
    }
  };

  const formatStatus = (status) => {
    if (!status) return "Pending";
    return status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
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
            <div style={{fontSize: '0.85rem', opacity: 0.9, marginTop: '2px'}}>Pune Branch</div>
        </div>

        <nav className="sidebar-nav-manager">
          <a href="#dashboard" className="nav-item-manager active">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
            </svg>
            Dashboard
          </a>
          <a href="#assign" className="nav-item-manager">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
            Assign Task
          </a>
        </nav>

        <div className="sidebar-footer-akola">
            <button className="logout-btn-akola">
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
            <p>Branch Performance Overview - Pune Branch</p>
          </div>
          <div className="header-actions-manager">
            <button className="icon-button-manager">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" />
              </svg>
            </button>
          </div>
        </header>

        {/* Custom Tabs */}
        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', borderBottom: '2px solid var(--bank-tan)', paddingBottom: '10px' }}>
          <button 
            style={{ background: 'transparent', border: 'none', borderBottom: activeTab === 'daily_entry' ? '3px solid var(--bank-orange-primary)' : 'none', color: activeTab === 'daily_entry' ? 'var(--bank-orange-primary)' : 'var(--text-gray)', fontSize: '1.1rem', fontWeight: 'bold', padding: '10px 15px', cursor: 'pointer', outline: 'none' }}
            onClick={() => setActiveTab('daily_entry')}
          >
            Daily Business Entry
          </button>
          <button 
            style={{ background: 'transparent', border: 'none', borderBottom: activeTab === 'employee_tasks' ? '3px solid var(--bank-orange-primary)' : 'none', color: activeTab === 'employee_tasks' ? 'var(--bank-orange-primary)' : 'var(--text-gray)', fontSize: '1.1rem', fontWeight: 'bold', padding: '10px 15px', cursor: 'pointer', outline: 'none' }}
            onClick={() => setActiveTab('employee_tasks')}
          >
            Employee Tasks
          </button>
        </div>

        {activeTab === 'daily_entry' ? (
          <DynamicEntryTable token={token} />
        ) : (
          <>
        {/* Assign Task Section */}
        <div className="assign-task-section">
          <div className="assign-card">
            <div className="assign-card-header">
              <h2 className="assign-title">Assign New Task</h2>
              <div className="assign-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
              </div>
            </div>

            <form onSubmit={handleAssign} className="assign-form">
              <div className="form-group">
                <label className="form-label">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="label-icon">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                  Select Employee
                </label>
                <select
                  className="form-select"
                  value={selectedEmployee}
                  onChange={(e) => setSelectedEmployee(e.target.value)}
                  required
                >
                  <option value="">Choose an employee...</option>
                  {employees.map((emp) => (
                    <option key={emp.user_id} value={emp.user_id}>
                      {emp.name} ({emp.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="label-icon">
                    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
                  </svg>
                  Enter Task Name
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g., KYC Forms Verification"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="assign-submit-btn">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
                Assign Task
              </button>
            </form>
          </div>

          <div className="assign-card" style={{ marginTop: "20px" }}>
            <div className="assign-card-header">
              <h2 className="assign-title">Add New Employee</h2>
              <div className="assign-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c-0-2.66-5.33-4-8-4z" />
                </svg>
              </div>
            </div>

            <form onSubmit={handleAddEmployee} className="assign-form">
              <div className="form-group">
                <label className="form-label">Employee Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g., John Doe"
                  value={newEmployeeName}
                  onChange={(e) => setNewEmployeeName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Employee Email</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="john.doe@bank.com"
                  value={newEmployeeEmail}
                  onChange={(e) => setNewEmployeeEmail(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="assign-submit-btn" style={{ backgroundColor: "#10b981" }}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c-0-2.66-5.33-4-8-4z" />
                </svg>
                Create Employee
              </button>
            </form>
          </div>

          {/* Performance Stats */}
          {report && (
            <div className="stats-grid">
              <div className="stat-card stat-purple">
                <div className="stat-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                  </svg>
                </div>
                <div className="stat-content">
                  <p className="stat-label">Total Employees</p>
                  <h3 className="stat-value">
                    <CountUp end={Number(report.total_employees) || 0} duration={1.2} />
                  </h3>
                </div>
              </div>

              <div className="stat-card stat-orange">
                <div className="stat-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
                  </svg>
                </div>
                <div className="stat-content">
                  <p className="stat-label">Total Tasks</p>
                  <h3 className="stat-value">
                    <CountUp end={Number(report.total_tasks) || 0} duration={1.2} />
                  </h3>
                </div>
              </div>

              <div className="stat-card stat-green">
                <div className="stat-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                </div>
                <div className="stat-content">
                  <p className="stat-label">Completed</p>
                  <h3 className="stat-value">
                    <CountUp end={Number(report.completed_tasks) || 0} duration={1.2} />
                  </h3>
                </div>
              </div>

              <div className="stat-card stat-blue">
                <div className="stat-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" />
                  </svg>
                </div>
                <div className="stat-content">
                  <p className="stat-label">Completion Rate</p>
                  <h3 className="stat-value">
                    <CountUp end={Number(report.completion_percentage) || 0} duration={1.2} />%
                  </h3>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Charts Section */}
        <div className="charts-section-manager">
          <div className="chart-card-manager">
            <div className="chart-header-manager">
              <h3 className="chart-title-manager">Branch Performance</h3>
            </div>
            <div className="chart-container-manager">
              {barData && <Bar data={barData} options={barOptions} />}
            </div>
          </div>

          <div className="chart-card-manager">
            <div className="chart-header-manager">
              <h3 className="chart-title-manager">Weekly Trend</h3>
            </div>
            <div className="chart-container-manager">
              <Line data={lineData} options={lineOptions} />
            </div>
          </div>
        </div>

        {/* Recent Tasks Table */}
        <div className="recent-tasks-section">
          <div className="recent-header">
            <h2 className="recent-title">Recent Tasks</h2>
          </div>

          <div className="table-container-manager">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Employee Name</th>
                  <th>Task Name</th>
                  <th>Status</th>
                  <th>Time Taken</th>
                </tr>
              </thead>
              <tbody>
                {recentTasks.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: "center", padding: "30px" }}>
                      No recent task updates
                    </td>
                  </tr>
                ) : (
                  recentTasks.map((task, index) => (
                    <tr key={task.task_id || index}>
                      <td className="employee-cell">
                        <div className="employee-avatar-small">
                          {task.employee_name ? task.employee_name.charAt(0).toUpperCase() : 'E'}
                        </div>
                        {task.employee_name || 'Unknown'}
                      </td>

                      <td>{task.task_name || 'N/A'}</td>

                      <td>
                        <span className={getStatusColor(task.current_status)}>
                          {formatStatus(task.current_status)}
                        </span>
                      </td>

                      <td>{task.total_time > 0 ? `${task.total_time} min` : '-- min'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="table-footer-manager">
            <button 
              className="pagination-btn-manager"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              style={{ opacity: currentPage === 1 ? 0.5 : 1, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
              </svg>
            </button>

            <span className="pagination-text-manager">
              Page {currentPage} of {totalPages}
            </span>

            <button 
              className="pagination-btn-manager"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              style={{ opacity: currentPage === totalPages ? 0.5 : 1, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
              </svg>
            </button>
          </div>
        </div>
          </>
        )}

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
