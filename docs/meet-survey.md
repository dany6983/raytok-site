# RayTok 회의 소리 캡처 및 연동 기술 조사

## 표 1. Windows 시스템 소리 캡처 (Electron)

| 방법 | 지연 | 설치 난이도 | Electron 버전 조건 | 마이크 동시 캡처 | 출처 |
|---|---|---|---|---|---|
| desktopCapturer+getUserMedia(chromeMediaSource) | ~50~100ms | 쉬움 (내장 API, 외부 의존성 없음) | Electron 전체 (v17+는 main IPC 경유 권장) | 불가 (별도 getUserMedia 후 AudioContext 믹싱 필요) | https://www.electronjs.org/docs/latest/api/desktop-capturer |
| naudiodon(WASAPI loopback) | ~10~30ms | 어려움 (C++ 네이티브 모듈, node-gyp/rebuild 필요) | Node ABI 호환 버전 필요 | 가능 (루프백 장치와 마이크 장치 각각 AudioInput 개방) | https://github.com/Streampunk/naudiodon |
| audify | ~10~30ms | 보통 (C++ 네이티브 모듈, prebuild 제공) | Node ABI 호환 버전 필요 | 가능 (RtAudio 인스턴스로 루프백 및 마이크 동시 개방) | https://github.com/almoghamdani/audify |
| electron-audio-loopback | ~50~100ms | 매우 쉬움 (순수 JS/TS 래퍼, 네이티브 빌드 불필요) | Electron 13+ (setDisplayMediaRequestHandler 지원) | 불가 (루프백 단독 반환, 마이크는 AudioContext 믹싱 필요) | https://github.com/alecmev/electron-audio-loopback |

## 표 2. macOS 루프백

| 방법 | OS 최소 버전 | 권한 흐름 | Electron 패키지 | 출처 |
|---|---|---|---|---|
| ScreenCaptureKit(14+) | macOS 14.0+ | 시스템 설정 '화면 및 시스템 오디오 녹음' 허용 + Info.plist NSAudioCaptureUsageDescription | electron-audio-loopback (또는 Electron 29+ desktopCapturer) | https://developer.apple.com/documentation/screencapturekit |
| BlackHole 가상장치 | macOS 10.10+ | 드라이버 PKG 수동 설치(관리자 암호) + Audio MIDI 다중 출력 기기 생성 + 마이크 권한 허용 | 별도 전용 패키지 없음 (표준 getUserMedia로 장치 선택) | https://github.com/ExistentialAudio/BlackHole |

## 표 3. 스트리밍 음성 인식

| 서비스 | 스트리밍 방식 | 한국어 | 지연(초) | 분당 단가 USD | 무료 한도 | 출처 |
|---|---|---|---|---|---|---|
| Google Cloud STT v2 chirp_2 | gRPC 양방향 스트리밍 | 지원 (ko-KR) | 0.8~1.2초 | $0.0160 | 매월 60분 무료 (신규 $300 크레딧) | https://cloud.google.com/speech-to-text/pricing |
| Deepgram Nova-3 | WebSocket | 지원 (ko) | 0.2~0.3초 | $0.0058 | 가입 시 $200 일회성 크레딧 (월간 무료 없음) | https://deepgram.com/pricing |
| Azure Speech | WebSocket (Speech SDK) | 지원 (ko-KR) | 0.2~0.5초 | $0.0167 | 매월 5시간 무료 (F0 프리 티어) | https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/ |
| AssemblyAI streaming | WebSocket | 지원 (ko, Universal-3.6 Pro) | 0.15~0.3초 | $0.0075 | 가입 시 333시간 무료 스트리밍 | https://www.assemblyai.com/pricing |

## 표 4. 회의 채팅에 링크 게시 봇 서비스

| 서비스 | Zoom/Meet/Teams | 시간당 단가 USD | 오디오 스트림 제공 | 출처 |
|---|---|---|---|---|
| Recall.ai | 지원 (전부 지원) | $0.50 | 제공 (실시간 WebSocket 원시/화자별 오디오 스트림) | https://www.recall.ai/pricing |
| Meeting BaaS | 지원 (전부 지원) | $0.35~$0.50 | 제공 (실시간 WebSocket 오디오 스트림) | https://meetingbaas.com/pricing |

## 표마다 B 1순위 + 이유

- **표 1 1순위: electron-audio-loopback**
  - C++ 컴파일 환경(node-gyp, Visual Studio) 없이 npm 패키지 추가만으로 즉시 작동해 유지보수 비용이 가장 낮습니다.
  - Chromium 내장 루프백을 활용해 별도 드라이버 설치 없이 Windows 전체 소리를 50~100ms 내외로 안정적으로 캡처합니다.

- **표 2 1순위: ScreenCaptureKit(14+)**
  - 가상 드라이버 수동 설치 및 Audio MIDI 설정이라는 극심한 사용자 설정 허들을 완전히 제거합니다.
  - macOS 표준 권한 대화상자 승인만으로 OS 레벨에서 안정적이고 지연 없는 시스템 오디오 스트림을 획득합니다.

- **표 3 1순위: Deepgram Nova-3**
  - 200~300ms 초저지연 WebSocket 전송과 한국어 단어 오류율(WER) 대폭 개선으로 실시간 자막 품질이 가장 우수합니다.
  - 분당 $0.0058의 최저 수준 단가와 초 단위 과금을 지원하며, 가입 시 $200 무료 크레딧으로 충분한 사전 검증이 가능합니다.

- **표 4 1순위: Recall.ai**
  - Zoom/Meet/Teams 전 플랫폼에서 화자별 분리 오디오 스트림과 회의 채팅창 링크 게시 API를 가장 안정적으로 제공합니다.
  - 고정 월 구독료 없이 시간당 $0.50 종량제(스타트업 $0.25/시간)로 동작하여 초기 도입 및 운영 비용 부담이 가장 적습니다.
