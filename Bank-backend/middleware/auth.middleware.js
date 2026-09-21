const jwt = require("jsonwebtoken");
const db = require("../config/db");

exports.verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(403).json({ message: "No token provided" });
  if (typeof authHeader !== 'string' || !/^Bearer [^\s]+$/i.test(authHeader)) return res.status(401).json({ message: 'Unauthorized' });
  let decoded;
  try {
    decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!decoded || !/^[1-9]\d*$/.test(String(decoded.user_id)) || !Number.isSafeInteger(Number(decoded.user_id)) || Number(decoded.user_id) > 2147483647) throw new Error();
  } catch { return res.status(401).json({ message: 'Unauthorized' }); }
  try {
    const [rows] = await db.promise().query('SELECT user_id, role, branch_id, is_active FROM users WHERE user_id = ?', [Number(decoded.user_id)]);
    const user = rows[0];
    if (!user || Number(user.is_active) !== 1 || !['MANAGER', 'HEAD_OFFICE', 'ADMIN', 'EMPLOYEE'].includes(user.role)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    // JWT role/branch claims are compatibility data only; never authorization input.
    req.user = { user_id: user.user_id, role: user.role, branch_id: user.branch_id };
    return next();
  } catch {
    console.error('Authentication identity lookup failed');
    return res.status(503).json({ message: 'Authentication temporarily unavailable' });
  }
};
