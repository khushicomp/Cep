import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import './DynamicEntryTable.css';

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

function DynamicEntryTable({ token }) {
  const [entries, setEntries] = useState([{ id: Date.now(), accountType: '', status: '', amount: '', remark: '' }]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [entryId, setEntryId] = useState(null); // If editing existing
  const [history, setHistory] = useState([]);
  const [viewHistory, setViewHistory] = useState(false);

  // Decode basic token info if accessible or rely on backend.
  // Actually, we need branchId for creation. If we don't have it, we might need to fetch the manager profile or depend on the backend retrieving branch via user_id.
  // The backend already knows branch_id from req.user? Let's assume frontend just sends empty branch if it doesn't know, but we should extract from token.
  let branchId = '';
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    branchId = payload.branch_id;
  } catch (e) {}

  useEffect(() => {
    fetchTodayEntry(date);
    fetchHistory();
  }, [date]);

  const fetchTodayEntry = async (queryDate) => {
    try {
      setLoading(true);
      const res = await axios.get(`http://localhost:5000/api/business/my-entries?date=${queryDate}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data && res.data.entries) {
        setEntryId(res.data.id);
        const mappedEntries = res.data.entries.map((item, index) => ({
          id: item.id || Date.now() + index,
          accountType: item.accountType,
          status: item.status,
          amount: item.amount || '',
          remark: item.remark || ''
        }));
        setEntries(mappedEntries.length > 0 ? mappedEntries : [{ id: Date.now(), accountType: '', status: '', amount: '', remark: '' }]);
      } else {
        setEntryId(null);
        setEntries([{ id: Date.now(), accountType: '', status: '', amount: '', remark: '' }]);
      }
    } catch (err) {
      console.error('Failed to fetch entry for date', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`http://localhost:5000/api/business/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setHistory(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const totalAmount = useMemo(() => {
    return entries.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [entries]);

  const handleAddRow = () => {
    setEntries([...entries, { id: Date.now(), accountType: '', status: '', amount: '', remark: '' }]);
  };

  const handleRemoveRow = (id) => {
    setEntries(entries.filter(e => e.id !== id));
  };

  const handleChange = (id, field, value) => {
    setEntries(entries.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const handleSubmit = async (statusType) => {
    if (entries.length === 0) {
      alert("At least one entry is required.");
      return;
    }

    try {
      setLoading(true);
      const payload = {
        branchId,
        date,
        totalAmount,
        status: statusType, // 'draft' or 'submitted'
        entries: entries.map((e, index) => ({
          srNo: index + 1,
          accountType: e.accountType,
          status: e.status,
          amount: Number(e.amount) || 0,
          remark: e.remark
        }))
      };

      if (entryId) {
        // Update existing
        await axios.put(`http://localhost:5000/api/business/entry/${entryId}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert(`Report ${statusType === 'submitted' ? 'Submitted' : 'Saved as Draft'} successfully!`);
      } else {
        // Create new
        const res = await axios.post(`http://localhost:5000/api/business/daily-entry`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setEntryId(res.data.entryId);
        alert(`Report ${statusType === 'submitted' ? 'Submitted' : 'Saved as Draft'} successfully!`);
      }
      fetchHistory();
    } catch (err) {
      alert("Error saving report.");
      console.error(err);
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
                  <td>{new Date(h.entry_date).toLocaleDateString()}</td>
                  <td>₹ {Number(h.total_amount).toLocaleString()}</td>
                  <td><span className={`status-badge ${h.status === 'submitted' ? 'status-completed-mgr' : 'status-pending-mgr'}`}>{h.status.toUpperCase()}</span></td>
                  <td>
                    <button onClick={() => { setDate(h.entry_date.split('T')[0]); setViewHistory(false); }} className="action-link-btn">
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
      <div className="entry-header">
        <h2>Daily Business Entry</h2>
        <div className="entry-controls">
          <label>Date: </label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={new Date().toISOString().split('T')[0]} />
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
                    placeholder="0.00"
                  />
                </td>
                <td>
                  <input 
                    type="text" 
                    value={entry.remark} 
                    onChange={(e) => handleChange(entry.id, 'remark', e.target.value)}
                    className="form-input"
                    placeholder="Optional"
                  />
                </td>
                <td align="center">
                  <button type="button" onClick={() => handleRemoveRow(entry.id)} className="icon-btn-delete" title="Remove Row">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="entry-footer">
        <button type="button" onClick={handleAddRow} className="add-row-btn">
          + Add Row
        </button>
        <div className="total-calculation">
          <strong>Total Amount: </strong> 
          <span className="total-val">₹ {totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
        </div>
      </div>

      <div className="entry-actions">
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
      </div>
    </div>
  );
}

export default DynamicEntryTable;
