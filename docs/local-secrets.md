# API 키 설정

```sh
npm run setup
npm run doctor
```

`init`은 TypeSafe API 키를 화면에 표시하지 않고 입력받아 `~/.jev-utils/.env`에 저장합니다. 파일 권한은 사용자만 읽고 쓸 수 있는 `600`입니다. `doctor`는 설정 여부와 Jev 모델을 보여주며 키 값은 출력하지 않습니다.

자동화에서는 비밀 관리 도구로 `TYPESAFE_API_KEY`를 프로세스 환경에 전달하거나 표준 입력으로 `npm run cli -- init --stdin`에 공급합니다. 키를 명령 인자·로그·이슈에 넣지 않습니다. `JEV_UTILS_MODEL`로 사용하는 Jev 모델을 지정할 수 있습니다.

서버 코드에서는 각 프로젝트의 서버 비밀 설정을 공식 SDK 클라이언트에 전달합니다. 브라우저 번들에 키를 포함하지 않습니다. 스킬 설치·제거와 패키지 업데이트는 저장한 키를 유지합니다.
