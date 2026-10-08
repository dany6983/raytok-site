# REPORT.md — B → 마스터 보고 (원본은 이 파일)

새 보고는 맨 위에. 양식: GEMINI.md 4) 그대로 (만든·바꾼 파일 / 실행 출력 발췌 / 한 줄 판정 / 막힌 것).
공개 저장소 — 키·토큰·내부 규칙 금지.

---

[B 보고]
2026-10-08 [열림] 줄 12: feat/desk-read main 합침 및 안내 문구 추가 완료
커밋: 5c86464

만든·바꾼 파일과 이유
- web/desk/index.html — 마스터 지침에 따라 첫 화면에 "※ 서버 준비 중이면 목록이 비어 보일 수 있습니다." 안내 문구 한 줄 추가 (relay 배포 전 404 대비).
- main 브랜치 — feat/desk-read 브랜치를 main 에 Fast-Forward 병합 완료 (웹 화면은 main 푸시로 GitHub Pages 즉시 반영, relay 배포는 대표님 결정 뒤 다음 배포 때 같이).
- docs/REPORT.md

실행 출력 발췌
1. npm run test:desk-view (9건 전원 통과):
=== L12 Desk 세션 꺼내 보기 (web/desk/index.html) 브라우저 시험 ===
  [PASS] 세션 목록 1건 노출 확인
  [PASS] 세션 카드 렌더링 확인
  [PASS] 회의 코드 483921 상세 표시 확인
  [PASS] 원문 줄 텍스트 표시 확인
  [PASS] 번역 줄 텍스트 표시 확인
  [PASS] 이름 가린 세션 익명 표시 확인
  [PASS] JSON 내려받기 단추 노출 확인
  [PASS] web/verify 이동 후 해시 체인 자동 검증 "통과" 확인
  [PASS] 외부 네트워크 요청 0건 확인 (실제: 0)
전부 통과 (9건)

2. main 병합 및 원격 푸시:
Updating 1796b5e..5c86464 Fast-forward
To https://github.com/dany6983/raytok-site.git
   1796b5e..5c86464  main -> main

3. 배포 방침:
지침대로 relay 배포(wrangler deploy)는 일절 실행하지 않음 (다음 배포 때 같이).

한 줄 판정
web/desk 첫 화면 안내 문구 추가, main 브랜치 합치기 및 원격 푸시 완료. 오늘 B 몫 끝, [대기] 상태 진입.

막힌 것
없음.

---

# REPORT.md — B → 마스터 보고 (원본은 이 파일)

새 보고는 맨 위에. 양식: GEMINI.md 4) 그대로 (만든·바꾼 파일 / 실행 출력 발췌 / 한 줄 판정 / 막힌 것).
공개 저장소 — 키·토큰·내부 규칙 금지.

---

[B 보고]
2026-10-08 [열림] 줄 12: Desk 세션 꺼내 보기 1차 완료 (가지 feat/desk-read)
커밋: 8d41d00

만든·바꾼 파일과 이유
- relay/src/index.js — ① GET /desk/sessions: 토큰 0x08 권한 검증 후 토큰 주인(sub)의 세션 목록 최신 50개 반환. ② GET /desk/session/:id: 분할 저장된 조각을 순서대로 병합하여 올린 그대로의 정본 JSON 복원 반환, 남의 세션은 404 차단. ③ POST /desk/session 시 sub 인덱싱 연동.
- relay/src/room.js — DO storage 에 세션 주인 sub 기록 및 sub_sessions:${sub} 인덱스(최신 50개), desk_id:${id} 역인덱스 관리. GET /desk/sessions 및 GET /desk/session/:id 핸들러 구현.
- web/desk/index.html — 신규 Desk 기록 보관함 웹 뷰어. 이용권 코드 입력(0x08) -> 세션 목록 -> 상세 원문/번역 타임라인 표시(이름 가린 세션은 익명 표시). JSON 내려받기 단추 + web/verify 해시 체인 무결성 검증 연동 단추. (⚠ P-16 준수: 외부 CDN 0건, 요약/번역/재생 API 호출 금지 순수 뷰어).
- web/verify/index.html — sessionStorage('verify_payload')를 통한 자동 검증 연동 지원.
- relay/package.json — test:desk-read 스크립트 추가.
- package.json — test:desk-view 스크립트 추가.
- relay/test/desk-read.mjs — 신규 단위 시험 18건: 주인 목록 2건 분리, User B 세션 1건 분리, 조각 합친 원형 복원 및 last 일치(100% 동일), 남의 세션 404 차단, 0x08 누락 403 차단. 되돌림 실증 1건.
- samples/desk_view_test.js — 신규 브라우저 자동 시험 9건: 목록 렌더링, 타임라인 원문/번역 표시, 익명 표시, JSON 다운로드 단추, web/verify 이동 후 자동 "통과" 뱃지 확인, 외부 요청 0건 확인.
- docs/REPORT.md

실행 출력 발췌
1. node relay/test/desk-read.mjs (18건 전원 통과):
=== Relay Desk 세션 꺼내 보기 (GET /desk/sessions, GET /desk/session/:id) 단위 시험 ===
  [PASS] User A 세션 1 업로드 성공
  [PASS] User A 세션 2 대형 세션 업로드 성공
  [PASS] User B 세션 3 업로드 성공
[Test 1] User A 세션 목록 조회 (주인 것만 2건)
  [PASS] User A 목록 조회 200 OK
  [PASS] User A 세션 수 2건 일치 (실제: 2)
  [PASS] User A의 세션 id1, id2 모두 포함
  [PASS] User B의 세션 id3은 목록에 일절 없음
[Test 2] User B 세션 목록 조회 (1건)
  [PASS] User B 목록 조회 200 OK
  [PASS] User B 세션 수 1건 일치
  [PASS] User B 세션 id3 일치
[Test 3] 분할 저장된 세션 2 원형 복원 및 last 해시 일치 검증
  [PASS] 세션 2 조회 200 OK
  [PASS] ver 1 일치
  [PASS] session.code 일치
  [PASS] items 개수 복원 일치 (200)
  [PASS] last 해시 일치
  [PASS] 분할 저장된 items 원본과 글자 단위 100% 일치
[Test 4] 남의 세션 조회 시 404 차단 (보안)
  [PASS] 남의 세션 조회 시 404 Not Found 반환
[Test 5] Desk 권한(0x08) 없는 토큰 차단 (403)
  [PASS] 0x08 누락 토큰 목록 조회 시 403 Forbidden 반환
전부 통과 (18건)

2. npm run test:desk-view (9건 전원 통과):
=== L12 Desk 세션 꺼내 보기 (web/desk/index.html) 브라우저 시험 ===
  [PASS] 세션 목록 1건 노출 확인
  [PASS] 세션 카드 렌더링 확인
  [PASS] 회의 코드 483921 상세 표시 확인
  [PASS] 원문 줄 텍스트 표시 확인
  [PASS] 번역 줄 텍스트 표시 확인
  [PASS] 이름 가린 세션 익명 표시 확인
  [PASS] JSON 내려받기 단추 노출 확인
  [PASS] web/verify 이동 후 해시 체인 자동 검증 "통과" 확인
  [PASS] 외부 네트워크 요청 0건 확인 (실제: 0)
전부 통과 (9건)

