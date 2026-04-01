const db = require("../config/db");


exports.getBranchEmployees = (req, res) => {
  const branchId = req.user.branch_id;

  const sql = `
    SELECT user_id, name, email
    FROM users
    WHERE branch_id = ?
    AND role = 'EMPLOYEE'
  `;

  db.query(sql, [branchId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: err });
    }

    res.json(results);
  });
};

/**
 * Employee Performance Report
 */
exports.getEmployeeReport = (req, res) => {
  const employeeId = req.user.user_id;

  const sql = `
    SELECT 
      COUNT(DISTINCT t.task_id) AS total_tasks,
      COUNT(DISTINCT CASE 
        WHEN tu.status = 'COMPLETED' THEN t.task_id 
      END) AS completed_tasks,
      COALESCE(SUM(CASE 
        WHEN tu.status = 'COMPLETED' THEN tu.time_taken 
        ELSE 0 
      END), 0) AS total_time
    FROM tasks t
    LEFT JOIN task_updates tu
      ON t.task_id = tu.task_id
    WHERE t.assigned_to = ?
  `;

  db.query(sql, [employeeId], (err, results) => {
    if (err) return res.status(500).json({ error: err });

    const data = results[0] || {};

    const totalTasks = data.total_tasks || 0;
    const completedTasks = data.completed_tasks || 0;

    const completionPercentage =
      totalTasks === 0
        ? 0
        : Number(((completedTasks / totalTasks) * 100).toFixed(2));

    res.json({
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      total_time: data.total_time || 0,
      completion_percentage: completionPercentage,
    });
  });
};

/**
 * Branch Level Report (Manager)
 */
exports.getBranchReport = (req, res) => {
  const branchId = req.user.branch_id;

  const sql = `
        SELECT 
      COUNT(DISTINCT u.user_id) AS total_employees,
      COUNT(DISTINCT t.task_id) AS total_tasks,

      COUNT(DISTINCT CASE 
        WHEN (
          SELECT tu2.status
          FROM task_updates tu2
          WHERE tu2.task_id = t.task_id
          ORDER BY tu2.update_id DESC
          LIMIT 1
        ) = 'COMPLETED'
        THEN t.task_id
      END) AS completed_tasks,

      COALESCE(SUM(CASE 
        WHEN tu.status = 'COMPLETED' THEN tu.time_taken 
        ELSE 0 
      END), 0) AS total_time

    FROM users u
    LEFT JOIN tasks t
      ON u.user_id = t.assigned_to
    LEFT JOIN task_updates tu
      ON t.task_id = tu.task_id
    WHERE u.branch_id = ?
      AND u.role = 'EMPLOYEE'
    `;

  db.query(sql, [branchId], (err, results) => {
    if (err) return res.status(500).json({ error: err });

    const data = results[0] || {};

    const totalTasks = data.total_tasks || 0;
    const completedTasks = data.completed_tasks || 0;

    const completionPercentage =
      totalTasks === 0
        ? 0
        : Number(((completedTasks / totalTasks) * 100).toFixed(2));

    res.json({
      total_employees: data.total_employees || 0,
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      total_time: data.total_time || 0,
      completion_percentage: completionPercentage,
    });
  });
};

/**
 * Weekly Trend (Last 7 Days Completed Tasks)
 */
exports.getWeeklyTrend = (req, res) => {
  const branchId = req.user.branch_id;

  const sql = `
    SELECT 
      DATE(tu.update_date) AS day,
      COUNT(DISTINCT t.task_id) AS completed_tasks
    FROM task_updates tu
    JOIN tasks t ON t.task_id = tu.task_id
    JOIN users u ON u.user_id = t.assigned_to
    WHERE u.branch_id = ?
      AND tu.status = 'COMPLETED'
      AND tu.update_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    GROUP BY day
    ORDER BY day ASC
  `;

  db.query(sql, [branchId], (err, results) => {
    if (err) return res.status(500).json({ error: err });

    res.json(results || []);
  });
};

/**
 * Admin - Multi Branch Analytics
 */
exports.getAllBranchesReport = (req, res) => {
  const sql = `
    SELECT 
      b.branch_id,
      b.branch_name,
      COUNT(DISTINCT u.user_id) AS total_employees,
      COUNT(DISTINCT t.task_id) AS total_tasks,
      COUNT(DISTINCT CASE 
        WHEN tu.status = 'COMPLETED' THEN t.task_id 
      END) AS completed_tasks
    FROM branches b
    LEFT JOIN users u 
      ON u.branch_id = b.branch_id 
      AND u.role = 'EMPLOYEE'
    LEFT JOIN tasks t 
      ON t.assigned_to = u.user_id
    LEFT JOIN task_updates tu 
      ON tu.task_id = t.task_id
    GROUP BY b.branch_id
  `;

  db.query(sql, (err, results) => {
if (err) {
  console.error("All Branch Report Error:", err);
  return res.status(500).json({ error: "Database error" });
}


    const formatted = (results || []).map((branch) => {
      const totalTasks = branch.total_tasks || 0;
      const completedTasks = branch.completed_tasks || 0;

      const completionPercentage =
        totalTasks === 0
          ? 0
          : Number(((completedTasks / totalTasks) * 100).toFixed(2));

      return {
        ...branch,
        completion_percentage: completionPercentage,
      };
    });

    res.json(formatted);
  });
};
exports.getMonthlyTasksAdmin = (req, res) => {
  const sql = `
    SELECT 
  DATE_FORMAT(tu.update_date, '%b') AS month,

  COUNT(DISTINCT t.task_id) AS completed_tasks,

  ROUND(AVG(tu.time_taken), 2) AS avg_time,

  ROUND(
    (COUNT(DISTINCT t.task_id) / 
     (SELECT COUNT(*) FROM tasks)) * 100, 2
  ) AS productivity_score

FROM task_updates tu
JOIN tasks t ON t.task_id = tu.task_id

WHERE tu.status = 'COMPLETED'

GROUP BY month
ORDER BY MIN(tu.update_date)
  `;

  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err });

    res.json(results);
  });
};