const { transaction } = require('./credential.service');
const { CredentialError, emailAddress, supportedRoles, version } = require('./credential-policy');
const { securityEvent } = require('./account-security.service');
const fail = message => { throw new CredentialError(message); };
function positiveId(value) {
    if (!/^[1-9]\d*$/.test(String(value)) || Number(value) > 2147483647) fail('Provide a valid user ID');
    return Number(value);
}
function createProvisioningService(pool, credentials, mail, domain = 'akolaurban.bank.in') {
    async function plan(connection, input, lock = false) {
        if (!['invite', 'reissue', 'disable'].includes(input.action)) fail('Supported actions: invite, reissue, disable');
        if (typeof input.operator !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 ._:@/-]{2,99}$/.test(input.operator)) fail('Provide an accountable operator reference');
        const query = async (sql, args) => (await connection.query(sql, args))[0];
        if (input.action === 'invite') {
            const email = emailAddress(input.email);
            if (email.split('@')[1] !== domain || !supportedRoles.includes(input.role)) fail('Use a verified official mailbox and supported operational role');
            if (typeof input.branchCode !== 'string' || !/^[A-Za-z0-9_-]{1,20}$/.test(input.branchCode)) fail('Provide a stable branch code');
            const branches = await query(`SELECT branch_id,branch_code,branch_name,branch_email,branch_type,is_active FROM branches WHERE branch_code = ?${lock ? ' FOR UPDATE' : ''}`, [input.branchCode]);
            const branch = branches[0];
            if (!branch || Number(branch.is_active) !== 1) fail('Branch must exist and be active');
            const office = branch.branch_type === 'Administrative Office';
            if ((input.role === 'HEAD_OFFICE') !== office) fail('Role does not match branch type');
            if (input.name !== branch.branch_name || [...input.name].length > 100) fail('Display name must match the operational branch name (maximum 100 characters)');
            if (!branch.branch_email || email !== branch.branch_email.trim().toLowerCase()) fail('Reviewed mailbox does not match branch contact; resolve mapping separately before provisioning');
            const collisions = await query('SELECT user_id FROM users WHERE email = ?', [email]);
            if (collisions.length) fail('Email already belongs to an existing user; provisioning never replaces users');
            const incumbents = await query(`SELECT user_id FROM users WHERE branch_id = ? AND role = ? AND (is_active = 1 OR account_state = 'INVITED')`, [branch.branch_id, input.role]);
            if (incumbents.length) fail('Branch already has an active/invited account for this role; review and explicitly disable incumbent accounts first');
            return { action: input.action, branchId: branch.branch_id, branchCode: branch.branch_code, name: branch.branch_name, email, role: input.role, state: 'INVITED' };
        }
        const userId = positiveId(input.userId);
        const expectedEmail = emailAddress(input.email);
        const users = await query(`SELECT user_id,email,name,role,branch_id,account_state,is_active,auth_version,password FROM users WHERE user_id = ?${lock ? ' FOR UPDATE' : ''}`, [userId]);
        const user = users[0];
        if (!user || user.email?.trim().toLowerCase() !== expectedEmail) fail('Account does not match the reviewed user ID and email');
        if (!version(user.auth_version) || user.auth_version === 4294967295) fail('Account version needs manual review');
        if (!['INVITED','ACTIVE','DISABLED'].includes(user.account_state) ||
            (user.account_state === 'DISABLED' && Number(user.is_active) !== 0)) fail('Account state consistency needs manual review');
        if (input.action === 'reissue' && (!supportedRoles.includes(user.role) || user.account_state !== 'INVITED' || Number(user.is_active) !== 0 || user.password !== null)) fail('Only an inactive invited operational account can receive a setup link');
        if (input.action === 'reissue') {
            const branches = await query('SELECT branch_id,branch_name,branch_email,branch_type,is_active FROM branches WHERE branch_id = ?', [user.branch_id]);
            const branch = branches[0];
            if (!branch || Number(branch.is_active) !== 1 || user.name !== branch.branch_name ||
                user.email !== branch.branch_email?.trim().toLowerCase() || (user.role === 'HEAD_OFFICE') !== (branch.branch_type === 'Administrative Office')) fail('Invited branch mapping needs review before reissue');
        }
        return { action: input.action, userId, email: expectedEmail, name: user.name, role: user.role, branchId: user.branch_id, state: user.account_state };
    }
    return {
        async run(input, { apply = false, sendEmail = false, mailboxVerified = false } = {}) {
            // The dry-run path contains only SELECTs and does not call a mail transport.
            const preview = await plan(pool.promise(), input);
            if (!apply) return { ...preview, applied: false, delivery: 'not-attempted' };
            if (input.action !== 'disable' && (!sendEmail || !mailboxVerified || !mail.configured)) fail('Invitation apply requires --send-email, --mailbox-verified and configured mail delivery');
            const result = await transaction(pool, async c => {
                const current = await plan(c, input, true);
                if (input.action === 'disable') {
                    if (current.state !== 'DISABLED') {
                        await c.query("UPDATE users SET account_state = 'DISABLED', is_active = 0, auth_version = auth_version + 1 WHERE user_id = ?", [current.userId]);
                        await c.query('UPDATE account_action_tokens SET revoked_at = UTC_TIMESTAMP(6) WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL', [current.userId]);
                        await securityEvent(c, current.userId, 'ACCOUNT_DISABLED', input.operator);
                    }
                    return { current: { ...current, state: 'DISABLED' } };
                }
                let userId = current.userId;
                if (input.action === 'invite') {
                    const [created] = await c.query(`INSERT INTO users (name,email,password,role,branch_id,branch_code,branch_name,is_active,account_state,auth_version)
                        VALUES (?, ?, NULL, ?, ?, ?, ?, 0, 'INVITED', 0)`,
                    [current.name, current.email, current.role, current.branchId, current.branchCode, current.name]);
                    userId = created.insertId;
                }
                const [users] = await c.query('SELECT * FROM users WHERE user_id = ? FOR UPDATE', [userId]);
                const message = await credentials.issueForLockedUser(c, users[0], 'SETUP');
                await securityEvent(c, userId, input.action === 'invite' ? 'ACCOUNT_INVITED' : 'SETUP_REISSUED', input.operator);
                return { current: { ...current, userId }, message };
            });
            const delivery = result.message ? await credentials.deliver(result.message) : { delivery: 'not-attempted' };
            return { ...result.current, applied: true, ...delivery };
        }
    };
}
module.exports = { createProvisioningService };
