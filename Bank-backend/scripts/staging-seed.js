// Separate operator tool. No mail/service imports, tokens, reports or default credentials.
const { schema, metadata, validate } = require('./current-schema');
const branches = Array.from({ length: 38 }, (_, i) => ({ id: i + 1,
    code: `AUCB${String(i + 1).padStart(3, '0')}`, name: `SYNTHETIC Branch ${String(i + 1).padStart(3, '0')}` }));
const identities = [
    { name: 'SYNTHETIC Manager A', email: 'manager-a@example.invalid', role: 'MANAGER', branch: 3, key: 'STAGING_MANAGER_A_PASSWORD' },
    { name: 'SYNTHETIC Manager B', email: 'manager-b@example.invalid', role: 'MANAGER', branch: 4, key: 'STAGING_MANAGER_B_PASSWORD' },
    { name: 'SYNTHETIC Head Office', email: 'head-office@example.invalid', role: 'HEAD_OFFICE', branch: 1, key: 'STAGING_HEAD_OFFICE_PASSWORD' }
];
function authorize(env, applying = false) {
    if (env.DEPLOYMENT_ENV !== 'staging' || env.NODE_ENV !== 'development' || env.CREDENTIAL_MAIL_TRANSPORT !== 'disabled') throw new Error('Synthetic seed requires explicit staging operator mode with mail disabled');
    if (applying) {
        const values = identities.map(i => env[i.key]);
        if (values.some(p => typeof p !== 'string' || p.length < 20 || Buffer.byteLength(p) > 72 || new Set(p).size < 12) || new Set(values).size !== values.length) throw new Error('Three distinct protected high-entropy credentials required');
    }
}
async function inspect(c) {
    if (validate(await metadata(c)).length) throw new Error('Current schema validation required');
    for (const table of schema) {
        const [rows] = await c.query(`SELECT COUNT(*) AS count FROM \`${table.name}\``);
        if (Number(rows[0].count) !== 0) throw new Error('Synthetic seed requires all current tables empty; duplicates or existing data require review');
    }
    return { branches: branches.length, users: identities.length, reports: 0, credentialsPrinted: false };
}
async function seed(c, env, applying = false) {
    authorize(env, applying);
    if (!applying) return inspect(c);
    const [lock] = await c.query("SELECT GET_LOCK('bank_staging_initialization', 0) AS acquired");
    if (Number(lock[0].acquired) !== 1) throw new Error('Initialization already running');
    try {
        await c.beginTransaction();
        const result = await inspect(c);
        const bcrypt = require('bcryptjs');
        for (const branch of branches) await c.query('INSERT INTO branches (branch_id,branch_code,branch_name,branch_type,is_active) VALUES (?,?,?,?,1)',
            [branch.id, branch.code, branch.name, branch.id === 1 ? 'Administrative Office' : 'Branch']);
        for (const identity of identities) {
            const branch = branches[identity.branch - 1];
            const hash = await bcrypt.hash(env[identity.key], 12);
            await c.query(`INSERT INTO users (name,email,password,role,branch_id,branch_code,branch_name,is_active,account_state,auth_version,password_changed_at,can_view_all_branches)
                VALUES (?,?,?,?,?,?,?,1,'ACTIVE',0,UTC_TIMESTAMP(6),?)`,
            [identity.name, identity.email, hash, identity.role, branch.id, branch.code, branch.name, identity.role === 'HEAD_OFFICE' ? 1 : 0]);
        }
        await c.commit();
        return result;
    } catch (error) { await c.rollback(); throw error; }
    finally { await c.query("SELECT RELEASE_LOCK('bank_staging_initialization')"); }
}
async function main() {
    const args = process.argv.slice(2);
    const applying = args.length === 2 && args[0] === '--apply' && args[1] === '--synthetic-empty-staging-confirmed';
    if (!(applying || !args.length || args.length === 1 && args[0] === '--inspect')) throw new Error('Invalid arguments');
    // Deliberately do not load the development .env. Operator supplies the isolated target.
    authorize(process.env, applying);
    const c = await require('../config/database-options').openConnection();
    try { console.log(JSON.stringify(await seed(c, process.env, applying))); }
    finally { await c.end(); }
}
module.exports = { branches, identities, authorize, inspect, seed };
if (require.main === module) main().catch(() => { console.error('Synthetic staging seed refused or failed; no sensitive details printed.'); process.exitCode = 1; });
