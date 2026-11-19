"""Daily check of the official Shilla Duty Free Seoul floor guide.
Reads only the public floor page and its floor-map images (one page load per day).
The brand-list API refuses automated requests, so it is not used."""
import json, re, os, sys, datetime
import requests

PAGE = "https://m.shilladfs.com/estore/kr/ko/shilladfscustomercenter/store/floor?code=01"
UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
      "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")
s = requests.Session(); s.headers.update({"User-Agent": UA})
html = s.get(PAGE, timeout=30); html.raise_for_status(); html = html.text
floors = [f.strip() for _, f in re.findall(r'data-floor-id="(\d+)"[^>]*>\s*<a[^>]*>\s*<span>([^<]+)</span>', html) if _ != "0"]
imgs = []
for u in re.findall(r'https://media\.shilladfs\.com/files/attach/branchinfo/[^"\'\s)]+?\.(?:jpg|png)', html):
    if u not in imgs: imgs.append(u)
print("floors:", floors, "images:", len(imgs))
if not floors or not imgs: print(html[:1500]); sys.exit(1)

import urllib.parse
# match each Seoul-store floor image by its file name suffix (_B1F, _2F, _2MF, _3F; none = 1F)
byfloor = {}
for u in imgs:
    name = urllib.parse.unquote(u.rsplit("/", 1)[-1])
    if "서울점" not in name: continue
    m = re.search(r"_(B1F|2MF|2F|3F)\.(?:jpg|png)$", name)
    f = m.group(1) if m else "1F"
    stamp = int(re.match(r"(\d+)", name).group(1)) if re.match(r"(\d+)", name) else 0
    if f not in byfloor or stamp > byfloor[f][0]: byfloor[f] = (stamp, u)
os.makedirs("data/maps", exist_ok=True)
state = {"source": PAGE, "floors": {}}
for f in floors:
    url = byfloor.get(f, (0, ""))[1]
    state["floors"][f] = {"image": url}
    p = f"data/maps/{f}.jpg"
    old = open(p + ".url").read().strip() if os.path.exists(p + ".url") else None
    if url and old != url:
        r = s.get(url, timeout=60); r.raise_for_status()
        open(p, "wb").write(r.content); open(p + ".url", "w").write(url)
        print("map image changed:", f, url.rsplit("/", 1)[-1])
json.dump(state, open("data/official.json", "w"), ensure_ascii=False, indent=1)
# stale = floors whose official image differs from the image the current map was traced from
traced = json.load(open("data/traced.json")) if os.path.exists("data/traced.json") else {}
stale = [f for f in floors if state["floors"][f]["image"] and traced.get(f) and traced[f] != state["floors"][f]["image"]]
json.dump({"stale": stale, "checked": datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%d")}, open("data/status.json", "w"), indent=1)
print("stale floors:", stale)
