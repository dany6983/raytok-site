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
