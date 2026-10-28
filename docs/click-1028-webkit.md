# 마스터 누르기 — **웹킷으로도 같은 표** (NOW 10-23 09:05)

2026-10-28 23:20 · 진짜 로컬 릴레이(`wrangler dev --local`) · 폰 390px · `scripts/master-click.cjs` **안 고침**
기록: `docs/reclog/2026-10-28-web/master-click-webkit-2320.txt` · `…-chromium-2320.txt`

> 10-28 21:40·21:55 보고의 「웹킷 못 돌림(내려받기 403)」은 **이제 아니다** — 이 상자에서
> `npx playwright install webkit` 이 받아졌다. 그래서 10-23 09:05 의 「다음: 웹킷으로도 같은 표」를 여기 적는다.

| 엔진 | 통과 | 붉음 | 해당 없음 |
|---|---|---|---|
| chromium | 37 / 38 | 1 | 1 |
| webkit | 34 / 38 | 4 | 1 |

## 다른 세 줄은 전부 **🎤** 다 — 엔진이 없어서다 (짐작 아님, 재 봤다)

```
webkit    SpeechRecognition=undefined / webkitSpeechRecognition=undefined · speechSynthesis=undefined
chromium  SpeechRecognition=function  / webkitSpeechRecognition=function  · speechSynthesis=object
```

| 줄 | chromium | webkit | 까닭 |
|---|---|---|---|
| A 강사 진행 · 🎤 가 스스로 켜졌다(원고 0) | PASS | FAIL | 받아쓰기가 없어 켤 수가 없다 |
| A 강사 진행 · 🎤 | PASS | FAIL | `hasRec` 가 거짓이라 단추를 **안 그린다**(맞는 동작) |
| B 강사 진행 · 🎤 | PASS | FAIL | 같음 |

**마스터께**: 이 셋은 웹킷에서 「해당 없음(N/A)」이 맞다고 본다 — 「크롬으로 열기」를 N/A 로 둔 것과 같은 까닭이다
(고칠 것이 없는 줄이 영원히 붉으면 통과 수가 뜻을 잃는다). `master-click.cjs` 는 마스터 파일이라 **B 가 고치지 않았다**.
덧붙여 playwright 웹킷에는 `speechSynthesis` 도 없어 손님 화면이 「읽기」에서 오류 셋을 낸다 — 진짜 사파리와 다른 자리다.
아이폰 사파리의 🎤·읽기는 여전히 **대표님 실기**로만 가릴 수 있다(앱 92·Desk 와 한 번에).

## 두 엔진이 **같이** 붉은 줄 하나 — 상자의 브라우저 말 때문이다

| 줄 | chromium | webkit |
|---|---|---|
| B 손님 · 「서버 번역」 | FAIL(안 보인다) | FAIL(안 보인다) |

`index.src.html` 의 `browserCanTranslate()` 는 **손님이 고른 말이 `navigator.languages` 안에 있을 때만** 참이다.
이 상자는 `navigator.languages = ko-KR` 뿐이라 영어를 고른 손님에게는 거짓이고, 그러면 안내 띠도 「서버 번역」 단추도
**안 뜨는 것이 맞다**(2026-10-22 B 0 주석: 거짓인 띠를 띄우지 않는다). 영어 상자에서는 그래서 PASS 로 나온다 —
10-28 21:55 의 38/38 과 오늘 37/38 의 차이가 이것이다. **제품 결함이 아니라 시험이 상자마다 다른 답을 내는 자리다.**

**마스터께**: 손님 창을 `locale: 'en-US'` 로 열어 못 박거나, 브라우저 말에 손님 말이 없으면 N/A 로 세는 쪽을 제안한다.
역시 `master-click.cjs` 라 B 가 고치지 않았다.

## 웹킷에서 **된** 것 (34건)

강사: 준비 화면(원고 없이/원고 3문단 둘 다 「강의 시작」 보임) · 가로 넘침 0(390·1366) · 고르개 82개 · ▶/■ · 다음 · 이전 · 건너뜀 · 휴식 · 끝내기
손님: 들어가기 · 원문 보기 · 소리 켬/끔 · 목소리 고르기/닫기 · 화면 꺼도 듣기 · 글자 크게/작게/보통(자막 17→23→15→17px) · ✋ 질문/취소 · 큰 화면 · 저장/닫기

즉 **🎤 와 브라우저 번역 말고는 웹킷에서 크로미움과 같다.**
