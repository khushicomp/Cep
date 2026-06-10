const express = require("express");
const router = express.Router();
const { createUser, getEmployees } = require("../controllers/user.controller");
const { verifyToken, isAdminOrManager } = require("../middleware/auth.middleware");
const { filterByBranch } = require("../middleware/branch.middleware");

// POST /api/users/create
router.post("/create", verifyToken, isAdminOrManager, createUser);

// GET /api/users/employees
router.get("/employees", verifyToken, filterByBranch, getEmployees);

module.exports = router;
