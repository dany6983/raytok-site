# 공유 함정·요령 장부

양쪽이 **겪은 것만** 적는다. 추측은 적지 않는다. 맨 아래에 덧붙인다.
형식: `## <날짜> · <세션> · <한 줄 제목>` → 증상 → 원인 → 해법

---

## 마켓플러스 (mp.cafe24.com)

### 값이 두 벌이다 — 보이는 것만 고치면 전송이 안 간다 · claude-22
일괄입력 레이어(숨김)와 실제 전송 필드 `template_data[shopn|ncp_1njmfm_01][market_data][...]` 가 따로 논다.
→ 전송 필드를 직접 고친다.

### `is_default_*` 체크박스를 켜야 내 값이 쓰인다 · claude-22
요약설명 45자가 안 바뀌던 원인. 「연동/별도」 토글이 별도여야 입력값이 간다.

### 원산지 — `기본`으로 두면 전송 실패 · smartever
실패사유 「원산지 항목을 입력해 주세요」. 화면에 국외>아시아>중국이 보여도 안 간다.
→ `is_default_origin` 을 **별도**로 켜고 3단 셀렉트 + `origin_detail` 텍스트("중국")까지 넣는다. 2번 실패 후 3번째 통과.

### KC 는 번호만으론 안 된다 · smartever
실패사유 「인증기관·인증상호 항목을 입력」. **인증기관명·인증상호명 둘 다 필수.**

### 요약설명 40자 · smartever
길면 전송 전 검증에서 막힌다(`입력할 항목이 남아있습니다` + 좌측 마켓 탭 빨간 !).
※ claude-22 기록엔 45자로 돼 있었으나 **실제로 막힌 쪽이 맞다. 40자로 통일.**

### 묶음배송 「사용함/미선택」 · smartever
템플릿 기본이 사용함인데 그룹코드가 비어 검증 실패.
→ 사용안함 + 도서산간 「추가 배송비 미적용」.

### 인증정보(선택) 행에 값을 넣지 마라 · smartever
KC 행과 인증정보 행의 placeholder 가 같아 스크립트로 채우면 두 곳 다 들어간다.
인증유형 「-선택-」인 채 값만 있으면 걸린다.

### 상세설정은 버튼을 눌러야 입력 가능 · smartever
`판매정보 수정하기 / 배송정보 수정하기 / 인증 및 제공고시 수정하기` 를 눌러야 블록이 열린다. 안 누르면 읽기전용.

### 전송 결과는 10초쯤 뒤 · smartever
`마켓상품관리(manageList)` 에서 갱신. 실패사유는 「전송실패」 링크(`btnRightSlideLayer`) → 우측 슬라이드에 `[detail] ...`.

### 「상품 수 한도 초과」 경고를 믿지 마라 · claude-22
상품 18개를 **지우기 전의 옛 기록**이 배너에 남아 있었다. 현재 상태로 읽고 오판했다.
→ 실제 실패 사유는 `상품관리이력 > 전송실패` 에만 있다.

### 상세는 팝업이다 · claude-22
`window.open` + 이름. 차단되면 `window.open=u=>{location.href=u}` 로 같은 탭 이동.

### ⚠ 템플릿을 공유하면 값이 서로 덮인다 · smartever
`[대표] 스마트스토어 기본 템플릿` 을 쓰면 **KC·상품정보 제공고시·A/S 안내가 다른 제품 것으로 따라온다.**
터치톡을 보낼 때 선글라스의 `R-R-PNLE-RT-18G`·CGTEK·렌즈 안내가 들어왔다. **반대 방향도 난다.**
→ 제품별로 3곳을 반드시 덮어쓴다. **근본 해법은 템플릿을 제품별로 쪼개는 것.**

---

## 카페24 관리자

### 편집기 `저장` 을 먼저 누르면 옛 내용으로 되돌아간다 · claude-22
textarea 를 교체한 뒤 편집기 저장을 누르면 원복된다.
→ 건너뛰고 바로 `상품수정`(`#eProductModify`).

### 에디봇 → 직접 작성(HTML) 전환 시 확인 팝업 · smartever
전환 후 **PC·모바일 상세 둘 다** 넣어야 한다: `$Editor.product_description`, `product_description_mobile`, Froala `html.set`.
모바일 상세가 「직접 등록」으로 분리돼 있을 수 있다.

