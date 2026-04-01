const db = require("../config/db");

// 1. MANAGER: Create Daily Business Entry
exports.createDailyEntry = (req, res) => {
    const { branchId, branchName, date, entries, totalAmount, status } = req.body;
    const managerId = req.user.user_id;

    if (!branchId || !date || !entries || entries.length === 0) {
        return res.status(400).json({ message: "Missing required fields or empty entries" });
    }

    const insertEntrySql = `
        INSERT INTO daily_business_entries (branch_id, manager_id, entry_date, total_amount, status)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(insertEntrySql, [branchId, managerId, date, totalAmount, status || 'draft'], (err, entryResult) => {
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

    // Verify ownership
    const checkSql = `SELECT * FROM daily_business_entries WHERE id = ? AND manager_id = ?`;
    
    db.query(checkSql, [entryId, managerId], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        if (results.length === 0) return res.status(403).json({ message: "Unauthorized or entry not found" });

        const updateEntrySql = `UPDATE daily_business_entries SET total_amount = ?, status = ? WHERE id = ?`;
        
        db.query(updateEntrySql, [totalAmount, status, entryId], (err2) => {
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

// 4. ADMIN: Get All Branches Summary by Date
exports.getAllBranchesSummary = (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ message: "Date is required" });
    }

    const sql = `
        SELECT 
            b.branch_id, 
            MAX(b.branch_name) as branch_name, 
            MAX(u.name) as manager_name,
            COUNT(i.id) as total_entries,
            IFNULL(MAX(e.total_amount), 0) as total_amount,
            MAX(e.id) as entry_id,
            MAX(e.status) as status
        FROM branches b
        LEFT JOIN users u ON b.branch_id = u.branch_id AND u.role = 'MANAGER'
        LEFT JOIN daily_business_entries e ON b.branch_id = e.branch_id AND e.entry_date = ?
        LEFT JOIN daily_business_items i ON e.id = i.entry_id
        GROUP BY b.branch_id
    `;

    db.query(sql, [date], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
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
