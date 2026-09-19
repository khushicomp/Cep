import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './AdminBusinessReports.css';

function AdminBusinessAnalytics() {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const res = await api.get('/business/reports');
      setReportData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <p>Loading Analytics...</p>;
  if (!reportData) return <p>Failed to load analytics.</p>;

  return (
    <div className="admin-reports-container">
      <div className="reports-header-flex">
        <h2>OVERALL STATISTICS (All Time)</h2>
      </div>

      <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
        <div style={{ flex: 1, padding: '20px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: 0, color: '#64748b', fontSize: '0.9rem', textTransform: 'uppercase' }}>Total Business</h3>
          <p style={{ margin: '10px 0 0', fontSize: '1.8rem', fontWeight: 'bold', color: '#10b981' }}>
            ₹ {Number(reportData.overall.totalBusiness || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </p>
        </div>
        
        <div style={{ flex: 1, padding: '20px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: 0, color: '#64748b', fontSize: '0.9rem', textTransform: 'uppercase' }}>Total Accounts / Items processed</h3>
          <p style={{ margin: '10px 0 0', fontSize: '1.8rem', fontWeight: 'bold', color: '#3b82f6' }}>
            {reportData.overall.totalAccountsOpened || 0}
          </p>
        </div>
      </div>

      <div className="details-header">
        <h2>Account Type Breakdown (Top 10)</h2>
      </div>

      <table className="admin-data-table">
        <thead>
          <tr>
            <th>Account Type</th>
            <th>Count</th>
            <th>Total Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          {reportData.breakdown && reportData.breakdown.length > 0 ? (
            reportData.breakdown.map((item, idx) => (
              <tr key={idx}>
                <td><strong>{item.account_type}</strong></td>
                <td>{item.count}</td>
                <td>{Number(item.amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
              </tr>
            ))
          ) : (
            <tr><td colSpan="3" align="center">No data available</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default AdminBusinessAnalytics;
