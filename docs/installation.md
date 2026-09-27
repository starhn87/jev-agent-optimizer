# 판단 스킬 설치

일반 CLI 설치·키 설정·실행은 [루트 README](../README.md)를 따릅니다.

## Codex·Claude Code

```sh
jev-decision-kit agent install codex
jev-decision-kit agent install claude
jev-decision-kit agent doctor
jev-decision-kit agent uninstall
```

대상을 생략하면 두 앱의 스킬을 설치하거나 해제합니다. 스킬 설치에는 API 키나 앱 CLI 실행이 필요하지 않습니다. 실제 판단을 호출하기 전에 `jev-decision-kit init`으로 키를 설정합니다.

스킬 본문은 `~/.jev-decision-kit/skills/jev-decision-kit/SKILL.md`에 두고 다음 경로에서 연결합니다.

- Codex: `~/.agents/skills/jev-decision-kit`
- Claude Code: `~/.claude/skills/jev-decision-kit`

설치 기록은 `~/.jev-decision-kit/skills.json`입니다. `agent doctor`는 연결 상태를 읽습니다. 설치 대상에 다른 파일이 있거나 관리하던 스킬이 수정된 경우 변경을 중단합니다. `agent uninstall codex` 또는 `claude`로 한쪽만 제거할 수 있습니다. 키 파일은 유지합니다.

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
