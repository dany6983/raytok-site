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

## 2026-10-31 · smartever · 네이버 태그 「등록불가 단어」 — 실패 사유는 상품관리이력 > 전송실패에만
증상: 상품명·태그 바꿔 전체전송 → 「마켓으로 상품을 보냈습니다」 뜨는데 목록엔 「전송실패」.
원인(이력 `mp/queue/productList?queue_status=F`): `태그 항목에 등록불가인 단어(...)가 포함`. 거절된 단어: **피부관리기, 뷰티디바이스, 피부미용기기, 홈케어, 마스크팩, 셀프케어, 데일리케어**. 통과: **홈케어기기, PDRN마스크팩, 수딩젤, 탄력관리, 피부관리, 홈뷰티**.
해법: 일반명사·카테고리명은 태그로 안 받는다. 거절되면 이력에 단어가 그대로 나오니 빼고 재전송. 한 단어라도 걸리면 상품명 수정까지 통째로 안 간다.

## 2026-10-31 · smartever · 태그 입력칸도 두 벌이다
`input[name="...[market_data][seo_seller_tags]"]` 가 **2개**(앞 = 숨김 일괄입력 레이어, 뒤 = 보이는 칸). `querySelector` 는 숨김 쪽을 잡아 값이 안 간다. `querySelectorAll` 로 **둘 다** 넣는다. prd_name 도 같다.

## 2026-10-31 · smartever · 상세 이미지 외부 링크 빠른 실측
로그인 없이 공개 상품 페이지로 확인된다:
`curl -sL "https://smartever.co.kr/product/detail.html?product_no=N" | grep -oE 'src="[^"]+"' | sed -E 's#src="(https?:)?//([^/]+)/.*#\2#' | sort | uniq -c`
`d2ol7oe51mr4n9.cloudfront.net/user_…` = Higgsfield 생성물 원본 링크. 계정·플랜 정리하면 끊길 수 있으니 카페24로 이관 대상.
detached HEAD 정상화는 밀리지 않은 커밋이 없을 때 `git checkout -B main origin/main` 한 줄이 가장 깔끔하다.

---

## 2026-10-31 · claude-22 · ⚠ 상품등록 화면에서 분류를 지정하면 저장이 안 먹는다

**증상**: 상품수정 화면 「표시설정 > 상품분류 선택」에서 분류를 고르고 `+적용` → `상품수정` 을 눌러도,
다시 열면 **「선택된 상품분류 내역이 없습니다」로 되돌아간다.** 두 번 시도해서 두 번 다 날아갔다.
`addCategoryNum[]` 에 값이 들어간 것까지 확인했는데도 저장 뒤 사라진다.

**정석 경로는 따로 있다**: `상품 진열 > 분류별 진열`
```
https://pdkent.cafe24.com/disp/admin/shop1/product/ShowInfoCategory?category_no=<분류번호>
```
→ 우측 `상품추가 >` → 상품 체크 → `선택`

**상품추가는 팝업이다.** 차단되면 열리지 않고, 좌표 클릭하면 **탭이 통째로 멈춘다**(네이티브 확인창).
→ 팝업 URL 로 바로 이동하면 된다:
```
https://pdkent.cafe24.com/disp/admin/product/ShowInfoAdd?display_group=1&category_no=<분류번호>
```
그 페이지에서 `window.alert=()=>{}; window.confirm=()=>true; window.onbeforeunload=null;` 을 먼저 걸고
체크박스 → `선택` 버튼을 JS 로 누르면 멈추지 않는다.

**새 분류는 「표시안함」으로 생성된다.** 만들자마자 `표시상태`·`메인분류 표시상태` 를 둘 다 「표시함」으로
바꾸고 저장해야 한다. 안 그러면 분류를 만들어도 메뉴에 안 나온다.

**확인은 curl 로 하지 마라.** 이 쇼핑몰은 상품 목록을 JS 로 그린다. curl 로 받은 HTML 에는 상품이
없어서 「아직 안 됐다」로 오판한다. 브라우저로 열어서 봐야 한다. (claude-22 가 이걸로 30분 허비했다)

### 오늘 겪은 실제 사례 — 선글라스가 쇼핑몰 어디에도 없던 이유
1. 선글라스가 들어갈 분류가 아예 없었다 (제품구매 아래 터치톡·제습기·헤어기기·음식물처리기·공기청정기뿐)
2. 상품에 분류가 하나도 안 걸려 있었다
3. 메인 진열 체크가 전부 꺼져 있었다
→ `제품구매 > RayTok 통역기기` (cate_no=74) 신설 + 분류별 진열로 상품 추가하여 해결.
**터치톡 상품도 메인 진열 체크 상태를 한 번 확인해 보시기 바랍니다.**

---

## 2026-10-31 · smartever · 진열 확인은 Playwright 렌더링으로, 로그인 없이 된다
curl 이 안 되는 건 맞다(JS로 그림). 대신 이 클라우드 환경엔 Chromium+Playwright 가 깔려 있어 예약 세션도 확인 가능:
`page.goto(url,{waitUntil:'networkidle'})` → 3초 대기 → `a[href]` 수집.
**함정**: 이 몰 상품 링크는 `product_no=N` 이 아니라 `/product/<슬러그>/<N>/category/<분류>/display/1/` 형식이다. `product_no=` 로만 grep 하면 「상품 없음」으로 오판한다.
**메인 화면 구조**: 메인 상품은 진열 모듈(`xans-product-listmain`)이 아니라 손으로 만든 배너(`-banner-edit`, `-pc-banner`, owl-carousel)로 걸려 있다. 그래서 관리자 「메인 진열」 체크를 켜도 메인에 바로 안 나올 수 있다 — 배너를 고쳐야 한다.

---

## 2026-10-31 · claude-22 · 카페24 상품 이미지는 브라우저 자동화로 못 올린다

`file_upload` 로 `#imageFiles` 에 파일을 넣는 것까지는 성공하는데(`Uploaded 1 file(s)`),
카페24가 집어가지 않는다. 직후 확인하면 **`input.files.length === 0`** 이고 미리보기도 그대로다.
`change` 이벤트를 수동으로 쏴도 반영되지 않는다.

「변경」·「이미지 추가하기」 버튼은 **네이티브 파일 선택창**을 띄우는 자리라 클릭하면 탭이 멈춘다.

→ **이미지 교체는 대표님께 파일을 보내고 직접 올리시게 한다.** 매달리지 말 것.
   `SendUserFile` 로 넘기고 경로만 안내하면 5분이면 끝난다.
   (claude-22 가 이걸 모르고 시간을 썼다)

참고: 파일 경로 제약도 있다. `file_upload` 는 `/mnt/user-data/outputs/` 를 거부하고
**작업 디렉토리 안의 경로**(예: `/home/claude/raytok-site/img/shop/...`)만 받는다.

---

## 2026-10-31 · smartever · 상세 이미지 원본 일괄 회수 (외부 CDN → 카페24 이관 준비)
카페24 상세 `<img>` 는 지연로딩이라 `src` 가 빈 자리표시일 수 있다. Playwright 로 상세 페이지를 `networkidle` + 3초 대기 후
`img.getAttribute('ec-data-src') || img.src` 를 모아 도메인으로 거르면 **페이지 순서 그대로** 목록이 나온다.
→ `NN` 번호를 붙여 받으면 대표님이 에디터에서 순서 헷갈리지 않고 교체 가능. 업로드 자체는 위 claude-22 요령대로 사람 손으로.

---

## 2026-10-31 · claude-22 · 실물 제품을 유지한 AI 연출 사진 만드는 법

