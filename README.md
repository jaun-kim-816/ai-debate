# AI Debate — 클로드 × 지피티 × 나

한 주제에 대해 **클로드(Anthropic), 지피티(OpenAI), 그리고 나**가 계속 토론하는 웹 앱입니다.
답변을 수동으로 복붙해서 양쪽에 옮길 필요 없이, 한 화면에서 토론이 누적됩니다.

## 동작 방식

- **주제**를 입력하면 토론 세션이 생성되고 디스크(`data/*.json`)에 영구 저장됩니다.
- 각 AI는 **전체 대화록과 상대 AI의 직전 답변**을 보고 발언합니다.
- 두 가지 모드:
  - **수동 모드** — 한 라운드(클로드 → 지피티) 후 정지. 내가 의견/방향을 추가하고 다음 라운드를 돌립니다.
  - **자동 모드** — 지정한 N라운드를 자동으로 진행한 뒤, 합의/이견/열린 질문을 요약합니다.
- 언제든 "지금 요약" 버튼으로 중간 정리를 받을 수 있습니다.

## 실행

```bash
cd ai-debate
npm install
cp .env.example .env       # 키 입력
npm start                  # http://localhost:5178
```

`.env`:

```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_MODEL=gpt-4o            # 선택
ANTHROPIC_MODEL=claude-sonnet-4-6   # 선택
PORT=5178                     # 선택
```

### API 키 없이 먼저 둘러보기

```bash
MOCK=1 npm start
```

`MOCK=1`이면 실제 API를 호출하지 않고 모의 응답으로 UI/흐름 전체를 시험할 수 있습니다.

## 테스트

```bash
npm test    # MOCK 모드로 전체 흐름 E2E 검증 (네트워크 불필요)
```

## API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/info` | 모델/모드 정보 |
| GET | `/api/sessions` | 세션 목록 |
| POST | `/api/sessions` | 세션 생성 `{topic, mode, autoRounds}` |
| GET | `/api/sessions/:id` | 세션 상태 |
| DELETE | `/api/sessions/:id` | 세션 삭제 |
| POST | `/api/sessions/:id/round` | 한 라운드 (클로드→지피티) |
| POST | `/api/sessions/:id/auto` | N라운드 자동 + 요약 |
| POST | `/api/sessions/:id/summary` | 지금 요약 |
| POST | `/api/sessions/:id/message` | 내 의견 추가 `{content}` |

## 구조

```
ai-debate/
├── server.js              # Express API + 정적 프론트엔드, 내장 .env 로더
├── lib/
│   ├── providers.js       # callClaude / callGPT (+ MOCK)
│   ├── debate.js          # 라운드/자동/요약 오케스트레이션
│   └── store.js           # 세션 영구 저장 (data/*.json)
├── public/                # index.html · style.css · app.js
└── test/smoke.mjs         # MOCK 기반 E2E 테스트
```

의존성은 `express` 하나뿐입니다. `.env` 로딩과 API 호출은 Node 내장 기능(fetch)으로 처리합니다 (Node 18+).
