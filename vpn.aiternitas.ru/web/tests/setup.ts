import path from 'path';
import { execSync } from 'child_process';

// Set test DB before any prisma imports
const prismaDir = path.join(__dirname, '../prisma');
const testDbPath = path.join(prismaDir, 'test.db');
process.env.DATABASE_URL = `file:${testDbPath}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

// Ensure test DB schema exists
try {
  execSync('npx prisma db push --accept-data-loss', {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: `file:./prisma/test.db` },
    stdio: 'pipe',
  });
} catch {
  // Ignore - db might already exist or prisma not in path
}
