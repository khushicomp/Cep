import { shiftBusinessDate } from '../utils/businessDate';
import { formatBusinessAmount as amount } from '../utils/businessAmount';

const counts = [
  ['totalBranches', 'Total Branches'], ['notStarted', 'Not Started'], ['draft', 'Draft'],
  ['submitted', 'Submitted'], ['correctionPending', 'Correction Pending'], ['finalLocked', 'Final Locked'],
  ['unknown', 'Unknown — Review Required']
];

// Presentation within the existing central reports page; detail actions stay there.
export default function DailyOperationsOverview({ date, onDateChange, overview, loading, error, onRefresh, onView }) {
  const ready = !loading && !error && overview;
  return <div className="admin-reports-container">
    <div className="section-header daily-operations-header">
      <div><h2>Head Office Daily Operations</h2><p>Business date: <strong>{date}</strong> (India)</p></div>
      <div className="daily-date-controls">
        <button onClick={() => onDateChange(shiftBusinessDate(date, -1))} disabled={date <= '1000-01-01'}>Previous day</button>
        <label>Business date <input type="date" min="1000-01-01" max="9999-12-31" value={date}
          onChange={e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) onDateChange(e.target.value); }} /></label>
        <button onClick={() => onDateChange(shiftBusinessDate(date, 1))} disabled={date >= '9999-12-31'}>Next day</button>
        <button onClick={onRefresh} disabled={loading}>Refresh</button>
      </div>
    </div>
    {loading && <p role="status">Loading operations for {date}...</p>}
    {error && <p role="alert">{error}</p>}
    {ready && <>
      <div className="overview-cards daily-operation-counts">
        {counts.map(([key, label]) => <div className={`overview-card ${key === 'unknown' && overview.summary[key] ? 'operations-exception' : ''}`} key={key}>
          <div className="overview-card-title">{label}</div>
          <div className="overview-card-value">{overview.summary[key]}</div>
        </div>)}
      </div>
      <div className="daily-operation-totals">
        <span><strong>Reports entered:</strong> {overview.summary.reportedBranches}</span>
        <span><strong>Total entered amount:</strong> ₹ {amount(overview.summary.totalAmount)}</span>
        <span><strong>Total entries (items):</strong> {overview.summary.totalEntries}</span>
      </div>
      <p>Totals include all existing reports for this date, including drafts and pending corrections. Each branch has at most one report.</p>
      <div className="daily-operations-table">
        <table className="data-table">
          <thead><tr><th>Branch</th><th>Status</th><th>Total Entries</th><th>Total Amount (₹)</th><th>Submitted At</th><th>Action</th></tr></thead>
          <tbody>
            {overview.branches.length === 0 && <tr><td colSpan="6">No active branches are configured.</td></tr>}
            {overview.branches.map(branch => <tr key={branch.branch_id}>
              <td><strong>{branch.branch_name}</strong><div>{branch.branch_code} · {branch.branch_district || '—'}</div></td>
              <td><span className={`status-badge operations-status-${branch.display_status.toLowerCase()}`}>
                {branch.display_status.replaceAll('_', ' ')}
              </span></td>
              <td>{branch.total_entries}</td><td>{amount(branch.total_amount)}</td>
              <td>{branch.submitted_at || '—'}</td>
              <td>{branch.entry_id !== null ? <button className="btn-view-details" onClick={() => onView(branch)}>View Report</button> : <span>No report</span>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </>}
  </div>;
}
