// Google Apps Script bound to the sheet "신라면세점 서울점 매장안내 접속 통계".
// 적용: 확장 프로그램 > Apps Script 에 이 파일 내용을 통째로 붙여넣고 저장
//       → 배포 > 배포 관리 > 연필 > 버전: 새 버전 > 배포 (URL은 그대로 유지)
//       → 함수 목록에서 setupSummary 를 골라 '실행' (이용통계·요약 탭을 만들거나 다시 만든다)
//
// 개인정보 원칙: 기기 고유ID·IP·정확한 초 단위 시각·좌표·URL을 저장하지 않는다.
// 날짜와 '시간대(시)'만 남기고, 방문자 구분은 기기 안에서 판단한 첫방문/재방문/당일재접속 값만 받는다.
// 출발지는 '가장 가까운 매장 이름' 수준으로만, 검색어는 숫자 4개 이상·@가 있으면 기록하지 않는다.

var RAW = '이용통계';
var SUM = '요약';
// A     B       C     D     E     F         G     H       I       J       K         L
var HEADER = ['날짜', '시간대', '구분', '언어', '기기', '방문유형', '유입', '출발지', '출발층', '목적지', '목적지층', '검색어'];
var TYPE = {visit: '접속', search: '검색'};
var LANG = {ko: '한국어', zh: '중국어(간체)', tw: '중국어(번체)', en: '영어', ja: '일본어', vi: '베트남어', th: '태국어', fil: '필리핀어', es: '스페인어'};
var DEV = {mobile: '모바일', pc: 'PC'};
var VT = {'new': '첫방문', back: '재방문', same: '당일재접속'};
var FLOOR = {B1F: 1, '1F': 1, '2F': 1, '2MF': 1, '3F': 1};
var FAC = {wc: '화장실', awc: '장애인 화장실', elev: '엘리베이터', info: '안내데스크', esc: '에스컬레이터', stroller: '유모차 대여', stairs: '계단'};

// ---------- 기록 ----------

function rawSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(RAW);
  if (sh && sh.getRange(1, 1, 1, HEADER.length).getValues()[0].join('|') !== HEADER.join('|')) {
    sh.setName(RAW + '(이전 형식) ' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'MMdd-HHmm'));
    sh = null;                               // 열 구성이 바뀐 탭은 이름만 바꿔 보관하고 새로 만든다
  }
  if (!sh) {
    sh = ss.insertSheet(RAW, 0);
    sh.getRange(1, 1, 1, HEADER.length).setValues([HEADER]).setFontWeight('bold').setBackground('#e8f0fe');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@');
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

function query_(v) {
  v = String(v || '').trim();
  if (!v) return '';
  if (/@/.test(v) || (v.match(/\d/g) || []).length >= 4) return '(기록안함)';
  return safe_(v.slice(0, 30));
}

function doPost(e) {
  var d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) { return ContentService.createTextOutput('bad'); }
  if (!TYPE[d.type]) return ContentService.createTextOutput('skip');
  var now = new Date();
  var visit = d.type === 'visit';
  var entry = '';
  if (visit) {
    var q = /^qr:(\w+)$/.exec(String(d.entry || ''));
    entry = q && floor_(q[1]) ? 'QR(' + floor_(q[1]) + ')' : (d.entry === 'direct' ? '직접접속' : '');
  }
  var from = visit ? '' : (d.fromPlace === 'default' ? '첫 화면 위치(1F)' : place_(d.fromPlace));
  var sh = rawSheet_();
  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch (err) {}
  sh.appendRow([
    "'" + Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd'),   // 앞의 ' 는 날짜를 글자로 고정
    Number(Utilities.formatDate(now, 'Asia/Seoul', 'H')),
    TYPE[d.type],
    LANG[d.lang] || '',
    DEV[d.ua] || '',
    visit ? (VT[d.vt] || '') : '',
    entry,
    from,
    visit ? '' : floor_(d.from),
    visit ? '' : place_(d.brand),
    visit ? '' : floor_(d.floor),
    visit ? '' : query_(d.q)
  ]);
  try { lock.releaseLock(); } catch (err) {}
  return ContentService.createTextOutput('ok');
}

// ---------- 요약 탭 ----------

function onOpen() {
  SpreadsheetApp.getUi().createMenu('매장안내 통계').addItem('요약 탭 다시 만들기', 'setupSummary').addToUi();
}

