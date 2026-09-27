# 다른 저장소에 연결하기

앱의 서버에서 판단을 실행하려면 판단 라이브러리를 연결하고, 질문을 먼저 시험하려면 로컬 CLI를 호출합니다. 에이전트 스킬은 이 CLI 호출과 평가 작업을 에이전트에게 맡길 때 사용합니다.

## 명령 하나로 준비하기

Jev Decision Kit를 clone한 폴더에서 실행합니다. 다음과 같이 두 저장소가 같은 상위 폴더에 있다고 가정합니다.

```text
projects/
  jev-decision-kit/
  my-app/
```

Jev Decision Kit 폴더에서:

```sh
npm run connect -- ../my-app
```

명령이 저장소에 준비된 패키지로 설치를 처리합니다. 연결만 할 때는 Jev Decision Kit 폴더에서 `npm ci`나 빌드를 먼저 할 필요가 없습니다. `my-app`의 `package.json`에 판단 라이브러리를 운영 의존성으로, CLI를 개발 의존성으로 추가하고 `jev` npm 명령을 만듭니다. Codex·Claude Code가 읽을 프로젝트 스킬도 생성합니다.

`my-app`에서 바로 실행할 수 있습니다.

```sh
npm run jev -- demo --offline
npm run jev -- init
npm run jev -- decide --text "계정 설정을 변경하고 싶어요" --question "계정 지원 문의인가요?" --choices "예,아니오,판단보류"
```

이미 CLI 키를 설정했다면 `init`은 생략합니다. 에이전트에게는 “샘플 문의를 계정 지원·기타·판단보류로 분류해줘”처럼 작업을 요청합니다. 새 세션에서 프로젝트 스킬을 읽으며, 맥락에 맞으면 이름을 언급하지 않아도 선택할 수 있습니다. [스킬 사용 방법](installation.md).

자동 연결은 npm을 쓰는 독립 프로젝트 또는 워크스페이스 루트에서 지원합니다. 기존 `jev` 명령·같은 패키지 의존성·스킬에 충돌이 있으면 변경을 시작하지 않습니다. 이미 연결한 프로젝트에서는 같은 명령으로 갱신하며, 직접 수정한 연결 파일은 덮어쓰지 않습니다. npm 설치가 실패하면 연결 파일과 manifest·lockfile을 복원합니다. 이 설치에서는 프로젝트의 install/postinstall 스크립트를 실행하지 않습니다.

## 서버 코드에 연결하기

기존 TypeScript 서버 코드에 다음과 같이 사용할 수 있습니다.

```ts
import { createDecisionClient } from '@starhn87/jev-decisions';

export async function classifyInquiry(message: string, apiKey: string, signal?: AbortSignal) {
  const result = await createDecisionClient({ apiKey, model: 'jev-1.13.0' }).decide({
    definitionId: 'inquiry-kind',
    definitionVersion: '1',
    state: { message },
    questions: {
      kind: {
        type: 'choice',
        instructions: '문의가 계정 지원에 관한 것인지 분류하세요.',
        criteria: {
          support: '계정 설정이나 로그인 등 계정 지원 문의',
          other: '계정 지원 외의 문의',
          uncertain: '분류하기에 정보가 부족한 문의',
        },
      },
    },
  }, { timeoutMs: 1200, signal });

  if (!result.ok) {
    if (result.error.kind === 'aborted') return { status: 'cancelled' as const };
    return { status: 'deferred' as const, reason: result.error.kind };
  }
  const { choice, confidence } = result.answers.kind;
  if (choice === 'uncertain') return { status: 'deferred' as const, reason: 'uncertain' as const };
  return { status: 'decided' as const, kind: choice, confidence };
}
```

서버의 기존 요청 처리에서 메시지와 서버 비밀 설정의 API 키를 이 함수에 전달합니다. `decided`이면 제안된 분류를 사용하고, `deferred`이면 기존 처리 유지나 검토 요청 등 프로젝트의 정책을 적용합니다. `cancelled`이면 해당 요청을 중단합니다. 이 상태 이름과 처리 방식은 연결 예제의 정책입니다.

