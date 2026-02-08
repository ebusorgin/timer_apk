/**
 * Web auth: register (create identity + user), login (return JWT).
 */

import { getDb } from '../db.mjs';
import { encryptIdentity, decryptIdentity, hashPassword, verifyPassword } from '../auth-identity.mjs';
import { signToken } from '../middleware/auth.mjs';
import { setIdentity } from '../sessionStore.mjs';
import { createIdentity, identityFromSecretKey } from '../../shared/crypto.mjs';

export async function register(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password || username.length < 2 || password.length < 6) {
    res.status(400).json({ error: 'Username (min 2) and password (min 6) required' });
    return;
  }
  try {
    const identity = await createIdentity();
    const signSeed = Buffer.from(identity.secretKey).subarray(-32);
    const boxSecret = Buffer.from(identity.boxSecretKey).subarray(0, 32);
    const blob = Buffer.concat([signSeed, boxSecret]);
    const { encrypted, salt } = encryptIdentity(blob, password);
    const db = getDb();
    const st = db.prepare(
      'INSERT INTO users (username, password_hash, encrypted_identity, salt, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    st.run(username, hashPassword(password), encrypted, salt, Math.floor(Date.now() / 1000));
    const row = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    const token = signToken(row.id);
    setIdentity(token, identity);
    res.status(201).json({
      token,
      userId: identity.userId,
      boxPublicKey: Buffer.from(identity.boxPublicKey).toString('base64'),
    });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'Username taken' });
      return;
    }
    res.status(500).json({ error: 'Registration failed' });
  }
}

export async function login(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }
  const db = getDb();
  const row = db.prepare(
    'SELECT id, password_hash, encrypted_identity, salt FROM users WHERE username = ?'
  ).get(username);
  if (!row || !verifyPassword(password, row.password_hash)) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  const blob = decryptIdentity(row.encrypted_identity, row.salt, password);
  if (!blob) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  try {
    const identity = await identityFromSecretKey(blob);
    const token = signToken(row.id);
    setIdentity(token, identity);
    res.json({
      token,
      userId: identity.userId,
      boxPublicKey: Buffer.from(identity.boxPublicKey).toString('base64'),
    });
  } catch {
    res.status(401).json({ error: 'Invalid credentials' });
  }
}
