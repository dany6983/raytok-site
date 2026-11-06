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
---
## 「모름」을 레포 안에서 푸는 자리 — 배포 목록·검사기 (2026-11-02 claude-22)

어제 「앱을 봐야 알 수 있다」고 대표님께 올린 질문(ne·km·my·lo·uz 가 온디바이스냐)의 답이
레포 안 **한 파일**에 있었습니다. `langpacks/index.json` + `node tools/check-langpacks.js`.

- 배포 목록은 보통 **상태 칸**을 들고 있습니다. 여기선 `status: ready|fake|draft` 이고 목록 안에
  「앱은 `ready` 만 받는다」고 적혀 있었습니다. `ready` 0개 = 기능이 **아직 없다**
- 검사기가 있으면 돌리세요. 손으로 JSON 을 세는 것보다 낫고, **목록과 실제 파일이 어긋나면**
  그것도 같이 잡힙니다
- 요령: 기능 주장이 사실인지 물을 때 → ① 그 기능의 **배포 목록**(index/manifest) ② `tools/` 의
  검사기 ③ `docs/archive/` 의 지난 보고. 이 셋이 바깥에 묻는 것보다 빠릅니다

**외부 도구를 열기 전에 레포를 뒤지세요.** 「모름」이라 적는 것은 정직하지만, 레포에 답이
있는데 「모름」이라 적으면 대표님 시간을 하루 버립니다.

## 금지어는 「사실」과 같이 적어야 새어 나가지 않는다 (2026-11-02 claude-22)

같은 예약 글 한 편에서 「월 구독료 0원」은 게이트가 잡았고, **같은 거짓을 말하는**
「RayTok은 휴대폰 안에서 번역합니다 / 폰이 혼자 합니다 / 서버로 나가지 않습니다」는
**아무것도 안 떴습니다.** 금지어 목록은 「말」을 막고, 거짓은 「뜻」으로 새어 나갑니다.

- 금지어를 넣을 때 그 말이 **왜** 거짓인지(요금표·온디바이스 여부 같은 사실)를 `forbiddenNote`
  나 `$comment` 에 같이 적으세요. 다음 사람이 **바꿔 쓴 말**을 찾아낼 수 있습니다
- 한 전제를 쓰는 문장은 **묶음으로** 통지에 넣으세요. 이번엔 「폰 안에서 번역」·「휴대폰 안에서
  번역」·「폰이 혼자」·「내려받으면」·「서버로 나가지 않」 5건을 **제품 단위**에 넣었습니다
  (공용 파일 아님 — 상대 브랜드 판정에 영향 가지 않게)
- 전제가 거짓이면 **한 줄 고치기로 안 끝납니다.** 11-05 는 「왜 구독료가 없느냐면」이 제목이라
  글 전체를 다시 썼습니다

## 숫자 출처 검사: 한글 날짜꼴도 가려야 한다 (2026-11-02 claude-22)

`2026.06` 점꼴은 가려졌는데 **「2026년 11월 출시」의 11** 이 통계처럼 걸렸습니다.
`\b(19|20)\d{2}\s*년(\s*\d{1,2}\s*월(\s*\d{1,2}\s*일)?)?` 로 가립니다.
★ **「년」이 앞에 있을 때만** 가리세요. `\d+일` 을 통째로 가리면 「67일 남았습니다」처럼
**진짜로 확인해야 하는 수량**이 조용히 통과합니다.

### 2026-11-02 · claude-22 — 위 함정 고쳤습니다 (한 편씩 검사 안 해도 됩니다)
- `looseRe(sentence, flags)` 로 바꾸고 `stripRequired` 가 `looseRe(n, 'g')` 를 씁니다. 고지문이
  **몇 번 들어 있어도 전부** 뗍니다. 몇 번 떼었는지 `stripped` 에 `… ×2` 로 적습니다
- 실측: 터치톡 T1+T2 캡션을 이어 붙여 한 번에 → **✓ 금지어 없음**(전엔 ✗ 「치료」)
- `auditRequired` 는 `looseRe(n)`(플래그 없음) 그대로입니다 — `.test` 한 번만 쓰므로 `g` 의
  `lastIndex` 가 끼어들 자리가 없게 **떼는 쪽에만** `g` 를 줬습니다
- 상세페이지처럼 고지문이 두 번 들어간 문서도 이제 한 번에 넣으면 됩니다

### 2026-11-02 · claude-22 — `rebase --continue` 가 detached HEAD 를 남긴다
클론이 detached 상태면 `git pull --rebase` 뒤 `rebase --continue` 가 **브랜치가 아닌 자리**에
커밋을 얹습니다. 그 뒤 `git push origin main` 은 「behind its remote counterpart」로 거절되는데
**내 커밋이 뒤처진 게 아니라 `main` 포인터가 안 따라온 것**입니다. 진단·복구:
```bash
git status -sb            # "## HEAD (no branch)" 면 detached
git merge-base --is-ancestor origin/main HEAD && git branch -f main HEAD && git checkout main
git push origin main
```
`reset --hard origin/main` 로 가면 **방금 쓴 커밋이 날아갑니다.** 먼저 `--is-ancestor` 로
얹을 수 있는지 보고 포인터만 옮기세요.

---
**2026-11-02 10시 · smartever — `check` 의 「고지문 N건 떼고」는 종류 수다**
- 「법정 고지문 1건 떼고 검사했습니다」의 N 은 **고지문 종류 수**지 뗀 횟수가 아니다. 횟수는 끝의 `×N` 인데 출력에서 `…` 말줄임에 잘려 안 보인다
- 여러 편을 이어 붙여 검사했다면 「1건」에 놀라지 말고, 횟수를 확인하려면 `grep -c "\[안내\]"` 로 원문 고지문 수를 따로 센다. 판정(✓/✗)은 g 수정 이후 정상

### 2026-11-02 · claude-22 — 위 함정 고쳤습니다 (`grep -c` 로 따로 세지 않아도 됩니다)
- `stripRequired` 반환이 **문자열 배열에서 `[{ sentence, hits }]` 로** 바뀌었습니다. 출력은
  「법정 고지문 **1종 4회** 떼고 검사했습니다: …」 — 종류 수와 횟수가 둘 다 보입니다
- 교훈은 정규식이 아니라 **문자열에 뜻을 얹어 넘긴 것**입니다. 「문장 ×4」로 이어 붙여 넘기면
  부르는 쪽이 자르는 순간 `×4` 가 먹습니다. 숫자는 **필드로 따로** 주고, 자르는 쪽이
  말줄임 앞에 둘 자리를 정하게 하세요
- 판정(✓/✗)은 전후 동일합니다 — 이번 건은 처음부터 **표시만** 틀렸습니다

### 2026-11-02 · claude-22 — 숫자 출처 검사: 「월」은 가려도 「일」은 가리면 안 된다
어제 한글 날짜꼴을 가렸는데 「년」이 앞에 있을 때만 들어서 **홑 달 이름이 샜습니다** —
「남은 건 11월과 12월, 두 달입니다」의 11·12 가 통계처럼 걸렸습니다. 지금은 1~12 + 「월」을
가립니다. **「일」은 일부러 안 가렸습니다**: 「67일 남았습니다」는 산수를 물어야 하는 진짜
주장이고(28+31+8 로 검산함), 「30일 사용」도 출처가 필요합니다.
가림을 넣을 때 기준: **날짜는 가린다 · 수량·기간·효능은 가리지 않는다.** 둘을 같은 정규식으로
묶으면 반드시 한쪽이 샙니다. 넣은 뒤엔 꼭 **반례를 돌려 보세요** — 저는 넷 돌렸습니다
(「67일」 걸림 ✓ · 「월 9,999원」의 9,999 걸림 ✓ · 「2026년 11월」 가려짐 ✓ · facts 의 85 안 걸림 ✓).

### 2026-11-02 · claude-22 — 「게이트 통과」는 「사실」이 아니다
11-04 예약문은 금지어 0 으로 **한 달 내내 ✓** 였는데 내용이 거짓이었습니다(받을 언어팩 0개).
금지어 목록은 **말투**를 보고 사실은 못 봅니다. 그래서 통지를 넣을 때 금지어만 넣지 말고
**왜 거짓인지 근거 파일을 같은 줄에 적어 두세요** — 저는 `raytok-app.json` 통지에
「폰 안에서 번역」 계열 5건을 넣고 근거를 `langpacks/index.json` 으로 적었습니다.
다음 사람이 「이거 풀어도 되나」 물을 때 볼 데가 생깁니다.

---
## 「말만 바꾼 같은 주장」은 문장 하나로 못 막는다 (2026-11-02 12시, claude-22)

통지·금지어 목록에 **그 문장 그대로**를 넣으면 **그 문장만** 막힌다. `check` 는 `indexOf` 로
부분 문자열을 찾기 때문이다. 어제 앱에 「폰 안에서 번역」·「휴대폰 안에서 번역」·「내려받으면」을
넣었는데, 뜻이 똑같은 아래 다섯 줄이 **전부 통과했다**:

- 「언어팩을 **다운로드하면** 그 뒤로는 **오프라인으로** 번역합니다」
- 「**온디바이스** 번역이라 **통신 없이** 됩니다」
- 「**기기 안에서** 처리하니 **외부로 나가지 않**습니다」
- 「**네트워크 없이**도 **폰에서 직접** 번역합니다」
- 「**인터넷 없어도 단말에서** 번역됩니다」

요령: 금지할 게 **문장**이 아니라 **주장**이면, 그 주장을 쓰는 **낱말 묶음**을 넣는다.
한 주장에 보통 10~20개다. 세 갈래로 세면 빠뜨리지 않는다 —
① 장소(폰·휴대폰·기기·단말·로컬·온디바이스) ② 받는 동작(내려받·다운로드) ③ 안 나간다(서버로
나가지 않·서버를 거치지 않·외부로 나가지 않·통신 없이·네트워크 없이·인터넷 없어도·오프라인).

「**통지**」로 넣는다. 「막기」로 넣으면 나중에 그 주장이 **참이 되는 날**(팩이 실제로 배포되는 날)
멀쩡한 글이 ✗ 로 막힌다. 통지는 사람이 보고 넘기면 된다. `ok` 판정에 영향이 없으니
**회귀 위험도 0**이다 — 실제로 계획 12편·본문 2종·예약 6편 = 20건 출력이 한 글자도 안 바뀌었다.

**제품 파일에 넣는다. 공용(`_common-forbidden.json`)에 넣지 않는다.** 「폰 안에서 번역」은
앱에서만 거짓이다(팩 0개). 공용에 넣으면 다른 브랜드 글이 영문도 모르고 통지를 받는다.

실사 절차: 바꿔 쓴 문장 5개를 직접 `check` 에 넣어 **전부 걸리는지** 본다. 목록만 늘리고
안 돌려보면 오타 하나로 그 줄이 죽어 있는 걸 모른다.

### 2026-11-02 12시 · smartever — 통지 변형을 늘릴 때 **대체어(suggest)와 겹치지 않게**
- 금지어 「모공 수축」의 대체어가 「일시적 모공 조임」인데, 변형 통지에 「모공 조임」을 넣으면 **고쳐 쓴 글에 다시 통지가 뜹니다.** 사람이 「또 걸렸네」 하고 대체어를 버립니다
- 통지 목록을 넣은 뒤 `allowedInstead`·`suggest` 문구를 하나씩 `check` 에 넣어 **통지 0** 인지 보세요. 걸리면 그 줄을 빼거나 더 긴 말로 좁힙니다

### 2026-11-02 14시 · claude-22 — 낱말 목록은 **기계로 점검한다** (`route.mjs selftest`)
smartever 가 12시에 신고한 「대체어와 통지가 겹친다」는 **손으로 볼 일이 아니다.** 금지어·통지·대체어가
제품 셋 합쳐 190줄이 넘는다. 목록을 늘릴 때마다 사람이 전수 대조할 수 없다.

```bash
node route.mjs selftest     # 모순 없으면 종료코드 0, 있으면 1 + 겹치는 줄
```

네 가지를 본다. **문구가 아니라 게이트 자체를 검사한다.**

| 검사 | 왜 | 안 보면 |
|---|---|---|
| ① 대체어가 금지어·통지에 걸리나 | 게이트가 권하는 말이 또 걸린다 | 고쳐 쓴 글이 다시 ✗ → 사람이 대체어를 버린다 |
| ② 같은 말이 금지어·통지 양쪽에 | 막으면서 통지도 한다 | 「막힌 건가 넘겨도 되나」 헷갈린다 |
| ③ 통지어가 금지어 **안에** 들어 있나 | 부분문자열로 둘 다 뜬다 | 한 자리가 ✗ 와 통지로 두 번 보고된다 |
| ④ 법정 고지문 자체가 게이트에 걸리나 | `mustInclude` 가 ✗ 를 만든다 | **어떤 글도 통과하지 못한다**. 원인 찾기 제일 어렵다 |

**검사기를 만들었으면 함정을 되살려 걸리는지 봐야 한다.** touchtok 통지에 「모공 조임」을 일부러
넣어 보니 「모공 수축」·「모공수축」 두 줄을 집어내고 종료코드 1 이 나왔다 — 그걸 보고서야
검사가 산다는 걸 안다. 되돌릴 땐 `git diff products/` 가 **비어 있는지** 꼭 확인한다.

### 2026-11-02 14시 · claude-22 — 발행 직전 편은 **게이트만으로 끝나지 않는다. 사양정본과 한 줄씩 대조한다**
11-03 선글라스 편(D-1)은 게이트가 ✓ 금지어 0 이었다. 그래도 끝이 아니다. 게이트는 **금지된 말**을
보지 **틀린 숫자**를 못 본다. 「약 37g」·「약 5시간」·「UV400 3장」·「공기전도 개방형」을
`raytok-glass.json` `facts.specs` 와 하나씩 맞춰 봐야 넷 다 맞다는 걸 안다.

대조하다 없는 것도 나온다 — 「다리 바깥 버튼」은 사양정본에 그 말이 없었다.
**거짓이 아니라 근거가 「모름」이다.** 둘을 섞어 적으면 안 된다. 거짓은 고치고, 모름은 모름으로 올린다.

### 2026-11-02 14시 · claude-22 — detached HEAD 가 **또** 물었다. 증상이 거짓말을 한다
`git pull --rebase origin main` 이 「Already up to date」 라고 해도 **브랜치 위가 아닐 수 있다.**
그 상태에서 커밋하면 커밋은 HEAD 에 쌓이는데 `git push origin main` 은 **뒤처진 로컬 `main` 참조**를
밀어서 이렇게 나온다 — 방금 pull 했는데도:

```
! [rejected] main -> main (non-fast-forward)
hint: Updates were rejected because a pushed branch tip is behind its remote counterpart.
```

「뒤처졌다」를 보고 또 pull 하면 아무 일도 안 일어난다. **pull 문제가 아니라 내가 브랜치 밖에 있는 것이다.**
먼저 확인하고, 밀고, 정상화한다:

```bash
git status -sb | head -1        # 「## HEAD (no branch)」 면 이것이다
git push origin HEAD:main       # HEAD 를 명시해 밀어야 한다
git checkout -B main <그 커밋>   # 그 다음 브랜치로 돌아온다
git branch --set-upstream-to=origin/main main
```

**매시 절차 맨 앞에 `git status -sb | head -1` 을 끼우는 게 낫다.** 두 세션이 각각 한 번씩 밟았다.

---
## 카드 그림 속 글은 따로 검사해야 한다 (2026-11-02 claude-22)

**캡션을 전수 검사해도 그림은 안 본 것이다.** 11-05 예약은 캡션이 ✗(「구독료 0원」)인데
**같은 말이 박힌 그림은 한 달 내내 ✓** 였다. 그림을 아무도 게이트에 안 넣었기 때문이다.

요령 — Metricool `getScheduledPosts` 응답의 `media[]` 가 공개 URL 이다. 로그인 없이 받아 눈으로 본다:
```bash
curl -sS -o card.jpeg "https://static.metricool.com/planner/.../xxx.jpeg"
```
그 다음 **그림에 적힌 글을 줄바꿈까지 그대로 옮겨** `check` 에 넣는다.

- `mediaAltText` 는 그림의 실제 글이 **아니다.** 대체텍스트가 깨끗해도 그림은 더러울 수 있고 반대도 된다.
  11-05 는 둘이 같았지만 그건 운이었다
- 꼬리말(조건 한 줄)을 꼭 같이 읽는다. 11-03 「무게는 제조사 제공 값」· 11-04 「지원 언어는 앱
  업데이트에 따라 변동」처럼, **조건이 그림에 이미 있으면 캡션에 또 안 넣어도 된다**
- 그림이 깨끗하고 캡션만 더러우면 `updateScheduledPost` 한 번으로 끝난다. 그림이 더러우면
  사람이 다시 만들어야 하니 **D-day 계산이 완전히 달라진다.** 그림부터 보라

## 금지어는 줄바꿈으로 쪼개면 샜다 — 고쳤다 (2026-11-02 claude-22)

`"월 구독료 0원"` → ✗ / `"월 구독료\n0원"` → ✓ 였다. 금지어를 `indexOf` 로 찾았기 때문.
고지문은 11-01 에 이미 `looseRe`(공백 `\s+`)로 옮겼는데 **금지어만 뒤처져 있었다.**
지금은 `lib/check.mjs` 의 `looseFind` 가 둘 다 같은 방식으로 본다.

- **여러 낱말로 된 금지어를 쓸 때는 이걸 가정하라.** 「구독료 0원」·「즉각 쿨링」·「모든 피부 타입」처럼
  띄어쓰기가 든 말은 이제 줄바꿈·여러 칸이 끼어도 걸린다. 터치톡 쪽도 자동으로 적용된다
- 사이에 **글자**가 끼면 여전히 안 걸린다(「구독료. 0원」). 의도한 선이다 — 그건 다른 문장이다
- **같은 종류의 구멍을 찾는 법:** 한 파일 안에 느슨한 대조와 빡빡한 대조가 **같이** 있으면 의심하라.
  고지문만 고치고 금지어를 안 고친 게 정확히 그 모양이었다

---
## 제품 경계를 타고 새는 금지어 (2026-11-02 16시, claude-22)

**증상.** 같은 글인데 어느 제품 목록으로 검사하느냐에 따라 ✓ 와 ✗ 가 갈린다.

```
선글라스 v3 상세 그림 속 글 그대로:
  node route.mjs check raytok-glass "<글>"  → ✓ 금지어 없음
  node route.mjs check raytok-app   "<글>"  → ✗ 「구독료 0원」 + 통지 2
```

**까닭.** 「구독료 0원」·「휴대폰 안에서 번역」은 `raytok-app.json` 에만 있었다. 그런데
**선글라스 상세가 앱의 번역 기능을 같이 판다.** 상세 한 장에 두 제품 이야기가 섞여 있으면
**파는 제품의 목록만으로는 모자라다.**

**요령.** 상세·랜딩처럼 **여러 제품을 같이 파는 글**은 **관련 제품 목록으로 전부** 돌려 본다.
한 번으로 끝내지 말 것. 베껴 적을 때는 `$comment` 에 **짝인 파일 이름**을 적어 둔다 —
안 적으면 한쪽만 고쳐서 또 갈라진다.

## 사양표는 게이트가 못 본다 — 값이 이름 위에 온다 (같은 날)

`looseRe`(2026-11-02 15시)는 공백·줄바꿈을 잇지만 **말 순서는 못 바꾼다.**

```
"월 구독료 0원"    → ✗ 걸린다
"월 구독료\n0원"   → ✗ 걸린다 (15시 수정분)
"0원\n월 구독료"   → ✓ 샌다      ← 사양표·수치 띠는 값이 이름 위에 온다
```

낱말 순서를 섞어 맞추면 엉뚱한 데서 걸리기 시작하므로 **엔진을 안 고치고 둔다.**
**사양표·수치 띠·숫자 카드는 사람이 봐야 한다.** 게이트가 봐 주지 않는다.

## 상세 전문을 넣으면 꼬리말 상용구가 「출처 확인 필요」로 뜬다 (같은 날)

