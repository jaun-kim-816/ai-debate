// 세션 저장 (메모리 + ./data json)
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

/** @type {Map<string, object>} */
const sessions = new Map();

function filePath(id) {
  return join(DATA_DIR, `${id}.json`);
}

function persist(session) {
  session.updatedAt = Date.now();
  writeFileSync(filePath(session.id), JSON.stringify(session, null, 2), 'utf8');
}

// 시작 시 기존 세션 로드
function loadAll() {
  for (const f of readdirSync(DATA_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const s = JSON.parse(readFileSync(join(DATA_DIR, f), 'utf8'));
      if (s && s.id) sessions.set(s.id, s);
    } catch {
      /* skip corrupt file */
    }
  }
}
loadAll();

export function createSession({ topic, mode, autoRounds }) {
  const id = randomUUID();
  const now = Date.now();
  const session = {
    id,
    topic: String(topic).trim(),
    mode: mode === 'auto' ? 'auto' : 'manual',
    autoRounds: Math.max(1, Math.min(10, Number(autoRounds) || 3)),
    round: 0,
    status: 'idle', // idle | running | done
    messages: [
      {
        role: 'system',
        content: `토론 주제: ${String(topic).trim()}`,
        ts: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  sessions.set(id, session);
  persist(session);
  return session;
}

export function getSession(id) {
  return sessions.get(id) || null;
}

export function listSessions() {
  return [...sessions.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((s) => ({
      id: s.id,
      topic: s.topic,
      mode: s.mode,
      round: s.round,
      status: s.status,
      messageCount: s.messages.length,
      updatedAt: s.updatedAt,
    }));
}

export function addMessage(session, role, content) {
  session.messages.push({ role, content, ts: Date.now() });
  persist(session);
  return session;
}

export function save(session) {
  persist(session);
  return session;
}

export function deleteSession(id) {
  const ok = sessions.delete(id);
  try {
    if (existsSync(filePath(id))) rmSync(filePath(id));
  } catch {
    /* ignore */
  }
  return ok;
}
