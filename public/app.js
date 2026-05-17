const $ = (sel) => document.querySelector(sel);
const api = async (url, opts) => {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
};

let current = null; // current session id
let mode = 'manual';

const WHO = { claude: '클로드', gpt: '지피티', user: '나', system: '진행' };

function renderThread(session) {
  const thread = $('#thread');
  thread.innerHTML = '';
  for (const m of session.messages) {
    const el = document.createElement('div');
    el.className = `msg ${m.role}`;
    const who = document.createElement('div');
    who.className = 'who';
    who.textContent = WHO[m.role] || m.role;
    const body = document.createElement('div');
    body.textContent = m.content;
    el.append(who, body);
    thread.append(el);
  }
  thread.scrollTop = thread.scrollHeight;
}

function showRoom(session) {
  current = session.id;
  $('#empty').classList.add('hidden');
  $('#room').classList.remove('hidden');
  $('#room-topic').textContent = session.topic;
  $('#room-meta').textContent =
    `모드: ${session.mode === 'auto' ? '자동' : '수동'} · ` +
    `라운드 ${session.round} · 상태 ${session.status}`;
  renderThread(session);
  highlightList();
}

function setBusy(b) {
  $('#busy').classList.toggle('hidden', !b);
  for (const id of ['#round-btn', '#auto-btn', '#summary-btn']) {
    $(id).disabled = b;
  }
}

async function refreshList() {
  const list = await api('/api/sessions');
  const ul = $('#session-list');
  ul.innerHTML = '';
  if (!list.length) {
    ul.innerHTML = '<li class="muted" style="cursor:default">아직 없음</li>';
    return;
  }
  for (const s of list) {
    const li = document.createElement('li');
    li.dataset.id = s.id;
    if (s.id === current) li.classList.add('active');
    li.innerHTML =
      `<div>${escapeHtml(s.topic)}</div>` +
      `<div class="s-meta">${s.mode === 'auto' ? '자동' : '수동'} · ` +
      `R${s.round} · ${s.messageCount}개 메시지</div>`;
    li.onclick = () => openSession(s.id);
    ul.append(li);
  }
}

function highlightList() {
  document.querySelectorAll('.session-list li').forEach((li) => {
    li.classList.toggle('active', li.dataset.id === current);
  });
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
}

async function openSession(id) {
  const s = await api(`/api/sessions/${id}`);
  showRoom(s);
}

// --- new session form ---
$('#mode-seg').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-mode]');
  if (!btn) return;
  mode = btn.dataset.mode;
  document
    .querySelectorAll('#mode-seg button')
    .forEach((b) => b.classList.toggle('active', b === btn));
  $('#auto-rounds-wrap').classList.toggle('hidden', mode !== 'auto');
});

$('#new-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const topic = $('#topic').value.trim();
  if (!topic) return;
  try {
    const s = await api('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({
        topic,
        mode,
        autoRounds: Number($('#auto-rounds').value) || 3,
      }),
    });
    $('#topic').value = '';
    showRoom(s);
    await refreshList();
    // 입력하면 바로 첫 라운드 시작
    await act(s.mode === 'auto' ? 'auto' : 'round');
  } catch (err) {
    alert(err.message);
  }
});

async function act(path) {
  if (!current) return;
  setBusy(true);
  try {
    const s = await api(`/api/sessions/${current}/${path}`, { method: 'POST' });
    showRoom(s);
    await refreshList();
  } catch (err) {
    alert(err.message);
  } finally {
    setBusy(false);
  }
}

$('#round-btn').onclick = () => act('round');
$('#auto-btn').onclick = () => act('auto');
$('#summary-btn').onclick = () => act('summary');

$('#say-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#say-input');
  const content = input.value.trim();
  if (!content || !current) return;
  input.value = '';
  try {
    const s = await api(`/api/sessions/${current}/message`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    showRoom(s);
  } catch (err) {
    alert(err.message);
  }
});

$('#delete-btn').addEventListener('click', async () => {
  if (!current || !confirm('이 토론을 삭제할까요?')) return;
  await api(`/api/sessions/${current}`, { method: 'DELETE' });
  current = null;
  $('#room').classList.add('hidden');
  $('#empty').classList.remove('hidden');
  await refreshList();
});

// --- init ---
(async () => {
  try {
    const info = await api('/api/info');
    $('#provider-info').textContent = info.mock
      ? '⚠ MOCK 모드 — 모의 응답 (API 키 없이 UI 시험용)'
      : `LIVE · 클로드=${info.anthropicModel} · 지피티=${info.openaiModel}`;
  } catch {
    /* ignore */
  }
  await refreshList();
})();
