const APP_TITLE = '유하 육아 도구 모음';
const DB_SHEET_NAME = 'CHECKLIST_DB';
const README_SHEET_NAME = 'README';
const DATA_KEY = 'checklist';
const CACHE_KEY = 'checklist_payload_v1';
const CACHE_TTL_SECONDS = 21600;

function doGet(e) {
  if (e && e.parameter && e.parameter.bridge === '1') return serveYuhaBridge_(e);
  // Only the GitHub site hosts the user-facing app.
  return HtmlService.createHtmlOutput(
    '<!doctype html><html lang="ko"><meta charset="utf-8"><title>유하 육아 도구 모음 DB API</title>' +
    '<body><p>이 주소는 데이터 연결용입니다. 앱 화면은 GitHub Pages에서 여세요.</p>' +
    '<p><a href="https://hossea123456789-design.github.io/YUHA-CARE/">앱 열기</a></p></body></html>'
  ).setTitle(APP_TITLE + ' · DB API');
}

function getAppData() {
  const cache = CacheService.getScriptCache();
  const cachedPayload = cache.get(CACHE_KEY);

  if (cachedPayload) {
    try {
      const parsed = JSON.parse(cachedPayload);
      return {
        ok: true,
        data: parsed.data,
        updatedAt: parsed.updatedAt || '',
        fromCache: true
      };
    } catch (error) {
      cache.remove(CACHE_KEY);
    }
  }

  setupSpreadsheet_();

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DB_SHEET_NAME);
  const rows = sheet.getDataRange().getValues();

  let dataJson = '';
  let updatedAt = '';

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === DATA_KEY) {
      dataJson = rows[i][1];
      updatedAt = rows[i][2] || '';
      break;
    }
  }

  if (!dataJson) {
    const defaultData = getDefaultData_();
    const now = new Date().toISOString();
    saveRawData_(defaultData, now);
    cache.put(CACHE_KEY, JSON.stringify({ data: defaultData, updatedAt: now }), CACHE_TTL_SECONDS);

    return {
      ok: true,
      data: defaultData,
      updatedAt: now
    };
  }

  try {
    const parsedData = JSON.parse(dataJson);
    cache.put(CACHE_KEY, JSON.stringify({ data: parsedData, updatedAt: updatedAt }), CACHE_TTL_SECONDS);

    return {
      ok: true,
      data: parsedData,
      updatedAt: updatedAt
    };
  } catch (error) {
    const defaultData = getDefaultData_();
    const now = new Date().toISOString();
    saveRawData_(defaultData, now);
    cache.put(CACHE_KEY, JSON.stringify({ data: defaultData, updatedAt: now }), CACHE_TTL_SECONDS);

    return {
      ok: true,
      data: defaultData,
      updatedAt: now,
      recovered: true
    };
  }
}

function saveAppData(payload) {
  setupSpreadsheet_();

  if (!payload || !payload.data) {
    throw new Error('저장할 데이터가 없습니다.');
  }

  const now = new Date().toISOString();

  saveRawData_(payload.data, now);

  CacheService.getScriptCache().put(
    CACHE_KEY,
    JSON.stringify({ data: payload.data, updatedAt: now }),
    CACHE_TTL_SECONDS
  );

  return {
    ok: true,
    updatedAt: now
  };
}

function resetServerData() {
  setupSpreadsheet_();

  const defaultData = getDefaultData_();
  const now = new Date().toISOString();

  saveRawData_(defaultData, now);

  CacheService.getScriptCache().put(
    CACHE_KEY,
    JSON.stringify({ data: defaultData, updatedAt: now }),
    CACHE_TTL_SECONDS
  );

  return {
    ok: true,
    data: defaultData,
    updatedAt: now
  };
}

function setupSpreadsheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let db = ss.getSheetByName(DB_SHEET_NAME);
  if (!db) {
    db = ss.insertSheet(DB_SHEET_NAME);
    db.getRange(1, 1, 1, 4).setValues([['key', 'value_json', 'updated_at', 'memo']]);
    db.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#eaf1ff');
    db.setFrozenRows(1);
    db.setColumnWidth(1, 120);
    db.setColumnWidth(2, 520);
    db.setColumnWidth(3, 220);
    db.setColumnWidth(4, 260);
  }

  let readme = ss.getSheetByName(README_SHEET_NAME);
  if (!readme) {
    readme = ss.insertSheet(README_SHEET_NAME);
    readme.getRange(1, 1).setValue('유하 육아 도구 모음 사용 안내');
    readme.getRange(1, 1).setFontSize(16).setFontWeight('bold');
    readme.getRange(3, 1, 8, 2).setValues([
      ['스프레드시트명', APP_TITLE],
      ['웹앱 역할', '휴대폰에서 체크/추가/수정/삭제/이동한 내용을 이 스프레드시트에 저장합니다.'],
      ['데이터 저장 위치', DB_SHEET_NAME + ' 시트의 value_json 셀'],
      ['부부 공동 사용', '같은 웹앱 URL을 공유하면 같은 체크리스트를 봅니다.'],
      ['주의사항', 'CHECKLIST_DB 시트의 JSON을 직접 수정하면 앱이 깨질 수 있습니다.'],
      ['권장 사용', '웹앱 URL을 휴대폰 홈 화면에 추가해 앱처럼 사용하세요.'],
      ['초기화', '웹앱의 전체 초기화는 체크만 해제합니다. 서버 데이터 완전 초기화는 코드의 resetServerData를 실행하세요.'],
      ['업데이트', 'Code.gs / Index.html 수정 후 새 배포 또는 배포 업데이트가 필요합니다.']
    ]);
    readme.setColumnWidth(1, 160);
    readme.setColumnWidth(2, 620);
  }
}

function saveRawData_(data, updatedAt) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DB_SHEET_NAME);
  const rows = sheet.getDataRange().getValues();

  const json = JSON.stringify(data);
  let targetRow = -1;

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === DATA_KEY) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow === -1) {
    targetRow = sheet.getLastRow() + 1;
  }

  sheet.getRange(targetRow, 1, 1, 4).setValues([[
    DATA_KEY,
    json,
    updatedAt,
    '앱 자동 저장 데이터'
  ]]);
}

