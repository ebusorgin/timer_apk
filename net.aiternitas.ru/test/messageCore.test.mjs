import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildMessage, buildDeleteMessage, mergeByVersion } from '../core/messageCore.mjs';
import { createIdentity, signKeypairToBox } from '../shared/crypto.mjs';
import { MESSAGE_VERSION_ACTIVE, MESSAGE_VERSION_DEAD } from '../shared/constants.mjs';

describe('messageCore', () => {
  it('buildMessage produces valid ACTIVE message', async () => {
    const sender = await createIdentity();
    const receiver = await createIdentity();
    const msg = await buildMessage(
      'hello',
      sender,
      receiver.userId,
      signKeypairToBox(receiver).publicKey,
      3600
    );
    assert.strictEqual(msg.version, MESSAGE_VERSION_ACTIVE);
    assert.strictEqual(msg.sender_id, sender.userId);
    assert.strictEqual(msg.receiver_id, receiver.userId);
    assert.ok(msg.message_id && msg.sender_signature);
  });

  it('buildDeleteMessage produces DEAD version', async () => {
    const id = await createIdentity();
    const msg = await buildDeleteMessage(
      'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      id.userId,
      'f'.repeat(64),
      id.secretKey,
      1
    );
    assert.strictEqual(msg.version, MESSAGE_VERSION_DEAD);
  });

  it('mergeByVersion keeps higher version', () => {
    const a = { message_id: 'x', version: 1 };
    const b = { message_id: 'x', version: 2 };
    assert.strictEqual(mergeByVersion(a, b).version, 2);
    assert.strictEqual(mergeByVersion(b, a).version, 2);
  });
});
