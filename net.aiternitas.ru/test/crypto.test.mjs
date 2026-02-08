import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createIdentity,
  identityFromSecretKey,
  userIdFromPublicKey,
  signMessage,
  verifyMessageSignature,
  encryptPayload,
  decryptPayload,
  signKeypairToBox,
  maxTtlForKeyAge,
  timeSlot,
} from '../shared/crypto.mjs';

describe('crypto', () => {
  it('createIdentity returns userId and box keys', async () => {
    const id = await createIdentity();
    assert.ok(id.userId && id.userId.length >= 32);
    assert.ok(Buffer.isBuffer(id.publicKey) && id.publicKey.length === 32);
    assert.ok(Buffer.isBuffer(id.boxPublicKey) && id.boxPublicKey.length >= 32);
    assert.ok(Buffer.isBuffer(id.boxSecretKey));
    assert.ok(typeof id.keyCreatedAt === 'number');
  });

  it('userIdFromPublicKey is deterministic', () => {
    const buf = Buffer.alloc(32, 1);
    const a = userIdFromPublicKey(buf);
    const b = userIdFromPublicKey(buf);
    assert.strictEqual(a, b);
    assert.ok(/^[0-9a-f]+$/.test(a));
  });

  it('sign and verify message', async () => {
    const id = await createIdentity();
    const msg = {
      message_id: 'a'.repeat(36),
      sender_id: id.userId,
      receiver_id: 'b'.repeat(64),
      encrypted_payload: 'e',
      created_at: 1,
      ttl_seconds: 3600,
      version: 1,
      sender_signature: '',
    };
    msg.sender_signature = await signMessage(msg, id.secretKey);
    const ok = await verifyMessageSignature(msg, id.publicKey);
    assert.strictEqual(ok, true);
  });

  it('encrypt and decrypt payload', async () => {
    const alice = await createIdentity();
    const bob = await createIdentity();
    const created_at = Math.floor(Date.now() / 1000);
    const messageId = 'c'.repeat(36);
    const enc = await encryptPayload(
      'secret',
      signKeypairToBox(alice).secretKey,
      signKeypairToBox(bob).publicKey,
      created_at,
      messageId
    );
    assert.ok(typeof enc === 'string' && enc.length > 0);
    const dec = await decryptPayload(
      enc,
      signKeypairToBox(bob).secretKey,
      signKeypairToBox(alice).publicKey,
      created_at,
      3600,
      messageId
    );
    assert.ok(dec && Buffer.from(dec).toString('utf8') === 'secret');
  });

  it('decrypt returns null after TTL', async () => {
    const alice = await createIdentity();
    const bob = await createIdentity();
    const created_at = Math.floor(Date.now() / 1000) - 7200;
    const messageId = 'd'.repeat(36);
    const enc = await encryptPayload(
      'secret',
      signKeypairToBox(alice).secretKey,
      signKeypairToBox(bob).publicKey,
      created_at,
      messageId
    );
    const dec = await decryptPayload(
      enc,
      signKeypairToBox(bob).secretKey,
      signKeypairToBox(alice).publicKey,
      created_at,
      3600,
      messageId
    );
    assert.strictEqual(dec, null);
  });

  it('maxTtlForKeyAge restricts new keys', () => {
    const now = Math.floor(Date.now() / 1000);
    const newKey = maxTtlForKeyAge(now - 100);
    const oldKey = maxTtlForKeyAge(now - 8 * 86400);
    assert.ok(newKey <= oldKey);
  });

  it('timeSlot increases with elapsed time', () => {
    const created = 1000;
    assert.strictEqual(timeSlot(created, 1000), 0);
    assert.ok(timeSlot(created, 1000 + 4000) >= 1);
  });
});
