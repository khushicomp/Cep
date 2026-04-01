import os

CSS_APPEND = """

/* =========================================
   EMPLOYEE DASHBOARD SPECIFIC OVERRIDES
   ========================================= */

/* Main Content Spacing Fix (instead of .employee-dashboard to preserve sidebar) */
.main-content-employee {
    padding: 2rem 2.5rem;
    background: #F9FAFB;
    min-height: 100vh;
}

.main-content-employee .page-header {
    margin-bottom: 2.5rem;
    padding: 0; /* Reset since it's padded by parent now */
    border: none;
    box-shadow: none;
    background: transparent;
}

.main-content-employee .page-header h1 {
    font-size: 1.875rem;
    font-weight: 600;
    color: #1F2937;
    margin-bottom: 0.25rem;
}

.main-content-employee .page-header p {
    font-size: 1rem;
    color: #6B7280;
    font-weight: 400;
}

/* Statistics Grid */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1.5rem;
    margin-bottom: 2.5rem;
    margin-left: 0;
    margin-right: 0;
}

/* Stat Cards */
.stat-card {
    background: linear-gradient(135deg, #FFF5E6 0%, #FFE8CC 100%);
    border: 1px solid #FFE0B2;
    border-radius: 12px;
    padding: 1.75rem;
    box-shadow: 0 2px 8px rgba(255, 107, 53, 0.08);
    transition: transform 0.2s;
    display: block; /* Override global flex */
}

.stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 16px rgba(255, 107, 53, 0.15);
}

.stat-icon {
    width: 52px;
    height: 52px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 1rem;
    font-size: 1.5rem;
}

.stat-icon.chart {
    background: rgba(255, 107, 53, 0.12);
    color: #FF6B35;
}

.stat-icon.check {
    background: rgba(16, 185, 129, 0.12);
    color: #10B981;
}

.stat-icon.trend {
    background: rgba(59, 130, 246, 0.12);
    color: #3B82F6;
}

.stat-icon.clock {
    background: rgba(251, 191, 36, 0.12);
    color: #FBBF24;
}

.stat-card-title {
    font-size: 0.9375rem;
    font-weight: 500;
    color: #6B7280;
    margin-bottom: 0.75rem;
}

.stat-card-value {
    font-size: 2.25rem;
    font-weight: 700;
    color: #FF6B35;
    line-height: 1;
}

/* Tasks Section */
.tasks-section {
    padding: 0;
    background: transparent;
    box-shadow: none;
    border: none;
    margin: 0;
}

.tasks-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    border-bottom: none;
    padding-bottom: 0;
}

.tasks-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: #1F2937;
}

/* Filter Tabs */
.filter-tabs {
    display: flex;
    gap: 0.75rem;
    border-bottom: none;
    margin-bottom: 0;
}

.filter-tab {
    padding: 0.5rem 1.5rem;
    border-radius: 20px !important;
    font-size: 0.875rem;
    font-weight: 500;
    border: 1px solid #E5E7EB;
    background: white !important;
    color: #6B7280 !important;
    cursor: pointer;
    transition: all 0.2s;
}

.filter-tab:hover {
    border-color: #FF6B35 !important;
    color: #FF6B35 !important;
    background: #FFF5E6 !important;
}

.filter-tab.active {
    background: #FF6B35 !important;
    color: white !important;
    border-color: #FF6B35 !important;
    font-weight: 600;
}

/* Task List Grid */
.task-list {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1.5rem;
}

/* Task Card */
.task-card {
    background: white;
    border: 1px solid #E5E7EB;
    border-radius: 10px;
    padding: 1.5rem;
    transition: all 0.2s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.task-card:hover {
    border-color: #FF6B35;
    box-shadow: 0 4px 12px rgba(255, 107, 53, 0.1);
    transform: translateY(-2px);
}

.task-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #F3F4F6;
}

.task-name {
    font-size: 1.125rem;
    font-weight: 600;
    color: #1F2937;
    text-transform: capitalize;
}

.task-status-badge {
    padding: 0.375rem 1rem;
    border-radius: 6px;
    font-size: 0.8125rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.025em;
    display: inline-block;
}

.task-status-badge.completed {
    background: #D1FAE5;
    color: #065F46;
    border: 1px solid #A7F3D0;
}

.task-completed-icon {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #D1FAE5;
    color: #10B981;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: bold;
}

.task-date {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: #6B7280;
    margin-bottom: 0.75rem;
}

.task-date svg {
    color: #FF6B35;
    width: 16px;
    height: 16px;
}

.task-instruction {
    display: flex;
    align-items: start;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: #FFF5E6;
    border-left: 3px solid #FF6B35;
    border-radius: 4px;
    font-size: 0.875rem;
    color: #92400E;
    line-height: 1.5;
    margin-top: 1rem;
}

.empty-state {
    text-align: center;
    padding: 4rem 2rem;
    background: white;
    border: 2px dashed #E5E7EB;
    border-radius: 12px;
}

.empty-state-icon {
    width: 80px;
    height: 80px;
    margin: 0 auto 1.5rem;
    background: #F9FAFB;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #D1D5DB;
    font-size: 2.5rem;
}

.empty-state-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: #1F2937;
    margin-bottom: 0.5rem;
}

.empty-state-message {
    font-size: 0.9375rem;
    color: #6B7280;
}

/* Responsive Overrides */
@media (max-width: 1400px) {
    .task-list {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 1200px) {
    .stats-grid {
        grid-template-columns: repeat(2, 1fr);
    }
}

@media (max-width: 768px) {
    .main-content-employee {
        padding: 1.5rem 1rem;
    }
    .stats-grid,
    .task-list {
        grid-template-columns: 1fr;
    }
    .filter-tabs {
        justify-content: center;
    }
}
"""

css_path = r"c:\Users\khush\OneDrive\Desktop\bank\frontend\src\pages\EmployeeDashboard.css"

with open(css_path, "a", encoding="utf-8") as file:
    file.write(CSS_APPEND)

print("EmployeeDashboard.css appended gracefully.")
