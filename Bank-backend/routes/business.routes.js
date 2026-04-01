const express = require("express");
const router = express.Router();
const businessController = require("../controllers/business.controller");
const { verifyToken, isAdminOrManager, isAdmin } = require("../middleware/auth.middleware");

// MANAGER ROUTES
router.post(
    "/daily-entry",
    verifyToken,
    isAdminOrManager,
    businessController.createDailyEntry
);

router.get(
    "/my-entries",
    verifyToken,
    isAdminOrManager,
    businessController.getMyEntries
);

router.put(
    "/entry/:id",
    verifyToken,
    isAdminOrManager,
    businessController.updateEntry
);

router.get(
    "/history",
    verifyToken,
    isAdminOrManager,
    businessController.getHistory
);

// ADMIN ROUTES
router.get(
    "/all-branches",
    verifyToken,
    isAdmin, 
    businessController.getAllBranchesSummary
);

router.get(
    "/branch/:id",
    verifyToken,
    isAdmin,
    businessController.getBranchDetails
);

router.get(
    "/reports",
    verifyToken,
    isAdmin,
    businessController.getReports
);

module.exports = router;
