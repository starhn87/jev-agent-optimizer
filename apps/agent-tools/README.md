# Jev Decision Kit

Codex와 Claude Code에서 모델·effort를 자동 선택하고, 검색·기억 후보 선별을 돕습니다.
연결 명령은 `jev-decision-kit agent`입니다.

## 설치

[루트 README](../../README.md)의 CLI를 설치하고 `jev-decision-kit init`으로 키를 설정한 뒤 실행합니다.

```sh
jev-decision-kit agent install codex
jev-decision-kit agent install claude
jev-decision-kit agent doctor
```

기본 `agent install`은 두 앱을 연결합니다. CLI·플러그인·마켓플레이스 이름은 `jev-decision-kit`, 환경변수는 `JEV_KIT_*`입니다. 에이전트용 실행 파일과 키는 사용자 폴더에 보관합니다.

사용량 요약:

```bash
jev-decision-kit agent report ~/.jev-decision-kit/agent/.local/codex-persistent.jsonl
jev-decision-kit agent --help
```

Codex 앱을 재시작하고 새 작업에서 `Jev Auto`를 선택하세요. Claude Code는 새 세션을 시작하세요.
Codex는 응답 시작에 선택 모델·요청 effort를 표시합니다. Claude Code는 턴이 끝나면 답변 아래 알림 줄에 `Jev Auto · 모델 · effort`를 표시하고(터미널에서는 프롬프트 하단 모드 라벨에도), 대화 기록에는 남기지 않습니다. 실제 모델이 다를 때는 `≠ 실제 모델`을 덧붙입니다.
설치 시 검색·기억 스킬도 연결됩니다. 후보가 5개를 넘고 에이전트가 스킬을 호출하면 Jev의 구조화된 응답으로 후보를 선별하고 `.local/search.jsonl` 또는 `.local/memory.jsonl`에 건수·시간 등을 기록합니다. 매 대화마다 자동 실행되거나 내장 검색·기억 도구를 가로채지는 않습니다.

## 업데이트 및 제거

```bash
npm install -g https://github.com/starhn87/jev-decision-kit/releases/latest/download/jev-decision-kit.tgz
jev-decision-kit agent install
```

```bash
jev-decision-kit agent uninstall
jev-decision-kit agent uninstall codex
jev-decision-kit agent uninstall claude
```

`agent install`을 다시 실행하면 에이전트 실행 파일도 갱신하고 연결 상태를 확인합니다. 저장소를 직접 빌드해 연결한 기존 설치는 그 저장소의 경로를 유지합니다.

## 더 알아보기

[설치 및 문제 해결](../../docs/installation.md) · [라우팅 규칙](../../docs/routing-policy.md) · [측정과 비교](../../docs/measurement.md) · [로컬 원문 수집](../../docs/local-capture.md) · [키 보관](../../docs/local-secrets.md) · [검증 기록](../../docs/validation-plan.md)

검색 결과 선별 실험: [명령어](../../docs/search-gate.md)

기억 후보 선별 실험: [명령어](../../docs/memory-filter.md)
