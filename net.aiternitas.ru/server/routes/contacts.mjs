import { getDb } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';

export function list(req, res) {
  const db = getDb();
  const rows = db.prepare(
    'SELECT node_id, box_public_key, name FROM contacts WHERE user_id = ?'
  ).all(req.userId);
  res.json({ contacts: rows.map((r) => ({ nodeId: r.node_id, boxPublicKey: r.box_public_key, name: r.name || '' })) });
}

export function add(req, res) {
  const { nodeId, boxPublicKey, name } = req.body || {};
  if (!nodeId || !boxPublicKey) {
    res.status(400).json({ error: 'nodeId and boxPublicKey required' });
    return;
  }
  const db = getDb();
  try {
    db.prepare(
      'INSERT INTO contacts (user_id, node_id, box_public_key, name) VALUES (?, ?, ?, ?)'
    ).run(req.userId, nodeId, boxPublicKey, name || '');
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'Contact already exists' });
      return;
    }
    throw e;
  }
}

export function remove(req, res) {
  const { nodeId } = req.params;
  if (!nodeId) {
    res.status(400).json({ error: 'nodeId required' });
    return;
  }
  const db = getDb();
  const r = db.prepare('DELETE FROM contacts WHERE user_id = ? AND node_id = ?').run(req.userId, nodeId);
  res.json({ deleted: r.changes > 0 });
}
