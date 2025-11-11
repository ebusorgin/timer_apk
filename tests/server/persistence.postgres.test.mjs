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
});


