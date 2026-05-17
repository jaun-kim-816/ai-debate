// Claude / GPT 호출 래퍼

// 테스트에서 env를 나중에 세팅하므로 lazy하게 읽음
const isMock = () => process.env.MOCK === '1';
const openaiModel = () => process.env.OPENAI_MODEL || 'gpt-4o';
const anthropicModel = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

// API 에러를 사용자에게 보여줄 한국어 메시지로 변환
export function friendlyError(provider, status, bodyText) {
  let code = '';
  let message = '';
  try {
    const j = JSON.parse(bodyText);
    code = j?.error?.type || j?.error?.code || j?.type || '';
    message = j?.error?.message || j?.message || '';
  } catch {
    message = bodyText;
  }

  if (provider === 'GPT') {
    if (status === 429 && /insufficient_quota|exceeded your current quota/i.test(code + message)) {
      return (
        '지피티(OpenAI) 사용 크레딧이 없습니다. ' +
        'https://platform.openai.com/settings/organization/billing 에서 결제수단을 등록하고 크레딧을 충전하세요. ' +
        '(ChatGPT Plus 구독과는 별개로 청구됩니다.)'
      );
    }
    if (status === 429) {
      return '지피티(OpenAI) 요청이 일시적으로 많습니다. 잠시 후 다시 시도하세요.';
    }
    if (status === 401) {
      return 'OpenAI API 키가 유효하지 않습니다. .env의 OPENAI_API_KEY를 확인하세요.';
    }
    if (status === 404 || /model/i.test(message)) {
      return `OpenAI 모델 호출 오류: ${message || '모델 ID를 확인하세요 (.env의 OPENAI_MODEL).'}`;
    }
  }

  if (provider === 'Claude') {
    if (status === 401) {
      return 'Anthropic API 키가 유효하지 않습니다. .env의 ANTHROPIC_API_KEY를 확인하세요.';
    }
    if (status === 429) {
      return '클로드(Anthropic) 요청 한도에 걸렸거나 크레딧이 부족합니다. 잠시 후 재시도하거나 콘솔에서 잔액을 확인하세요.';
    }
    if (status === 400 && /model/i.test(message)) {
      return `Anthropic 모델 ID 오류: ${message} (.env의 ANTHROPIC_MODEL 확인)`;
    }
  }

  return `${provider} API 오류 ${status}: ${(message || bodyText).slice(0, 300)}`;
}

function mockReply(who, userContent) {
  const round = (userContent.match(/라운드/g) || []).length;
  return (
    `[MOCK ${who}] 이것은 API 키 없이 동작하는 모의 응답입니다. ` +
    `상대 의견을 검토했고, 핵심 쟁점에 대해 ${round % 2 === 0 ? '대체로 동의' : '일부 이견'}합니다. ` +
    `실제 토론을 하려면 .env에 API 키를 넣고 MOCK=0 으로 설정하세요.`
  );
}

export async function callGPT(systemPrompt, userContent) {
  if (isMock()) return mockReply('GPT', userContent);

  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY 가 설정되지 않았습니다 (.env 확인).');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: openaiModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(friendlyError('GPT', res.status, detail));
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI 응답이 비어 있습니다.');
  return text.trim();
}

export async function callClaude(systemPrompt, userContent) {
  if (isMock()) return mockReply('Claude', userContent);

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY 가 설정되지 않았습니다 (.env 확인).');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: anthropicModel(),
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(friendlyError('Claude', res.status, detail));
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error('Anthropic 응답이 비어 있습니다.');
  return text.trim();
}

// provider 설정 스냅샷
export const PROVIDER_INFO = {
  get mock() {
    return isMock();
  },
  get openaiModel() {
    return openaiModel();
  },
  get anthropicModel() {
    return anthropicModel();
  },
};
