"""Daily sync of the official Shilla Duty Free Seoul floor guide (brand list + floor map images).
Runs on GitHub Actions. One page load + a handful of list requests per day."""
import json, re, os, sys, time, hashlib, datetime, urllib.parse
import requests

BASE = "https://m.shilladfs.com"
PAGE = BASE + "/estore/kr/ko/shilladfscustomercenter/store/floor?code=01"
API = BASE + "/estore/kr/ko/shilladfscustomercenter/getBranchBrands-v2"
UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
      "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")
OUT = "data/official.json"

s = requests.Session()
s.headers.update({"User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9"})
r = s.get(PAGE, timeout=30)
r.raise_for_status()
html = r.text
tok = re.search(r'CSRFToken\s*=\s*"([^"]+)"', html) or re.search(r"token\s*:\s*'([^']+)'", html)
token = tok.group(1) if tok else ""
floors = re.findall(r'data-floor-id="(\d+)"[^>]*>\s*<a[^>]*>\s*<span>([^<]+)</span>', html)
imgs = []
for u in re.findall(r'https://media\.shilladfs\.com/files/attach/branchinfo/[^"\'\s)]+?\.(?:jpg|png)', html):
    if u not in imgs:
        imgs.append(u)
print("token:", bool(token), "floors:", floors, "images:", len(imgs))
if not floors:
    print(html[:2000]); sys.exit(1)

out = {"source": PAGE, "checked": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ"), "floors": {}}
for idx, (fid, fname) in enumerate(floors):
    fname = fname.strip()
    brands, page = [], 1
    while page <= 30:
        resp = s.post(API, data={"page": page, "branchCode": "01", "floorId": fid},
                      headers={"X-Requested-With": "XMLHttpRequest", "CSRFToken": token, "Referer": PAGE}, timeout=30)
        resp.raise_for_status()
        j = resp.json()
        items = j.get("brands") or []
        for b in items:
            for loc in b.get("brandLocation") or []:
                fl = (loc.get("floor") or {})
                if str(fl.get("id")) != str(fid):
                    continue
                brands.append({"name": b.get("brandName"), "floor": fl.get("floorInfo"),
                               "cats": loc.get("brandCategories") or [], "tel": loc.get("tel") or loc.get("phone") or ""})
        pi = j.get("pageInfo") or {}
        n = pi.get("numberOfPages") or pi.get("totalPages") or 1
        if page >= int(n) or not items:
            break
        page += 1
        time.sleep(1)
    img = imgs[idx] if idx < len(imgs) else ""
    out["floors"][fname] = {"floorId": fid, "image": img, "brands": brands}
    print(fname, len(brands), "brands", img[-40:])
    time.sleep(1)

# keep a copy of each floor map image (so a later map redraw can look at it)
os.makedirs("data/maps", exist_ok=True)
for fname, f in out["floors"].items():
    if not f["image"]:
        continue
    path = f"data/maps/{fname}.jpg"
    old = None
    if os.path.exists(path + ".url"):
        old = open(path + ".url").read().strip()
    if old != f["image"]:
        img = s.get(f["image"], timeout=60)
        img.raise_for_status()
        open(path, "wb").write(img.content)
        open(path + ".url", "w").write(f["image"])
        print("map image updated:", fname)

prev = None
if os.path.exists(OUT):
    prev = json.load(open(OUT))
def core(d):
    return json.dumps({k: v for k, v in (d or {}).items() if k != "checked"}, ensure_ascii=False, sort_keys=True)
if prev and core(prev) == core(out):
    print("no change in official data")
    out["checked"] = out["checked"]
json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
