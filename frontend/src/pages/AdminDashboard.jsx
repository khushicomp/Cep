import { useState } from 'react';
import AdminBusinessReports from '../components/AdminBusinessReports';
import AdminBusinessAnalytics from '../components/AdminBusinessAnalytics';
import WorkspaceShell from '../components/WorkspaceShell';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('reports');
  const isHeadOffice = localStorage.getItem('role') === 'HEAD_OFFICE';
  return <WorkspaceShell workspace={isHeadOffice ? 'Head Office' : 'Admin'} active={activeTab} onNavigate={setActiveTab}>
    {activeTab === 'reports' && <AdminBusinessReports />}
    {activeTab === 'analytics' && <AdminBusinessAnalytics />}
  </WorkspaceShell>;
}