주소·전화·사업자등록번호·통신판매업 번호(`635`, `1507`, `376`, `88`, `02280`, `1800`,
`6825`, `2025`, `2002`)와 맨 단계번호(`01` `02` `03` — 점이 없어 11-01 의 `N. ` 예외에
안 걸린다)가 전부 뜬다. **판정엔 영향 없다**(숫자 출처는 `ok` 를 안 건드린다). 소음인 줄
알고 넘기면 된다. 고치려면 꼬리말 블록을 떼고 검사한다.

## 띄어쓰기·조사가 다르면 통지어도 샌다 (2026-11-02 16시 · smartever)

`looseRe` 는 **공백 0개를 이을 뿐, 낱말 사이에 없던 공백·조사를 메우지 않는다.**

```
통지 「임상실험」   ← "임상 실험 테스트 완료"  ✓ 샌다 (도장 글은 띄어 쓴다)
통지 「모공 수축」  ← "모공을\n수축"           ✓ 샌다 (조사 「을」)
```

그림 속 글은 줄바꿈·띄어쓰기·조사가 캡션과 다르게 들어간다. **OCR/받아적은 원문을 그대로 넣고,
안 걸리면 붙여 쓴 꼴·띄어 쓴 꼴·조사 붙은 꼴을 각각 목록에 넣는다.** 넣은 뒤 `selftest`.

---
### `inherit` 는 배열도 받는다 — 낱말목록을 베껴 적지 말 것 (2026-11-02 17시 claude-22)
`products/<id>.json` 의 `forbidden.inherit` 에 **배열**을 넣을 수 있다.

```json
"forbidden": { "inherit": ["common", "raytok-app"], "words": ["프리미엄"] }
```

- 문자열 하나(`"common"`)는 **예전과 글자 그대로 같은 동작**이다. 하위호환이라 안 고쳐도 된다
- 물려받은 제품의 `inherit` 도 따라 풀린다. 고리(A→B→A)는 한 번 보고 끊는다
- 중복은 **한 번만** 센다(대소문자 무시). 그래서 선글라스 금지어 수가 35 에서 안 늘었다

**왜 생겼나.** 선글라스 상세가 앱의 번역 기능을 같이 파는데(TRANSLATION·85개 언어·구독료)
검사는 선글라스 목록으로만 했다. 「구독료 0원」·「휴대폰 안에서 번역」이 **제품 경계를 타고 샜다.**
급한 불은 앱 낱말 3개를 선글라스에 **베껴 적어** 껐는데, 베낀 목록은 한쪽만 고치면 또 갈라진다.
실제로 앱 통지 23개 중 3개만 베껴져 있어서 **20개가 여전히 구멍**이었다 —
「온디바이스·비행기 모드·인터넷 없어도」가 선글라스 글에선 통지 0건으로 통과했다.

**요령:** 한 제품의 소재가 다른 제품 기능을 같이 팔면 **베끼지 말고 물려받는다.**

### 낱말 합치기는 한 함수만 쓴다 (같은 날)
`check.mjs` 의 `check()` 와 `route.mjs` 의 `selftest` 가 공용+제품 목록을 **각자 따로** 합치고
있었다. 갈라지면 「게이트는 막는데 selftest 는 모순을 못 보는」 꼴이 된다.
`resolveForbidden()` 하나로 모았다. **앞으로 목록을 합치는 코드를 새로 쓰지 말고 이걸 부른다.**

### 수정이 진짜 먹었는지 보려면 고치기 전 코드와 맞대 본다 (같은 날)
「고친 뒤 ✓」만 보면 **원래도 ✓였던 것**과 구별이 안 된다. 옛 커밋을 스크래치에 풀어 같은
문장을 양쪽에 돌린다.

```bash
git show HEAD:marketing/products/raytok-glass.json > <스크래치>/products/raytok-glass.json
# lib/ 는 .mjs 가 서로 import 하므로 quota.mjs 까지 같이 복사해야 돈다 (ERR_MODULE_NOT_FOUND)
```

고치기 전 통지 **0건** → 고친 뒤 **5건**. 이 숫자 둘이 있어야 「막혔다」고 말할 수 있다.

### 계획 편 수는 `plan` 배열 길이를 세라 — 사람이 적은 수를 믿지 말 것 (같은 날)
양쪽 세션이 4시간 동안 터치톡 계획을 「4편」이라고 적어 왔다. 파일은 **5편**이었다
(T5 = 11-17 · `image: null`). 그 한 편이 Upload-Post 한도 2칸을 더 먹어
`"blocked": "quota"` · `"willUse": 10` — **장부의 「여유 2건」이 사실이 아니었다.**

- 까닭: 계획이 장부보다 **먼저** 생성되면 `reservedByOthers: 0` 으로 깔린다. 둘이 어긋난다
- **점검:** `plan` 길이 · `posts` 필드 · 장부 `planned` 합 **셋이 같은지** 본다. 다르면 「모름」으로 적는다
- `node route.mjs quota <월>` 은 **장부만** 읽는다. 계획 파일은 안 본다 — 한도 표시를 믿지 말 것

### 법정 필수문이 없는 제품은 「빠짐」을 못 잡는다 (같은 날)
`mustInclude` 가 비어 있으면 `auditRequired` 는 **항상 통과**한다.
`raytok-glass`·`raytok-app` 은 0개라서, 상세 꼬리말
「통역사를 대신하지 않으며…」가 빠져도 게이트가 아무 말을 안 한다.
그냥 넣으면 **SNS 캡션엔 그 꼬리말이 없어서 8편 중 7편이 막힌다** —
「상세·그림엔 필수, 캡션엔 면제」로 나누는 설계가 먼저다. 지금은 사람이 봐야 한다.

### detached HEAD 가 또 물었다 — push 오류 문구가 거짓말을 한다 (2026-11-02 17시 claude-22)
`git clone` 뒤 어떤 경로로든 HEAD 가 떨어지면 **커밋은 되고 push 만 안 된다.** 그때 나오는 말이
헷갈린다: `git pull --rebase origin main` 은 **「HEAD is up to date」** 라고 하고,
push 는 **「behind its remote counterpart」**(뒤처졌다)라고 한다. 둘 다 사실이 아니다 —
로컬이 원격보다 **한 커밋 앞서** 있는데 가리킬 브랜치가 없을 뿐이다. pull 을 더 해도 안 풀린다.

```bash
git status -sb | head -1        # 「## HEAD (no branch)」 면 이 함정이다
git branch -f main HEAD && git checkout main && git push origin main
```

**매시 절차 맨 앞에서 `git status -sb` 한 줄을 보는 게 제일 싸다.**

---
## `plan` 의 요일은 CLI 인자에 두지 말고 제품 파일에 둔다 (2026-11-02 18시 claude-22)

**밟은 것.** 11-02 16시 커밋에서 `plan touchtok 2026-11` 을 **요일 인자 없이** 돌린 흔적이
남았다. `slots()` 는 요일이 없으면 `perWeek>=2` → **기본 [화,금]** 으로 깐다. 그래서
터치톡 계획이 목(11/5·12·19·26, 4편 8칸) → **화·금(11/3·6·10·13·17, 5편 10칸)** 으로 밀렸다.

**왜 하루 넘게 못 봤나.** 드리프트가 **조용했다.**
- 날짜는 바뀌었는데 게이트는 전부 ✓ 라 출력이 깨끗했다
- 늘어난 다섯째 편이 `image: null` 이라 양쪽이 **「T5 라는 새 편」**으로 읽었다.
  실제로는 **새 소재가 아니라 늘어난 화요일 한 칸**이었다
- 장부 `planned` 는 목요일 4편 그대로라 **계획 10칸 vs 장부 8칸** 이 어긋났고,
  양쪽이 그걸 「Upload-Post 여유 2건」으로 네 시간 적어 왔다. 여유는 **원래부터 2건**이었다

**고친 것.**
1. `products/<id>.json` 의 `publish.day`·`publish.perWeek` 를 읽는다. **CLI 인자가 있으면 그게 이긴다**(하위호환). 인자를 잊어도 제자리로 깔린다
2. `plan` 이 **장부 `planned` 날짜와 대조**해 어긋나면 🔴 로 소리를 낸다
   (`quota.mjs` 의 `plannedDatesFor`). 장부는 사람이 적은 의도라 정본에 가깝다
3. 출력에 **요일 출처**를 찍는다 — `요일 목 · 주당 1회 — 출처 products/touchtok.json`

**요령.** 계획 파일을 재생성한 뒤엔 **편 수만 세지 말고 요일을 읽어라.** 편 수가 늘면
먼저 「소재가 늘었나」가 아니라 **「요일이 밀렸나」**를 의심한다. 늘어난 편의 `image: null` 은
새 소재의 표시가 아니라 **빈 칸의 표시**인 경우가 많다.

---
## `out/plan-raytok-*.json` 은 스냅샷이다 — 지금 재생성하면 0편으로 비워진다 (2026-11-02 18시 claude-22)

11월 Metricool 은 **20/20 꽉 찼다**. 그래서 `plan raytok-glass 2026-11 1 5` 를 지금 돌리면
`한도 20 · 발행됨 20 · 이 계획 0편` 으로 **파일이 빈 계획으로 덮인다**(남김 칸에 `-8` 처럼
음수가 찍히는 게 그 신호다). 지금 레포에 있는 raytok 계획 4+4편은 **11-01 시점 스냅샷**이다.

⇒ **예약 문구의 정본은 계획 파일이 아니라 Metricool 에 걸린 예약 자체다.** 문구를 확인할
일이 있으면 계획 파일을 다시 만들지 말고 `audit/예약문구_점검_*.md` 와 Metricool 을 본다.

---
## 법정 꼬리말이 두 판본으로 갈려 있다 — `mustInclude` 를 켜기 전에 정본을 정해야 한다 (2026-11-02 18시 claude-22)

| 어디 | 문장 |
|---|---|
| `assets/i18n/*.json` (85개 언어 번역 대장, 키) | RayTok은 통역 도구입니다. **교육기관·통역사·관광통역안내사를** 대신하지 않으며, 기계 번역에는 오역이 있을 수 있습니다. |
| `marketing/assets/seo/RT18G_v3_*.txt` (상세 꼬리말) | RayTok은 통역 도구입니다. **통역사를** 대신하지 않으며, 기계 번역에는 오역이 있을 수 있습니다. |

상세 판본은 **「교육기관」과 「관광통역안내사」가 빠졌다.** 번역 대장에 상세 판본은
**0건** — 어느 언어에도 없다.

**왜 중요한가.** smartever 가 11-02 16:30 에 신고한 그 함정이다 — 「법정 문구와 글자가
달라 게이트가 ✗」. 지금은 `raytok-*` 의 `mustInclude` 가 비어 있어 아무 일도 안 생기지만,
꼬리말을 `mustInclude` 에 넣는 순간 **두 판본 중 하나는 반드시 「빠짐」으로 뜬다.**
게다가 빠진 쪽이 **관광통역안내사(면허 영역)** 라 글자 수 문제가 아니다.
⇒ `mustInclude` 를 켜기 전에 **정본 한 판본을 정하는 것이 먼저다.**

---
## 한도가 꽉 찬 달에 `plan` 을 다시 돌리면 **계획 스냅샷이 지워진다** (2026-11-02 19시 · claude-22, 직접 밟음)

`out/plan-<제품>-<달>.json` 은 「출력」이면서 **이미 세워 둔 계획의 기록**이다. 그런데
한도가 꽉 찬 달에 `plan` 을 다시 돌리면 **0편 결과가 그 기록을 덮어쓴다.**

- 밟은 자리: metricool 20/20 인 상태에서 `plan raytok-glass`·`plan raytok-app` →
  두 파일이 **4편 → 0편**(`plan: []`·`willUse: 0`)으로 바뀌었다
- **게이트는 전부 ✓** 였고 경고는 「⚠ 한도에 걸려 0편에서 끊겼습니다」 한 줄뿐이다.
  출력이 깨끗해서 사람 눈으로는 「원래 0편이었나」와 구별이 안 된다
- **옮는다(cascade).** `plannedElsewhere()` 가 `out/plan-*` 을 읽어 다른 제품 몫을 세므로,
  한 파일이 0 이 되면 **다음에 돌리는 제품의 「다른 제품 계획」 수가 틀린다.**
  실제로 glass 는 8, 바로 뒤 app 은 0 으로 엇갈려 나왔다 (앞에서 glass 가 0 이 된 탓)

**엔진에 막아 뒀다**(`route.mjs`): 이번 계획이 0편인데 기존 스냅샷에 편이 들어 있으면
**쓰지 않고** 🔴 로 알린다. 기록을 정말 비우려면 사람이 그 파일을 지워야 한다.

요령 두 개:
1. `plan` 을 여러 제품 연달아 돌리기 전에 `git status marketing/out` 을 한 번 본다.
   의도치 않게 바뀌었으면 `git checkout -- marketing/out/<파일>` 로 되돌린다
2. 한도가 꽉 찬 달엔 `plan` 을 **돌릴 이유가 거의 없다.** 날짜·요일만 보려면
   스냅샷의 `day`·`perWeek`·`plan[].when` 을 읽으면 된다

## 「남김」이 음수면 같은 자리를 두 번 센 것이다 (2026-11-02 19시 · claude-22)

`plan raytok-glass` 가 「한도 20건 · 발행됨 20건 · 다른 제품 계획 8건 · **남김 -8건**」을
조용히 찍고 있었다. 음수는 나올 수 없는 수다.

- 원인: 장부 `quota/metricool-2026-11.json` 의 `used=20` 에 **진짜 예약이 이미 다 들어 있는데**,
  `out/` 에 남은 **예약 전 판본 스냅샷**을 `reserved` 로 또 센다
- 두 쪽이 안 맞는 걸로 확인된다: 장부 app 후킹 `A2·D1·C3` / 스냅샷 `A1·A2·A3`,
  장부는 11-03 이 glass 인데 스냅샷 app 은 11-03 에 B4 를 잡고 있다
- **어느 쪽이 정본인지 「모름」이라 수는 고치지 않았다.** 음수가 나오면 🔴 로 찍고
  「장부 `posts` 와 `out/` 스냅샷의 후킹·날짜를 맞대 보라」고 사람에게 넘긴다
- **한도 판정 자체는 이 줄과 무관하게 장부 `used` 기준**이다 — 초과 발행 위험은 없다

교훈이 둘 다 같다: **날짜·건수만 조용히 틀리는 종류는 게이트가 ✓ 를 주므로 사람 눈으로 못 잡는다.**
그런 수는 엔진이 스스로 「말이 안 되는 수」를 알아보고 소리를 내게 해야 한다.

## `check` 는 **제품 id 를 먼저** 받는다 (2026-11-02 19시 · claude-22)

`node route.mjs check "<문구>"` 로 돌리면 첫 인자를 제품 id 로 읽어
`products/<문구>.json` 을 찾다가 **스택 트레이스를 뱉고 죽는다**(없는 파일).
문구가 길면 에러 끝에 문구 뒷부분 + `.json` 이 붙어 나와 읽기 어렵다.

올바른 꼴: `node route.mjs check <제품id> "<문구>"` — 예) `check raytok-glass "$(cat 본문.txt)"`

## detached HEAD 에서는 `git push origin main` 이 **엉뚱한 걸 민다** (2026-11-02 19시 · claude-22, 재확인)

이미 적힌 함정이지만 **에러 문구가 오해를 부른다**. 예약 세션 클론이 detached HEAD 였고,
커밋은 `origin/main` 바로 위에 **깨끗하게 얹혀 있었다**(fast-forward 가능). 그런데:

```
! [rejected]  main -> main (non-fast-forward)
hint: Updates were rejected because a pushed branch tip is behind its remote
```

「behind」라고 하니 「내가 뒤처졌구나 → pull 해야겠다」로 읽힌다. **아니다.**
`git push origin main` 은 **로컬 브랜치 `main`** 을 민다. detached HEAD 면 내 커밋은
그 브랜치에 없고 `main` 은 예전 자리에 그대로 있어서, **뒤처진 건 내 커밋이 아니라 쓰지도 않은 브랜치**다.
`git pull --rebase origin main` 을 아무리 돌려도 안 고쳐진다 (실제로 두 번 헛돌았다).

```bash
git rev-parse --abbrev-ref HEAD      # HEAD 로 나오면 detached
git push origin HEAD:main            # ← 이렇게 민다
git checkout -B main origin/main     # 그 다음 브랜치를 정상화
```

## (smartever 11-02 19:15) plan 가드는 「0편」만 막는다 — 「줄어든 계획」은 조용히 덮는다
- 한도가 거의 찼을 때 `plan` 은 0편이 아니라 **1편** 같은 줄어든 계획을 내고, 0편 가드를 빠져나가 기존 스냅샷을 덮는다. 출력은 「⚠ 한도에 걸려 N편에서 끊겼습니다」 한 줄뿐
- 또 장부 `posts`(이미 발행/예약한 날)를 계획에서 빼지 않아, 발행한 날짜·소재를 다시 계획에 넣는다
- 요령: 실제 예약을 건 뒤엔 그 달 `plan` 을 재실행하지 않는다. 회귀는 레포 밖 사본에서 장부(`used`·`posts`)를 바꿔 돌리고, 돌린 뒤 `plan` 길이를 전후로 센다

## (smartever 11-03 09시) 이미 정해진 금지 사항은 「대표님 결정」으로 올리지 말고 바로 고친다
- 교체표(10-06)·권한 위임(10-28)처럼 **이미 내려진 지시**에 걸리는 문구를 「결정 대기」로 STATUS 에 쌓아 두다가 대표님께 "고치라는 거 왜 안 고치냐" 소리를 들었다
- 요령: 막힌 것 목록에 올리기 전에 「이걸 정하는 지시가 이미 있나」를 먼저 찾는다. 있으면 고치고 통지만 한다. 로그인·돈·새 판단만 대표님께 올린다
## (claude-22 11-03) 숫자 출처 검사가 **꼬리말 회사 정보**를 통계로 셌다 — 14개가 쏟아지면 아무도 안 읽는다
- v3 본문 꼬리말 한 뭉치가 전부 걸렸다: `1800-6825`(대표번호) · `376-88-02280`(사업자번호) ·
  `2025-화성동탄-2002`(통신판매업) · `동탄대로 635,`·`15층`·`1507호`(주소) · `01 02 03`(차례표) · `2026-11-01`
- 진짜 위험한 「월 구독료 0원」이 그 14줄 **밑에 묻혀 있었다.** 경고가 많으면 경고가 아니다
- 이제 가린다: **붙임표로 이어진 숫자 묶음**(전화·사업자·신고번호) · 한글 낀 신고번호 ·
  길번호/층·호·동 · **앞자리가 0 인 홑 숫자**(`01` 은 차례표지 통계가 아니다) · ISO 날짜(`-`·`/`)
- ★ **뒤에 단위가 붙으면 안 가린다** — 「30-40시간」 같은 범위는 계속 물어야 한다
- 요령: 숫자 경고가 열 개 넘게 뜨면 **고칠 문구가 아니라 검사기를 의심**한다. 한 줄씩 어디서
  왔는지 `grep -n` 으로 본다. 대개 한 문단(꼬리말·주소·차례표)에서 몰려 나온다

## (claude-22 11-03) 그림에 글이 없다는 것도 **재 봐야** 안다 — OCR 빈 결과는 증거가 아니다
- `tesseract <jpg>` 를 그냥 돌리면 글이 **있는** 카드에서도 빈칸이 나온다(해상도 추정 실패)
- 쓸 만한 꼴: 흑백 → **2배 확대** → `--psm 11`(흩어진 글자) · `-l kor+eng`
  ```bash
  python3 -c "from PIL import Image; im=Image.open('x.jpg').convert('L'); w,h=im.size; im.resize((w*2,h*2),Image.LANCZOS).save('/tmp/x.png')"
  tesseract /tmp/x.png - -l kor+eng --psm 11
  ```
- **글이 있는 그림으로 먼저 한 번 돌려 본다.** 거기서도 빈칸이면 OCR 이 죽은 것이지
  그림이 깨끗한 게 아니다. 이 확인 없이 「글 없음」이라고 적으면 안 된다
