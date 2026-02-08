/**
 * Crypto layer — identity, signing, time-based encryption.
 * Node.js crypto only (Ed25519 + P-256 ECDH). Private keys never leave the device.
 */

import crypto from 'crypto';
import { messageCanonicalBytes } from './messageSchema.mjs';
import {
  SLOT_SIZE_SECONDS,
  MAX_TTL_NEW_KEY_SECONDS,
  KEY_AGE_FULL_TTL_SECONDS,
  MAX_TTL_ABSOLUTE_SECONDS,
} from './constants.mjs';

const ED25519_PKCS8_PREFIX = Buffer.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);

/**
 * Compute UserID = H(public_key). SHA-256, hex.
 * @param {Buffer | Uint8Array} publicKey
 * @returns {string}
 */
export function userIdFromPublicKey(publicKey) {
  return crypto.createHash('sha256').update(publicKey).digest('hex');
}

function ed25519PkFromSeed(seed) {
  const der = Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(seed)]);
  const priv = crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  const pub = crypto.createPublicKey(priv);
  return Buffer.from(pub.export({ type: 'spki', format: 'der' }).subarray(-32));
}

const ECDH_CURVE = 'prime256v1';

function ecdhPkFromSecret(secret) {
  const ecdh = crypto.createECDH(ECDH_CURVE);
  ecdh.setPrivateKey(Buffer.from(secret).subarray(0, 32));
  return ecdh.getPublicKey();
}

/**
 * Generate new identity: Ed25519 (sign, user_id) + P-256 (box/ECDH). key_created_at = now.
 * Returns: publicKey/secretKey = Ed25519; boxPublicKey/boxSecretKey = P-256 raw.
 */
export async function createIdentity() {
  const signSeed = crypto.randomBytes(32);
  const ecdh = crypto.createECDH(ECDH_CURVE);
  ecdh.generateKeys();
  const boxSecret = ecdh.getPrivateKey();
  const boxPk = ecdh.getPublicKey();
  const signPk = ed25519PkFromSeed(signSeed);
  const signSkDer = Buffer.concat([ED25519_PKCS8_PREFIX, signSeed]);
  const userId = userIdFromPublicKey(signPk);
  return {
    publicKey: signPk,
    secretKey: signSkDer,
    boxPublicKey: boxPk,
    boxSecretKey: boxSecret,
    userId,
    keyCreatedAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * Restore identity. secretKeyBlob = signSecretKey (32 bytes Ed25519 seed) + boxSecretKey (32 bytes).
 * @param {Buffer | Uint8Array} secretKeyBlob 64 bytes: sign seed (32) + box secret (32)
 * @param {number} [keyCreatedAt]
 */
export async function identityFromSecretKey(secretKeyBlob, keyCreatedAt) {
  const buf = Buffer.from(secretKeyBlob);
  if (buf.length < 64) throw new Error('secretKeyBlob must be at least 64 bytes (sign seed + box secret)');
  const signSeed = buf.subarray(0, 32);
  const boxSecret = buf.subarray(32, 64);
  const signPk = ed25519PkFromSeed(signSeed);
  const boxPk = ecdhPkFromSecret(boxSecret);
  const signSkDer = Buffer.concat([ED25519_PKCS8_PREFIX, signSeed]);
  const userId = userIdFromPublicKey(signPk);
  return {
    publicKey: signPk,
    secretKey: signSkDer,
    boxPublicKey: boxPk,
    boxSecretKey: boxSecret,
    userId,
    keyCreatedAt: keyCreatedAt ?? Math.floor(Date.now() / 1000),
  };
}

export function maxTtlForKeyAge(keyCreatedAt, now = Math.floor(Date.now() / 1000)) {
  const age = now - keyCreatedAt;
  if (age < 86400) return Math.min(MAX_TTL_NEW_KEY_SECONDS, MAX_TTL_ABSOLUTE_SECONDS);
  if (age < KEY_AGE_FULL_TTL_SECONDS) {
    const scale = age / KEY_AGE_FULL_TTL_SECONDS;
    return Math.min(Math.floor(MAX_TTL_ABSOLUTE_SECONDS * scale), MAX_TTL_ABSOLUTE_SECONDS);
  }
  return MAX_TTL_ABSOLUTE_SECONDS;
}

/**
 * Sign message (all fields except signature). Ed25519. Returns base64.
 */
export async function signMessage(msg, signSecretKey) {
  const der = Buffer.isBuffer(signSecretKey) && signSecretKey.length === 48
    ? signSecretKey
    : Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(signSecretKey).subarray(0, 32)]);
  const priv = crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  const bytes = messageCanonicalBytes(msg);
  const sig = crypto.sign(null, bytes, priv);
  return sig.toString('base64');
}

