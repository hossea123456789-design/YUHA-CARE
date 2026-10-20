# 유하 육아 도구 모음 (YUHA-CARE)

기존 Google Sheets 데이터를 유지하면서 화면만 GitHub Pages로 옮긴 육아 체크리스트·수면 기록 웹앱입니다.

## 구성
- 웹 화면: GitHub Pages, `main` 브랜치에서 자동 배포
- DB API: 기존 Google Apps Script (`Code.gs`에서 직접 HtmlService 통신 응답 생성)
- 원본 DB: 기존 Google Sheets `CHECKLIST_DB`, `SLEEP_LOG`, `APP_SETTINGS`
- 수면 히트맵: 2차 낮잠 선택 입력, 날짜별 참고 점수(파랑·노랑·분홍), 날짜별 점수 산식과 평가 반영률
- 로컬 저장: 수정 즉시 기기에 반영, 인터넷 연결 시 서버 자동 동기화, 충돌 시 사용자 선택

## 앱을 처음 실행하기 전에 (최초 1회)

1. **Apps Script**: 기존 스프레드시트에 연결된 Apps Script에서 `apps-script/Code.gs` 내용으로 **Code.gs 전체 교체**.
2. **HTML 파일 추가는 필요 없습니다.** 모든 화면 HTML/CSS/JS는 GitHub Pages에 있으며, 통신용 HTML 응답만 Code.gs에서 자동 생성합니다.
3. Apps Script에서 **배포 관리 → 기존 웹앱 수정 → 버전: 새 버전 → 배포**. 이전 `Index`와 `Bridge` 파일은 이 앱에서 사용하지 않으므로 새 배포 후 삭제해도 됩니다.
4. **GitHub 저장소 Settings → Pages → Build and deployment → Source = GitHub Actions** 로 설정합니다. (해당 설정은 GitHub에서 직접 활성화해야 합니다.)
5. Actions 탭에서 `Deploy YUHA CARE`가 완료되면 GitHub Pages 앱을 엽니다.
6. **앱은 `config.js`에 고정된 Apps Script 주소에 자동 연결됩니다.** 기기별로 주소를 입력하지 않습니다.

## 데이터 및 보안 주의
- **DB 데이터는 GitHub에 업로드하지 않았습니다.** 저장소에는 앱 코드만 있습니다.
- `config.js`에는 기존 Apps Script 웹앱의 공개 연결 주소만 저장합니다. 비밀번호·API 키·개인정보는 넣지 마세요.
- 이 저장소는 공개되어 있습니다. 웹앱 이용 권한은 별도로 관리해야 합니다.
- Apps Script의 `ALLOWALL` iframe 설정은 Code.gs가 생성하는 통신 응답에만 적용됩니다. 공개 `/exec` URL 접근 권한은 별도로 점검하세요.
- 기존 Apps Script 주소와 GitHub Pages 주소는 서로 다른 사이트입니다. 앱 화면의 `localStorage`는 사이트별로 분리되므로, 이전 URL에서 **서버에 저장되지 않은 오프라인 수정 내용**은 자동 이관되지 않습니다. 이전 앱에서 먼저 동기화한 뒤 새 주소를 사용하세요.
- HTML이 원격 연결을 필요로 하므로 인터넷 없이 최초 실행하는 경우는 지원하지 않습니다.

## Apps Script 파일 구성

- 필요한 파일: **Code.gs 하나** (최신 버전은 이 저장소의 `apps-script/Code.gs` 참조)
- 필요한 기존 스프레드시트 시트: **CHECKLIST_DB**, **SLEEP_LOG**, **APP_SETTINGS**
- 별도 `Bridge.html`, `Index.html`은 Apps Script에 둘 필요가 없습니다.
- 통신용 내부 HTML 응답은 `Code.gs`의 `serveYuhaBridge_()`에서 동적으로 생성하며, GitHub Pages UI를 서빙하지 않습니다.
- 기존 /exec 배포 주소는 그대로 재사용하되 반드시 **새 버전 배포**해야 합니다.

## 앱 연결 주소 관리

- `config.js`에 고정된 Apps Script `/exec` URL을 모든 기기가 동일하게 사용합니다.
- 주소 변경 시 GitHub `config.js`만 수정하면 됩니다. 기기별로 다시 입력할 필요가 없습니다.
- GitHub 코드는 공개됩니다. Apps Script URL 역시 공개되므로, URL 자체가 인증 수단이라고 가정하지 마세요. 접속 제한 및 수정 권한은 별도로 검토해야 합니다.

## 2차 낮잠 및 수면 평가 v2 (2026-10-20)

- 각 날짜의 **낮잠 입력 칸에 있는 `+ 2차 낮잠` 버튼**을 누르면 그 날짜의 2차 시작·종료가 나타납니다. 입력값이 있으면 다음 방문에도 보이며 별도로 접을 수 있습니다.
- 수면 데이터는 기존 `SLEEP_LOG` A:K 열을 보존하고 **L열(2차 낮잠 시작) / M열(2차 낮잠 종료)** 을 새로 사용합니다. 새로운 Apps Script는 해당 헤더를 자동 생성하고 I열 낮잠 합계 수식을 두 낮잠을 합산하도록 갱신합니다.
- **필수 서버 변경:** GitHub Pages 배포만으로는 새 열 동기화가 되지 않습니다. 스프레드시트에 연결된 Apps Script 편집기의 `Code.gs`를 이 저장소 `apps-script/Code.gs` 최신본으로 교체하고 **배포 관리 → 기존 웹앱 수정 → 새 버전 배포**해야 합니다. 웹앱 /exec URL은 그대로 유지할 수 있습니다. 구버전 API 감지 시 2차 낮잠 변경은 기기에 보관되고 전송하지 않습니다.
- 점수 평가 항목(가중치, 총 100): **하루 총수면 42 / 밤잠 길이 18 / 입실→취침 12 / 최근 7일 기상·취침 리듬 16 / 낮잠·각성 간격 12**. 마지막 세 항목은 기록이 충분할 때만 평가하며, 관측 가능한 항목 점수로 정규화하여 **평가 반영률**을 함께 나타냅니다. 1회·2회 낮잠 횟수 자체에 감점 없음.
- **공식 권고와 휴리스틱을 구분:** 총수면 권고(AASM)는 1~2세 11~14시간. 다른 평가항목의 구간과 가중치는 공식 임상 기준이 아니라 앱 자체 참고 규칙입니다. 밤중 각성 횟수, 무호흡, 수면 구조, 낮 컨디션을 측정하지 않으므로 점수가 수면의 질이나 질병을 진단하지 않습니다.
- 2차 낮잠을 일부만 입력하거나 두 낮잠 시간이 겹치면 해당 날짜는 기록 미완성으로 표시하고 점수 계산을 보류합니다.
- 기존 체크리스트 데이터 및 1차 낮잠 기록은 그대로 사용합니다.

### 관련 문헌
- AASM 권고: https://pmc.ncbi.nlm.nih.gov/articles/PMC4877308/
- NSF 수면 규칙성 합의: https://pubmed.ncbi.nlm.nih.gov/37684151/
- 생후 3~18개월 낮잠 전환·리듬 종단 연구(2026): https://pubmed.ncbi.nlm.nih.gov/42874417/
- 낮잠 전환의 개인차 및 발달 고찰: https://pmc.ncbi.nlm.nih.gov/articles/PMC9636905/
