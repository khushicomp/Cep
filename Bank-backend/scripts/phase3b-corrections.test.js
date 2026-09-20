// Isolated tests only: no config/db import, environment credentials, or live connections.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, httpHarness } = require('./helpers/report-fixture');
const manager = { user_id: 9, branch_id: 5, role: 'MANAGER' };
const ho = { user_id: 40, branch_id: 1, role: 'HEAD_OFFICE' };
const note = { reason: '  Correct the account classification  ' };
const originalReason = note.reason.trim();
const timestamp = '2026-09-19 12:30:00';
const item = { srNo: 1, accountType: 'Savings', status: 'Opened', amount: '12.50', remark: '' };
const input = { date: '2026-09-19', status: 'DRAFT', entries: [item] };
const operations = [
    { method: 'requestUnlock', route: 'unlock-request', actor: manager, action: 'UNLOCK_REQUEST', pending: 0 },
    { method: 'approveUnlock', route: 'unlock-approve', actor: ho, action: 'UNLOCK_APPROVE', pending: 1 },
    { method: 'rejectUnlock', route: 'unlock-reject', actor: ho, action: 'UNLOCK_REJECT', pending: 1 }
];
const reject = (promise, status) => assert.rejects(promise, e => e.status === status);
const setup = (op, extra = {}) => fixture({ status: 'SUBMITTED', pending: op.pending, reason: op.pending ? originalReason : null, submittedAt: timestamp, ...extra });

for (const op of operations) {
    test(`${op.action}: valid transition, authenticated actor, minimal audit and same-connection transaction`, async () => {
        const f = setup(op); const before = f.state();
        const response = await httpHarness(f)('post', `/entry/:id/${op.route}`, op.actor, { body: {
            ...note, actor_id: 999, manager_id: 999, actor_role: 'ADMIN', actor_name: 'Forged', status: 'FINAL_LOCKED', secret: 'not-to-store'
        } });
        assert.equal(response.status, 200);
        const after = f.state(); const entry = after.headers[0]; const audit = after.audits[0];
        const approved = op.method === 'approveUnlock'; const requested = op.pending === 0;
        assert.equal(entry.status, approved ? 'DRAFT' : 'SUBMITTED');
        assert.equal(entry.unlock_requested, requested ? 1 : 0);
        assert.equal(entry.unlock_reason, requested ? originalReason : null);
        assert.equal(entry.submitted_at, approved ? null : timestamp);
        for (const key of ['id', 'branch_id', 'manager_id', 'entry_date', 'total_amount']) assert.equal(entry[key], before.headers[0][key]);
        assert.deepEqual(after.items, before.items);
        assert.deepEqual(after.headers[1], before.headers[1]);
        assert.equal(after.audits.length, 1);
        assert.equal(audit.entry_id, 1); assert.equal(audit.branch_id, 5);
        assert.equal(audit.action, op.action); assert.equal(audit.actor_id, op.actor.user_id);
        assert.equal(audit.actor_role, op.actor.role); assert.equal(audit.actor_name, `Database User ${op.actor.user_id}`);
        assert.deepEqual(audit.previous_state, { status: 'SUBMITTED', unlock_requested: op.pending, ...(op.pending ? { unlock_reason: originalReason } : {}) });
        assert.deepEqual(audit.new_state, { status: entry.status, unlock_requested: entry.unlock_requested });
        assert.equal(audit.reason, originalReason);
        assert.ok(!JSON.stringify(audit).includes('not-to-store'));
        const queries = f.events.filter(e => e.sql);
        assert.match(queries[0].sql, /FOR UPDATE$/);
        if (requested) assert.match(queries[0].sql, /WHERE id = \? AND branch_id = \?/);
        else assert.match(queries[0].sql, /WHERE id = \? FOR UPDATE$/);
        assert.ok(queries.every(e => e.connection !== null));
        assert.equal(new Set(queries.map(e => e.connection)).size, 1);
        assert.ok(f.events.findIndex(e => e.action === 'begin') < f.events.findIndex(e => e.sql));
        assert.ok(queries.findIndex(e => e.sql.startsWith('UPDATE')) < queries.findIndex(e => e.sql.startsWith('INSERT')));
        assert.equal(f.events.at(-2).action, 'commit'); assert.equal(f.events.at(-1).action, 'release');
    });
    test(`${op.action}: lowercase status and string pending representation accepted`, async () => {
        const f = setup(op, { status: ' submitted ', pending: String(op.pending) });
        await f.service[op.method](op.actor, 1, note);
        assert.equal(f.state().audits.length, 1);
    });
    for (const status of ['DRAFT', 'FINAL_LOCKED', 'final_locked', 'unknown', null]) {
        test(`${op.action}: rejects ${status} without mutation`, async () => {
            const f = setup(op, { status }); const before = f.state();
            await reject(f.service[op.method](op.actor, 1, note), 409);
            assert.deepEqual(f.state(), before); assert.equal(f.events.at(-1).action, 'release');
        });
    }
    test(`${op.action}: missing ID and malformed ID/body handled safely`, async () => {
        const f = setup(op); const call = httpHarness(f);
        assert.equal((await call('post', `/entry/:id/${op.route}`, op.actor, { params: { id: '999' }, body: note })).status, 404);
        for (const id of ['0', '-1', 'abc', '1 OR 1=1']) {
            assert.equal((await call('post', `/entry/:id/${op.route}`, op.actor, { params: { id }, body: note })).status, 400);
        }
        assert.equal((await call('post', `/entry/:id/${op.route}`, op.actor, { body: [] })).status, 400);
        assert.equal(f.state().audits.length, 0);
    });
    for (const role of ['MANAGER', 'HEAD_OFFICE', 'ADMIN', 'EMPLOYEE', null].filter(r => r !== op.actor.role)) {
        test(`${op.action}: denies ${role || 'unauthenticated'} caller`, async () => {
            const f = setup(op); const actor = role ? { ...op.actor, role } : null;
            assert.equal((await httpHarness(f)('post', `/entry/:id/${op.route}`, actor, { body: note })).status, 403);
            await reject(f.service[op.method](actor, 1, note), 403);
            assert.equal(f.events.length, 0);
        });
    }
    test(`${op.action}: repeated action returns conflict and adds no event`, async () => {
        const f = setup(op); await f.service[op.method](op.actor, 1, note); const before = f.state();
        await reject(f.service[op.method](op.actor, 1, note), 409);
        assert.deepEqual(f.state(), before);
    });
    for (const failure of [{ failQuery: 'UPDATE daily_business_entries' }, { failQuery: 'INSERT INTO daily_business_audit_logs' }, { commitFailure: true }]) {
        test(`${op.action}: rollback and safe response on ${JSON.stringify(failure)}`, async () => {
            const f = setup(op, failure); const before = f.state();
            const response = await httpHarness(f)('post', `/entry/:id/${op.route}`, op.actor, { body: note });
            assert.equal(response.status, 500); assert.equal(response.data.message, 'Internal server error');
            assert.deepEqual(f.state(), before);
            assert.equal(f.events.at(-2).action, 'rollback'); assert.equal(f.events.at(-1).action, 'release');
        });
    }
    test(`${op.action}: serial competing calls produce one event and one conflict`, async () => {
        const f = setup(op, { serializeTransactions: true });
        const results = await Promise.allSettled([f.service[op.method](op.actor, 1, note), f.service[op.method](op.actor, 1, note)]);
        assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
        assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
        assert.equal(f.state().audits.length, 1);
        assert.equal(f.events.filter(e => e.action === 'release').length, 2);
    });
}

