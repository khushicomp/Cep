// Optional isolated browser check: node scripts/ui-smoke.mjs
// Requires locally installed Edge/Chromium (BROWSER_PATH may override). No package added.
// Every API request is intercepted. Nothing is sent to a live backend/database.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = process.env.UI_ROOT || fileURLToPath(new URL('../', import.meta.url));
const browserPath = process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
assert.ok(existsSync(browserPath), 'Set BROWSER_PATH to a locally installed Chromium browser.');
const artifacts = await mkdtemp(path.join(tmpdir(), 'bank-phase5c-ui-'));
const profile = path.join(artifacts, 'browser-profile');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = await createServer({ root, cacheDir: path.join(artifacts, 'node_modules', '.vite'), logLevel: 'error', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
browser.unref();
let socket;
const pending = new Map();
const runtimeErrors = [];
const calls = [];
let sequence = 0;
let failManager = false;
let failOverview = false;
let failHistory = false;
let credentialFailure = false;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const item = { id: 1, srNo: 1, accountType: 'Savings Account (SB)', status: 'Opened', amount: '12345.67', remark: 'Synthetic browser fixture' };
let manager = { id: 900, branch_id: 1, branch_name: 'Fixture Branch 01', entry_date: today, status: 'DRAFT', unlock_requested: 0, total_amount: '12345.67', entries: [{ ...item }] };
const states = ['NOT_STARTED', 'DRAFT', 'SUBMITTED', 'CORRECTION_PENDING', 'FINAL_LOCKED', 'UNKNOWN'];
const branches = Array.from({ length: 38 }, (_, index) => {
  const status = states[index % states.length];
  return { branch_id: index + 1, branch_name: `Fixture Branch ${String(index + 1).padStart(2, '0')}`, branch_code: `FX${String(index + 1).padStart(2, '0')}`, branch_district: 'Synthetic district', display_status: status,
    status: status === 'CORRECTION_PENDING' ? 'SUBMITTED' : status, unlock_requested: status === 'CORRECTION_PENDING' ? 1 : 0,
    unlock_reason: status === 'CORRECTION_PENDING' ? 'Please correct the entered amount.' : null,
    entry_id: status === 'NOT_STARTED' ? null : index + 1001, total_entries: status === 'NOT_STARTED' ? 0 : 1,
    total_amount: status === 'NOT_STARTED' ? '0.00' : '12345.67', submitted_at: ['SUBMITTED', 'CORRECTION_PENDING', 'FINAL_LOCKED'].includes(status) ? `${today} 10:15:00` : null };
});
function overview(date) {
  const keys = { NOT_STARTED: 'notStarted', DRAFT: 'draft', SUBMITTED: 'submitted', CORRECTION_PENDING: 'correctionPending', FINAL_LOCKED: 'finalLocked', UNKNOWN: 'unknown' };
  const summary = { totalBranches: 38, notStarted: 0, draft: 0, submitted: 0, correctionPending: 0, finalLocked: 0, unknown: 0, reportedBranches: 0, totalEntries: 0, totalAmount: '0.00' };
  for (const branch of branches) { summary[keys[branch.display_status]]++; if (branch.entry_id !== null) { summary.reportedBranches++; summary.totalEntries++; } }
  summary.totalAmount = (summary.totalEntries * 12345.67).toFixed(2);
  return { date, summary, branches };
}
function api(url, method, body, headers = {}) {
  const route = url.pathname;
  calls.push({ route, method });
  if (['/api/auth/forgot-password','/api/auth/setup-password','/api/auth/reset-password'].includes(route)) {
    assert.ok(!Object.keys(headers).some(key => key.toLowerCase() === 'authorization'), 'Recovery requests must not attach bearer tokens');
    if (route.endsWith('/forgot-password')) return [202, { message: 'If this account is eligible, password reset instructions will be emailed.' }];
    assert.ok(typeof body.token === 'string' && body.token.length === 43, 'Credential sent only to completion endpoint');
    assert.equal(body.password, body.confirmPassword);
    return credentialFailure ? [400, { message: 'This link is invalid or expired. Request a new link.' }] : [200, { message: 'Password saved. Sign in with your new password.' }];
  }
  if (route === '/api/auth/login') {
    if (body.password !== 'synthetic-browser-password') return [401, { message: 'Invalid credentials' }];
    const role = body.email === 'office@example.invalid' ? 'HEAD_OFFICE' : 'MANAGER';
    return [200, { token: 'synthetic-ui-token', role, user: { name: 'Fixture User', branch_name: 'Fixture Branch 01', branch_code: 'FX01' } }];
  }
  if (route.endsWith('/my-entries')) return failManager ? [503, { message: 'Synthetic unavailable' }] : [200, url.searchParams.get('date') === today ? manager : null];
  if (route.endsWith('/head-office/daily-overview')) return failOverview ? [503, {}] : [200, overview(url.searchParams.get('date'))];
  if (route.endsWith('/audit-history')) return [200, [{ id: 1, action: 'SUBMIT', actor_name: 'Fixture Manager', actor_role: 'MANAGER', previous_state: { status: 'DRAFT' }, new_state: { status: 'SUBMITTED' }, created_at: `${today} 10:15:00` },
    { id: 2, action: 'UNLOCK_REJECT', actor_name: 'Fixture Head Office', actor_role: 'HEAD_OFFICE', previous_state: { status: 'SUBMITTED', unlock_requested: 1 }, new_state: { status: 'SUBMITTED', unlock_requested: 0 }, requested_reason: '<script>fixture</script>', reason: 'Synthetic decision note', created_at: `${today} 11:15:00` }]];
  if (route.endsWith('/history') || route.includes('/branch-history/')) return failHistory ? [503, {}] : [200, [{ id: 900, entry_date: today, status: manager.status, total_amount: manager.total_amount }]];
  if (route.includes('/branch/')) {
    const branch = branches.find(b => b.branch_id === Number(route.split('/').at(-1)));
    return branch?.entry_id ? [200, { ...branch, id: branch.entry_id, entry_date: url.searchParams.get('date'), manager_name: 'Fixture Manager', entries: [{ ...item }] }] : [404, {}];
  }
  if (route.endsWith('/reports')) return [200, { overall: { totalBusiness: '1234567890123456.78', totalAccountsOpened: 38 }, breakdown: [{ account_type: 'Savings Account (SB)', count: 38, amount: '1234567890123456.78' }] }];
  if (route.includes('/entry/') && method !== 'GET') {
    const id = Number(route.split('/')[4]);
    if (id === 900) {
      if (route.endsWith('/unlock-request')) manager = { ...manager, unlock_requested: 1, unlock_reason: body.reason };
      else if (method === 'DELETE') manager = null;
      else manager = { ...manager, status: body.status.toUpperCase(), entries: body.entries, total_amount: String(body.totalAmount) };
      return [200, manager || {}];
    }
    const branch = branches.find(b => b.entry_id === id);
    assert.ok(branch, 'Mutation must reference a synthetic report');
    if (route.endsWith('/final-lock')) { branch.status = 'FINAL_LOCKED'; branch.display_status = 'FINAL_LOCKED'; }
    if (route.endsWith('/unlock-approve')) { branch.status = 'DRAFT'; branch.display_status = 'DRAFT'; branch.unlock_requested = 0; }
    if (route.endsWith('/unlock-reject')) { branch.display_status = 'SUBMITTED'; branch.unlock_requested = 0; }
    return [200, branch];
  }
  if (route.endsWith('/daily-entry')) { manager = { ...manager, id: 900, status: body.status.toUpperCase(), entries: body.entries }; return [201, { entryId: 900 }]; }
  throw new Error(`Unexpected synthetic API route: ${method} ${route}`);
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timeout }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + result.result?.description);
  return result.result.value;
}
async function wait(expression) {
  for (let i = 0; i < 150; i++) { if (await evaluate(`Boolean(${expression})`)) return; await delay(100); }
  throw new Error(`UI condition timed out: ${expression}`);
}
async function click(text, scope = 'document') {
  await evaluate(`(() => { const button = [...${scope}.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!button || button.disabled) throw new Error('Button unavailable: ' + ${JSON.stringify(text)}); button.focus(); button.click(); })()`);
}
async function fill(selector, value) {
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const prototype = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); })()`);
}
async function role(value) {
  await send('Page.navigate', { url: origin });
  await wait("document.querySelector('#email')");
  await fill('#email', value === 'HEAD_OFFICE' ? 'office@example.invalid' : 'manager@example.invalid');
  await fill('#password', 'synthetic-browser-password');
  await click('Sign In');
  await wait(value === 'MANAGER' ? "document.querySelector('.entry-table')" : "document.querySelector('.branch-register')");
}
async function screenshot(name, width) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
  await delay(100);
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(path.join(artifacts, `${name}-${width}.png`), Buffer.from(result.data, 'base64'));
  const overflow = await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth, elements:[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth && getComputedStyle(el).position!=='fixed').slice(0,8).map(el=>[el.tagName,el.className,Math.round(el.getBoundingClientRect().right)])})`);
  if (name !== 'login') assert.ok(overflow.scroll <= overflow.width, `No page overflow at ${width}px: ${JSON.stringify(overflow)}; screenshot ${artifacts}`);
}

