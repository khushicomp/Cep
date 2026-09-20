// Executes read queries against disposable in-memory SQLite, never config/db or live MySQL.
// DATE_FORMAT is supplied for the one MySQL formatting expression used by the overview.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createReportService } = require('../services/business-report.service');
const { httpHarness } = require('./helpers/report-fixture');
const ho = { user_id: 40, role: 'HEAD_OFFICE', branch_id: 99 };
const date = '2026-09-20';
const route = '/head-office/daily-overview';

function fixture(t, { branchCount = 38, reports = [], items = [], inactive = [], fail = false } = {}) {
    const db = new DatabaseSync(':memory:');
    t.after(() => db.close());
    db.function('DATE_FORMAT', (value, _format) => value);
    db.exec(`CREATE TABLE branches (branch_id INTEGER PRIMARY KEY, branch_code TEXT, branch_name TEXT, branch_district TEXT, is_active INTEGER);
        CREATE TABLE daily_business_entries (id INTEGER PRIMARY KEY, branch_id INTEGER, entry_date TEXT, status TEXT,
            unlock_requested INTEGER, total_amount TEXT, total_entries INTEGER, submitted_at TEXT, UNIQUE(branch_id, entry_date));
        CREATE TABLE daily_business_items (id INTEGER PRIMARY KEY, entry_id INTEGER, account_type TEXT, amount TEXT);`);
    const insertBranch = db.prepare('INSERT INTO branches VALUES (?, ?, ?, ?, ?)');
    for (let id = 1; id <= branchCount; id++) insertBranch.run(id, `B${id}`, `Branch ${id}`, 'Test district', inactive.includes(id) ? 0 : 1);
    const insertReport = db.prepare('INSERT INTO daily_business_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const r of reports) insertReport.run(r.id, r.branch_id ?? r.id, r.date ?? date,
        Object.hasOwn(r, 'status') ? r.status : 'DRAFT', r.pending ?? 0, r.amount ?? '0.00', r.count ?? 0, r.submitted_at ?? null);
    const insertItem = db.prepare('INSERT INTO daily_business_items VALUES (?, ?, ?, ?)');
    for (const i of items) insertItem.run(i.id, i.entry_id, i.type, i.amount);
    const calls = [];
    function query(sql, params = []) {
        assert.match(sql.trim(), /^SELECT/i, 'application queries must be read-only');
        calls.push({ sql, params });
        if (fail) throw new Error('private SQL credentials');
        return db.prepare(sql).all(...params).map(row => ({ ...row }));
    }
    const pool = { promise: () => ({ query: async (sql, params) => [query(sql, params)] }),
        query(sql, params, callback) { try { callback(null, query(sql, params)); } catch (e) { callback(e); } } };
    return { db, pool, calls, service: createReportService(pool) };
}

