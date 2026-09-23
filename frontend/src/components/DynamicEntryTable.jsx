import React, { useState, useEffect, useMemo, useRef } from 'react';
import './DynamicEntryTable.css';
import { showToast } from '../utils/toast';
import api from '../services/api';
import { businessToday } from '../utils/businessDate';
import ReportAuditHistory from './ReportAuditHistory';
import { useDialog } from '../utils/useDialog';
import { formatBusinessAmount as amount } from '../utils/businessAmount';
import { PageHeader, DateControls, ReportState, StatusBadge, LoadingState, InlineError, EmptyState } from './OperationsUI';

const ACCOUNT_TYPE_OPTIONS = [
  // Group 1: DEPOSITS
  { group: 'DEPOSITS', label: 'Savings Account (SB)' },
  { group: 'DEPOSITS', label: 'Fixed Deposit (FD)' },
  { group: 'DEPOSITS', label: 'Current Account (CA)' },
  { group: 'DEPOSITS', label: 'CASA' },
  // Group 2: SHARES
  { group: 'SHARES', label: 'Regular Share' },
  { group: 'SHARES', label: 'Link Share' },
  // Group 3: LOANS
  { group: 'LOANS', label: 'Hypothecation Loan' },
  { group: 'LOANS', label: 'Pledge' },
  { group: 'LOANS', label: 'Cash Credit (CC) - Builders & Developers' },
  { group: 'LOANS', label: 'Cash Credit (CC) - Professionals' },
  { group: 'LOANS', label: 'Cash Credit (CC) - Others' },
  { group: 'LOANS', label: 'Housing Loan' },
  { group: 'LOANS', label: 'Car Loan' },
  { group: 'LOANS', label: 'Education Loan (India)' },
  { group: 'LOANS', label: 'Education Loan (Abroad)' },
  { group: 'LOANS', label: 'Gold Loan' },
  { group: 'LOANS', label: 'OD Against Gold Ornaments' },
  { group: 'LOANS', label: 'Term Loan (Business Purpose)' },
  { group: 'LOANS', label: 'Vehicle Loan (Two Wheeler)' },
  { group: 'LOANS', label: 'Agriculture Loan (Short Term)' },
  { group: 'LOANS', label: 'Agriculture Loan (Long Term)' },
  { group: 'LOANS', label: 'Secured Instalment Loan' },
  { group: 'LOANS', label: 'Staff CC' },
  { group: 'LOANS', label: 'Staff Gold Loan' },
  { group: 'LOANS', label: 'Staff HSG Loan' },
  { group: 'LOANS', label: 'Home Plus for Staff' },
  { group: 'LOANS', label: 'Loan Against NSC/LIC/Govt Securities' },
  { group: 'LOANS', label: 'GR Loan' },
  { group: 'LOANS', label: 'Surity Loan' },
  { group: 'LOANS', label: 'JSY Loan' },
  { group: 'LOANS', label: 'Bill Discount' },
  { group: 'LOANS', label: 'Bill Purchase' },
  // Group 4: OTHERS
  { group: 'OTHERS', label: 'NPA Regularised' },
  { group: 'OTHERS', label: 'New Proposal to HO' },
  { group: 'OTHERS', label: 'Custom Entry' }
];

const STATUS_OPTIONS = [
  'Opened', 'Disbursed', 'Regularised', 'Sanctioned', 'Pending', 'Sent to HO'
];

