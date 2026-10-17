# PG 실결제 전환 — 한 장 (포트원 · KCP 채널)

대표님이 **포트원 콘솔에서 두 값**(Store ID · Channel Key)과 **비밀값 둘**(API Secret · Webhook Secret)을
받으시면, 이 문서 하나로 전환이 끝난다. 값은 **어디에도 적지 않는다** — 이 저장소는 공개다.

| | 어디에 | 누가 |
|---|---|---|
| 공개 식별자 둘 (`storeId`·`channelKey`) | **`buy/pg.js` 한 파일** — 저장소에 커밋한다 | 세션 또는 대표님 |
| 비밀값 셋 (`PORTONE_API_SECRET`·`PORTONE_WEBHOOK_SECRET`·`MINT_PRIVATE_KEY`) | **Cloudflare Worker secret 에만** | 대표님 PC |
| 배포 (`wrangler deploy`) | 릴레이 | **대표님** (세션은 배포하지 않는다) |

**⚠ 지금 비밀값 둘(`PORTONE_API_SECRET`·`PORTONE_WEBHOOK_SECRET`)에는 포트원 발급값이 아닌 값이 들어 있다**
(마스터 2026-10-17 09:05). 아래 2단계에서 **덮어쓴다.** 덮어쓰기 전에 프론트를 운영 키로 바꾸면
손님이 돈을 내고 코드를 못 받는다(아래 "왜 백엔드가 먼저인가").

---

## 1. 바꿀 자리 — 코드가 사실이다

### A. 프론트엔드 `buy/pg.js` (공개 식별자, 브라우저가 그대로 들고 쓴다)

칸 이름은 **`storeId`·`channelKey`·`provider`** 다(소문자 카멜. 옛 문서·MASTER 의 `STORE_ID`·`CHANNEL_KEY`
는 `buy/index.html` 에 박혀 있던 시절 이름이고, 지금 코드에 그런 이름은 없다).

| 칸 | 운영값 형식 | 포트원 콘솔 위치 |
|---|---|---|
| `storeId` | `store-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | 상점 정보 |
| `channelKey` | `channel-key-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | 결제 연동 → **KCP 채널** |
| `provider` | `'kcp'` | — (바꿀 때 눈으로 한 번 더 보는 칸) |

- `isTest` 는 **값에서 저절로** 갈린다(`storeId`·`channelKey` 에 `test` 글자가 있으면 테스트).
  사람이 켜고 끄는 깃발은 두지 않는다 — 깃발과 값이 어긋나면 테스트 채널로 실결제를 받는다.
- `buy/index.html` 은 `window.rtPG` 를 **읽기만** 한다. 값이 비거나 `<…>` 꼴이면 결제창을 열지 않고
  사람에게 알린다(§20). 같은 값을 읽는 곳은 이 한 자리뿐이다(§4).

### B. 릴레이 비밀값 — Worker secret 에만, 저장소엔 들어오지 않는다

| 이름 | 무엇에 쓰나 | 없으면 |
|---|---|---|
| `PORTONE_API_SECRET` | `/pay/complete` 가 포트원에 "이 결제가 진짜 됐나" 묻는다 (`GET /payments/{id}`) | `/pay/complete` → **503 `pg_secret_missing`** (아예 서지 않는다) |
| `PORTONE_WEBHOOK_SECRET` | `/pay/webhook` 서명 검증 (`x-portone-signature`, HMAC-SHA256) | `/pay/webhook` → **503 `pg_secret_missing`** |
| `MINT_PRIVATE_KEY` | 운영 쿠폰 Ed25519 서명 개인키(시드 32바이트 hex) | **시험 키(0)로 찍힌다** — 정식 앱이 거부한다 (`testKey = !env.MINT_PRIVATE_KEY`) |

- 구매 화면(`raytok.kr/buy/`)은 발급 요청을 **릴레이 주소로** 던진다
  (`https://raytok-relay.raytok.workers.dev/pay/complete`). `raytok.kr` 은 GitHub Pages 라 그 길이 없다 —
  2026-10-17 까지 같은 출처로 던지고 있었고(운영에서 404), 그 자리를 B 13 에서 고쳤다.
  다른 릴레이로 붙여 보려면 `?relay=` 를 붙인다(`/buy/?relay=http://127.0.0.1:8787`).
- `PORTONE_API_BASE` 는 **운영에 두지 않는다.** 있으면 결제 조회가 그 주소로 간다(시험용 mock 자리).
- 발급은 **`/pay/complete` 한 곳**이다. `/pay/webhook` 은 서명만 보고 `{ok:true}` 를 돌려주며
  아무것도 찍지 않는다(두 곳에서 찍으면 두 번 찍힌다 — MASTER 10-13 12:35 ③).

---

## 2. 전환 순서

### ① 포트원 콘솔 확인 (대표님)
- admin.portone.io → **실연동(Live)** 모드 활성 확인.
- 결제 연동 → **KCP 일반결제 채널**이 '연동 완료(정상)' 인지 확인.
- 복사해 둘 것: Store ID · Channel Key(공개) · API Secret · Webhook Secret(비밀).
- 포트원 콘솔 → 웹훅 주소에 **`https://raytok-relay.raytok.workers.dev/pay/webhook`** 등록.

