const db = require("../config/db");

// 1. MANAGER: Create Daily Business Entry
exports.createDailyEntry = (req, res) => {
    const { date, entries, totalAmount, status } = req.body;
    const managerId = req.user.user_id;
    const managerName = req.user.name;
    const { branch_id, branch_code, branch_name } = req.userBranch;
    const totalEntries = entries ? entries.length : 0;
    const submittedAt = (status === 'submitted' || status === 'SUBMITTED') ? new Date() : null;

    if (!branch_id || !date || !entries || entries.length === 0) {
        return res.status(400).json({ message: "Missing required fields or empty entries" });
    }

    const insertEntrySql = `
        INSERT INTO daily_business_entries 
        (branch_id, branch_code, branch_name, manager_id, manager_name, entry_date, total_amount, total_entries, status, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(insertEntrySql, [branch_id, branch_code, branch_name, managerId, managerName, date, totalAmount, totalEntries, status || 'draft', submittedAt], (err, entryResult) => {
        if (err) return res.status(500).json({ error: err });

        const entryId = entryResult.insertId;

        const insertItemsSql = `
            INSERT INTO daily_business_items (entry_id, sr_no, account_type, status, amount, remark)
            VALUES ?
        `;

        const itemValues = entries.map((item, index) => [
            entryId,
            item.srNo || (index + 1),
            item.accountType,
            item.status,
            item.amount || 0,
            item.remark || ""
        ]);

        db.query(insertItemsSql, [itemValues], (err2) => {
            if (err2) return res.status(500).json({ error: err2 });
            res.status(201).json({ message: "Daily business entry saved successfully", entryId });
        });
    });
};

// 2. MANAGER: Get My Entries by Date
exports.getMyEntries = (req, res) => {
    const managerId = req.user.user_id;
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ message: "Date is required" });
    }

    const sql = `
        SELECT e.*, i.id as item_id, i.sr_no, i.account_type, i.status as item_status, i.amount, i.remark
        FROM daily_business_entries e
        LEFT JOIN daily_business_items i ON e.id = i.entry_id
        WHERE e.manager_id = ? AND e.entry_date = ?
    `;

    db.query(sql, [managerId, date], (err, results) => {
        if (err) return res.status(500).json({ error: err });

        if (results.length === 0) {
            return res.json(null);
        }

        const entry = {
            id: results[0].id,
            branch_id: results[0].branch_id,
            manager_id: results[0].manager_id,
            entry_date: results[0].entry_date,
            total_amount: results[0].total_amount,
            status: results[0].status,
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

// 3. MANAGER: Update Entry
exports.updateEntry = (req, res) => {
    const entryId = req.params.id;
    const managerId = req.user.user_id;
    const { totalAmount, status, entries } = req.body;
    const totalEntries = entries ? entries.length : 0;
    const submittedAt = (status === 'submitted' || status === 'SUBMITTED') ? new Date() : null;

    // Verify ownership or check if Admin
    const checkSql = `SELECT * FROM daily_business_entries WHERE id = ?`;
    
    db.query(checkSql, [entryId], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        if (results.length === 0) return res.status(404).json({ message: "Entry not found" });

        // Allow if user is ADMIN, or if the manager matches ownership
        if (req.user.role !== 'ADMIN' && results[0].manager_id != managerId) {
            return res.status(403).json({ message: "Unauthorized or entry not found" });
        }

        const updateEntrySql = `
            UPDATE daily_business_entries 
            SET total_amount = ?, total_entries = ?, status = ?, submitted_at = ?
            WHERE id = ?
        `;
        
        db.query(updateEntrySql, [totalAmount, totalEntries, status, submittedAt, entryId], (err2) => {
            if (err2) return res.status(500).json({ error: err2 });

            const deleteItemsSql = `DELETE FROM daily_business_items WHERE entry_id = ?`;
            
            db.query(deleteItemsSql, [entryId], (err3) => {
                if (err3) return res.status(500).json({ error: err3 });

                if (!entries || entries.length === 0) {
                    return res.json({ message: "Entry updated successfully" });
                }

                const insertItemsSql = `
                    INSERT INTO daily_business_items (entry_id, sr_no, account_type, status, amount, remark)
                    VALUES ?
                `;

                const itemValues = entries.map((item, index) => [
                    entryId,
                    item.srNo || (index + 1),
                    item.accountType,
                    item.status,
                    item.amount || 0,
                    item.remark || ""
                ]);

                db.query(insertItemsSql, [itemValues], (err4) => {
                    if (err4) return res.status(500).json({ error: err4 });
                    res.json({ message: "Entry updated successfully" });
                });
            });
        });
    });
};

// 4. MANAGER: Delete Entry
exports.deleteEntry = (req, res) => {
    const entryId = req.params.id;
    const managerId = req.user.user_id;

    const checkSql = `SELECT * FROM daily_business_entries WHERE id = ?`;
    
    db.query(checkSql, [entryId], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        if (results.length === 0) return res.status(404).json({ message: "Entry not found" });

        // Admins could potentially delete any, but for now we enforce manager ownership
        if (req.user.role !== 'ADMIN' && results[0].manager_id != managerId) {
            return res.status(403).json({ message: "Not authorized to delete this entry" });
        }

        const deleteItemsSql = `DELETE FROM daily_business_items WHERE entry_id = ?`;
        db.query(deleteItemsSql, [entryId], (err2) => {
            if (err2) return res.status(500).json({ error: err2 });

            const deleteEntrySql = `DELETE FROM daily_business_entries WHERE id = ?`;
            db.query(deleteEntrySql, [entryId], (err3) => {
                if (err3) return res.status(500).json({ error: err3 });
                res.json({ success: true, message: "Entry deleted successfully" });
            });
        });
    });
};

// 5. ADMIN: Get All Branches Summary by Date
exports.getAllBranchesSummary = (req, res) => {
    const { date } = req.query;
    const today = date || new Date().toISOString().split('T')[0];

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
        LEFT JOIN daily_business_entries e ON b.branch_id = e.branch_id AND e.entry_date = ? AND (e.status = 'submitted' OR e.status = 'SUBMITTED')
        GROUP BY b.branch_id, b.branch_code, b.branch_name, b.branch_district
        ORDER BY b.branch_name ASC
    `;

    db.query(sql, [today], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        
        const grandTotal = results.reduce((sum, b) => sum + Number(b.totalAmount), 0);
        
        res.json({
            success: true,
            date: today,
            branches: results,
            totalBranches: results.length,
            grandTotal: grandTotal
        });
    });
};

