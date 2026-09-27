# 로컬 원문 수집 (파인튜닝용, 기본 꺼짐)

모델 라우팅·검색 선별·기억 선별은 판정마다 요청 원문과 답을 `.local/`에 남기지 않습니다. 이 저장소를 파인튜닝(예: [Kev](https://github.com/jaredpalmer/kev))에 쓸 학습 데이터로 쓰려면 `JEV_KIT_CAPTURE=1`을 설정하세요. 기본값은 꺼짐입니다.

- **Codex·CLI(`jev-decision-kit codex`/`serve`/`search`/`memory-filter`)**: `.env`의 `JEV_KIT_CAPTURE=1`이면 켜집니다(다른 `TYPESAFE_API_KEY` 로딩과 같은 방식).
- **Claude 함수 훅**: `.env`가 아니라 `~/.claude/settings.json`의 `env` 객체에 넣어야 합니다. [고급 설치](installation.md#claude-code-마켓플레이스)의 다른 `JEV_KIT_CLAUDE_*` 값과 같은 자리입니다.
  ```json
  { "env": { "JEV_KIT_CAPTURE": "1" } }
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

수집된 파일은 Jev·kev의 추측일 뿐 정답이 아닙니다. 파인튜닝에 쓰려면 사람이 직접 정답을 매긴 라벨이 필요합니다.

```bash
# 1. 검토할 항목을 뽑는다. 같은 요청을 Jev와 kev가 모두 답했다면 참고용으로 둘 다 보여준다.
node dist/cli.js label-queue route --limit 50 > .local/queue.json

# 2. .local/queue.json을 열어 각 항목의 label을 채운다. compare.json과 같은 수작업 편집이다.
#    - "choice" 문항: criteria의 키 중 하나를 문자열로 (예: "tier": "balanced")
#    - "noul" 문항: true 또는 false
#    - "score" 문항: criteria 배열의 위치 번호, 0부터 (예: "urgency": 2)
#    label의 classifiers 필드는 참고용 답일 뿐이니 지우지 말고 그대로 두어도 된다.
#    다 채우지 못한 항목은 tier를 null로 남겨 두면 된다 — 다음 단계가 건너뛴다.

# 3. 채운 만큼만 저장소에 반영한다. 같은 key를 다시 넣으면 이전 라벨을 덮어쓴다.
node dist/cli.js label-apply .local/queue.json

# 4. 라벨이 붙은 요청만 kev 학습 형식으로 뽑는다. holdout은 kev 권장대로 10~20%.
node dist/cli.js export-training route --out .local/kev-route --holdout-percent 15
```

`export-training`은 같은 `key`를 가진 요청을 매번 같은 쪽(train/holdout)으로 나눕니다. 라벨을 더 모아 다시 뽑아도 이미 나뉜 요청은 그대로 남고 새로 라벨된 것만 추가됩니다. 출력 파일(`<out>-train.jsonl`, `<out>-holdout.jsonl`)은 [kev의 학습 스크립트](https://github.com/jaredpalmer/kev#by-hand)가 그대로 읽는 모양이며, `id`·`classifier`·`decision`·`key` 같은 수집용 메타데이터는 들어가지 않습니다.

라벨 저장소는 `.local/labels/<decision>.jsonl`에 쌓입니다. 역시 git이 무시하는 로컬 전용 파일입니다.

## 지우기

`.local/`은 git이 무시하는 로컬 전용 디렉터리입니다. 수집을 끄려면 `JEV_KIT_CAPTURE`를 지우거나 `0`으로 설정하고, 이미 쌓인 파일은 `.local/capture/`를 그냥 지우면 됩니다.
