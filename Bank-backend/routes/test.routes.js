const express = require("express");
const router = express.Router();
const {testAPI} = require("../controllers/test.controllers");

router.get("/test", testAPI);

module.exports = router;