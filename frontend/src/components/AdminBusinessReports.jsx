import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './AdminBusinessReports.css';

function AdminBusinessReports({ token }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [branchDetails, setBranchDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    fetchAllBranches();
  }, [date]);

  const fetchAllBranches = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`http://localhost:5000/api/business/all-branches?date=${date}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBranches(res.data);
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
      const res = await axios.get(`http://localhost:5000/api/business/branch/${branchId}?date=${date}`, {
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

        <table className="admin-data-table">
          <thead>
            <tr>
              <th>Sr</th>
              <th>Account Type</th>
              <th>Status</th>
              <th>Amount (₹)</th>
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
                  <td><span className={`status-badge ${item.status === 'Opened' || item.status === 'Disbursed' ? 'status-completed-mgr' : 'status-pending-mgr'}`}>{item.status}</span></td>
                  <td>{Number(item.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
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

  const grandTotal = branches.reduce((acc, curr) => acc + Number(curr.total_amount || 0), 0);
  const totalEntries = branches.reduce((acc, curr) => acc + Number(curr.total_entries || 0), 0);

  return (
    <div className="admin-reports-container">
      <div className="reports-header-flex">
        <h2>ALL BRANCHES - TODAY'S BUSINESS</h2>
        <div className="date-filter">
          <label>Date: </label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} max={new Date().toISOString().split('T')[0]} />
        </div>
      </div>

      {loading ? <p>Loading data...</p> : (
        <table className="admin-data-table">
          <thead>
            <tr>
              <th>Branch</th>
              <th>Entries</th>
              <th>Amount (₹)</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {branches.length === 0 ? (
              <tr><td colSpan="5" style={{textAlign: 'center'}}>No branches found or no data available.</td></tr>
            ) : (
              branches.map(b => (
                <tr key={b.branch_id}>
                  <td>{b.branch_name}</td>
                  <td align="center">{b.total_entries || 0}</td>
                  <td>{Number(b.total_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                  <td>
                    {b.status === 'submitted' ? (
                       <span className="status-badge status-completed-mgr">Submitted</span>
                    ) : (
                       <span className="status-badge status-pending-mgr">{b.status || 'No Entry'}</span>
                    )}
                  </td>
                  <td align="center">
                    <button className="view-btn" onClick={() => fetchBranchDetails(b.branch_id)}>View Details</button>
                  </td>
                </tr>
              ))
            )}
            {branches.length > 0 && (
              <tr className="gross-total-row">
                <td><strong>TOTAL</strong></td>
                <td align="center"><strong>{totalEntries}</strong></td>
                <td><strong>₹ {grandTotal.toLocaleString('en-IN')}</strong></td>
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
