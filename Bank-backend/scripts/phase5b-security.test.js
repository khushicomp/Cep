const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const jwt = require('jsonwebtoken');
const express = require('express');
const { validateEnvironment, corsOptions } = require('../config/security');
const { createLoginLimiter } = require('../middleware/login-limit.middleware');
const { MemoryStore } = require('express-rate-limit');
const { fixture, httpHarness } = require('./helpers/report-fixture');

const secret = 'isolated-test-signing-key';
const production = { NODE_ENV: 'production', JWT_SECRET: require('node:crypto').randomBytes(32).toString('hex'),
    DB_HOST: 'db.invalid', DB_USER: 'fixture', DB_PASSWORD: 'synthetic', DB_NAME: 'fixture', CLIENT_URL: 'https://bank.example.invalid' };
function load(file, replacements = {}, env = {}) {
    const context = { exports: {}, module: { exports: {} }, process: { env }, console: { error() {} },
        require: name => Object.hasOwn(replacements, name) ? replacements[name] : require(name) };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
    return Object.keys(context.exports).length ? context.exports : context.module.exports;
}

for (const value of [undefined, '', 'secret', 'changeme', 'development-placeholder'.repeat(5), 'a'.repeat(80), '0123456789abcdef'.repeat(4)]) {
    test(`production rejects missing/weak JWT configuration (${String(value).length} characters)`, () => {
        assert.throws(() => validateEnvironment({ ...production, JWT_SECRET: value }), /JWT_SECRET/);
    });
}
test('production accepts explicitly generated secret and exact HTTPS origins', () => {
    const result = validateEnvironment({ ...production, CLIENT_URL: production.CLIENT_URL + ',https://office.example.invalid', TRUST_PROXY: '127.0.0.1,10.0.0.0/24' });
    assert.equal(result.production, true);
    assert.equal(result.origins.length, 2);
    assert.deepEqual(result.trustProxy, ['127.0.0.1', '10.0.0.0/24']);
});
for (const [key, value] of [['DB_HOST', ''], ['DB_USER', ''], ['DB_PASSWORD', ''], ['DB_NAME', ''], ['CLIENT_URL', ''],
    ['CLIENT_URL', '*'], ['CLIENT_URL', ', ,'], ['CLIENT_URL', 'http://bank.example.invalid'], ['CLIENT_URL', 'https://bank.example.invalid/path'],
    ['TRUST_PROXY', 'true'], ['TRUST_PROXY', '1'], ['TRUST_PROXY', '0.0.0.0/0'], ['PORT', '0'], ['DB_PORT', '65536'], ['NODE_ENV', 'Production']]) {
    test(`invalid production ${key} configuration fails closed (${value || 'empty'})`, () => {
        assert.throws(() => validateEnvironment({ ...production, [key]: value }), new RegExp(key));
    });
}
test('development has a practical origin, no trusted proxy, and no invented signing secret', () => {
    assert.equal(validateEnvironment({}).origins[0], 'http://localhost:5173');
    assert.equal(validateEnvironment({}).trustProxy, false);
    assert.equal(validateEnvironment({}).JWT_SECRET, undefined);
});
test('actual application startup validates production configuration before loading database-backed routes', () => {
    assert.throws(() => load('app.js', { dotenv: { config() {} }, './config/security': {
        validateEnvironment: () => validateEnvironment({ ...production, JWT_SECRET: '' }), corsOptions
    } }), /JWT_SECRET/);
});

test('frontend logout clears session and API 401 clears session and redirects to login', async () => {
    const storage = new Map([['token', 'synthetic-token'], ['role', 'MANAGER'], ['user', '{}']]);
    const context = { localStorage: { removeItem: key => storage.delete(key), getItem: key => storage.get(key) },
        window: { location: { pathname: '/manager', href: '/manager' } } };
    const auth = fs.readFileSync(path.join(__dirname, '../../frontend/src/utils/auth.js'), 'utf8').replace('export function', 'function');
    vm.runInNewContext(auth, context);
    context.clearSession();
    assert.equal(storage.size, 0);
    storage.set('token', 'synthetic-token'); storage.set('role', 'MANAGER'); storage.set('user', '{}');
    let onFailure, onRequest;
    context.axios = { create: () => ({ interceptors: { request: { use(fn) { onRequest = fn; } },
        response: { use(_success, failure) { onFailure = failure; } } } }) };
    const api = fs.readFileSync(path.join(__dirname, '../../frontend/src/services/api.js'), 'utf8')
        .replace(/^import .*;\r?\n/gm, '').replace('import.meta.env.VITE_API_URL', 'undefined').replace('export default api;', '');
    vm.runInNewContext(api, context);
    assert.equal(onRequest({ headers: {} }).headers.Authorization, 'Bearer synthetic-token');
    await assert.rejects(onFailure({ response: { status: 401 } }));
    assert.equal(storage.size, 0); assert.equal(context.window.location.href, '/');
});