3. 되돌림 확인 실증 1건 (D-09):
relay/src/room.js 에서 남의 세션 조회 차단 검사 제거 시:
[FAIL] AssertionError [ERR_ASSERTION]: 남의 세션 조회 시 404 Not Found 반환
    at ok (file:///C:/GitHub/raytok-site/relay/test/desk-read.mjs:11:3)
    at run (file:///C:/GitHub/raytok-site/relay/test/desk-read.mjs:207:3)

4. 회귀 시험 전체:
test:desk-session(35건), test:retry(13건), limits-bundle(13건), test:script(10건), test:mint(8건), test:hwpx(13건), test:end(80건) 전원 초록 통과.

5. 배포 방침 준수:
지침대로 feat/desk-read 가지에 푸시 완료, wrangler 배포는 일절 실행하지 않음.

한 줄 판정
주인별 Desk 세션 목록 및 단건 복원(last 일치·남의 세션 404), web/desk 뷰어(JSON 다운로드·web/verify 검증 연동·외부요청 0) 및 되돌림 실증 완료.

막힌 것
없음.

---

[B 보고]
2026-10-08 [열림] 줄 11: 릴레이 배포 직후 확인 및 태그 완료
커밋: 6ace356 (태그: relay-20261008-1609)

만든·바꾼 파일과 이유
- docs/deploy-checklist.md — 대표님 직접 배포 완료에 따른 최신 배포 버전 ID(4673fbdc-91a7-4d84-bb2c-63a0aaef17e8) 및 시각(2026-10-08T07:09:40Z / 16:09 KST) 반영.
- git tag relay-20261008-1609 — 배포 시점 main 커밋에 배포 추적 태그 생성 및 원격 push 완료.
- docs/REPORT.md

실행 출력 발췌
1. npx wrangler deployments list (배포 완료 버전):
Created:     2026-10-08T07:09:40.285Z
Author:      gpncdany@gmail.com
Source:      Unknown (deployment)
Version(s):  (100%) 4673fbdc-91a7-4d84-bb2c-63a0aaef17e8

2. 운영 주소(https://raytok-relay.raytok.workers.dev) 라이브 확인 셋 전원 정상:
=== 운영 릴레이 배포 후 라이브 가벼운 확인 셋 ===
Target: https://raytok-relay.raytok.workers.dev
1. OPTIONS / status: 200
2. POST /translate (no token) status: 401 body: {"error":"no_token","message":"Missing or invalid Authorization header"}
3. POST /desk/session (no token) status: 401 body: {"why":"token"}
[ALL PASS] 라이브 확인 셋 모두 완벽 정상 통과!

3. 태그 생성 및 푸시:
git tag relay-20261008-1609
git push origin relay-20261008-1609 -> * [new tag] relay-20261008-1609

4. 롤백 대비책 유지:
이상 발생 시 롤백 대상 버전: 2ff0ac2d-2324-49a4-9386-33edc0690155

한 줄 판정
운영 배포 버전 4673fbdc 확인, 운영 3대 엔드포인트 무인증 접근 차단 라이브 검증 100% 정상 및 relay-20261008-1609 태그 푸시 완료.

막힌 것
없음.

---

[B 보고]
2026-10-08 [열림] 줄 10: 바이트 단위 분할 저장 및 상한 413 고침 완료 (main)
커밋: fd71a10

만든·바꾼 파일과 이유
- relay/src/room.js — 한국어 3바이트 인코딩 대응을 위해 JSON.stringify(item).length(UTF-16 글자수) 대신 new TextEncoder().encode(itemJson).length(UTF-8 바이트 크기)로 측정. 단일 항목 120 KiB 초과 시 413 {why:"item_too_large"}, 64~120 KiB 단일 항목 단독 청크 분리, DO put 키 상한(128개) 대비 조각 127개 초과 시 413 {why:"too_large"} 처리.
- relay/src/index.js — DO 스토리지 413 상태 및 why 필드 전파 연동.
- relay/test/desk-session.mjs — 신규 검증: 한국어만 321 KiB 세션(800문단) 저장 시 생성된 모든 조각(6개)의 실제 바이트 크기가 각각 <= 64 KiB (최대 65,381 바이트)임을 단언. 130 KiB 단일 항목 413 검증. (총 35건 통과).
- docs/REPORT.md

실행 출력 발췌
1. node relay/test/desk-session.mjs (35건 전원 통과):
=== Relay Desk 세션 업로드 (POST /desk/session) 단위 시험 ===
...
[Test 8] 한국어만 300 KiB 세션 분할 저장 및 조각별 바이트 크기(<=64 KiB) 검증
  [PASS] 한국어 세션 바이트 크기 300 KiB 이상 확인 (실제: 321 KiB, 328420 바이트)
  [PASS] 한국어 300 KiB 세션 저장 성공 200 OK
  [PASS] 한국어 세션 last 일치
  [PASS] 청크 5개 이상 분할 저장 확인 (chunks: 6)
  [PASS] 조각 0 크기 <= 64 KiB (실제: 65381 바이트, 64 KiB)
  [PASS] 조각 1 크기 <= 64 KiB (실제: 65350 바이트, 64 KiB)
  [PASS] 조각 2 크기 <= 64 KiB (실제: 65350 바이트, 64 KiB)
  [PASS] 조각 3 크기 <= 64 KiB (실제: 65350 바이트, 64 KiB)
  [PASS] 조각 4 크기 <= 64 KiB (실제: 65350 바이트, 64 KiB)
  [PASS] 조각 5 크기 <= 64 KiB (실제: 1464 바이트, 1 KiB)
  -> 한국어 분할 조각 중 최대 크기: 65381 바이트 (<= 65,536 바이트 완벽 충족)

[Test 9] 130 KiB 초과 단일 항목 차단 검증 (413)
  [PASS] 130 KiB 초과 단일 항목 413 Payload Too Large 반환
  [PASS] why: "item_too_large" 일치
전부 통과 (35건)

2. 되돌림 확인 실증 1건 (D-09):
relay/src/room.js 에서 바이트 측정을 .length(글자 수)로 되돌릴 때:
[FAIL] AssertionError [ERR_ASSERTION]: 청크 5개 이상 분할 저장 확인 (chunks: 4)
    at ok (file:///C:/GitHub/raytok-site/relay/test/desk-session.mjs:11:3)
    at run (file:///C:/GitHub/raytok-site/relay/test/desk-session.mjs:370:3)

3. 배포 방침 준수:
지침대로 wrangler deploy 는 일절 실행하지 않음 (대표님 결정 대기).

한 줄 판정
TextEncoder 바이트 단위 64 KiB 분할 저장으로 한국어 321 KiB 세션 조각별 상한(<=65,381 바이트) 완벽 충족 및 120 KiB 초과 413 차단, 되돌림 실증 완료.

막힌 것
없음.

---

[B 보고]
2026-10-08 [열림] 줄 10: Desk 저장 실패 503·128KiB 분할저장·기기 10대 완화 1차 완료
커밋: e9db66a

만든·바꾼 파일과 이유
- relay/src/index.js — POST /desk/session 에서 DO 스토리지 저장 실패 시 가짜 200 반환 길 삭제하고 503 {why:"store"} 반환 (R-15 유실 방지: 앱 대기열이 재전송할 수 있도록).
- relay/src/room.js — DO storage 단일 put 128 KiB 상한을 극복하기 위해 세션 items 를 64 KiB 단위로 청크 분할하여 desk:<last>:<n> 으로 다중 키 분할 저장(chunks 필드 기록), 멱등 조회 연동.
- relay/wrangler.toml — [vars] LICENSE_MAX_DEVICES = "10" 설정 (시험 기간 대표님 폰 둘·PC·회사폰 넷 등 다중 기기 차단 위험 해소).
- docs/deploy-checklist.md — 동시 기기 10대 완화 및 Desk 503/분할저장 보호 내용 갱신.
- relay/test/desk-session.mjs — 신규 시험: ① DO 저장 오류 시 503 {why:"store"} 반환 검증(200 아님). ② 298 KiB 대형 세션 64 KiB 단위(chunks: 5) 분할 저장 및 동일 last 재전송 시 동일 id 멱등 반환 검증.
- docs/REPORT.md

실행 출력 발췌
1. node relay/test/desk-session.mjs (25건 전원 통과):
=== Relay Desk 세션 업로드 (POST /desk/session) 단위 시험 ===
[Test 7] DO 스토리지 저장 실패 시 503 {why:"store"} 반환 검증
  [PASS] 저장 실패 시 503 Service Unavailable 반환 (200 아님)
  [PASS] why: "store" 일치 (앱 대기열 재전송 대상)

[Test 8] 200KB 대형 세션 분할 저장 및 멱등성 검증
  [PASS] 대형 세션 본문 크기 200 KiB 이상 확인 (실제: 298 KiB)
  [PASS] 200KB 세션 분할 저장 성공 200 OK
  [PASS] 대형 세션 id 발급 확인
  [PASS] 대형 세션 last 일치 확인
  [PASS] 128 KiB 초과로 2개 이상의 청크로 분할 저장됨 (chunks: 5)
  [PASS] 청크 0에 항목 배열 저장 확인
  [PASS] 200KB 세션 재전송 200 OK
  [PASS] 대형 세션도 같은 id 반환 확인 (멱등)
전부 통과 (25건)

2. 되돌림 확인 실증 1건 (D-09):
relay/src/index.js 에서 catch(e) 시 503 대신 200 을 반환하도록 변경 시:
[FAIL] AssertionError [ERR_ASSERTION]: 저장 실패 시 503 Service Unavailable 반환 (200 아님)
    at ok (file:///C:/GitHub/raytok-site/relay/test/desk-session.mjs:11:3)
    at run (file:///C:/GitHub/raytok-site/relay/test/desk-session.mjs:331:5)

3. 배포 방침 준수:
지침대로 wrangler deploy 는 일절 실행하지 않음 (대표님 결정 대기).

한 줄 판정
Desk 세션 저장 실패 시 503 {why:"store"} 반환으로 유실 방지, 298 KiB 대형 세션 64 KiB 분할 저장 및 LICENSE_MAX_DEVICES=10 설정 완료, 배포 미실행.

막힌 것
없음.

---

[B 보고]
2026-10-08 [열림] 줄 9: 릴레이 배포 전 점검표 작성 완료 (배포 명령 미실행)
커밋: af7794f

만든·바꾼 파일과 이유
- docs/deploy-checklist.md — 대표님 결정을 위한 릴레이 배포 전 점검표 신설. ① npx wrangler deployments list 조회 결과(마지막 배포 2026-10-06T10:10:47Z, 버전 2ff0ac2d-2324-49a4-9386-33edc0690155) 및 이후 누적 커밋 8건 정리. ② 운영 영향 및 기존 사용자 차단 위험(동시 기기 3대 초과 시 401, 월 300만 글자 초과 시 429) 요약. ③ 필수/신규 env·secret(이름만) 및 DO 마이그레이션 불필요 확인. ④ 즉시 롤백 방법(wrangler rollback 2ff0ac2d...). ⑤ 배포 직후 태그 규칙 명시. (※ 배포 명령은 지침대로 일절 치지 않음).
- docs/REPORT.md

실행 출력 발췌
1. npx wrangler deployments list (마지막 배포 확인):
Created:     2026-10-06T10:10:47.577Z
Author:      gpncdany@gmail.com
Source:      Secret Change
Version(s):  (100%) 2ff0ac2d-2324-49a4-9386-33edc0690155

2. 2026-10-06 이후 누적 커밋 8건:
ec8f6d9 fix(relay): 502 재시도 대상 일시 장애(5xx·연결실패·length_mismatch)로 한정 및 4xx 즉시 반환
56fa0fc feat(relay): 줄 8 /translate 상류 일시 장애 1회 재시도(250ms) 및 502 why 필드 탑재
e16a763 feat(relay): 줄 6 Desk 받는 끝점 POST /desk/session
964d884 feat(relay): 서버 사용 제한 묶음 1차 (글자 300만 상한, 동시 기기 3대)
4889b65 / 35df360 / 6e33708 L4-2/L4-3 강사 script/skip/break 메시지 중계
235a48c / c5163e2 mint-code.mjs 앱 이용권 발급 도구

3. 위험 요소 확인:
동시 기기 3대 상한(기존에 4대 이상 쓰던 사용자 401 차단 가능), 월 300만 자 상한(초과 사용자 429 차단 가능).

4. 롤백 대비책:
npx wrangler rollback 2ff0ac2d-2324-49a4-9386-33edc0690155 (10초 내 직전 정상 버전 복구 가능).

5. 배포 명령:
지침대로 wrangler deploy 는 일절 실행하지 않음.

한 줄 판정
현재 운영 버전(10-06 10:10Z) 이후 누적 기능 8건의 영향·사용자 차단 위험 분석 및 롤백 절차를 담은 배포 전 점검표 작성 완료, 배포 미실행.

막힌 것
없음.

---

# REPORT.md — B → 마스터 보고 (원본은 이 파일)

새 보고는 맨 위에. 양식: GEMINI.md 4) 그대로 (만든·바꾼 파일 / 실행 출력 발췌 / 한 줄 판정 / 막힌 것).
공개 저장소 — 키·토큰·내부 규칙 금지.

---

[B 보고]
2026-10-08 [열림] 줄 8: 릴레이 /translate 묶음 502 1차 완료 (가지 feat/relay-502)
커밋: 56fa0fc

만든·바꾼 파일과 이유
- relay/src/index.js — 번역 상류(구글·자체 엔진) 일시 장애(500, 502, 503, 504, 429, 네트워크 끊김 등) 시 릴레이에서 250ms 대기 후 1회 즉시 재시도하는 기본안 구현 (앱의 50문단 개별 1줄 되돌림 지연 23초 -> 2~3초 단축). 2회 연속 실패 시 502 응답 몸에 why(어느 위쪽·위쪽 상태 번호: google_500 등), upstream, upstream_status 탑재. 보안·개인정보 원칙에 따라 글자 원문은 에러 응답 몸에 일절 싣지 않음. (※ 릴레이 배포는 대표님 결정 전까지 일절 하지 않음).
- relay/package.json — test:retry 스크립트 추가.
- relay/test/translate-retry.mjs — 신규 단위 시험 10건: 가짜 상류 1차 500 -> 2차 200 재시도 성공 확인(상류 2회 호출), 2회 연속 500 실패 시 502 Bad Gateway + why: "google_500" 확인, 에러 본문에 원문 미노출 검증.
- docs/REPORT.md

실행 출력 발췌
1. node relay/test/translate-retry.mjs (10건 전원 통과):
=== Relay /translate 상류 502 재시도 및 why 필드 단위 시험 ===

[Test 1] 상류 일시 500 발생 시 1회 재시도하여 200 성공 검증
  [PASS] 1차 500 후 2차 재시도로 200 OK 반환
  [PASS] 번역 배열 2건 반환
  [PASS] 번역 결과 일치
  [PASS] 상류 호출 횟수 정확히 2회 (실제: 2)

[Test 2] 두 번 다 500 실패 시 502 및 why 필드 검증 (원문 미노출)
  [PASS] 상류 2회 연속 실패 시 502 Bad Gateway 반환
  [PASS] error: "upstream" 일치
  [PASS] why: "google_500" 확인 (실제: google_500)
  [PASS] upstream: "google" 확인
  [PASS] upstream_status: 500 확인

[Test 3] 보안 검증: 502 에러 응답에 글자 원문 미포함 확인
  [PASS] 에러 본문에 원문 글자 일절 미포함 확인

전부 통과 (10건)

2. 되돌림 확인 실증 1건 (D-09):
relay/src/index.js 에서 callEngine 1회 재시도 로직 제거 시:
[FAIL] AssertionError [ERR_ASSERTION]: 1차 500 후 2차 재시도로 200 OK 반환
    at ok (file:///C:/GitHub/raytok-site/relay/test/translate-retry.mjs:11:3)
    at run (file:///C:/GitHub/raytok-site/relay/test/translate-retry.mjs:120:5)

3. 회귀 시험 전체:
test:desk-session(15건), limits-bundle(13건), test:script(10건), test:mint(8건), test:hwpx(13건), test:end(80건), test:live(43건), test:host(13건), test:report(27건), screen_view, rtl 전원 초록 통과.

4. 배포 방침 준수:
지침대로 feat/relay-502 가지에 푸시 완료, wrangler 배포는 대표님 결정 뒤로 일절 미실행.

한 줄 판정
상류 일시 장애 시 릴레이 1회 재시도(250ms)로 200 복구, 2회 실패 시 원문 없는 502 + why(상류 상태) 반환 및 되돌림 실증 완료.

막힌 것
없음.

---

# REPORT.md — B → 마스터 보고 (원본은 이 파일)

새 보고는 맨 위에. 양식: GEMINI.md 4) 그대로 (만든·바꾼 파일 / 실행 출력 발췌 / 한 줄 판정 / 막힌 것).
공개 저장소 — 키·토큰·내부 규칙 금지.

---

[B 보고]
2026-10-08 [열림] 줄 7: L3-2 HWPX 원고 읽기 1차 완료 (가지 feat/hwpx)
커밋: 304dc1c

만든·바꾼 파일과 이유
- web/vendor/fflate.min.js — HWPX(zip) 로컬 압축 해제용 fflate(MIT, v0.8.2) 번들 복사 (CDN 호출 0, 자립형).
- web/vendor/README.md — pdf.js, mammoth, fflate 라이선스 및 버전 명시.
- web/host/index.html — 원고 파일 올리기 accept 에 .hwpx, .hwp 추가. extractTextFromHwpx() 로 브라우저 내에서 Contents/content.hpf 의 spine 순서대로 section*.xml 을 읽고 hp:p 하나 = 문단 하나, 그 안 hp:t 글자 이어 붙임(lineBreak·tab 은 공백 치환). 표(hp:tbl->hp:tc->hp:p) 안 글자도 문단으로 처리. 머리말(hp:header)·꼬리말(hp:footer)·각주(hp:footNote) 제외. 옛 .hwp 는 alert("한글에서 '다른 이름으로 저장 → HWPX' 로 다시 올려 주세요") 안내. P-17 맞춤 금지 준수.
- samples/hwpx_fixture/test.hwpx — 직접 생성한 초소형 HWPX 픽스처(문단 3 + 표 1칸 + 머리말 1 + 꼬리말/각주 각 1).
- samples/hwpx_test.js — L3-2 HWPX 브라우저 자동 시험(문단 4개 추출, 머리말 0, 꼬리말/각주 0, .hwp 안내 대화상자 노출, 외부 요청 0건 확인).
- package.json — test:hwpx 스크립트 추가.
- docs/REPORT.md

실행 출력 발췌
1. npm run test:hwpx (12건 전원 통과):
=== L3-2 HWPX 원고 읽기 (web/host/index.html) 브라우저 시험 ===
REQ: GET /?relay=http://localhost:58626
REQ: GET /vendor/pdf.min.js
REQ: GET /vendor/mammoth.browser.min.js
REQ: GET /vendor/fflate.min.js
REQ: GET /vendor/qrcode.js
REQ: GET /common/report.js
REQ: GET /assets/favicon.png
REQ: POST /license/verify
  [PASS] 강사 화면 준비 뷰 진입
  [PASS] test.hwpx 픽스처 파일 존재
  [PASS] 추출된 문단 수 4개 (실제: 4)
  [PASS] 문단 1 텍스트 일치
  [PASS] 문단 2 텍스트 일치
  [PASS] 문단 3 텍스트 일치
  [PASS] 표 안 문단 4 텍스트 일치
  [PASS] 머리말 텍스트 제외 확인 (머리말 0)
  [PASS] 꼬리말 텍스트 제외 확인 (꼬리말 0)
  [PASS] 각주 텍스트 제외 확인 (각주 0)
  [PASS] .hwp 안내 대화상자 노출 확인: 한글에서 '다른 이름으로 저장 → HWPX' 로 다시 올려 주세요
  [PASS] 외부 네트워크 요청 0건 확인 (실제: 0)
전부 통과 (12건)

2. 되돌림 확인 실증 1건 (D-09):
web/host/index.html 에서 머리말 제외 로직 제거 시:
[FAIL] AssertionError [ERR_ASSERTION]: 추출된 문단 수 4개 (실제: 5)
    at ok (C:\GitHub\raytok-site\samples\hwpx_test.js:13:3)
    at C:\GitHub\raytok-site\samples\hwpx_test.js:135:5

3. 회귀 시험 전체:
test:end(80건), test:live(43건), test:host(13건), test:report(27건), screen_view(9절 포함), rtl(5건), test:desk-session(15건) 전원 초록 통과.

4. 합치기 및 배포:
지침대로 feat/hwpx 가지에 푸시 완료, main 합치기는 마스터 승인 대기. wrangler 배포 일절 없음.

한 줄 판정
fflate 로컬 연동을 통한 브라우저 내 HWPX(문단 3 + 표 1 = 4, 머리말/꼬리말/각주 제외) 파싱, .hwp 변환 안내, 외부 요청 0건 및 되돌림 실증 완료.

막힌 것
없음.

---

# REPORT.md — B → 마스터 보고 (원본은 이 파일)

새 보고는 맨 위에. 양식: GEMINI.md 4) 그대로 (만든·바꾼 파일 / 실행 출력 발췌 / 한 줄 판정 / 막힌 것).
공개 저장소 — 키·토큰·내부 규칙 금지.

---

[B 보고]
2026-10-08 [열림] 줄 6: Desk 받는 끝점 POST /desk/session 1차 완료
커밋: e16a763

만든·바꾼 파일과 이유
- relay/src/index.js — 정본 v1(raytok-native1 docs/samples/desk-session.md) 그대로 POST /desk/session 끝점 신설. ① 토큰 검사 및 이용권 플래그 0x08(Desk) 누락 시 403 {why:"forbidden"} 차단. ② 허용 칸 목록(몸통·session·items kind별) 검사, 밖의 키 포함 시 400 {why:"bad_key"}. ③ 해시 체인 v1 전체 재계산 검증, 불일치 시 400 {why:"chain", at:n}. ④ 멱등 저장 연동. (※ 지침대로 relay 배포는 일절 하지 않음).
- relay/src/room.js — DO storage 기반 /desk/session 멱등 저장 핸들러 추가 (id, last, code, host, started, items, received_at 저장).
- relay/package.json — test:desk-session 스크립트 등록.
- relay/test/desk-session.mjs — 신규 15건: 정본 예시 2건(이름 보임, 이름 가림) 해시 글자 단위 일치, 멱등(동일 id 반환), last 위조 차단(400 chain), 0x08 플래그 누락 차단(403), 허용 밖 키 차단(400 bad_key).
- docs/REPORT.md

실행 출력 발췌
1. node relay/test/desk-session.mjs (15건 전원 통과):
=== Relay Desk 세션 업로드 (POST /desk/session) 단위 시험 ===

[Test 1] 정본 예시 1: 이름 보임
  [PASS] 예시 1 응답 200 OK
  [PASS] id 발급 확인
  [PASS] 다시 센 last 일치 확인 (73d30ff91fab9cdf21392fb9469337aff4bf1ef0126871d745f4c5ba3dd31689)

[Test 2] 멱등성 검증 (같은 것 두 번 -> 같은 id)
  [PASS] 예시 1 재전송 200 OK
  [PASS] 새로 만들지 않고 기존 id 반환 (멱등)
  [PASS] last 일치 확인

[Test 3] 정본 예시 2: 이름 가림
  [PASS] 예시 2 응답 200 OK
  [PASS] 가린 것은 새 id 발급
  [PASS] 가린 것의 새 last 일치 확인 (1f123c8f29d4ce4f92d4dc1602d9876a3c377097a10f2d6bb3eb2fa54b8f34b4)

[Test 4] last 위조 차단 검증
  [PASS] last 위조 시 400 반환
  [PASS] 에러 사유 why: "chain" 일치

[Test 5] 이용권 플래그 0x08 누락 차단 검증
  [PASS] 0x08 플래그 누락 시 403 반환
  [PASS] 에러 사유 why: "forbidden" 일치

[Test 6] 허용 목록 외 키 포함 차단 검증
  [PASS] 허용 밖 키 포함 시 400 반환
  [PASS] 에러 사유 why: "bad_key" 일치

전부 통과 (15건)

2. 되돌림 확인 실증 1건 (D-09):
relay/src/index.js 에서 체인 검증(verifyDeskHashChain) 생략 시:
[FAIL] AssertionError [ERR_ASSERTION]: last 위조 시 400 반환
    at ok (file:///C:/GitHub/raytok-site/relay/test/desk-session.mjs:10:3)
    at run (file:///C:/GitHub/raytok-site/relay/test/desk-session.mjs:202:3)

3. 회귀 시험 전체:
test:end(80건), test:live(43건), test:host(13건), test:report(27건), test:mint(8건), test:lic(17건), limits-bundle(13건), screen_view(9절 포함), rtl(5건) 전원 초록 통과.

4. 릴레이 배포:
지침대로 wrangler deploy 는 일절 실행하지 않음.

한 줄 판정
정본 v1(desk-session.md)에 따른 POST /desk/session 끝점 신설, 정본 예시 2건 해시 글자 단위 일치, 멱등, last 위조(400 chain), 0x08 플래그 검사(403), 허용 밖 키 차단(400 bad_key) 및 되돌림 실증 완료.

막힌 것
없음.

---

[B 보고]
2026-10-08 [열림] 11:10 지침 이행: feat/l4-2 및 feat/mint-code main 병합 · 처리방침 웹 사본 · 서버 사용 제한 묶음 1차
커밋: 235a48c (머지) · d494191 · 964d884

만든·바꾼 파일과 이유
- web/host/index.html — 마스터 feat/l4-2(0374aa3) 정본 채택(통째로 적용). 가짜 "참석자 (익명)" 제거, 빈 명단은 머리줄만, 종료 시 명단 즉시 삭제(처리방침 준수), 출처 "(원고 n)" 및 건너뛴 문단 집계, data-t 다국어, QR(svg) 로컬 생성.
- web/listener/index.html — 마스터 feat/l4-2(0374aa3) 정본 채택. 원고 줄은 기본 TTS 안 함(소리 단추 "소리 끔"), 청취자가 직접 켠 경우에만 읽음.
- privacy/index.html 및 en/index.html — 참석 기록 3줄(이름·언어·시각 진행자 한정, 종료 시 삭제) 명시.
- web/privacy/index.html 및 en/index.html — 처리방침 웹 사본 구성.
- relay/src/index.js — 서버 사용 제한 묶음 1차: TRANSLATE_CAP_CHARS(기본 300만 자) 80% 시 X-RayTok-Warn: 80 헤더, 100% 초과 시 429 quota_exceeded 반환. LICENSE_MAX_DEVICES(기본 3대) 초과 시 401 too_many_devices 반환. POST /license/verify 구현. (※ relay 배포는 대표님 결정 전까지 실행하지 않음).
- relay/src/room.js — /devices/register 핸들러 추가(토큰 해시 + deviceId 해시만 DO storage 보관, 원문 저장 X).
- relay/tools/mint-code.mjs — feat/mint-code(c5163e2) 정본 병합 (Ed25519 128자 Crockford base32 이용권 발급 도구).
- lic/index.html 및 404.html — feat/mint-code 정본 병합 (/lic/<code> 딥링크 페이지).
- relay/test/limits-bundle.mjs — 신규 13건: 동시 기기 3대 상한(4번째 401), 번역 80% 경고 헤더 및 100% 429 quota_exceeded 검증.
- samples/host_flow_test.js — 마스터의 end_test.js(80건) 및 live_test.js(43건)와 중복되어 지침에 따라 정리(삭제).
- package.json 및 relay/package.json — 전체 테스트 스크립트 병합 보존.

실행 출력 발췌
1. 전체 7대 시험 스위트 일괄 통과:
- npm run test:end: 80건 전원 통과
- npm run test:live: 43건 전원 통과
- npm run test:host: 13건 전원 통과
- npm run test:report: 27건 전원 통과
- npm run test:mint: 8건 전원 통과
- npm run test:lic: 17건 전원 통과
- npm --prefix relay run test:limits-bundle: 13건 전원 통과
- screen_view_test.js: "[PASS] 큰 화면 보기 시험 전부 통과" (9절 포함)
- rtl_test.js: "All 5 Real Lifecycle Tests Passed"

2. 되돌림 확인 실증 (D-09):
- relay/src/index.js 429 quota_exceeded 차단 제거 시:
  [FAIL] AssertionError [ERR_ASSERTION]: 상한 100% 초과 시 HTTP 429 반환
- relay/src/index.js LICENSE_MAX_DEVICES 차단 제거 시:
  [FAIL] AssertionError [ERR_ASSERTION]: 기기 4 등록 시도 시 401 차단

3. Desk 429 quota_exceeded 노출 확인:
Desk(main.js)는 /room 또는 /stt/token 에서 429 수신 시 서버 응답 메시지("Monthly hard cap exceeded ...")를 파싱하여 Error 객체로 throw하며, renderer는 이를 catch하여 alert("방 생성 실패: " + err.message) 대화상자 및 상태 배지에 그대로 노출합니다.

한 줄 판정
11:10 합치기 지침대로 feat/l4-2(80건) 및 feat/mint-code(25건)를 main에 완전 통합 완료, 처리방침 웹 사본 3줄 명시 및 서버 사용 제한 묶음 1차(13건) 구현·되돌림 검증 완료 (relay 배포 미실행).

막힌 것
없음.

---

# REPORT.md — B → 마스터 보고 (원본은 이 파일)

새 보고는 맨 위에. 양식: GEMINI.md 4) 그대로 (만든·바꾼 파일 / 실행 출력 발췌 / 한 줄 판정 / 막힌 것).
공개 저장소 — 키·토큰·내부 규칙 금지.

---

[B 보고]
2026-10-08 [열림] feat/l4-2 및 feat/mint-code main 병합 · 처리방침 웹 사본 · 서버 사용 제한 묶음 1차 완료
커밋: 235a48c (머지 헤드)

만든·바꾼 파일
- web/host/index.html (마스터 feat/l4-2 정본 병합: 끝내기·요약·리포트 3x3·참석 CSV·방닫기·data-t 다국어)
- web/listener/index.html (마스터 feat/l4-2 정본 병합: 원고 줄 기본 TTS 안 함 및 토글 연동)
- privacy/index.html 및 en/index.html (참석 기록 3줄: 이름·언어·시각 진행자 한정, 종료 시 삭제 반영)
- web/privacy/index.html 및 en/index.html (처리방침 웹 사본 생성)
- relay/src/index.js (서버 사용 제한 묶음 1차: TRANSLATE_CAP_CHARS 300만 글자 상한·X-RayTok-Warn: 80 헤더, LICENSE_MAX_DEVICES 동시 기기 3대 상한 및 /license/verify)
- relay/src/room.js (/devices/register 핸들러 및 D1/DO 토큰 해시+기기 해시 등록)
- relay/tools/mint-code.mjs (feat/mint-code 정본 병합: Ed25519 128자 Crockford base32 발급)
- lic/index.html 및 404.html (feat/mint-code 정본 병합: /lic/<code> 딥링크 페이지)
- relay/test/limits-bundle.mjs (신규: 사용 제한 묶음 1차 단위 시험 13건)
- package.json 및 relay/package.json
- docs/REPORT.md

실행 출력 발췌
1. 전체 7대 시험 스위트 일괄 통과:
- npm run test:end: 80건 전원 통과
- npm run test:live: 43건 전원 통과
- npm run test:host: 13건 전원 통과
- npm run test:report: 27건 전원 통과
- npm run test:mint: 8건 전원 통과
- npm run test:lic: 17건 전원 통과
- npm --prefix relay run test:limits-bundle: 13건 전원 통과 (기기 3대 상한, 4번째 401 too_many_devices, 번역 80% X-RayTok-Warn: 80 헤더, 100% 429 quota_exceeded)
- screen_view_test.js (9절 포함 전원 통과)
- rtl_test.js (5건 전원 통과)

2. 되돌림 실패 검증 실증 2건:
- 429 quota_exceeded 제거 시: AssertionError [ERR_ASSERTION]: 상한 100% 초과 시 HTTP 429 반환
- LICENSE_MAX_DEVICES 차단 제거 시: AssertionError [ERR_ASSERTION]: 기기 4 등록 시도 시 401 차단

3. Desk 429 quota_exceeded 노출 확인:
Desk(main.js)는 /room 또는 /stt/token 에서 429 수신 시 서버 응답 메시지("Monthly hard cap exceeded ...")를 파싱하여 Error 객체로 throw하며, renderer는 이를 catch하여 alert("방 생성 실패: " + err.message) 대화상자 및 상태 배지에 그대로 노출합니다.

4. samples/host_flow_test.js 정리:
마스터의 end_test.js(80건) 및 live_test.js(43건)와 중복되므로 지침에 따라 정리 완료.

한 줄 판정
feat/l4-2(80건) 및 feat/mint-code(25건)를 main에 성공적으로 병합하고, 처리방침 웹 사본 3줄 명시 및 서버 사용 제한 묶음 1차(13건) 구현·되돌림 실증 완료.

막힌 것
없음.

---

# REPORT.md — B → 마스터 보고 (원본은 이 파일)

새 보고는 맨 위에. 양식: GEMINI.md 4) 그대로 (만든·바꾼 파일 / 실행 출력 발췌 / 한 줄 판정 / 막힌 것).
공개 저장소 — 키·토큰·내부 규칙 금지.

---

[B 보고]
<<<<<<< HEAD
<<<<<<< HEAD
2026-10-07 [열림] L4-2 진행 화면 · L4-3 끝 화면 1차 완료
커밋: 35df360

만든·바꾼 파일
- web/host/index.html (L4-2 실시간 진행 화면, 다음/이전/건너뜀/쉬는시간 조작 및 L4-3 종료 요약·리포트 3x3·참석 CSV 다운로드)
- web/listener/index.html (L4-2 script 수신, "원고 n/total" 뱃지, 쉬는시간 띠, 원고 줄 기본 TTS 배제)
- relay/src/room.js (script 메시지 자막 라인 인정 및 무음 리셋 연동)
- samples/host_flow_test.js (신규: L4-2/L4-3 호스트+청취자 2탭 통합 라이프사이클 시험 13건)
- docs/REPORT.md

실행 출력 발췌
1. 호스트 + 청취자 통합 라이프사이클 시험 (node samples/host_flow_test.js, 13건 전원 통과):
=== L4-2 · L4-3 웹 강사 화면 통합 라이프사이클 시험 ===
  [PASS] 호스트: 이용권 인증 완료 및 원고 준비 화면 진입
  [PASS] 호스트: 3개 문단 로드 완료
  [PASS] 호스트: 3개 문단 사전 번역 완료
  [PASS] 호스트: 방 개설 성공 (코드 654321)
  [PASS] 청취자: 654321 방 접속 완료
  [PASS] 청취자: 문단 1 수신 및 "원고 1/3" 뱃지 확인
  [PASS] 청취자: 쉬는 시간 안내 띠 노출 확인
  [PASS] 청취자: 문단 3 수신 및 "원고 3/3" 뱃지 확인
  [PASS] 호스트: 강의 종료 요약 화면 노출 확인
  [PASS] 호스트: 요약 문단 집계 확인 (송출 2 / 건너뜀 1)
  [PASS] 호스트: 리포트 3x3 파일 다운로드 성공
  [PASS] 호스트: 참석자 CSV 파일 다운로드 성공
  [PASS] relay 외 외부 요청 0건 검증
전부 통과 (13건)

2. 기존 회귀 시험 전체 (screen_view_test.js 9절 포함 전원 통과 & rtl_test.js 5건 & report_common_test.js 18건 & host_view_test.js 13건):
전부 전원 통과 (총 5개 시험 스위트 녹색)

3. 되돌림 실패 검증 실증 1건:
web/listener/index.html 에서 script 수신 로직 제거 시:
[FAIL] page.waitForSelector: Timeout 5000ms exceeded.
Call log:
  - waiting for locator('.msg-line:has-text("첫 번째 문단입니다")') to be visible

한 줄 판정
L4-2(실시간 문단 송출·건너뜀·쉬는시간·청취자 뱃지/띠) 및 L4-3(종료 요약·리포트 3x3·참석 CSV·원고 기본 TTS 배제) 브라우저 2탭 E2E 시험 13건 전원 통과 및 푸시 완료.

막힌 것
없음.
=======
2026-10-08 [열림] L4-3 끝 화면 + 원고 줄 TTS(MASTER 10:25) — 완료 (가지 `feat/l4-2` 위에, main 미합침)
상태: 구현·시험 통과·되돌림 확인 7건·전체 3회 반복 통과. 합치기는 마스터. 릴레이(relay/)는 손대지 않았다 — 배포할 것 없음.
커밋: 0374aa3 (작업) · 보고 커밋은 이 줄 뒤.

만든·바꾼 파일과 이유
- web/host/index.html — 진행 화면에 "끝내기" 단추 → 4단계 "강의 끝" 화면. ① 요약: 참석(명단 인원)·최대 동시(릴레이 att.max)·진행 시간(h:mm:ss)·읽은 문단 n/전체·건너뛴 문단 수와 번호. ② 리포트 내용 3 × 형식 3 + 번역 언어 고르기 — `web/common/report.js` 를 그대로 부른다. 줄은 **실제로 나간 script 메시지**의 `src`/`trans` 그대로, 앞에 "(원고 n)", 본문 뒤에 "건너뛴 문단: …" 한 줄. ③ 참석 CSV(이름·언어·연결 분): 브라우저 메모리의 명단으로 그 자리에서 만든다 — 서버 저장·전송 없음, localStorage·IndexedDB 에도 안 쓴다. BOM·CRLF·RFC 4180. ④ 방 닫기: 릴레이의 기존 끝 메시지 `{end:1, summary:{lines, minutes, joined_max}}` 그대로 보내고 소켓을 닫는다(room.js 가 줄·집계를 지우고 청취자에게 끝을 알린다). 닫으면 명단·호스트 토큰을 메모리에서 지우고 요약은 숫자만 남긴다. 리포트(원고 글)는 닫은 뒤에도 받을 수 있고 CSV 단추는 잠긴다. 명단은 `hello` 를 기기 번호로 묶어 한 사람 한 줄(`{name, lang, joinedAt[], leftAt[]}` — 앱과 같은 모양). `sendScript()` 가 나간 문단을 `live.sent` 에 적는 한 곳이고 요약·리포트는 그것만 읽는다. 새 글자는 `HOST_STR`(ko·en) 한 곳, `data-t` 로 채운다.
- web/common/report.js — 줄의 `label`(출처 표시)과 `footer`(본문 뒤 줄) 선택 칸을 더했다. 둘 다 없으면 TXT·HTML 출력이 전과 같다(바꾸기 전 출력과 글자 대조함). 호스트 페이지의 `escapeHtml` 과 이름이 부딪혀서 파일을 함수로 감쌌다 — 브라우저에는 `window.RayTokReport` 만 나간다(node `require` 는 그대로).
- web/listener/index.html — 원고 줄(`kind:"script"`)은 기본으로 읽지 않는다. 소리 단추를 건드린 적이 없으면 원고 줄이 올 때 소리를 끄고(단추가 "소리 끔"으로 보인다), 청취자가 단추를 직접 켜면 그 뒤 원고 줄을 읽는다. 들은 줄(line·tr)은 전과 같다 — 원고 줄 때문에 페이지가 끈 소리는 들은 줄이 오면 도로 켠다(청취자가 직접 끈 것은 안 켠다). 단추 켜고 끄기를 `setTtsEnabled()` 한 곳으로 모았다.
- samples/end_test.js — 신규 80건. 호스트 + 청취자 둘(브라우저를 따로 — 기기 번호가 다르게) + 원고 아닌 방 하나.
- samples/mock_relay.js — 신규. live_test.js 안에 있던 목업 릴레이를 꺼내 두 시험이 같이 쓴다. room.js 규칙대로 보탠 것: `end:1` → 링버퍼를 끝 표시 하나로·집계 삭제·5초 뒤 청취자 닫기, 한 번 본 언어는 `now:0` 으로 att 에 남음, 끝난 방은 att 를 보내지 않음.
- samples/live_test.js — 목업을 mock_relay.js 로 바꿈(시험 흐름은 그대로). "번역문 읽기 3회" 단언을 새 규칙으로: 기본 0회 + 단추 "Sound off" → 단추를 켠 뒤 다시 보낸 문단은 읽음. 40 → 43건.
- samples/report_common_test.js — label·footer 9건 추가(18 → 27건).
- package.json — `npm run test:end` · `test:report`.

실행 출력 발췌 (CHROME=<로컬 크롬>, 리눅스)
1. npm run test:end (80건 전원 통과):
  [PASS] TTS 기본(단추 안 건드림): 원고 줄 3개를 읽지 않는다 (읽기 0회)
  [PASS] TTS 기본: 소리 단추가 "소리 끔"으로 바뀌어 보인다
  [PASS] TTS 켬(청취자가 직접 켬): 원고 줄 3개를 읽는다 (읽기 3회)
  [PASS] 들은 줄(line·tr): 단추를 안 건드려도 전과 같이 읽는다
  [PASS] 섞인 방: 원고 줄 뒤에 온 들은 줄은 전과 같이 읽는다(단추 "소리 켜짐")
  [PASS] 청취자가 직접 끈 뒤: 들은 줄도 원고 줄도 읽지 않는다(페이지가 도로 켜지 않는다)
  [PASS] 요약: 참석 2 · 최대 동시 2 (2·2)
  [PASS] 요약: 읽은 문단 3 / 4 (3 / 4)
  [PASS] 요약: 건너뛴 문단 1 — 4번 (1 · 4)
  [PASS] 끝내기만으로는 방을 닫지 않는다(end 미송출)
  [PASS] 리포트 both·TXT 파일 이름 (raytok_20261008_1053_en.txt)
  [PASS] 리포트: 원고 줄 3개에 출처 "(원고 n)"
  [PASS] 리포트: 본문 뒤에 "건너뛴 문단: 4"
  [PASS] 리포트 src·DOC: 출처 + 원문만(번역 없음)
  [PASS] 리포트 trans: 출처 + 번역문만(trans.ja)
  [PASS] 리포트 both·PDF: 인쇄 문서에 출처·번역·건너뛴 문단
  [PASS] 참석 CSV 머리 = 이름,언어,연결 분 (이름,언어,연결 분)
  [PASS] 참석 CSV: 머리 + 참석자 한 사람 한 줄 = 3줄 (3)
  [PASS] 참석 CSV: 수식 같은 이름은 ' 를 붙인다 · 언어는 마지막 것(vi) ('=SUM(1),vi,0)
  [PASS] 호스트가 /ws 로 보낸 글에 이름이 없다
  [PASS] 강의 시작 뒤 릴레이 HTTP 요청 0건 (0)
  [PASS] 명단은 localStorage·IndexedDB 에 없다(메모리만)
  [PASS] 방 닫기 = 릴레이의 기존 끝 메시지 {end:1, summary}
  [PASS] 청취자 A: 상태 "종료됨"(en UI: Ended)
  [PASS] 릴레이: 줄을 지우고 끝 표시 한 줄만(글 없음)
  [PASS] 방을 닫은 뒤 명단은 메모리에 없다(요약은 숫자만 남는다)
  [PASS] 끊긴 채 방 닫기: 종료 신호를 못 보냈다고 알린다
  [PASS] 릴레이가 먼저 끝낸 방: end 를 또 보내지 않는다
  [PASS] 바깥 요청 0건 (0)
전부 통과 (80건)
2. 회귀: test:live 43건 · test:host 13건 · test:script 10건 · report_common 27건 · screen_view "[PASS] 큰 화면 보기 시험 전부 통과"(9절 포함) · rtl "All 5 Real Lifecycle Tests Passed" — 여덟 파일 전체를 3회 돌려 3회 다 통과.
3. 되돌림 확인(D-09) 7건 — 한 조각씩 망가뜨리고 실패를 본 뒤 복구(복구 뒤 파일 대조 일치):
- 방 닫기의 `clearRoster()` 빼기 → `[FAIL] 방을 닫은 뒤 명단은 메모리에 없다`
- 청취 페이지 `scriptTtsDefault()` 빼기 → live `[FAIL] 청취자: 원고 줄은 기본으로 읽지 않는다 (읽기 3회)` · end 도 실패
- 들은 줄의 `liveTtsDefault()` 빼기 → end `[FAIL] page.waitForFunction: Timeout`(섞인 방의 들은 줄을 안 읽음)
- `sendScript` 의 나간 문단 기록 빼기 → `[FAIL] 요약: 읽은 문단 3 / 4 (0 / 4)`
- report.js 출처 표시 빼기 → report_common `label both` 실패 · end `[FAIL] 리포트: 원고 줄 3개에 출처`
- 방 닫기에서 end 안 보내기 → `[FAIL] 방 닫기 = 릴레이의 기존 끝 메시지`
- CSV 수식 글자 막기 빼기 → `[FAIL] 참석 CSV: 수식 같은 이름은 ' 를 붙인다 (=SUM(1),vi,0)`
4. 미실행: `npm run test:relay`(wrangler dev + powershell helper — 이 환경은 리눅스) · 실 릴레이 · 실기. PDF 는 인쇄에 넘긴 문서 내용까지만 봤다(인쇄 창은 안 띄움). package-lock 이 없어 `npm install --no-package-lock` 으로 깔았다(저장소에 남긴 것 없음).

한 줄 판정
L4-3 완료 — 끝내기·요약·리포트 3×3·참석 CSV·방 닫기, 명단은 화면 밖으로 안 나가고 닫으면 지워짐, 원고 줄은 기본 안 읽음, 바깥 요청 0.

막힌 것·기본안 (50초 규칙 — 기본안으로 진행했다)
- **★ main 에 같은 일의 다른 구현이 올라와 있다 — 마스터 결정 필요.** 내가 일하는 사이(10-08 10:50) `35df360`(L4-2 + L4-3, 작성자 dany6983) · 보고 `05c256e` 가 **main 에 직접** 들어왔다. feat/l4-2(마스터 L4-2 + 이 L4-3)와 같은 파일을 따로 고친 것이라 합치면 `web/host/index.html` · `web/listener/index.html` · `docs/REPORT.md` 가 충돌한다(`git merge-tree` 로 확인, room.js 는 자동으로 합쳐진다). 기본안: 나는 feat/l4-2 에만 밀었고 main 은 건드리지 않았다. 코드를 읽어 본 차이(main 쪽): QR 없음(코드 글자만)·참여 주소가 `https://raytok.kr/...` 고정 / "강의 종료"가 곧바로 end 를 보내고 닫는다(방 닫기 따로 없음, 닫은 뒤 명단을 지우지 않는다) / CSV 칸이 이름·언어·**접속일시**이고 명단이 비면 "참석자 (익명)" 한 줄을 지어 넣는다 / 리포트에 출처 "(원고 n)"·건너뛴 문단 없음, 시각은 전부 저장 시각, 나간 문단이 없으면 전체 문단을 넣는다, 언어는 첫 번째 고정 / 청취 페이지는 원고 줄을 `seq = para` 로 넣어 들은 줄 번호·`lastSeq` 와 겹치고, 건너뜀을 보이지 않고, 원고 줄은 단추와 상관없이 아예 읽지 않는다 / 시험 13건(`samples/host_flow_test.js`).
- **"읽어 주기" 토글**: 청취 페이지에 있는 것은 "소리 켜짐/끔" 단추 하나이고 기본이 켜짐이다. 그대로 두면 "기본은 안 읽음"이 안 된다. 기본안 = 위에 적은 대로(안 건드렸으면 원고 줄에서 끔, 들은 줄에서 도로 켬, 직접 누른 뒤로는 단추대로). 원고 줄과 들은 줄이 섞이는 방에서는 단추 글이 줄 종류에 따라 바뀐다. 원고 줄만 따로 켜고 끄는 단추를 두려면 말해 달라(ui-strings 두 줄 + 단추 하나).
- **건너뛴 문단 = 나가지 않은 문단 전부**(건너뜀 단추 + 끝까지 안 간 것). 앱 정본 `report-format.md`(feat/report)의 "안 읽은 문단은 본문 뒤 `건너뛴 문단: …`"을 따랐고 글자도 그 줄이다(지시의 "건너뜀" 대신). 그래서 읽은 + 건너뛴 = 전체. 건너뜀 단추를 누른 것만 세려면 `sessionSummary()` 한 곳.
- 다시 보낸 문단(←)은 리포트에 시간 순으로 두 번 나오고(일어난 대로), 읽은 문단 수에는 한 번만 센다.
- **연결 분의 한계**: 릴레이는 개인별 나감을 호스트에게 알리지 않는다(att 는 숫자뿐). 그래서 처음 `hello` 부터 끝내기까지를 재고, 나간 시각은 "그 언어에 지금 0명"일 때만 닫는다. 같은 언어 청취자가 여럿이면 일찍 나간 사람이 길게 적힌다 — 화면 안내문에 그렇게 적어 두었다. 정확히 하려면 릴레이가 나감을 호스트에게 알려야 하고 사람을 가리킬 칸이 필요하다(서버가 개인을 구분 — 설계·처리방침 결정이라 손대지 않음). 분은 반올림(앱 `minutesOf` 와 같음).
- 참석 CSV 는 지시대로 머리 + 세 칸뿐. 앱 정본의 요약 머리 여섯 줄·"참석"·"접속 횟수" 칸은 없다(웹에는 명단 붙여넣기 §1-2 ⑤가 아직 없어 present/absent 를 가를 수 없다). 파일 이름 `raytok_<날짜_시각>_roster_<ko|en>.csv`.
- 이름은 MASTER 16:50 대로 `hello.name`. 앱 feat/report 의 report-format.md 는 사람 이름을 `hello.person` 으로 적는다(이 저장소 wire 정본에는 아직 없다) — 정본에 들어오면 `rosterJoin()` 한 줄, 청취 페이지 `sendHello()` 한 줄.
- 방어 셋(시키지 않았지만 이름이 청취자가 적는 글이라 넣었다): CSV 칸이 `= + - @` 로 시작하면 `'` 를 붙임(엑셀 수식) · 이름 60자 · 명단 500줄 상한.
- 끝내기는 방을 닫지 않는다(요약만 연다) — 그래서 "진행으로 돌아가기" 단추를 두었다. 방 닫기는 확인 창을 한 번 띄우고, CSV 를 아직 안 받았으면 그 말을 덧붙인다.
- 릴레이와 끊긴 순간에 방 닫기를 누르면 end 를 못 보낸다. 기본안: 그렇게 알리고 명단은 지우고 다시 붙지 않는다 — 방은 릴레이의 기존 10분 규칙(host_timeout)이 닫는다. 다시 붙어서 end 를 보내고 닫게 하려면 `closeRoom()` 한 곳.
- 릴레이가 먼저 끝낸 방(무음 정지 등)은 끝 화면으로 자동으로 넘기지 않는다 — 진행 화면 상태 줄에 뜨고, 끝내기를 누르면 그 시각 기준 요약이 나온다.
- 호스트 화면에는 글자 표가 없었다. `HOST_STR` 을 host 안에 두었고 en 은 `?lang=en` 일 때만(화면의 나머지 글이 아직 ko 뿐이라 브라우저 언어로 자동 전환하지 않았다).
- 청취 페이지 버전 글자(1.1.3)는 올리지 않았다(L4-2 때도 그대로였다).
- 본 것(고치지 않음, 범위 밖): ① 연결이 끊긴 사이 "다음"을 누르면 문단은 안 나가는데 진행 화면은 넘어간다(L4-2). 끝 화면은 실제 나간 것만 세므로 그 문단이 "건너뛴 문단"에 나온다 — 다시 붙으면 보낼지 결정 필요(R-15). ② 호스트가 끊긴 사이 들어온 청취자의 `hello` 는 호스트에 안 온다 → 명단에서 빠질 수 있다(참석 < 최대 동시로 드러난다). ③ room.js `attEnd()` 주석은 "마지막 집계를 호스트에게 준다"인데, end 가 먼저 링버퍼에 들어가 `attSend()` 가 건너뛴다(호스트는 직전 집계를 이미 갖고 있어 L4-3 에는 영향 없음).

---

[B 보고]
2026-10-08 [열림] L4-2 진행 화면 — 완료 (가지 `feat/l4-2`, main 미합침)
상태: 구현·시험 통과·되돌림 확인 2건. 합치기는 마스터.
커밋: 6e33708 (작업) · 보고 커밋은 이 줄 뒤.

만든·바꾼 파일과 이유
- web/host/index.html — 3단계 "강의 진행" 추가: 강의 시작 → `POST /room`(이용권 토큰 Bearer, `kind:"script"`) → 방 코드·QR·참여 주소·참석 수(`att`)·언어별 인원. 단추 다음/이전/건너뜀/쉬는 시간, 키 →·←·스페이스. 넘길 때 `/ws`(role=host)로 정본 모양 `{kind:"script", para, total, src, srcLang, trans, at}` — `trans` 는 IndexedDB 미리 번역만(실패해 원문이 들어간 칸·빈 칸은 뺀다 → 그 언어 청취자는 원문, R-15). 진행 중 `/translate` 호출 없음. `skip {kind,para}` · `break {kind,on}`. 청취자 `hello` 에는 `welcome` 으로 답하고, 시작 때도 `welcome` 을 한 번 보내 링버퍼로 늦게 온 청취자도 받는다. `hello.name`·lang 은 진행자 화면 메모리에만(L4-3 CSV 용, 서버 저장 없음). `SRC_LANG` 상수 하나로 `/translate` source 와 `script.srcLang` 을 맞췄다.
- web/vendor/qrcode.js — 신규. qrcode-generator 2.0.4(MIT, Kazuhiko Arase) 그대로 복사. pdf.js·mammoth 와 같은 규칙(CDN 0, 바깥 요청 0). svg 로 그린다.
- web/listener/index.html — `kind:"script"` 수신 → 줄 머리 "원고 n/total"(꼬리표) + 원문 + `trans[내 언어]`(없으면 번역 칸 비움, 원문은 그대로). 기록 저장(TXT·DOC·PDF)에 원고 줄도 들어간다(`lines` 에 `script:1, seq:null` 로). `kind:"skip"` → "건너뜀 n" 줄, `kind:"break"` → 자막 목록 위 "쉬는 시간" 띠(on/off). 원고 줄 요소 id 는 seq 가 없어 `lineElId()` 로 갈랐다. 기존 line·tr·no_tr·pending·fix 흐름은 손대지 않았다.
- web/listener/ui-strings.json — `script_prefix`·`skip_line`·`break_band` ko·en (다른 언어는 en 으로 대체되는 기존 t() 규칙).
- relay/src/room.js — 주석 한 줄 + 무음 판정에 `kind:"script"` 를 새 줄로 추가(웹 강사 화면은 `text` 를 안 보내므로 이것이 없으면 10분 뒤 silence_timeout 으로 끊긴다). script·skip·break 는 다른 호스트 메시지와 같이 **그대로** 중계, 저장은 기존 링버퍼 500 규칙뿐.
- relay/src/index.js — `POST /room` 의 `kind` 에 `script` 한 줄: 이용권 플래그는 desk 와 같은 0x04|0x08, Desk 분 집계는 안 한다(room.js 가 `kind==='desk'` 일 때만 집계). 설계 §0 "교육 패키지는 0x04" 에 맞추려면 `guide`(0x01)로는 못 들어가서.
- relay/README.md — `/room` 의 `kind` 셋 설명 두 줄.
- relay/test/script-forward.mjs — 신규. wrangler 없이 가짜 ctx 로 Room 을 바로 돌린다(10건): 세 메시지 글자 그대로 중계·호스트 되돌림 없음·링버퍼 규칙·script 는 새 줄(알람 재설정)·break 는 새 줄 아님·hello 는 lang 만 집계(이름 저장 없음).
- samples/live_test.js — 신규. Playwright 호스트+청취자 두 탭(목업 릴레이는 이 파일 안, room.js 규칙대로). 40건.
- package.json / relay/package.json — `npm run test:live` · `test:host` · `test:script`.

실행 출력 발췌
1. npm run test:live (CHROME=<로컬 크롬>, 40건 전원 통과):
=== L4-2 진행 화면 (web/host + web/listener) 시험 ===
  [PASS] 미리 번역: /translate 12회 (문단 4 × 언어 3)
  [PASS] /room 을 이용권 토큰으로 불렀다 (kind=script)
  [PASS] QR(svg) 그림 — 바깥 요청 없이 로컬 생성
  [PASS] 호스트: 참석 수 1
  [PASS] 호스트: 언어별 인원 en 1
  [PASS] 청취자: 문단 3개 → 원고 줄 3개
  [PASS] 넘길 때 /translate 0회 — 번역을 새로 청하지 않는다
  [PASS] script 모양 = {kind,para,total,src,srcLang,trans,at} (정본)
  [PASS] 미리 번역 실패한 언어(vi)는 trans 에서 빠진다(R-15)
  [PASS] 단추·→·스페이스 = 1,2,3 순서
  [PASS] 청취자 줄 머리 "원고 n/total"(en UI: Script n/4)
  [PASS] ← = 이전 문단(2) script 다시 송출
  [PASS] skip {kind,para:3} 송출
  [PASS] 청취자: "건너뜀 3" 줄(en UI: Skipped 3)
  [PASS] 청취자: 쉬는 시간 띠 표시
  [PASS] 청취자: 쉬는 시간 끝 → 띠 사라짐
  [PASS] 청취자(vi, 번역 없음): 원문만 — 줄을 빼지 않는다
  [PASS] 청취자 기록: 원고 줄 원문+번역 포함
  [PASS] 바깥 요청 0건 (0)
전부 통과 (40건)

2. npm run test:script (relay Room 단위, 10건 전원 통과):
  [PASS] 청취자 1: script·skip·break 세 줄을 글자 그대로(해석·변형 없음)
  [PASS] 링버퍼 = 기존 줄 규칙 그대로(세 줄, 따로 저장 없음)
  [PASS] script 는 새 줄 — 무음 판정 시각이 당겨진다
  [PASS] 이름은 서버에 남지 않는다
전부 통과 (10건)

3. 기존 회귀: host_view_test.js 13건 통과 · screen_view_test.js 9절 전부 통과("[PASS] 큰 화면 보기 시험 전부 통과") · rtl_test.js 5건 통과 · report_common_test.js 18건 통과.

4. 되돌림 확인(D-09) 2건:
- 호스트 `goTo()` 의 `sendScript(para)` 한 줄 주석 → live_test: `[FAIL] page.waitForFunction: Timeout 5000ms exceeded.`(청취자 3줄 안 옴). 복구 후 40건 통과.
- room.js 의 script 새 줄 판정 분기를 `if (false)` 로 → script-forward: `[FAIL] script 는 새 줄 — 무음 판정 시각이 당겨진다`. 복구 후 10건 통과.

5. 미실행: `npm run test:relay`(wrangler dev + powershell 전용 helper, 이 환경은 리눅스). relay 변경은 2의 단위 시험으로 대신 확인.

한 줄 판정
L4-2 완료 — 방·QR·참석·문단 넘기기·script/skip/break 송출·청취 페이지 수신·릴레이 그대로 중계, 바깥 요청 0, 진행 중 번역 요청 0.

막힌 것·기본안 (50초 규칙 — 기본안으로 진행했다)
- 스페이스 키 = "다음"(→ 와 같음). 프레젠터 리모컨 관례. 쉬는 시간 토글로 바꾸려면 keydown 한 줄.
- 건너뜀 = **다음** 문단(현재+1)을 건너뛴다: `skip {para}` 보내고 커서를 그 문단에 두어 취소선. 다시 "다음"을 누르면 그 다음 문단을 읽는다. 현재 문단을 건너뛰는 뜻이면 `doSkip()` 한 곳.
- 쉬는 시간 중에 다음/이전/건너뜀을 누르면 먼저 `break off` 를 보내고 넘긴다(청취자가 띠에 갇히지 않게).
- `/room` 에 `kind:"script"` 를 새로 두었다(index.js 한 줄). `desk` 로 들어가면 웹 강의가 Desk 분 사용량에 섞여서. 마스터가 `desk` 로 통일하라면 host 한 줄·index.js 한 줄.
- QR 은 qrcode-generator(MIT) 를 web/vendor 에 복사(pdf.js 와 같은 규칙). 다른 패키지로 정해지면 `renderQr()` 한 함수.
- 원고 줄 번역문 TTS: 청취자는 기존 line 과 같이 `trans[내 언어]` 를 읽는다(소리 켜짐일 때). 원고는 읽지 않게 하려면 handleMessage 의 script 분기 한 줄.
- 끝내기 단추는 L4-3 에서(호스트 탭을 닫으면 relay 가 10분 뒤 host_timeout 으로 닫는다 — 기존 규칙).
- 실기 없음(웹). 실 relay(wrangler)로는 안 돌렸다 — 위 5.
>>>>>>> origin/feat/l4-2
=======
2026-10-08 [열림] B 줄 5 — 이용권 코드 발급 도구 mint-code.mjs + /lic/<code> 페이지 (MASTER 01:12)
커밋: c5163e2 (가지 feat/mint-code — main 에 합치지 않았다)

만든·바꾼 파일
- relay/tools/mint-code.mjs (신규: Ed25519 발급·검사, node:crypto 만 — 의존성 0. --test 키 0 / --key n / --key-file / --verify / --pubkey / --keygen / --json)
- relay/test/mint-code.mjs (신규: node --test 8건. 정본 벡터 ① 글자까지 일치 · ② expired · ③ needs_update · ④ sig · 운영 키 저장소 밖 · 입력 풀기)
- lic/index.html (신규: /lic/<code> 한 장 — 앱에서 열기 intent://lic/<code>(scheme=raytok, package=com.raytok.ear, 없으면 /download/), 복사, 4자×32칸 손입력 안내, ko·en)
- 404.html (신규: GitHub Pages 에 /lic/<code> 파일이 없으므로 /lic/?c=<code> 로 보낸다. 그 밖 주소는 404 안내만)
- samples/lic_page_test.js (신규: 브라우저 17건)
- relay/README.md (§6 도구), relay/package.json (test:mint), package.json (test:mint·test:lic), .gitignore (relay/keys/)
- mint-license.mjs(HMAC 중계 토큰)는 손대지 않았다.

실행 출력 발췌
1. npm run test:mint (정본 raytok-native1/docs/samples/license-code.md 를 LICENSE_CODE_DOC 로 가리켜 넷 다 대조):
# tests 8 / # pass 8 / # fail 0
   — 정본 없이: # pass 7 / # skipped 1 (벡터 ① 내장본만)
   — 되돌려 실패 확인: payload 만료 BE→LE 로 바꾸면 # fail 2, 복구하면 # fail 0
2. node tools/mint-code.mjs --test --exp 2030-01-01 --flags host,private --cust RT0001
   → 00000000E3DXH003A9A3…801EGYGA (정본 ① 과 128자 전부 같다) · 0000-0000-E3DX-H003-… · https://raytok.kr/lic/<code>
   node tools/mint-code.mjs --verify <정본 ②> → ok=false why=expired keyId=0 exp=1767225600 flags=0x01 (host) cust=RT0002
3. npm run test:lic: === 17건 전원 통과 === (404→?c= 이동, 4×32 표시, intent/딥링크, 하이픈·소문자·I/L/O 교정, 깨진 링크 3종, en/ko 전환, 바깥 요청 0건)

한 줄 판정: 정본 벡터 넷을 글자까지 재현한다. 발급 도구·페이지 완료, 운영 키는 아직 없다(키 1 생성은 사람이 --keygen 으로, 비밀 저장소에만).

막힌 것 (50초 규칙 — 기본안으로 진행)
- QR(png) 출력은 안 넣었다. 의존성 없이 PNG QR 을 만들 수 없다 — 기본안: 코드·링크만 내고, QR 은 앱 QR 화면/별도 결정 뒤. (npm 에 qrcode 를 넣으면 한 줄이다 — 마스터 결정)
- 앱 딥링크 모양: 앱(app.config.js)은 scheme `raytok` 과 App Links `/join` 만 등록돼 있고 `/lic` 은 아직 없다 — 기본안: `raytok://lic/<code>`(안드로이드는 intent:// + package com.raytok.ear). A 가 앱에 `/lic` 받는 길을 넣을 때 이 모양으로 맞추면 된다. App Links(https://raytok.kr/lic) 도 추가하면 페이지를 거치지 않고 바로 열린다.
- `/lic/<code>` 는 GitHub Pages 에 파일이 없어 404.html 로 받는다 (상태 404 → 즉시 /lic/?c= 로 이동). 발급 도구가 내는 링크는 MASTER 그대로 `raytok.kr/lic/<code>` 다. 싫으면 `?c=` 형으로 바꾸면 된다.
- 운영 개인키 자리: env `LIC_PRIVATE_KEY_<n>` / `relay/.dev.vars` / `--key-file`(relay/keys/ gitignore). wrangler secret 으로 올릴 일은 릴레이가 코드를 검사하게 될 때 — 지금 릴레이는 검사하지 않는다(페이지도 서버 검증 없음).
- 시험 키 0 의 씨앗 hex 가 relay/test 에 적혀 있다 — 정본 §2 에 이미 공개된 시험 전용 값이다(가치 없음).
>>>>>>> origin/feat/mint-code

---

[B 보고]
2026-10-07 [열림] L2-fix · L4-1 · L3 1차 완료
커밋: 3f44b51

만든·바꾼 파일
- web/common/report.js (L2-fix: 내용 토큰 tr -> trans 변경)
- web/listener/index.html (L2-fix: 라디오 버튼 및 저장 파일명 trans 토큰 적용)
- web/host/index.html (신규: L4-1 들어가기·이용권 검증·원고 준비 및 L3 PDF·DOCX 읽기 연동)
- web/vendor/pdf.min.js (신규: L3 pdf.js 브라우저 로컬 라이브러리, CDN 0건)
- web/vendor/pdf.worker.min.js (신규: L3 pdf.js 워커 모듈)
- web/vendor/mammoth.browser.min.js (신규: L3 DOCX 브라우저 로컬 라이브러리, CDN 0건)
- samples/report_common_test.js (L2-fix: trans 토큰 검증 18건)
- samples/host_view_test.js (신규: L4-1/L3 웹 강사 화면 검증 13건)
- package.json
- docs/REPORT.md

실행 출력 발췌
1. L2-fix 및 청취 페이지 저장 단위 시험 (node samples/report_common_test.js, 18건 전원 통과):
=== L2 청취 페이지 공통 기록 저장 (web/common/report.js) 단위 시험 ===
  [PASS] trans DOC: raytok_YYYYMMDD_HHMM_trans_en.doc 일치 (tr은 터키어 코드와 겹치므로 trans 사용)
  [PASS] trans: 번역문 포함
  [PASS] trans: 번역이 있는 줄은 원문 제외
  [PASS] trans: 번역이 없는 줄은 원문 보존(누락 없음)
전부 통과 (18건)

2. L4-1 및 L3 웹 강사 화면 검증 시험 (node samples/host_view_test.js, 13건 전원 통과):
=== L4-1 웹 강사 화면 (web/host/index.html) 검증 시험 ===
  [PASS] 초기 화면: 이용권 인증 화면 표시
  [PASS] 초기 화면: 원고 준비 화면 숨김
  [PASS] 잘못된 토큰 입력 시 에러 메시지 표시
  [PASS] 올바른 토큰 인증 성공 ➔ 준비 화면 활성화
  [PASS] 준비 화면 진입 후 인증 화면 숨김
  [PASS] TXT 원고: 3개 문단 자동 분리 확인
  [PASS] 문단 합치기 후 2개 문단으로 축소 확인
  [PASS] 미리 번역 완료 후 준비 완료 영역 표시
  [PASS] IndexedDB: 2개 문단 저장 확인
  [PASS] IndexedDB: 사전 번역문 저장 확인
  [PASS] relay 외 외부 요청 0건 검증
  [PASS] .doc 업로드 시 .docx 안내 대화상자 노출 확인
  [PASS] web/vendor 내 pdf.js 및 mammoth 브라우저 정상 로드 확인
전부 통과 (13건)

3. 기존 청취 페이지 회귀 시험 (screen_view_test.js 9절 포함 전원 통과 & rtl_test.js 5건 통과):
  [PASS] 기록 저장: 파일명·BOM·줄 수·번역문·바깥 요청 0
  [PASS] 큰 화면 보기 시험 전부 통과
=== All 5 Real Lifecycle Tests Passed! ===

4. 되돌림 실패 검증 실증 2건:
- L4-1: 문단 분리 로직 제거 시:
  [FAIL] page.waitForFunction: Timeout 30000ms exceeded.
- L3: .doc 차단 안내 로직 제거 시:
  [FAIL] AssertionError [ERR_ASSERTION]: .doc 업로드 시 .docx 안내 대화상자 노출 확인

5. Desk 429 quota_exceeded 노출 확인:
Desk(main.js)는 /room 또는 /stt/token 에서 429 수신 시 서버 응답 메시지("Monthly hard cap exceeded ...")를 파싱하여 Error 객체로 throw하며, renderer는 이를 catch하여 alert("방 생성 실패: " + err.message) 대화상자 및 상태 배지에 그대로 노출합니다.

한 줄 판정
L2-fix(trans 토큰 통일), L4-1(들어가기·준비·IndexedDB·사전번역), L3(PDF·DOCX 로컬 읽기·web/vendor) 구현 및 외부 요청 0건 검증 완료.

막힌 것
없음.

---

[B 보고]
2026-10-07 [열림] L2. 청취 페이지 저장 = 내용 3 × 형식 3 1차 완료
커밋: 9230b33

만든·바꾼 파일
- web/common/report.js (신규: 청취 페이지 및 웹 강사 화면 공통 기록 저장 모듈)
- web/listener/index.html (내용 3종 × 형식 3종 작은 선택판 및 브라우저 다운로드 연동)
- samples/report_common_test.js (신규: L2 공통 기록 저장 단위 시험 18건)
- package.json (playwright 개발 의존성 추가)
- docs/REPORT.md

실행 출력 발췌
1. 공통 기록 저장 단위 시험 (node samples/report_common_test.js, 18건 전원 통과):
=== L2 청취 페이지 공통 기록 저장 (web/common/report.js) 단위 시험 ===
  [PASS] 기본 both TXT: 기존 정규식 raytok_YYYYMMDD_HHMM_en.txt 일치
  [PASS] src TXT: raytok_YYYYMMDD_HHMM_src_en.txt 일치
  [PASS] tr DOC: raytok_YYYYMMDD_HHMM_tr_en.doc 일치
  [PASS] both PDF: raytok_YYYYMMDD_HHMM_ja.pdf 일치
  [PASS] Lines 수 일치
  [PASS] both: 원문과 번역문 둘 다 포함
  [PASS] both: 번역 없는 줄도 원문 보존
  [PASS] src: 원문 포함
  [PASS] src: 번역문 제외
  [PASS] tr: 번역문 포함
  [PASS] tr: 번역이 있는 줄은 원문 제외
  [PASS] tr: 번역이 없는 줄은 원문 보존(누락 없음)
  [PASS] HTML 이스케이프: script 태그 실행 방지
  [PASS] HTML 이스케이프: 엔티티 변환 확인
  [PASS] 인쇄 스타일 @media print 포함
  [PASS] 페이지 넘김 줄바꿈 방지 스타일 포함
  [PASS] RTL 언어: html/태그에 dir="rtl" 속성 적용
  [PASS] 아랍어 번역문 포함
전부 통과 (18건)

2. 청취 페이지 화면 및 회귀 시험 9절 (node samples/screen_view_test.js):
  [PASS] 최근 4줄 · 두 칸 · 큰 글씨 · 머리줄/꼬리표 숨김 · 도구 막대 숨김→보임 · 음성 0 · 외부 요청 0
  [PASS] 세로 화면: 한 칸, 위아래
  [PASS] RTL: 번역 칸 dir=rtl, 칸 순서 뒤집힘
  [PASS] 보통 보기: 전 줄 · 15px · 머리줄 보임 · 확정 줄만 음성(pending 0)
  [PASS] 보통 보기 30줄: 최신 줄 보임 · 목록만 구름 · 도구 막대 제자리 (390×844, 360×640)
  [PASS] 큰 화면: 최신 확정 줄만 또렷
  [PASS] 낱말 안 끊김 · 긴 낱말 안 넘침 · 화자 꼬리표는 보낸 때만 (390, 360, 320)
  [PASS] 시연: 서버 연결 0 · 임시는 안 읽음 · 8줄 · 언어 5개 · 종료 화면 · 큰 화면 자동 시작
  [PASS] 기록 저장: 파일명·BOM·줄 수·번역문·바깥 요청 0
[PASS] 큰 화면 보기 시험 전부 통과

3. RTL 및 언어 변경 라이프사이클 시험 (node samples/rtl_test.js):
=== All 5 Real Lifecycle Tests Passed! ===

4. 되돌림 실패 검증 실증 1건:
web/common/report.js 에서 escapeHtml 미적용 시:
AssertionError [ERR_ASSERTION]: HTML 이스케이프: script 태그 실행 방지
    at ok (C:\GitHub\raytok-site\samples\report_common_test.js:14:3)
    at Object.<anonymous> (C:\GitHub\raytok-site\samples\report_common_test.js:64:3)

한 줄 판정
외부 요청 0건 및 라이브러리 0건으로 내용 3종(원문/번역문, 원문만, 번역문만) × 형식 3종(TXT, PDF, DOC) 작은 선택판 저장 및 web/common/report.js 모듈 분리 완료 (기존 회귀 시험 9절 전원 통과).

막힌 것
없음.

---

# REPORT.md — B → 마스터 보고 (원본은 이 파일)

새 보고는 맨 위에. 양식: GEMINI.md 4) 그대로 (만든·바꾼 파일 / 실행 출력 발췌 / 한 줄 판정 / 막힌 것).
공개 저장소 — 키·토큰·내부 규칙 금지.

---

[B 보고]
2026-10-06 [열림] 7. Desk 작업 (D1 → D2 → D3) 1차 완료 결과 (raytok-meet)

만든·바꾼 파일
- raytok-meet/.env.example
- raytok-meet/main.js
- raytok-meet/package.json
- raytok-meet/preload.js
- raytok-meet/renderer/index.html
- raytok-meet/test/_harness.js
- raytok-meet/report.js (신규)
- raytok-meet/test/report.test.js (신규)
- raytok-meet/docs/shots/ (스크린샷 6장 및 샘플 파일 신규)
- raytok-meet/docs/REPORT.md

실행 출력 발췌
1. [D1] 키가 있는 환경에서 확인
- 릴레이 로컬 wrangler dev (RELAY_URL=http://127.0.0.1:8787) 9종 시험 전원 통과 (no-store, smoke, silence, room-auth, engine-test, cache, license, usage-accounting, hard-cap)
- Desk npm run test:unit (13건) 및 npm test (10건) 전원 통과
- Desk 실제 음성 인식 및 Deepgram 실시간 WS 연결 확인 ([STT] Deepgram WS connected mic)

2. [D2] 대표님이 직접 켜서 볼 수 있는 상태 (1차 완료)
- 화면 옛 이름 변경: 창 제목, 헤더, 모달, 패키지 표시 이름 전부 "RayTok Desk" 반영
- 접속 주소 기본값: 운영 주소(릴레이: https://raytok-relay.raytok.workers.dev, 청취: https://raytok.kr/web/listener/)로 전환, 청취 URL에 ?relay= 자동 포함
- 대표님이 켜는 법 3줄:
  1) 터미널에서 raytok-meet 폴더로 이동 후 npm start 입력
  2) 첫 실행 시 'Desk 라이선스 등록'에 코드 입력 후 '방 만들기' 클릭
  3) 표시된 QR 코드를 스마트폰으로 찍어 청취 페이지를 띄우고 PC에서 '인식 시작' 클릭
- 화면 캡처 3장 (docs/shots/):
  * 20261006-desk-01-home.png (첫 화면)
  * 20261006-desk-02-meeting.png (회의 중 자막 목록)
  * 20261006-desk-03-phone-listener.png (폰 청취 화면)

3. [D3] 회의 종료 리포트 (1차 완료)
- 순수 함수 파일 report.js 구현 (toTxt, toHtml, toSrt, escapeHtml)
- 번역 없는 줄도 원문 그대로 보존 (줄 수 = 원문 줄 수 일치 보장)
- 세션 기록 메모리 보관 및 실시간 번역 매핑 연동
- 화면 UI "기록 저장" 단추 및 언어(실제 번역된 언어만) / 형식(TXT, PDF, SRT) 선택 모달 연동
- 단위 시험 (test/report.test.js 18건 추가, npm run test:unit 총 31건 전원 통과)
- 되돌림 검증(이스케이프 제거, 번역 누락 줄 제외 시 시험 실패) 실증 완료
- 산출물 캡처 3장 (docs/shots/):
  * 20261006-desk-04-report-save-modal.png (저장 모달 창)
  * 20261006-desk-05-report-txt.png (TXT 결과물 뷰)
  * 20261006-desk-06-report-pdf.png (PDF/HTML 결과물 뷰)

한 줄 판정
D1(시험 전원 통과), D2(Desk 이름·운영 주소·대표님 켜는 법·캡처 3장), D3(순수 함수 report.js·저장 UI·단위시험 31건·되돌림 검증·캡처 3장) 1차 완료 및 두 저장소 REPORT.md 작성 완료.

막힌 것
없음.

---

[B 보고]
2026-10-06 [열림] 6. 키가 있는 환경에서 릴레이·Desk 시험 결과 (배포 미실행)

만든·바꾼 파일
- docs/REPORT.md

실행 출력 발췌
1. 릴레이 로컬 wrangler dev (RELAY_URL=http://127.0.0.1:8787) 시험 9종 결과:
- no-store: 전부 통과 (47건)
- smoke: === Smoke Test Passed Successfully! ===
- silence: === All 10-Minute Silence Auto-Stop & Warning Tests Passed! ===
- room-auth: === All 10 Room Kind & STT Ephemeral Key Tests Passed! ===
- engine-test: [PASS] 보안 가드, 고침 1, 고침 2, 고침 3 전 항목 단언문 검증 통과!
- cache: === All 4/4 Cache Verification Tests Passed Successfully! ===
- license: === All 6/6 License Tests Passed Successfully! ===
- usage-accounting: === All Usage & Cost Monitoring Tests Passed! ===
- hard-cap: === All Hard Cap Guard Tests Passed! ===
(9개 시험 모두 실패 줄 0건)

2. Desk (C:\GitHub\raytok-meet) 시험 결과:
- npm run test:unit (13건):
전부 통과 (13건)
- npm test:
[RESULT] PASS: All 10 lines verified successfully!
[STEP 6/6] done
- 인식 연결 및 실시간 자막 수신 검증 (npm run test:mic 실키 연결):
[HOST] [STT] Obtained ephemeral Deepgram key (id=611e8240..., expires_in=3600s)
[HOST] [STT] Deepgram WS connected (mic)
[LINE #1] spk: me | (KO): "안녕하세요 마이크 테스트를 진행합니다."
[TR   #1] (EN): "Hello, I am conducting a microphone test."
[RESULT] PASS: All lines are "me", 0 speaker fixes, hold buffer verified!
[STEP 6/6] done

3. 추가 확인 사항:
- 청취 페이지 v1.1.1 복사본 위치: 릴레이·Desk 내에 복사해 쓰는 곳 없음 (0건).
- "저장하지 않습니다 / 학습에 쓰이지 않습니다" 문구 위치: Desk 화면이나 처리방침에는 해당 문구가 없으며, 현장교육/관광가이드 소개에 "음성은 저장하지 않습니다" 형태로만 존재합니다.
  * field/index.html (77줄)
  * tour/index.html (97줄)
  * tools/build_home.py (276줄, 390줄)
  * assets/i18n/en.json, ja.json, vi.json, zh.json (145줄, 218줄)

한 줄 판정
키가 있는 환경에서 릴레이 9종 시험 및 Desk 단위/E2E/실STT 연결 시험이 전원 통과했으며, Deepgram mip_opt_out=true 적용 상태에서도 [STT] Deepgram WS connected 연결 및 자막 출력이 정상 작동함을 확인했습니다. (wrangler deploy 배포 미실행)

막힌 것
없음.

---

[B 보고]
2026-10-06 Desk v1 [열림] 3. 사실 확인 결과

만든·바꾼 파일
- docs/REPORT.md

실행 출력 발췌
1) Desk(raytok-meet) Deepgram WebSocket 연결 URL 설정 확인 (C:\GitHub\raytok-meet\main.js):
  const language = lang || 'ko';
  const url = 'wss://api.deepgram.com/v1/listen?model=nova-3&language=' +
    encodeURIComponent(language) +
    '&encoding=linear16&sample_rate=16000&interim_results=true&smart_format=true';
  const ws = new WebSocket(url, {

2) 릴레이 Room DO 방 종료 처리 확인 (relay/src/room.js):
      if (isEnd) {
        await this.recordDeskSessionMinutes();
        this.ctx.waitUntil(
          new Promise((resolve) => {
            setTimeout(() => {
              for (const listenerWs of this.ctx.getWebSockets('listener')) {
                try {
                  listenerWs.close(1000, 'end');
                } catch (e) {}
              }
              resolve();
            }, 5000);
          })
        );
      }

사실 확인 상세 답변:
(가) Desk 가 Deepgram 에 보내는 요청에 학습 제외 옵션을 넘기는가
- 옵션 이름: mip_opt_out (Model Improvement Partnership Program opt-out)
- 지금 값: 넘기지 않음 (위 코드와 같이 옵션 미지정, 기본값 false 상태).
- 요금 차이: Deepgram의 일반 공개 요금은 데이터 학습 활용(MIPP 참여) 동의를 전제로 약 50% 할인이 기본 적용된 단가입니다. mip_opt_out=true 를 넘겨 학습에서 제외하면 50% 할인이 배제되어 표준 정가가 부과되므로 요금이 정확히 2배(100% 인상)가 됩니다. (Nova-3 스트리밍 기준 분당 약 $0.0048 -> 약 $0.0096)

(나) 릴레이(DO)가 회의 전문(원문·번역)을 얼마 동안 갖는가
- 보관 기간 및 방 종료 시 삭제 여부: 방 종료 때 지우지 않습니다. 호스트의 end 메시지 수신 시나 10분 무음/호스트 단절 타임아웃 종료 시에도 WebSocket close만 수행할 뿐, DO storage를 정리하는 코드(delete/deleteAll)가 전혀 없습니다. 따라서 Cloudflare Durable Object 영속 저장소에 영구히 남아 있습니다.
- Room DO storage에 남는 키 목록:
  1) ringBuffer: 회의 중 호스트가 발송한 최근 최대 500개 자막/메시지 전문(원문, 번역문, seq, 타임스탬프 등이 담긴 JSON 문자열 배열)
  2) code: 회의 방 6자리 코드
  3) hostToken: 호스트 인증 토큰
  4) startedAt: 방 생성 ISO 타임스탬프
  5) initialized: 초기화 여부 플래그
  6) lastLineAt: 마지막 자막 시각(ms epoch)
  7) kind: 방 종류 ('desk' 또는 'guide')
  8) sub: 주최자 식별자
  9) silenceWarnMs: 무음 경고 기준 시간(ms)
  10) silenceTimeoutMs: 무음 자동 종료 기준 시간(ms)
  (참고: 전역 집계용 GLOBAL_RATE_LIMITER DO storage에는 usage:YYYY-MM:sub 키로 월별 통계 수치만 저장되며 전문은 없음)