/**
 * Verify message signature. senderSignPublicKey = Ed25519 public (32 bytes).
 */
export async function verifyMessageSignature(msg, senderSignPublicKey) {
  const pk = Buffer.from(senderSignPublicKey).subarray(-32);
  const pub = crypto.createPublicKey({
    key: Buffer.concat([Buffer.from([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00]), pk]),
    format: 'der',
    type: 'spki',
  });
  const bytes = messageCanonicalBytes(msg);
  const sig = Buffer.from(msg.sender_signature, 'base64');
  return crypto.verify(null, bytes, pub, sig);
}

export function timeSlot(created_at, now = Math.floor(Date.now() / 1000)) {
  const elapsed = Math.max(0, now - created_at);
  return Math.floor(elapsed / SLOT_SIZE_SECONDS);
}

export function deriveTimeSlotKey(baseKey, timeSlotValue) {
  const info = Buffer.from(`net.aiternitas.time_slot.${timeSlotValue}`, 'utf8');
  return crypto.hkdfSync('sha256', Buffer.from(baseKey), Buffer.alloc(0), info, 32);
}

/**
 * Encrypt payload: ECDH (P-256) + HKDF time slot + ChaCha20-Poly1305.
 * encrypted_payload = base64(nonce(12) + ciphertext + tag(16)). Nonce derived from message_id.
 */
export async function encryptPayload(plaintext, senderBoxSecret, receiverBoxPublic, created_at, messageId) {
  const ecdh = crypto.createECDH(ECDH_CURVE);
  ecdh.setPrivateKey(Buffer.from(senderBoxSecret).subarray(0, 32));
  const shared = ecdh.computeSecret(Buffer.from(receiverBoxPublic));
  const slot = timeSlot(created_at, created_at);
  const derivedKey = deriveTimeSlotKey(shared, slot);
  const nonce = crypto.createHash('sha256').update(`net.aiternitas.nonce.${messageId}`).digest().subarray(0, 12);
  const cipher = crypto.createCipheriv('chacha20-poly1305', derivedKey, nonce, { authTagLength: 16 });
  const pt = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : Buffer.from(plaintext);
  const ciphertext = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  const enc = Buffer.concat([nonce, ciphertext, tag]);
  return enc.toString('base64');
}

/**
 * Decrypt payload. If (now - created_at) > ttl_seconds, returns null.
 * Expects encrypted_payload = base64(nonce(12) + ciphertext + tag(16)).
 */
export async function decryptPayload(encryptedBase64, receiverBoxSecret, senderBoxPublic, created_at, ttl_seconds, messageId) {
  const now = Math.floor(Date.now() / 1000);
  if ((now - created_at) > ttl_seconds) return null;
  const ecdh = crypto.createECDH(ECDH_CURVE);
  ecdh.setPrivateKey(Buffer.from(receiverBoxSecret).subarray(0, 32));
  const shared = ecdh.computeSecret(Buffer.from(senderBoxPublic));
  const slot = timeSlot(created_at, now);
  const derivedKey = deriveTimeSlotKey(shared, slot);
  const enc = Buffer.from(encryptedBase64, 'base64');
  if (enc.length < 12 + 16) return null;
  const nonce = enc.subarray(0, 12);
  const tag = enc.subarray(-16);
  const ciphertext = enc.subarray(12, -16);
  try {
    const decipher = crypto.createDecipheriv('chacha20-poly1305', derivedKey, nonce, { authTagLength: 16 });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    return null;
  }
}

/**
 * Return box keys from identity (identity holds both Ed25519 and X25519).
 * @param {{ boxPublicKey: Buffer, boxSecretKey: Buffer }} identity
 * @returns {{ publicKey: Buffer, secretKey: Buffer }}
 */
export function signKeypairToBox(identity) {
  if (identity.boxPublicKey != null && identity.boxSecretKey != null) {
    return { publicKey: identity.boxPublicKey, secretKey: identity.boxSecretKey };
  }
  return { publicKey: identity.publicKey, secretKey: identity.secretKey };
}
