// Default is read-only inspection. DDL is never part of application startup.
const { createHash } = require('node:crypto');
const path = require('node:path');
class MigrationError extends Error {}
const tableSql = {
    account_action_tokens: `CREATE TABLE account_action_tokens (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    purpose ENUM('SETUP','RESET') NOT NULL,
    token_hash BINARY(32) NOT NULL,
    auth_version INT UNSIGNED NOT NULL,
    created_at DATETIME(6) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    used_at DATETIME(6) NULL,
    revoked_at DATETIME(6) NULL,
    UNIQUE KEY token_hash (token_hash),
    KEY user_purpose (user_id, purpose),
    KEY expires_at (expires_at),
    CONSTRAINT phase5d_token_user_fk FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
    account_security_events: `CREATE TABLE account_security_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    subject_user_id INT NOT NULL,
    actor_user_id INT NULL,
    actor_source VARCHAR(40) NOT NULL,
    operator_reference VARCHAR(100) NULL,
    action VARCHAR(50) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    KEY subject_timeline (subject_user_id, created_at),
    KEY actor (actor_user_id),
    CONSTRAINT phase5d_event_subject_fk FOREIGN KEY (subject_user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT phase5d_event_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
};
const definitions = {
    account_action_tokens: {
        id: ['bigint unsigned', 'NO'], user_id: ['int', 'NO'], purpose: ["enum('SETUP','RESET')", 'NO'],
        token_hash: ['binary(32)', 'NO'], auth_version: ['int unsigned', 'NO'], created_at: ['datetime(6)', 'NO'],
        expires_at: ['datetime(6)', 'NO'], used_at: ['datetime(6)', 'YES'], revoked_at: ['datetime(6)', 'YES']
    },
    account_security_events: {
        id: ['bigint unsigned', 'NO'], subject_user_id: ['int', 'NO'], actor_user_id: ['int', 'YES'],
        actor_source: ['varchar(40)', 'NO'], operator_reference: ['varchar(100)', 'YES'], action: ['varchar(50)', 'NO'], created_at: ['datetime(6)', 'NO']
    }
};
async function prepare(c) {
    const select = async (sql, values = []) => (await c.query(sql, values))[0];
    const blocked = [], steps = [];
    const tables = await select("SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('users','account_action_tokens','account_security_events')");
    const columns = await select("SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('users','account_action_tokens','account_security_events')");
    const indexes = await select("SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,SUB_PART FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('users','account_action_tokens','account_security_events')");
    const foreignKeys = await select(`SELECT k.TABLE_NAME,k.CONSTRAINT_NAME,k.COLUMN_NAME,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,
        (k.REFERENCED_TABLE_SCHEMA = DATABASE()) AS same_schema,r.UPDATE_RULE,r.DELETE_RULE
        FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r
        ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME
        WHERE k.CONSTRAINT_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL`);
    const extras = await select(`SELECT TABLE_NAME,CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_TYPE='CHECK' AND TABLE_NAME IN ('users','account_action_tokens','account_security_events')`);
    const triggers = await select("SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE IN ('users','account_action_tokens','account_security_events')");
    if (extras.length || triggers.length) blocked.push('Existing checks/triggers require manual compatibility review');
    if (!tables.some(t => t.TABLE_NAME === 'users')) throw new MigrationError('Required users table missing');
    for (const table of tables) if (table.ENGINE !== 'InnoDB') blocked.push(`Unexpected engine: ${table.TABLE_NAME}`);
    const col = (table, name) => columns.find(row => row.TABLE_NAME === table && row.COLUMN_NAME === name);
    const matches = (column, type, nullable) => column && column.COLUMN_TYPE === type && column.IS_NULLABLE === nullable;
    const indexExists = (table, fields, unique) => {
        const groups = new Map();
        for (const row of indexes.filter(i => i.TABLE_NAME === table)) {
            if (!groups.has(row.INDEX_NAME)) groups.set(row.INDEX_NAME, []);
            groups.get(row.INDEX_NAME).push(row);
        }
        return [...groups.values()].some(rows => rows.sort((a,b) => a.SEQ_IN_INDEX-b.SEQ_IN_INDEX).map(r => r.COLUMN_NAME).join(',') === fields.join(',') &&
            rows.every(r => r.SUB_PART == null && Number(r.NON_UNIQUE) === (unique ? 0 : 1)));
    };
    if (!matches(col('users', 'user_id'), 'int', 'NO') || !indexExists('users', ['user_id'], true) ||
        !indexExists('users', ['email'], true) || !col('users', 'is_active') || !col('users', 'password')) {
        throw new MigrationError('Required users identity/password/active schema differs; review manually');
    }
    const [counts] = await select(`SELECT COUNT(*) AS total,
        COALESCE(SUM(is_active=1),0) AS active, COALESCE(SUM(is_active=0),0) AS disabled,
        COALESCE(SUM(is_active IS NULL OR is_active NOT IN (0,1)),0) AS invalid_flags,
        COALESCE(SUM(is_active=1 AND (password IS NULL OR NOT REGEXP_LIKE(password, '^[$]2[aby][$](0[4-9]|[12][0-9]|3[01])[$][./A-Za-z0-9]{53}$','c'))),0) AS invalid_active_hashes
        FROM users`);
    if (Number(counts.invalid_flags) || Number(counts.invalid_active_hashes)) blocked.push('Existing active flags/password encodings need review; no hashes disclosed or changed');
    const state = col('users', 'account_state');
    if (!state) steps.push("ALTER TABLE users ADD COLUMN account_state ENUM('INVITED','ACTIVE','DISABLED') NULL DEFAULT NULL");
    else if (state.COLUMN_TYPE !== "enum('INVITED','ACTIVE','DISABLED')" || state.EXTRA ||
        (state.IS_NULLABLE === 'NO' && state.COLUMN_DEFAULT !== 'INVITED') || (state.IS_NULLABLE === 'YES' && state.COLUMN_DEFAULT !== null)) {
        blocked.push('Existing account_state definition differs; manual review required');
    }
    if (!state || state.IS_NULLABLE === 'YES') {
        steps.push("UPDATE users SET account_state = CASE WHEN is_active=1 THEN 'ACTIVE' ELSE 'DISABLED' END WHERE account_state IS NULL");
        steps.push("ALTER TABLE users MODIFY COLUMN account_state ENUM('INVITED','ACTIVE','DISABLED') NOT NULL DEFAULT 'INVITED'");
    }
    if (state) {
        const [bad] = await select(`SELECT COUNT(*) AS invalid_states FROM users WHERE account_state IS NOT NULL AND
            (account_state NOT IN ('INVITED','ACTIVE','DISABLED') OR (account_state='ACTIVE' AND is_active<>1) OR (account_state IN ('INVITED','DISABLED') AND is_active<>0) OR
            (account_state='INVITED' AND password IS NOT NULL))`);
        if (Number(bad.invalid_states)) blocked.push('Existing account states conflict with flags/passwords');
    }
    for (const [name, type, nullable, defaultValue, ddl] of [
        ['auth_version', 'int unsigned', 'NO', '0', 'INT UNSIGNED NOT NULL DEFAULT 0'],
        ['password_changed_at', 'datetime(6)', 'YES', null, 'DATETIME(6) NULL']
    ]) {
        const existing = col('users', name);
        if (!existing) steps.push(`ALTER TABLE users ADD COLUMN ${name} ${ddl}`);
        else if (!matches(existing, type, nullable) || String(existing.COLUMN_DEFAULT) !== String(defaultValue) || existing.EXTRA) blocked.push(`Existing ${name} differs; manual review required`);
    }
    const expectedIndexes = { account_action_tokens: [[['id'], true], [['token_hash'], true], [['user_id','purpose'], false], [['expires_at'], false]],
        account_security_events: [[['id'], true], [['subject_user_id','created_at'], false], [['actor_user_id'], false]] };
    const expectedFks = { account_action_tokens: ['user_id'], account_security_events: ['subject_user_id','actor_user_id'] };
    for (const [table, ddl] of Object.entries(tableSql)) {
        if (!tables.some(t => t.TABLE_NAME === table)) {
            const names = [...ddl.matchAll(/CONSTRAINT (\w+)/g)].map(m => m[1]);
            if (foreignKeys.some(f => names.includes(f.CONSTRAINT_NAME))) blocked.push(`Foreign key name collision for ${table}`);
            steps.push(ddl);
            continue;
        }
        for (const [name, [type, nullable]] of Object.entries(definitions[table])) {
            const column = col(table, name);
            if (!matches(column, type, nullable) || column.COLUMN_DEFAULT !== null || column.EXTRA !== (name === 'id' ? 'auto_increment' : '')) {
                blocked.push(`Existing ${table}.${name} differs; manual review required`);
            }
        }
        if (columns.filter(row => row.TABLE_NAME === table).length !== Object.keys(definitions[table]).length) blocked.push(`Unexpected columns in ${table}`);
        for (const [fields, unique] of expectedIndexes[table]) if (!indexExists(table, fields, unique)) blocked.push(`Missing/incorrect index ${table}(${fields.join(',')})`);
        const fks = foreignKeys.filter(f => f.TABLE_NAME === table);
        if (fks.length !== expectedFks[table].length || expectedFks[table].some(column => !fks.some(f => f.COLUMN_NAME === column && Number(f.same_schema) === 1 &&
            f.REFERENCED_TABLE_NAME === 'users' && f.REFERENCED_COLUMN_NAME === 'user_id' &&
            ['RESTRICT','NO ACTION'].includes(f.UPDATE_RULE) && ['RESTRICT','NO ACTION'].includes(f.DELETE_RULE)))) blocked.push(`Incorrect restrictive user foreign keys: ${table}`);
    }
    const plan = { counts, blocked, steps, mapping: 'is_active=1 -> ACTIVE; is_active=0 -> DISABLED; no historical password timestamps fabricated' };
    return { ...plan, fingerprint: createHash('sha256').update(JSON.stringify(plan)).digest('hex') };
}
async function apply(c, plan, options) {
    if (plan.blocked.length || !options.backup || !options.quiesced || options.reviewedPlan !== plan.fingerprint) throw new MigrationError('Apply requires an unblocked reviewed plan fingerprint, verified backup and stopped writers');
    for (const sql of plan.steps) await c.query(sql);
}
async function main() {
    const args = process.argv.slice(2);
    const applying = args[0] === '--apply';
    if (!(args.length === 0 || (args.length === 1 && args[0] === '--inspect') ||
        (applying && args.length === 5 && args[1] === '--reviewed-plan' && /^[a-f0-9]{64}$/.test(args[2]) && args[3] === '--backup-confirmed' && args[4] === '--writers-stopped'))) {
        throw new MigrationError('Use --inspect, or --apply --reviewed-plan <fingerprint> --backup-confirmed --writers-stopped after separate authorization');
    }
    require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
    let c;
    try {
        c = await require('mysql2/promise').createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, port: Number(process.env.DB_PORT || 3306), multipleStatements: false, dateStrings: true });
        if (!applying) await c.query('START TRANSACTION READ ONLY');
        else {
            const [rows] = await c.query("SELECT GET_LOCK('bank_phase5d_migration', 0) AS acquired");
            if (Number(rows[0].acquired) !== 1) throw new MigrationError('Another migration operator holds the lock');
        }
        const plan = await prepare(c);
        console.log(JSON.stringify(plan, null, 2));
        if (applying) {
            await apply(c, plan, { reviewedPlan: args[2], backup: true, quiesced: true });
            const after = await prepare(c);
            if (after.blocked.length || after.steps.length) throw new MigrationError('Post-migration inspection requires review; completed DDL is not rolled back');
            console.log('Migration complete; old versionless JWTs require sign-in again.');
        } else { await c.rollback(); console.log('READ-ONLY PREFLIGHT. CURRENT DEVELOPMENT DB MIGRATED: NO'); }
        if (plan.blocked.length) process.exitCode = 2;
    } finally { if (c) await c.end(); }
}
module.exports = { prepare, apply, tableSql, definitions, MigrationError };
if (require.main === module) main().catch(error => {
    console.error(error instanceof MigrationError ? error.message : 'Migration inspection/application failed; no sensitive driver details printed. Completed DDL requires review.');
    process.exitCode = 1;
});
