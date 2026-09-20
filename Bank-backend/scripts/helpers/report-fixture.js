// Shared isolated report fixture. Never imports config/db or opens a connection.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rules = require('../../services/business-report.service');
const { createReportService } = rules;
const item = (amount = '10.25') => ({ srNo: 1, accountType: 'Savings Account (SB)', status: 'Opened', amount, remark: '' });
const body = (extra = {}) => ({ date: '2026-09-19', entries: [item()], status: 'DRAFT', ...extra });
function fixture(options = {}) {
    let state = { headers: [
        { id: 1, branch_id: 5, manager_id: 77, entry_date: '2026-09-19', status: Object.hasOwn(options, 'status') ? options.status : 'draft', total_amount: '999.00' },
        { id: 2, branch_id: 8, manager_id: 9, entry_date: '2026-09-19', status: options.secondStatus || 'DRAFT', total_amount: '999.00' }
    ], items: [{ ...item(), id: 11, entry_id: 1 }, { ...item(), id: 22, entry_id: 2 }], audits: options.audit ? [{ id: 1, entry_id: 1 }] : [] };
    Object.assign(state.headers[0], { unlock_requested: options.pending ?? 0, unlock_reason: options.reason ?? null,
        submitted_at: options.submittedAt ?? null });
    const events = [];
    let connections = 0;
    let transactionQueue = Promise.resolve();
    const clone = data => structuredClone(data);
    async function run(sql, values = [], tx = null) {
        sql = sql.replace(/\s+/g, ' ').trim();
        events.push({ sql, values: clone(values), connection: tx?.number ?? null });
        if (options.failQuery && sql.includes(options.failQuery)) throw Object.assign(new Error('private SQL error'), { code: options.failCode || 'ER_TEST' });
        const data = tx ? tx.data : state;
        if (/^(INSERT|UPDATE|DELETE)/.test(sql)) assert.ok(tx?.active, 'every write must use an active dedicated transaction');
        if (sql === 'SELECT name FROM users WHERE user_id = ?') {
            return options.missingActor ? [] : [{ name: options.nullActorName ? null : `Database User ${values[0]}` }];
        }
        if (sql.startsWith('INSERT INTO daily_business_audit_logs')) {
            data.audits.push({ id: data.audits.length + 1, entry_id: values[0], branch_id: values[1], action: values[2],
                actor_id: values[3], actor_role: values[4], actor_name: values[5],
                previous_state: JSON.parse(values[6]), new_state: JSON.parse(values[7]), ...(values.length > 8 ? { reason: values[8] } : {}) });
            return { affectedRows: 1 };
        }
        if (sql.startsWith('SELECT id, branch_id, status') && sql.endsWith('FROM daily_business_entries WHERE id = ? FOR UPDATE')) {
            return clone(data.headers.filter(e => e.id === Number(values[0])));
        }
        if (sql.includes('FROM branches b JOIN users')) return [{ branch_code: 'B5', branch_name: 'Branch Five', manager_name: 'Current Manager' }];
        if (sql.startsWith('SELECT') && sql.includes('FROM daily_business_entries WHERE id = ? AND branch_id = ?')) {
            assert.match(sql, /FOR UPDATE$/);
            return clone(data.headers.filter(e => e.id === Number(values[0]) && e.branch_id === values[1]));
        }
        if (sql.startsWith('SELECT') && sql.includes('LEFT JOIN daily_business_items i ON e.id = i.entry_id')) {
            let headers = data.headers;
            if (sql.includes('WHERE e.branch_id = ?')) headers = headers.filter(e => e.branch_id === values[0]);
            if (sql.includes('e.id = ?')) headers = headers.filter(e => e.id === Number(values.at(-1)));
            if (sql.includes('e.entry_date = ?')) headers = headers.filter(e => e.entry_date === values.at(-1));
            return headers.flatMap(e => data.items.filter(i => i.entry_id === e.id).map(i => ({ ...e, item_id: i.id,
                sr_no: i.srNo, account_type: i.accountType, item_status: i.status, amount: i.amount, remark: i.remark })));
        }
        if (sql.startsWith('SELECT id, DATE_FORMAT')) return clone(data.headers.filter(e => e.branch_id === values[0]));
        if (sql.includes('FROM daily_business_audit_logs')) return clone(data.audits.filter(a => a.entry_id === values[0]));
        if (sql.startsWith('SELECT') && sql.includes('FROM daily_business_items WHERE entry_id')) return clone(data.items.filter(i => i.entry_id === values[0]));
        if (sql.startsWith('INSERT INTO daily_business_entries')) {
            if (data.headers.some(e => e.branch_id === values[0] && e.entry_date === values[5])) throw Object.assign(new Error('private duplicate SQL'), { code: 'ER_DUP_ENTRY' });
            data.headers.push({ id: 3, branch_id: values[0], manager_id: values[3], entry_date: values[5], total_amount: values[6], total_entries: values[7], status: values[8] });
            return { insertId: 3 };
        }
        if (sql.startsWith('INSERT INTO daily_business_items')) {
            data.items.push(...values[0].map((v, index) => ({ entry_id: v[0], srNo: v[1], accountType: v[2], status: v[3], amount: v[4], remark: v[5], id: 30 + index })));
            return { affectedRows: values[0].length };
        }
        if (sql === 'UPDATE daily_business_entries SET status = ? WHERE id = ? AND branch_id = ?') {
            const header = data.headers.find(e => e.id === values[1] && e.branch_id === values[2]);
            assert.ok(header);
            header.status = values[0];
            return { affectedRows: 1 };
        }
        if (sql.startsWith('UPDATE daily_business_entries SET status = ?, unlock_requested')) {
            const header = data.headers.find(e => e.id === values[3] && e.branch_id === values[4]);
            assert.ok(header);
            Object.assign(header, { status: values[0], unlock_requested: values[1], unlock_reason: values[2] });
            if (sql.includes('submitted_at = NULL')) header.submitted_at = null;
            return { affectedRows: 1 };
        }
        if (sql.startsWith('UPDATE daily_business_entries')) {
            assert.match(sql, /WHERE id = \? AND branch_id = \?/);
            const header = data.headers.find(e => e.id === Number(values[4]) && e.branch_id === values[5]);
            assert.ok(header);
            Object.assign(header, { total_amount: values[0], total_entries: values[1], status: values[2], submitted_at: values[3] });
            return { affectedRows: 1 };
        }
        if (sql.startsWith('DELETE FROM daily_business_items')) { data.items = data.items.filter(i => i.entry_id !== values[0]); return { affectedRows: 1 }; }
        if (sql.startsWith('DELETE FROM daily_business_entries')) {
            assert.match(sql, /AND branch_id = \?/);
            data.headers = data.headers.filter(e => !(e.id === values[0] && e.branch_id === values[1]));
            return { affectedRows: 1 };
        }
        if (sql.includes('FROM branches b LEFT JOIN daily_business_entries')) return [{ _id: 5, status: 'submitted', totalAmount: '10.25' }, { _id: 8, status: 'FINAL_LOCKED', totalAmount: '20.00' }];
        if (sql.includes('SUM(e.total_amount) as totalBusiness')) return [{ totalBusiness: '20.50' }];
        if (sql.includes('SELECT account_type, COUNT(*)')) return [];
        throw new Error('Unexpected mocked query: ' + sql);
    }
    const promisePool = {
        query: async (sql, values) => [await run(sql, values)],
        getConnection: async () => {
            if (options.acquireFailure) throw new Error('private connection error');
            const tx = { number: ++connections, data: clone(state), active: false };
            let releaseTurn;
            events.push({ action: 'acquire', connection: tx.number });
            return {
                async beginTransaction() {
                    if (options.serializeTransactions) {
                        const previous = transactionQueue;
                        transactionQueue = new Promise(resolve => { releaseTurn = resolve; });
                        await previous;
                        tx.data = clone(state);
                    }
                    events.push({ action: 'begin', connection: tx.number });
                    if (options.beginFailure) throw new Error('begin failed');
                    tx.active = true;
                },
                async query(sql, values) { return [await run(sql, values, tx)]; },
                async commit() { events.push({ action: 'commit', connection: tx.number }); if (options.commitFailure) throw new Error('commit failed'); state = tx.data; tx.active = false; },
                async rollback() { events.push({ action: 'rollback', connection: tx.number }); if (options.rollbackFailure) throw new Error('rollback failed'); tx.active = false; },
                release() { events.push({ action: 'release', connection: tx.number }); releaseTurn?.(); },
                destroy() { events.push({ action: 'destroy', connection: tx.number }); }
            };
        }
    };
    const pool = { promise: () => promisePool, query(sql, values, callback) {
        if (typeof values === 'function') { callback = values; values = []; }
        run(sql, values).then(rows => callback(null, rows), callback);
    } };
    return { pool, service: createReportService(pool), events, state: () => clone(state) };
}

