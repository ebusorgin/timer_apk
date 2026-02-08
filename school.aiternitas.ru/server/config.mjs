import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createConfig(options = {}) {
  const rootDir = path.join(__dirname);
  const wwwDir = path.join(rootDir, '..', 'client', 'dist', 'client', 'browser');

  return {
    corsOrigin: process.env.CORS_ORIGIN || '*',
    paths: {
      rootDir,
      www: wwwDir,
    },
  };
}

export default createConfig;