test('Head Office route returns all 38 branches once, including missing reports with safe zero fields', async t => {
    const f = fixture(t);
    const response = await httpHarness(f)('get', route, ho, { query: { date } });
    assert.equal(response.status, 200);
    assert.equal(response.data.branches.length, 38);
    assert.equal(new Set(response.data.branches.map(b => b.branch_id)).size, 38);
    for (const b of response.data.branches) {
        assert.equal(b.entry_id, null); assert.equal(b.lifecycle_status, null);
        assert.equal(b.display_status, 'NOT_STARTED'); assert.equal(b.total_amount, '0.00');
        assert.equal(b.total_entries, 0); assert.equal(b.unlock_requested, 0); assert.equal(b.submitted_at, null);
        assert.equal(b.date, date);
        assert.deepEqual(Object.keys(b).sort(), ['branch_id','branch_code','branch_name','branch_district','entry_id','date',
            'lifecycle_status','display_status','unlock_requested','total_amount','total_entries','submitted_at'].sort());
    }
    assert.deepEqual(response.data.summary, { totalBranches: 38, notStarted: 38, draft: 0, submitted: 0,
        correctionPending: 0, finalLocked: 0, unknown: 0, reportedBranches: 0, totalAmount: '0.00', totalEntries: 0 });
    assert.equal(f.calls.length, 1);
});
for (const role of ['MANAGER', 'EMPLOYEE', 'ADMIN', null]) {
    test(`overview denies ${role || 'unauthenticated'} before any query`, async t => {
        const f = fixture(t); const user = role ? { ...ho, role } : null;
        assert.equal((await httpHarness(f)('get', route, user)).status, 403);
        await assert.rejects(f.service.dailyOverview(user, date), e => e.status === 403);
        assert.equal(f.calls.length, 0);
    });
}
test('default date follows India midnight, not UTC midnight', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-19T18:35:00Z') });
    const f = fixture(t);
    const response = await httpHarness(f)('get', route, ho, { query: {} });
    assert.equal(response.data.date, '2026-09-20');
    assert.deepEqual(f.calls[0].params, ['2026-09-20']);
});
for (const invalid of ['', '2026-2-01', '2026-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-09-00', '0999-01-01', '2026-09-20 OR 1=1', ['2026-09-20'], {}]) {
    test(`overview rejects malformed/impossible date ${JSON.stringify(invalid)}`, async t => {
        const f = fixture(t);
        assert.equal((await httpHarness(f)('get', route, ho, { query: { date: invalid } })).status, 400);
        assert.equal(f.calls.length, 0);
    });
}
test('valid leap-day accepted and query date is a bound parameter with no branch override', async t => {
    const f = fixture(t);
    const response = await httpHarness(f)('get', route, ho, { query: { date: '2024-02-29', branch_id: 2, branchId: 2 } });
    assert.equal(response.status, 200); assert.equal(response.data.branches.length, 38);
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.calls[0].params, ['2024-02-29']);
    assert.match(f.calls[0].sql, /e.entry_date = \?/); assert.ok(!f.calls[0].sql.includes('2024-02-29'));
    assert.doesNotMatch(f.calls[0].sql, /daily_business_items|JOIN users/);
});
for (const [status, pending, expected] of [
    ['DRAFT',0,'DRAFT'], ['draft',0,'DRAFT'], [' draft ',0,'DRAFT'],
    ['SUBMITTED',0,'SUBMITTED'], ['submitted',0,'SUBMITTED'], ['SUBMITTED',1,'CORRECTION_PENDING'],
    ['submitted',1,'CORRECTION_PENDING'], ['FINAL_LOCKED',0,'FINAL_LOCKED'], ['final_locked',0,'FINAL_LOCKED'],
    ['bad',0,'UNKNOWN'], ['',0,'UNKNOWN'], [null,0,'UNKNOWN']
]) {
    test(`status ${JSON.stringify(status)}, pending ${pending} derives ${expected}`, async t => {
        const f = fixture(t, { reports: [{ id: 1, status, pending, amount: '100.25', count: 2 }] });
        const result = await f.service.dailyOverview(ho, date);
        const row = result.branches.find(b => b.branch_id === 1);
        assert.equal(row.display_status, expected); assert.equal(row.entry_id, 1);
        assert.equal(result.summary.reportedBranches, 1);
        assert.equal(result.summary.totalAmount, '100.25'); assert.equal(result.summary.totalEntries, 2);
        assert.equal(result.summary.notStarted, 37);
    });
}
test('exclusive buckets and exact header totals include drafts, pending and unknown; equal amounts counted twice', async t => {
    const reports = [
        { id:1, status:'DRAFT', amount:'100.00', count:2 }, { id:2, status:'SUBMITTED', amount:'100.00', count:3 },
        { id:3, status:'SUBMITTED', pending:1, amount:'0.10', count:1 },
        { id:4, status:'FINAL_LOCKED', amount:'0.20', count:1 }, { id:5, status:null, amount:'1.00', count:1 }
    ];
    const result = await fixture(t, { reports }).service.dailyOverview(ho, date);
    const s = result.summary;
    assert.deepEqual(s, { totalBranches:38, notStarted:33, draft:1, submitted:1, correctionPending:1, finalLocked:1,
        unknown:1, reportedBranches:5, totalAmount:'201.30', totalEntries:8 });
    assert.equal(s.notStarted+s.draft+s.submitted+s.correctionPending+s.finalLocked+s.unknown, s.totalBranches);
});
test('header cents remain exact above the aggregate JavaScript safe integer range', async t => {
    const reports = Array.from({length:38}, (_, i) => ({ id:i+1, amount:'9999999999999.99', count:1 }));
    const result = await fixture(t, { reports }).service.dailyOverview(ho, date);
    assert.equal(result.summary.totalAmount, '379999999999999.62');
});
test('selected date excludes other dates; actual active flag excludes inactive branches and their totals', async t => {
    const f = fixture(t, { inactive:[3], reports:[
        { id:1, amount:'10.00', count:1 }, { id:2, date:'2026-09-19', amount:'900.00', count:9 },
        { id:3, amount:'800.00', count:8 }, { id:4, branch_id:1, date:'2026-09-19', amount:'20.00', count:2 }
    ] });
    const result = await f.service.dailyOverview(ho, date);
    assert.equal(result.summary.totalBranches,37); assert.equal(result.summary.reportedBranches,1);
    assert.equal(result.summary.totalAmount,'10.00'); assert.equal(result.summary.totalEntries,1);
    assert.ok(!result.branches.some(b=>b.branch_id===3));
    assert.equal(result.branches.find(b=>b.branch_id===2).display_status,'NOT_STARTED');
    const previous = await f.service.dailyOverview(ho,'2026-09-19');
    assert.equal(previous.summary.totalAmount,'920.00'); assert.equal(previous.summary.reportedBranches,2);
});
test('no configured active branches returns a valid empty overview', async t => {
    const result = await fixture(t, { branchCount:0 }).service.dailyOverview(ho,date);
    assert.deepEqual(result.branches,[]); assert.equal(result.summary.totalBranches,0); assert.equal(result.summary.totalAmount,'0.00');
});
test('database errors have safe responses', async t => {
    const result = await httpHarness(fixture(t, {fail:true}))('get',route,ho);
    assert.equal(result.status,500); assert.equal(result.data.message,'Internal server error');
});