대표님 지시: 「있는 사진 말고 전부 새 연출 사진으로, 고급스럽게」 + 「당연 실물 제품 사진으로 합성」.
**제품을 AI가 새로 그리게 두면 실물과 다른 물건이 나와 허위 표시가 된다.** 실물 사진을 참조로 넣어야 한다.

절차 (Higgsfield):
1. `media_upload` → 반환된 `upload_url` 에 **curl PUT** (webp 는 jpg 로 변환해서)
2. `media_confirm` (type: image)
3. `generate_image` 에 `medias: [{role:"image_references", value:<media_id>}]`
   · 역할명은 **`image_references`** 다. `reference` 라고 쓰면 거부된다 (모델마다 다름 — `models_explore` 로 확인)
   · 모델 `gpt_image_2_5` 가 참조 기반 편집에 맞다
4. `jobs_wait` 로 결과 URL 수령

프롬프트에 반드시 넣을 것:
```
preserve the precise shape, matte black frame, blue accents on the temple tips,
the blue-purple mirrored lens, and the 'RayTok' lettering. Do not redesign the product.
... generous empty negative space on the left for text.
no text, no watermark, no people
```
**왼쪽 여백을 비우라고 해야** 배너 카피가 들어갈 자리가 생긴다.

배너 합성 요령:
- 그래도 글씨가 제품과 겹치면 **왼쪽에 가로 그라데이션 음영**을 깐다 (strength 0.8, power 1.25)
- 우하단에 **「연출 이미지」** 표기 필수
- 스마트에버 메인 배너 규격: **PC 1920×870 · 모바일 768×901** (슬라이드당 2장)

업로드 URL 은 쿼리스트링이 길어 셸 이스케이프가 깨진다 → 파일에 적고 `"$(tr -d '\n' < file)"` 로 넘긴다.

## Metricool MCP 날짜 파라미터 (2026-10-31)
- `getScheduledPosts`는 `blogId/start/end`가 아니라 **`brandId/fromDate/toDate`**
- 날짜는 **UTC 오프셋이 반드시 붙어야 한다.** `2026-11-10T12:10:00` → 파싱 실패
  올바른 값: `2026-11-10T12:10:00+09:00`
- `createScheduledPost`는 `blogId` + **`date`**(오프셋 포함) + `info`(JSON 문자열)
  `timezone` 파라미터는 스키마에 없다 — 넣으면 거부
- `info.media`에 **공개 URL을 주면 Metricool이 자기 서버로 복사한다.**
  응답의 media는 static.metricool.com 주소로 바뀐다. 이미지 업로드 따로 안 해도 됨
- 한 건이 채널 수만큼 한도를 먹는다. 인스타+페북 = 2건
---

## 2026-10-31 · claude-22 · 금지어 목록은 「막는 것」과 「통지만 하는 것」으로 갈라야 한다

오늘 세 번째로 같은 함정에 걸렸다. **금지어 게이트가 규정을 지킨 문구를 규정 위반으로 잡는다.**
1. 14시: 법정 고지문 안의 「치료」를 게이트가 막았다 → 고지문은 면제로 뺐다
2. 19시: 대표님이 **10-26 에 해제한 표현**(`claude/RayTok-광고규정_해제_1026.md`)을
   게이트가 그대로 막고 있었다. 그 해제 문서를 `$comment` 에 출처로 적어 두고도.
3. 같이 발견: 홈페이지 전체를 그 목록으로 긁으면 **오탐이 난다** — `guide/` 의 「삼성 폰은 Dolby Atmos를
   끄세요」는 제품 주장이 아니라 **문제해결 안내**다. 목록은 **마케팅 문구에만** 쓸 것.

그래서 구조를 이렇게 바꿨다 (`_common-forbidden.json` + `lib/check.mjs`):

| 칸 | 뜻 | 예 |
|---|---|---|
| `words` | **법 자체**라 막는다. `ok=false` | 사실과 다른 기능(골전도·방수·Dolby·블루투스 5.4), 등록 전 특허 표시, 실증 대상 최상급(세계 최초·유일한), 의료기기 영역(시력보호·청력보조), 100%·완벽한 |
| `notice` | **내부 보수규칙 해제분.** 막지 않고 통지만. `ok` 에 영향 없음 | 동시통역, 인터넷 없이, 데이터 없이 |

`check()` 가 `{ ok, hits, notices }` 를 돌려준다. `tools/i18n_check.js` 가 이미 쓰던
「목록은 금지가 아니라 통지용」 방식과 같은 틀이다 — **새 금지어 목록을 만드는 게 아니다**(AGENTS §22-1).

**판별 기준 한 줄**: 어감·완곡 규칙이면 해제(`notice`), **없는 기능을 있다고 하거나 증명 못 할 숫자·최상급**이면 막는다(`words`).
해제 문서의 「남는 것」 5개가 그대로 `words` 의 근거다.

### 같이 배운 것 — 해제는 「아무 말이나 된다」가 아니다
`privacy/index.html` 에 「인터넷이 없으면 **어느 설정이든** 휴대폰 안에서 번역합니다」가 살아 있었다.
「인터넷 없이」는 해제분이라 **써도 된다.** 그런데 「어느 설정이든」은 온디바이스 모델 없는 언어 25개
(현장교육 주력 송출국 7개 전부 서버 번역, `언어정책_1003`)에 **거짓**이다 → 해제 문서 남는 것 1번.
고칠 때 **조건 문구를 길게 붙이는 쪽으로 가지 말 것** — 그게 바로 해제된 보수 규칙이다.
세게 쓰면서 사실로 만드는 쪽: 「받아 둔 언어는 **비행기 모드에서도** 번역합니다」.

---

## 2026-10-31 · claude-22 · 발행 계획에 이미지 칸이 없으면 계획이 아니다

`route.mjs plan` 이 캡션·날짜·채널·게이트까지 다 뱉는데 **어느 이미지를 붙이는지가 없었다.**
12편을 세워 놓고 발행하는 사람이 폴더에서 눈으로 골라야 하는 상태 — 소재축이 안 맞는 이미지가 붙는다.

고침: `products/<id>.json` 에 `images`(hookId → 경로), `plan` 이 `image` 를 싣고 비면
`⚠ 이미지 없음 — products/<id>.json 의 images.<hookId>` 로 찍는다.

**빈 칸을 추측으로 채우지 말 것.** 11월 12편 중 11편이 비었는데, 만들어 둔 SNS 이미지 5장이
계획이 뽑은 후킹과 축이 달라서다(이미지는 비용·실시간·QR·37g·렌즈, 계획은 마감·구글불가·구독료·오픈형·언어수).
확실한 1건만 연결하고 나머지는 「모름」으로 비웠다. **이미지를 먼저 만들고 계획을 세우면 이 불일치가 난다 —
후킹을 먼저 뽑고 그 후킹대로 이미지를 만드는 순서가 맞다.**

---

## 2026-10-31 · 양 세션 · 스마트에버 메인 배너를 건드리는 세션은 이것을 먼저 읽는다

- 메인에 **상품 진열 모듈이 0개**다. 전부 손으로 넣은 배너(`-banner-edit`)다.
  → 상품 쪽에서 「메인 진열」을 체크해도 **메인에 안 뜬다.** 배너를 넣어야 뜬다 (smartever 실측, 16시)
- 메인의 **터치톡(상품 33) 링크 27개는 그대로 두라.** smartever 가 세 번 요청했다(16시·17:10·18:10).
  슬라이드를 새 배너로 교체할 때 터치톡 배너만 남기고 바꾼다
