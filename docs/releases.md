# 패키지 릴리스

기본 사용 경로는 저장소를 clone하고 그 폴더에서 `npm ci`, `npm run setup`, `npm run demo`를 실행하는 것이다. 루트는 private로 유지한다. CLI와 라이브러리 패키지는 GitHub 릴리스 파일로 보관하며 npm registry 게시는 아직 하지 않았다.

1. 변경한 패키지의 버전과 lockfile을 갱신한다. 공개한 버전의 릴리스 파일은 교체하지 않는다.
2. 루트에서 `npm ci`, `npm run check`, `npm test`, `npm run test:compat`를 통과시킨다.
3. 변경한 패키지를 `npm run pack:cli`, `npm run pack:decisions`, `npm run pack:eval`로 `artifacts/`에 만든다. 실제 패키지의 독립 설치·타입·CLI·Workers·Deno 호환성을 검증한다.
4. 새 clone에서 README의 명령을 그대로 실행해 초기 설정·판단 예제·JSON 출력·스킬 설치를 확인한다. `npm run connect -- <테스트 프로젝트>`로 연결한 뒤, manifest·lockfile·vendor·프로젝트 스킬만 새 폴더로 복사해 `npm ci`와 `npm run jev -- demo --offline`이 동작하는지도 확인한다. 키 없는 검증에는 모의 예제를 사용한다.
5. 검증한 커밋에 릴리스 태그를 만들고 패키지 파일을 GitHub 릴리스에 올린다. CLI 파일은 `jev-utils.tgz`라는 asset 이름으로 보관하고 해당 CLI 릴리스를 latest로 지정한다.

라이브러리 `@starhn87/jev-decisions`·`@starhn87/jev-eval`은 버전으로 고정한 릴리스 파일로 설치한다. 패키지 파일 목록으로 `.env`, 설치 상태, 로컬 기록, 테스트를 제외한다. 유틸리티 설치 시 데스크톱 설정을 변경하는 install/postinstall hook은 없다.

에이전트 스킬은 clone에서 `npm run cli -- agent install`로 연결한다. 설치한 스킬은 이 로컬 CLI의 절대 경로를 기록한다. 저장소를 이동하거나 업데이트한 뒤에는 스킬을 갱신한다.

`connect`는 보관된 TypeSafe 공식 스킬도 연결한다. `third-party/typesafe-ai/source.json`에 원본 저장소·커밋·디렉터리와 파일별 SHA256을 기록하고, 해당 커밋의 스킬 디렉터리 전체를 라이선스와 함께 수정 없이 보관한다. 원본 갱신 시 디렉터리와 원본 기록을 함께 교체하고, 새 설치·기존 연결 갱신·중복 설치 방지·설치 실패 복원 검증을 통과시킨다. 기존 개인 설치·Claude 플러그인은 `connect`로 갱신하지 않는다. 이 연결 스크립트만 바뀌면 공개된 CLI·라이브러리 패키지 파일을 다시 만들거나 교체하지 않는다.

응답 유틸리티 0.2부터 공식 SDK는 peer dependency이다. 유틸리티와 공식 SDK를 독립 앱에 함께 설치해 리터럴 타입·실제 SDK 오류 분류·Workers·Deno 동작을 검증한다. SDK를 유틸리티 번들에 다시 포함하지 않는다.
