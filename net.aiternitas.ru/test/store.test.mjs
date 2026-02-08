import { describe, it } from 'node:test';
import assert from 'node:assert';
import { RelayStore } from '../server/store.mjs';
import { buildMessage } from '../core/messageCore.mjs';
import { createIdentity, signKeypairToBox } from '../shared/crypto.mjs';

describe('RelayStore', () => {
  it('put and getForReceiver', async () => {
    const sender = await createIdentity();
    const receiver = await createIdentity();
    const msg = await buildMessage(
      'test',
      sender,
      receiver.userId,
      signKeypairToBox(receiver).publicKey,
      3600
    );
    const store = new RelayStore({ maxMessages: 1000 });
    const r = store.put(msg);
    assert.strictEqual(r.ok, true);
    const list = store.getForReceiver(receiver.userId);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].message_id, msg.message_id);
  });

  it('rejects invalid message', () => {
    const store = new RelayStore();
    const r = store.put({ message_id: 'not-uuid', sender_id: 'a', receiver_id: 'b' });
    assert.strictEqual(r.ok, false);
  });
});
