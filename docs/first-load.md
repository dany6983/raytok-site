# 손님 첫 화면이 받는 양 — 재는 법과 마지막 실측

**아래 표는 기계가 쓴다.** 다시 재려면 (주소만 바꾼다):

```bash
node scripts/measure-first-load.mjs --out docs/first-load.md                            # 이 저장소를 띄워서
node scripts/measure-first-load.mjs --base https://raytok.kr --out docs/first-load.md   # 배포된 실서버
```

- `raw` = 압축 안 한 본문 · `gz(계산)` = 받은 본문을 여기서 gzip 한 양 · `실제 받은` = 브라우저가
  정말 받은 양. 로컬 정적 서버는 **압축을 안 하므로** 로컬에서는 `gz(계산)` 을 보고,
  실서버(GitHub Pages, gzip·br)에서는 `실제 받은` 을 본다. 하나만 보면 세 배로 잘못 읽는다.
- 재는 것은 **첫 화면 한 번**이다. 글자 스트리밍(2시간 0.2~0.4 MB)은 다른 자리다 —
  계산은 `tools/measure_listener_bytes.js`, 실측은 릴레이 `bytes_out`.
- 실서버 측정은 **대표님 PC 에서** 한다. 이 세션의 컨테이너는 `raytok.kr` 이 CONNECT 403 으로
  막혀 있어 로컬 숫자만 낼 수 있다.
- 2026-10-17 B 19 전: 청취 gz **119.3 KB** · join gz **49.7 KB** (81개 언어 사전을 통째로 받았다).
  아래 표가 그 뒤의 숫자다.

---

<!-- 아래는 기계가 쓴다 — scripts/measure-first-load.mjs -->

## 손님 첫 화면 실측 — 로컬(이 저장소, 압축 없음)

- 잰 때: 2026-10-17 09:00 UTC
- 주소: http://127.0.0.1:40381 · 언어: vi

| 쪽 | 받은 것 | raw KB | gz KB(계산) | 실제 받은 KB |
|---|---:|---:|---:|---:|
| /web/listener/ | 6 | 114.9 | 33.0 | 116.6 |
| /join/ | 2 | 10.7 | 5.1 | 11.3 |

가장 큰 것:
- /web/listener/ → /web/listener/ 25.7KB · /web/listener/ui-strings/vi.json 3.4KB · /web/listener/langs.json 1.6KB · /common/theme.css 1.1KB
- /join/ → /join/ 3.3KB · /join/ui-strings/vi.json 1.8KB
