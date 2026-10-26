const express = require('express');
const crypto = require('crypto');
const pool = require('../config/database');
const { authenticateOwner } = require('../middleware/auth');
const upload = require('../middleware/upload');
const {
  zeroBuffer,
  generateEnvelopeKey,
  decryptEnvelopeKey,
  encryptDocument,
  decryptDocument,
} = require('../services/cryptoService');
const { uploadToS3, downloadFromS3, deleteFromS3 } = require('../services/storageService');
const { logEvent } = require('../services/auditService');

const router = express.Router();

const VALID_CATEGORIES = ['property', 'insurance', 'will', 'financial', 'identity', 'other'];

// All document owner endpoints require vault owner authentication
router.use(authenticateOwner);

/**
 * POST /api/documents/upload
 * Envelope-encrypts an uploaded document in memory, stores ciphertext in S3,
 * and saves encryption metadata in PostgreSQL.
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  const userId = req.user.id;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const { title, category = 'other' } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Document title is required.' });
  }

  const normalizedCategory = category.toLowerCase().trim();
  if (!VALID_CATEGORIES.includes(normalizedCategory)) {
    return res.status(400).json({
      error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
    });
  }

  let plaintextKey = null;

  try {
    const documentId = crypto.randomUUID();

    // 1. Generate unique per-file envelope key via AWS KMS (or mock)
    const envelope = await generateEnvelopeKey();
    plaintextKey = envelope.plaintextKey;

    // 2. Encrypt document bytes using AES-256-GCM
    const { ciphertext, iv, authTag, sha256Hex } = encryptDocument(file.buffer, plaintextKey);

    // 3. Immediately zero out the plaintext key in memory
    zeroBuffer(plaintextKey);
    plaintextKey = null;

    // 4. Construct S3 storage key
    const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const s3Key = `users/${userId}/documents/${documentId}/${sanitizedFilename}.enc`;

    // 5. Upload encrypted ciphertext to S3 (or mock storage)
    const { bucket } = await uploadToS3(s3Key, ciphertext, 'application/octet-stream');

    // 6. Insert metadata and envelope encryption keys into PostgreSQL
    const query = `
      INSERT INTO documents (
        id,
        owner_id,
        title,
        category,
        original_filename,
        content_type,
        size_bytes,
        sha256_hex,
        s3_bucket,
        s3_key,
        encrypted_data_key,
        iv,
        auth_tag,
        kms_key_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id, title, category, original_filename, content_type, size_bytes, sha256_hex, created_at;
    `;

    const values = [
      documentId,
      userId,
      title.trim(),
      normalizedCategory,
      file.originalname,
      file.mimetype || 'application/octet-stream',
      file.size,
      sha256Hex,
      bucket,
      s3Key,
      envelope.encryptedDataKey,
      iv,
      authTag,
      envelope.kmsKeyId,
    ];

    const result = await pool.query(query, values);
    const newDoc = result.rows[0];

    // 7. Audit log the upload
    await logEvent({
      actorType: 'owner',
      actorId: userId,
      ownerId: userId,
      documentId: newDoc.id,
      action: 'document.upload',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        title: newDoc.title,
        category: newDoc.category,
        filename: newDoc.original_filename,
        sizeBytes: newDoc.size_bytes,
      },
    });

    return res.status(201).json({
      message: 'Document encrypted and stored securely.',
      document: {
        id: newDoc.id,
        title: newDoc.title,
        category: newDoc.category,
        originalFilename: newDoc.original_filename,
        contentType: newDoc.content_type,
        sizeBytes: newDoc.size_bytes,
        sha256: newDoc.sha256_hex,
        createdAt: newDoc.created_at,
      },
    });
  } catch (error) {
    if (plaintextKey) zeroBuffer(plaintextKey);
    console.error('Error uploading document:', error);
    return res.status(500).json({ error: 'Failed to encrypt and store document.' });
  }
});

/**
 * GET /api/documents
 * List all active documents for the logged-in owner, with assigned nominees.
 */
router.get('/', async (req, res) => {
  const userId = req.user.id;

  try {
    const query = `
      SELECT d.id, d.title, d.category, d.original_filename, d.content_type, d.size_bytes,
             d.sha256_hex, d.created_at, d.updated_at,
             COALESCE(
               json_agg(
                 json_build_object('id', n.id, 'fullName', n.full_name, 'email', n.email)
               ) FILTER (WHERE n.id IS NOT NULL),
               '[]'
             ) AS assigned_nominees
      FROM documents d
      LEFT JOIN document_releases dr ON d.id = dr.document_id AND dr.owner_id = d.owner_id
      LEFT JOIN nominees n ON dr.nominee_id = n.id AND n.owner_id = d.owner_id
      WHERE d.owner_id = $1 AND d.deleted_at IS NULL
      GROUP BY d.id
      ORDER BY d.created_at DESC;
    `;

    const result = await pool.query(query, [userId]);
    return res.json({ documents: result.rows });
  } catch (error) {
    console.error('Error listing documents:', error);
    return res.status(500).json({ error: 'Failed to retrieve documents.' });
  }
});

