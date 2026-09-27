# Jev Decision Kit

작은 의미 판단을 검증 가능한 결과로 반환하고 평가하는 공통 도구입니다.

- `packages/decisions`: 공식 TypeSafe SDK 기반 Web API-only ESM. Workers, Deno, Node에서 실행합니다.
- `packages/eval`: Node 평가 실행, 실패·보류를 포함한 JSONL 집계. 판단 기준은 소비자가 제공합니다.
- `packages/reporting`: 운영 shadow 통계와 GitHub 감사 artifact를 주간 이슈로 묶습니다.
- `apps/agent-optimizer`: 기존 Codex/Claude 모델·effort 라우팅, 검색·기억 실험과 로컬 도구.

## 개발

```sh
npm ci
npm run check
npm test
npm run test:compat
npm run pack:decisions
```

core는 질문 ID·선택지·확률·점수 기대값을 검증하고 timeout/취소/HTTP 오류를 구분합니다. key, 고정 모델, 질문·정책 버전과 실제 동작은 소비자가 소유합니다. 재시도는 0회이며 원문 자동 기록은 없습니다. 한국어 의미 품질은 각 업무의 별도 평가셋으로 검증해야 합니다.

## 소비자 연결

아직 npm에 게시하지 않았습니다. `artifacts/starhn87-jev-decisions-0.1.0.tgz`를 pack한 뒤 다음 명령으로 각 저장소 내부에 같은 ESM 산출물과 선언 파일·라이선스·provenance를 복사합니다.

```sh
node scripts/vendor-decisions.mjs /absolute/consumer/vendor/jev-decisions
```

Node/Workers는 `file:vendor/jev-decisions` 의존성을 사용하고 Deno는 vendored ESM을 직접 import합니다. sibling 저장소, 사용자 홈 경로, git branch 또는 registry의 움직이는 latest 버전에 의존하지 않습니다. 소비자의 provenance는 파일별 SHA-256과 소스 commit을 보존합니다. 배포 패키지의 이름·버전은 공개 npm 게시와 분리되어 있습니다.

sw-blog와 motomap 채팅은 off/shadow/enforce, 심사와 moto-kr 감사는 shadow만 지원합니다. enforce에는 평가 후 정한 업무별 threshold 설정이 필요합니다. 기본값은 off이며 shadow에서는 기존 동작을 보존합니다. 누락된 key와 관측 실패는 기존 기능을 실패시키지 않습니다.

운영 활성화·통계 보관·주간 이슈 갱신은 [주간 shadow 추적](docs/weekly-shadow.md)을 참고합니다.

## 기존 에이전트 도구

[사용법](apps/agent-optimizer/README.md). `npm run setup`, `npm run doctor`, `jao`, 루트 `dist/cli.js`, `claude-mod` 경로는 유지합니다. CLI의 Node/macOS 동작은 공통 라이브러리 import에 포함되지 않습니다. Claude sandbox hook은 host API 전용 adapter를 유지하고 기존 정책 동기화 테스트로 검증합니다.
