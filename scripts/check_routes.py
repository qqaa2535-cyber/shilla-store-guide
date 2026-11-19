"""Open index.html in headless Chrome and check every store/facility is reachable through aisles.
Usage: python3 scripts/check_routes.py   (needs playwright + a Chrome/Chromium binary)"""
import asyncio, pathlib, shutil, sys
from playwright.async_api import async_playwright
root = pathlib.Path(__file__).resolve().parent.parent
async def main():
    exe = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=exe) if exe else await p.chromium.launch()
        pg = await b.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto((root / "index.html").as_uri()); await pg.wait_for_timeout(800)
        r = await pg.evaluate("""()=>{const bad=[];let n=0;for(const f of ORDER){for(const o of [...F[f].stores,...F[f].pois]){n++;const t=tgt(o);const p=path(f,F[f].liftPt,t);
          let ok=true;for(let i=1;i<p.length;i++)if(!los(f,p[i-1],p[i]))ok=false;if(!ok)bad.push(f+':'+(o.name||o.poi))}}return {n,bad}}""")
        await b.close()
    print(r, errs)
    sys.exit(1 if errs or r["bad"] else 0)
asyncio.run(main())
