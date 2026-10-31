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