// Load real controllers/routes/middleware with the database replaced before import.
function httpHarness(f) {
    const controllerContext = { exports: {}, console: { error() {} }, require: name => {
        if (name === '../config/db') return f.pool;
        if (name === '../services/business-report.service') return rules;
        throw new Error('Unexpected controller import');
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../controllers/business.controller.js'), 'utf8'), controllerContext);
    const authContext = { exports: {}, process: { env: { JWT_SECRET: 'isolated-test-secret' } }, require };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../middleware/auth.middleware.js'), 'utf8'), authContext);
    const routerContext = { module: { exports: {} }, require: name => {
        if (name === 'express') return require('express');
        if (name.includes('business.controller')) return controllerContext.exports;
        if (name.includes('auth.middleware')) return authContext.exports;
        if (name.includes('role.middleware')) return require('../../middleware/role.middleware');
        throw new Error('Unexpected route import');
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../routes/business.routes.js'), 'utf8'), routerContext);
    return async (method, routePath, user, overrides = {}) => {
        const token = user ? require('jsonwebtoken').sign(user, 'isolated-test-secret', { expiresIn: '1h' }) : null;
        const req = { headers: token ? { authorization: `Bearer ${token}` } : {}, params: { id: '1', branchId: '8' }, query: { date: '2026-09-19' }, body: body(), ...overrides };
        const router = routerContext.module.exports;
        const route = router.stack.find(l => l.route?.path === routePath && l.route.methods[method]);
        assert.ok(route, 'expected route registered');
        const handlers = [...router.stack.filter(l => !l.route).map(l => l.handle), ...route.route.stack.map(l => l.handle)];
        return new Promise((resolve, rejectPromise) => {
            const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(data) { resolve({ status: this.statusCode, data }); } };
            let index = 0;
            const next = error => { if (error) return rejectPromise(error); try { Promise.resolve(handlers[index++](req, res, next)).catch(rejectPromise); } catch (e) { rejectPromise(e); } };
            next();
        });
    };
}

module.exports = { fixture, httpHarness };
