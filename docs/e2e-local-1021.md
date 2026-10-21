# 진짜 릴레이로 끝까지 — 로컬 (2026-10-21) · 결정장부 46

가짜 방이 아니라 **릴레이 코드 자체**(`wrangler dev --local`)와 **진짜 화면**으로 돌린 표다.
지금까지의 시험은 목(mock)이었고, 목은 운영과 다를 수 있다(D-11 — 그래서 10-20 에 사전 번역이
운영에서 한 번도 동작하지 않던 것을 못 봤다).

## 결과 — 손님 셋이 각자 언어로 받았다

| 단계 | en | zh-CN | **ne** |
|---|---|---|---|
| 원고 문단 1 (「다음」) | `[en] 안전 교육을…` | `[zh-CN] 안전 교육을…` | `[ne] 안전 교육을…` |
| 소리 (문단 2) | `[en] 안전모를…` (en-US) | `[zh-CN] …` (zh-CN) | `[ne] …` (ne) |
| 🎤 줄 (원고 밖 말) | `[en] 오늘 점심은…` | `[zh-CN] …` | `[ne] …` |

★ **`ne` 가 핵이다.** 강사 화면이 고른 언어는 `en, ja, vi` 였고 **ne 는 사전 번역하지 않았다.**
그런데 ne 손님이 자막·소리를 자기 말로 받았다 — **방이 번역해 보낸 것**이다(B 3·B 4).

## 릴레이 기록이 설계 그대로다

```
script_src paras=3 total=3            # 강사는 원고 **원문만** 올렸다 (장부 43)
room_tr lang=en   n=3 chars=45 to=0   # 손님이 들어오자 그 언어로 3문단을 한 번에 사고 **쥐고 있다**
room_tr_late lang=en paras=3 ms=77    # (zh-CN·ne 도 같은 꼴)
room_tr_pre para=2                    # 「다음」 때 다음 문단을 미리
room_tr lang=en n=1 cached=1 to=1     # 넘길 때는 **쥔 것을 보낸다** — 다시 사지 않는다(지연 0)
room_tr lang=en n=1 chars=16 to=1     # 🎤 줄은 그 자리에서
```

## 돈 — 언어마다 한 번, 손님 없는 언어는 **0원**

상류를 부른 횟수: `en 4 · zh-CN 3 · ne 2 · ja 1 · vi 1`
- `ja`·`vi` 는 **강사 검수(사전 번역)로 한 번씩만** — 그 언어 손님이 없으니 **방은 한 푼도 쓰지 않았다.**
- `ne` 는 강사가 고르지 않았는데 손님이 와서 **방이 두 번**(들어올 때 3문단 묶어서 + 🎤 줄 한 번).

## 다시 돌리는 법 (이 컨테이너에서 된다)

```bash
cd relay && npm i --no-save wrangler@3          # 저장소에 넣지 않는다(--no-save)
node /…/mock-tr.cjs &                          # 가짜 구글 상류(8899) — 아래 모양을 돌려준다
cat > relay/.dev.vars <<'V'                    # .gitignore 에 있다 — 커밋되지 않는다
LICENSE_SECRET=<아무 64자>
LICENSE_SALT=<아무 글자>
GOOGLE_TRANSLATE_KEY=<아무 글자>
GOOGLE_TRANSLATE_URL=http://127.0.0.1:8899/language/translate/v2
RELAY_BASE_URL=http://127.0.0.1:8787
ROOM_TR=1
V
cd relay && npx wrangler dev --local --port 8787 &
python3 -m http.server 8080 &
RELAY_URL=http://127.0.0.1:8787 node scripts/host-token.mjs   # 토큰 → $E2E_DIR/tok.txt
E2E_DIR=$E2E_DIR node scripts/e2e-local-relay.cjs
```
가짜 상류는 구글 모양을 지켜야 한다 — `{"data":{"translations":[{"translatedText":"…"}]}}`.
느슨하게 만들면 **운영과 다른 것을 통과시킨다**(D-11).

## 여기서도 못 잰 것 (실기로만 안다)

- **웹킷(사파리) 엔진** — 이 기계에 없다. 손님 폰 브라우저 번역(B 2)은 크로미움으로만 쟀다.
- **운영 릴레이에서의 자기 호출** — 방이 `RELAY_BASE_URL` 로 **같은 워커**의 `/translate` 를
  부른다. 로컬(`127.0.0.1:8787`)에서는 됐다. 운영 주소로도 되는지는 배포 뒤
  `wrangler tail` 의 `room_tr lang= n= chars=` 로 보신다. 안 보이면 `room_tr_fail … why=`.
