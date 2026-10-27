import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, tokens } from '../../api/client';
import Alert from '../../components/Alert';
import Logo from '../../components/Logo';

// The backend answers 403 with a specific message while the owner is still
// active or inside the grace period; show those as status notices, not errors.
function classify(err) {
  if (err.status === 403 && /grace period/i.test(err.message)) {
    return {
      type: 'warning',
      title: 'Access is not released yet',
      body: `${err.message} If the owner checks in before the grace period ends, the release is cancelled. Keep your code; you can use it once access is granted.`,
    };
  }
  if (err.status === 403) {
    return {
      type: 'info',
      title: 'The vault owner is active',
      body: 'The owner has been checking in, so there is nothing to release. Access codes only work after a vault has been released.',
    };
  }
  return { type: 'error', title: null, body: err.message };
}

export default function NomineeAccess() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setResult(null);
    setSubmitting(true);
    try {
      const res = await api.nomineeVerify(email, code);
      tokens.setNominee(res.token);
      sessionStorage.setItem('vk_nominee_profile', JSON.stringify(res.nominee));
      navigate('/nominee/vault');
    } catch (err) {
      setResult(classify(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page nominee-theme">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <Link to="/"><Logo /></Link>
        <h1>Nominee access</h1>
        <p className="muted">
          You were named as a nominee by a VaultKeep user. When their account becomes inactive you
          receive a notification with a one-time access code (for example <code>VK-1A2B3C4D</code>).
          Once the grace period ends, enter it here to view the documents released to you.
        </p>

        {result && (
          <div className={`alert alert-${result.type}`} role="status">
            <span>
              {result.title && <strong>{result.title}. </strong>}
              {result.body}
            </span>
          </div>
        )}

        <label>
          Your email address
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          One-time access code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="VK-XXXXXXXX"
            className="code-input"
            autoComplete="one-time-code"
            required
          />
        </label>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Verifying…' : 'Unlock documents'}
        </button>

        <Alert type="info">
          The code works only once. Every document you open is recorded in the owner&apos;s audit log.
        </Alert>

        <p className="auth-switch">
          Are you a vault owner? <Link to="/login">Log in here</Link>
        </p>
      </form>
    </div>
  );
}
