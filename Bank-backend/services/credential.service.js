const { randomBytes, createHash } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { credentialConfig } = require('../config/credentials');
const { CredentialError, supportedRoles, emailAddress, passwordPolicy, version } = require('./credential-policy');
const { securityEvent } = require('./account-security.service');
const digest = token => createHash('sha256').update(token).digest();
const invalidLink = () => new CredentialError('This link is invalid or expired. Request a new link.');

async function transaction(pool, work) {
    const c = await pool.promise().getConnection();
    try {
        await c.beginTransaction();
        const result = await work(c);
        await c.commit();
        return result;
    } catch (error) {
        try { await c.rollback(); } catch { c.destroy(); }
        throw error;
    } finally { c.release(); }
}
function eligible(user, purpose) {
    return user && supportedRoles.includes(user.role) && version(user.auth_version) && user.auth_version < 4294967295 &&
        (purpose === 'SETUP' ? user.account_state === 'INVITED' && Number(user.is_active) === 0 && user.password === null :
            user.account_state === 'ACTIVE' && Number(user.is_active) === 1 && typeof user.password === 'string' && user.password.length > 0);
}
function createCredentialService(pool, mail, config = credentialConfig()) {
    // Raw credentials never leave this service except into sendCredential().
    async function issueForLockedUser(c, user, purpose) {
        if (!eligible(user, purpose)) throw invalidLink();
        const token = randomBytes(32).toString('base64url');
        const hash = digest(token);
        const seconds = purpose === 'SETUP' ? config.setupSeconds : config.resetSeconds;
        await c.query(`UPDATE account_action_tokens SET revoked_at = UTC_TIMESTAMP(6)
            WHERE user_id = ? AND purpose = ? AND used_at IS NULL AND revoked_at IS NULL`, [user.user_id, purpose]);
        await c.query(`INSERT INTO account_action_tokens
            (user_id, purpose, token_hash, auth_version, created_at, expires_at)
            VALUES (?, ?, ?, ?, UTC_TIMESTAMP(6), DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ? SECOND))`,
        [user.user_id, purpose, hash, user.auth_version, seconds]);
        return { userId: user.user_id, hash, email: user.email, name: user.name, purpose, token, expiresSeconds: seconds };
    }
    async function deliver(message) {
        try {
            await mail.sendCredential(message);
            return { delivery: 'sent' };
        } catch {
            // A timeout may mean the provider accepted mail. Revoke that exact link, never a newer reissue.
            await transaction(pool, async c => {
                await c.query('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [message.userId]);
                await c.query(`UPDATE account_action_tokens SET revoked_at = UTC_TIMESTAMP(6)
                    WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL`, [message.hash]);
            });
            return { delivery: 'failed' };
        }
    }
    return {
        // Internal operator service uses these methods; neither is an HTTP response boundary.
        issueForLockedUser, deliver,
        async forgot(email) {
            let normalized;
            try { normalized = emailAddress(email); } catch { return; }
            if (!mail.configured) return;
            const message = await transaction(pool, async c => {
                const [users] = await c.query('SELECT * FROM users WHERE email = ? FOR UPDATE', [normalized]);
                const user = users[0];
                if (!eligible(user, 'RESET')) return null;
                // Persistent per-account throttle across application workers, under the same user lock.
                const [recent] = await c.query(`SELECT id FROM account_action_tokens WHERE user_id = ? AND purpose = 'RESET'
                    AND created_at > DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 60 SECOND) LIMIT 1`, [user.user_id]);
                if (recent.length) return null;
                return issueForLockedUser(c, user, 'RESET');
            });
            if (message) await deliver(message);
        },
        async complete(purpose, body) {
            if (!body || typeof body !== 'object' || Array.isArray(body) || !['SETUP', 'RESET'].includes(purpose) ||
                typeof body.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) throw invalidLink();
            passwordPolicy(body.password, body.confirmPassword);
            const hash = digest(body.token);
            const [candidates] = await pool.promise().query('SELECT user_id FROM account_action_tokens WHERE token_hash = ?', [hash]);
            if (!candidates.length) throw invalidLink();
            const passwordHash = await bcrypt.hash(body.password, config.bcryptCost);
            await transaction(pool, async c => {
                // All lifecycle writers lock user first, then tokens, to avoid inverted lock order.
                const [users] = await c.query('SELECT * FROM users WHERE user_id = ? FOR UPDATE', [candidates[0].user_id]);
                const user = users[0];
                const [tokens] = await c.query(`SELECT *, expires_at > UTC_TIMESTAMP(6) AS unexpired
                    FROM account_action_tokens WHERE token_hash = ? FOR UPDATE`, [hash]);
                const token = tokens[0];
                if (!eligible(user, purpose) || !token || token.user_id !== user.user_id || token.purpose !== purpose ||
                    token.auth_version !== user.auth_version || !Number(token.unexpired) || token.used_at || token.revoked_at) throw invalidLink();
                await c.query(`UPDATE users SET password = ?, account_state = 'ACTIVE', is_active = 1,
                    auth_version = auth_version + 1, password_changed_at = UTC_TIMESTAMP(6) WHERE user_id = ?`, [passwordHash, user.user_id]);
                await c.query('UPDATE account_action_tokens SET used_at = UTC_TIMESTAMP(6) WHERE token_hash = ?', [hash]);
                await c.query(`UPDATE account_action_tokens SET revoked_at = UTC_TIMESTAMP(6)
                    WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL`, [user.user_id]);
                await securityEvent(c, user.user_id, purpose === 'SETUP' ? 'PASSWORD_ESTABLISHED' : 'PASSWORD_RESET');
            });
            return { message: 'Password saved. Sign in with your new password.' };
        }
    };
}
module.exports = { createCredentialService, transaction, digest, eligible };
