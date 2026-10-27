import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/Alert';
import Logo from '../components/Logo';

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
    <div className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <Link to="/"><Logo /></Link>
        <h1>Create your vault</h1>

        <Alert type="error">{error}</Alert>

        <label>
          Full name
          <input value={form.full_name} onChange={update('full_name')} autoComplete="name" required />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={update('email')} autoComplete="email" required />
        </label>
        <div className="form-row">
          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={update('password')}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              value={form.confirm}
              onChange={update('confirm')}
              autoComplete="new-password"
              required
            />
          </label>
        </div>

        <fieldset>
          <legend>Inactivity rules</legend>
          <div className="form-row">
            <label>
              Check-in interval (days)
              <input
                type="number"
                min={1}
                max={365}
                value={form.checkin_interval_days}
                onChange={update('checkin_interval_days')}
                required
              />
            </label>
            <label>
              Grace period (days)
              <input
                type="number"
                min={0}
                max={90}
                value={form.grace_period_days}
                onChange={update('grace_period_days')}
                required
              />
            </label>
          </div>
          <p className="hint">
            If you don&apos;t check in for {form.checkin_interval_days || '?'} days, your nominees
            are notified. If you still haven&apos;t checked in {form.grace_period_days || 0} days
            later, they receive access to the documents you released to them. You can change this
            later in Settings.
          </p>
        </fieldset>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
}
