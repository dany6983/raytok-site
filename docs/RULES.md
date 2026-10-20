- P-03: 청취자 음성은 확정 `tr`만. `pending` 음성 금지
- §2: 언어 배정 방식(출원 전)은 이 공개 저장소에 코드·설명·커밋메시지 어디에도 넣지 않는다
- 규칙 변경은 설계 채팅만
- 손님 화면은 **`web/listener/index.src.html` 만 고친다.** `index.html` 은 만드는 파일이다 —
  `node tools/build-listener.js` 를 돌려 **같이 커밋**한다. 생성물에만 넣은 고침은 다음 한 번에
  사라진다(2026-10-20 에 다섯 번 났고 한 번은 실제로 한 줄이 사라졌다). 커밋 훅이 막는다:
  클론마다 한 번 `git config core.hooksPath .githooks`