- 배너 규격: **PC 1920×870 · 모바일 768×901** (슬라이드당 2장). 교체 후 smartever 가 비로그인 렌더링으로 실측한다
- **상품 숨김 ≠ 배너 링크 삭제.** 상품 20(음식물처리기)을 숨긴 뒤 18시엔 메인 링크 0 이었는데 19:10 에 19개로 되살아났다.
  배너·슬라이드에 박힌 링크는 상품 숨김과 **별개로 살아 있다.** 메인 정리는 ① 상품 숨김 ② 배너 삭제 ③ 슬라이드 삭제
  ④ 올프로모션 모듈 확인 — 네 군데를 따로 봐야 끝난다. 끝낸 뒤 비로그인 렌더링으로 실측해 0 을 확인한다

## 카페24 상품 상세설명에 영상 넣기 (2026-10-31) — 성공
분류 지정과 달리 **상세설명 저장은 한 번에 먹는다.**
1. 상품번호는 프론트에서 딴다 (관리자 목록 링크는 팝업이라 위험)
   `curl -sL "https://smartever.co.kr/product/list.html?cate_no=NN" | grep -oE '/product/[^"]*/[0-9]+/category/NN/'`
2. `https://pdkent.cafe24.com/disp/admin/shop1/product/ProductRegister?product_no=N&type=u`
3. 상품 상세설명 > 「직접 작성」 탭 > 툴바 오른쪽 `<>` (코드보기) — 좌표 약 (1355, 341)
4. 줄 클릭 → `Home` → video 태그 타이핑 → 개행
   **코드 에디터는 따옴표 자동완성이 없다.** 그대로 쳐도 깨지지 않음
5. 하단 **「상품수정」** (약 704, 794)
6. 저장 직후 확장이 5초 넘게 멈춘다 (alert 추정) → **스크린샷 기다리지 말고 프론트에서 확인**

**카페24 위지윅은 video 태그를 지우지 않는다.** 코드보기 상태 그대로 저장해도 살아남는다.
영상은 외부 도메인(raytok.kr)에 두면 카페24 트래픽을 안 먹는다.

## 네이버 전송이 조용히 실패하고 있었다 (2026-10-31) — 중요
자사몰 상세를 고쳐도 **네이버에 반영이 안 되고 있었다.** 원인 세 가지.

1. **전송 필수값 누락** — 마켓플러스 전송이력에 이렇게 뜬다
   `제조일자 항목을 입력해 주세요 / 국가인증 성공은 모델명 입력이 필수입니다`
   카페24 상품수정에서 채운다: `prd_model`(모델명) · `print_date`(제조일자)
   → 둘 다 비어 있으면 **자사몰만 바뀌고 네이버는 옛날 그대로 남는다.** 화면엔 아무 경고가 없다.
2. **마켓 상품명이 다른 제품 이름이었다** — 마켓플러스 상품수정에서 상품명이 「별도」 토글로 잡혀 있었고
   값이 **터치톡 제품명**이었다. 토글을 「기본」으로 돌리면 자사몰 상품명을 따라간다.
3. 전송 후 `manageList`에서 상태가 「전송성공」으로 바뀌는 데 **20초쯤** 걸린다.

**점검 절차**
```
mp.cafe24.com → 마켓상품관리 → 전송상태 열
「전송실패」면 그 셀을 클릭 → 우측 전송이력 패널에 사유가 뜬다
```

**마켓플러스 진입** (mp.cafe24.com 직접 열면 로그아웃 상태)
카페24 관리자에서 SSO로 들어가야 한다. 새 창이 팝업 차단되므로:
```js
window.open=(u)=>{location.href=u;return null;};
MENU_NAVIGATION_GNB.openMarketManage();
```
들어간 뒤 페이지마다 `window.alert=()=>{};window.confirm=()=>true;`

**javascript_tool 파라미터는 `text`다** (`code` 아님). `action:"javascript_exec"` 필수.
쿼리스트링이 섞인 문자열을 반환하면 `[BLOCKED: Cookie/query string data]`로 잘린다 → `.replace(/[?&][^'"\s]*/g,'[q]')`로 지우고 반환.

## route.mjs plan 재실행 때 요일 인자를 빼면 날짜가 조용히 바뀐다 (2026-11-01 · smartever)
`node route.mjs plan <pid> <YYYY-MM> [주당횟수] [요일]` — 요일을 빼면 기본 화요일(주 2회면 화·금)로 다시 깔린다.
터치톡 11월은 목요일(4)로 만들어져 있었는데 `plan touchtok 2026-11 1` 로 돌리니 11/5→11/3 등 4편 날짜가 전부 밀렸다.
**재생성 전에 기존 out 파일의 `perWeek`·`day` 를 읽어 그대로 넘기고, 끝나면 이전 파일과 필드 단위 diff 로 바뀐 칸만 확인한다.**

## 상품 숨김과 배너·슬라이드 삭제는 별개 작업이다 (2026-11-01 · smartever)
상품을 진열안함/분류 표시안함으로 바꿔도 메인 슬라이드쇼·bannerManage·「자세히보기」에 손으로 박은 링크는 그대로 살아 있다.
음식물처리기(분류 58·상품 20) 링크가 10-31 18시 0 → 19시 19개 → 11-01 09시 19개. 숨긴 뒤에는 **메인 렌더링(Playwright) 링크 수로 확인**한다.
---
## SNS 카드 직접 만들기 — `scripts/sns_card.py` (claude-22, 2026-11-01)

사진형 소재가 없을 때 집 양식(남색+금색 1080×1350) 카드를 바로 찍을 수 있다. 외부 생성 도구가 필요 없다.

```bash
python3 scripts/sns_card.py cards.json      # 레포 루트에서
```

`cards.json` 은 리스트. 한 장 = `{file, kicker, lines[], accent, sub[], foot}`.
- `lines` 한 줄 **11자 안쪽**, `sub` 한 줄 **22자 안쪽**, `lines` 최대 5줄·`sub` 최대 4줄. 넘으면 **경고 없이 잘린다** — 찍고 나서 눈으로 한 번 봐야 한다
- `accent` 는 금색으로 칠할 `lines` 인덱스(0부터)
- `foot` 에는 **반드시 근거**를 적는다(시행일·적합등록번호·출원번호 등). 표시광고법 실증 대비이고, 이게 비어 있으면 못 쓴다
- 출력은 `img/sns/` 아래. 파일명은 `sns_<제품첫자>_<훅id소문자>_<키워드>.jpg` 로 하면 나중에 훅 찾기가 쉽다

**찍기 전에 반드시 금지어 게이트를 돌린다.** 카드 문구는 캡션과 따로 놀기 때문에 계획 gate 가 안 잡아 준다:
```bash
node route.mjs check <productId> "kicker+lines+sub+foot 를 전부 이어붙인 한 문장"
```
실제로 걸린 적 있음 — G3(오픈형) foot 에 「청력 보호」를 적었다가 금지어에 걸려 「안전장비가 아닙니다」로 바꿨다. `청력보조·청력 보호·시력보호·눈건강` 은 전부 막혀 있다.

**찍은 뒤 `products/<id>.json` 의 `images` 에 `훅id → 경로` 를 넣고 계획을 재생성해야** 계획에 이미지가 실린다. 재생성해도 캡션·날짜·훅은 안 바뀐다(확인함) — 바뀌는 건 `image` 칸뿐.

**훅에 맞는 이미지가 없으면 비워 둔다.** 파일명만 보고 갖다 붙이지 않는다. `sns_a_cost.jpg` 는 이름만 보면 「통역비(A2)」 같지만 실제로 박힌 문구는 "수신기는 대수만큼 빌립니다" = **D1**이었다. 열어서 글자를 읽고 맞춰야 한다.

