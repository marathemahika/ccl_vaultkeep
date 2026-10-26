const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { generateNomineeToken, authenticateNominee } = require('../middleware/auth');
const {
  zeroBuffer,
  decryptEnvelopeKey,
  decryptDocument,
} = require('../services/cryptoService');
const { downloadFromS3 } = require('../services/storageService');
const { logEvent } = require('../services/auditService');

const router = express.Router();

/**
 * POST /api/nominee-portal/verify-code
 * Nominee claims their one-time access code to unlock documents.
 * Access is only permitted if the vault owner's account status is 'released'.
 */
router.post('/verify-code', async (req, res) => {
  const { email, access_code } = req.body;

  if (!email || !access_code) {
    return res.status(400).json({ error: 'Email and access_code are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const rawCode = access_code.trim();

  try {
    // 1. Find nominee record with an active access code
    const nomineeResult = await pool.query(
      `SELECT n.id, n.owner_id, n.full_name, n.email, n.access_code_hash,
              n.access_code_expires_at, n.access_code_used_at,
              u.status AS owner_status, u.full_name AS owner_name
       FROM nominees n
       JOIN users u ON n.owner_id = u.id
       WHERE lower(n.email) = $1
       ORDER BY n.created_at DESC
       LIMIT 1`,
      [normalizedEmail]
    );

    if (nomineeResult.rows.length === 0) {
      await logEvent({
        actorType: 'nominee',
        action: 'nominee.verify_code.failed',
        success: false,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: { reason: 'Nominee email not found', email: normalizedEmail },
      });
      return res.status(401).json({ error: 'Invalid email or access code.' });
    }

    const nominee = nomineeResult.rows[0];

    // 2. Enforce legacy release requirement: access is granted only after grace period expires
    if (nominee.owner_status !== 'released') {
      return res.status(403).json({
        error:
          nominee.owner_status === 'inactive'
            ? 'The account owner is currently overdue, but the grace period is still running. Access is not released yet.'
            : 'Vault owner account is active. Access is not released.',
      });
    }

    if (!nominee.access_code_hash) {
      return res.status(401).json({ error: 'No active access code found for this nominee.' });
    }

    // 3. Verify code hash
    const match = await bcrypt.compare(rawCode, nominee.access_code_hash);
    if (!match) {
      await logEvent({
        actorType: 'nominee',
        actorId: nominee.id,
        ownerId: nominee.owner_id,
        action: 'nominee.verify_code.failed',
        success: false,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: { reason: 'Code hash mismatch' },
      });
      return res.status(401).json({ error: 'Invalid access code.' });
    }

    // 4. Atomic compare-and-set: consume the code to prevent replay attacks
    const consumeResult = await pool.query(
      `UPDATE nominees
       SET access_code_used_at = now(),
           access_code_hash = NULL
       WHERE id = $1
         AND access_code_used_at IS NULL
         AND access_code_expires_at > now()
       RETURNING id, owner_id, full_name, email`,
      [nominee.id]
    );

    if (consumeResult.rows.length === 0) {
      return res.status(401).json({
        error: 'Access code has expired or has already been used.',
      });
    }

    // 5. Issue scoped Nominee JWT
    const token = generateNomineeToken({
      id: nominee.id,
      owner_id: nominee.owner_id,
      email: nominee.email,
      full_name: nominee.full_name,
    });

    await logEvent({
      actorType: 'nominee',
      actorId: nominee.id,
      ownerId: nominee.owner_id,
      action: 'nominee.access_claimed',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { nomineeEmail: nominee.email },
    });

    return res.json({
      message: 'Access granted. Welcome to VaultKeep Nominee Portal.',
      token,
      nominee: {
        id: nominee.id,
        fullName: nominee.full_name,
        email: nominee.email,
        vaultOwner: nominee.owner_name,
      },
    });
  } catch (error) {
    console.error('Error verifying nominee code:', error);
    return res.status(500).json({ error: 'Internal server error verifying access code.' });
  }
});

/**
 * GET /api/nominee-portal/documents
 * List all documents specifically released to the authenticated nominee.
 */
router.get('/documents', authenticateNominee, async (req, res) => {
  const { id: nomineeId, ownerId } = req.nominee;

  try {
    const query = `
      SELECT d.id, d.title, d.category, d.original_filename, d.content_type, d.size_bytes, d.created_at
      FROM documents d
      JOIN document_releases dr ON d.id = dr.document_id AND dr.owner_id = d.owner_id
      WHERE dr.nominee_id = $1 AND dr.owner_id = $2 AND d.deleted_at IS NULL
      ORDER BY d.created_at DESC;
    `;

    const result = await pool.query(query, [nomineeId, ownerId]);
    return res.json({ releasedDocuments: result.rows });
  } catch (error) {
    console.error('Error listing nominee documents:', error);
    return res.status(500).json({ error: 'Failed to retrieve released documents.' });
  }
});

/**
 * GET /api/nominee-portal/documents/:id/download
 * Decrypts and streams a released document to the verified nominee.
 */
router.get('/documents/:id/download', authenticateNominee, async (req, res) => {
  const { id: nomineeId, ownerId } = req.nominee;
  const docId = req.params.id;
  let plaintextKey = null;

  try {
    // 1. Verify this document is authorized for this nominee
    const query = `
      SELECT d.id, d.title, d.original_filename, d.content_type, d.sha256_hex,
             d.s3_key, d.encrypted_data_key, d.iv, d.auth_tag, d.kms_key_id
      FROM documents d
      JOIN document_releases dr ON d.id = dr.document_id AND dr.owner_id = d.owner_id
      WHERE d.id = $1 AND dr.nominee_id = $2 AND dr.owner_id = $3 AND d.deleted_at IS NULL;
    `;

    const docResult = await pool.query(query, [docId, nomineeId, ownerId]);

    if (docResult.rows.length === 0) {
      return res.status(403).json({
        error: 'You are not authorized to access this document, or it has been removed.',
      });
    }

    const doc = docResult.rows[0];

    // 2. Fetch ciphertext from S3
    const ciphertext = await downloadFromS3(doc.s3_key);

    // 3. KMS Decrypt
    plaintextKey = await decryptEnvelopeKey(doc.encrypted_data_key, doc.kms_key_id);

    // 4. Decrypt AES-256-GCM and verify integrity
    const decryptedBuffer = decryptDocument(
      ciphertext,
      plaintextKey,
      doc.iv,
      doc.auth_tag,
      doc.sha256_hex
    );

    // 5. Zero out key
    zeroBuffer(plaintextKey);
    plaintextKey = null;

    // 6. Audit log
    await logEvent({
      actorType: 'nominee',
      actorId: nomineeId,
      ownerId,
      documentId: doc.id,
      action: 'nominee.document.download',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { filename: doc.original_filename },
    });

    // 7. Stream file
    res.setHeader('Content-Type', doc.content_type);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(doc.original_filename)}"`
    );
    res.setHeader('Content-Length', decryptedBuffer.length);
    return res.send(decryptedBuffer);
  } catch (error) {
    if (plaintextKey) zeroBuffer(plaintextKey);
    console.error('Error downloading nominee document:', error);
    return res.status(500).json({ error: 'Failed to decrypt document.' });
  }
});

module.exports = router;
