const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
// Valid synthetic bcrypt encoding for unknown users: perform comparison work without a real account hash.
const DUMMY_HASH = '$2b$12$' + '.'.repeat(53);

exports.login = (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || !email.trim() || email.length > 254 || typeof password !== 'string' || !password || password.length > 1024) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const sql = `SELECT u.user_id, u.name, u.email, u.password, u.role, u.branch_id, u.is_active,
    u.branch_code, u.branch_name, u.can_view_all_branches,
    b.branch_code AS real_branch_code, b.branch_name AS real_branch_name
    FROM users u LEFT JOIN branches b ON u.branch_id = b.branch_id WHERE u.email = ?`;
  db.query(sql, [email.trim()], async (err, results) => {
    if (err) {
      console.error('Authentication database query failed');
      return res.status(500).json({ message: 'Server error' });
    }
    try {
      const user = results[0];
      const match = await bcrypt.compare(password, user?.password || DUMMY_HASH);
      if (!user || Number(user.is_active) !== 1 || !match) return res.status(401).json({ message: 'Invalid credentials' });
      const token = jwt.sign({ user_id: user.user_id, role: user.role, branch_id: user.branch_id,
        branch_code: user.real_branch_code || user.branch_code, branch_name: user.real_branch_name || user.branch_name,
        can_view_all_branches: user.can_view_all_branches }, process.env.JWT_SECRET, { expiresIn: '10h', algorithm: 'HS256' });
      return res.json({ message: 'Login successful', token, role: user.role, user: {
        id: user.user_id, name: user.name, email: user.email, role: user.role, branch_id: user.branch_id,
        branch_code: user.real_branch_code || user.branch_code, branch_name: user.real_branch_name || user.branch_name
      } });
    } catch {
      console.error('Authentication processing failed');
      return res.status(500).json({ message: 'Server error' });
    }
  });
};
