import DynamicEntryTable from '../components/DynamicEntryTable';
import WorkspaceShell from '../components/WorkspaceShell';

export default function ManagerDashboard() {
  let user;
  try { user = JSON.parse(localStorage.getItem('user') || 'null'); } catch { user = null; }
  const branch = [user?.branch_name || 'Branch unavailable', user?.branch_code].filter(Boolean).join(' · ');
  return <WorkspaceShell workspace="Manager" branch={branch}>
    <div className="branch-context"><span className="eyebrow">Your branch</span><strong>{branch}</strong></div>
    <DynamicEntryTable />
  </WorkspaceShell>;
}
