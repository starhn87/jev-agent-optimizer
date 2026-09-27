# Jev Decision Kit

Jev의 작은 의미 판단을 검증 가능한 결과로 반환하고 평가하는 TypeScript 도구입니다. 질문·업무 정책·임계값·운영 데이터는 사용하는 애플리케이션이 소유합니다.

## 애플리케이션에 설치하기

Node.js 22 이상과 npm이 필요합니다. 현재는 GitHub 릴리스에 있는 npm 패키지를 바로 설치합니다. npm registry 게시는 아직 하지 않았습니다.

```sh
npm install https://github.com/starhn87/jev-decision-kit/releases/download/packages-v0.1.0/starhn87-jev-decisions-0.1.0.tgz
```

Workers, Deno, Node에서 같은 ESM을 사용합니다. 공식 TypeSafe SDK가 번들에 포함되어 별도 런타임 의존성을 설치할 필요가 없습니다.

아래를 `decision.mjs`로 저장하세요. TypeScript에서도 같은 import를 사용하며 질문의 선택지 타입이 추론됩니다.

```js
import { createDecisionClient } from '@starhn87/jev-decisions';

const client = createDecisionClient({
  apiKey: process.env.TYPESAFE_API_KEY ?? '',
  model: 'jev-1.13.0',
});
const result = await client.decide({
  definitionId: 'support-scope', definitionVersion: '1',
  state: { message: '계정 설정을 변경하고 싶어요' },
  questions: { scope: { type: 'choice', criteria: {
    relevant: '계정 지원과 관련된 요청',
    unrelated: '계정 지원과 무관한 요청',
    uncertain: '문맥이 부족해 판단할 수 없음',
  } } },
}, { timeoutMs: 1200 });

if (result.ok) console.log(result.answers.scope.choice, result.meta.durationMs);
else console.log(result.error.kind);
```

프로젝트의 `.env`에 `TYPESAFE_API_KEY=발급받은_키`를 넣고 실행합니다.

```sh
node --env-file=.env decision.mjs
```

Workers에서는 키를 서버 binding으로 전달합니다. Deno는 [런타임별 예제](packages/decisions/README.md#deno)의 릴리스 ESM을 직접 import할 수 있습니다. 패키지 버전과 lockfile을 함께 고정하고, `.env`는 Git에서 제외하세요.

## 판단과 평가

- Choice·Score·Noul 응답을 질문별 타입과 런타임 검증으로 확인합니다.
- 전체 deadline, 요청 취소, HTTP·전송·응답 오류를 구분합니다. 기본 deadline은 1200ms이고 재시도는 없습니다.
- 질문·모델 버전, 지연·토큰 사용량을 반환합니다. 누락된 사용량은 `null`로 유지합니다.
- 키·원문을 자동 기록하거나 도메인 동작·설정 변경을 실행하지 않습니다.

별도 Node 평가 도구는 실패·보류·정답 라벨이 없는 사례까지 집계합니다.

```sh
npm install https://github.com/starhn87/jev-decision-kit/releases/download/packages-v0.1.0/starhn87-jev-eval-0.1.0.tgz
npx jev-eval observations.jsonl
```

[평가 API와 소비 저장소의 주간 이슈 작성](packages/eval/README.md). 관측 분포와 확신은 의미 정확도를 입증하지 않으며, 실제 적용 전 업무별 평가셋과 정책을 검증해야 합니다.

## Codex·Claude 에이전트 도구 실행하기

macOS, Node.js 22 이상, Codex 또는 Claude Code와 TypeSafe API 키가 필요합니다.

```sh
git clone https://github.com/starhn87/jev-decision-kit.git
cd jev-decision-kit
npm ci
cp -n .env.example .env
open -e .env
```

`.env`에 `TYPESAFE_API_KEY`를 입력한 뒤:

```sh
npm run setup
npm run doctor
```

Codex 앱은 재시작 후 새 작업에서 `Jev Auto`를 선택하고, Claude Code는 새 세션을 시작하세요. 한 앱만 연결하려면 `npm run setup -- codex` 또는 `npm run setup -- claude`, 제거하려면 `npm run disable`을 사용합니다. [업데이트·제거와 상세 사용법](apps/agent-optimizer/README.md).

## 저장소 구성

- `packages/decisions`: Web API 기반 공통 판단 패키지.
- `packages/eval`: Node 평가·보고 도구. 게시할 이슈 저장소는 호출자가 지정합니다.
- `apps/agent-optimizer`: 모델·effort 라우팅과 검색·기억 선별을 사용하는 Codex/Claude 도구.

라이브러리 설치로 데스크톱 설정이나 프록시를 변경하지 않습니다. 에이전트 도구의 CLI 이름과 기존 플러그인 식별자는 유지합니다.

## 개발과 배포

저장소를 clone한 뒤 루트에서 실행합니다.

```sh
npm ci
npm run check
npm test
npm run test:compat
npm run pack:decisions
npm run pack:eval
```

실제 npm tarball을 독립 프로젝트에 설치해 import·타입·CLI를 검사하고, 같은 산출물을 Workers·Deno에서 검증합니다. [릴리스 절차](docs/releases.md).
