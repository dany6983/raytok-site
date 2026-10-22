# 프로 번역 — 운영 확인 한 장 (2026-10-22 · 마스터 13:00)

대표님 PC 에서 **두 줄**이다. 배포는 대표님 손이고(멈춤 조건 ③), 확인은 그 다음 한 줄이다.

```powershell
cd C:\github\raytok-site
git pull

cd C:\github\raytok-site\relay
npx wrangler deploy

cd C:\github\raytok-site
node scripts\prod-license-e2e.mjs
```

> `&&` 는 쓰지 않는다 — 대표님 PowerShell 이 그 토큰을 거부한다(10-21 확인).
> `RELAY_URL` 을 안 주면 로컬을 본다. 운영을 보려면:
> `$env:RELAY_URL="https://raytok-relay.raytok.workers.dev"` 를 먼저 한 줄.

## 이 배포로 사는 것 넷

| | 무엇 | 안 하면 |
|---|---|---|
| 질문 번역 | 손님 질문이 **모든 손님에게 각자 자기 말로** | 질문 원문만 가고 손님 화면에 「번역 중…」으로 남는다 |
| **이름 없는 손님** | ✋ 들고 **말을 할 수 있다** | 이름 칸은 「선택 사항」인데, 안 적은 손님은 지명돼도 **받아쓰기가 안 열린다** |
| 프로 등급 | 0x20 을 산 이용권이 웹 강연에서 **프로 번역**을 받는다 | 늘 basic — 돈을 받고 안 주는 자리 |
| 프로만 든 방 | 번역이 **돈다** | `roomTrOn()` 이 0x20 을 안 세어 손님이 원문만 본다 |

정적 쪽(강사·손님 화면)은 **밀면 바로 산다** — 배포할 것이 없다.

## 확인은 마지막 줄 **⑨번**을 본다

`node scripts\prod-license-e2e.mjs` 가 9줄을 찍는다. 프로는 **⑨번 한 줄**로 갈린다:

| ⑨번이 이렇게 나오면 | 뜻 | 할 일 |
|---|---|---|
| `200 tier=pro` | **프로가 살아 있다** (키·공급자 다 있다) | 없다 |
| `200 tier=basic why=pro_no_key` | 배포는 됐고 **키만 없다** | `npx wrangler secret put LLM_API_KEY` → 재배포 |
| `200 tier=basic why=pro_no_provider` | `LLM_PROVIDER` 이름이 표에 없다 | `wrangler.toml [vars]` 의 그 이름을 `gemini`·`openai` 중 하나로 |
| `403` · `404` | **아직 배포가 안 됐다** | 위 `npx wrangler deploy` 를 다시 |

⑨번은 **프로 이용권(0x20)을 새로 발급해** 문을 열어 보는 줄이다. ⑥⑦ 은 문이 **닫히는지**만
보므로(패키지 없는 토큰 → 403) 그것만으로는 "프로가 도는가"를 알 수 없었다 — 10-22 에 보탰다.

- **비밀값이 필요 없다.** 시험 키 0 의 씨앗은 공개값이고 토큰은 서버가 만들어 준다.
- **돈이 거의 안 든다.** ⑨번이 보내는 것은 글자 일곱(「안전모를 쓰세요」) 한 줄이다.
  프로가 살아 있어도 비용은 사실상 0 이다.
- 코드·토큰은 화면에 **앞 6글자만** 찍는다. 저장소에 남지 않는다.

## 강연 중에 가리는 법 (기록)

`wrangler tail` 에 방마다 한 줄씩 나온다 — 등급이 그 줄에 있다:

```
[8RQTDQ] room_tr lang=en n=1 chars=10 to=1 tier=pro               ← 프로로 나갔다
[8RQTDQ] room_tr lang=en n=1 chars=10 to=1 tier=pro→basic why=pro_no_key   ← 내려앉았다
[8RQTDQ] room_tr lang=en n=1 chars=8  to=1 tier=basic             ← 기본 패키지 방
```

## 돈이 걱정될 때 — 끄는 법 둘

| 무엇 | 어떻게 | 효과 |
|---|---|---|
| 프로만 끈다 | `relay/wrangler.toml` `[vars]` 에 `PRO_TR = "0"` → 재배포 | 방이 basic 만 청한다. 번역은 그대로 된다 |
| 급하면 키를 뺀다 | `npx wrangler secret delete LLM_API_KEY` | **배포 없이 그 자리에서** basic 으로 내려앉는다 |

상한은 이미 있다: `LLM_DAILY_CAP_USD`(기본 5) · `LLM_TIMEOUT_MS`(2000, 느리면 basic) ·
원문에 없는 숫자가 생기면 **버린다**(`pro_numbers`). 10-14 에 한 달 476,423원이 나온 뒤
만든 장치들이다.
