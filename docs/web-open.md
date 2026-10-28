# 웹 열린 지시 점검 (10-28 마스터 16:10 차례 · 웹 일꾼)

`docs/NOW.md` 의 ★ 중 「~~끝」 표시 없는 것을 **코드에서** 확인했다. 코드는 고치지 않았다(E 가 web/listener 작업 중).
「했음」 커밋은 `git log -S` 로 그 글자가 처음 들어간 커밋이다 — `9fc5e3f` 는 많은 글자가 처음 보이는 커밋이라 「9fc5e3f 이전부터」로 읽는다.

## 시험 (export NO_PROXY=127.0.0.1,localhost · test:* 하나씩)
**90개 중 붉음 1** — `test:screen`(`samples/screen_view_test.js` 「도구 막대는 화면 밖」).
- **10-28 16:50 가름: 코드 쪽** — 크롬의 가짜 pointermove(움직임 0). 고친 판 가지 `fix/screen-fake-move`(E 가 합친다).
- 원인 한 줄: **간헐**(같은 판에서 10번 중 5번 붉음). 붉을 때 `show-tools` 가 켜져 있다(`barTop 1036` = 막대 높이 44 만큼 보임) — 「조작하면 4초 보이기」(`SCREEN_TOOLS_MS`)가 페이지 열린 직후 들어온 pointer/key 이벤트로 켜지고, 시험은 300ms 뒤에 읽는다. 코드 문제인지 시험 문제인지는 안 갈랐다.
- 한 번씩 돌린 판: 852e0be 초록 · 142e130 붉음 · 0cd905a 붉음 · 5ef3e87 초록 — 간헐이라 「어느 커밋부터」로 단정하지 않는다.

## NOW ★ 표

