# 패키지 릴리스

CLI `@starhn87/jev-decision-kit`은 빌드된 패키지만 담은 GitHub `cli` 브랜치에서 배포한다. 사용자는 `npm install -g github:starhn87/jev-decision-kit#cli`로 설치한다. npm 로그인은 필요하지 않다. GitHub 릴리스 파일도 보관하며, 라이브러리 `@starhn87/jev-decisions`·`@starhn87/jev-eval`은 기존 버전별 릴리스 파일을 사용한다. npm registry 게시는 아직 하지 않았다. workspace 루트는 private로 유지한다.

1. 변경한 패키지의 버전과 lockfile을 갱신한다. 공개한 버전의 릴리스 파일은 교체하지 않는다.
2. 루트에서 `npm ci`, `npm run check`, `npm test`, `npm run test:compat`를 통과시킨다. 실제 tarball의 독립 설치·타입·CLI·Workers·Deno 호환성을 검증한다.
3. `npm run pack:cli`, `npm run pack:decisions`, `npm run pack:eval`로 `artifacts/`에 패키지를 만든다. decisions의 prepack은 빌드를 수행한다.
4. 검증한 커밋에 릴리스 태그를 만들고 tarball을 GitHub 릴리스에 올린다. CLI tarball은 `jev-decision-kit.tgz`라는 이름의 asset으로 올리고 해당 CLI 릴리스를 latest로 지정한다.
5. `node scripts/publish-cli-branch.mjs artifacts/starhn87-jev-decision-kit-VERSION.tgz --push`로 검증한 CLI 패키지를 `cli` 브랜치에 게시한다. 스크립트는 별도 Git index를 사용하여 현재 체크아웃·브랜치·스테이징을 보존하며, 설치 과정에 필요 없는 workspace 빌드 스크립트를 패키지에서 제외한다. 이전 배포 커밋 위에 새 커밋을 추가하며 force push하지 않는다.
6. 빈 사용자 폴더에서 README의 GitHub 설치 명령으로 CLI·판단 예제·JSON 출력·스킬 설치를 확인한다. 라이브러리는 버전으로 고정한 공개 릴리스 URL로 설치하여 import·타입·Deno 호환성을 확인한다.

패키지 파일 목록으로 `.env`, 설치 상태, 로컬 기록, 테스트를 제외한다. 라이브러리를 설치할 때 데스크톱 설정을 변경하는 install/postinstall hook은 없다.

에이전트의 판단 호출 스킬은 설치된 CLI의 `agent install`로 연결한다. workspace 루트는 게시하지 않는다.
