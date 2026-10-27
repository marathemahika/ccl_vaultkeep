import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/Alert';
import { Icon, PageHeading, StatusBadge, initials } from '../components/UI';
import { PasswordInput } from './Login';
import { formatDate } from '../utils';

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (next.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (next !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.changePassword(current, next);
      setNotice(res.message);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="surface-card setting-card" onSubmit={handleSubmit}>
      <div className="setting-head">
        <span className="stat-icon stat-peach"><Icon name="key" /></span>
        <div>
          <h3>Change password</h3>
          <p>Use at least 8 characters. Five wrong attempts lock sign-in for 15 minutes.</p>
        </div>
      </div>
      <Alert type="success">{notice}</Alert>
      <Alert type="error">{error}</Alert>
      <label className="field">
        <span className="field-label">Current password</span>
        <PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </label>
      <div className="form-row">
        <label className="field">
          <span className="field-label">New password</span>
          <PasswordInput value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} />
        </label>
        <label className="field">
          <span className="field-label">Confirm new password</span>
          <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </label>
      </div>
      <div className="form-actions">
        <button type="submit" className="button button-primary" disabled={saving}>
          {saving ? 'Updating…' : 'Update password'}
        </button>
      </div>
    </form>
  );
}

export default function Settings() {
  const { user } = useAuth();

  return (
    <div className="page">
      <PageHeading
        eyebrow="Your account"
        title="Account settings"
        description="Your profile and sign-in security."
      />

      <div className="settings-layout">
        <div className="settings-main">
          <section className="surface-card setting-card">
            <div className="profile-row">
              <span className="profile-avatar large">{initials(user.fullName)}</span>
              <div>
                <h3>{user.fullName}</h3>
                <p className="faint">{user.email}</p>
              </div>
              <StatusBadge status={user.status} />
            </div>
            <dl className="details">
              <dt>Member since</dt>
              <dd>{formatDate(user.createdAt, false)}</dd>
              <dt>Check-in rhythm</dt>
              <dd>Every {user.checkinIntervalDays} days, then a {user.gracePeriodDays}-day grace period</dd>
              <dt>Last check-in</dt>
              <dd>{formatDate(user.lastCheckinAt)}</dd>
            </dl>
          </section>

          <ChangePassword />
        </div>

        <aside className="surface-card timing-card">
          <span className="stat-icon stat-green"><Icon name="shield" /></span>
          <h3>How your vault is protected</h3>
          <ul className="check-list">
            <li><Icon name="check" size={15} /> Passwords stored as bcrypt hashes</li>
            <li><Icon name="check" size={15} /> Every file sealed with its own KMS data key</li>
            <li><Icon name="check" size={15} /> Nominee codes are single-use</li>
            <li><Icon name="check" size={15} /> Append-only audit log of every access</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
