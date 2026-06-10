const express = require("express");
const router = express.Router();

const {
  assignTask,
  getMyTasks,
  updateTask,
  getRecentTasks
} = require("../controllers/task.controller");

const { verifyToken } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/role.middleware");
const { filterByBranch } = require("../middleware/branch.middleware");

router.post(
  "/assign",
  verifyToken,
  allowRoles("MANAGER"),
  filterByBranch,
  assignTask
);

router.get(
  "/my-tasks",
  verifyToken,
  allowRoles("EMPLOYEE"),
  getMyTasks
);

router.put(
  "/update/:taskId",
  verifyToken,
  allowRoles("EMPLOYEE"),
  updateTask
);

router.get(
  "/recent",
  verifyToken,
  allowRoles("MANAGER"),
  getRecentTasks
);

module.exports = router;
