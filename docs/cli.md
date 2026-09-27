# CLI로 샘플 실행하기

CLI는 공식 SDK로 준비된 질문이나 직접 지정한 질문을 실행하고, 기존 관측 파일을 집계하는 개발 도구입니다. 앱의 서버 호출에 적용하는 방법은 [SDK·유틸리티 연결](integration.md)을 따릅니다.

## clone한 폴더에서 실행

```sh
git clone https://github.com/starhn87/jev-utils.git
cd jev-utils
npm ci
npm run setup
npm run demo
```

`setup`은 CLI를 준비하고 TypeSafe API 키를 입력받습니다. 키는 화면에 표시하지 않고 `~/.jev-utils/.env`에 저장합니다. 이후에는 `npm run demo`로 바로 실행합니다.

`demo`는 계정 지원 문의인지 묻는 예제를 실행하고 입력·질문·선택지·결과를 함께 표시합니다. 다음은 출력 예시이며 결과와 처리 시간은 실행마다 달라집니다.

```text
입력 문장: 계정 설정을 변경하고 싶어요
질문: 이 문장은 계정 지원 문의인가요?
선택지: 예 / 아니오 / 판단보류

판단 결과: 예 — 계정 지원 문의에 해당합니다.
모델 신뢰도: 97.0%
처리 시간: 235ms (API 요청부터 응답 검증 완료까지)
Jev 모델: jev-1.13.0
```

키 없이 확인하려면 `setup` 대신 `npm run build`를 실행하고 모의 응답을 사용합니다.

```sh
npm run demo -- --offline
npm run cli -- eval --demo
```

## 직접 질문 실행

```sh
npm run cli -- decide --text "계정 설정을 변경하고 싶어요" --question "계정 지원 문의인가요?" --choices "예,아니오,판단보류"
```

다른 프로그램에서 읽으려면 `npm run --silent cli -- decide ... --json`으로 JSON만 출력합니다. 공식 SDK 형식의 질문 파일은 `npm run cli -- run questions.json`, 관측 파일은 `npm run cli -- eval observations.jsonl`로 처리합니다. 파일 경로는 실행한 폴더 기준입니다.

## 설치한 프로젝트에서 실행

`connect`로 설치한 프로젝트에서는 `npm run jev`를 사용합니다.

```sh
npm run jev -- demo --offline
npm run jev -- init
npm run jev -- decide --text "로그인이 안 돼요" --question "계정 지원 문의인가요?" --choices "예,아니오,판단보류"
```

전역 설치는 필요하지 않습니다. CLI 키 설정은 서버의 비밀 설정과 별개입니다. [키 설정](local-secrets.md), [설치·업데이트 범위](integration.md), [에이전트 스킬](installation.md).
