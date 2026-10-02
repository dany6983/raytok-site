#!/usr/bin/env python3
# 소개 페이지의 사진·영상을 외부 CDN 에서 저장소 img/ 로 내려받는다.
# 실행(저장소 루트): python tools/fetch_media.py  →  python tools/build_home.py  →  git add img index.html field tour ows && git commit && git push
# build_home.py 는 img/<이름>.webp(.mp4) 가 있으면 자동으로 그 파일을 쓴다.
import os, re, sys, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, "tools", "build_home.py"), encoding="utf-8").read()
CDN = re.search(r'^CDN = "(.+?)"', src, re.M).group(1)
VID = re.search(r'^VID = "(.+?)"', src, re.M).group(1)
ids = dict(re.findall(r'"(\w+)":"(\d{8}_\d{6}_[0-9a-f-]{36})"', src))
jobs = [(f"{k}.webp", f"{CDN}hf_{v}_min.webp") for k, v in ids.items()]
jobs += [(n + ".mp4", VID + u) for n, u in re.findall(r'vid\("(\w+)", VID\+"([0-9a-f-]{36}\.mp4)"\)', src)]  # build_home.py 의 vid(...) 전부
os.makedirs(os.path.join(ROOT, "img"), exist_ok=True)
bad = 0
for name, url in jobs:
    dst = os.path.join(ROOT, "img", name)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        data = urllib.request.urlopen(req, timeout=60).read()
        if len(data) < 10000: raise ValueError("too small")
        open(dst, "wb").write(data)
        print("ok  ", name, len(data))
    except Exception as e:
        bad += 1; print("FAIL", name, e)
print(len(jobs) - bad, "/", len(jobs), "받음")
sys.exit(1 if bad else 0)
