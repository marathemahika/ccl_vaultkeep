const express = require('express');
const pool = require('../config/database');
const { authenticateOwner } = require('../middleware/auth');
const { logEvent } = require('../services/auditService');

const router = express.Router();

router.use(authenticateOwner);

/**
 * POST /api/nominees
 * Add a new nominee.
 */
router.post('/', async (req, res) => {
  const userId = req.user.id;
  const { full_name, email, relationship = null } = req.body;

  if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
    return res.status(400).json({ error: 'Nominee full name is required.' });
  }

  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const existing = await pool.query(
      `SELECT id FROM nominees WHERE owner_id = $1 AND lower(email) = $2`,
      [userId, normalizedEmail]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'You have already registered a nominee with this email address.' });
    }

    const insertResult = await pool.query(
      `INSERT INTO nominees (owner_id, full_name, email, relationship)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, email, relationship, created_at`,
      [userId, full_name.trim(), normalizedEmail, relationship ? relationship.trim() : null]
    );

    const nominee = insertResult.rows[0];

    await logEvent({
      actorType: 'owner',
      actorId: userId,
      ownerId: userId,
      action: 'nominee.create',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { nomineeId: nominee.id, email: nominee.email, fullName: nominee.full_name },
    });

    return res.status(201).json({
      message: 'Nominee added successfully.',
      nominee,
    });
  } catch (error) {
    console.error('Error creating nominee:', error);
    return res.status(500).json({ error: 'Failed to create nominee.' });
  }
});

/**
 * GET /api/nominees
 * List all nominees for the authenticated owner, along with assigned documents.
 */
router.get('/', async (req, res) => {
  const userId = req.user.id;

  try {
    const query = `
      SELECT n.id, n.full_name, n.email, n.relationship, n.created_at,
             n.notified_inactive_at, n.notified_released_at,
             COALESCE(
               json_agg(
                 json_build_object('id', d.id, 'title', d.title, 'category', d.category)
               ) FILTER (WHERE d.id IS NOT NULL),
               '[]'
             ) AS assigned_documents
      FROM nominees n
      LEFT JOIN document_releases dr ON n.id = dr.nominee_id AND dr.owner_id = n.owner_id
      LEFT JOIN documents d ON dr.document_id = d.id AND d.owner_id = n.owner_id AND d.deleted_at IS NULL
      WHERE n.owner_id = $1
      GROUP BY n.id
      ORDER BY n.created_at ASC;
    `;

    const result = await pool.query(query, [userId]);
    return res.json({ nominees: result.rows });
  } catch (error) {
    console.error('Error listing nominees:', error);
    return res.status(500).json({ error: 'Failed to retrieve nominees.' });
  }
});

/**
 * PUT /api/nominees/:id
 * Update nominee info.
 */
router.put('/:id', async (req, res) => {
  const userId = req.user.id;
  const nomineeId = req.params.id;
  const { full_name, email, relationship } = req.body;

  if (!full_name && !email && relationship === undefined) {
    return res.status(400).json({ error: 'Provide at least one field to update.' });
  }

  try {
    const updates = [];
    const values = [nomineeId, userId];
    let paramIdx = 3;

    if (full_name) {
      updates.push(`full_name = $${paramIdx++}`);
      values.push(full_name.trim());
    }

    if (email) {
      updates.push(`email = $${paramIdx++}`);
      values.push(email.trim().toLowerCase());
    }

    if (relationship !== undefined) {
      updates.push(`relationship = $${paramIdx++}`);
      values.push(relationship ? relationship.trim() : null);
    }

    const query = `
      UPDATE nominees
      SET ${updates.join(', ')}
      WHERE id = $1 AND owner_id = $2
      RETURNING id, full_name, email, relationship, updated_at;
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Nominee not found.' });
    }

    await logEvent({
      actorType: 'owner',
      actorId: userId,
      ownerId: userId,
      action: 'nominee.update',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: result.rows[0],
    });

    return res.json({ message: 'Nominee updated.', nominee: result.rows[0] });
  } catch (error) {
    console.error('Error updating nominee:', error);
    return res.status(500).json({ error: 'Failed to update nominee.' });
  }
});

/**
 * DELETE /api/nominees/:id
 * Remove a nominee and all associated document releases.
 */
router.delete('/:id', async (req, res) => {
  const userId = req.user.id;
  const nomineeId = req.params.id;

  try {
    const result = await pool.query(
      `DELETE FROM nominees WHERE id = $1 AND owner_id = $2 RETURNING id, full_name, email`,
      [nomineeId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Nominee not found.' });
    }

    await logEvent({
      actorType: 'owner',
      actorId: userId,
      ownerId: userId,
      action: 'nominee.delete',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: result.rows[0],
    });

    return res.json({ message: 'Nominee removed.' });
  } catch (error) {
    console.error('Error deleting nominee:', error);
    return res.status(500).json({ error: 'Failed to delete nominee.' });
  }
});

/**
 * POST /api/nominees/:id/releases
 * Assign a set of documents released to this nominee.
 * Body: { document_ids: string[] }
 */
router.post('/:id/releases', async (req, res) => {
  const userId = req.user.id;
  const nomineeId = req.params.id;
  const { document_ids } = req.body;

  if (!Array.isArray(document_ids)) {
    return res.status(400).json({ error: 'document_ids must be an array of UUIDs.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Verify nominee exists and belongs to owner
    const nomCheck = await client.query(
      `SELECT id, full_name FROM nominees WHERE id = $1 AND owner_id = $2`,
      [nomineeId, userId]
    );
    if (nomCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Nominee not found.' });
    }

    // 2. Clear existing document releases for this nominee
    await client.query(
      `DELETE FROM document_releases WHERE nominee_id = $1 AND owner_id = $2`,
      [nomineeId, userId]
    );

    // 3. Insert newly assigned releases
    if (document_ids.length > 0) {
      // Verify all document_ids belong to this owner and are not deleted
      const docCheck = await client.query(
        `SELECT id FROM documents WHERE owner_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL`,
        [userId, document_ids]
      );

      if (docCheck.rows.length !== document_ids.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'One or more document IDs are invalid, deleted, or do not belong to you.',
        });
      }

      for (const docId of document_ids) {
        await client.query(
          `INSERT INTO document_releases (document_id, nominee_id, owner_id)
           VALUES ($1, $2, $3)`,
          [docId, nomineeId, userId]
        );
      }
    }

    await client.query('COMMIT');

    await logEvent({
      actorType: 'owner',
      actorId: userId,
      ownerId: userId,
      action: 'nominee.releases_updated',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { nomineeId, assignedCount: document_ids.length },
    });

    return res.json({
      message: `Updated releases for nominee. Assigned ${document_ids.length} document(s).`,
      assignedDocumentIds: document_ids,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error assigning document releases:', error);
    return res.status(500).json({ error: 'Failed to assign document releases.' });
  } finally {
    client.release();
  }
});

module.exports = router;
