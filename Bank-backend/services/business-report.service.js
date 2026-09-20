// Report-only rules. No connection is opened until a method is called.
const { insertMilestone } = require('./business-audit.service');
class ReportError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new ReportError(status, message); };
const normalizeStatus = value => typeof value === 'string' ? value.trim().toUpperCase() : '';
const centralRoles = ['ADMIN', 'HEAD_OFFICE'];
const pendingRequest = value => Number(value) === 1;
function correctionReason(value) {
    if (typeof value !== 'string' || !value.trim() || [...value.trim()].length > 1000) {
        fail(400, 'Provide a correction reason of 1 to 1000 characters');
    }
    return value.trim();
}
function id(value) {
    if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647) {
        fail(400, 'Invalid report or branch ID');
    }
    return Number(value);
}
function calendarDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400, 'Date must be YYYY-MM-DD');
    const [year, month, day] = value.split('-').map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1000 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) fail(400, 'Invalid calendar date');
    return value;
}
function businessToday(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = type => parts.find(p => p.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
}
const MAX_CENTS = 999999999999999n; // DECIMAL(15,2), including two fractional digits.
function money(value) {
    if (!['string', 'number'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) {
        fail(400, 'Item amount must be a decimal number');
    }
    const text = String(value).trim();
    if (!/^\d{1,13}(?:\.\d{1,2})?$/.test(text)) fail(400, 'Item amount must be non-negative with at most two decimal places');
    const [whole, fraction = ''] = text.split('.');
    const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    if (cents > MAX_CENTS) fail(400, 'Item amount exceeds the supported range');
    return cents;
}
const decimal = cents => `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
function itemsData(entries) {
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 1000) fail(400, 'Provide between 1 and 1000 report items');
    let total = 0n;
    const serials = new Set();
    const items = entries.map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) fail(400, 'Invalid item structure');
        const text = (value, max, label) => {
            if (typeof value !== 'string' || !value.trim() || [...value.trim()].length > max || value.trim() === 'Select...') {
                fail(400, `Invalid item ${label}`);
            }
            return value.trim();
        };
        const srNo = item.srNo === undefined ? index + 1 : id(item.srNo);
        if (serials.has(srNo)) fail(400, 'Item serial numbers must be unique');
        serials.add(srNo);
        const amount = money(item.amount);
        total += amount;
        if (total > MAX_CENTS) fail(400, 'Report total exceeds the supported range');
        const remark = item.remark == null ? '' : item.remark;
        if (typeof remark !== 'string' || Buffer.byteLength(remark, 'utf8') > 65535) fail(400, 'Invalid item remark');
        return { srNo, accountType: text(item.accountType, 100, 'account type'),
            status: text(item.status, 50, 'status'), amount: decimal(amount), remark };
    });
    return { items, totalAmount: decimal(total), totalEntries: items.length };
}
function manager(user, body = {}) {
    if (user?.role !== 'MANAGER') fail(403, 'Only managers may change branch reports');
    if (!user.branch_id || !user.user_id) fail(403, 'Authenticated branch context is required');
    const branch = id(user.branch_id);
    id(user.user_id);
    for (const field of ['branch_id', 'branchId']) {
        if (body[field] !== undefined && String(body[field]) !== String(branch)) fail(403, 'Report must belong to your authenticated branch');
    }
    return branch;
}
function targetStatus(value) {
    const status = value === undefined ? 'DRAFT' : normalizeStatus(value);
    if (!['DRAFT', 'SUBMITTED'].includes(status)) fail(400, 'Only DRAFT or SUBMITTED may be requested');
    return status;
}
function requireDraft(entry) {
    if (normalizeStatus(entry.status) !== 'DRAFT') fail(409, 'Only DRAFT reports may be changed');
}

function createReportService(pool) {
    const query = async (sql, values) => (await pool.promise().query(sql, values))[0];
    async function transaction(work) {
        const connection = await pool.promise().getConnection();
        let started = false;
        try {
            await connection.beginTransaction();
            started = true;
            const result = await work(connection);
            await connection.commit();
            return result;
        } catch (error) {
            if (started) {
                try { await connection.rollback(); }
                catch { connection.destroy(); } // A broken transaction must never reenter the pool.
            }
            throw error;
        } finally {
            connection.release();
        }
    }
    async function lockedDraft(c, entryId, branch) {
        const [rows] = await c.query(`SELECT *, DATE_FORMAT(entry_date, '%Y-%m-%d') AS entry_date
            FROM daily_business_entries WHERE id = ? AND branch_id = ? FOR UPDATE`, [id(entryId), branch]);
        if (!rows.length) fail(404, 'Report not found');
        requireDraft(rows[0]);
        return rows[0];
    }
    async function insertItems(c, entryId, items) {
        await c.query(`INSERT INTO daily_business_items (entry_id, sr_no, account_type, status, amount, remark) VALUES ?`,
            [items.map(i => [entryId, i.srNo, i.accountType, i.status, i.amount, i.remark])]);
    }
    async function writeHeader(c, entryId, branch, data, status) {
        await c.query(`UPDATE daily_business_entries SET total_amount = ?, total_entries = ?, status = ?,
            submitted_at = ? WHERE id = ? AND branch_id = ?`,
        [data.totalAmount, data.totalEntries, status, status === 'SUBMITTED' ? new Date() : null, entryId, branch]);
    }
    async function submitMilestone(c, entry, user, data) {
        await writeHeader(c, entry.id, entry.branch_id, data, 'SUBMITTED');
        await insertMilestone(c, { entryId: entry.id, branchId: entry.branch_id, actor: user,
            action: 'SUBMIT', previousStatus: normalizeStatus(entry.status), newStatus: 'SUBMITTED' });
    }
    function result(entryId, status, data) {
        return { entryId: Number(entryId), status, totalAmount: data.totalAmount, totalEntries: data.totalEntries };
    }
    async function correction(user, entryId, body, action) {
        const requesting = action === 'UNLOCK_REQUEST';
        const branch = requesting ? manager(user, body) : null;
        if (!requesting && user?.role !== 'HEAD_OFFICE') fail(403, 'Only Head Office may resolve correction requests');
        id(user.user_id);
        const reportId = id(entryId);
        const reason = action === 'UNLOCK_APPROVE' ? null : correctionReason(body.reason);
        return transaction(async c => {
            const [rows] = await c.query(`SELECT id, branch_id, status, unlock_requested, unlock_reason FROM daily_business_entries
                WHERE id = ?${requesting ? ' AND branch_id = ?' : ''} FOR UPDATE`, requesting ? [reportId, branch] : [reportId]);
            if (!rows.length) fail(404, 'Report not found');
            const entry = rows[0];
            const previousPending = pendingRequest(entry.unlock_requested) ? 1 : 0;
            if (normalizeStatus(entry.status) !== 'SUBMITTED' || previousPending !== (requesting ? 0 : 1)) {
                fail(409, requesting ? 'Only SUBMITTED reports without a pending request may request correction' : 'A SUBMITTED report with a pending request is required');
            }
            const status = action === 'UNLOCK_APPROVE' ? 'DRAFT' : 'SUBMITTED';
            const pending = requesting ? 1 : 0;
            await c.query(`UPDATE daily_business_entries SET status = ?, unlock_requested = ?, unlock_reason = ?${action === 'UNLOCK_APPROVE' ? ', submitted_at = NULL' : ''}
                WHERE id = ? AND branch_id = ?`, [status, pending, requesting ? reason : null, entry.id, entry.branch_id]);
            await insertMilestone(c, { entryId: entry.id, branchId: entry.branch_id, actor: user, action,
                previousStatus: 'SUBMITTED', newStatus: status, previousPending, newPending: pending,
                requestReason: entry.unlock_reason, reason: action === 'UNLOCK_APPROVE' ? entry.unlock_reason : reason });
            return { entryId: Number(entry.id), status, unlock_requested: pending, unlock_reason: requesting ? reason : null };
        });
    }
    return {
        async dailyOverview(user, selectedDate) {
            if (user?.role !== 'HEAD_OFFICE') fail(403, 'Only Head Office may view daily operations');
            const date = calendarDate(selectedDate === undefined ? businessToday() : selectedDate);
            // One header per branch/date is guaranteed by unique_branch_entry_date.
            // Keep date in the JOIN so branches without a report remain visible.
            const rows = await query(`SELECT b.branch_id, b.branch_code, b.branch_name, b.branch_district,
                e.id AS entry_id, e.status, e.unlock_requested, e.total_amount, e.total_entries,
                DATE_FORMAT(e.submitted_at, '%Y-%m-%d %H:%i:%s') AS submitted_at
                FROM branches b LEFT JOIN daily_business_entries e
                    ON e.branch_id = b.branch_id AND e.entry_date = ?
                WHERE b.is_active = 1 ORDER BY b.branch_name, b.branch_id`, [date]);
            const summary = { totalBranches: rows.length, notStarted: 0, draft: 0, submitted: 0,
                correctionPending: 0, finalLocked: 0, unknown: 0, reportedBranches: 0, totalAmount: '0.00', totalEntries: 0 };
            const buckets = { NOT_STARTED: 'notStarted', DRAFT: 'draft', SUBMITTED: 'submitted',
                CORRECTION_PENDING: 'correctionPending', FINAL_LOCKED: 'finalLocked', UNKNOWN: 'unknown' };
            let cents = 0n;
            const branches = rows.map(row => {
                const exists = row.entry_id != null;
                const status = exists ? normalizeStatus(row.status) : null;
                const pending = exists && pendingRequest(row.unlock_requested) ? 1 : 0;
                const displayStatus = !exists ? 'NOT_STARTED' : status === 'SUBMITTED' && pending ? 'CORRECTION_PENDING' :
                    ['DRAFT', 'SUBMITTED', 'FINAL_LOCKED'].includes(status) ? status : 'UNKNOWN';
                const amount = exists ? money(row.total_amount ?? '0') : 0n;
                const count = exists ? Number(row.total_entries ?? 0) : 0;
                if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid persisted report item count');
                summary[buckets[displayStatus]]++;
                if (exists) summary.reportedBranches++;
                summary.totalEntries += count;
                cents += amount;
                return { branch_id: row.branch_id, branch_code: row.branch_code, branch_name: row.branch_name,
                    branch_district: row.branch_district, entry_id: exists ? row.entry_id : null, date,
                    lifecycle_status: exists ? (['DRAFT', 'SUBMITTED', 'FINAL_LOCKED'].includes(status) ? status : 'UNKNOWN') : null,
                    display_status: displayStatus, unlock_requested: pending, total_amount: decimal(amount),
                    total_entries: count, submitted_at: exists ? row.submitted_at : null };
            });
            // Decimal strings preserve cents even when the all-branch sum exceeds JS safe integers.
            summary.totalAmount = decimal(cents);
            return { date, branches, summary };
        },
        requestUnlock: (user, entryId, body) => correction(user, entryId, body, 'UNLOCK_REQUEST'),
        approveUnlock: (user, entryId) => correction(user, entryId, {}, 'UNLOCK_APPROVE'),
        rejectUnlock: (user, entryId, body) => correction(user, entryId, body, 'UNLOCK_REJECT'),
        async create(user, body) {
            const branch = manager(user, body);
            const date = calendarDate(body.date ?? body.entry_date);
            if (body.entry_date !== undefined && body.date !== undefined && body.entry_date !== body.date) fail(400, 'Conflicting report dates');
            const status = targetStatus(body.status);
            const data = itemsData(body.entries);
            return transaction(async c => {
                // Names/codes are database metadata, never supplied by the client.
                const [metadata] = await c.query(`SELECT b.branch_code, b.branch_name, u.name AS manager_name
                    FROM branches b JOIN users u ON u.branch_id = b.branch_id
                    WHERE b.branch_id = ? AND u.user_id = ?`, [branch, id(user.user_id)]);
                if (!metadata.length) fail(403, 'Authenticated branch context is no longer valid');
                const m = metadata[0];
                const [header] = await c.query(`INSERT INTO daily_business_entries
                    (branch_id, branch_code, branch_name, manager_id, manager_name, entry_date, total_amount, total_entries, status, submitted_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [branch, m.branch_code, m.branch_name, id(user.user_id), m.manager_name, date, data.totalAmount, data.totalEntries, 'DRAFT', null]);
                await insertItems(c, header.insertId, data.items);
                // Preserve the existing create-and-submit UI, as one atomic transition.
                if (status === 'SUBMITTED') await submitMilestone(c, { id: header.insertId, branch_id: branch, status: 'DRAFT' }, user, data);
                return result(header.insertId, status, data);
            });
        },
        async update(user, entryId, body) {
            const branch = manager(user, body);
            return transaction(async c => {
                const entry = await lockedDraft(c, entryId, branch);
                for (const field of ['date', 'entry_date']) {
                    if (body[field] !== undefined && calendarDate(body[field]) !== entry.entry_date) fail(400, 'Report date cannot be changed');
                }
                const status = targetStatus(body.status);
                const data = itemsData(body.entries);
                await c.query('DELETE FROM daily_business_items WHERE entry_id = ?', [entry.id]);
                await insertItems(c, entry.id, data.items);
                if (status === 'SUBMITTED') await submitMilestone(c, entry, user, data);
                else await writeHeader(c, entry.id, branch, data, status);
                return result(entry.id, status, data);
            });
        },
        async remove(user, entryId) {
            const branch = manager(user);
            return transaction(async c => {
                const entry = await lockedDraft(c, entryId, branch);
                // Preserve the friendly refusal in addition to the restrictive audit FK.
                const [audit] = await c.query('SELECT id FROM daily_business_audit_logs WHERE entry_id = ? LIMIT 1 FOR UPDATE', [entry.id]);
                if (audit.length) fail(409, 'Reports with audit history cannot be deleted');
                await c.query('DELETE FROM daily_business_items WHERE entry_id = ?', [entry.id]);
                await c.query('DELETE FROM daily_business_entries WHERE id = ? AND branch_id = ?', [entry.id, branch]);
                return { success: true, message: 'Entry deleted successfully' };
            });
        },
        async submit(user, entryId) {
            const branch = manager(user);
            return transaction(async c => {
                const entry = await lockedDraft(c, entryId, branch);
                calendarDate(entry.entry_date);
                const [items] = await c.query(`SELECT sr_no AS srNo, account_type AS accountType, status, amount, remark
                    FROM daily_business_items WHERE entry_id = ? ORDER BY sr_no, id FOR UPDATE`, [entry.id]);
                const data = itemsData(items);
                await submitMilestone(c, entry, user, data);
                return result(entry.id, 'SUBMITTED', data);
            });
        },
        async finalLock(user, entryId) {
            if (user?.role !== 'HEAD_OFFICE') fail(403, 'Only Head Office may final-lock reports');
            id(user.user_id);
            const reportId = id(entryId);
            return transaction(async c => {
                const [rows] = await c.query(`SELECT id, branch_id, status, unlock_requested FROM daily_business_entries
                    WHERE id = ? FOR UPDATE`, [reportId]);
                if (!rows.length) fail(404, 'Report not found');
                const entry = rows[0];
                const previousStatus = normalizeStatus(entry.status);
                if (previousStatus !== 'SUBMITTED') fail(409, 'Only SUBMITTED reports may be final-locked');
                if (pendingRequest(entry.unlock_requested)) fail(409, 'Resolve the pending correction request before final locking');
                await c.query('UPDATE daily_business_entries SET status = ? WHERE id = ? AND branch_id = ?',
                    ['FINAL_LOCKED', entry.id, entry.branch_id]);
                await insertMilestone(c, { entryId: entry.id, branchId: entry.branch_id, actor: user,
                    action: 'FINAL_LOCK', previousStatus, newStatus: 'FINAL_LOCKED' });
                return { entryId: Number(entry.id), status: 'FINAL_LOCKED' };
            });
        },
        async read(user, { entryId, date }) {
            const central = centralRoles.includes(user?.role);
            const branch = central ? null : manager(user);
            const values = [];
            const where = [];
            if (!central) { where.push('e.branch_id = ?'); values.push(branch); }
            if (entryId !== undefined) { where.push('e.id = ?'); values.push(id(entryId)); }
            else { where.push('e.entry_date = ?'); values.push(calendarDate(date)); }
            const rows = await query(`SELECT e.*, DATE_FORMAT(e.entry_date, '%Y-%m-%d') AS entry_date,
                i.id AS item_id, i.sr_no, i.account_type, i.status AS item_status, i.amount, i.remark
                FROM daily_business_entries e LEFT JOIN daily_business_items i ON e.id = i.entry_id
                WHERE ${where.join(' AND ')} ORDER BY i.sr_no, i.id`, values);
            if (!rows.length) {
                if (entryId !== undefined) fail(404, 'Report not found');
                return null;
            }
            const first = rows[0];
            return { id: first.id, branch_id: first.branch_id, manager_id: first.manager_id,
                entry_date: first.entry_date, total_amount: first.total_amount, status: normalizeStatus(first.status),
                unlock_requested: pendingRequest(first.unlock_requested) ? 1 : 0,
                unlock_reason: pendingRequest(first.unlock_requested) ? first.unlock_reason : null,
                entries: rows.filter(r => r.item_id != null).map(r => ({ id: r.item_id, srNo: r.sr_no,
                    accountType: r.account_type, status: r.item_status, amount: r.amount, remark: r.remark })) };
        },
        async history(user) {
            const branch = manager(user);
            const rows = await query(`SELECT id, DATE_FORMAT(entry_date, '%Y-%m-%d') AS entry_date, total_amount, status, created_at
                FROM daily_business_entries WHERE branch_id = ? ORDER BY entry_date DESC LIMIT 10`, [branch]);
            return rows.map(row => ({ ...row, status: normalizeStatus(row.status) }));
        }
    };
}
module.exports = { createReportService, ReportError, normalizeStatus, calendarDate, businessToday, itemsData, id };
