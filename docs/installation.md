# 판단 스킬 설치

일반 CLI 설치·키 설정·실행은 [루트 README](../README.md)를 따릅니다.

## 스킬로 할 수 있는 작업

스킬은 로컬 Jev CLI를 호출하고 결과를 확인하는 사용 안내입니다. 에이전트에게 질문·선택지·샘플을 전달하면 판단을 실행하고, 검증된 결과·실패·판단보류를 정리하는 작업에 사용할 수 있습니다. 호출 코드를 따로 작성하지 않고 질문을 시험하거나 기존 관측 데이터를 집계할 때 유용합니다.

에이전트는 작업 맥락과 스킬의 `description`을 보고 자동으로 선택할 수 있습니다. 이름을 언급하는 것은 필수가 아닙니다. 작은 선택지 분류·관련성 판단을 시험하거나 정답이 있는 판단 결과를 평가하는 요청에 맞도록 설명을 작성했습니다. 선택 여부는 에이전트가 결정하므로 모든 요청에서 호출되는 것은 아닙니다. [Codex의 명시·자동 선택](https://developers.openai.com/codex/skills/), [Claude Code의 스킬 선택](https://code.claude.com/docs/en/skills).

Jev 판단을 호출하면 API 사용 비용과 처리 시간이 들며, 비용 절감과 정확도는 업무별 사례로 평가합니다. 설치 후 앱의 실제 요청 처리에 적용하는 방법은 [서버 코드 연결과 관측 데이터 처리](integration.md)를 따릅니다.

## 프로젝트에 한 번에 연결하기

clone한 Jev Decision Kit 폴더에서:

```sh
npm run connect -- ../my-app
```

판단 라이브러리·프로젝트 CLI와 함께 `.agents/skills/jev-decision-kit/SKILL.md`와 `.claude/skills/jev-decision-kit/SKILL.md`를 생성합니다. 전역 설치나 별도 `agent install`은 필요하지 않습니다. 연결한 프로젝트에서 새 에이전트 세션을 시작하면 스킬을 읽고, CLI는 그 프로젝트의 `npm run jev`로 실행합니다. 스킬과 연결 파일을 프로젝트에 커밋하면 팀원도 같은 방식으로 사용합니다.

프로젝트 스킬과 개인 스킬을 중복 설치할 필요는 없습니다. 여러 저장소에서 공통으로 사용할 개인 스킬이 필요할 때만 아래의 `agent install` 방식을 선택하세요.

## 설치 후 사용 순서

1. `connect`로 프로젝트를 연결하거나 아래의 개인 스킬 설치 방식을 선택합니다.
2. 새 에이전트 세션에서 작업할 프로젝트를 엽니다.
3. 원하는 작업·질문·선택지·입력 범위를 지시합니다.

예를 들어:

> 이 프로젝트의 샘플 문의 3개를 계정 지원·기타·판단보류로 분류해줘. 입력, 질문, 결과, 처리 시간을 표로 정리해줘.

정답이 있는 검증 데이터가 있다면:

> 기존 판단 질문을 실행하고 정답과 비교해줘. 오답·실패·판단보류를 구분해서 정리해줘.

자동으로 선택되지 않았다면 “jev-decision-kit 스킬을 사용해줘”라고 추가로 지정할 수 있습니다. 연결한 프로젝트에서는 `npm run jev`를, 개인 스킬에서는 기록한 Node·CLI 경로를 사용합니다. 질문·관측 파일을 읽을 때는 작업 중인 프로젝트의 폴더를 기준으로 합니다. `run`은 프로젝트에서 정의한 질문을 실행하고, `eval`은 이미 만들어진 관측 데이터를 집계합니다. 평가 파일 생성과 정답 라벨 연결은 요청한 작업에 포함해야 합니다.

## 개인 스킬 설치: Codex·Claude Code

```sh
npm run cli -- agent install codex
npm run cli -- agent install claude
npm run cli -- agent doctor
npm run cli -- agent uninstall
```

대상을 생략하면 두 앱의 스킬을 설치하거나 해제합니다. 스킬 설치에는 API 키나 앱 CLI 실행이 필요하지 않습니다. 실제 판단을 호출하기 전에 `npm run setup`으로 키를 설정합니다.

스킬 본문은 `~/.jev-decision-kit/skills/jev-decision-kit/SKILL.md`에 두고 다음 경로에서 연결합니다.

- Codex: `~/.agents/skills/jev-decision-kit`
- Claude Code: `~/.claude/skills/jev-decision-kit`

설치 기록은 `~/.jev-decision-kit/skills.json`입니다. `agent doctor`는 연결 상태를 읽습니다. 설치 대상에 다른 파일이 있거나 관리하던 스킬이 수정된 경우 변경을 중단합니다. `agent uninstall codex` 또는 `claude`로 한쪽만 제거할 수 있습니다. 키 파일은 유지합니다.

스킬 본문에는 설치에 사용한 Node와 로컬 CLI의 절대 경로도 기록합니다. 다른 프로젝트에서 호출할 때 그 프로젝트의 작업 폴더를 유지합니다. 저장소를 이동하거나 업데이트하면 설치 명령을 다시 실행해 경로와 스킬을 갱신합니다.

새 세션에서 `jev-decision-kit` 스킬을 사용하면 정의한 질문을 CLI로 실행하고 결과를 확인할 수 있습니다. 에이전트 모델·추론 수준 설정과 백그라운드 서비스는 이 설치의 범위가 아닙니다.

## Claude Code 마켓플레이스

직접 스킬 설치 대신 마켓플레이스를 이용할 수도 있습니다. 동일한 스킬을 중복 설치하지 않도록 한 방식을 선택합니다.

```sh
claude plugin marketplace add starhn87/jev-decision-kit
claude plugin install jev-decision-kit@jev-decision-kit
```

플러그인은 판단 CLI 호출 스킬을 포함합니다. 사용 전 루트 README의 CLI 설치와 키 설정이 필요합니다. 제거는 다음 명령으로 진행합니다.

```sh
claude plugin uninstall jev-decision-kit@jev-decision-kit
```

저장소 개발 시에는 `claude plugin validate .`와 `claude plugin validate .claude-plugin/marketplace.json`으로 메타데이터를 검증합니다.
