const express = require("express");
const router = express.Router();
const { login } = require("../controllers/auth.controller");
const { createLoginLimiter } = require('../middleware/login-limit.middleware');
const recovery = require('../controllers/credential.controller');

router.post("/login", createLoginLimiter(), express.json({ limit: '16kb' }), login);
const recoveryLimit = createLoginLimiter({ limit: 15, message: { message: 'Too many requests. Please try again later.' } });
router.post('/forgot-password', recoveryLimit, express.json({ limit: '4kb' }), recovery.forgot);
router.post('/setup-password', recoveryLimit, express.json({ limit: '4kb' }), recovery.setup);
router.post('/reset-password', recoveryLimit, express.json({ limit: '4kb' }), recovery.reset);

module.exports = router;
