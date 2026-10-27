import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Brand, Icon, StatusBadge, initials } from './UI';

const NAV = [
  { to: '/dashboard', label: 'Overview', icon: 'grid' },
  { to: '/documents', label: 'My vault', icon: 'file', count: true },
  { to: '/nominees', label: 'Nominees', icon: 'users' },
  { to: '/check-in', label: 'Check-in settings', icon: 'clock' },
  { to: '/activity', label: 'Activity log', icon: 'activity' },
  { to: '/settings', label: 'Account settings', icon: 'settings' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [docCount, setDocCount] = useState(null);

  const current = NAV.find((n) => location.pathname.startsWith(n.to));

  // Refresh the document count badge whenever the owner moves between pages.
  useEffect(() => {
    setMenuOpen(false);
    api
      .listDocuments()
      .then((res) => setDocCount(res.documents.length))
      .catch(() => {});
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className={`app-shell ${menuOpen ? 'sidebar-open' : ''}`}>
      <aside className="sidebar">
        <Brand to="/dashboard" />
        <div className="workspace-label">OWNER WORKSPACE</div>
        <nav className="main-nav" aria-label="Owner navigation">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className="nav-item">
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.count && docCount !== null && <span className="nav-count">{docCount}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <div className="secure-card">
          <span className="secure-icon"><Icon name="shield" /></span>
          <strong>Envelope encryption on</strong>
          <p>Every file gets its own AWS KMS data key. Plaintext never reaches storage.</p>
          <span className="secure-status"><i /> AES-256-GCM · per-file keys</span>
        </div>

        <NavLink className="nav-item nominee-preview" to="/nominee" target="_blank">
          <Icon name="eye" />
          <span>Nominee portal</span>
        </NavLink>

        <div className="sidebar-profile">
          <span className="profile-avatar">{initials(user.fullName)}</span>
          <span className="profile-copy">
            <strong>{user.fullName}</strong>
            <small>{user.email}</small>
          </span>
          <button className="icon-button" aria-label="Log out" title="Log out" onClick={handleLogout}>
            <Icon name="logout" size={17} />
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMenuOpen(true)}>
            <Icon name="menu" />
          </button>
          <div className="breadcrumb">
            <span>My workspace</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{current?.label || 'Overview'}</strong>
          </div>
          <div className="topbar-actions">
            <StatusBadge status={user.status} />
            <button className="topbar-avatar" aria-label="Account settings" onClick={() => navigate('/settings')}>
              {initials(user.fullName)}
            </button>
          </div>
        </header>

        <div className="content-wrap">
          <Outlet />
        </div>

        <footer className="app-footer">
          <span><Icon name="lock" size={13} /> Files encrypted with AWS KMS · access audited</span>
          <span>VaultKeep</span>
        </footer>
      </main>

      <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} />
    </div>
  );
}
