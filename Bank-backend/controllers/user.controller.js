const db = require("../config/db");
const bcrypt = require("bcryptjs");

exports.createUser = async (req, res) => {
  try {
    const { name, email, role, branch_id } = req.body;
    
    // Validate inputs
    if (!name || !email || !role || !branch_id) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Admins can create MANAGER or EMPLOYEE
    // Managers can ONLY create EMPLOYEE, and only for their own branch
    if (req.user.role === "MANAGER") {
      if (role !== "EMPLOYEE") {
        return res.status(403).json({ message: "Managers can only create employees" });
      }
      if (branch_id != req.user.branch_id) {
        return res.status(403).json({ message: "Managers can only add employees to their own branch" });
      }
    }

    // Hash the default password
    const defaultPassword = "Bank@" + Math.floor(1000 + Math.random() * 9000); 
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(defaultPassword, salt);

    const sql = `INSERT INTO users (name, email, password, role, branch_id) VALUES (?, ?, ?, ?, ?)`;
    
    db.query(sql, [name, email, hashedPassword, role, branch_id], (err, results) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY") {
          return res.status(400).json({ message: "User with this email already exists" });
        }
        console.error("Error creating user:", err);
        return res.status(500).json({ message: "Database error while creating user" });
      }

      return res.status(201).json({
        message: "User created successfully",
        user: {
          id: results.insertId,
          name,
          email,
          role,
          branch_id,
          defaultPassword // In a real app, send via email. Here we return so Admin/Manager can see it.
        }
      });
    });

  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.getEmployees = (req, res) => {
    const { branchId, canViewAll } = req.branchFilter;
    
    let sql = `SELECT user_id, name, email, branch_code, branch_name FROM users WHERE role = 'EMPLOYEE' AND is_active = 1`;
    const params = [];
    
    if (!canViewAll) {
        sql += ` AND branch_id = ?`;
        params.push(branchId);
    }
    
    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json({ success: true, employees: results });
    });
};
