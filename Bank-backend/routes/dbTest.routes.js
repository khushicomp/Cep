const express = require("express");
const router = express.Router();
const { dbTest } = require("../controllers/dbTest.controller");
const {verifyToken} = require("../middleware/auth.middleware");
const {allowRoles} = require("../middleware/role.middleware");

router.get("/db-test", verifyToken, allowRoles("ADMIN"), dbTest);

module.exports = router;
