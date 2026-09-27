# 로컬 원문 수집 (파인튜닝용, 기본 꺼짐)

모델 라우팅·검색 선별·기억 선별은 판정마다 요청 원문과 답을 `.local/`에 남기지 않습니다. 이 저장소를 파인튜닝(예: [Kev](https://github.com/jaredpalmer/kev))에 쓸 학습 데이터로 쓰려면 `JAO_CAPTURE=1`을 설정하세요. 기본값은 꺼짐입니다.

- **Codex·CLI(`jao codex`/`serve`/`search`/`memory-filter`)**: `.env`의 `JAO_CAPTURE=1`이면 켜집니다(다른 `TYPESAFE_API_KEY` 로딩과 같은 방식).
- **Claude 함수 훅**: `.env`가 아니라 `~/.claude/settings.json`의 `env` 객체에 넣어야 합니다. [고급 설치](installation.md#claude-code-마켓플레이스)의 다른 `JAO_CLAUDE_*` 값과 같은 자리입니다.
  ```json
  { "env": { "JAO_CAPTURE": "1" } }
  ```
  두 클라이언트를 같이 켜야 검색·라우팅 학습 데이터가 양쪽에서 모입니다.

## 무엇을 남기고 어디에 남기나

- **모델 라우팅**: `.local/capture/route.jsonl`(Codex·CLI)과 `.local/capture/route-claude.jsonl`(Claude 함수 훅). 같은 파일을 두 런타임이 동시에 쓰지 않도록 나눴습니다.
- **검색 선별**: `.local/capture/search.jsonl`
- **기억 선별**: `.local/capture/memory.jsonl`

각 줄은 그 판정이 **분류기에 실제로 보낸 요청**(`state`, `questions`)과 **분류기가 실제로 준 답**(`answers`)입니다. 어느 분류기가 답했는지(`classifier`: `jev-latest`, `kev-latest` 등)도 함께 남아, `--shadow-classifier-endpoint`로 Jev와 로컬 kev를 병행 비교할 때 같은 요청에 대한 두 분류기의 답을 나란히 볼 수 있습니다. `key`는 `state`+`questions`의 SHA-256 해시 앞 24자로, 같은 요청이면 어느 분류기·어느 실행에서 왔든 같은 값입니다.

## 이미 나가는 것 이상은 나가지 않는다

이 기능은 **분류기로 이미 나가고 있던 내용만 이 머신에 추가로 저장**합니다. 민감정보 패턴이 있어 애초에 Jev를 부르지 않은 요청(라우팅의 `sensitive-prompt`, 검색의 `sensitive-input`, 기억의 `sensitive-query`/`unjudgedIds`)은 수집도 되지 않습니다. 반대로 말하면, 이 기능을 켠다고 새로운 정보가 외부로 나가지는 않지만, **이미 외부로 나간 원문이 이 머신 디스크에도 쌓입니다.** 확인 없이 켜지 마세요.

## 라벨링과 학습으로 이어가기

수집된 파일은 Jev·kev의 추측일 뿐 정답이 아닙니다. 파인튜닝에 쓰려면 사람이 직접 정답을 매긴 라벨이 필요합니다. `.local/capture/*.jsonl`을 kev의 학습 JSONL 형식(요청 모양 + 문항마다 `label`)으로 바꾸는 도구는 아직 없습니다 — 라벨링 도구와 함께 다음 단계로 추가할 예정입니다.

## 지우기

`.local/`은 git이 무시하는 로컬 전용 디렉터리입니다. 수집을 끄려면 `JAO_CAPTURE`를 지우거나 `0`으로 설정하고, 이미 쌓인 파일은 `.local/capture/`를 그냥 지우면 됩니다.