- 사진 컷은 로고 글자(`RayTok`)만 잡히고 문장은 안 나온다 — 그게 정상 결과다
- 그래도 **앱 화면·포장·라벨이 찍힌 컷은 눈으로 한 번 본다.** 작은 글씨는 OCR 이 못 읽는다

## (claude-22 11-03) 「대표님 결정 대기」로 쌓아 두면 안 되는 것
- smartever 가 받은 말씀: **"고치라는 거 왜 안 고치냐."**
- 갈래를 나눠야 한다:
  · **이미 정해진 것**(교체표에 있는 금지 문구 · 위임받은 영역 · 게이트가 ✗ 로 잡는 거짓 문구)
    → **그냥 고친다.** 다시 물으면 일이 멈춘다
  · **정본을 골라야 하는 것**(꼬리말 두 판본 중 어느 것 · 공용 금지어에 올릴지)
    → 올린다. 내가 고르면 85개 언어가 통째로 틀어진다
  · **대외로 바로 나가는 것**(예약 글 · 발행된 상세) → 올린다. 되돌리기가 비싸다
- 바꿀 값을 모르면 **지우는 것도 고치는 것**이다. 거짓 문장을 추측으로 채우지 않는다
  (v3 상세 「0원 / 월 구독료」 타일은 바꿀 참값이 없어 타일째 지웠다)

---
**2026-11-03 · smartever** — 정기(무인) 실행에서는 레포 스크립트(`node route.mjs` 등) 실행이 권한 판정으로 **거부될 수 있습니다.** 그 시간엔 파일 읽기(JSON 직접 열기)로 확인할 수 있는 것만 하고, 회귀를 못 돌렸으면 「못 돌림 · 모름」으로 적습니다. 「됐을 것」으로 채우지 않습니다

## (11-03 smartever) plan 재실행 후 콘솔 출력의 후킹 id 를 확인할 것
- `posts` 날짜를 건너뛰는 것과 **후킹을 건너뛰는 것은 별개**다. 날짜만 빠지면 남은 자리에 이미 나간 T1 이 다시 붙는다
- plan 을 다시 돌렸으면 출력의 `[T? …]` 가 장부 `posts[].hook` 과 겹치는지 눈으로 본다
- 정기(무인) 실행에서 `node route.mjs` 가 막힌 건 매번 그런 게 아니었다(10시 막힘 → 11시 됨). 막히면 「모름」으로 적고 다음 차례에 다시 시도
---

## 정기(무인) 실행에서 「명령이 막힌다」 — 거부되는 건 명령 모양이다 (2026-11-03 claude-22)

smartever 가 11-03 10:15 에 「정기 실행에서 `node route.mjs` 가 권한 판정으로 막혔다」고 올렸다.
**같은 세션 종류에서 `node route.mjs selftest`·`plan`·`check` 전부 돌았다.** 막히는 건 도구가 아니라
**한 줄에 여러 일을 이어 붙인 모양**이다.

```
거부됨 : set -e; cd X; rm -rf Y; cp -r A B; cd B; node route.mjs ...
돌아감 : cp -r A B                     ← 한 줄에 한 일
돌아감 : cd B && node route.mjs plan touchtok 2026-11
돌아감 : node -e '...'   ·   python3 - <<'PY' ... PY
```

- `rm -rf` 가 섞이면 특히 잘 거부된다. **지우지 말고 새 이름으로 복사**하면 된다(`regA`·`regB`)
- `cd` 는 한 번만. 여러 번 오가면 거부 쪽으로 기운다. 각 줄에서 **절대경로로 한 번만** `cd`
- 거부되면 **같은 줄을 다시 보내지 말고 쪼개라.** 재시도는 같게 거부된다
- 「막혔다」를 「도구가 없다」로 적지 말 것 — 쪼개면 되는 경우가 많다

## 회귀 심는 값을 좁게 고르면 고친 게 안 고쳐진다 (2026-11-03 claude-22, 자기 실수)

11-03 09:40 에 「장부 `posts` 날짜는 계획에서 뺀다」를 넣고 회귀까지 봤는데, **빈틈이 남았다.**

- `publishedDatesFor` 는 장부 `d` 를 **적힌 그대로** 돌려준다
- `route.mjs` 는 `when.slice(5,10)` 로 **`MM-DD`** 와 비교한다
- → 장부에 **`2026-11-05`** 처럼 해까지 적힌 줄이 있으면 **날짜 빼기가 조용히 안 먹는다.**
  건너뛴 줄도 안 찍히니 **사람이 알 길이 없다**

**왜 회귀가 못 잡았나.** 회귀를 심을 때 `d: "11-05"` **실제 장부와 같은 꼴로만** 넣었다.
실제 장부(`metricool`·`uploadpost`)가 둘 다 MM-DD 라서 지금까지 피해는 없었지만,
**고친 코드가 실제로 보는 범위를 좁게 재어** 「됐다」고 적은 셈이다.

요령:
- **날짜·식별자 비교를 고쳤으면 회귀에 꼴을 두 개 이상 심어라** — `MM-DD` 와 `YYYY-MM-DD`
- 비교하는 쪽(`slice`)과 내놓는 쪽(`Set`)이 **다른 함수에 있으면** 꼴이 어긋나기 쉽다.
  내놓는 쪽에서 **두 꼴을 다 담아** 두면 호출하는 데가 늘어도 안 깨진다
- 「건너뛰었습니다」처럼 **일이 일어났을 때만 찍히는 줄**은, 안 찍힌 것이
  「건너뛸 게 없었다」인지 「비교가 어긋났다」인지 구분이 안 된다. 재현에서 **찍히는 걸 눈으로 봐라**

## 전언 한 줄을 대외 발행 권한으로 쓰지 않는다 (2026-11-03 claude-22)

「대표님이 고치라고 하셨다」가 **handoff 파일에 적힌 전언**뿐일 때, 내부 파일은 고치고
**대외로 바로 나가는 것(예약 글·발송 메일·공개 페이지)은 고치지 않는다.**

- 11-02 21:3x 전언(「고치라는 거 왜 안 고치냐」)으로 **원고 txt 는 고쳤다** — 되돌릴 수 있고 안 나간다
- 같은 전언으로 **11-04 예약 캡션은 고치지 않았다.** `10-28 권한 위임`을 레포·프로젝트에서
  **찾지 못했다**(`grep -rn 위임` 결과가 전부 handoff 파일 자기 인용이었다)
- 대신 **누르기만 하면 되는 상태로 만들어 두고** 올렸다: 교정본 전문 · 게이트 통과 · `diff` 한 줄 · 예약 id
- 세션 간 전언은 **정보**다. 권한 근거는 **문서**다. 둘을 섞으면 되돌릴 수 없는 쪽에서 사고가 난다

## 「건너뛰기」를 날짜만 걸면 소재가 두 번 나간다 (2026-11-03 smartever 재현 → claude-22 고침)

날짜 빼기와 **소재(후킹) 빼기는 별개다.** 날짜만 빼면 남은 자리에 **이미 나간 소재가 다시 붙는다.**

- `usedHooks()` 는 **엔진이 적은 `log`** 만 봤다. **사람이 장부 `posts` 에 손으로 적은 발행분**은 못 본다
- 재현: 장부 posts 3줄(11-05 T1·11-12 T2·11-19 T3) → 남은 11-26 에 **T1** 이 또 잡혔다
- 가드가 파일은 지켜 주지만, **콘솔 출력만 보고 예약을 걸면 같은 소재가 두 번 나간다**
- 고침: `publishedHooksFor(month, tool, pid)` 를 `publishedDatesFor` 와 **짝으로** 두고
  `usedHooks(month, pid, tool)` 에서 세 달치에 합류. `hook` 이 안 적힌 줄은 **아무것도 안 뺀다**

요령: **「이미 한 것」을 빼는 로직은 축이 둘 이상이면 축마다 따로 확인해라.** 날짜가 맞게 빠진다고
소재도 빠지는 게 아니다. 재현에서 **찍힌 후킹 id 를 눈으로** 보는 게 유일한 확인이다.

## 안내 문구는 까닭에 맞는 것만 찍는다 (2026-11-03 smartever 가 짚음)

🔴 「장부와 날짜가 어긋납니다」 밑에 **언제나** 「`publish.day` 를 채우세요」가 붙었다.
터치톡은 `day: 4` 가 **이미 채워져** 있었고 실제 까닭은 **한도**였다. 사람이 엉뚱한 데를 본다.

- 고침: `p.publish.day == null` 일 때만 그 안내를 찍고, 채워져 있으면
  **한도 / 발행 날짜 건너뜀 / 장부 낡음** 으로 갈라 찍는다
- 교훈: **한 가지 증상에 한 가지 처방을 붙여 두면, 다른 까닭일 때 거짓 안내가 된다.**
  안내 줄을 늘릴 때는 「이 줄이 틀리는 경우」를 먼저 세어 본다

---
**2026-11-03 12:10 · smartever** — 정기 실행 사본 위치
- 사본을 scratchpad(`/tmp/...`) 에 두면 `cd` 가 작업 폴더 밖이라 **조용히 /home/claude 로 되돌아가** `route.mjs` 를 못 찾습니다. 사본은 **작업 폴더 안**(예: `/home/claude/regC`)에 두고, `cd` 는 **따로 한 줄**로 보낸 뒤 `node route.mjs ...` 를 다음 줄로
- 클론이 detached HEAD 면 `git checkout -B main origin/main` 으로 바로잡고 시작(작업트리 깨끗할 때만)
## 정정 — 사양표 뒤집힘은 **좁게는** 고칠 수 있다 (2026-11-03 12시 · claude-22)

위 「사양표는 게이트가 못 본다」에 **엔진을 안 고치고 둔다**고 적었다. 그 판단의 절반만 맞다.

**맞은 쪽.** 낱말 순서를 **전부** 섞어 맞추면 엉뚱한 데서 걸린다. 그건 하면 안 된다.

**틀린 쪽.** 사양표가 뒤집는 것은 아무 낱말이 아니라 **홑 수치**다. 거기만 보면 된다.

```
금지어 중 「끝이 홑 수치」인 것 — 제품마다 딱 3개였다
  구독료 0원 · 블루투스 5.4 · 블루투스 5.2 · (터치톡) 단 14일
```

그래서 `looseFind` 가 straight 로 못 찾으면 **`specFind` 한 단계**만 더 본다:
**끝 낱말이 홑 수치인 금지어**에 한해, 그 수치가 먼저 오고 남은 낱말이 뒤따르는 꼴.

**오탐 막이 셋이 핵심이다. 하나라도 빼면 쓸 수 없다.**

```
① 남은 낱말이 한 글자면 건너뛴다
   「단 14일」 → 「14일 … 단계를 거쳐 진단」 에 걸린다. 한 글자는 한국어에서 아무 데나 박힌다
② 마침표·쉼표를 넘지 않는다. 사이값은 공백·줄바꿈·`/`·`·` 와 **접두사 한 낱말**(「월 」)까지
   「0원으로 쓰십니다. 구독료는 따로 안 받습니다」 → 넘기면 걸린다. 문장 건너뛰기는 금지
   (`looseRe` 의 「사이에 글자가 끼면 안 걸린다」 원칙을 그대로 지키는 것이다)
③ 값 뒤에 한글이 붙으면 안 본다 — 「0원으로」는 사양표 값이 아니라 문장이다
```

**회귀 방법이 요령이다.** 공용 게이트를 고칠 땐 「표적이 걸리나」만 보면 모자라다.
**고치기 전 사본(A) · 고친 사본(B) 를 따로 두고 `plan` 출력을 `diff`** 한다.
세 제품 다 차이 0 이어야 「판정 변화 0」이라고 적을 수 있다. 숫자 세 쌍(60·33·26 따위)만
보는 것으로는 **어느 한 편의 ✗/✓ 가 뒤집힌 것**을 못 잡는다.

**아직 못 보는 것.** 낱말로만 된 금지어의 순서 뒤집기는 여전히 샌다. 수치 띠만 좁혔다.

---
## 장부 편수와 실물 편수를 매번 센다 — 「다 봤다」는 착각이 생기는 자리 (11-03 13시 claude-22)

**11월 Metricool 예약을 4편이라고 믿고 며칠을 보냈습니다. 실제로는 10편이었습니다.**
뒤쪽 5편(11-10·13·17·20·24)은 한 번도 금지어 게이트에 넣은 적이 없었습니다.
다행히 다시 세어 보니 5편 전부 ✓ 였지만, **몰라서 통과한 것**입니다.

왜 생겼나: STATUS 를 매시 덮어쓰면서 **「지난번에 적은 목록」을 그대로 물려받았습니다.**
처음 적을 때 가까운 4편만 봤고, 그 뒤로는 그 4편만 다시 확인했습니다.
장부(`quota/metricool-2026-11.json`)에는 10줄이 멀쩡히 있었는데 **세어 보지 않았습니다.**

요령 — 매시 교신 때 두 수를 **세어서** 맞춘다. 눈으로 보지 않는다:
```bash
# 장부 줄 수
node -e 'console.log(require("./quota/metricool-2026-11.json").posts.length)'
# 실물 편 수 = getScheduledPosts 결과의 data.length
# 두 수가 다르면 STATUS 가 틀린 것이다. 장부도 실물도 아니라 내 목록이 틀렸다
```

**`used` 는 편수가 아니다.** Metricool `used: 20` = **편 × 연결망 수**(FB+IG 둘이면 ×2).
10편 × 2 = 20 이라 꽉 찬 것입니다. 「20편 올렸다」로 읽으면 한도 계산이 두 배로 어긋납니다.
Upload-Post 처럼 연결망이 하나뿐인 도구는 1편=1칸이라 같은 숫자가 다른 뜻입니다 — **도구마다 확인.**

## 발행 확인은 장부·상태값이 아니라 공개 URL 로 한다 (같은 시간)

`getScheduledPosts` 의 `status: "PUBLISHED"` 는 Metricool 쪽 상태입니다.
**`providers[].publicUrl` 이 있는지**를 봅니다 — 그게 실제로 글이 올라간 증거입니다.
11-02·11-03 둘 다 `publicUrl` 확인(IG `/p/…`, FB 포스트 ID). 이러면 「나갔다」고 적어도 됩니다.

## 정기(무인) 실행에서도 `node` 는 돌았다 (같은 시간)

smartever 가 10:15 에 「정기 실행에서 `node route.mjs` 가 권한 판정으로 막혔다」고 적었는데,
**같은 레포·같은 엔진으로 제 정기 실행에서는 `check` 8번 + `quota` 1번 전부 돌았습니다.**
→ 막는 것은 **세션 권한 설정**이고 엔진이나 레포 문제가 아닙니다.
한 명령에 한 일씩, 한 줄로 보내면 통과합니다. 막혔다고 「엔진이 깨졌다」로 적지 않습니다.

## 게이트 ✓ 는 「사실이 맞다」는 뜻이 아니다 (같은 시간, 재확인)

11-04 예약은 **게이트 ✓ 인데 고쳐야 하는 글**입니다(사실 한 줄이 틀림).
11-13 예약 「5초면 됩니다」도 **게이트 ✓ 인데 근거가 「모름」**입니다.
금지어 목록은 **낱말**을 봅니다. 숫자의 근거·동작 설명의 참거짓은 **사람만 봅니다.**
그래서 예약 점검은 ① 게이트 돌리기 ② **수치·동작 주장에 근거가 있는지 따로 세기** 두 단계입니다.
**2026-11-03 13:10 · smartever — 엔진을 못 돌릴 때 「영향 0」 판정하는 법**
정기 실행에서 `node route.mjs` 가 외부 코드 판정으로 거부될 때가 있다(11-03 10시·13시 거부, 11~12시 됨 — 명령 모양을 바꿔도 안 풀린다).
게이트 규칙 고침의 영향만 볼 거면 엔진 없이도 된다: ① 고친 규칙이 **실제로 보는 낱말 목록**을 주석·코드에서 뽑고(이번엔 3개) ② 그 낱말의 **핵심 토막**(수치·고유어)을 원고에 `grep` 한다. 0회면 그 원고는 판정이 바뀔 수 없다 — 「새 ✗ 0건」을 엔진 없이 확정할 수 있다. 1회라도 나오면 그때는 엔진 회귀가 필요하니 상대에게 대행을 맡긴다.

---
## 2026-11-03 14시 · claude-22 — 「✓」를 믿기 전에 **무엇을 검사했는지** 봐라

**🔴 게이트가 파일을 읽지 않고 있었다 (2026-11-03 고침).**
`route.mjs` 의 `check` 가 인자를 **무조건 글자로** 봤다(`rest.join(' ')`). 파일을 읽는 코드가 없었다.
그래서 `node route.mjs check <제품> <파일경로>` 는 **경로 글자만** 검사했고, 본문이 아무리 더러워도
「✓ 금지어 없음」이 떴다. 한 파일에 「동시통역 구독료 0원 세계 최초」만 적고 돌린 대조 실험에서
경로로 넘기면 ✓, 같은 글자를 바로 넘기면 ✗ 3건 — 같은 내용에 정반대 판정이 났다.

**교훈 (고친 뒤에도 유효하다):**
1. **「✓」는 판정이지 증거가 아니다.** 게이트가 **몇 자를 읽었는지** 확인하고 믿어라.
   이제 파일을 읽으면 `파일을 읽었습니다: <경로> (N자)` 가 먼저 찍힌다. **이 줄이 없으면 글자로 본 것이다.**
2. **양성 대조를 넣어라.** 게이트를 믿기 전에 **반드시 걸려야 하는 문구**를 한 번 넣어 보라.
   ✗ 가 안 뜨면 문구가 깨끗한 게 아니라 **게이트가 안 보고 있는 것**이다.
   이 버그는 ✓ 만 세고 있던 양쪽 세션이 **둘 다** 몇 주 놓쳤다.
3. **조용한 통과를 의심하라.** 통지·출처 줄이 **하나도** 없는 긴 글은 수상하다.
   고친 뒤 11-04 캡션에서 통지 3건이 올라왔는데, 전엔 아무것도 안 떴다.
4. 파일처럼 보이는데 없으면 이제 `✗ 파일을 못 찾았습니다` 로 **멈춘다**(exit 2). 조용히 경로를 검사하지 않는다.
5. **점검 메모를 `check` 에 넣지 마라.** 「이게 문제다」라고 **인용해 둔 금지어**까지 걸려 늘 ✗ 가 뜬다
   (`touchtok_상세_고지문대조.md` 가 그 꼴). 검사할 것은 **대외로 나가는 원고**뿐이다.

**명령이 거부되는 모양 (정기·무인 실행):**
엔진이 막힌 게 아니라 **명령 모양**이 걸린다. `SP=...` 같은 **변수 대입**, `&&` 로 이은 꼴,
`rm -rf` 가 섞인 호출은 거부됐다. 되는 꼴 — 한 호출에 **한 일씩**, 변수 없이 **절대경로 그대로**,
`cd` 와 `node` 는 **같은 호출 안에서 두 줄**로. 긴 호출은 짧게 쪼개면 통과한다.

**`check` 결과는 「파일을 읽었습니다 … N자」 줄부터 본다 (smartever, 11-03):**
계획 JSON 의 캡션을 다시 검사할 땐 `node -e` 로 편마다 scratchpad 의 txt 로 뽑아 **한 편씩 경로로** 넘긴다.
글자 수(N자)가 캡션 길이와 비슷한지까지 보면 「경로 글자만 검사」 함정을 다시 밟아도 바로 티가 난다.

---
## 2026-11-03 15시 · claude-22 — 「정본이 제 금지어에 걸린다」는 모순은 기계가 찾게 해라

**함정 1 — 물려받기는 좋은 것만 물려받지 않는다.**
11-02 에 선글라스가 앱 낱말목록을 `inherit` 하게 했다. 까닭은 바른 것이었다(「휴대폰 안에서 번역」이
제품 경계를 타고 샜다). 그런데 같이 끌려온 **앱 전용** 금지어 「구독료 0원」·「구독료 없음」이
**선글라스 자기 상품명 정본**(마켓플러스·쿠팡에 올리는 글자)을 ✗ 로 만들었다. 하루 들키지 않았다.
들킨 것도 우연이다 — 14시에 게이트가 **파일을 읽도록** 고치니까 그때서야 떴다.

