export const CATEGORIES = [
  { value: 'property', label: 'Property' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'will', label: 'Will' },
  { value: 'financial', label: 'Financial' },
  { value: 'identity', label: 'Identity' },
  { value: 'other', label: 'Other' },
];

export function categoryLabel(value) {
  return CATEGORIES.find((c) => c.value === value)?.label || value;
}

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(value, withTime = true) {
  if (!value) return '—';
  const d = new Date(value);
  return withTime
    ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function plural(n, word) {
  return `${n} ${word}${Number(n) === 1 ? '' : 's'}`;
}

// Human-readable labels (and icons) for the audit actions the backend writes.
export const ACTIONS = {
  'auth.register': ['Account created', 'check'],
  'auth.login.success': ['Signed in', 'logout'],
  'auth.login.failed': ['Failed sign-in attempt', 'alert'],
  'auth.login.locked': ['Sign-in blocked (account locked)', 'lock'],
  'auth.password_changed': ['Password changed', 'key'],
  'checkin.manual': ['You checked in', 'check'],
  'checkin.settings_updated': ['Check-in rules changed', 'clock'],
  'document.upload': ['Document added', 'upload'],
  'document.download': ['Document downloaded', 'download'],
  'document.delete': ['Document deleted', 'trash'],
  'nominee.create': ['Nominee added', 'users'],
  'nominee.update': ['Nominee updated', 'edit'],
  'nominee.delete': ['Nominee removed', 'trash'],
  'nominee.releases_updated': ['Released documents changed', 'file'],
  'nominee.verify_code.failed': ['Nominee entered a wrong access code', 'alert'],
  'nominee.access_claimed': ['Nominee unlocked access', 'key'],
  'nominee.document.download': ['Nominee downloaded a document', 'download'],
  'lifecycle.flag_inactive': ['Check-in missed — nominees notified', 'bell'],
  'lifecycle.release_vault': ['Grace period ended — vault released', 'lock'],
};

export function actionLabel(action) {
  return ACTIONS[action]?.[0] || action;
}

export function actionIcon(action) {
  return ACTIONS[action]?.[1] || 'activity';
}

export function describeLog(log) {
  const d = log.details || {};
  return d.title || d.filename || d.fullName || d.email || d.nomineeEmail || d.reason || '';
}

export function relativeDay(value) {
  if (!value) return '';
  const d = new Date(value);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0 && new Date().toDateString() === d.toDateString()) return 'Today';
  if (days <= 1) return 'Yesterday';
  return formatDate(value, false);
}
