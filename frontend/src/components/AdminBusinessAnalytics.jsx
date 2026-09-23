import { useEffect, useState } from 'react';
import api from '../services/api';
import { formatBusinessAmount as amount } from '../utils/businessAmount';
import { PageHeader, SummaryMetric, LoadingState, InlineError, EmptyState } from './OperationsUI';

export default function AdminBusinessAnalytics() {
  const [reportData, setReportData] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    api.get('/business/reports').then(res => { if (current) { setReportData(res.data); setError(false); } })
      .catch(() => { if (current) setError(true); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [revision]);
  const refresh = () => { setLoading(true); setError(false); setRevision(value => value + 1); };
  return <section>
    <PageHeader title="Business analytics" description="All-time reported business across branches. This view is not limited to the daily operations date.">
      <button disabled={loading} onClick={refresh}>Refresh analytics</button>
    </PageHeader>
    {loading && <LoadingState>Loading business analytics…</LoadingState>}
    {error && <InlineError onRetry={refresh}>Unable to load business analytics.</InlineError>}
    {reportData && !loading && !error && <>
      <div className="summary-strip analytics-summary">
        <SummaryMetric label="Total business" value={'₹ ' + amount(reportData.overall.totalBusiness || '0')}>Across all existing reports</SummaryMetric>
        <SummaryMetric label="Accounts / items" value={reportData.overall.totalAccountsOpened || 0}>Total reported items</SummaryMetric>
      </div>
      <div className="ops-surface">
        <div className="section-heading"><div><h2>Account type breakdown</h2><p>Top 10 by item count · all time</p></div></div>
        {reportData.breakdown?.length ? <div className="table-scroll" role="region" aria-label="Account type breakdown" tabIndex="0"><table className="data-table">
          <thead><tr><th scope="col">Account type</th><th scope="col" className="numeric">Items</th><th scope="col" className="numeric">Amount (₹)</th></tr></thead>
          <tbody>{reportData.breakdown.map((item, index) => <tr key={index}><td><strong>{item.account_type}</strong></td><td className="numeric">{item.count}</td><td className="numeric">{amount(item.amount || '0')}</td></tr>)}</tbody>
        </table></div> : <EmptyState title="No account breakdown is available yet." />}
      </div>
    </>}
  </section>;
}
