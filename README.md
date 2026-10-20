# 유하 육아 도구 모음 (YUHA-CARE)

기존 Google Sheets 데이터를 유지하면서 화면만 GitHub Pages로 옮긴 육아 체크리스트·수면 기록 웹앱입니다.

## 구성
- 웹 화면: GitHub Pages, `main` 브랜치에서 자동 배포
- DB API: 기존 Google Apps Script (`Code.gs`에서 직접 HtmlService 통신 응답 생성)
- 원본 DB: 기존 Google Sheets `CHECKLIST_DB`, `SLEEP_LOG`, `APP_SETTINGS`
- 수면 히트맵: 기록 없음 회색 / 부분 기록 연한 파랑 / 평가 가능 시 녹색·노랑·빨강
- 로컬 저장: 수정 즉시 기기에 반영, 인터넷 연결 시 서버 자동 동기화, 충돌 시 사용자 선택

## 앱을 처음 실행하기 전에 (최초 1회)

1. **Apps Script**: 기존 스프레드시트에 연결된 Apps Script에서 `apps-script/Code.gs` 내용으로 **Code.gs 전체 교체**.
2. **HTML 파일 추가는 필요 없습니다.** 모든 화면 HTML/CSS/JS는 GitHub Pages에 있으며, 통신용 HTML 응답만 Code.gs에서 자동 생성합니다.
3. Apps Script에서 **배포 관리 → 기존 웹앱 수정 → 버전: 새 버전 → 배포**. 이전 `Index`와 `Bridge` 파일은 이 앱에서 사용하지 않으므로 새 배포 후 삭제해도 됩니다.
4. **GitHub 저장소 Settings → Pages → Build and deployment → Source = GitHub Actions** 로 설정합니다. (해당 설정은 GitHub에서 직접 활성화해야 합니다.)
5. Actions 탭에서 `Deploy YUHA CARE`가 완료되면 GitHub Pages 앱을 엽니다.
6. 첫 실행 때 **기존 Google Apps Script 웹앱 `/exec` 주소**를 입력하고 **연결하기**를 누릅니다. 동일한 기기에서는 다시 입력할 필요가 없습니다.

## 데이터 및 보안 주의
- **DB 데이터는 GitHub에 업로드하지 않았습니다.** 저장소에는 앱 코드만 있습니다.
- `config.js`에 비밀번호·API 키·개인정보를 넣지 마세요.
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
