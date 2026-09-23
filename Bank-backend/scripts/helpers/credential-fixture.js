const { DatabaseSync } = require('node:sqlite');
const { createCredentialService } = require('../../services/credential.service');
const { createProvisioningService } = require('../../services/account-provisioning.service');
const { createMailService } = require('../../services/credential-mail.service');

function credentialFixture() {
    const db = new DatabaseSync(':memory:');
    let now = new Date('2026-09-23T10:00:00Z');
    const stamp = date => date.toISOString().replace('T',' ').replace('Z','');
    db.function('utc_now', () => stamp(now));
    db.function('utc_add', seconds => stamp(new Date(now.getTime() + Number(seconds)*1000)));
    db.exec(`PRAGMA foreign_keys=ON;
        CREATE TABLE branches (branch_id INTEGER PRIMARY KEY,branch_code TEXT UNIQUE,branch_name TEXT,branch_email TEXT,branch_type TEXT,is_active INTEGER);
        CREATE TABLE users (user_id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,email TEXT UNIQUE,password TEXT,role TEXT,branch_id INTEGER REFERENCES branches(branch_id),
            branch_code TEXT,branch_name TEXT,is_active INTEGER,account_state TEXT,auth_version INTEGER,password_changed_at TEXT);
        CREATE TABLE account_action_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER REFERENCES users(user_id),purpose TEXT,token_hash BLOB UNIQUE,auth_version INTEGER,created_at TEXT,expires_at TEXT,used_at TEXT,revoked_at TEXT);
        CREATE TABLE account_security_events (id INTEGER PRIMARY KEY AUTOINCREMENT,subject_user_id INTEGER REFERENCES users(user_id),actor_user_id INTEGER REFERENCES users(user_id),actor_source TEXT,operator_reference TEXT,action TEXT,created_at TEXT);
        INSERT INTO branches VALUES (38,'AUCB038','Wani Branch','wani@example.invalid','Branch',1),(1,'AUCB001','Administrative Office','office@example.invalid','Administrative Office',1),(37,'AUCB037','Pune Branch','pune@example.invalid','Branch',1);`);
    const queries = [], messages = [];
    let failMail = false, failEvent = false;
    let tail = Promise.resolve();
    async function query(sql, values = []) {
        queries.push(sql); // SQL only, never bound values.
        if (failEvent && sql.includes('INSERT INTO account_security_events')) throw new Error('Synthetic event failure');
        const statement = sql.replace(/ FOR UPDATE/g, '')
            .replace(/DATE_ADD\(UTC_TIMESTAMP\(6\), INTERVAL \? SECOND\)/g, 'utc_add(?)')
            .replace(/DATE_SUB\(UTC_TIMESTAMP\(6\), INTERVAL 60 SECOND\)/g, 'utc_add(-60)')
            .replace(/UTC_TIMESTAMP\(6\)/g, 'utc_now()');
        if (/^\s*SELECT/.test(statement)) return [db.prepare(statement).all(...values)];
        const result = db.prepare(statement).run(...values);
        return [{ insertId: Number(result.lastInsertRowid), affectedRows: Number(result.changes) }];
    }
    const promisePool = { query, async getConnection() {
        let release;
        return { query, async beginTransaction() {
            const previous = tail; tail = new Promise(resolve => { release = resolve; });
            await previous; db.exec('BEGIN');
        }, async commit() { db.exec('COMMIT'); }, async rollback() { db.exec('ROLLBACK'); }, release() { release?.(); }, destroy() {} };
    } };
    const pool = { promise: () => promisePool };
    const mail = createMailService({ NODE_ENV: 'test', CREDENTIAL_APP_ORIGIN: 'https://reporting.example.invalid' }, {
        async send(message) { if (failMail) throw new Error('Synthetic mail failure'); messages.push(message); }
    });
    const service = createCredentialService(pool, mail, { setupSeconds: 86400, resetSeconds: 1800, bcryptCost: 4 });
    const operator = createProvisioningService(pool, service, mail, 'example.invalid');
    const invite = { action: 'invite', branchCode: 'AUCB038', email: 'wani@example.invalid', name: 'Wani Branch', role: 'MANAGER', operator: 'fixture-operator' };
    const apply = { apply: true, sendEmail: true, mailboxVerified: true };
    return { db, pool, mail, service, operator, invite, apply, queries, messages,
        token() { const match = messages.at(-1)?.text.match(/#token=([A-Za-z0-9_-]{43})/); if (!match) throw new Error('Missing synthetic message'); return match[1]; },
        async provision() { return operator.run(invite, apply); },
        advance(seconds) { now = new Date(now.getTime() + seconds*1000); },
        failMail(value = true) { failMail = value; }, failEvent(value = true) { failEvent = value; },
        close() { db.close(); }
    };
}
module.exports = { credentialFixture };
