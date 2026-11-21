// Google Apps Script bound to the sheet "신라면세점 서울점 매장안내 접속 통계".
// Deploy > Manage deployments > (기존 배포) 편집 > 버전: 새 버전 > 배포. URL은 그대로 유지된다.
// (처음이면 New deployment > Web app, Execute as: Me, Who has access: Anyone → /exec URL을 src/tpl.html의 STATS_URL에.)
//
// 개인정보 원칙: 기기 고유ID·IP·정확한 초 단위 시각·URL을 저장하지 않는다.
// 날짜와 '시간대(시)'만 남기고, 방문자 구분은 첫방문/재방문/당일재접속 값으로만 받는다.
// 모든 값은 허용 목록으로 걸러서 한국어로 바꿔 기록한다(목록 밖 값은 버림).

var SHEET = '이용통계';
var HEADER = ['날짜', '시간대', '구분', '언어', '기기', '방문유형', '유입', '목적지', '목적지층', '출발층', '검색어'];
var TYPE = {visit: '접속', dest: '목적지선택', nav: '길안내시작', arrive: '도착', lang: '언어변경', miss: '검색결과없음'};
var LANG = {ko: '한국어', zh: '중국어(간체)', tw: '중국어(번체)', en: '영어', ja: '일본어', vi: '베트남어', th: '태국어', fil: '필리핀어', es: '스페인어'};
var DEV = {mobile: '모바일', pc: 'PC'};
var VT = {'new': '첫방문', back: '재방문', same: '당일재접속'};
var FLOOR = {B1F: 1, '1F': 1, '2F': 1, '2MF': 1, '3F': 1};
var FAC = {wc: '화장실', awc: '장애인 화장실', elev: '엘리베이터', info: '안내데스크', esc: '에스컬레이터', stroller: '유모차 대여', stairs: '계단'};

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET, 0);           // 첫 번째 탭으로 만든다(기존 탭은 그대로 둔다)
    sh.appendRow(HEADER);
    sh.setFrozenRows(1);
  }
  return sh;
}

function floor_(v) { v = String(v || '').toUpperCase(); return FLOOR[v] ? v : ''; }

function place_(v) {
  v = String(v || '');
  var m = /^\[(\w+)\]$/.exec(v);
  if (m) return FAC[m[1]] ? '시설:' + FAC[m[1]] : '';
  return safe_(v.slice(0, 60));
}

// 시트 수식으로 해석되지 않게(=,+,-,@로 시작) 앞에 ' 를 붙이고, 줄바꿈을 없앤다.
function safe_(v) { v = String(v || '').replace(/[\r\n\t]/g, ' ').trim(); return /^[=+\-@]/.test(v) ? "'" + v : v; }

function doPost(e) {
  var d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) { return ContentService.createTextOutput('bad'); }
  if (!TYPE[d.type]) return ContentService.createTextOutput('skip');
  var now = new Date();
  var entry = '';
  if (d.type === 'visit') {
    var q = /^qr:(\w+)$/.exec(String(d.entry || ''));
    entry = q && floor_(q[1]) ? 'QR(' + floor_(q[1]) + ')' : (d.entry === 'direct' ? '직접접속' : '');
  }
  var term = '';
  if (d.type === 'miss') {
    term = String(d.q || '');
    term = (!term || /[\d@]/.test(term)) ? '(기록안함)' : safe_(term.slice(0, 20));
  }
  sheet_().appendRow([
    Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd'),
    Number(Utilities.formatDate(now, 'Asia/Seoul', 'H')),
    TYPE[d.type],
    LANG[d.lang] || '',
    DEV[d.ua] || '',
    d.type === 'visit' ? (VT[d.vt] || '') : '',
    entry,
    (d.type === 'dest' || d.type === 'nav' || d.type === 'arrive') ? place_(d.brand) : '',
    floor_(d.floor),
    d.type === 'nav' ? floor_(d.from) : '',
    term
  ]);
  return ContentService.createTextOutput('ok');
}
