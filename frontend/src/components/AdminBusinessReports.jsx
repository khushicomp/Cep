import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import { businessToday } from '../utils/businessDate';
import { formatBusinessAmount as amount } from '../utils/businessAmount';
import { showToast } from '../utils/toast';
import { useDialog } from '../utils/useDialog';
import './AdminBusinessReports.css';
import DailyOperationsOverview from './DailyOperationsOverview';
import ReportAuditHistory from './ReportAuditHistory';
import { PageHeader, DateControls, ReportState, StatusBadge, SummaryMetric, LoadingState, InlineError, EmptyState } from './OperationsUI';

export default function AdminBusinessReports() {
  const isHeadOffice = localStorage.getItem('role') === 'HEAD_OFFICE';
  const ask = useDialog();
  const [finalLocking, setFinalLocking] = useState(false);
  const [date, setDate] = useState(businessToday());
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [overviewError, setOverviewError] = useState('');
  const overviewRequest = useRef({ version: 0 });
  const detailRequest = useRef(0);
  const historyRequest = useRef(0);
  const [detailError, setDetailError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [districtFilter, setDistrictFilter] = useState('ALL');
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [branchDetails, setBranchDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [viewHistory, setViewHistory] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const fetchAllBranches = useCallback(async () => {
    const request = ++overviewRequest.current.version;
    try {
      setLoading(true); setOverviewError('');
      const endpoint = isHeadOffice ? 'head-office/daily-overview' : 'all-branches';
      const res = await api.get(`/business/${endpoint}?date=${encodeURIComponent(date)}&t=${Date.now()}`);
      if (request !== overviewRequest.current.version) return;
      if (isHeadOffice) {
        if (res.data?.date !== date || !Array.isArray(res.data.branches) || !res.data.summary) throw new Error('Invalid overview response');
        setOverview(res.data);
      } else setBranches(res.data.branches || (Array.isArray(res.data) ? res.data : []));
    } catch {
      if (request === overviewRequest.current.version) setOverviewError('Unable to load branch data. Please retry.');
    } finally { if (request === overviewRequest.current.version) setLoading(false); }
  }, [date, isHeadOffice]);

  useEffect(() => {
    const requests = overviewRequest.current;
    fetchAllBranches();
    return () => { requests.version++; };
  }, [fetchAllBranches]);
  useEffect(() => () => { detailRequest.current++; historyRequest.current++; }, []);

  const fetchBranchDetails = async (branchId, reportDate = date) => {
    const request = ++detailRequest.current;
    try {
      setDetailsLoading(true); setDetailError(''); setNotFound(false); setSelectedBranch(branchId);
      const res = await api.get(`/business/branch/${branchId}?date=${reportDate}&t=${Date.now()}`);
      if (request === detailRequest.current) setBranchDetails(res.data);
    } catch (err) {
      if (request !== detailRequest.current) return;
      setNotFound(err.response?.status === 404);
      setDetailError(err.response?.status === 404 ? 'No report exists for this branch on the selected date.' : 'Unable to load report details.');
    } finally { if (request === detailRequest.current) setDetailsLoading(false); }
  };

  const handleBack = () => {
    detailRequest.current++; historyRequest.current++;
    setDetailsLoading(false); setDetailError(''); setSelectedBranch(null);
    setBranchDetails(null); setViewHistory(false);
    fetchAllBranches();
  };

  const handleFinalLock = async () => {
    if (!isHeadOffice || finalLocking || detailsLoading || !branchDetails?.id ||
        String(branchDetails.status).trim().toUpperCase() !== 'SUBMITTED' || Number(branchDetails.unlock_requested) === 1) return;
    const target = branchDetails;
    if (!await ask({ title: 'Final lock this report?', description: `${target.branch_name || 'This branch'} · ${target.entry_date}. This seals the report. No further changes or corrections will be possible.`, confirm: 'Final lock report' })) return;
    setFinalLocking(true);
    try {
      const res = await api.post(`/business/entry/${target.id}/final-lock`);
      setBranchDetails(current => current?.id === target.id ? { ...current, status: res.data.status } : current);
      showToast('Report final-locked successfully');
      await fetchBranchDetails(target.branch_id, target.entry_date);
      await fetchAllBranches();
    } catch (err) {
      if (err.response?.status === 409) {
        setBranchDetails(current => current?.id === target.id ? { ...current, status: '' } : current);
        await fetchBranchDetails(target.branch_id, target.entry_date); await fetchAllBranches();
      }
      showToast(err.response?.data?.message || 'Unable to final-lock report', 'error');
    } finally { setFinalLocking(false); }
  };

  const resolveCorrection = async approve => {
    if (!isHeadOffice || finalLocking || detailsLoading || !branchDetails?.id ||
        String(branchDetails.status).trim().toUpperCase() !== 'SUBMITTED' || Number(branchDetails.unlock_requested) !== 1) return;
    const target = branchDetails;
    const reason = await ask({
      title: approve ? 'Approve correction?' : 'Reject correction?',
      description: `${target.branch_name || 'This branch'} · ${target.entry_date}. ${approve ? 'The report will reopen as Draft for the Manager to edit and resubmit.' : 'The report will remain Submitted. Explain the decision to the Manager.'}`,
      reason: !approve, reasonLabel: 'Head Office decision note', confirm: approve ? 'Approve correction' : 'Reject correction', danger: !approve
    });
    if (reason === null) return;
    setFinalLocking(true);
    try {
      const res = await api.post(`/business/entry/${target.id}/unlock-${approve ? 'approve' : 'reject'}`, approve ? {} : { reason });
      setBranchDetails(current => current?.id === target.id ? { ...current, ...res.data } : current);
      showToast(approve ? 'Correction approved; report reopened as DRAFT' : 'Correction request rejected');
      await fetchBranchDetails(target.branch_id, target.entry_date); await fetchAllBranches();
    } catch (err) {
      if (err.response?.status === 409) {
        setBranchDetails(current => current?.id === target.id ? { ...current, status: '' } : current);
        await fetchBranchDetails(target.branch_id, target.entry_date); await fetchAllBranches();
      }
      showToast(err.response?.data?.message || 'Unable to resolve correction request', 'error');
    } finally { setFinalLocking(false); }
  };

  const fetchBranchHistory = async branchId => {
    const request = ++historyRequest.current;
    setHistoryLoading(true); setHistoryError(''); setViewHistory(true);
    try {
      const res = await api.get(`/business/branch-history/${branchId}`);
      if (request === historyRequest.current) setHistoryList(res.data || []);
    } catch { if (request === historyRequest.current) setHistoryError('Unable to load submission history.'); }
    finally { if (request === historyRequest.current) setHistoryLoading(false); }
  };

  if (viewHistory) return <section>
    <div className="detail-navigation"><button onClick={() => setViewHistory(false)}>Back to report</button></div>
    <PageHeader title="Submission history" description={branchDetails?.branch_name || 'Selected branch'} />
    {historyLoading ? <LoadingState>Loading submission history…</LoadingState> : historyError ? <InlineError onRetry={() => fetchBranchHistory(selectedBranch)}>{historyError}</InlineError> :
      historyList.length === 0 ? <EmptyState title="No submission history for this branch." /> :
      <div className="ops-surface table-scroll" tabIndex="0" role="region" aria-label="Branch submission history"><table className="data-table">
        <thead><tr><th scope="col">Business date</th><th scope="col">Status</th><th scope="col" className="numeric">Amount (₹)</th><th scope="col">Report</th></tr></thead>
        <tbody>{historyList.map(item => <tr key={item.id}><td>{item.entry_date}</td><td><StatusBadge status={item.status} /></td><td className="numeric">{amount(item.total_amount)}</td><td>
          <button onClick={() => { setDate(item.entry_date); setViewHistory(false); fetchBranchDetails(selectedBranch, item.entry_date); }}>View report</button>
        </td></tr>)}</tbody>
      </table></div>}
  </section>;

  if (selectedBranch) {
    const pending = Number(branchDetails?.unlock_requested) === 1;
    const submitted = String(branchDetails?.status).trim().toUpperCase() === 'SUBMITTED';
    return <section>
      <div className="detail-navigation"><button disabled={finalLocking} onClick={handleBack}>Back to all branches</button>
        {branchDetails && !detailsLoading && !detailError && <button disabled={finalLocking} onClick={() => fetchBranchHistory(selectedBranch)}>Submission history</button>}
      </div>
      <PageHeader title={branchDetails?.branch_id === selectedBranch ? branchDetails.branch_name || 'Branch report' : 'Branch report'} description={'Business date: ' + date + ' · India'} />
      {detailsLoading ? <LoadingState>Loading report details…</LoadingState> : detailError ?
        notFound ? <EmptyState title={detailError} /> : <InlineError onRetry={() => fetchBranchDetails(selectedBranch)}>{detailError}</InlineError> :
        branchDetails && <>
          <ReportState status={branchDetails.status} pending={pending} reason={branchDetails.unlock_reason} />
          <dl className="report-context"><div><dt>Manager</dt><dd>{branchDetails.manager_name || 'Unavailable'}</dd></div><div><dt>Business date</dt><dd>{branchDetails.entry_date}</dd></div>
            <div><dt>Report</dt><dd>#{branchDetails.id}</dd></div></dl>
          {isHeadOffice && submitted && <section className="decision-panel" aria-label="Head Office report actions">
            <h2>{pending ? 'Correction decision required' : 'Ready for Head Office review'}</h2>
            <p>{pending ? 'Review the requested reason above. Final locking is unavailable while a correction is pending.' : 'Review the entries before final locking. This action permanently seals the report.'}</p>
            <div className="decision-actions">{pending ? <>
              <button className="primary-button" disabled={finalLocking} onClick={() => resolveCorrection(true)}>Approve correction</button>
              <button className="danger-button" disabled={finalLocking} onClick={() => resolveCorrection(false)}>Reject correction</button>
            </> : <button className="primary-button" disabled={finalLocking} onClick={handleFinalLock}>Final lock report</button>}
              {finalLocking && <span role="status">Processing report action…</span>}
            </div>
          </section>}
          <div className="ops-surface">
            <div className="section-heading"><h2>Reported entries</h2><span className="muted">{branchDetails.entries?.length || 0} items</span></div>
            {!branchDetails.entries?.length ? <EmptyState title="No entries recorded for this report." /> :
              <div className="table-scroll" tabIndex="0" role="region" aria-label="Reported entries"><table className="data-table">
                <thead><tr><th scope="col">No.</th><th scope="col">Account type</th><th scope="col">Activity</th><th scope="col" className="numeric">Amount (₹)</th><th scope="col">Remark</th></tr></thead>
                <tbody>{branchDetails.entries.map((item, index) => <tr key={item.id || index}><td>{item.srNo}</td><td>{item.accountType}</td><td>{item.status}</td><td className="numeric">{amount(item.amount || '0')}</td><td>{item.remark || '—'}</td></tr>)}</tbody>
              </table></div>}
            <div className="detail-total"><span>Total entered amount</span><strong>₹ {amount(branchDetails.total_amount || '0')}</strong></div>
          </div>
          {isHeadOffice && branchDetails.id && <ReportAuditHistory key={branchDetails.id} entryId={branchDetails.id} revision={branchDetails} />}
        </>}
    </section>;
  }

  if (isHeadOffice) return <DailyOperationsOverview date={date} onDateChange={setDate}
    overview={overview?.date === date ? overview : null}
    loading={loading || (!overviewError && overview?.date !== date)} error={overviewError}
    onRefresh={fetchAllBranches} onView={branch => { setBranchDetails(null); fetchBranchDetails(branch.branch_id, date); }} />;

  // Preserve the transitional ADMIN read-only branch view and district filters.
  const activeBranches = branches.filter(b => ['SUBMITTED', 'FINAL_LOCKED'].includes(b.status)).length;
  const grandTotal = branches.reduce((sum, branch) => sum + Number(branch.total_amount || 0), 0);
  const totalEntries = branches.reduce((sum, branch) => sum + Number(branch.total_entries || 0), 0);
  const visibleBranches = branches.filter(b => districtFilter === 'ALL' || (districtFilter === 'AKOLA' ? b.branchDistrict === 'Akola' : b.branchDistrict !== 'Akola'));
  return <section>
    <PageHeader title="Branch reports" description="Read-only branch overview."><DateControls date={date} onChange={setDate} onRefresh={fetchAllBranches} disabled={loading} max={businessToday()} /></PageHeader>
    {loading ? <LoadingState /> : overviewError ? <InlineError onRetry={fetchAllBranches}>{overviewError}</InlineError> :
      <><div className="summary-strip">
        <SummaryMetric label="Total business" value={'₹ ' + grandTotal.toLocaleString('en-IN')} />
        <SummaryMetric label="Submitted / final branches" value={activeBranches} />
        <SummaryMetric label="Total entries" value={totalEntries} />
        <SummaryMetric label="Awaiting submission" value={branches.length - activeBranches} />
      </div><div className="ops-surface"><div className="section-heading"><h2>Branch register</h2><label>District <select value={districtFilter} onChange={event => setDistrictFilter(event.target.value)}><option value="ALL">All districts</option><option value="AKOLA">Akola</option><option value="OTHER">Other districts</option></select></label></div>
        <div className="table-scroll" tabIndex="0" role="region" aria-label="Admin branch register"><table className="data-table"><thead><tr><th scope="col">Branch</th><th scope="col">Status</th><th scope="col" className="numeric">Entries</th><th scope="col" className="numeric">Amount (₹)</th><th scope="col">Report</th></tr></thead>
          <tbody>{visibleBranches.map(b => <tr key={b._id || b.branch_id}><td>{b.branchName || b.branch_name}</td><td><StatusBadge status={b.status || 'NOT_STARTED'} /></td><td className="numeric">{b.totalEntries || b.total_entries || 0}</td><td className="numeric">{amount(b.totalAmount || b.total_amount || '0')}</td><td><button onClick={() => { setBranchDetails(null); fetchBranchDetails(b._id || b.branch_id); }}>View details</button></td></tr>)}</tbody>
        </table></div>{visibleBranches.length === 0 && <EmptyState title="No branches match this view." />}
      </div></>}
  </section>;
}
