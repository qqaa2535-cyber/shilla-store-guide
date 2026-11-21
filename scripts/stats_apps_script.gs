// Google Apps Script bound to the sheet "신라면세점 서울점 매장안내 접속 통계".
// 적용: 확장 프로그램 > Apps Script 에 이 파일 내용을 통째로 붙여넣고 저장
//       → 배포 > 배포 관리 > (기존 배포) 연필 > 버전: 새 버전 > 배포 (URL은 그대로 유지)
//       → 편집기 위쪽 함수 목록에서 setupSummary 를 골라 한 번 실행하면 '이용통계'·'요약' 탭이 바로 생긴다.
// (처음이면 New deployment > Web app, Execute as: Me, Who has access: Anyone → /exec URL을 src/tpl.html의 STATS_URL에.)
//
// 개인정보 원칙: 기기 고유ID·IP·정확한 초 단위 시각·좌표·URL을 저장하지 않는다.
// 날짜와 '시간대(시)'만 남기고, 방문자 구분은 첫방문/재방문/당일재접속 값으로만 받는다.
// 출발지는 '가장 가까운 매장 이름' 수준으로만 받는다.
// 모든 값은 허용 목록으로 걸러서 한국어로 바꿔 기록한다(목록 밖 값은 버림).

var RAW = '이용통계';
var SUM = '요약';
// A     B       C     D     E     F         G     H       I         J       K       L
var HEADER = ['날짜', '시간대', '구분', '언어', '기기', '방문유형', '유입', '목적지', '목적지층', '출발지', '출발층', '검색어'];
var TYPE = {visit: '접속', dest: '목적지선택', nav: '길안내시작', arrive: '도착', lang: '언어변경', miss: '검색결과없음'};
var LANG = {ko: '한국어', zh: '중국어(간체)', tw: '중국어(번체)', en: '영어', ja: '일본어', vi: '베트남어', th: '태국어', fil: '필리핀어', es: '스페인어'};
var DEV = {mobile: '모바일', pc: 'PC'};
var VT = {'new': '첫방문', back: '재방문', same: '당일재접속'};
var FLOOR = {B1F: 1, '1F': 1, '2F': 1, '2MF': 1, '3F': 1};
var FAC = {wc: '화장실', awc: '장애인 화장실', elev: '엘리베이터', info: '안내데스크', esc: '에스컬레이터', stroller: '유모차 대여', stairs: '계단'};

// ---------- 기록 ----------

function rawSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(RAW);
  if (!sh) {
    sh = ss.insertSheet(RAW, 0);             // 기존 탭은 그대로 두고 맨 앞에 만든다
    sh.getRange(1, 1, 1, HEADER.length).setValues([HEADER]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@'); // 날짜를 글자(yyyy-MM-dd)로 고정해 요약 수식이 흔들리지 않게
    buildSummary_();
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
  var from = '';
  if (d.type === 'nav') from = d.fromPlace === 'default' ? '첫 화면 위치(1F)' : place_(d.fromPlace);
  var sh = rawSheet_();
  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch (err) {}
  sh.appendRow([
    Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd'),
    Number(Utilities.formatDate(now, 'Asia/Seoul', 'H')),
    TYPE[d.type],
    LANG[d.lang] || '',
    DEV[d.ua] || '',
    d.type === 'visit' ? (VT[d.vt] || '') : '',
    entry,
    (d.type === 'dest' || d.type === 'nav' || d.type === 'arrive') ? place_(d.brand) : '',
    floor_(d.floor),
    from,
    d.type === 'nav' ? floor_(d.from) : '',
    term
  ]);
  try { lock.releaseLock(); } catch (err) {}
  return ContentService.createTextOutput('ok');
}

// ---------- 요약 탭 (수식으로 만들어 두면 기록이 쌓일 때마다 자동 갱신) ----------

function onOpen() {
  SpreadsheetApp.getUi().createMenu('매장안내 통계').addItem('요약 탭 다시 만들기', 'setupSummary').addToUi();
}

// 편집기에서 직접 실행하거나 메뉴에서 누르는 용도
function setupSummary() { rawSheet_(); buildSummary_(); }

var R = "'" + RAW + "'!";
var PERIOD = "Col1>='\"&TEXT($B$2,\"yyyy-mm-dd\")&\"' and Col1<='\"&TEXT($D$2,\"yyyy-mm-dd\")&\"'";

// 기간(B2~D2) 안에서 조건(where)에 맞는 행을 묶어 세는 QUERY 수식
function q_(select, where, group, extra) {
  var s = 'select ' + select + ' where ' + PERIOD + (where ? ' and ' + where : '') +
          (group ? ' group by ' + group : '') + (extra ? ' ' + extra : '');
  return '=IFERROR(QUERY({' + R + 'A2:L},"' + s + '",0),"기록 없음")';
}

// 기간 안 건수: 구분이 type 이고 (선택) 추가 조건
function cnt_(cond) {
  return 'SUMPRODUCT((' + R + 'A2:A>=TEXT($B$2,"yyyy-mm-dd"))*(' + R + 'A2:A<=TEXT($D$2,"yyyy-mm-dd"))' + cond + ')';
}

function block_(sh, a1, title, formula, note) {
  var c = sh.getRange(a1);
  c.setValue(title).setFontWeight('bold').setBackground('#e8f0fe');
  if (note) c.setNote(note);
  c.offset(1, 0).setFormula(formula);
}

function buildSummary_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SUM);
  if (sh) sh.clear(); else sh = ss.insertSheet(SUM, 1);
  sh.setFrozenRows(4);

  sh.getRange('A1').setValue('매장안내 이용 요약 — 왼쪽은 날짜별, 오른쪽 표들은 B2~D2 기간 기준 (날짜를 yyyy-mm-dd로 바꿔 넣으면 그 기간으로 다시 계산)').setFontWeight('bold');
  sh.getRange('A2').setValue('기간');
  sh.getRange('B2').setFormula('=TEXT(TODAY()-6,"yyyy-mm-dd")');
  sh.getRange('C2').setValue('~');
  sh.getRange('D2').setFormula('=TEXT(TODAY(),"yyyy-mm-dd")');
  sh.getRange('B2:D2').setBackground('#fff8e1');

  // 1) 날짜별 요약 (A4:N)
  var head = ['날짜', '방문자', '첫방문', '재방문', '당일재접속', '접속수', '모바일 방문자', 'QR 유입',
              '목적지선택', '길안내시작', '도착', '길안내율', '도착률', '검색결과없음'];
  sh.getRange(4, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e8f0fe');
  sh.getRange('B4').setNote('방문자 = 그날 접속한 기기 수 (접속수 − 당일재접속). 같은 사람이 다른 날 다시 오면 그날도 1명으로 셉니다.');
  sh.getRange('L4').setNote('길안내율 = 길안내시작 ÷ 목적지선택');
  sh.getRange('M4').setNote('도착률 = 도착 ÷ 길안내시작');
  function day(c) { return '=ARRAYFORMULA(IF($A5:$A="",,COUNTIFS(' + R + 'A:A,$A5:$A' + c + ')))'; }
  var C = R + 'C:C,';
  sh.getRange('A5').setFormula('=IFERROR(SORT(UNIQUE(FILTER(' + R + 'A2:A,' + R + 'A2:A<>"")),1,FALSE),)');
  sh.getRange('B5').setFormula('=ARRAYFORMULA(IF($A5:$A="",,F5:F-E5:E))');
  sh.getRange('C5').setFormula(day(',' + C + '"접속",' + R + 'F:F,"첫방문"'));
  sh.getRange('D5').setFormula(day(',' + C + '"접속",' + R + 'F:F,"재방문"'));
  sh.getRange('E5').setFormula(day(',' + C + '"접속",' + R + 'F:F,"당일재접속"'));
  sh.getRange('F5').setFormula(day(',' + C + '"접속"'));
  sh.getRange('G5').setFormula(day(',' + C + '"접속",' + R + 'E:E,"모바일",' + R + 'F:F,"<>당일재접속"'));
  sh.getRange('H5').setFormula(day(',' + C + '"접속",' + R + 'G:G,"QR*"'));
  sh.getRange('I5').setFormula(day(',' + C + '"목적지선택"'));
  sh.getRange('J5').setFormula(day(',' + C + '"길안내시작"'));
  sh.getRange('K5').setFormula(day(',' + C + '"도착"'));
  sh.getRange('L5').setFormula('=ARRAYFORMULA(IF($A5:$A="",,IFERROR(J5:J/I5:I,0)))');
  sh.getRange('M5').setFormula('=ARRAYFORMULA(IF($A5:$A="",,IFERROR(K5:K/J5:J,0)))');
  sh.getRange('N5').setFormula(day(',' + C + '"검색결과없음"'));
  sh.getRange('L5:M').setNumberFormat('0%');

  // 2) 기간 합계 (P4:Q15)
  var Cc = '*(' + R + 'C2:C=';
  var kpi = [
    ['방문자(일별 합)', '=' + cnt_(Cc + '"접속")*(' + R + 'F2:F<>"당일재접속")')],
    ['첫방문', '=' + cnt_(Cc + '"접속")*(' + R + 'F2:F="첫방문")')],
    ['재방문', '=' + cnt_(Cc + '"접속")*(' + R + 'F2:F="재방문")')],
    ['재방문 비율', '=IFERROR(Q7/(Q6+Q7),0)'],
    ['접속수', '=' + cnt_(Cc + '"접속")')],
    ['모바일 비율', '=IFERROR(' + cnt_(Cc + '"접속")*(' + R + 'F2:F<>"당일재접속")*(' + R + 'E2:E="모바일")') + '/Q5,0)'],
    ['목적지선택', '=' + cnt_(Cc + '"목적지선택")')],
    ['길안내시작', '=' + cnt_(Cc + '"길안내시작")')],
    ['도착', '=' + cnt_(Cc + '"도착")')],
    ['길안내율', '=IFERROR(Q12/Q11,0)'],
    ['도착률', '=IFERROR(Q13/Q12,0)']
  ];
  sh.getRange('P4').setValue('기간 합계').setFontWeight('bold').setBackground('#e8f0fe');
  sh.getRange('P4').setNote('방문자(일별 합): 하루 단위로 센 방문자를 더한 값이라, 여러 날 온 사람은 날마다 1명씩 들어갑니다.');
  for (var i = 0; i < kpi.length; i++) {
    sh.getRange(5 + i, 16).setValue(kpi[i][0]);
    sh.getRange(5 + i, 17).setFormula(kpi[i][1]);
  }
  ['Q8', 'Q10', 'Q14', 'Q15'].forEach(function (a) { sh.getRange(a).setNumberFormat('0%'); });

  // 3) 오른쪽 표들 (기간 기준)
  var notFac = "not Col8 starts with '시설:'";
  block_(sh, 'S4', '많이 찾은 목적지 TOP 10',
    q_('Col8, count(Col1)', "Col3='목적지선택' and Col8<>'' and " + notFac, 'Col8',
       "order by count(Col1) desc limit 10 label Col8 '목적지', count(Col1) '건수'"));
  block_(sh, 'V4', '도착 많은 곳 TOP 10',
    q_('Col8, count(Col1)', "Col3='도착' and Col8<>''", 'Col8',
       "order by count(Col1) desc limit 10 label Col8 '도착지', count(Col1) '건수'"));
  block_(sh, 'Y4', '출발지 TOP 10 (길안내 시작 위치)',
    q_('Col10, count(Col1)', "Col3='길안내시작' and Col10<>''", 'Col10',
       "order by count(Col1) desc limit 10 label Col10 '출발지', count(Col1) '건수'"),
    '길안내를 시작할 때 서 있던 곳에서 가장 가까운 매장(또는 직접 고른 출발지). 위치를 안 바꾸고 바로 시작하면 "첫 화면 위치(1F)".');
  block_(sh, 'AB4', '시설 검색',
    q_('Col8, count(Col1)', "Col3='목적지선택' and Col8 starts with '시설:'", 'Col8',
       "order by count(Col1) desc label Col8 '시설', count(Col1) '건수'"));

  block_(sh, 'P18', '인기 경로 TOP 10 (출발지 → 목적지)',
    q_('Col10, Col8, count(Col1)', "Col3='길안내시작' and Col8<>''", 'Col10, Col8',
       "order by count(Col1) desc limit 10 label Col10 '출발지', Col8 '목적지', count(Col1) '건수'"));
  block_(sh, 'T18', '층 이동 (행: 출발층, 열: 목적지층)',
    q_('Col11, count(Col1)', "Col3='길안내시작' and Col11<>''", 'Col11',
       "pivot Col9 label Col11 '출발층'"));
  block_(sh, 'AA18', '층별 목적지',
    q_('Col9, count(Col1)', "Col3='목적지선택' and Col9<>''", 'Col9',
       "order by count(Col1) desc label Col9 '층', count(Col1) '건수'"));

  block_(sh, 'P31', '언어별 방문자',
    q_('Col4, count(Col1)', "Col3='접속' and Col6<>'당일재접속' and Col4<>''", 'Col4',
       "order by count(Col1) desc label Col4 '언어', count(Col1) '방문자'"));
  block_(sh, 'S31', '시간대별 접속',
    q_('Col2, count(Col1)', "Col3='접속'", 'Col2',
       "order by Col2 label Col2 '시', count(Col1) '접속수'"));
  block_(sh, 'V31', '유입 경로',
    q_('Col7, count(Col1)', "Col3='접속' and Col7<>''", 'Col7',
       "order by count(Col1) desc label Col7 '유입', count(Col1) '접속수'"),
    'QR(층) = 그 층에 붙은 매장안내 QR로 들어온 접속');
  block_(sh, 'Y31', '검색했는데 없던 이름 TOP 10',
    q_('Col12, count(Col1)', "Col3='검색결과없음' and Col12<>''", 'Col12',
       "order by count(Col1) desc limit 10 label Col12 '검색어', count(Col1) '건수'"),
    '지도에 빠진 매장을 찾는 용도. 숫자·@가 들어간 검색어는 "(기록안함)"으로만 남습니다.');
  block_(sh, 'AB31', '언어별 많이 찾은 목적지 TOP 5',
    '=IFERROR(QUERY({' + R + 'A2:L},"select Col4, Col8, count(Col1) where ' + PERIOD +
      " and Col3='목적지선택' and Col8<>'' and Col4<>'' group by Col4, Col8 order by Col4, count(Col1) desc label Col4 '언어', Col8 '목적지', count(Col1) '건수'" +
      '",0),"기록 없음")',
    '언어별로 건수 많은 순. 언어마다 위에서 5개까지 보면 TOP 5입니다.');

  sh.setColumnWidth(1, 95);
  sh.autoResizeColumns(16, 15);
}
