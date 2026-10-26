const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'vaultkeep-default-dev-secret-replace-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Generates a signed JWT token for a vault owner.
 */
function generateOwnerToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      fullName: user.full_name,
      type: 'owner',
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Middleware that authenticates a vault owner via Bearer token.
 */
async function authenticateOwner(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required. Missing or malformed Bearer token.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.type !== 'owner') {
      return res.status(403).json({
        error: 'Forbidden. Owner privileges required.',
      });
    }

    // Verify user exists and is not currently locked out
    const userResult = await pool.query(
      `SELECT id, email, full_name, status, checkin_interval_days, 
              grace_period_days, last_checkin_at, locked_until
       FROM users 
       WHERE id = $1`,
      [decoded.sub]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User account not found.' });
    }

    const user = userResult.rows[0];

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({
        error: 'Account temporarily locked due to multiple failed login attempts.',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }
}

/**
 * Generates a signed JWT for a nominee who has claimed access with a valid one-time code.
 */
function generateNomineeToken(nominee) {
  return jwt.sign(
    {
      sub: nominee.id,
      ownerId: nominee.owner_id,
      email: nominee.email,
      fullName: nominee.full_name,
      type: 'nominee',
    },
    JWT_SECRET,
    { expiresIn: '2h' } // Nominee access tokens are short-lived
  );
}

/**
 * Middleware that authenticates a nominee with a scoped nominee token.
 */
async function authenticateNominee(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Nominee authentication required. Missing or malformed Bearer token.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.type !== 'nominee') {
      return res.status(403).json({
        error: 'Forbidden. Nominee token required.',
      });
    }

    // Verify the owner account is currently in 'released' status
    const ownerResult = await pool.query(
      `SELECT status FROM users WHERE id = $1`,
      [decoded.ownerId]
    );

    if (ownerResult.rows.length === 0 || ownerResult.rows[0].status !== 'released') {
      return res.status(403).json({
        error: 'Access not permitted. Vault owner status is not released.',
      });
    }

    req.nominee = {
      id: decoded.sub,
      ownerId: decoded.ownerId,
      email: decoded.email,
      fullName: decoded.fullName,
    };
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Nominee session expired.' });
    }
    return res.status(401).json({ error: 'Invalid nominee token.' });
  }
}

module.exports = {
  JWT_SECRET,
  generateOwnerToken,
  authenticateOwner,
  generateNomineeToken,
  authenticateNominee,
};
