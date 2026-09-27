# 패키지 릴리스

CLI `@starhn87/jev-decision-kit`과 라이브러리 `@starhn87/jev-decisions`·`@starhn87/jev-eval`을 npm tarball로 만들어 GitHub 릴리스에서 배포한다. 별도 npm 로그인 없이 README의 URL로 `npm install`할 수 있다. npm registry 게시는 아직 하지 않았다. workspace 루트는 private로 유지한다.

1. 변경한 패키지의 버전과 lockfile을 갱신한다. 공개한 버전의 릴리스 파일은 교체하지 않는다.
2. 루트에서 `npm ci`, `npm run check`, `npm test`, `npm run test:compat`를 통과시킨다. 실제 tarball의 독립 설치·타입·CLI·Workers·Deno 호환성을 검증한다.
3. `npm run pack:cli`, `npm run pack:decisions`, `npm run pack:eval`로 `artifacts/`에 패키지를 만든다. decisions의 prepack은 빌드를 수행한다.
4. 검증한 커밋에 릴리스 태그를 만들고 tarball을 GitHub 릴리스에 올린다. CLI tarball은 `jev-decision-kit.tgz`라는 이름의 asset으로 올리고 해당 CLI 릴리스를 latest로 지정한다.
5. 빈 프로젝트에서 공개 릴리스 URL로 설치하여 import·CLI·설치한 로컬 ESM의 Deno 타입 검사를 확인한다. 라이브러리 URL은 버전으로 고정하고, CLI의 빠른 시작 URL은 latest를 사용한다.

패키지 파일 목록으로 `.env`, 설치 상태, 로컬 기록, 테스트를 제외한다. 라이브러리를 설치할 때 데스크톱 설정을 변경하는 install/postinstall hook은 없다.

에이전트의 판단 호출 스킬은 설치된 CLI의 `agent install`로 연결한다. workspace 루트는 게시하지 않는다.
