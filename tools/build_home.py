#!/usr/bin/env python3
# RayTok 소개 페이지 생성기 — 실행: python3 tools/build_home.py → index.html, field/, tour/, ows/ 를 다시 만든다. 문구·이미지 수정은 여기서.
import os
OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CDN = "https://d8j0ntlcm91z4.cloudfront.net/user_3FLPjwlul3oTSAoiBakDCqNxfLc/"
VID = "https://d2ol7oe51mr4n9.cloudfront.net/user_3FLPjwlul3oTSAoiBakDCqNxfLc/"
MAIL = "raytok.dany@gmail.com"

IDS = {
 # 현장
 "yard":"20260930_074309_de9bad14-c133-48ee-bcf8-ff656927367f","ship":"20260930_074309_6c2c53ec-c471-43fc-8316-1e3079998965",
 "auto":"20260930_074309_b20f2114-41d9-44de-aa63-0df49b156c9c","food":"20260930_074309_6962e1aa-a40c-478f-baef-f5d524b030c0",
 "ware":"20260930_074309_0b9c64c6-a2d9-4e89-89d6-45b14fb14ba5","port":"20260930_074309_434c75d4-652e-4dfb-b3fd-fe7bcf42b6da",
 "barn":"20260930_074309_8dcf4aa1-d02b-4d71-937a-cc36f92dcce2","scaf":"20260930_074309_86f9eddd-b445-42ac-aed7-51bce9ac05a6",
 "orch":"20260930_074309_7d09271b-1f73-4c92-8a29-622ecce0b783",
 # 관광
 "jeju":"20260930_074315_3b8502ce-1d57-461b-8596-7c5e8cbef16e","bukc":"20260930_074316_db8e96fe-4d67-45e4-be4b-f5e8a3bcd078",
 "seong":"20260930_074315_24000521-c9cb-4ee9-8e34-cf899417ec71","gamc":"20260930_074315_6b71ab63-e57e-4b3e-8bd5-10a635b845cc",
 "bulg":"20260930_074315_93de1d7d-2fcd-4079-aa32-03c6723a4c53","gwang":"20260930_074315_961b3de2-da05-4e9d-a9c6-db18094389fb",
 "hwas":"20260930_074315_82b0c599-9d52-467d-8e75-4b99c9f648bf","muse":"20260930_074316_b14b8250-a897-47c5-a7da-4d9c558554a2",
 "nami":"20260930_074315_053a7685-d7e9-406c-b446-1613c9ca3eba",
 # OWS
 "oprod":"20261002_061100_e7592acb-7824-4b4d-92e0-4ab543c163b6","ocafe":"20261002_061100_d9dd4b21-71d4-41d4-9ead-ba78a4b54901",
 "ohand":"20261002_061100_8e6493af-cdc1-42d7-a732-dbfe286de7e9","omkt":"20261002_061100_1f17f515-3c07-4e12-b3df-6c2d64781307",
 # Meet (화상회의)
 "mhero":"20261002_092350_90c57896-896c-4fbb-b150-ddbf46189dc9","mroom":"20261002_092349_141b2e69-5fb0-418d-9cdf-4652817ce398",
 "mmove":"20261002_092349_877168a2-47d0-440f-b265-bc2788874a08",
}
import hashlib
I18N_LANGS = ("en", "zh", "ja", "vi", "th", "id")  # 번역 사전: assets/i18n/<언어>.json. 원문(한국어)을 고치면 사전도 같이 고친다 — tools/i18n_check.js 로 빠진 문장 확인
def _i18n_ver():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    h = hashlib.md5()
    for f in ["assets/i18n.js"] + [f"assets/i18n/{l}.json" for l in I18N_LANGS]:
        fp = os.path.join(root, *f.split("/"))
        if os.path.exists(fp): h.update(open(fp, "rb").read().replace(b"\r\n", b"\n"))
    return h.hexdigest()[:8]
I18NV = _i18n_ver()
CSSV = hashlib.md5(open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),"assets","site.css"),"rb").read().replace(b"\r\n", b"\n")).hexdigest()[:8]  # 줄바꿈(CRLF/LF) 차이로 해시가 바뀌지 않게
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# ⚠️ CDN 직접 참조 금지: 모든 미디어는 저장소 img/ 로 받아서 쓴다 (python tools/fetch_media.py).
# Higgsfield 계정·CDN 변경 시 외부 주소는 깨지므로 HTML에는 항상 저장소 경로(/img/...)만 쓴다.
# 아래 CDN, VID 상수는 tools/fetch_media.py 가 다운로드 출처를 파싱하기 위해 보존하는 것임.
def img(k):
    # omeet·ocafe2(영상 포스터)는 좌우 반전본이라 img/ 에만 있다 — IDS 에 넣지 말 것(fetch_media 가 원본으로 덮어씀).
    p = os.path.join(ROOT, "img", k + ".webp")
    if not os.path.exists(p):
        print(f"⚠️ 경고: img/{k}.webp 파일이 없습니다. python tools/fetch_media.py 를 실행하세요.")
    return f"/img/{k}.webp"

def vid(name, cdn_url):
    p = os.path.join(ROOT, "img", name + ".mp4")
    if not os.path.exists(p):
        print(f"⚠️ 경고: img/{name}.mp4 파일이 없습니다. python tools/fetch_media.py 를 실행하세요.")
    return f"/img/{name}.mp4"
V_FIELD = vid("field", VID+"e3812fd1-3847-4125-88a3-f80e31294d9e.mp4")
V_TOUR  = vid("tour", VID+"7cf21e1f-95fb-477b-9a63-6bb09f6c1520.mp4")
V_FIELD2 = vid("field2", VID+"b78f41e3-75be-4a3b-b3b6-ef2cd79be40a.mp4")   # 물류창고
V_TOUR2  = vid("tour2", VID+"56997d8e-e294-4d4c-8e1d-f905daacd01e.mp4")    # 광장시장 (세로 3:4)
V_OWS1   = vid("ows1", VID+"d81f4185-bf08-4292-b257-bae10cb16dce.mp4")     # 회의장에서 오른쪽 이어폰 건네기 (좌우 반전본)
V_OWS2   = vid("ows2", VID+"e189a395-9cd8-4351-9607-6608eba433e6.mp4")     # 카페에서 오른쪽 이어폰 건네기 (좌우 반전본)
def mimg(k, alt, extra=""):
    # 아직 img/ 에 없을 수 있는 새 사진: 없으면 깨진 그림 대신 조용히 숨긴다
    return f'<img loading="lazy" src="{img(k)}" alt="{alt}"{extra} onerror="this.style.display=\'none\'">'
def loopvid(src, poster, label):
    # 소리 없이 자동 반복 재생 (OWS 건네는 장면)
    return f'<div class="vid"><video autoplay muted loop playsinline preload="metadata" poster="{poster}" src="{src}" aria-label="{label}"></video></div>'

def mailto(subject, body=""):
    from urllib.parse import quote
    return f"mailto:{MAIL}?subject={quote(subject)}" + (f"&body={quote(body)}" if body else "")
OWS_M = None
BODY = "회사·단체명:\n담당자:\n연락처:\n인원(근로자/손님 수):\n사용할 언어:\n"

def head(title, desc, path, og, i18n=True, en=False):
    # i18n=False: 번역하지 않는 페이지(Desk — 국내 한정)
    # en=True: 영문판(<path>en/)이 있는 쪽 — 검색엔진에 짝을 알린다(field·tour·ows)
    alt = (f'<link rel="alternate" hreflang="ko" href="https://raytok.kr{path}">\n'
           f'<link rel="alternate" hreflang="en" href="https://raytok.kr{path}en/">\n'
           f'<link rel="alternate" hreflang="x-default" href="https://raytok.kr{path}">\n') if en else ""
    tr = (f'<script>try{{var l=(location.search.match(/[?&]lang=([a-z]{{2}})/)||[])[1]||localStorage.getItem("raytok-lang");if(/^(en|zh|ja|vi|th|id)$/.test(l))document.documentElement.className="i18n-wait"}}catch(e){{}}</script>\n'
          f'<script defer src="/assets/i18n.js?v={I18NV}"></script>\n') if i18n else ""
    return f'''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="https://raytok.kr{path}">
{alt}<meta property="og:type" content="website">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="https://raytok.kr{path}">
<meta property="og:image" content="https://raytok.kr/assets/og.jpg?v=2">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="theme-color" content="#0A0F1F">
<link rel="icon" type="image/png" href="/assets/favicon.png">
<link rel="apple-touch-icon" href="/assets/raytok-icon.png">
<link rel="stylesheet" href="/assets/site.css?v={CSSV}">
{tr}</head>
<body>
'''

def top(cur):
    def a(href, label, key):
        c = ' aria-current="page"' if cur == key else ''
        return f'<a href="{href}"{c}>{label}</a>'
    # 홈에만 머리 메뉴 끝에 「이용권 구매」 — 지금 index.html 그대로
    buy = '<a href="/buy/">이용권 구매</a>' if cur == "home" else ""
    lang = "" if cur == "desk" else '<div class="langbar" data-noi18n><div class="wrap" role="group" aria-label="Language"><button type="button" data-lang="ko" lang="ko">한국어</button><button type="button" data-lang="en" lang="en">English</button><button type="button" data-lang="zh" lang="zh-Hans">中文</button><button type="button" data-lang="ja" lang="ja">日本語</button><button type="button" data-lang="vi" lang="vi">Tiếng Việt</button><button type="button" data-lang="th" lang="th">ไทย</button><button type="button" data-lang="id" lang="id">Bahasa Indonesia</button></div></div>\n'
    return lang + f'''<header class="top"><div class="wrap">
<a class="logo" href="/" aria-label="RayTok 홈"><img src="/assets/raytok-logo-white.png" alt="RayTok" width="124" height="26"></a>
<nav class="nav" aria-label="주요 메뉴">{a("/field/","현장교육","field")}{a("/tour/","관광가이드","tour")}{a("/museum/",'도슨트',"museum")}{a("/student/","유학생","student")}{a("/product/",'제품<span class="d-desk"> 이어폰·선글라스</span>',"product")}{a("/desk/",'Desk<span class="d-desk"> 화상회의</span>',"desk").replace("<a ",'<a class="ko-only" ')}{a("/#tech","기술","tech").replace("<a ",'<a class="d-desk" ')}{a("/guide/","사용설명서","guide")}{buy}</nav>
<a class="get" href="/download/">앱 설치</a>
</div></header>
'''

