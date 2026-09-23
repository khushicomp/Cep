const actions = new Set(['ACCOUNT_INVITED', 'SETUP_REISSUED', 'PASSWORD_ESTABLISHED', 'PASSWORD_RESET', 'ACCOUNT_DISABLED']);
async function securityEvent(connection, userId, action, operator = null) {
    if (!actions.has(action)) throw new Error('Unsupported security event');
    if (operator !== null && (typeof operator !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 ._:@/-]{2,99}$/.test(operator))) {
        throw new Error('Invalid operator reference');
    }
    await connection.query(`INSERT INTO account_security_events
        (subject_user_id, actor_user_id, actor_source, operator_reference, action, created_at)
        VALUES (?, NULL, ?, ?, ?, UTC_TIMESTAMP(6))`,
    [userId, operator === null ? 'ACCOUNT_TOKEN' : 'OPERATOR_CLI', operator, action]);
}
module.exports = { securityEvent, actions };
