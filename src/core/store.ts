import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const STORE_DIR = join(homedir(), '.lean-ctx');
const STORE_FILE = join(STORE_DIR, 'stats.json');

export interface SessionRecord {
  id: string;
  startedAt: string;
  project: string;
  totalReads: number;
  cacheHits: number;
  tokensOriginal: number;
  tokensSaved: number;
  filesTracked: number;
  toolCalls: ToolCallRecord[];
}

export interface ToolCallRecord {
  tool: string;
  file?: string;
  mode?: string;
  tokensOriginal: number;
  tokensSaved: number;
  timestamp: string;
}

export interface StoreData {
  sessions: SessionRecord[];
  totalTokensSaved: number;
  totalTokensOriginal: number;
  firstUsed: string;
}

function ensureDir(): void {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true });
  }
}

function readStore(): StoreData {
  ensureDir();
  try {
    const raw = readFileSync(STORE_FILE, 'utf-8');
    return JSON.parse(raw) as StoreData;
  } catch {
    return {
      sessions: [],
      totalTokensSaved: 0,
      totalTokensOriginal: 0,
      firstUsed: new Date().toISOString(),
    };
  }
}

function writeStore(data: StoreData): void {
  ensureDir();
  writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
}

let currentSession: SessionRecord | null = null;

export function startSession(project: string): SessionRecord {
  currentSession = {
    id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    startedAt: new Date().toISOString(),
    project,
    totalReads: 0,
    cacheHits: 0,
    tokensOriginal: 0,
    tokensSaved: 0,
    filesTracked: 0,
    toolCalls: [],
  };
  return currentSession;
}

export function recordToolCall(
  tool: string,
  tokensOriginal: number,
  tokensSaved: number,
  file?: string,
  mode?: string
): void {
  if (!currentSession) return;

  currentSession.toolCalls.push({
    tool,
    file: file ? file.split('/').pop() : undefined,
    mode,
    tokensOriginal,
    tokensSaved,
    timestamp: new Date().toISOString(),
  });

  currentSession.tokensOriginal += tokensOriginal;
  currentSession.tokensSaved += tokensSaved;

  if (tool === 'ctx_read') {
    currentSession.totalReads++;
    if (tokensSaved > tokensOriginal * 0.8) {
      currentSession.cacheHits++;
    }
  }
}

export function updateSessionFiles(count: number): void {
  if (currentSession) {
    currentSession.filesTracked = count;
  }
}

export function flushSession(): void {
  if (!currentSession || currentSession.toolCalls.length === 0) return;

  const store = readStore();
  store.sessions.push(currentSession);
  store.totalTokensSaved += currentSession.tokensSaved;
  store.totalTokensOriginal += currentSession.tokensOriginal;

  const MAX_SESSIONS = 500;
  if (store.sessions.length > MAX_SESSIONS) {
    store.sessions = store.sessions.slice(-MAX_SESSIONS);
  }

  writeStore(store);
  currentSession = null;
}

export function getStoreData(): StoreData {
  return readStore();
}

export function getCurrentSession(): SessionRecord | null {
  return currentSession;
}

export function getStorePath(): string {
  return STORE_FILE;
}