function makeId_() {
  return 'id_' + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

function getDefaultData_() {
  return {
    daycare: {
      label: '얼집',
      title: '얼집 준비물',
      sections: [
        {
          id: makeId_(),
          title: '상시 준비',
          items: [
            { id: makeId_(), text: '5개 기저귀', checked: false },
            { id: makeId_(), text: '유하 등원복 (턱받이1 포함)', checked: false },
            { id: makeId_(), text: '여분 침받이 1개', checked: false },
            { id: makeId_(), text: '물병', checked: false },
            { id: makeId_(), text: '빈물병 하나 더', checked: false },
            { id: makeId_(), text: '식판', checked: false },
            { id: makeId_(), text: '쪽쪽이', checked: false },
            { id: makeId_(), text: '이유식 턱받이', checked: false },
            { id: makeId_(), text: '이유식 숟가락', checked: false },
            { id: makeId_(), text: '우유곽 홀더(상하목장 우유팩 넣는 플라스틱)', checked: false },
            { id: makeId_(), text: '가제 손수건', checked: false }
          ]
        },
        {
          id: makeId_(),
          title: '월요일만 준비',
          items: [
            { id: makeId_(), text: '고리수건 5장', checked: false },
            { id: makeId_(), text: '여분 옷 1벌', checked: false },
            { id: makeId_(), text: '낮잠이불', checked: false }
          ]
        }
      ]
    },

    outing: {
      label: '외출',
      title: '외출 시 챙길 것',
      sections: [
        {
          id: makeId_(),
          title: '기본 준비',
          items: [
            { id: makeId_(), text: '보온병', checked: false },
            { id: makeId_(), text: '손수건', checked: false },
            { id: makeId_(), text: '분유 담긴 젖병 & 3단 분유통', checked: false },
            { id: makeId_(), text: '기저귀', checked: false },
            { id: makeId_(), text: '공갈 젖꼭지 & 젖꼭지 줄', checked: false },
            { id: makeId_(), text: '덮을 담요', checked: false },
            { id: makeId_(), text: '애기 옷 & 양말', checked: false },
            { id: makeId_(), text: '여분 비닐 (젖병 담는 용도 등)', checked: false },
            { id: makeId_(), text: '치발기 & 침받이', checked: false },
            { id: makeId_(), text: '힙시트', checked: false },
            { id: makeId_(), text: '애기 의자 덮개', checked: false },
            { id: makeId_(), text: '떡뻥', checked: false },
            { id: makeId_(), text: '이유식 보리물', checked: false },
            { id: makeId_(), text: '이유식 턱받이', checked: false },
            { id: makeId_(), text: '이유식 방수옷', checked: false },
            { id: makeId_(), text: '빨래 집게', checked: false },
            { id: makeId_(), text: '아이패드', checked: false },
            { id: makeId_(), text: '유모차 햇빛 가리개', checked: false },
            { id: makeId_(), text: '튤립 장난감', checked: false }
          ]
        }
      ]
    },

    daily: {
      label: '매일 청소',
      title: '매일 해야 하는 청소',
      sections: [
        {
          id: makeId_(),
          title: '매일',
          items: [
            { id: makeId_(), text: '청소기, 물걸레질', checked: false },
            { id: makeId_(), text: '아기매트 걸레질', checked: false },
            { id: makeId_(), text: '이불빨래', checked: false },
            { id: makeId_(), text: '장난감 설거지(입에 들어가는 것들)', checked: false },
            { id: makeId_(), text: '아기 빨래', checked: false }
          ]
        }
      ]
    },

    weekly: {
      label: '주말 청소',
      title: '주말마다 해야 하는 청소',
      sections: [
        {
          id: makeId_(),
          title: '주말',
          items: [
            { id: makeId_(), text: '에어컨 필터 청소(아빠가 수욜에 해주심)', checked: false },
            { id: makeId_(), text: '제습기 필터 청소(위와 동일)', checked: false },
            { id: makeId_(), text: '제습기 물받이 물때 청소', checked: false },
            { id: makeId_(), text: '공기청정기 필터 청소(2주 한번)', checked: false },
            { id: makeId_(), text: '일반쓰레기 봉투에 쓰레기통 쓰레기 담기', checked: false },
            { id: makeId_(), text: '걸레질(거실 아기 있는 곳 먼지)', checked: false }
          ]
        }
      ]
    }
  };
}


// =======================================
// 수면 기록: 체크리스트와 독립된 SLEEP_LOG 시트
// A 기준일 / B 요일 / C 입실 / D 실제취침 / E 낮잠시작
// F 낮잠종료 / G 당일 아침 기상 / H 야간 / I 낮잠 / J 총수면 / K 수정시각
// =======================================
const SLEEP_SHEET_NAME = 'SLEEP_LOG';
const SLEEP_FIELDS_ = Object.freeze({
  bedTime: 3,
  asleepTime: 4,
  napStart: 5,
  napEnd: 6,
  wakeTime: 7,
  nap2Start: 12,
  nap2End: 13
});
const SLEEP_WEEKDAYS_ = ['일', '월', '화', '수', '목', '금', '토'];

function getSleepSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SLEEP_SHEET_NAME);
  if (sh) {
    ensureNap2Columns_(sh);
    return sh;
  }
  // 다른 스프레드시트에 설치하는 경우에도 자동 생성
  sh = ss.insertSheet(SLEEP_SHEET_NAME);
  sh.getRange(1,1,1,13).setValues([[
    '기준일', '요일', '침대 입실', '실제 잠든 시각', '낮잠 시작',
    '낮잠 종료', '기상 (당일 아침)', '밤잠 시간', '낮잠 시간',
    '총 수면', '최종 수정', '2차 낮잠 시작', '2차 낮잠 종료'
  ]]);
  sh.getRange(1,1,1,13).setFontWeight('bold').setBackground('#344778').setFontColor('white');
  sh.setFrozenRows(1);
  sh.getRange('A:A').setNumberFormat('@');
  sh.getRange('C:G').setNumberFormat('@');
  sh.getRange('L:M').setNumberFormat('@');
  sh.getRange('H:J').setNumberFormat('[h]:mm');
  sh.setColumnWidth(1,125);
  sh.setColumnWidths(3,5,125);
  sh.setColumnWidths(12,2,125);
  return sh;
}

