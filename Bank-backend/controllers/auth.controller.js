const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.login = (req, res) => {
  const { email, password } = req.body;

  const sql = `
    SELECT u.*, b.branch_code as real_branch_code, b.branch_name as real_branch_name 
    FROM users u
    LEFT JOIN branches b ON u.branch_id = b.branch_id
    WHERE u.email = ?
  `;

  db.query(sql, [email], async (err, results) => {

    console.log("Email received from frontend:", email);

    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Server error" });
    }

    console.log("Database results:", results);


    if (results.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = results[0];

    const isMatch = await bcrypt.compare(password, user.password);


    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        user_id: user.user_id,
        role: user.role,
        branch_id: user.branch_id,
        branch_code: user.real_branch_code || user.branch_code,
        branch_name: user.real_branch_name || user.branch_name,
        can_view_all_branches: user.can_view_all_branches
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      message: "Login successful",
      token,
      role: user.role,
      user: {
        id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
        branch_id: user.branch_id,
        branch_code: user.real_branch_code || user.branch_code,
        branch_name: user.real_branch_name || user.branch_name
      }
    });
  });
  

};