// 5. ADMIN: Get Branch Details
exports.getBranchDetails = (req, res) => {
    const branchId = req.params.id;
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ message: "Date is required" });
    }

    const sql = `
        SELECT e.*, i.id as item_id, i.sr_no, i.account_type, i.status as item_status, i.amount, i.remark, b.branch_name, u.name as manager_name
        FROM daily_business_entries e
        JOIN branches b ON e.branch_id = b.branch_id
        LEFT JOIN users u ON e.manager_id = u.user_id
        LEFT JOIN daily_business_items i ON e.id = i.entry_id
        WHERE e.branch_id = ? AND e.entry_date = ?
    `;

    db.query(sql, [branchId, date], (err, results) => {
        if (err) return res.status(500).json({ error: err });

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
            status: results[0].status,
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

// 6. MANAGER: Get History
exports.getHistory = (req, res) => {
    const managerId = req.user.user_id;
    
    // Simplification for MVP: getting last 10 entries for history
    const sql = `
        SELECT id, entry_date, total_amount, status, created_at
        FROM daily_business_entries
        WHERE manager_id = ?
        ORDER BY entry_date DESC
        LIMIT 10
    `;

    db.query(sql, [managerId], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
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
        if (err) return res.status(500).json({ error: err });
        
        // Detailed breakdown
        const breakdownSql = `
            SELECT account_type, COUNT(*) as count, SUM(amount) as amount
            FROM daily_business_items
            GROUP BY account_type
            ORDER BY count DESC
            LIMIT 10
        `;
        
        db.query(breakdownSql, [], (err2, breakdownResults) => {
            if (err2) return res.status(500).json({ error: err2 });
            
            res.json({
                overall: results[0] || { totalBusiness: 0, totalAccountsOpened: 0 },
                breakdown: breakdownResults
            });
        });
    });
};

// 8. ADMIN: Get Branch Submission History
exports.getBranchHistory = (req, res) => {
    const { branchId } = req.params;

    const sql = `
        SELECT id, entry_date, total_amount, status, created_at
        FROM daily_business_entries
        WHERE branch_id = ?
        ORDER BY entry_date DESC
        LIMIT 20
    `;

    db.query(sql, [branchId], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
};
