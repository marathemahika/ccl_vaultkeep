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
