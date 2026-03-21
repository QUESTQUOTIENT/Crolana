import fs from 'fs';
import path from 'path';

const DB_FILE = path.join(process.cwd(), 'db.json');

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

interface DBData {
  uploads: IPFSUpload[];
  configs: UserIPFSConfig[];
  deployments: ContractDeployment[];
}

const DEFAULT_DATA: DBData = { uploads: [], configs: [], deployments: [] };

function readDB(): DBData {
  try {
    if (!fs.existsSync(DB_FILE)) {
      writeDB(DEFAULT_DATA);
      return DEFAULT_DATA;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const data = JSON.parse(raw);
    // Ensure all required keys exist (migration safety)
    return {
      uploads: data.uploads ?? [],
      configs: data.configs ?? [],
      deployments: data.deployments ?? [],
    };
  } catch (err) {
    console.error('[db] Failed to read DB file, resetting:', err);
    writeDB(DEFAULT_DATA);
    return DEFAULT_DATA;
  }
}

function writeDB(data: DBData): void {
  try {
    // Write to a temp file first, then rename for atomic write
    const tmpFile = DB_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    console.error('[db] Failed to write DB file:', err);
    throw new Error('Database write failed');
  }
}

export const db = {
  getUploads: (userId?: string): IPFSUpload[] => {
    const data = readDB();
    return userId ? data.uploads.filter((u) => u.userId === userId) : data.uploads;
  },

  addUpload: (upload: IPFSUpload): void => {
    const data = readDB();
    data.uploads.push(upload);
    writeDB(data);
  },

  getConfig: (userId: string): UserIPFSConfig | undefined => {
    return readDB().configs.find((c) => c.userId === userId);
  },

  saveConfig: (config: UserIPFSConfig): void => {
    const data = readDB();
    const index = data.configs.findIndex((c) => c.userId === config.userId);
    if (index >= 0) {
      data.configs[index] = config;
    } else {
      data.configs.push(config);
    }
    writeDB(data);
  },

  getDeployments: (userId: string): ContractDeployment[] => {
    return readDB().deployments.filter((d) => d.userId === userId);
  },

  addDeployment: (deployment: ContractDeployment): void => {
    const data = readDB();
    data.deployments.push(deployment);
    writeDB(data);
  },

  deleteConfig: (userId: string): boolean => {
    const data = readDB();
    const before = data.configs.length;
    data.configs = data.configs.filter((c) => c.userId !== userId);
    if (data.configs.length !== before) {
      writeDB(data);
      return true;
    }
    return false;
  },
};
