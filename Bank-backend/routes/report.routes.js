const express = require("express");
const router = express.Router();

const {
  getEmployeeReport,
  getBranchReport,
  getWeeklyTrend,
  getAllBranchesReport,
  getBranchEmployees,
  getMonthlyTasks,
  getMonthlyTasksAdmin,   // optional for admin
} = require("../controllers/report.controller");

const { verifyToken } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/role.middleware");

/**
 * Employee Report
 */
router.get(
  "/employee",
  verifyToken,
  allowRoles("EMPLOYEE"),
  getEmployeeReport
);

/**
 * Branch Report (Manager)
 */
router.get(
  "/branch",
  verifyToken,
  allowRoles("MANAGER"),
  getBranchReport
);

/**
 * Weekly Trend (Manager)
 */
router.get(
  "/weekly-trend",
  verifyToken,
  allowRoles("MANAGER", "ADMIN"),
  getWeeklyTrend
);

/**
 * Admin - Multi Branch Report
 */
router.get(
  "/all-branches",
  verifyToken,
  allowRoles("ADMIN"),
  getAllBranchesReport
);


router.get(
  "/branch-employees",
  verifyToken,
  allowRoles("MANAGER"),
  getBranchEmployees
);

router.get(
  "/admin/monthly",
  verifyToken,
  allowRoles("ADMIN"),
  getMonthlyTasksAdmin
);


module.exports = router;