# 사업자 정보는 통신판매업 고지 항목이라 **줄이지 않는다**(지금 11쪽 그대로).
BIZ = f'주식회사 피엔엘에코 · 대표 박용음 · 경기도 화성시 동탄대로 635, SH TIME SQUARE Ⅰ 1동 15층 1507호 · 사업자등록번호 376-88-02280 · 통신판매업 신고번호 2025-화성동탄-2002 · 호스팅 GitHub Pages · 전화 010-6695-6983 · 문의: <a href="mailto:{MAIL}">{MAIL}</a>'
FOOT_ROW = '<a href="/field/">현장교육</a><a href="/tour/">관광가이드</a><a href="/museum/">도슨트</a><a href="/student/">유학생</a><a href="/ows/">OWS 통역 이어폰</a><a href="/glass/">블루투스 선글라스</a><a class="ko-only" href="/desk/">Desk 화상회의</a><a href="/#tech">기술</a><a href="/guide/">사용설명서</a><a href="/download/">앱 설치</a>'
# 특허 목록 — 수(NPAT)는 여기서 센다. 바닥글·홈·Desk 가 다 이것을 읽는다 (손 숫자 금지, NOW 10-28 ②)
PATS = [
 ("끊겨도 이어지는 근거리 통역","무선 오디오 기기 및 근거리 무선망을 이용한 실시간 통역 방법 및 시스템","10-2026-0166695","2026.09"),
 ("고치면 드러나는 교육 이수 기록","폐쇄형 근거리 무선망에서의 역방향 통역 및 위변조 검출 가능한 교육 이수 기록 생성 방법 및 시스템","10-2026-0179094","2026.09"),
 ("통역 음성이 다시 인식되지 않게","통역 음성 출력의 재인식을 텍스트 대조로 억제하는 방법 및 시스템","10-2026-0185125","2026.09"),
 ("방송 음성과 폰 자막을 함께 쓰는 다국어 배포","근거리 무선망 텍스트 배포와 제한된 수의 음성 방송 스트림을 병용하는 다국어 통역 배포 방법 및 시스템","10-2026-0188144","2026.10"),
 ("자막과 음성을 따로 다루는 처리","실시간 통역에서 표시 단위와 음성 출력 단위를 분리하여 처리하는 방법 및 시스템","10-2026-0189505","2026.10"),
 ("준비한 원고와 즉석 발언을 함께, 출처를 나눠 기록","사전 번역된 원고와 실시간 발화를 혼합 송출하고 출처를 구분하여 기록 및 보고하는 다국어 통역 방법 및 시스템","10-2026-0189470","2026.10"),
 ("현장에서 바로 등록한 용어를 인식과 번역에 동시에","현장 코드 단위로 지정한 용어를 음성 인식과 번역 양쪽에 같이 적용하는 방법 및 시스템","10-2026-0191072","2026.10"),
 ("관내 방송을 각자의 언어로, 승인 문장과 즉석 발언을 나눠 기록","승인된 문장과 실시간 발화를 구분하여 송출하고 기록하는 구역별 다국어 방송 방법 및 시스템","10-2026-0194985","2026.10"),
]
PSHORT = ["근거리 통역 연결","위변조 검출 교육 기록","통역음 재인식 억제","다국어 방송·자막 병용","자막·음성 단위 분리","원고·실시간 혼합 기록","현장 용어 즉시 등록","관내 방송 다국어 송출"]

def _foot(extra=""):
    return f'''<footer><div class="wrap">
<div class="row">{FOOT_ROW}{extra}<a href="/privacy/">개인정보 처리방침</a><a href="/web/terms/">이용약관</a></div>
<p>{BIZ}</p>
<p>특허 출원 중 ({PATS[0][2]} 외 {len(PATS) - 1}건) · 사진과 영상은 연출 이미지입니다.</p>
<p>RayTok은 통역 도구입니다. 교육기관·통역사·관광통역안내사를 대신하지 않으며, 기계 번역에는 오역이 있을 수 있습니다.</p>
</div></footer>
</body>
</html>
'''

FOOT = _foot()
FOOT_HOME = _foot('<a href="/buy/">이용권 구매</a>')   # 홈 바닥에만 구매 링크 — 지금 index.html 그대로

def cta(title, sub, subject, btn="무료 체험 신청하기"):
    return f'''<section class="dark cta"><div class="wrap">
<h2>{title}</h2>
<p class="sub" style="margin:0 auto">{sub}</p>
<div class="btns"><a class="btn p" href="{mailto(subject, BODY)}">{btn}</a><a class="btn g" href="/download/">앱 먼저 써 보기</a></div>
<p class="mail">메일: <a href="mailto:{MAIL}">{MAIL}</a></p>
</div></section>
'''

def shots(items):
    return '<div class="shots">' + "".join(
        f'<figure><img loading="lazy" src="{img(k)}" alt="{cap}"><figcaption>{cap}</figcaption></figure>' for k, cap in items) + '</div>'

def faq(items):
    return "".join(f'<details><summary>{q}</summary><p>{a}</p></details>' for q, a in items)

# 만드는 쪽(이 파일)과 저장소의 쪽을 **견주는 자리**가 있어야 덫이 다시 생기지 않는다
# (10-17: 이 생성기가 낡아 돌리면 홍보자료·유학생 메뉴·구매 링크가 지워졌다 — B 14 가 발견).
#   python3 tools/build_home.py            → 저장소에 쓴다 (전과 같다)
#   python3 tools/build_home.py --check    → 쓰지 않고 **다른 곳만 센다**. 다르면 종료코드 1
#   python3 tools/build_home.py --out <디렉터리>  → 그 디렉터리에 쓴다 (시험용)
import sys
CHECK = "--check" in sys.argv
_outArg = sys.argv.index("--out") + 1 if "--out" in sys.argv else 0
OUT_DIR = os.path.abspath(sys.argv[_outArg]) if _outArg and _outArg < len(sys.argv) else OUT
DIFFS = []

