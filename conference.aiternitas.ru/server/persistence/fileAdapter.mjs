import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import { promises as fs } from 'fs';

const backupPerformed = new Map();

const toJSON = (payload) => JSON.stringify(payload, null, 2);

const parseCollection = (content, property) => {
  if (!content) {
    return [];
  }
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && Array.isArray(parsed[property])) {
      return parsed[property];
    }
  } catch (error) {
    console.warn(`⚠️ Ошибка парсинга данных ${property}:`, error);
  }
  return [];
};

const ensureDirectory = (targetDir) => {
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }
};

export function createFileAdapter({
  dataDir,
  subscribersFile,
  usersFile,
  callsFile,
  contactsFile,
  chatMessagesFile,
  contactRequestsFile,
  adminsFile,
  appSettingsFile,
  backupDir,
  enableBackups = true,
} = {}) {
  if (!dataDir || !subscribersFile || !usersFile || !callsFile) {
    throw new Error('createFileAdapter: отсутствуют обязательные пути для файлов хранения.');
  }

  const backupDirectory = backupDir || dataDir;
  const resolvedContactsFile = contactsFile || path.join(dataDir, 'contacts.json');
  const resolvedChatMessagesFile = chatMessagesFile || path.join(dataDir, 'chat_messages.json');
  const resolvedContactRequestsFile = contactRequestsFile || path.join(dataDir, 'contact_requests.json');
  const resolvedPushSubscriptionsFile = path.join(dataDir, 'push_subscriptions.json');
  const resolvedAdminsFile = adminsFile || path.join(dataDir, 'admins.json');
  const resolvedAppSettingsFile = appSettingsFile || path.join(dataDir, 'app_settings.json');

  const collectionMap = {
    subscribers: { filePath: subscribersFile, property: 'subscribers' },
    users: { filePath: usersFile, property: 'users' },
    calls: { filePath: callsFile, property: 'calls' },
    contacts: { filePath: resolvedContactsFile, property: 'contacts' },
    chat_messages: { filePath: resolvedChatMessagesFile, property: 'messages' },
    contact_requests: { filePath: resolvedContactRequestsFile, property: 'requests' },
    push_subscriptions: { filePath: resolvedPushSubscriptionsFile, property: 'subscriptions' },
    admins: { filePath: resolvedAdminsFile, property: 'admins' },
  };

  const ensureFile = async (key) => {
    const entry = collectionMap[key];
    if (!entry) {
      throw new Error(`createFileAdapter.ensureFile: неизвестный ключ ${key}`);
    }

    ensureDirectory(dataDir);

    if (!existsSync(entry.filePath)) {
      const initialPayload = { [entry.property]: [] };
      await fs.writeFile(entry.filePath, toJSON(initialPayload), 'utf-8');
    }
  };

  const read = async (key) => {
    const entry = collectionMap[key];
    if (!entry) {
      throw new Error(`createFileAdapter.read: неизвестный ключ ${key}`);
    }
    await ensureFile(key);
    const content = await fs.readFile(entry.filePath, 'utf-8');
    return parseCollection(content, entry.property);
  };

  const backup = async (key) => {
    if (!enableBackups) {
      return null;
    }

    const entry = collectionMap[key];
    if (!entry) {
      throw new Error(`createFileAdapter.backup: неизвестный ключ ${key}`);
    }

    await ensureFile(key);
    ensureDirectory(backupDirectory);

    const lastBackup = backupPerformed.get(entry.filePath);
    const now = Date.now();

    // Делать резервную копию не чаще чем раз в минуту для каждого файла.
    if (lastBackup && now - lastBackup < 60_000) {
      return null;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `${path.basename(entry.filePath)}.${timestamp}.bak`;
    const backupPath = path.join(backupDirectory, backupFileName);

    try {
      await fs.copyFile(entry.filePath, backupPath);
      backupPerformed.set(entry.filePath, now);
      return backupPath;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(`⚠️ Не удалось сделать резервную копию для ${entry.filePath}:`, error);
      }
      return null;
    }
  };

  const write = async (key, data) => {
    const entry = collectionMap[key];
    if (!entry) {
      throw new Error(`createFileAdapter.write: неизвестный ключ ${key}`);
    }

    await backup(key);
    await ensureFile(key);

    const payload = { [entry.property]: data };
    await fs.writeFile(entry.filePath, toJSON(payload), 'utf-8');
  };

  const listContacts = async (ownerId) => {
    const items = await read('contacts');
    return items
      .filter((c) => (c.ownerId || c.owner_id) === ownerId)
      .sort((a, b) => (a.createdAt || a.created_at || 0) - (b.createdAt || b.created_at || 0));
  };

  const addContact = async (ownerId, contactId) => {
    await ensureFile('contacts');
    const items = await read('contacts');
    const exists = items.some(
      (c) => (c.ownerId || c.owner_id) === ownerId && (c.contactId || c.contact_id) === contactId
    );
    if (exists) return;
    items.push({
      ownerId,
      contactId,
      createdAt: Date.now(),
    });
    await write('contacts', items);
  };

  const removeContact = async (ownerId, contactId) => {
    const items = await read('contacts');
    const filtered = items.filter(
      (c) => !((c.ownerId || c.owner_id) === ownerId && (c.contactId || c.contact_id) === contactId)
    );
    if (filtered.length !== items.length) {
      await write('contacts', filtered);
    }
  };

  const listMessages = async (fromId, toId) => {
    const items = await read('chat_messages');
    return items
      .filter(
        (m) =>
          ((m.fromId || m.from_id) === fromId && (m.toId || m.to_id) === toId) ||
          ((m.fromId || m.from_id) === toId && (m.toId || m.to_id) === fromId)
      )
      .sort((a, b) => (a.createdAt || a.created_at || 0) - (b.createdAt || b.created_at || 0));
  };

  const insertMessage = async (record) => {
    await ensureFile('chat_messages');
    const items = await read('chat_messages');
    items.push({
      id: record.id,
      fromId: record.fromId,
      toId: record.toId,
      body: record.body,
      createdAt: record.createdAt || Date.now(),
    });
    await write('chat_messages', items);
  };

  // --- Contact Requests ---
  const listContactRequests = async (subscriberId) => {
    const items = await read('contact_requests');
    return items
      .filter((r) => r.toId === subscriberId && r.status === 'pending')
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  };

  const listOutgoingContactRequests = async (subscriberId) => {
    const items = await read('contact_requests');
    return items
      .filter((r) => r.fromId === subscriberId && r.status === 'pending')
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  };

  const createContactRequest = async (record) => {
    await ensureFile('contact_requests');
    const items = await read('contact_requests');
    const existing = items.find(
      (r) => r.fromId === record.fromId && r.toId === record.toId && r.status === 'pending'
    );
    if (existing) return existing;
    items.push(record);
    await write('contact_requests', items);
    return record;
  };

  const getContactRequestById = async (requestId) => {
    const items = await read('contact_requests');
    return items.find((r) => r.id === requestId) || null;
  };

  const updateContactRequestStatus = async (requestId, status) => {
    const items = await read('contact_requests');
    const idx = items.findIndex((r) => r.id === requestId);
    if (idx === -1) return null;
    items[idx] = { ...items[idx], status, updatedAt: Date.now() };
    await write('contact_requests', items);
    return items[idx];
  };

  const listSubscribers = async () => {
    const items = await read('subscribers');
    return items.sort((a, b) => ((a.name || '').toLowerCase()).localeCompare((b.name || '').toLowerCase()));
  };

  const getSubscriberById = async (id) => {
    if (id == null || id === '') return null;
    const items = await read('subscribers');
    const sid = String(id);
    return items.find((s) => String(s.id) === sid) || null;
  };

  const getSubscriberByLogin = async (login) => {
    if (!login || typeof login !== 'string') return null;
    const items = await read('subscribers');
    const l = String(login).trim().toLowerCase();
    return (
      items.find((s) => (s.login || '').trim().toLowerCase() === l) ||
      items.find((s) => String(s.id) === String(login).trim()) ||
      null
    );
  };

  const upsertSubscriber = async (record) => {
    const items = await read('subscribers');
    const now = Date.now();
    const idx = items.findIndex((s) => String(s.id) === String(record.id));
    const existing = idx >= 0 ? items[idx] : null;
    const login = String(record.login || existing?.login || record.name || '').trim() || `user_${now}`;
    const name = String(record.name || '').trim() || login;
    const item = {
      id: record.id || (existing?.id ?? String(items.length ? Math.max(...items.map((s) => parseInt(s.id, 10) || 0)) + 1 : 1)),
      login,
      name,
      passwordHash: record.passwordHash || existing?.passwordHash || existing?.password_hash || '',
      avatarUrl: record.avatarUrl !== undefined ? record.avatarUrl : (existing?.avatarUrl ?? null),
      role: record.role || existing?.role || 'user',
      createdAt: existing ? (existing.createdAt ?? existing.created_at ?? now) : now,
      updatedAt: now,
    };
    if (idx >= 0) {
      items[idx] = item;
    } else {
      items.push(item);
    }
    await write('subscribers', items);
    return item;
  };

  const insertSubscriber = async (record) => {
    const items = await read('subscribers');
    const now = Date.now();
    const login = String(record.login || '').trim();
    const name = String(record.name || '').trim();
    if (!login || !name) throw new Error('login и name обязательны');
    const maxId = items.length ? Math.max(0, ...items.map((s) => parseInt(s.id, 10) || 0)) : 0;
    const id = String(maxId + 1);
    const item = {
      id,
      login,
      name,
      passwordHash: record.passwordHash || '',
      avatarUrl: record.avatarUrl || null,
      role: record.role || 'user',
      createdAt: now,
      updatedAt: now,
    };
    items.push(item);
    await write('subscribers', items);
    return item;
  };

  const savePushSubscription = async (subscriberId, subscription) => {
    await ensureFile('push_subscriptions');
    const items = await read('push_subscriptions');
    const idx = items.findIndex((s) => String(s.subscriberId) === String(subscriberId));
    const record = { subscriberId: String(subscriberId), subscription, updatedAt: Date.now() };
    if (idx >= 0) {
      items[idx] = record;
    } else {
      items.push(record);
    }
    await write('push_subscriptions', items);
  };

  const getPushSubscription = async (subscriberId) => {
    const items = await read('push_subscriptions');
    const r = items.find((s) => String(s.subscriberId) === String(subscriberId));
    return r?.subscription || null;
  };

  const getSetting = async (key) => {
    ensureDirectory(dataDir);
    if (!existsSync(resolvedAppSettingsFile)) return null;
    try {
      const content = await fs.readFile(resolvedAppSettingsFile, 'utf-8');
      const obj = JSON.parse(content || '{}');
      return obj[key] != null ? String(obj[key]) : null;
    } catch {
      return null;
    }
  };

  const setSetting = async (key, value) => {
    ensureDirectory(dataDir);
    let obj = {};
    try {
      if (existsSync(resolvedAppSettingsFile)) {
        const content = await fs.readFile(resolvedAppSettingsFile, 'utf-8');
        obj = JSON.parse(content || '{}');
      }
    } catch {}
    obj[key] = String(value);
    await fs.writeFile(resolvedAppSettingsFile, toJSON(obj), 'utf-8');
  };

  return {
    read,
    write,
    backup,
    ensureFile,
    listContacts,
    addContact,
    removeContact,
    listMessages,
    insertMessage,
    listContactRequests,
    listOutgoingContactRequests,
    createContactRequest,
    getContactRequestById,
    updateContactRequestStatus,
    savePushSubscription,
    getPushSubscription,
    listSubscribers,
    getSubscriberById,
    getSubscriberByLogin,
    upsertSubscriber,
    insertSubscriber,
    getSetting,
    setSetting,
  };
}

export default createFileAdapter;

