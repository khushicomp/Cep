import { useEffect, useState } from "react";
import axios from "axios";
import CountUp from "react-countup";
import "./EmployeeDashboard.css";
import { useNavigate } from "react-router-dom";


function EmployeeDashboard() {
  const [filter, setFilter] = useState("ACTIVE");
  const [tasks, setTasks] = useState([]);
  const [report, setReport] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const token = localStorage.getItem("token");
  const totalHours = report
  ? (report.total_time / 60).toFixed(2)
  : 0;

  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/");
  };

  if (!token) {
    navigate("/");
  }

  useEffect(() => {
    fetchTasks();
    fetchReport();
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await axios.get(
        "http://localhost:5000/api/tasks/my-tasks",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setTasks(res.data);
    } catch (err) {
      console.error("Error fetching tasks:", err);
    }
  };

  const fetchReport = async () => {
    try {
      const res = await axios.get(
        "http://localhost:5000/api/reports/employee",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setReport(res.data);
    } catch (err) {
      console.error("Error fetching report:", err);
    }
  };

  // Tasks are read-only now, oral reporting to manager


  return (
    <div className="employee-dashboard">
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
            <strong>Welcome, Employee</strong>
            <div style={{fontSize: '0.85rem', opacity: 0.9, marginTop: '2px'}}>Pune Branch</div>
        </div>

        <nav className="sidebar-nav-employee">
          <a href="#dashboard" className="nav-item-employee active">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
            </svg>
            Dashboard
          </a>
          <a href="#profile" className="nav-item-employee">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
            Update Profile
          </a>
        </nav>

        <div className="sidebar-footer">
            <button className="sidebar-menu-item" onClick={handleLogout} style={{background: 'transparent', border: 'none', width: '100%', textAlign: 'left'}}>
                🚪 Logout
            </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content-employee">
        {/* Header */}
        <header className="page-header">
          <div>
            <h1>Welcome Employee</h1>
            <p>Your Assigned Tasks</p>
          </div>
          <div className="header-actions-employee">
            <button className="icon-button-employee">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" />
              </svg>
            </button>
          </div>
        </header>

        {/* Performance Cards */}
        {report && (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon chart">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
                </svg>
              </div>
              <div className="stat-content">
                <h3 className="stat-card-title">Total Tasks</h3>
                <p className="stat-card-value">
                  <CountUp end={Number(report.total_tasks)} duration={1.2} />
                </p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon check">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              </div>
              <div className="stat-content">
                <h3 className="stat-card-title">Completed</h3>
                <p className="stat-card-value">
                  <CountUp end={Number(report.completed_tasks)} duration={1.2} />
                </p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon trend">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" />
                </svg>
              </div>
              <div className="stat-content">
                <h3 className="stat-card-title">Completion Rate</h3>
                <p className="stat-card-value">
                  <CountUp end={Number(report.completion_percentage)} duration={1.2} />%
                </p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon clock">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
                </svg>
              </div>
              <div className="stat-content">
                <h3 className="stat-card-title">Total Hours</h3>
                <p className="stat-card-value">
                  <CountUp end={Number(totalHours)} duration={1.2} /> hrs
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tasks Table */}
        <div className="tasks-section">
          <div className="tasks-header">
            <h2 className="tasks-title">My Tasks</h2>
            <div className="filter-tabs">
              <button onClick={() => setFilter("ALL")} className={`filter-tab ${filter === 'ALL' ? 'active' : ''}`}>All</button>
              <button onClick={() => setFilter("PENDING")} className={`filter-tab ${filter === 'PENDING' ? 'active' : ''}`}>Pending</button>
              <button onClick={() => setFilter("IN_PROGRESS")} className={`filter-tab ${filter === 'IN_PROGRESS' ? 'active' : ''}`}>In Progress</button>
            </div>
          </div>

          <div className="task-list">
            {tasks.filter((task) => filter === "ALL" || task.current_status === filter).length === 0 ? (
              <div className="empty-state" style={{gridColumn: '1 / -1'}}>
                <div className="empty-state-icon">📋</div>
                <h3 className="empty-state-title">No tasks found</h3>
                <p className="empty-state-message">You have no tasks matching this filter.</p>
              </div>
            ) : (
                tasks
                  .filter((task) => filter === "ALL" || task.current_status === filter)
                  .map((task) => (
                  <TaskCard
                    key={task.task_id}
                    task={task}
                    isSelected={selectedTask === task.task_id}
                    onSelect={() => setSelectedTask(task.task_id)}
                  />
                ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/* Task Card Component (Read-Only) */
function TaskCard({ task, isSelected, onSelect }) {
  const status = task.current_status || "PENDING";

  const getStatusColor = (status) => {
    switch (status) {
      case "COMPLETED":
        return "completed";
      case "IN_PROGRESS":
        return "in-progress";
      case "PENDING":
        return "pending";
      default:
        return "pending";
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  };

  return (
    <div className={`task-card ${isSelected ? 'task-card-selected' : ''}`} onClick={onSelect}>
      <div className="task-card-header">
        <h3 className="task-name">{task.task_name}</h3>
        {task.current_status === "COMPLETED" ? (
          <div className="task-completed-icon" title="Completed">
            ✓
          </div>
        ) : (
          <span className={`task-status-badge ${getStatusColor(status)}`}>
            {status.replace('_', ' ')}
          </span>
        )}
      </div>

      <div className="task-card-body">
        <div className="task-date">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z" />
          </svg>
          <span className="task-date-label">Assigned:</span>
          <span className="task-date-value">{formatDate(task.assigned_date)}</span>
        </div>

        {task.time_taken > 0 && (
          <div className="task-date" style={{marginTop: '0.3rem'}}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
            </svg>
            <span className="task-date-label">Time Taken:</span>
            <span className="task-date-value">{task.time_taken} min</span>
          </div>
        )}
        
        <div className="task-instruction">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
          <span className="task-instruction-text">
            Report completion and time orally to Manager.
          </span>
        </div>
      </div>
    </div>
  );
}

export default EmployeeDashboard;