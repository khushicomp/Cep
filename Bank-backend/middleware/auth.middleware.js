const jwt = require("jsonwebtoken");

exports.verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(403).json({ message: "No token provided" });
  }

  // Split "Bearer <token>"
  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(403).json({ message: "Invalid token format" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    req.user = decoded;
    next();
  });
};

exports.isAdminOrManager = (req, res, next) => {
  if (req.user && (req.user.role === "ADMIN" || req.user.role === "MANAGER")) {
    next();
  } else {
    res.status(403).json({ message: "Access denied: Requires Admin or Manager role" });
  }
};

exports.isAdmin = (req, res, next) => {
  if (req.user && req.user.role === "ADMIN") {
    next();
  } else {
    res.status(403).json({ message: "Access denied: Requires Admin role" });
  }
};
