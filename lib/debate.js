// 토론 진행: 대화록으로 프롬프트 만들고 턴 실행
import { callClaude, callGPT } from './providers.js';
import { addMessage, save } from './store.js';

const SPEAKER_LABEL = {
  user: '사용자',
  claude: '클로드',
  gpt: '지피티',
  system: '진행',
};

function transcript(session) {
  return session.messages
    .map((m) => `### ${SPEAKER_LABEL[m.role] || m.role}\n${m.content}`)
    .join('\n\n');
}

function systemPrompt(session, speaker) {
  const me = speaker === 'claude' ? '클로드' : '지피티';
  const other = speaker === 'claude' ? '지피티' : '클로드';
  return [
    `당신은 "${me}" 입니다. 다른 AI "${other}", 그리고 한 명의 사용자와 함께`,
    `하나의 주제에 대해 지속적으로 토론하고 있습니다.`,
    `토론 주제: ${session.topic}`,
    '',
    '규칙:',
    `- 아래 전체 대화록을 읽고, ${other}와 사용자가 제기한 핵심 논점에 직접 반응하세요.`,
    '- 단순 동의가 아니라, 동의/반론을 근거와 함께 제시하세요.',
    '- 새로운 관점이나 빠진 고려사항이 있으면 추가하세요.',
    '- 간결하되 내용은 충실하게. 불필요한 인사말/메타발언은 생략.',
    '- 사용자가 사용하는 언어(주로 한국어)로 답변하세요.',
    `- 당신 차례입니다. "${me}"로서 다음 발언만 출력하세요.`,
  ].join('\n');
}

async function speak(session, speaker) {
  const sys = systemPrompt(session, speaker);
  const body =
    `다음은 지금까지의 전체 대화록입니다.\n\n` +
    `${transcript(session)}\n\n` +
    `---\n이제 "${speaker === 'claude' ? '클로드' : '지피티'}"로서 다음 발언을 하세요.`;
  const fn = speaker === 'claude' ? callClaude : callGPT;
  const reply = await fn(sys, body);
  addMessage(session, speaker, reply);
  return reply;
}

// 1라운드 = 클로드 -> 지피티
export async function runRound(session) {
  session.status = 'running';
  save(session);
  try {
    await speak(session, 'claude');
    await speak(session, 'gpt');
    session.round += 1;
  } finally {
    session.status = 'idle';
    save(session);
  }
  return session;
}

export async function runAuto(session) {
  session.status = 'running';
  save(session);
  try {
    const target = session.round + session.autoRounds;
    while (session.round < target) {
      await speak(session, 'claude');
      await speak(session, 'gpt');
      session.round += 1;
      save(session);
    }
    await runSummary(session);
    session.status = 'done';
  } finally {
    if (session.status === 'running') session.status = 'idle';
    save(session);
  }
  return session;
}

export async function runSummary(session) {
  const sys = [
    '당신은 중립적인 토론 정리자입니다.',
    `토론 주제: ${session.topic}`,
    '아래 대화록을 바탕으로 다음 형식으로 정리하세요:',
    '1. 합의된 점',
    '2. 남아있는 이견',
    '3. 아직 다루지 않은/열린 질문',
    '간결한 한국어 불릿으로 작성하세요.',
  ].join('\n');
  const body = `전체 대화록:\n\n${transcript(session)}`;
  const summary = await callClaude(sys, body);
  addMessage(session, 'system', `📋 요약\n\n${summary}`);
  return summary;
}

export async function addUserMessage(session, content) {
  addMessage(session, 'user', content);
  return session;
}
