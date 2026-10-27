import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';

export default function Landing() {
  const { user } = useAuth();
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="landing">
      <header className="landing-header">
        <Logo />
        <div className="landing-actions">
          <Link to="/nominee" className="btn btn-ghost">Nominee access</Link>
          <Link to="/login" className="btn btn-primary">Log in</Link>
        </div>
      </header>

      <section className="hero">
        <h1>Your important documents, safely passed on.</h1>
        <p>
          VaultKeep stores your wills, insurance policies, property papers and financial records
          with envelope encryption. If you stop checking in, the people you trust are notified and,
          after a grace period, receive audited access to exactly the documents you chose.
        </p>
        <div className="hero-actions">
          <Link to="/register" className="btn btn-primary btn-lg">Create your vault</Link>
          <Link to="/nominee" className="btn btn-ghost btn-lg">I received an access code</Link>
        </div>
      </section>

      <section className="steps">
        <div className="step">
          <span className="step-num">1</span>
          <h3>Upload &amp; encrypt</h3>
          <p>Each file is encrypted with its own AWS KMS data key before it reaches storage.</p>
        </div>
        <div className="step">
          <span className="step-num">2</span>
          <h3>Choose nominees</h3>
          <p>Add trusted people and decide which documents each of them may receive.</p>
        </div>
        <div className="step">
          <span className="step-num">3</span>
          <h3>Check in</h3>
          <p>Check in on your schedule. Miss the window and your nominees are notified.</p>
        </div>
        <div className="step">
          <span className="step-num">4</span>
          <h3>Delayed release</h3>
          <p>After the grace period, nominees get access. Every download is audited.</p>
        </div>
      </section>
    </div>
  );
}
