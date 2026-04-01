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
      <aside className="sidebar-employee">
        <div className="sidebar-header-employee">
          <div className="bank-icon-employee">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3L1 9l11 6 9-4.91V17h2V9M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z" />
            </svg>
          </div>
          <div className="sidebar-title-employee">
            <h2>Task Monitoring</h2>
            <p>System</p>
          </div>
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

        <div className="sidebar-footer-employee">
          <div className="user-profile-employee">
            <div className="user-avatar-employee">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>
            <div className="user-info-employee">
              <span className="user-name-employee">Employee</span>
              <button onClick={handleLogout} className="logout-btn-employee">Logout</button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content-employee">
        {/* Header */}
        <header className="dashboard-header-employee">
          <div>
            <h1 className="page-title-employee">Welcome Employee</h1>
            <p className="page-subtitle-employee">Your Assigned Tasks</p>
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
          <div className="performance-grid">
            <div className="perf-card card-purple-employee">
              <div className="perf-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
                </svg>
              </div>
              <div className="perf-content">
                <h3 className="perf-label">Total Tasks</h3>
                <p className="perf-value">
                  <CountUp end={Number(report.total_tasks)} duration={1.2} />
                </p>
              </div>
            </div>

            <div className="perf-card card-orange-employee">
              <div className="perf-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              </div>
              <div className="perf-content">
                <h3 className="perf-label">Completed</h3>
                <p className="perf-value">
                  <CountUp end={Number(report.completed_tasks)} duration={1.2} />
                </p>
              </div>
            </div>

            <div className="perf-card card-green-employee">
              <div className="perf-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" />
                </svg>
              </div>
              <div className="perf-content">
                <h3 className="perf-label">Completion Rate</h3>
                <p className="perf-value">
                  <CountUp end={Number(report.completion_percentage)} duration={1.2} />%
                </p>
              </div>
            </div>

            <div className="perf-card card-blue-employee">
              <div className="perf-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
                </svg>
              </div>
              <div className="perf-content">
                <h3 className="perf-label">Total Hours</h3>
                <p className="perf-value">
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
            <div className="tasks-filters">
              <button onClick={() => setFilter("ALL")} className="filter-btn active">All</button>
              <button onClick={() => setFilter("PENDING")} className="filter-btn">Pending</button>
              <button onClick={() => setFilter("IN_PROGRESS")} className="filter-btn">In Progress</button>
              
            </div>
          </div>

          <div className="tasks-grid">
            {tasks
  .filter((task) => {
    if (filter === "ALL") return true;
    return task.current_status === filter;
  })
  .map((task) => (
              <TaskCard
                key={task.task_id}
                task={task}
                isSelected={selectedTask === task.task_id}
                onSelect={() => setSelectedTask(task.task_id)}
              />
            ))}
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
        return "status-completed";
      case "IN_PROGRESS":
        return "status-progress";
      case "PENDING":
        return "status-pending";
      default:
        return "status-pending";
    }
  };

  return (
    <div className={`task-card ${isSelected ? 'task-card-selected' : ''}${task.current_status === "COMPLETED" ? " fade-out status-completed" : ""}`} onClick={onSelect}>
      <div className="task-card-header">
        <h3 className="task-name">{task.task_name}</h3>
        <span className={`task-status ${getStatusColor(status)}`}>
          {status.replace('_', ' ')}
        </span>
        {task.current_status === "COMPLETED" && (
          <div className="completed-badge">
            ✅ Completed
          </div>
        )}
      </div>

      <div className="task-card-body">
        <div className="task-info">
          <div className="task-info-item">
            <svg viewBox="0 0 24 24" fill="currentColor" className="task-icon">
              <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z" />
            </svg>
            <div>
              <span className="task-label">Assigned Date</span>
              <span className="task-value">{task.assigned_date}</span>
            </div>
          </div>

          {task.time_taken > 0 && (
            <div className="task-info-item">
              <svg viewBox="0 0 24 24" fill="currentColor" className="task-icon">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
              </svg>
              <div>
                <span className="task-label">Time Taken</span>
                <span className="task-value">{task.time_taken} min</span>
              </div>
            </div>
          )}
        </div>
        <div style={{ marginTop: '10px', fontSize: '0.85rem', color: '#64748b' }}>
          * Report completion and time orally to Manager.
        </div>
      </div>
    </div>
  );
}

export default EmployeeDashboard;