// 기존 A:K 데이터는 변경하지 않습니다. 마지막에 L/M 열을 추가합니다.
function sleepNapFormula_(row) {
  const first = `IF(AND(E${row}<>"",F${row}<>""),MOD(TIMEVALUE(F${row})-TIMEVALUE(E${row}),1),0)`;
  const second = `IF(AND(L${row}<>"",M${row}<>""),MOD(TIMEVALUE(M${row})-TIMEVALUE(L${row}),1),0)`;
  return `=IF(AND(E${row}="",F${row}="",L${row}="",M${row}=""),"",${first}+${second})`;
}
function ensureNap2Columns_(sh) {
  const max=sh.getMaxColumns();
  if (max<13) sh.insertColumnsAfter(max,13-max);
  const cells=sh.getRange(1,12,1,2).getDisplayValues()[0];
  if (cells[0]==='2차 낮잠 시작' && cells[1]==='2차 낮잠 종료') return;
  if (cells.some(value=>value && value!=='2차 낮잠 시작' && value!=='2차 낮잠 종료'))
    throw new Error('SLEEP_LOG L:M 열에 기존 데이터가 있어 안전하게 2차 낮잠 열을 생성할 수 없습니다.');
  sh.getRange(1,12,1,2).setValues([['2차 낮잠 시작','2차 낮잠 종료']]);
  sh.getRange(1,12,1,2).setFontWeight('bold').setBackground('#344778').setFontColor('white');
  sh.getRange('L:M').setNumberFormat('@');
  sh.setColumnWidths(12,2,125);
  const last=sh.getLastRow();
  if(last>1) {
    const formulas=Array.from({length:last-1},(_,i)=>[sleepNapFormula_(i+2)]);
    sh.getRange(2,9,last-1,1).setFormulas(formulas).setNumberFormat('[h]:mm');
  }
}

function validateSleepDate_(dateKey) {
  if (typeof dateKey !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(dateKey)) {
    throw new Error('잘못된 날짜입니다.');
  }
  const d = new Date(dateKey + 'T12:00:00Z');
  if (isNaN(d.getTime()) || d.toISOString().slice(0,10) !== dateKey) {
    throw new Error('존재하지 않는 날짜입니다.');
  }
}

function validateSleepTime_(value) {
  if (typeof value !== 'string' || (value !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))) {
    throw new Error('시간은 HH:mm 형식으로 입력하세요.');
  }
}

function getSleepMonth(year, month) {
  const y = Number(year), m = Number(month);
  if (!Number.isInteger(y) || y < 2020 || y > 2100 || !Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error('조회할 연월이 올바르지 않습니다.');
  }
  const prefix = `${y}-${String(m).padStart(2,'0')}-`;
  const sheet = getSleepSheet_();
  const last = sheet.getLastRow();
  const records = {};
  if (last > 1) {
    // 기존 C:G 및 추가된 L:M을 읽어 과거 기록도 그대로 지원합니다.
    const rows = sheet.getRange(2,1,last-1,13).getDisplayValues();
    rows.forEach(row => {
      const dateKey = String(row[0]).trim();
      if (!dateKey.startsWith(prefix)) return;
      const payload = {
        bedTime:row[2] || '', asleepTime:row[3] || '',
        napStart:row[4] || '', napEnd:row[5] || '', wakeTime:row[6] || '',
        nap2Start:row[11] || '', nap2End:row[12] || ''
      };
      // 날짜만 미리 배치한 빈 날짜는 요약에서 기록된 날로 세지 않습니다.
      if (Object.keys(payload).some(key=>payload[key])) records[dateKey] = payload;
    });
  }
  return {ok:true, year:y, month:m, records, birthDate:getChildBirthDate_(), nap2Supported:true, schemaVersion:2};
}