def write(path, html):
    rel = os.path.join(path.strip("/"), "index.html") if path != "/" else "index.html"
    if CHECK:
        cur = os.path.join(OUT, rel)
        old = open(cur, encoding="utf-8").read() if os.path.exists(cur) else None
        if old != html:
            DIFFS.append(rel)
            print(f"다름: {rel}" + ("" if old is not None else " (저장소에 없다)"))
        else:
            print(f"같다: {rel}")
        return
    p = os.path.join(OUT_DIR, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w", encoding="utf-8", newline="\n").write(html)
    print("wrote", p, len(html))

import atexit
@atexit.register
def _verdict():
    if not CHECK:
        return
    if DIFFS:
        print(f"\n생성기 출력이 저장소와 다르다 ({len(DIFFS)}쪽): " + ", ".join(DIFFS))
        print("→ 손으로 고친 것이 있으면 이 생성기에도 넣는다. 안 넣으면 다음에 누가 돌릴 때 지워진다.")
        sys.exit(1)
    print("\n생성기 출력 == 저장소 (전부 같다)")


NPAT = len(PATS)  # ② 특허 수는 목록에서 센다 — 손 숫자 금지 (samples/site_wording_test.js)
HPAT = f'<a class="hpat" href="#tech" aria-label="특허 출원 {NPAT}건 자세히 보기">' + '<span class="hl">특허 출원 중</span><ul>' + "".join(f'<li>{PSHORT[i]} <b>{no}</b></li>' for i,(t,o,no,d) in enumerate(PATS)) + '</ul></a>'
TECH = ('''<section id="tech"><div class="wrap">
<p class="eyebrow">기술</p>
<h2>기술을 직접 만드는 회사입니다</h2>
<p class="sub">앱, 근거리 연결, 다국어 배포, 교육 기록까지 주식회사 피엔엘에코가 직접 설계하고 개발합니다. 현장에서 부딪힌 문제를 푼 방법 @NPAT@건을 특허로 출원했습니다.</p>
<div class="g3 kpi"><div class="step"><div class="n">@NPAT@건</div><h3>특허 출원 중</h3><p>2026년 9월~10월 출원</p></div><div class="step"><div class="n">자체 개발</div><h3>앱 · 웹 청취자 · 기록</h3><p>설계부터 구현까지 직접</p></div><div class="step"><div class="n">현장 중심</div><h3>회선 없는 현장까지</h3><p>QR로 들으면 인터넷으로 · 앱으로 들으면 전용 공유기 하나로</p></div></div>
<ol class="pat">''' + "".join(f'<li><span class="pn">{i+1}</span><div><b>{t}</b><p>{o}</p><small>특허 출원 중 · {no} · {d}</small></div></li>' for i,(t,o,no,d) in enumerate(PATS)) + '''</ol>
<p class="note">출원인 주식회사 피엔엘에코. 위 @NPAT@건 모두 출원 상태이며 심사 전입니다.</p>
</div></section>
''').replace("@NPAT@", str(NPAT))

# ───────────── 첫 화면 ─────────────
home = head("RayTok — 한 사람이 말하면, 모두가 각자의 말로 듣습니다",
            "외국인 근로자 현장교육, 다국어 관광 가이드, 나눠 끼는 통역 이어폰, 화상회의 통역. 듣는 사람은 앱을 깔지 않고 QR만 찍습니다 — 아이폰도 됩니다.", "/", img("yard")) + top("home") + f'''
<!--
  제품 포장에는 짧은 주소(raytok.kr)만 인쇄될 수 있다. 그래서 첫 화면에서
  한 번 눌러 설치까지 가야 한다 — 머리의 "앱 설치"와 아래 "앱 설치하기"가
  모두 /download/ 로 간다. 설치를 실제로 처리하는 곳은 /download/ 하나뿐이다.
  단 히어로 버튼 순서는 체험 → 구매 → 설치다(결정장부 38: 11월의 얼굴은 웹).
  "앱 설치하기"를 다시 맨 앞으로 옮기지 않는다.
-->
<div class="hero"><img src="{img("yard")}" alt="아침 조회에서 조장의 말이 근로자 각자의 언어로 전달되는 장면">
<div class="wrap">
<p class="kick">RAYTOK · 실시간 통역</p>
<h1>한 사람이 말하면,<br>모두가 각자의 말로 듣습니다.</h1>
<p class="lead">듣는 사람은 앱을 깔지 않습니다. QR을 찍고 자기 언어를 고르면 됩니다 — 아이폰도 됩니다. 나눠 주고 걷고 충전할 수신기가 없습니다.</p>
<div class="btns"><a class="btn w" href="{mailto("[RayTok] 무료 체험·도입 문의", BODY)}">무료 체험·도입 문의</a><a class="btn g" href="/buy/">이용권 구매</a><a class="btn g" href="/download/">앱 설치하기</a></div>
{HPAT}
</div></div>

<section class="news" id="news"><div class="wrap">
<p class="eyebrow">홍보자료</p>
<h2>새 소식 · 자료</h2>
<div id="soro-blog" data-noi18n></div>
<button type="button" class="news-more" id="news-more" hidden aria-expanded="false" aria-controls="soro-blog" data-noi18n>더 보기</button>
<script src="https://app.trysoro.com/api/embed/0bfb60ae-7824-434e-a670-f203cd45da53" defer></script>
<script>
/* 홍보자료: 최신 4개만 보이고, '더 보기'를 누르면 전부 펼친다. 글을 누르면 그 자리에서 열린다. */
(function(){{
  var SHOW=4, box=document.getElementById("soro-blog"), btn=document.getElementById("news-more"), open=false;
  function apply(){{
    var cards=box.querySelectorAll(".soro-blog-list .soro-blog-card"), n=cards.length;
    for(var i=0;i<n;i++) cards[i].classList.toggle("news-hid", !open && i>=SHOW);
    btn.hidden = n<=SHOW;
    btn.textContent = open ? "접기" : "더 보기 ("+(n-SHOW)+")";
    btn.setAttribute("aria-expanded", open?"true":"false");
  }}
  btn.addEventListener("click", function(){{ open=!open; apply(); }});
  new MutationObserver(apply).observe(box,{{childList:true,subtree:true}});
}})();
</script>
</div></section>

<section><div class="wrap">
<p class="eyebrow">어디에 쓰나요</p>
<h2>쓰임과 제품</h2>
<p class="sub">말이 통해야 하는 자리에 맞췄습니다. 필요한 쪽을 눌러 보세요.</p>
<div class="cards4">
<a class="card" href="/field/"><img loading="lazy" src="{img("ship")}" alt="조선소에서 안전 지시를 듣는 외국인 근로자들">
<div class="in"><span class="st">사업장 · 교육기관 · 2026년 11월 출시 예정</span><h3>현장교육</h3><p>강사는 한국어로, 외국인 근로자는 각자의 말로. 교육이 끝나면 참석·청취 기록이 남습니다.</p><span class="more">자세히 보기 →</span></div></a>
<a class="card" href="/tour/"><img loading="lazy" src="{img("bukc")}" alt="북촌 한옥마을에서 설명하는 가이드와 관광객">
<div class="in"><span class="st">여행사 · 가이드 · 2026년 11월 출시 예정</span><h3>관광가이드</h3><p>가이드 한 명이 여러 나라 손님에게 동시에. 손님은 자기 폰과 이어폰이면 됩니다.</p><span class="more">자세히 보기 →</span></div></a>
<a class="card" href="/museum/"><img loading="lazy" src="{img("muse")}" alt="박물관 전시실에서 도슨트의 해설을 듣는 관람객들">
<div class="in"><span class="st">박물관 · 미술관 · 전시관 · 2026년 11월 출시 예정</span><h3>도슨트</h3><p>도슨트는 한 명, 관람객은 각자의 말로. 기기를 나눠 주고 회수하는 절차가 없습니다.</p><span class="more">자세히 보기 →</span></div></a>
<a class="card" href="/student/"><img loading="lazy" src="{img("lect")}" alt="강의실에서 교수를 보며 각자의 언어로 듣는 유학생들">
<div class="in"><span class="st">유학생 개인용 · 앱 + 이어폰 · 2026년 11월 출시 예정</span><h3>유학생 패키지</h3><p>교수는 평소처럼 말하고, 나는 내 폰과 이어폰으로 내 말로 듣습니다. 끝나면 강의 노트가 내 폰에 남습니다.</p><span class="more">자세히 보기 →</span></div></a>
<a class="card" href="/ows/"><img loading="lazy" src="{img("ocafe")}" alt="이어폰을 한쪽씩 나눠 끼고 대화하는 두 사람">
<div class="in"><span class="st">출시 준비 중</span><h3>OWS 통역 이어폰</h3><p>귀를 막지 않는 오픈형. 한쪽을 건네고 마주 보며 대화합니다.</p><span class="more">자세히 보기 →</span></div></a>
<a class="card" href="/glass/"><img loading="lazy" src="{img("glass-front")}" alt="RayTok 블루투스 선글라스 RT-18G 정면">
<div class="in"><span class="st">판매 중 · 99,000원</span><h3>블루투스 선글라스</h3><p>귀에 넣지 않는 공기전도. 음악과 통화, 그리고 통역까지 한 자리에서.</p><span class="more">자세히 보기 →</span></div></a>
<a class="card ko-only" href="/desk/">{mimg("mroom","해외 거래처와 화상회의를 하며 각자 이어폰으로 듣는 직원들")}
<div class="in"><span class="st">기업 · 해외 거래처 회의 · 2026년 11월 출시 예정</span><h3>Desk 화상회의</h3><p>내 PC 하나로. 상대 회사는 아무것도 사지 않고 링크만 엽니다. 인터넷이 필요합니다.</p><span class="more">자세히 보기 →</span></div></a>
</div>
</div></section>

<section class="alt"><div class="wrap">
<p class="eyebrow">어떻게 되나요</p>
<h2>폰 하나로 시작합니다</h2>
<p class="sub">수신기도, 통역 부스도 필요 없습니다. 듣는 사람은 자기 폰으로 듣습니다.</p>
<div class="g3">
<div class="step"><div class="n">1</div><h3>말하는 사람</h3><p>가슴에 작은 무선 마이크를 달고 폰은 주머니에. 평소처럼 한국어로 말합니다.</p></div>
<div class="step"><div class="n">2</div><h3>듣는 사람</h3><p>자기 폰으로 QR을 찍으면 브라우저가 열립니다. 설치·가입 없이 언어만 고릅니다.</p></div>
<div class="step"><div class="n">3</div><h3>각자의 언어로</h3><p>이어폰으로 듣고 화면으로 자막을 봅니다. 눈은 강사와 현장, 풍경에 둡니다.</p></div>
</div>
<div class="g4" style="margin-top:18px">
<div class="step"><h3>QR로 듣기</h3><p>설치도 가입도 없습니다. <b>아이폰을 포함해 기종을 가리지 않습니다.</b> 듣는 폰이 인터넷에 닿아 있으면 됩니다.</p></div>
<div class="step"><h3>앱으로 듣기</h3><p>언어 팩을 미리 받아 두면 전용 공유기 하나로 됩니다. 인터넷 회선이 들어오지 않는 공장·지하에서 쓰는 방식입니다.</p></div>
<div class="step"><h3>수신기 없음</h3><p>나눠 주고 걷고 충전하고 소독할 장비가 없습니다. 잃어버릴 것도 없습니다.</p></div>
<div class="step"><h3>오가는 것은 글자</h3><p>소리를 실어 나르지 않습니다. 음성은 듣는 사람 폰이 만듭니다. 그래서 <b>하루 여덟 시간을 써도 1MB가 안 됩니다.</b></p></div>
</div>

<p class="eyebrow" style="margin-top:34px">거리</p>
<h2>얼마나 떨어져 있든 들립니다</h2>
<p class="sub">무선 수신기는 전파가 닿는 범위에서만 들립니다. RayTok은 그 범위에 묶이지 않습니다. 듣는 폰이 인터넷이나 같은 공유기에 닿아 있으면 됩니다.</p>
<div class="g3">
<div class="step"><h3>뒤처져도</h3><p>앞 전시실이나 다음 코스에 남은 분께도 설명이 그대로 들어갑니다.</p></div>
<div class="step"><h3>층이 갈려도</h3><p>벽과 층이 막지 않습니다. 2층과 3층이 같은 해설을 듣습니다.</p></div>
<div class="step"><h3>흩어진 뒤에도</h3><p>"로비로 오세요"가 흩어진 전원에게 한 번에 갑니다. 자막이 화면에 남습니다.</p></div>
</div></div></section>

<section class="dark"><div class="wrap">
<p class="eyebrow">영상으로 보기</p>
<h2>현장, 투어, 대화 — 10초씩</h2>
<p class="sub">현장과 투어 영상은 소리를 켜고 보세요. 한국어로 말하는 장면이며, 듣는 사람에게는 각자의 언어로 전달됩니다.</p>
<div class="g3">
<div><div class="vid"><video controls playsinline preload="none" poster="{img("ship")}" src="{V_FIELD}"></video></div><p class="vcap">조선소 — "비계 밑으로는 절대 지나가지 마세요."</p></div>
<div><div class="vid"><video controls playsinline preload="none" poster="{img("bukc")}" src="{V_TOUR}"></video></div><p class="vcap">북촌 — "조금만 조용히 걸어 주세요."</p></div>
<div>{loopvid(V_OWS2, img("ocafe2"), "카페에서 이어폰 한쪽을 건네고 대화하는 두 사람")}<p class="vcap">OWS 이어폰 — 한쪽을 건네면 대화가 시작됩니다.</p></div>
</div></div></section>
''' + TECH + cta("먼저 써 보고 결정하세요", "시연은 무료입니다. 현장교육과 관광가이드 모두 30일 동안 무료로 체험할 수 있습니다.", "[RayTok] 무료 체험·도입 문의") + FOOT_HOME
write("/", home)

# ───────────── 현장교육 ─────────────
field = head("RayTok 현장교육 — 강사는 한국어로, 근로자는 각자의 말로",
             "외국인 근로자 안전교육·작업지시를 위한 통역 도구. 근로자는 QR로 바로 듣고, 회선 없는 현장은 앱과 공유기 하나로. 교육 기록 자동 생성. 30일 무료 체험 · 시연 무료.", "/field/", img("ship"), en=True) + top("field") + f'''
<div class="hero"><img src="{img("ship")}" alt="조선소 도크에서 안전 지시를 하는 관리자와 이어폰을 낀 외국인 근로자들">
<div class="wrap">
<span class="tag">현장교육 · 2026년 11월 출시 예정</span>
<h1>강사는 한국어로,<br>근로자는 각자의 말로.</h1>
<p class="lead">외국인 근로자 안전교육과 작업지시를 위한 통역 도구입니다. 교육이 끝나면 누가 얼마나 들었는지 기록이 남습니다.</p>
<div class="btns"><a class="btn p" href="{mailto("[RayTok 현장교육] 30일 무료 체험 신청", BODY)}">30일 무료 체험 신청</a><a class="btn g" href="#price">가격 보기</a></div>
</div></div>

<section><div class="wrap">
<p class="eyebrow">왜 지금</p>
<h2>2027년 1월 8일부터,<br>외국인 근로자 안전교육은 의무입니다</h2>
<p class="sub">2026년 7월 7일 공포된 산업안전보건법 개정(법률 제21853호)으로, 사업주는 채용하는 외국인 근로자에게 안전보건교육을 이수하게 해야 합니다.</p>
<table>
<tr><th></th><th>외국인</th><th>전체 근로자</th></tr>
<tr><td>산재율 (2022)</td><td><b>0.98%</b></td><td>0.65%</td></tr>
<tr><td>사망 만인율</td><td><b>1.28</b></td><td>1.10</td></tr>
<tr><td>국내 외국인 취업자</td><td colspan="2"><b>110만 9천 명</b> (2025년 5월, 통계청)</td></tr>
</table>
<p class="note">한 현장에 베트남·네팔·캄보디아·미얀마·우즈베키스탄 근로자가 함께 있습니다. 교재를 번역해도 강의가 한국어면 전달되지 않습니다.</p>
</div></section>

<section class="alt"><div class="wrap">
<p class="eyebrow">쓰는 방법</p>
<h2>강사는 평소처럼 말하면 됩니다</h2>
<div class="g3">
<div class="step"><div class="n">1</div><h3>강사는 평소처럼</h3><p>가슴에 무선 마이크, 폰은 주머니에. 한국어로 그대로 말합니다.</p></div>
<div class="step"><div class="n">2</div><h3>근로자는 QR 한 번</h3><p>자기 폰으로 QR을 찍고 언어를 고릅니다. 설치·가입·개인정보 입력이 없습니다.</p></div>
<div class="step"><div class="n">3</div><h3>귀로, 화면으로</h3><p>본인 이어폰으로 듣고 자막을 봅니다. 시선은 강사와 작업 현장에 둡니다.</p></div>
</div>
<div class="g2" style="margin-top:22px">
<div><div class="vid"><video controls playsinline preload="none" poster="{img("ship")}" src="{V_FIELD}"></video></div><p class="vcap">조선소 — 비계 아래 통행 금지 지시</p></div>
<div><div class="vid"><video controls playsinline preload="none" poster="{img("ware")}" src="{V_FIELD2}"></video></div><p class="vcap">물류창고 — 지게차 길과 보행로 안내</p></div>
</div>
<p class="vcap">연출 영상입니다. 소리를 켜고 보세요.</p>
</div></section>

<section><div class="wrap">
<p class="eyebrow">어디서나</p>
<h2>작업 현장 그대로에서</h2>
<p class="sub">근로자는 QR로 바로 듣습니다(설치 없음, 인터넷 필요). 인터넷 회선이 들어오지 않는 현장은 앱에 언어 팩을 받아 두고 전용 공유기 하나로 듣습니다.</p>
{shots([("ware","물류창고 — 지게차 동선"),("scaf","고층 비계 — 안전대 체결"),("auto","자동차부품 라인 — 방호장치"),("food","식품공장 — 위생 수칙"),("port","어항·선상 — 출항 전 안전 수칙"),("orch","과수원 — 계절근로자 작업 요령")])}
<table style="margin-top:22px">
<tr><th>1회 인원</th><td>강사 폰 핫스팟으로 3~5명 · 그보다 많으면 인터넷이 되는 휴대용 공유기 (공유기 1대로 30~50명, 공유기 사양 기준 · 공유기를 추가하는 만큼 증가 · 실제 인원은 현장 환경에 따라 시범에서 확인)</td></tr>
<tr><th>연결</th><td>강사와 근로자가 <b>같은 와이파이</b>에 접속합니다 (강사 폰 핫스팟 또는 소형 공유기 중 하나). 근로자는 한 번에 한 강사를 듣습니다</td></tr>
<tr><th>언어</th><td>대부분의 언어는 공유기 하나로 · 네팔어·미얀마어 등 일부 언어는 인터넷 필요</td></tr>
<tr><th>준비</th><td>교육 전 사무실 와이파이에서 필요한 언어만 강사 폰에 한 번 내려받기</td></tr>
<tr><th>기록</th><td>참석 인원, 언어별 인원, 개인별 청취 시간, 강의 원문과 번역문. <b>강사 폰에만 저장</b>되고 음성은 저장하지 않습니다</td></tr>
<tr><th>요금</th><td>도입 규모에 따라 안내 · 30일 무료 체험</td></tr>
</table>
</div></section>

<section class="alt" id="price"><div class="wrap">
<p class="eyebrow">가격</p>
<h2>도입 규모에 따라 안내드립니다</h2>
<p class="sub">근로자 수, 언어 수, 교육 횟수와 상관없이 현장 단위로 계약합니다. 강사 코드 2개가 기본으로 들어 있습니다. 현장 수와 필요한 언어를 알려 주시면 견적을 보내 드립니다.</p>
<div class="price"><div><b>30일 무료</b><span>누구나 체험 · 자동 결제 전환 없음</span></div><div><b>시연 무료</b><span>방문 또는 원격</span></div><div><b>견적 문의</b><span>현장 수·사용 언어를 알려 주세요</span></div></div>
<table>
<tr><th>항목</th><th>내용</th></tr>
<tr><td>계약 단위</td><td>현장 1곳 (근로자 수 무관 · 강사 코드 2개 포함)</td></tr>
<tr><td>강사 코드 추가</td><td>필요한 만큼 추가</td></tr>
<tr><td>교육 패키지</td><td>교육기관·협회용 (강사 코드 1개)</td></tr>
<tr><td>연 선납</td><td>할인 적용</td></tr>
<tr><td>휴대용 공유기 (5명이 넘을 때 필요)</td><td>별도</td></tr>
</table>
</div></section>

<section><div class="wrap">
<p class="eyebrow">자주 묻는 질문</p>
<h2>도입 전에 확인하세요</h2>
{faq([
("근로자가 소리로 들을 수 있습니까?","네. 본인 이어폰으로 듣습니다. 브라우저로 들을 때는 화면이 켜져 있어야 소리가 이어집니다. 소음이 큰 현장에서는 자막을 함께 보십시오."),
("사내 와이파이를 써도 됩니까?","보안상 기기 간 통신을 막아 둔 와이파이가 많습니다. 인터넷이 되는 휴대용 공유기(LTE 라우터 또는 유선 연결)를 따로 쓰기를 권합니다. 와이파이 증폭기(리피터)가 아니라, 접속한 기기에 주소를 직접 나눠 주는 공유기여야 합니다."),
("폰 안에 번역 모델이 없는 언어는 어떻게 됩니까?","QR로 들으면 폰에 그 언어가 없을 때 서버가 그 언어 그대로 번역합니다(인터넷 필요). 앱으로 들으면 번역은 폰 안에서만 하므로, 폰 안 모델이 없는 언어는 읽을 수 있는 다른 언어로 보여 줍니다. 예를 들어 네팔어는 힌디어, 라오어는 타이어, 몽골어는 러시아어로 표시하고, 화면에 '네팔어 모델이 없어 힌디어로 표시합니다'처럼 알립니다. 우즈베크어·크메르어·미얀마어·싱할라어처럼 대신할 언어가 없는 언어는 QR로 들어 주세요."),
("강사 폰 핫스팟으로도 됩니까?","3~5명까지는 강사 폰 핫스팟으로도 됩니다. 그보다 많으면 인터넷이 되는 휴대용 공유기가 필요합니다. 핫스팟을 쓸 때는 근로자 폰의 데이터도 강사 폰 회선을 씁니다. 강사 폰이 공유기 와이파이에 접속한 상태에서는 핫스팟을 함께 켤 수 없습니다. 공유기를 쓰면 근로자도 같은 공유기에 접속합니다."),
("현장에 인터넷이 없으면 못 씁니까?","됩니다. 인터넷 회선이 들어오지 않는 현장은 근로자가 앱으로 듣습니다 — 언어 팩을 미리 받아 두면 전용 공유기 하나로 됩니다. QR로 들을 때는 근로자 폰이 인터넷에 닿아 있어야 합니다. 도입 전에 현장에서 함께 확인합니다."),
("번역이 틀리면 어떻게 합니까?","기계 번역이므로 오역이 있을 수 있습니다. 중요한 안전 지시는 시연과 시각 자료를 함께 쓰십시오. 원문과 번역문이 함께 표시됩니다."),
("이 기록으로 법정 교육이 인정됩니까?","RayTok은 통역 도구이며 안전보건교육기관이 아닙니다. 교육의 실시·증빙·이수 관리 책임은 교육기관과 사업주에게 있습니다. 기록은 그 증빙을 돕는 자료입니다."),
("강사가 따로 배워야 합니까?","앱을 열고 시작을 누르면 됩니다. 안내는 30분이면 충분합니다."),
])}
</div></section>
''' + cta("30일 동안 실제 교육에 써 보세요", "외국인 근로자가 5명이어도 됩니다. 메일로 사업장과 인원을 알려 주시면 체험 방법을 안내합니다.", "[RayTok 현장교육] 30일 무료 체험 신청", "30일 무료 체험 신청") + FOOT
write("/field/", field)

# ───────────── 관광가이드 ─────────────
tour = head("RayTok 관광가이드 — 한 번 말하면, 모두가 각자의 말로 듣습니다",
            "다국어 단체 투어를 위한 통역 도구. 손님은 설치도 로밍도 필요 없이 자기 폰과 이어폰으로 듣습니다. 30일 무료 체험 · 시연 무료.", "/tour/", img("bukc"), en=True) + top("tour") + f'''
<div class="hero"><img src="{img("jeju")}" alt="제주 해안에서 가이드의 설명이 관광객 각자의 언어로 전달되는 장면">
<div class="wrap">
<span class="tag">관광가이드 · 2026년 11월 출시 예정</span>
<h1>한 번 말하면,<br>모두가 각자의 말로 듣습니다.</h1>
<p class="lead">가이드는 한국어로 설명하고, 손님은 자기 폰과 이어폰으로 자기 언어를 듣습니다. 설치도, 로밍도 필요 없습니다.</p>
<div class="btns"><a class="btn p" href="{mailto("[RayTok 관광가이드] 30일 무료 체험 신청", BODY)}">30일 무료 체험 신청</a><a class="btn g" href="#price">가격 보기</a></div>
</div></div>

<section><div class="wrap">
<p class="eyebrow">지금 투어</p>
<h2>한 버스에 여러 나라,<br>가이드는 한 명</h2>
<p class="sub">2024년 방한 외래객은 1,637만 명입니다. 한 그룹에 여러 언어가 섞이는 일이 흔해졌습니다.</p>
<table>
<tr><th>지금 방법</th><th>한계</th></tr>
<tr><td>언어별로 반복 설명</td><td>설명 시간이 언어 수만큼 늘어납니다</td></tr>
<tr><td>언어별 가이드 배정</td><td>희소 언어 가이드는 구하기 어렵고 비용이 큽니다</td></tr>
<tr><td>무선 수신기 대여</td><td>번역이 되지 않습니다. 가이드 목소리를 그대로 전달할 뿐입니다</td></tr>
<tr><td>손님 개인 번역 앱</td><td>데이터·로밍이 필요하고, 폰을 들고 가이드를 봐야 합니다</td></tr>
</table>
</div></section>

<section class="alt" id="how"><div class="wrap">
<p class="eyebrow">쓰는 방법</p>
<h2>가이드는 말하고,<br>손님은 풍경을 봅니다</h2>
<div class="g3">
<div class="step"><div class="n">1</div><h3>가이드는 평소처럼</h3><p>가슴에 작은 무선 마이크, 폰은 주머니에. 한국어로 설명합니다.</p></div>
<div class="step"><div class="n">2</div><h3>손님은 QR 한 번</h3><p>자기 폰으로 QR을 찍고 언어를 고릅니다. 설치·가입이 없습니다.</p></div>
<div class="step"><div class="n">3</div><h3>이어폰으로 듣기</h3><p>본인 이어폰으로 자기 언어를 듣습니다. 눈은 궁궐과 바다와 시장에 둡니다.</p></div>
</div>
<div class="vduo" style="margin-top:22px">
<div><div class="vid"><video controls playsinline preload="none" poster="{img("bukc")}" src="{V_TOUR}"></video></div><p class="vcap">북촌 한옥마을 — 조용히 걸어 달라는 안내</p></div>
<div><div class="vid tall"><video controls playsinline preload="none" poster="{img("gwang")}" src="{V_TOUR2}"></video></div><p class="vcap">광장시장 — 음식 소개</p></div>
</div>
<p class="vcap">연출 영상입니다. 소리를 켜고 보세요.</p>
</div></section>

<section><div class="wrap">
<p class="eyebrow">어디서나</p>
<h2>코스 그대로에서</h2>
<p class="sub">손님은 QR로 자기 폰에서 듣습니다(인터넷 필요). 주고받는 것이 소리가 아니라 글자라 데이터가 아주 적습니다. 회선이 없는 산·섬·지하는 앱과 전용 공유기 하나로 듣습니다.</p>
{shots([("seong","성산일출봉 — 바람 부는 야외"),("bulg","불국사 — 조용한 사찰 해설"),("gwang","광장시장 — 시끄러운 음식 투어"),("hwas","수원화성 — 길게 늘어선 행렬"),("nami","남이섬 — 걸으며 설명"),("muse","박물관 — 조용히 말해도 전달")])}
<table style="margin-top:22px">
<tr><th>그룹 인원</th><td>가이드 폰 핫스팟으로 3~5명 · 그보다 많으면 인터넷이 되는 휴대용 공유기 (공유기 1대로 30~50명, 공유기 사양 기준 · 공유기를 추가하는 만큼 증가 · 실제 인원은 환경에 따라 시범에서 확인)</td></tr>
<tr><th>연결</th><td>가이드와 손님이 <b>같은 와이파이</b>에 접속합니다 (가이드 폰 핫스팟 또는 휴대용 공유기 중 하나). 손님은 한 번에 한 가이드를 듣습니다</td></tr>
<tr><th>언어</th><td>대부분의 언어는 공유기 하나로 · 네팔어·미얀마어 등 일부 언어는 인터넷 필요</td></tr>
<tr><th>손님 준비물</th><td>자기 스마트폰과 이어폰. 수신기를 나눠 주고 걷을 필요가 없습니다</td></tr>
<tr><th>요금</th><td>도입 규모에 따라 안내 · 30일 무료 체험</td></tr>
</table>
</div></section>

<section class="alt" id="price"><div class="wrap">
<p class="eyebrow">가격</p>
<h2>도입 규모에 따라 안내드립니다</h2>
<p class="sub">쿠폰 한 장을 손님 한 명이 씁니다. 언어 수와 투어 횟수는 상관없습니다. 연간 손님 규모를 알려 주시면 견적을 보내 드립니다.</p>
<div class="price"><div><b>30일 무료</b><span>여행사·가이드 누구나 체험</span></div><div><b>시연 무료</b><span>방문 또는 원격</span></div><div><b>견적 문의</b><span>연간 손님 규모를 알려 주세요</span></div></div>
<table>
<tr><th>구분</th><th>내용</th></tr>
<tr><td>쿠폰 단위</td><td>1일권 · 7일권 (손님 1명 기준)</td></tr>
<tr><td>가이드 계정</td><td>무료 · 여행사·가이드가 쿠폰을 구매해 손님에게 배포</td></tr>
<tr><td>묶음 구매</td><td>할인 적용</td></tr>
<tr><td>증빙</td><td>전자세금계산서 발행</td></tr>
</table>
<div style="margin-top:20px; text-align:center;"><a class="btn p" href="/buy/" style="display:inline-block; padding:12px 28px; text-decoration:none;">쿠폰 구매하기 →</a></div>
</div></section>

<section><div class="wrap">
<p class="eyebrow">자주 묻는 질문</p>
<h2>도입 전에 확인하세요</h2>
{faq([
("손님이 소리로 계속 들을 수 있습니까?","네. 본인 이어폰으로 듣습니다. 브라우저로 들을 때는 화면이 켜져 있어야 소리가 이어집니다. 자막도 함께 뜨므로 놓친 부분은 화면으로 확인할 수 있습니다."),
("폰 안에 번역 모델이 없는 언어는 어떻게 됩니까?","QR로 들으면 폰에 그 언어가 없을 때 서버가 그 언어 그대로 번역합니다(인터넷 필요). 앱으로 들으면 번역은 폰 안에서만 하므로, 폰 안 모델이 없는 언어는 읽을 수 있는 다른 언어로 보여 줍니다. 예를 들어 네팔어는 힌디어, 라오어는 타이어, 몽골어는 러시아어로 표시하고, 화면에 '네팔어 모델이 없어 힌디어로 표시합니다'처럼 알립니다. 우즈베크어·크메르어·미얀마어·싱할라어처럼 대신할 언어가 없는 언어는 QR로 들어 주세요."),
("가이드 폰 핫스팟으로도 됩니까?","3~5명까지는 가이드 폰 핫스팟으로도 됩니다. 그보다 많으면 인터넷이 되는 휴대용 공유기가 필요합니다. 핫스팟을 쓸 때는 손님 폰의 데이터도 가이드 폰 회선을 씁니다. 가이드 폰이 공유기 와이파이에 접속한 상태에서는 핫스팟을 함께 켤 수 없습니다. 공유기를 쓰면 손님도 같은 공유기에 접속합니다."),
("손님이 이어폰이 없으면?","화면 자막으로 볼 수 있습니다. 여행사가 여분 이어폰을 준비해 두면 좋습니다."),
("가이드 폰 배터리는 괜찮습니까?","장시간 투어에는 보조배터리를 권합니다. 실제 코스에서 무료 체험으로 먼저 확인하십시오."),
("번역이 틀리면?","기계 번역이므로 오역이 있을 수 있습니다. 집합 시간이나 위험 구역 같은 안내는 짧고 분명하게 말씀하시면 좋습니다."),
("손님 개인정보는 어떻게 됩니까?","손님은 가입하지 않습니다. 연락처를 받지 않고 음성을 저장하지 않습니다."),
])}
</div></section>
''' + cta("다음 투어부터 30일 동안 무료로", "여행사·가이드 누구나 신청할 수 있습니다. 메일로 일정과 손님 언어를 알려 주세요.", "[RayTok 관광가이드] 30일 무료 체험 신청", "30일 무료 체험 신청") + FOOT
write("/tour/", tour)

# ───────────── OWS 통역 이어폰 ─────────────
OWS_M = mailto("[RayTok OWS] 출시 알림 신청", "이름:\n연락처:\n")
ows = head("RayTok OWS 통역 이어폰 — 건네도 괜찮은 통역 이어폰",
           "귀를 막지 않는 오픈형 이어폰과 RayTok 앱. 한쪽을 건네고 마주 보며 대화합니다. 언어 팩을 받아 두면 번역은 폰 안에서. 출시 준비 중.", "/ows/", img("ocafe"), en=True) + top("product") + f'''
<div class="hero"><img src="{img("ocafe")}" alt="카페에서 이어폰을 한쪽씩 나눠 끼고 대화하는 두 사람">
<div class="wrap">
<span class="tag">OWS 통역 이어폰 · 출시 준비 중</span>
<h1>건네도 괜찮은<br>통역 이어폰.</h1>
<p class="lead">귀에 넣지 않고 귓바퀴에 거는 오픈형입니다. 한쪽을 상대에게 건네고, 폰은 내려놓고, 마주 보며 이야기합니다.</p>
<div class="btns"><a class="btn p" href="{OWS_M}">출시 알림 신청</a><a class="btn g" href="/download/">지금은 앱으로 써 보기</a></div>
</div></div>

<section><div class="wrap">
<p class="eyebrow">왜 오픈형인가</p>
<h2>통역 이어폰은<br>한쪽을 상대가 껴야 합니다</h2>
<p class="sub">귀 안에 넣는 이어폰은 처음 만난 사람에게 내밀기 어렵습니다. 그래서 귀를 막지 않는 형태로 만듭니다.</p>
<div class="g3">
<div class="card"><img loading="lazy" src="{img("ohand")}" alt="이어폰 한쪽을 상대에게 건네는 손"><div class="in"><h3>건네기 쉽다</h3><p>귀에 넣지 않고 겁니다. 한쪽을 건네면 바로 대화가 시작됩니다.</p></div></div>
<div class="card"><img loading="lazy" src="{img("omkt")}" alt="해외 시장에서 상인과 이어폰을 나눠 끼고 대화하는 여행자"><div class="in"><h3>주변이 들린다</h3><p>상대의 실제 목소리와 주변 소리가 그대로 들립니다.</p></div></div>
<div class="card"><img loading="lazy" src="{img("oprod")}" alt="오픈형 이어폰과 충전 케이스"><div class="in"><h3>케이스에서 관리</h3><p>나눠 쓰는 물건이라 살균 기능을 갖춘 충전 케이스를 준비하고 있습니다.</p></div></div>
</div></div></section>

<section class="alt"><div class="wrap">
<p class="eyebrow">쓰는 방법</p>
<h2>폰 하나, 이어폰 한 쌍, 두 사람</h2>
<div class="g3">
<div class="step"><div class="n">1</div><h3>한쪽씩 나눠 낍니다</h3><p>한쪽은 상대, 한쪽은 나. 폰은 테이블에 내려놓습니다.</p></div>
<div class="step"><div class="n">2</div><h3>그냥 말합니다</h3><p>상대의 말은 내 귀에 내 언어로, 내 말은 상대 귀에 상대 언어로 들립니다.</p></div>
<div class="step"><div class="n">3</div><h3>언어 팩을 미리 받아 두면</h3><p>번역이 폰 안에서 끝나 비행기 안, 로밍이 안 되는 곳에서도 씁니다.</p></div>
</div>
<div class="g2" style="margin-top:22px">
<div>{loopvid(V_OWS1, img("omeet"), "회의장에서 이어폰 오른쪽을 상대에게 건네고 대화하는 두 사람")}<p class="vcap">회의장 — 처음 만난 상대에게 오른쪽을 건넵니다.</p></div>
<div>{loopvid(V_OWS2, img("ocafe2"), "카페에서 이어폰 오른쪽을 상대에게 건네고 대화하는 두 사람")}<p class="vcap">카페 — 받아서 귀에 걸면 바로 이야기합니다.</p></div>
</div>
<table style="margin-top:22px">
<tr><th>언어</th><td>언어 팩을 받아 두면 폰 안에서 번역 · 일부 언어는 폰 안 모델 없음</td></tr>
<tr><th>형태</th><td>귀를 막지 않는 오픈형(OWS) · 충전 케이스 포함</td></tr>
<tr><th>지원 폰</th><td>안드로이드 (아이폰은 준비 중)</td></tr>
<tr><th>가격</th><td>출시 시 안내 · 구매 문의는 메일로 주십시오</td></tr>
<tr><th>출시</th><td>준비 중입니다. 사양은 확정되는 대로 이 페이지에 올립니다</td></tr>
</table>
<p class="note">이미지는 형태를 보여 주는 연출 이미지이며 실제 제품과 다를 수 있습니다.</p>
</div></section>

<section><div class="wrap">
<p class="eyebrow">지금 바로</p>
<h2>이어폰이 나오기 전에도<br>앱은 쓸 수 있습니다</h2>
<p class="sub">가지고 계신 블루투스 이어폰으로 RayTok 앱의 대화 통역을 먼저 써 보세요.</p>
<div class="btns"><a class="btn d" href="/download/">앱 설치하기</a><a class="btn d" href="/guide/" style="background:#fff;color:var(--ink);border:1px solid var(--line)">사용설명서 보기</a></div>
</div></section>
''' + f'''<section class="dark cta"><div class="wrap">
<h2>출시되면 먼저 알려 드립니다</h2>
<p class="sub" style="margin:0 auto">메일로 이름과 연락처를 남겨 주세요. 출시 소식 한 번만 보냅니다.</p>
<div class="btns"><a class="btn p" href="{OWS_M}">출시 알림 신청</a></div>
<p class="mail">메일: <a href="mailto:{MAIL}">{MAIL}</a></p>
</div></section>
''' + FOOT
write("/ows/", ows)

# ───────────── Desk 화상회의 (구 이름 Meet, 2026-10-02 변경) ─────────────
# 규칙(claude/RayTok-Meet_경쟁조사_1002.md §6): 경쟁사 가격·실명 비교 금지, "끝나면 문서가 남는다" 금지(리포트 화면 전),
# 82개 언어는 Meet 숫자(오프라인 59와 섞지 않음), 가격 미공개, 인터넷·외부 전송 고지.
MEET_BODY = "회사명:\n담당자:\n연락처:\n쓰는 회의 앱:\n한 달 회의 시간(대략):\n상대방 언어:\n"
MEET_M = mailto("[RayTok Desk] 베타 신청", MEET_BODY)
meet = head("RayTok Desk — 상대 회사가 아무것도 사지 않아도 되는 화상회의 통역",
            "내 PC 하나로 화상회의를 통역합니다. 어느 회의 앱이든, 참석자는 링크만 열고 자기 언어로 듣고 봅니다. 봇 없음, 관리자 설정 없음. 2026년 11월 출시 예정.", "/desk/", img("mhero"), i18n=False) + top("desk") + f'''
<div class="hero">{mimg("mhero","노트북으로 해외 거래처와 화상회의를 하는 직원",' style="transform:scaleX(-1)"').replace(' loading="lazy"','')}
<div class="wrap">
<span class="tag">RayTok Desk · 2026년 11월 출시 예정 · Windows</span>
<h1>상대 회사가 아무것도<br>사지 않아도 됩니다.</h1>
<p class="lead">내 PC에 RayTok Desk 하나면 됩니다. 어느 회의 앱이든, 참석자는 링크만 열고 자기 언어로 듣고 봅니다.</p>
<div class="btns"><a class="btn p" href="{MEET_M}">베타 신청하기</a><a class="btn g" href="#how">쓰는 방법 보기</a></div>
</div></div>

<section><div class="wrap">
<p class="eyebrow">왜 필요한가</p>
<h2>해외 거래처와 화상회의,<br>번역이 막히는 세 군데</h2>
<div class="g3">
<div class="step"><h3>회의를 연 쪽에 달려 있습니다</h3><p>회의 앱에 딸린 번역 기능은 회의를 연 회사의 요금제와 관리자 설정에 따라 켜지기도, 안 켜지기도 합니다. 손님으로 들어간 회의에서는 내가 정할 수 없습니다.</p></div>
<div class="step"><h3>거래처마다 회의 앱이 다릅니다</h3><p>이 회사는 이 앱, 저 회사는 저 앱을 씁니다. 앱마다 번역을 따로 준비하기는 어렵습니다.</p></div>
<div class="step"><h3>자막은 화면을 봐야 합니다</h3><p>현장을 돌고 있거나 손이 바쁠 때는 자막을 읽을 수 없습니다.</p></div>
</div></div></section>

<section class="alt"><div class="wrap">
<p class="eyebrow">RayTok Desk</p>
<h2>내 PC 하나로 끝납니다</h2>
<p class="sub">회의 앱을 바꾸지 않습니다. 회의 앱에 무엇을 설치하지도 않습니다.</p>
<div class="g3">
<div class="step"><h3>상대는 사지 않습니다</h3><p>상대 회사는 설치도, 구매도, 관리자 설정도 하지 않습니다. 회의 채팅에 올라온 링크만 엽니다.</p></div>
<div class="step"><h3>귀로 듣습니다</h3><p>참석자는 자기 폰에서 자막을 보고, 음성으로도 듣습니다. 화면을 못 보는 자리에서도 회의를 따라갑니다.</p></div>
<div class="step"><h3>봇이 들어가지 않습니다</h3><p>회의방에 낯선 참석자가 추가되지 않습니다. 회의 앱 연동이나 승인 절차도 없습니다.</p></div>
</div>
<div class="shots two" style="margin-top:22px">
<figure>{mimg("mroom","회의실에서 벽면 화면의 해외 거래처와 회의하며 각자 이어폰으로 듣는 직원들")}<figcaption>회의실 — 여럿이 한 화면을 보며 각자 자기 폰으로 듣습니다</figcaption></figure>
<figure>{mimg("mmove","공장 안을 걸으며 이어폰으로 회의를 듣는 관리자")}<figcaption>현장 — 화면을 보지 않고 귀로 회의를 따라갑니다</figcaption></figure>
</div></div></section>

<section id="how"><div class="wrap">
<p class="eyebrow">쓰는 방법</p>
<h2>평소 쓰던 회의 앱 그대로</h2>
<div class="g3">
<div class="step"><div class="n">1</div><h3>RayTok Desk을 켭니다</h3><p>내 PC에서 RayTok Desk을 켜고, 평소 쓰던 회의 앱으로 회의에 들어갑니다.</p></div>
<div class="step"><div class="n">2</div><h3>링크를 올립니다</h3><p>화면에 나온 링크나 QR을 회의 채팅에 붙여 넣습니다.</p></div>
<div class="step"><div class="n">3</div><h3>각자 자기 언어로</h3><p>참석자는 링크를 열고 언어를 고릅니다. 상대의 말은 내 언어로, 내 말은 상대의 언어로 전달됩니다.</p></div>
</div>
<div class="chips"><span>Zoom</span><span>Google Meet</span><span>Microsoft Teams</span><span>Webex</span><span>그 밖에 PC에서 소리가 나는 회의 앱</span></div>
<table style="margin-top:22px">
<tr><th>내 PC</th><td>Windows (macOS는 준비 중)</td></tr>
<tr><th>회의 앱</th><td>회의 앱에 따로 설치하거나 연동할 것이 없습니다</td></tr>
<tr><th>참석자</th><td>링크 또는 QR로 접속 · 설치·가입 없음 · 폰과 PC 브라우저</td></tr>
<tr><th>언어</th><td>82개 언어 (출시 시점 기준)</td></tr>
<tr><th>인터넷</th><td>필요합니다. 오프라인 모드는 없습니다</td></tr>
<tr><th>출시</th><td>2026년 11월 예정 · 국내 기업 대상</td></tr>
</table>
</div></section>

<section class="alt"><div class="wrap">
<p class="eyebrow">요금</p>
<h2>사람 수가 아니라, 쓴 시간만큼</h2>
<p class="sub">회의에 몇 명이 들어오든 요금은 통역을 켠 시간으로 셉니다. 시간 묶음을 미리 사 두고 쓰는 방식을 준비하고 있습니다. 베타 기간에는 무료이고, 정식 가격은 실제 사용 시간을 재고 나서 공개합니다.</p>
<div class="price">
<div><b>베타 무료</b><span>베타 기간에는 무료 · 먼저 써 볼 기업을 찾습니다</span></div>
<div><b>시간 기준</b><span>참석자 수와 무관 · 시간 묶음 선불 방식 준비 중</span></div>
<div><b>11월</b><span>2026년 11월 출시 예정</span></div>
</div>
<div class="step notice"><h3>먼저 알려 드립니다</h3><ul>
<li>회의 음성은 인식과 번역을 위해 인터넷으로 외부 클라우드 서비스에 전송됩니다. 폰 안에서 번역하는 RayTok 앱과 다릅니다.</li>
<li>음성과 번역문의 처리·보관 방식은 출시 전에 개인정보 처리방침에 적습니다.</li>
<li>회의 참석자에게 통역 도구를 쓴다는 것을 미리 알려 주세요.</li>
<li>기계 번역에는 오역이 있을 수 있습니다. 계약 조건처럼 중요한 내용은 문서로 다시 확인하세요.</li>
</ul></div>
</div></section>

<section><div class="wrap">
<p class="eyebrow">자주 묻는 질문</p>
<h2>도입 전에 확인하실 것</h2>
''' + faq([
 ("상대방도 무엇을 설치해야 합니까?", "아니요. 상대방은 회의 채팅에 올라온 링크를 열고 언어만 고릅니다. 설치와 가입이 없습니다."),
 ("어떤 회의 앱에서 됩니까?", "PC에서 소리가 나는 회의 앱이면 됩니다. Zoom, Google Meet, Microsoft Teams, Webex에서 쓰도록 만들고 있습니다. 회의 앱에 플러그인이나 봇을 넣지 않습니다."),
 ("내 말도 상대에게 번역됩니까?", "네. 상대의 말과 내 말을 함께 받아 각자의 언어로 전달합니다."),
 ("인터넷이 없어도 됩니까?", "아니요. RayTok Desk은 인터넷이 필요합니다. 회선이 들어오지 않는 현장은 현장교육·관광가이드용 폰 앱과 전용 공유기로 씁니다."),
 ("맥에서도 됩니까?", "출시 때는 Windows만 지원합니다. macOS는 준비 중입니다."),
 ("가격은 얼마입니까?", "베타 기간에는 무료입니다. 정식 가격은 베타 기간에 실제 사용 시간을 재고 나서 공개합니다. 사람 수가 아니라 쓴 시간으로 세는 방식입니다."),
 ("번역은 정확합니까?", "기계 번역이므로 오역이 있을 수 있습니다. 짧고 분명하게 말하면 정확도가 올라갑니다. 계약 조건처럼 중요한 내용은 문서로 다시 확인하세요."),
]) + f'''
<p class="note">Zoom, Google Meet, Microsoft Teams, Webex는 각 회사의 상표이며, RayTok은 이들 회사와 제휴 관계가 없습니다. 특허 출원 중 (10-2026-0189470 외 {len(PATS) - 1}건).</p>
</div></section>

<section class="dark cta"><div class="wrap">
<h2>베타로 먼저 써 보세요</h2>
<p class="sub" style="margin:0 auto">해외 거래처와 화상회의를 자주 하는 기업을 찾습니다. 베타 기간에는 무료이며, 실제 회의에 써 보고 의견을 주시면 됩니다.</p>
<div class="btns"><a class="btn p" href="{MEET_M}">베타 신청하기</a></div>
<p class="mail">메일: <a href="mailto:{MAIL}">{MAIL}</a></p>
</div></section>
''' + FOOT
write("/desk/", meet)
# 옛 주소 /meet/ 는 /desk/ 로 넘긴다
write("/meet/", '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>RayTok Desk</title><link rel="canonical" href="https://raytok.kr/desk/"><meta http-equiv="refresh" content="0; url=/desk/"><meta name="robots" content="noindex"></head><body><a href="/desk/">RayTok Desk 로 이동</a></body></html>\n')

# ─────────────────────────────────────────────────────────────
# 제품 — 블루투스 선글라스 RT-18G (2026-10-28 입고, 판매 중)
# 금지: 돌비 / 골전도 / 방수 / 노이즈캔슬링 / AI안경 / 스마트글라스 / 「인터넷 없이」 / 특허 받았다
# 모델명은 반드시 RT-18G (전파인증번호와 일치시킬 것)
# ─────────────────────────────────────────────────────────────
from urllib.parse import quote as _q
GLASS_M = f"mailto:{MAIL}?subject={_q('[RayTok 선글라스 RT-18G] 주문')}&body={_q('성함:')}%0A{_q('연락처:')}%0A{_q('수량:')}%0A{_q('받으실 주소:')}%0A{_q('요청 사항:')}%0A"

glass = head("RayTok 블루투스 선글라스 RT-18G — 귀를 막지 않는 오픈이어 선글라스",
             "귀에 넣지 않는 공기전도 방식. 음악과 통화, 그리고 RayTok 통역까지. UV400 · 37g · 블루투스 5.0 · 99,000원.",
             "/glass/", img("glass-front")) + top("product") + f'''
<div class="hero">
<div class="wrap" style="padding-top:clamp(78px,10vw,118px);padding-bottom:clamp(18px,2.5vw,28px)">
<span class="tag">블루투스 선글라스 RT-18G · 교체 렌즈 3장 · 99,000원</span>
<h1>귀를 막지<br>않습니다.</h1>
<p class="lead">귀에 넣지 않고 귓바퀴 앞으로 소리를 보냅니다. 음악을 들으면서도 뒤에서 오는 차 소리가 들립니다.</p>
<div class="btns"><a class="btn p" href="tel:18006825">전화로 주문 1800-6825</a><a class="btn g" href="{GLASS_M}">메일로 문의</a><a class="btn g" href="#spec">제품 사양</a></div>
</div></div>
<div style="background:var(--ink);padding:0 0 clamp(30px,5vw,60px)"><div class="wrap">
<img src="{img("glass-hero")}" alt="RayTok 블루투스 선글라스 RT-18G 측면 — 다리 안쪽에 스피커가 있습니다" style="width:100%;height:auto;display:block" width="1600" height="615">
</div></div>

<section><div class="wrap">
<p class="eyebrow">왜 귀를 막지 않는가</p>
<h2>달리면서 음악을 듣는데<br>뒤차 소리가 안 들린다면</h2>
<p class="sub">귀에 끼우는 이어폰은 바깥 소리를 막습니다. RT-18G는 귀에 넣지 않고 귓바퀴 앞에서 소리를 전달합니다.</p>
<div class="g3">
<div class="step"><div class="n">1</div><h3>바깥 소리가 들립니다</h3><p>자전거를 타며 뒤차 소리를, 등산 중에 일행의 말을 그대로 듣습니다.</p></div>
<div class="step"><div class="n">2</div><h3>귀가 아프지 않습니다</h3><p>귓속에 아무것도 넣지 않습니다. 오래 써도 눌리거나 답답하지 않습니다.</p></div>
<div class="step"><div class="n">3</div><h3>렌즈가 3장 들어 있습니다</h3><p>맑은 날, 흐린 날, 어두울 때. 날씨에 맞춰 갈아 끼웁니다. 선글라스와 이어폰을 따로 챙길 일도 없습니다.</p></div>
</div>
<div class="g2" style="margin-top:22px">
<div><img loading="lazy" src="{img("glass-side")}" alt="RayTok 블루투스 선글라스 RT-18G 측면 — 다리 안쪽 스피커와 조작 버튼" style="width:100%;border-radius:14px"></div>
<div><img loading="lazy" src="{img("glass-front")}" alt="RayTok 블루투스 선글라스 RT-18G 정면 — UV400 미러 렌즈" style="width:100%;border-radius:14px"></div>
</div>
</div></section>

<section class="alt"><div class="wrap">
<p class="eyebrow">RayTok 앱과 함께</p>
<h2>한 명이 말하면<br>여러 명이 각자의 말로</h2>
<p class="sub">RayTok 앱을 연결하면, 선글라스를 쓴 사람이 말할 때 듣는 사람들이 각자 자기 언어로 받습니다. 가이드가 한국어로 말하면 손님은 영어로, 중국어로, 베트남어로 — 동시에.</p>
<div class="g3">
<div class="step"><h3>여러 명 동시에</h3><p>대부분의 통역 기기는 두 사람끼리입니다. RayTok은 듣는 사람 수에 제한을 두지 않습니다.</p></div>
<div class="step"><h3>월 구독료 0원</h3><p>번역이 폰 안에서 돌아갑니다. 오래 쓴다고 저희가 더 내는 돈이 없어서, 시간 제한을 걸 이유도 없습니다.</p></div>
<div class="step"><h3>손님은 앱이 없어도</h3><p>듣는 쪽은 QR을 찍어 브라우저로 들을 수 있습니다. 설치도 가입도 없습니다.</p></div>
</div>
<p class="note">번역은 RayTok 앱에서 동작합니다. 음성 안내는 듣는 기기에 설치된 언어에 한해 제공되며, 그 밖의 언어는 글자로 표시됩니다. 기계 번역에는 오역이 있을 수 있습니다.</p>
</div></section>

<section id="spec"><div class="wrap">
<p class="eyebrow">제품 사양</p>
<h2>RT-18G</h2>
<table style="margin-top:18px">
<tr><th>모델명</th><td>RT-18G</td></tr>
<tr><th>소리 방식</th><td>공기전도 개방형 — 귀에 넣지 않습니다</td></tr>
<tr><th>블루투스</th><td>5.0 · 첫 연결 후 자동 페어링</td></tr>
<tr><th>조작</th><td>다리 바깥쪽 버튼 한 개 — 재생·통화·음성비서 호출</td></tr>
<tr><th>무게</th><td>37g</td></tr>
<tr><th>사용 시간</th><td>약 5시간</td></tr>
<tr><th>충전</th><td>USB Type-C · DC 5V 1A · 약 1.5시간</td></tr>
<tr><th>렌즈</th><td>PC 렌즈 · UV400 (자외선 99.9% 이상 차단) · <b>3장 들어 있어 날씨에 따라 갈아 끼웁니다</b></td></tr>
<tr><th>프레임</th><td>프레임 PC · 템플 PC · 코받침과 다리 끝 미끄럼 방지</td></tr>
<tr><th>크기</th><td>166 × 81 × 69mm</td></tr>
<tr><th>구성품</th><td>본체 · <b>교체 렌즈 3장</b> · USB Type-C 케이블 · 파우치 · 설명서</td></tr>
<tr><th>가격</th><td>99,000원</td></tr>
<tr><th>보증</th><td>구매일로부터 1년 (소비자 과실 제외)</td></tr>
</table>
<table style="margin-top:14px">
<tr><th>적합성평가(전파)</th><td>R-R-PNLE-RT-18G</td></tr>
<tr><th>안전확인신고(배터리)</th><td>YU102612-24011K</td></tr>
<tr><th>제조사</th><td>CGTEK TECHNOLOGY CO., LIMITED</td></tr>
<tr><th>제조국</th><td>중국</td></tr>
<tr><th>수입·판매</th><td>주식회사 피엔엘에코</td></tr>
<tr><th>A/S 책임자</th><td>주식회사 피엔엘에코 · 1800-6825</td></tr>
</table>
</div></section>

<section class="alt"><div class="wrap">
<p class="eyebrow">어디에 쓰나요</p>
<h2>사계절, 밖에서</h2>
<div class="g4">
<div class="step"><h3>자전거 · 라이딩</h3><p>헬멧과 함께 씁니다. 장갑을 낀 채 버튼 하나로 곡을 넘깁니다.</p></div>
<div class="step"><h3>등산 · 러닝</h3><p>일행의 말과 주변 소리를 들으면서 음악을 듣습니다.</p></div>
<div class="step"><h3>스키 · 보드</h3><p>눈에 반사되는 햇빛을 막고, 리프트에서 통화를 받습니다.</p></div>
<div class="step"><h3>낚시 · 캠핑</h3><p>수면 반사광을 줄이고, 손을 쓰는 중에 전화를 받습니다.</p></div>
</div>
</div></section>

<section class="dark cta"><div class="wrap">
<h2>지금 주문하실 수 있습니다</h2>
<p class="sub" style="margin:0 auto">전화로 바로 주문하시거나, 메일로 성함·연락처·수량·받으실 주소를 남겨 주시면 안내해 드립니다. 오픈마켓 판매처는 준비 중입니다.</p>
<div class="btns"><a class="btn p" href="tel:18006825">전화로 주문 1800-6825</a><a class="btn g" href="{GLASS_M}">메일로 주문</a><a class="btn g" href="/download/">RayTok 앱 설치</a></div>
<p class="mail">평일 09:00~18:00 · 메일: <a href="mailto:{MAIL}">{MAIL}</a></p>
</div></section>
''' + FOOT
write("/glass/", glass)

# ── 제품 인덱스 ──────────────────────────────────────────────
product = head("RayTok 제품 — 통역 이어폰과 블루투스 선글라스",
               "귀를 막지 않는 RayTok 하드웨어. 나눠 끼는 OWS 통역 이어폰과 블루투스 선글라스 RT-18G.",
               "/product/", img("glass-front")) + top("product") + f'''
<div class="hero">
<div class="wrap" style="padding-top:clamp(78px,10vw,118px);padding-bottom:clamp(18px,2.5vw,28px)">
<span class="tag">RayTok 제품</span>
<h1>귀를 막지 않는<br>하드웨어.</h1>
<p class="lead">RayTok 앱은 가지고 계신 이어폰으로도 씁니다. 더 편하게 쓰시도록 귀를 막지 않는 기기를 만듭니다.</p>
</div></div>
<div style="background:var(--ink);padding:0 0 clamp(30px,5vw,60px)"><div class="wrap">
<img src="{img("glass-hero")}" alt="RayTok 블루투스 선글라스 RT-18G" style="width:100%;height:auto;display:block" width="1600" height="615">
</div></div>

<section><div class="wrap">
<div class="g2">
<a class="card" href="/glass/"><img loading="lazy" src="{img("glass-front")}" alt="RayTok 블루투스 선글라스 RT-18G 정면">
<div class="in"><span class="st">판매 중 · 99,000원</span><h3>블루투스 선글라스 RT-18G</h3><p>공기전도 개방형. 음악과 통화, 그리고 통역까지. UV400 · 37g · 블루투스 5.0.</p><span class="more">자세히 보기 →</span></div></a>
<a class="card" href="/ows/"><img loading="lazy" src="{img("ocafe")}" alt="이어폰을 한쪽씩 나눠 끼고 대화하는 두 사람">
<div class="in"><span class="st">출시 준비 중</span><h3>OWS 통역 이어폰</h3><p>귀에 걸어 쓰는 오픈형. 한쪽을 상대에게 건네고 마주 보며 대화합니다.</p><span class="more">자세히 보기 →</span></div></a>
</div>
<p class="note">사진은 실제 제품이며, 화면에 따라 색이 다르게 보일 수 있습니다.</p>
</div></section>

<section class="dark cta"><div class="wrap">
<h2>기기가 없어도 앱은 지금 씁니다</h2>
<p class="sub" style="margin:0 auto">가지고 계신 블루투스 이어폰으로 RayTok 앱을 먼저 써 보세요.</p>
<div class="btns"><a class="btn p" href="/download/">앱 설치하기</a><a class="btn g" href="/guide/">사용설명서</a></div>
</div></section>
''' + FOOT
write("/product/", product)
