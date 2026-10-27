const LABELS = {
  active: 'Active',
  inactive: 'Inactive — grace period',
  released: 'Released to nominees',
};

export default function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{LABELS[status] || status}</span>;
}
