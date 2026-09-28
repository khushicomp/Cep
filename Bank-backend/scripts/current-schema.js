// Offline manifest and read-only metadata validator. Importing never connects.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const statements = fs.readFileSync(path.join(__dirname, 'current-schema.sql'), 'utf8')
    .replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
const normalize = value => String(value ?? '').replace(/default_generated\s*/ig, '').trim().toLowerCase();
const typeName = value => value.split("'").map((part, i) => i % 2 ? part : part.toLowerCase()).join("'");
function manifest(sql) {
    const name = sql.match(/^CREATE TABLE `?(\w+)`?/i)[1];
    const columns = [], indexes = [], fks = [];
    for (const line of sql.split('\n').slice(1, -1)) {
        const s = line.trim().replace(/`/g, '').replace(/,$/, '');
        const column = s.match(/^(\w+) ((?:\w+)(?:\([^)]*\))?(?: unsigned)?)(.*)$/i);
        if (column && !/^(PRIMARY|UNIQUE|KEY|CONSTRAINT|FOREIGN)$/i.test(column[1])) {
            const [, name, type, tail] = column;
            const def = tail.match(/\bDEFAULT ('[^']*'|CURRENT_TIMESTAMP|NULL)/i)?.[1];
            columns.push({ name, type: typeName(type), nullable: !/NOT NULL|PRIMARY KEY/i.test(tail),
                default: !def || /^NULL$/i.test(def) ? null : def.replace(/^'|'$/g, ''),
                extra: /AUTO_INCREMENT/i.test(tail) ? 'auto_increment' : /ON UPDATE CURRENT_TIMESTAMP/i.test(tail) ? 'on update CURRENT_TIMESTAMP' : '' });
            if (/PRIMARY KEY/i.test(tail)) indexes.push({ name: 'PRIMARY', fields: [name], unique: true });
        }
        const index = s.match(/^(PRIMARY KEY|UNIQUE KEY \w+|KEY \w+) \(([^)]+)\)/i);
        if (index) indexes.push({ name: index[1] === 'PRIMARY KEY' ? 'PRIMARY' : index[1].split(' ').at(-1),
            fields: index[2].split(',').map(v => v.trim()), unique: !index[1].startsWith('KEY ') });
        const fk = s.match(/FOREIGN KEY \((\w+)\) REFERENCES (\w+)\s*\((\w+)\)/i);
        if (fk) fks.push({ column: fk[1], table: fk[2], reference: fk[3],
            delete: s.match(/ON DELETE (CASCADE|RESTRICT|NO ACTION)/i)?.[1] || 'RESTRICT',
            update: s.match(/ON UPDATE (CASCADE|RESTRICT|NO ACTION)/i)?.[1] || 'RESTRICT' });
    }
    return { name, columns, indexes, fks };
}
const schema = statements.map(manifest);
const fingerprint = createHash('sha256').update(statements.join('\n')).digest('hex');
async function metadata(c) {
    const read = async sql => (await c.query(sql))[0];
    return {
        tables: await read('SELECT TABLE_NAME,ENGINE,TABLE_COLLATION,TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()'),
        columns: await read('SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()'),
        indexes: await read('SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,SUB_PART FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()'),
        fks: await read(`SELECT k.TABLE_NAME,k.COLUMN_NAME,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,
            (k.REFERENCED_TABLE_SCHEMA=DATABASE()) AS same_schema,r.DELETE_RULE,r.UPDATE_RULE
            FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r
            ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME
            WHERE k.CONSTRAINT_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL`),
        checks: await read("SELECT TABLE_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_TYPE='CHECK'"),
        triggers: await read('SELECT EVENT_OBJECT_TABLE AS TABLE_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()'),
        routines: await read('SELECT ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE()'),
        events: await read('SELECT STATUS FROM information_schema.EVENTS WHERE EVENT_SCHEMA=DATABASE()')
    };
}
function validate(m) {
    const issues = [];
    for (const table of schema) {
        const found = m.tables.find(t => t.TABLE_NAME === table.name);
        if (!found || found.ENGINE !== 'InnoDB' || found.TABLE_COLLATION !== 'utf8mb4_0900_ai_ci') issues.push(`${table.name}: missing or incompatible table`);
        for (const col of table.columns) {
            const actual = m.columns.find(c => c.TABLE_NAME === table.name && c.COLUMN_NAME === col.name);
            if (!actual || typeName(actual.COLUMN_TYPE) !== col.type || (actual.IS_NULLABLE === 'YES') !== col.nullable ||
                (actual.COLUMN_DEFAULT === null) !== (col.default === null) || normalize(actual.COLUMN_DEFAULT) !== normalize(col.default) ||
                normalize(actual.EXTRA) !== normalize(col.extra)) issues.push(`${table.name}.${col.name}: incompatible column`);
        }
        if (m.columns.filter(c => c.TABLE_NAME === table.name).length !== table.columns.length) issues.push(`${table.name}: unexpected column count`);
        for (const idx of table.indexes) {
            const candidates = m.indexes.filter(i => i.TABLE_NAME === table.name);
            const names = [...new Set(candidates.map(i => i.INDEX_NAME))];
            if (!names.some(name => {
                const rows = candidates.filter(i => i.INDEX_NAME === name).sort((a,b) => a.SEQ_IN_INDEX-b.SEQ_IN_INDEX);
                return (idx.name !== 'PRIMARY' || name === 'PRIMARY') && rows.length === idx.fields.length &&
                    rows.every((r,i) => r.COLUMN_NAME === idx.fields[i] && !r.SUB_PART && Number(r.NON_UNIQUE) === (idx.unique ? 0 : 1));
            })) issues.push(`${table.name}: missing index ${idx.fields.join(',')}`);
        }
        const actualFks = m.fks.filter(f => f.TABLE_NAME === table.name);
        if (actualFks.length !== table.fks.length) issues.push(`${table.name}: unexpected foreign keys`);
        for (const fk of table.fks) if (!actualFks.some(f => f.COLUMN_NAME === fk.column && f.REFERENCED_TABLE_NAME === fk.table &&
            f.REFERENCED_COLUMN_NAME === fk.reference && Number(f.same_schema) === 1 &&
            f.DELETE_RULE.replace('NO ACTION','RESTRICT') === fk.delete && f.UPDATE_RULE.replace('NO ACTION','RESTRICT') === fk.update)) issues.push(`${table.name}.${fk.column}: incompatible foreign key`);
    }
    if (m.tables.some(t => !schema.some(s => s.name === t.TABLE_NAME)) || m.checks.length || m.triggers.length || m.routines.length || m.events.length) issues.push('Unexpected database objects require review');
    return issues;
}
function empty(m) { return !m.tables.length && !m.triggers.length && !m.routines.length && !m.events.length; }
async function bootstrap(c, reviewed) {
    if (reviewed !== fingerprint) throw new Error('Reviewed schema fingerprint required');
    const [lock] = await c.query("SELECT GET_LOCK('bank_staging_initialization', 0) AS acquired");
    if (Number(lock[0].acquired) !== 1) throw new Error('Initialization already running');
    try {
        if (!empty(await metadata(c))) throw new Error('Bootstrap requires a completely empty database');
        for (const sql of statements) await c.query(sql);
        if (validate(await metadata(c)).length) throw new Error('Post-bootstrap schema requires review');
    } finally { await c.query("SELECT RELEASE_LOCK('bank_staging_initialization')"); }
}
async function main() {
    const args = process.argv.slice(2);
    if (!(args.length === 0 || args.length === 1 && ['--inspect','--validate'].includes(args[0]) ||
        args.length === 4 && args[0] === '--apply' && args[1] === '--empty-database-confirmed' && args[2] === '--reviewed-schema' && args[3] === fingerprint)) throw new Error('Invalid arguments');
    require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
    const c = await require('../config/database-options').openConnection();
    try {
        if (args[0] === '--apply') await bootstrap(c, args[3]);
        const m = await metadata(c);
        if (args[0] === '--validate' || args[0] === '--apply') {
            const issues = validate(m); console.log(JSON.stringify({ valid: !issues.length, issues }));
            if (issues.length) process.exitCode = 2;
        } else {
            console.log(JSON.stringify({ empty: empty(m), plannedStatements: empty(m) ? statements.length : 0,
                blocked: !empty(m), fingerprint, statements: empty(m) ? statements : [] }, null, 2));
            if (!empty(m)) process.exitCode = 2;
        }
    } finally { await c.end(); }
}
module.exports = { schema, statements, fingerprint, metadata, validate, empty, bootstrap };
if (require.main === module) main().catch(() => {
    console.error('Schema operation failed. No sensitive details printed. Inspect partial DDL before retrying; DDL is not transactional.');
    process.exitCode = 1;
});
