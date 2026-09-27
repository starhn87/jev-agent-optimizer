# Jev Decision Kit

프로젝트의 Jev 판단을 실행하고 검증·평가하는 공통 라이브러리와 CLI입니다. API 키 설정, 질문 실행, 검증된 응답 확인, 관측 결과 집계를 `jev-decision-kit` 명령으로 처리합니다. 서버 코드에 직접 붙이거나 에이전트에서 같은 CLI를 호출할 수 있습니다.

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

## 다른 저장소에 연결하기

애플리케이션이 실행 중 Jev 판단을 사용하려면 **판단 라이브러리**를 그 프로젝트의 서버 코드에 연결합니다. Jev Decision Kit를 위의 순서로 준비한 뒤, 두 저장소가 같은 상위 폴더에 있다면 사용하는 프로젝트에서 실행하세요.

```sh
npm install ../jev-decision-kit/packages/decisions
```

서버에서 `createDecisionClient`를 가져와 프로젝트의 API 키·질문·선택지를 전달합니다. 결과의 `ok`를 확인하고 실패·판단보류 시의 동작을 정합니다. 로컬 경로 연결은 개발용이며, 배포 시에는 버전이 고정된 패키지를 프로젝트에 포함해야 합니다. [서버 연결 예제와 배포 방법](docs/integration.md).

앱을 수정하기 전에 다른 저장소의 폴더에서 CLI로 질문을 시험할 수도 있습니다.

```sh
node ../jev-decision-kit/packages/cli/dist/cli.mjs decide --text "계정 설정을 변경하고 싶어요" --question "계정 지원 문의인가요?" --choices "예,아니오,판단보류" --json
```

이 명령은 그 문장에 대한 판단 한 번을 실행합니다. 실제 앱의 요청 처리에 연결하려면 위의 서버 연동을 사용하세요. 관측 결과 집계는 [평가 라이브러리](packages/eval/README.md)에서 제공합니다.

## 에이전트에게 판단 실험 맡기기

스킬은 Codex·Claude Code에게 로컬 CLI 호출 방법, 응답 확인 방법, 평가할 때의 주의점을 알려주는 안내입니다. 다음 명령은 준비한 Jev Decision Kit 폴더에서 실행합니다.

```sh
npm run cli -- agent install codex
npm run cli -- agent install claude
npm run cli -- agent doctor
```

두 앱의 스킬을 함께 설치하려면 `npm run cli -- agent install`을 실행합니다. 설치한 뒤 새 에이전트 세션에서 작업할 프로젝트를 열고 다음처럼 지시하세요.

> jev-decision-kit 스킬을 사용해서 이 프로젝트의 샘플 문의 3개를 계정 지원·기타·판단보류로 분류해줘. 입력, 질문, 결과, 처리 시간을 표로 정리해줘.

> jev-decision-kit 스킬로 기존 질문을 실행하고, 정답이 있는 사례와 비교해서 오답·실패·판단보류를 정리해줘.

에이전트는 설치된 스킬에 기록된 로컬 CLI 경로로 질문을 실행하고 검증된 응답을 읽습니다. 스킬을 이름으로 지정하면 해당 작업에 사용하라는 의도를 분명히 전달할 수 있습니다.

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
