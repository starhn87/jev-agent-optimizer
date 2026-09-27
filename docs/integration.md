# 다른 프로젝트에 설치하고 서버에 적용하기

설치와 서버 적용은 별도 작업입니다. `connect`는 공식 SDK·응답 유틸리티·CLI·스킬을 설치합니다. 서버에서 Jev 판단을 사용하려면 기존 요청 처리에 공식 SDK 호출과 필요한 응답 검증을 구현해야 합니다. 에이전트 스킬은 CLI 호출과 평가 작업의 안내입니다.

## `connect`가 하는 설치 작업

지원 대상은 npm을 쓰는 독립 프로젝트 또는 워크스페이스 루트입니다. pnpm·yarn·bun, 워크스페이스 내부 패키지, 기존의 다른 Jev 설치 방식은 자동으로 이전하지 않습니다. Edge 함수가 앱 루트와 별도의 의존성을 쓰면 해당 실행 환경에 맞는 수동 설치가 필요합니다.

Jev Utils를 clone한 폴더에서 실행합니다. 다음과 같이 두 저장소가 같은 상위 폴더에 있다고 가정합니다.

```text
projects/
  jev-utils/
  my-app/
```

Jev Utils 폴더에서:

```sh
npm run connect -- ../my-app
```

명령이 저장소에 준비된 패키지로 설치를 처리합니다. Jev Utils 폴더에서 `npm ci`나 빌드를 먼저 할 필요가 없습니다. 대상 폴더의 변경 내역은 다음과 같습니다.

- `package.json`: `@typesafe-ai/sdk@0.6.0`과 `@starhn87/jev-decisions` 운영 의존성, `@starhn87/jev-utils` 개발 의존성, `jev` npm 명령을 추가합니다.
- `package-lock.json`·`node_modules/`: `npm install`로 의존성을 설치하고 lockfile을 갱신합니다. 프로젝트의 install/postinstall 스크립트는 실행하지 않습니다.
- `vendor/jev-utils/`: 두 패키지 파일과 소유 파일의 해시를 기록한 `connection.json`을 보관합니다.
- `.agents/skills/jev-utils/SKILL.md`·`.claude/skills/jev-utils/SKILL.md`: 두 에이전트의 프로젝트 스킬을 생성합니다.

