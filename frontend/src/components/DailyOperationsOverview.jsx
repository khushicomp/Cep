import { useState } from 'react';
import { formatBusinessAmount as amount } from '../utils/businessAmount';
import { filterBranches, reportStates, reportingProgress } from '../utils/operations';
import { DateControls, PageHeader, StatusBadge, SummaryMetric, LoadingState, InlineError, EmptyState } from './OperationsUI';

const countKeys = { NOT_STARTED: 'notStarted', DRAFT: 'draft', SUBMITTED: 'submitted', CORRECTION_PENDING: 'correctionPending', FINAL_LOCKED: 'finalLocked', UNKNOWN: 'unknown' };

export default function DailyOperationsOverview({ date, onDateChange, overview, loading, error, onRefresh, onView }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const ready = !loading && !error && overview;
  const summary = overview?.summary;
  const progress = summary ? reportingProgress(summary) : null;
  const rows = filterBranches(overview?.branches || [], search, status);
  const reset = () => { setSearch(''); setStatus('ALL'); };
  return <section className="daily-operations">
    <PageHeader title="Daily operations" description="Reporting activity across the branch network.">
      <DateControls date={date} onChange={onDateChange} onRefresh={onRefresh} disabled={loading} />
    </PageHeader>
    {loading && <LoadingState>Loading operations for {date}…</LoadingState>}
    {error && <InlineError onRetry={onRefresh}>{error}</InlineError>}
    {ready && <>
      <div className="summary-strip">
        <SummaryMetric label="Reports entered" value={progress.reported + ' / ' + progress.total}>
          Branches with a report, including drafts
          <progress max={progress.total || 1} value={progress.reported} aria-label="Branches with a report" />
        </SummaryMetric>
        <SummaryMetric label="Needs attention" value={Number(summary.correctionPending) + Number(summary.unknown)}>
          {summary.correctionPending} corrections · {summary.unknown} unknown
        </SummaryMetric>
        <SummaryMetric label="Finalized" value={summary.finalLocked}>Final locked by Head Office</SummaryMetric>
        <SummaryMetric label="Entered amount" value={'₹ ' + amount(summary.totalAmount)}>
          {summary.totalEntries} entries · selected date
        </SummaryMetric>
      </div>
      <p className="overview-footnote">Totals include all reports for {date}, including drafts and pending corrections. "Needs attention" counts correction requests and unknown states.</p>
      {summary.unknown > 0 && <div className="exception-note" role="status">{summary.unknown} branch report(s) have an unknown status. <button onClick={() => { setSearch(''); setStatus('UNKNOWN'); }}>Review unknown reports</button></div>}
      <div className="ops-surface">
        <div className="section-heading"><div><h2>Branch reporting register</h2><p>{overview.branches.length} active branches · {date}</p></div>
          <label className="branch-search"><span className="sr-only">Search branch name or code</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search branch name or code" /></label>
        </div>
        <div className="status-filters" role="group" aria-label="Filter branches by report status">
          <button aria-pressed={status === 'ALL'} onClick={() => setStatus('ALL')}>All <span>{overview.branches.length}</span></button>
          {Object.entries(countKeys).map(([key, count]) => <button key={key} aria-pressed={status === key} onClick={() => setStatus(key)}>
            {reportStates[key].label} <span>{summary[count]}</span>
          </button>)}
        </div>
        <div className="register-caption"><span aria-live="polite">Showing {rows.length} of {overview.branches.length} branches</span>{(search || status !== 'ALL') && <button className="text-button" onClick={reset}>Clear filters</button>}</div>
        {overview.branches.length === 0 ? <EmptyState title="No active branches are configured." /> : rows.length === 0 ? <EmptyState title="No branches match these filters.">Change the search or clear the filters to see all branches.</EmptyState> :
          <div className="table-scroll branch-register" role="region" aria-label="Branch reporting register" tabIndex="0">
            <table className="data-table"><thead><tr><th scope="col">Branch</th><th scope="col">Report status</th><th scope="col" className="numeric">Entries</th><th scope="col" className="numeric">Amount (₹)</th><th scope="col">Submitted · India</th><th scope="col">Report</th></tr></thead>
              <tbody>{rows.map(branch => <tr key={branch.branch_id} className={branch.display_status === 'CORRECTION_PENDING' ? 'attention-row' : ''}>
                <td><strong>{branch.branch_name}</strong><span className="branch-metadata">{branch.branch_code} · {branch.branch_district || 'District unavailable'}</span></td>
                <td><StatusBadge status={branch.display_status} /></td><td className="numeric">{branch.total_entries}</td>
                <td className="numeric">{amount(branch.total_amount)}</td><td className="timestamp-cell">{branch.submitted_at || '—'}</td>
                <td>{branch.entry_id !== null ? <button className="view-report" onClick={() => onView(branch)} aria-label={'View report for ' + branch.branch_name}>View report</button> : <span className="muted">No report</span>}</td>
              </tr>)}</tbody>
            </table>
          </div>}
      </div>
    </>}
  </section>;
}
