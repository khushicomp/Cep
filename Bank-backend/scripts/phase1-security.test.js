const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('login keeps response shape and signs a ten-hour token without logging rows', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../controllers/auth.controller.js'), 'utf8');
    let signed;
    const logs = [];
    const context = { exports: {}, process: { env: { JWT_SECRET: 'test-only' } },
        console: { log: (...args) => logs.push(args), error: (...args) => logs.push(args) },
        require: name => ({
            '../config/db': { query: (_sql, _params, callback) => callback(null, [{
                user_id: 1, role: 'MANAGER', is_active: 1, password: 'test-hash', branch_id: 2
            }]) },
            bcryptjs: { compare: async () => true },
            jsonwebtoken: { sign: (payload, _secret, options) => { signed = { payload, options }; return 'test-token'; } }
        })[name]
    };
    vm.runInNewContext(source, context);
    const body = await new Promise(resolve => context.exports.login({ body: { email: 'test@example.invalid', password: 'test-only' } }, { json: resolve }));
    assert.equal(signed.options.expiresIn, '10h');
    assert.equal(body.role, 'MANAGER');
    assert.equal(body.token, 'test-token');
    assert.equal(body.user.password, undefined);
    assert.deepEqual(logs, []);
});

test('controller database failures never serialize driver secrets', async () => {
    // Legacy task/report/user/debug controllers were removed in Phase 5A.
    // Preserve the core business error-disclosure assertions.
    for (const name of ['business']) {
        const source = fs.readFileSync(path.join(__dirname, `../controllers/${name}.controller.js`), 'utf8');
        const context = { exports: {}, console: { error() {} }, require: module => module === '../services/business-report.service' ? require(module) : module === 'bcryptjs' ? {} : {
            promise: () => ({ query: async () => { throw new Error('private SQL error'); } }),
            query: (...args) => args.at(-1)({ sql: 'private SQL', sqlMessage: 'private value', password: 'private hash' })
        } };
        vm.runInNewContext(source, context);
        const method = 'getHistory';
        let status, body;
        await context.exports[method]({ user: { user_id: 1, branch_id: 1, role: 'MANAGER' }, branchFilter: {} }, {
            status(value) { status = value; return this; }, json(value) { body = value; }
        });
        assert.equal(status, 500);
        assert.doesNotMatch(JSON.stringify(body), /private|sqlMessage|password/);
    }
});

test('toast renders hostile HTML as text and retains timing/classes', () => {
    const elements = [], timers = [];
    function element(tag) {
        return { tag, children: [], style: {}, classList: { add() {}, remove() {} },
            appendChild(child) { this.children.push(child); }, append(...children) { this.children.push(...children); },
            remove() {}, set innerHTML(_value) { throw new Error('HTML injection sink used'); }
        };
    }
    const document = { createElement: element, createTextNode: text => ({ text }),
        body: { appendChild: el => elements.push(el) }, getElementById: () => null };
    const context = { document, setTimeout: (callback, delay) => timers.push({ callback, delay }) };
    const source = fs.readFileSync(path.join(__dirname, '../../frontend/src/utils/toast.js'), 'utf8').replaceAll('export function', 'function');
    vm.runInNewContext(source, context);
    const payload = '<img src=x onerror=alert(1)>';
    context.showToast(payload);
    assert.equal(elements[0].children[1].text, payload);
    assert.equal(elements[0].className, 'toast toast-success');
    assert.deepEqual(timers.map(t => t.delay), [100, 3000]);
    context.showLoading();
    assert.equal(elements[1].children[1].textContent, 'Processing...');
});

test('application mounts no debug routes and loads without opening database connections', () => {
    const app = require('../app');
    const db = require('../config/db');
    assert.equal(db._allConnections.length, 0);
    const mountedRoutes = app.router.stack.flatMap(layer => layer.handle?.stack || [])
        .filter(layer => layer.route).map(layer => layer.route.path);
    assert.ok(mountedRoutes.includes('/login'));
    assert.equal(mountedRoutes.includes('/db-test'), false);
    assert.equal(mountedRoutes.includes('/test'), false);
    db.end();
});