### ② 비밀값 덮어쓰기 + 배포 (대표님 PC)
```bash
cd relay
npx wrangler secret put PORTONE_API_SECRET       # 포트원 발급 API Secret (지금 값은 틀렸다 — 덮어쓴다)
npx wrangler secret put PORTONE_WEBHOOK_SECRET   # 포트원 발급 Webhook Secret (같음)
npx wrangler secret put MINT_PRIVATE_KEY         # 운영 쿠폰 서명 시드 (10-13 12:35 에 지운 그것)
npx wrangler deploy
```
`wrangler secret put` 은 프롬프트로 값을 받는다 — **명령줄에 값을 붙이지 않는다**(셸 기록에 남는다).

### ③ 프론트엔드 두 줄 (`buy/pg.js`)
```javascript
storeId:    '<포트원 Store ID>',
channelKey: '<KCP Channel Key>',
```
`test` 글자가 사라지면 `isTest` 가 저절로 `false` 가 된다. **그 외에 손댈 곳은 없다.**

### ④ 밀기
```bash
git add buy/pg.js
git commit -m "feat(pay): 포트원 KCP 운영 결제 키 적용"
git push origin main
```
GitHub Pages 라 **밀면 바로 산다.** 되돌릴 때도 같다(3장).

### 왜 백엔드가 먼저인가
프론트가 운영 키면 손님 카드에서 **진짜 돈이 빠진다.** 그때 릴레이에 `PORTONE_API_SECRET` 이 없으면
`/pay/complete` 가 503 으로 서지 않아 **돈은 나가고 코드는 안 나온다.** 거꾸로(백엔드만 운영,
프론트는 테스트)는 실돈 0 이라 안전하다. 그래서 순서는 ② → ③ 이고, 바꿀 수 없다.

---

## 3. 되돌리는 법 — 프론트부터

1. **프론트 (1분, 실돈 즉시 0)** — `buy/pg.js` 두 줄을 테스트 값으로:
   ```javascript
   storeId:    'store-raytok-test',
   channelKey: 'channel-key-test',
   ```
   밀면 바로 산다. 결제창은 포트원 **테스트 채널**로 뜬다(실돈 0).
   화면 자체를 막아야 하면 `buy/index.html` 의 `btnPay.disabled = true` 를 손으로 넣는다 —
   「준비 중」 배너·단추 비활성 분기는 **없다**(MASTER 10-14 13:20 에 없앴다: PG 심사 "판매 상품 없음" 회신).
2. **백엔드** — 비밀값은 **되돌리지 않아도 된다.** 프론트가 테스트면 실결제가 없다.
   꼭 막아야 하면 `npx wrangler secret delete PORTONE_API_SECRET` → `/pay/complete` 가 503 으로 선다.
   **프론트가 운영인 상태에서 이것을 먼저 하면 돈만 빠진다.** 1 을 먼저 한다.

---

## 4. 전환 직후 확인 셋

1. **실카드 1회 결제 + 당일 환불**
   `https://raytok.kr/buy/` 에서 손님 1일권(3,300원)을 실제 카드로. 포트원·KCP 관리자에서
   승인·거래번호 확인 → 당일 취소(환불).
2. **코드·입장 링크가 화면에 뜬다**
   결제 직후 16자리 코드(`0000-0000-0000-0000`)와 입장 링크(`https://raytok.kr/web/listener/?room=…`).
   코드가 **0x02(손님권)** 플래그와 만료(24시간)를 들고 있는지 확인. `MINT_PRIVATE_KEY` 를 안 넣었으면
   여기서 시험 키 코드가 나오고 정식 앱이 거부한다 — ② 를 다시 본다.
3. **웹훅 200 + 멱등성**
   `npx wrangler tail` 에서 `POST /pay/webhook` → 200. 503 `pg_secret_missing` 이면 비밀값이
   안 들어갔다, 401 `invalid_signature` 면 콘솔의 Webhook Secret 과 다른 값이 들어갔다.
   같은 `paymentId` 로 `/pay/complete` 를 다시 불러도 **같은 코드**가 돌아오는지(두 번 찍히지 않는지).

---

## 5. 사실 (바뀌면 이 줄을 고친다)

- `storeId`·`channelKey` 는 비밀값이 **아니다** — 브라우저가 그대로 들고 쓴다. 커밋해도 된다.
- 비밀값 셋은 이 저장소에 **한 번도 들어온 적이 없다.** 2026-10-17 까지 `/pay/webhook` 이
  비밀값 없을 때 코드에 박힌 글자로 떨어졌고(공개 저장소에 그 글자가 있었다), 지금은 503 으로 선다.
- 구매 화면의 발급 요청은 2026-10-17 까지 **같은 출처**(`raytok.kr/pay/complete`)로 가고 있었다 —
  운영에서는 404 다(돈이 빠진 뒤 "결제 처리 중 오류"). 시험의 모의 릴레이가 구매 화면도 같이
  서빙해서 통과하고 있었다(D-11). 지금은 릴레이 주소로 가고 `samples/pay_test.js` 가 운영 호스트
  이름을 넣어서 센다.
- 릴레이 운영 배포 시각: 2026-10-16 11:53 KST (deployment 0d2b7fbc). 그 뒤 코드 변경은
  배포되지 않은 상태 — 전환 때 ② 의 `wrangler deploy` 가 같이 올린다.
