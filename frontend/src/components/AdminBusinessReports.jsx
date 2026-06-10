import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './AdminBusinessReports.css';

function AdminBusinessReports({ token }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [districtFilter, setDistrictFilter] = useState("ALL");
  
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [branchDetails, setBranchDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    fetchAllBranches();
  }, [date]);

  const fetchAllBranches = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`http://localhost:5000/api/business/all-branches?date=${date}&t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
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
      const res = await axios.get(`http://localhost:5000/api/business/branch/${branchId}?date=${date}&t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
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
  };

  if (selectedBranch && branchDetails) {
    return (
      <div className="admin-reports-container">
        <button className="back-btn" onClick={handleBack}>← Back to All Branches</button>
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
