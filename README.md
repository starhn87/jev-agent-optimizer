# Jev Decision Kit

공식 TypeSafe SDK 위에서 **응답 검증·실패 결과·관측 메타데이터의 형식을 여러 프로젝트가 공유**하도록 만든 작은 라이브러리와 시험용 CLI입니다. 모델의 판단은 Jev가 수행하고, 이 패키지는 받은 응답을 검사하고 같은 형식으로 반환합니다.

Jev를 호출하는 것만 필요하다면 [공식 SDK](https://github.com/typesafe-ai/typesafe-sdk-js)로 충분합니다. 이 패키지는 여러 앱에서 같은 응답 검사와 실패·평가 형식을 유지하려는 경우에 사용합니다. 정확도 향상이나 비용 절감은 아직 입증하지 않았습니다. [공식 SDK·Kev와의 비교와 유지할 이유](docs/purpose.md).

기존 npm 프로젝트에는 clone 후 [패키지·개발 도구 설치 명령](#다른-npm-프로젝트에-설치하기)을 실행할 수 있습니다. 앱의 실제 요청 처리에 적용하는 작업은 별도로 필요합니다.

## 바로 실행하기

Node.js 22 이상과 npm, Git이 필요합니다. 저장소를 받아 그 폴더에서 실행하세요.

```sh
git clone https://github.com/starhn87/jev-decision-kit.git
cd jev-decision-kit
npm ci
npm run setup
npm run demo
```

`npm ci`는 이 폴더 안에 필요한 의존성을 설치합니다. `npm run setup`은 CLI를 준비하고 TypeSafe API 키를 입력받습니다. 한 번 준비한 뒤에는 `npm run demo`로 바로 실행합니다.

입력한 키는 화면에 표시하지 않고 사용자 폴더 `~/.jev-decision-kit/.env`에 저장합니다. `demo`는 준비된 문장이 계정 지원 문의인지 Jev에 묻고, 입력·질문·선택지와 판단 결과를 함께 보여줍니다.

```text
Jev 판단 예제 — 실제 API 호출

입력 문장: 계정 설정을 변경하고 싶어요
질문: 이 문장은 계정 지원 문의인가요?
선택지: 예 / 아니오 / 판단보류

판단 결과: 예 — 계정 지원 문의에 해당합니다.
모델 신뢰도: 97.0%
처리 시간: 235ms (API 요청부터 응답 검증 완료까지)
Jev 모델: jev-1.13.0
```

위는 출력 예시이며 실제 결과·신뢰도·처리 시간은 실행마다 달라집니다. 신뢰도는 모델이 보고한 값이며, 정확도는 별도의 정답 데이터로 평가합니다.

키 없이 먼저 확인하려면 위의 `npm run setup` 대신 `npm run build`를 실행한 후:

```sh
npm run demo -- --offline
npm run cli -- eval --demo
```

`--offline`은 모의 응답을 사용하고, `eval --demo`는 준비된 관측 결과를 집계합니다. 둘 다 외부 API를 호출하지 않습니다.

## 내 문장 판단하기

```sh
npm run cli -- decide --text "계정 설정을 변경하고 싶어요" --question "고객 지원 문의인가?" --choices "예,아니오,판단보류"
```

질문과 선택지를 명령에 전달하면 결과를 바로 보여줍니다. 다른 프로그램에서 결과를 읽으려면 `npm run --silent cli -- decide ... --json`처럼 실행하세요. `--silent`는 npm의 실행 안내를 숨겨 JSON만 출력합니다. 정의해 둔 여러 질문은 `npm run cli -- run questions.json`, 수집한 관측 결과는 `npm run cli -- eval observations.jsonl`로 처리할 수 있습니다.

상태 확인과 전체 명령 안내:

```sh
npm run doctor
npm run cli -- --help
```

## 다른 npm 프로젝트에 설치하기

**`connect`는 패키지와 개발 도구를 설치하는 명령입니다. 실행해도 앱의 실제 요청 처리는 바뀌지 않습니다.** Jev Decision Kit를 clone한 폴더에서 대상 npm 프로젝트의 경로를 지정하세요. 이 clone의 의존성 설치나 빌드는 필요하지 않습니다.

```sh
npm run connect -- ../my-app
```

명령이 대상 프로젝트에서 하는 일은 다음과 같습니다.

| 변경 위치 | 실제 작업 |
| --- | --- |
| `package.json` | 판단 라이브러리를 운영 의존성, CLI를 개발 의존성으로 추가하고 `jev` npm 명령 생성 |
| `package-lock.json`·`node_modules/` | `npm install`로 의존성 설치 및 lockfile 갱신. install/postinstall 스크립트는 실행하지 않음 |
| `vendor/jev-decision-kit/` | 버전이 고정된 두 패키지 파일과 업데이트 확인용 `connection.json` 보관 |
| `.agents/skills/jev-decision-kit/`·`.claude/skills/jev-decision-kit/` | Codex·Claude Code의 프로젝트 스킬 생성 |

**앱 적용을 위해 남는 일:** 서버 API 키 설정, 업무에 맞는 질문·실패 처리 기준 정의, 기존 요청 처리에서 라이브러리 호출, 관측 결과 저장입니다. Shadow 모드, 주간 이슈·PR, 배포도 이 명령이 구성하지 않습니다. CLI의 키 설정과 서버의 키 설정은 별개입니다.

지원 대상은 npm을 사용하는 독립 프로젝트 또는 워크스페이스 루트입니다. pnpm·yarn·bun 프로젝트와 기존의 다른 Jev 설치 방식은 자동으로 이전하지 않습니다. Edge 함수처럼 앱 루트와 별도의 의존성을 쓰는 코드에도 자동으로 연결되지 않습니다. [서버 적용·수동 설치·업데이트](docs/integration.md).

설치한 프로젝트에서 CLI를 시험하려면 다음처럼 실행합니다. npm 로그인이나 전역 설치는 필요하지 않습니다.

```sh
cd ../my-app
npm run jev -- demo --offline
npm run jev -- decide --text "계정 설정을 변경하고 싶어요" --question "계정 지원 문의인가요?" --choices "예,아니오,판단보류"
```

API 키를 아직 설정하지 않았다면 `npm run jev -- init`으로 입력합니다. 에이전트에는 “샘플 문의를 계정 지원·기타·판단보류로 분류해줘”처럼 요청하면 됩니다. 프로젝트 스킬은 새 세션에서 읽습니다.

`package.json`·`package-lock.json`·`vendor/jev-decision-kit/`·생성한 두 스킬 폴더를 함께 커밋하면, 다른 개발 환경과 CI에서도 `npm ci`로 같은 패키지를 설치합니다. 원본 clone은 필요하지 않습니다. 기존 `jev` 명령·같은 패키지 의존성·스킬과 충돌하거나 관리 파일을 직접 수정했다면 덮어쓰지 않고 중단합니다.

서버 적용은 기존 요청 처리에서 `createDecisionClient`를 호출하도록 구현합니다. 설치 후 에이전트에게 “서버의 문의 분류에 이 라이브러리를 연결해줘”라고 요청하면 이 별도 구현 작업을 맡길 수 있습니다.

## 에이전트에게 판단 실험 맡기기

스킬은 Codex·Claude Code에게 CLI 호출 방법, 응답 확인 방법, 평가할 때의 주의점을 알려주는 안내입니다. `connect`를 실행한 프로젝트에는 이미 설치되어 있습니다. 여러 프로젝트에서 개인 스킬로 쓰려면 준비한 Jev Decision Kit 폴더에서 다음을 실행합니다.

```sh
npm run cli -- agent install codex
npm run cli -- agent install claude
npm run cli -- agent doctor
```

두 앱의 스킬을 함께 설치하려면 `npm run cli -- agent install`을 실행합니다. 설치한 뒤 새 에이전트 세션에서 작업할 프로젝트를 열고 다음처럼 지시하세요.

> 이 프로젝트의 샘플 문의 3개를 계정 지원·기타·판단보류로 분류해줘. 입력, 질문, 결과, 처리 시간을 표로 정리해줘.

> 기존 판단 질문을 실행하고, 정답이 있는 사례와 비교해서 오답·실패·판단보류를 정리해줘.

스킬 이름을 꼭 언급할 필요는 없습니다. 에이전트는 작업 맥락과 스킬의 설명을 보고 선택합니다. 선택할 때 고려할 작업은 작은 선택지 분류·관련성 판단 실험, 정답이 있는 판단 결과 평가, Jev 연동입니다. 매번 선택된다고 보장되지는 않으므로, 사용되지 않았을 때는 “jev-decision-kit 스킬로 실행해줘”라고 지정할 수도 있습니다. [Codex 스킬 선택](https://developers.openai.com/codex/skills/), [Claude Code 스킬 선택](https://code.claude.com/docs/en/skills).

연결한 프로젝트에서는 에이전트도 `npm run jev`를 사용합니다. 개인 스킬은 설치 시 기록한 로컬 CLI 경로로 실행합니다.

기대 효과는 호출 코드를 매번 작성하지 않고 같은 질문·선택지로 샘플을 시험하며, 결과와 실패·판단보류를 함께 확인하는 것입니다. 실제 판단에는 API 호출 시간과 사용 비용이 들며, 비용 절감과 판단 정확도는 사용하는 업무의 사례로 평가해야 합니다.

스킬 설치만으로 앱에 판단 기능이 연결되거나 운영 데이터가 수집되지는 않습니다. 매 메시지를 자동 처리하거나 에이전트의 모델 설정을 바꾸는 기능도 없습니다. [스킬 사용 순서·적용 범위·제거](docs/installation.md).

## 업데이트와 제거

저장소 폴더에서 다음을 실행해 업데이트합니다.

```sh
git pull --ff-only
npm ci
npm run build
```

스킬도 갱신하려면 `npm run cli -- agent install`을 다시 실행하세요. 저장소를 이동했을 때도 스킬을 갱신하면 새 경로를 기록합니다.

사용을 끝내려면 `npm run cli -- agent uninstall`로 설치한 스킬을 해제한 뒤 clone한 폴더를 제거하면 됩니다. 저장한 키 파일은 보존합니다.

## 개발자용 저장소 구성

- `packages/cli`: 설치·실행 명령과 준비된 예제.
- `packages/decisions`: 질문 실행과 응답 검증을 제공하는 라이브러리.
- `packages/eval`: 관측 결과 평가와 보고 라이브러리.
- `skills/jev-decision-kit`: 에이전트에서 판단 CLI를 호출하는 안내.

저장소 개발 시에는 루트에서 다음을 실행합니다.

```sh
npm ci
npm run check
npm test
npm run test:compat
npm run pack:cli
```

새 clone에서 준비·실행을 확인하고, 라이브러리 배포 패키지는 빈 프로젝트에서 타입·런타임 호환성을 확인합니다. [릴리스 절차](docs/releases.md). npm registry 등록은 아직 하지 않았습니다.
