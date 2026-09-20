// All database access is an in-memory stub; this file never imports config/db.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, httpHarness } = require('./helpers/report-fixture');
const rules = require('../services/business-report.service');
const { itemsData, calendarDate, businessToday } = rules;
const manager = { user_id: 9, branch_id: 5, role: 'MANAGER' };
const item = (amount = '10.25') => ({ srNo: 1, accountType: 'Savings Account (SB)', status: 'Opened', amount, remark: '' });
const body = (extra = {}) => ({ date: '2026-09-19', entries: [item()], status: 'DRAFT', ...extra });
const reject = (promise, status) => assert.rejects(promise, e => e instanceof rules.ReportError && e.status === status);

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
