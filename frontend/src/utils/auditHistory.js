const labels = { SUBMIT: 'Submitted report', FINAL_LOCK: 'Final locked', UNLOCK_REQUEST: 'Correction requested',
  UNLOCK_APPROVE: 'Correction approved', UNLOCK_REJECT: 'Correction rejected' };
export const actionLabel = action => Object.hasOwn(labels, action) ? labels[action] : 'Other audit event';
export function stateLabel(state) {
  if (!state || typeof state !== 'object') return '';
  const status = ['DRAFT', 'SUBMITTED', 'FINAL_LOCKED'].includes(state.status) ? state.status.replaceAll('_', ' ') : '';
  const pending = state.unlock_requested === 1 ? 'correction pending' : state.unlock_requested === 0 ? 'no pending correction' : '';
  return [status, pending].filter(Boolean).join(' · ');
}
export function eventReasons(event) {
  const reasons = [];
  if (event.requested_reason) reasons.push({ label: 'Requested reason', text: event.requested_reason });
  if (event.action === 'UNLOCK_REJECT' && event.reason) reasons.push({ label: 'Decision note', text: event.reason });
  return reasons;
}
// Database-local calendar string: never feed it to Date or reinterpret it as UTC.
export function auditTimestamp(value) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return 'Time unavailable';
  const [, year, month, day, hour, minute, second] = match;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (+month < 1 || +month > 12 || +day < 1 || +day > 31 || +hour > 23 || +minute > 59 || +second > 59) return 'Time unavailable';
  return `${day} ${months[+month - 1]} ${year}, ${+hour % 12 || 12}:${minute}:${second} ${+hour < 12 ? 'AM' : 'PM'}`;
}
