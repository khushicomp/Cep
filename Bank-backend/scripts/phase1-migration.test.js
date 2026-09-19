// Pure mocked metadata tests: no MySQL connection or writes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prepare, equivalentUnique } = require('./phase1-migration');

const index = (name, columns) => columns.map((Column_name, i) => ({
    Key_name: name, Column_name, Seq_in_index: i + 1, Non_unique: 0, Sub_part: null
}));
function fixture(options = {}) {
    const column = (Field, Type = 'int', Null = 'NO', Default = null) => ({ Field, Type, Null, Default, Extra: '', Comment: '' });
    const tables = {
        daily_business_entries: [column('id'), column('branch_id'), column('manager_id'), column('entry_date', 'date'),
            column('status', options.enumStatus ? "enum('LEGACY','DRAFT')" : 'varchar(50)', 'YES', 'DRAFT'),
            column('unlock_requested', 'tinyint(1)', options.done ? 'NO' : 'YES', '0'), column('unlock_reason', 'text', 'YES')],
        daily_business_items: [column('id'), column('entry_id')],
        branches: [column('branch_id')],
        users: [column('user_id'), column('role', options.legacyRole ? "enum('EMPLOYEE','MANAGER','ADMIN')" : "enum('EMPLOYEE','MANAGER','ADMIN','HEAD_OFFICE')", 'NO', 'MANAGER')],
        daily_business_audit_logs: [column('id'), column('entry_id'), column('branch_id'), column('actor_id'),
            column('action', 'varchar(50)'), column('actor_role', 'varchar(50)'), column('actor_name', 'varchar(100)'),
            column('reason', 'text', 'YES'), column('created_at', 'timestamp', 'YES')]
    };
    const fk = (TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME, DELETE_RULE = 'RESTRICT') => ({
        TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME, DELETE_RULE,
        CONSTRAINT_NAME: TABLE_NAME + '_' + COLUMN_NAME, REFERENCED_TABLE_SCHEMA: 'test', ORDINAL_POSITION: 1, UPDATE_RULE: 'NO ACTION'
    });
    const fks = [fk('daily_business_audit_logs', 'entry_id', 'daily_business_entries', 'id', options.done ? 'RESTRICT' : 'CASCADE'),
        fk('daily_business_audit_logs', 'branch_id', 'branches', 'branch_id'), fk('daily_business_audit_logs', 'actor_id', 'users', 'user_id')];
    if (options.done) fks.push(fk('daily_business_entries', 'branch_id', 'branches', 'branch_id'), fk('daily_business_entries', 'manager_id', 'users', 'user_id'));
    return { query: async (sql, params = []) => {
        assert.match(sql.trim(), /^(SELECT|SHOW)\b/, 'planner must never execute DDL or DML');
        if (sql.includes('SELECT ENGINE')) return [[...(options.noAudit && params[0] === 'daily_business_audit_logs' ? [] : [{ ENGINE: 'InnoDB' }])]];
        const table = sql.match(/`([^`]+)`/)?.[1];
        if (sql.startsWith('SHOW FULL')) return [tables[table]];
        if (sql.startsWith('SHOW INDEX')) {
            const rows = index('PRIMARY', [table === 'users' ? 'user_id' : table === 'branches' ? 'branch_id' : 'id']);
            if (table === 'daily_business_entries' && !options.noUnique) rows.push(...index('unrelated_name', ['entry_date', 'branch_id']));
            return [rows];
        }
        if (sql.startsWith('SHOW CREATE')) return [[{ 'Create Table': 'CREATE TABLE `' + table + '` (\n' + tables[table].map(c => `  \`${c.Field}\` ${c.Type} ${c.Null === 'NO' ? 'NOT NULL' : ''}${c.Default === null ? '' : ` DEFAULT '${c.Default}'`},`).join('\n') + '\n)' }]];
        if (sql.includes('KEY_COLUMN_USAGE')) return [fks];
        if (sql.includes('SELECT DATABASE()')) return [[{ name: 'test' }]];
        if (sql.includes("CONSTRAINT_TYPE='CHECK'")) return [[]];
        if (sql.includes('unlock_requested IS NULL')) return [options.nullUnlock ? [{ id: 7, unlock_requested: null }] : []];
        if (sql.includes('duplicate_count')) return [options.duplicates ? [{ branch_id: 1, entry_date: '2026-09-19', entry_id: 7, duplicate_count: 2, item_count: 3 }] : []];
        if (sql.includes('AS reference_id')) return [options.orphans && sql.includes('`manager_id`') ? [{ id: 7, reference_id: 99 }] : []];
        throw new Error('Unexpected fixture query: ' + sql);
    } };
}

test('semantic uniqueness accepts reverse order/name, rejects prefixes and extra columns', () => {
    assert.ok(equivalentUnique(index('other', ['entry_date', 'branch_id']), ['branch_id', 'entry_date']));
    assert.equal(equivalentUnique(index('other', ['entry_date', 'branch_id', 'id']), ['branch_id', 'entry_date']), false);
    const prefix = index('other', ['branch_id', 'entry_date']); prefix[0].Sub_part = 2;
    assert.equal(equivalentUnique(prefix, ['branch_id', 'entry_date']), false);
});
test('observed schema yields four safe steps including audit cascade replacement', async () => {
    const plan = await prepare(fixture());
    assert.equal(plan.steps.length, 4);
    assert.deepEqual(plan.blocked, []);
    assert.match(plan.steps[3].sql, /DROP FOREIGN KEY.*ON DELETE RESTRICT/);
});
test('completed schema is a no-op on rerun', async () => {
    assert.deepEqual((await prepare(fixture({ done: true }))).steps, []);
});
test('duplicates, orphans and null flags block only their unsafe portions', async () => {
    const plan = await prepare(fixture({ noUnique: true, duplicates: true, orphans: true, nullUnlock: true }));
    assert.equal(plan.blocked.length, 3);
    assert.equal(plan.findings.duplicates[0].item_count, 3);
    assert.equal(plan.steps.some(s => /UNIQUE INDEX|MODIFY COLUMN unlock_requested|phase1_entry_manager_fk/.test(s.sql)), false);
});
test('missing unique constraint is prepared only after clean data check', async () => {
    assert.ok((await prepare(fixture({ noUnique: true }))).steps.some(s => /ADD UNIQUE INDEX/.test(s.sql)));
});
test('enum extensions preserve legacy values and defaults', async () => {
    const plan = await prepare(fixture({ enumStatus: true, legacyRole: true }));
    assert.match(plan.steps[0].sql, /enum\('LEGACY','DRAFT','SUBMITTED','FINAL_LOCKED'\).*DEFAULT 'DRAFT'/);
    assert.match(plan.steps[1].sql, /'EMPLOYEE','MANAGER','ADMIN','HEAD_OFFICE'.*NOT NULL DEFAULT 'MANAGER'/);
});
test('missing audit table is created with restrictive relationships only', async () => {
    const plan = await prepare(fixture({ noAudit: true }));
    const ddl = plan.steps.find(s => /CREATE TABLE/.test(s.sql)).sql;
    assert.equal((ddl.match(/ON DELETE RESTRICT/g) || []).length, 3);
    assert.doesNotMatch(ddl, /CASCADE/);
});
