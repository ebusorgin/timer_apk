import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ContactStore } from '../shared/contacts.mjs';
import { createIdentity, signKeypairToBox } from '../shared/crypto.mjs';

describe('contacts', () => {
  it('add and get contact', async () => {
    const id = await createIdentity();
    const store = new ContactStore();
    store.add(id.userId, signKeypairToBox(id).publicKey, 'Alice');
    const c = store.get(id.userId);
    assert.ok(c);
    assert.strictEqual(c.nodeId, id.userId);
    assert.strictEqual(c.name, 'Alice');
    assert.ok(c.boxPublicKey instanceof Uint8Array);
  });

  it('getBoxPublicKey returns bytes', async () => {
    const id = await createIdentity();
    const store = new ContactStore();
    store.add(id.userId, signKeypairToBox(id).publicKey);
    const pk = store.getBoxPublicKey(id.userId);
    assert.ok(pk && pk.length >= 32);
  });

  it('list returns all contacts', async () => {
    const a = await createIdentity();
    const b = await createIdentity();
    const store = new ContactStore();
    store.add(a.userId, signKeypairToBox(a).publicKey, 'A');
    store.add(b.userId, signKeypairToBox(b).publicKey, 'B');
    const list = store.list();
    assert.strictEqual(list.length, 2);
  });

  it('update and remove', async () => {
    const id = await createIdentity();
    const store = new ContactStore();
    store.add(id.userId, signKeypairToBox(id).publicKey, 'Old');
    store.update(id.userId, { name: 'New' });
    assert.strictEqual(store.get(id.userId).name, 'New');
    store.remove(id.userId);
    assert.strictEqual(store.get(id.userId), undefined);
  });

  it('load restores from array', async () => {
    const id = await createIdentity();
    const store = new ContactStore();
    const contacts = [{ nodeId: id.userId, boxPublicKey: signKeypairToBox(id).publicKey, name: 'Loaded' }];
    store.load(contacts);
    assert.strictEqual(store.get(id.userId).name, 'Loaded');
  });
});
