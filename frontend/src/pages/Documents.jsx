import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import Alert from '../components/Alert';
import { ConfirmDialog, EmptyState, Icon, Modal, PageHeading } from '../components/UI';
import { CATEGORIES, categoryLabel, formatBytes, formatDate } from '../utils';

// Matches the backend's default multer limit (MAX_FILE_SIZE_MB = 25).
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function tooLarge(file) {
  return file.size > MAX_FILE_BYTES
    ? `"${file.name}" is ${formatBytes(file.size)}. The maximum size is 25 MB.`
    : '';
}

function UploadModal({ initialFile, onClose, onUploaded }) {
  const [file, setFile] = useState(initialFile || null);
  const [title, setTitle] = useState(initialFile ? initialFile.name.replace(/\.[^.]+$/, '') : '');
  const [category, setCategory] = useState('other');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const pickFile = (f) => {
    if (!f) return;
    const problem = tooLarge(f);
    setError(problem);
    if (problem) return;
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Choose a file to upload.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const res = await api.uploadDocument(file, title, category);
      onUploaded(res.document);
    } catch (err) {
      setError(err.message);
      setUploading(false);
    }
  };

  return (
    <Modal eyebrow="Your important things" title="Add a document" onClose={onClose} wide>
      <form className="modal-form" onSubmit={handleSubmit}>
        <Alert type="error">{error}</Alert>

        <div
          className={`dropzone ${dragging ? 'dropzone-active' : ''} ${file ? 'dropzone-filled' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pickFile(e.dataTransfer.files[0]);
          }}
        >
          <input ref={inputRef} type="file" hidden onChange={(e) => pickFile(e.target.files[0])} />
          <span className="empty-icon"><Icon name={file ? 'file' : 'upload'} size={22} /></span>
          {file ? (
            <>
              <strong>{file.name}</strong>
              <small>{formatBytes(file.size)} · click to choose a different file</small>
            </>
          ) : (
            <>
              <strong>Drop a file here or click to browse</strong>
              <small>PDF, DOC, DOCX, JPG or PNG · up to 25 MB</small>
            </>
          )}
        </div>

        <div className="form-row">
          <label className="field">
            <span className="field-label">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Last will & testament" required />
          </label>
          <label className="field">
            <span className="field-label">Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="info-note">
          <Icon name="shield" size={16} />
          <p>The file is encrypted in memory with a unique AWS KMS data key (AES-256-GCM) before it is stored in S3.</p>
        </div>

        <div className="modal-actions">
          <button type="button" className="button button-quiet" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={uploading || !file}>
            {uploading ? 'Encrypting & uploading…' : <><Icon name="lock" size={15} /> Encrypt & upload</>}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Documents() {
  const [documents, setDocuments] = useState(null);
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [uploadFile, setUploadFile] = useState(undefined); // undefined = closed, null = open empty
  const [toDelete, setToDelete] = useState(null);
  const [dragging, setDragging] = useState(false);
  const bottomInputRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await api.listDocuments();
      setDocuments(res.documents);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDownload = async (doc) => {
    setBusyId(doc.id);
    setError('');
    try {
      await api.downloadDocument(doc.id, doc.original_filename);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    setBusyId(toDelete.id);
    setError('');
    try {
      await api.deleteDocument(toDelete.id);
      setNotice(`"${toDelete.title}" was removed from your vault.`);
      setToDelete(null);
      await load();
    } catch (err) {
      setError(err.message);
      setToDelete(null);
    } finally {
      setBusyId(null);
    }
  };

  const openWithFile = (f) => {
    if (!f) return;
    const problem = tooLarge(f);
    if (problem) setError(problem);
    else setUploadFile(f);
  };

  const q = search.toLowerCase();
  const visible = (documents || [])
    .filter(
      (d) =>
        (filter === 'all' || d.category === filter) &&
        (!q || d.title.toLowerCase().includes(q) || d.original_filename.toLowerCase().includes(q) || d.category.includes(q))
    )
    .sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title)
        : sort === 'oldest'
          ? new Date(a.created_at) - new Date(b.created_at)
          : new Date(b.created_at) - new Date(a.created_at)
    );

  return (
    <div className="page">
      <PageHeading
        eyebrow="Your important things"
        title="My vault"
        description="Organize important documents and decide who may receive them."
        action={
          <button className="button button-primary button-large" onClick={() => setUploadFile(null)}>
            <Icon name="plus" size={16} /> Add document
          </button>
        }
      />

      <Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>
      <Alert type="error" onClose={() => setError('')}>{error}</Alert>

      <div className="info-note banner-note">
        <Icon name="shield" size={17} />
        <p>
          <strong>Encrypted before storage.</strong> Each file is sealed with its own AWS KMS data
          key. Only you, and nominees after release, can ever decrypt it.
        </p>
      </div>

      <section className="surface-card table-card">
        <div className="table-toolbar">
          <label className="search-box">
            <Icon name="search" size={16} />
            <input
              type="search"
              placeholder="Search title, file, or category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="table-filters">
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by category">
              <option value="all">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort documents">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="title">Title A–Z</option>
            </select>
          </div>
        </div>

        {documents === null ? (
          <p className="table-empty">Loading…</p>
        ) : visible.length === 0 ? (
          <EmptyState
            icon="file"
            title={documents.length === 0 ? 'Your vault is empty' : 'No documents match'}
            description={documents.length === 0 ? 'Add your first document to get started.' : 'Try a different search or category.'}
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Uploaded</th>
                  <th>Released to</th>
                  <th>Size</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visible.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <div className="doc-cell">
                        <span className={`doc-icon cat-${doc.category}`}><Icon name="file" size={17} /></span>
                        <span className="doc-copy">
                          <strong>{doc.title}</strong>
                          <small>{categoryLabel(doc.category)} · {doc.original_filename}</small>
                        </span>
                      </div>
                    </td>
                    <td className="nowrap">{formatDate(doc.created_at, false)}</td>
                    <td>
                      {doc.assigned_nominees.length === 0 ? (
                        <span className="faint">Nobody yet</span>
                      ) : (
                        doc.assigned_nominees.map((n) => n.fullName.split(' ')[0]).join(', ')
                      )}
                    </td>
                    <td className="nowrap faint">{formatBytes(doc.size_bytes)}</td>
                    <td className="row-actions">
                      <button
                        className="icon-button"
                        title="Decrypt & download"
                        aria-label={`Download ${doc.title}`}
                        disabled={busyId === doc.id}
                        onClick={() => handleDownload(doc)}
                      >
                        {busyId === doc.id ? <span className="spinner" /> : <Icon name="download" size={17} />}
                      </button>
                      <button
                        className="icon-button danger"
                        title="Delete"
                        aria-label={`Delete ${doc.title}`}
                        onClick={() => setToDelete(doc)}
                      >
                        <Icon name="trash" size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-footnote">
          <Icon name="lock" size={13} /> Downloads are decrypted on request and recorded in your activity log.
        </div>
      </section>

      <div
        className={`upload-panel ${dragging ? 'dropzone-active' : ''}`}
        onClick={() => bottomInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          openWithFile(e.dataTransfer.files[0]);
        }}
      >
        <input ref={bottomInputRef} type="file" hidden onChange={(e) => openWithFile(e.target.files[0])} />
        <span className="empty-icon"><Icon name="upload" size={21} /></span>
        <strong>Drop a file to start, or click to browse</strong>
        <small>PDF, DOC, DOCX, JPG or PNG · up to 25 MB</small>
      </div>

      {uploadFile !== undefined && (
        <UploadModal
          initialFile={uploadFile}
          onClose={() => {
            setUploadFile(undefined);
            if (bottomInputRef.current) bottomInputRef.current.value = '';
          }}
          onUploaded={(doc) => {
            setUploadFile(undefined);
            setNotice(`"${doc.title}" was encrypted and stored securely.`);
            load();
          }}
        />
      )}

      {toDelete && (
        <ConfirmDialog
          title="Delete this document?"
          message={`"${toDelete.title}" will be removed from your vault and from every nominee it was released to.`}
          confirmLabel="Delete document"
          busy={busyId === toDelete.id}
          onCancel={() => setToDelete(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
