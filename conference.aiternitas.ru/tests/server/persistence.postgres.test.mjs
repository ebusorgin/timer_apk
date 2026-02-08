import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import { createPersistence } from '../../server/persistence/index.mjs';
import createPostgresAdapter from '../../server/persistence/postgresAdapter.mjs';

const createLoggerStub = () => ({
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
});

describe('PostgreSQL persistence adapter (new schema)', () => {
  let db;
  let pool;
  let persistence;

  beforeEach(() => {
    db = newDb();
    const pg = db.adapters.createPg();
    pool = new pg.Pool();

    persistence = createPersistence(
      {},
      {
        driver: 'postgres',
        poolInstance: pool,
        logger: createLoggerStub(),
      },
    );
  });

  afterEach(async () => {
    await pool.end();
  });

  it('insertSubscriber creates subscriber with auto-increment id', async () => {
    const sub = await persistence.insertSubscriber({
      login: 'alice',
      name: 'Alice',
      passwordHash: 'hash1',
    });
    expect(sub.id).toBeDefined();
    expect(Number(sub.id)).toBeGreaterThan(0);
    expect(sub.name).toBe('Alice');
    expect(sub.login).toBe('alice');
  });

  it('getSubscriberByLogin finds subscriber', async () => {
    await persistence.insertSubscriber({
      login: 'bob',
      name: 'Bob',
      passwordHash: 'hash2',
    });
    const found = await persistence.getSubscriberById((await persistence.listSubscribers())[0].id);
    expect(found).not.toBeNull();
    expect(found.name).toBe('Bob');

    const byLogin = await persistence.getSubscriberByLogin('bob');
    expect(byLogin).not.toBeNull();
    expect(byLogin.name).toBe('Bob');
  });

  it('upsertSubscriber updates by id', async () => {
    const created = await persistence.insertSubscriber({
      login: 'carol',
      name: 'Carol',
      passwordHash: 'hash3',
    });
    const id = created.id;

    const updated = await persistence.upsertSubscriber({
      id,
      name: 'Carol Updated',
    });
    expect(updated.name).toBe('Carol Updated');
    expect(updated.id).toBe(id);

    const found = await persistence.getSubscriberById(id);
    expect(found.name).toBe('Carol Updated');
  });

  it('isAdmin returns true for admin role', async () => {
    const admin = await persistence.insertSubscriber({
      login: 'admin',
      name: 'Admin',
      passwordHash: 'hash',
      role: 'admin',
    });
    const ok = await persistence.isAdmin(admin.id);
    expect(ok).toBe(true);

    const user = await persistence.insertSubscriber({
      login: 'user1',
      name: 'User',
      passwordHash: 'hash',
    });
    const notAdmin = await persistence.isAdmin(user.id);
    expect(notAdmin).toBe(false);
  });

  it('createCall and listPendingCalls work with numeric ids', async () => {
    const alice = await persistence.insertSubscriber({ login: 'caller', name: 'Caller', passwordHash: 'x' });
    const bob = await persistence.insertSubscriber({ login: 'callee', name: 'Callee', passwordHash: 'x' });

    const call = await persistence.createCall({
      id: 'call-test-' + Date.now(),
      from: { id: alice.id, name: alice.name },
      to: { id: bob.id, name: bob.name },
      status: 'pending',
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(call).not.toBeNull();
    expect(call.status).toBe('pending');

    const pending = await persistence.listPendingCalls(bob.id);
    expect(pending).toHaveLength(1);

    await persistence.updateCallStatus(call.id, 'accepted');
    const after = await persistence.listPendingCalls(bob.id);
    expect(after).toHaveLength(0);
  });

  it('contacts, messages, contact_requests work with numeric ids', async () => {
    const a = await persistence.insertSubscriber({ login: 'ct1', name: 'A', passwordHash: 'x' });
    const b = await persistence.insertSubscriber({ login: 'ct2', name: 'B', passwordHash: 'x' });

    await persistence.addContact(a.id, b.id);
    const contacts = await persistence.listContacts(a.id);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].contactId).toBe(b.id);

    await persistence.insertMessage({
      id: 'msg-' + Date.now(),
      fromId: a.id,
      toId: b.id,
      body: 'Hello',
      createdAt: Date.now(),
    });
    const msgs = await persistence.listMessages(a.id, b.id);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].body).toBe('Hello');

    const req = await persistence.createContactRequest({
      fromId: a.id,
      fromName: 'A',
      toId: b.id,
      toName: 'B',
      status: 'pending',
      createdAt: Date.now(),
    });
    expect(req).not.toBeNull();
    const requests = await persistence.listContactRequests(b.id);
    expect(requests).toHaveLength(1);
  });
});
