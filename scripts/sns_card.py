#!/usr/bin/env python3
"""RayTok SNS 카드 생성기.

사용법:
    python3 scripts/sns_card.py cards.json

cards.json 형식 (리스트):
[
  {
    "file":   "d80.jpg",                  # img/sns/ 아래 저장될 이름
    "kicker": "2027년 1월 8일 시행",       # 금색 작은 머리글
    "lines":  ["외국인 근로자", "D-80"],   # 큰 제목 (줄별로, 최대 5줄)
    "accent": 1,                           # 금색으로 강조할 lines 인덱스 (없으면 생략)
    "sub":    ["받침 문장", "두 번째 줄"],  # 작은 설명 (최대 4줄)
    "foot":   "출처·단서 한 줄"
  }
]

규칙:
- 1080x1350 (인스타 세로). 남색 바탕 + 금색 강조.
- lines 한 줄은 11자 안쪽이어야 안 잘린다. sub 한 줄은 22자 안쪽.
- foot 에는 반드시 근거·단서를 적는다 (표시광고법 실증 대비).
"""
import json
import sys
import os
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTCollection

FONT_BLACK = "/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc"
FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FONT_REG = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"

W, H = 1080, 1350
NAVY = (11, 27, 58)
GOLD = (240, 180, 41)
WHITE = (255, 255, 255)
SUBTLE = (225, 230, 240)
GREY = (150, 160, 180)
RULE = (60, 80, 120)

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "img", "sns")


def kr_index(path):
    """.ttc 안에서 한국어 페이스 번호를 찾는다."""
    col = TTCollection(path, lazy=True)
    for i, f in enumerate(col.fonts):
        if "KR" in (f["name"].getDebugName(1) or ""):
            return i
    return 0


IDX = {p: kr_index(p) for p in (FONT_BLACK, FONT_BOLD, FONT_REG)}


def font(path, size):
    return ImageFont.truetype(path, size, index=IDX[path])


def draw_card(spec):
    im = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 14], fill=GOLD)

    y = 150
    d.text((90, y), spec["kicker"], font=font(FONT_BOLD, 34), fill=GOLD)
    y += 90

    accent = spec.get("accent")
    for i, line in enumerate(spec["lines"]):
        d.text((90, y), line,
               font=font(FONT_BLACK, 78),
               fill=GOLD if accent == i else WHITE)
        y += 104

    y += 50
    for line in spec.get("sub", []):
        d.text((90, y), line, font=font(FONT_REG, 40), fill=SUBTLE)
        y += 62

    d.line([90, H - 200, W - 90, H - 200], fill=RULE, width=2)
    d.text((90, H - 165), "RayTok", font=font(FONT_BLACK, 46), fill=WHITE)
    d.text((90, H - 100), spec.get("foot", ""), font=font(FONT_REG, 26), fill=GREY)
    d.text((W - 90, H - 160), "raytok.kr", font=font(FONT_BOLD, 32), fill=GOLD, anchor="ra")

    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, spec["file"])
    im.save(path, "JPEG", quality=88, optimize=True)
    return path


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    with open(sys.argv[1], encoding="utf-8") as fh:
        specs = json.load(fh)
    for spec in specs:
        path = draw_card(spec)
        print("%s  %d KB  ->  https://raytok.kr/img/sns/%s"
              % (spec["file"], os.path.getsize(path) // 1024, spec["file"]))


if __name__ == "__main__":
    main()