test('analytics regression executes old and corrected SQL: equal 100 headers with 2/3 items total 200, not 500 or 100', async t => {
    const f = fixture(t, { reports:[{id:1,amount:'100.00',count:2},{id:2,amount:'100.00',count:3}], items:[
        {id:1,entry_id:1,type:'Savings',amount:'40.00'}, {id:2,entry_id:1,type:'Loan',amount:'60.00'},
        {id:3,entry_id:2,type:'Savings',amount:'20.00'}, {id:4,entry_id:2,type:'Savings',amount:'30.00'}, {id:5,entry_id:2,type:'Loan',amount:'50.00'}
    ] });
    const old = f.db.prepare('SELECT SUM(e.total_amount) AS total FROM daily_business_entries e LEFT JOIN daily_business_items i ON e.id=i.entry_id').get();
    assert.equal(old.total,500);
    const result = await httpHarness(f)('get','/reports',ho);
    assert.equal(result.status,200); assert.equal(result.data.overall.totalBusiness,200);
    assert.equal(result.data.overall.totalReports,2); assert.equal(result.data.overall.reportedBranches,2);
    assert.equal(result.data.overall.totalAccountsOpened,5);
    const types = Object.fromEntries(result.data.breakdown.map(r=>[r.account_type,r]));
    assert.equal(types.Savings.count,3); assert.equal(types.Savings.amount,90);
    assert.equal(types.Loan.count,2); assert.equal(types.Loan.amount,110);
    assert.equal(f.calls.length,2);
    assert.ok(f.calls.every(c=>!c.sql.includes('SUM(DISTINCT')));
});
test('analytics preserves all-time/all-branch scope and counts headers without items once', async t => {
    const f = fixture(t, { reports:[{id:1,amount:'100.00',count:0},{id:2,branch_id:1,date:'2026-09-19',amount:'100.00',count:0}] });
    const result = await httpHarness(f)('get','/reports',{...ho,role:'ADMIN'}, {query:{date:'2026-09-20',branch_id:99}});
    assert.equal(result.status,200); assert.equal(result.data.overall.totalBusiness,200);
    assert.equal(result.data.overall.totalReports,2); assert.equal(result.data.overall.reportedBranches,1);
    assert.equal(result.data.overall.totalAccountsOpened,0);
});
test('empty analytics returns zero aggregates and no item breakdown', async t => {
    const result = await httpHarness(fixture(t))('get','/reports',ho);
    assert.equal(result.data.overall.totalBusiness,0); assert.equal(result.data.overall.totalReports,0);
    assert.equal(result.data.overall.totalAccountsOpened,0); assert.equal(result.data.overall.reportedBranches,0);
    assert.equal(result.data.breakdown.length,0);
});
test('frontend calendar navigation crosses month/year/leap boundaries without changing business dates', async () => {
    const { businessToday, shiftBusinessDate } = await import('../../frontend/src/utils/businessDate.js');
    assert.equal(businessToday(new Date('2026-09-19T18:35:00Z')),'2026-09-20');
    assert.equal(shiftBusinessDate('2024-03-01',-1),'2024-02-29');
    assert.equal(shiftBusinessDate('2026-03-01',-1),'2026-02-28');
    assert.equal(shiftBusinessDate('2026-12-31',1),'2027-01-01');
});
test('overview amount formatting preserves cents for large branch aggregates', async () => {
    const { formatBusinessAmount } = await import('../../frontend/src/utils/businessAmount.js');
    assert.equal(formatBusinessAmount('379999999999999.62'), '37,99,99,99,99,99,999.62');
    assert.equal(formatBusinessAmount('201.30'), '201.30');
    assert.equal(formatBusinessAmount('0.00'), '0.00');
});
