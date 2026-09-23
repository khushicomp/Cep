import { displayStatus, reportStates } from '../utils/operations';
import { shiftBusinessDate } from '../utils/businessDate';

export function StatusBadge({ status, pending }) {
  const state = displayStatus(status, pending);
  return <span className={`report-status state-${state.toLowerCase()}`}>{reportStates[state].label}</span>;
}
export function ReportState({ status, pending, reason }) {
  const state = displayStatus(status, pending);
  return <div className={`report-state state-${state.toLowerCase()}`}>
    <div><span className="eyebrow">Report status</span><StatusBadge status={state} /></div>
    <p>{reportStates[state].help}</p>
    {state === 'CORRECTION_PENDING' && reason && <p className="reason-text"><strong>Requested reason:</strong> {reason}</p>}
  </div>;
}
export function PageHeader({ title, description, children }) {
  return <header className="ops-page-header"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{children}</header>;
}
export function DateControls({ date, onChange, onRefresh, disabled, max = '9999-12-31' }) {
  return <div className="date-controls" aria-label="Business date controls">
    <button disabled={disabled || date <= '1000-01-01'} onClick={() => onChange(shiftBusinessDate(date, -1))} aria-label="Previous business date">Previous</button>
    <label><span>Business date · India</span><input type="date" min="1000-01-01" max={max} value={date} disabled={disabled}
      onChange={event => { const value = event.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1000-01-01' && value <= max) onChange(value); }} /></label>
    <button disabled={disabled || date >= max} onClick={() => onChange(shiftBusinessDate(date, 1))} aria-label="Next business date">Next</button>
    {onRefresh && <button disabled={disabled} onClick={onRefresh}>Refresh</button>}
  </div>;
}
export function LoadingState({ children = 'Loading report data…' }) {
  return <div className="ops-loading" role="status"><span className="loading-mark" aria-hidden="true" /><span>{children}</span></div>;
}
export function InlineError({ children, onRetry }) {
  return <div className="ops-error" role="alert"><div>{children}</div>{onRetry && <button onClick={onRetry}>Retry</button>}</div>;
}
export function EmptyState({ title, children }) {
  return <div className="ops-empty"><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}
export function SummaryMetric({ label, value, children }) {
  return <div className="summary-metric"><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong>{children && <div className="metric-detail">{children}</div>}</div>;
}