## 카페24 몰 실측 — 슬러그 URL·node ESM 두 함정 (claude-22, 2026-11-01)

**함정 1 — `product_no=` 로 세면 0이 나온다.** 스마트에버 메인의 상품 링크는 전부 슬러그형이다:
`https://smartever.co.kr/product/<한글슬러그 URL인코딩>/<상품번호>/category/<분류번호>/display/1/`
`a[href]` 를 긁어 `product_no=` 로 거르면 **0개**가 잡히고 「상품이 없다」는 잘못된 결론이 난다. 이렇게 세야 한다:
```python
re.search(r'/20/category/58/', href)        # 상품20·분류58 (음식물처리기)
re.search(r'/33/category/60/', href)        # 상품33·분류60 (터치톡)
```
분류 링크만 `?cate_no=NN` 형식이라 섞여 있다. 둘 다 봐야 한다.

**함정 2 — `.mjs` 를 scratchpad 에 두면 playwright 를 못 찾는다.** node ESM 은 **스크립트 파일 위치** 기준으로 `node_modules` 를 찾는다. 작업 디렉터리를 바꿔도 소용없다(`cd /home/claude && node /tmp/.../probe.mjs` 도 실패). **python playwright 를 쓰는 게 제일 빠르다** — 어디서 실행하든 된다:
```python
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
    b = pw.chromium.launch(); p = b.new_page()
    p.goto(url, wait_until="networkidle", timeout=60000)
    p.wait_for_timeout(4000); p.mouse.wheel(0, 20000); p.wait_for_timeout(3000)  # 지연로딩 배너
```
스크롤을 안 내리면 아래쪽 배너가 DOM 에 안 들어온다.

**함정 3 — 「메인에서 링크가 사라졌다」와 「상품이 숨겨졌다」는 다른 얘기다.** 둘 다 재야 한다. 상품 상세 URL 에 직접 접속해 **status 와 판매가 노출**을 확인한다. 메인 링크가 0이어도 상세가 200이면 검색·외부링크로 그대로 팔린다. 반대로 상품을 숨겨도 배너에 박힌 링크는 따로 살아 있다.

## 무료 한도 장부가 두 군데 있다 — 엔진이 「비었다」고 거짓 보고했다 (claude-22, 2026-11-01 10시)

`node route.mjs quota` 가 **11월 Metricool 을 0/20 으로 찍고 있었다. 실제로는 20/20 꽉 찬 달이다.** 원인 둘:

1. **장부 파일이 두 종류인데 한쪽만 읽었다.** 실제 예약을 건 세션은 `quota/<tool>-<month>.json`(`metricool-2026-11.json`, `{tool, month, used, posts[]}`)에 적는데, `lib/quota.mjs` 는 `quota/<month>.json`(`{month, used:{}, log:[]}`)만 읽었다. 그 파일은 없으니 전부 0.
2. **달 인자를 빼면 `undefined.json` 을 읽어 0/20 을 찍었다.** 「■ undefined 사용량」이 나오면 그 숫자는 전부 거짓이다.

**왜 위험한가:** `plan` 이 `Q.left()` 로 자리를 계산한다. 꽉 찬 달을 「12건 남음」으로 보고 8편을 더 깔았다. 발행자가 그대로 믿고 돌리면 Metricool 에서 거부되거나 기존 예약을 밀어낸다.

고친 것(`lib/quota.mjs` + `route.mjs quota`):
- 두 장부를 다 읽고 도구별로 **큰 쪽**을 쓴다. 적게 세는 쪽으로 틀리면 한도를 넘기니까
- 달을 안 주면 이번 달. `YYYY-MM` 아니면 거부하고 종료
- 출력에 **어느 장부에서 읽었는지**와 `← 꽉 찼습니다` 를 같이 찍는다

```
metricool   ████████████████████ 20/20  [metricool-2026-11.json] ← 꽉 찼습니다
uploadpost  ···················· 0/10  [장부 없음]
```

**`[장부 없음]` 은 「안 썼다」가 아니라 「모른다」는 뜻이다.** 예약을 걸었으면 `quota/<tool>-<month>.json` 을 반드시 만들어야 다음 세션이 속지 않는다.

## 쿼리형 상세 URL 은 껍데기가 나온다 — 「숨겨졌다」 오판의 원인 (claude-22, 2026-11-01)

슬러그 함정의 짝이다. `product/detail.html?product_no=20` 은 **status 200 인데 장바구니·바로구매 버튼이 DOM 에 없다.** 이걸로 재면 「숨겨졌다/못 산다」는 잘못된 결론이 난다. 같은 상품을 **슬러그 URL** 로 들어가면 버튼이 둘 다 있다.

버튼까지 보려면 분류 목록에서 슬러그를 줍고 그 URL 로 들어간다:
```
list.html?cate_no=74 → a[href] 중 /product/[^/]+/<상품번호>/category/ 매칭 → 그 URL 로 goto
```
판매 여부 판정은 **status 가 아니라 버튼**으로 한다. 판매가는 이미지일 수 있어 텍스트로 안 잡히면 「모름」으로 적는다.

**node ESM 보완(위 함정 2):** scratchpad 에서도 **절대경로 + default import** 로는 된다. playwright 는 CJS 라 named import 가 깨진다:
```js
import pw from '/opt/npm-tools/node_modules/playwright/index.js'; const { chromium } = pw;
```
(`npm root -g` 가 아니라 `/opt/npm-tools/node_modules` 다. `node -e "console.log(require.resolve('playwright'))"` 로 확인한다)

---
## ⛔ 정정 — 바로 위 「쿼리형 상세 URL 은 껍데기」는 **틀렸습니다** (claude-22, 2026-11-01 11시)

11시에 같은 걸 **클래스 선택자**로 다시 재서 뒤집었습니다. 쿼리형 URL 도 버튼이 **있습니다.**

```
상품 33 쿼리형: ADD TO CART 2 · BUY NOW 6 · 네이버페이 5  ← 다 있다
상품 35 쿼리형: ADD TO CART 2 · BUY NOW 6 · 네이버페이 5  ← 슬러그형과 같다
```

**진짜 원인은 URL 이 아니라 「한글로 찾은 것」입니다.** 이 몰의 구매 버튼은 **영문**입니다 —
`ADD TO CART` · `BUY NOW` · `네이버페이 구매하기`. 「장바구니」·「바로구매」로 grep 하면
버튼이 **멀쩡히 있는데도 0 으로 잡히고** 「못 산다/숨겨졌다」는 오판이 납니다.

### 판매 가능 여부 판정은 이렇게 한다 — 보이는 버튼 수를 센다
`querySelector_all` 로 세면 숨은 것까지 세어 또 오판한다. **getBoundingClientRect + computedStyle** 로 거른다:
```python
btns = p.eval_on_selector_all("[class*=actionCart],[class*=btnSubmit],[class*=npay_btn]",
  """es=>es.filter(e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);
     return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';})
     .map(e=>(e.innerText||'').trim())""")
```
11시 실측 — 같은 방법, 같은 뷰포트(1440×900), 스크롤 600px 후:
| 상품 | 보이는 구매버튼 | 판정 |
|---|---|---|
| 35 선글라스 | **7개** (ADD TO CART·BUY NOW·네이버페이) | 살 수 있다 |
| 20 음식물처리기 | **0개** (`soldout displaynone`, 네이버페이 요소 자체 0) | **못 산다** |

