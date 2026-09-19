import React, { useState, useEffect, useMemo } from 'react';
import './DynamicEntryTable.css';
import { showToast } from '../utils/toast';
import api from '../services/api';
import { businessToday } from '../utils/businessDate';

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
  const [entries, setEntries] = useState([{ id: Date.now(), accountType: '', status: '', amount: '', remark: '' }]);
  const [date, setDate] = useState(businessToday());
  const [loading, setLoading] = useState(false);
  const [entryId, setEntryId] = useState(null); // If editing existing
  const [reportStatus, setReportStatus] = useState('DRAFT');
  const [history, setHistory] = useState([]);
  const [viewHistory, setViewHistory] = useState(false);
  const [cameFromHistory, setCameFromHistory] = useState(false);

  const isLocked = reportStatus !== 'DRAFT';

  useEffect(() => {
    fetchTodayEntry(date);
    fetchHistory();
  }, [date]);

  const fetchTodayEntry = async (queryDate) => {
    try {
      setLoading(true);
      const res = await api.get(`/business/my-entries?date=${queryDate}&t=${Date.now()}`);
      if (res.data && res.data.entries) {
        setEntryId(res.data.id);
        setReportStatus((res.data.status || '').toUpperCase());
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
        setEntries([{ id: Date.now(), accountType: '', status: '', amount: '', remark: '' }]);
      }
    } catch {
      console.error("Request failed");
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await api.get(`/business/history?t=${Date.now()}`);
      setHistory(res.data || []);
    } catch {
      console.error("Request failed");
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
      if (!window.confirm("This is the last row. Deleting it will remove the entire entry. Continue?")) {
        return;
      }
      if (entryId) {
        await handleDeleteReport(true);
      } else {
        setEntries([{ id: Date.now(), accountType: '', status: '', amount: '', remark: '' }]);
      }
      return;
    }

    if (!window.confirm("Are you sure you want to delete this row?")) {
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
        alert('Please fix the following errors:\n\n' + errorMessages.join('\n'));
        return;
      }
    }

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
        alert(`Report ${statusType === 'submitted' ? 'Submitted' : 'Saved as Draft'} successfully!`);
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
    if (!isSkip && !window.confirm("Are you sure you want to delete this report? This action cannot be undone.")) {
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

  if (viewHistory) {
    return (
      <div className="history-view">
        <button className="back-btn" onClick={() => setViewHistory(false)}>← Back to Entry Form</button>
        <h2>Recent Submissions</h2>
        <table className="tasks-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Total Amount (₹)</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? <tr><td colSpan="4" style={{textAlign:'center'}}>No history found</td></tr> :
              history.map(h => (
                <tr key={h.id}>
                  <td>{h.entry_date}</td>
                  <td>₹ {Number(h.total_amount).toLocaleString()}</td>
                  <td><span className={`status-badge ${['SUBMITTED', 'FINAL_LOCKED'].includes(h.status) ? 'status-completed-mgr' : 'status-pending-mgr'}`}>{h.status.toUpperCase()}</span></td>
                  <td>
                    <button onClick={() => { 
                      setDate(h.entry_date);
                      setViewHistory(false); 
                      setCameFromHistory(true); 
                    }} className="action-link-btn">
                      View/Edit
                    </button>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="dynamic-entry-container">
      <div className="entry-header" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        {cameFromHistory && (
           <button className="back-btn" onClick={() => { setViewHistory(true); setCameFromHistory(false); }} style={{ padding: '0.4rem 0.8rem', marginRight: '10px' }}>← Back to History</button>
        )}
        <h2 style={{ flex: 1, margin: 0 }}>Daily Business Entry</h2>
        <div className="entry-controls">
          <label>Date: </label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={businessToday()} />
          <button className="history-btn" onClick={() => setViewHistory(true)}>View History</button>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="entry-table">
          <thead>
            <tr>
              <th width="5%">Sr</th>
              <th width="35%">Account Type</th>
              <th width="15%">Status</th>
              <th width="15%">Amount (₹)</th>
              <th width="20%">Remark</th>
              <th width="10%">Action</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr key={entry.id}>
                <td align="center">{index + 1}</td>
                <td>
                  <input 
                    list="account-types" 
                    value={entry.accountType} 
                    onChange={(e) => handleChange(entry.id, 'accountType', e.target.value)} 
                    placeholder="Search or Select..."
                    className="form-input"
                    disabled={isLocked || loading}
                    required
                  />
                  <datalist id="account-types">
                    {ACCOUNT_TYPE_OPTIONS.map((opt, i) => (
                      <option key={i} value={opt.label}>{opt.group}</option>
                    ))}
                  </datalist>
                </td>
                <td>
                  <select 
                    value={entry.status} 
                    onChange={(e) => handleChange(entry.id, 'status', e.target.value)}
                    className="form-select"
                    disabled={isLocked || loading}
                    required
                  >
                    <option value="">Select...</option>
                    {STATUS_OPTIONS.map((opt, i) => (
                      <option key={i} value={opt}>{opt}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input 
                    type="number" 
                    min="0"
                    step="0.01"
                    value={entry.amount} 
                    onChange={(e) => handleChange(entry.id, 'amount', e.target.value)}
                    className="form-input"
                    disabled={isLocked || loading}
                    placeholder="0.00"
                  />
                </td>
                <td>
                  <input 
                    type="text" 
                    value={entry.remark} 
                    onChange={(e) => handleChange(entry.id, 'remark', e.target.value)}
                    className="form-input"
                    disabled={isLocked || loading}
                    placeholder="Optional"
                  />
                </td>
                <td align="center">
                  {!isLocked && (
                    <button type="button" onClick={() => handleRemoveRow(entry.id)} className="icon-btn-delete" title="Remove Row">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                      </svg>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="entry-footer">
        {!isLocked && (
          <button type="button" onClick={handleAddRow} className="add-row-btn">
            + Add Row
          </button>
        )}
        <div className="total-calculation" style={{ marginLeft: isLocked ? 'auto' : '0' }}>
          <strong>Total Amount: </strong> 
          <span className="total-val">₹ {totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
        </div>
      </div>

      <div className="entry-actions">
        {isLocked ? (
          <div className="locked-notice" style={{ color: '#EF4444', fontWeight: 'bold', padding: '10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔒</span> This report is {reportStatus} and cannot be edited.
          </div>
        ) : (
          <>
            {entryId && (
              <button 
                 onClick={() => handleDeleteReport(false)} 
                 disabled={loading} 
                 className="draft-btn" 
                 style={{ backgroundColor: '#EF4444', color: 'white', borderColor: '#DC2626', marginRight: 'auto' }}
              >
                {loading ? 'Deleting...' : 'Delete Report'}
              </button>
            )}
            <button 
              onClick={() => handleSubmit('draft')} 
              disabled={loading} 
              className="draft-btn"
            >
              {loading ? 'Saving...' : 'Save as Draft'}
            </button>
            <button 
              onClick={() => handleSubmit('submitted')} 
              disabled={loading} 
              className="submit-report-btn"
            >
              {loading ? 'Submitting...' : 'Submit Final Report'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default DynamicEntryTable;
