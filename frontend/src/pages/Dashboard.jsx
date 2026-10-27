import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/Alert';
import { Icon, SectionHeading, StatusBadge } from '../components/UI';
import {
  actionIcon,
  actionLabel,
  categoryLabel,
  describeLog,
  formatBytes,
  formatDate,
  plural,
  relativeDay,
} from '../utils';

function StatusHero({ status, onCheckIn, checkingIn }) {
  if (status.status === 'released') {
    return (
      <div className="status-hero status-hero-released">
        <span className="status-hero-icon"><Icon name="lock" /></span>
        <div>
          <strong>Your vault has been released</strong>
          <span>
            The grace period ended {formatDate(status.accessReleasedAt)}. Your nominees can now
            open the documents you assigned to them. Check-ins are no longer accepted.
          </span>
        </div>
      </div>
    );
  }

  if (status.status === 'inactive') {
    return (
      <div className="status-hero status-hero-inactive">
        <span className="status-hero-icon"><Icon name="bell" /></span>
        <div>
          <strong>You missed a check-in — your nominees have been notified</strong>
          <span>
            Documents will be released {formatDate(status.accessReleaseAt)}
            {status.gracePeriodHoursRemaining != null &&
              ` (about ${plural(status.gracePeriodHoursRemaining, 'hour')} left)`}
            . Check in now to cancel the release.
          </span>
        </div>
        <button className="button button-white" onClick={onCheckIn} disabled={checkingIn}>
          {checkingIn ? 'Checking in…' : <>I&apos;m here <Icon name="arrow" size={15} /></>}
        </button>
      </div>
    );
  }

  return (
    <div className="status-hero">
      <span className="status-hero-icon"><Icon name="check" /></span>
      <div>
        <strong>Your vault is active</strong>
        <span>
          Last checked in {formatDate(status.lastCheckinAt, false)} · Next check-in due{' '}
          {formatDate(status.nextCheckinDueAt, false)} ({plural(status.daysRemaining, 'day')})
        </span>
      </div>
      <button className="button button-white" onClick={onCheckIn} disabled={checkingIn}>
        {checkingIn ? 'Checking in…' : <>Check in now <Icon name="arrow" size={15} /></>}
      </button>
    </div>
  );
}

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
      setRecent(a.logs.slice(0, 5));
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
    return error ? <Alert type="error">{error}</Alert> : <div className="page-loading">Loading your vault…</div>;
  }

  const unassignedDocs = documents.filter((d) => d.assigned_nominees.length === 0).length;
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="page">
      <section className="dashboard-welcome">
        <div>
          <span className="eyebrow">{today}</span>
          <h1>
            Welcome back, {user.fullName.split(' ')[0]}. <em>All in one place.</em>
          </h1>
          <p>
            {status.status === 'active'
              ? unassignedDocs
                ? `A little preparation goes a long way — ${plural(unassignedDocs, 'document')} still ${unassignedDocs === 1 ? 'needs' : 'need'} a nominee.`
                : 'A little preparation goes a long way. Your vault is looking good.'
              : 'Your inactivity plan has been triggered. Review the details below.'}
          </p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <span className="sparkle">✳</span>
          <div className="welcome-doc">
            <span className="vault-lock small"><Icon name="lock" size={18} /></span>
            <span className="vault-line" />
            <span className="vault-line short" />
          </div>
        </div>
      </section>

      <Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>
      <Alert type="error" onClose={() => setError('')}>{error}</Alert>

      <StatusHero status={status} onCheckIn={handleCheckIn} checkingIn={checkingIn} />

      <SectionHeading eyebrow="Your vault at a glance" title="Everything in its place" />
      <div className="stat-grid">
        <div className="surface-card stat-card">
          <span className="stat-icon stat-violet"><Icon name="file" /></span>
          <span className="stat-label">Documents</span>
          <strong>{documents.length} <small>encrypted files</small></strong>
          <Link to="/documents" className="inline-link">Manage documents <Icon name="arrow" size={13} /></Link>
        </div>
        <div className="surface-card stat-card">
          <span className="stat-icon stat-peach"><Icon name="users" /></span>
          <span className="stat-label">Nominees</span>
          <strong>{nominees.length} <small>trusted people</small></strong>
          <Link to="/nominees" className="inline-link">Manage nominees <Icon name="arrow" size={13} /></Link>
        </div>
        <div className="surface-card stat-card">
          <span className="stat-icon stat-green"><Icon name="clock" /></span>
          <span className="stat-label">Next check-in</span>
          <strong className="stat-date">
            {status.status === 'active' ? formatDate(status.nextCheckinDueAt, false) : '—'}
          </strong>
          <Link to="/check-in" className="inline-link">Review your schedule <Icon name="arrow" size={13} /></Link>
        </div>
        <div className="surface-card stat-card">
          <span className="stat-icon stat-blue"><Icon name="shield" /></span>
          <span className="stat-label">Vault status</span>
          <strong className="stat-date"><StatusBadge status={status.status} /></strong>
          <span className="stat-foot">
            <i className={status.status === 'active' ? '' : 'warn'} />
            {status.status === 'active' ? 'Release workflow not triggered' : 'Release workflow triggered'}
          </span>
        </div>
      </div>

      <div className="dashboard-columns">
        <section className="surface-card panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Recently added</span>
              <h2>Your documents</h2>
            </div>
            <Link to="/documents" className="inline-link strong">View all <Icon name="arrow" size={14} /></Link>
          </div>
          {documents.length === 0 ? (
            <p className="muted">Nothing here yet.</p>
          ) : (
            <ul className="doc-list">
              {documents.slice(0, 4).map((doc) => (
                <li key={doc.id}>
                  <span className="doc-icon"><Icon name="file" size={17} /></span>
                  <span className="doc-copy">
                    <strong>{doc.title}</strong>
                    <small>{categoryLabel(doc.category)} · {formatBytes(doc.size_bytes)}</small>
                  </span>
                  <span className="doc-lock"><Icon name="lock" size={13} /> Encrypted</span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/documents" className="add-row">
            <span className="add-row-icon"><Icon name="plus" /></span>
            <span><strong>Add another document</strong><small>Encrypted with its own KMS data key</small></span>
          </Link>
        </section>

        <section className="surface-card panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Audit trail</span>
              <h2>Recent activity</h2>
            </div>
            <Icon name="activity" className="muted-icon" />
          </div>
          {recent.length === 0 ? (
            <p className="muted">No activity yet.</p>
          ) : (
            <ul className="timeline-list">
              {recent.map((log) => (
                <li key={log.id}>
                  <span className={`timeline-icon ${log.success ? '' : 'fail'} actor-${log.actor_type}`}>
                    <Icon name={actionIcon(log.action)} size={15} />
                  </span>
                  <span>
                    <strong>{actionLabel(log.action)}</strong>
                    {describeLog(log) && <small>{describeLog(log)}</small>}
                    <small className="faint">{relativeDay(log.occurred_at)}</small>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/activity" className="inline-link strong center">View full activity log <Icon name="arrow" size={14} /></Link>
        </section>
      </div>

      {unassignedDocs > 0 && (
        <Link to="/nominees" className="gentle-reminder">
          <span>✳</span>
          <span>
            <strong>A gentle reminder</strong> — {plural(unassignedDocs, 'document')} {unassignedDocs === 1 ? 'is' : 'are'} not
            released to anyone yet. Choose a nominee so nothing is left behind.
          </span>
          <Icon name="arrow" size={16} />
        </Link>
      )}
    </div>
  );
}
