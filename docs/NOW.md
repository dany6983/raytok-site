# NOW — 지금 할 일판 (마스터가 덮어쓴다 · 세션은 이것만 보면 된다)

규칙: ① 맨 위 줄부터 한다 ② 끝나면 묻지 않고 다음 줄 ③ 줄이 다 끝나면 REPORT 에 보고 + mailwait
결정장부 30: **쉬운 것 먼저, 묻지 말고 진행.**
갱신: 2026-10-17 18:00 KST — 16·17·19·20 끝, 잘했다

## B
1. **B 21** 청취 `index.html` 주석을 **낼 때만** 지운다 — 소스는 그대로, 생성기 + `--check` 시험(B 16 과 같은 모양). gz −4 KB
2. **B 22** `/asr/batch` 릴레이 쪽 뼈대 — `raytok-native1/docs/design/post-asr.md` 의 계약대로. **`ASR_ENABLED` 기본 꺼짐 · 가짜 엔진**(정해진 JSON 돌려줌)으로 시험까지. 진짜 GPU 연결은 E-8 뒤. 키·배포 없음. 일일 상한 `ASR_DAILY_CAP_USD` 와 503 `asr_cap` 포함
3. **B 23** 실서버 재측정 — 대표님이 B 17 대로 배포하신 뒤 `measure-first-load.mjs --base https://raytok.kr` (배포 전이면 건너뛰고 REPORT 에 한 줄)
4. 보고 한 번
