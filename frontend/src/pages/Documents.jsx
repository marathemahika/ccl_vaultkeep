import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import Alert from '../components/Alert';
import { CATEGORIES, categoryLabel, formatBytes, formatDate } from '../utils';

// Matches the backend's default multer limit (MAX_FILE_SIZE_MB = 25).
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function UploadForm({ onUploaded }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('other');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const pickFile = (f) => {
    if (!f) return;
    setError('');
    if (f.size > MAX_FILE_BYTES) {
      setError(`"${f.name}" is ${formatBytes(f.size)}. The maximum size is 25 MB.`);
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const reset = () => {
    setFile(null);
    setTitle('');
    setCategory('other');
    if (inputRef.current) inputRef.current.value = '';
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
      reset();
      onUploaded(res.document);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>Upload a document</h2>
      <Alert type="error">{error}</Alert>

      <div
        className={`dropzone ${dragging ? 'dropzone-active' : ''}`}
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
        <input
          ref={inputRef}
          type="file"
          hidden
          onChange={(e) => pickFile(e.target.files[0])}
        />
        {file ? (
          <>
            <strong>{file.name}</strong>
            <span className="muted">{formatBytes(file.size)} — click to choose a different file</span>
          </>
        ) : (
          <>
            <strong>Drop a file here or click to browse</strong>
            <span className="muted">PDF, images, Word documents… up to 25 MB</span>
          </>
        )}
      </div>

      <div className="form-row">
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="hint">
        The file is encrypted with a unique AWS KMS data key (AES-256-GCM) before it is stored in S3.
      </p>

      <button type="submit" className="btn btn-primary" disabled={uploading || !file}>
        {uploading ? 'Encrypting & uploading…' : 'Encrypt & upload'}
      </button>
    </form>
  );
}

export default function Documents() {
  const [documents, setDocuments] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

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

  const handleDelete = async (doc) => {
    setBusyId(doc.id);
    setError('');
    try {
      await api.deleteDocument(doc.id);
      setNotice(`"${doc.title}" was removed from your vault.`);
      setConfirmDeleteId(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const visible = (documents || []).filter(
    (d) =>
      (filter === 'all' || d.category === filter) &&
      (!search ||
        d.title.toLowerCase().includes(search.toLowerCase()) ||
        d.original_filename.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Documents</h1>
          <p className="muted">Everything here is stored encrypted. Only you, and nominees after release, can open it.</p>
        </div>
      </div>

      <Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>
      <Alert type="error" onClose={() => setError('')}>{error}</Alert>

      <UploadForm
        onUploaded={(doc) => {
          setNotice(`"${doc.title}" was encrypted and stored securely.`);
          load();
        }}
      />

      <section className="card">
        <div className="card-title-row">
          <h2>Your vault</h2>
          <div className="toolbar">
            <input
              type="search"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        {documents === null ? (
          <p className="muted">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="empty">
            {documents.length === 0 ? 'No documents yet. Upload one above.' : 'No documents match your filter.'}
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Size</th>
                  <th>Released to</th>
                  <th>Uploaded</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visible.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <strong>{doc.title}</strong>
                      <div className="muted small">{doc.original_filename}</div>
                    </td>
                    <td><span className={`chip chip-${doc.category}`}>{categoryLabel(doc.category)}</span></td>
                    <td>{formatBytes(doc.size_bytes)}</td>
                    <td>
                      {doc.assigned_nominees.length === 0 ? (
                        <span className="muted">Nobody yet</span>
                      ) : (
                        doc.assigned_nominees.map((n) => (
                          <span key={n.id} className="chip" title={n.email}>{n.fullName}</span>
                        ))
                      )}
                    </td>
                    <td>{formatDate(doc.created_at, false)}</td>
                    <td className="actions">
                      {confirmDeleteId === doc.id ? (
                        <>
                          <button className="btn btn-danger btn-sm" disabled={busyId === doc.id} onClick={() => handleDelete(doc)}>
                            Confirm delete
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteId(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-ghost btn-sm" disabled={busyId === doc.id} onClick={() => handleDownload(doc)}>
                            {busyId === doc.id ? 'Decrypting…' : 'Download'}
                          </button>
                          <button className="btn btn-ghost btn-sm btn-danger-text" onClick={() => setConfirmDeleteId(doc.id)}>
                            Delete
                          </button>
                        </>
                      )}
                    </td>
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
