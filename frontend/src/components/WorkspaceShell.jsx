import { useNavigate } from 'react-router-dom';
import { clearSession } from '../utils/auth';
import WorkflowDialog from './WorkflowDialog';
import bankLogo from '../../images.png';

export default function WorkspaceShell({ workspace, branch, active = 'reports', onNavigate, children }) {
  const navigate = useNavigate();
  let user;
  try { user = JSON.parse(localStorage.getItem('user') || 'null'); } catch { user = null; }
  const logout = () => { clearSession(); navigate('/'); };
  return <WorkflowDialog><div className="workspace-shell">
    <a className="skip-link" href="#workspace-main">Skip to main content</a>
    <header className="workspace-topbar">
      <div className="bank-identity"><img src={bankLogo} alt="" /><div><strong>The Akola Urban Co-operative Bank Ltd.</strong><span>Branch reporting & operations</span></div></div>
      <div className="session-context"><div><strong>{user?.name || workspace}</strong><span>{workspace}</span></div><button onClick={logout}>Log out</button></div>
    </header>
    <div className="workspace-layout">
      <aside className="workspace-sidebar">
        <div className="workspace-caption"><span className="eyebrow">Workspace</span><strong>{workspace}</strong>{branch && <p>{branch}</p>}</div>
        <nav aria-label={`${workspace} navigation`}>
          <button aria-current={active === 'reports' ? 'page' : undefined} onClick={() => onNavigate?.('reports')}>{branch ? 'Daily reporting' : 'Daily operations'}</button>
          {onNavigate && <button aria-current={active === 'analytics' ? 'page' : undefined} onClick={() => onNavigate('analytics')}>Business analytics</button>}
        </nav>
        <p className="workspace-note">Daily business reporting<br />Internal operations</p>
      </aside>
      <main id="workspace-main" className="workspace-main" tabIndex="-1">{children}
        <footer className="workspace-footer">The Akola Urban Co-operative Bank Ltd. <span>Internal reporting workspace</span></footer>
      </main>
    </div>
  </div></WorkflowDialog>;
}