for (const method of ['requestUnlock', 'rejectUnlock']) {
    test(`${method}: reason validation rejects missing, blank, oversized, object and array`, async () => {
        const op = operations.find(o => o.method === method);
        for (const reason of [undefined, null, '', '  ', 123, {}, [], 'x'.repeat(1001), '😀'.repeat(1001)]) {
            const f = setup(op);
            await reject(f.service[method](op.actor, 1, { reason }), 400);
            assert.equal(f.events.length, 0);
        }
        const f = setup(op);
        await f.service[method](op.actor, 1, { reason: '😀'.repeat(1000) });
        assert.equal(f.state().audits[0].reason, '😀'.repeat(1000));
    });
}
test('manager cross-branch request returns 404; forged branch cannot bypass tenancy', async () => {
    const f = fixture({ secondStatus: 'SUBMITTED' });
    await reject(f.service.requestUnlock(manager, 2, note), 404);
    await reject(f.service.requestUnlock(manager, 2, { ...note, branch_id: 8 }), 403);
    await reject(f.service.requestUnlock(manager, 2, { ...note, branchId: 8 }), 403);
    assert.equal(f.state().audits.length, 0);
});
for (const op of operations.slice(1)) {
    test(`${op.action}: no pending request is a conflict`, async () => {
        const f = setup(op, { pending: 0 });
        await reject(f.service[op.method](ho, 1, note), 409);
        assert.equal(f.state().audits.length, 0);
    });
    test(`${op.action}: forged branch/actor/status cannot change authoritative metadata`, async () => {
        const f = setup(op);
        await f.service[op.method](ho, 1, { ...note, branch_id: 999, actor_id: 999, status: 'FINAL_LOCKED' });
        assert.equal(f.state().audits[0].branch_id, 5);
        assert.equal(f.state().audits[0].actor_id, ho.user_id);
    });
}
test('pending request keeps manager writes immutable and blocks final lock', async () => {
    const f = fixture({ status: 'SUBMITTED', pending: 1, reason: originalReason }); const before = f.state();
    for (const method of ['update', 'remove', 'submit']) await reject(f.service[method](manager, 1, input), 409);
    await reject(f.service.finalLock(ho, 1), 409);
    assert.deepEqual(f.state(), before);
});
test('rejection preserves both reasons, submission timestamp and permits final lock', async () => {
    const f = fixture({ status: 'DRAFT' });
    await f.service.submit(manager, 1);
    const submittedAt = f.state().headers[0].submitted_at;
    await f.service.requestUnlock(manager, 1, note);
    const oldAudit = f.state().audits;
    await f.service.rejectUnlock(ho, 1, { reason: '  No correction needed  ' });
    assert.deepEqual(f.state().audits.slice(0, 2), oldAudit);
    assert.equal(f.state().audits[2].previous_state.unlock_reason, originalReason);
    assert.equal(f.state().audits[2].reason, 'No correction needed');
    assert.deepEqual(f.state().headers[0].submitted_at, submittedAt);
    await f.service.finalLock(ho, 1);
    assert.deepEqual(f.state().audits.map(a => a.action), ['SUBMIT', 'UNLOCK_REQUEST', 'UNLOCK_REJECT', 'FINAL_LOCK']);
});
for (const path of ['submit', 'update']) {
    test(`approved cycle permits normal edit and ${path} resubmission, retaining append-only audit history`, async () => {
        const f = fixture({ status: 'DRAFT' });
        await f.service.submit(manager, 1);
        await f.service.requestUnlock(manager, 1, note);
        await f.service.approveUnlock(ho, 1);
        assert.equal(f.state().headers[0].submitted_at, null);
        const oldAudit = f.state().audits;
        await reject(f.service.remove(manager, 1), 409); // Reopened draft still has immutable audit history.
        await f.service.update(manager, 1, input);
        await f.service[path](manager, 1, { ...input, status: 'SUBMITTED' });
        assert.ok(f.state().headers[0].submitted_at instanceof Date);
        await f.service.finalLock(ho, 1);
        assert.equal(f.state().headers[0].total_amount, '12.50');
        assert.deepEqual(f.state().audits.slice(0, 3), oldAudit);
        assert.equal(oldAudit[2].reason, originalReason);
        assert.deepEqual(f.state().audits.map(a => a.action), ['SUBMIT', 'UNLOCK_REQUEST', 'UNLOCK_APPROVE', 'SUBMIT', 'FINAL_LOCK']);
    });
}
for (const order of [['approveUnlock', 'rejectUnlock'], ['rejectUnlock', 'approveUnlock'], ['finalLock', 'approveUnlock'], ['approveUnlock', 'finalLock']]) {
    test(`serialized race ${order.join(' then ')} respects locked current state`, async () => {
        const f = fixture({ status: 'SUBMITTED', pending: 1, reason: originalReason, serializeTransactions: true });
        const results = await Promise.allSettled(order.map(method => f.service[method](ho, 1, note)));
        assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
        assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
        assert.equal(f.state().audits.length, 1);
        assert.ok(!f.state().audits.some(a => a.action === 'FINAL_LOCK'));
    });
}
for (const requestFirst of [true, false]) {
    test(`request/final-lock race, request first=${requestFirst}`, async () => {
        const f = fixture({ status: 'SUBMITTED', serializeTransactions: true });
        const request = () => f.service.requestUnlock(manager, 1, note);
        const lock = () => f.service.finalLock(ho, 1);
        const results = await Promise.allSettled((requestFirst ? [request, lock] : [lock, request]).map(fn => fn()));
        assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].reason.status, 409);
        assert.equal(f.state().audits.length, 1);
        assert.equal(f.state().headers[0].status, requestFirst ? 'SUBMITTED' : 'FINAL_LOCKED');
    });
}
test('manager and central details expose normalized minimal request fields', async () => {
    const f = fixture({ status: 'SUBMITTED', pending: '1', reason: originalReason });
    for (const actor of [manager, ho]) {
        const report = await f.service.read(actor, { entryId: 1 });
        assert.equal(report.unlock_requested, 1); assert.equal(report.unlock_reason, originalReason);
        assert.ok(!Object.hasOwn(report, 'audits'));
    }
    const response = await httpHarness(f)('get', '/branch/:id', ho, { params: { id: '5' } });
    assert.equal(response.status, 200);
    assert.equal(response.data.unlock_requested, 1); assert.equal(response.data.unlock_reason, originalReason);
    await f.service.approveUnlock(ho, 1);
    const report = await f.service.read(manager, { entryId: 1 });
    assert.equal(report.unlock_requested, 0); assert.equal(report.unlock_reason, null);
});
