/**
 * Encrypt/decrypt identity blob with password (for web storage).
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const SALT_LEN = 16;
const IV_LEN = 12;
const KEY_LEN = 32;
const SCRYPT_N = 16384;

/**
 * @param {Buffer} identityBlob 64 bytes: sign seed (32) + box secret (32)
 * @param {string} password
 * @returns {{ encrypted: string, salt: string }} base64
 */
export function encryptIdentity(identityBlob, password) {
  const salt = crypto.randomBytes(SALT_LEN);
  const key = crypto.scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N });
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  const enc = Buffer.concat([cipher.update(identityBlob), cipher.final(), cipher.getAuthTag()]);
  return {
    encrypted: Buffer.concat([iv, enc]).toString('base64'),
    salt: salt.toString('base64'),
  };
}

/**
 * @param {string} encryptedBase64
 * @param {string} saltBase64
 * @param {string} password
 * @returns {Buffer | null} 64 bytes or null
 */
export function decryptIdentity(encryptedBase64, saltBase64, password) {
  try {
    const buf = Buffer.from(encryptedBase64, 'base64');
    const salt = Buffer.from(saltBase64, 'base64');
    const key = crypto.scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N });
    const iv = buf.subarray(0, IV_LEN);
    const ciphertext = buf.subarray(IV_LEN, -16);
    const tag = buf.subarray(-16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    return null;
  }
}

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}
