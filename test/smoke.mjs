// MOCK=1 node test/smoke.mjs
process.env.MOCK = '1';
process.env.PORT = '0';

import assert from 'node:assert/strict';
import { app } from '../server.js';
import { friendlyError } from '../lib/providers.js';

const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://localhost:${server.address().port}`;

const j = async (path, opts) => {
  const res = await fetch(base + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
};

let passed = 0;
const ok = (label) => {
  passed++;
  console.log(`  ✓ ${label}`);
};

try {
  const info = await j('/api/info');
  assert.equal(info.mock, true, 'should be in mock mode');
  ok('GET /api/info → mock mode');

  // friendlyError
  const quotaBody = JSON.stringify({
    error: {
      message: 'You exceeded your current quota, please check your plan and billing details.',
      type: 'insufficient_quota',
    },
  });
  const fe = friendlyError('GPT', 429, quotaBody);
  assert.ok(fe.includes('크레딧'), 'mentions credit');
  assert.ok(fe.includes('platform.openai.com'), 'gives billing URL');
  assert.ok(!fe.includes('{'), 'no raw JSON dump');
  ok('friendlyError → OpenAI 429 quota mapped to actionable message');

  const badKey = friendlyError('Claude', 401, '{"error":{"message":"invalid x-api-key"}}');
  assert.ok(badKey.includes('ANTHROPIC_API_KEY'), 'Claude 401 → key hint');
  ok('friendlyError → Anthropic 401 mapped to key hint');

  // Manual mode session
  const s = await j('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ topic: '교대 근무자에게 낮잠을 권장해야 하는가?', mode: 'manual' }),
  });
  assert.ok(s.id, 'session has id');
  assert.equal(s.messages.length, 1, 'starts with system message');
  ok('POST /api/sessions → manual session created');

  const r1 = await j(`/api/sessions/${s.id}/round`, { method: 'POST' });
  assert.equal(r1.round, 1, 'round incremented');
  const roles = r1.messages.map((m) => m.role);
  assert.ok(roles.includes('claude'), 'claude spoke');
  assert.ok(roles.includes('gpt'), 'gpt spoke');
  assert.equal(r1.status, 'idle', 'manual round ends idle');
  ok('POST /round → claude then gpt, status idle');

  const withUser = await j(`/api/sessions/${s.id}/message`, {
    method: 'POST',
    body: JSON.stringify({ content: '비번 시간대를 고려해줘.' }),
  });
  assert.ok(
    withUser.messages.some((m) => m.role === 'user'),
    'user message added',
  );
  ok('POST /message → user message injected');

  await j(`/api/sessions/${s.id}/round`, { method: 'POST' });
  const sum = await j(`/api/sessions/${s.id}/summary`, { method: 'POST' });
  assert.ok(
    sum.messages.some((m) => m.role === 'system' && m.content.includes('요약')),
    'summary added',
  );
  ok('POST /summary → summary appended');

  // Auto mode session
  const a = await j('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ topic: '자동 토론 테스트', mode: 'auto', autoRounds: 2 }),
  });
  const auto = await j(`/api/sessions/${a.id}/auto`, { method: 'POST' });
  assert.equal(auto.round, 2, 'auto ran 2 rounds');
  assert.equal(auto.status, 'done', 'auto session done');
  assert.ok(
    auto.messages.some((m) => m.role === 'system' && m.content.includes('요약')),
    'auto produced summary',
  );
  ok('POST /auto → 2 rounds + summary, status done');

  // Persistence: list + reopen
  const list = await j('/api/sessions');
  assert.ok(list.length >= 2, 'sessions listed');
  ok('GET /api/sessions → lists sessions');

  // Cleanup test sessions
  await j(`/api/sessions/${s.id}`, { method: 'DELETE' });
  await j(`/api/sessions/${a.id}`, { method: 'DELETE' });
  ok('DELETE /api/sessions/:id → cleaned up');

  console.log(`\n✅ ${passed} checks passed`);
  server.close();
  process.exit(0);
} catch (err) {
  console.error('\n❌ smoke test failed:', err);
  server.close();
  process.exit(1);
}
