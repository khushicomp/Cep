// Call only with the report mutation's dedicated transaction connection.
// Persist milestone metadata, not request bodies or complete report/user rows.
async function insertMilestone(connection, { entryId, branchId, actor, action, previousStatus, newStatus,
    previousPending, newPending, requestReason, reason }) {
    const allowed = (action === 'SUBMIT' && actor.role === 'MANAGER' && previousStatus === 'DRAFT' && newStatus === 'SUBMITTED') ||
        (action === 'FINAL_LOCK' && actor.role === 'HEAD_OFFICE' && previousStatus === 'SUBMITTED' && newStatus === 'FINAL_LOCKED') ||
        (action === 'UNLOCK_REQUEST' && actor.role === 'MANAGER' && previousStatus === 'SUBMITTED' && newStatus === 'SUBMITTED' && previousPending === 0 && newPending === 1) ||
        (['UNLOCK_APPROVE', 'UNLOCK_REJECT'].includes(action) && actor.role === 'HEAD_OFFICE' && previousStatus === 'SUBMITTED' &&
            newStatus === (action === 'UNLOCK_APPROVE' ? 'DRAFT' : 'SUBMITTED') && previousPending === 1 && newPending === 0);
    if (!allowed) throw new Error('Invalid audit milestone');
    // JWTs do not carry names. Read only the required name, using verified identity.
    const [users] = await connection.query('SELECT name FROM users WHERE user_id = ?', [actor.user_id]);
    if (!users.length) throw new Error('Audit actor no longer exists');
    const actorName = users[0].name ?? `User #${actor.user_id}`;
    const previous = { status: previousStatus };
    const next = { status: newStatus };
    const correction = action.startsWith('UNLOCK_');
    if (correction) {
        previous.unlock_requested = previousPending;
        next.unlock_requested = newPending;
        if (previousPending === 1) previous.unlock_reason = requestReason;
    }
    await connection.query(`INSERT INTO daily_business_audit_logs
        (entry_id, branch_id, action, actor_id, actor_role, actor_name, previous_state, new_state${correction ? ', reason' : ''})
        VALUES (?, ?, ?, ?, ?, ?, ?, ?${correction ? ', ?' : ''})`,
    [entryId, branchId, action, actor.user_id, actor.role, actorName,
        JSON.stringify(previous), JSON.stringify(next), ...(correction ? [reason ?? null] : [])]);
    // created_at uses the existing database default. Optional request metadata stays NULL.
}
const safeText = (value, max) => typeof value === 'string' ? value.slice(0, max) : null;
function parseState(value) {
    try {
        const state = typeof value === 'string' ? JSON.parse(value) : value;
        return state && typeof state === 'object' && !Array.isArray(state) ? state : null;
    } catch { return null; }
}
function safeState(value) {
    const state = parseState(value);
    if (!state) return null;
    const status = typeof state.status === 'string' ? state.status.trim().toUpperCase() : '';
    const result = {};
    if (['DRAFT', 'SUBMITTED', 'FINAL_LOCKED'].includes(status)) result.status = status;
    if ([0, 1, '0', '1', false, true].includes(state.unlock_requested)) result.unlock_requested = Number(state.unlock_requested);
    return Object.keys(result).length ? result : null;
}
function publicEvent(row) {
    const action = ['SUBMIT', 'FINAL_LOCK', 'UNLOCK_REQUEST', 'UNLOCK_APPROVE', 'UNLOCK_REJECT'].includes(row.action) ? row.action : 'UNKNOWN';
    const correction = action.startsWith('UNLOCK_');
    const reason = correction ? safeText(row.reason, 1000) : null;
    const requestedReason = action === 'UNLOCK_REQUEST' ? reason :
        ['UNLOCK_APPROVE', 'UNLOCK_REJECT'].includes(action) ? safeText(parseState(row.previous_state)?.unlock_reason, 1000) ?? (action === 'UNLOCK_APPROVE' ? reason : null) : null;
    return { id: row.id, action, actor_name: safeText(row.actor_name, 100),
        actor_role: ['MANAGER', 'HEAD_OFFICE', 'ADMIN', 'EMPLOYEE'].includes(row.actor_role) ? row.actor_role : 'UNKNOWN',
        created_at: row.created_at, reason, requested_reason: requestedReason,
        previous_state: safeState(row.previous_state), new_state: safeState(row.new_state) };
}
module.exports = { insertMilestone, publicEvent };
