# RayTok 중계 서버 v0 (relay)

Cloudflare Workers와 Durable Objects (WebSocket Hibernation API) 기반의 경량 세션 중계 서버입니다.

## 1. 아키텍처 원칙
- **Durable Object 1개 = 세션 1개**: 방 코드마다 독립된 Durable Object 인스턴스가 1:1로 매핑됩니다.
- **WebSocket Hibernation API 필수**: `state.acceptWebSocket(ws, [role])`만 사용하며, `ws.accept()`는 사용하지 않습니다.
- **무상태 중계**: 호스트의 메시지는 내용을 해석하지 않고 청취자에게 그대로 전달되며, 청취자의 메시지는 호스트에게만 전달됩니다.
- **특허 및 라이선스 분리 (docs/RULES.md §2)**: 라이선스 검증 및 언어 배정 로직을 포함하지 않으며, 비밀키/API 키가 없습니다.

## 2. 엔드포인트
- `POST /room`
  - 응답: `{ "code": "6자리 Crockford Base32", "host_token": "32자리 hex" }`
  - I, L, O, U를 제외한 32자 문자로 방 코드를 생성하고, 세션 DO를 초기화합니다.
- `GET /room/:code`
  - 응답: `{ "exists": boolean, "listeners": number, "started_at": string | null }`
- `GET /ws?room=CODE&role=host&token=HOST_TOKEN`
  - 호스트 WebSocket 연결. 토큰 불일치 또는 미초기화 시 403 반환.
- `GET /ws?room=CODE&role=listener`
  - 청취자 WebSocket 연결. 방이 없으면 404 반환. 동시 접속 상한(200명) 초과 시 429 반환.

## 3. 세션 동작 규칙
- **최근 500개 링버퍼**: 호스트가 전송한 최근 500개 메시지를 보관하며, 새 청취자 접속 시 순서대로 먼저 전송합니다.
- **하트비트 (`__ping`)**: `setWebSocketAutoResponse`를 통해 `{"__ping":true}` 원문을 DO를 깨우지 않고 엣지에서 즉시 동일하게 반환합니다.
- **세션 종료 (`end`)**: 호스트가 `end` 메시지를 전송하면 모든 청취자에게 전달 후 5초 뒤 청취자 연결을 정상 종료(`close(1000)`)합니다.
- **호스트 비정상 단절**: 호스트 연결이 끊기면 10분간 대기 후 호스트 재접속이 없을 시 자동으로 `end` 처리 및 청취자 연결을 닫습니다.
- **상한 제약**:
  - 청취자 최대 200명
  - 메시지 최대 16KB (초과 시 무시)
  - 호스트 전송 속도 최대 20msg/s (초과 시 무시)

## 4. 로컬 실행 및 시험
```bash
# 로컬 개발 서버 실행 (배포 금지: wrangler deploy 는 실행하지 않음)
npx wrangler dev

# 스모크 테스트 실행 (wrangler dev 실행 상태에서)
node test/smoke.mjs
```
