const pool = require('../config/database');

/**
 * Validates whether a string is a valid IPv4 or IPv6 address.
 * Prevents PostgreSQL inet parse errors.
 */
function sanitizeIpAddress(ip) {
  if (!ip || typeof ip !== 'string') return null;
  // Normalize loopback IPv6-mapped IPv4 e.g. ::ffff:127.0.0.1
  const cleanIp = ip.replace(/^::ffff:/, '').trim();
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}$/;
  if (ipv4Regex.test(cleanIp) || ipv6Regex.test(cleanIp) || cleanIp === '::1') {
    return cleanIp;
  }
  return null;
}

/**
 * Records an immutable audit log entry.
 * Note: audit_log is append-only; database triggers prevent UPDATE and DELETE.
 *
 * @param {Object} entry
 * @param {'owner'|'nominee'|'system'} entry.actorType
 * @param {string|null} [entry.actorId] - User ID or Nominee ID
 * @param {string|null} [entry.ownerId] - Vault owner ID affected
 * @param {string|null} [entry.documentId] - Document ID if applicable
 * @param {string} entry.action - Action name (e.g. 'auth.login', 'document.upload')
 * @param {boolean} [entry.success=true] - Action result
 * @param {string|null} [entry.ipAddress] - Client IP address
 * @param {string|null} [entry.userAgent] - Client User-Agent
 * @param {Object} [entry.details={}] - Additional structured metadata (no secrets)
 */
async function logEvent({
  actorType,
  actorId = null,
  ownerId = null,
  documentId = null,
  action,
  success = true,
  ipAddress = null,
  userAgent = null,
  details = {},
}) {
  const query = `
    INSERT INTO audit_log (
      actor_type,
      actor_id,
      owner_id,
      document_id,
      action,
      success,
      ip_address,
      user_agent,
      details
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, occurred_at;
  `;

  const values = [
    actorType,
    actorId,
    ownerId,
    documentId,
    action,
    Boolean(success),
    sanitizeIpAddress(ipAddress),
    userAgent ? userAgent.substring(0, 500) : null,
    JSON.stringify(details || {}),
  ];

  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    // Log error to console without crashing the primary request flow
    console.error(`[AuditService Error] Failed to write audit event '${action}':`, error.message);
    return null;
  }
}

module.exports = {
  logEvent,
  sanitizeIpAddress,
};
