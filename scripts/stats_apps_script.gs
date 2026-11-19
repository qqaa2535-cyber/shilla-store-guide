// Google Apps Script bound to the sheet "신라면세점 서울점 매장안내 접속 통계".
// Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone). Put the /exec URL into STATS_URL in src/tpl.html.
function doPost(e) {
  var d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) { return ContentService.createTextOutput('bad'); }
  var allow = {visit:1, dest:1, nav:1, lang:1};
  if (!allow[d.type]) return ContentService.createTextOutput('skip');
  var now = new Date();
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  sh.appendRow([
    Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'),
    Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd'),
    String(d.type).slice(0, 10), String(d.lang || '').slice(0, 5), String(d.brand || '').slice(0, 80),
    String(d.floor || '').slice(0, 4), String(d.from || '').slice(0, 4), String(d.ua || '').slice(0, 8), String(d.uid || '').slice(0, 20)
  ]);
  return ContentService.createTextOutput('ok');
}