`soldout` 요소가 `displaynone` 이어도 **구매 버튼이 하나도 안 보이면 품절 상태**다. 품절 배지가
보이느냐로 판정하지 말고 **살 수 있는 버튼이 보이느냐**로 판정한다.

---
## 이미지뿐인 상세페이지는 OCR 로 금지어를 검사한다 (claude-22, 2026-11-01)

선글라스 상세(`#prdDetail`)는 **텍스트 0자 · 이미지 4장**이다. 그래서 `check` 를 돌릴 글자가 없고,
지금까지 **아무도 글자 검사를 한 적이 없었다.** tesseract 가 한국어로 깔려 있다:

```bash
tesseract --list-langs          # kor 있음
curl -s -o p1.jpg <이미지 URL>
tesseract p1.jpg - -l kor+eng   # 표준출력으로 본문
```
받은 글자를 `node route.mjs check <제품> "<본문>"` 에 그대로 넣으면 금지어·숫자 감사가 돈다.
**주의:** OCR 은 숫자를 깨뜨린다(37g→`378`, 85개→`8571`, 5.0→`5060`). `출처 확인 필요` 목록은
**대부분 OCR 쓰레기**이므로 하나씩 눈으로 걸러야 한다. 금지어(글자)는 비교적 정확하게 잡힌다.

### 함정 — 부정문이 금지어로 잡힌다
선글라스 상세 OCR 에서 `방수` 1건이 걸렸는데 문맥은
「**방수 등급을 받은 제품이 아니므로** 비를 맞거나 물에 담그지 마세요」 = **규정을 지킨 부정문**이다.
게이트는 글자만 본다. **`check` 가 찍어 주는 `… where` 문맥을 읽고 판정**한다. 부정문을 고치면 안 된다.

---
## 함정 — 계획 파일의 `caption` 전체를 `check` 에 넣으면 터치톡은 반드시 걸린다 (claude-22, 2026-11-01)

`out/plan-touchtok-*.json` 의 4편을 `caption` 으로 검사하면 **전부 「치료」 위반**으로 나온다.
그런데 계획 파일 자신은 `gate: "pass"` 다. **모순이 아니다.**

`route.mjs` 는 `caption = body + mustInclude(법정 고지문)` 으로 만들고, 게이트는 **`body` 만** 본다
(route.mjs 88~91행 주석). 고지문 「질병의 예방 및 **치료**를 위한 의료기기가 아니며…」가
금지어 `치료` 를 품고 있어서다. 고지문은 법 정본이라 고칠 수 없다.

→ 계획을 재검사할 때는 **`caption` 이 아니라 `first3s` + 본문**으로 검사하거나, 계획 파일에 이미 있는
`gate` 값을 믿는다. `caption` 으로 재검사해서 「위반 4건」이라고 보고하면 **거짓 경보**다.

---
## 한도 장부의 `planned` — 「잡아둔 자리」는 셈에 넣되 **주인에게서는 빼지 않는다** (claude-22, 2026-11-01 11:40)

`quota/<tool>-<month>.json` 에 `used` 와 별도로 `planned`(예약은 아직 안 걸었지만 잡아둔 자리)가
들어오기 시작했다. 엔진이 `used` 만 읽으면 **잡아둔 자리를 빈 자리로 보고 겹쳐 예약**한다.
(11-01 터치톡: `used 0 · planned 8` → 엔진은 `0/10` = 열 자리 비었다고 보고. 실제 여유는 2건)

**고칠 때 밟는 함정이 있다. 내가 밟았다.** `planned` 를 `left()` 에서 **전역으로** 빼면
**주인이 자기 자리를 자기가 막는다**: 터치톡을 다시 `plan` 하면 4편이 **1편으로 잘리고**
`out/plan-touchtok-*.json` 이 그대로 덮어써진다(T2~T4 소실).

올바른 모양:
```
left(month, tool)                      = 한도 - used            ← planned 를 빼지 않는다
plannedByOthers(month, tool, exceptPid) = planned 중 pl.p !== exceptPid 인 것만
plan 에서: reserved = Math.max(plannedElsewhere(out/ 기준), plannedByOthers(장부 기준))
```
`plannedElsewhere`(out/ 계획 파일로 셈)와 장부 `planned` 는 **같은 자리**를 가리킨다.
**더하면 두 번 센다 → 큰 쪽을 쓴다.**

보고에서는 숨기지 않고 둘을 나눠 찍는다: `uploadpost ▒▒▒… 8/10 (쓴 것 0 + 잡아둔 자리 8)`,
`▒` = planned. 「8/10」만 보면 쓴 것으로 오해하므로 괄호 설명을 반드시 같이 찍는다.

**엔진 고친 뒤 꼭 돌리는 시험 3개** (scratchpad 사본에서. `out/` 을 건드리면 안 된다):
1. 자리 주인 재계획 → **편 수가 줄지 않아야** 한다 (`plan touchtok 2026-11 1 4` → 4편·남김 2)
2. 다른 제품이 같은 도구를 쓰려 함 → **남의 자리가 지켜져야** 한다 (`plannedByOthers(except 남) = 8`)
3. 꽉 찬 달 → **0편에서 차단**되어야 한다 (`plan raytok-glass 2026-11` → ⚠ 0편)

---

## 이미지뿐인 상세페이지를 규정 검사하는 전체 절차 (11-01 13시 · claude-22)

렌더용 HTML 이 레포에 같이 있으면 **OCR 보다 HTML 쪽이 정확하다.** OCR 은 숫자가 깨진다
(`R-R-PNLE-RT-18G` → `0-0-0446-07-186`, `YU102612` → `10102612`). 순서:

```bash
# 1) HTML 에서 보이는 글자만 뽑는다 (script·style 먼저 지운다)
python3 -c "
import re,html
s=open('img/d3/page.html',encoding='utf-8').read()
s=re.sub(r'<(script|style)[^>]*>.*?</\1>','',s,flags=re.S|re.I)
print(re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',s))).strip())
" > /tmp/t.txt
# 2) 게이트
node route.mjs check raytok-glass "$(cat /tmp/t.txt)"
```

**게이트 통과 ≠ 안전.** 금지어 검사는 **낱말**만 본다. 다음 세 가지는 엔진이 절대 못 잡으므로
**정본 문서와 눈으로 대조**해야 한다:

1. **낡은 숫자** — 원고와 사양정본이 어긋나는 칸. v3 에서 7칸이 달랐다
   (안전확인신고 X/Y 한 글자 · BT 5.4/5.0 · 자외선 99.9%/UV400 · 파우치 포함/불포함 ·
   크기 · 프레임 소재 · 재생시간). **박스 실물 = 법정 표시가 최상위**다
2. **빠진 고지문** — 원고의 `※` 문장이 디자인 과정에서 조용히 사라진다. v3 는
   「음성 안내는 기기 설치 언어에 한함」이 통째로 빠져서 **「85개 언어」+「들립니다」만 남았다**
   = 1028 원고 §4 금지표의 「82개 언어 음성 지원」과 같은 모양. 원고의 `※` 를 **목록으로 만들어
   하나씩 대조**하라
3. **조건이 떨어진 단정문** — `문구기준_번역주체_1021` 의 ✗/✓ 표가 기준이다.
   「폰 안에서 번역」은 **✗**, 「없으면 서버가 번역합니다(인터넷 필요)」가 붙어야 **✓**

### 렌더된 이미지에 법정 표기가 실제로 들어갔는지 확인
HTML 에 있어도 **렌더가 바닥에서 잘릴 수 있다.** 두 숫자를 비교한다:

```bash
# HTML 전체 높이
node -e "import('/opt/npm-tools/node_modules/playwright/index.js').then(async({default:pw})=>{
 const b=await pw.chromium.launch(),p=await b.newPage({viewport:{width:900,height:1000}});
 await p.goto('file:///절대경로/page.html'); await p.waitForTimeout(1500);
 console.log(await p.evaluate(()=>document.body.scrollHeight)); await b.close();})"
# JPG 4장 높이 합
python3 -c "
from PIL import Image;import glob
print(sum(Image.open(f).size[1] for f in sorted(glob.glob('RT18G_v3_*.jpg'))))"
```
차이가 **100px 안쪽이면 바닥 여백**이다(v3: 8,253 vs 8,219 = 34px → 잘린 것 없음).
그래도 **마지막 JPG 바닥은 반드시 OCR 로 눈으로 확인**한다 — 어두운 배경의 작은 흰 글자는
그냥 OCR 하면 통째로 안 읽힌다. **잘라서 3배 확대 + autocontrast** 하면 읽힌다:

```python
from PIL import Image, ImageOps
im=Image.open('RT18G_v3_4.jpg').convert('L')
c=im.crop((0,1930,860,2124)).resize((860*3,194*3),Image.LANCZOS)
ImageOps.autocontrast(c).save('/tmp/f.png')   # tesseract /tmp/f.png stdout -l kor --psm 6
```

### 함정 — 커밋 제목을 믿지 말고 참조를 센다
「렌즈 교체 GIF 삽입」 커밋에 `lensswap.gif`(3.5MB)가 들어왔는데 **HTML 참조는 0건**이었다.
`grep -c lensswap page.html` 한 번이면 잡힌다. 그리고 **정지 JPG 안에 GIF 는 담기지 않는다** —
움직이는 것은 쇼핑몰 상세 본문에 **따로 올리는 길**밖에 없다.

### 함정 — 렌더용 HTML 을 쇼핑몰에 올리지 않는다
`img/d3/page.html` 은 글꼴을 **컨테이너 로컬 경로**(`/root/.fonts/Pretendard-*.otf`)로 부른다.
그대로 올리면 글꼴이 깨지고, 그 폴더가 없는 컨테이너에서 다시 렌더하면 **줄바꿈 위치까지 달라져**
전과 다른 이미지가 나온다. 올릴 것은 항상 **렌더된 JPG**. 글꼴이 없으면 **재렌더를 떠맡지 말고
원래 만든 세션에 넘긴다.**

### Playwright 가 `Cannot find package` 로 죽을 때
이 컨테이너의 playwright 는 `/opt/npm-tools/node_modules` 에 있고 **ESM 은 `NODE_PATH` 를 안 본다.**
또 CommonJS 라 named import 도 안 된다. 되는 꼴은 하나다:
```js
import pw from '/opt/npm-tools/node_modules/playwright/index.js'; const { chromium } = pw;
```

### 참고 수치 — 쇼핑몰 상세 이미지 목표치
선글라스 v3: 860px 폭 · JPG 4장 · 총높이 8,219px · 합계 **0.55MB**(장당 약 140KB).
기존 d2 는 18,405px 였으니 **분량이 55% 줄었다.** 상세 이미지는 **장당 150KB 선**이 현실적이다.

### detached HEAD — push 가 거절될 때 「pull 하라」는 말을 믿지 말 것 (11-01 13시 · claude-22)
smartever 가 다섯 번 밟은 그 함정의 **뒷면**이다. detached HEAD 에서 커밋하면:
- `git pull --rebase origin main` → **「HEAD is up to date」** (맞는 말이다. HEAD 는 최신이다)
- `git push origin main` → **거절.** `origin main` 은 **detached HEAD 가 아니라 로컬 `main` 브랜치 ref**
  를 밀기 때문이고, 그 `main` 은 묵은 상태(`ahead 57, behind 50`)였다

`git rev-list --left-right --count HEAD...origin/main` 이 `1 0`(앞섰고 뒤처진 것 없음)인데도
거절되면 **이 경우가 확실하다.** 고침은 한 줄:
```bash
git checkout -B main && git push origin main     # 커밋한 HEAD 로 브랜치를 옮긴다
```
pull 을 반복하거나 `--force` 를 쓰면 안 된다. **먼저 `git branch -vv` 로 `* (HEAD detached` 인지 본다.**

### 글꼴이 없어서 렌더를 못 할 때 — 받아올 수 있다 (11-01 16시 · claude-22)
13시에 「`/root/.fonts/` 가 없으니 재렌더는 만든 쪽에 넘긴다」고 적었는데 **틀렸다.**
Pretendard 는 npm 패키지로 있다. 외부 사이트 다운로드가 아니라 패키지 레지스트리다:
```bash
npm pack pretendard && tar xzf pretendard-*.tgz
mkdir -p /root/.fonts
cp package/dist/public/static/Pretendard-{Regular,Medium,SemiBold,Bold}.otf /root/.fonts/
```
**받은 뒤 바로 믿지 말고 증명한다.** 손대기 전 판(`git show <커밋>:<파일>`)을 그대로 렌더해서
지금 올라가 있는 이미지와 **높이가 1px도 안 틀리는지** 본다. 틀리면 글꼴이 다른 것이다.
선글라스 v3 에서 이 방법으로 8,219px 일치 + 픽셀 평균 오차 0.85(JPEG 자국뿐)를 확인하고 진행했다.

### 자르는 자리는 사람이 찍지 말고 찾게 한다
네 등분 지점을 그냥 쓰면 **그림을 물고 잘린다.** 실제로 렌즈 3컷 아래 4px 을 물었다.
등분 지점 ±320px 안에서 두 조건을 다 만족하는 가로줄만 고른다:
1. 그 줄과 위아래 1줄에 **글자 점이 0개** (행 중앙값에서 20 넘게 벗어난 픽셀 수 = 0)
2. `<img>` 구간(±4px) 에 걸치지 않음 — 그림 위치는 렌더할 때 `getBoundingClientRect` 로 받아 둔다

`tools/render-detail-d3.mjs` 가 렌더·자르기·용량 맞추기(장당 150KB 선)까지 한 줄로 한다.
**글꼴이 없으면 렌더하지 않고 멈추고 받는 법을 찍는다** — 조용히 다른 글꼴로 나가는 게 제일 위험하다.

### 실사 영상을 GIF 로 쇼핑몰에 올리지 않는다 — 숫자
`lensswap.gif` 680×383·54프레임 = **3.5MB.** ffmpeg 로 깎아 봤다:

| 설정 | 크기 |
|---|---|
| 12fps · 600px · 96색 | 3.9MB (더 커졌다) |
| 8fps · 520px · 64색 | 2.0MB |
| 6fps · 480px · 48색 | **1.2MB** (여기서 화질이 눈에 띄게 깨진다) |

실사는 프레임마다 화면이 다 바뀌어 GIF 의 프레임간 압축이 먹지 않는다.
**정지 3컷 + 번호 캡션**(「1. 뗍니다 / 2. 끼웁니다 / 3. 5초면 끝납니다」)이 가볍고 설명도 더 된다.
움직임이 꼭 필요하면 GIF 가 아니라 영상으로 올린다.

### 상세 HTML 글자를 게이트에 넣을 때
`route.mjs check <제품> "<문구>"` 는 **문구를 인자로 받는다.** `--file=...` 같은 건 없다 —
그렇게 주면 그 문자열 자체를 검사하고 **「✓ 금지어 없음」이 멀쩡히 나온다.** 통과한 줄 알고 넘어가기 쉽다.
```bash
python3 -c "import re,html,sys; s=open(sys.argv[1],encoding='utf-8').read(); \
s=re.sub(r'<(script|style)[^>]*>.*?</\1>','',s,flags=re.S); s=re.sub(r'<[^>]+>',' ',s); \
print(html.unescape(re.sub(r'\s+',' ',s)).strip())" img/d3/page.html > /tmp/t.txt
node route.mjs check raytok-glass "$(cat /tmp/t.txt)"
```

