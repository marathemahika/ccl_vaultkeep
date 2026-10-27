import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Brand, Icon } from '../components/UI';

const STEPS = [
  { icon: 'upload', title: 'Upload & encrypt', text: 'Each file is encrypted with its own AWS KMS data key before it reaches storage.' },
  { icon: 'users', title: 'Choose nominees', text: 'Add the people you trust and decide exactly which documents each one may receive.' },
  { icon: 'clock', title: 'Check in', text: 'Check in on a rhythm that suits you. Miss the window and your nominees are notified.' },
  { icon: 'key', title: 'Delayed release', text: 'After a grace period, nominees get one-time access. Every download is audited.' },
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <Brand />
      <nav className="site-nav">
        <a href="/#how">How it works</a>
        <a href="/#security">Security</a>
      </nav>
      <div className="site-actions">
        <Link to="/nominee" className="site-link">Nominee access</Link>
        <Link to="/login" className="site-link">Log in</Link>
        <Link to="/register" className="button button-primary button-small">
          Get started <Icon name="arrow" size={15} />
        </Link>
      </div>
    </header>
  );
}

export function VaultIllustration() {
  return (
    <div className="hero-visual" aria-hidden="true">
      <div className="hero-ring" />
      <span className="sparkle sparkle-1">✳</span>
      <div className="vault-card">
        <span className="vault-dots"><i /><i /><i /></span>
        <span className="vault-lock"><Icon name="lock" size={30} /></span>
        <span className="vault-line" />
        <span className="vault-line short" />
        <span className="vault-caption">YOUR LEGACY, KEPT SAFE</span>
      </div>
      <div className="float-card float-doc">
        <Icon name="file" size={18} />
        <span className="vault-line" />
        <span className="vault-line short" />
      </div>
      <div className="float-card float-person">
        <span className="mini-avatar">RV</span>
        <span><strong>Ravi Verma</strong><small>Nominee · access on release</small></span>
        <Icon name="check" size={15} />
      </div>
    </div>
  );
}

export default function Landing() {
  const { user } = useAuth();
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="landing-page">
      <SiteHeader />

      <section className="landing-hero">
        <div className="hero-copy">
          <span className="eyebrow"><i className="eyebrow-dot" /> A little preparation, a lot of peace of mind</span>
          <h1>Your important things, <em>in caring hands.</em></h1>
          <p>
            A private, encrypted place for the wills, insurance policies, property papers and
            financial records your loved ones may one day need — shared only with the people you
            choose, and only when it matters.
          </p>
          <div className="hero-actions">
            <Link to="/register" className="button button-primary">
              Create your vault <Icon name="arrow" size={16} />
            </Link>
            <Link to="/nominee" className="button button-outline">I received an access code</Link>
          </div>
          <div className="hero-trust">
            <span><Icon name="shield" size={15} /> KMS envelope encryption</span>
            <span><Icon name="activity" size={15} /> Every access audited</span>
          </div>
        </div>
        <VaultIllustration />
      </section>

      <div className="landing-trust-strip">
        <span>THOUGHTFUL BY DESIGN</span>
        <div><Icon name="lock" size={17} /> Private documents</div>
        <div><Icon name="users" size={17} /> Trusted nominees</div>
        <div><Icon name="clock" size={17} /> Time-delayed access</div>
      </div>

      <section className="landing-section section-center" id="how">
        <span className="eyebrow">How it works</span>
        <h2>Care for the things<br />that matter most.</h2>
        <p>VaultKeep helps you prepare for the future without giving up control today.</p>
        <div className="feature-grid">
          {STEPS.map((s, i) => (
            <div key={s.title} className="surface-card feature-card">
              <span className={`stat-icon stat-${['violet', 'peach', 'green', 'blue'][i]}`}>
                <Icon name={s.icon} />
              </span>
              <span className="feature-step">Step {i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section" id="security">
        <div className="security-panel">
          <div>
            <span className="eyebrow eyebrow-light">Security</span>
            <h2>Plaintext never touches storage.</h2>
            <p>
              Documents are encrypted in memory with AES-256-GCM using a per-file data key from AWS
              KMS. Only the KMS-encrypted key is saved, the file lives in S3 as ciphertext, and
              every decryption is written to an append-only audit log.
            </p>
          </div>
          <ul>
            <li><Icon name="check" size={16} /> Per-file KMS data keys</li>
            <li><Icon name="check" size={16} /> One-time nominee access codes</li>
            <li><Icon name="check" size={16} /> Grace period before any release</li>
            <li><Icon name="check" size={16} /> Tamper-resistant audit trail</li>
          </ul>
        </div>
      </section>

      <footer className="site-footer">
        <span><Icon name="lock" size={13} /> VaultKeep — your legacy, on your terms</span>
      </footer>
    </div>
  );
}
