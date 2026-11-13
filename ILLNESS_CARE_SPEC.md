# 유하 질병 기록 — 구현·운영 명세 (2026-11-14)

## 구성
아내 회복 바로 오른쪽에 질병 기록 탭을 둔다. 질병 단위로 발생 시각·증상·메모, 병원 방문(일시·병원·진단·처방 지시), 처방약(종류 프리셋·정확한 이름·성분·농도·1회 mL·복용 간격 시간·필요시/정기), 실제 복용/미복용 일시, 열 기록, 종료 확인을 연결한다.

프런트: illness-care.js, illness-care.css. 화면 상단에 다음 복약 시각, 지연 경고와 체온 히트맵을 배치한다. 신규 질병·진료·처방 입력 폼은 필요할 때 펼쳐 쓴다.

## 기기 보관·데이터 구조
기존 프로젝트의 로컬 수면·회복 기록과 완전 분리한다.
- yuha_illness_records_v1: 질병 ID별 전체 JSON
- yuha_illness_pending_v1: 동기화 대기 중인 변경 및 서버 revision
- yuha_illness_conflicts_v1: 서버·기기 서로 다른 원본
- yuha_illness_snapshots_v1: 변경·충돌 직전의 안전본 (최대 35개)

질병 객체는 id/title/onsetAt/symptoms/note/status/closedAt/recoveryConfirmed/noFurtherMedicationConfirmed/closureNote/revision, visits[], medications[], temperatures[]로 구성한다. 방문에는 id/at/hospital/diagnosis/notes. 약에는 id/visitId/category/name/ingredient/formulation/mode/doseMl/intervalHours/endsAt/instructions/active/doses[]. 투약에는 id/at/status(taken·skipped)/amountMl/note/scheduledFor. 체온은 id/at/celsius/site/note. 시각 원본은 ISO 8601, 화면은 브라우저 현지시간을 사용한다.

## 투약 일정 계산 규칙·중요 제약
- 약 종류 프리셋은 분류만 제시한다. 약 이름·mL·간격을 자동 생성하지 않는다. 입력 내용은 보호자가 실제 약 봉투·처방전에서 확인한다.
- 정기 복용 약은 첫 실제 복용 시각이 기록되어야 예정시간 계산이 시작된다. 다음 시간은 마지막 복용 시각 + 입력된 처방 간격(시간). 미복용 표시를 남기면 해당 예정시각을 다음 주기 기준으로 사용할 수 있다. 실제 복용이 기록되지 않은 예정 시각이 지났으면 화면에 지연 경고를 표시한다.
- 필요시(PRN) 복용은 미복용/지연 경고를 만들지 않는다. 복용 간격이 처방된 경우에도 마지막 실제 복용으로만 참고 시간을 계산한다.
- 입력된 처방 종료 예정 시각 이후로는 새로운 투약 필요 여부를 앱이 판단하지 않는다. 종료 이전의 예정 복약 누락은 사용자 확인 대상으로 남는다.
- 이 안내는 화면에서만 동작한다. 브라우저를 닫은 뒤의 푸시·문자·백그라운드 알림은 구현하지 않았다. 누락분 두 배 복용이나 약 교차 복용을 안내하지 않는다. 약 봉투·처방 지시가 우선이다.

## 체온과 질병 종료
- 체온은 ℃·측정 부위(귀·겨드랑이·이마·직장·입·기타)·시각·메모로 기록. 히트맵은 각 날짜의 최고 실측 온도를 표시하고 미측정일은 별도 표시한다.
- 보기용 색상 구간: 37.5℃ 미만, 37.5~37.9℃, 38.0~38.9℃, 39.0℃ 이상. 부위에 따라 체온 해석이 달라지므로 의료 진단 기준으로 사용하지 않는다.
- 질병 종료는 자동이 아니다. 활성 처방약을 모두 복용 종료 표시로 전환한 후, 보호자가 증상/체온 안정화와 처방대로 복약을 마쳤음을 확인하는 두 항목에 동의해야 종료한다. 체온이 정상화됐다는 이유만으로 처방약을 중단하거나 질병 기록을 종료하지 않는다.

## Apps Script 운영
- 신규 비공개 시트 ILLNESS_LOG: A 질병 ID / B 비공개 JSON / C 수정 revision. 기존 CHECKLIST_DB, SLEEP_LOG, MENTAL_LOG, APP_SETTINGS를 변경하지 않는다.
- 앱에서 "서버 연결"을 누른 사용자는 **별도 질병 기록 서버 암호**를 입력한다. Apps Script 스크립트 속성에 YUHA_ILLNESS_ACCESS_KEY로 12자 이상 긴 무작위 암호를 설정해야 하며 공개 코드·메시지에 실제 값을 넣지 않는다. 아내 회복 4자리 PIN과는 다르다.
- 서버 API getIllnessCases(passphrase), syncIllnessCase({passphrase, episode, expectedRevision, resolution?}), schemaVersion=1. 인증 통과 후 LockService와 수정 리비전으로 동시 쓰기 충돌 방지. 충돌 시 서버·기기 원본을 별도 보존하고 자동 덮어쓰지 않는다. 사용자 명시적 기기 원본 선택 시 ILLNESS_CONFLICT_ARCHIVE에 원본 둘을 먼저 기록한 다음 서버에 반영. 클라이언트는 서버 ACK 후 다시 조회해 정확히 일치할 때만 pending을 없앤다.
- GitHub Pages 배포로 Apps Script는 자동 갱신되지 않는다. 기존 구글 시트 → 확장 프로그램 → Apps Script → Code.gs 전체 최신본 교체 → 저장 → 배포 관리 → 기존 웹앱 수정 → 새 버전 배포. /exec 주소와 기존 프로젝트를 유지한다.
- 서버 v1 미배포거나 전용 암호가 설정되지 않으면 기기 기록/체온 UI는 사용 가능하지만 부부 양쪽 휴대폰 동기화는 되지 않는다. 사이트 데이터/캐시 삭제 금지.

## 테스트와 인수인계
- tests/illness-care.test.js: 첫 투약 기준 n시간, 지연 표시, 미복용/필요시 예외, 온도 히트맵, 미기록 구분, 정상 체온 이후 자동 종료 방지, 독립 로컬 저장.
- tests/illness-api.test.js: 전용 암호 인증, 별도 시트, 처방·진료·투약·체온 복원, revision 충돌 보존, 명시적 해결 시 양쪽 원본 백업, 필수 처방 용량·간격 검증.
- Pages CI는 새 JS·CSS 배포와 두 테스트를 실행한다. 실제 운영 서버 배포 및 휴대폰 2대의 동기화/지연 UI 검증은 별도 단계이며 완료 전 성공으로 표시하지 않는다.