// 날짜·칸 단위 저장: 체크리스트 JSON이나 다른 수면 칸을 덮어쓰지 않습니다.
// LockService.waitLock()는 사용하지 않아 기존 잠금 시간초과 오류와 분리합니다.
function sleepNightFormula_(row) {
  const prev=`IFERROR(INDEX($D$2:$D,MATCH(TEXT(DATEVALUE(A${row})-1,"yyyy-mm-dd"),$A$2:$A,0)),"")`;
  return `=IF(OR(G${row}="",${prev}=""),"",IF(MOD(TIMEVALUE(G${row})-TIMEVALUE(${prev}),1)<=16/24,MOD(TIMEVALUE(G${row})-TIMEVALUE(${prev}),1),""))`;
}

function saveSleepField(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('수면 저장 요청 형식 오류');
  const dateKey = payload.date, field = payload.field, value = payload.value;
  validateSleepDate_(dateKey);
  if (!Object.prototype.hasOwnProperty.call(SLEEP_FIELDS_,field)) throw new Error('알 수 없는 수면 입력란');
  validateSleepTime_(value);

  const sheet = getSleepSheet_();
  const last = sheet.getLastRow();
  let rowIndex = -1;
  if (last > 1) {
    const keys = sheet.getRange(2,1,last-1,1).getDisplayValues();
    for (let i=0;i<keys.length;i++) {
      if (String(keys[i][0]).trim() === dateKey) {rowIndex=i+2;break;}
    }
  }
  const now = new Date().toISOString();
  if (rowIndex < 0) {
    // 새로운 달의 날짜를 처음 입력하면 그 날짜의 행만 추가합니다.
    rowIndex=sheet.getLastRow()+1;
    const [yy,mm,dd]=dateKey.split('-').map(Number);
    const weekday=SLEEP_WEEKDAYS_[new Date(Date.UTC(yy,mm-1,dd)).getUTCDay()];
    sheet.getRange(rowIndex,1).setNumberFormat('@').setValue(dateKey);
    sheet.getRange(rowIndex,2).setValue(weekday);
    sheet.getRange(rowIndex,3,1,5).setNumberFormat('@');
    sheet.getRange(rowIndex,8,1,3).setNumberFormat('[h]:mm');
    sheet.getRange(rowIndex,8,1,3).setFormulas([[
      sleepNightFormula_(rowIndex),
      sleepNapFormula_(rowIndex),
      `=IF(COUNT(H${rowIndex}:I${rowIndex})=0,"",SUM(H${rowIndex}:I${rowIndex}))`
    ]]);
  }
  sheet.getRange(rowIndex,SLEEP_FIELDS_[field]).setNumberFormat('@').setValue(value);
  sheet.getRange(rowIndex,11).setValue(now);
  return {ok:true,date:dateKey,field,value,updatedAt:now};
}


// ============================================================
// 유하 수면기록 v3 : 생년월일 저장 + 변경 충돌 보호
// ============================================================
const CHILD_SETTINGS_SHEET_ = 'APP_SETTINGS';
const CHILD_BIRTH_DEFAULT_ = '2025-03-23';

function getChildSettingsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CHILD_SETTINGS_SHEET_);
  if (!sheet) {
    sheet = ss.insertSheet(CHILD_SETTINGS_SHEET_);
    sheet.getRange(1, 1, 2, 3).setValues([
      ['key', 'value', 'updated_at'],
      ['birthDate', CHILD_BIRTH_DEFAULT_, new Date().toISOString()]
    ]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#344778').setFontColor('white');
    sheet.setColumnWidths(1, 3, 180);
  }
  return sheet;
}

function getChildBirthDate_() {
  const sheet = getChildSettingsSheet_();
  return String(sheet.getRange(2, 2).getDisplayValue() || CHILD_BIRTH_DEFAULT_).trim();
}

function checkBirthDate_(value) {
  validateSleepDate_(value);
  const d = new Date(value + 'T12:00:00Z');
  if (d.getTime() > Date.now()) throw new Error('미래 생년월일은 저장할 수 없습니다.');
}

