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
router.post("/entry/:id/final-lock", allowRoles("HEAD_OFFICE"), business.finalLockEntry);
router.post("/entry/:id/unlock-request", manager, business.requestUnlock);
router.post("/entry/:id/unlock-approve", allowRoles("HEAD_OFFICE"), business.approveUnlock);
router.post("/entry/:id/unlock-reject", allowRoles("HEAD_OFFICE"), business.rejectUnlock);

// Transitional ADMIN remains a central reader; final-lock authority is separate.
router.get("/all-branches", centralReader, business.getAllBranchesSummary);
router.get("/branch/:id", centralReader, business.getBranchDetails);
router.get("/reports", centralReader, business.getReports);
router.get("/branch-history/:branchId", centralReader, business.getBranchHistory);
module.exports = router;
