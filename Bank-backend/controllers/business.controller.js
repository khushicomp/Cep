const db = require("../config/db");
const { createReportService, ReportError, normalizeStatus, calendarDate, businessToday, id } = require('../services/business-report.service');
const reports = createReportService(db);

function handler(operation, successStatus = 200) {
    return async (req, res) => {
        try {
            const body = req.body ?? {};
            if (typeof body !== 'object' || Array.isArray(body)) throw new ReportError(400, 'Invalid request body');
            const result = await operation(req, body);
            return res.status(successStatus).json(result);
        } catch (error) {
            if (error instanceof ReportError) return res.status(error.status).json({ message: error.message });
            if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A report already exists for this branch and date' });
            if (error.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ message: 'Report has related records and cannot be deleted' });
            if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) return res.status(409).json({ message: 'Report is being changed; reload and try again' });
            console.error('Business report operation failed');
            return res.status(500).json({ message: 'Internal server error' });
        }
    };
}
exports.createDailyEntry = handler((req, body) => reports.create(req.user, body), 201);
exports.updateEntry = handler((req, body) => reports.update(req.user, req.params.id, body));
exports.deleteEntry = handler(req => reports.remove(req.user, req.params.id));
exports.submitEntry = handler(req => reports.submit(req.user, req.params.id));
exports.getEntry = handler(req => reports.read(req.user, { entryId: req.params.id }));
exports.getMyEntries = handler(req => reports.read(req.user, { date: req.query.date }));
exports.getHistory = handler(req => reports.history(req.user));

// Validation errors are handled here because these legacy read handlers use callbacks.
function readInput(res, validate) {
    try { return validate(); }
    catch (error) {
        res.status(error instanceof ReportError ? error.status : 400).json({ message: error instanceof ReportError ? error.message : 'Invalid request' });
        return null;
    }
}

// 5. ADMIN: Get All Branches Summary by Date
exports.getAllBranchesSummary = (req, res) => {
    const { date } = req.query;
    const today = readInput(res, () => calendarDate(date === undefined ? businessToday() : date));
    if (!today) return;

    const sql = `
        SELECT 
            b.branch_id as _id, 
            b.branch_code as branchCode,
            b.branch_name as branchName, 
            b.branch_district as branchDistrict,
            MAX(e.manager_name) as managerName,
            IFNULL(SUM(e.total_entries), 0) as totalEntries,
            IFNULL(SUM(e.total_amount), 0) as totalAmount,
            MAX(e.submitted_at) as lastSubmitted,
            MAX(e.status) as status
        FROM branches b
        LEFT JOIN daily_business_entries e ON b.branch_id = e.branch_id AND e.entry_date = ? AND UPPER(TRIM(e.status)) IN ('SUBMITTED', 'FINAL_LOCKED')
        GROUP BY b.branch_id, b.branch_code, b.branch_name, b.branch_district
        ORDER BY b.branch_name ASC
    `;

    db.query(sql, [today], (err, results) => {
        if (err) return res.status(500).json({ message: "Internal server error" });
        
        const grandTotal = results.reduce((sum, b) => sum + Number(b.totalAmount), 0);
        
        res.json({
            success: true,
            date: today,
            branches: results.map(row => ({ ...row, status: normalizeStatus(row.status) })),
            totalBranches: results.length,
            grandTotal: grandTotal
        });
    });
};

// 5. ADMIN: Get Branch Details
exports.getBranchDetails = (req, res) => {
    const branchId = readInput(res, () => id(req.params.id));
    if (!branchId) return;
    const { date } = req.query;

    if (!readInput(res, () => calendarDate(date))) return;

    const sql = `
        SELECT e.*, DATE_FORMAT(e.entry_date, '%Y-%m-%d') AS entry_date, i.id as item_id, i.sr_no, i.account_type, i.status as item_status, i.amount, i.remark, b.branch_name, u.name as manager_name
        FROM daily_business_entries e
        JOIN branches b ON e.branch_id = b.branch_id
        LEFT JOIN users u ON e.manager_id = u.user_id
        LEFT JOIN daily_business_items i ON e.id = i.entry_id
        WHERE e.branch_id = ? AND e.entry_date = ?
    `;

    db.query(sql, [branchId, date], (err, results) => {
        if (err) return res.status(500).json({ message: "Internal server error" });

        if (results.length === 0) {
            return res.status(404).json({ message: "No entry found for this branch on the given date" });
        }

        const entry = {
            id: results[0].id,
            branch_id: results[0].branch_id,
            branch_name: results[0].branch_name,
            manager_name: results[0].manager_name,
            entry_date: results[0].entry_date,
            total_amount: results[0].total_amount,
            status: normalizeStatus(results[0].status),
            entries: []
        };

        if (results[0].item_id) {
            entry.entries = results.map(row => ({
                id: row.item_id,
                srNo: row.sr_no,
                accountType: row.account_type,
                status: row.item_status,
                amount: row.amount,
                remark: row.remark
            }));
        }

        res.json(entry);
    });
};

// 7. ADMIN: Analytics / Reports Summary
exports.getReports = (req, res) => {
    // For now we do a simple aggregated sum for all time or today. If date range is provided, can filter.
    const sql = `
        SELECT 
            SUM(e.total_amount) as totalBusiness,
            COUNT(i.id) as totalAccountsOpened
        FROM daily_business_entries e
        LEFT JOIN daily_business_items i ON e.id = i.entry_id
    `;

    db.query(sql, [], (err, results) => {
        if (err) return res.status(500).json({ message: "Internal server error" });
        
        // Detailed breakdown
        const breakdownSql = `
            SELECT account_type, COUNT(*) as count, SUM(amount) as amount
            FROM daily_business_items
            GROUP BY account_type
            ORDER BY count DESC
            LIMIT 10
        `;
        
        db.query(breakdownSql, [], (err2, breakdownResults) => {
            if (err2) return res.status(500).json({ message: "Internal server error" });
            
            res.json({
                overall: results[0] || { totalBusiness: 0, totalAccountsOpened: 0 },
                breakdown: breakdownResults
            });
        });
    });
};

// 8. ADMIN: Get Branch Submission History
exports.getBranchHistory = (req, res) => {
    const branchId = readInput(res, () => id(req.params.branchId));
    if (!branchId) return;

    const sql = `
        SELECT id, DATE_FORMAT(entry_date, '%Y-%m-%d') AS entry_date, total_amount, status, created_at
        FROM daily_business_entries
        WHERE branch_id = ?
        ORDER BY entry_date DESC
        LIMIT 20
    `;

    db.query(sql, [branchId], (err, results) => {
        if (err) return res.status(500).json({ message: "Internal server error" });
        res.json(results.map(row => ({ ...row, status: normalizeStatus(row.status) })));
    });
};
