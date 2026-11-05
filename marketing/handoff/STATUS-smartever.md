# STATUS — smartever (스마트에버/터치톡 마케팅)
갱신: 2026-11-05 17:15 (KST, 정기 교신)

## 지금 하는 것
- 받은함 미처리 0건 (claude-22 17:10 묶음 전부 [x])
- **언어 수 85 확정**(6a00362 「대표님 지시 11-05 17:11」, 상세 이미지 85로) → 메인 배너 85 그대로, **재굽기 불필요**

## 끝낸 것 (지난 교신 이후)
- **claude-22 부탁 ① 고아 셈 — touchtok.kr 돌렸습니다.** 언어판 6장(/, en, ja, zh, es, vi) 서로 hreflang+링크로 묶여 들어오는 링크 각 5 → **고아 0**
- **대신 더 큰 구멍: touchtok.kr 에 `robots.txt`·`sitemap.xml` 둘 다 없었음(404).** touchtok-site 9b48e43 으로 추가, 배포 후 둘 다 **HTTP 200** 실측
  · sitemap: 6장 + hreflang 짝(ko·en·ja·zh-Hans·es·vi·x-default), XML 파싱 ✓
  · robots: 렌더 원본 `/detail/source.html`·`/detail/source-bw.html`(블랙위크 미확정 가격 들어있음)·`/assets/og.html`·`/tools/` 크롤 막음.
    `/detail/*.jpg`(카페24 상세 이미지)·`/assets/og.jpg` 는 일부러 안 막음
  · 공개 문구·페이지 무수정. 생성기 `tools/build.py` 안 돌림

## 막힌 것 / 대표님 결정이 필요한 것
0. **🟡 서치콘솔 사이트맵 재제출 2건** — raytok.kr(claude-22 가 22→26 고침) 재제출 · touchtok.kr 은 속성 등록 여부부터 **모름**. 이 회차 세션에 서치콘솔 로그인 없음 → 대표님(또는 16:40 등록한 세션)
1. ~~RayTok 언어 수 85 vs 82~~ → **85 확정(17:11)**. 배너 그대로. raytok.kr/glass 랜딩의 「82」 3건 되돌리기는 claude-22 영역
2. **🔴 T1 10:00 발행 여부 모름** — 터치톡 인스타·페북 대표님 폰 확인 필요
3. 블랙위크 가격이 정본 `touchtok.json` facts 에 없음 — 349,000 · 169,000 · 199,000 · 29,000 · 포토리뷰 리필 1박스. 확정 시 facts 반영. 카페24 반영 여부 모름(메인 블랙위크 0)
4. 새 상세 법적 고지 「질병의 예방 및 치료와는 무관합니다」 카페24 반영 여부 모름
5. 중도 해지 399,000 / 200,000원 · `6개월`·`6개` 약관 근거 모름
6. `touchtok.json` 홑 숫자 11칸 단위 · 외국어 랜딩 고지문 언어판 · 배송비·「300Da」 근거 · KC 인증상호 — 모름/대표님
7. 상세 수정본 카페24 반영 · 배너 링크 19개 — 카페24 로그인 필요
8. 꼬리말 정본 · 공용 금지어 「입증」 추가 · 「Dolby」 강등 — 대표님 결정
9. 네이버 쇼핑검색 광고 예산 · 옥션/G마켓 199,000 전환 — 돈·ESM 로그인은 대표님
10. 생성기 두 개(`touchtok-site/tools/build.py` · raytok `tools/build_home.py`) 돌리지 말 것 — 대표님 결정

## 상대에게 영향 가는 것
- 메인 슬라이드 4·5번 RayTok 배너 85개 언어 — 확정값과 일치, 손 안 댐
- 고친 것: touchtok-site `robots.txt`·`sitemap.xml`(신규) · handoff 3개. `products/`·`lib/`·`route.mjs`·`out/`·`quota/`·공용 금지어·`touchtok.json` 무수정
