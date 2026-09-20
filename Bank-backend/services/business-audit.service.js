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
module.exports = { insertMilestone };
