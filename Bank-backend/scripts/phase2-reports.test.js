// All database access is an in-memory stub; this file never imports config/db.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rules = require('../services/business-report.service');
const { createReportService, itemsData, calendarDate, businessToday } = rules;
const manager = { user_id: 9, branch_id: 5, role: 'MANAGER' };
const item = (amount = '10.25') => ({ srNo: 1, accountType: 'Savings Account (SB)', status: 'Opened', amount, remark: '' });
const body = (extra = {}) => ({ date: '2026-09-19', entries: [item()], status: 'DRAFT', ...extra });
const reject = (promise, status) => assert.rejects(promise, e => e instanceof rules.ReportError && e.status === status);

function fixture(options = {}) {
    let state = { headers: [
        { id: 1, branch_id: 5, manager_id: 77, entry_date: '2026-09-19', status: Object.hasOwn(options, 'status') ? options.status : 'draft', total_amount: '999.00' },
        { id: 2, branch_id: 8, manager_id: 9, entry_date: '2026-09-19', status: 'DRAFT', total_amount: '999.00' }
    ], items: [{ ...item(), id: 11, entry_id: 1 }, { ...item(), id: 22, entry_id: 2 }], audits: options.audit ? [{ id: 1, entry_id: 1 }] : [] };
    const events = [];
    let connections = 0;
    const clone = data => structuredClone(data);
    async function run(sql, values = [], tx = null) {
        sql = sql.replace(/\s+/g, ' ').trim();
        events.push({ sql, values: clone(values), connection: tx?.number ?? null });
        if (options.failQuery && sql.includes(options.failQuery)) throw Object.assign(new Error('private SQL error'), { code: options.failCode || 'ER_TEST' });
        const data = tx ? tx.data : state;
        if (/^(INSERT|UPDATE|DELETE)/.test(sql)) assert.ok(tx?.active, 'every write must use an active dedicated transaction');
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
            events.push({ action: 'acquire', connection: tx.number });
            return {
                async beginTransaction() { events.push({ action: 'begin', connection: tx.number }); if (options.beginFailure) throw new Error('begin failed'); tx.active = true; },
                async query(sql, values) { return [await run(sql, values, tx)]; },
                async commit() { events.push({ action: 'commit', connection: tx.number }); if (options.commitFailure) throw new Error('commit failed'); state = tx.data; tx.active = false; },
                async rollback() { events.push({ action: 'rollback', connection: tx.number }); if (options.rollbackFailure) throw new Error('rollback failed'); tx.active = false; },
                release() { events.push({ action: 'release', connection: tx.number }); },
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

test('manager reads own branch report created by a previous manager; status/date normalized', async () => {
    const { service } = fixture();
    const report = await service.read(manager, { entryId: 1 });
    assert.equal(report.manager_id, 77);
    assert.equal(report.status, 'DRAFT');
    assert.equal(report.entry_date, '2026-09-19');
});
test('changing entry ID cannot expose another branch, even for the same manager_id', async () => {
    await reject(fixture().service.read(manager, { entryId: 2 }), 404);
});
for (const operation of ['update', 'remove', 'submit']) {
    test(`manager cannot ${operation} another branch report`, async () => {
        const f = fixture();
        await reject(f.service[operation](manager, 2, body()), 404);
        assert.equal(f.events.some(e => /^(INSERT|UPDATE|DELETE)/.test(e.sql)), false);
        assert.ok(f.events.some(e => e.action === 'rollback'));
        assert.equal(f.events.at(-1).action, 'release');
    });
}
for (const status of ['submitted', 'SUBMITTED', 'FINAL_LOCKED', 'final_locked', 'unknown', null]) {
    for (const operation of ['update', 'remove', 'submit']) {
        test(`${operation} rejects stored ${String(status)} and cannot downgrade through body status`, async () => {
            const f = fixture({ status });
            await reject(f.service[operation](manager, 1, body({ status: 'DRAFT' })), 409);
            assert.equal(f.events.some(e => /^(INSERT|UPDATE|DELETE)/.test(e.sql)), false);
        });
    }
}
test('manager edits DRAFT with exact recalculated totals, ignoring all client aggregates', async () => {
    const f = fixture();
    const result = await f.service.update(manager, 1, body({ totalAmount: '9999999', total_entries: 999,
        entries: [item('0.10'), { ...item('0.20'), srNo: 2 }, { ...item(0), srNo: 3 }] }));
    assert.equal(result.totalAmount, '0.30');
    assert.equal(result.totalEntries, 3);
    assert.equal(f.state().headers[0].total_amount, '0.30');
    assert.equal(f.state().items.filter(i => i.entry_id === 1).length, 3);
    assert.equal(new Set(f.events.filter(e => e.sql).map(e => e.connection)).size, 1);
    assert.equal(f.events.at(-1).action, 'release');
});
test('manager deletes DRAFT header and items in one transaction', async () => {
    const f = fixture(); await f.service.remove(manager, 1);
    assert.equal(f.state().headers.some(e => e.id === 1), false);
    assert.equal(f.state().items.some(e => e.entry_id === 1), false);
    assert.equal(f.state().headers[0].branch_id, 8);
});
test('audited draft cannot cascade-delete history before the migration', async () => {
    const f = fixture({ audit: true }); const before = f.state();
    await reject(f.service.remove(manager, 1), 409); assert.deepEqual(f.state(), before);
});
test('explicit submission recalculates persisted items, then repeated submission conflicts', async () => {
    const f = fixture();
    const result = await f.service.submit(manager, 1, { totalAmount: 999, entries: [item('999')] });
    assert.equal(result.totalAmount, '10.25');
    assert.equal(result.status, 'SUBMITTED');
    const before = f.state();
    await reject(f.service.submit(manager, 1), 409); assert.deepEqual(f.state(), before);
    await reject(f.service.update(manager, 1, body({ status: 'DRAFT' })), 409);
});
test('create derives branch and manager, ignoring fabricated manager ID and totals', async () => {
    const f = fixture();
    const result = await f.service.create(manager, body({ date: '2026-09-20', manager_id: 999, totalAmount: 999 }));
    assert.equal(result.status, 'DRAFT'); assert.equal(result.totalAmount, '10.25');
    const row = f.state().headers.find(e => e.id === 3);
    assert.equal(row.branch_id, 5); assert.equal(row.manager_id, 9);
});
test('create rejects forged branch identity in both supported spellings before SQL', async () => {
    for (const field of ['branch_id', 'branchId']) {
        const f = fixture(); await reject(f.service.create(manager, body({ [field]: 8 })), 403);
        assert.deepEqual(f.events, []);
    }
});
test('create-and-submit and update-and-submit preserve valid atomic UI transitions', async () => {
    for (const operation of ['create', 'update']) {
        const f = fixture();
        const input = body({ date: '2026-09-20', status: 'submitted', totalAmount: 999 });
        if (operation === 'update') input.date = '2026-09-19';
        const result = operation === 'create' ? await f.service.create(manager, input) : await f.service.update(manager, 1, input);
        assert.equal(result.status, 'SUBMITTED');
        assert.equal(result.totalAmount, '10.25');
        assert.equal(f.events.filter(e => e.action === 'commit').length, 1);
    }
});
test('forged initial/target statuses and moved dates are rejected', async () => {
    for (const status of ['FINAL_LOCKED', 'APPROVED', '', null, {}]) {
        await reject(fixture().service.create(manager, body({ status })), 400);
        await reject(fixture().service.update(manager, 1, body({ status })), 400);
    }
    await reject(fixture().service.update(manager, 1, body({ date: '2026-09-20' })), 400);
});
test('one branch/date report enforced by existing unique index and transaction rollback', async () => {
    const f = fixture(); const before = f.state();
    await assert.rejects(f.service.create(manager, body()), { code: 'ER_DUP_ENTRY' });
    assert.deepEqual(f.state(), before); assert.equal(f.events.at(-1).action, 'release');
});
test('history/date reads use branch rather than manager or can_view_all_branches claim', async () => {
    const f = fixture(); const user = { ...manager, can_view_all_branches: true };
    assert.equal((await f.service.history(user)).length, 1);
    assert.equal((await f.service.read(user, { date: '2026-09-19', branch_id: 8 })).branch_id, 5);
    assert.ok(f.events.every(e => e.sql.includes('branch_id = ?') && e.values[0] === 5));
});
test('HEAD_OFFICE and legacy ADMIN read across branches but cannot mutate', async () => {
    for (const role of ['HEAD_OFFICE', 'ADMIN']) {
        const f = fixture(); const user = { ...manager, role };
        assert.equal((await f.service.read(user, { entryId: 2 })).branch_id, 8);
        await reject(f.service.create(user, body()), 403);
        for (const op of ['update', 'remove', 'submit']) await reject(f.service[op](user, 1, body()), 403);
    }
});
for (const [operation, failQuery] of [['create', 'INSERT INTO daily_business_items'], ['update', 'INSERT INTO daily_business_items'],
    ['remove', 'DELETE FROM daily_business_entries'], ['submit', 'UPDATE daily_business_entries']]) {
    test(`${operation} rolls back an injected multi-step failure and releases its connection`, async () => {
        const f = fixture({ failQuery }); const before = f.state();
        const promise = operation === 'create' ? f.service.create(manager, body({ date: '2026-09-20' })) : f.service[operation](manager, 1, body());
        await assert.rejects(promise); assert.deepEqual(f.state(), before);
        assert.ok(f.events.some(e => e.action === 'rollback')); assert.equal(f.events.at(-1).action, 'release');
    });
}
test('commit/begin failures release connections; failed rollback destroys the connection', async () => {
    for (const options of [{ commitFailure: true }, { beginFailure: true }, { failQuery: 'INSERT INTO daily_business_items', rollbackFailure: true }]) {
        const f = fixture(options); const before = f.state();
        await assert.rejects(f.service.update(manager, 1, body())); assert.deepEqual(f.state(), before);
        assert.equal(f.events.at(-1).action, 'release');
        if (options.rollbackFailure) assert.ok(f.events.some(e => e.action === 'destroy'));
    }
});
test('valid zero and maximum decimals accepted; malformed amounts/overflow rejected', () => {
    assert.equal(itemsData([item(0)]).totalAmount, '0.00');
    assert.equal(itemsData([item('9999999999999.99')]).totalAmount, '9999999999999.99');
    for (const amount of ['', null, undefined, true, [], {}, NaN, Infinity, '1e2', '-1', '12abc', '0.001', '10000000000000']) {
        assert.throws(() => itemsData([{ ...item(), amount }]), rules.ReportError);
    }
    assert.throws(() => itemsData([item('9999999999999.99'), { ...item('0.01'), srNo: 2 }]), rules.ReportError);
});
test('item/date structure validation and India midnight boundaries', async () => {
    for (const entries of [[], null, [null], [{ ...item(), accountType: '' }], [{ ...item(), status: '' }], [{ ...item(), srNo: 0 }], [item(), item()]]) assert.throws(() => itemsData(entries), rules.ReportError);
    for (const date of ['2026-02-29', '2026-04-31', '2026-9-19', '2026-09-19T00:00:00Z', null]) assert.throws(() => calendarDate(date), rules.ReportError);
    assert.equal(calendarDate('2024-02-29'), '2024-02-29');
    const frontend = await import('../../frontend/src/utils/businessDate.js');
    for (const fn of [businessToday, frontend.businessToday]) {
        assert.equal(fn(new Date('2026-09-18T18:29:59Z')), '2026-09-18');
        assert.equal(fn(new Date('2026-09-18T18:30:00Z')), '2026-09-19');
    }
});

// Load real controllers/routes/middleware with the database replaced before import.
function httpHarness(f) {
    const controllerContext = { exports: {}, console: { error() {} }, require: name => {
        if (name === '../config/db') return f.pool;
        if (name === '../services/business-report.service') return rules;
        throw new Error('Unexpected controller import');
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/business.controller.js'), 'utf8'), controllerContext);
    const authContext = { exports: {}, process: { env: { JWT_SECRET: 'isolated-test-secret' } }, require };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../middleware/auth.middleware.js'), 'utf8'), authContext);
    const routerContext = { module: { exports: {} }, require: name => {
        if (name === 'express') return require('express');
        if (name.includes('business.controller')) return controllerContext.exports;
        if (name.includes('auth.middleware')) return authContext.exports;
        if (name.includes('role.middleware')) return require('../middleware/role.middleware');
        throw new Error('Unexpected route import');
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/business.routes.js'), 'utf8'), routerContext);
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
test('real route middleware permits central reads but rejects managers on every central route', async () => {
    for (const route of ['/all-branches', '/branch/:id', '/reports', '/branch-history/:branchId']) {
        const f = fixture(); const request = httpHarness(f);
        assert.equal((await request('get', route, manager, { query: { branch_id: 8, can_view_all_branches: true } })).status, 403);
        assert.equal(f.events.length, 0);
        assert.equal((await request('get', route, { ...manager, role: 'HEAD_OFFICE' }, { params: { id: '5', branchId: '8' } })).status, 200);
    }
});
test('authenticated route ignores request tenancy overrides and maps cross-branch access to 404', async () => {
    const request = httpHarness(fixture());
    const response = await request('get', '/entry/:id', manager, { params: { id: '2' }, body: { branch_id: 8, role: 'HEAD_OFFICE' }, query: { can_view_all_branches: true } });
    assert.equal(response.status, 404);
    assert.equal((await request('get', '/entry/:id', null)).status, 403);
    assert.equal((await request('get', '/entry/:id', { ...manager, role: 'EMPLOYEE' })).status, 403);
});
test('all mutation routes deny both central roles and legacy employees', async () => {
    for (const role of ['HEAD_OFFICE', 'ADMIN', 'EMPLOYEE']) {
        const f = fixture(); const request = httpHarness(f);
        for (const [method, route] of [['post', '/daily-entry'], ['put', '/entry/:id'], ['delete', '/entry/:id'], ['post', '/entry/:id/submit']]) {
            assert.equal((await request(method, route, { ...manager, role })).status, 403);
        }
        assert.equal(f.events.length, 0);
    }
});
test('HTTP duplicate errors are 409 and internal database errors never leak', async () => {
    const duplicate = await httpHarness(fixture())('post', '/daily-entry', manager);
    assert.equal(duplicate.status, 409);
    const failed = await httpHarness(fixture({ failQuery: 'UPDATE daily_business_entries' }))('put', '/entry/:id', manager);
    assert.equal(failed.status, 500); assert.doesNotMatch(JSON.stringify(failed.data), /private|SQL/);
});