async function authenticate(token, user = { user_id: 9, role: 'MANAGER', branch_id: 8, is_active: 1 }, fail = false) {
    const queries = [];
    const middleware = load('middleware/auth.middleware.js', { '../config/db': { promise: () => ({ query: async (sql, params) => {
        queries.push({ sql, params });
        if (fail) throw new Error('private database details');
        return [user ? [user] : []];
    } }) } }, { JWT_SECRET: secret });
    const req = { headers: token === undefined ? {} : { authorization: `Bearer ${token}` } };
    let status = 200, body, next = false;
    await middleware.verifyToken(req, { status(code) { status = code; return this; }, json(value) { body = value; } }, () => { next = true; });
    return { status, body, next, req, queries };
}
test('current database identity replaces signed role and branch and excludes sensitive columns', async () => {
    const result = await authenticate(jwt.sign({ user_id: 9, role: 'HEAD_OFFICE', branch_id: 5, password: 'untrusted' }, secret));
    assert.equal(result.next, true);
    assert.deepEqual(JSON.parse(JSON.stringify(result.req.user)), { user_id: 9, role: 'MANAGER', branch_id: 8 });
    assert.match(result.queries[0].sql, /^SELECT user_id, role, branch_id, is_active FROM users WHERE user_id = \?$/);
    assert.equal(result.queries[0].params[0], 9);
});
for (const [label, token] of [['malformed', 'not-a-jwt'], ['expired', jwt.sign({ user_id: 9 }, secret, { expiresIn: -1 })],
    ['invalid signature', jwt.sign({ user_id: 9 }, 'other-synthetic-key')], ['wrong algorithm', jwt.sign({ user_id: 9 }, secret, { algorithm: 'HS384' })],
    ['missing identity', jwt.sign({ role: 'HEAD_OFFICE' }, secret)], ['invalid identity', jwt.sign({ user_id: '1 OR 1=1' }, secret)]]) {
    test(`${label} token rejected before database lookup`, async () => {
        const result = await authenticate(token);
        assert.equal(result.status, 401); assert.equal(result.next, false); assert.equal(result.queries.length, 0);
    });
}
for (const user of [null, { user_id: 9, role: 'MANAGER', is_active: 0 }, { user_id: 9, role: 'UNKNOWN', is_active: 1 }]) {
    test(`missing/disabled/invalid-role current identity is rejected (${user?.role || 'missing'}, ${user?.is_active})`, async () => {
        const result = await authenticate(jwt.sign({ user_id: 9 }, secret), user);
        assert.equal(result.status, 401); assert.equal(result.next, false);
    });
}
test('identity database failure fails closed without leaking driver details', async () => {
    const result = await authenticate(jwt.sign({ user_id: 9 }, secret), null, true);
    assert.equal(result.status, 503); assert.equal(result.next, false);
    assert.doesNotMatch(JSON.stringify(result.body), /private|database|SQL/);
});
test('stale Head Office role cannot retain final-lock permission', async () => {
    const f = fixture();
    const response = await httpHarness(f)('post', '/entry/:id/final-lock', { user_id: 9, role: 'HEAD_OFFICE', branch_id: 5 },
        { currentIdentity: { user_id: 9, role: 'MANAGER', branch_id: 5, is_active: 1 } });
    assert.equal(response.status, 403);
    assert.equal(f.events.length, 0);
});
test('stale manager branch cannot read old branch; current branch and Head Office reads remain available', async () => {
    const f = fixture(); const request = httpHarness(f);
    const claims = { user_id: 9, role: 'MANAGER', branch_id: 5 };
    const currentIdentity = { ...claims, branch_id: 8, is_active: 1 };
    assert.equal((await request('get', '/entry/:id', claims, { params: { id: '1' }, currentIdentity })).status, 404);
    assert.equal((await request('get', '/entry/:id', claims, { params: { id: '2' }, currentIdentity })).status, 200);
    assert.equal((await request('get', '/entry/:id', claims, { params: { id: '1' }, currentIdentity: { ...currentIdentity, role: 'HEAD_OFFICE' } })).status, 200);
});