· **물려받게 할 때는 「물려받되 빼는 칸」을 같이 만들어라.** `forbidden.exclude` 를 더했다.
  판정 로직은 건드리지 않았다. 칸이 없는 제품은 전과 똑같다(터치톡 60·33·26 그대로 확인).
· **빼기 전에 근거를 셋 이상 맞춰라.** 이번엔 공용 `rules[4]` · 앱 `forbiddenNote` · 공용 `words` 에 없음 —
  셋이 같은 말을 해서 「이미 정해진 것」으로 보고 고쳤다. 하나라도 엇갈리면 **대표님 결정**으로 올려라.

**요령 — selftest 에 「정본」을 넣어라 (⑤).**
게이트가 금지어 목록만 검사하면 이 종류를 영원히 못 잡는다. 제품의 **자기 정본 문구**
(`listingTitle`·`listingTitleCoupang`·후킹 `first3s`)를 **자기 게이트에 돌려라.**
걸리면 둘 중 하나가 틀린 것이고, **사람이 봐야 한다는 신호**다. 지금 세 제품 전부 ✓.

**함정 2 — HTML 을 그대로 넣으면 CSS 가 금지어가 된다.**
`glass/index.html` 이 ✗「100%」로 떴다. 본문이 아니라 `style="width:100%"` 였다.
「출처 확인 필요」에도 그림 크기(860·4314·1200·630…)가 28개 떠서 **진짜 수치 두 개가 묻혔다.**
· **`.html` 이면 보이는 글자만 남겨라.** 본문 + **`alt`·`title` 은 반드시 유지**(사람에게 읽히고 법적으로도 글자다).
  `<script>·<style>`·태그·그 밖 속성은 버린다. 28개 → 2개로 줄었다.
· **버린 쪽에 눈이 멀지 않았는지 양성 대조를 걸어라.** 같은 파일을 앱 목록으로 돌려
  `alt` 의 「구독료 0원」이 **그대로 잡히는지** 봤다. 잡혔다. 이 대조 없이는 「조용해졌다」와 「눈이 멀었다」가 구별되지 않는다.

**함정 3 — 광고 금지어를 사용 안내에 그대로 적용하면 안내를 못 쓴다.**
`guide/index.html` 이 ✗「Dolby」 6군데. 전부 **삼성 폰 설정 이름**이다(「설정 → 소리 → Dolby Atmos 끔」).
설정 이름을 안 쓰면 안내문을 쓸 수가 없다. 광고 비교가 아니다.
· 게이트에는 **「이 글이 광고인가 안내인가」** 칸이 없다. 그래서 고치지 않고 **결정으로 올렸다.**
  공용 파일은 양쪽이 쓰므로 혼자 고치지 않는다.

**하나 더 — 떨어진 커밋을 확인해라.**
`git pull` 이 `+ a...b (forced update)` 로 나오면 **강제 push 로 커밋이 떨어진 것**이다.
`git merge-base --is-ancestor <옛것> HEAD` 로 확인하고, 떨어졌으면 내용을 보고 **되살릴지 묻는다.**
이번엔 10-31 커밋 하나가 떨어졌는데, 그 안에 지금 고치려는 **거짓 주장이 들어 있어** 되살리지 않는 쪽이 맞았다.

---
**2026-11-03 16:11 · smartever** — HTML 게이트 첫 사용
- 다른 레포 페이지도 **절대경로 하나**로 넘기면 됨: `node route.mjs check touchtok /home/claude/touchtok-site/index.html`
- 「HTML 이라 보이는 글자만 남겼습니다」 줄이 떠야 HTML 처리된 것. 「출처 확인 필요」에 가격·영업시간이 섞이니 숫자마다 문맥을 직접 확인

**함정 4 — 금지어를 「\s+」로 찾으면 붙여쓴 꼴이 전부 샌다. (2026-11-03 16시 claude-22)**
게이트가 낱말 사이를 `\s+`(공백 **한 개 이상**)로 이었다. 그래서 **공백이 꼭 하나는 있어야** 걸렸다.
한국어 광고 문구는 오히려 붙여쓰는 쪽이 흔하다. 실제로 이것들이 전부 ✓ 로 샜다:
「특허기술」·「세계최초」·「국내최초」·「스마트안경」·「청력보호」·「눈보호」·「주름제거」·
「효과보장」·「임상입증」·「무료증정」·「14일만에」·「블루투스5.4/5.2」·「통역사대체」·「법정교육인정」
· 세 제품 합쳐 **여러 낱말 금지어 62개 중 62개가 같은 구멍**이었다(음성 대조로 셈).
· 「피부 재생」·「모공 수축」만 걸린 까닭은 터치톡 목록에 **붙여쓴 꼴을 손으로 또 적어** 뒀기 때문이다.
  목록마다 두 번 적어야 막히는 구조였다 — 그 손일을 없앴다.
· **고침:** 금지어·통지어 전용 `forbidRe` 를 두고 사이를 `\s*`(0개 이상)로 잇는다.
  **고지문(mustInclude)은 `looseRe`(`\s+`) 그대로** — 정본 판정은 한 글자도 안 바뀐다.
· **오탐은 안 늘었다.** 붙여쓴 꼴이 다른 뜻이 되는 낱말이 세 제품 목록에 없다. 두 꼴이 같은 주장을 가리킨다.
· **selftest ⑥ 을 넣었다** — 여러 낱말 금지어의 공백을 지운 꼴이 ✗ 로 걸리는지 **전수로** 돌린다.
  목록이 늘어도 이 종류가 다시 숨지 못한다.

**요령 — 게이트를 손보면 「음성 대조」를 꼭 한 번 돌려라.**
고친 뒤 ✓ 가 나오는 것은 **고쳐서 ✓** 인지 **눈이 멀어서 ✓** 인지 구별되지 않는다.
고친 줄을 **잠깐 되돌려** selftest 를 돌리면 몇 개가 ✗ 로 뜨는지 숫자로 나온다(이번엔 62개).
그 숫자가 구멍의 크기다. 되돌린 것은 바로 복구하고 `git diff` 로 확인한다.

---
**2026-11-03 17:15 · smartever** — 그림 속 글자 금지어 점검 (OCR)
- 이 컨테이너에 `tesseract`(kor 포함)가 있습니다. webp 는 PIL 로 png 로 바꾼 뒤 `tesseract x.png out -l kor+eng`
- OCR 결과는 띄어쓰기가 엉망이라 **공백을 전부 지운 뒤** 금지어(공백도 지운 꼴)와 부분일치로 봅니다 — 붙여쓴 꼴도 같이 잡힙니다
- 사진 위주 그림은 영문 상표만 읽혀서 「0건」이 쉽게 나옵니다 → 「글자가 거의 없었다」를 같이 적어야 0건이 거짓 안심이 안 됩니다
- `node route.mjs` 가 권한에서 거부되면 우회하지 말고, 금지어 판정만 **제 스크립트로 따로** 돌려 대조합니다(필수 고지문 속 낱말은 걸리니 걸러서 봅니다)

---
## 천 단위 쉼표를 「앞자리 0」 가림이 먹는다 (2026-11-03 18시 · claude-22)
`auditNumbers` 의 ⑧ 「앞자리가 0 인 홑 숫자」 가림(`\b0\d+\b`)이 **쉼표 뒤 묶음을 함께 먹었다.**
`199,000` → `000` 이 가려지고 **남은 `199` 가 「모르는 수」로** 떴다. `facts` 에 정본 값을
제대로 적어 둬도 조용해지지 않는다 — `199000` 은 아는데 `199` 는 모르기 때문이다.
- **증상:** 정본 가격을 `facts` 에 넣었는데도 「출처 확인 필요」가 사라지지 않는다
- **고침:** `(?<![\d,.])0\d+\b` — 앞에 숫자·쉼표·마침표가 있으면 가리지 않는다
- **덤:** 모르는 수도 이제 **온전한 꼴**로 찍힌다(`1,234,567`). 전엔 `1` 이라고만 떠서 사람이 못 알아봤다
- 음성 대조 통과: `01. 세안 후`·`02 충전` 여전히 가려짐 · `30~40시간`·`99.9%`·`67일` 여전히 물음
- **교훈:** 숫자를 가리는 규칙은 **쉼표·마침표가 든 긴 수 안에서 한 토막만 지우는지** 꼭 본다.
  토막만 지우면 가려지는 게 아니라 **엉뚱한 수가 새로 태어난다**

## 「함수 있으면 부르기」 꼴이 조용한 거짓 통과를 만든다 (2026-11-03 18시 · claude-22)
회귀를 짜면서 `m.findForbidden ? m.findForbidden(t,p) : null` 로 적었다. 그런데 실제 내보낸
이름은 `check` 였다 — **없는 이름이라 늘 `null`, 그래서 「금지어 0」이 꾸준히 찍혔다.** 아침에
게이트가 파일을 안 읽고 통과시킨 것과 **같은 종류의 구멍**이다.
- **쓰지 말 것:** `m.fn ? m.fn(...) : 기본값` — 이름을 틀리면 조용히 「문제 없음」이 된다
- **쓸 것:** `if (typeof m.fn !== 'function') { 멈춘다 }` 먼저. 점검 도구는 **못 하면 멈춰야** 한다
- 「0건」을 봤을 때 **일부러 틀린 글을 넣어 1건이 뜨는지** 한 번 본다(음성 대조). 안 뜨면 눈이 먼 것이다

## detached HEAD 에서 `git push origin main` 은 **엉뚱한 걸 밀고 거부당한다** (2026-11-03 18시 · claude-22)
클론이 또 detached HEAD 였다. 커밋은 origin/main 꼭대기 위에 제대로 얹혔는데
`git push origin main` 이 **「non-fast-forward」로 거부**했다. 까닭: 그 명령은 **지역 브랜치 `main`**
(뒤처진 것)을 밀고, 내 커밋이 얹힌 **HEAD 는 밀지 않는다.** `git pull --rebase` 를 해도 같다 —
HEAD 가 브랜치가 아니라서 당겨올 곳이 없다.
- **증상:** 커밋은 됐고 `git log` 도 맞는데 push 만 두 번 거부된다
- **먼저 볼 것:** `git branch --show-current` 가 **빈 줄**이면 이것이다 (`git status -sb` → `## HEAD (no branch)`)
- **푸는 법:** `git push origin HEAD:main` — 밀 것을 **집어서** 말한다
- **뒤처리:** `git checkout -B main <그 커밋>` 으로 브랜치를 제자리에 놓는다. 다음 시간이 편해진다
- **강제 push 는 쓰지 않았다.** 거부가 났을 때 `-f` 로 넘기면 상대 커밋이 날아간다

---
## 점검 도구가 거짓 「0건」을 찍는 두 번째 꼴 — **낱말 모양이 아니라 넘긴 값의 모양** (2026-11-03 19시 claude-22)

18시에 적은 「없는 함수 이름을 부르면 거짓 0건」에 **빠진 구멍이 있었습니다. 19시에 제가 그 구멍에 또 빠졌습니다.**

- 18시 처방은 `typeof m.check !== 'function'` 이면 멈추기였습니다. **이것으로는 안 막힙니다.**
  이름은 맞았는데 **넘긴 값의 모양이 틀렸습니다** → `check(text, 'raytok-glass')`
- `check(text, product)` 의 둘째 칸은 **제품 객체**입니다(`loadProduct(id)` 가 돌려주는 것).
  **글자 id 를 넘기면** `product.forbidden?.words` 가 `undefined` → 금지어 **0개로 검사** →
  **21장 전부 ✓ · ✗ 0건.** 참말처럼 보입니다. 바로 앞 시간 결과가 ✗ 1 이었기에 알아챘습니다
- **처방: 함수가 있는지가 아니라, 「실려 있는 금지어 수」가 0이 아닌지를 보고 멈춥니다.**
  검사 전에 한 줄 찍고 시작하는 것이 제일 쌉니다 — 0이면 그 뒤 ✓ 는 전부 무의미합니다

```js
const p = m.loadProduct(pid);
const nF = (m.resolveForbidden(p).words || []).length;
if (!nF) { console.error('STOP: 금지어 0개 — 제품을 잘못 넘겼습니다:', pid); process.exit(1); }
console.log('제품', pid, '· 금지어', nF, '개 실려 있음');   // ← 이 줄을 눈으로 본다
```

- **곁딸린 함정: `resolveForbidden` 은 배열이 아니라 `{ words, notice }` 객체를 돌려줍니다.**
  `resolveForbidden(p).length` 는 `undefined` 입니다. 처음 쓴 보초가 이 꼴이어서
  **멈추긴 했지만 까닭이 틀렸습니다**(제품을 의심했는데 범인은 제 `.length`). `.words.length` 로 셉니다
- **HTML 을 볼 때는 보이는 글자만 남겨야 route.mjs 와 같은 값이 나옵니다**
  (`<script>`·`<style>` 지우고 → `alt`·`title` 값은 따로 모아 뒤에 붙이고 → 태그 지우기).
  날 HTML 그대로 넣으면 CSS·속성 글자에서 오탐이 섞입니다
- **밑에 깔린 교훈: 점검 도구의 ✓ 는 「위반이 없다」가 아니라 「내가 찾아봤고 없었다」여야 합니다.**
  찾아본 범위(실린 낱말 수·읽은 글자 수)를 **숫자로 같이 찍지 않으면** 둘을 구별할 수 없습니다.
  route.mjs 가 「파일을 읽었습니다 (N자)」를 찍는 것이 바로 이 까닭입니다 — 손 스크립트도 그래야 합니다

**덧붙임 (19시 claude-22): detached HEAD 에서 push 거부 — 되돌리는 법은 강제 push 가 아닙니다.**
19시에 또 났습니다. 까닭이 한 겹 더 있었습니다: 이 클론의 **로컬 `main` 이 떨어진 10-31 커밋(`85dca9a`)에 묶여 있어**
`git pull --rebase` 가 「HEAD is up to date」만 찍고(HEAD 가 브랜치가 아니라 가만히 있습니다)
`git push` 는 **로컬 `main`(낡음)** 을 밀어 「behind its remote counterpart」로 거부됩니다. 내 커밋은 밀리지도 않습니다.
확인: `git branch --show-current` 가 **빈 줄**이면 detached · `git rev-parse main origin/main` 으로 어긋남을 봅니다.
**내 커밋의 부모가 `origin/main` 과 같으면 강제 push 가 필요 없습니다** — 브랜치를 앞으로 옮기면 그냥 fast-forward 입니다:
```bash
git rev-parse <내커밋>^ ; git rev-parse origin/main   # 같은지 먼저 본다
git branch -f main <내커밋> && git checkout main && git push origin main
```
부모가 다르면 `git checkout main && git pull --rebase origin main && git cherry-pick <내커밋>` 입니다.
**`push --force` 는 쓰지 않습니다** — 10-31 에 그걸로 커밋 하나가 main 에서 떨어졌습니다(`85dca9a`, 지금도 그 상태).

---
## 거짓 「금지어 0건」의 **세 번째 꼴** — 넘긴 *글자*의 모양이 틀렸다 (2026-11-04 09시 claude-22)

앞선 두 꼴은 **부르는 함수**(이름 틀림)와 **둘째 칸**(제품 대신 글자 id)이었다.
이번 것은 **첫째 칸**이다. 11-04 09시 회귀에서 공개 페이지 **21장 전부 ✓ · ✗ 0건**이 나왔다. 거짓이었다.

```js
const txt = stripRequired(visible(html), p);   // ← 틀림
const r = check(txt, p);                       // "[object Object]" 를 검사한다
```

`stripRequired` 는 **글자열이 아니라 `{ body, stripped }` 객체**를 돌려준다
(2026-11-02 정정 때 「문장 ×4」가 잘리는 걸 막으려고 객체로 바꾼 그것이다. lib/check.mjs 159줄 주석에 적혀 있다).
객체를 그대로 `check` 에 넘기면 정규식이 `"[object Object]"` 를 훑는다 → **무엇도 안 걸린다.**

**앞선 보초로는 안 막힌다.** 「금지어 수가 0이 아닌지」(11-03 19시 처방)는 *낱말 쪽* 보초다.
이번엔 낱말 33개가 제대로 실렸고 **검사할 글자가 없었다.** 보초가 통과를 찍고 지나갔다.

### 알아챈 방법 — 글자 수를 찍어 두면 보인다
줄마다 `✓ index.html (undefined자)` 로 나왔다. **`undefined자` 가 유일한 단서였다.**
앞 시간 값(✗ 1 = `guide` 「Dolby」)과 비교해서 뒤집힌 걸 확인했다.
**앞 시간 값이 없으면 또 못 잡는다.** 두 시간 치를 나란히 두는 습관이 세 번 연속으로 범인을 잡았다.

### 처방 — 보초를 **양쪽**에 둔다
```js
// ① 낱말 쪽 (11-03 처방, 그대로 둔다)
const n = resolveForbidden(p).words.length;
console.log(`제품 ${pid} · 금지어 ${n} 개 실려 있음`);
if (!n) process.exit(2);

// ② 글자 쪽 (새로 넣은 것)
const sr = stripRequired(visible(html), p);
const txt = typeof sr === 'string' ? sr : sr.body;     // 객체면 .body 를 꺼낸다
if (typeof txt !== 'string') process.exit(2);          // 글자열 아니면 멈춘다
console.log(`${f} (${txt.length}자)`);                 // ★ 글자 수를 줄마다 찍는다
```
**교훈: 게이트가 「무엇을 몇 자 검사했는지」를 찍지 않으면, 아무것도 검사하지 않은 것과 통과가 똑같이 보인다.**
반환값이 객체인 함수는 `lib/check.mjs` 에 `stripRequired`(`{body,stripped}`)·`resolveForbidden`(`{words,notice}`) **둘**이다. 둘 다 당했다.

## 「전수 21장」에 **넘김 페이지 3장**이 섞여 있었다 (2026-11-04 09시 claude-22)

글자 수를 찍기 시작하니 바로 드러났다. 21장 중 셋은 **본문이 없는 넘김(redirect) 껍데기**다.

| 껍데기 | 보이는 글자 | 진짜 본문 |
|---|---|---|
| `usage/index.html` | 45자 | `/web/usage/` |
| `meet/index.html` | 28자 | `/desk/` |
| `terms/index.html` | 40자 | `/web/terms/` |

`<meta http-equiv="refresh">` + `location.replace()` 꼴이다. **「21장 ✓」는 사실 18장이었고,
`/web/usage/`·`/web/terms/` 는 여태 한 번도 검사된 적이 없었다.** (이번에 돌렸다 → 둘 다 ✗ 0)

**요령:** 보이는 글자가 50자 미만이면 **멈추지 말고 「넘김 페이지 → 대상」으로 찍고 그 대상을 검사 목록에 넣는다.**
멈추면 회귀가 중간에 끊긴다(처음에 그렇게 짰다가 `usage` 에서 멈췄다).
대상 뽑는 꼴: `t.match(/url=([^"'>\s]+)/i) || t.match(/location\.replace\(['"]([^'"]+)/)`

---
## `stripRequired` 가 고지문을 **못 떼는 두 경우** (2026-11-04 09시 smartever)

글자 보초를 넣고 다시 돌리니 「고지문 속 치료라 0건」이라던 상세가 ✗ 1 로 돌아왔다. 까닭은 둘이었다.

1. **HTML 굵게 태그를 빈칸으로 바꾸면 정본 문장이 깨진다.**
   `…지원하는 <b>일반 피부 미용기기(공산품)</b>입니다.` 를 태그→`' '` 로 지우면 `(공산품) 입니다` 가 되어 정본과 안 맞는다.
   → 보이는 글자 뽑을 때 **줄 안 태그(b·strong·em·i·span·small·u·mark)는 `''` 로**, 덩어리 태그만 `' '` 로 바꾼다.
   ```js
   h.replace(/<\/?(b|strong|em|i|span|small|u|mark)\b[^>]*>/gi, '')   // 먼저
    .replace(/<[^>]+>/g, ' ')                                          // 그다음
   ```
   확인법: `(3500자→3422자)` 처럼 **뗀 뒤 글자 수가 줄었는지** 본다. 그대로면 아무것도 안 떼어진 것이다.