| NOW 줄 | 지시 | 코드 | 근거 |
|---|---|---|---|
| 3 (10-28 14:35) | 레이팩 손님 페이지 붙이기 | **안 했음 — E 진행 중** | listener 에 `raypack`·`bergamot` 0, `#pack-row` 빈 자리만(307줄) |
| 14-1 (10-28 11:45) | 강사 QR 고르개 없애기 | 했음 0cd905a | `QR_TARGETS`·`setQrTarget`·`qr_target_` 0 |
| 14-2 | 손님 「앱 같이 받기」 없애기 + 빈 자리 주석 | 했음 0cd905a | `<!-- 장부 63 — 레이팩 받기 자리 -->` |
| 14-3 | /join 앱 설치 안내 빼기 | **되살림(의도)** 5ef3e87 | 투폰 연결 길이라 마스터가 되살림(MISTAKES #16). `btn_install` 남음 — 방 링크만 웹으로 |
| 20-1 (10-27 18:05) | 답변 서브창 삭제·answer 보내는 곳 0 | 했음 142e130 | `askAnswerInput` 0, 「장부 60 — kind: 'answer' 보내는 곳 0」 |
| 20-2 | [선택] 자동 revoke · [무시] dismissed | 했음 142e130 | host `dismissed` |
| 20-3 | 지명 중 ▶ 가 질문 닫음 | 했음 fb39bb9 | host 2258줄 주석 |
| 20-5 | WakeLock 늘 잡기 | 했음 142e130 | listener `wakeLock` 15곳, `visibilitychange` 재획득 |
| 20-6 | 지명 중 인식 재시작 루프 제거 | 했음 142e130 | `onend` 빈 함수(1421줄) |
| 31-1 (10-27 16:00) | 질문·skip 되풀이 거르기 | 했음 852e0be | `seenAsk`·`seenSkip` |
| 31-2 | 답변 입력칸 단추 잠금 | **대체됨** | 20-1 로 입력칸 자체가 없어짐 |
| 31-3 | 원문 보기 상태 기억 시험 | 했음 852e0be | `listener_state_test.js` |
| 38-1 (10-27 11:35) | para_done 에 보낸 사람 id | 했음 ffd6531 | listener `from: listenerId` · host `Set` (단 `msg.from \|\| Math.random()` 대비 길 남음) |
| 38-2 | 「앱 같이 받기」 시험 | **대체됨** | 14-2 로 단추 제거, 시험은 「없음」으로 뒤집힘 |
| 43·44 (10-27 01:20·00:30) | placeholder 키 · 발언 중 안내 · PARA_DONE_WIRE | 했음 0d80d2f | `ask_input_placeholder`·`ask_speaking`·`PARA_DONE_WIRE = true` |
| 61·71 (10-26) | host-i18n·host-play·listener-build·host/end/live/broadcast-raw/web-host-mic · pausedAt=0 | 했음(9fc5e3f 이전부터) | 그 시험 전부 지금 초록 · `pausedAt = 0` |
| 87 (10-23) | 프로 번역 멈춤 | 해당 없음(멈춤 지시) | — |
| 88 | 마스터 누르기 웹킷 표 | 확인 못 함 | `master-click.cjs` 에 webkit 3곳 — 결과 표는 마스터 몫 |
| 89 | 아이폰 사파리 합격 기록 | 했음 | `docs/LISTENER_QA.md` 175줄 |
| 90 | 「복잡하게 하지 마」 | 해당 없음(원칙) | — |
| 91 (10-22 18:05) | 누르기 시험 FAIL 다섯 | 확인 못 함 | 마스터 시험·운영 릴레이 필요 — 이번엔 안 돌림 |
| 95 | 앱 배색·로고 | **부분** | 배색 토큰 host·listener 둘 다 · 로고 host 만(`logo-lockup.png`), listener 에 로고 0 |
| 99 ⓒ | 읽기 = 고른 목소리 | 했음(9fc5e3f 이전부터) | `pickVoice` 가 `currentVoice` 먼저(1227줄) |
| 99 ⓓ | 크롬으로 열기 | 했음 | `googlechromes://` · `test:open-chrome` 초록 (89 로 「선택 안내」 낮춤) |
| 99-1 | 모든 단추 누르기 표 | **강사 했음**(docs/web-buttons.md · test:host-buttons) / 손님은 E 뒤 | 손님 단추 시험 넷(lang_pick·room_tr·state·screen) — 「단추 × 결과」 한 표는 없음 |
| 105 | 시작 단추 늘 보임 · 폰 폭 · 시작 즉시 듣기 | 했음(1·4) / 2·3 사진 확인 안 함 | `#readyArea` 늘 보임(1025줄 주석) |
| 111 | 확인 줄에 운영 주소 · 로컬 경고 | 했음 | `prod-license-e2e.mjs` 5~9줄 |
| 112 | 강사 말하는 언어 82개 | 했음 | `langs.json` 읽기(705줄), srcLang 시험 여럿 |
| 113 | 프로 길 운영 확인 줄 | 했음 | `prod-license-e2e.mjs` ⑦⑨ |
| 114 | download LANG-88 | 했음 | download 에 LANG-88 |
| 115 (0) | 운영 재현 · 다른 언어면 서버 번역 기본 | 코드 있음 / 운영 재현은 확인 못 함 | `navigator.language` 비교(821줄) |
| 120 (0-1) | 음성 질문 글자만 · 강사 언어 하나 · 「번역 중」 | 했음 | 「번역 중」 3곳 · `test:host-no-trans` 초록 |
| 5·6·7 | 자물쇠 시험 · 배포 한 장 · 크롬 열기 | 했음 | `host_no_trans` · `docs/deploy-checklist.md` · open-chrome |
| 8·11 | PR #13·#14 합치기 | 했음(내용 들어감) | LANG-88·갈림 QR(뒤에 14-1 로 다시 없앰) |
| 10 | 프로 번역 공급자 자리 | 했음 · 지금 멈춤(87) | `relay/src/pro-translate.js` |

## 마스터가 「끝」을 그어도 되는 줄 (기본안)
14 · 20 · 31 · 38 · 43 · 44 · 61 · 71 · 89 · 111~114 · 0·0-1·5~11. 남는 것: **3**(E) · **95**(손님 로고) · **99-1**(단추 표) · **88·91**(마스터 시험) · `test:screen` 간헐.