function setupSummary() { rawSheet_(); buildSummary_(); }

var R = "'" + RAW + "'!";
var PERIOD = "Col1>='\"&TEXT($B$2,\"yyyy-mm-dd\")&\"' and Col1<='\"&TEXT($D$2,\"yyyy-mm-dd\")&\"'";
var SEARCH_OK = "Col3='검색' and Col10<>''";   // 목적지를 고른 검색
var SEARCH_NO = "Col3='검색' and (Col10='' or Col10 is null)";    // 결과가 없던 검색

function q_(select, where, group, extra) {
  var s = 'select ' + select + ' where ' + PERIOD + (where ? ' and ' + where : '') +
          (group ? ' group by ' + group : '') + (extra ? ' ' + extra : '');
  return '=IFERROR(QUERY({' + R + 'A2:L},"' + s + '",0),"기록 없음")';
}

function cnt_(cond) {
  return 'SUMPRODUCT((' + R + 'A2:A>=TEXT($B$2,"yyyy-mm-dd"))*(' + R + 'A2:A<=TEXT($D$2,"yyyy-mm-dd"))' + cond + ')';
}

function title_(sh, a1, text, note) {
  var c = sh.getRange(a1);
  c.setValue(text).setFontWeight('bold').setBackground('#e8f0fe');
  if (note) c.setNote(note);
  return c;
}

function block_(sh, a1, text, formula, note) { title_(sh, a1, text, note).offset(1, 0).setFormula(formula); }

function chart_(sh, type, range, row, col, title, opts) {
  var b = sh.newChart().setChartType(type).setNumHeaders(1)
    .setPosition(row, col, 0, 0)
    .setOption('title', title).setOption('legend.position', 'none')
    .setOption('width', 560).setOption('height', 290);
  [].concat(range).forEach(function (r) { b.addRange(sh.getRange(r)); });
  for (var k in (opts || {})) b.setOption(k, opts[k]);
  sh.insertChart(b.build());
}

