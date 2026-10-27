import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/Alert';
import AuthShell from '../components/AuthShell';
import { Icon } from '../components/UI';
import { PasswordInput } from './Login';

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    confirm: '',
    checkin_interval_days: 30,
    grace_period_days: 7,
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await register({
        full_name: form.full_name,
        email: form.email,
        password: form.password,
        checkin_interval_days: Number(form.checkin_interval_days),
        grace_period_days: Number(form.grace_period_days),
      });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      promoEyebrow="Start in minutes"
      promoTitle="Prepare today,"
      promoAccent="for peace of mind tomorrow."
      promoText="Store important documents, choose who receives them, and decide when."
    >
      <span className="eyebrow">Create account</span>
      <h2>Set up your vault</h2>
      <p className="auth-intro">You can change your check-in rules at any time.</p>

      <Alert type="error">{error}</Alert>

      <form onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-label">Full name</span>
          <input value={form.full_name} onChange={update('full_name')} autoComplete="name" required />
        </label>
        <label className="field">
          <span className="field-label">Email address</span>
          <input type="email" value={form.email} onChange={update('email')} autoComplete="email" placeholder="you@example.com" required />
        </label>
        <div className="form-row">
          <label className="field">
            <span className="field-label">Password</span>
            <PasswordInput value={form.password} onChange={update('password')} autoComplete="new-password" minLength={8} />
          </label>
          <label className="field">
            <span className="field-label">Confirm password</span>
            <PasswordInput value={form.confirm} onChange={update('confirm')} autoComplete="new-password" />
          </label>
        </div>
        <div className="form-row">
          <label className="field">
            <span className="field-label">Check in every (days)</span>
            <input type="number" min={1} max={365} value={form.checkin_interval_days} onChange={update('checkin_interval_days')} required />
          </label>
          <label className="field">
            <span className="field-label">Grace period (days)</span>
            <input type="number" min={0} max={90} value={form.grace_period_days} onChange={update('grace_period_days')} required />
          </label>
        </div>
        <p className="field-hint register-hint">
          Miss a check-in for {form.checkin_interval_days || '?'} days and your nominees are
          notified. {form.grace_period_days || 0} days later they receive the documents you
          released to them.
        </p>

        <button type="submit" className="button button-primary auth-submit" disabled={submitting}>
          {submitting ? 'Creating your vault…' : <>Create account <Icon name="arrow" size={16} /></>}
        </button>
      </form>

      <p className="auth-switch">
        Already have an account?<Link to="/login">Sign in</Link>
      </p>
    </AuthShell>
  );
}