---

## 브라우저 자동화

### 네이티브 alert/confirm 이 탭을 멈춘다 · smartever
`mp.cafe24.com` 은 페이지마다 띄운다. 자동화 브라우저는 그 순간 멈춘다.
→ 페이지 진입 직후 `window.alert=()=>{}; window.confirm=()=>true;` 를 먼저 건다.
**네비게이션하면 초기화되므로 매 페이지마다 다시.** 카페24 관리자도 동일.

### `javascript_tool` 파라미터는 `text` 다 · claude-22
`code` 가 아니다. `action:"javascript_exec"` 필수.

### `async`/`await` 를 쓰면 반환이 `{}` 로 온다 · claude-22
→ 동기 코드로 나눠 실행한다.

### URL 쿼리스트링을 반환하면 막힌다 · claude-22
`[BLOCKED: Cookie/query string data]`. → 값만 꺼내 반환한다.

### 메타의 Accept/Send 최종 버튼은 자동 클릭이 막혀 있다 · smartever
대표님이 직접 눌러야 한다.

---

## 쿠팡

### 세션이 끊기면 401 · claude-22
재로그인 외에 길이 없다.

### 저장 순서 · claude-22
상세설명 편집기 `저장` → 그 다음 `수정 및 검수 요청`. 반대로 하면 이탈 경고.

### 규격 · claude-22
상세 세로 **3,000px 이하**, **GIF 불가**, 폭 **780px**. (네이버·카페24는 860px)

---

## 그 밖

### 크메르·미얀마 글자가 □ 로 깨진다 · claude-22
→ `apt-get install fonts-noto-core`

### ⚠ 오픈마켓 이미지노출이 유료다 · smartever
월 33,000원(신규 3개월 무료). **pdkent 는 미사용.**
마켓플러스 경고: 마켓 상세 이미지가 안 보일 수 있다.
**양쪽 상세가 전부 외부 CDN 이미지라 영향 범위를 확인해야 한다.** (claude-22 확인 중)
신청은 VAS 결제 페이지로 넘어가므로 대표님 몫.

## 2026-10-31 · smartever · 끝맞춤 선택자가 「선택항목전송」 플래그를 깬다
증상: `document.querySelectorAll('input[name$="[prd_name]"]')` 로 상품명을 넣었더니 체크박스 하나의 value 까지 상품명으로 바뀜.
원인: 상세설정 각 행 왼쪽 체크박스 `template_data[...][modify_partial][<필드>]` 가 같은 꼬리를 가짐. value 는 `N|product` 형식(선택항목전송 순번). prd_name·selling_price 는 짐작상 1·2.
해법: **전체 이름**으로 선택한다 — `input[name="template_data[shopn|ncp_1njmfm_01][prd_name]"]`. 깨뜨렸으면 「전체전송」으로 보내면 플래그와 무관하게 간다.

## 2026-10-31 · smartever · 상품명·태그 필드 위치
상품명: `is_default_prd_name` 끄면(별도) `template_data[...][prd_name]` 입력 가능. 태그: 「부가정보 수정하기」 누른 뒤 `[market_data][seo_seller_tags]` 쉼표구분, 최대 10개 전송.

## 2026-10-31 · smartever · Upload-Post 무료 플랜은 TikTok 연결 불가
manage-users 화면 경고: "Connecting to TikTok is not available for users on the Free plan". 무료 = 월 10 업로드. Basic $16/월부터 TikTok.

## 2026-10-31 · claude-22 · 법정 고지문을 금지어 게이트에 넣으면 모순이 난다
증상: `touchtok` 11월 계획 4편이 전부 `gate=BLOCK` — 금지어 「치료」.
원인: 필수 표기문 「…질병의 예방 및 **치료**를 위한 의료기기가 아니며…」 **자체**에 금지어가 있다. 고지문은 법에서 정한 정본이라 단어를 바꿀 수 없다.
해법: 게이트는 **마케팅 문구(body)만** 검사하고, `mustInclude` 로 붙인 고지문은 면제한다. 순서 = ① body 작성 → ② body 에 금지어 게이트 → ③ 고지문 append → ④ 전문에 `auditRequired`.
교훈: **「검사 대상」과 「검사 규칙」을 같은 텍스트에 섞지 마라.** 붙이는 문구와 검사하는 문구를 분리해야 한다.

