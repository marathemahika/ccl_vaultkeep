import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/Alert';
import StatusBadge from '../components/StatusBadge';
import { formatDate } from '../utils';

function CheckinSettings() {
  const { user, refreshUser } = useAuth();
  const [intervalDays, setIntervalDays] = useState(user.checkinIntervalDays);
  const [grace, setGrace] = useState(user.gracePeriodDays);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await api.updateCheckinSettings({
        checkin_interval_days: Number(intervalDays),
        grace_period_days: Number(grace),
      });
      setNotice(res.message);
      await refreshUser();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const changed =
    Number(intervalDays) !== user.checkinIntervalDays || Number(grace) !== user.gracePeriodDays;

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>Check-in &amp; release rules</h2>
      <Alert type="success">{notice}</Alert>
      <Alert type="error">{error}</Alert>
      <div className="form-row">
        <label>
          Check-in interval (days)
          <input
            type="number"
            min={1}
            max={365}
            value={intervalDays}
            onChange={(e) => setIntervalDays(e.target.value)}
            required
          />
          <span className="hint">How long you can go without checking in (1–365).</span>
        </label>
        <label>
          Grace period (days)
          <input
            type="number"
            min={0}
            max={90}
            value={grace}
            onChange={(e) => setGrace(e.target.value)}
            required
          />
          <span className="hint">Delay between notifying nominees and releasing access (0–90).</span>
        </label>
      </div>
      <div className="timeline">
        <div><span className="dot dot-ok" /> Last check-in</div>
        <div className="timeline-gap">+ {intervalDays || '?'} days</div>
        <div><span className="dot dot-warn" /> Nominees notified</div>
        <div className="timeline-gap">+ {grace || 0} days</div>
        <div><span className="dot dot-fail" /> Documents released</div>
      </div>
      <button type="submit" className="btn btn-primary" disabled={saving || !changed}>
        {saving ? 'Saving…' : 'Save rules'}
      </button>
    </form>
  );
}

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
    <form className="card" onSubmit={handleSubmit}>
      <h2>Change password</h2>
      <Alert type="success">{notice}</Alert>
      <Alert type="error">{error}</Alert>
      <label>
        Current password
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      <div className="form-row">
        <label>
          New password
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
      </div>
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? 'Updating…' : 'Update password'}
      </button>
    </form>
  );
}

function CheckinHistory() {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .checkinHistory()
      .then((res) => setHistory(res.history))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <section className="card">
      <h2>Check-in history</h2>
      <Alert type="error">{error}</Alert>
      {history === null ? (
        !error && <p className="muted">Loading…</p>
      ) : history.length === 0 ? (
        <p className="muted">No check-ins recorded yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Method</th>
                <th>IP address</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{formatDate(h.checked_in_at)}</td>
                  <td><span className="chip">{h.method}</span></td>
                  <td className="muted">{h.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function Settings() {
  const { user } = useAuth();

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Account settings</h1>
          <p className="muted">Manage your inactivity rules, password and check-ins.</p>
        </div>
      </div>

      <section className="card">
        <h2>Account</h2>
        <dl className="details">
          <dt>Name</dt>
          <dd>{user.fullName}</dd>
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Status</dt>
          <dd><StatusBadge status={user.status} /></dd>
          <dt>Member since</dt>
          <dd>{formatDate(user.createdAt, false)}</dd>
        </dl>
      </section>

      <div className="grid grid-2">
        <CheckinSettings />
        <ChangePassword />
      </div>

      <CheckinHistory />
    </div>
  );
}
