import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, tokens } from '../../api/client';
import Alert from '../../components/Alert';
import { Badge, Brand, EmptyState, Icon } from '../../components/UI';
import { categoryLabel, formatBytes, formatDate } from '../../utils';

function readProfile() {
  try {
    return JSON.parse(sessionStorage.getItem('vk_nominee_profile')) || {};
  } catch {
    return {};
  }
}

export default function NomineeVault() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [downloaded, setDownloaded] = useState(() => new Set());
  const profile = readProfile();
  const hasToken = Boolean(tokens.getNominee());

  const endSession = () => {
    tokens.clearNominee();
    sessionStorage.removeItem('vk_nominee_profile');
    navigate('/nominee');
  };

  useEffect(() => {
    if (!hasToken) return;
    api
      .nomineeDocuments()
      .then((res) => setDocuments(res.releasedDocuments))
      .catch((err) => setError(err.message));
  }, [hasToken]);

  if (!hasToken) return <Navigate to="/nominee" replace />;

  const handleDownload = async (doc) => {
    setBusyId(doc.id);
    setError('');
    try {
      await api.nomineeDownload(doc.id, doc.original_filename);
      setDownloaded(new Set(downloaded).add(doc.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const sessionExpired = /expired|invalid nominee token/i.test(error);

  return (
    <div className="nominee-portal">
      <header className="site-header">
        <Brand to="/nominee" />
        <button className="button button-quiet button-small" onClick={endSession}>
          <Icon name="logout" size={15} /> End session
        </button>
      </header>

      <main className="nominee-main">
        <section className="nominee-welcome">
          <span className="eyebrow"><Icon name="users" size={14} /> Nominee portal</span>
          <h1>A shared space, <em>for when it matters.</em></h1>
          <p>
            {profile.vaultOwner ? (
              <>
                {profile.fullName ? `${profile.fullName}, ` : ''}<strong>{profile.vaultOwner}</strong> chose to leave
                these documents in your care.
              </>
            ) : (
              'These documents were released to you by the vault owner.'
            )}
          </p>
        </section>

        <div className="info-note banner-note">
          <Icon name="shield" size={17} />
          <p>
            <strong>Your access code has been used.</strong> This session lasts up to 2 hours.
            Each file is decrypted only when you download it, and every download is recorded.
          </p>
        </div>

        {error && (
          <Alert type="error">
            {error}{' '}
            {sessionExpired && (
              <button className="link-button" onClick={endSession}>Back to sign-in</button>
            )}
          </Alert>
        )}

        <div className="section-heading">
          <div>
            <span className="eyebrow">Released to you</span>
            <h2>Documents shared with you</h2>
          </div>
          {documents && <Badge tone="blue">{documents.length} available</Badge>}
        </div>

        {documents === null ? (
          !error && <p className="muted">Loading…</p>
        ) : documents.length === 0 ? (
          <section className="surface-card">
            <EmptyState
              icon="file"
              title="No documents were released to you"
              description="The vault owner did not assign any documents to your nominee profile."
            />
          </section>
        ) : (
          <div className="release-list">
            {documents.map((doc) => (
              <section key={doc.id} className="surface-card release-row">
                <span className={`doc-icon cat-${doc.category}`}><Icon name="file" size={18} /></span>
                <span className="doc-copy">
                  <strong>{doc.title}</strong>
                  <small>{categoryLabel(doc.category)} · {formatBytes(doc.size_bytes)} · {doc.original_filename}</small>
                  <small>Stored {formatDate(doc.created_at, false)}</small>
                </span>
                <Badge tone="green">{downloaded.has(doc.id) ? 'Downloaded' : 'Released'}</Badge>
                <button
                  className="button button-outline button-small"
                  disabled={busyId === doc.id}
                  onClick={() => handleDownload(doc)}
                >
                  {busyId === doc.id ? <><span className="spinner" /> Decrypting…</> : <><Icon name="download" size={15} /> Download</>}
                </button>
              </section>
            ))}
          </div>
        )}

        <div className="info-note subtle">
          <Icon name="lock" size={16} />
          <p>
            <strong>Shared with care.</strong> You only see the documents the owner chose for you.
            Anything else in their vault stays private.
          </p>
        </div>
      </main>
    </div>
  );
}
