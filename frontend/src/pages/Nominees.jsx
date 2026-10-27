import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Alert from '../components/Alert';
import { Badge, ConfirmDialog, EmptyState, Icon, Modal, PageHeading, initials } from '../components/UI';
import { categoryLabel, formatDate, plural } from '../utils';

const EMPTY_FORM = { full_name: '', email: '', relationship: '' };

function NomineeModal({ nominee, onClose, onSubmit }) {
  const [form, setForm] = useState(
    nominee
      ? { full_name: nominee.full_name, email: nominee.email, relationship: nominee.relationship || '' }
      : EMPTY_FORM
  );
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
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal eyebrow="The people you trust" title={nominee ? 'Edit nominee' : 'Add someone you trust'} onClose={onClose}>
      <form className="modal-form" onSubmit={handleSubmit}>
        <Alert type="error">{error}</Alert>
        <label className="field">
          <span className="field-label">Full name</span>
          <input value={form.full_name} onChange={update('full_name')} required />
        </label>
        <label className="field">
          <span className="field-label">Email address</span>
          <input type="email" value={form.email} onChange={update('email')} required />
          <small className="field-hint">Notifications and the one-time access code go to this address.</small>
        </label>
        <label className="field">
          <span className="field-label">Relationship <span className="faint">(optional)</span></span>
          <input value={form.relationship} onChange={update('relationship')} placeholder="e.g. Spouse, Son, Lawyer" />
        </label>
        <div className="modal-actions">
          <button type="button" className="button button-quiet" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={saving}>
            {saving ? 'Saving…' : nominee ? 'Save changes' : 'Add nominee'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AssignmentsModal({ nominee, documents, onClose, onSave }) {
  const [selected, setSelected] = useState(() => new Set(nominee.assigned_documents.map((d) => d.id)));
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

  return (
    <Modal eyebrow="Manage assignments" title={`What ${nominee.full_name.split(' ')[0]} receives`} onClose={onClose} wide>
      <p className="modal-description">
        If your vault is released, {nominee.full_name} can open only the documents you tick here.
      </p>
      <Alert type="error">{error}</Alert>
      {documents.length === 0 ? (
        <EmptyState
          icon="file"
          title="No documents yet"
          description="Add a document to your vault first."
          action={<Link to="/documents" className="button button-outline button-small">Go to My vault</Link>}
        />
      ) : (
        <div className="checkbox-list">
          {documents.map((doc) => (
            <label key={doc.id} className={`checkbox-item ${selected.has(doc.id) ? 'checked' : ''}`}>
              <input type="checkbox" checked={selected.has(doc.id)} onChange={() => toggle(doc.id)} />
              <span className={`doc-icon cat-${doc.category}`}><Icon name="file" size={15} /></span>
              <span className="doc-copy">
                <strong>{doc.title}</strong>
                <small>{categoryLabel(doc.category)}</small>
              </span>
            </label>
          ))}
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="button button-quiet" onClick={onClose}>Cancel</button>
        <button type="button" className="button button-primary" onClick={handleSave} disabled={saving || documents.length === 0}>
          {saving ? 'Saving…' : `Release ${plural(selected.size, 'document')}`}
        </button>
      </div>
    </Modal>
  );
}

function NotificationBadge({ nominee }) {
  if (nominee.notified_released_at) {
    return <span title={formatDate(nominee.notified_released_at)}><Badge tone="red">Access granted</Badge></span>;
  }
  if (nominee.notified_inactive_at) {
    return <span title={formatDate(nominee.notified_inactive_at)}><Badge tone="orange">Notified</Badge></span>;
  }
  return <Badge tone="blue">Standing by</Badge>;
}

export default function Nominees() {
  const [nominees, setNominees] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, object = edit
  const [assigning, setAssigning] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [n, d] = await Promise.all([api.listNominees(), api.listDocuments()]);
      setNominees(n.nominees);
      setDocuments(d.documents);
      return n.nominees;
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (data) => {
    if (editing) {
      await api.updateNominee(editing.id, data);
      setNotice('Nominee updated.');
      setEditing(undefined);
      await load();
    } else {
      const res = await api.createNominee(data);
      setNotice(`${res.nominee.full_name} was added. Now choose which documents they receive.`);
      setEditing(undefined);
      const list = await load();
      setAssigning(list.find((n) => n.id === res.nominee.id) || null);
    }
  };

  const handleAssign = async (ids) => {
    const res = await api.setNomineeReleases(assigning.id, ids);
    setNotice(res.message);
    setAssigning(null);
    await load();
  };

  const handleRemove = async () => {
    setBusy(true);
    try {
      await api.deleteNominee(removing.id);
      setNotice(`${removing.full_name} was removed.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  };

  return (
    <div className="page">
      <PageHeading
        eyebrow="The people you trust"
        title="Your nominees"
        description="Choose who may receive a document if you can no longer check in."
        action={
          <button className="button button-primary button-large" onClick={() => setEditing(null)}>
            <Icon name="plus" size={16} /> Add nominee
          </button>
        }
      />

      <Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>
      <Alert type="error" onClose={() => setError('')}>{error}</Alert>

      <div className="info-note banner-note">
        <Icon name="shield" size={17} />
        <p>
          <strong>You&apos;re in control, always.</strong> Nominees are only notified if you miss a
          check-in, and can open documents only after the grace period ends — never before.
        </p>
      </div>

      {nominees === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="nominee-grid">
          {nominees.map((nominee, i) => (
            <section key={nominee.id} className="surface-card nominee-card">
              <div className="nominee-card-top">
                <span className={`nominee-avatar ${i % 2 ? 'blue' : ''}`}>{initials(nominee.full_name)}</span>
                <span className="card-actions">
                  <button className="icon-button" aria-label={`Edit ${nominee.full_name}`} onClick={() => setEditing(nominee)}>
                    <Icon name="edit" size={16} />
                  </button>
                  <button className="icon-button danger" aria-label={`Remove ${nominee.full_name}`} onClick={() => setRemoving(nominee)}>
                    <Icon name="trash" size={16} />
                  </button>
                </span>
              </div>
              <h3>{nominee.full_name}</h3>
              <span className="nominee-relation">{nominee.relationship || 'Nominee'}</span>
              <p className="nominee-email" title={nominee.email}>{nominee.email}</p>

              <div className="nominee-meta">
                <span>Notification status</span>
                <NotificationBadge nominee={nominee} />
              </div>
              <div className="nominee-meta">
                <span><Icon name="file" size={14} /> Assigned documents</span>
                <strong className={nominee.assigned_documents.length ? '' : 'warn-text'}>
                  {nominee.assigned_documents.length ? plural(nominee.assigned_documents.length, 'document') : 'None yet'}
                </strong>
              </div>
              {nominee.assigned_documents.length > 0 && (
                <div className="chip-row">
                  {nominee.assigned_documents.map((d) => (
                    <span key={d.id} className={`chip cat-${d.category}`}>{d.title}</span>
                  ))}
                </div>
              )}
              <button className="nominee-link" onClick={() => setAssigning(nominee)}>
                Manage assignments <Icon name="arrow" size={15} />
              </button>
            </section>
          ))}

          <button className="add-card" onClick={() => setEditing(null)}>
            <span className="empty-icon"><Icon name="plus" size={20} /></span>
            <strong>Add someone you trust</strong>
            <small>You can change assignments any time.</small>
          </button>
        </div>
      )}

      {editing !== undefined && (
        <NomineeModal nominee={editing} onClose={() => setEditing(undefined)} onSubmit={handleSave} />
      )}
      {assigning && (
        <AssignmentsModal
          nominee={assigning}
          documents={documents}
          onClose={() => setAssigning(null)}
          onSave={handleAssign}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.full_name}?`}
          message="They will no longer be notified or receive any documents from your vault."
          confirmLabel="Remove nominee"
          busy={busy}
          onCancel={() => setRemoving(null)}
          onConfirm={handleRemove}
        />
      )}
    </div>
  );
}
