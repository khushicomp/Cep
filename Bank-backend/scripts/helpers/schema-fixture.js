const { schema, statements } = require('../current-schema');
function fixture() {
    const m = { tables: [], columns: [], indexes: [], fks: [], checks: [], triggers: [], routines: [], events: [] };
    for (const t of schema) {
        m.tables.push({ TABLE_NAME: t.name, ENGINE: 'InnoDB', TABLE_COLLATION: 'utf8mb4_0900_ai_ci', TABLE_TYPE: 'BASE TABLE' });
        for (const col of t.columns) m.columns.push({ TABLE_NAME: t.name, COLUMN_NAME: col.name, COLUMN_TYPE: col.type,
            IS_NULLABLE: col.nullable ? 'YES' : 'NO', COLUMN_DEFAULT: col.default, EXTRA: col.extra });
        for (const idx of t.indexes) idx.fields.forEach((field, i) => m.indexes.push({ TABLE_NAME: t.name, INDEX_NAME: idx.name,
            COLUMN_NAME: field, SEQ_IN_INDEX: i + 1, NON_UNIQUE: idx.unique ? 0 : 1, SUB_PART: null }));
        for (const fk of t.fks) m.fks.push({ TABLE_NAME: t.name, COLUMN_NAME: fk.column, REFERENCED_TABLE_NAME: fk.table,
            REFERENCED_COLUMN_NAME: fk.reference, same_schema: 1, DELETE_RULE: fk.delete, UPDATE_RULE: fk.update,
            REFERENCED_TABLE_SCHEMA: 'synthetic', CONSTRAINT_NAME: `${t.name}_${fk.column}`, ORDINAL_POSITION: 1 });
    }
    const c = { async query(sql, params = []) {
        if (!/^(SELECT|SHOW)\b/.test(sql)) throw new Error('Read-only metadata fixture');
        if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
        if (sql.includes('RELEASE_LOCK')) return [[{}]];
        if (sql.includes('SELECT ENGINE')) return [m.tables.filter(t => t.TABLE_NAME === params[0])];
        for (const [name, key] of [['TABLES','tables'],['COLUMNS','columns'],['STATISTICS','indexes'],['KEY_COLUMN_USAGE','fks'],['TABLE_CONSTRAINTS','checks'],['TRIGGERS','triggers'],['ROUTINES','routines'],['EVENTS','events']]) {
            if (sql.includes(`information_schema.${name}`)) {
                // Historical Phase 5D queries only request their three tables.
                const filter = sql.includes("TABLE_NAME IN ('users','account_action_tokens','account_security_events')");
                return [filter ? m[key].filter(r => ['users','account_action_tokens','account_security_events'].includes(r.TABLE_NAME)) : m[key]];
            }
        }
        const name = sql.match(/`(\w+)`/)?.[1];
        if (sql.startsWith('SHOW FULL')) return [m.columns.filter(c => c.TABLE_NAME === name).map(c => ({ Field: c.COLUMN_NAME, Type: c.COLUMN_TYPE, Null: c.IS_NULLABLE, Default: c.COLUMN_DEFAULT, Extra: c.EXTRA, Comment: '' }))];
        if (sql.startsWith('SHOW INDEX')) return [m.indexes.filter(c => c.TABLE_NAME === name).map(c => ({ Key_name: c.INDEX_NAME, Column_name: c.COLUMN_NAME, Seq_in_index: c.SEQ_IN_INDEX, Non_unique: c.NON_UNIQUE, Sub_part: null }))];
        if (sql.startsWith('SHOW CREATE')) return [[{ 'Create Table': statements[schema.findIndex(t => t.name === name)] }]];
        if (sql.includes('SELECT DATABASE()')) return [[{ name: 'synthetic' }]];
        if (sql.includes('AS total')) return [[{ total: 0, active: 0, disabled: 0, invalid_flags: 0, invalid_active_hashes: 0 }]];
        if (sql.includes('AS invalid_states')) return [[{ invalid_states: 0 }]];
        if (sql.includes('AS count')) return [[{ count: 0 }]];
        if (/duplicate_count|AS reference_id|unlock_requested IS NULL/.test(sql)) return [[]];
        throw new Error('Unrecognized synthetic query');
    } };
    return { m, c };
}
module.exports = { fixture };