// dryRun=true: 현재 원격값과 충돌 목록만 검사, 저장하지 않음.
// expectedValue: 처음 로컬 편집을 시작할 때 확인했던 서버값. null은 서버값을 모른다는 의미.
// force: 충돌 화면에서 사용자가 해당 칸을 '덮어쓰기'로 선택했을 때만 허용.
function syncSleepChanges(payload) {
  if (!payload || !Array.isArray(payload.edits)) throw new Error('동기화 요청 형식이 올바르지 않습니다.');
  if (payload.edits.length > 120) throw new Error('한 번에 최대 120개 항목을 동기화할 수 있습니다.');
  if (!payload.edits.length) return {ok:true, applied:[], conflicts:[], birthDate:getChildBirthDate_()};

  const edits = payload.edits.map(op => {
    if (!op || typeof op !== 'object') throw new Error('항목 형식 오류');
    const field = String(op.field || '');
    const date = String(op.date || '');
    const value = String(op.value === undefined ? '' : op.value);
    if (field === 'birthDate' && date === '@profile') checkBirthDate_(value);
    else {
      validateSleepDate_(date);
      if (!Object.prototype.hasOwnProperty.call(SLEEP_FIELDS_, field)) throw new Error('지원되지 않는 수면 항목');
      validateSleepTime_(value);
    }
    return {date, field, value, expectedValue:op.expectedValue === null || op.expectedValue === undefined ? null : String(op.expectedValue), force:op.force === true};
  });
  const keys = new Set();
  edits.forEach(op => {const key=op.date+'|'+op.field; if(keys.has(key))throw new Error('동일한 칸이 중복되었습니다.');keys.add(key);});

  // 짧게 잠근 상태에서 검증 후 작성: 두 기기에서 변경이 겹치면 임의 덮어쓰기 방지.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(2500)) return {ok:false, busy:true, message:'다른 기기가 저장 중입니다. 다시 시도해 주세요.'};
  try {
    const sheet = getSleepSheet_();
    const existing = sheet.getLastRow() > 1 ? sheet.getRange(2,1,sheet.getLastRow()-1,13).getDisplayValues() : [];
    const rowByDate = Object.create(null);
    existing.forEach((row,i)=>{const key=String(row[0]||'').trim();if(key && !rowByDate[key])rowByDate[key]={index:i+2,values:row};});
    const profileSheet = getChildSettingsSheet_();
    const currentBirth = String(profileSheet.getRange(2,2).getDisplayValue() || CHILD_BIRTH_DEFAULT_).trim();
    const conflicts=[];
    const current=[];
    edits.forEach(op => {
      const prior=op.field === 'birthDate' ? currentBirth :
        (rowByDate[op.date] ? String(rowByDate[op.date].values[SLEEP_FIELDS_[op.field]-1] || '') : '');
      current.push(prior);
      // 같은 값이면 이미 반영된 작업: 반복 실행해도 성공으로 취급
      if (prior !== op.value && !op.force && (op.expectedValue === null ? prior !== '' : prior !== op.expectedValue)) {
        conflicts.push({date:op.date,field:op.field,localValue:op.value,serverValue:prior,expectedValue:op.expectedValue});
      }
    });
    if (conflicts.length || payload.dryRun === true) {
      return {ok:true, dryRun:true, conflicts, applied:[], total:edits.length,birthDate:currentBirth};
    }
    const now=new Date().toISOString();
    const applied=[];
    edits.forEach((op,i) => {
      if(current[i] === op.value) {applied.push({date:op.date,field:op.field,value:op.value});return;}
      if (op.field === 'birthDate') {
        profileSheet.getRange(2,2,1,2).setValues([[op.value,now]]);
      } else {
        let rec=rowByDate[op.date];
        if(!rec){
          const next=sheet.getLastRow()+1;
          const parts=op.date.split('-').map(Number);
          const day=SLEEP_WEEKDAYS_[new Date(Date.UTC(parts[0],parts[1]-1,parts[2])).getUTCDay()];
          sheet.getRange(next,1,1,7).setNumberFormat('@');
          sheet.getRange(next,12,1,2).setNumberFormat('@');
          sheet.getRange(next,1,1,2).setValues([[op.date,day]]);
          sheet.getRange(next,8,1,3).setNumberFormat('[h]:mm').setFormulas([[
            sleepNightFormula_(next),
            sleepNapFormula_(next),
            `=IF(COUNT(H${next}:I${next})=0,\"\",SUM(H${next}:I${next}))`
          ]]);
          rec={index:next,values:[op.date,day,'','','','','','','','','','','']};
          rowByDate[op.date]=rec;
        }
        sheet.getRange(rec.index,SLEEP_FIELDS_[op.field]).setNumberFormat('@').setValue(op.value);
        sheet.getRange(rec.index,11).setValue(now);
        rec.values[SLEEP_FIELDS_[op.field]-1]=op.value;
      }
      applied.push({date:op.date,field:op.field,value:op.value});
    });
    SpreadsheetApp.flush();
    return {ok:true,applied,conflicts:[],birthDate:edits.some(e=>e.field==='birthDate')?edits.find(e=>e.field==='birthDate').value:currentBirth};
  } finally {
    lock.releaseLock();
  }
}

