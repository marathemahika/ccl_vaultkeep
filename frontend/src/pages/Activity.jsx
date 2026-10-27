import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Alert from '../components/Alert';
import { formatDate } from '../utils';

// Human-readable labels for the audit actions the backend writes.
const ACTION_LABELS = {
  'auth.register': 'Account created',
  'auth.login.success': 'Logged in',
  'auth.login.failed': 'Failed login attempt',
  'auth.login.locked': 'Login blocked (account locked)',
  'auth.password_changed': 'Password changed',
  'checkin.manual': 'Manual check-in',
  'checkin.settings_updated': 'Check-in rules changed',
  'document.upload': 'Document uploaded',
  'document.download': 'Document downloaded',
  'document.delete': 'Document deleted',
  'nominee.create': 'Nominee added',
  'nominee.update': 'Nominee updated',
  'nominee.delete': 'Nominee removed',
  'nominee.releases_updated': 'Released documents changed',
  'nominee.verify_code.failed': 'Nominee entered a wrong access code',
  'nominee.access_claimed': 'Nominee unlocked access',
  'nominee.document.download': 'Nominee downloaded a document',
  'lifecycle.flag_inactive': 'Account flagged inactive — nominees notified',
  'lifecycle.release_vault': 'Grace period ended — vault released',
};

const FILTERS = [
  { value: '', label: 'All events' },
  { value: 'nominee.document.download', label: 'Nominee downloads' },
  { value: 'nominee.access_claimed', label: 'Nominee access claims' },
  { value: 'document.download', label: 'My downloads' },
  { value: 'document.upload', label: 'Uploads' },
  { value: 'auth.login.failed', label: 'Failed logins' },
  { value: 'lifecycle.flag_inactive', label: 'Inactivity flags' },
  { value: 'lifecycle.release_vault', label: 'Vault releases' },
];

function describe(log) {
  const d = log.details || {};
  return d.title || d.filename || d.fullName || d.email || d.nomineeEmail || d.reason || '';
}

export default function Activity() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    api
      .auditLog(filter)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [filter]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Activity log</h1>
          <p className="muted">
            An append-only record of everything that happened in your vault, including every
            document a nominee opens.
          </p>
        </div>
      </div>

      <Alert type="error">{error}</Alert>

      {data && (
        <div className="stats stats-5">
          <div className="stat"><span className="stat-value">{data.stats.total_events}</span><span className="stat-label">Total events</span></div>
          <div className="stat"><span className="stat-value">{data.stats.document_events}</span><span className="stat-label">Document</span></div>
          <div className="stat"><span className="stat-value">{data.stats.auth_events}</span><span className="stat-label">Sign-in</span></div>
          <div className="stat"><span className="stat-value">{data.stats.nominee_events}</span><span className="stat-label">Nominee</span></div>
          <div className="stat stat-fail"><span className="stat-value">{data.stats.failed_events}</span><span className="stat-label">Failed</span></div>
        </div>
      )}

      <section className="card">
        <div className="card-title-row">
          <h2>Events</h2>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter events">
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        {data === null ? (
          !error && <p className="muted">Loading…</p>
        ) : data.logs.length === 0 ? (
          <p className="empty">No events found.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Event</th>
                  <th>By</th>
                  <th>Details</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((log) => (
                  <tr key={log.id} className={log.success ? '' : 'row-fail'}>
                    <td className="nowrap">{formatDate(log.occurred_at)}</td>
                    <td>
                      <span className={`dot ${log.success ? 'dot-ok' : 'dot-fail'}`} />
                      {ACTION_LABELS[log.action] || log.action}
                      <div className="muted small"><code>{log.action}</code></div>
                    </td>
                    <td><span className={`chip chip-actor-${log.actor_type}`}>{log.actor_type}</span></td>
                    <td className="muted">{describe(log)}</td>
                    <td className="muted small">{log.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
