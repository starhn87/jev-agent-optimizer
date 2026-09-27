# Jev Utils

[TypeSafe 공식 API·SDK](https://docs.typesafe.ai/sdk/javascript)를 사용하는 앱을 위한 **응답 검증·관측·평가 유틸리티**입니다. TypeSafe의 공식 패키지는 아니며, API 호출과 질문 정의는 공식 SDK를 그대로 사용합니다.

## 제공하는 유틸리티

### 응답 검증·관측: `@starhn87/jev-decisions`

| 함수 | 하는 일 | 결과 |
| --- | --- | --- |
| `validateAnswers(questions, answers)` | 질문 ID, 답변 종류, 허용 선택지, 확률 범위·합계, Score 값·기준 일치 여부 검사 | 성공 시 SDK 답변, 실패 시 문제의 `path`와 `code` |
| `observe({ questions, run, context })` | 전달한 SDK 호출 실행, 시간 측정·응답 검증·오류 분류 | `ok`, 답변 또는 실패 정보, 관측 메타데이터 |
| `toObservation(questions, outcome, context)` | 이미 받은 SDK 응답이나 오류를 검사하고 모델·요청 ID·처리 시간·토큰 사용량을 같은 형식으로 정리 | `ok`, 답변 또는 실패 종류, 관측 메타데이터 |

`observe`와 `toObservation`은 시간 초과·취소·네트워크·HTTP 오류 등을 구분합니다. 알 수 없는 사용량은 `null`로 남기고 요청 원문·오류 메시지를 복사하지 않습니다. [응답 유틸리티 API](packages/decisions/README.md).

### 사례 평가·집계: `@starhn87/jev-eval`

| 함수 | 하는 일 | 결과 |
| --- | --- | --- |
| `evaluateCases(cases, { run, judge, concurrency })` | 앱이 제공한 실행 함수와 정답 판정 함수로 사례를 평가 | 사례별 적용·판단보류·실패 기록과 전체 집계 |
| `summarize(rows)` | 기존 평가 기록을 집계 | 정답·실패·보류·미라벨 수, 모든 사례가 정답인 그룹 수, 처리 시간 p50·p95, 확인된 토큰 합계와 사용량 미상 건수 |

`evaluateCases`의 실제 API 호출 여부는 전달한 `run` 함수에 달려 있습니다. `summarize`는 기존 기록만 읽어 계산합니다. [평가 데이터 형식과 API](packages/eval/README.md).

### 주간 보고 보조: `@starhn87/jev-eval/weekly`

| 함수 | 하는 일 |
| --- | --- |
| `reportWindow(now)` | 최근 7일의 UTC 시작·종료 시각과 한국 시간 기준 월요일의 주차 키 계산 |
| `writeWeeklyIssue({ repo, window, markdown, publish })` | 기본은 로컬 Markdown 초안 저장. `publish: true`일 때 지정한 저장소의 주간 이슈 생성·갱신 |
| `mergeGenerated(previous, fresh)` | 생성된 보고 블록만 교체하고 사람이 작성한 메모·체크리스트 보존 |
| `formatMetric(value)` | 숫자를 한국어 표기법으로 표시하고 값이 없으면 `미상` 표시 |
| `github(args)` | 주간 이슈 게시에 쓰는 GitHub CLI 명령 실행 함수 |

자료 수집·보고 내용·게시 대상·일정은 호출자가 정합니다. 이슈 게시는 설치된 `gh`와 기존 GitHub 인증을 사용합니다. [주간 보고 API](packages/eval/README.md#weekly-issues).

앱이 질문·모델·시간 제한·재시도·판단 적용 기준과 관측 저장을 관리합니다. 유틸리티는 받은 결과를 검사하고 정리합니다. [구현 경계와 공식 도구와의 관계](docs/purpose.md).

## 프로젝트에 설치하기

Node.js 22 이상, npm, Git이 필요합니다. 기존 npm 프로젝트가 `my-app`이라면:

```sh
git clone https://github.com/starhn87/jev-utils.git
cd jev-utils
npm run connect -- ../my-app
```

`connect`는 대상 프로젝트에 다음 세 패키지와 두 프로젝트 스킬 파일을 설치합니다.

| 설치 항목 | 설치 위치 | 용도 |
| --- | --- | --- |
| 공식 `@typesafe-ai/sdk@0.6.0` | `dependencies` | 앱에서 Jev API 호출, 질문 정의, 시간 제한·취소·재시도 설정 |
| `@starhn87/jev-decisions@0.3.0` | `dependencies` | 서버 코드에서 `validateAnswers`·`observe`·`toObservation` 사용 |
| `@starhn87/jev-utils@0.5.0` | `devDependencies` | 프로젝트의 `npm run jev`로 샘플 질문 실행·관측 파일 집계 |

`package.json`에 위 의존성과 `jev` 명령을 추가하고, `npm install`로 `package-lock.json`·`node_modules/`를 갱신합니다. 프로젝트의 install/postinstall 스크립트는 실행하지 않습니다. `vendor/jev-utils/`에는 버전이 고정된 유틸리티·CLI 패키지 파일과 연결 기록을 보관합니다.

**`@starhn87/jev-eval`은 `connect`로 설치하지 않습니다.** 기존 관측 파일을 CLI로 집계하려면 `npm run jev -- eval observations.jsonl`을 사용합니다. 앱 코드에서 `summarize`·`evaluateCases`·주간 보고 함수를 import하려면 [평가 패키지를 별도로 설치](packages/eval/README.md)합니다.

**서버 키 설정과 앱의 실제 호출 코드는 별도로 구현해야 합니다.** Shadow 수집·주간 보고·배포도 별도 작업입니다.

pnpm·yarn·Deno는 해당 실행 환경에 맞게 수동 설치합니다. [설치 범위·수동 설치·서버 적용](docs/integration.md).

### 프로젝트 스킬에는 무엇이 들어가나요?

프로젝트 스킬은 **Codex·Claude Code에 Jev Utils의 사용법을 알려주는 설명서**입니다. “Jev로 이 샘플을 시험해줘” 같은 작업을 할 때 어떤 명령을 실행하고 결과를 어떻게 확인할지 알려줍니다. 이 설명서를 작업하는 저장소 안에 보관하므로 프로젝트 스킬이라고 부릅니다.

`connect`는 이 저장소의 [`jev-utils` 설명서](skills/jev-utils/SKILL.md)를 두 위치에 같은 내용으로 복사합니다.

| 생성 파일 | 읽는 에이전트 |
| --- | --- |
| `.agents/skills/jev-utils/SKILL.md` | Codex |
| `.claude/skills/jev-utils/SKILL.md` | Claude Code |

안내문에는 프로젝트 루트에서 `npm run jev`를 실행하는 방법, 키 설정 확인, `decide`·`run`으로 샘플 질문 실행, `eval`로 기존 관측 파일 집계, 결과의 `ok`·실패·불확실성을 확인하는 방법이 들어 있습니다. 팀원이 같은 파일을 커밋받으면 같은 CLI 사용 안내를 공유합니다.

연결한 프로젝트에서 새 에이전트 세션을 열고 다음처럼 요청할 수 있습니다.

> 이 프로젝트의 Jev 질문을 샘플 문의 3개로 실행하고, 입력·결과·처리 시간을 표로 정리해줘.
>
> observations.jsonl을 집계해서 실패·판단보류·미라벨 수와 처리 시간 p95를 보여줘.

에이전트는 작업과 스킬의 설명이 맞으면 스킬을 선택할 수 있습니다. 이름을 꼭 언급할 필요는 없으며 선택과 실행은 작업 맥락에 따릅니다. [Codex 스킬 선택·경로](https://developers.openai.com/codex/skills/), [Claude Code 스킬 선택·경로](https://code.claude.com/docs/en/skills).

이 스킬은 CLI 실험과 집계를 안내합니다. **TypeSafe 공식 `typesafe-ai` 스킬은 `connect` 설치 대상이 아니며**, API 연동·질문 설계에 필요하면 아래 안내로 별도 설치합니다. [보조 스킬 상세 안내](docs/installation.md).

## 공식 SDK 호출에 응답 검증 추가하기

설치한 앱의 서버 코드에서 사용합니다. API 키는 서버 환경의 `TYPESAFE_API_KEY`로 전달합니다.

```ts
import { TypeSafeClient, choice } from '@typesafe-ai/sdk';
import { observe } from '@starhn87/jev-decisions';

const client = new TypeSafeClient();
const questions = {
  kind: choice('이 문의는 계정 지원에 관한 내용인가요?', {
    support: '계정 설정이나 로그인 문의',
    other: '계정 지원 외 문의',
    uncertain: '판단할 정보가 부족한 문의',
  }),
};

const result = await observe({
  questions,
  run: () => client.systemOne({
    state: { message: '계정 설정을 변경하고 싶어요' }, questions,
  }, { timeout: 1200 }).withResponse(),
  context: {
    definitionId: 'inquiry-kind', definitionVersion: '1',
    requestedModel: client.defaultModel,
  },
});
if (result.ok) console.log(result.answers.kind.choice);
else if (result.error.kind === 'invalid_response') console.log(result.error.issues);
else console.log(result.error.kind);
```

`observe`는 전달한 `run`을 한 번 실행하고, 응답 검증이 끝날 때까지의 시간을 측정합니다. 시간 제한·취소·재시도는 공식 SDK 옵션을 그대로 사용합니다. 결과 저장·판단 적용·보류는 앱에서 처리합니다. 알 수 없는 메타데이터는 `null`입니다.

응답 검사만 필요하면 `validateAnswers`를 단독으로 사용할 수 있습니다. 실패 예시는 `{ ok: false, issues: [{ path: ['kind', 'choice'], code: 'invalid_choice' }] }`입니다. 검증은 응답 형식을 확인하며, 의미상 정답과 적용 기준은 앱의 사례로 평가합니다. 라이브러리 사용에 CLI나 스킬은 필요하지 않습니다. [검증·관측 API와 0.2 버전에서의 변경](packages/decisions/README.md), [평가·집계 API](packages/eval/README.md).

### 여러 프로젝트에서 공유하는 이점

각 앱에 같은 라이브러리 버전을 설치해 검증·오류 분류·측정 규칙을 재사용한다는 뜻입니다. 동시에 실행하거나 중앙 서버에 연결할 필요는 없습니다.

- 확률의 반올림 허용이나 오류 분류를 고칠 때 공통 구현과 테스트를 한곳에서 관리합니다.
- 요청 실패·사용량 미상·시간 측정의 의미가 같아져 프로젝트마다 같은 집계 도구를 쓸 수 있습니다.
- 앱에는 질문과 업무 정책이 남아, 전송·관측 처리 코드를 반복 작성하지 않아도 됩니다.

앱이 고정한 버전을 갱신해야 수정이 반영됩니다. 서로 다른 질문의 정확도나 지연을 그대로 비교할 수는 없으며, 비용·정확도가 자동으로 개선되는 것도 아닙니다.

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
