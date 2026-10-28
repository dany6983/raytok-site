# web/vendor 라이브러리 라이선스 및 버전 안내

본 디렉터리의 라이브러리는 런타임 외부 네트워크(CDN) 호출 0건을 위해 로컬에 번들된 자립형 모듈입니다.

1. **pdf.js / pdf.worker.js**
   - 버전: v3.11.174
   - 라이선스: Apache-2.0
   - 용도: 교육 사전 자료 PDF 파일 브라우저 내 텍스트 추출

2. **mammoth.browser.min.js**
   - 버전: v1.13.0
   - 라이선스: BSD-2-Clause
   - 용도: 교육 사전 자료 DOCX 파일 브라우저 내 텍스트 추출

3. **fflate.min.js**
   - 버전: v0.8.2
   - 라이선스: MIT
   - 용도: 교육 사전 자료 HWPX 파일(ZIP 압축) 브라우저 내 압축 해제 ·
     **레이팩(`.rtpack`) 브라우저 내 압축 해제**(2026-10-28, 장부 63)

4. **bergamot/** — `@browsermt/bergamot-translator`
   - 버전: **v0.4.9** (npm `@browsermt/bergamot-translator@0.4.9` 꾸러미에서 꺼냈다, 2026-10-28)
   - 라이선스: **MPL-2.0** (npm `license` 칸에서 확인 · 엔진 저장소 `LICENSES.md` 도 같은 판정)
   - 용도: **웹 손님 브라우저 안 번역**(레이팩 ko→en→X 두 다리). 장부 63 · 측정 페이지 `web/raypack-probe/`
   - 들어 있는 것: `translator.js` · `worker/translator-worker.js` ·
     `worker/bergamot-translator-worker.js` · `worker/bergamot-translator-worker.wasm`(5.2MB)
   - ⚠ **CDN 에 기대지 않는다**(마스터 지시). `translator.js` 는 ES 모듈이고 작업자(worker)를
     `new URL('./worker/translator-worker.js', import.meta.url)` 로 찾으므로 **이 폴더 꼴을 바꾸지 않는다.**
     `.wasm` 은 작업자가 자기 자리 기준으로 받는다.
