import { Brand, Icon } from './UI';

// Split-screen frame shared by the login, register and nominee access pages.
export default function AuthShell({ promoEyebrow, promoTitle, promoAccent, promoText, children, variant = '' }) {
  return (
    <div className={`auth-page ${variant}`}>
      <aside className="auth-promo">
        <Brand light />
        <div className="promo-copy">
          <span className="eyebrow eyebrow-light"><Icon name="shield" size={14} /> {promoEyebrow}</span>
          <h1>
            {promoTitle} <em>{promoAccent}</em>
          </h1>
          <p>{promoText}</p>
        </div>
        <div className="promo-foot">
          <span><Icon name="lock" size={14} /> AES-256-GCM</span>
          <span><Icon name="key" size={14} /> AWS KMS</span>
          <span><Icon name="activity" size={14} /> Audited access</span>
        </div>
      </aside>
      <main className="auth-panel">
        <div className="auth-mobile-brand"><Brand /></div>
        <div className="auth-card">{children}</div>
      </main>
    </div>
  );
}
