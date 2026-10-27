import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, tokens } from '../../api/client';
import Alert from '../../components/Alert';
import Logo from '../../components/Logo';
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
    <div className="nominee-theme nominee-vault">
      <header className="landing-header">
        <Logo />
        <button className="btn btn-ghost" onClick={endSession}>End session</button>
      </header>

      <main className="page nominee-page">
        <div className="page-header">
          <div>
            <h1>Documents released to you</h1>
            <p className="muted">
              {profile.vaultOwner ? (
                <>
                  <strong>{profile.vaultOwner}</strong> chose to share these documents with you,{' '}
                  {profile.fullName}.
                </>
              ) : (
                'These documents were released to you by the vault owner.'
              )}
            </p>
          </div>
        </div>

        <Alert type="info">
          This session lasts up to 2 hours and your access code has now been used. Download what you
          need. Each download is decrypted on request and recorded in an audit log.
        </Alert>

        {error && (
          <div className="alert alert-error" role="alert">
            <span>{error}</span>
            {sessionExpired && (
              <button className="btn btn-sm btn-ghost" onClick={endSession}>Back to sign-in</button>
            )}
          </div>
        )}

        {documents === null ? (
          !error && <p className="muted">Loading…</p>
        ) : documents.length === 0 ? (
          <section className="card empty">
            <p>No documents were released to you.</p>
            <p className="muted">The vault owner did not assign any documents to your nominee profile.</p>
          </section>
        ) : (
          <div className="doc-grid">
            {documents.map((doc) => (
              <section key={doc.id} className="card doc-card">
                <span className={`chip chip-${doc.category}`}>{categoryLabel(doc.category)}</span>
                <h3>{doc.title}</h3>
                <p className="muted small">
                  {doc.original_filename} · {formatBytes(doc.size_bytes)}
                  <br />
                  Stored {formatDate(doc.created_at, false)}
                </p>
                <button
                  className="btn btn-primary btn-block"
                  disabled={busyId === doc.id}
                  onClick={() => handleDownload(doc)}
                >
                  {busyId === doc.id
                    ? 'Decrypting…'
                    : downloaded.has(doc.id)
                      ? 'Download again'
                      : 'Download'}
                </button>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
