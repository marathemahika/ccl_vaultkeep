import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, tokens } from '../../api/client';
import AuthShell from '../../components/AuthShell';
import { Icon } from '../../components/UI';

// The backend answers 403 with a specific message while the owner is still
// active or inside the grace period; show those as status notices, not errors.
function classify(err) {
  if (err.status === 403 && /grace period/i.test(err.message)) {
    return {
      type: 'warning',
      title: 'Access is not released yet',
      body: `${err.message} If the owner checks in before the grace period ends, the release is cancelled. Keep your code — it will work once access is granted.`,
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
    <AuthShell
      variant="auth-nominee"
      promoEyebrow="Nominee portal"
      promoTitle="A shared space,"
      promoAccent="for when it matters."
      promoText="Someone who trusts you chose to leave important documents in your care. Use the one-time code from your notification to open them."
    >
      <span className="eyebrow">Nominee access</span>
      <h2>Open released documents</h2>
      <p className="auth-intro">
        Your code (for example <code>VK-1A2B3C4D</code>) arrives when the owner misses a check-in.
        It unlocks documents once the grace period has ended.
      </p>

      {result && (
        <div className={`alert alert-${result.type}`} role="status">
          <span className="alert-icon">
            <Icon name={result.type === 'warning' ? 'clock' : result.type === 'info' ? 'shield' : 'alert'} size={16} />
          </span>
          <span className="alert-body">
            {result.title && <strong>{result.title}. </strong>}
            {result.body}
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-label">Your email address</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" required />
        </label>
        <label className="field">
          <span className="field-label">One-time access code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="VK-XXXXXXXX"
            className="code-input"
            autoComplete="one-time-code"
            required
          />
          <small className="field-hint">The code works once. Your session then lasts up to 2 hours.</small>
        </label>

        <button type="submit" className="button button-primary auth-submit" disabled={submitting}>
          {submitting ? 'Verifying…' : <>Unlock documents <Icon name="arrow" size={16} /></>}
        </button>
      </form>

      <p className="auth-switch">
        Own a vault?<Link to="/login">Sign in here</Link>
      </p>
      <div className="auth-security"><Icon name="activity" size={14} /> Every document you open is recorded in an audit log</div>
    </AuthShell>
  );
}
