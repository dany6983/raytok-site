# 강사 페이지 단추 × 결과 (web/host) — NOW 99-1 · MISTAKES #11

시험: `samples/host_buttons_test.js` (`npm run test:host-buttons`) — 단추를 **실제로 눌러** 아래 칸을 단언한다.
「보낸 메시지」는 페이지의 `WebSocket.send` 를 감싸 센 것(가짜 릴레이가 적은 것이 아니라 페이지가 보낸 것).
질문은 손님 ws 하나를 진짜 길(`/ws?role=listener`, `kind:'ask'`)로 붙여 넣는다.
마지막 단언: 페이지의 id 있는 단추 **19개 전부**가 이 표에 있다 — 단추를 늘리면 시험이 붉어진다.

되돌림(D-09, 10-28): 아래 다섯을 하나씩 깨면 그 줄에서 붉음 — [무시] reason · skip 보내기 · 방 닫기 end:1 · 쉬는 시간 단추 · [선택] 단추.

| 단추 | 보낸 메시지 | 화면 |
|---|---|---|
| btnVerifyToken (이용권 확인) | — (HTTP /license/verify) | #step-prepare 보임 |
| btnResetParas (원고 지우기) | — | 확인창 → 문단 0 |
| btnPreTranslate (미리 번역) | — (HTTP /translate) | mode=done |
| btnStartLecture (강의 시작) | welcome · script_src | #step-live · 「연결됨」 |
| btnNext (다음 ▶) | script para=다음 | 진행 n+1 / 전체 |
| btnPrev (◀ 이전) | script para=앞 | 진행 n−1 (첫 문단에선 꺼짐) |
| btnSkip (건너뛰기) | skip para=다음 (script 없음) | 문단 is-skipped |
| btnBreak (쉬는 시간) | 켬: break on · pause / 끔: break off · resume | 쉬는 띠·단추 on 토글 |
| btnPlay (▶ 재생 / ■ 멈춤) | 켬: (문단 넘길 때 script) / 끔: pause | 글자 ▶ 재생 ↔ ■ 멈춤 |
| btnMic (🎤 말하기) | — (말한 줄이 확정되면 그때 보냄) | 인식 켬/끔 · 단추 on 토글 (국내만) |
| btnToggleLicQr (이용권 QR) | — | QR 칸 보임/숨김 |
| btnLicPrev · btnLicNext (◀ ▶) | — | 코드 2개 이상일 때만 보임 — 이번 시험은 1개: 안 보임만 단언 |
| [선택] (대기줄) | grant id (앞사람 있으면 revoke 먼저 · 재생 중 아니면 pause) | 지명 칸 |
| [무시] (대기줄) | revoke id reason=dismissed | 대기줄에서 빠짐 |
| btnAskSpeak (질문 소리) | — | 글자 토글 · localStorage raytok_ask_speak 0/1 |
| btnEnd (강의 끝) | — (end 는 방 닫기 때) | #step-end 보임 · 재생 끔 |
| btnBackLive (돌아가기) | — | #step-live 다시 |
| btnReport (리포트 저장) | — | 파일 받기 1 |
| btnCsv (명단 csv) | — | csv 받기 1 (닫은 뒤엔 꺼짐) |
| btnCloseRoom (방 닫기) | end:1 · summary(숫자만) | 확인창 → 닫힘 · csv 꺼짐 · 돌아가기 숨김 |

모든 단추를 통틀어 `kind:'answer'` 를 보낸 것은 0(장부 60).
아직 안 본 것: ◀ ▶(이용권 코드 2개 이상) 의 넘김 · 지명 뒤 손님이 말한 다음의 btnAskSpeak 읽기 소리 · 손님 페이지 단추(따로 시험 넷: lang_pick·room_tr·state·screen).
