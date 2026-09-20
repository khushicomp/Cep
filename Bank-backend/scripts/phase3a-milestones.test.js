// Isolated transaction/route tests. Never connect to the development database.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, httpHarness } = require('./helpers/report-fixture');
const { ReportError } = require('../services/business-report.service');
const manager = { user_id: 9, branch_id: 5, role: 'MANAGER' };
const headOffice = { user_id: 40, branch_id: 1, role: 'HEAD_OFFICE' };
const item = { srNo: 1, accountType: 'Savings Account (SB)', status: 'Opened', amount: '0.00', remark: '' };
const input = extra => ({ date: '2026-09-19', status: 'SUBMITTED', entries: [item], ...extra });
const conflict = promise => assert.rejects(promise, e => e instanceof ReportError && e.status === 409);
const route = '/entry/:id/final-lock';
function auditMatches(f, { entryId = 1, branchId = 5, actor = headOffice, action = 'FINAL_LOCK', previous = 'SUBMITTED', next = 'FINAL_LOCKED' } = {}) {
    const audits = f.state().audits;
    assert.equal(audits.length, 1);
    assert.deepEqual(audits[0], { id: 1, entry_id: entryId, branch_id: branchId, action,
        actor_id: actor.user_id, actor_role: actor.role, actor_name: `Database User ${actor.user_id}`,
        previous_state: { status: previous }, new_state: { status: next } });
    const insert = f.events.find(e => e.sql?.startsWith('INSERT INTO daily_business_audit_logs'));
    assert.ok(insert);
    assert.match(insert.sql, /actor_name, previous_state, new_state/);
    assert.equal(f.events.filter(e => e.sql?.startsWith('INSERT INTO daily_business_audit_logs')).length, 1);
}
for (const status of ['SUBMITTED', 'submitted', ' submitted ']) {
    test(`Head Office final-locks ${JSON.stringify(status)} across branches and returns canonical state`, async () => {
        const f = fixture({ status }); const before = f.state();
        const result = await f.service.finalLock(headOffice, 1);
        assert.deepEqual(result, { entryId: 1, status: 'FINAL_LOCKED' });
        assert.equal(f.state().headers[0].status, 'FINAL_LOCKED');
        assert.equal(f.state().headers[0].total_amount, before.headers[0].total_amount);
        assert.deepEqual(f.state().items, before.items);
        assert.deepEqual(f.state().headers[1], before.headers[1]);
        auditMatches(f);
        const sql = f.events.filter(e => e.sql);
        assert.match(sql[0].sql, /WHERE id = \? FOR UPDATE$/);
        assert.doesNotMatch(sql[0].sql, /branch_id =/);
        assert.equal(new Set(sql.map(e => e.connection)).size, 1);
        assert.ok(sql.every(e => e.connection !== null));
        assert.ok(f.events.findIndex(e => e.action === 'begin') < f.events.findIndex(e => e.sql));
        assert.ok(f.events.findIndex(e => e.sql?.startsWith('UPDATE')) < f.events.findIndex(e => e.sql?.startsWith('INSERT INTO daily_business_audit_logs')));
        assert.equal(f.events.at(-2).action, 'commit');
        assert.equal(f.events.at(-1).action, 'release');
    });
}
for (const role of ['MANAGER', 'EMPLOYEE', 'ADMIN']) {
    test(`${role} cannot final-lock through service or real authenticated route`, async () => {
        const f = fixture({ status: 'SUBMITTED' }); const user = { ...headOffice, role };
        await assert.rejects(f.service.finalLock(user, 1), e => e.status === 403);
        assert.equal((await httpHarness(f)('post', route, user)).status, 403);
        assert.equal(f.events.length, 0);
    });
}
test('unauthenticated final-lock request is denied without any database operation', async () => {
    const f = fixture({ status: 'SUBMITTED' });
    assert.equal((await httpHarness(f)('post', route, null)).status, 403);
    assert.equal(f.events.length, 0);
});
test('malformed report IDs/body return 400 without updates or audits', async () => {
    for (const reportId of ['abc', '1 OR 1=1', '0', '-1', '1.5']) {
        const f = fixture({ status: 'SUBMITTED' });
        const response = await httpHarness(f)('post', route, headOffice, { params: { id: reportId } });
        assert.equal(response.status, 400); assert.equal(f.events.length, 0);
    }
    assert.equal((await httpHarness(fixture())('post', route, headOffice, { body: [] })).status, 400);
});
test('nonexistent report returns 404 and releases its rolled-back transaction', async () => {
    const f = fixture({ status: 'SUBMITTED' });
    assert.equal((await httpHarness(f)('post', route, headOffice, { params: { id: '999' } })).status, 404);
    assert.equal(f.state().audits.length, 0);
    assert.equal(f.events.at(-2).action, 'rollback'); assert.equal(f.events.at(-1).action, 'release');
});
for (const status of ['DRAFT', 'draft', 'FINAL_LOCKED', 'final_locked', 'unknown', '', null]) {
    test(`final-lock rejects stored ${JSON.stringify(status)} with 409 and no milestone`, async () => {
        const f = fixture({ status }); const before = f.state();
        assert.equal((await httpHarness(f)('post', route, headOffice)).status, 409);
        assert.deepEqual(f.state(), before);
        assert.equal(f.events.filter(e => /^(UPDATE|INSERT)/.test(e.sql)).length, 0);
        assert.equal(f.events.at(-1).action, 'release');
    });
}
test('client actor, branch, role and state fields cannot influence final-lock authority or audit metadata', async () => {
    const f = fixture({ secondStatus: 'submitted' });
    const response = await httpHarness(f)('post', route, headOffice, {
        params: { id: '2' }, query: { branch_id: 999, actor_id: 999 }, body: {
            actor_id: 999, user_id: 999, actor_name: 'Forged', actor_role: 'ADMIN', branch_id: 999,
            manager_id: 999, previous_state: 'DRAFT', new_state: 'DRAFT', status: 'DRAFT',
            reason: 'untrusted reason', password: 'never-record-this', token: 'never-record-this'
        }
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.status, 'FINAL_LOCKED');
    auditMatches(f, { entryId: 2, branchId: 8 });
    assert.doesNotMatch(JSON.stringify(f.state().audits), /Forged|999|never-record|untrusted/);
});
for (const failQuery of ['UPDATE daily_business_entries SET status', 'INSERT INTO daily_business_audit_logs']) {
    test(`failure at ${failQuery} rolls back state and audit together`, async () => {
        const f = fixture({ status: 'SUBMITTED', failQuery }); const before = f.state();
        const response = await httpHarness(f)('post', route, headOffice);
        assert.equal(response.status, 500);
        assert.doesNotMatch(JSON.stringify(response.data), /private|SQL|ER_TEST/);
        assert.deepEqual(f.state(), before);
        if (failQuery.startsWith('UPDATE')) assert.equal(f.events.some(e => e.sql?.startsWith('INSERT INTO daily_business_audit_logs')), false);
        assert.equal(f.events.at(-2).action, 'rollback'); assert.equal(f.events.at(-1).action, 'release');
    });
}
test('failed final-lock commit rolls back an inserted audit and state change', async () => {
    const f = fixture({ status: 'SUBMITTED', commitFailure: true }); const before = f.state();
    await assert.rejects(f.service.finalLock(headOffice, 1));
    assert.ok(f.events.some(e => e.sql?.startsWith('INSERT INTO daily_business_audit_logs')));
    assert.deepEqual(f.state(), before); assert.equal(f.events.at(-1).action, 'release');
});
test('repeated final-lock conflicts without a second audit or state update', async () => {
    const f = fixture({ status: 'submitted' });
    await f.service.finalLock(headOffice, 1); const before = f.state();
    await conflict(f.service.finalLock(headOffice, 1));
    assert.deepEqual(f.state(), before); auditMatches(f);
    assert.equal(f.events.filter(e => e.sql?.startsWith('UPDATE')).length, 1);
});
for (const status of ['DRAFT', 'draft']) {
    test(`explicit submit from ${status} logs one canonical SUBMIT for authenticated manager`, async () => {
        const f = fixture({ status });
        const response = await httpHarness(f)('post', '/entry/:id/submit', manager, {
            body: { actor_id: 999, branch_id: 8, manager_id: 999, actor_name: 'Forged', totalAmount: 12345 }
        });
        assert.equal(response.status, 200); assert.equal(response.data.totalAmount, '10.25');
        auditMatches(f, { actor: manager, action: 'SUBMIT', previous: 'DRAFT', next: 'SUBMITTED' });
        assert.equal(new Set(f.events.filter(e => e.sql).map(e => e.connection)).size, 1);
        const before = f.state();
        await conflict(f.service.submit(manager, 1)); assert.deepEqual(f.state(), before);
        auditMatches(f, { actor: manager, action: 'SUBMIT', previous: 'DRAFT', next: 'SUBMITTED' });
    });
}
for (const operation of ['create', 'update']) {
    test(`${operation} save-and-submit logs exactly one milestone and ignores forged actor fields`, async () => {
        const f = fixture();
        const payload = input({ date: operation === 'create' ? '2026-09-20' : '2026-09-19', actor_id: 999, actor_name: 'Forged', manager_id: 999 });
        const result = operation === 'create' ? await f.service.create(manager, payload) : await f.service.update(manager, 1, payload);
        assert.equal(result.status, 'SUBMITTED');
        auditMatches(f, { entryId: operation === 'create' ? 3 : 1, actor: manager, action: 'SUBMIT', previous: 'DRAFT', next: 'SUBMITTED' });
        const before = f.state();
        if (operation === 'create') await assert.rejects(f.service.create(manager, payload), { code: 'ER_DUP_ENTRY' });
        else await conflict(f.service.update(manager, 1, payload));
        assert.deepEqual(f.state(), before);
    });
    test(`${operation} draft save creates no milestone`, async () => {
        const f = fixture(); const payload = input({ status: 'DRAFT', date: operation === 'create' ? '2026-09-20' : '2026-09-19' });
        if (operation === 'create') await f.service.create(manager, payload); else await f.service.update(manager, 1, payload);
        assert.equal(f.state().audits.length, 0);
        assert.equal(f.events.some(e => e.sql?.startsWith('INSERT INTO daily_business_audit_logs')), false);
    });
    test(`${operation} spoofed branch or invalid submitted data causes no audit`, async () => {
        for (const extra of [{ branch_id: 8 }, { branchId: 8 }, { entries: [] }]) {
            const f = fixture(); const before = f.state();
            const payload = input({ date: operation === 'create' ? '2026-09-20' : '2026-09-19', ...extra });
            await assert.rejects(operation === 'create' ? f.service.create(manager, payload) : f.service.update(manager, 1, payload));
            assert.deepEqual(f.state(), before);
            assert.equal(f.events.some(e => e.sql?.startsWith('INSERT INTO daily_business_audit_logs')), false);
        }
    });
}
for (const operation of ['create', 'update', 'submit']) {
    for (const fault of ['audit', 'commit', 'update']) {
        test(`${operation} submission ${fault} failure leaves neither report changes nor milestone`, async () => {
            const options = fault === 'commit' ? { commitFailure: true } : { failQuery: fault === 'audit' ? 'INSERT INTO daily_business_audit_logs' : 'UPDATE daily_business_entries' };
            const f = fixture(options); const before = f.state();
            const promise = operation === 'create' ? f.service.create(manager, input({ date: '2026-09-20' })) : f.service[operation](manager, 1, input());
            await assert.rejects(promise); assert.deepEqual(f.state(), before);
            if (fault === 'commit') assert.ok(f.events.some(e => e.sql?.startsWith('INSERT INTO daily_business_audit_logs')));
            if (fault === 'update') assert.equal(f.events.some(e => e.sql?.startsWith('INSERT INTO daily_business_audit_logs')), false);
            assert.equal(f.events.at(-2).action, 'rollback'); assert.equal(f.events.at(-1).action, 'release');
        });
    }
}
test('invalid persisted item on explicit submission produces no milestone', async () => {
    const f = fixture();
    const promisePool = f.pool.promise();
    const acquire = promisePool.getConnection;
    promisePool.getConnection = async () => {
        const c = await acquire(); const query = c.query;
        c.query = async (sql, values) => sql.includes('SELECT sr_no AS srNo') ? [[{ ...item, amount: 'invalid' }]] : query(sql, values);
        return c;
    };
    await assert.rejects(f.service.submit(manager, 1), e => e.status === 400);
    assert.equal(f.state().audits.length, 0); assert.equal(f.state().headers[0].status, 'draft');
});
test('cross-branch manager submit and unauthorized central submit cannot create milestones', async () => {
    const f = fixture();
    await assert.rejects(f.service.submit(manager, 2), e => e.status === 404);
    await assert.rejects(f.service.submit(headOffice, 1), e => e.status === 403);
    assert.equal(f.state().audits.length, 0);
});
test('actor name is authoritative; nullable database name has a non-null identity fallback', async () => {
    const f = fixture({ status: 'SUBMITTED', nullActorName: true });
    await f.service.finalLock({ ...headOffice, name: 'Forged token name' }, 1);
    assert.equal(f.state().audits[0].actor_name, 'User #40');
});
test('missing audit actor rolls back rather than inventing an actor or orphaned audit', async () => {
    const f = fixture({ status: 'SUBMITTED', missingActor: true }); const before = f.state();
    await assert.rejects(f.service.finalLock(headOffice, 1)); assert.deepEqual(f.state(), before);
    assert.equal(f.events.at(-1).action, 'release');
});
for (const operation of ['update', 'remove', 'submit']) {
    test(`final-locked report remains immutable to manager ${operation}, with milestone unchanged`, async () => {
        const f = fixture({ status: 'submitted' });
        await f.service.finalLock(headOffice, 1); const before = f.state();
        await conflict(f.service[operation](manager, 1, input({ status: 'DRAFT' })));
        assert.deepEqual(f.state(), before);
    });
}
test('Head Office central reads still return the newly locked state', async () => {
    const f = fixture({ status: 'submitted' }); await f.service.finalLock(headOffice, 1);
    const res = await httpHarness(f)('get', '/entry/:id', headOffice);
    assert.equal(res.status, 200); assert.equal(res.data.status, 'FINAL_LOCKED');
});
