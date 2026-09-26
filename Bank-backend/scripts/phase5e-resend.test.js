const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomBytes } = require('node:crypto');
const { createMailService } = require('../services/credential-mail.service');

// Synthetic runtime-only values; no provider credential and no real HTTP transport.
function config() {
    return { NODE_ENV: 'production', CREDENTIAL_MAIL_TRANSPORT: 'resend',
        CREDENTIAL_APP_ORIGIN: 'https://reporting.example.invalid',
        CREDENTIAL_RESEND_API_KEY: randomBytes(24).toString('hex'),
        CREDENTIAL_MAIL_FROM: 'reporting@example.invalid',
        CREDENTIAL_MAIL_ALLOWED_RECIPIENTS: 'pilot@example.invalid' };
}
function message(purpose = 'SETUP') {
    return { email: 'pilot@example.invalid', name: 'Synthetic branch', purpose,
        token: randomBytes(32).toString('base64url'), expiresSeconds: purpose === 'SETUP' ? 86400 : 1800 };
}
function stub(t, handler) {
    const calls = [];
    t.mock.method(global, 'fetch', async (...args) => { calls.push(args); return handler(...args); });
    return calls;
}
const ok = () => ({ ok: true, body: { cancel: async () => {} } });

for (const purpose of ['SETUP', 'RESET']) test(`Resend ${purpose} uses shared message and exact official request`, async t => {
    const env = config(), input = message(purpose);
    let cancelled = false;
    const calls = stub(t, () => ({ ok: true, body: { cancel: async () => { cancelled = true; } } }));
    const mail = createMailService(env);
    assert.equal(mail.configured, true);
    await mail.sendCredential(input);
    assert.equal(calls.length, 1);
    const [endpoint, options] = calls[0], body = JSON.parse(options.body);
    assert.equal(endpoint, 'https://api.resend.com/emails');
    assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    assert.ok(options.headers.Authorization === `Bearer ${env.CREDENTIAL_RESEND_API_KEY}`);
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.deepEqual(Object.keys(body).sort(), ['from','subject','text','to']);
    assert.equal(body.from, env.CREDENTIAL_MAIL_FROM); assert.deepEqual(body.to, [input.email]);
    const action = purpose === 'SETUP' ? 'Set up your password' : 'Reset your password';
    assert.equal(body.subject, `Branch reporting: ${action}`);
    assert.ok(body.text.includes(`/${purpose === 'SETUP' ? 'setup' : 'reset'}-password#token=${input.token}`));
    assert.ok(body.text.includes(`expires in ${input.expiresSeconds / 60} minutes`));
    assert.ok(body.text.startsWith('Synthetic branch\n\n')); assert.equal(cancelled, true);
    assert.ok(!body.text.includes(env.CREDENTIAL_RESEND_API_KEY));
});

test('recipient normalization permits only explicit members; unauthorized recipient never reaches HTTP', async t => {
    const calls = stub(t, ok), env = config();
    env.CREDENTIAL_MAIL_ALLOWED_RECIPIENTS = ' PILOT@EXAMPLE.INVALID , second@example.invalid ';
    const mail = createMailService(env);
    await assert.rejects(mail.sendCredential({ ...message(), email: 'outside@example.invalid' }), /not authorized/);
    assert.equal(calls.length, 0);
    await mail.sendCredential({ ...message(), email: ' PILOT@EXAMPLE.INVALID ' });
    assert.equal(calls.length, 1);
});

const badConfigs = [
    ['missing key', { CREDENTIAL_RESEND_API_KEY: undefined }],
    ['empty key', { CREDENTIAL_RESEND_API_KEY: '' }],
    ['whitespace key', { CREDENTIAL_RESEND_API_KEY: ' ' }],
    ['header injection', { CREDENTIAL_RESEND_API_KEY: 'synthetic\r\nvalue' }],
    ['missing sender', { CREDENTIAL_MAIL_FROM: undefined }],
    ['bad sender', { CREDENTIAL_MAIL_FROM: 'invalid' }],
    ['empty allowlist', { CREDENTIAL_MAIL_ALLOWED_RECIPIENTS: '' }],
    ['missing allowlist', { CREDENTIAL_MAIL_ALLOWED_RECIPIENTS: undefined }],
    ['wildcard', { CREDENTIAL_MAIL_ALLOWED_RECIPIENTS: '*' }],
    ['domain wildcard', { CREDENTIAL_MAIL_ALLOWED_RECIPIENTS: '*@example.invalid' }],
    ['bad allowlist', { CREDENTIAL_MAIL_ALLOWED_RECIPIENTS: 'not-an-address' }],
    ['missing origin', { CREDENTIAL_APP_ORIGIN: undefined }],
    ['malformed origin', { CREDENTIAL_APP_ORIGIN: 'invalid-private-input' }],
    ['insecure origin', { CREDENTIAL_APP_ORIGIN: 'http://reporting.example.invalid' }],
    ['empty endpoint', { CREDENTIAL_RESEND_ENDPOINT: '' }],
    ['malformed endpoint', { CREDENTIAL_RESEND_ENDPOINT: 'invalid-private-input' }],
    ['insecure endpoint', { CREDENTIAL_RESEND_ENDPOINT: 'http://api.resend.com/emails' }],
    ['different host', { CREDENTIAL_RESEND_ENDPOINT: 'https://elsewhere.example.invalid/emails' }],
    ['endpoint credentials', { CREDENTIAL_RESEND_ENDPOINT: 'https://private@api.resend.com/emails' }],
    ['endpoint query', { CREDENTIAL_RESEND_ENDPOINT: 'https://api.resend.com/emails?private=value' }],
    ['endpoint fragment', { CREDENTIAL_RESEND_ENDPOINT: 'https://api.resend.com/emails#private' }]
];
for (const [label, changes] of badConfigs) test(`Resend fails closed for ${label} before any HTTP`, t => {
    const calls = stub(t, ok), env = { ...config(), ...changes };
    assert.throws(() => createMailService(env), error => {
        assert.ok(!String(error).includes('private'));
        if (env.CREDENTIAL_RESEND_API_KEY?.trim()) assert.ok(!String(error).includes(env.CREDENTIAL_RESEND_API_KEY));
        if (label.includes('key') || label === 'header injection') assert.equal(error.message, 'Resend authorization configuration required');
        return true;
    });
    assert.equal(calls.length, 0);
});

