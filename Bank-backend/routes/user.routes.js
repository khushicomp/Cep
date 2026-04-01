const express = require("express");
const router = express.Router();
const { createUser } = require("../controllers/user.controller");
const { verifyToken, isAdminOrManager } = require("../middleware/auth.middleware");

// POST /api/users/create
router.post("/create", verifyToken, isAdminOrManager, createUser);

module.exports = router;