function DynamicEntryTable() {
  const ask = useDialog();
  const [loadError, setLoadError] = useState('');
  const [validation, setValidation] = useState([]);
  const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(true);
  const requestVersion = useRef({ version: 0 });
  const historyVersion = useRef({ version: 0 });
  const [entries, setEntries] = useState([{ id: Date.now(), accountType: '', status: '', amount: '', remark: '' }]);
  const [date, setDate] = useState(businessToday());
  const [loading, setLoading] = useState(true);
  const [entryId, setEntryId] = useState(null); // If editing existing
  const [reportStatus, setReportStatus] = useState('DRAFT');
  const [unlockRequested, setUnlockRequested] = useState(false);
  const [unlockReason, setUnlockReason] = useState(null);
  const [requestingCorrection, setRequestingCorrection] = useState(false);
  const [history, setHistory] = useState([]);
  const [viewHistory, setViewHistory] = useState(false);
  const [cameFromHistory, setCameFromHistory] = useState(false);

  const isLocked = reportStatus !== 'DRAFT' || Boolean(loadError);

  useEffect(() => {
    const requests = requestVersion.current;
    const histories = historyVersion.current;
    fetchTodayEntry(date);
    fetchHistory();
    return () => { requests.version++; histories.version++; };
  }, [date]);

  const fetchTodayEntry = async (queryDate) => {
    const request = ++requestVersion.current.version;
    try {
      setLoading(true); setLoadError(''); setValidation([]);
      const res = await api.get(`/business/my-entries?date=${queryDate}&t=${Date.now()}`);
      if (request !== requestVersion.current.version) return;
      if (res.data && res.data.entries) {
        setEntryId(res.data.id);
        setReportStatus((res.data.status || '').toUpperCase());
        setUnlockRequested(Number(res.data.unlock_requested) === 1);
        setUnlockReason(res.data.unlock_reason);
        const mappedEntries = res.data.entries.map((item, index) => ({
          id: item.id || Date.now() + index,
          accountType: item.accountType,
          status: item.status,
          amount: item.amount ?? '',
          remark: item.remark || ''
        }));
        setEntries(mappedEntries.length > 0 ? mappedEntries : [{ id: Date.now(), accountType: '', status: '', amount: '', remark: '' }]);
      } else {
        setEntryId(null);
        setReportStatus('DRAFT');
        setUnlockRequested(false);
        setUnlockReason(null);
        setEntries([{ id: Date.now(), accountType: '', status: '', amount: '', remark: '' }]);
      }
    } catch {
      if (request === requestVersion.current.version) setLoadError("Unable to load the report for this date. Refresh before editing.");
    } finally {
      if (request === requestVersion.current.version) setLoading(false);
    }
  };

  const fetchHistory = async () => {
    const request = ++historyVersion.current.version;
    setHistoryLoading(true); setHistoryError('');
    try {
      const res = await api.get(`/business/history?t=${Date.now()}`);
      if (request === historyVersion.current.version) setHistory(res.data || []);
    } catch {
      if (request === historyVersion.current.version) setHistoryError('Unable to load report history.');
    } finally { if (request === historyVersion.current.version) setHistoryLoading(false); }
  };

  const requestCorrection = async () => {
    if (localStorage.getItem('role') !== 'MANAGER' || loading || requestingCorrection || !entryId || reportStatus !== 'SUBMITTED' || unlockRequested) return;
    const reason = await ask({ title: 'Request a correction', description: 'Report for ' + date + '. Explain what needs to change. Head Office must approve before editing can resume.', reason: true, reasonLabel: 'Requested reason', confirm: 'Send correction request' });
    if (reason === null) return;
    if (!reason.trim() || [...reason.trim()].length > 1000) {
      showToast('Enter a reason of 1 to 1000 characters', 'error');
      return;
    }
    setRequestingCorrection(true);
    try {
      const res = await api.post(`/business/entry/${entryId}/unlock-request`, { reason: reason.trim() });
      setUnlockRequested(Number(res.data.unlock_requested) === 1);
      setUnlockReason(res.data.unlock_reason);
      showToast('Correction request sent to Head Office');
      await fetchTodayEntry(date);
    } catch (err) {
      if (err.response?.status === 409) {
        setReportStatus('UNAVAILABLE');
        await fetchTodayEntry(date);
      }
      showToast(err.response?.data?.message || 'Unable to request correction', 'error');
    } finally {
      setRequestingCorrection(false);
    }
  };

  const totalAmount = useMemo(() => {
    return entries.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [entries]);

  const handleAddRow = () => {
    setEntries([...entries, { id: Date.now(), accountType: '', status: '', amount: '', remark: '' }]);
  };

  const handleRemoveRow = async (id) => {
    if (isLocked || loading) return;
    if (entries.length === 1) {
      if (!await ask({ title: 'Remove the last row?', description: 'This will delete the entire saved draft report, if one exists. This cannot be undone.', confirm: 'Remove last row', danger: true })) {
        return;
      }
      if (entryId) {
        await handleDeleteReport(true);
      } else {
        setEntries([{ id: Date.now(), accountType: '', status: '', amount: '', remark: '' }]);
      }
      return;
    }

    if (!await ask({ title: 'Remove this row?', description: 'For a saved draft, the remaining rows will be saved immediately.', confirm: 'Remove row', danger: true })) {
      return;
    }

    const updatedEntries = entries.filter(e => e.id !== id);
    setEntries(updatedEntries);

    if (entryId) {
      try {
        setLoading(true);
        const payload = {
          date,
          totalAmount: updatedEntries.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
          status: 'DRAFT', // Removing a row must not submit a draft.
          entries: updatedEntries.map((e, index) => ({
            srNo: index + 1,
            accountType: e.accountType,
            status: e.status,
            amount: e.amount === '' ? '0' : e.amount,
            remark: e.remark
          }))
        };
        await api.put(`/business/entry/${entryId}`, payload);
        showToast("Row deleted and saved successfully", "success");
        fetchHistory();
      } catch (err) {
        await fetchTodayEntry(date);
        showToast(err.response?.data?.message || "Failed to save changes", "error");
        console.error("Request failed");
      } finally {
        setLoading(false);
      }
    } else {
      showToast("Row deleted successfully", "success");
    }
  };

  const handleChange = (id, field, value) => {
    setEntries(entries.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const handleSubmit = async (statusType) => {
    if (isLocked || loading) return;
    setValidation([]);
    if (entries.length === 0) {
      showToast("At least one entry is required.", "error");
      return;
    }

    if (statusType === 'submitted') {
      let isValid = true;
      let errorMessages = [];
      entries.forEach((e, index) => {
        if (!e.accountType || e.accountType.trim() === '') {
          errorMessages.push(`Row ${index + 1}: Account Type is required`);
          isValid = false;
        }
        if (!e.status || e.status === '' || e.status === 'Select...') {
          errorMessages.push(`Row ${index + 1}: Status is required`);
          isValid = false;
        }
        if (!/^\d{1,13}(?:\.\d{1,2})?$/.test(String(e.amount))) {
          errorMessages.push(`Row ${index + 1}: Enter a non-negative amount with at most two decimal places`);
          isValid = false;
        }
      });

      if (!isValid) {
        setValidation(errorMessages);
        return;
      }
    }

    if (statusType === 'submitted' && !await ask({ title: 'Submit report to Head Office?', description: 'Report for ' + date + '. Editing will be locked after submission. Further changes require an approved correction request.', confirm: 'Submit report' })) return;
    try {
      setLoading(true);
      const payload = {
        date,
        totalAmount,
        status: statusType, // 'draft' or 'submitted'
        entries: entries.map((e, index) => ({
          srNo: index + 1,
          accountType: e.accountType,
          status: e.status,
          amount: e.amount === '' ? '0' : e.amount,
          remark: e.remark
        }))
      };

      if (entryId) {
        // Update existing
        await api.put(`/business/entry/${entryId}`, payload);
        setReportStatus(statusType.toUpperCase());
        showToast(`Report ${statusType === 'submitted' ? 'Submitted' : 'Saved as Draft'} successfully!`);
      } else {
        // Create new
        const res = await api.post("/business/daily-entry", payload);
        setEntryId(res.data.entryId);
        setReportStatus(statusType.toUpperCase());
        showToast(`Report ${statusType === 'submitted' ? 'Submitted' : 'Saved as Draft'} successfully!`, 'success');
      }
      fetchHistory();
    } catch (err) {
      showToast(err.response?.data?.message || "Error saving report.", "error");
      console.error("Request failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReport = async (skipConfirm = false) => {
    if (!entryId || isLocked || loading) return;
    const isSkip = skipConfirm === true;
    if (!isSkip && !await ask({ title: 'Delete this draft report?', description: 'The report for ' + date + ' and its entries will be removed. This cannot be undone.', confirm: 'Delete draft report', danger: true })) {
      return;
    }
    
    try {
      setLoading(true);
      await api.delete(`/business/entry/${entryId}`);
      showToast("Report deleted successfully!", "success");
      setEntryId(null);
      setReportStatus('DRAFT');
      setEntries([{ id: Date.now(), accountType: '', status: '', amount: '', remark: '' }]);
      
      await fetchHistory(); // Wait for cache-busted history to load
      
      if (cameFromHistory) {
         setViewHistory(true);
         setCameFromHistory(false);
      }
    } catch (err) {
      showToast(err.response?.data?.message || "Error deleting report", "error");
    } finally {
      setLoading(false);
    }
  };

  if (viewHistory) return <section>
    <div className="entry-toolbar"><button onClick={() => setViewHistory(false)}>Back to daily report</button></div>
    <PageHeader title="Report history" description="Open an existing report to review its entries and status." />
    {historyLoading ? <LoadingState>Loading report history…</LoadingState> : historyError ? <InlineError onRetry={fetchHistory}>{historyError}</InlineError> :
      history.length === 0 ? <EmptyState title="No reports have been started for this branch." /> :
      <div className="ops-surface table-scroll" role="region" aria-label="Branch report history" tabIndex="0"><table className="data-table">
        <thead><tr><th scope="col">Business date</th><th scope="col">Status</th><th scope="col" className="numeric">Amount (₹)</th><th scope="col">Report</th></tr></thead>
        <tbody>{history.map(item => <tr key={item.id}><td>{item.entry_date}</td><td><StatusBadge status={item.status} /></td><td className="numeric">{amount(item.total_amount)}</td><td>
          <button onClick={() => { setDate(item.entry_date); setViewHistory(false); setCameFromHistory(true); }}>Open report</button>
        </td></tr>)}</tbody>
      </table></div>}
  </section>;

  return <section className="daily-entry">
    <PageHeader title="Daily business report" description="Enter the branch’s consolidated business for the selected date.">
      <DateControls date={date} onChange={setDate} disabled={loading || requestingCorrection} max={businessToday()} onRefresh={() => fetchTodayEntry(date)} />
    </PageHeader>
    <div className="entry-toolbar">{cameFromHistory ? <button disabled={loading} onClick={() => { setViewHistory(true); setCameFromHistory(false); }}>Back to report history</button> : <span className="muted">Business date: <strong>{date}</strong></span>}
      <button disabled={loading || requestingCorrection} onClick={() => setViewHistory(true)}>Report history</button>
    </div>
    {loadError && <InlineError onRetry={() => fetchTodayEntry(date)}>{loadError}</InlineError>}
    {loading ? <LoadingState>Loading or saving your report…</LoadingState> : !loadError && <>
      <ReportState status={entryId ? reportStatus : 'NOT_STARTED'} pending={unlockRequested} reason={unlockReason} />
      {!entryId && <p className="entry-help">Start with an entry below. Save a draft to continue later, or submit once the report is complete.</p>}
      {validation.length > 0 && <InlineError><strong>Check these entries before submitting:</strong><ul>{validation.map(message => <li key={message}>{message}</li>)}</ul></InlineError>}
      <div className="ops-surface">
        <div className="section-heading"><h2>{isLocked ? 'Reported entries' : 'Report entries'}</h2><span className="muted">{entries.length} {entries.length === 1 ? 'row' : 'rows'}</span></div>
        <div className="table-scroll" role="region" aria-label="Daily report entries" tabIndex="0">
          <table className="entry-table">
            <thead><tr><th scope="col" className="row-number">No.</th><th scope="col" className="account-column">Account type</th><th scope="col" className="status-column">Activity</th><th scope="col" className="amount-column numeric">Amount (₹)</th><th scope="col">Remark</th>{!isLocked && <th scope="col" className="remove-column"><span className="sr-only">Remove row</span></th>}</tr></thead>
            <tbody>{entries.map((entry, index) => <tr key={entry.id}>
              <td>{index + 1}</td>
              {isLocked ? <><td>{entry.accountType || '—'}</td><td>{entry.status || '—'}</td><td className="numeric">{amount(entry.amount || '0')}</td><td>{entry.remark || '—'}</td></> : <>
                <td><input list="account-types" value={entry.accountType} onChange={event => handleChange(entry.id, 'accountType', event.target.value)} placeholder="Search or select account type" aria-label={`Row ${index + 1} account type`} required /></td>
                <td><select value={entry.status} onChange={event => handleChange(entry.id, 'status', event.target.value)} aria-label={`Row ${index + 1} activity`} required><option value="">Select activity</option>{STATUS_OPTIONS.map(option => <option key={option}>{option}</option>)}</select></td>
                <td><input type="number" min="0" step="0.01" value={entry.amount} onChange={event => handleChange(entry.id, 'amount', event.target.value)} placeholder="0.00" aria-label={`Row ${index + 1} amount in rupees`} /></td>
                <td><input value={entry.remark} onChange={event => handleChange(entry.id, 'remark', event.target.value)} placeholder="Optional" aria-label={`Row ${index + 1} remark`} /></td>
                <td><button className="remove-row" disabled={loading} onClick={() => handleRemoveRow(entry.id)} aria-label={`Remove row ${index + 1}`}>Remove</button></td>
              </>}
            </tr>)}</tbody>
          </table>
        </div>
        <datalist id="account-types">{ACCOUNT_TYPE_OPTIONS.map(option => <option key={option.label} value={option.label}>{option.group}</option>)}</datalist>
        <div className="entry-total">{!isLocked && <button disabled={loading} onClick={handleAddRow}>+ Add row</button>}
          <div><span>Total entered amount</span><strong>₹ {totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
        </div>
      </div>
      <div className="entry-actions">
        {reportStatus === 'SUBMITTED' && !unlockRequested && localStorage.getItem('role') === 'MANAGER' &&
          <button disabled={requestingCorrection} onClick={requestCorrection}>{requestingCorrection ? 'Sending request…' : 'Request correction'}</button>}
        {!isLocked && <>
          {entryId && <button className="danger-button delete-report" disabled={loading} onClick={() => handleDeleteReport(false)}>Delete draft</button>}
          <button disabled={loading} onClick={() => handleSubmit('draft')}>Save draft</button>
          <button className="primary-button" disabled={loading} onClick={() => handleSubmit('submitted')}>Submit report</button>
          <p>Save keeps the report editable. Submit sends it to Head Office and locks editing.</p>
        </>}
      </div>
      {entryId && localStorage.getItem('role') === 'MANAGER' && <ReportAuditHistory key={entryId} entryId={entryId} revision={`${reportStatus}:${unlockRequested}`} />}
    </>}
  </section>;
}

export default DynamicEntryTable;
