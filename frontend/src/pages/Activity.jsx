import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Alert from '../components/Alert';
import { EmptyState, Icon, PageHeading } from '../components/UI';
import { actionIcon, actionLabel, describeLog, formatDate } from '../utils';

const FILTERS = [
  { value: '', label: 'All events' },
  { value: 'nominee.document.download', label: 'Nominee downloads' },
  { value: 'nominee.access_claimed', label: 'Nominee access claims' },
  { value: 'document.download', label: 'My downloads' },
  { value: 'document.upload', label: 'Uploads' },
  { value: 'auth.login.failed', label: 'Failed sign-ins' },
  { value: 'lifecycle.flag_inactive', label: 'Missed check-ins' },
  { value: 'lifecycle.release_vault', label: 'Vault releases' },
];

const STATS = [
  ['total_events', 'Total events', 'activity', 'blue'],
  ['document_events', 'Document', 'file', 'violet'],
  ['auth_events', 'Sign-in', 'logout', 'green'],
  ['nominee_events', 'Nominee', 'users', 'peach'],
  ['failed_events', 'Failed', 'alert', 'red'],
];

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
      <PageHeading
        eyebrow="Nothing happens quietly"
        title="Activity log"
        description="An append-only record of everything in your vault, including every document a nominee opens."
      />

      <Alert type="error">{error}</Alert>

      {data && (
        <div className="stat-grid stat-grid-5">
          {STATS.map(([key, label, icon, tone]) => (
            <div key={key} className="surface-card stat-card compact">
              <span className={`stat-icon stat-${tone}`}><Icon name={icon} /></span>
              <span className="stat-label">{label}</span>
              <strong>{data.stats[key]}</strong>
            </div>
          ))}
        </div>
      )}

      <section className="surface-card table-card">
        <div className="table-toolbar">
          <div>
            <span className="eyebrow">Audit trail</span>
            <h3 className="card-title">Events</h3>
          </div>
          <div className="table-filters">
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter events">
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>

        {data === null ? (
          !error && <p className="table-empty">Loading…</p>
        ) : data.logs.length === 0 ? (
          <EmptyState icon="activity" title="No events found" description="Try a different filter." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>By</th>
                  <th>Details</th>
                  <th>When</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((log) => (
                  <tr key={log.id} className={log.success ? '' : 'row-fail'}>
                    <td>
                      <div className="doc-cell">
                        <span className={`timeline-icon ${log.success ? '' : 'fail'} actor-${log.actor_type}`}>
                          <Icon name={actionIcon(log.action)} size={15} />
                        </span>
                        <span className="doc-copy">
                          <strong>{actionLabel(log.action)}</strong>
                          <small><code>{log.action}</code></small>
                        </span>
                      </div>
                    </td>
                    <td><span className={`chip actor-chip-${log.actor_type}`}>{log.actor_type}</span></td>
                    <td className="faint">{describeLog(log) || '—'}</td>
                    <td className="nowrap">{formatDate(log.occurred_at)}</td>
                    <td className="faint small">{log.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-footnote">
          <Icon name="lock" size={13} /> Audit rows cannot be edited or deleted — the database blocks updates to this table.
        </div>
      </section>
    </div>
  );
}