// GitHub Pages 화면은 GitHub에서만 관리하며 Code.gs만 DB API를 담당합니다.
// HtmlService 응답은 Code.gs 안에서 생성하므로 Bridge.html 파일은 필요 없습니다.
const YUHA_ALLOWED_ORIGIN_ = 'https://hossea123456789-design.github.io';

function serveYuhaBridge_(e) {
  const origin = String(e.parameter.origin || '');
  const nonce = String(e.parameter.nonce || '');
  if (origin !== YUHA_ALLOWED_ORIGIN_ || !/^[a-zA-Z0-9_-]{16,128}$/.test(nonce)) {
    return HtmlService.createHtmlOutput('Invalid bridge parameters');
  }
  const html = "<!DOCTYPE html>\n<html lang=\"ko\">\n<head><base target=\"_top\"><meta charset=\"UTF-8\"><title>유하 DB 연결</title></head>\n<body>\n<script>\n(() => {\n  'use strict';\n  const ORIGIN = __YUHA_TRUSTED_ORIGIN_JSON__;\n  const NONCE = __YUHA_BRIDGE_NONCE_JSON__;\n  const ALLOWED = new Set(['getAppData','saveAppData','getSleepMonth','syncSleepChanges']);\n  function send(payload) { window.top.postMessage(Object.assign({source:'yuha-db-bridge',nonce:NONCE},payload),ORIGIN); }\n  window.addEventListener('message',event=>{\n    if(event.origin !== ORIGIN) return;\n    const msg=event.data;\n    if(!msg||msg.source!=='yuha-db-client'||msg.nonce!==NONCE||msg.type!=='call')return;\n    if(typeof msg.id!=='string'||!/^\\d{1,9}$/.test(msg.id)||!ALLOWED.has(msg.method))return;\n    const args=Array.isArray(msg.args)?msg.args:[];\n    try{\n      google.script.run\n        .withSuccessHandler(result=>send({type:'result',id:msg.id,ok:true,result}))\n        .withFailureHandler(error=>send({type:'result',id:msg.id,ok:false,error:String(error&&error.message||error)}))\n        [msg.method](...args);\n    }catch(error){send({type:'result',id:msg.id,ok:false,error:String(error&&error.message||error)});}\n  });\n  // top 페이지에 실제 내부 프레임 참조를 전달하면 그 프레임으로 요청을 보낼 수 있습니다.\n  send({type:'ready'});\n  // 모바일 백그라운드에서 복귀했을 때 대기 중인 클라이언트 재연결용\n  document.addEventListener('visibilitychange',()=>{if(!document.hidden)send({type:'ready'});});\n})();\n</script>\n</body></html>";
  return HtmlService.createHtmlOutput(html
    .replace('__YUHA_TRUSTED_ORIGIN_JSON__', JSON.stringify(origin))
    .replace('__YUHA_BRIDGE_NONCE_JSON__', JSON.stringify(nonce)))
    .setTitle('유하 DB 연결')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
