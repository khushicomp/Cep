const express = require("express");
const router = express.Router();
const { login } = require("../controllers/auth.controller");
const { createLoginLimiter } = require('../middleware/login-limit.middleware');

router.post("/login", createLoginLimiter(), express.json({ limit: '16kb' }), login);

module.exports = router;
