import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Alert from '../components/Alert';
import { categoryLabel, formatDate } from '../utils';

const EMPTY_FORM = { full_name: '', email: '', relationship: '' };

function NomineeForm({ initial = EMPTY_FORM, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSubmit({
        full_name: form.full_name,
        email: form.email,
        relationship: form.relationship || null,
      });
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="nominee-form">
      <Alert type="error">{error}</Alert>
      <div className="form-row form-row-3">
        <label>
          Full name
          <input value={form.full_name} onChange={update('full_name')} required />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={update('email')} required />
        </label>
        <label>
          Relationship <span className="muted">(optional)</span>
          <input value={form.relationship || ''} onChange={update('relationship')} placeholder="e.g. Spouse, Lawyer" />
        </label>
      </div>
      <div className="button-row">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        )}
      </div>
    </form>
  );
}

function ReleaseEditor({ nominee, documents, onSave, onCancel }) {
  const [selected, setSelected] = useState(
    () => new Set(nominee.assigned_documents.map((d) => d.id))
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave([...selected]);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  if (documents.length === 0) {
    return (
      <div className="release-editor">
        <p className="muted">
          You have no documents yet. <Link to="/documents">Upload one</Link> first.
        </p>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Close</button>
      </div>
    );
  }

  return (
    <div className="release-editor">
      <p className="muted small">
        Choose which documents {nominee.full_name} receives if your vault is released.
      </p>
      <Alert type="error">{error}</Alert>
      <div className="checkbox-list">
        {documents.map((doc) => (
          <label key={doc.id} className="checkbox-item">
            <input type="checkbox" checked={selected.has(doc.id)} onChange={() => toggle(doc.id)} />
            <span>
              <strong>{doc.title}</strong>{' '}
              <span className="muted small">{categoryLabel(doc.category)}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="button-row">
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : `Release ${selected.size} document${selected.size === 1 ? '' : 's'}`}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function NotificationStatus({ nominee }) {
  if (nominee.notified_released_at) {
    return (
      <span className="chip chip-danger" title={formatDate(nominee.notified_released_at)}>
        Access granted {formatDate(nominee.notified_released_at, false)}
      </span>
    );
  }
  if (nominee.notified_inactive_at) {
    return (
      <span className="chip chip-warning" title={formatDate(nominee.notified_inactive_at)}>
        Notified of inactivity {formatDate(nominee.notified_inactive_at, false)}
      </span>
    );
  }
  return <span className="chip">Not notified</span>;
}

export default function Nominees() {
  const [nominees, setNominees] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [releasesId, setReleasesId] = useState(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [n, d] = await Promise.all([api.listNominees(), api.listDocuments()]);
      setNominees(n.nominees);
      setDocuments(d.documents);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (data) => {
    const res = await api.createNominee(data);
    setNotice(`${res.nominee.full_name} was added as a nominee. Now choose which documents to release to them.`);
    setShowAdd(false);
    await load();
    setReleasesId(res.nominee.id);
  };

  const handleUpdate = (id) => async (data) => {
    await api.updateNominee(id, data);
    setNotice('Nominee updated.');
    setEditingId(null);
    await load();
  };

  const handleReleases = (nominee) => async (ids) => {
    const res = await api.setNomineeReleases(nominee.id, ids);
    setNotice(res.message);
    setReleasesId(null);
    await load();
  };

  const handleRemove = async (nominee) => {
    setError('');
    try {
      await api.deleteNominee(nominee.id);
      setNotice(`${nominee.full_name} was removed.`);
      setConfirmRemoveId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Nominees</h1>
          <p className="muted">
            People who are notified if you stop checking in, and who receive the documents you
            release to them after the grace period.
          </p>
        </div>
        {!showAdd && (
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>Add nominee</button>
        )}
      </div>

      <Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>
      <Alert type="error" onClose={() => setError('')}>{error}</Alert>

      {showAdd && (
        <section className="card">
          <h2>Add a nominee</h2>
          <NomineeForm submitLabel="Add nominee" onSubmit={handleCreate} onCancel={() => setShowAdd(false)} />
        </section>
      )}

      {nominees === null ? (
        <p className="muted">Loading…</p>
      ) : nominees.length === 0 ? (
        <section className="card empty">
          <p>You haven&apos;t added any nominees yet.</p>
          <p className="muted">Without nominees, nobody can receive your documents.</p>
        </section>
      ) : (
        <div className="nominee-list">
          {nominees.map((nominee) => (
            <section key={nominee.id} className="card nominee-card">
              {editingId === nominee.id ? (
                <>
                  <h2>Edit nominee</h2>
                  <NomineeForm
                    initial={{
                      full_name: nominee.full_name,
                      email: nominee.email,
                      relationship: nominee.relationship || '',
                    }}
                    submitLabel="Save changes"
                    onSubmit={handleUpdate(nominee.id)}
                    onCancel={() => setEditingId(null)}
                  />
                </>
              ) : (
                <>
                  <div className="nominee-head">
                    <div className="avatar" aria-hidden="true">
                      {nominee.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="nominee-info">
                      <h3>{nominee.full_name}</h3>
                      <span className="muted">
                        {nominee.email}
                        {nominee.relationship && ` · ${nominee.relationship}`}
                      </span>
                    </div>
                    <NotificationStatus nominee={nominee} />
                  </div>

                  <div className="nominee-docs">
                    <span className="label">Released documents</span>
                    {nominee.assigned_documents.length === 0 ? (
                      <span className="muted">None — this nominee would receive nothing.</span>
                    ) : (
                      <div>
                        {nominee.assigned_documents.map((d) => (
                          <span key={d.id} className={`chip chip-${d.category}`}>{d.title}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {releasesId === nominee.id ? (
                    <ReleaseEditor
                      nominee={nominee}
                      documents={documents}
                      onSave={handleReleases(nominee)}
                      onCancel={() => setReleasesId(null)}
                    />
                  ) : (
                    <div className="button-row">
                      <button className="btn btn-ghost btn-sm" onClick={() => setReleasesId(nominee.id)}>
                        Choose documents
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(nominee.id)}>
                        Edit
                      </button>
                      {confirmRemoveId === nominee.id ? (
                        <>
                          <button className="btn btn-danger btn-sm" onClick={() => handleRemove(nominee)}>
                            Confirm remove
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmRemoveId(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn btn-ghost btn-sm btn-danger-text"
                          onClick={() => setConfirmRemoveId(nominee.id)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