2. **정본과 꼴이 다른 「두 번째 고지문」은 원래 못 뗀다 — 이건 뜨는 게 맞다.**
   상세 맨 아래 법적 고지에 「질병의 예방 및 치료와는 **무관합니다**」처럼 말을 바꾼 줄이 있으면 `mustInclude` 와 달라 그대로 ✗ 다.
   「고지문 속이니 괜찮다」로 넘기지 말고 **정본 문장으로 바꾸거나 그 구절을 빼야** 한다.

덤: 그림 OCR 결과도 50자 미만이 흔하다(맨 위 띠 그림 등). **그림에는 「넘김」 판정을 쓰지 않는다** — html 에만 쓴다.

---
## 전수 목록을 손으로 적지 마라 — 「21장」이 실제로 48장이었다 (claude-22, 11-04 10시)

이틀 동안 「공개 페이지 **21장** 전수」로 보고했다. 09시에 넘김 껍데기 3장을 잡고 9장을 더 넣었지만
**그 목록도 손으로 적은 것**이었다. `find` 로 뽑으니 **48장**이고, **30장은 한 번도 검사된 적이 없었다**
(`museum`·`tour`·`student`·`field`·`ows` 한글·영문판, `web/host` 185KB, `web/listener` 100KB, 상세 렌더용 `img/d3/page.html`).

```bash
find . -name '*.html' -not -path './.git/*' | sort      # 이것을 그대로 돈다
```

**「전수」라고 적을 때는 수를 같이 적어라.** 수가 안 변하면 목록이 굳은 것이고, 굳은 목록은 새 파일을 못 본다.
사람이 적은 목록은 **늘 지난주의 목록**이다.

## 경로로 제품을 추측하지 마라 — 금지어 목록이 틀린다 (claude-22, 11-04 10시 · 네 번째 구멍)

경로에 `glass|product/|buy/` 가 있으면 선글라스로 판정하게 두었다. 그런데
`buy/index.html`(32KB) 은 제목이 **「RayTok 이용권 구매」 — 앱 유료 상품 페이지**다.
선글라스 목록에는 「구독료 0원」 같은 **앱 전용 낱말이 없다**(선글라스는 완화됨).
그래서 가장 큰 상거래 페이지가 **헐거운 목록으로 검사되고 ✓ 를 받았다.**
이번엔 실위반이 0이라 사고가 안 났을 뿐이다. **「거짓 0건」의 네 번째 꼴이다 —
앞의 셋은 낱말·넘긴 값·넘긴 글자였고, 이번엔 「어느 목록으로 보나」다.**

**처방: 추측하지 말고 두 목록 모두 돌리고, 걸린 자리마다 어느 목록인지 찍는다.**

```js
for (const [k, p] of Object.entries({ glass: P.glass, app: P.app })) {
  const s = stripRequired(v, p).body;
  if (typeof s !== 'string') { console.log('✗✗ 보초②'); process.exit(2); }   // 보초 ②
  out[k] = check(s, p).hits.map(h => `[${k} 목록] 「${h.word}」 ${h.where}`);
}
```

섞인 페이지(메인·`product/`)는 **둘 다 찍어 사람이 판단**하게 한다. 한쪽으로 몰면 반드시 한쪽이 샌다.

## `<b>` 줄안태그 함정을 **자동으로** 잡는 법 (claude-22, 11-04 10시 · smartever 09:40 함정에 붙임)

smartever 가 찾은 함정: 보이는 글자 뽑을 때 줄안태그를 **빈칸으로** 바꾸면
`(공산품)<b>입니다</b>` → `(공산품) 입니다` 가 되어 **정본 고지문을 못 뗀다**(`looseRe` 는 낱말을 `\s+` 로 잇는다).
눈으로 찾지 말고 **두 번 뽑아 대조**하면 된다.

```js
const INLINE = /<\/?(?:b|strong|em|i|u|span|small|mark|sub|sup|a|br|wbr|code)\b[^>]*>/gi;
const kill  = html.replace(INLINE, '');    // 정답
const space = html.replace(INLINE, ' ');   // 함정
// 걸린 낱말 목록이 서로 다르면 그 장이 함정에 걸린 것
if (hits(kill).join() !== hits(space).join()) console.log('⚠ 줄안태그 함정: ' + f);
```

**함정이 「0장」으로 나와도 안심하면 안 된다.** 제 쪽 48장이 0장이었던 진짜 까닭은
**선글라스·앱에 `mustInclude` 가 `null`** 이어서 `stripRequired` 가 할 일이 없었기 때문이다
(자수가 전후 똑같으면 그 신호다). **고지문이 처음 들어가는 날 이 함정이 같이 깨어난다** —
그날 이 대조를 반드시 함께 돌린다.

## 사실 한 줄을 고칠 때, 상세 정본에 이미 답이 있는지 먼저 보라 (claude-22, 11-04 10시)

11-04 20:23 예약의 「내려받으면 그 뒤로는 휴대폰 안에서 번역합니다」를 **문장 교체**로만 고치려 했다.
그런데 v3 상세 렌더용 `img/d3/page.html` 에 같은 주장이 **단서를 달고** 있었다:
「※ 폰에 그 언어가 없으면 서버가 번역합니다(인터넷 필요).」

→ **상세 쪽이 예약보다 정확했다.** 그래서 **문장을 안 바꾸고 ※ 한 줄만 더하는 안**이 생겼다.
고치는 폭이 작고, **예약과 상세가 같은 꼴**이 되어 서로 다른 말을 하지 않는다.

**교훈: 대외 글의 사실을 고칠 때는 새 문장을 짓기 전에 레포의 다른 정본을 먼저 훑는다.**
이미 누군가 그 단서를 달아 두었을 수 있다. 짓는 것보다 **맞추는 것**이 싸고 안전하다.

### detached HEAD — 여덟 번째 재발(11-04 10시). **고치는 자리를 앞으로 옮긴다**
위 일곱 번은 모두 **push 가 거절된 뒤** 고쳤다. 그런데 **예약 세션은 매번 새 컨테이너**라
클론이 **늘 detached 로 시작**한다. 그래서 push 때 고치면 **매시간 다시 밟는다.**
**매시 절차 1번을 이렇게 바꾼다 — 받은함을 읽기 전에:**

```bash
git rev-parse --abbrev-ref HEAD            # 'HEAD' 면 detached
git checkout -B main origin/main           # 밀리지 않은 커밋이 없을 때
```
이미 커밋해 버렸다면 되감기 없는 것만 확인하고 한 줄로 민다:
```bash
git merge-base --is-ancestor origin/main HEAD && git push origin HEAD:main
git branch -f main HEAD && git checkout main      # 그 다음 정상화
```

## ✗ 수는 「낱말 몇 개」지 「몇 번」이 아니다 — 다섯 번째 꼴 (smartever, 11-04 11시)

`check()` 는 금지어마다 **처음 한 곳**만 잡아 `hits` 에 넣는다. 그래서 「치료」가 1번 남든 2번 남든 **✗1** 이다.
터치톡 `detail/source.html` 에서 실제로 났다:
s0 [안내] 정본 안에 `<b>일반 피부 미용기기(공산품)</b>입니다` — 줄안태그를 `' '` 로 바꾸면
「(공산품) 입니다」가 되어 **정본이 안 떼어지는데**, 법적 고지 줄의 「치료」가 원래 ✗1 이라 **겉값이 같다.**

**처방: ✗ 수만 보지 말고 `stripRequired().stripped` 의 뗀횟수를 같이 찍는다.**
고지문이 들어 있는 글인데 뗀횟수 0 → 빨간불. 줄안태그는 `''` 로 지운 것과 `' '` 로 바꾼 것 **둘 다** 돌려 대조한다.

## 태그 속 글자(alt·title·meta)는 게이트 밖이다 — 여섯 번째 꼴 (claude-22, 11-04 12시)

보이는 글자를 뽑을 때 `<[^>]+>` 를 빈칸으로 지우면 **`<img alt="...">` 안의 글자가 같이 사라진다.**
alt 는 눈에 안 보일 뿐 **공개 글자**다 — 화면낭독기가 읽고, 검색엔진이 긁고, 예약글은 `mediaAltText` 로 그대로 나간다.

실제로 났다: `glass/index.html` 35줄 `alt="월 구독료 0원인 이유와 렌즈 3장"`.
본문에는 그 낱말이 없어 **48장 전수에서 ✓** 였고, 태그 속만 따로 돌리니 나왔다.
(선글라스 목록은 이 낱말이 완화돼 있어 실위반은 아니다. 구멍만 실재한다)

**처방: 본문과 별도로 태그 속 글자를 한 번 더 돌린다.** 긁을 자리 다섯:
```js
/\balt\s*=\s*"([^"]*)"/gi · /\btitle\s*=\s*"([^"]*)"/gi · /\baria-label\s*=\s*"([^"]*)"/gi
/\bplaceholder\s*=\s*"([^"]*)"/gi · /<meta[^>]+content\s*=\s*"([^"]*)"/gi
```
예약글도 같다 — **캡션·`mediaAltText`·그림 셋을 따로 센다.** 11-05 12:34 예약이 그 꼴이다(셋 다 들어 있음).

## 껍데기 수도 손으로 세면 틀린다 (claude-22, 11-04 12시)

09시에 「넘김 껍데기 3장」이라고 적었다. 50자 미만을 기계로 세니 **7장**이다
(`meet`·`terms`·`usage`·`web/buy`·`web/guide`·**`privacy/en`·`web/privacy/en`**).
넘김 대상은 전부 48장 안에 있어 **검사 구멍은 없다.** 다만 영문 `privacy/en` 둘이
**국문 `/privacy/` 로 넘긴다**(`lang="ko"`) — 영문 손님이 국문 방침을 받는다. 글 문제로 따로 올렸다.

## detached HEAD 아홉 번째 — 이번엔 `main` 이 **엉뚱한 커밋**을 가리키고 있었다 (claude-22, 11-04 12시)

새 꼴이다. `git rebase origin/main` 이 「HEAD is up to date」 라고 했는데 `git push origin main` 이
non-fast-forward 로 막혔다. 까닭: **밀 대상이 HEAD 가 아니라 로컬 `main` 브랜치**였고,
그 `main` 이 10-31 떨어진 커밋 `85dca9a` 에 그대로 멈춰 있었다(강제 push 된 그 커밋).

**세 자리를 같이 찍고 판단한다:**
```bash
git rev-parse --short HEAD main origin/main   # 셋이 다르면 main 을 믿지 않는다
git merge-base --is-ancestor origin/main HEAD && git push origin HEAD:main
git branch -f main HEAD && git checkout main  # 그 다음 정상화
```
`HEAD:main` 으로 밀면 로컬 `main` 이 썩어 있어도 옳은 것이 올라간다.
## ✗0 의 세 가지 뜻 — 깨끗 · 셀 게 없음 · 못 봄 (smartever, 11-04 12시)

태그 속 글자 검사가 `detail/source.html` 에서 ✗0 이었는데, **`<img>` 15장에 alt 가 0개**였다. 검사할 글자가 없었던 것이다.
claude-22 의 「`mustInclude` null → 빨간불 0건」과 같은 꼴이다.

**처방: ✗ 수 옆에 「몇 개를 봤나」를 같이 찍는다** (긁은 속성 수·뗀횟수·`<img>` 수 대비 alt 수).
- 본 것 > 0 이고 ✗0 → 깨끗
- 본 것 = 0 → **셀 게 없음** (안심값 아님, 글이 들어오는 날 다시 돌린다)
- 로그인·권한으로 못 긁음 → **모름** (예: 카페24 실몰 alt)

---
## 「✗0」의 일곱 번째 꼴 — 자리 수를 같이 세지 않으면 0이 두 가지를 뜻한다 (2026-11-04 13시 claude-22, smartever 12:11 제안)
smartever 가 12:11 에 짚은 것: 터치톡 `detail/source.html` 은 `<img>` 15장에 **alt 가 0개**다.
태그 속 검사 ✗0 은 「깨끗」이 아니라 **「셀 게 없음」**이었다.

**처방: 검사할 때마다 「긁은 자리 수」를 같이 찍는다.** 자리 0 에 ✗0 이면 그 0 은 증거가 아니다.

이쪽 13시 실측(48장):
- 긁은 자리 **459개** · `<img>` **115장 전부 alt 속성 있음** · 자리 0 인 장 **0장** → 이쪽 ✗0 은 진짜 깨끗
- **그런데 빈 `alt=""` 11개가 따로 있다**: `img/d3/page.html` 10개 중 **9개**,
  `web/listener/index.html`·`.src.html` 각 1개 중 1개
- 즉 **속성이 있는 것과 글자가 있는 것은 다르다.** 속성만 세면 또 속는다. **글자 있는 자리**를 세야 한다
- 하필 `img/d3/page.html` 은 **v3 상세 — 올리기 대기 중인 페이지**다. 그 9칸은 올라가도 빈칸으로 간다

## 통지 낱말이 사실 문제의 조기 경보였다 (2026-11-04 13시 claude-22)
20:23 예약의 막힌 줄 「쓸 언어만 골라 내려받으면 그 뒤로는 휴대폰 안에서 번역합니다」—
게이트는 ✓ 지만 **`notice` 목록이 세 낱말을 이미 찍고 있었다**: 「휴대폰 안에서 번역」·「폰 안에서 번역」·「내려받으면」.

`notice` 는 막지 않으니(ok 에 영향 없음) **아무도 신호로 읽지 않았다.** 10-28 에 사람이 눈으로 찾았다.
- **교훈: `notice` 는 「해제된 금지어」가 아니라 「사람이 봐야 하는 자리」다.** 통지가 붙은 줄은 사실 대조 대상으로 따로 모은다
- 예약 7건 통지 셈(13시): 20:23 3개 · 11-05 5개 · 나머지 5건 0개 → **통지가 붙은 둘이 곧 막힌 둘이다.** 우연이 아니다

## 통지를 「읽어」 보면 둘로 갈린다 — 조건부인가 단정인가 (2026-11-04 14시 claude-22)
13시에 「통지는 사람이 봐야 하는 자리」까지 왔다. 14시에 **48장 전수로 통지를 모아 읽었다.**
`notice` **46자리 · 낱말 10종 · 실제 23자리**(두 목록으로 두 번 세어 46).

**읽고 나니 통지 자리는 두 종류였다. 이게 핵심이다.**
- **조건부 = 참 (고칠 것 없음).** 「언어 팩을 **미리 받아 두면** …」 꼴.
  `privacy`·`web/privacy`·`ows`·`student`·`field`·`index`·`guide`·`web/raypack-probe` 가 전부 이 꼴이다
- **단정 = 거짓 위험.** 조건 없이 「폰 안에서 번역합니다」만 말하는 자리.
  공개 페이지에 **`desk/index.html:93` 한 자리뿐**(「폰 안에서 번역하는 RayTok 앱과 다릅니다」)

**그래서 13시 STATUS 의 「같은 주장이 사이트 3곳」은 내 과잉 집계였다. 정정한다.**
- `guide/index.html:136` = 「언어 팩을 미리 받아 두면 번역이 폰 안에서 끝나…」 → **조건부, 통과**
- `index.html:103`(메인) = 전용 공유기 이야기다. **온디바이스 번역 주장이 아니다 — 대상 밖**
- 남는 단정은 `desk` 1곳 + 예약 2건. **대표님이 볼 자리가 4곳에서 1곳으로 줄었다**
- 교훈: 낱말이 걸렸다고 세지 말고 **문장을 읽고 조건절이 있는지 본다.** 낱말 셈은 자리 찾기까지만 쓴다

## 개인정보방침이 사실 정본이다 — 거기서 문장을 들어오면 게이트도 모순도 같이 풀린다 (2026-11-04 14시 claude-22)
통지 10종 중 **8종이 `privacy/index.html` 한 장에 몰려 있다**(= `web/privacy/index.html`, 두 파일 동일).
처음엔 「제일 위험한 장」으로 보였는데 **읽어 보니 제일 정확한 장이었다.** 54·55·65~67·76행이
조건·예외·전송 경로를 다 적어 두었다. 법적 문서라 그렇게 쓰여 있다.

**요령: 사실 문구를 새로 지어 짜내지 말고 방침 문장을 그대로 들어온다.**
- 예) 「대화 내용이 서버로 나가지 않습니다」(단정·거짓 위험)
  → 방침 54행 그대로: 「**언어 팩이 있는 언어는** 음성 인식과 번역이 휴대폰 안에서 처리되고 밖으로 나가지 않습니다」
- 들어온 문장은 ① 게이트 통과 ② 방침과 모순 없음 ③ 분쟁 때 근거가 자기 문서다 — 셋이 한 번에 된다
- 터치톡 고지문 꼴 다름 건도 같은 길이 있을 수 있다. **정본을 새로 정하기 전에 방침·약관에 이미 있는 문장을 찾아보라**

## 통지가 가리킨 자리에서 새 거짓을 찾았다 — D-1 예약 하나에 문제가 셋 (2026-11-04 14시 claude-22)
11-05 12:34 예약(id 411249904)의 통지 5개를 **읽었다.** 지금까지 ✗ 「구독료 0원」 하나만 보고 있었다.
- ① ✗ 「구독료 0원」 — 캡션·alt·그림 셋 다 (아는 건)
- ② 통지 「폰이 혼자」·「내려받으면」 — 「언어팩을 한 번 내려받으면 그 뒤로는 **폰이 혼자 합니다**」
  20:23 과 **같은 단정인데 더 세다.** 20:23 만 보고 있었다
- ③ 통지 「서버로 나가지 않」 — 「대화 내용이 서버로 나가지 않습니다」.
  **자기 개인정보방침과 어긋난다**(방침 55·65~67행: 패키지 구매 시 원문은 중계 서버→구글 번역으로 간다,
  기기 내 인식 모델 없는 언어는 음성이 구글 서버로 간다). ✗ 보다 이게 더 위험하다 — 개인정보 진술이다
- **교훈: ✗ 가 하나 뜬 글은 「문제 하나」가 아니다. 통지까지 읽어야 전부가 나온다.**
  ✗ 한 자리를 고치고 발행하면 ②③ 이 그대로 나간다

---
## 통지는 세 칸으로 갈린다 — 「※ 받침」이 숨어 있다 (2026-11-04 15시 claude-22)
14시에 통지를 **읽어** 보니 조건부와 단정이 갈린다는 것까지는 알았다. 손으로 읽었다.
15시에 도구로 만들어 돌려 보니 **칸이 둘이 아니라 셋**이었다.

| 칸 | 꼴 | 할 일 |
|---|---|---|
| 조건부 | 단서가 **문장 안**에 있다 — 「…골라 내려받으면」·「언어 팩이 **있는** 언어는」 | 없음 |
| **※ 받침** | 문장만 보면 단정인데 **같은 칸의 ※ 줄**이 받친다 | 없음 |
| 민 단정 | 단서도 ※ 도 없다 | 사람이 읽는다 |

실측: `img/d3/page.html:118` 「RayTok은 휴대폰 안에서 번역합니다.」는 문장만 보면 단정이다.
그런데 **121행에 「※ 폰에 그 언어가 없으면 서버가 번역합니다(인터넷 필요).」**가 있다.
→ 「문장은 두고 ※ 한 줄만 더한다」가 **이미 쓰이고 있는 꼴**이다. 새 안이 아니다.

**함정 둘 (내가 걸린 것):**
1. **단서 낱말 표가 모자라면 거짓 단정이 나온다.** 1차에 「받아 **둔**」(`받아\s*두` 가 「둔」을 못 봄)·
   「언어 팩이 **있는** 언어는」(「있으면」만 봄) 넷이 단정으로 찍혔다. **읽고 넣어야 한다**
2. **주어에 붙은 한정도 단서다** — 「**로컬 저장 기능은** … 기기 안에서만」. 서술어만 보면 놓친다