프로젝트 스킬은 이 저장소의 `skills/jev-utils/SKILL.md`를 두 위치에 복사한 Markdown 안내문입니다. Codex·Claude Code에 프로젝트의 `npm run jev` 명령, 샘플 질문 실행, 기존 관측 파일 집계와 결과 확인 방법을 알려줍니다. TypeSafe 공식 `typesafe-ai` 스킬은 이 명령으로 설치하지 않습니다. [스킬 내용·사용 예](../README.md#프로젝트-스킬에는-무엇이-들어가나요), [공식 스킬 별도 설치](../README.md#에이전트에서-공식-typesafe-스킬-사용하기).

`@starhn87/jev-eval` 라이브러리도 설치 대상에 포함되지 않습니다. CLI의 `eval`로 파일을 집계할 수 있으며, 앱 코드에서 평가·주간 보고 함수를 import하려면 [평가 패키지를 별도로 설치](../packages/eval/README.md)합니다.

**여기까지는 개발 도구 설치입니다.** 앱 코드를 수정하거나 서버 API 키를 설정하지 않습니다. API 호출은 이후 CLI의 `decide`·온라인 `demo`·`run`을 실행하거나 앱에서 라이브러리를 호출할 때 발생합니다. Shadow 기록 수집, 주간 이슈·PR, CI 워크플로와 배포는 자동으로 생성하지 않습니다.

`my-app`에서 바로 실행할 수 있습니다.

```sh
npm run jev -- demo --offline
npm run jev -- init
npm run jev -- decide --text "계정 설정을 변경하고 싶어요" --question "계정 지원 문의인가요?" --choices "예,아니오,판단보류"
```

이미 CLI 키를 설정했다면 `init`은 생략합니다. 에이전트에게는 “샘플 문의를 계정 지원·기타·판단보류로 분류해줘”처럼 작업을 요청합니다. 새 세션에서 프로젝트 스킬을 읽으며, 맥락에 맞으면 이름을 언급하지 않아도 선택할 수 있습니다. [스킬 사용 방법](installation.md).

기존 `jev` 명령·같은 패키지 의존성·스킬에 충돌이 있으면 변경을 시작하지 않습니다. 이전에 이 명령으로 설치한 프로젝트는 같은 명령으로 갱신하며, 직접 수정한 관리 파일은 덮어쓰지 않습니다. npm 설치가 실패하면 관리 파일과 manifest·lockfile을 복원합니다. `node_modules`는 일부 바뀔 수 있으므로 실패 시 기존 프로젝트의 설치 명령으로 복구합니다.

## 서버에서 공식 SDK 사용하기

앱은 공식 SDK의 질문 빌더와 `systemOne()`을 사용합니다. 간단한 응답 검사만 필요하다면 SDK 결과에 `validateAnswers(questions, response.answers)`를 적용하면 됩니다. 기존 관측 형식도 공유하려면 다음처럼 사용합니다.

```ts
import { TypeSafeClient, choice } from '@typesafe-ai/sdk';
import { toObservation } from '@starhn87/jev-decisions';

const questions = {
  kind: choice('계정 지원 문의인가요?', {
    support: '계정 설정이나 로그인 문의',
    other: '계정 지원 외 문의',
    uncertain: '분류할 정보가 부족한 문의',
  }),
};
const client = new TypeSafeClient({
  apiKey, defaultModel: 'jev-1.13.0', retry: { maxRetries: 0 }, logLevel: 'off',
});
const started = performance.now();
let outcome;
try {
  outcome = await client.systemOne({ state: { message }, questions }, {
    timeout: 1200, signal,
  }).withResponse();
} catch (error) {
  outcome = { error };
}
const result = toObservation(questions, outcome, {
  definitionId: 'inquiry-kind', definitionVersion: '1',
  requestedModel: client.defaultModel, durationMs: performance.now() - started,
});
```

앱은 `result.ok`를 확인한 뒤 검증된 답변을 사용하고, 불확실성·실패 시 기존 처리 유지나 검토 요청 등 자체 정책을 적용합니다. `aborted`이면 해당 요청의 후속 작업을 중단합니다. 저장할 필요가 있으면 앱의 DB나 로그에 `result`를 전달합니다. 유틸리티가 저장을 수행하지 않습니다.

시간 제한·재시도·모델·헤더·취소 등 호출 옵션은 공식 SDK에 전달합니다. 입력 크기 제한과 관측의 수명도 앱에서 관리합니다. CLI의 `init`에 저장한 키는 서버에서 자동으로 읽지 않으므로 앱의 서버 비밀 설정에서 SDK에 키를 전달합니다. [유틸리티 API와 런타임별 사용](../packages/decisions/README.md).

## CI와 배포에 포함하기

`connect`는 빌드된 라이브러리와 CLI를 버전이 고정된 npm 패키지 파일로 `vendor/jev-utils/`에 보관합니다. 다음 파일을 앱 저장소에 함께 커밋하면 CI와 다른 개발 환경에서 평소처럼 `npm ci`로 설치합니다.

- `package.json`과 `package-lock.json`
- `vendor/jev-utils/` 전체
- `.agents/skills/jev-utils/`와 `.claude/skills/jev-utils/`

외부 clone이나 전역 CLI가 필요하지 않습니다. 운영 환경에서 `npm ci --omit=dev`로 설치하면 공식 SDK와 응답 유틸리티를 포함하고 CLI는 제외합니다. 서버의 API 키는 앱의 비밀 설정으로 별도 전달합니다.

업데이트는 Jev Utils clone을 갱신한 다음 `npm run connect -- ../my-app`을 다시 실행하고, 앱의 질문 사례를 평가합니다. 변경된 연결 파일을 커밋해 반영합니다.

## 설치 명령을 쓰지 않는 경우

다른 패키지 관리자를 사용하거나 유틸리티만 필요하다면 clone에 포함된 버전이 고정된 패키지 파일을 프로젝트 의존성으로 직접 설치할 수 있습니다. 로컬 패키지 파일을 프로젝트에 보관하려면:

빌드된 현재 응답 유틸리티 버전 `0.2.1`는 Jev Utils의 `artifacts/`에 포함되어 있습니다. `my-app` 폴더에서:

```sh
mkdir -p vendor
cp ../jev-utils/artifacts/starhn87-jev-decisions-0.2.1.tgz vendor/
npm install @typesafe-ai/sdk@0.6.0 ./vendor/starhn87-jev-decisions-0.2.1.tgz
```

이 파일은 빌드된 검증·관측 유틸리티·타입·라이선스를 담은 npm 패키지입니다. 사용하는 패키지 관리자로 설치하고, 파일과 manifest·lockfile을 함께 커밋합니다. 이 수동 방식은 CLI나 프로젝트 스킬을 생성하지 않습니다.

## 다른 저장소에서 CLI로 시험하기

`connect`로 연결한 `my-app` 폴더에서:

```sh
npm run --silent jev -- decide --text "계정 설정을 변경하고 싶어요" --question "계정 지원 문의인가요?" --choices "예,아니오,판단보류" --json
```

이 방식은 질문을 시험하거나 개발 도구에서 판단을 호출할 때 사용합니다. JSON의 `ok`를 확인한 뒤 `answers`를 읽습니다. 앱의 실행 중 요청 처리는 위의 라이브러리 연결로 구현합니다.

기존 질문 정의는 `run questions.json --json`, 기존 관측 데이터는 `eval observations.jsonl`로 처리합니다. 파일 경로는 CLI를 호출한 작업 폴더 기준입니다. 관측 파일은 호출 결과와 정답 라벨 등으로 앱이 생성하며, 자동으로 수집되지 않습니다. [관측 데이터 형식과 평가](../packages/eval/README.md).

## 적용 전 확인하기

처음에는 현재 앱 동작을 유지하면서 같은 입력에 대한 Jev 결과를 비교합니다. 정답이 있는 사례에서 오답·실패·판단보류·처리 시간과 확인 가능한 사용량을 살핀 뒤 적용 기준을 정합니다. 운영 기록의 저장 위치, 샘플 수집, 주간 보고 일정은 사용하는 저장소에서 구성합니다.
