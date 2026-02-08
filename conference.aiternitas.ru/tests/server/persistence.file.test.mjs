import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import path from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import createFileAdapter from '../../server/persistence/fileAdapter.mjs';

describe('file persistence adapter', () => {
  let dataDir;
  let adapter;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'conf-test-'));
    adapter = createFileAdapter({
      dataDir,
      subscribersFile: path.join(dataDir, 'subscribers.json'),
      usersFile: path.join(dataDir, 'users.json'),
      callsFile: path.join(dataDir, 'calls.json'),
      contactsFile: path.join(dataDir, 'contacts.json'),
      chatMessagesFile: path.join(dataDir, 'chat_messages.json'),
      backupDir: path.join(dataDir, 'backups'),
      enableBackups: false,
    });
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('writes and reads subscribers', async () => {
    const items = [
      { id: 's1', name: 'User 1', createdAt: Date.now(), updatedAt: Date.now() },
    ];
    await adapter.write('subscribers', items);
    const read = await adapter.read('subscribers');
    expect(read).toHaveLength(1);
    expect(read[0]).toMatchObject({ id: 's1', name: 'User 1' });
  });

  it('writes and reads calls', async () => {
    const calls = [
      {
        id: 'call_1',
        from: { id: 'f1', name: 'From' },
        to: { id: 't1', name: 'To' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'pending',
      },
    ];
    await adapter.write('calls', calls);
    const read = await adapter.read('calls');
    expect(read).toHaveLength(1);
    expect(read[0].from.id).toBe('f1');
    expect(read[0].to.id).toBe('t1');
  });

  it('listContacts, addContact, removeContact work', async () => {
    await adapter.write('subscribers', [
      { id: 'owner1', name: 'Owner', createdAt: Date.now(), updatedAt: Date.now() },
      { id: 'contact1', name: 'Contact', createdAt: Date.now(), updatedAt: Date.now() },
    ]);
    let list = await adapter.listContacts('owner1');
    expect(list).toHaveLength(0);

    await adapter.addContact('owner1', 'contact1');
    list = await adapter.listContacts('owner1');
    expect(list).toHaveLength(1);
    expect(list[0].contactId).toBe('contact1');

    await adapter.removeContact('owner1', 'contact1');
    list = await adapter.listContacts('owner1');
    expect(list).toHaveLength(0);
  });

  it('listMessages and insertMessage work', async () => {
    const msg = {
      id: 'msg_1',
      fromId: 'user1',
      toId: 'user2',
      body: 'Hello',
      createdAt: Date.now(),
    };
    await adapter.insertMessage(msg);
    const list = await adapter.listMessages('user1', 'user2');
    expect(list).toHaveLength(1);
    expect(list[0].body).toBe('Hello');
  });
});
