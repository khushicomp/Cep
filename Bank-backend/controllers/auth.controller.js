const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.login = (req, res) => {
  const { email, password } = req.body;

  const sql = "SELECT * FROM users WHERE email = ?";

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
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.json({
      message: "Login successful",
      token,
      role: user.role,
    });
  });
  

};
