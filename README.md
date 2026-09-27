# Jev Utils

[TypeSafe 공식 API·SDK](https://docs.typesafe.ai/sdk/javascript)를 사용하는 앱을 위한 **응답 검증·관측·평가 유틸리티**입니다. TypeSafe의 공식 패키지는 아니며, API 호출과 질문 정의는 공식 SDK를 그대로 사용합니다.

## 제공하는 기능

| 패키지 | 기능 |
| --- | --- |
| `@starhn87/jev-decisions` | `validateAnswers`: 질문에 맞게 응답 ID·선택지·확률·Score를 검사 |
| `@starhn87/jev-decisions` | `toObservation`: 받은 SDK 응답·오류를 공통 관측 형식으로 변환 |
| `@starhn87/jev-eval` | 사례 평가, 실패·판단보류·미라벨 구분, 지연·사용량 집계 |

앱이 질문·모델·시간 제한·재시도·판단 적용 기준과 관측 저장을 관리합니다. 유틸리티는 받은 결과를 검사하고 정리합니다. [구현 경계와 공식 도구와의 관계](docs/purpose.md).

## 프로젝트에 설치하기

Node.js 22 이상, npm, Git이 필요합니다. 기존 npm 프로젝트가 `my-app`이라면:

```sh
git clone https://github.com/starhn87/jev-utils.git
cd jev-utils
npm run connect -- ../my-app
```

`connect`는 대상 프로젝트에 공식 SDK, 응답 유틸리티, 개발용 CLI와 프로젝트 스킬을 설치합니다. `package.json`·`package-lock.json`·`vendor/jev-utils/`·두 스킬 폴더가 변경됩니다. **서버 키 설정과 앱의 실제 호출 코드는 별도로 구현해야 합니다.** Shadow 수집·주간 보고·배포도 별도 작업입니다.

pnpm·yarn·Deno는 해당 실행 환경에 맞게 수동 설치합니다. [설치 범위·수동 설치·서버 적용](docs/integration.md).

## 공식 SDK 호출에 응답 검증 추가하기

설치한 앱의 서버 코드에서 사용합니다. API 키는 서버 환경의 `TYPESAFE_API_KEY`로 전달합니다.

```ts
import { TypeSafeClient, choice } from '@typesafe-ai/sdk';
import { validateAnswers } from '@starhn87/jev-decisions';

const client = new TypeSafeClient();
const questions = {
  kind: choice('이 문의는 계정 지원에 관한 내용인가요?', {
    support: '계정 설정이나 로그인 문의',
    other: '계정 지원 외 문의',
    uncertain: '판단할 정보가 부족한 문의',
  }),
};

const response = await client.systemOne({
  state: { message: '계정 설정을 변경하고 싶어요' },
  questions,
});
const answers = validateAnswers(questions, response.answers);
if (!answers) throw new Error('질문에 맞지 않는 응답입니다.');
console.log(answers.kind.choice);
```

`validateAnswers`는 형식을 검사합니다. 의미상 정답과 적용 기준은 앱의 사례로 평가합니다. SDK 오류까지 같은 형식으로 기록하려면 `toObservation`을 사용합니다. [검증·관측 API](packages/decisions/README.md), [평가·집계 API](packages/eval/README.md).

## 에이전트에서 공식 TypeSafe 스킬 사용하기

API 연동과 질문 설계에는 [TypeSafe 공식 스킬](https://github.com/typesafe-ai/skills)을 사용합니다.

Claude Code:

```sh
claude plugin marketplace add typesafe-ai/skills
claude plugin install typesafe@typesafe-ai
```

Codex 등 다른 에이전트:

```sh
npx skills add typesafe-ai/skills --skill typesafe-ai
```

설치 과정에서 Codex를 선택합니다. 기본은 프로젝트 설치이며 여러 저장소에서 사용하려면 `-g`를 추가합니다. [공식 설치·업데이트 안내](https://docs.typesafe.ai/agent-skill).

이 저장소의 `jev-utils` 스킬은 로컬 CLI로 샘플을 실행하거나 관측 파일을 집계할 때 사용합니다. [CLI 실행](docs/cli.md), [보조 스킬 설치](docs/installation.md).

## 개발과 릴리스

```sh
npm ci
npm run check
npm test
npm run test:compat
```

라이브러리와 CLI는 저장소의 버전이 고정된 패키지 파일로 설치합니다. npm registry 게시는 아직 하지 않았습니다. [릴리스 절차](docs/releases.md).
