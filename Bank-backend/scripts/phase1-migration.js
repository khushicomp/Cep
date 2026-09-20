// Preparation only. Default invocation performs SELECT/SHOW queries and prints a plan.
// Do not use --apply until separately authorized. MySQL DDL implicitly commits;
// completed steps remain applied on failure. Quiesce application writers first.
const mysql = require('mysql2/promise');
const path = require('node:path');
class PreparationError extends Error {}
const qi = value => '`' + value.replace(/`/g, '``') + '`';

function equivalentUnique(indexes, columns) {
    const groups = new Map();
    for (const row of indexes) {
        if (!groups.has(row.Key_name)) groups.set(row.Key_name, []);
        groups.get(row.Key_name).push(row);
    }
    return [...groups.values()].some(rows => rows.length === columns.length &&
        rows.every(row => Number(row.Non_unique) === 0 && row.Sub_part == null &&
            columns.includes(row.Column_name)) &&
        new Set(rows.map(row => row.Column_name)).size === columns.length);
}

async function prepare(connection) {
    const query = async (sql, params = []) => (await connection.query(sql, params))[0];
    const steps = [], blocked = [], findings = {};
    const add = (description, sql) => steps.push({ description, sql });
    const tables = {};
    for (const name of ['daily_business_entries', 'daily_business_items', 'branches', 'users', 'daily_business_audit_logs']) {
        const exists = await query('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [name]);
        if (!exists.length) {
            if (name !== 'daily_business_audit_logs') throw new PreparationError(`Required table missing: ${name}`);
            continue;
        }
        if (exists[0].ENGINE !== 'InnoDB') throw new PreparationError(`Manual engine review required: ${name}`);
        const columns = await query(`SHOW FULL COLUMNS FROM ${qi(name)}`);
        const indexes = await query(`SHOW INDEX FROM ${qi(name)}`);
        const ddl = (await query(`SHOW CREATE TABLE ${qi(name)}`))[0]['Create Table'];
        tables[name] = { columns: Object.fromEntries(columns.map(c => [c.Field, c])), indexes, ddl };
    }
    const foreignKeys = await query(`SELECT k.TABLE_NAME, k.CONSTRAINT_NAME, k.COLUMN_NAME,
        k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME, k.REFERENCED_TABLE_SCHEMA,
        k.ORDINAL_POSITION, r.DELETE_RULE, r.UPDATE_RULE
        FROM information_schema.KEY_COLUMN_USAGE k
        JOIN information_schema.REFERENTIAL_CONSTRAINTS r
          ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME
          AND r.TABLE_NAME=k.TABLE_NAME
        WHERE k.TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL`);
    const schema = (await query('SELECT DATABASE() AS name'))[0].name;
    const col = (table, name) => {
        const c = tables[table]?.columns[name];
        if (!c) throw new PreparationError(`Required column missing: ${table}.${name}`);
        return c;
    };
    // Preserve default, collation, comments and nullability when extending an enum.
    const extendValues = (table, name, required) => {
        const c = col(table, name);
        if (/^varchar\((\d+)\)$/i.test(c.Type)) {
            if (Number(c.Type.match(/\d+/)[0]) < Math.max(...required.map(v => v.length))) {
                throw new PreparationError(`Manual string-width review required: ${table}.${name}`);
            }
            return;
        }
        if (!c.Type.startsWith('enum(')) throw new PreparationError(`Unsupported type: ${table}.${name}`);
        const missing = required.filter(v => !c.Type.includes(`'${v}'`));
        if (!missing.length) return;
        if (missing.some(v => c.Type.toUpperCase().includes(`'${v}'`))) {
            throw new PreparationError(`Case-variant enum values require manual review: ${table}.${name}`);
        }
        const line = tables[table].ddl.split('\n').find(l => l.trimStart().startsWith(qi(name) + ' '));
        const definition = line.trim().replace(/,$/, '');
        if (!definition.includes(c.Type)) throw new PreparationError(`Cannot preserve definition: ${table}.${name}`);
        const expanded = c.Type.slice(0, -1) + ',' + missing.map(v => `'${v}'`).join(',') + ')';
        add(`Extend ${table}.${name}; preserve all legacy values`,
            `ALTER TABLE ${qi(table)} MODIFY COLUMN ${definition.replace(c.Type, expanded)}`);
    };
    // Fail closed if additional CHECK constraints could restrict lifecycle/roles.
    const checks = await query(`SELECT TABLE_NAME, CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA=DATABASE() AND CONSTRAINT_TYPE='CHECK'
        AND TABLE_NAME IN ('daily_business_entries','users')`);
    if (checks.length) throw new PreparationError('Existing CHECK constraints require manual review');
    extendValues('daily_business_entries', 'status', ['DRAFT', 'SUBMITTED', 'FINAL_LOCKED']);
    extendValues('users', 'role', ['EMPLOYEE', 'MANAGER', 'ADMIN', 'HEAD_OFFICE']);

    const entries = tables.daily_business_entries;
    const unlock = entries.columns.unlock_requested;
    if (!unlock) {
        add('Add unlock request flag', 'ALTER TABLE daily_business_entries ADD COLUMN unlock_requested TINYINT(1) NOT NULL DEFAULT 0');
    } else {
        if (!/^tinyint(?:\(\d+\))?(?: unsigned)?$/.test(unlock.Type)) throw new PreparationError('Unexpected unlock_requested type');
        findings.invalidUnlockFlags = await query('SELECT id, unlock_requested FROM daily_business_entries WHERE unlock_requested IS NULL OR unlock_requested NOT IN (0,1)');
        if (findings.invalidUnlockFlags.length) blocked.push('unlock_requested requires manual NULL/non-boolean value resolution; no data changed');
        else if (unlock.Null !== 'NO' || String(unlock.Default) !== '0') {
            const definition = entries.ddl.split('\n').find(l => l.trimStart().startsWith('`unlock_requested` ')).trim().replace(/,$/, '');
            if (unlock.Extra) throw new PreparationError('Unexpected unlock_requested attributes');
            // Observed schema is a plain tinyint; preserve type and comment explicitly.
            const comment = unlock.Comment ? ' COMMENT ' + connection.escape(unlock.Comment) : '';
            if (!definition) throw new PreparationError('Missing unlock flag definition');
            add('Make existing unlock flag NOT NULL DEFAULT 0 (no backfill)',
                `ALTER TABLE daily_business_entries MODIFY COLUMN unlock_requested ${unlock.Type} NOT NULL DEFAULT 0${comment}`);
        }
    }
    const reason = entries.columns.unlock_reason;
    if (!reason) add('Add nullable correction reason', 'ALTER TABLE daily_business_entries ADD COLUMN unlock_reason TEXT NULL');
    else if (reason.Null !== 'YES' || !/^(?:text|mediumtext|longtext|varchar\(\d+\))$/.test(reason.Type)) {
        throw new PreparationError('Existing unlock_reason requires manual compatibility review');
    }

    // Report one row per affected entry, avoiding GROUP_CONCAT truncation of IDs.
    findings.duplicates = await query(`SELECT e.branch_id,e.entry_date,e.id AS entry_id,d.duplicate_count,
        (SELECT COUNT(*) FROM daily_business_items i WHERE i.entry_id=e.id) AS item_count
        FROM daily_business_entries e JOIN
        (SELECT branch_id,entry_date,COUNT(*) AS duplicate_count FROM daily_business_entries
         GROUP BY branch_id,entry_date HAVING COUNT(*)>1) d
        ON e.branch_id <=> d.branch_id AND e.entry_date <=> d.entry_date
        ORDER BY e.branch_id,e.entry_date,e.id`);
    findings.uniqueAlreadyExists = equivalentUnique(entries.indexes, ['branch_id', 'entry_date']);
    if (findings.duplicates.length) blocked.push('Unique branch/date constraint blocked by duplicate reports; resolve manually');
    else if (!findings.uniqueAlreadyExists) {
        if (col('daily_business_entries', 'branch_id').Null !== 'NO' || col('daily_business_entries', 'entry_date').Null !== 'NO') {
            blocked.push('Unique branch/date constraint requires non-nullable columns; manual review required');
        } else if (entries.indexes.some(i => i.Key_name === 'phase1_branch_date_unique')) {
            blocked.push('Index name phase1_branch_date_unique is occupied by a different index');
        } else add('Ensure one report per branch/date', 'ALTER TABLE daily_business_entries ADD UNIQUE INDEX phase1_branch_date_unique (branch_id, entry_date)');
    }

    async function ensureForeignKey(table, column, parent, parentColumn, name) {
        const source = col(table, column), target = col(parent, parentColumn);
        const sourceId = col(table, 'id');
        if (!sourceId || source.Type !== target.Type || !/^(?:int|bigint)(?:\(\d+\))?(?: unsigned)?$/.test(source.Type) ||
            !equivalentUnique(tables[parent].indexes, [parentColumn])) {
            blocked.push(`Incompatible foreign key types/index: ${table}.${column}`);
            return;
        }
        const orphans = await query(`SELECT s.id, s.${qi(column)} AS reference_id FROM ${qi(table)} s
            LEFT JOIN ${qi(parent)} p ON p.${qi(parentColumn)}=s.${qi(column)}
            WHERE s.${qi(column)} IS NOT NULL AND p.${qi(parentColumn)} IS NULL`);
        findings[`${table}.${column}.orphans`] = orphans;
        if (orphans.length) { blocked.push(`Orphaned references: ${table}.${column}`); return; }
        const involving = foreignKeys.filter(f => f.TABLE_NAME === table && f.COLUMN_NAME === column);
        const matching = involving.filter(f => f.REFERENCED_TABLE_SCHEMA === schema &&
            f.REFERENCED_TABLE_NAME === parent && f.REFERENCED_COLUMN_NAME === parentColumn &&
            foreignKeys.filter(g => g.TABLE_NAME === table && g.CONSTRAINT_NAME === f.CONSTRAINT_NAME).length === 1);
        if (involving.length !== matching.length || matching.length > 1) {
            blocked.push(`Conflicting foreign keys: ${table}.${column}`); return;
        }
        if (matching.length) {
            const existing = matching[0];
            if (['RESTRICT', 'NO ACTION'].includes(existing.DELETE_RULE) && ['RESTRICT', 'NO ACTION'].includes(existing.UPDATE_RULE)) return;
            // MySQL cannot drop/add the same FK name in one ALTER. Use the
            // deterministic target name only if it is unused across the schema.
            if (foreignKeys.some(f => f.CONSTRAINT_NAME.toLowerCase() === name.toLowerCase())) {
                blocked.push(`Foreign key name collision: ${name}`); return;
            }
            // One ALTER replaces the relationship; never drop the audit table or its rows.
            add(`Replace destructive relationship on ${table}.${column} with RESTRICT`,
                `ALTER TABLE ${qi(table)} DROP FOREIGN KEY ${qi(existing.CONSTRAINT_NAME)}, ADD CONSTRAINT ${qi(name)} FOREIGN KEY (${qi(column)}) REFERENCES ${qi(parent)} (${qi(parentColumn)}) ON DELETE RESTRICT ON UPDATE RESTRICT`);
        } else {
            if (foreignKeys.some(f => f.CONSTRAINT_NAME === name)) { blocked.push(`Foreign key name collision: ${name}`); return; }
            add(`Add restrictive relationship on ${table}.${column}`,
                `ALTER TABLE ${qi(table)} ADD CONSTRAINT ${qi(name)} FOREIGN KEY (${qi(column)}) REFERENCES ${qi(parent)} (${qi(parentColumn)}) ON DELETE RESTRICT ON UPDATE RESTRICT`);
        }
    }
    await ensureForeignKey('daily_business_entries', 'branch_id', 'branches', 'branch_id', 'phase1_entry_branch_fk');
    await ensureForeignKey('daily_business_entries', 'manager_id', 'users', 'user_id', 'phase1_entry_manager_fk');

    if (!tables.daily_business_audit_logs) {
        const idType = (table, name) => {
            const c = col(table, name);
            if (!/^int(?:\(\d+\))?(?: unsigned)?$/.test(c.Type) || !equivalentUnique(tables[table].indexes, [name])) throw new PreparationError('Audit parent key requires manual review');
            return c.Type;
        };
        add('Create audit history with restrictive relationships', `CREATE TABLE daily_business_audit_logs (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            entry_id ${idType('daily_business_entries', 'id')} NOT NULL,
            branch_id ${idType('branches', 'branch_id')} NOT NULL,
            action VARCHAR(50) NOT NULL,
            actor_id ${idType('users', 'user_id')} NOT NULL,
            actor_role VARCHAR(50) NOT NULL,
            actor_name VARCHAR(100) NOT NULL,
            previous_state JSON NULL,
            new_state JSON NULL,
            reason TEXT NULL,
            ip_address VARCHAR(45) NULL,
            user_agent TEXT NULL,
            created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (entry_id) REFERENCES daily_business_entries(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
            FOREIGN KEY (branch_id) REFERENCES branches(branch_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
            FOREIGN KEY (actor_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    } else {
        // Existing audit schema must support all required event fields; preserve extras.
        for (const field of ['id', 'entry_id', 'branch_id', 'action', 'actor_id', 'actor_role', 'actor_name', 'reason', 'created_at']) col('daily_business_audit_logs', field);
        const audit = tables.daily_business_audit_logs.columns;
        if (!/^varchar\((\d+)\)$/.test(audit.action.Type) || !/^varchar\((\d+)\)$/.test(audit.actor_role.Type) ||
            Number(audit.actor_role.Type.match(/\d+/)[0]) < 11 || !/text/.test(audit.reason.Type) ||
            !['timestamp', 'datetime'].includes(audit.created_at.Type) || !equivalentUnique(tables.daily_business_audit_logs.indexes, ['id'])) {
            throw new PreparationError('Existing audit table requires manual schema review');
        }
        await ensureForeignKey('daily_business_audit_logs', 'entry_id', 'daily_business_entries', 'id', 'phase1_audit_entry_fk');
        await ensureForeignKey('daily_business_audit_logs', 'branch_id', 'branches', 'branch_id', 'phase1_audit_branch_fk');
        await ensureForeignKey('daily_business_audit_logs', 'actor_id', 'users', 'user_id', 'phase1_audit_actor_fk');
    }
    return { findings, blocked, steps };
}

async function main() {
    const args = process.argv.slice(2);
    if (args.some(a => !['--inspect', '--apply'].includes(a)) || args.length > 1) throw new PreparationError('Use --inspect (default) or, only after authorization, --apply');
    require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST, user: process.env.DB_USER,
            password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
            port: Number(process.env.DB_PORT || 3306), dateStrings: true,
            connectTimeout: 10000, multipleStatements: false
        });
        const plan = await prepare(connection);
        console.log(JSON.stringify(plan, null, 2));
        if (!args.includes('--apply')) {
            console.log('READ-ONLY INSPECTION ONLY. MIGRATION EXECUTED: NO');
        } else {
            if (plan.blocked.length) throw new PreparationError('Pre-flight checks are blocked; no migration steps were applied');
            // No transaction wrapper: MySQL DDL commits independently.
            for (const step of plan.steps) {
                console.log(`Applying: ${step.description}`);
                await connection.query(step.sql);
                console.log(`Completed: ${step.description}`);
            }
            console.log('Prepared safe steps applied. Review any blocked portions.');
        }
        if (plan.blocked.length) process.exitCode = 2;
    } finally {
        if (connection) await connection.end();
    }
}
module.exports = { prepare, equivalentUnique };
if (require.main === module) main().catch(error => {
    // Do not print driver SQL/messages, which can contain data or credentials.
    console.error('Phase 1 preparation/application failed. Completed DDL is not rolled back; inspect and rerun after resolving the failure.',
        error instanceof PreparationError ? error.message :
            (error.code && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'CONFIGURATION_OR_CONNECTION_FAILURE'));
    process.exitCode = 1;
});
