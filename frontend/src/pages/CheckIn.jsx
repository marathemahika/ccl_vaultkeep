import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/Alert';
import { Icon, PageHeading, StatusBadge } from '../components/UI';
import { formatDate, plural } from '../utils';

const INTERVAL_PRESETS = [
  [7, 'Every week'],
  [14, 'Every 2 weeks'],
  [30, 'Every month'],
  [90, 'Every 3 months'],
  [180, 'Every 6 months'],
  [365, 'Once a year'],
];
const GRACE_PRESETS = [
  [0, 'No grace period'],
  [3, '3 days'],
  [7, '1 week'],
  [14, '2 weeks'],
  [30, '30 days'],
];

// A preset dropdown that falls back to a number input for any other value.
function PresetSelect({ value, onChange, presets, min, max, unit }) {
  const isPreset = presets.some(([v]) => v === Number(value));
  const [customChosen, setCustom] = useState(false);
  const custom = customChosen || !isPreset;

  return (
    <div className="preset-select">
      <select
        value={custom ? 'custom' : Number(value)}
        onChange={(e) => {
          if (e.target.value === 'custom') {
            setCustom(true);
          } else {
            setCustom(false);
            onChange(Number(e.target.value));
          }
        }}
      >
        {presets.map(([v, label]) => (
          <option key={v} value={v}>{label}</option>
        ))}
        <option value="custom">Custom…</option>
      </select>
      {custom && (
        <span className="custom-days">
          <input type="number" min={min} max={max} value={value} onChange={(e) => onChange(e.target.value)} required />
          <span>{unit}</span>
        </span>
      )}
    </div>
  );
}

export default function CheckIn() {
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [intervalDays, setIntervalDays] = useState(30);
  const [grace, setGrace] = useState(7);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([api.checkinStatus(), api.checkinHistory()]);
      setStatus(s);
      setHistory(h.history);
      return s;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, []);

  useEffect(() => {
    load().then((s) => {
      if (!s) return;
      setIntervalDays(s.checkinIntervalDays);
      setGrace(s.gracePeriodDays);
    });
  }, [load]);

  if (!status) {
    return error ? <Alert type="error">{error}</Alert> : <div className="page-loading">Loading…</div>;
  }

  const changed = Number(intervalDays) !== status.checkinIntervalDays || Number(grace) !== status.gracePeriodDays;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await api.updateCheckinSettings({
        checkin_interval_days: Number(intervalDays),
        grace_period_days: Number(grace),
      });
      setNotice(res.message);
      await Promise.all([load(), refreshUser()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCheckIn = async () => {
    setCheckingIn(true);
    setError('');
    try {
      const res = await api.checkIn();
      setNotice(res.message);
      await Promise.all([load(), refreshUser()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setCheckingIn(false);
    }
  };

  // Preview of the timeline using the values currently in the form.
  const last = new Date(status.lastCheckinAt);
  const notifyAt = new Date(last.getTime() + Number(intervalDays || 0) * 86400000);
  const releaseAt = new Date(notifyAt.getTime() + Number(grace || 0) * 86400000);

  return (
    <div className="page">
      <PageHeading
        eyebrow="A plan that feels right"
        title="Check-in settings"
        description="Set a rhythm that works for you. Missing a check-in is not the same as releasing documents."
        action={
          <button className="button button-primary button-large" onClick={handleSave} disabled={saving || !changed}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        }
      />

      <Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>
      <Alert type="error" onClose={() => setError('')}>{error}</Alert>

      <div className="settings-layout">
        <div className="settings-main">
          <section className="surface-card setting-card">
            <div className="setting-head">
              <span className="stat-icon stat-violet"><Icon name="clock" /></span>
              <div>
                <h3>Your check-in rhythm</h3>
                <p>A little hello now and then lets VaultKeep know you&apos;re doing okay.</p>
              </div>
            </div>
            <div className="setting-row">
              <div>
                <strong>How often should we check in?</strong>
                <small>Between 1 and 365 days.</small>
              </div>
              <PresetSelect value={intervalDays} onChange={setIntervalDays} presets={INTERVAL_PRESETS} min={1} max={365} unit="days" />
            </div>
            <div className="setting-row">
              <div className="row-with-icon">
                <span className="check-dot"><Icon name="check" size={14} /></span>
                <span>
                  <strong>Last check-in</strong>
                  <small>{formatDate(status.lastCheckinAt)}</small>
                </span>
              </div>
              {status.status !== 'released' && (
                <button className="button button-outline button-small" onClick={handleCheckIn} disabled={checkingIn}>
                  {checkingIn ? 'Checking in…' : 'Check in now'}
                </button>
              )}
            </div>
          </section>

          <section className="surface-card setting-card">
            <div className="setting-head">
              <span className="stat-icon stat-peach"><Icon name="bell" /></span>
              <div>
                <h3>Grace period</h3>
                <p>Extra time to check in after your nominees are notified, before anything is released.</p>
              </div>
            </div>
            <div className="setting-row">
              <div>
                <strong>How long should we wait?</strong>
                <small>Between 0 and 90 days.</small>
              </div>
              <PresetSelect value={grace} onChange={setGrace} presets={GRACE_PRESETS} min={0} max={90} unit="days" />
            </div>
          </section>

          <section className="surface-card table-card">
            <div className="table-toolbar">
              <div>
                <span className="eyebrow">History</span>
                <h3 className="card-title">Recent check-ins</h3>
              </div>
            </div>
            {history.length === 0 ? (
              <p className="table-empty">No check-ins recorded yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
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
                        <td><span className="chip">{h.method === 'login' ? 'Sign-in' : 'Manual'}</span></td>
                        <td className="faint">{h.ip_address || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="surface-card timing-card">
          <span className="stat-icon stat-blue"><Icon name="lock" /></span>
          <h3>Your timing, clearly</h3>
          <p>Missing a check-in is not the same as releasing documents. The grace period gives you an extra window.</p>
          <div className="timing-status">Current status <StatusBadge status={status.status} /></div>
          <ol className="timing-steps">
            <li className="green">
              <strong>Last check-in</strong>
              <small>{formatDate(last, false)}</small>
            </li>
            <li className="orange">
              <strong>Nominees notified</strong>
              <small>{plural(intervalDays || 0, 'day')} later · {formatDate(notifyAt, false)}</small>
            </li>
            <li className="violet">
              <strong>Documents released</strong>
              <small>{plural(grace || 0, 'more day')} · {formatDate(releaseAt, false)}</small>
            </li>
          </ol>
          {changed && <p className="timing-note">Preview of unsaved changes</p>}
        </aside>
      </div>
    </div>
  );
}
