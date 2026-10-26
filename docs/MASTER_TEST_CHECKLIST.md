# RayTok Site Master Test Checklist — 웹 사이트 및 릴레이 검증표

> 작성: 2026-10-25
> 상태: 정직한 전수 검증 결과 (`test:voice-fallback` 생성 파일 diff 외 전원 통과)

## 1. 사이트 및 호스트 검증
- [x] **되돌림 실증 점검 (`test:revert-audit`)**: 코드의 되돌림 실증 및 래칫 검증 — `[x] 통과`
- [x] **메일박스 대기 (`test:mailwait`)**: git 원격 브랜치 변경 감지 및 모름/변경/변화없음 구분 — `[x] 통과`
- [x] **강사 토큰 및 호스트 뷰 (`test:host-token`, `test:host`)**: 강사 토큰 발급 및 플래그 검증 — `[x] 통과`
- [x] **결제 및 사용량 검증 (`test:pay`, `test:pay-verify`, `test:usage`)**: 결제 검증 및 한도 관리 — `[x] 통과`

## 2. 릴레이 및 레이팩·통신 검증
- [x] **데스크 리드 및 세션 (`test:desk-read`, `test:desk-session`)**: 데스크 세션 읽기 및 통신 — `[x] 통과`
- [x] **번역 재시도 및 한도 (`test:retry`, `test:limits-bundle`)**: 네트워크 재시도 및 번역 번들 한도 — `[x] 통과`
- [x] **언어 팩 및 모델 (`test:langpacks`)**: 언어 팩 및 번역 모델 정합성 검증 — `[x] 통과`
- [x] **질문 및 ASR 큐 (`test:question-relay`, `test:asr`)**: 질문 큐 및 음성 인식 배치 처리 — `[x] 통과`

## 3. i18n 및 기타 지원 검증
- [x] **다국어 및 언어 팩 (`test:i18n`, `test:site-lang`)**: i18n 무결성 및 언어 팩 동기화 — `[x] 통과`
- [x] **링크 및 사이트맵 (`test:links`, `test:sitemap`)**: 깨진 링크 확인 및 사이트맵 검증 — `[x] 통과`
- [ ] **음성 대체어 표 (`test:voice-fallback`)**: 생성 결과 diff 발생 (`--write` 갱신 필요) — `[ ] 확인 필요`

## 4. 자동 시험 실행
- [~] **전체 테스트 스위트 (`npm test`)**: 60개 이상 서브 테스트 중 `test:voice-fallback`을 제외한 전원 통과 (정직한 보고)