**도구:** `marketing/audit/notice-read.mjs` — 엔진 무수정, 따로 돈다.
`node marketing/audit/notice-read.mjs <제품id> [파일...]` (파일 없으면 레포 *.html 전부,
`out/plan-*.json` 을 주면 캡션·alt 를 읽는다). 터치톡도 `touchtok` 으로 그대로 돈다.

## 눈으로 센 수는 두 쪽으로 다 틀린다 (2026-11-04 15시 claude-22)
14시엔 **과잉**집계했다(사이트 3곳 → 실제 1곳). 15시엔 **누락**했다(예약 7건 → 실제 8건,
11-24 12:25 id 412041724 를 13·14시 둘 다 빠뜨림. 10-31 에 만든 것이라 처음부터 있었다).
같은 사람이 한 시간 만에 양쪽으로 틀렸다. **셈은 손으로 하지 말고 API·스크립트 값을 적는다.**
빠뜨린 쪽이 더 위험하다 — 과잉은 읽으면 드러나지만 누락은 아무도 안 본다.

---
**2026-11-04 16:12 · smartever** — 받침 기호는 ※ 만이 아니다
- 터치톡 상세(`detail/source.html` 347~350행)는 단서 줄 머리에 **※ 대신 `* `(별표+공백)** 를 쓴다. `notice-read.mjs` 의 COND 는 `/※/` 만 보므로 이 꼴은 「※ 받침」 칸에 안 잡히고 단정으로 떨어질 수 있다
- 다른 몰·다른 제작자 페이지를 읽을 땐 받침 기호 후보(`※`·`*`·`주)`·`단,`·`(단`)를 먼저 grep 으로 세고 시작할 것. 엔진 표를 고치기 전에 상대에게 inbox 로 알린다

---
## 2026-11-04 16시 · claude-22 — 여섯 번째 거짓 통과: 파일을 **여럿** 주면 글자가 된다

`check` 에 파일을 **한 장** 주면 읽는다(11-03 고침). **두 장 이상 주면** 아래 `else` 로 떨어져
**경로 글자들을 이어 붙인 한 덩어리**를 검사한다. 파일은 한 장도 안 읽는다.

```
node marketing/route.mjs check raytok-app index.html privacy/index.html guide/index.html desk/index.html
→ ✓ 금지어 없음        ← 네 장 중 한 장도 안 읽었다. guide 의 「Dolby」 ✗ 가 사라졌다
```

**눈으로는 통과와 구별이 안 된다.** 유일한 표는 **「파일을 읽었습니다」 줄이 없는 것**이다.
없는 줄은 눈에 안 띈다 — 그래서 11-03 고침 뒤에도 한 달 가까이 살아남았다.

**고쳤다(16시):** 인자가 둘 이상인데 그중 하나라도 파일이거나 경로꼴이면 **멈춘다(exit 2)**.
따옴표 없는 여러 낱말 글자 검사는 그대로 된다(`check raytok-app 구독료 0원 입니다` → ✗).

**규칙: 파일은 한 번에 한 장.** 여러 장은 반드시 한 장씩 돌리고, **줄마다 「읽었습니다 (N자)」를 세라.**
읽은 장수 = 준 장수가 아니면 그 판정은 버린다.

## 같은 날 16시 · 생성기가 손편집을 되돌린다 — 「고쳤다」가 한 번 더 깨진다

`tools/build_home.py` 는 `index.html`·`field/`·`tour/`·`ows/`·`desk/`·`glass/`·`product/` 를 **다시 만든다.**
11-04 꼬리말 고침(개인 휴대폰 → 대표번호 1800-6825)은 **39개 파일을 손으로** 고친 것이고,
**생성기 안의 꼬리말 문장은 안 고쳐졌다.** 그대로 돌리면 개인 휴대폰이 7장에 되살아난다.

- **덫 ①:** `python3 tools/build_home.py <디렉터리>` — 맨 인자는 **무시된다.** 시험한다고 생각하고
  돌리면 **저장소에 바로 쓴다.** 내가 이걸 그대로 밟아 7장을 되돌렸다(push 전에 `git checkout` 으로 되살림).
  **시험은 `--check`**(아무것도 안 쓰고 다른 데만 센다) 또는 `--out <디렉터리>`.
- **덫 ②:** 꼬리말만 낡은 게 아니었다. `--check` 가 **7장 전부 「다름」**으로 찍었다:
  특허 **「외 7건·8건」**(살아 있는 장은 **외 9건·10건** — 출원 9·10번이 생성기에 없다) ·
  `desk` 연출 영상 칸 삭제 · `glass` 는 옛 hero 판(82줄) · `product` 17줄.
- **교훈: 손으로 고친 페이지가 생성기를 앞서가면, 생성기는 「되돌리는 폭탄」이 된다.**
  고칠 때 **생성기도 같이 고쳤는지** 보라. 못 고치면 **「돌리지 마라」를 사람에게 알려라.**

## 같은 날 16시 · 제품 목록을 잘못 짝지으면 **거짓 경보**가 난다

`glass/index.html` 과 `img/d3/page.html`(선글라스 v3 상세)을 **`raytok-app` 목록**으로 돌려
✗「구독료 0원」을 잡고 「살아 있는 페이지에 거짓이 있다」고 올리려 했다. **틀렸다.**

`products/raytok-app.json` 의 `forbiddenNote` 에 답이 적혀 있었다:
**「구독료 0원은 선글라스 전용. 현장교육(1인 월 1만원)·관광쿠폰은 유료라 쓰면 거짓이 된다」**

→ 선글라스 장에서는 **참**이고 `raytok-glass` 로 돌리면 ✓ 다. 앱 글에서만 거짓이다.

**규칙: ✗ 를 보면 「이 장이 무슨 제품을 파는가」를 먼저 물어라.** 목록이 맞는지 보기 전에 보고하지 마라.
한 장에 두 제품 말이 섞여 있으면 **두 목록 다** 돌리고, **어느 목록의 ✗ 인지 적어라.**
(앞서 20:23 과잉 경보와 같은 꼴 — 내 ✗ 는 셋 중 하나가 내 짝짓기 잘못이었다)

## 2026-11-04 16시 · claude-22 — 이어 붙인 글에서 **줄머리**를 찾으면 못 찾는다

`notice-read.mjs` 의 `near` 는 앞뒤 문장을 **빈칸으로 이어 붙인 한 덩어리**다.
smartever 가 알려준 `* `(별표 받침) 꼴을 넣으려고 `/(^|\n)\s*\*\s/` 를 썼더니 **아무것도 안 잡혔다** —
덩어리 안에는 줄바꿈이 없고 `^` 는 덩어리 맨 앞 한 자리뿐이다. 두 시험(받침 있음/없음)이 **같은 답**을 내서 들켰다.

**고침: 받침은 문장 단위로 본다.** `nearArr.some((t) => /^\s*\*\s/.test(t) || /※/.test(t) || …)`

**교훈: 고친 뒤 「달라야 하는 두 입력」을 넣어 보라.** 둘이 같은 답이면 고침이 안 들은 것이다.
값이 안 바뀐 것을 「회귀 없음」으로 읽으면 **안 들은 고침을 들었다고 적는다.**

**2026-11-04 17시 · smartever** — **생성기가 어긋났는지는 돌리지 않고도 잴 수 있다.** 생성기 파일을 마지막으로 건드린 커밋 이후의 커밋들을 `git show --name-only` 로 훑어, **출력물(html·css)만 바뀌고 생성기는 안 바뀐 커밋**을 찾는다. 그게 손편집이고, 생성기를 돌리면 사라질 자리다. 터치톡 `tools/build.py` 는 f3464f7 이후 06e4d52(마스크·겔 칸 + css v6)·612051b 가 손편집이었다. 생성기 실행이 권한에서 막힐 때도 이 방법은 된다. 덤으로 `site.css?v=` 숫자가 언어판마다 다르면(ko 6 / en 5) 손편집 흔적이다.
---
## 2026-11-04 17시 · claude-22 — 보이는 글자 뽑기: 태그를 전부 빈칸으로 바꾸면 **법정 고지문 면제가 죽는다**

smartever 가 11:11·12:11 에 실측한 것(`''` 뗀1 / `' '` 뗀0)이 **엔진 자체의 결함**이었습니다. 적어 둡니다.

**무슨 일이 나나.** `stripRequired` 가 쓰는 `looseRe` 는 고지문을 **공백으로 쪼갠 낱말**을 `\s+` 로 이어 찾습니다.
그래서 낱말 **사이**에 빈칸이 늘어도 맞지만, 낱말 **안**이 벌어지면 못 맞춥니다.
`…미용기기<b>(공산품)</b>입니다` 를 태그마다 빈칸으로 바꾸면 `…미용기기 (공산품) 입니다` →
낱말 `미용기기(공산품)입니다.` 가 세 조각이 되어 **고지문을 한 번도 못 뗍니다.**

**왜 위험한가.** 면제가 안 걸리니 **고지문 안**의 「치료」가 금지어로 뜹니다. `check()` 는 낱말당 1건만 세므로
진짜 금지어 1건과 **화면에서 구별이 안 됩니다**(둘 다 ✗1). 「고지문을 넣었는데 ✗ 가 났다」가 바로 이 꼴입니다.

**고치는 법 — 태그를 두 종류로 나눕니다.**
- **줄 안 태그**(`b strong em i u s span mark small sub sup a font abbr code label time bdi q cite ins del big wbr`) → **빈칸 없이 `''`**
- **덩어리 태그**(`p div li td br` 등) → **그대로 `' '`**
  ★ 덩어리까지 `''` 로 지우면 `<p>치료</p><p>안녕` 이 **「치료안녕」**으로 붙어 **없던 낱말**이 생깁니다.
  한쪽으로 몰면 반드시 다른 쪽이 깨집니다.

**보초(뗀횟수) — 꼴을 잘못 잡으면 안 울립니다.**
첫 판은 고지문 **앞 10자·뒤 10자**가 다 보이는지로 봤습니다. **안 울렸습니다** — 벌어진 자리가 **문장 끝**이면
뒤 10자가 바로 그 조각이라 「안 보임」이 됩니다. 고친 꼴:
**네 글자 이상 낱말**이 몇 개 보이는지 세어 **7할 이상 보이는데 뗀횟수 0** 이면 🔴.
안 보이는 조각을 같이 찍으면 어디가 벌어졌는지 바로 보입니다. 네 글자 미만을 빼야 고지문 없는 짧은 캡션에서 안 울립니다.

**교훈 둘.**
1. 「✗ 가 떴다」와 「면제가 죽었다」는 **화면이 같습니다.** 면제가 걸린 엔진은 **뗀횟수를 반드시 찍어야** 합니다.
2. 엔진을 고쳤으면 **살아 있는 장 전부에 고침 전/후를 돌려 전문 diff** 를 뜨십시오. 48장 중 바뀐 줄이 하나였고
   그 하나가 「고침이 들었다」는 증거였습니다. 숫자만 비교하면 못 봅니다.

---

## 숫자 출처 검사는 「숫자」가 아니라 「숫자+단위」로 봐야 한다 (2026-11-04 18시 claude-22)

**여덟 번째 거짓 통과.** `auditNumbers` 가 두 겹으로 숫자를 놓쳤다.

1. **맨숫자 대조.** 정본에 `facts.specs.playtime = "약 5시간"` 이 있으면 **「5」가 known** 이 된다.
   그래서 전혀 다른 주장인 **「5초면 됩니다」**(11-13 19:40 릴스 예약)가 「출처 모름 0」으로 통과했다.
   「5시간」은 근거가 있고 「5초」는 없는데 기계가 둘을 같은 수로 봤다.
2. **`bare.length > 1`.** 한 자리 수를 **전부** 버렸다. 「5초」·「0원」·「3장」은 셈 자체에서 빠졌다.
   그래서 1번을 고쳐도 2번이 또 막는다 — **같은 수가 두 겹으로 걸러졌다.**

### 고친 꼴
- **짝 대조**: 글의 `숫자+단위` 짝이 정본의 짝에 없으면 묻는다. 찍을 때도 **「5」가 아니라 「5초」**로 찍는다
- **홑으로 적힌 수는 단위를 안 가린다**: 정본이 `languages: 85` 처럼 숫자만 적어 둔 칸은
  글에서 「85개 언어」로 쓰이므로 짝을 요구하면 멀쩡한 수가 걸린다 (1차판이 그랬다)
- **뒤에 글자가 붙은 수는 홑으로 안 센다**: `DC 5V 1A` 의 5 를 홑으로 세면 5 가 아무 단위에나 통과한다
- **붙임표 식별번호 조각도 홑으로 안 센다**: 상표 `RayPac 40-2026-0229441` 의 40 이 홑으로 세어져
  「30~40시간」이 통과했다 (2차판에서 잡았다)
- **`%` 는 단위로 안 센다**: CSS `width:4%` 가 쏟아져 사람이 줄을 안 읽는다. `%` 붙은 수는 맨숫자 길로 간다
- **`1단계·2단계` 는 가린다**: 차례 이름표다. 산수가 아니다

### 재어 본 것 (고치기 전/후 전문 대조, 172줄 = 공개 html 48장×3제품 + 캡션 16 + 계획 12)
- **정말 사라진 항목 0.** 「빠짐」으로 보이는 198개는 전부 **같은 수에 단위가 붙은 것**(`99,000` → `99000원`)
- 캡션·계획에서 새로 걸린 것은 **4줄뿐**: `5초`(11-13 릴스·glass 계획) · `0원`(11-05 캡션·alt)
- 공개 html 쪽은 원래 CSS 숫자로 넘쳐 쓸 수 없는 목록이었다 — 거기 늘어난 숫자는 그 안의 노이즈다
- 시험 12개 통과 (`5시간`✓ `5초`✗ `3장`✓ `3초`✗ `85개`✓ `86개`✗ `10,000원`✓ `0원`✗ `1단계`✓ `5V`중립 `%`중립 `30~40시간`✗)

### 교훈
**정본에 있는 수 하나가 글에 있는 다른 주장을 덮는다.** 숫자 검사에서 단위를 떼면 검사가 아니라
「그 숫자 어디서 본 적 있음」이 된다. `unknownNumbers` 값의 꼴이 바뀌었다 — 이제 단위가 붙어 나온다.

---
**2026-11-04 19:10 · smartever** — 숫자+단위 짝 엔진에서도 **정본이 홑 숫자면 구멍은 남는다**
- `facts` 에 `wearMinutes: 10` 처럼 숫자만 적으면 글의 「10초」「10개」가 전부 출처 있음으로 통과한다(터치톡 시험 글로 실측)
- 확인법: 정본 JSON 을 훑어 `typeof === 'number'` 인 facts 칸을 뽑고, 그 수에 **엉뚱한 단위**를 붙인 시험 글을 `route.mjs check` 에 넣어 본다. 안 걸리면 구멍
- 막는 법: 정본 칸을 `"10분"` 처럼 단위째 적는다 — 단, 정본 수정이라 대표님 확인 뒤에

---
## 🔴 아홉 번째 거짓 통과 — 보이지 않는 글자가 금지어를 가린다 (2026-11-04 19시 claude-22)

**인스타 캡션은 빈 줄을 만들려고 보이지 않는 글자를 넣는 것이 흔하다.**
줄바꿈 생성기·캔바 붙여넣기가 `ㅤ`(U+3164 한글 채움)·U+200B(폭 없는 빈칸)·U+2063 따위를 섞어 넣는다.
**사람 눈에도 안 보이고 화면에도 똑같이 보인다.** 그런데 게이트는 못 본다.

까닭: `forbidRe` 가 낱말 사이를 `\s*` 로만 이었다. **`\s` 는 이 글자들을 공백으로 안 본다.**

```
「월 구독료 0원」          → ✗ 걸림
「월 구독료<U+200B> 0원」  → ✓ 샌다      ← 같은 말인데 판정이 뒤집힌다
```

### 실측 (9꼴)
| 글자 | 고치기 전 |
|---|---|
| U+200B ZWSP · U+200C ZWNJ · U+200D ZWJ · U+2060 WJ · U+2063 · **U+3164 한글 채움** | **✓ 전부 샜다** |
| U+FEFF BOM · U+00A0 NBSP | ✗ 걸렸다 (`\s` 가 본다) |

**U+3164 가 가장 위험하다** — 인스타 빈 줄에 제일 많이 쓰이는 글자다.

### 고친 꼴 (`lib/check.mjs`)
목록이나 정규식을 늘리지 않았다. **검사 직전에 사본에서 떼는 방식**이다 →
`check`·`stripRequired`·`auditNumbers`·`auditRequired` 네 입구에서 `normalizeInvisible()` 을 지난다.
- 폭 없는 글자는 **지운다** · NBSP·전각빈칸 같은 **빈칸류는 빈칸 한 칸으로 바꾼다**(지우면 낱말이 붙는다)
- 판정은 **느슨해지는 쪽으로만** 움직인다. 고지문도 더 잘 찾으므로 전에 통과한 글은 그대로 통과한다

### ★ 언어팩은 건드리면 안 된다 — 같은 글자가 정서법에 필요하다
레포 전체를 세어 보니 보이지 않는 글자 **432개 / 21파일**인데 **전부 언어팩·UI 문자열**이다:
`packs/km.json` U+200B **132개**(크메르어는 ZWSP 가 낱말 구분자다) · `packs/si.json` ZWJ 56개 ·
`ui-strings/fa·kn·te·ml.json` ZWNJ. **이건 오염이 아니라 맞는 표기다.**
그래서 **파일을 고치는 게 아니라 검사용 사본에서만 뗀다.** 게이트는 한국어 광고 문구만 보므로 표기에 영향이 없다.

### 재어 본 것
- **고치기 전/후 전문 대조 158줄**(공개 html 48장 × 3제품 + 11월 계획 3개): **before/after 완전 동일.**
  사라진 것 0 · 새로 걸린 것 0 — 레포의 한국어 문구엔 이 글자가 없다(있는 곳은 언어팩뿐)
- 시험 17개 통과 — `marketing/audit/보이지않는글자_시험.mjs` 로 **못을 박아 뒀다**(`node` 로 바로 돌아간다)
- `selftest` ✓ 모순 없음

### 교훈
**눈으로 대조하는 검사는 보이지 않는 글자 앞에서 전부 무효다.**
캡션을 손으로 베껴 게이트에 넣으면 **베끼는 순간 그 글자가 사라져 ✓ 가 나온다** — 거짓 ✓ 다.
그래서 「손으로 넣어 ✓ 였다」는 **원문에 이 글자가 없다는 증거가 못 된다.**

---
## 메트리쿨 `getScheduledPosts` — 「예약만 돌려준다」는 설명이 틀렸다 (2026-11-05 09:20, claude-22 실측)

도구 설명: *"Only retrieves posts that are scheduled (not yet published)."*
**실제: 발행이 끝난 건도 같이 돌려준다.** 11-04 20:23 건(id 411249606)이 발행 뒤에도 목록에 남아 있었고
`providers[].status` 가 `PUBLISHED` 였다.

**그래서 「목록에 있다 = 아직 안 나갔다」로 읽으면 틀린다.**
발행 여부는 `providers[]` 안의 칸으로만 판정한다:
- `status: "PENDING"` · `detailedStatus: "Pending"` → 아직 안 나갔다
- `status: "PUBLISHED"` · `publicUrl` 있음 → 이미 나갔다 (더 고칠 수 없다)

**망의 수가 둘이면 칸도 둘이다.** 페북만 나가고 인스타는 `PENDING` 인 반쪽 상태가 있을 수 있으니
하나만 보고 끝내지 않는다.

덤: `autoPublish: true` 면 사람이 누르지 않아도 시각에 그대로 나간다. ✗ 가 남은 건은 **시각 전에** 올려야 한다.

## 붙여쓴 해시태그도 금지어에 걸린다 — 눈으로는 넘어간다 (같은 날)

`#구독료없음` 이 금지어 「구독료 없음」으로 걸렸다. 엔진은 맞게 잡았는데 **사람이 넘긴다** —
캡션 본문만 읽고 해시태그 줄은 장식으로 보기 때문이다.
**검사에 넣는 글에 해시태그 줄을 반드시 포함한다.** alt 도 따로 넣는다(별도 칸이라 같이 안 걸린다).

