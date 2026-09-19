const express = require("express");
const router = express.Router();
const business = require("../controllers/business.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/role.middleware");

const manager = allowRoles("MANAGER");
const centralReader = allowRoles("ADMIN", "HEAD_OFFICE");
router.use(verifyToken);

// Branch tenancy comes only from the verified user inside report queries.
router.post("/daily-entry", manager, business.createDailyEntry);
router.get("/my-entries", manager, business.getMyEntries);
router.get("/history", manager, business.getHistory);
router.get("/entry/:id", allowRoles("MANAGER", "ADMIN", "HEAD_OFFICE"), business.getEntry);
router.put("/entry/:id", manager, business.updateEntry);
router.delete("/entry/:id", manager, business.deleteEntry);
router.post("/entry/:id/submit", manager, business.submitEntry);

// Transitional central roles have read access only to business reports.
router.get("/all-branches", centralReader, business.getAllBranchesSummary);
router.get("/branch/:id", centralReader, business.getBranchDetails);
router.get("/reports", centralReader, business.getReports);
router.get("/branch-history/:branchId", centralReader, business.getBranchHistory);
module.exports = router;