try {
  let port;
  for (let i = 0; i < 150; i++) {
    try { port = Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await delay(100); }
  }
  assert.ok(port, 'Browser started with an isolated temporary profile');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  socket.addEventListener('message', async event => {
    const data = JSON.parse(event.data);
    if (data.id) { const call = pending.get(data.id); if (!call) return; clearTimeout(call.timeout); pending.delete(data.id); data.error ? call.reject(new Error(data.error.message)) : call.resolve(data.result); return; }
    if (data.method === 'Runtime.exceptionThrown') runtimeErrors.push(data.params.exceptionDetails.text);
    if (data.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = data.params;
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) {
        const [code, response] = api(url, request.method, request.postData ? JSON.parse(request.postData) : {}, request.headers);
        await send('Fetch.fulfillRequest', { requestId, responseCode: code, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(response)).toString('base64') });
      } else if (url.origin === origin) await send('Fetch.continueRequest', { requestId });
      else await send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
    } catch (error) {
      // Navigation can cancel an intercepted request before its response is sent.
      if (/Invalid state|Invalid InterceptionId/.test(error.message)) return;
      runtimeErrors.push(error.message);
      await send('Fetch.failRequest', { requestId, errorReason: 'Failed' }).catch(() => {});
    }
  });
  await send('Page.enable'); await send('Runtime.enable'); await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Page.navigate', { url: origin }); await wait("document.querySelector('#email')");
  // Freeze only the test screenshots, so Phase 5B's animations compare deterministically.
  await evaluate("(() => {const style=document.createElement('style');style.textContent='.login-container *, .login-container *::before, .login-container *::after { animation: none !important; transition: none !important; }';document.head.append(style);})()");
  const loginSnapshots = {};
  for (const width of [1440, 1024, 768]) {
    await screenshot('login', width);
    loginSnapshots[width] = await evaluate(`([...document.querySelectorAll('.login-container, .login-container *')].map(el => ({tag:el.tagName, id:el.id, className:el.getAttribute('class'), styles:[null,'::before','::after'].map(pseudo=>{const style=getComputedStyle(el,pseudo);return Object.fromEntries([...style].map(key=>[key,style.getPropertyValue(key).replaceAll(location.origin,'ORIGIN')]));})})))`);
  }
  await writeFile(path.join(artifacts, 'login-styles.json'), JSON.stringify(loginSnapshots));
  console.log('LOGIN comparison artifacts: ' + artifacts);
  if (!process.env.LOGIN_ONLY) {
  // Synthetic recovery browser checks: existing session must never enter recovery HTTP requests.
  await evaluate("localStorage.setItem('token','synthetic-stale-token')");
  await evaluate("document.querySelector('.login-recovery-link').click()");
  await wait("document.querySelector('#recovery-email')");
  for (const width of [1440, 1024, 768, 390]) await screenshot('forgot-password', width);
  await fill('#recovery-email', 'unknown@example.invalid'); await click('Request reset link');
  await wait("document.querySelector('[role=status]')");
  assert.ok(await evaluate("document.body.textContent.includes('If this account is eligible')"));
  for (const mode of ['setup','reset']) {
    await send('Page.navigate', { url: `${origin}/${mode}-password#token=${'a'.repeat(43)}` });
    await wait("document.querySelector('#new-password')");
    await wait("location.hash === ''");
    assert.equal(await evaluate("Object.values(localStorage).some(value => value.includes('a'.repeat(43)))"), false);
    for (const width of [1440, 1024, 768, 390]) await screenshot(`${mode}-password`, width);
    await fill('#new-password', 'a synthetic browser passphrase'); await fill('#confirm-password', 'different'); await click('Save password');
    await wait("document.querySelector('[role=alert]')");
    await fill('#confirm-password', 'a synthetic browser passphrase');
    credentialFailure = true; await click('Save password');
    await wait("document.querySelector('[role=alert]')?.textContent.includes('invalid or expired')");
    credentialFailure = false; await click('Save password'); await wait("document.querySelector('[role=status]')");
    assert.equal(await evaluate("document.querySelector('#new-password')"), null);
  }
  await send('Page.navigate', { url: `${origin}/setup-password` });
  await wait("document.querySelector('.credential-page [role=alert]')");
  assert.ok(await evaluate("document.body.textContent.includes('authorized account operator')"));
  await evaluate('localStorage.clear()');
  console.log('PASS setup/reset/forgot UI, generic responses, confirmation, expired links and unauthenticated requests');
  await role('MANAGER');
  for (const width of [1440, 1024, 768, 390]) await screenshot('manager', width);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await click('+ Add row'); assert.equal(await evaluate("document.querySelectorAll('.entry-table tbody tr').length"), 2);
  await click('Remove'); await wait("document.querySelector('dialog[open]')");
  assert.equal(await evaluate('document.activeElement.textContent'), 'Cancel');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await wait("!document.querySelector('dialog[open]')"); assert.equal(await evaluate("document.querySelectorAll('.entry-table tbody tr').length"), 2);
  assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"), 'Remove row 1');
  // Remove the blank second row, confirming persistence of the remaining draft.
  await evaluate("document.querySelector('button[aria-label=\"Remove row 2\"]').click()");
  await wait("document.querySelector('dialog[open]')"); await click('Remove row', "document.querySelector('dialog')");
  await wait("document.querySelectorAll('.entry-table tbody tr').length === 1");
  await click('Submit report'); await wait("document.querySelector('dialog[open]')");
  await screenshot('submit-dialog', 1440); await click('Submit report', "document.querySelector('dialog')");
  await wait("document.querySelector('.report-state.state-submitted')");
  assert.equal(await evaluate("document.querySelectorAll('.entry-table input').length"), 0);
  await click('Request correction'); await wait("document.querySelector('dialog[open]')");
  await click('Send correction request', "document.querySelector('dialog')"); await wait("document.querySelector('.field-error')");
  await fill('dialog textarea', '  Please correct this synthetic report.  ');
  await click('Send correction request', "document.querySelector('dialog')");
  await wait("document.querySelector('.report-state.state-correction_pending')");
  assert.equal(manager.unlock_reason, 'Please correct this synthetic report.');
  failManager = true; await click('Refresh'); await wait("document.querySelector('.ops-error')");
  assert.equal(await evaluate("document.querySelectorAll('.entry-table').length"), 0);
  failManager = false; await click('Retry'); await wait("document.querySelector('.entry-table')");
  await click('Previous'); await wait("document.querySelector('.report-state.state-not_started')");
  await click('Next'); await wait("document.querySelector('.report-state.state-correction_pending')");
  manager = { ...manager, status: 'DRAFT', unlock_requested: 0 };
  await click('Refresh'); await wait("document.querySelector('.report-state.state-draft')");
  assert.ok(await evaluate("document.querySelectorAll('.entry-table input').length > 0"));
  manager = { ...manager, status: 'FINAL_LOCKED' };
  await click('Refresh'); await wait("document.querySelector('.report-state.state-final_locked')");
  assert.equal(await evaluate("document.querySelectorAll('.entry-table input').length"), 0);
  console.log('PASS Manager draft rows, confirmation, read-only submit, correction reason, date and retry flows');

  await role('HEAD_OFFICE');
  assert.equal(await evaluate("document.querySelectorAll('.branch-register tbody tr').length"), 38);
  for (const width of [1440, 1024, 768, 390]) await screenshot('head-office', width);
  await click('Previous'); await wait("document.querySelector('.branch-register')");
  await click('Next'); await wait("document.querySelector('.branch-register')");
  const historicalDate = '2026-09-01';
  await fill('input[type=date]', historicalDate); await wait("document.querySelector('.register-caption') && document.querySelector('.section-heading p').textContent.includes('2026-09-01')");
  await fill('input[type=date]', today); await wait(`document.querySelector('.register-caption') && document.querySelector('.section-heading p').textContent.includes(${JSON.stringify(today)})`);
  await fill('input[type=search]', 'FX04'); await wait("document.querySelectorAll('.branch-register tbody tr').length === 1");
  await click('View report'); await wait("document.querySelector('.decision-panel')");
  assert.ok(!await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='Final lock report')"));
  await screenshot('correction-detail', 1440);
  await click('Approve correction'); await wait("document.querySelector('dialog[open]')"); await click('Approve correction', "document.querySelector('dialog')");
  await wait("document.querySelector('.report-state.state-draft')");
  await click('Back to all branches'); await wait("document.querySelector('.branch-register')");
  await fill('input[type=search]', 'FX10'); await wait("document.querySelectorAll('.branch-register tbody tr').length === 1");
  await click('View report'); await wait("document.querySelector('.decision-panel')");
  await click('Reject correction'); await wait("document.querySelector('dialog[open]')");
  await fill('dialog textarea', 'Reviewed; no correction needed.'); await click('Reject correction', "document.querySelector('dialog')");
  await wait("document.querySelector('.report-state.state-submitted')");
  await click('Final lock report'); await wait("document.querySelector('dialog[open]')"); await click('Cancel', "document.querySelector('dialog')");
  assert.equal(branches[9].status, 'SUBMITTED');
  await click('Final lock report'); await wait("document.querySelector('dialog[open]')"); await click('Final lock report', "document.querySelector('dialog')");
  await wait("document.querySelector('.report-state.state-final_locked')");
  await wait("document.querySelector('.audit-reason')");
  assert.equal(await evaluate("document.querySelector('.audit-reason script')"), null);
  await click('Back to all branches'); await wait("document.querySelector('.branch-register')");
  await fill('input[type=search]', 'no matching branch'); await wait("document.querySelector('.ops-empty')");
  await click('Clear filters'); await wait("document.querySelectorAll('.branch-register tbody tr').length === 38");
  await evaluate("[...document.querySelectorAll('.status-filters button')].find(b => b.textContent.startsWith('Not started')).click()");
  assert.equal(await evaluate("document.querySelectorAll('.branch-register button').length"), 0);
  await click('Clear filters');
  await click('Review unknown reports');
  assert.ok(await evaluate("[...document.querySelectorAll('.branch-register .report-status')].every(el=>el.classList.contains('state-unknown'))"));
  await click('Clear filters');
  failOverview = true; await click('Refresh'); await wait("document.querySelector('.ops-error')");
  failOverview = false; await click('Retry'); await wait("document.querySelector('.branch-register')");
  await click('Business analytics'); await wait("document.querySelector('.analytics-summary')"); await screenshot('analytics', 1440);
  assert.ok(await evaluate("document.querySelector('.metric-value').textContent.includes('1,23,45,67,89,01,23,456.78')"));
  await click('Log out'); await wait("document.querySelector('#email')");
  assert.equal(await evaluate("localStorage.getItem('token')"), null);
  assert.deepEqual(runtimeErrors, []);
  assert.ok(calls.every(call => call.route.startsWith('/api/business/') || ['/api/auth/login','/api/auth/forgot-password','/api/auth/setup-password','/api/auth/reset-password'].includes(call.route)));
  console.log('PASS Head Office 38 branches, search/status filters, correction decisions, final lock, audit text, analytics and logout');
  console.log('PASS no page overflow at 1440/1024/768/390px; no browser runtime exceptions');
  console.log('Screenshots (synthetic data only): ' + artifacts);
  }
} finally {
  if (socket?.readyState === WebSocket.OPEN) await send('Browser.close').catch(() => {});
  socket?.close();
  for (const call of pending.values()) clearTimeout(call.timeout);
  browser.kill(); server.ws.close(); server.httpServer.closeAllConnections(); await server.close();
}