---
## 상세 이미지에서 「검색엔진이 읽을 글자」 만드는 법 (claude-22, 11-01 17시)

쇼핑몰 상세가 이미지뿐이면 네이버·구글이 읽을 글자가 0자다. 새로 쓰지 말고 **렌더 원고 HTML 에서 뽑는다** — 그러면 이미지와 글자가 어긋나지 않는다.

- 순서: `<style>`·`<script>` 먼저 통째로 지운다 → `h1/h2/h3` 앞에 표시를 심는다 → 닫는 태그를 줄바꿈으로 → 남은 태그 제거 → `&nbsp;` 등 엔티티 되돌리기 → 줄별 공백 정리 → **연속 중복 줄 제거**(렌더 원고엔 같은 글자가 두 번 들어간 자리가 있다)
- **표가 제일 잘 틀어진다.** `</th><td>` / `</td><td>` 를 먼저 ` : ` 로 바꾸지 않으면 「소리 방식공기전도 개방형」처럼 항목과 값이 붙어 나온다. 한 번 밟았다. `<td>` 만 처리하면 `<th>` 가 남으니 **둘 다** 넣어야 한다
- 뽑은 뒤 반드시 `node marketing/route.mjs check <제품>` 을 돌린다. 이미지로 통과한 원고라도 글자로 꺼내면 게이트를 다시 받아야 한다
- 글자수는 **세어서 적는다.** 눈대중으로 적었다가 16시 보고에서 3,394자라고 틀렸다 — 실제 1,715자(공백 포함)였다

## 함정: `_common-forbidden.json` 을 grep 으로 훑으면 거짓 양성이 난다 (claude-22, 11-01 17시)

이 파일에는 금지어 목록만 있는 게 아니라 **`allowed_instead` (바꿔 쓸 말)** 도 들어 있다. JSON 전체에서 따옴표 안 문자열을 긁어 대조하면 **권장어가 금지어로 잡힌다** — 「공기전도」(골전도의 대체어)가 걸려서 한 번 놀랐다. 판정은 항상 `route.mjs check` 로 한다. 직접 grep 은 참고용으로만.

## 함정: detached HEAD 에서 `push origin main` 은 「원격보다 뒤처졌다」고 거짓말한다 (claude-22, 11-01 17시 · 일곱 번째 재발)

클론이 detached HEAD 면 커밋은 **아무 가지에도 안 붙는다.** 이때 `git push origin main` 은 내 새 커밋이 아니라 **낡은 로컬 `main` 가지**를 밀려고 해서 `non-fast-forward … behind its remote` 가 뜬다. `pull --rebase` 를 해도 그대로다 — 뒤처진 게 아니라 **엉뚱한 걸 밀고 있는 것**이기 때문이다.

푸는 순서:
```bash
git branch --show-current          # 빈 줄이면 detached
git merge-base --is-ancestor origin/main HEAD && echo 안전   # 남의 커밋을 덮지 않는지 먼저 확인
git push origin HEAD:main          # 가지 이름 대신 HEAD 를 지정해 민다
git checkout -B main origin/main   # 그 다음에 정상화
```
**`--force` 는 쓰지 않는다.** `--is-ancestor` 가 통과하면 force 없이 그냥 들어간다. 통과하지 않으면 상대 커밋이 사이에 있는 것이니 rebase 부터 한다.

## 카페24 상세 이미지는 `src` 가 아니라 `ec-data-src` 에 있다 (smartever, 11-01 17시)
비로그인 curl 로 상품 페이지를 받으면 상세 이미지는 지연로딩이라 `src` 에 안 나온다. `src` 만 긁으면 썸네일·아이콘만 잡힌다.
```bash
grep -oE 'ec-data-src="[^"]+"' p.html | sed 's/ec-data-src="//;s/"$//' | awk '!s[$0]++'   # 문서 순서 유지 + 중복 제거
```
`sort -u` 를 쓰면 **페이지 순서가 깨진다** — OCR 결과를 원고처럼 이어 붙일 거면 `awk '!s[$0]++'` 로.

## `route.mjs check` 는 법정 고지문을 면제하지 않는다 (smartever, 11-01 17시)
`plan` 은 body 만 검사해서 고지문 속 「치료」를 넘기지만, `check` 는 받은 문구 전체를 본다. 그래서 `touchtok.json` 의 `mustInclude` 문장을 그대로 넣어도 「치료」로 ✗ 가 뜬다.
본문 판정은 고지문 줄을 빼고 한 번, 빠진 필수 표기 확인은 넣고 한 번 — 두 번 돌린다: `node route.mjs check touchtok "$(grep -v '^\[안내\]' 본문.txt)"`

## 상세 이미지 OCR: 1200px 타일 + 정상/반전 둘 다 (smartever, 11-01 17시)
세로 5000px 짜리 통이미지는 통째로 넣으면 글자를 거의 놓친다. 1200px 로 잘라 2배 확대 → 정상·반전 각각 autocontrast → `-l kor+eng --psm 6`. 두 결과 중 한글 비율 높은 줄만 남기면 원고에 가깝다. 제목처럼 큰 글씨·숫자 접두(「C 복합체」「펩타이드 7」)는 OCR 이 자주 틀리니 크롭해서 눈으로 확인할 것.

## `check` 를 `plan` 과 같은 판정으로 맞췄다 — 두 번 돌릴 필요가 없다 (claude-22, 11-01 18시)

smartever 가 17시에 올린 「`check` 는 고지문을 면제하지 않는다」를 **엔진에서 고쳤다.** 이제 한 번만 돌린다.

예전에는 같은 문구를 두 번 돌려야 했고 **두 번 다 거짓 신호**가 떴다:

| | 고지문 넣고 | 고지문 빼고 |
|---|---|---|
| 금지어 | ✗ 「치료」 (고지문 속 글자 — 고칠 수 없는 정본) | ✓ |
| 필수 표기 | — | ✗ 「빠진 필수 표기」 (실제로는 넣을 예정) |

고친 내용 두 가지:
- `stripRequired(text, product)` 신설 — `mustInclude` 고지문을 본문에서 떼어낸다. `check` 는 **뗀 본문**으로 금지어를 보고, **받은 전문**으로 필수 표기를 본다. `plan` 이 하던 것과 같다
- `auditRequired` 가 **머리 20자 `includes`** 였던 것을 공백에 느슨한 전문 대조(`\s+`)로 바꿨다. 머리 20자 **안에** 줄바꿈이 떨어지면 들어 있는 고지문도 「빠짐」으로 떴다 — 캡션·상세는 줄바꿈이 섞이니 실제로 밟는다

```bash
# 이제 이렇게 한 번
node route.mjs check touchtok "$(cat assets/seo/touchtok_올인원패스_본문.txt)"
#   ✓ 금지어 없음
#   법정 고지문 1건 떼고 검사했습니다: [안내] 본 제품은 질병의 예방 및 치료를 위한 의료기…
#   ✓ 필수 표기 들어 있음
```

`plan` 출력은 **바뀌지 않는다.** 옛 코드·새 코드로 세 제품 계획을 각각 생성해 `diff -r` 로 대조했다 — 완전히 같다.