/**
 * GET /api/documents/:id
 * Retrieve details of a specific document.
 */
router.get('/:id', async (req, res) => {
  const userId = req.user.id;
  const docId = req.params.id;

  try {
    const query = `
      SELECT d.id, d.title, d.category, d.original_filename, d.content_type, d.size_bytes,
             d.sha256_hex, d.created_at,
             COALESCE(
               json_agg(
                 json_build_object('id', n.id, 'fullName', n.full_name, 'email', n.email)
               ) FILTER (WHERE n.id IS NOT NULL),
               '[]'
             ) AS assigned_nominees
      FROM documents d
      LEFT JOIN document_releases dr ON d.id = dr.document_id AND dr.owner_id = d.owner_id
      LEFT JOIN nominees n ON dr.nominee_id = n.id AND n.owner_id = d.owner_id
      WHERE d.id = $1 AND d.owner_id = $2 AND d.deleted_at IS NULL
      GROUP BY d.id;
    `;

    const result = await pool.query(query, [docId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    return res.json({ document: result.rows[0] });
  } catch (error) {
    console.error('Error retrieving document details:', error);
    return res.status(500).json({ error: 'Failed to retrieve document details.' });
  }
});

/**
 * GET /api/documents/:id/download
 * Fetches encrypted document from S3, recovers key via KMS, decrypts, and streams file.
 */
router.get('/:id/download', async (req, res) => {
  const userId = req.user.id;
  const docId = req.params.id;
  let plaintextKey = null;

  try {
    // 1. Fetch document cryptographic metadata from database
    const docResult = await pool.query(
      `SELECT id, title, original_filename, content_type, sha256_hex,
              s3_key, encrypted_data_key, iv, auth_tag, kms_key_id
       FROM documents
       WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
      [docId, userId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const doc = docResult.rows[0];

    // 2. Download encrypted ciphertext from S3
    const ciphertext = await downloadFromS3(doc.s3_key);

    // 3. Decrypt the envelope key via AWS KMS
    plaintextKey = await decryptEnvelopeKey(doc.encrypted_data_key, doc.kms_key_id);

    // 4. Decrypt document bytes and verify SHA-256 integrity
    const decryptedBuffer = decryptDocument(
      ciphertext,
      plaintextKey,
      doc.iv,
      doc.auth_tag,
      doc.sha256_hex
    );

    // 5. Zero out plaintext key in memory
    zeroBuffer(plaintextKey);
    plaintextKey = null;

    // 6. Audit log the download
    await logEvent({
      actorType: 'owner',
      actorId: userId,
      ownerId: userId,
      documentId: doc.id,
      action: 'document.download',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { filename: doc.original_filename },
    });

    // 7. Send file to client
    res.setHeader('Content-Type', doc.content_type);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(doc.original_filename)}"`
    );
    res.setHeader('Content-Length', decryptedBuffer.length);
    return res.send(decryptedBuffer);
  } catch (error) {
    if (plaintextKey) zeroBuffer(plaintextKey);
    console.error('Error downloading document:', error);
    return res.status(500).json({ error: 'Failed to decrypt and download document.' });
  }
});

/**
 * DELETE /api/documents/:id
 * Soft deletes document and removes its nominee release assignments.
 */
router.delete('/:id', async (req, res) => {
  const userId = req.user.id;
  const docId = req.params.id;

  try {
    const docResult = await pool.query(
      `UPDATE documents
       SET deleted_at = now()
       WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL
       RETURNING id, title, original_filename`,
      [docId, userId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found or already deleted.' });
    }

    const doc = docResult.rows[0];

    // Remove any active release assignments
    await pool.query(
      `DELETE FROM document_releases WHERE document_id = $1 AND owner_id = $2`,
      [docId, userId]
    );

    // Audit log
    await logEvent({
      actorType: 'owner',
      actorId: userId,
      ownerId: userId,
      documentId: doc.id,
      action: 'document.delete',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { title: doc.title, filename: doc.original_filename },
    });

    return res.json({ message: 'Document removed from vault.' });
  } catch (error) {
    console.error('Error deleting document:', error);
    return res.status(500).json({ error: 'Failed to delete document.' });
  }
});

module.exports = router;
