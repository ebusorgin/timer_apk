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

describe('PostgreSQL persistence adapter', () => {
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

  it('writes and reads subscribers preserving timestamps', async () => {
    const subscribers = [
      { id: 'a', name: 'Alice', createdAt: 1_000, updatedAt: 1_500 },
      { id: 'b', name: 'Bob', createdAt: 2_000, updatedAt: 2_500 },
    ];

    await persistence.writeSubscribers(subscribers);
    const stored = await persistence.readSubscribers();

    expect(stored).toEqual(subscribers);
  });

  it('sorts subscribers by name when stored in mixed order', async () => {
    await persistence.writeSubscribers([
      { id: 'b', name: 'Борис', createdAt: 20, updatedAt: 21 },
      { id: 'a', name: 'Алексей', createdAt: 10, updatedAt: 15 },
    ]);

    const stored = await persistence.readSubscribers();
    expect(stored).toEqual([
      { id: 'a', name: 'Алексей', createdAt: 10, updatedAt: 15 },
      { id: 'b', name: 'Борис', createdAt: 20, updatedAt: 21 },
    ]);
  });

  it('writes and reads users independent from subscribers', async () => {
    const users = [{ id: 'u1', name: 'User 1', createdAt: 10, updatedAt: 20 }];

    await persistence.writeUsers(users);
    const stored = await persistence.readUsers();

    expect(stored).toEqual(users);
  });

  it('writes and reads calls preserving nested participants', async () => {
    const calls = [
      {
        id: 'call-1',
        from: { id: 'caller-1', name: 'Caller One' },
        to: { id: 'target-1', name: 'Target One' },
        createdAt: 10_000,
        updatedAt: 10_500,
        status: 'pending',
      },
      {
        id: 'call-2',
        from: { id: 'caller-2', name: 'Caller Two' },
        to: { id: 'target-2', name: 'Target Two' },
        createdAt: 11_000,
        updatedAt: 11_500,
        status: 'accepted',
      },
    ];

    await persistence.writeCalls(calls);
    const stored = await persistence.readCalls();

    expect(stored).toEqual(calls);
  });

  it('upserts subscribers preserving original createdAt', async () => {
    const created = await persistence.upsertSubscriber({
      id: 's-1',
      name: 'Первый',
    });

    expect(created.id).toBe('s-1');
    expect(created.name).toBe('Первый');
    expect(typeof created.createdAt).toBe('number');

    const initialCreatedAt = created.createdAt;

    const updated = await persistence.upsertSubscriber({
      id: 's-1',
      name: 'Первый Обновлён',
    });

    expect(updated.name).toBe('Первый Обновлён');
    expect(updated.createdAt).toBe(initialCreatedAt);

    const subscribers = await persistence.listSubscribers();
    expect(subscribers).toHaveLength(1);
    expect(subscribers[0].name).toBe('Первый Обновлён');
  });

  it('handles call lifecycle helpers', async () => {
    const call = await persistence.createCall({
      id: 'call-life',
      from: { id: 'caller-life', name: 'Caller Helper' },
      to: { id: 'target-life', name: 'Target Helper' },
      status: 'pending',
      createdAt: 1_000,
      updatedAt: 1_000,
    });

    expect(call.status).toBe('pending');

    const pendingBefore = await persistence.listPendingCalls('target-life');
    expect(pendingBefore).toHaveLength(1);

    const updated = await persistence.updateCallStatus(call.id, 'accepted');
    expect(updated).not.toBeNull();
    expect(updated.status).toBe('accepted');

    const pendingAfter = await persistence.listPendingCalls('target-life');
    expect(pendingAfter).toHaveLength(0);

    await persistence.cleanupCalls(Date.now() + 1);
    const remainingCalls = await persistence.readCalls();
    expect(remainingCalls).toEqual([]);
  });
});

describe('createPostgresAdapter factory', () => {
  let db;
  let pool;
  let adapter;

  beforeEach(() => {
    db = newDb();
    const pg = db.adapters.createPg();
    pool = new pg.Pool();

    adapter = createPostgresAdapter({
      poolInstance: pool,
      logger: createLoggerStub(),
      statementTimeout: 1000,
    });
  });

  afterEach(async () => {
    await adapter.close?.();
    await pool.end();
  });

  it('persists subscriber payload in dedicated table', async () => {
    const payload = [
      { id: '1', name: 'Первый', createdAt: 1, updatedAt: 2 },
      { id: '2', name: 'Второй', createdAt: 3, updatedAt: 4 },
    ];

    await adapter.write('subscribers', payload);

    const stored = await adapter.read('subscribers');
    expect(stored).toEqual(payload);
  });

  it('persists calls data with participant structure', async () => {
    const call = {
      id: 'call-123',
      from: { id: 'caller', name: 'Звонящий' },
      to: { id: 'target', name: 'Получатель' },
      status: 'pending',
      createdAt: 100,
      updatedAt: 150,
    };

    await adapter.write('calls', [call]);
    const stored = await adapter.read('calls');

    expect(stored).toEqual([call]);
  });

  it('supports targeted upsert helpers', async () => {
    const subscriber = await adapter.upsertSubscriber({
      id: 'sub-1',
      name: 'Собр',
      createdAt: 10,
      updatedAt: 10,
    });
    expect(subscriber).toMatchObject({
      id: 'sub-1',
      name: 'Собр',
    });

    const user = await adapter.upsertUser({
      id: 'sub-1',
      name: 'Собр',
      createdAt: 10,
      updatedAt: 10,
    });
    expect(user).toMatchObject({
      id: 'sub-1',
      name: 'Собр',
    });

    const insertedCall = await adapter.insertCall({
      id: 'call-upsert',
      from: { id: 'caller', name: 'Caller' },
      to: { id: 'target', name: 'Target' },
      status: 'pending',
      createdAt: 1,
      updatedAt: 1,
    });
    expect(insertedCall.status).toBe('pending');

    const pendingCalls = await adapter.listPendingCalls('target');
    expect(pendingCalls).toHaveLength(1);

    const acknowledged = await adapter.updateCallStatus('call-upsert', 'acknowledged', 5);
    expect(acknowledged.status).toBe('acknowledged');

    await adapter.deleteOldNonPendingCalls(10);
    const calls = await adapter.read('calls');
    expect(calls).toHaveLength(0);
  });
});


