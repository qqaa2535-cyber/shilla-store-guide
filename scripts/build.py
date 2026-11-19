"""Build index.html from src/tpl.html + src/data.js."""
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
tpl = (root / "src/tpl.html").read_text(encoding="utf-8")
data = (root / "src/data.js").read_text(encoding="utf-8")
assert "/*DATA*/" in tpl
(root / "index.html").write_text(tpl.replace("/*DATA*/", data), encoding="utf-8")
print("built index.html")
