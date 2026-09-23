import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import recoveryApi from '../services/recoveryApi';
import { requirements, passwordError, recoveryToken } from '../utils/credentials';
import './Login.css';
import './CredentialRecovery.css';

export default function CredentialRecovery({ mode }) {
  const forgot = mode === 'forgot';
  const [token] = useState(() => recoveryToken(window.location.hash));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    // Keep the token only in this mounted component, never persistent storage or a server URL.
    window.history.replaceState(window.history.state, '', window.location.pathname);
    const previous = document.querySelector('meta[name="referrer"]');
    const meta = previous || document.createElement('meta');
    const original = meta.content;
    meta.name = 'referrer'; meta.content = 'no-referrer';
    if (!previous) document.head.appendChild(meta);
    return () => { if (previous) meta.content = original; else meta.remove(); };
  }, []);
  const title = forgot ? 'Forgot password' : mode === 'setup' ? 'Set up your password' : 'Reset your password';
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (!forgot) {
      const validation = passwordError(password, confirmPassword);
      if (validation) { setError(validation); return; }
    }
    setBusy(true);
    try {
      await recoveryApi.post(`/auth/${mode === 'forgot' ? 'forgot' : mode}-password`, forgot ? { email } : { token, password, confirmPassword });
      setPassword(''); setConfirmation(''); setComplete(true);
    } catch (failure) {
      if (failure.response?.status === 429) setError('Too many requests. Please try again later.');
      else if (forgot) setError('Unable to send this request. Please try again later.');
      else if (failure.response?.status === 400) {
        const predictable = failure.response?.data?.message === 'Choose a less predictable password or passphrase';
        setError(predictable ? 'Choose a less predictable password or passphrase.' : 'This link is invalid or expired. Request a new link.');
      } else setError('Unable to complete this request. Please try again later.');
    } finally { setBusy(false); }
  }
  return <div className="login-container credential-page"><main className="login-section"><div className="login-card">
    <p className="credential-bank">The Akola Urban Co-operative Bank Ltd.</p>
    <h1>{title}</h1>
    {complete ? <div role="status">
      <p>{forgot ? 'If this account is eligible, password reset instructions will be emailed.' : 'Password saved. Sign in with your new password.'}</p>
      <Link to="/">Return to sign in</Link>
    </div> : !forgot && !token ? <div role="alert">
      <p>This link is invalid or expired.</p>
      {mode === 'setup' ? <p>Contact your authorized account operator for a new setup email.</p> : <Link to="/forgot-password">Request a new reset link</Link>}
      <p><Link to="/">Return to sign in</Link></p>
    </div> : <form onSubmit={submit} aria-busy={busy}>
      <p>{forgot ? 'Enter your configured account email. Setup invitations are reissued by your authorized account operator.' : requirements}</p>
      {error && <p className="login-error" role="alert">{error}</p>}
      {forgot ? <div className="input-group"><label htmlFor="recovery-email">Account email</label>
        <input id="recovery-email" type="email" autoComplete="email" required maxLength={100} value={email} onChange={e => setEmail(e.target.value)} />
      </div> : <>
        <div className="input-group"><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} /></div>
        <div className="input-group"><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" type="password" autoComplete="new-password" required value={confirmPassword} onChange={e => setConfirmation(e.target.value)} /></div>
      </>}
      <button className="signin-btn" disabled={busy} type="submit">{busy ? 'Please wait…' : forgot ? 'Request reset link' : 'Save password'}</button>
      <p><Link to="/">Return to sign in</Link></p>
    </form>}
  </div></main></div>;
}
