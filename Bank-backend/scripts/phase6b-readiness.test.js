const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rootCertificates } = require('node:tls');
const { databaseOptions, SESSION_SQL } = require('../config/database-options');
const { schema, statements, fingerprint, validate, metadata, empty, bootstrap } = require('./current-schema');
const { fixture } = require('./helpers/schema-fixture');
const { authorize, inspect, seed, branches, identities } = require('./staging-seed');
const { readinessProbe, installHealth } = require('../services/runtime-health');
const { installShutdown } = require('../services/runtime-shutdown');
const { EventEmitter } = require('node:events');
const { randomBytes } = require('node:crypto');
const tlsEnv = { DB_HOST: 'database.example.invalid', DB_SSL_MODE: 'verify', DB_SSL_CA: rootCertificates[0] };

test('pool acquisitions wait for session initialization, initialize once, and fail closed', async () => {
    const { initializePool } = require('../config/database-options');
    for (const failed of [false,true]) {
        let done, issued = 0, destroyed = 0, returned = false;
        const connection = { query(options, callback) { assert.equal(options.sql, SESSION_SQL); assert.ok(options.timeout); issued++; done = callback; }, destroy() { destroyed++; } };
        const pool = initializePool({ getConnection(callback) { callback(null, connection); } });
        const first = new Promise(resolve => pool.getConnection((error, result) => { returned = true; resolve({ error, result }); }));
        assert.equal(returned, false);
        done(failed ? new Error('sensitive-driver-details') : null);
        const outcome = await first;
        if (failed) { assert.equal(outcome.error.message, 'Database session initialization failed'); assert.equal(destroyed, 1); assert.equal(outcome.result, undefined); }
        else { assert.equal(outcome.result, connection); pool.getConnection((error, result) => { assert.equal(error, null); assert.equal(result, connection); }); assert.equal(issued, 1); }
    }
});
test('CORS rejects wildcard subdomains while proxy trust stays disabled by default', () => {
    const { validateEnvironment } = require('../config/security');
    assert.throws(() => validateEnvironment({ CLIENT_URL: 'https://*.vercel.app' }), /CLIENT_URL/);
    assert.equal(validateEnvironment({}).trustProxy, false);
});

