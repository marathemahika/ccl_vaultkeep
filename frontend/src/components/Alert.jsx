import { Icon } from './UI';

const ICONS = { success: 'check', error: 'alert', warning: 'clock', info: 'shield' };

export default function Alert({ type = 'info', children, onClose }) {
  if (!children) return null;
  return (
    <div className={`alert alert-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <span className="alert-icon"><Icon name={ICONS[type]} size={16} /></span>
      <span className="alert-body">{children}</span>
      {onClose && (
        <button type="button" className="icon-button alert-close" onClick={onClose} aria-label="Dismiss">
          <Icon name="close" size={15} />
        </button>
      )}
    </div>
  );
}
