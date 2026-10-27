import { useEffect } from 'react';
import { Link } from 'react-router-dom';

const ICON_PATHS = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  file: <><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M13 2v7h7M8 15h8M8 18h6" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a7.8 7.8 0 0 0 0-6l1.5-1.2-1.5-2.6-1.8.7a8 8 0 0 0-2.6-1.5L14.7 2h-3l-.3 2.4a8 8 0 0 0-2.6 1.5L7 5.2 5.5 7.8 7 9a7.8 7.8 0 0 0 0 6l-1.5 1.2L7 18.8l1.8-.7a8 8 0 0 0 2.6 1.5l.3 2.4h3l.3-2.4a8 8 0 0 0 2.6-1.5l1.8.7 1.5-2.6z" transform="translate(-1 -1)" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="M5 12h14M12 5l7 7-7 7" />,
  check: <path d="m5 12 4 4L19 6" />,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5M12 3v12" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  close: <path d="m18 6-12 12M6 6l12 12" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  activity: <path d="M3 12h4l3-9 4 18 3-9h4" />,
  trash: <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5m4-5v5" />,
  edit: <path d="m16 4 4 4L8 20H4v-4zM14 6l4 4" />,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
  key: <><circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" /></>,
};

export function Icon({ name, size = 18, className = '' }) {
  return (
    <svg
      className={className}
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICON_PATHS[name] || ICON_PATHS.file}
    </svg>
  );
}

export function Brand({ light = false, to = '/' }) {
  return (
    <Link className={`brand ${light ? 'brand-light' : ''}`} to={to}>
      <span className="brand-mark"><Icon name="lock" size={17} /></span>
      <span>vaultkeep</span>
    </Link>
  );
}

export function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="page-intro">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="page-heading-action">{action}</div>}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, action }) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Modal({ title, eyebrow, children, onClose, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className={`modal-card ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button className="icon-button modal-close" type="button" aria-label="Close dialog" onClick={onClose}>
          <Icon name="close" />
        </button>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2 id="modal-title">{title}</h2>
        {children}
      </section>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', busy = false, onCancel, onConfirm }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="modal-description">{message}</p>
      <div className="modal-actions">
        <button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button>
        <button type="button" className="button button-danger" disabled={busy} onClick={onConfirm}>
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function EmptyState({ icon = 'file', title, description, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon name={icon} size={23} /></span>
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function Badge({ children, tone = 'green' }) {
  return <span className={`status-badge status-${tone}`}><i />{children}</span>;
}

const STATUS = {
  active: { label: 'Active', tone: 'green' },
  inactive: { label: 'Grace period', tone: 'orange' },
  released: { label: 'Released', tone: 'red' },
};

export function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status, tone: 'blue' };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