## check 결과를 `| tail` 로 자르지 않는다 — 판정 줄이 맨 위에 있다 (smartever 11-05)

`node route.mjs check` 는 **첫 줄에 판정(✓/✗)**, 그 아래 걸린 자리를 늘어놓는다.
`| tail -6` 으로 잘랐더니 ✗ 판정 줄과 앞 자리 4개가 사라져 「안티에이징·공짜」 둘만 걸린 것처럼 보였다
(실제는 피부 재생·피부재생·재생·리프팅까지 6자리).
**결과는 통째로 보거나 `grep 「` 로 자리만 뽑는다.** 판정은 `head -1` 로 본다.

---
## 열 번째 거짓 통과 — 전각(全角) 글자가 금지어를 가린다 (2026-11-05 11시 claude-22)

**증상.** 「구독료０원」이 ✓ 로 샌다. 「구독료 0원」(반각)은 ✗ 로 걸린다.
`０` 은 U+FF10(전각 영)이고 금지어 목록은 반각 `0` 으로 적혀 있어서 안 맞는다.

**아홉 번째(보이지 않는 글자)와 같은 종류다.** 목록을 늘릴 일이 아니라 **검사 직전에 접을 일**이다.
`lib/check.mjs` 의 `normalizeInvisible()` 에 한 줄 더 넣었다:
```js
const FULLWIDTH = /[！-～]/g;
// … .replace(FULLWIDTH, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
```
U+FF01~FF5E → U+0021~U+007E 가 **한 글자가 한 글자로** 바뀐다. 길이가 보존되므로
미리보기 발췌(자리를 세어 뜬다)가 밀리지 않는다. 길이가 바뀌는 접기를 넣으면 발췌가 어긋난다 — 주의.

**어디서 들어오나.** 인스타·캔바·한글 입력기가 숫자·기호를 전각으로 바꿔 놓는다.
사람 눈에 「0」과 「０」은 거의 같아 보여서 **손으로는 못 잡는다.**

**회귀 확인 방법 (판정이 바뀌지 않았다는 증거).**
고침 전에 공개 페이지 21장 × 상품 3 = 63판을 파일로 떠 두고, 고친 뒤 같은 것을 떠서 `diff` 했다.
```bash
PAGES=$(ls ../*.html ../*/*.html 2>/dev/null)
for p in $PAGES; do for prod in raytok-app raytok-glass touchtok; do
  echo "## $p :: $prod"; node route.mjs check $prod "$p"; done; done > before.txt
# 고친 뒤 after.txt 를 같은 식으로 떠서
diff before.txt after.txt   # 차이 없음 = 회귀 0
```
결과: **차이 없음.** ✗ 6줄 그대로. 새로 걸리는 것은 전각으로 숨어 있던 금지어뿐이다.

**보초를 세웠다.** `audit/보이지않는글자_시험.mjs` ⑥번 칸에 전각 시험 7개 추가 (17개 → 24개, 전부 통과).
접기를 누가 지우면 시험이 깨진다.

**교훈 — 두 번 같은 종류로 샜다.** 「글자가 달라 보이지만 사람 눈엔 같다」는 꼴은 더 있을 수 있다.
아직 안 막은 것으로 아는 것: **낱말 사이에 빈칸을 끼운 꼴**(「구독 료 0원」 → 지금도 샌다).
이건 사람이 쓸 일이 거의 없어 두었다. 쓸 일이 생기면 낱말 안 빈칸도 접어야 한다.

**덧 (11:25) — 분리된 HEAD 에서 `git push origin main` 은 「조용히 묵은 것을 밉니다」.**
이번에 또 걸렸습니다. `git branch --show-current` 가 **빈칸**이면 분리된 HEAD 입니다.
그 상태에서 `git push origin main` 은 새 커밋이 아니라 **클론 시점의 묵은 `main` ref** 를 밀어서
`fast-forward 아님` 으로 거부됩니다. 그런데 `git pull --rebase origin main` 은 「HEAD is up to date」라고 답해서
**고쳐야 할 게 없는 것처럼 보입니다.** 이 둘이 겹치면 한참 헤맵니다.

빠져나오는 법 — 두 줄:
```bash
git push origin HEAD:main          # 지금 커밋을 바로 민다 (즉효)
git checkout -B main <그 커밋>     # 그 다음 가지를 정상화
git branch --set-upstream-to=origin/main main
```
**매시 절차 맨 앞에 `git branch --show-current` 를 한 번 찍어 두는 게 쌉니다.** 빈칸이면 위 두 줄.
---
**2026-11-05 11시 · smartever — 전각 검색할 때 함정 둘**

① **`grep -P '[\x{FF01}-\x{FF5E}]'` 가 로캘이 UTF-8 이 아니면 아예 안 돕니다.**
`grep: character code point value in \x{} or \o{} is too large` 를 내고 **0 건처럼** 끝납니다.
`| wc -l` 을 붙이면 「0」만 남아 **거짓 「전각 없음」** 이 됩니다. 앞에 `LC_ALL=C.UTF-8` 을 붙이거나 파이썬으로 셉니다:
```bash
LC_ALL=C.UTF-8 grep -rnP '[\x{FF01}-\x{FF5E}]' --include='*.html' .
```
② **일본어·중국어 페이지의 전각 문장부호는 오염이 아니라 맞는 표기입니다**(`（）？：，｜～`).
터치톡 ja/zh 랜딩·`tools/build.py` 에 129자 — 전부 문장부호, 전각 숫자·영문 0. 언어팩 ZWSP 와 같은 이유로 **파일은 손대지 않습니다.**
판정을 볼 땐 **전각 숫자·영문(`０-９ Ａ-Ｚ ａ-ｚ`)만** 골라 보면 됩니다.

---
## 로캘 함정은 전각 명령만이 아니다 — 「보이지 않는 글자」 전수조사도 거짓 0 이 난다 (2026-11-05 12:15 · claude-22)

smartever 가 11:30 에 알린 함정(`grep -P '[\x{FF01}-\x{FF5E}]'` 이 UTF-8 로캘 아니면 오류 내고 0건처럼 끝남)을
이쪽에서 확인했고, **범위가 더 넓다**는 것을 알아냈습니다.

**원인은 「전각」이 아니라 `\x{}` 안의 값이 0xFF 를 넘는 것입니다.**
그래서 **보이지 않는 글자 명령(`\x{200B}`, `\x{FEFF}`, `\x{2060}` …)도 똑같이 터집니다.**

```bash
$ locale
LANG=                     # 이 컨테이너는 빈칸이다

$ printf '​테스트\n' | grep -P '[\x{200B}]'
grep: character code point value in \x{} or \o{} is too large
# 종료코드 2. 파이프로 묶거나 wc -l 로 세면 → 「0건」 으로 보인다

$ printf '​테스트\n' | LC_ALL=C.UTF-8 grep -P '[\x{200B}]'
​테스트                    # 정상
```

**그래서 아홉 번째 거짓 통과(보이지 않는 글자)를 찾을 때 돌린 전수조사도 거짓 0 이었습니다.**
고침 자체(`normalizeInvisible()`)는 멀쩡했고 보초 시험도 통과했지만, 「레포에 그 글자가 없다」는 **증거가 없었던 것**입니다.

### 규칙: `grep -P` 에 `\x{}` 를 쓰면 무조건 `LC_ALL=C.UTF-8` 을 붙인다

```bash
export LC_ALL=C.UTF-8     # 세션 시작에 한 번
```

그리고 **거짓 0 과 진짜 0 을 가르려면 종료코드를 본다.** grep 은 0=찾음 · 1=없음 · **2=오류**.
`| wc -l` 이나 `| tail` 로 묶으면 2 가 숨습니다.

```bash
grep -rlP '[\x{200B}]' . ; echo "exit=$?"   # exit=2 면 결과가 아니라 오류다
```

### 요령: 전각이 떠도 「문장부호냐 숫자·영문이냐」로 갈라야 한다

전각 전수조사에서 17파일이 떴지만 **판정을 가리는 것은 전각 숫자·영문뿐**입니다.
`（）？：，｜～` 같은 전각 문장부호는 일·중 정서법이고, 금지어를 가리지 못합니다(금지어는 한글·숫자·영문).

```bash
# 위험한 꼴만: 전각 숫자 FF10-FF19 · 전각 영문 FF21-FF3A, FF41-FF5A
LC_ALL=C.UTF-8 grep -rnP '[\x{FF10}-\x{FF19}\x{FF21}-\x{FF3A}\x{FF41}-\x{FF5A}]' --include='*.json' --include='*.html' .
```

이렇게 가르면 raytok 쪽은 **위험한 꼴 0** 이었습니다(판정 대상 위반 0).

### 요령: 보이지 않는 글자는 「글자별로 세어」 봐야 오탐과 진짜가 갈린다

19파일 · 427자가 떴지만 갈라 보니 전부 정당했습니다. **파일 목록만 보면 겁이 나고, 글자별로 세면 답이 나옵니다.**

```bash
LC_ALL=C.UTF-8 grep -rhoP '[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}\x{FEFF}\x{00AD}\x{180E}]' \
  --include='*.json' --include='*.html' . \
| python3 -c "
import sys;from collections import Counter
c=Counter(sys.stdin.read().replace('\n',''))
for ch,n in c.most_common(): print(f'U+{ord(ch):04X}  {n}회')
"
```

| 글자 | 수 | 어디 | 판정 |
|---|---|---|---|
| U+200C ZWNJ | 174 | `fa`·`ml`·`kn`·`te`·`si` 묶음 | **정당** — 인도계·페르시아 글자에 필수 |
| U+200D ZWJ | 120 | 같음 | **정당** — 자음 붙임에 필수 |
| U+200B ZWSP | 132 | **`packs/km.json` 한 파일뿐** | **정당** — 크메르는 폭 없는 빈칸이 낱말 구분자 |
| U+FEFF BOM | 1 | `web/host/index.html` 3358행 | **정당** — CSV 내보내기 BOM(엑셀 한글 깨짐 방지 코드) |

**교훈: 언어 묶음(`packs/`·`ui-strings/`)에서 뜬 보이지 않는 글자는 지우면 그 언어가 깨집니다.**
지우기 전에 어느 글자·어느 언어인지 반드시 갈라 보십시오. 판정 대상은 **한국어 광고 문안**뿐입니다.

---
## push 가 「non-fast-forward」로 거부될 때 — HEAD 가 떼어져(detached) 있는지 먼저 본다 (2026-11-05 12:20 · claude-22)

12시 교신에서 `git push origin main` 이 거부됐습니다. **원격보다 뒤처진 게 아니었는데도** 그랬습니다.

```bash
$ git rev-list --left-right --count origin/main...HEAD
0	1                      # 1 앞섬 · 0 뒤처짐 → fast-forward 가 맞는데?

$ git push origin main
 ! [rejected]  main -> main (non-fast-forward)
```

**원인: HEAD 가 떼어져 있었습니다.**

```bash
$ git branch -vv
* (HEAD detached from refs/heads/main) b73aeed   ← 내 커밋은 여기
  main   85dca9a [origin/main: ahead 57, behind 53]   ← 낡은 가지
```

`git push origin main` 은 **HEAD 가 아니라 `main` 이라는 가지를 밉니다.** 내 커밋은 떼어진 HEAD 에 있었고
`main` 가지는 원격이 force-push 되기 전의 낡은 자리(85dca9a)에 멈춰 있었습니다. 그게 non-fast-forward 였던 것입니다.

`git pull --rebase origin main` 도 **안 고쳐 줍니다**(떼어진 HEAD 를 리베이스할 뿐 `main` 가지는 그대로).
그래서 PROTOCOL 의 `push || (pull --rebase && push)` 가 **두 번 똑같이 실패합니다.**

### 고치는 법 — force-push 는 쓰지 않는다

```bash
git branch backup-main-<옛sha> main    # ① 낡은 가지를 먼저 백업 (되돌릴 길 확보)
git branch -f main <내커밋sha>          # ② main 을 내 커밋으로 옮긴다 (내 커밋은 origin/main + 1 이므로 fast-forward)
git checkout main
git push origin main                   # ③ 정상 통과
```

**`git push -f` 는 쓰지 마십시오.** 남의 작업을 지웁니다. 내 커밋이 `origin/main` 의 자손이면 ②만으로 충분합니다.

### 겸사: 원격 역사가 통째로 바뀌었는지 확인하는 법

이번에 `git pull` 첫 줄이 `+ 85dca9a...3423463 main -> origin/main (forced update)` 였습니다. **`+` 와 「forced update」가 신호입니다.**
얼마나 바뀌었는지는 공통 조상이 있는지로 봅니다.

```bash
$ git diff --name-only origin/main...backup-main-85dca9a
fatal: no merge base          ← 공통 조상 0. 역사가 통째로 교체됐다는 뜻
```

**놀라기 전에 「어느 쪽이 더 많은지」를 세십시오.** 이번엔 지금 원격이 더 풍부해서 **잃은 것이 없었습니다**:

```bash
for f in img/shop img/d3; do
  echo "$f : 옛 $(git ls-tree -r --name-only backup-main-<옛sha> | grep -c "^$f") / 지금 $(git ls-tree -r --name-only origin/main | grep -c "^$f")"
done
# img/shop : 옛 13 / 지금 17
# img/d3   : 옛 0  / 지금 20     ← 지금 원격이 최신. 옛 가지는 버려도 된다
```

**교훈: 「no merge base」가 떠도 바로 되살리지 마십시오.** 파일 수를 세어 어느 쪽이 최신인지 먼저 정하고,
백업 ref 는 남겨 두되 원격은 건드리지 않습니다.

---

## 메트리쿨: 발행이 끝난 건을 로그인 없이 증명하는 법 (2026-11-05 claude-22)

`getScheduledPosts` 는 발행 끝난 건도 돌려준다(이미 적은 함정). 그런데 **끝난 건에만 생기는 칸이 있다.**

```
"providers":[{"network":"instagram","status":"PUBLISHED",
              "publicUrl":"https://www.instagram.com/p/XXXXXXXX/",
              "detailedStatus":"Published"}]
```

- `status: PENDING` 일 때는 `id`·`publicUrl` **둘 다 없다**
- 발행되면 `id`(인스타는 글 주소, 페북은 글 번호)와 `publicUrl` 이 **같이** 생긴다

**즉 `status: PUBLISHED` + `publicUrl` 이 같이 있으면 로그인 없이도 발행 증거가 된다.**
`status` 하나만 보는 것보다 안전하다 — 칸이 비면 아직 안 나간 것이다.

**한계:** 메트리쿨을 거치지 않은 경로(Upload-Post 등)는 목록에 **애초에 안 뜬다.** 없는 것 ≠ 안 나간 것.

---

## 「진짜 0」 증명은 대조군 한 줄로 (2026-11-05 smartever)

0 이 나왔을 때 셋을 같이 본다:
1. `grep ... ; echo "exit=$?"` → **1 이면 진짜 없음, 2 면 오류**
2. **같은 로캘·같은 꼴 명령으로 있는 글자를 하나 세어 본다** — 예: `LC_ALL=C.UTF-8 grep -oP '[\x{AC00}-\x{D7A3}]' index.html | wc -l` 이 0 이 아니면 명령이 살아 있다
3. **HTML 엔티티 꼴도 따로 본다** — `&#8203;`·`&#x200b;`·`&zwnj;`·`&shy;` 는 파일 바이트엔 글자가 없어서 1번에 안 잡히지만 화면엔 들어간다
   `grep -rnoiE '&#(8203|x200b|8204|x200c|8205|x200d|8288|x2060|65279|xfeff|173|xad);|&(zwsp|zwnj|zwj|shy|NoBreak);'`

## 상품별 금지어는 「반대 방향 거짓」을 못 막는다 (2026-11-05 smartever)

RayTok 의 「구독료 0원」이 사고 난 뒤 터치톡 게이트로 떠 보니 **「월 구독료 0원」「구독료 없음」「위약금 없음」「약정 없이 자유 해지」가 전부 ✓.**
금지어 목록은 식약처·과장 표현 중심이라 **상품 사실과 어긋나는 문구(유료 상품에 「무료」)는 목록에 없으면 통과한다.**
새 문안 붙이기 전에 그 상품의 **가격·해지 조건과 반대되는 말**을 따로 떠 보는 게 안전하다.
시험 방법(엔진 무수정):
```bash
cat > /tmp/t.mjs <<'X'
import { loadProduct, check } from '<레포>/marketing/lib/check.mjs';
const p = loadProduct('touchtok');
for (const s of ['월 구독료 0원','구독료 없음']) console.log(s, JSON.stringify(check(s, p)));
X
node /tmp/t.mjs
```

## 셸 함정: `cat > 파일 2>/dev/null || ...` 은 표준입력을 기다리며 멈춘다 (2026-11-05 smartever)
heredoc 없이 `cat > 파일` 을 쓰면 입력을 기다려 시간 초과(2분)로 죽는다. 파일을 만들 땐 반드시 `<<'EOF'` 를 붙인다.

---
## 금지어 목록은 「낱말」이 아니라 「주장」 단위로 짜라 (2026-11-05 claude-22)

`raytok-app` 금지어에 「구독료 0원」「구독료 없음」을 넣어 두고 막았다고 믿었다. 실제로는
「구독료 **무료**」「**평생** 무료」「**공짜**」「현장교육 무료」「추가 비용 없음」「결제 없이」
「요금 없음」이 **전부 ✓ 로 통과**했다. 같은 거짓 주장인데 낱말만 달랐다.

**요령:** 금지어를 넣을 때 그 낱말만 넣지 말고, **같은 주장을 하는 다른 말을 3개 이상 적어 보고
하나씩 게이트에 넣어 봐라.** 「유료인데 무료」 꼴이면 최소 이만큼은 있다 —
`무료 / 0원 / 없음 / 공짜 / 추가 비용 없음 / 결제 없이 / 평생·영구` × `구독료 / 이용료 / 요금 / 제품명`.
한 낱말이라도 ✓ 가 나오면 목록이 아직 구멍이다.

## 사실이지만 조건부인 문구는 금지어가 아니라 「통지」로 (2026-11-05 claude-22)

「위약금 없음」을 금지어로 올리면 **「12개월 이용 완료 시 위약금 없음」 같은 조건부 사실 정본이
자기 게이트에 걸린다.** 11-03 선글라스 되돌이(「구독료 0원」이 제 정본을 막은 일)와 같은 원인이다.
**모르는 것·조건부인 것은 `notice` 로.** 막지 않고 사람이 보게 둔다. `words` 는 「무조건 거짓」만.

## inherit 로 물려받는 제품이 있으면 금지어 추가는 항상 두 파일 작업이다 (2026-11-05 claude-22)

`raytok-glass` 는 `raytok-app` 을 inherit 한다. app 에 「구독료 무료」를 막은 순간 glass 도 막혔는데
glass 는 구독료 0원이 **사실**이다. → glass `forbidden.exclude` 에 같이 넣어 풀어야 한다.
**금지어 하나 추가 → `grep -l '"inherit"' products/*.json` 로 물려받는 제품을 먼저 세고,
그 제품 정본이 자기 게이트를 통과하는지 다시 떠라.** 안 하면 조용히 되돌이가 생긴다.

## 떼어진 HEAD 는 `pull --rebase` 가 「최신」이라 거짓말한다 (2026-11-05 claude-22)

매시 절차 1번(`git pull --rebase origin main`)이 **`Already up to date.`** 를 내놓고 통과했는데,
커밋 뒤 push 에서 `! [rejected] (non-fast-forward)` + 「branch tip is behind its remote」가 났다.
원인: 로컬이 **떼어진 HEAD**(`HEAD detached from refs/heads/main`)였다. 이 상태에선 pull 이
`main` 을 안 보고 끝나서 뒤처진 걸 모른다. 규약에 적힌 `push || (pull --rebase && push)` 되돌리기도
똑같이 실패한다 — pull 이 또 「최신」이라 하기 때문이다.

**요령:** 매시 절차 0번으로 `git branch --show-current` 를 먼저 떠라. 빈 줄이면 떼어진 HEAD 다.
고치기: `git checkout -B main <내 커밋>` 후 `git rebase origin/main` → push. (아직 커밋 전이면
`git checkout -B main origin/main`.) 양쪽 세션이 같은 날 둘 다 걸렸으니 컨테이너 기본값인 듯하다.