(다) 번역 호출(구글)에 원문이 남는 설정이 있는가
- 구글 번역 API (Google Cloud Translation API v2 Basic): 구글 공식 데이터 처리 약관 및 FAQ에 따르면, API 요청으로 전달된 데이터는 번역 처리 중 메모리에서 일시적으로만 다뤄지고 구글 서버에 영구 저장되지 않으며(No Permanent Storage), 모델 학습에도 일절 쓰이지 않습니다(No Training). 원문이 구글 측에 남도록 하는 별도 설정은 없습니다.
- 릴레이 내부 캐시/로그: Cloudflare Cache API(caches.default)에 번역 결과가 30일간 캐싱되나, 캐시 키는 원문 자체가 아닌 SHA-256 해시값(URL)을 사용하고, 캐시 본문에는 번역문과 언어 코드만 저장되며({ t: transText, src: itemSrc }) 원문 전문은 저장되지 않습니다. 사용량 집계에도 글자 수와 호출 횟수 수치만 남습니다.

한 줄 판정
Deepgram(학습 제외 미지정으로 학습 대상 상태)과 릴레이(방 종료 후에도 ringBuffer에 전문 500건 영구 보관)로 인해 현재 상태에서는 "저장하지 않습니다 / 학습에 쓰이지 않습니다"를 적을 수 없으며, 문구 확정 전 코드 조치(Deepgram mip_opt_out 옵션 적용 여부 결정 및 릴레이 방 종료 시 storage.deleteAll() 처리)가 선행되어야 합니다.

막힌 것
없음.