test('local database configuration preserves non-TLS and explicit India driver/session semantics', () => {
    const config = databaseOptions({});
    assert.equal(config.ssl, undefined); assert.equal(config.timezone, '+05:30');
    assert.equal(config.multipleStatements, false); assert.match(SESSION_SQL, /\+05:30/);
});
test('verified TLS uses CA and explicit certificate plus hostname verification', () => {
    const config = databaseOptions(tlsEnv);
    assert.equal(config.ssl.ca, rootCertificates[0]);
    assert.equal(config.ssl.verifyIdentity, true); assert.equal(config.ssl.rejectUnauthorized, true);
});
for (const change of [{ DB_SSL_CA: '' }, { DB_SSL_CA: 'sensitive-invalid-input' }, { DB_HOST: '127.0.0.1' },
    { DB_SSL_MODE: 'prefer' }, { DB_SSL_REJECT_UNAUTHORIZED: 'false' }, { DB_SSL_VERIFY_IDENTITY: 'false' },
    { DB_PORT: '0' }, { DB_TIMEZONE: 'Z' }, { DB_SSL_CA: rootCertificates[0] + 'private-material' }]) {
    test(`invalid database configuration is sanitized (${Object.keys(change)[0]})`, () => {
        assert.throws(() => databaseOptions({ ...tlsEnv, ...change }), { message: 'Invalid database connection configuration' });
    });
}
test('staging and production cannot silently use plaintext', () => {
    for (const env of [{ NODE_ENV: 'production' }, { DEPLOYMENT_ENV: 'staging' }]) assert.throws(() => databaseOptions(env));
});
test('canonical schema contains seven active tables and no row/legacy/destructive SQL', () => {
    assert.equal(statements.length, 7); assert.equal(schema.length, 7);
    assert.deepEqual(schema.map(t => t.columns.length), [14,18,15,7,13,9,7]);
    assert.ok(schema.some(t => t.name === 'daily_business_audit_logs'));
    assert.doesNotMatch(statements.join('\n'), /\b(?:DROP|INSERT|UPDATE\s+\w+\s+SET|DELETE FROM|FOREIGN_KEY_CHECKS|tasks|time_logs)\b/i);
    assert.match(fingerprint, /^[a-f0-9]{64}$/);
});
test('independent validator reads metadata only and accepts complete schema', async () => {
    const { c } = fixture(); assert.deepEqual(validate(await metadata(c)), []);
});
for (const issue of ['column','nullable','default','extra','pk','unique','fk','cross-schema','engine','collation','trigger','check','extra-table','routine','event']) {
    test(`validator rejects ${issue} drift`, () => {
        const { m } = fixture();
        if (issue === 'column') m.columns[0].COLUMN_TYPE = 'bigint';
        if (issue === 'nullable') m.columns[0].IS_NULLABLE = 'YES';
        if (issue === 'default') m.columns[0].COLUMN_DEFAULT = '1';
        if (issue === 'extra') m.columns[0].EXTRA = '';
        if (issue === 'pk') m.indexes = m.indexes.filter(i => i.TABLE_NAME !== 'branches' || i.INDEX_NAME !== 'PRIMARY');
        if (issue === 'unique') m.indexes.find(i => i.INDEX_NAME === 'token_hash').NON_UNIQUE = 1;
        if (issue === 'fk') m.fks[0].DELETE_RULE = 'CASCADE';
        if (issue === 'cross-schema') m.fks[0].same_schema = 0;
        if (issue === 'engine') m.tables[0].ENGINE = 'MyISAM';
        if (issue === 'collation') m.tables[0].TABLE_COLLATION = 'latin1_swedish_ci';
        if (issue === 'trigger') m.triggers.push({});
        if (issue === 'check') m.checks.push({});
        if (issue === 'extra-table') m.tables.push({ TABLE_NAME: 'unexpected' });
        if (issue === 'routine') m.routines.push({});
        if (issue === 'event') m.events.push({});
        assert.ok(validate(m).length);
    });
}
test('both historical migration inspectors require zero steps for canonical metadata', async () => {
    for (const script of ['./phase1-migration','./phase5d-migration']) {
        const plan = await require(script).prepare(fixture().c);
        assert.deepEqual(plan.blocked, []); assert.deepEqual(plan.steps, []);
    }
});
test('bootstrap refuses wrong acknowledgement and any existing table without writes', async () => {
    const { c, m } = fixture();
    await assert.rejects(bootstrap(c, 'wrong'));
    await assert.rejects(bootstrap(c, fingerprint), /empty database/);
    assert.equal(empty(m), false);
});
test('bootstrap applies exactly seven creates only after a locked empty metadata recheck', async () => {
    const { m, c } = fixture(); let applied = 0;
    const initial = Object.fromEntries(Object.keys(m).map(k => [k, []]));
    const mock = { async query(sql, params) {
        if (sql.startsWith('CREATE TABLE')) { assert.equal(sql, statements[applied++]); return [[]]; }
        const source = applied === 7 ? m : initial;
        const original = { ...m }; Object.assign(m, source);
        try { return await c.query(sql, params); } finally { Object.assign(m, original); }
    } };
    await bootstrap(mock, fingerprint); assert.equal(applied, 7);
});
const staging = { NODE_ENV: 'development', DEPLOYMENT_ENV: 'staging', CREDENTIAL_MAIL_TRANSPORT: 'disabled' };
test('seed refuses production, non-staging, mail transports and absent/duplicate passwords', () => {
    for (const env of [{}, { ...staging, NODE_ENV: 'production' }, { ...staging, CREDENTIAL_MAIL_TRANSPORT: 'resend' }]) assert.throws(() => authorize(env));
    assert.throws(() => authorize(staging, true));
    const same = randomBytes(24).toString('base64url');
    assert.throws(() => authorize({ ...staging, ...Object.fromEntries(identities.map(i => [i.key,same])) }, true));
});
test('seed dry run inspects empty schema without credentials or writes; identities are synthetic', async () => {
    assert.equal(branches.length, 38); assert.deepEqual(branches.map(b => b.id), Array.from({ length: 38 }, (_, i) => i+1));
    assert.ok(identities.every(i => i.email.endsWith('@example.invalid') && i.name.startsWith('SYNTHETIC')));
    assert.equal((await seed(fixture().c, staging)).users, 3);
});
test('seed refuses duplicates and pre-existing business rows', async () => {
    const { c } = fixture(); const original = c.query;
    c.query = async sql => sql.includes('COUNT(*)') ? [[{ count: 1 }]] : original(sql);
    await assert.rejects(inspect(c), /empty/);
});
test('readiness succeeds with SELECT only and releases the connection', async () => {
    let released = 0;
    const probe = readinessProbe({ getConnection: async () => ({ query: async q => { assert.equal(q.sql, 'SELECT 1'); assert.ok(q.timeout); }, release() { released++; } }) });
    assert.equal(await probe(), true); assert.equal(released, 1);
});
test('readiness acquisition is bounded, coalesced and late connections are destroyed', async () => {
    let resolve, acquired = 0, destroyed = 0;
    const probe = readinessProbe({ getConnection: () => { acquired++; return new Promise(r => { resolve = r; }); } }, 10);
    assert.equal(await Promise.all([probe(), probe()]).then(v => v.every(x => x === false)), true);
    assert.equal(acquired, 1);
    resolve({ destroy() { destroyed++; }, query() { assert.fail('Expired probe must not query'); } });
    await new Promise(r => setImmediate(r)); assert.equal(destroyed, 1);
});
test('health response handlers return only fixed public statuses', async () => {
    const routes = {}; installHealth({ get(path, handler) { routes[path] = handler; } }, { getConnection: async () => { throw new Error('private details'); } });
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    routes['/health/live']({}, res); assert.deepEqual(res.body, { status: 'ok' });
    await routes['/health/ready']({}, res); assert.equal(res.code, 503); assert.deepEqual(res.body, { status: 'not_ready' });
});
test('shutdown drains HTTP before pool, handles duplicate signals once', async () => {
    const events = [], signals = new EventEmitter(); let drained;
    installShutdown({ close(done) { events.push('close'); drained = done; }, closeIdleConnections() {} },
        { async end() { events.push('pool'); } }, { signals, exit(code) { events.push(code); } });
    signals.emit('SIGTERM'); signals.emit('SIGINT'); assert.deepEqual(events, ['close']);
    await drained(); assert.deepEqual(events, ['close','pool',0]);
});
test('shutdown deadline bounds a stuck drain and destroys HTTP connections', async () => {
    const events = [], signals = new EventEmitter();
    const exited = new Promise(resolve => {
        installShutdown({ close() {}, closeAllConnections() { events.push('force'); } }, { async end() { events.push('pool'); } },
            { signals, timeoutMs: 10, exit(code) { events.push(code); resolve(); } });
    });
    signals.emit('SIGINT'); await exited; assert.deepEqual(events, ['force','pool',1]);
});
test('shutdown total deadline also bounds a hanging pool close', async () => {
    const signals = new EventEmitter(); let close;
    const exited = new Promise(resolve => {
        installShutdown({ close(done) { close = done; }, closeAllConnections() {} }, { end: () => new Promise(() => {}) },
            { signals, timeoutMs: 15, exit(code) { assert.equal(code, 1); resolve(); } });
    });
    signals.emit('SIGTERM'); close(); await exited;
});
test('synthetic seed commits only branches and synthetic users; rollback on insert failure', async () => {
    const env = { ...staging, ...Object.fromEntries(identities.map(i => [i.key, randomBytes(24).toString('base64url')])) };
    for (const failure of [false,true]) {
        const { c } = fixture(); const read = c.query; const writes = []; let committed = false, rolledBack = false;
        c.beginTransaction = async () => {};
        c.commit = async () => { committed = true; };
        c.rollback = async () => { rolledBack = true; };
        c.query = async (sql, params) => {
            if (!sql.startsWith('INSERT')) return read(sql, params);
            if (failure) throw new Error('Synthetic write failure');
            assert.match(sql, /^INSERT INTO (branches|users) /); writes.push(sql);
            if (sql.startsWith('INSERT INTO users')) {
                assert.ok(await require('bcryptjs').compare(env[identities.find(i => i.email === params[1]).key], params[2]));
                assert.equal(params[1].endsWith('@example.invalid'), true);
            }
            return [{}];
        };
        if (failure) await assert.rejects(seed(c, env, true)); else await seed(c, env, true);
        assert.equal(committed, !failure); assert.equal(rolledBack, failure);
        if (!failure) assert.equal(writes.length, 41);
    }
});
for (const timezone of ['UTC','Asia/Kolkata','America/Los_Angeles']) {
    test(`India boundary and driver serialization remain stable under host zone ${timezone}`, () => {
        const before = process.env.TZ;
        try {
            process.env.TZ = timezone;
            const { businessToday } = require('../services/business-report.service');
            const mysql = require('mysql2');
            const instant = new Date('2026-09-27T18:30:00.000Z');
            assert.equal(businessToday(new Date(instant.getTime()-1)), '2026-09-27');
            assert.equal(businessToday(instant), '2026-09-28');
            assert.equal(mysql.escape(instant, false, databaseOptions({}).timezone), "'2026-09-28 00:00:00.000'");
            assert.equal(new Date('2026-09-28T00:00:00+05:30').getTime(), instant.getTime());
        } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
    });
    test(`credential expiry is exclusive at UTC deadline under host zone ${timezone}`, async t => {
        const before = process.env.TZ;
        const f = require('./helpers/credential-fixture').credentialFixture(); t.after(() => f.close());
        try {
            process.env.TZ = timezone;
            await f.provision(); const token = f.token(); f.advance(86400);
            const password = randomBytes(24).toString('base64url');
            await assert.rejects(f.service.complete('SETUP', { token, password, confirmPassword: password }), /invalid or expired/);
        } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
    });
}