### 회귀는 `out/` 에서 돌리지 말고 사본에서 돌린다 — 밟았다
계획 파일을 되돌릴 작정으로 `plan` 을 다시 돌렸다가 **세 파일을 다 날렸다.** 두 가지가 겹쳤다:
1. smartever 가 적어 둔 요일 인자 함정 — `plan raytok-glass 2026-11` 로 인자를 빼면 `perWeek 2 · 화금` 으로 다시 깔린다. 기록된 값은 `1 5`(금)·app `1 2`(화)·터치톡 `1 4`(목)
2. **metricool 장부가 20/20 꽉 차 있으면 `plan` 은 0편을 뱉는다.** 꽉 찬 뒤에 재생성하면 계획이 통째로 빈다 — 함정이 아니라 정상 동작이라 경고가 안 뜬다

`git checkout -- marketing/out/` 로 되돌렸다. **앞으로 회귀 대조는 `marketing` 을 스크래치패드에 두 벌 복사하고, 그 사본의 장부를 `used:0 · posts:[] · planned:[]` 로 비워서 돌린다.** 장부를 비우지 않으면 양쪽 다 0편이 나와 「같다」가 아무 뜻이 없다.

### 터치톡 17시 지적 4건 중 게이트가 잡는 것은 2건 (claude-22, 11-01 18시)
`node route.mjs check touchtok "<문구>"` 로 하나씩 넣어 본 결과:

| 문구 | 게이트 |
|---|---|
| 「즉각 쿨링 제형」 | ✗ **잡는다** — 「즉각」 |
| 「모공 수축」 | ✗ **잡는다** — 바꿔 쓸 말 「일시적 모공 조임」 까지 나온다 |
| 「임상실험으로 입증된 효과적인」 | ✓ 통과 — **못 잡는다** |
| 「모든 피부 타입」 | ✓ 통과 — 못 잡는다 |
| 「피부 깊숙이 전달」 | ✓ 통과 — 못 잡는다 |
| 「부기 완화」 | ✓ 통과 — 못 잡는다 |
| 「제품 사용 전 / 대조군 사용 후」 | ✓ 통과 — 라벨 짝은 글자 검사로 잡을 수 없다 |

**금지어 목록을 내가 임의로 늘리지 않았다.** `_common-forbidden.json` 은 두 브랜드가 같이 쓰는 법 기준 파일이고, 「입증」 같은 말은 실증자료가 있으면 쓸 수 있어 막으면 멀쩡한 문구까지 걸린다. 대표님 판단으로 올린다.

---
**2026-11-01 19시 · smartever** — 클론이 detached HEAD 로 열리는 일이 세 번째. `git pull --rebase` 직후 `git status | head -1` 로 `On branch main` 인지 먼저 보고, 아니면 `git checkout main && git reset --hard origin/main` (로컬 변경 없을 때만). 원격이 force-push 되면(`(forced update)` 표시) 재발하는 것으로 보임.
## Metricool 에 실제로 걸린 예약 문구를 게이트에 넣을 수 있다 (2026-11-01 claude-22)
`out/` 계획만 보고 「발행 예정이 깨끗하다」고 하면 안 된다. **계획과 실제 예약은 다른 물건이었다** —
날짜도 문구도 달랐고, 실제 예약 쪽에만 금지어가 있었다.

```
mcp__metricool-social__getScheduledPosts(brandId=<장부의 brandId>,
  fromDate=2026-11-01T00:00:00+09:00, toDate=2026-11-30T23:59:59+09:00, timezone=Asia/Seoul)
```
- `text` 가 **캡션 전문**이다. 그대로 `node route.mjs check <제품> "<text>"` 에 넣는다
- `providers[].status: PENDING` + `autoPublish: true` = **사람이 안 보고 그 시간에 나간다.** 이게 제일 급한 줄이다
- `mediaAltText` 도 같이 본다. 본문엔 없는 단정문이 대체텍스트에 들어가 있을 수 있다
- 브랜드 계정이 두 브랜드를 같이 쓰면 **제품을 날짜로 갈라야** 한다. 캡션의 해시태그·모델명으로 가린다

## 이미지 매핑은 OCR 로 한 번 확인하라 — 파일명을 믿지 마라 (2026-11-01 claude-22)
`products/*.json` 의 `images.<hookId>` 가 **파일명만 맞고 내용은 다른 훅**일 수 있다.
`sns_a_b1_lang.jpg` 는 이름은 b1 인데 카드 내용이 B4(「직접 만든 85개 언어」+ RayPac 상표번호 40-2026-0229441)였다.
→ 캡션은 B1(「구글 번역 안 됨」), 카드는 B4. **한 장에 다른 말 두 개가 나갈 뻔했다.**

- 확인: 3배 확대 + `ImageOps.autocontrast` 후 `tesseract -l kor --psm 6`. 상표·특허 **번호**가 제일 좋은 지문이다
  (`facts.trademark` 와 맞춰 보면 어느 제품·어느 훅 카드인지 바로 갈린다)
- 고칠 때 **파일명은 건드리지 말고 매핑만 옮긴다.** 이미 올라간 게시물이 그 URL 을 쓸 수 있다

## 한도가 꽉 찬 달에 계획 한 편만 고치는 법 (2026-11-01 claude-22)
`plan` 을 다시 돌리면 **0편**이 나온다(`available = left - reserved` 가 음수). 그래서:
1. `marketing/` 을 사본으로 복사 → 사본의 장부에서 `used=0, posts=[]`, 다른 제품 `out/` 삭제
2. 사본에서 `plan` 실행 → **엔진이 만든 진짜 항목**을 얻는다
3. 고칠 편 **하나만** 라이브 `out/` 에 끼워 넣고, **나머지 편이 사본과 바이트 동일한지 먼저 증명**한다
   (`sb['plan'][1:] == lv['plan'][1:]` 가 False 면 손대지 않고 멈춘다)
4. `quota` 블록은 생성 당시 값이라 지금 장부와 다르다 — `$note` 로 적어 둔다

## 금지어는 「같은 뜻 다른 말」로 그냥 새어 나간다 (2026-11-01 claude-22)
게이트는 부분문자열 대조라 **바꿔 쓴 말을 못 잡는다.** 실제로 밟은 자리:
- 「인터넷 없이」는 통지로 뜨는데 **「비행기 모드로 켜도 번역됩니다」는 아무것도 안 뜬다** — 같은 주장이다
- 「구글 번역에 네팔어 입력 → 안 됨」도 통과했다 (경쟁사 실명 비교인데)
→ 훅·카피를 새로 쓸 때 **금지어 목록의 각 항목마다 「이걸 다른 말로 하면?」을 한 번 적어 보고**
   제품 단위 `forbidden.notice` 에 넣는다. 공용 `_common-forbidden.json` 은 두 브랜드가 쓰니 손대기 전에 inbox 로 알린다.

### 2026-11-02 · smartever — `check` 에 캡션 여러 편을 이어 붙이면 고지문 오탐
- 4편 캡션을 한 문자열로 붙여 `node route.mjs check touchtok "..."` → **✗ 「치료」**. 한 편씩 넣으면 4/4 ✓
- 원인: `stripRequired` 가 `body.replace(looseRe(n), ' ')` 로 **첫 1건만** 뗀다. 둘째 편의 고지문 속 「치료」가 남는다
- 요령: **캡션은 한 편씩** 검사한다 (`for i in 0 1 2 3; do node route.mjs check <제품> "$(node -e "...plan[$i].caption")"; done`)
- 상세페이지처럼 한 문서 안에 고지문이 두 번 들어가는 경우도 같은 오탐이 날 수 있다
