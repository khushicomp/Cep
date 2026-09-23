// Presentation only. API status and totals remain authoritative.
export const reportStates = {
  NOT_STARTED: { label: 'Not started', help: 'No report has been started for this date.' },
  DRAFT: { label: 'Draft', help: 'Changes can still be made before submission.' },
  SUBMITTED: { label: 'Submitted', help: 'Submitted to Head Office. Editing is locked.' },
  CORRECTION_PENDING: { label: 'Correction pending', help: 'Correction request is awaiting Head Office review.' },
  FINAL_LOCKED: { label: 'Final locked', help: 'Finalized by Head Office. No further changes can be made.' },
  UNKNOWN: { label: 'Unknown · review required', help: 'Report status is unavailable or unrecognized. Refresh before taking action.' },
};
export function displayStatus(status, pending = false) {
  const value = String(status || '').trim().toUpperCase();
  if (value === 'SUBMITTED' && Number(pending) === 1) return 'CORRECTION_PENDING';
  return Object.hasOwn(reportStates, value) ? value : 'UNKNOWN';
}
export function filterBranches(branches, search = '', status = 'ALL') {
  const query = search.trim().toLocaleLowerCase();
  return branches.filter(branch => (status === 'ALL' || displayStatus(branch.display_status) === status) &&
    `${branch.branch_name || ''} ${branch.branch_code || ''}`.toLocaleLowerCase().includes(query));
}
export function reportingProgress(summary) {
  const total = Math.max(0, Number(summary.totalBranches) || 0);
  const reported = Math.min(total, Math.max(0, Number(summary.reportedBranches) || 0));
  return { total, reported, percent: total ? reported / total * 100 : 0 };
}
export function reasonError(value) {
  const length = [...value.trim()].length;
  return length < 1 || length > 1000 ? 'Enter a reason of 1 to 1,000 characters.' : '';
}
