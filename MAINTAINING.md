# 신라면세점 서울점 매장 안내 — 지도 유지보수 절차

이 저장소는 GitHub Pages로 https://qqaa2535-cyber.github.io/shilla-store-guide/ 에 배포된다.
`index.html`은 직접 고치지 말고 `src/tpl.html`(화면·로직) + `src/data.js`(층별 매장 데이터)를 고친 뒤 `python3 scripts/build.py`로 만든다.

## 자동 동기화
- `.github/workflows/sync-official.yml` 이 매일 04:40(KST) 공식 층별 안내 페이지를 읽는다.
- 층별 안내도 이미지를 `data/maps/<층>.jpg` 로 저장하고, 파일명의 업로드 날짜를 `data/official.json`의 `version`에 남긴다.
- 지금 지도가 어떤 버전의 안내도로 그려졌는지는 `data/traced.json`에 있다. 두 값이 다르면 `data/status.json`의 `stale`에 그 층이 들어간다.
- 공식 브랜드 목록 API는 자동 요청을 403으로 거부하므로 사용하지 않는다(우회하지 말 것).

## 안내도가 바뀐 층을 다시 그리는 법 (stale 층마다)
1. `data/maps/<층>.jpg`(공식 안내도, 가로 3213px)를 연다. 지도 좌표계는 "가로 800 기준 원본 좌표"다: `rawX = px * 800 / 이미지가로`, `rawY = py * 800 / 이미지가로 + 37`.
   좌표를 읽을 때 격자를 그려서 확대해 보면 정확하다(예: PIL로 crop 후 5단위 격자).
2. 이전 버전과 비교해 바뀐 매장만 찾는다(가능하면 git 이력의 이전 `data/maps/<층>.jpg`와 PIL `ImageChops.difference`로 비교).
3. `src/data.js`의 해당 층 `stores` 문자열을 고친다. 형식: `이름|x1|y1|x2|y2|카테고리|한글명` (`;`로 구분, 여러 줄 이름은 `·`로 줄바꿈).
   카테고리: b 화장품/향수, f 패션/가방, w 시계/주얼리, e 선글라스, d 식품/주류/담배, x 기타, z 라운지.
   매장 칸 사이에 통로가 있어야 경로가 그 사이로 지나간다(칸끼리 3단위 이상 띄우면 통로로 인식).
4. 화장실·엘리베이터·에스컬레이터·계단 아이콘 위치가 바뀌었으면 같은 층의 `fac` 배열도 고친다(`['wc'|'awc'|'elev'|'esc'|'stairs'|'info'|'stroller', x, y, '연결층']`).
   층 간 연결점은 `src/tpl.html`의 `LINKRAW`에 있다(B1F–1F–2F 에스컬레이터, 2F–2MF–3F 계단).
5. `python3 scripts/build.py` → `python3 scripts/check_routes.py` 로 모든 매장이 통로로 연결되는지 확인한다. 실패하면 칸 좌표를 조정한다.
6. `data/traced.json`의 그 층 값을 `data/official.json`의 `version`으로 바꾸고, `data/status.json`의 stale에서 뺀다.
7. 한 커밋으로 push 한다. 1~2분 뒤 사이트에 반영된다.
