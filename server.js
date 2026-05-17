// ai-debate 서버
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// .env 직접 파싱 (dotenv 안 씀)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const express = (await import('express')).default;
const { createSession, getSession, listSessions, deleteSession } = await import(
  './lib/store.js'
);
const { runRound, runAuto, runSummary, addUserMessage } = await import(
  './lib/debate.js'
);
const { PROVIDER_INFO } = await import('./lib/providers.js');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(join(__dirname, 'public')));

const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  });
};

app.get('/api/info', (_req, res) => res.json(PROVIDER_INFO));

app.get(
  '/api/sessions',
  wrap((_req, res) => res.json(listSessions())),
);

app.post(
  '/api/sessions',
  wrap((req, res) => {
    const { topic, mode, autoRounds } = req.body || {};
    if (!topic || !String(topic).trim()) {
      return res.status(400).json({ error: '주제를 입력하세요.' });
    }
    res.json(createSession({ topic, mode, autoRounds }));
  }),
);

function requireSession(req, res) {
  const s = getSession(req.params.id);
  if (!s) {
    res.status(404).json({ error: '세션을 찾을 수 없습니다.' });
    return null;
  }
  return s;
}

// 같은 세션 동시 요청 막기 (더블클릭)
function requireIdle(req, res) {
  const s = requireSession(req, res);
  if (!s) return null;
  if (s.status === 'running') {
    res.status(409).json({ error: '이미 진행 중입니다. 잠시 후 다시 시도하세요.' });
    return null;
  }
  return s;
}

app.get(
  '/api/sessions/:id',
  wrap((req, res) => {
    const s = requireSession(req, res);
    if (s) res.json(s);
  }),
);

app.delete(
  '/api/sessions/:id',
  wrap((req, res) => {
    res.json({ ok: deleteSession(req.params.id) });
  }),
);

app.post(
  '/api/sessions/:id/round',
  wrap(async (req, res) => {
    const s = requireIdle(req, res);
    if (s) res.json(await runRound(s));
  }),
);

app.post(
  '/api/sessions/:id/auto',
  wrap(async (req, res) => {
    const s = requireIdle(req, res);
    if (s) res.json(await runAuto(s));
  }),
);

app.post(
  '/api/sessions/:id/summary',
  wrap(async (req, res) => {
    const s = requireIdle(req, res);
    if (!s) return;
    await runSummary(s);
    res.json(s);
  }),
);

app.post(
  '/api/sessions/:id/message',
  wrap(async (req, res) => {
    const s = requireSession(req, res);
    if (!s) return;
    const { content } = req.body || {};
    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: '메시지를 입력하세요.' });
    }
    res.json(await addUserMessage(s, String(content).trim()));
  }),
);

const PORT = Number(process.env.PORT) || 5178;

// 테스트에서 import할 땐 listen 안 함
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  app.listen(PORT, () => {
    console.log(`AI Debate → http://localhost:${PORT}`);
    console.log(
      `mode: ${PROVIDER_INFO.mock ? 'MOCK (no API calls)' : 'LIVE'} | ` +
        `claude=${PROVIDER_INFO.anthropicModel} gpt=${PROVIDER_INFO.openaiModel}`,
    );
  });
}

export { app };
