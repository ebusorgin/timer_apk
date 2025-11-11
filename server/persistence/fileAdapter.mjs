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
  backupDir,
  enableBackups = true,
} = {}) {
  if (!dataDir || !subscribersFile || !usersFile || !callsFile) {
    throw new Error('createFileAdapter: отсутствуют обязательные пути для файлов хранения.');
  }

  const backupDirectory = backupDir || dataDir;

  const collectionMap = {
    subscribers: { filePath: subscribersFile, property: 'subscribers' },
    users: { filePath: usersFile, property: 'users' },
    calls: { filePath: callsFile, property: 'calls' },
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

  return {
    read,
    write,
    backup,
    ensureFile,
  };
}

export default createFileAdapter;