CLI의 `setup`에 저장한 키는 CLI가 읽습니다. 서버 라이브러리는 사용자 폴더의 키를 자동으로 읽지 않으므로, 각 앱의 서버 환경변수나 비밀 설정에서 `apiKey`를 전달합니다.

질문·선택지·처리 기준은 앱이 정의합니다. 패키지는 응답의 선택지·확률·형식을 검증하고 오류를 구분하지만, 업무상 정답인지는 정답이 있는 사례로 평가합니다. [판단 API와 런타임별 예제](../packages/decisions/README.md).

## CI와 배포에 포함하기

`connect`는 빌드된 라이브러리와 CLI를 버전이 고정된 npm 패키지 파일로 `vendor/jev-decision-kit/`에 보관합니다. 다음 파일을 앱 저장소에 함께 커밋하면 CI와 다른 개발 환경에서 평소처럼 `npm ci`로 설치합니다.

- `package.json`과 `package-lock.json`
- `vendor/jev-decision-kit/` 전체
- `.agents/skills/jev-decision-kit/`와 `.claude/skills/jev-decision-kit/`

외부 clone이나 전역 CLI가 필요하지 않습니다. 운영 환경에서 `npm ci --omit=dev`로 설치하면 판단 라이브러리만 포함합니다. 서버의 API 키는 앱의 비밀 설정으로 별도 전달합니다.

업데이트는 Jev Decision Kit clone을 갱신한 다음 `npm run connect -- ../my-app`을 다시 실행하고, 앱의 질문 사례를 평가합니다. 변경된 연결 파일을 커밋해 반영합니다.

## 자동 연결을 쓰지 않는 경우

다른 패키지 관리자를 사용하거나 라이브러리만 필요하다면 버전이 고정된 [공개 릴리스 파일](../packages/decisions/README.md)을 프로젝트 의존성으로 직접 설치할 수 있습니다. 로컬 패키지 파일을 프로젝트에 보관하려면:

빌드된 현재 판단 라이브러리 버전 `0.1.2`는 Jev Decision Kit의 `artifacts/`에 포함되어 있습니다. `my-app` 폴더에서:

```sh
mkdir -p vendor
cp ../jev-decision-kit/artifacts/starhn87-jev-decisions-0.1.2.tgz vendor/
npm install ./vendor/starhn87-jev-decisions-0.1.2.tgz
```

이 파일은 빌드된 판단 코드·타입·라이선스를 담은 npm 패키지입니다. 사용하는 패키지 관리자로 설치하고, 파일과 manifest·lockfile을 함께 커밋합니다. 이 수동 방식은 CLI나 프로젝트 스킬을 생성하지 않습니다.

## 다른 저장소에서 CLI로 시험하기

`connect`로 연결한 `my-app` 폴더에서:

```sh
npm run --silent jev -- decide --text "계정 설정을 변경하고 싶어요" --question "계정 지원 문의인가요?" --choices "예,아니오,판단보류" --json
```

이 방식은 질문을 시험하거나 개발 도구에서 판단을 호출할 때 사용합니다. JSON의 `ok`를 확인한 뒤 `answers`를 읽습니다. 앱의 실행 중 요청 처리는 위의 라이브러리 연결로 구현합니다.

기존 질문 정의는 `run questions.json --json`, 기존 관측 데이터는 `eval observations.jsonl`로 처리합니다. 파일 경로는 CLI를 호출한 작업 폴더 기준입니다. 관측 파일은 호출 결과와 정답 라벨 등으로 앱이 생성하며, 자동으로 수집되지 않습니다. [관측 데이터 형식과 평가](../packages/eval/README.md).

## 적용 전 확인하기

처음에는 현재 앱 동작을 유지하면서 같은 입력에 대한 Jev 결과를 비교합니다. 정답이 있는 사례에서 오답·실패·판단보류·처리 시간과 확인 가능한 사용량을 살핀 뒤 적용 기준을 정합니다. 운영 기록의 저장 위치, 샘플 수집, 주간 보고 일정은 사용하는 저장소에서 구성합니다.
