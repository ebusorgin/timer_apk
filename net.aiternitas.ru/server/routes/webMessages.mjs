/**
 * Build message on server (identity from session). List = poll relay + decrypt.
 */

import { getDb } from '../db.mjs';
import { buildMessage } from '../../core/messageCore.mjs';
import { decryptPayload, signKeypairToBox } from '../../shared/crypto.mjs';

export async function build(req, res) {
  const { plaintext, receiverId, ttl_seconds } = req.body || {};
  if (!plaintext || !receiverId || !ttl_seconds) {
    res.status(400).json({ error: 'plaintext, receiverId, ttl_seconds required' });
    return;
  }
  const identity = req.identity;
  const db = getDb();
  const contact = db.prepare(
    'SELECT box_public_key FROM contacts WHERE user_id = ? AND node_id = ?'
  ).get(req.userId, receiverId);
  if (!contact) {
    res.status(400).json({ error: 'Contact not found' });
    return;
  }
  const boxPublicKey = Buffer.from(contact.box_public_key, 'base64');
  try {
    const msg = await buildMessage(
      plaintext,
      identity,
      receiverId,
      boxPublicKey,
      Number(ttl_seconds)
    );
    res.json(msg);
  } catch (e) {
    res.status(400).json({ error: e.message || 'Build failed' });
  }
}

/**
 * GET /api/messages — poll relay for receiver_id = identity.userId, decrypt with contacts' box keys.
 * @param {import('../store.mjs').RelayStore} store
 */
export function list(store) {
  return async (req, res) => {
    const identity = req.identity;
    const db = getDb();
    const raw = store.getForReceiver(identity.userId);
    const out = [];
    for (const msg of raw) {
      if (msg.version !== 1) continue;
      const contact = db.prepare(
        'SELECT box_public_key FROM contacts WHERE user_id = ? AND node_id = ?'
      ).get(req.userId, msg.sender_id);
      if (!contact) continue;
      const senderBoxPublic = Buffer.from(contact.box_public_key, 'base64');
      const boxKeys = signKeypairToBox(identity);
      const plain = await decryptPayload(
        msg.encrypted_payload,
        boxKeys.secretKey,
        senderBoxPublic,
        msg.created_at,
        msg.ttl_seconds,
        msg.message_id
      );
      if (plain) {
        out.push({
          message_id: msg.message_id,
          sender_id: msg.sender_id,
          created_at: msg.created_at,
          plaintext: Buffer.from(plain).toString('utf8'),
        });
      }
    }
    res.json({ messages: out });
  };
}
