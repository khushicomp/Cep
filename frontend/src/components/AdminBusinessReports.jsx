import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './AdminBusinessReports.css';

const ACCOUNT_TYPE_OPTIONS = [
  { group: 'DEPOSITS', label: 'Savings Account (SB)' },
  { group: 'DEPOSITS', label: 'Fixed Deposit (FD)' },
  { group: 'DEPOSITS', label: 'Current Account (CA)' },
  { group: 'DEPOSITS', label: 'CASA' },
  { group: 'SHARES', label: 'Regular Share' },
  { group: 'SHARES', label: 'Link Share' },
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
  { group: 'OTHERS', label: 'NPA Regularised' },
  { group: 'OTHERS', label: 'New Proposal to HO' },
  { group: 'OTHERS', label: 'Custom Entry' }
];

const STATUS_OPTIONS = [
  'Opened', 'Disbursed', 'Regularised', 'Sanctioned', 'Pending', 'Sent to HO'
];

function AdminBusinessReports() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [districtFilter, setDistrictFilter] = useState("ALL");
  
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [branchDetails, setBranchDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Admin edit and history states
  const [viewHistory, setViewHistory] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editEntries, setEditEntries] = useState([]);
  const [editEntryId, setEditEntryId] = useState(null);

  useEffect(() => {
    fetchAllBranches();
  }, [date]);

  const fetchAllBranches = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/business/all-branches?date=${date}&t=${Date.now()}`);
      if (res.data.branches) {
        setBranches(res.data.branches);
      } else if (Array.isArray(res.data)) {
        setBranches(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBranchDetails = async (branchId) => {
    try {
      setDetailsLoading(true);
      setSelectedBranch(branchId);
      const res = await api.get(`/business/branch/${branchId}?date=${date}&t=${Date.now()}`);
      setBranchDetails(res.data);
    } catch (err) {
      if (err.response && err.response.status === 404) {
        setBranchDetails({ entries: [] });
      } else {
        console.error(err);
      }
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleBack = () => {
    setSelectedBranch(null);
    setBranchDetails(null);
    setViewHistory(false);
    setIsEditing(false);
  };

  const fetchBranchHistory = async (branchId) => {
    try {
      setHistoryLoading(true);
      setViewHistory(true);
      setIsEditing(false);
      const res = await api.get(`/business/branch-history/${branchId}`);
      setHistoryList(res.data || []);
    } catch (err) {
      console.error("Error fetching branch history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const startEditing = () => {
    setIsEditing(true);
    setEditEntries(branchDetails.entries.map(item => ({
      id: item.id || Date.now() + Math.random(),
      accountType: item.accountType,
      status: item.status,
      amount: item.amount || '',
      remark: item.remark || ''
    })));
    setEditEntryId(branchDetails.id);
  };

  const handleEditChange = (id, field, value) => {
    setEditEntries(editEntries.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const handleEditRemoveRow = (id) => {
    if (editEntries.length === 1) {
      alert("Cannot delete the last row.");
      return;
    }
    setEditEntries(editEntries.filter(e => e.id !== id));
  };

  const handleEditAddRow = () => {
    setEditEntries([...editEntries, { id: Date.now(), accountType: '', status: '', amount: '', remark: '' }]);
  };

  const saveAdminEdits = async () => {
    let isValid = true;
    let errorMessages = [];
    editEntries.forEach((e, index) => {
      if (!e.accountType || e.accountType.trim() === '') {
        errorMessages.push(`Row ${index + 1}: Account Type is required`);
        isValid = false;
      }
      if (!e.status || e.status === '' || e.status === 'Select...') {
        errorMessages.push(`Row ${index + 1}: Status is required`);
        isValid = false;
      }
      if (!e.amount || Number(e.amount) <= 0) {
        errorMessages.push(`Row ${index + 1}: Amount must be greater than 0`);
        isValid = false;
      }
    });

    if (!isValid) {
      alert('Please fix the following errors:\n\n' + errorMessages.join('\n'));
      return;
    }

    try {
      const totalAmount = editEntries.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      const payload = {
        totalAmount,
        status: branchDetails.status, // Keep original status (e.g. 'submitted')
        entries: editEntries.map((e, index) => ({
          srNo: index + 1,
          accountType: e.accountType,
          status: e.status,
          amount: Number(e.amount) || 0,
          remark: e.remark
        }))
      };

      await api.put(`/business/entry/${editEntryId}`, payload);
      alert("Report updated successfully by Admin!");
      setIsEditing(false);
      fetchBranchDetails(selectedBranch); // Reload details
      fetchAllBranches(); // Reload overview list
    } catch (err) {
      console.error(err);
      alert("Failed to update report.");
    }
  };

  if (viewHistory) {
    return (
      <div className="admin-reports-container">
        <button className="back-btn" onClick={() => setViewHistory(false)}>← Back to Branch Details</button>
        <h2>Submission History: {branchDetails?.branch_name || 'N/A'}</h2>
        {historyLoading ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p className="loading-text">Loading branch history...</p>
          </div>
        ) : (
          <table className="data-table" style={{ marginTop: '20px' }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Total Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {historyList.length === 0 ? (
                <tr><td colSpan="4" style={{textAlign: 'center'}}>No history found for this branch.</td></tr>
              ) : (
                historyList.map(h => (
                  <tr key={h.id}>
                    <td>{new Date(h.entry_date).toLocaleDateString()}</td>
                    <td>₹ {Number(h.total_amount).toLocaleString('en-IN')}</td>
                    <td>
                      <span className={`status-badge ${h.status === 'submitted' ? 'submitted' : 'pending'}`}>
                        {h.status.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <button 
                        className="btn-view-details" 
                        onClick={() => {
                          const d = new Date(h.entry_date);
                          const localDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                          setDate(localDateStr);
                          setViewHistory(false);
                          fetchBranchDetails(selectedBranch);
                        }}
                      >
                        View/Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  if (selectedBranch && branchDetails) {
    if (isEditing) {
      return (
        <div className="admin-reports-container">
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button className="back-btn" onClick={() => setIsEditing(false)}>Cancel</button>
          </div>
          <div className="details-header">
            <h2>Edit Branch Details: {branchDetails.branch_name || 'N/A'}</h2>
            <p><strong>Manager:</strong> {branchDetails.manager_name || 'N/A'} | <strong>Date:</strong> {date}</p>
          </div>

          <table className="data-table">
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
              {editEntries.map((entry, index) => (
                <tr key={entry.id}>
                  <td align="center">{index + 1}</td>
                  <td>
                    <input 
                      list="admin-account-types" 
                      value={entry.accountType} 
                      onChange={(e) => handleEditChange(entry.id, 'accountType', e.target.value)} 
                      placeholder="Search or Select..."
                      className="form-input"
                      style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                      required
                    />
                    <datalist id="admin-account-types">
                      {ACCOUNT_TYPE_OPTIONS.map((opt, i) => (
                        <option key={i} value={opt.label}>{opt.group}</option>
                      ))}
                    </datalist>
                  </td>
                  <td>
                    <select 
                      value={entry.status} 
                      onChange={(e) => handleEditChange(entry.id, 'status', e.target.value)}
                      className="form-select"
                      style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
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
                      onChange={(e) => handleEditChange(entry.id, 'amount', e.target.value)}
                      className="form-input"
                      style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                      placeholder="0.00"
                    />
                  </td>
                  <td>
                    <input 
                      type="text" 
                      value={entry.remark} 
                      onChange={(e) => handleEditChange(entry.id, 'remark', e.target.value)}
                      className="form-input"
                      style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                      placeholder="Optional"
                    />
                  </td>
                  <td align="center">
                    <button type="button" onClick={() => handleEditRemoveRow(entry.id)} className="icon-btn-delete" title="Remove Row" style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '1.2rem' }}>
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px' }}>
            <button type="button" onClick={handleEditAddRow} className="add-row-btn" style={{ padding: '8px 16px', backgroundColor: '#e2e8f0', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer' }}>
              + Add Row
            </button>
            <div>
              <strong>Total Amount: </strong>
              <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#10b981' }}>
                ₹ {editEntries.reduce((sum, item) => sum + (Number(item.amount) || 0), 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '30px' }}>
            <button className="back-btn" onClick={() => setIsEditing(false)} style={{ backgroundColor: '#cbd5e1', color: '#1e293b' }}>Cancel</button>
            <button className="submit-report-btn" onClick={saveAdminEdits} style={{ backgroundColor: '#10b981', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
              Save Changes
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="admin-reports-container">
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="back-btn" onClick={handleBack}>← Back to All Branches</button>
          <button className="history-btn" onClick={() => fetchBranchHistory(selectedBranch)} style={{ padding: '0.5rem 1rem', backgroundColor: '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
            📜 View Submission History
          </button>
          {branchDetails.id && (
            <button className="edit-btn" style={{ marginLeft: 'auto', padding: '0.5rem 1rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }} onClick={startEditing}>
              ✏️ Edit Report
            </button>
          )}
        </div>
        <div className="details-header">
          <h2>Branch Details: {branchDetails.branch_name || 'N/A'}</h2>
          <p><strong>Manager:</strong> {branchDetails.manager_name || 'N/A'} | <strong>Date:</strong> {date}</p>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Sr</th>
              <th>Account Type</th>
              <th>Status</th>
              <th style={{textAlign: 'right'}}>Amount (₹)</th>
              <th>Remark</th>
            </tr>
          </thead>
          <tbody>
            {!branchDetails.entries || branchDetails.entries.length === 0 ? (
              <tr><td colSpan="5" style={{textAlign: 'center'}}>No entries found for this branch today.</td></tr>
            ) : (
              branchDetails.entries.map((item, idx) => (
                <tr key={idx}>
                  <td align="center">{item.srNo}</td>
                  <td>{item.accountType}</td>
                  <td><span className={`status-badge ${item.status === 'Opened' || item.status === 'Disbursed' ? 'submitted' : 'pending'}`}>{item.status}</span></td>
                  <td className="amount-cell">
                    <span className="currency-symbol">₹</span>
                    <span className="amount-value">{Number(item.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                  </td>
                  <td>{item.remark}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        
        <div className="details-footer">
          <h3>Total: ₹ {Number(branchDetails.total_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</h3>
        </div>
      </div>
    );
  }

  const totalBranches = branches.length;
  const activeBranches = branches.filter(b => b.status === 'submitted').length;
  const pendingReports = totalBranches - activeBranches;
  const grandTotal = branches.reduce((acc, curr) => acc + Number(curr.total_amount || 0), 0);
  const totalEntries = branches.reduce((acc, curr) => acc + Number(curr.total_entries || 0), 0);

  return (
    <div className="admin-reports-container">
      
      {/* Overview Statistics Cards */}
      <div className="overview-cards">
          <div className="overview-card orange">
              <div className="overview-card-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
                  </svg>
              </div>
              <div className="overview-card-title">Total Business</div>
              <div className="overview-card-value">₹ {grandTotal.toLocaleString('en-IN')}</div>
              <div className="overview-card-change">Today's collection</div>
          </div>
          
          <div className="overview-card green">
              <div className="overview-card-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" />
                  </svg>
              </div>
              <div className="overview-card-title">Active Branches</div>
              <div className="overview-card-value">{activeBranches}</div>
              <div className="overview-card-subtitle">Submitted reports</div>
          </div>
          
          <div className="overview-card blue">
              <div className="overview-card-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
                  </svg>
              </div>
              <div className="overview-card-title">Total Entries</div>
              <div className="overview-card-value">{totalEntries}</div>
              <div className="overview-card-subtitle">Today's transactions</div>
          </div>
          
          <div className="overview-card gray">
              <div className="overview-card-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
                  </svg>
              </div>
              <div className="overview-card-title">Pending Reports</div>
              <div className="overview-card-value">{pendingReports}</div>
              <div className="overview-card-subtitle">Awaiting submission</div>
          </div>
      </div>

      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <h2 className="section-title">ALL BRANCHES - TODAY'S BUSINESS</h2>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className={`filter-btn ${districtFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setDistrictFilter('ALL')}
          >All</button>
          <button 
            className={`filter-btn ${districtFilter === 'AKOLA' ? 'active' : ''}`}
            onClick={() => setDistrictFilter('AKOLA')}
          >Akola District</button>
          <button 
            className={`filter-btn ${districtFilter === 'OTHER' ? 'active' : ''}`}
            onClick={() => setDistrictFilter('OTHER')}
          >Other Districts</button>
        </div>

        <div className="date-filter-container">
          <label className="date-label">Date: </label>
          <input className="date-input" type="date" value={date} onChange={e => setDate(e.target.value)} max={new Date().toISOString().split('T')[0]} />
        </div>
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading branch data...</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Branch</th>
              <th style={{textAlign: 'right'}}>Entries</th>
              <th style={{textAlign: 'right'}}>Amount (₹)</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {branches.length === 0 ? (
              <tr>
                <td colSpan="5" className="empty-state">
                  <div className="empty-state-icon">🏢</div>
                  <div className="empty-state-title">No Business Data Available</div>
                  <div className="empty-state-message">
                      No branches have generated data for {date}.<br />
                      Check back later or contact branch managers.
                  </div>
                </td>
              </tr>
            ) : (
              branches
              .filter(b => {
                if (districtFilter === 'AKOLA') return b.branchDistrict === 'Akola';
                if (districtFilter === 'OTHER') return b.branchDistrict !== 'Akola';
                return true;
              })
              .map(b => (
                <tr key={b._id || b.branch_id}>
                  <td>
                    {b.branchName || b.branch_name}
                    <div style={{fontSize: '0.75rem', color: '#64748b'}}>{b.branchDistrict || ''}</div>
                  </td>
                  <td align="right" className="amount-cell"><span className="amount-value" style={{color: 'var(--gray-700)'}}>{b.totalEntries || b.total_entries || 0}</span></td>
                  <td className="amount-cell">
                    <span className="currency-symbol">₹</span>
                    <span className="amount-value">{Number(b.totalAmount || b.total_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                  </td>
                  <td>
                    {(b.status || '').toLowerCase() === 'submitted' ? (
                       <span className="status-badge submitted">Submitted</span>
                    ) : (
                       <span className="status-badge pending">{b.status || 'No Entry'}</span>
                    )}
                  </td>
                  <td align="center">
                    <button className="btn-view-details" onClick={() => fetchBranchDetails(b._id || b.branch_id)}>View Details</button>
                  </td>
                </tr>
              ))
            )}
            {branches.length > 0 && (
              <tr className="total-row">
                <td><strong>TOTAL</strong></td>
                <td align="right" className="amount-cell">
                  <span className="amount-value" style={{color: '#1F2937'}}>{totalEntries}</span>
                </td>
                <td className="amount-cell">
                  <span className="currency-symbol">₹</span>
                  <span className="amount-value">{grandTotal.toLocaleString('en-IN')}</span>
                </td>
                <td></td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default AdminBusinessReports;