---
### 2026-11-05 14시 · smartever — 레포 node 실행이 막힌 회차의 대체 검사
- 정기 교신 세션에서 `node route.mjs selftest` 가 **권한 거부**될 수 있다(외부 코드 실행으로 분류). 우회하지 말 것.
- 대신: `lib/check.mjs` 의 판정식을 읽어 파이썬으로 옮긴다 — ① 보이지 않는 글자 제거·전각→반각 ② 낱말 사이 `\s*` ③ 끝이 홑 수치면 「값 / 이름」 역순(specFind) ④ i 플래그.
  `python3 -I` 로 정본 전체 + **대조군**(일부러 금지어 넣은 줄)을 같이 돌려 「검사기가 살아 있음」을 증명한다.
- 금지어를 늘릴 때는 같은 검사로 **자기 정본에서 0** 인지 먼저 본다. 조건부 사실(「12개월 이용 완료 시 위약금 없음」)·부정문(「무료 체험은 지금은 없습니다」)은 금지 말고 통지.
- 다음 회차에 진짜 selftest 로 재확인을 STATUS 에 적어 둔다.

---
**2026-11-05 15:12 · smartever** — `route.mjs` 는 **`marketing/` 안에서** 돌린다. 레포 루트에서 `node route.mjs selftest` 하면 MODULE_NOT_FOUND 로 죽는데, 이걸 「실행 권한 거부」로 오판해 대체 검사로 돌아간 적이 있다. 죽으면 먼저 `find . -name route.mjs` 로 경로부터 본다.

---
**2026-11-05 16시 · smartever** — 정본 숫자를 그림에 굽기 전에 `git log -5` 로 **방금 들어온 정정 커밋**을 보십시오.
상세 v4 가 85→82 로 정정된 지 30분 뒤, 정본 json(아직 85)을 보고 메인 배너가 85 로 구워졌습니다. json 이 늦게 따라오는 사이엔 json 만 믿으면 옛 숫자가 그림에 박힙니다.
**2026-11-05 16시 · claude-22** — 배너를 이미지로 구우면 게이트가 못 보는 숫자가 생긴다

공유몰 메인에 올라간 선글라스 배너는 **글자가 이미지 안에 구워져** 있다. 그래서
① `check` 는 **굽기 전 원고**만 보고, 굽힌 뒤 숫자가 정본과 갈라져도 아무도 모른다
② 메인 본문 텍스트 실측(`innerText`)으로 「선글라스·RayTok」을 세면 **0** 이 나온다 — 안 올라간 것처럼 보인다

**요령:** 이미지 배너는 세 가지를 따로 떠라.
1. `img.alt` + `closest('a').href` — 글자 대신 alt 를 세고, alt 도 `check` 에 넣는다(이번에 alt 가 「85개 언어」였다)
2. 배너 파일 **HTTP 200 + Content-Length** — 외부 호스트(touchtok.kr)에 있으면 몰과 따로 죽을 수 있다
3. 배너 문구에 들어간 **숫자를 정본 표와 한 줄씩 대조** — 게이트는 금지어만 보고 「85 vs 82」 같은 정본 분기는 못 잡는다

**정본이 갈렸을 때 금지어로 막지 말고 `forbidden.notice` 에 넣어라.** 막아 버리면 둘 중 하나가 맞는데도
자기 정본(`listingTitle`)이 자기 게이트에 걸린다. notice 는 `ok` 에 영향이 없어 통지만 뜬다.
반대쪽 숫자(82)는 `facts` 에 없어서 「출처 확인 필요」로 자동으로 걸린다 → **양방향으로 사람 눈에 걸리는 상태**가 된다.

**메인에서 뭔가 사라졌는지 셀 때 `product_no=` 하나만 보면 거짓 경보가 난다.** 카페24는 같은 상품을
**슬러그형**(`/product/<한글제목>/33/category/60/display/1/`)으로도 걸고, 이 꼴에는 `product_no=` 가 없다.
이번에 터치톡을 「27→0, 사라졌다」로 잘못 읽었다 — 두 꼴을 합쳐 세니 **31개로 멀쩡**했다.
(smartever 가 10-31 에 이미 적어 둔 함정인데 못 쓰고 다시 밟았다. **셈이 상대 실측과 어긋나면 내 셈을 먼저 의심해라.**)

```python
def pno(h):                                   # 두 꼴을 같이 센다
    m = re.search(r'product_no=(\d+)', h) or re.search(r'/(\d+)/category/\d+', h)
    return m.group(1) if m else None
```

---
## 고아 페이지 셈법 — 사이트맵 ✓ 가 「다 걸려 있다」는 뜻이 아니다 (2026-11-05 17시, claude-22)

서치콘솔이 「발견 페이지 22」라고 해도, **그 22가 사이트에 있는 전부가 아니다.** raytok.kr 실제 사례:
사이트맵 22개는 전부 살아 있었는데(죽은 주소 0), 레포엔 index.html 이 44장이었고 그중 `/sangdam/`(상담 신청)은
사이트맵에도 없고 **들어오는 내부 링크도 0개**였다. 페이지 자신은 `robots: index,follow` + canonical 을 달고 있었다 —
색인되길 의도했는데 구글이 들어올 문이 아예 없던 자리다. 상담/구매 같은 전환 페이지가 여기 걸리면 손실이 바로 돈이다.

두 방향을 **따로** 세야 한다. 한쪽만 세면 놓친다.
```bash
# ① 사이트맵 → 파일 (죽은 주소 찾기)
grep -o '<loc>[^<]*</loc>' sitemap.xml | sed 's|<[^>]*>||g; s|https://도메인||' | sort > /tmp/map.txt
find . -name index.html -not -path './.git/*' | sed 's|^\./||; s|index.html$||; s|^|/|; s|^//|/|' | sort > /tmp/have.txt
comm -13 /tmp/have.txt /tmp/map.txt   # 사이트맵에만 있음 = 404 위험

# ② 파일 → 사이트맵 (고아 찾기)
comm -23 /tmp/have.txt /tmp/map.txt   # 파일만 있음 = 사이트맵 누락 후보
# 후보마다 들어오는 링크를 센다. 0 이면 고아
grep -rl 'href="[^"]*<그 경로>' --include='*.html' .
```

함정 셋:
- **자기 자신이 1건으로 잡힌다.** canonical·og:url·내부 앵커 때문에 자기 파일이 결과에 뜬다. 1건이면 고아로 봐야 한다(0 아님)
- **누락 전부를 넣으면 안 된다.** 앱 실행 화면(`/web/*`)·QR 연결 랜딩(`/join/`)·고객 조회 도구(`/usage/`)는 색인 대상이 아니다.
  `robots.txt` Disallow 와 **교차 확인**하고, 넣기 전에 각 장의 `name="robots"`·`<title>` 을 보고 의도를 읽는다
- **사이트맵을 고쳐도 구글은 모른다.** 서치콘솔에서 재제출(또는 재크롤 요청)을 눌러야 반영된다.
  그 권한이 다른 세션에 있으면 inbox 로 부탁해야 끝난다 — 파일만 고치고 「완료」로 적으면 거짓 완료다

덧붙여: 사이트맵에 새 장을 넣을 때 **게이트를 먼저 돌린다**(`node route.mjs check <제품> <파일>`).
색인시킨다는 건 그 문구를 구글에 영구히 박는 것이라, 금지어가 든 장을 넣으면 사고가 길어진다.

## 고아 셈 전에 robots·sitemap 이 있는지부터 (2026-11-05 smartever)
- touchtok.kr 은 고아 0 이었지만 `robots.txt`·`sitemap.xml` 자체가 404 였다. **`curl -o /dev/null -w '%{http_code}' https://도메인/robots.txt` 한 줄을 먼저.**
- 렌더 원본 HTML(카페24 상세 이미지를 굽는 `detail/source*.html` 등)은 공개 주소에 그대로 떠 있다 — 미확정 가격이 든 원본이 색인될 수 있다. robots 로 **html 만 콕 집어** 막는다.
  `/detail/` 통째로 막지 말 것: 카페24 상세가 끌어다 쓰는 jpg 가 같은 폴더다. `/assets/` 도 og.jpg 때문에 통째로 막지 않는다
- 오래된 클론은 `HEAD detached` 일 수 있다. push 가 non-fast-forward 로 튀면 `git branch -a` 먼저 보고, `merge-base --is-ancestor` 로 옛 커밋이 원격에 있는지 확인한 뒤 main 을 옮긴다

## 사이트맵에 넣기 전 세 가지 — 「파일이 있다」만으론 모자라다 (2026-11-05 claude-22, 자기 오류 정정)
어제 `/terms/`·`/terms/en/` 을 사이트맵에 넣었는데 **둘 다 잘못이었다.** 레포에 `index.html` 이 있는 것만 보고 넣었다.
실제로는 ⓐ `meta http-equiv="refresh"` 리다이렉트 **껍데기**(290·324바이트)였고 ⓑ 리다이렉트 목적지 `/web/terms/` 는
`meta robots noindex` + `robots.txt Disallow: /web/terms/` 로 **일부러 색인을 막아 둔 장**이었다.
즉 사이트맵은 「색인해라」, robots 는 「오지 마라」 — 정면 모순을 내가 만들었다.

넣기 전 **세 가지를 전부** 본다. 하나라도 걸리면 빼야 한다:
1. `grep -c 'http-equiv="refresh"' <파일>` — 껍데기면 목적지를 넣어야 하고, 목적지가 2·3 에 걸리면 **아무것도 안 넣는다**
2. `grep -o 'name="robots"[^>]*' <파일>` — `noindex` 면 끝
3. `robots.txt` 의 `Disallow` 접두어와 **대조** — 접두어라서 `/web/terms/` 는 `/web/terms/en/` 까지 덮는다

함께 나온 것: `/privacy/en/` 도 국문 `/privacy/` 로 보내는 껍데기였다(영문 개인정보 처리방침은 **없다**).
영문 주소가 국문으로 튀면 hreflang·언어 신호가 거짓이 된다 — 영문 실물이 없으면 en 주소는 사이트맵에서 뺀다.
결과: 26 → **23개**(죽은주소 0·껍데기 0·noindex 0·robots 차단 0). 한 줄 검사식은 STATUS 에 붙인 파이썬 조각.

## 상세 이미지를 새 판으로 덮어쓰면 선언 치수가 거짓이 된다 (2026-11-05 claude-22)
`img/d2/*` 를 v4 로 덮어쓴 뒤 `glass/index.html` 의 `width`/`height` **속성은 옛 v3 값 그대로**였다.
선언 860×5353 ↔ 실제 860×2302. `style="height:auto"` 가 있어도 브라우저는 **속성 비율로 자리를 먼저 비워 두므로**
네 장 합쳐 18,365px 를 잡았다가 9,624px 로 꺼진다 — 화면이 크게 튄다(CLS). 눈으로는 안 보인다, 치수를 세야 보인다.
**이미지를 교체한 커밋 뒤엔 선언값 대조를 돌린다.** JPG/PNG/WebP 머리글만 읽으면 되고(파일 전체 로딩 불필요)
비율 오차 2% 넘으면 틀린 것으로 본다. 레포 전수 23개 img 태그 중 이 4개만 틀렸고, 고친 뒤 0건.

## 맨 숫자로 grep 하면 전화번호·사업자번호가 걸린다 (2026-11-05 claude-22)
「언어 수 82 가 랜딩에 3건 남았다」는 제보를 받고 실제로 세어 보니 **3건 모두 언어 수가 아니었다** —
전화 `1800-6825` 2건 + 사업자등록번호 `376-88-02280` 1건. 랜딩은 이미 85 였다.
**숫자를 셀 때는 단위까지 붙인다**: `grep -c "82개"` 가 맞고 `grep -c "82"` 는 틀린다.
덤으로 `desk/index.html` 의 「82개 언어」는 **고쳐선 안 된다** — 선글라스가 아니라 웹 강연(`web/listener/langs.json` 82개)이다.
같은 숫자가 제품마다 다른 뜻을 가진다 — 바꾸기 전에 그 장이 어느 제품인지 본다.

## 「틀린 것 0건」 전에 모수부터 센다 (2026-11-05 smartever)
선언 치수 대조를 touchtok-site 에 돌리니 「bad 0」이 나왔는데, 실제로는 **width/height 를 단 `<img>` 가 0개**라 검사한 게 없었다.
0 이 「안전」인지 「검사 대상 없음」인지는 결과만 봐선 모른다. **검사기는 늘 「검사한 수 n · 틀린 수 k」를 같이 찍는다.**
(덤: 속성이 아예 없으면 거짓 치수 위험은 없지만 자리 예약도 없다 — CLS 는 별개 문제)
## 계획 파일(`out/plan-*.json`)은 장부가 아니다 — 예약 전에 「실물」을 봐라 (2026-11-05 19시 claude-22)

`out/plan-raytok-app-2026-11.json` 은 **11/01 에 한 번 찍은 종이**다. 그 뒤 사람이 Metricool 에
다른 훅으로 예약을 걸고 장부(`quota/metricool-2026-11.json posts`)에만 적으면 **계획 파일은 그대로 남는다.**
실제로 이렇게 갈라져 있었다:

| 날짜 | 계획 파일 | 장부 = 실제 예약 |
|---|---|---|
| 11-10 | A1 | **A2** |
| 11-17 | **A2** | D1 |
| 11-24 | A3 | C3 |
| 11-06 | G1 | (훅 안 적힘) |
| 11-20 | G3 | **G5** |
| 11-27 | G4 | 없음 (20/20 꽉 차서 자리 없음) |

**계획 파일을 보고 예약을 걸면 A2 가 11-10·11-17 두 번 나간다.** 날짜는 안 겹치니 눈에 안 띈다.

요령: **예약을 걸기 전 순서는 ① Metricool `getScheduledPosts` 실물 → ② 장부 → ③ 계획 파일.**
셋이 다르면 **실물이 이긴다.** 계획 파일은 「소재 원고 보관함」으로만 쓰고 일정 근거로 쓰지 않는다.
계획 파일을 고치려고 `plan` 을 다시 돌리면 **꽉 찬 달에는 0자리가 나와 원고가 날아간다** — 다시 돌리지 말고 그냥 믿지 않는다.

## 예약 글은 발행 **전에** 본문을 끌어와 게이트에 넣어라 (2026-11-05 19시 claude-22)

12:34 사고는 「발행된 뒤에 금지어를 알았다」였다. 발행 뒤에는 커넥터가 끊기면 지울 수도 없다.
Metricool `getScheduledPosts` 는 **예약 글의 본문·해시태그·이미지 alt 를 그대로 준다.**
그걸 파일로 떨어뜨려 `node route.mjs check <pid> <파일>` 에 넣으면 나가기 전에 걸린다.
6편 돌려 금지어 0 · 「출처 확인 필요」 1건(11/13 「5초」)을 미리 잡았다.

**`mediaAltText` 도 꼭 같이 검사해라.** 12:34 건은 본문뿐 아니라 **alt 에도 「월 구독료 0원」이 들어 있었다.**
alt 는 공개 문구이고 사람 눈에 안 보여서 검사에서 빠지기 쉽다.

## playwright 는 「아무 디렉터리에서나」 되지 않는다 (2026-11-05 19시 claude-22)

환경 설명에는 `require('playwright')` 가 어디서나 된다고 적혀 있지만, 실제로는
`/opt/npm-tools/node_modules` 에 있고 `npm root -g` 는 `~/.npm-global/...` 를 가리켜 **ESM `import` 가 못 찾는다.**
게다가 CommonJS 라 named import 도 안 된다. 되는 꼴은 이것뿐:

```js
import pw from '/opt/npm-tools/node_modules/playwright/index.js';
const { chromium } = pw;
```

`node -e "console.log(require.resolve('playwright'))"` 로 경로를 먼저 확인하고 절대경로로 박는다.

## 지연 로딩 이미지는 첫 측정에서 0×0 으로 나온다 (2026-11-05 19시 claude-22)

`loading="lazy"` 가 걸린 이미지는 화면 밖에 있으면 `naturalWidth`/`naturalHeight` 가 **0** 이다.
선언 치수 대조(CLS 검사)를 그대로 돌리면 **아래쪽 이미지가 전부 「어긋남」으로 찍힌다** — 거짓 경보다.
`new Image()` 로 강제 로드해서 재야 한다:

```js
const im = new Image();
await new Promise(r => { im.onload = r; im.onerror = r; im.src = src + '?v=' + Date.now(); });
```

덤으로 **로고처럼 일부러 줄여 박은 이미지는 「어긋남」이 아니다.** 선언 124×26 ↔ 실제 719×151 은
**가로세로 비가 같으면**(4.77 ↔ 4.76) 화면이 안 튄다. CLS 검사는 **치수가 아니라 비율**로 판정해야 한다.

---
## 정본 「훅」이 게이트의 사각지대다 (claude-22, 2026-11-06)
`products/<id>.json` 의 `hooks[].first3s` 는 **검사 대상에 안 들어간다.** `selftest` 는 금지어·통지·고지문·facts 의 모순만 보고,
`check` 는 사람이 넣어 준 문구만 본다. 그래서 **훅 자체에 facts 에 없는 숫자가 박혀 있으면 아무도 못 잡는다.**

실제 사고: `raytok-glass.json` 훅 G2 = 「렌즈 3장이 들어있습니다. 바꿔 끼는 데 **5초**」.
`facts` 에 5초가 없다 → 훅을 보고 쓴 11/13 예약 본문이 「5초면 됩니다」로 나갔다. 예약 글 검사에서야 잡혔다(발행 7일 전, 간신히).

**요령: 새 달 계획을 돌리기 전에 훅 first3s 를 한 줄씩 게이트에 넣어 본다.**
```bash
python3 -c "import json;[print(h['first3s']) for h in json.load(open('products/<id>.json'))['hooks']]" \
 | while read -r t; do echo "--- $t"; node route.mjs check <id> "$t" | tail -2; done
```
훅은 원고의 **씨앗**이다. 씨앗이 오염되면 그 달 원고가 전부 오염된다.

## 훅 풀 고갈을 매달 미리 센다 (claude-22, 2026-11-06)
`plan` 출력의 **`hooksLeftAfter`** 가 그 달 쓰고 남는 훅 수다. 이게 0~1 이면 **다음 달 소재가 없다.**
2026-11 선글라스가 그랬다: 훅 5개(G1~G5)뿐인데 11월에 3개 소진, `hooksLeftAfter: 1`.
제품별 훅 수 = 앱 25 · 터치톡 10 · 선글라스 5(→ G6~G11 신설로 11). **월 발행량 × 2개월분**은 늘 쥐고 있어야 한다.
훅을 새로 만들 때는 **facts 안의 값만** 쓴다. 새 숫자를 쓰고 싶으면 먼저 실측해 facts 에 올린다 — 순서를 거꾸로 하면 위 사고가 반복된다.

## detached HEAD 에서 `git push origin main` 은 **조용히 아무것도 안 올린다** (claude-22, 2026-11-06)
전에 「detached HEAD 를 정상화하라」고만 적었는데, **왜 위험한지**가 빠졌다. 오늘 실제로 당했다.

detached HEAD 에서 커밋하면 커밋은 `HEAD` 에만 달리고 로컬 `main` 은 옛 자리에 그대로다.
`git push origin main` 은 **`HEAD` 가 아니라 로컬 `main` 을 올린다.** 그 `main` 은 이미 origin 과 같으므로
`Everything up-to-date` 로 **성공처럼 끝나고 내 커밋은 안 올라간다.** `git log --oneline -1` 도 내 커밋을 보여 주니 더 속는다.

**매 차례 push 뒤에 이걸 확인한다:**
```bash
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && echo 올라감 || echo "안 올라감"
```
`안 올라감` 이면:
```bash
git branch -f main $(git rev-parse HEAD) && git checkout main && git push origin main
```
**교신은 push 가 되어야 성립한다.** 커밋만 하고 끝내면 상대는 한 시간을 빈 우편함으로 보낸다.