for (const status of [400, 401, 403, 429, 500, 503]) test(`Resend ${status} cannot expose provider body or secrets`, async t => {
    const env = config(), input = message(), logs = [];
    t.mock.method(console, 'error', (...args) => logs.push(args));
    t.mock.method(console, 'log', (...args) => logs.push(args));
    const calls = stub(t, () => ({ ok: false, status, body: { cancel: async () => {} },
        json: async () => { throw new Error('Response body must not be read'); },
        text: async () => { throw new Error('Response body must not be read'); } }));
    await assert.rejects(createMailService(env).sendCredential(input), error => {
        assert.equal(error.message, 'Mail delivery failed'); assert.equal(error.cause, undefined);
        assert.ok(!String(error).includes(env.CREDENTIAL_RESEND_API_KEY) && !String(error).includes(input.token));
        return true;
    });
    assert.equal(calls.length, 1); assert.equal(logs.length, 0);
});
for (const kind of ['network', 'timeout', 'redirect', 'body cancellation']) test(`Resend ${kind} failure is sanitized`, async t => {
    const env = config(), input = message();
    const failure = new Error(env.CREDENTIAL_RESEND_API_KEY + input.token);
    const calls = stub(t, () => {
        if (kind === 'body cancellation') return { ok: true, body: { cancel: async () => { throw failure; } } };
        throw failure;
    });
    await assert.rejects(createMailService(env).sendCredential(input), error => {
        assert.equal(error.message, 'Mail delivery failed'); assert.equal(error.cause, undefined); return true;
    });
    assert.equal(calls.length, 1);
});
test('Resend abort signal uses the bounded ten-second deadline', async t => {
    let timeout;
    t.mock.method(AbortSignal, 'timeout', milliseconds => { timeout = milliseconds; return AbortSignal.abort(); });
    stub(t, (_url, options) => { assert.equal(options.signal.aborted, true); throw new Error('Synthetic aborted request'); });
    await assert.rejects(createMailService(config()).sendCredential(message()), /Mail delivery failed/);
    assert.equal(timeout, 10000);
});
test('disabled and test-injected transports retain behavior without provider requests', async t => {
    const calls = stub(t, () => { throw new Error('Unexpected HTTP'); });
    const disabled = createMailService({}); assert.equal(disabled.configured, false);
    await assert.rejects(disabled.sendCredential(message()), /disabled/);
    const sent = [];
    const injected = createMailService({ NODE_ENV: 'test', CREDENTIAL_APP_ORIGIN: 'https://reporting.example.invalid' }, { send: async value => sent.push(value) });
    await injected.sendCredential(message()); assert.equal(sent.length, 1);
    assert.throws(() => createMailService(config(), { send() {} }), /test-only/);
    assert.equal(calls.length, 0);
});
test('production startup rejects missing Resend configuration before routes or database import', t => {
    const env = { ...config(), CREDENTIAL_RESEND_API_KEY: undefined };
    const calls = stub(t, ok);
    let routesLoaded = false;
    const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    assert.throws(() => vm.runInNewContext(source, { process: { env }, require(name) {
        if (name === 'dotenv') return { config() {} };
        if (name === './config/security') return { validateEnvironment: () => ({}) };
        if (name === './services/credential-mail.service') return { createMailService: () => createMailService(env) };
        if (name.startsWith('./routes')) routesLoaded = true;
        return () => {};
    } }), /Resend authorization configuration required/);
    assert.equal(routesLoaded, false); assert.equal(calls.length, 0);
});
