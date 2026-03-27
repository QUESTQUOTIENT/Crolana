import fs from 'fs';
import path from 'path';

/**
 * server/db.ts — Persistent storage layer
 *
 * Strategy: Use Prisma (PostgreSQL) when DATABASE_URL is configured.
 * Fall back to atomic JSON file when running without a database (local dev,
 * first-run Railway without a DB plugin, etc.).
 *
 * This dual-mode approach means the app works out of the box locally while
 * persisting correctly in production.
 */

const DB_FILE = path.join(process.cwd(), 'db.json');
const USE_PRISMA = !!process.env.DATABASE_URL;

export interface IPFSUpload {
  id: string;
  userId: string;
  type: 'images' | 'metadata' | 'hidden';
  cid: string;
  provider: string;
  gatewayUrl?: string;
  uploadTimestamp?: string;
  fileCount?: number;
  collectionSize?: number;
  createdAt: string;
  verified: boolean;
}

export interface UserIPFSConfig {
  userId: string;
  provider: 'pinata' | 'infura' | 'lighthouse' | 'manual';
  encryptedApiKey: string;
  encryptedSecret: string;
  encryptedJWT: string;
  gateway: string;
  createdAt: string;
}

export interface ContractDeployment {
  id: string;
  userId: string;
  networkId: number;
  contractAddress: string;
  contractType: string;
  name: string;
  symbol: string;
  deployedAt: string;
  txHash: string;
}

// ─── Prisma implementation ────────────────────────────────────────────────────
// Lazy-loaded so startup doesn't fail when DATABASE_URL is absent.
let _prisma: any = null;
async function getPrisma() {
  if (!_prisma) {
    const { PrismaClient } = await import('@prisma/client');
    _prisma = new PrismaClient();
  }
  return _prisma;
}

// ─── JSON file fallback ───────────────────────────────────────────────────────
interface DBData {
  uploads: IPFSUpload[];
  configs: UserIPFSConfig[];
  deployments: ContractDeployment[];
}
const DEFAULT_DATA: DBData = { uploads: [], configs: [], deployments: [] };

function readDB(): DBData {
  try {
    if (!fs.existsSync(DB_FILE)) { writeDB(DEFAULT_DATA); return DEFAULT_DATA; }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return { uploads: data.uploads ?? [], configs: data.configs ?? [], deployments: data.deployments ?? [] };
  } catch (err) {
    console.error('[db] Failed to read DB file, resetting:', err);
    writeDB(DEFAULT_DATA);
    return DEFAULT_DATA;
  }
}

function writeDB(data: DBData): void {
  try {
    const tmpFile = DB_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    console.error('[db] Failed to write DB file:', err);
    throw new Error('Database write failed');
  }
}

// ─── Unified async API ────────────────────────────────────────────────────────
// All methods are async so callers work identically whether using Prisma or JSON.

export const db = {
  async getUploads(userId?: string): Promise<IPFSUpload[]> {
    if (USE_PRISMA) {
      try {
        const p = await getPrisma();
        const rows = await p.iPFSUpload.findMany({ where: userId ? { userId } : {} });
        return rows.map((r: any) => ({ ...r, createdAt: r.createdAt.toISOString() }));
      } catch { /* fall through to JSON */ }
    }
    const data = readDB();
    return userId ? data.uploads.filter((u) => u.userId === userId) : data.uploads;
  },

  async addUpload(upload: IPFSUpload): Promise<void> {
    if (USE_PRISMA) {
      try {
        const p = await getPrisma();
        await p.iPFSUpload.create({ data: { ...upload, createdAt: new Date(upload.createdAt) } });
        return;
      } catch { /* fall through */ }
    }
    const data = readDB();
    data.uploads.push(upload);
    writeDB(data);
  },

  async getConfig(userId: string): Promise<UserIPFSConfig | undefined> {
    if (USE_PRISMA) {
      try {
        const p = await getPrisma();
        const row = await p.userIPFSConfig.findUnique({ where: { userId } });
        return row ? { ...row, createdAt: row.createdAt.toISOString() } : undefined;
      } catch { /* fall through */ }
    }
    return readDB().configs.find((c) => c.userId === userId);
  },

  async saveConfig(config: UserIPFSConfig): Promise<void> {
    if (USE_PRISMA) {
      try {
        const p = await getPrisma();
        await p.userIPFSConfig.upsert({
          where: { userId: config.userId },
          update: { ...config, createdAt: new Date(config.createdAt) },
          create: { ...config, createdAt: new Date(config.createdAt) },
        });
        return;
      } catch { /* fall through */ }
    }
    const data = readDB();
    const index = data.configs.findIndex((c) => c.userId === config.userId);
    if (index >= 0) data.configs[index] = config; else data.configs.push(config);
    writeDB(data);
  },

  async getDeployments(userId: string): Promise<ContractDeployment[]> {
    if (USE_PRISMA) {
      try {
        const p = await getPrisma();
        const rows = await p.contractDeployment.findMany({ where: { userId } });
        return rows.map((r: any) => ({ ...r, deployedAt: r.deployedAt.toISOString() }));
      } catch { /* fall through */ }
    }
    return readDB().deployments.filter((d) => d.userId === userId);
  },

  async addDeployment(deployment: ContractDeployment): Promise<void> {
    if (USE_PRISMA) {
      try {
        const p = await getPrisma();
        await p.contractDeployment.create({ data: { ...deployment, deployedAt: new Date(deployment.deployedAt) } });
        return;
      } catch { /* fall through */ }
    }
    const data = readDB();
    data.deployments.push(deployment);
    writeDB(data);
  },

  async deleteConfig(userId: string): Promise<boolean> {
    if (USE_PRISMA) {
      try {
        const p = await getPrisma();
        await p.userIPFSConfig.delete({ where: { userId } });
        return true;
      } catch { /* fall through */ }
    }
    const data = readDB();
    const before = data.configs.length;
    data.configs = data.configs.filter((c) => c.userId !== userId);
    if (data.configs.length !== before) { writeDB(data); return true; }
    return false;
  },
};