function buildSummary_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('Asia/Seoul');   // TODAY()가 한국 날짜가 되도록
  var sh = ss.getSheetByName(SUM);
  if (sh) { sh.getCharts().forEach(function (c) { sh.removeChart(c); }); sh.clear(); sh.clearNotes(); }
  else sh = ss.insertSheet(SUM, 1);
  if (sh.getMaxColumns() < 52) sh.insertColumnsAfter(sh.getMaxColumns(), 52 - sh.getMaxColumns());
  if (sh.getMaxRows() < 400) sh.insertRowsAfter(sh.getMaxRows(), 400 - sh.getMaxRows());
  sh.setFrozenRows(4);

  sh.getRange('A1').setValue('매장안내 이용 요약 — 왼쪽: 날짜별 / 가운데: 그래프 / 오른쪽: 표. 그래프·표는 B2~D2 기간 기준(날짜를 yyyy-mm-dd로 바꿔 넣으면 다시 계산)').setFontWeight('bold');
  sh.getRange('A2').setValue('기간');
  sh.getRange('B2').setFormula('=TEXT(TODAY()-6,"yyyy-mm-dd")');
  sh.getRange('C2').setValue('~');
  sh.getRange('D2').setFormula('=TEXT(TODAY(),"yyyy-mm-dd")');
  sh.getRange('B2:D2').setBackground('#fff8e1');

  // 1) 날짜별 (A4:I) — 최신 날짜가 위
  var head = ['날짜', '방문자', '첫방문', '재방문', '접속수', '모바일 방문자', 'QR 유입', '검색', '검색결과없음'];
  sh.getRange(4, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e8f0fe');
  sh.getRange('B4').setNote('그날 사이트를 연 기기 수 = 첫방문 + 재방문. 같은 기기에서 그날 다시 연 것(새로고침 등)은 빼고 셉니다.');
  sh.getRange('C4').setNote('이 기기에서 처음 연 경우. 휴대폰 브라우저에 "마지막 접속 날짜"가 없으면 첫방문으로 판단합니다.');
  sh.getRange('D4').setNote('예전 날짜에 연 적이 있는 기기가 오늘 처음 연 경우.');
  sh.getRange('E4').setNote('사이트를 연 전체 횟수(같은 날 다시 열거나 새로고침한 것 포함).');
  sh.getRange('G4').setNote('매장에 붙인 위치 QR로 들어온 방문자. QR 주소 끝에 #loc-층-좌표 가 붙어 있어 구분됩니다.');
  sh.getRange('H4').setNote('목적지를 고른 횟수(검색창·지도·바로가기 버튼 포함).');
  sh.getRange('I4').setNote('검색했는데 결과가 없어서 아무것도 못 고른 횟수.');
  function day(c) { return '=ARRAYFORMULA(IF($A5:$A="",,COUNTIFS(' + R + 'A:A,$A5:$A' + c + ')))'; }
  var V = ',' + R + 'C:C,"접속"', S = ',' + R + 'C:C,"검색"';
  sh.getRange('A5').setFormula('=IFERROR(SORT(UNIQUE(FILTER(' + R + 'A2:A,' + R + 'A2:A<>"")),1,FALSE),)');
  sh.getRange('B5').setFormula('=ARRAYFORMULA(IF($A5:$A="",,C5:C+D5:D))');
  sh.getRange('C5').setFormula(day(V + ',' + R + 'F:F,"첫방문"'));
  sh.getRange('D5').setFormula(day(V + ',' + R + 'F:F,"재방문"'));
  sh.getRange('E5').setFormula(day(V));
  sh.getRange('F5').setFormula(day(V + ',' + R + 'E:E,"모바일",' + R + 'F:F,"<>당일재접속"'));
  sh.getRange('G5').setFormula(day(V + ',' + R + 'G:G,"QR*",' + R + 'F:F,"<>당일재접속"'));
  sh.getRange('H5').setFormula(day(S + ',' + R + 'J:J,"<>"'));
  sh.getRange('I5').setFormula(day(S + ',' + R + 'J:J,""'));
  sh.setColumnWidth(1, 95);
  sh.setColumnWidths(2, 8, 80);

  // 2) 그래프용 데이터 (AL 열부터, 오른쪽 끝) — 그래프가 이 표를 읽는다
  title_(sh, 'AL3', '▼ 그래프용 데이터 (수정하지 마세요)');
  block_(sh, 'AL4', '목적지 TOP 10',
    q_('Col10, count(Col1)', SEARCH_OK + " and not Col10 starts with '시설:'", 'Col10',
       "order by count(Col1) desc limit 10 label Col10 '목적지', count(Col1) '검색'"));
  block_(sh, 'AO4', '언어별 방문자',
    q_('Col4, count(Col1)', "Col3='접속' and Col6<>'당일재접속' and Col4<>''", 'Col4',
       "order by count(Col1) desc label Col4 '언어', count(Col1) '방문자'"));
  block_(sh, 'AR4', '시간대별 접속',
    q_('Col2, count(Col1)', "Col3='접속'", 'Col2', "order by Col2 label Col2 '시', count(Col1) '접속수'"));
  block_(sh, 'AU4', '출발지 TOP 10',
    q_('Col8, count(Col1)', SEARCH_OK + " and Col8<>''", 'Col8',
       "order by count(Col1) desc limit 10 label Col8 '출발지', count(Col1) '검색'"));
  block_(sh, 'AX4', '층별 목적지',
    q_('Col11, count(Col1)', SEARCH_OK + " and Col11<>''", 'Col11',
       "order by count(Col1) desc label Col11 '층', count(Col1) '검색'"));

  // 3) 그래프 (K 열부터 2열 × 3줄)
  var CT = Charts.ChartType;
  chart_(sh, CT.COLUMN, ['A4:A400', 'C4:D400'], 5, 11, '날짜별 방문자 (첫방문 + 재방문)',
    {isStacked: true, 'legend.position': 'top', colors: ['#1a73e8', '#34a853'], 'hAxis.direction': -1});
  chart_(sh, CT.BAR, 'AL5:AM15', 5, 17, '많이 찾은 목적지 TOP 10', {colors: ['#e8710a']});
  chart_(sh, CT.PIE, 'AO5:AP15', 20, 11, '언어별 방문자', {'legend.position': 'right', pieHole: 0.4});
  chart_(sh, CT.COLUMN, 'AR5:AS29', 20, 17, '시간대별 접속', {colors: ['#9334e6']});
  chart_(sh, CT.BAR, 'AU5:AV15', 35, 11, '출발지 TOP 10 (검색할 때 있던 곳)', {colors: ['#12b5cb']});
  chart_(sh, CT.PIE, 'AX5:AY10', 35, 17, '층별 목적지', {'legend.position': 'right', pieHole: 0.4});

  // 4) 표 (W 열부터)
  title_(sh, 'W4', '기간 합계');
  var Cc = '*(' + R + 'C2:C=';
  var kpi = [
    ['방문자', '=' + cnt_(Cc + '"접속")*(' + R + 'F2:F<>"당일재접속")')],
    ['첫방문', '=' + cnt_(Cc + '"접속")*(' + R + 'F2:F="첫방문")')],
    ['재방문', '=' + cnt_(Cc + '"접속")*(' + R + 'F2:F="재방문")')],
    ['재방문 비율', '=IFERROR(X7/(X6+X7),0)'],
    ['접속수', '=' + cnt_(Cc + '"접속")')],
    ['모바일 비율', '=IFERROR(' + cnt_(Cc + '"접속")*(' + R + 'F2:F<>"당일재접속")*(' + R + 'E2:E="모바일")') + '/X5,0)'],
    ['QR 유입', '=' + cnt_(Cc + '"접속")*(' + R + 'F2:F<>"당일재접속")*(LEFT(' + R + 'G2:G,2)="QR")')],
    ['검색', '=' + cnt_(Cc + '"검색")*(' + R + 'J2:J<>"")')],
    ['검색결과없음', '=' + cnt_(Cc + '"검색")*(' + R + 'J2:J="")')]
  ];
  for (var i = 0; i < kpi.length; i++) {
    sh.getRange(5 + i, 23).setValue(kpi[i][0]);
    sh.getRange(5 + i, 24).setFormula(kpi[i][1]);
  }
  sh.getRange('X8').setNumberFormat('0%');
  sh.getRange('X10').setNumberFormat('0%');
  sh.getRange('W5').setNote('기간 방문자는 날짜별 방문자를 더한 값이라, 여러 날 온 사람은 날마다 1명씩 들어갑니다.');

  block_(sh, 'AA4', '유입 경로',
    q_('Col7, count(Col1)', "Col3='접속' and Col6<>'당일재접속' and Col7<>''", 'Col7',
       "order by count(Col1) desc label Col7 '유입', count(Col1) '방문자'"));
  block_(sh, 'AD4', '시설 검색',
    q_('Col10, count(Col1)', "Col3='검색' and Col10 starts with '시설:'", 'Col10',
       "order by count(Col1) desc label Col10 '시설', count(Col1) '검색'"));
  block_(sh, 'W16', '인기 경로 TOP 10 (출발지 → 목적지)',
    q_('Col8, Col10, count(Col1)', SEARCH_OK + " and Col8<>''", 'Col8, Col10',
       "order by count(Col1) desc limit 10 label Col8 '출발지', Col10 '목적지', count(Col1) '검색'"));
  block_(sh, 'AA16', '많이 쓴 검색어 TOP 10',
    q_('Col12, count(Col1)', "Col3='검색' and Col12<>'' and not Col12 starts with '('", 'Col12',
       "order by count(Col1) desc limit 10 label Col12 '검색어', count(Col1) '횟수'"),
    '검색창에 직접 입력한 말. 지도·바로가기 버튼으로 고른 것은 빠집니다.');
  block_(sh, 'AD16', '검색했는데 없던 말 TOP 10',
    q_('Col12, count(Col1)', SEARCH_NO + " and Col12<>''", 'Col12',
       "order by count(Col1) desc limit 10 label Col12 '검색어', count(Col1) '횟수'"),
    '지도에 빠진 매장 후보. 숫자 4개 이상·@가 들어간 말은 "(기록안함)"으로만 남습니다.');
  block_(sh, 'W29', '층 이동 (행: 출발층, 열: 목적지층)',
    q_('Col9, count(Col1)', SEARCH_OK + " and Col9<>''", 'Col9', "pivot Col11 label Col9 '출발층'"));
  block_(sh, 'AE29', '언어별 많이 찾은 목적지',
    q_('Col4, Col10, count(Col1)', SEARCH_OK + " and Col4<>''", 'Col4, Col10',
       "order by Col4, count(Col1) desc label Col4 '언어', Col10 '목적지', count(Col1) '검색'"),
    '언어별로 많은 순. 언어마다 위에서 5개까지 보면 TOP 5입니다.');
  sh.autoResizeColumns(23, 10);
}
