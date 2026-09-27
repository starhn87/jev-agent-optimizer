# Jev Decision Kit

Jev를 프로젝트와 에이전트 도구에 연결하는 실행 도구입니다. API 키 설정, 판단 실행, 결과 평가, Codex·Claude 연결을 하나의 `jev-decision-kit` 명령으로 처리합니다. 애플리케이션 코드에 붙일 수 있는 판단·평가 라이브러리도 함께 제공합니다.

## 바로 실행하기

Node.js 22 이상과 npm이 필요합니다. 아래 세 명령을 순서대로 실행하세요.

```sh
npm install -g https://github.com/starhn87/jev-decision-kit/releases/latest/download/jev-decision-kit.tgz
jev-decision-kit init
jev-decision-kit demo
```

`init`이 TypeSafe API 키를 입력받아 저장합니다. 입력한 키는 화면에 표시하지 않고 사용자 폴더 `~/.jev-decision-kit/.env`에 저장합니다. `demo`는 준비된 질문을 Jev에 보내고 판단 결과와 처리 시간을 보여줍니다. 예제 파일을 만들거나 코드를 작성할 필요가 없습니다.

키 없이 명령이 동작하는지 먼저 확인하려면:

```sh
jev-decision-kit demo --offline
jev-decision-kit eval --demo
```

`--offline`은 모의 응답을 사용하고, `eval --demo`는 준비된 관측 결과를 집계합니다. 둘 다 외부 API를 호출하지 않습니다.

## 내 문장 판단하기

```sh
jev-decision-kit decide --text "계정 설정을 변경하고 싶어요" --question "고객 지원 문의인가?" --choices "예,아니오,판단보류"
```

질문과 선택지를 명령에 전달하면 결과를 바로 보여줍니다. 다른 프로그램에서 결과를 읽으려면 끝에 `--json`을 붙이세요. 정의해 둔 여러 질문은 `jev-decision-kit run questions.json`, 수집한 관측 결과는 `jev-decision-kit eval observations.jsonl`로 처리할 수 있습니다.

상태 확인과 전체 명령 안내:

```sh
jev-decision-kit doctor
jev-decision-kit --help
```

## Codex·Claude 연결하기

키 설정 후 사용할 앱을 지정하세요. 연결할 앱이 설치되어 있어야 하며 Codex의 백그라운드 자동 연결은 macOS를 지원합니다.

```sh
jev-decision-kit agent install codex
jev-decision-kit agent install claude
jev-decision-kit agent doctor
```

두 앱을 함께 연결하려면 `jev-decision-kit agent install`을 실행합니다. Codex 앱은 재시작 후 새 작업에서 `Jev Auto`를 선택하고, Claude Code는 새 세션에서 `/jev-decision-kit-route`로 확인합니다. 연결을 해제하려면 `jev-decision-kit agent uninstall`을 사용하세요.

이 연결은 모델·추론 수준 선택과 검색·기억 후보 선별을 제공합니다. [에이전트 도구의 동작과 상세 설정](apps/agent-tools/README.md).

## 업데이트와 제거

업데이트는 처음의 `npm install -g` 명령을 다시 실행하면 됩니다. 키와 에이전트 실행 파일은 사용자 폴더에 있어 CLI 패키지를 갱신해도 유지됩니다.

```sh
jev-decision-kit agent uninstall
npm uninstall -g @starhn87/jev-decision-kit
```

첫 명령은 에이전트 연결을, 둘째 명령은 CLI를 제거합니다. 저장한 키 파일은 보존합니다.

## 애플리케이션 코드에서 사용하기

터미널 명령 대신 서버 코드에서 직접 호출하려면 [판단 라이브러리](packages/decisions/README.md)를, 관측 데이터 평가와 보고 기능은 [평가 라이브러리](packages/eval/README.md)를 사용하세요. 질문, 적용 기준, 저장할 데이터는 각 프로젝트에서 정의합니다. 라이브러리 설치만으로 데스크톱 앱 설정을 바꾸지는 않습니다.

## Deno와 ESM은 무엇인가요?

- **Node.js**는 JavaScript를 실행하는 프로그램입니다. 위 CLI를 실행할 때 사용합니다.
- **Deno**도 JavaScript·TypeScript를 실행하는 프로그램입니다. 일부 서버는 Node.js 대신 Deno를 사용하므로, 판단 라이브러리가 그 환경에서도 동작하는지 검사합니다. CLI 사용자는 Deno를 설치할 필요가 없습니다. [Deno 공식 설명](https://docs.deno.com/runtime/).
- **ESM**은 코드 파일을 나누고 필요한 기능을 `import`로 가져오는 JavaScript 표준 방식입니다. 우리 라이브러리가 다른 서버 코드에 붙을 때 사용하는 형식이며, 별도 프로그램이나 설치 단계가 아닙니다. [JavaScript 모듈 설명](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules).

## 개발자용 저장소 구성

- `packages/cli`: 설치·실행 명령과 준비된 예제.
- `packages/decisions`: 질문 실행과 응답 검증을 제공하는 라이브러리.
- `packages/eval`: 관측 결과 평가와 보고 라이브러리.
- `apps/agent-tools`: Codex·Claude 연결과 모델·검색·기억 선택 기능.

저장소 개발 시에는 루트에서 다음을 실행합니다.

```sh
npm ci
npm run check
npm test
npm run test:compat
npm run pack:cli
```

실제 배포 패키지를 빈 프로젝트에 설치해 CLI·타입·런타임 호환성을 확인합니다. [릴리스 절차](docs/releases.md). 현재 npm 명령은 GitHub 릴리스 파일을 설치하며 npm registry 등록은 아직 하지 않았습니다.
