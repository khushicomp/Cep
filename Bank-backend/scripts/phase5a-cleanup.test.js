const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');

test('application mounts only auth/business APIs, with all report operations preserved', () => {
    const mounts = [];
    const app = { use(...args) { if (typeof args[0] === 'string') mounts.push(args[0]); }, get() {}, set() {}, disable() {} };
    const context = { module: { exports: {} }, process: { env: {} }, require(name) {
        if (name === 'express') return Object.assign(() => app, { json: () => () => {} });
        if (name === 'dotenv') return { config() {} };
        if (name === './config/security') return { validateEnvironment: () => ({ production: false, origins: ['http://localhost:5173'], trustProxy: false }), corsOptions: () => ({}) };
        if (name === 'cors' || name === 'helmet') return () => () => {};
        if (name === './middleware/error.middleware') return { errorHandler() {} };
        if (name === './services/runtime-health') return require('../services/runtime-health');
        if (name === './config/db') return { promise: () => ({}) };
        assert.ok(['./routes/auth.routes', './routes/business.routes'].includes(name), `Unexpected runtime module ${name}`);
        return {};
    } };
    vm.runInNewContext(read('Bank-backend/app.js'), context);
    assert.deepEqual(mounts, ['/api/auth', '/api/business']);
    const routes = read('Bank-backend/routes/business.routes.js');
    for (const route of ['/daily-entry','/entry/:id','/entry/:id/submit','/entry/:id/final-lock','/entry/:id/unlock-request',
        '/entry/:id/unlock-approve','/entry/:id/unlock-reject','/entry/:id/audit-history','/head-office/daily-overview','/reports']) assert.ok(routes.includes(`"${route}"`));
});

test('current dashboard navigation retains business components without legacy API calls or employee routes', () => {
    const manager = read('frontend/src/pages/ManagerDashboard.jsx');
    const central = read('frontend/src/pages/AdminDashboard.jsx');
    assert.ok(manager.includes('<DynamicEntryTable />'));
    assert.ok(central.includes('<AdminBusinessReports />')); assert.ok(central.includes('<AdminBusinessAnalytics />'));
    for (const source of [manager, central, read('frontend/src/App.jsx'), read('frontend/src/pages/Login.jsx')]) {
        assert.doesNotMatch(source, /employee_tasks|\/employee["']|\/tasks\/|\/reports\/|\/users\/|taskService/);
    }
    assert.match(read('frontend/src/pages/Login.jsx'), /no supported reporting workspace/);
});

test('historical schema utilities refuse execution before any module or database access', () => {
    for (const file of ['migrations.js','setup_branches.js','setup_db_business.js']) {
        const module = { exports: {} };
        const requireStub = () => { throw new Error('Unexpected module/database access'); };
        requireStub.main = module;
        assert.throws(() => vm.runInNewContext(read(`Bank-backend/${file}`), { module, require: requireStub, process: { argv: ['node', file] } }), /Historical utility disabled/);
    }
});
