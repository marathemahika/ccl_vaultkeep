import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/Alert';
import StatusBadge from '../components/StatusBadge';
import { formatDate, plural } from '../utils';

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const [status, setStatus] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [nominees, setNominees] = useState([]);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, d, n, a] = await Promise.all([
        api.checkinStatus(),
        api.listDocuments(),
        api.listNominees(),
        api.auditLog(),
      ]);
      setStatus(s);
      setDocuments(d.documents);
      setNominees(n.nominees);
      setRecent(a.logs.slice(0, 6));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  if (!status) {
    return error ? <Alert type="error">{error}</Alert> : <div className="page-loading">Loading…</div>;
  }

  const unassignedDocs = documents.filter((d) => d.assigned_nominees.length === 0).length;
  const elapsedPct = Math.min(
    100,
    Math.max(0, 100 - (status.daysRemaining / status.checkinIntervalDays) * 100)
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Welcome back, {user.fullName.split(' ')[0]}</h1>
          <p className="muted">Here&apos;s the state of your vault.</p>
        </div>
      </div>

      <Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>
      <Alert type="error" onClose={() => setError('')}>{error}</Alert>

      {status.status === 'inactive' && (
        <div className="banner banner-warning">
          <h2>Your account has been flagged inactive</h2>
          <p>
            You missed your check-in window and your nominees have been notified. Unless you check
            in, your released documents will become available to them on{' '}
            <strong>{formatDate(status.accessReleaseAt)}</strong>
            {status.gracePeriodHoursRemaining != null &&
              ` (about ${plural(status.gracePeriodHoursRemaining, 'hour')} from now)`}
            .
          </p>
          <button className="btn btn-primary" onClick={handleCheckIn} disabled={checkingIn}>
            {checkingIn ? 'Checking in…' : "I'm here — cancel the release"}
          </button>
        </div>
      )}

      {status.status === 'released' && (
        <div className="banner banner-danger">
          <h2>Your vault has been released</h2>
          <p>
            The grace period ended on <strong>{formatDate(status.accessReleasedAt)}</strong>.
            Your nominees can now access the documents you assigned to them. Check-ins are no
            longer accepted for this account.
          </p>
        </div>
      )}

      <div className="grid grid-2">
        <section className="card checkin-card">
          <div className="card-title-row">
            <h2>Check-in</h2>
            <StatusBadge status={status.status} />
          </div>

          {status.status === 'active' ? (
            <>
              <div className="countdown">
                <span className="countdown-number">{status.daysRemaining}</span>
                <span className="countdown-label">
                  {status.daysRemaining === 1 ? 'day' : 'days'} until your next check-in is due
                </span>
              </div>
              <div className="progress" aria-hidden="true">
                <div
                  className={`progress-bar ${elapsedPct > 80 ? 'progress-bar-warn' : ''}`}
                  style={{ width: `${elapsedPct}%` }}
                />
              </div>
            </>
          ) : (
            <p className="muted">Automatic monitoring is paused while the account is {status.status}.</p>
          )}

          <dl className="details">
            <dt>Last check-in</dt>
            <dd>{formatDate(status.lastCheckinAt)}</dd>
            {status.status === 'active' && (
              <>
                <dt>Next due</dt>
                <dd>{formatDate(status.nextCheckinDueAt)}</dd>
              </>
            )}
            <dt>Interval / grace</dt>
            <dd>
              {plural(status.checkinIntervalDays, 'day')} / {plural(status.gracePeriodDays, 'day')}{' '}
              <Link to="/settings">Change</Link>
            </dd>
          </dl>

          {status.status === 'active' && (
            <button
              className="btn btn-primary btn-block"
              onClick={handleCheckIn}
              disabled={checkingIn}
            >
              {checkingIn ? 'Checking in…' : 'Check in now'}
            </button>
          )}
        </section>

        <section className="card">
          <h2>Vault summary</h2>
          <div className="stats">
            <Link to="/documents" className="stat">
              <span className="stat-value">{documents.length}</span>
              <span className="stat-label">Encrypted documents</span>
            </Link>
            <Link to="/nominees" className="stat">
              <span className="stat-value">{nominees.length}</span>
              <span className="stat-label">Nominees</span>
            </Link>
          </div>

          <ul className="checklist">
            <li className={documents.length ? 'done' : ''}>
              {documents.length ? 'Documents uploaded' : <Link to="/documents">Upload your first document</Link>}
            </li>
            <li className={nominees.length ? 'done' : ''}>
              {nominees.length ? 'Nominees added' : <Link to="/nominees">Add a nominee</Link>}
            </li>
            <li className={documents.length && !unassignedDocs ? 'done' : ''}>
              {documents.length && !unassignedDocs ? (
                'Every document is assigned to a nominee'
              ) : (
                <Link to="/nominees">
                  {unassignedDocs
                    ? `${plural(unassignedDocs, 'document')} not released to anyone`
                    : 'Assign documents to nominees'}
                </Link>
              )}
            </li>
          </ul>
        </section>
      </div>

      <section className="card">
        <div className="card-title-row">
          <h2>Recent activity</h2>
          <Link to="/activity">View all</Link>
        </div>
        {recent.length === 0 ? (
          <p className="muted">No activity yet.</p>
        ) : (
          <ul className="activity-list">
            {recent.map((log) => (
              <li key={log.id}>
                <span className={`dot ${log.success ? 'dot-ok' : 'dot-fail'}`} />
                <code>{log.action}</code>
                <span className="muted">{formatDate(log.occurred_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
