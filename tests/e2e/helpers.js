import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';

export function resolveAppUrl(port) {
  return `http://localhost:${port}/`;
}

export async function collectConsole(page, label, out = []) {
  page.on('console', (msg) => {
    const entry = `[${label}] ${msg.type().toUpperCase()}: ${msg.text()}`;
    out.push(entry);
    console.log(entry);
  });
  page.on('pageerror', (err) => {
    const entry = `[${label}] PAGEERROR: ${err?.stack || err?.message || err}`;
    out.push(entry);
    console.error(entry);
  });
  return out;
}

export function getProjectRoot() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, '..', '..');
}

export async function saveArtifact(name, data) {
  const artifactsDir = path.join(getProjectRoot(), 'tests', 'e2e', 'artifacts');
  await fs.mkdir(artifactsDir, { recursive: true });
  const filePath = path.join(
    artifactsDir,
    `${Date.now()}-${name.replace(/[\\/:*?"<>|]+/g, '_')}.json`
  );
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return filePath;
}


