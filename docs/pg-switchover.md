# RayTok PG(토스페이먼츠/포트원) 운영 실결제 전환 가이드

본 문서는 토스페이먼츠 가맹점 심사 승인(MID 발급) 후, 테스트 모드에서 실제 운영 결제 모드로 안전하게 전환하기 위한 절차서입니다.
**보안 원칙:** 실제 결제 비밀키 및 API 시크릿 값은 Git 저장소에 절대 커밋하지 않으며, Cloudflare Worker Secret 또는 런타임 환경변수로만 주입합니다.

---

## 1. 키·MID 설정 파일 및 변수 목록 (값은 비움)

### A. 프론트엔드 구매 화면 (`web/buy/index.html`)
포트원 V2 브라우저 SDK에 전달하는 공개 식별자입니다.
- **파일 경로:** `web/buy/index.html`
- **변수 이름:**
  - `STORE_ID`: 포트원 콘솔 발급 Store ID (실운영 상점 아이디, 형식: `store-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
  - `CHANNEL_KEY`: 토스페이먼츠 연동 채널 키 (형식: `channel-key-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

### B. 백엔드 릴레이 Worker (`relay/`)
결제 검증 및 웹훅 무결성 검증에 사용되는 비밀값입니다.
- **저장 위치:** Cloudflare Workers Secret (`npx wrangler secret put`)
- **환경 변수 이름:**
  - `PORTONE_API_SECRET`: 포트원 V2 REST API 시크릿 (결제 단건 조회/사후 대조용)
  - `PORTONE_WEBHOOK_SECRET`: 포트원 웹훅 서명 검증 시크릿 (HMAC-SHA256 헤더 `x-portone-signature` 대조용)
  - `MINT_PRIVATE_KEY`: 운영 쿠폰(0x02 손님권) Ed25519 서명 개인키 (시드 32바이트 hex)

---

## 2. 테스트 → 실결제 전환 순서

1. **포트원 콘솔 및 토스페이먼츠 심사 확인**
   - 포트원 콘솔(admin.portone.io) 로그인 후 '실연동(Live)' 모드 활성화 확인.
   - 토스페이먼츠 일반결제 채널 상태가 '연동 완료(정상)'인지 확인.
2. **백엔드(Cloudflare Worker) 비밀값 등록**
   - 로컬 터미널에서 `relay/` 디렉터리로 이동:
     ```bash
     cd relay
     npx wrangler secret put PORTONE_API_SECRET
     # 프롬프트에 실운영 API 시크릿 입력
     npx wrangler secret put PORTONE_WEBHOOK_SECRET
     # 프롬프트에 실운영 웹훅 시크릿 입력
     ```
   - 대표님이 직접 운영 배포 실행:
     ```bash
     npx wrangler deploy
     ```
3. **프론트엔드(`web/buy/index.html`) 실운영 키 교체**
   - `web/buy/index.html` 내 변수 갱신:
     ```javascript
     const STORE_ID = '<실운영 포트원 Store ID>';
     const CHANNEL_KEY = '<실운영 토스페이먼츠 Channel Key>';
     ```
   - `STORE_ID`와 `CHANNEL_KEY`에서 `'test'` 문자열이 제거되면, `isTestStore`가 자동으로 `false`로 전환되며 「테스트 모드 P1」 및 「준비 중」 배너가 사라지고 실제 포트원 SDK 결제창이 활성화됩니다.
4. **저장소 커밋 및 GitHub Pages 배포**
   - `git add web/buy/index.html`
   - `git commit -m "feat(pay): 포트원 토스페이먼츠 실운영 결제 연동 키 적용"`
   - `git push origin main`

---

## 3. 긴급 롤백(되돌리는 법)

운영 결제 중 장애, 키 오류, 또는 오작동 발생 시 즉시 테스트 모드로 되돌리는 절차입니다.

1. **프론트엔드 즉시 차단 (1분 롤백)**
   - `web/buy/index.html`에서 `STORE_ID` 또는 `CHANNEL_KEY` 값에 `'test'` 문자열을 다시 복원:
     ```javascript
     const STORE_ID = 'store-raytok-test';
     const CHANNEL_KEY = 'channel-key-test';
     ```
   - 커밋 후 푸시하면 화면에 즉시 「준비 중입니다. 결제는 아직 받지 않습니다」 배너가 노출되고 결제 버튼이 비활성화(`disabled = true`)되어 추가 결제 진입이 원천 차단됩니다.
2. **백엔드 웹훅 비밀값 롤백**
   - `cd relay && npx wrangler secret put PORTONE_WEBHOOK_SECRET` 실행 후 테스트용 키로 복원 또는 비상 조치.

---

## 4. 실결제 전환 직후 반드시 확인할 3가지 (체크리스트)

1. **실제 카드 100원/1회 결제 및 정상 환불 확인**
   - 운영 화면(`https://raytok.kr/web/buy/`)에 접속하여 손님 1일권(3,300원)을 실제 카드로 결제.
   - 포트원 및 토스페이먼츠 상점 관리자에서 정상 승인 및 거래번호 생성 확인 후 당일 즉시 취소(환불) 처리.
2. **0x02 손님 쿠폰 코드 정상 발급 및 딥링크 유효성 확인**
   - 결제 완료 즉시 화면에 `0000-0000-0000-0000` 형태의 16자리 쿠폰 코드와 바로가기 입장 링크(`https://raytok.kr/web/listener/?room=...`)가 정상 렌더링되는지 확인.
   - 발급된 코드가 0x02(손님용 플래그) 및 만료시간(24시간)을 정상 보유하는지 검증.
3. **웹훅 서명(`x-portone-signature`) 통과 및 중복 발급 차단(멱등성) 확인**
   - 릴레이 로그(`wrangler tail`)에서 `POST /pay/webhook` 요청이 200 OK로 반환되는지 확인.
   - 동일한 `paymentId`로 재요청이 인입되더라도 기존 발급된 코드와 100% 동일한 코드가 반환되는지 확인.
