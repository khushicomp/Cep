const db = require("../config/db");

/**
 * ============================
 * 1️⃣ Manager Assigns Task
 * ============================
 */
exports.assignTask = (req, res) => {
  const { task_name, assigned_to, description, priority, due_date } = req.body;
  const assigned_by = req.user.user_id;
  const { branch_id, branch_code, branch_name } = req.userBranch;

  if (!task_name || !assigned_to) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const sql = `
    INSERT INTO tasks (task_name, assigned_by, assigned_to, assigned_date, branch_id, branch_code, branch_name, description, priority, due_date)
    VALUES (?, ?, ?, CURDATE(), ?, ?, ?, ?, ?, ?)
  `;

  db.query(sql, [task_name, assigned_by, assigned_to, branch_id, branch_code, branch_name, description || null, priority || 'medium', due_date || null], (err, result) => {
    if (err) {
      return res.status(500).json({ error: err });
    }

    res.status(201).json({
      message: "Task assigned successfully",
      task_id: result.insertId
    });
  });
};


/**
 * ==========================================
 * 2️⃣ Employee Fetches Their Tasks
 * (With Total Time Aggregation)
 * ==========================================
 */
exports.getMyTasks = (req, res) => {
  const employeeId = req.user.user_id;

  const sql = `
  SELECT 
    t.task_id,
    t.task_name,
    t.assigned_date,
    IFNULL(SUM(u.time_taken), 0) AS total_time,
    IFNULL(
      (SELECT status 
       FROM task_updates 
       WHERE task_id = t.task_id 
       ORDER BY update_id DESC 
       LIMIT 1),
      'PENDING'
    ) AS current_status
  FROM tasks t
  LEFT JOIN task_updates u 
    ON t.task_id = u.task_id
  WHERE t.assigned_to = ?
  GROUP BY t.task_id
`;

  db.query(sql, [employeeId], (err, results) => {
    if (err) {
      return res.status(500).json({ error: err });
    }

    res.json(results);
  });
  console.log("Decoded user:", req.user);
  console.log("Employee ID:", req.user.user_id);

};


/**
 * ==========================================
 * 3️⃣ Employee Updates Task
 * (Status + Time Tracking)
 * ==========================================
 */
exports.updateTask = (req, res) => {

 

  let { status, time_taken } = req.body;
  const taskId = req.params.taskId;
  const userId = req.user.user_id;

  const validStatuses = ["PENDING", "IN_PROGRESS", "COMPLETED"];

   console.log("Updating task:", {
  taskId,
  status,
  time_taken,
  userId
});

  // Basic validations
  if (!status || time_taken === undefined) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  status = status.trim();

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: "Invalid status value" });
  }

  if (time_taken < 0) {
    return res.status(400).json({ message: "Time cannot be negative" });
  }

  // 1️⃣ Verify task belongs to employee
  const checkSql = `
    SELECT * FROM tasks 
    WHERE task_id = ? AND assigned_to = ?
  `;

  db.query(checkSql, [taskId, userId], (err, results) => {
    if (err) return res.status(500).json({ error: err });

    if (results.length === 0) {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    // 2️⃣ Get last status
    const lastStatusSql = `
      SELECT status FROM task_updates
      WHERE task_id = ?
      ORDER BY update_id DESC
      LIMIT 1
    `;

    db.query(lastStatusSql, [taskId], (err2, statusResults) => {
      if (err2) return res.status(500).json({ error: err2 });

      if (
        statusResults.length > 0 &&
        statusResults[0].status === "COMPLETED"
      ) {
        return res.status(400).json({
          message: "Task already completed"
        });
      }

      // 3️⃣ Insert new update
      const insertSql = `
        INSERT INTO task_updates
        (task_id, status, time_taken, update_date)
        VALUES (?, ?, ?, CURDATE())
      `;

      db.query(insertSql, [taskId, status, time_taken], (err3) => {
        if (err3) return res.status(500).json({ error: err3 });

        res.json({ message: "Task updated successfully" });
      });
    });
  });
};

//Get RECENT TASKS//

exports.getRecentTasks = (req, res) => {
  const branchId = req.user.branch_id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  const offset = (page - 1) * limit;

  // 1️⃣ Get total count
  const countSql = `
    SELECT COUNT(DISTINCT t.task_id) AS total
    FROM tasks t
    JOIN users u ON u.user_id = t.assigned_to
    WHERE u.branch_id = ?
  `;

  db.query(countSql, [branchId], (err, countResult) => {
    if (err) return res.status(500).json({ error: err });

    const totalRecords = countResult[0].total;
    const totalPages = Math.ceil(totalRecords / limit);

    // 2️⃣ Fetch paginated data
    const dataSql = `
      SELECT 
        t.task_id,
        t.task_name,
        u.name AS employee_name,
        IFNULL(
          (SELECT status FROM task_updates 
           WHERE task_id = t.task_id 
           ORDER BY update_id DESC LIMIT 1),
          'PENDING'
        ) AS current_status,
        IFNULL(SUM(tu.time_taken), 0) AS total_time
      FROM tasks t
      JOIN users u ON u.user_id = t.assigned_to
      LEFT JOIN task_updates tu ON tu.task_id = t.task_id
      WHERE u.branch_id = ?
      GROUP BY t.task_id
      ORDER BY t.task_id DESC
      LIMIT ? OFFSET ?
    `;

    db.query(dataSql, [branchId, limit, offset], (err2, results) => {
      if (err2) return res.status(500).json({ error: err2 });

      res.json({
        currentPage: page,
        totalPages,
        totalRecords,
        tasks: results
      });
    });
  });
};