function loginResponse(user, match = false, failure = false, input = { email: 'fixture@example.invalid', password: 'synthetic-input' }) {
    const comparisons = [], queries = [];
    const controller = load('controllers/auth.controller.js', {
        '../config/db': { query(sql, params, callback) { queries.push({ sql, params }); callback(null, user ? [user] : []); } },
        bcryptjs: { async compare(value, hash) { comparisons.push({ value, hash }); if (failure) throw new Error('private hash details'); return match; } }
    }, { JWT_SECRET: secret });
    return new Promise(resolve => {
        let status = 200;
        controller.login({ body: input }, { status(code) { status = code; return this; }, json(body) { resolve({ status, body, comparisons, queries }); } });
    });
}
test('unknown, incorrect-password and disabled logins have identical generic failures and comparison work', async () => {
    const user = { user_id: 9, role: 'MANAGER', is_active: 1, password: 'synthetic-hash' };
    const results = await Promise.all([loginResponse(null), loginResponse(user), loginResponse({ ...user, is_active: 0 }, true)]);
    for (const result of results) {
        assert.equal(result.status, 401); assert.equal(result.body.message, 'Invalid credentials'); assert.equal(result.comparisons.length, 1);
        assert.match(result.queries[0].sql, /WHERE u.email = \?/);
        assert.doesNotMatch(result.queries[0].sql, /SELECT u\.\*/);
    }
    const dummy = results[0].comparisons[0].hash;
    assert.equal(require('bcryptjs').getRounds(dummy), 12);
    assert.equal(await require('bcryptjs').compare('synthetic-input', dummy), false);
});
test('successful login retains ten-hour HS256 token and never returns password hash', async () => {
    const result = await loginResponse({ user_id: 9, role: 'MANAGER', branch_id: 5, is_active: 1, password: 'synthetic-hash' }, true);
    assert.equal(result.status, 200);
    const claims = jwt.verify(result.body.token, secret, { algorithms: ['HS256'] });
    assert.equal(claims.exp - claims.iat, 36000);
    assert.doesNotMatch(JSON.stringify(result.body), /password|synthetic-hash/);
});
test('malformed login input is rejected before SQL and comparison errors remain generic', async () => {
    const bad = await loginResponse(null, false, false, { email: { sql: 'untrusted' }, password: 'synthetic' });
    assert.equal(bad.status, 401); assert.equal(bad.queries.length, 0);
    const failure = await loginResponse(null, false, true);
    assert.equal(failure.status, 500); assert.equal(failure.body.message, 'Server error');
});

// Only an ephemeral loopback server is used. No real DB, external service, sleeps,
// or window-expiration assumptions; each limiter receives a fresh isolated store.
async function application(t, limit = 30) {
    const store = new MemoryStore();
    t.after(() => store.shutdown());
    const authRoutes = load('routes/auth.routes.js', {
        '../controllers/auth.controller': { login: (_req, res) => res.status(401).json({ message: 'Invalid credentials' }) },
        '../middleware/login-limit.middleware': { createLoginLimiter: () => createLoginLimiter({ limit, store }) }
    });
    const business = express.Router();
    business.post('/fixture', (_req, res) => res.json({ ok: true }));
    business.get('/failure', (_req, _res, next) => next(new Error('private SQL password token')));
    const app = load('app.js', { dotenv: { config() {} }, './config/security': { validateEnvironment: () => validateEnvironment(production), corsOptions },
        './routes/auth.routes': authRoutes, './routes/business.routes': business,
        './middleware/error.middleware': load('middleware/error.middleware.js') });
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    return (route, options) => fetch(`http://127.0.0.1:${server.address().port}${route}`, options);
}
test('login limiter permits normal attempts then returns generic 429; forwarded IP spoofing cannot bypass it', async t => {
    const request = await application(t, 2);
    for (let index = 0; index < 3; index++) {
        const response = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        assert.equal(response.status, index < 2 ? 401 : 429);
        if (index === 2) { assert.deepEqual(await response.json(), { message: 'Too many login attempts. Please try again later.' }); assert.ok(response.headers.get('retry-after')); }
    }
    // Express trusts no proxy by default; forwarded IP input does not change its client IP.
    const spoofed = await request('/api/auth/login', { method: 'POST', headers: { 'X-Forwarded-For': '203.0.113.99' } });
    assert.equal(spoofed.status, 429);
    assert.equal((await request('/')).status, 200);
});
test('actual app enforces production CORS, headers and generic server errors', async t => {
    const request = await application(t);
    const allowed = await request('/', { headers: { Origin: production.CLIENT_URL } });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), production.CLIENT_URL);
    assert.equal(allowed.headers.get('access-control-allow-credentials'), null);
    assert.equal(allowed.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(allowed.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(allowed.headers.get('referrer-policy'), 'no-referrer');
    assert.match(allowed.headers.get('strict-transport-security'), /max-age=31536000/);
    assert.ok(allowed.headers.get('content-security-policy'));
    assert.equal(allowed.headers.get('cache-control'), 'no-store');
    assert.equal(allowed.headers.get('x-powered-by'), null);
    const denied = await request('/', { headers: { Origin: 'https://unexpected.example.invalid' } });
    assert.equal(denied.status, 403); assert.equal(denied.headers.get('access-control-allow-origin'), null);
    assert.equal((await request('/')).status, 200);
    const failure = await request('/api/business/failure');
    assert.equal(failure.status, 500);
    assert.deepEqual(await failure.json(), { success: false, message: 'Internal Server Error' });
});
test('actual login and business JSON parsers enforce distinct body limits', async t => {
    const request = await application(t);
    const post = size => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'a'.repeat(size) }) });
    assert.equal((await request('/api/auth/login', post(17000))).status, 413);
    assert.equal((await request('/api/business/fixture', post(17000))).status, 200);
    const oversized = await request('/api/business/fixture', post(1024 * 1024));
    assert.equal(oversized.status, 413);
    assert.deepEqual(await oversized.json(), { success: false, message: 'Invalid request' });
    assert.equal((await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
});
