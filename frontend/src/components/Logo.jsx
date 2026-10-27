export default function Logo() {
  return (
    <span className="logo">
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="#1f3a5f" />
        <rect x="9" y="14" width="14" height="11" rx="2" fill="#f2c14e" />
        <path d="M12 14v-3a4 4 0 0 1 8 0v3" stroke="#f2c14e" strokeWidth="2.4" fill="none" />
      </svg>
      <span>VaultKeep</span>
    </span>
  );
}