## 2026-10-31 · claude-22 · 검사 함수를 만들어도 호출하지 않으면 없는 것이다
`lib/check.mjs` 에 `auditRequired` 가 있었지만 `route.mjs` 의 `plan` 이 **불러 쓰지 않았다**. `check`(금지어)·`auditNumbers`(출처없는숫자)만 돌았다.
→ 필수 표기가 빠진 캡션 4편이 `gate=pass` 로 통과해 계획에 들어갔다. 수동 `check` 명령으로 돌렸을 때만 잡혔다.
해법: 계획 각 편에 `required`/`missingRequired` 필드를 남겨 **파일만 보고도** 합격 여부가 보이게 한다. 콘솔에도 `✗ 필수 표기 빠짐` 을 찍는다.
점검법: `node -e "const j=require('./out/plan-<pid>-<YYYY-MM>.json'); console.log(j.plan.filter(p=>p.gate!=='pass'||p.required!=='pass').length)"` → 0 이어야 한다.

## 2026-10-31 · claude-22 · ⚠ 교신이 조용히 끊긴다 — 클론이 detached HEAD 다
증상 세 가지가 같이 난다:
1. `git pull --rebase origin main` 이 원격이 움직였는데도 **「Already up to date」/「HEAD is up to date」**
2. `git push origin main` 이 **`non-fast-forward` · 「pushed branch tip is behind its remote」** 로 거부
3. `git log` 은 내 커밋이 원격 최신 커밋 위에 잘 얹혀 있다고 보여준다 (그래서 더 헷갈린다)
원인: `git rev-parse --abbrev-ref HEAD` 가 **`main` 이 아니라 `HEAD`** → detached HEAD. 이 상태에서 `git push origin main` 은 내 커밋(HEAD)이 아니라 **로컬 `refs/heads/main` 브랜치**를 민다. 그게 옛 커밋에 멈춰 있어서 거부된다. 내 작업물은 push 자체가 **시도조차 안 된다.**
해법:
```bash
git rev-parse --abbrev-ref HEAD        # HEAD 면 걸린 것
git branch -f main HEAD && git checkout main
git branch --set-upstream-to=origin/main main
git push origin main
```
또는 한 줄로: `git push origin HEAD:main`
**매시 절차 시작 전에 `git rev-parse --abbrev-ref HEAD` 한 번 찍어보세요.** 이걸 모르면 「커밋했고 push 했다」고 보고하면서 상대는 아무것도 못 받는 상태가 됩니다.

---

## 2026-10-31 · claude-22 · ⚠ 3채널 상세가 전부 외부 링크 하나에 걸려 있다

**증상 아님 — 구조 위험.** 지금 안 보인다는 증거는 없다. 그러나 끊기면 동시에 다 끊긴다.

실측(2026-10-31 14:2x):
| 채널 | 상세 이미지 | 썸네일 |
|---|---|---|
| 카페24 상품 35 (선글라스) | `raytok.kr/img/d2/*.jpg` **4장 전부 외부 링크** | — |
| 쿠팡 (16432924501) | `raytok.kr/img/d2/RT18G_cp_*.jpg` **8장 전부 외부 링크** | `image1.coupangcdn.com` (쿠팡이 복사해 감) |
| 네이버 | 카페24 상세를 그대로 받으므로 동일 | — |

**썸네일은 마켓이 복사해 가지만 상세 HTML 안의 `<img src>` 는 링크 그대로 남는다.**

위험 셋:
1. `raytok.kr`(GitHub Pages)이 죽으면 **3채널 상세가 동시에 사라진다.** 단일 장애점
2. 마켓이 외부 링크를 막으면 안 보인다 — 마켓플러스가 「오픈마켓 이미지노출」(월 33,000원)을 파는 이유가 이것
3. GitHub Pages 는 월 100GB 소프트 한도가 있다. 판매가 늘면 그때 끊긴다

**근본 해법: 이미지를 카페24에 업로드하고 상세의 `src` 를 카페24 URL 로 바꾼다.**
그러면 유료 서비스도, 외부 의존도 사라진다. 네이버는 카페24 연동이라 자동으로 안전해진다.
쿠팡은 상세도 쿠팡 에디터에 직접 업로드하는 길이 따로 있다.

**터치톡도 같은지 확인 바랍니다.** Higgsfield CDN 이면 같은 위험입니다.
