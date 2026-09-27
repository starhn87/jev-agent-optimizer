# 패키지 릴리스

`@starhn87/jev-decisions`와 `@starhn87/jev-eval`을 npm tarball로 만들어 GitHub 릴리스에서 배포한다. 별도 npm 로그인 없이 README의 URL로 `npm install`할 수 있다. npm registry 게시는 아직 하지 않았다. workspace 루트와 에이전트 앱은 private로 유지한다.

1. 변경한 패키지의 버전과 lockfile을 갱신한다. 공개한 버전의 릴리스 파일은 교체하지 않는다.
2. 루트에서 `npm ci`, `npm run check`, `npm test`, `npm run test:compat`를 통과시킨다. 실제 tarball의 독립 설치·타입·CLI·Workers·Deno 호환성을 검증한다.
3. `npm run pack:decisions`, `npm run pack:eval`로 `artifacts/`에 패키지를 만든다. decisions의 prepack은 빌드를 수행한다.
4. 검증한 커밋에 릴리스 태그를 만들고 두 tarball을 GitHub 릴리스에 올린다. Deno 직접 import용 `packages/decisions/dist/index.js`와 `index.d.ts`도 함께 올린다.
5. 빈 프로젝트에서 공개 릴리스 URL로 설치하여 import·CLI·Deno 타입 검사를 확인한다. README의 설치 URL은 해당 릴리스 버전으로 고정한다.

패키지 파일 목록으로 `.env`, 설치 상태, 로컬 기록, 에이전트 앱, 테스트를 제외한다. 라이브러리를 설치할 때 데스크톱 설정을 변경하는 install/postinstall hook은 없다.

에이전트 도구는 저장소 루트에서 `npm ci`와 `npm run setup`으로 설치한다. `npm publish --workspaces`로 private 앱이나 workspace 전체를 게시하지 않는다.
