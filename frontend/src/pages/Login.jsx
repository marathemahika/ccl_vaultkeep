import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/Alert';
import AuthShell from '../components/AuthShell';
import { Icon } from '../components/UI';

export function PasswordInput({ value, onChange, autoComplete, placeholder, minLength }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="input-with-action">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        placeholder={placeholder}
        minLength={minLength}
        required
      />
      <button
        type="button"
        className="icon-button"
        aria-label={visible ? 'Hide password' : 'Show password'}
        onClick={() => setVisible(!visible)}
      >
        <Icon name="eye" size={16} />
      </button>
    </span>
  );
}

export default function Login() {
  const { user, login, sessionMessage } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      promoEyebrow="Your legacy, protected"
      promoTitle="What matters most,"
      promoAccent="kept safe."
      promoText="A private place for the important things your loved ones may one day need."
    >
      <span className="eyebrow">Welcome back</span>
      <h2>Sign in to your vault</h2>
      <p className="auth-intro">Signing in also counts as a check-in.</p>

      <Alert type="warning">{!error && sessionMessage}</Alert>
      <Alert type="error">{error}</Alert>

      <form onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-label">Email address</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="At least 8 characters"
          />
        </label>

        <button type="submit" className="button button-primary auth-submit" disabled={submitting}>
          {submitting ? 'Signing in…' : <>Sign in <Icon name="arrow" size={16} /></>}
        </button>
      </form>

      <p className="auth-switch">
        New to VaultKeep?<Link to="/register">Create an account</Link>
      </p>
      <p className="auth-switch">
        Received an access code?<Link to="/nominee">Nominee portal</Link>
      </p>
      <div className="auth-security"><Icon name="shield" size={14} /> Protected with envelope encryption</div>
    </AuthShell>
  );
}
